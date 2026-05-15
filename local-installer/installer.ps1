[CmdletBinding()]
param(
    [string]$GameRoot = "",
    [string]$RuntimeSource = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Installing RPG Maker Live Translator..." -ForegroundColor Green

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Path $MyInvocation.MyCommand.Path -Parent }
$defaultRoot = Split-Path -Path $scriptRoot -Parent

function Get-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return [System.IO.Path]::GetFullPath($Path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
}

function Resolve-InputPath {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$Path
    )

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }

    return Join-Path -Path $BasePath -ChildPath $Path
}

function Test-IsUnderPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Parent
    )

    $parentWithSeparator = $Parent + [System.IO.Path]::DirectorySeparatorChar
    return $Path.Equals($Parent, [System.StringComparison]::OrdinalIgnoreCase) -or
        $Path.StartsWith($parentWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)
}

function Read-InstallManifest {
    param([Parameter(Mandatory = $true)][string]$ManifestPath)

    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        throw "install-manifest.json not found at $ManifestPath"
    }

    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $manifest.loader) { throw "install-manifest.json missing loader" }
    if (-not $manifest.supportDirectory) { throw "install-manifest.json missing supportDirectory" }
    if (-not $manifest.runtime) { throw "install-manifest.json missing runtime section" }

    foreach ($field in @("loaderHelpers", "scriptLoadOrder", "requiredAssets")) {
        if (-not $manifest.runtime.PSObject.Properties[$field]) {
            throw "install-manifest.json missing runtime.$field"
        }
    }

    return $manifest
}

function Resolve-SupportChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$SupportTargetDir,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $supportFull = Get-FullPath $SupportTargetDir
    $childFull = Get-FullPath (Join-Path -Path $supportFull -ChildPath $RelativePath)

    if (-not (Test-IsUnderPath -Path $childFull -Parent $supportFull)) {
        throw "Refusing to operate outside support directory: $RelativePath"
    }

    return $childFull
}

function Find-PluginLayout {
    param([Parameter(Mandatory = $true)][string]$ResolvedGameRoot)

    $layouts = @(
        @{
            PluginsDir = Join-Path -Path $ResolvedGameRoot -ChildPath "www\js\plugins"
            PluginsFile = Join-Path -Path $ResolvedGameRoot -ChildPath "www\js\plugins.js"
            Label = "www\js\plugins"
        },
        @{
            PluginsDir = Join-Path -Path $ResolvedGameRoot -ChildPath "js\plugins"
            PluginsFile = Join-Path -Path $ResolvedGameRoot -ChildPath "js\plugins.js"
            Label = "js\plugins"
        }
    )

    foreach ($layout in $layouts) {
        if (Test-Path -LiteralPath $layout.PluginsDir -PathType Container) {
            Write-Host "Detected $($layout.Label) folder structure" -ForegroundColor Cyan
            return [pscustomobject]$layout
        }
    }

    throw "Could not find js\plugins or www\js\plugins directory under $ResolvedGameRoot"
}

