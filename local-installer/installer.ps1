[CmdletBinding()]
param(
    [string]$GameRoot = "",
    [string]$RuntimeSource = "",
    [string]$SnapshotSource = "",

    [ValidateSet("debug", "snapshot")]
    [string]$PluginProfile = "debug"
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
    if (-not $manifest.fileInventory) { throw "install-manifest.json missing fileInventory section" }
    if (-not $manifest.fileInventory.PSObject.Properties["sourceFiles"]) {
        throw "install-manifest.json missing fileInventory.sourceFiles"
    }

    foreach ($field in @("loaderHelpers", "scriptLoadOrder", "requiredAssets")) {
        if (-not $manifest.runtime.PSObject.Properties[$field]) {
            throw "install-manifest.json missing runtime.$field"
        }
    }

    return $manifest
}

function Resolve-OptionalSnapshotSource {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedRuntimeRoot,
        [string]$ConfiguredSnapshotSource = "",
        [bool]$AllowDefaultSnapshotSource = $false
    )

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredSnapshotSource)) {
        return Get-FullPath (Resolve-InputPath -BasePath (Get-Location).Path -Path $ConfiguredSnapshotSource)
    }

    if (-not $AllowDefaultSnapshotSource) {
        return ""
    }

    $runtimeParent = Split-Path -Path $ResolvedRuntimeRoot -Parent
    $snapshotCandidate = Get-FullPath (Join-Path -Path $runtimeParent -ChildPath "snapshot")
    if (Test-Path -LiteralPath $snapshotCandidate -PathType Container) {
        return $snapshotCandidate
    }

    return ""
}

function Read-SnapshotManifest {
    param([Parameter(Mandatory = $true)][string]$SnapshotRoot)

    $manifestPath = Join-Path -Path $SnapshotRoot -ChildPath "install-manifest.json"
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "snapshot/install-manifest.json not found at $manifestPath"
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$manifest.module -ne "snapshot") { throw "snapshot/install-manifest.json missing module 'snapshot'" }
    if (-not $manifest.supportDirectory) { throw "snapshot/install-manifest.json missing supportDirectory" }
    if (-not $manifest.loader) { throw "snapshot/install-manifest.json missing loader" }
    if (-not $manifest.freezePlugin) { throw "snapshot/install-manifest.json missing freezePlugin" }
    if (-not $manifest.replayRuntime) { throw "snapshot/install-manifest.json missing replayRuntime" }
    if (-not $manifest.fileInventory) { throw "snapshot/install-manifest.json missing fileInventory section" }
    if (-not $manifest.fileInventory.PSObject.Properties["sourceFiles"]) {
        throw "snapshot/install-manifest.json missing fileInventory.sourceFiles"
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

function Resolve-ManifestChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$BaseDir,
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $relative = [string]$RelativePath
    if ([string]::IsNullOrWhiteSpace($relative)) {
        throw "$Description contains an empty file path"
    }
    if ([System.IO.Path]::IsPathRooted($relative)) {
        throw "$Description contains a rooted file path: $relative"
    }

    $baseFull = Get-FullPath $BaseDir
    $childFull = Get-FullPath (Join-Path -Path $baseFull -ChildPath $relative)
    if (-not (Test-IsUnderPath -Path $childFull -Parent $baseFull)) {
        throw "$Description points outside its base directory: $relative"
    }

    return $childFull
}

function Copy-ManifestFileList {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][object[]]$RelativePaths,
        [Parameter(Mandatory = $true)][string]$Description,
        [bool]$Required = $true
    )

    $copied = 0
    $seen = @{}
    foreach ($entry in @($RelativePaths)) {
        $relativePath = [string]$entry
        if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }
        $key = $relativePath.Replace("\", "/").ToLowerInvariant()
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true

        $sourcePath = Resolve-ManifestChildPath `
            -BaseDir $SourceDir `
            -RelativePath $relativePath `
            -Description $Description
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            if ($Required) {
                throw "$Description file not found: $relativePath"
            }
            continue
        }

        $targetPath = Resolve-ManifestChildPath `
            -BaseDir $TargetDir `
            -RelativePath $relativePath `
            -Description $Description
        $targetParent = Split-Path -Path $targetPath -Parent
        if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) {
            New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        }
        Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
        $copied++
    }

    if ($Required -and $copied -eq 0) {
        throw "$Description did not list any source files"
    }

    return $copied
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

