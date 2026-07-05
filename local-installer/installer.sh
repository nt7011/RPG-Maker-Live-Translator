#!/bin/bash

# NOTE: Windows/PowerShell is the active development path. Keep this script in
# step with installer.ps1 so release archives have the same layout contract.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
default_root="$(cd "${script_dir}/.." && pwd)"
game_root="$default_root"
runtime_source="${default_root}/live-translator"
diagnostics_source=""
snapshot_source=""
plugin_profile="debug"
include_diagnostics=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        --game-root|-g)
            game_root="$2"
            shift 2
            ;;
        --runtime-source|-r)
            runtime_source="$2"
            shift 2
            ;;
        --snapshot-source|-s)
            snapshot_source="$2"
            shift 2
            ;;
        --diagnostics-source)
            diagnostics_source="$2"
            shift 2
            ;;
        --include-diagnostics)
            include_diagnostics=true
            shift
            ;;
        --plugin-profile|-p)
            plugin_profile="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

case "$plugin_profile" in
    debug|snapshot)
        ;;
    *)
        echo "Error: --plugin-profile must be debug or snapshot" >&2
        exit 1
        ;;
esac

game_root="$(cd "$game_root" && pwd)"
runtime_source="$(cd "$runtime_source" && pwd)"
if [ -n "$diagnostics_source" ]; then
    diagnostics_source="$(cd "$diagnostics_source" && pwd)"
elif [ "$include_diagnostics" = true ]; then
    diagnostics_candidate="$(cd "$(dirname "$runtime_source")" && pwd)/diagnostics"
    if [ -d "$diagnostics_candidate" ]; then
        diagnostics_source="$(cd "$diagnostics_candidate" && pwd)"
    fi
fi
if [ -n "$snapshot_source" ]; then
    snapshot_source="$(cd "$snapshot_source" && pwd)"
elif [ "$plugin_profile" = "snapshot" ]; then
    snapshot_candidate="$(cd "$(dirname "$runtime_source")" && pwd)/snapshot"
    if [ -d "$snapshot_candidate" ]; then
        snapshot_source="$(cd "$snapshot_candidate" && pwd)"
    fi
fi

if [ "$include_diagnostics" = true ] && [ -z "$diagnostics_source" ]; then
    echo -e "\033[31mError: diagnostics include requires a diagnostics source folder\033[0m" >&2
    exit 1
fi
if [ "$plugin_profile" = "snapshot" ] && [ -z "$snapshot_source" ]; then
    echo -e "\033[31mError: snapshot profile requires a snapshot source folder\033[0m" >&2
    exit 1
fi
manifest_path="${runtime_source}/install-manifest.json"

json_string_from_file() {
    local file="$1"
    local key="$2"
    sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$file" | head -n 1
}

json_string() {
    local key="$1"
    json_string_from_file "$manifest_path" "$key"
}

json_array() {
    local key="$1"
    json_array_from_file "$manifest_path" "$key"
}

json_array_from_file() {
    local file="$1"
    local key="$2"
    sed -n "/\"${key}\"[[:space:]]*:/,/]/p" "$file" \
        | sed -n 's/^[[:space:]]*"\([^"]*\)"[[:space:]]*,\{0,1\}[[:space:]]*$/\1/p'
}

escape_sed_replacement() {
    printf '%s' "$1" | sed 's/[\/&]/\\&/g'
}

copy_file() {
    local source="$1"
    local target="$2"

    if [ "$(uname -s)" = "Darwin" ]; then
        if cp -X "$source" "$target" 2>/dev/null; then
            return 0
        fi
    fi

    cp "$source" "$target"
}

