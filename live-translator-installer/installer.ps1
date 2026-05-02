Write-Host "Installing RPG Maker Live Translator..." -ForegroundColor Green

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Path $MyInvocation.MyCommand.Path -Parent }
$gameRoot = Split-Path -Path $scriptRoot -Parent
$manifestPath = Join-Path -Path $scriptRoot -ChildPath "install-manifest.json"

if (-not (Test-Path $gameRoot)) {
    Write-Host "Error: Unable to resolve game root directory from installer location." -ForegroundColor Red
    exit 1
}

function Read-InstallManifest {
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "install-manifest.json not found at $manifestPath"
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $manifest.loader) { throw "install-manifest.json missing loader" }
    if (-not $manifest.supportDirectory) { throw "install-manifest.json missing supportDirectory" }
    if (-not $manifest.install) { throw "install-manifest.json missing install section" }
    if (-not $manifest.install.files) { throw "install-manifest.json missing install.files" }
    if (-not $manifest.install.settings) { throw "install-manifest.json missing install.settings mapping" }
    if (-not $manifest.runtime) { throw "install-manifest.json missing runtime section" }
    foreach ($field in @("loaderHelpers", "scriptLoadOrder", "requiredAssets")) {
        if (-not $manifest.runtime.$field) { throw "install-manifest.json missing runtime.$field" }
    }
    return $manifest
}

function Resolve-InstallerPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)
    return Join-Path -Path $scriptRoot -ChildPath $RelativePath
}

function Copy-SupportItem {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileSystemInfo]$Item,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    if ($Item.PSIsContainer) {
        if (-not (Test-Path -LiteralPath $DestinationPath)) {
            New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
        }

        Get-ChildItem -LiteralPath $Item.FullName -Force | ForEach-Object {
            $childDestination = Join-Path -Path $DestinationPath -ChildPath $_.Name
            Copy-SupportItem -Item $_ -DestinationPath $childDestination
        }
        return
    }

    $parent = Split-Path -Path $DestinationPath -Parent
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $Item.FullName -Destination $DestinationPath -Force
}

function Resolve-SupportChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$SupportTargetDir,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $supportFull = [System.IO.Path]::GetFullPath($SupportTargetDir).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $childFull = [System.IO.Path]::GetFullPath((Join-Path -Path $supportFull -ChildPath $RelativePath))
    $supportPrefix = $supportFull + [System.IO.Path]::DirectorySeparatorChar

    if (-not $childFull.StartsWith($supportPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside support directory: $RelativePath"
    }

    return $childFull
}

function Ensure-SupportDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$SupportTargetDir,
        [Parameter(Mandatory = $true)][string]$PluginsDir
    )

    $currentDir = (Get-Location).Path
    $pluginsFull = [System.IO.Path]::GetFullPath((Join-Path -Path $currentDir -ChildPath $PluginsDir)).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $supportFull = [System.IO.Path]::GetFullPath((Join-Path -Path $currentDir -ChildPath $SupportTargetDir))
    $pluginsPrefix = $pluginsFull + [System.IO.Path]::DirectorySeparatorChar

    if (-not $supportFull.StartsWith($pluginsPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to use support directory outside plugin folder: $supportFull"
    }

    if (-not (Test-Path -LiteralPath $supportFull)) {
        New-Item -ItemType Directory -Path $supportFull -Force | Out-Null
        Write-Host "Created plugin support directory at $supportFull" -ForegroundColor Cyan
    } else {
        Write-Host "Using existing plugin support directory at $supportFull" -ForegroundColor Cyan
    }

    return $supportFull
}