function New-InstallerPackageName {
    param([Parameter(Mandatory = $true)][string]$ResolvedGameRoot)

    # NW.js uses package.json "name" when choosing the Chromium profile
    # directory. Own that value so unrelated games never share a stale profile.
    $folderName = Split-Path -Path $ResolvedGameRoot -Leaf
    if ([string]::IsNullOrWhiteSpace($folderName)) {
        $folderName = "game"
    }

    $safeBase = $folderName.Trim().ToLowerInvariant()
    $safeBase = [regex]::Replace($safeBase, "\s+", "-")
    $safeBase = [regex]::Replace($safeBase, "[^a-z0-9._-]+", "-")
    $safeBase = [regex]::Replace($safeBase, "-{2,}", "-")
    $safeBase = $safeBase.Trim([char[]]"._-")
    if ([string]::IsNullOrWhiteSpace($safeBase)) {
        $safeBase = "game"
    }

    $timestamp = Get-Date -Format "yyyyMMddHHmmssfff"
    return "live-translator-$safeBase-$timestamp"
}

function Set-PackageNameInContent {
    param(
        [Parameter(Mandatory = $true)][string]$PackageContent,
        [Parameter(Mandatory = $true)][string]$PackageName
    )

    $namePattern = '("name"\s*:\s*)(?:"(?:\\.|[^"\\])*"|null|true|false|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)'
    if (-not [regex]::IsMatch($PackageContent, $namePattern)) {
        throw "Could not find a JSON name field to update"
    }

    return [regex]::Replace(
        $PackageContent,
        $namePattern,
        { param($match) $match.Groups[1].Value + '"' + $PackageName + '"' },
        1
    )
}

function Repair-PackageName {
    param([Parameter(Mandatory = $true)][string]$ResolvedGameRoot)

    # RPG Maker/NW.js profile state is keyed by package name. Rewrite package
    # names we find so old or unrelated Chromium profile state cannot poison
    # the game executable.
    $installerPackageName = New-InstallerPackageName -ResolvedGameRoot $ResolvedGameRoot
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

            if ($hasNameProperty) {
                Write-Host "Setting $packagePath name field to '$installerPackageName'" -ForegroundColor Yellow

                $backupPath = "$fullPath.backup"
                if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
                    Copy-Item -LiteralPath $fullPath -Destination $backupPath -Force
                    Write-Host "Backup created: $packagePath.backup" -ForegroundColor Cyan
                }

                $updatedContent = Set-PackageNameInContent -PackageContent $packageContent -PackageName $installerPackageName
                Set-Content -LiteralPath $fullPath -Value $updatedContent -Encoding UTF8 -Force
                Write-Host "Updated name field in $packagePath" -ForegroundColor Green
            } else {
                Write-Host "No name field found in $packagePath (leaving file unchanged)" -ForegroundColor Cyan
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
        [Parameter(Mandatory = $true)][string]$SupportTargetDir,
        [Parameter(Mandatory = $true)]$Manifest
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

    Copy-ManifestFileList `
        -SourceDir $runtimeFull `
        -TargetDir $supportFull `
        -RelativePaths @($Manifest.fileInventory.sourceFiles) `
        -Description "live-translator fileInventory.sourceFiles" `
        -Required $true | Out-Null

    # Optional runtime assets such as precacher/precache.json are generated
    # locally. Copy them when present, but do not let unrelated generated logs
    # sneak into installed games.
    Copy-ManifestFileList `
        -SourceDir $runtimeFull `
        -TargetDir $supportFull `
        -RelativePaths @($Manifest.runtime.optionalAssets) `
        -Description "live-translator runtime.optionalAssets" `
        -Required $false | Out-Null
    Write-Host "Copied live-translator runtime bundle to $supportFull" -ForegroundColor Yellow
}

