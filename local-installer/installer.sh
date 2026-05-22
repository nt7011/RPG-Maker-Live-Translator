#!/bin/bash

# NOTE: Windows/PowerShell is the active development path. Keep this script in
# step with installer.ps1 so release archives have the same layout contract.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
default_root="$(cd "${script_dir}/.." && pwd)"
game_root="$default_root"
runtime_source="${default_root}/live-translator"
snapshot_source=""
plugin_profile="debug"

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
if [ -n "$snapshot_source" ]; then
    snapshot_source="$(cd "$snapshot_source" && pwd)"
elif [ "$plugin_profile" = "snapshot" ]; then
    snapshot_candidate="$(cd "$(dirname "$runtime_source")" && pwd)/snapshot"
    if [ -d "$snapshot_candidate" ]; then
        snapshot_source="$(cd "$snapshot_candidate" && pwd)"
    fi
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
    sed -n "/\"${key}\"[[:space:]]*:/,/]/p" "$manifest_path" \
        | sed -n 's/^[[:space:]]*"\([^"]*\)"[[:space:]]*,\{0,1\}[[:space:]]*$/\1/p'
}

escape_regex() {
    printf '%s' "$1" | sed 's/[][\\.^$*+?{}|()]/\\&/g'
}

escape_sed_replacement() {
    printf '%s' "$1" | sed 's/[\/&]/\\&/g'
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

    printf '%s-%s%s' "$safe_base" "$timestamp" "$millis"
}

resolve_settings_source() {
    local local_settings="${script_dir}/settings.local.json"
    local release_settings="${runtime_source}/config-templates/settings.release.json"

    if [ -f "$local_settings" ]; then
        settings_source_path="$local_settings"
        settings_source_label="local-installer/settings.local.json"
        return 0
    fi

    if [ -f "$release_settings" ]; then
        settings_source_path="$release_settings"
        settings_source_label="live-translator/config-templates/settings.release.json"
        return 0
    fi

    echo -e "\033[31mError: Could not find installer settings source. Checked $local_settings and $release_settings\033[0m" >&2
    exit 1
}

install_settings_file() {
    # settings.json is environment-specific, so install it explicitly instead
    # of depending on a file bundled inside the shared runtime tree.
    resolve_settings_source
    cp "$settings_source_path" "${support_dir}/settings.json"
    echo -e "\033[36mInstalled settings.json from ${settings_source_label}\033[0m"
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
    cp -R "${snapshot_source}/." "$snapshot_dir/"
    echo -e "\033[36mInstalled optional snapshot plugin to $snapshot_dir\033[0m"
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
            cp "$full_pkg" "${full_pkg}.backup"
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
cp -R "${runtime_source}/." "$support_dir/"
echo -e "\033[33mCopied live-translator runtime bundle to $support_dir\033[0m"
install_optional_snapshot_plugin
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

ensure_plugins_backup() {
    if [ "$created_plugins_backup" = false ]; then
        cp "$plugins_file" "$plugins_file.backup"
        created_plugins_backup=true
    fi
}

plugin_entry_exists() {
    local name="$1"
    local regex
    regex="$(escape_regex "$name")"
    grep -Eq "\"name\"[[:space:]]*:[[:space:]]*\"${regex}\"" "$plugins_file"
}

remove_plugin_entry() {
    local name="$1"
    local regex
    regex="$(escape_regex "$name")"
    if ! plugin_entry_exists "$name"; then
        return 0
    fi

    ensure_plugins_backup
    sed -E "/\"name\"[[:space:]]*:[[:space:]]*\"${regex}\"/d" "$plugins_file" > "$plugins_file.tmp"
    mv "$plugins_file.tmp" "$plugins_file"
    echo -e "\033[32mRemoved managed plugin entry: $name\033[0m"
}

add_plugin_entry() {
    local name="$1"
    local description="$2"
    if plugin_entry_exists "$name"; then
        echo -e "\033[33mPlugin entry already exists in $plugins_file: $name\033[0m"
        return 0
    fi

    ensure_plugins_backup
    entry="{\"name\":\"${name}\",\"status\":true,\"description\":\"${description}\",\"parameters\":{}},"
    replacement_entry="$(escape_sed_replacement "$entry")"
    if sed -E "0,/\[/s//[${replacement_entry}/" "$plugins_file" > "$plugins_file.tmp"; then
        mv "$plugins_file.tmp" "$plugins_file"
        echo -e "\033[32mPlugin entry added to $plugins_file: $name\033[0m"
    else
        rm -f "$plugins_file.tmp"
        echo -e "\033[33mWarning: Unable to inject plugin entry into $plugins_file automatically\033[0m"
    fi
}

if [ "$plugin_profile" = "snapshot" ]; then
    echo -e "\033[36mSnapshot profile enables the standard live-translator plugin entry before the snapshot harness.\033[0m"
    remove_plugin_entry "$legacy_plugin_entry_name"
    add_plugin_entry "$snapshot_plugin_entry_name" "Snapshot capture and validation harness"
    add_plugin_entry "$plugin_entry_name" "Entry point for the live translation system"
else
    remove_plugin_entry "$snapshot_plugin_entry_name"
    remove_plugin_entry "$legacy_plugin_entry_name"
    add_plugin_entry "$plugin_entry_name" "Entry point for the live translation system"
fi

echo -e "\033[32mRPG Maker Live Translator installed successfully!\033[0m"
if [ "$created_plugins_backup" = true ]; then
    echo -e "\033[36mA backup of the original plugins.js was created as plugins.js.backup\033[0m"
fi
