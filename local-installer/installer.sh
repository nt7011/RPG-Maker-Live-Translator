#!/bin/bash

# NOTE: Windows/PowerShell is the active development path. Keep this script in
# step with installer.ps1 so release archives have the same layout contract.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
default_root="$(cd "${script_dir}/.." && pwd)"
game_root="$default_root"
runtime_source="${default_root}/live-translator"

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
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

game_root="$(cd "$game_root" && pwd)"
runtime_source="$(cd "$runtime_source" && pwd)"
manifest_path="${runtime_source}/install-manifest.json"

json_string() {
    local key="$1"
    sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$manifest_path" | head -n 1
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
for pkg_path in "package.json" "www/package.json"; do
    full_pkg="${game_root}/${pkg_path}"
    if [ ! -f "$full_pkg" ]; then
        continue
    fi
    handled_any=true
    if grep -q '"name"[[:space:]]*:[[:space:]]*""' "$full_pkg" 2>/dev/null; then
        echo -e "\033[33mFound empty name field in $pkg_path, setting to 'Game'\033[0m"
        sed -i.backup 's/"name"[[:space:]]*:[[:space:]]*""/"name": "Game"/' "$full_pkg"
        echo -e "\033[32mUpdated name field to 'Game' in $pkg_path\033[0m"
    elif grep -q '"name"[[:space:]]*:' "$full_pkg" 2>/dev/null; then
        name_value="$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$full_pkg" | sed 's/.*"\([^"]*\)".*/\1/')"
        echo -e "\033[36m$pkg_path name field is already set to: '$name_value'\033[0m"
    else
        echo -e "\033[36mNo empty name field found in $pkg_path (leaving file unchanged)\033[0m"
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

if [ ! -f "$plugins_file" ]; then
    echo -e "\033[31mError: $plugins_file not found\033[0m"
    exit 1
fi

plugin_entry_regex="$(escape_regex "$plugin_entry_name")"
legacy_entry_regex="$(escape_regex "$legacy_plugin_entry_name")"
created_plugins_backup=false

if grep -Eq "\"name\"[[:space:]]*:[[:space:]]*\"${plugin_entry_regex}\"" "$plugins_file"; then
    echo -e "\033[33mPlugin entry already exists in $plugins_file\033[0m"
elif grep -Eq "\"name\"[[:space:]]*:[[:space:]]*\"${legacy_entry_regex}\"" "$plugins_file"; then
    cp "$plugins_file" "$plugins_file.backup"
    created_plugins_backup=true
    replacement_name="$(escape_sed_replacement "$plugin_entry_name")"
    sed -E "0,/\"name\"[[:space:]]*:[[:space:]]*\"${legacy_entry_regex}\"/s//\"name\":\"${replacement_name}\"/" "$plugins_file" > "$plugins_file.tmp"
    mv "$plugins_file.tmp" "$plugins_file"
    echo -e "\033[32mUpdated plugin entry to $plugin_entry_name in $plugins_file\033[0m"
else
    cp "$plugins_file" "$plugins_file.backup"
    created_plugins_backup=true
    entry="{\"name\":\"${plugin_entry_name}\",\"status\":true,\"description\":\"Entry point for the live translation system\",\"parameters\":{}},"
    replacement_entry="$(escape_sed_replacement "$entry")"
    if sed -E "0,/\[/s//[${replacement_entry}/" "$plugins_file" > "$plugins_file.tmp"; then
        mv "$plugins_file.tmp" "$plugins_file"
        echo -e "\033[32mPlugin entry added to $plugins_file\033[0m"
    else
        rm -f "$plugins_file.tmp"
        echo -e "\033[33mWarning: Unable to inject plugin entry into $plugins_file automatically\033[0m"
    fi
fi

echo -e "\033[32mRPG Maker Live Translator installed successfully!\033[0m"
if [ "$created_plugins_backup" = true ]; then
    echo -e "\033[36mA backup of the original plugins.js was created as plugins.js.backup\033[0m"
fi