function Copy-OptionalSnapshotBundle {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedSnapshotRoot,
        [Parameter(Mandatory = $true)][string]$PluginsDir
    )

    if ([string]::IsNullOrWhiteSpace($ResolvedSnapshotRoot)) { return $false }

    $snapshotFull = Get-FullPath $ResolvedSnapshotRoot
    $pluginsFull = Get-FullPath $PluginsDir
    if (-not (Test-Path -LiteralPath $snapshotFull -PathType Container)) {
        throw "Snapshot source does not exist: $snapshotFull"
    }

    $snapshotManifest = Read-SnapshotManifest -SnapshotRoot $snapshotFull
    foreach ($field in @("loader", "freezePlugin", "replayRuntime")) {
        $relativePath = [string]$snapshotManifest.$field
        $sourcePath = Join-Path -Path $snapshotFull -ChildPath $relativePath
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "$relativePath not found at $sourcePath"
        }
    }

    $snapshotTargetFull = Get-FullPath (Join-Path -Path $pluginsFull -ChildPath ([string]$snapshotManifest.supportDirectory))
    if (-not (Test-IsUnderPath -Path $snapshotTargetFull -Parent $pluginsFull)) {
        throw "Refusing to use snapshot directory outside plugin folder: $snapshotTargetFull"
    }
    if ((Test-IsUnderPath -Path $snapshotTargetFull -Parent $snapshotFull) -or
        (Test-IsUnderPath -Path $snapshotFull -Parent $snapshotTargetFull)) {
        throw "Snapshot source and target must be separate directories."
    }

    if (-not (Test-Path -LiteralPath $snapshotTargetFull -PathType Container)) {
        New-Item -ItemType Directory -Path $snapshotTargetFull -Force | Out-Null
    }

    Copy-ManifestFileList `
        -SourceDir $snapshotFull `
        -TargetDir $snapshotTargetFull `
        -RelativePaths @($snapshotManifest.fileInventory.sourceFiles) `
        -Description "snapshot fileInventory.sourceFiles" `
        -Required $true | Out-Null
    Write-Host "Installed optional snapshot plugin to $snapshotTargetFull" -ForegroundColor Cyan
    return $true
}

function Resolve-FirstExistingConfigSource {
    param(
        [Parameter(Mandatory = $true)][object[]]$Candidates,
        [Parameter(Mandatory = $true)][string]$Description
    )

    foreach ($candidate in @($Candidates)) {
        if ($candidate -and
            -not [string]::IsNullOrWhiteSpace([string]$candidate.Path) -and
            (Test-Path -LiteralPath ([string]$candidate.Path) -PathType Leaf)) {
            return $candidate
        }
    }

    $checked = @($Candidates | ForEach-Object { [string]$_.Path }) -join ", "
    throw "Could not find $Description source. Checked $checked"
}

function Resolve-SettingsSource {
    param(
        [Parameter(Mandatory = $true)][string]$InstallerRoot,
        [Parameter(Mandatory = $true)][string]$ResolvedRuntimeRoot,
        [Parameter(Mandatory = $true)][string]$Profile
    )

    $candidates = @()
    if ($Profile -eq "snapshot") {
        $candidates += [pscustomobject]@{
            Path = Join-Path -Path $InstallerRoot -ChildPath "settings.snapshot.json"
            Label = "local-installer/settings.snapshot.json"
        }
        $candidates += [pscustomobject]@{
            Path = Join-Path -Path $ResolvedRuntimeRoot -ChildPath "config-templates\settings.snapshot.json"
            Label = "live-translator/config-templates/settings.snapshot.json"
        }
    } else {
        $candidates += [pscustomobject]@{
            Path = Join-Path -Path $InstallerRoot -ChildPath "settings.local.json"
            Label = "local-installer/settings.local.json"
        }
    }
    $candidates += [pscustomobject]@{
        Path = Join-Path -Path $ResolvedRuntimeRoot -ChildPath "config-templates\settings.release.json"
        Label = "live-translator/config-templates/settings.release.json"
    }

    return Resolve-FirstExistingConfigSource -Candidates $candidates -Description "installer settings"
}

function Resolve-TranslatorConfigSource {
    param(
        [Parameter(Mandatory = $true)][string]$InstallerRoot,
        [Parameter(Mandatory = $true)][string]$ResolvedRuntimeRoot,
        [Parameter(Mandatory = $true)][string]$Profile
    )

    $candidates = @()
    $releaseTranslator = [pscustomobject]@{
        Path = Join-Path -Path $ResolvedRuntimeRoot -ChildPath "config-templates\translator.release.json"
        Label = "live-translator/config-templates/translator.release.json"
    }
    if ($Profile -eq "snapshot") {
        $candidates += [pscustomobject]@{
            Path = Join-Path -Path $InstallerRoot -ChildPath "translator.snapshot.json"
            Label = "local-installer/translator.snapshot.json"
        }
        $candidates += [pscustomobject]@{
            Path = Join-Path -Path $ResolvedRuntimeRoot -ChildPath "config-templates\translator.snapshot.json"
            Label = "live-translator/config-templates/translator.snapshot.json"
        }
    } else {
        $candidates += [pscustomobject]@{
            Path = Join-Path -Path $InstallerRoot -ChildPath "translator.local.json"
            Label = "local-installer/translator.local.json"
        }
    }
    $candidates += $releaseTranslator

    return Resolve-FirstExistingConfigSource -Candidates $candidates -Description "translator.json"
}

function Install-SettingsFile {
    param(
        [Parameter(Mandatory = $true)][string]$InstallerRoot,
        [Parameter(Mandatory = $true)][string]$ResolvedRuntimeRoot,
        [Parameter(Mandatory = $true)][string]$SupportTargetDir,
        [Parameter(Mandatory = $true)][string]$Profile
    )

    # settings.json is environment-specific, so install it explicitly instead
    # of depending on a file bundled inside the shared runtime tree.
    $settingsSource = Resolve-SettingsSource `
        -InstallerRoot $InstallerRoot `
        -ResolvedRuntimeRoot $ResolvedRuntimeRoot `
        -Profile $Profile
    $settingsTarget = Resolve-SupportChildPath `
        -SupportTargetDir $SupportTargetDir `
        -RelativePath "settings.json"

    Copy-Item -LiteralPath $settingsSource.Path -Destination $settingsTarget -Force
    Write-Host "Installed settings.json from $($settingsSource.Label)" -ForegroundColor Cyan
}