function Copy-SupportEntries {
    param(
        [Parameter(Mandatory = $true)]$Manifest,
        [Parameter(Mandatory = $true)][string]$SupportTargetDir
    )

    foreach ($entry in @($Manifest.install.files)) {
        $relativePath = [string]$entry
        if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }

        $source = Resolve-InstallerPath $relativePath
        if (-not (Test-Path -LiteralPath $source)) {
            throw "Manifest entry missing from installer: $relativePath"
        }

        $item = Get-Item -LiteralPath $source -Force
        $destination = Resolve-SupportChildPath -SupportTargetDir $SupportTargetDir -RelativePath $relativePath
        Copy-SupportItem -Item $item -DestinationPath $destination
        Write-Host "Copied $relativePath into support directory" -ForegroundColor Yellow
    }
}

function Remove-ObsoleteSupportPaths {
    param(
        [Parameter(Mandatory = $true)]$Manifest,
        [Parameter(Mandatory = $true)][string]$SupportTargetDir
    )

    if (-not $Manifest.install.obsolete) { return }

    foreach ($entry in @($Manifest.install.obsolete)) {
        $relativePath = [string]$entry
        if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }

        $target = Resolve-SupportChildPath -SupportTargetDir $SupportTargetDir -RelativePath $relativePath
        if (-not (Test-Path -LiteralPath $target)) { continue }

        Remove-Item -LiteralPath $target -Force
        Write-Host "Removed obsolete support path $relativePath" -ForegroundColor Cyan
    }
}

function Copy-SettingsFile {
    param(
        [Parameter(Mandatory = $true)]$Manifest,
        [Parameter(Mandatory = $true)][string]$SupportTargetDir
    )

    $settings = $Manifest.install.settings
    $devSource = Resolve-InstallerPath ([string]$settings.developmentSource)
    $releaseSource = Resolve-InstallerPath ([string]$settings.releaseSource)
    $destination = Resolve-SupportChildPath -SupportTargetDir $SupportTargetDir -RelativePath ([string]$settings.destination)

    $source = if (Test-Path -LiteralPath $devSource) { $devSource } else { $releaseSource }
    if (-not (Test-Path -LiteralPath $source)) {
        throw "No settings source found. Expected local settings.json or release template."
    }

    Copy-Item -LiteralPath $source -Destination $destination -Force
    $sourceName = if ($source -eq $devSource) { "local settings.json" } else { "release settings template" }
    Write-Host "Copied $sourceName to $([string]$settings.destination)" -ForegroundColor Yellow
}

$exitCode = 0
$createdPluginsBackup = $false
$manifest = $null