assert_manifest_relative_file() {
    local relative="$1"
    local description="$2"

    case "$relative" in
        ""|/*|../*|*/../*|..|*\\*|*:*)
            echo -e "\033[31mError: ${description} contains an unsafe file path: ${relative}\033[0m" >&2
            exit 1
            ;;
    esac
}

copy_manifest_file() {
    local source_root="$1"
    local target_root="$2"
    local relative="$3"
    local description="$4"
    local required="$5"
    local source_file
    local target_file

    assert_manifest_relative_file "$relative" "$description"
    source_file="${source_root}/${relative}"
    target_file="${target_root}/${relative}"

    if [ ! -f "$source_file" ]; then
        if [ "$required" = "required" ]; then
            echo -e "\033[31mError: ${description} file not found: ${relative}\033[0m" >&2
            exit 1
        fi
        return 1
    fi

    mkdir -p "$(dirname "$target_file")"
    copy_file "$source_file" "$target_file"
    return 0
}

copy_manifest_files() {
    local source_root="$1"
    local target_root="$2"
    local manifest_file="$3"
    local array_key="$4"
    local description="$5"
    local required="$6"
    local copied=0
    local relative

    while IFS= read -r relative; do
        [ -z "$relative" ] && continue
        if copy_manifest_file "$source_root" "$target_root" "$relative" "$description" "$required"; then
            copied=$((copied + 1))
        fi
    done < <(json_array_from_file "$manifest_file" "$array_key")

    if [ "$required" = "required" ] && [ "$copied" -eq 0 ]; then
        echo -e "\033[31mError: ${description} did not list any source files\033[0m" >&2
        exit 1
    fi
}

installer_package_name() {
    # NW.js uses package.json "name" when choosing the Chromium profile
    # directory. Own that value so unrelated games never share stale profile
    # state from a generic package name.
    local folder_name
    local safe_base
    local timestamp
    local millis

    folder_name="$(basename "$game_root")"
    if [ -z "${folder_name//[[:space:]]/}" ]; then
        folder_name="game"
    fi

    safe_base="$(printf '%s' "$folder_name" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[[:space:]]+/-/g; s/[^a-z0-9._-]+/-/g; s/-+/-/g; s/^[._-]+//; s/[._-]+$//')"
    if [ -z "$safe_base" ]; then
        safe_base="game"
    fi

    timestamp="$(date '+%Y%m%d%H%M%S')"
    millis="$(date '+%3N' 2>/dev/null || true)"
    if [[ ! "$millis" =~ ^[0-9]{3}$ ]]; then
        millis="000"
    fi

    printf 'live-translator-%s-%s%s' "$safe_base" "$timestamp" "$millis"
}

resolve_settings_source() {
    local local_settings="${script_dir}/settings.local.json"
    local local_snapshot_settings="${script_dir}/settings.snapshot.json"
    local snapshot_settings="${runtime_source}/config-templates/settings.snapshot.json"
    local release_settings="${runtime_source}/config-templates/settings.release.json"

    if [ "$plugin_profile" = "snapshot" ] && [ -f "$local_snapshot_settings" ]; then
        settings_source_path="$local_snapshot_settings"
        settings_source_label="local-installer/settings.snapshot.json"
        return 0
    fi

    if [ "$plugin_profile" = "snapshot" ] && [ -f "$snapshot_settings" ]; then
        settings_source_path="$snapshot_settings"
        settings_source_label="live-translator/config-templates/settings.snapshot.json"
        return 0
    fi

    if [ "$plugin_profile" != "snapshot" ] && [ -f "$local_settings" ]; then
        settings_source_path="$local_settings"
        settings_source_label="local-installer/settings.local.json"
        return 0
    fi

    if [ -f "$release_settings" ]; then
        settings_source_path="$release_settings"
        settings_source_label="live-translator/config-templates/settings.release.json"
        return 0
    fi

    echo -e "\033[31mError: Could not find installer settings source for ${plugin_profile} profile\033[0m" >&2
    echo -e "\033[31mChecked $local_snapshot_settings, $snapshot_settings, $local_settings, and $release_settings\033[0m" >&2
    exit 1
}

resolve_translator_source() {
    local local_translator="${script_dir}/translator.local.json"
    local local_snapshot_translator="${script_dir}/translator.snapshot.json"
    local snapshot_translator="${runtime_source}/config-templates/translator.snapshot.json"
    local release_translator="${runtime_source}/config-templates/translator.release.json"

    if [ "$plugin_profile" = "snapshot" ] && [ -f "$local_snapshot_translator" ]; then
        translator_source_path="$local_snapshot_translator"
        translator_source_label="local-installer/translator.snapshot.json"
        return 0
    fi

    if [ "$plugin_profile" = "snapshot" ] && [ -f "$snapshot_translator" ]; then
        translator_source_path="$snapshot_translator"
        translator_source_label="live-translator/config-templates/translator.snapshot.json"
        return 0
    fi

    if [ "$plugin_profile" != "snapshot" ] && [ -f "$local_translator" ]; then
        translator_source_path="$local_translator"
        translator_source_label="local-installer/translator.local.json"
        return 0
    fi

    if [ -f "$release_translator" ]; then
        translator_source_path="$release_translator"
        translator_source_label="live-translator/config-templates/translator.release.json"
        return 0
    fi

    echo -e "\033[31mError: Could not find translator.json source for ${plugin_profile} profile\033[0m" >&2
    echo -e "\033[31mChecked $local_snapshot_translator, $snapshot_translator, $local_translator, and $release_translator\033[0m" >&2
    exit 1
}

install_settings_file() {
    # settings.json is environment-specific, so install it explicitly instead
    # of depending on a file bundled inside the shared runtime tree.
    resolve_settings_source
    copy_file "$settings_source_path" "${support_dir}/settings.json"
    echo -e "\033[36mInstalled settings.json from ${settings_source_label}\033[0m"
}

install_translator_file() {
    # translator.json follows the same profile-specific source selection as
    # settings.json. Snapshot uses the deterministic in-process mock provider.
    resolve_translator_source
    copy_file "$translator_source_path" "${support_dir}/translator.json"
    echo -e "\033[36mInstalled translator.json from ${translator_source_label}\033[0m"
}

install_optional_snapshot_plugin() {
    if [ -z "$snapshot_source" ]; then
        return 0
    fi

    local snapshot_manifest_path="${snapshot_source}/install-manifest.json"
    if [ ! -f "$snapshot_manifest_path" ]; then
        echo -e "\033[31mError: snapshot/install-manifest.json not found at $snapshot_manifest_path\033[0m" >&2
        exit 1
    fi

    local snapshot_module
    local snapshot_support_name
    local snapshot_loader_name
    local snapshot_freeze_name
    local snapshot_replay_name
    snapshot_module="$(json_string_from_file "$snapshot_manifest_path" module)"
    snapshot_support_name="$(json_string_from_file "$snapshot_manifest_path" supportDirectory)"
    snapshot_loader_name="$(json_string_from_file "$snapshot_manifest_path" loader)"
    snapshot_freeze_name="$(json_string_from_file "$snapshot_manifest_path" freezePlugin)"
    snapshot_replay_name="$(json_string_from_file "$snapshot_manifest_path" replayRuntime)"

    if [ "$snapshot_module" != "snapshot" ] || [ -z "$snapshot_support_name" ] || [ -z "$snapshot_loader_name" ] || [ -z "$snapshot_freeze_name" ] || [ -z "$snapshot_replay_name" ]; then
        echo -e "\033[31mError: snapshot/install-manifest.json is missing module, supportDirectory, loader, freezePlugin, or replayRuntime\033[0m" >&2
        exit 1
    fi

    for snapshot_required_file in "$snapshot_loader_name" "$snapshot_freeze_name" "$snapshot_replay_name"; do
        if [ ! -f "${snapshot_source}/${snapshot_required_file}" ]; then
            echo -e "\033[31mError: ${snapshot_required_file} not found under snapshot/\033[0m" >&2
            exit 1
        fi
    done

    local snapshot_dir="${plugins_dir}/${snapshot_support_name}"
    mkdir -p "$snapshot_dir"
    copy_manifest_files "$snapshot_source" "$snapshot_dir" "$snapshot_manifest_path" "sourceFiles" "snapshot fileInventory.sourceFiles" "required"
    echo -e "\033[36mInstalled optional snapshot plugin to $snapshot_dir\033[0m"
}

install_optional_diagnostics_plugin() {
    if [ "$include_diagnostics" != true ]; then
        return 0
    fi
    if [ ! -d "$diagnostics_source" ]; then
        echo -e "\033[31mError: diagnostics source does not exist: $diagnostics_source\033[0m" >&2
        exit 1
    fi

    local diagnostics_manifest_path="${diagnostics_source}/install-manifest.json"
    if [ ! -f "$diagnostics_manifest_path" ]; then
        echo -e "\033[31mError: diagnostics/install-manifest.json not found at $diagnostics_manifest_path\033[0m" >&2
        exit 1
    fi

    local diagnostics_module
    local diagnostics_support_name
    local diagnostics_loader_name
    diagnostics_module="$(json_string_from_file "$diagnostics_manifest_path" module)"
    diagnostics_support_name="$(json_string_from_file "$diagnostics_manifest_path" supportDirectory)"
    diagnostics_loader_name="$(json_string_from_file "$diagnostics_manifest_path" loader)"

    if [ "$diagnostics_module" != "diagnostics" ] || [ -z "$diagnostics_support_name" ] || [ -z "$diagnostics_loader_name" ]; then
        echo -e "\033[31mError: diagnostics/install-manifest.json is missing module, supportDirectory, or loader\033[0m" >&2
        exit 1
    fi
    if [ -z "$(json_array_from_file "$diagnostics_manifest_path" sourceFiles)" ]; then
        echo -e "\033[31mError: diagnostics/install-manifest.json missing fileInventory.sourceFiles\033[0m" >&2
        exit 1
    fi
    if [ -z "$(json_array_from_file "$diagnostics_manifest_path" scriptLoadOrder)" ]; then
        echo -e "\033[31mError: diagnostics/install-manifest.json missing runtime.scriptLoadOrder\033[0m" >&2
        exit 1
    fi
    if [ ! -f "${diagnostics_source}/${diagnostics_loader_name}" ]; then
        echo -e "\033[31mError: ${diagnostics_loader_name} not found under diagnostics/\033[0m" >&2
        exit 1
    fi

    assert_manifest_relative_file "$diagnostics_support_name" "diagnostics support directory"

    local diagnostics_target="${plugins_dir}/${diagnostics_support_name}"
    mkdir -p "$diagnostics_target"
    copy_manifest_files "$diagnostics_source" "$diagnostics_target" "$diagnostics_manifest_path" "sourceFiles" "diagnostics fileInventory.sourceFiles" "required"
    echo -e "\033[36mInstalled optional diagnostics plugin to $diagnostics_target\033[0m"
}

if [ ! -f "$manifest_path" ]; then
    echo -e "\033[31mError: install-manifest.json not found at $manifest_path\033[0m"
    exit 1
fi

support_name="$(json_string supportDirectory)"
loader_name="$(json_string loader)"
if [ -z "$support_name" ] || [ -z "$loader_name" ]; then
    echo -e "\033[31mError: install-manifest.json is missing supportDirectory or loader\033[0m"
    exit 1
fi
if [ -z "$(json_array sourceFiles)" ]; then
    echo -e "\033[31mError: install-manifest.json missing fileInventory.sourceFiles\033[0m"
    exit 1
fi

if [ ! -f "${runtime_source}/${loader_name}" ]; then
    echo -e "\033[31mError: ${loader_name} not found under live-translator/\033[0m"
    exit 1
fi

echo -e "\033[32mInstalling RPG Maker Live Translator...\033[0m"

handled_any=false
generated_package_name="$(installer_package_name)"
for pkg_path in "package.json" "www/package.json"; do
    full_pkg="${game_root}/${pkg_path}"
    if [ ! -f "$full_pkg" ]; then
        continue
    fi
    handled_any=true
    if grep -q '"name"[[:space:]]*:' "$full_pkg" 2>/dev/null; then
        echo -e "\033[33mSetting $pkg_path name field to '${generated_package_name}'\033[0m"
        if [ ! -f "${full_pkg}.backup" ]; then
            copy_file "$full_pkg" "${full_pkg}.backup"
            echo -e "\033[36mBackup created: ${pkg_path}.backup\033[0m"
        fi

        escaped_package_name="$(escape_sed_replacement "$generated_package_name")"
        tmp_pkg="${full_pkg}.tmp"
        if sed -E "s/\"name\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"name\": \"${escaped_package_name}\"/" "$full_pkg" > "$tmp_pkg"; then
            mv "$tmp_pkg" "$full_pkg"
            echo -e "\033[32mUpdated name field in $pkg_path\033[0m"
        else
            rm -f "$tmp_pkg"
            echo -e "\033[33mWarning: Unable to update name field in $pkg_path\033[0m"
        fi
    else
        echo -e "\033[36mNo name field found in $pkg_path (leaving file unchanged)\033[0m"
    fi
done

if [ "$handled_any" = false ]; then
    echo -e "\033[33mpackage.json not found - this is normal for some RPG Maker versions\033[0m"
fi

plugins_dir=""
plugins_file=""
if [ -d "${game_root}/www/js/plugins" ]; then
    plugins_dir="${game_root}/www/js/plugins"
    plugins_file="${game_root}/www/js/plugins.js"
    echo -e "\033[36mDetected www/js/plugins folder structure\033[0m"
elif [ -d "${game_root}/js/plugins" ]; then
    plugins_dir="${game_root}/js/plugins"
    plugins_file="${game_root}/js/plugins.js"
    echo -e "\033[36mDetected js/plugins folder structure\033[0m"
else
    echo -e "\033[31mError: Could not find js/plugins or www/js/plugins directory\033[0m"
    exit 1
fi

support_dir="${plugins_dir}/${support_name}"
mkdir -p "$support_dir"
copy_manifest_files "$runtime_source" "$support_dir" "$manifest_path" "sourceFiles" "live-translator fileInventory.sourceFiles" "required"
copy_manifest_files "$runtime_source" "$support_dir" "$manifest_path" "optionalAssets" "live-translator runtime.optionalAssets" "optional"
echo -e "\033[33mCopied live-translator runtime bundle to $support_dir\033[0m"
install_optional_diagnostics_plugin
install_optional_snapshot_plugin
install_translator_file
install_settings_file

while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    target="${support_dir}/${entry}"
    if [ -e "$target" ] || [ -L "$target" ]; then
        rm -rf "$target"
        echo -e "\033[36mRemoved obsolete support path $entry\033[0m"
    fi
done < <(json_array obsoleteSupportPaths)

obsolete_installer="${game_root}/live-translator-installer"
if [ -d "$obsolete_installer" ]; then
    rm -rf "$obsolete_installer"
    echo -e "\033[36mRemoved obsolete copied installer folder live-translator-installer\033[0m"
fi

plugin_entry_name="${support_name}/${loader_name%.[jJ][sS]}"
legacy_plugin_entry_name="${loader_name%.[jJ][sS]}"
diagnostics_plugin_entry_name="diagnostics/diagnostics-loader"
if [ "$include_diagnostics" = true ]; then
    diagnostics_manifest_path="${diagnostics_source}/install-manifest.json"
    diagnostics_support_for_entry="$(json_string_from_file "$diagnostics_manifest_path" supportDirectory)"
    diagnostics_loader_for_entry="$(json_string_from_file "$diagnostics_manifest_path" loader)"
    if [ -n "$diagnostics_support_for_entry" ] && [ -n "$diagnostics_loader_for_entry" ]; then
        diagnostics_plugin_entry_name="${diagnostics_support_for_entry}/${diagnostics_loader_for_entry%.[jJ][sS]}"
    fi
fi
snapshot_plugin_entry_name="snapshot/snapshot-loader"
if [ -n "$snapshot_source" ]; then
    snapshot_manifest_path="${snapshot_source}/install-manifest.json"
    snapshot_support_for_entry="$(json_string_from_file "$snapshot_manifest_path" supportDirectory)"
    snapshot_loader_for_entry="$(json_string_from_file "$snapshot_manifest_path" loader)"
    if [ -n "$snapshot_support_for_entry" ] && [ -n "$snapshot_loader_for_entry" ]; then
        snapshot_plugin_entry_name="${snapshot_support_for_entry}/${snapshot_loader_for_entry%.[jJ][sS]}"
    fi
fi

if [ ! -f "$plugins_file" ]; then
    echo -e "\033[31mError: $plugins_file not found\033[0m"
    exit 1
fi

created_plugins_backup=false

sync_plugin_entries() {
    local sync_output_file="${plugins_file}.rmlt-sync-output.$$"
    local tab=$'\t'

    # Match installer.ps1 behavior: find the RPG Maker plugins assignment,
    # parse top-level entries, then rewrite only managed translator entries.
    # This avoids sed inserting after an unrelated earlier "[" in the file.
    if ! command -v perl >/dev/null 2>&1; then
        echo -e "\033[31mError: perl is required to update $plugins_file safely\033[0m" >&2
        return 1
    fi

    if ! perl - "$plugins_file" "$plugin_profile" "$plugin_entry_name" "$snapshot_plugin_entry_name" "$legacy_plugin_entry_name" "$include_diagnostics" "$diagnostics_plugin_entry_name" > "$sync_output_file" <<'PERL'
use strict;
use warnings;
use Encode qw(decode encode FB_CROAK);
use File::Copy qw(copy);

my ($file, $profile, $plugin_name, $snapshot_name, $legacy_name, $include_diagnostics, $diagnostics_name) = @ARGV;

sub fail {
    die $_[0] . "\n";
}

sub likely_utf16_encoding {
    my ($raw) = @_;
    return '' if length($raw) < 16;

    my $sample_length = length($raw) < 4096 ? length($raw) : 4096;
    $sample_length-- if $sample_length % 2;
    my $pairs = 0;
    my $little_endian_score = 0;
    my $big_endian_score = 0;

    for (my $index = 0; $index + 1 < $sample_length; $index += 2) {
        my $first = substr($raw, $index, 1);
        my $second = substr($raw, $index + 1, 1);
        $pairs++;
        $little_endian_score++ if $first ne "\0" && $second eq "\0";
        $big_endian_score++ if $first eq "\0" && $second ne "\0";
    }

    return '' if $pairs < 8;
    return 'UTF-16LE' if $little_endian_score * 3 >= $pairs * 2 && $little_endian_score > $big_endian_score * 4;
    return 'UTF-16BE' if $big_endian_score * 3 >= $pairs * 2 && $big_endian_score > $little_endian_score * 4;
    return '';
}

sub read_plugins_file {
    my ($path) = @_;
    open my $input, '<:raw', $path or fail("Could not read $path: $!");
    my $raw = do { local $/; <$input> };
    close $input;

    # Some exported games keep plugins.js in UTF-16. Decode BOM-marked files
    # first, then fall back to the standard NUL-byte pattern for UTF-16 files
    # written without a BOM.
    return (decode('UTF-16LE', substr($raw, 2), FB_CROAK), 'UTF-16LE', "\xFF\xFE")
        if length($raw) >= 2 && substr($raw, 0, 2) eq "\xFF\xFE";
    return (decode('UTF-16BE', substr($raw, 2), FB_CROAK), 'UTF-16BE', "\xFE\xFF")
        if length($raw) >= 2 && substr($raw, 0, 2) eq "\xFE\xFF";

    my $detected_encoding = likely_utf16_encoding($raw);
    return (decode($detected_encoding, $raw, FB_CROAK), $detected_encoding, '')
        if $detected_encoding ne '';

    return ($raw, 'raw', '');
}

sub encode_plugins_file {
    my ($content, $encoding, $bom) = @_;
    return $content if $encoding eq 'raw';
    return $bom . encode($encoding, $content, FB_CROAK);
}

sub find_matching_array_close {
    my ($content, $open_index) = @_;
    my $depth = 0;
    my $in_string = 0;
    my $quote = '';
    my $escape = 0;
    my $line_comment = 0;
    my $block_comment = 0;
    my $index = $open_index;
    my $length = length($content);

    while ($index < $length) {
        my $char = substr($content, $index, 1);
        my $next = $index + 1 < $length ? substr($content, $index + 1, 1) : '';

        if ($line_comment) {
            $line_comment = 0 if $char eq "\n";
            $index++;
            next;
        }
        if ($block_comment) {
            if ($char eq '*' && $next eq '/') {
                $block_comment = 0;
                $index += 2;
                next;
            }
            $index++;
            next;
        }
        if ($in_string) {
            if ($escape) {
                $escape = 0;
            } elsif ($char eq '\\') {
                $escape = 1;
            } elsif ($char eq $quote) {
                $in_string = 0;
            }
            $index++;
            next;
        }

        if ($char eq '/' && $next eq '/') {
            $line_comment = 1;
            $index += 2;
            next;
        }
        if ($char eq '/' && $next eq '*') {
            $block_comment = 1;
            $index += 2;
            next;
        }
        if ($char eq "'" || $char eq '"') {
            $in_string = 1;
            $quote = $char;
            $index++;
            next;
        }
        if ($char eq '[') {
            $depth++;
        } elsif ($char eq ']') {
            $depth--;
            return $index if $depth == 0;
            last if $depth < 0;
        }

        $index++;
    }

    fail('Could not find the closing bracket for the plugins array.');
}

sub previous_non_space_index {
    my ($content, $index) = @_;
    while ($index >= 0 && substr($content, $index, 1) =~ /\s/) {
        $index--;
    }
    return $index;
}

sub has_plugins_assignment_prefix {
    my ($prefix) = @_;
    return $prefix =~ /(?:^|[^A-Za-z0-9_\$])(?:(?:var|let|const)\s+)?(?:\$?plugins|[A-Za-z_\$][A-Za-z0-9_\$]*\s*\.\s*\$?plugins|[A-Za-z_\$][A-Za-z0-9_\$]*\s*\[\s*['"]\$?plugins['"]\s*\])\s*$/s;
}

sub find_plugins_array_literal {
    my ($content) = @_;
    # RPG Maker normally writes "var $plugins = [...]". Deployed games can
    # rewrite that as const/let declarations or global assignments such as
    # "window.$plugins = [...]". Walk the source so comments and strings do not
    # trick the installer into patching the wrong array.
    my $in_string = 0;
    my $quote = '';
    my $escape = 0;
    my $line_comment = 0;
    my $block_comment = 0;
    my $length = length($content);

    for (my $index = 0; $index < $length; $index++) {
        my $char = substr($content, $index, 1);
        my $next = $index + 1 < $length ? substr($content, $index + 1, 1) : '';

        if ($line_comment) {
            $line_comment = 0 if $char eq "\n";
            next;
        }
        if ($block_comment) {
            if ($char eq '*' && $next eq '/') {
                $block_comment = 0;
                $index++;
            }
            next;
        }
        if ($in_string) {
            if ($escape) {
                $escape = 0;
            } elsif ($char eq '\\') {
                $escape = 1;
            } elsif ($char eq $quote) {
                $in_string = 0;
            }
            next;
        }

        if ($char eq '/' && $next eq '/') {
            $line_comment = 1;
            $index++;
            next;
        }
        if ($char eq '/' && $next eq '*') {
            $block_comment = 1;
            $index++;
            next;
        }
        if ($char eq "'" || $char eq '"') {
            $in_string = 1;
            $quote = $char;
            next;
        }
        next unless $char eq '[';

        my $equal_index = previous_non_space_index($content, $index - 1);
        next if $equal_index < 0 || substr($content, $equal_index, 1) ne '=';

        my $before_equal_index = previous_non_space_index($content, $equal_index - 1);
        next if $before_equal_index >= 0 && substr($content, $before_equal_index, 1) =~ /[=!<>]/;

        my $lookback_start = $equal_index > 512 ? $equal_index - 512 : 0;
        my $prefix = substr($content, $lookback_start, $equal_index - $lookback_start);
        next unless has_plugins_assignment_prefix($prefix);

        my $close_index = find_matching_array_close($content, $index);
        return ($index, $close_index, substr($content, $index + 1, $close_index - $index - 1));
    }

    fail("Could not find a plugins array assignment in $file");
}

sub split_plugins_array_entries {
    my ($array_content) = @_;
    my @entries = ();
    my $start = 0;
    my $brace_depth = 0;
    my $bracket_depth = 0;
    my $paren_depth = 0;
    my $in_string = 0;
    my $quote = '';
    my $escape = 0;
    my $line_comment = 0;
    my $block_comment = 0;
    my $index = 0;
    my $length = length($array_content);

    while ($index < $length) {
        my $char = substr($array_content, $index, 1);
        my $next = $index + 1 < $length ? substr($array_content, $index + 1, 1) : '';

        if ($line_comment) {
            $line_comment = 0 if $char eq "\n";
            $index++;
            next;
        }
        if ($block_comment) {
            if ($char eq '*' && $next eq '/') {
                $block_comment = 0;
                $index += 2;
                next;
            }
            $index++;
            next;
        }
        if ($in_string) {
            if ($escape) {
                $escape = 0;
            } elsif ($char eq '\\') {
                $escape = 1;
            } elsif ($char eq $quote) {
                $in_string = 0;
            }
            $index++;
            next;
        }

        if ($char eq '/' && $next eq '/') {
            $line_comment = 1;
            $index += 2;
            next;
        }
        if ($char eq '/' && $next eq '*') {
            $block_comment = 1;
            $index += 2;
            next;
        }
        if ($char eq "'" || $char eq '"') {
            $in_string = 1;
            $quote = $char;
            $index++;
            next;
        }

        if ($char eq '{') {
            $brace_depth++;
        } elsif ($char eq '}') {
            $brace_depth-- if $brace_depth > 0;
        } elsif ($char eq '[') {
            $bracket_depth++;
        } elsif ($char eq ']') {
            $bracket_depth-- if $bracket_depth > 0;
        } elsif ($char eq '(') {
            $paren_depth++;
        } elsif ($char eq ')') {
            $paren_depth-- if $paren_depth > 0;
        } elsif ($char eq ',' && $brace_depth == 0 && $bracket_depth == 0 && $paren_depth == 0) {
            my $entry = trim(substr($array_content, $start, $index - $start));
            push @entries, $entry if $entry ne '';
            $start = $index + 1;
        }

        $index++;
    }

    my $last_entry = trim(substr($array_content, $start));
    push @entries, $last_entry if $last_entry ne '';
    return @entries;
}

sub trim {
    my ($value) = @_;
    $value =~ s/^\s+//;
    $value =~ s/\s+$//;
    return $value;
}

sub plugin_name_from_entry {
    my ($entry) = @_;
    if ($entry =~ /"name"\s*:\s*"((?:\\.|[^"\\])*)"/s) {
        my $name = $1;
        $name =~ s{\\/}{/}g;
        return $name;
    }
    if ($entry =~ /'name'\s*:\s*'((?:\\.|[^'\\])*)'/s) {
        my $name = $1;
        $name =~ s{\\/}{/}g;
        return $name;
    }
    return '';
}

sub json_escape {
    my ($value) = @_;
    $value = '' unless defined $value;
    $value =~ s/\\/\\\\/g;
    $value =~ s/"/\\"/g;
    $value =~ s/\r/\\r/g;
    $value =~ s/\n/\\n/g;
    $value =~ s/\t/\\t/g;
    return $value;
}

sub new_plugin_entry_json {
    my ($name, $description) = @_;
    return '{"name":"' . json_escape($name) . '","status":true,"description":"' . json_escape($description) . '","parameters":{}}';
}

my ($content, $file_encoding, $file_bom) = read_plugins_file($file);

my ($open_index, $close_index, $array_content) = find_plugins_array_literal($content);
my @entries = split_plugins_array_entries($array_content);

my @desired = ();
push @desired, [$diagnostics_name, 'Dev diagnostics hooks for live-translator']
    if defined $include_diagnostics && $include_diagnostics eq 'true';
push @desired, [$plugin_name, 'Entry point for the live translation system'];
push @desired, [$snapshot_name, 'Snapshot capture and validation harness']
    if $profile eq 'snapshot';

my @remove = ($legacy_name);
push @remove, $diagnostics_name
    unless defined $include_diagnostics && $include_diagnostics eq 'true';
push @remove, $snapshot_name
    unless $profile eq 'snapshot';

my %desired_names = map { lc($_->[0]) => 1 } grep { defined $_->[0] && $_->[0] ne '' } @desired;
my %remove_names = map { lc($_) => 1 } grep { defined $_ && $_ ne '' } @remove;
my %existing_desired_entries = ();
my @kept_entries = ();
my @managed_entries = ();
my @added_names = ();
my @removed_names = ();

for my $entry (@entries) {
    my $entry_name = plugin_name_from_entry($entry);
    my $key = lc($entry_name);

    if ($entry_name ne '' && $remove_names{$key}) {
        push @removed_names, $entry_name;
        next;
    }

    if ($entry_name ne '' && $desired_names{$key}) {
        if (exists $existing_desired_entries{$key}) {
            push @removed_names, $entry_name;
            next;
        }
        $existing_desired_entries{$key} = $entry;
        next;
    }

    push @kept_entries, $entry;
}

for my $plugin (@desired) {
    my ($name, $description) = @$plugin;
    next unless defined $name && $name ne '';

    my $key = lc($name);
    if (exists $existing_desired_entries{$key}) {
        push @managed_entries, $existing_desired_entries{$key};
    } else {
        push @managed_entries, new_plugin_entry_json($name, $description);
        push @added_names, $name;
    }
}

my @updated_entries = (@kept_entries, @managed_entries);
my $changed = @removed_names || @added_names || @entries != @updated_entries;
if (!$changed) {
    for (my $index = 0; $index < @entries; $index++) {
        if (trim($entries[$index]) ne trim($updated_entries[$index])) {
            $changed = 1;
            last;
        }
    }
}

if (!$changed) {
    print "UNCHANGED\t$file\n";
    exit 0;
}

my $backup = "$file.backup";
copy($file, $backup) or fail("Could not create backup $backup: $!");

my $newline = $content =~ /\r\n/ ? "\r\n" : "\n";
my $body = @updated_entries
    ? $newline . join(',' . $newline, map { '    ' . trim($_) } @updated_entries) . $newline
    : '';
my $updated_content = substr($content, 0, $open_index + 1) . $body . substr($content, $close_index);

my $tmp = "$file.tmp";
open my $output, '>:raw', $tmp or fail("Could not write $tmp: $!");
print {$output} encode_plugins_file($updated_content, $file_encoding, $file_bom);
close $output or fail("Could not finish writing $tmp: $!");
rename $tmp, $file or fail("Could not replace $file: $!");

print "BACKUP\t$backup\n";
print "ADDED\t$_\n" for @added_names;
print "REMOVED\t$_\n" for @removed_names;
PERL
    then
        rm -f "$sync_output_file"
        echo -e "\033[31mError: Unable to sync plugin entries in $plugins_file\033[0m" >&2
        return 1
    fi

    while IFS= read -r line; do
        case "$line" in
            BACKUP${tab}*)
                created_plugins_backup=true
                echo -e "\033[36mBackup created: ${line#*$tab}\033[0m"
                ;;
            ADDED${tab}*)
                echo -e "\033[32mAdded managed plugin entry: ${line#*$tab}\033[0m"
                ;;
            REMOVED${tab}*)
                echo -e "\033[32mRemoved managed plugin entry: ${line#*$tab}\033[0m"
                ;;
            UNCHANGED${tab}*)
                echo -e "\033[33mManaged plugin entries already match $plugin_profile profile in ${line#*$tab}\033[0m"
                ;;
        esac
    done < "$sync_output_file"
    rm -f "$sync_output_file"
}

if [ "$plugin_profile" = "snapshot" ]; then
    echo -e "\033[36mSnapshot profile enables the standard live-translator plugin entry before the snapshot harness.\033[0m"
fi
sync_plugin_entries

echo -e "\033[32mRPG Maker Live Translator installed successfully!\033[0m"
if [ "$created_plugins_backup" = true ]; then
    echo -e "\033[36mA backup of the original plugins.js was created as plugins.js.backup\033[0m"
fi