function Install-TranslatorConfigFile {
    param(
        [Parameter(Mandatory = $true)][string]$InstallerRoot,
        [Parameter(Mandatory = $true)][string]$ResolvedRuntimeRoot,
        [Parameter(Mandatory = $true)][string]$SupportTargetDir,
        [Parameter(Mandatory = $true)][string]$Profile
    )

    # translator.json is profile-specific in the same way as settings.json:
    # normal launches use the configured runtime provider, snapshot launches use
    # the deterministic mock provider.
    $translatorSource = Resolve-TranslatorConfigSource `
        -InstallerRoot $InstallerRoot `
        -ResolvedRuntimeRoot $ResolvedRuntimeRoot `
        -Profile $Profile
    $translatorTarget = Resolve-SupportChildPath `
        -SupportTargetDir $SupportTargetDir `
        -RelativePath "translator.json"

    Copy-Item -LiteralPath $translatorSource.Path -Destination $translatorTarget -Force
    Write-Host "Installed translator.json from $($translatorSource.Label)" -ForegroundColor Cyan
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

function Test-NameInList {
    param(
        [string]$Name,
        [string[]]$Names = @()
    )

    if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
    foreach ($candidate in @($Names)) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and
            $Name.Equals($candidate, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    return $false
}

function Find-MatchingArrayClose {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][int]$OpenIndex
    )

    $depth = 0
    $inString = $false
    $quote = [char]0
    $escape = $false
    $lineComment = $false
    $blockComment = $false
    $singleQuote = [char]39
    $doubleQuote = [char]34

    for ($index = $OpenIndex; $index -lt $Content.Length; $index++) {
        $char = $Content[$index]
        $next = if ($index + 1 -lt $Content.Length) { $Content[$index + 1] } else { [char]0 }

        if ($lineComment) {
            if ($char -eq "`n") { $lineComment = $false }
            continue
        }
        if ($blockComment) {
            if ($char -eq "*" -and $next -eq "/") {
                $blockComment = $false
                $index++
            }
            continue
        }
        if ($inString) {
            if ($escape) {
                $escape = $false
            } elseif ($char -eq "\") {
                $escape = $true
            } elseif ($char -eq $quote) {
                $inString = $false
            }
            continue
        }

        if ($char -eq "/" -and $next -eq "/") {
            $lineComment = $true
            $index++
            continue
        }
        if ($char -eq "/" -and $next -eq "*") {
            $blockComment = $true
            $index++
            continue
        }
        if ($char -eq $singleQuote -or $char -eq $doubleQuote) {
            $inString = $true
            $quote = $char
            continue
        }
        if ($char -eq "[") {
            $depth++
            continue
        }
        if ($char -eq "]") {
            $depth--
            if ($depth -eq 0) { return $index }
            if ($depth -lt 0) { break }
        }
    }

    throw "Could not find the closing bracket for the plugins array."
}

function Get-PreviousNonWhitespaceIndex {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][int]$Index
    )

    while ($Index -ge 0 -and [char]::IsWhiteSpace($Content[$Index])) {
        $Index--
    }
    return $Index
}

