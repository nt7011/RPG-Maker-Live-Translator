Write-Host "Installing Text Replacement Addon..." -ForegroundColor Green

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Path $MyInvocation.MyCommand.Path -Parent }
$gameRoot = Split-Path -Path $scriptRoot -Parent

if (-not (Test-Path $gameRoot)) {
    Write-Host "Error: Unable to resolve game root directory from installer location." -ForegroundColor Red
    exit 1
}

$loaderSource = Join-Path -Path $scriptRoot -ChildPath "live-translator-loader.js"

$exitCode = 0
Push-Location -LiteralPath $gameRoot
try {
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

    # Detect folder structure
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

    if (-not (Test-Path $loaderSource)) {
        throw "live-translator-loader.js not found at $loaderSource"
    }

    $loaderDestination = Join-Path -Path $pluginsDir -ChildPath "live-translator-loader.js"
    Copy-Item $loaderSource $loaderDestination -Force
    Write-Host "Loader file copied successfully to $loaderDestination" -ForegroundColor Yellow

    $supportTargetDir = Join-Path -Path $pluginsDir -ChildPath "live-translator"
    if (-not (Test-Path $supportTargetDir)) {
        New-Item -ItemType Directory -Path $supportTargetDir -Force | Out-Null
        Write-Host "Created plugin support directory at $supportTargetDir" -ForegroundColor Cyan
    }

    $excludedNames = @(
        "install",
        "installer.ps1",
        "installer.sh",
        "live-translator-loader.js"
    )

    Get-ChildItem -Path $scriptRoot -File | Where-Object { $excludedNames -notcontains $_.Name } | ForEach-Object {
        $destination = Join-Path -Path $supportTargetDir -ChildPath $_.Name
        Copy-Item $_.FullName $destination -Force
        Write-Host "Copied $($_.Name) into $supportTargetDir" -ForegroundColor Yellow
    }

    # Check if the plugin entry already exists in plugins.js
    if (Test-Path $pluginsFile) {
        $pluginsContent = Get-Content $pluginsFile -Raw -Encoding UTF8
        if ($pluginsContent -match "live-translator-loader") {
            Write-Host "Plugin entry already exists in $pluginsFile" -ForegroundColor Yellow
        } else {
            Write-Host "Adding plugin entry to $pluginsFile..." -ForegroundColor Yellow

            # Create a backup
            Copy-Item $pluginsFile "$pluginsFile.backup" -Force
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
    Write-Host "Text Replacement Addon installed successfully!" -ForegroundColor Green
    Write-Host "A backup of the original plugins.js was created as plugins.js.backup" -ForegroundColor Cyan
}

exit $exitCode