function Repair-PackageName {
    param([Parameter(Mandatory = $true)][string]$ResolvedGameRoot)

    # RPG Maker/NW.js can fail on an empty package name. Fix only that narrow,
    # known-bad shape and leave every other package.json untouched.
    $packagePaths = @("package.json", "www\package.json")
    $foundAny = $false

    foreach ($packagePath in $packagePaths) {
        $fullPath = Join-Path -Path $ResolvedGameRoot -ChildPath $packagePath
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }

        $foundAny = $true
        try {
            $packageContent = Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8
            $packageJson = $packageContent | ConvertFrom-Json
            $hasNameProperty = $null -ne $packageJson.PSObject.Properties["name"]
            $currentName = if ($hasNameProperty) { [string]$packageJson.name } else { $null }

            if ($hasNameProperty -and $null -ne $currentName -and $currentName.Trim() -eq "") {
                Write-Host "Found empty name field in $packagePath, setting to 'Game'" -ForegroundColor Yellow

                $backupPath = "$fullPath.backup"
                if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
                    Copy-Item -LiteralPath $fullPath -Destination $backupPath -Force
                    Write-Host "Backup created: $packagePath.backup" -ForegroundColor Cyan
                }

                $updatedContent = $packageContent -replace '("name"\s*:\s*)""', '$1"Game"'
                Set-Content -LiteralPath $fullPath -Value $updatedContent -Encoding UTF8 -Force
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
}

function Copy-RuntimeBundle {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedRuntimeRoot,
        [Parameter(Mandatory = $true)][string]$SupportTargetDir
    )

    $runtimeFull = Get-FullPath $ResolvedRuntimeRoot
    $supportFull = Get-FullPath $SupportTargetDir

    if (-not (Test-Path -LiteralPath $runtimeFull -PathType Container)) {
        throw "Missing live-translator runtime directory: $runtimeFull"
    }
    if ((Test-IsUnderPath -Path $supportFull -Parent $runtimeFull) -or
        (Test-IsUnderPath -Path $runtimeFull -Parent $supportFull)) {
        throw "Runtime source and support target must be separate directories."
    }

    if (-not (Test-Path -LiteralPath $supportFull -PathType Container)) {
        New-Item -ItemType Directory -Path $supportFull -Force | Out-Null
        Write-Host "Created plugin support directory at $supportFull" -ForegroundColor Cyan
    } else {
        Write-Host "Using existing plugin support directory at $supportFull" -ForegroundColor Cyan
    }

    Get-ChildItem -LiteralPath $runtimeFull -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $supportFull -Recurse -Force
    }
    Write-Host "Copied live-translator runtime bundle to $supportFull" -ForegroundColor Yellow
}

function Resolve-SettingsSource {
    param(
        [Parameter(Mandatory = $true)][string]$InstallerRoot,
        [Parameter(Mandatory = $true)][string]$ResolvedRuntimeRoot
    )

    $localSettingsPath = Join-Path -Path $InstallerRoot -ChildPath "settings.local.json"
    if (Test-Path -LiteralPath $localSettingsPath -PathType Leaf) {
        return [pscustomobject]@{
            Path = $localSettingsPath
            Label = "local-installer/settings.local.json"
        }
    }

    $releaseSettingsPath = Join-Path -Path $ResolvedRuntimeRoot -ChildPath "config-templates\settings.release.json"
    if (Test-Path -LiteralPath $releaseSettingsPath -PathType Leaf) {
        return [pscustomobject]@{
            Path = $releaseSettingsPath
            Label = "live-translator/config-templates/settings.release.json"
        }
    }

    throw "Could not find installer settings source. Checked $localSettingsPath and $releaseSettingsPath"
}

function Install-SettingsFile {
    param(
        [Parameter(Mandatory = $true)][string]$InstallerRoot,
        [Parameter(Mandatory = $true)][string]$ResolvedRuntimeRoot,
        [Parameter(Mandatory = $true)][string]$SupportTargetDir
    )

    # settings.json is environment-specific, so install it explicitly instead
    # of depending on a file bundled inside the shared runtime tree.
    $settingsSource = Resolve-SettingsSource `
        -InstallerRoot $InstallerRoot `
        -ResolvedRuntimeRoot $ResolvedRuntimeRoot
    $settingsTarget = Resolve-SupportChildPath `
        -SupportTargetDir $SupportTargetDir `
        -RelativePath "settings.json"

    Copy-Item -LiteralPath $settingsSource.Path -Destination $settingsTarget -Force
    Write-Host "Installed settings.json from $($settingsSource.Label)" -ForegroundColor Cyan
}

function Remove-ObsoleteSupportPaths {
    param(
        [Parameter(Mandatory = $true)]$Manifest,
        [Parameter(Mandatory = $true)][string]$SupportTargetDir
    )

    foreach ($entry in @($Manifest.obsoleteSupportPaths)) {
        $relativePath = [string]$entry
        if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }

        $target = Resolve-SupportChildPath -SupportTargetDir $SupportTargetDir -RelativePath $relativePath
        if (-not (Test-Path -LiteralPath $target)) { continue }

        Remove-Item -LiteralPath $target -Recurse -Force
        Write-Host "Removed obsolete support path $relativePath" -ForegroundColor Cyan
    }
}