function Test-PluginsAssignmentPrefix {
    param([Parameter(Mandatory = $true)][string]$Prefix)

    return [regex]::IsMatch(
        $Prefix,
        '(?s)(?:^|[^A-Za-z0-9_$])(?:(?:var|let|const)\s+)?(?:\$?plugins|[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*\$?plugins|[A-Za-z_$][A-Za-z0-9_$]*\s*\[\s*[''"]\$?plugins[''"]\s*\])\s*$'
    )
}

function Get-LikelyUtf16EncodingName {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    if ($Bytes.Length -lt 16) { return "" }

    $sampleLength = [Math]::Min($Bytes.Length, 4096)
    if ($sampleLength % 2 -ne 0) { $sampleLength-- }
    $pairs = 0
    $littleEndianScore = 0
    $bigEndianScore = 0

    for ($index = 0; $index + 1 -lt $sampleLength; $index += 2) {
        $pairs++
        if ($Bytes[$index] -ne 0 -and $Bytes[$index + 1] -eq 0) { $littleEndianScore++ }
        if ($Bytes[$index] -eq 0 -and $Bytes[$index + 1] -ne 0) { $bigEndianScore++ }
    }

    if ($pairs -lt 8) { return "" }
    if ($littleEndianScore * 3 -ge $pairs * 2 -and $littleEndianScore -gt $bigEndianScore * 4) { return "UTF-16LE" }
    if ($bigEndianScore * 3 -ge $pairs * 2 -and $bigEndianScore -gt $littleEndianScore * 4) { return "UTF-16BE" }
    return ""
}

function Read-PluginsFileText {
    param([Parameter(Mandatory = $true)][string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)

    # Some exported games keep plugins.js in UTF-16. Preserve the original BOM,
    # and also handle UTF-16 files written without one.
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xff -and $bytes[1] -eq 0xfe) {
        return [pscustomobject]@{
            Content = [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
            EncodingName = "UTF-16LE"
            Bom = [byte[]](0xff, 0xfe)
        }
    }

    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xfe -and $bytes[1] -eq 0xff) {
        return [pscustomobject]@{
            Content = [System.Text.Encoding]::BigEndianUnicode.GetString($bytes, 2, $bytes.Length - 2)
            EncodingName = "UTF-16BE"
            Bom = [byte[]](0xfe, 0xff)
        }
    }

    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xef -and $bytes[1] -eq 0xbb -and $bytes[2] -eq 0xbf) {
        return [pscustomobject]@{
            Content = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
            EncodingName = "UTF-8"
            Bom = [byte[]](0xef, 0xbb, 0xbf)
        }
    }

    $detectedEncodingName = Get-LikelyUtf16EncodingName -Bytes $bytes
    if ($detectedEncodingName -eq "UTF-16LE") {
        return [pscustomobject]@{
            Content = [System.Text.Encoding]::Unicode.GetString($bytes)
            EncodingName = "UTF-16LE"
            Bom = [byte[]]@()
        }
    }

    if ($detectedEncodingName -eq "UTF-16BE") {
        return [pscustomobject]@{
            Content = [System.Text.Encoding]::BigEndianUnicode.GetString($bytes)
            EncodingName = "UTF-16BE"
            Bom = [byte[]]@()
        }
    }

    return [pscustomobject]@{
        Content = [System.Text.Encoding]::UTF8.GetString($bytes)
        EncodingName = "UTF-8"
        Bom = [byte[]]@()
    }
}

function Write-PluginsFileText {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$EncodingName,
        [byte[]]$Bom = @()
    )

    $body = switch ($EncodingName) {
        "UTF-16LE" { [System.Text.Encoding]::Unicode.GetBytes($Content); break }
        "UTF-16BE" { [System.Text.Encoding]::BigEndianUnicode.GetBytes($Content); break }
        default { [System.Text.Encoding]::UTF8.GetBytes($Content); break }
    }

    $bytes = if ($Bom.Length -gt 0) { [byte[]]($Bom + $body) } else { [byte[]]$body }
    [System.IO.File]::WriteAllBytes($Path, $bytes)
}

