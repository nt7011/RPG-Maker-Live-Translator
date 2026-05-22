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
    return "$safeBase-$timestamp"
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

    Get-ChildItem -LiteralPath $snapshotFull -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $snapshotTargetFull -Recurse -Force
    }
    Write-Host "Installed optional snapshot plugin to $snapshotTargetFull" -ForegroundColor Cyan
    return $true
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

function Find-PluginsArrayLiteral {
    param(
        [Parameter(Mandatory = $true)][string]$PluginsContent,
        [Parameter(Mandatory = $true)][string]$PluginsFile
    )

    # RPG Maker normally writes "var $plugins = [...]". Deployed games may keep
    # the same array under "plugins = [...]"; parse the array instead of splitting
    # on commas, because plugin parameters can contain nested objects and lists.
    $assignment = [regex]'(?s)(?:var\s+)?(?:\$)?plugins\s*=\s*\['
    $match = $assignment.Match($PluginsContent)
    if (-not $match.Success) {
        throw "Could not find a plugins = [...] array in $PluginsFile"
    }

    $openIndex = $match.Index + $match.Value.LastIndexOf("[")
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

    $pluginsContent = Get-Content -LiteralPath $PluginsFile -Raw -Encoding UTF8
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
    Set-Content -LiteralPath $PluginsFile -Value $updatedContent -Encoding UTF8 -Force

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
    Copy-RuntimeBundle -ResolvedRuntimeRoot $resolvedRuntimeSource -SupportTargetDir $supportTargetFull
    if ($PluginProfile -eq "snapshot") {
        Write-Host "Snapshot profile enables the standard live-translator plugin entry before the snapshot harness." -ForegroundColor Cyan
    }
    if (-not [string]::IsNullOrWhiteSpace($resolvedSnapshotSource)) {
        Copy-OptionalSnapshotBundle `
            -ResolvedSnapshotRoot $resolvedSnapshotSource `
            -PluginsDir $pluginsDirFull | Out-Null
    }
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