function Remove-ObsoleteInstallerCopy {
    param([Parameter(Mandatory = $true)][string]$ResolvedGameRoot)

    $obsoletePath = Get-FullPath (Join-Path -Path $ResolvedGameRoot -ChildPath "live-translator-installer")
    if (-not (Test-Path -LiteralPath $obsoletePath -PathType Container)) { return }
    if (-not (Test-IsUnderPath -Path $obsoletePath -Parent $ResolvedGameRoot)) {
        throw "Refusing to remove obsolete installer outside game root: $obsoletePath"
    }

    Remove-Item -LiteralPath $obsoletePath -Recurse -Force
    Write-Host "Removed obsolete copied installer folder live-translator-installer" -ForegroundColor Cyan
}

function Get-PluginEntryName {
    param(
        [Parameter(Mandatory = $true)][string]$SupportDirectory,
        [Parameter(Mandatory = $true)][string]$LoaderFile
    )

    $supportName = $SupportDirectory.Trim("\", "/").Replace("\", "/")
    $loaderName = $LoaderFile.Replace("\", "/").TrimStart("/")
    if ($loaderName.EndsWith(".js", [System.StringComparison]::OrdinalIgnoreCase)) {
        $loaderName = $loaderName.Substring(0, $loaderName.Length - 3)
    }
    if ([string]::IsNullOrWhiteSpace($supportName) -or [string]::IsNullOrWhiteSpace($loaderName)) {
        throw "Unable to derive RPG Maker plugin entry name from support directory and loader."
    }
    return "$supportName/$loaderName"
}

function Get-LegacyPluginEntryName {
    param([Parameter(Mandatory = $true)][string]$LoaderFile)

    $entryName = [System.IO.Path]::GetFileName($LoaderFile)
    if ($entryName.EndsWith(".js", [System.StringComparison]::OrdinalIgnoreCase)) {
        $entryName = $entryName.Substring(0, $entryName.Length - 3)
    }
    if ([string]::IsNullOrWhiteSpace($entryName)) {
        throw "Unable to derive legacy RPG Maker plugin entry name from loader: $LoaderFile"
    }
    return $entryName
}

function Test-PluginEntryExists {
    param(
        [Parameter(Mandatory = $true)][string]$PluginsContent,
        [Parameter(Mandatory = $true)][string]$PluginEntryName
    )

    $escapedName = [regex]::Escape($PluginEntryName)
    return $PluginsContent -match ('"name"\s*:\s*"' + $escapedName + '"')
}

function Rename-PluginEntry {
    param(
        [Parameter(Mandatory = $true)][string]$PluginsContent,
        [Parameter(Mandatory = $true)][string]$OldName,
        [Parameter(Mandatory = $true)][string]$NewName
    )

    $escapedName = [regex]::Escape($OldName)
    $regex = [regex]('("name"\s*:\s*")' + $escapedName + '(")')
    $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        return $match.Groups[1].Value + $NewName + $match.Groups[2].Value
    }
    return $regex.Replace($PluginsContent, $evaluator, 1)
}

function Ensure-PluginEntry {
    param(
        [Parameter(Mandatory = $true)][string]$PluginsFile,
        [Parameter(Mandatory = $true)][string]$PluginEntryName,
        [Parameter(Mandatory = $true)][string]$LegacyPluginEntryName
    )

    if (-not (Test-Path -LiteralPath $PluginsFile -PathType Leaf)) {
        throw "$PluginsFile not found"
    }

    $pluginsContent = Get-Content -LiteralPath $PluginsFile -Raw -Encoding UTF8
    if (Test-PluginEntryExists -PluginsContent $pluginsContent -PluginEntryName $PluginEntryName) {
        Write-Host "Plugin entry already exists in $PluginsFile" -ForegroundColor Yellow
        return $false
    }

    Copy-Item -LiteralPath $PluginsFile -Destination "$PluginsFile.backup" -Force
    Write-Host "Backup created: $PluginsFile.backup" -ForegroundColor Cyan

    if ($LegacyPluginEntryName -and
        (Test-PluginEntryExists -PluginsContent $pluginsContent -PluginEntryName $LegacyPluginEntryName)) {
        $updatedContent = Rename-PluginEntry `
            -PluginsContent $pluginsContent `
            -OldName $LegacyPluginEntryName `
            -NewName $PluginEntryName
        Set-Content -LiteralPath $PluginsFile -Value $updatedContent -Encoding UTF8 -Force
        Write-Host "Updated plugin entry to $PluginEntryName in $PluginsFile" -ForegroundColor Green
        return $true
    }

    Write-Host "Adding plugin entry to $PluginsFile..." -ForegroundColor Yellow
    $entryJson = [ordered]@{
        name = $PluginEntryName
        status = $true
        description = "Entry point for the live translation system"
        parameters = @{}
    } | ConvertTo-Json -Compress
    $entry = "$entryJson,"
    $regex = [regex]'(\[)'
    $updatedContent = $regex.Replace($pluginsContent, '${1}' + $entry, 1)

    if ($updatedContent -eq $pluginsContent) {
        Write-Host "Warning: Unable to inject plugin entry into $PluginsFile automatically" -ForegroundColor Yellow
        return $true
    }

    Set-Content -LiteralPath $PluginsFile -Value $updatedContent -Encoding UTF8 -Force
    Write-Host "Plugin entry added to $PluginsFile" -ForegroundColor Green
    return $true
}

$resolvedRuntimeSource = if ([string]::IsNullOrWhiteSpace($RuntimeSource)) {
    Get-FullPath (Join-Path -Path $defaultRoot -ChildPath "live-translator")
} else {
    Get-FullPath (Resolve-InputPath -BasePath (Get-Location).Path -Path $RuntimeSource)
}

$resolvedGameRoot = if ([string]::IsNullOrWhiteSpace($GameRoot)) {
    Get-FullPath $defaultRoot
} else {
    Get-FullPath (Resolve-InputPath -BasePath (Get-Location).Path -Path $GameRoot)
}

$manifestPath = Join-Path -Path $resolvedRuntimeSource -ChildPath "install-manifest.json"
$exitCode = 0
$createdPluginsBackup = $false

try {
    if (-not (Test-Path -LiteralPath $resolvedGameRoot -PathType Container)) {
        throw "Game root does not exist: $resolvedGameRoot"
    }

    $manifest = Read-InstallManifest -ManifestPath $manifestPath
    $layout = Find-PluginLayout -ResolvedGameRoot $resolvedGameRoot
    $pluginsDirFull = Get-FullPath $layout.PluginsDir
    $supportTargetFull = Get-FullPath (Join-Path -Path $pluginsDirFull -ChildPath ([string]$manifest.supportDirectory))

    if (-not (Test-IsUnderPath -Path $supportTargetFull -Parent $pluginsDirFull)) {
        throw "Refusing to use support directory outside plugin folder: $supportTargetFull"
    }

    $loaderPath = Join-Path -Path $resolvedRuntimeSource -ChildPath ([string]$manifest.loader)
    if (-not (Test-Path -LiteralPath $loaderPath -PathType Leaf)) {
        throw "$($manifest.loader) not found at $loaderPath"
    }

    Repair-PackageName -ResolvedGameRoot $resolvedGameRoot
    Copy-RuntimeBundle -ResolvedRuntimeRoot $resolvedRuntimeSource -SupportTargetDir $supportTargetFull
    Install-SettingsFile `
        -InstallerRoot $scriptRoot `
        -ResolvedRuntimeRoot $resolvedRuntimeSource `
        -SupportTargetDir $supportTargetFull
    Remove-ObsoleteSupportPaths -Manifest $manifest -SupportTargetDir $supportTargetFull
    Remove-ObsoleteInstallerCopy -ResolvedGameRoot $resolvedGameRoot

    $pluginEntryName = Get-PluginEntryName `
        -SupportDirectory ([string]$manifest.supportDirectory) `
        -LoaderFile ([string]$manifest.loader)
    $legacyPluginEntryName = Get-LegacyPluginEntryName -LoaderFile ([string]$manifest.loader)
    $createdPluginsBackup = Ensure-PluginEntry `
        -PluginsFile ([string]$layout.PluginsFile) `
        -PluginEntryName $pluginEntryName `
        -LegacyPluginEntryName $legacyPluginEntryName
} catch {
    $exitCode = 1
    Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
}

if ($exitCode -eq 0) {
    Write-Host "RPG Maker Live Translator installed successfully!" -ForegroundColor Green
    if ($createdPluginsBackup) {
        Write-Host "A backup of the original plugins.js was created as plugins.js.backup" -ForegroundColor Cyan
    }
}

exit $exitCode