function Find-PluginsArrayLiteral {
    param(
        [Parameter(Mandatory = $true)][string]$PluginsContent,
        [Parameter(Mandatory = $true)][string]$PluginsFile
    )

    # RPG Maker normally writes "var $plugins = [...]". Deployed games can
    # rewrite that as const/let declarations or global assignments such as
    # "window.$plugins = [...]". Walk the source so comments and strings do not
    # trick the installer into patching the wrong array.
    $inString = $false
    $quote = [char]0
    $escape = $false
    $lineComment = $false
    $blockComment = $false
    $singleQuote = [char]39
    $doubleQuote = [char]34
    $openIndex = -1

    for ($index = 0; $index -lt $PluginsContent.Length; $index++) {
        $char = $PluginsContent[$index]
        $next = if ($index + 1 -lt $PluginsContent.Length) { $PluginsContent[$index + 1] } else { [char]0 }

        if ($lineComment) {
            if ($char -eq "`n") { $lineComment = $false }
            continue
        }
        if ($blockComment) {
            if ($char -eq "*" -and $next -eq "/") {
                $blockComment = $false
                $index++
            }
            continue
        }
        if ($inString) {
            if ($escape) {
                $escape = $false
            } elseif ($char -eq "\") {
                $escape = $true
            } elseif ($char -eq $quote) {
                $inString = $false
            }
            continue
        }

        if ($char -eq "/" -and $next -eq "/") {
            $lineComment = $true
            $index++
            continue
        }
        if ($char -eq "/" -and $next -eq "*") {
            $blockComment = $true
            $index++
            continue
        }
        if ($char -eq $singleQuote -or $char -eq $doubleQuote) {
            $inString = $true
            $quote = $char
            continue
        }
        if ($char -ne "[") { continue }

        $equalIndex = Get-PreviousNonWhitespaceIndex -Content $PluginsContent -Index ($index - 1)
        if ($equalIndex -lt 0 -or $PluginsContent[$equalIndex] -ne "=") { continue }

        $beforeEqualIndex = Get-PreviousNonWhitespaceIndex -Content $PluginsContent -Index ($equalIndex - 1)
        if ($beforeEqualIndex -ge 0 -and "<>!=".IndexOf($PluginsContent[$beforeEqualIndex]) -ge 0) { continue }

        $lookbackStart = [Math]::Max(0, $equalIndex - 512)
        $prefix = $PluginsContent.Substring($lookbackStart, $equalIndex - $lookbackStart)
        if (-not (Test-PluginsAssignmentPrefix -Prefix $prefix)) { continue }

        $openIndex = $index
        break
    }

    if ($openIndex -lt 0) {
        throw "Could not find a plugins array assignment in $PluginsFile"
    }

    $closeIndex = Find-MatchingArrayClose -Content $PluginsContent -OpenIndex $openIndex
    return [pscustomobject]@{
        OpenIndex = $openIndex
        CloseIndex = $closeIndex
        Inner = $PluginsContent.Substring($openIndex + 1, $closeIndex - $openIndex - 1)
    }
}

function Split-PluginsArrayEntries {
    param([Parameter(Mandatory = $true)][string]$ArrayContent)

    $entries = @()
    $start = 0
    $braceDepth = 0
    $bracketDepth = 0
    $parenDepth = 0
    $inString = $false
    $quote = [char]0
    $escape = $false
    $lineComment = $false
    $blockComment = $false
    $singleQuote = [char]39
    $doubleQuote = [char]34

    for ($index = 0; $index -lt $ArrayContent.Length; $index++) {
        $char = $ArrayContent[$index]
        $next = if ($index + 1 -lt $ArrayContent.Length) { $ArrayContent[$index + 1] } else { [char]0 }

        if ($lineComment) {
            if ($char -eq "`n") { $lineComment = $false }
            continue
        }
        if ($blockComment) {
            if ($char -eq "*" -and $next -eq "/") {
                $blockComment = $false
                $index++
            }
            continue
        }
        if ($inString) {
            if ($escape) {
                $escape = $false
            } elseif ($char -eq "\") {
                $escape = $true
            } elseif ($char -eq $quote) {
                $inString = $false
            }
            continue
        }

        if ($char -eq "/" -and $next -eq "/") {
            $lineComment = $true
            $index++
            continue
        }
        if ($char -eq "/" -and $next -eq "*") {
            $blockComment = $true
            $index++
            continue
        }
        if ($char -eq $singleQuote -or $char -eq $doubleQuote) {
            $inString = $true
            $quote = $char
            continue
        }

        switch ($char) {
            "{" { $braceDepth++; break }
            "}" { if ($braceDepth -gt 0) { $braceDepth-- }; break }
            "[" { $bracketDepth++; break }
            "]" { if ($bracketDepth -gt 0) { $bracketDepth-- }; break }
            "(" { $parenDepth++; break }
            ")" { if ($parenDepth -gt 0) { $parenDepth-- }; break }
            "," {
                if ($braceDepth -eq 0 -and $bracketDepth -eq 0 -and $parenDepth -eq 0) {
                    $entry = $ArrayContent.Substring($start, $index - $start).Trim()
                    if (-not [string]::IsNullOrWhiteSpace($entry)) { $entries += $entry }
                    $start = $index + 1
                }
                break
            }
        }
    }

    $lastEntry = $ArrayContent.Substring($start).Trim()
    if (-not [string]::IsNullOrWhiteSpace($lastEntry)) { $entries += $lastEntry }
    return @($entries)
}