Push-Location -LiteralPath $gameRoot
try {
    $manifest = Read-InstallManifest

    # Check and fix name field in both package.json and www\package.json (non-destructive)
    $packagePaths = @("package.json", "www\package.json")
    $foundAny = $false

    foreach ($packagePath in $packagePaths) {
        if (-not (Test-Path $packagePath)) { continue }
        $foundAny = $true
        try {
            $packageContent = Get-Content $packagePath -Raw -Encoding UTF8
            $packageJson = $packageContent | ConvertFrom-Json

            $hasNameProperty = ($null -ne ($packageJson.PSObject.Properties["name"]))
            $currentName = if ($hasNameProperty) { [string]$packageJson.name } else { $null }

            if ($hasNameProperty -and $currentName -ne $null -and $currentName.Trim() -eq "") {
                Write-Host "Found empty name field in $packagePath, setting to 'Game'" -ForegroundColor Yellow

                $backupPath = "$packagePath.backup"
                if (-not (Test-Path $backupPath)) {
                    Copy-Item $packagePath $backupPath
                    Write-Host "Backup created: $backupPath" -ForegroundColor Cyan
                }

                $updatedContent = $packageContent -replace '("name"\s*:\s*)""', '$1"Game"'
                Set-Content -LiteralPath $packagePath -Value $updatedContent -Encoding UTF8 -Force
                Write-Host "Updated name field to 'Game' in $packagePath" -ForegroundColor Green
            } elseif ($hasNameProperty -and -not [string]::IsNullOrWhiteSpace($currentName)) {
                Write-Host "$packagePath name field is already set to: '$currentName'" -ForegroundColor Cyan
            } else {
                Write-Host "No empty name field found in $packagePath (leaving file unchanged)" -ForegroundColor Cyan
            }
        } catch {
            Write-Host "Warning: Could not process ${packagePath}: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    if (-not $foundAny) {
        Write-Host "package.json not found - this is normal for some RPG Maker versions" -ForegroundColor Yellow
    }

    $pluginsDir = ""
    $pluginsFile = ""

    if (Test-Path "www\js\plugins") {
        $pluginsDir = "www\js\plugins"
        $pluginsFile = "www\js\plugins.js"
        Write-Host "Detected www\js\plugins folder structure" -ForegroundColor Cyan
    } elseif (Test-Path "js\plugins") {
        $pluginsDir = "js\plugins"
        $pluginsFile = "js\plugins.js"
        Write-Host "Detected js\plugins folder structure" -ForegroundColor Cyan
    } else {
        Write-Host "Error: Could not find js\plugins or www\js\plugins directory" -ForegroundColor Red
        Write-Host "Please run this installer from your RPG Maker game's root directory" -ForegroundColor Yellow
        exit 1
    }

    $loaderSource = Resolve-InstallerPath ([string]$manifest.loader)
    if (-not (Test-Path -LiteralPath $loaderSource)) {
        throw "$($manifest.loader) not found at $loaderSource"
    }

    $loaderDestination = Join-Path -Path $pluginsDir -ChildPath ([string]$manifest.loader)
    Copy-Item -LiteralPath $loaderSource -Destination $loaderDestination -Force
    Write-Host "Loader file copied successfully to $loaderDestination" -ForegroundColor Yellow

    $supportTargetDir = Join-Path -Path $pluginsDir -ChildPath ([string]$manifest.supportDirectory)
    $supportTargetFull = Ensure-SupportDirectory -SupportTargetDir $supportTargetDir -PluginsDir $pluginsDir
    Copy-SupportEntries -Manifest $manifest -SupportTargetDir $supportTargetFull
    Copy-SettingsFile -Manifest $manifest -SupportTargetDir $supportTargetFull
    Remove-ObsoleteSupportPaths -Manifest $manifest -SupportTargetDir $supportTargetFull

    if (Test-Path $pluginsFile) {
        $pluginsContent = Get-Content $pluginsFile -Raw -Encoding UTF8
        if ($pluginsContent -match [regex]::Escape([string]$manifest.loader)) {
            Write-Host "Plugin entry already exists in $pluginsFile" -ForegroundColor Yellow
        } else {
            Write-Host "Adding plugin entry to $pluginsFile..." -ForegroundColor Yellow

            Copy-Item $pluginsFile "$pluginsFile.backup" -Force
            $createdPluginsBackup = $true
            Write-Host "Backup created: $pluginsFile.backup" -ForegroundColor Cyan

            $entry = '{"name":"live-translator-loader","status":true,"description":"Entry point for the live translation system","parameters":{}},'
            $regex = [regex]'(\[)'
            $updatedContent = $regex.Replace($pluginsContent, '${1}' + $entry, 1)

            if ($updatedContent -eq $pluginsContent) {
                Write-Host "Warning: Unable to inject plugin entry into $pluginsFile automatically" -ForegroundColor Yellow
            } else {
                Set-Content $pluginsFile -Value $updatedContent -Encoding UTF8 -Force
                Write-Host "Plugin entry added to $pluginsFile" -ForegroundColor Green
            }
        }
    } else {
        throw "$pluginsFile not found"
    }
} catch {
    $exitCode = 1
    Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Pop-Location
}

if ($exitCode -eq 0) {
    Write-Host "RPG Maker Live Translator installed successfully!" -ForegroundColor Green
    if ($createdPluginsBackup) {
        Write-Host "A backup of the original plugins.js was created as plugins.js.backup" -ForegroundColor Cyan
    }
}

exit $exitCode