function Get-PluginNameFromEntry {
    param([Parameter(Mandatory = $true)][string]$EntryText)

    $doubleQuoted = [regex]::Match($EntryText, '"name"\s*:\s*"(?<name>(?:\\.|[^"\\])*)"')
    if ($doubleQuoted.Success) {
        return $doubleQuoted.Groups["name"].Value.Replace('\/', '/')
    }

    $singleQuoted = [regex]::Match($EntryText, "'name'\s*:\s*'(?<name>(?:\\.|[^'\\])*)'")
    if ($singleQuoted.Success) {
        return $singleQuoted.Groups["name"].Value.Replace('\/', '/')
    }

    return ""
}

function New-PluginEntryJson {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Description = ""
    )

    return ([ordered]@{
            name = $Name
            status = $true
            description = $Description
            parameters = @{}
        } | ConvertTo-Json -Compress)
}

function Sync-PluginEntries {
    param(
        [Parameter(Mandatory = $true)][string]$PluginsFile,
        [object[]]$DesiredPlugins = @(),
        [string[]]$RemovePluginNames = @()
    )

    if (-not (Test-Path -LiteralPath $PluginsFile -PathType Leaf)) {
        throw "$PluginsFile not found"
    }

    $pluginsFileText = Read-PluginsFileText -Path $PluginsFile
    $pluginsContent = $pluginsFileText.Content
    $arrayLiteral = Find-PluginsArrayLiteral -PluginsContent $pluginsContent -PluginsFile $PluginsFile
    $entries = Split-PluginsArrayEntries -ArrayContent $arrayLiteral.Inner
    $desiredNames = @($DesiredPlugins | ForEach-Object { [string]$_.Name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    $keptEntries = @()
    $presentDesired = @{}
    $changed = $false
    $removedNames = @()

    foreach ($entry in $entries) {
        $entryName = Get-PluginNameFromEntry -EntryText $entry
        if (Test-NameInList -Name $entryName -Names $RemovePluginNames) {
            $removedNames += $entryName
            $changed = $true
            continue
        }

        if (Test-NameInList -Name $entryName -Names $desiredNames) {
            $key = $entryName.ToLowerInvariant()
            if ($presentDesired.ContainsKey($key)) {
                $removedNames += $entryName
                $changed = $true
                continue
            }
            $presentDesired[$key] = $true
        }

        $keptEntries += $entry
    }

    $addedNames = @()
    foreach ($plugin in @($DesiredPlugins)) {
        $name = [string]$plugin.Name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $key = $name.ToLowerInvariant()
        if ($presentDesired.ContainsKey($key)) { continue }

        $keptEntries += New-PluginEntryJson -Name $name -Description ([string]$plugin.Description)
        $presentDesired[$key] = $true
        $addedNames += $name
        $changed = $true
    }

    if (-not $changed) {
        Write-Host "Managed plugin entries already match $PluginProfile profile in $PluginsFile" -ForegroundColor Yellow
        return $false
    }

    Copy-Item -LiteralPath $PluginsFile -Destination "$PluginsFile.backup" -Force
    Write-Host "Backup created: $PluginsFile.backup" -ForegroundColor Cyan

    $prefix = $pluginsContent.Substring(0, $arrayLiteral.OpenIndex + 1)
    $suffix = $pluginsContent.Substring($arrayLiteral.CloseIndex)
    $newline = "`r`n"
    $body = if ($keptEntries.Count -gt 0) {
        $newline + (($keptEntries | ForEach-Object { "    " + $_.Trim() }) -join ("," + $newline)) + $newline
    } else {
        ""
    }
    $updatedContent = $prefix + $body + $suffix
    Write-PluginsFileText `
        -Path $PluginsFile `
        -Content $updatedContent `
        -EncodingName $pluginsFileText.EncodingName `
        -Bom $pluginsFileText.Bom

    if ($addedNames.Count -gt 0) {
        Write-Host "Added managed plugin entry: $($addedNames -join ', ')" -ForegroundColor Green
    }
    if ($removedNames.Count -gt 0) {
        Write-Host "Removed managed plugin entry: $($removedNames -join ', ')" -ForegroundColor Green
    }
    return $true
}

$resolvedRuntimeSource = if ([string]::IsNullOrWhiteSpace($RuntimeSource)) {
    Get-FullPath (Join-Path -Path $defaultRoot -ChildPath "live-translator")
} else {
    Get-FullPath (Resolve-InputPath -BasePath (Get-Location).Path -Path $RuntimeSource)
}

$resolvedSnapshotSource = Resolve-OptionalSnapshotSource `
    -ResolvedRuntimeRoot $resolvedRuntimeSource `
    -ConfiguredSnapshotSource $SnapshotSource `
    -AllowDefaultSnapshotSource ($PluginProfile -eq "snapshot")

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
    if ($PluginProfile -eq "snapshot" -and [string]::IsNullOrWhiteSpace($resolvedSnapshotSource)) {
        throw "Snapshot profile requires a snapshot source folder."
    }

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
    Copy-RuntimeBundle `
        -ResolvedRuntimeRoot $resolvedRuntimeSource `
        -SupportTargetDir $supportTargetFull `
        -Manifest $manifest
    if ($PluginProfile -eq "snapshot") {
        Write-Host "Snapshot profile enables the standard live-translator plugin entry before the snapshot harness." -ForegroundColor Cyan
    }
    if (-not [string]::IsNullOrWhiteSpace($resolvedSnapshotSource)) {
        Copy-OptionalSnapshotBundle `
            -ResolvedSnapshotRoot $resolvedSnapshotSource `
            -PluginsDir $pluginsDirFull | Out-Null
    }
    Install-TranslatorConfigFile `
        -InstallerRoot $scriptRoot `
        -ResolvedRuntimeRoot $resolvedRuntimeSource `
        -SupportTargetDir $supportTargetFull `
        -Profile $PluginProfile
    Install-SettingsFile `
        -InstallerRoot $scriptRoot `
        -ResolvedRuntimeRoot $resolvedRuntimeSource `
        -SupportTargetDir $supportTargetFull `
        -Profile $PluginProfile
    Remove-ObsoleteSupportPaths -Manifest $manifest -SupportTargetDir $supportTargetFull
    Remove-ObsoleteInstallerCopy -ResolvedGameRoot $resolvedGameRoot

    $pluginEntryName = Get-PluginEntryName `
        -SupportDirectory ([string]$manifest.supportDirectory) `
        -LoaderFile ([string]$manifest.loader)
    $legacyPluginEntryName = Get-LegacyPluginEntryName -LoaderFile ([string]$manifest.loader)
    $snapshotPluginEntryName = ""
    if (-not [string]::IsNullOrWhiteSpace($resolvedSnapshotSource)) {
        $snapshotManifest = Read-SnapshotManifest -SnapshotRoot $resolvedSnapshotSource
        $snapshotPluginEntryName = Get-PluginEntryName `
            -SupportDirectory ([string]$snapshotManifest.supportDirectory) `
            -LoaderFile ([string]$snapshotManifest.loader)
    } else {
        $snapshotPluginEntryName = "snapshot/snapshot-loader"
    }

    $desiredPlugins = if ($PluginProfile -eq "snapshot") {
        @(
            [pscustomobject]@{
                Name = $pluginEntryName
                Description = "Entry point for the live translation system"
            },
            [pscustomobject]@{
                Name = $snapshotPluginEntryName
                Description = "Snapshot capture and validation harness"
            }
        )
    } else {
        @([pscustomobject]@{
                Name = $pluginEntryName
                Description = "Entry point for the live translation system"
            })
    }
    $removePlugins = if ($PluginProfile -eq "snapshot") {
        @($legacyPluginEntryName)
    } else {
        @($legacyPluginEntryName, $snapshotPluginEntryName)
    }

    $createdPluginsBackup = Sync-PluginEntries `
        -PluginsFile ([string]$layout.PluginsFile) `
        -DesiredPlugins $desiredPlugins `
        -RemovePluginNames $removePlugins
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
