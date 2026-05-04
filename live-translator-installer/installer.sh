#!/bin/bash

# NOTE: Windows installer is the active path; keep this script as a reference only for now.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
game_root="$(cd "${script_dir}/.." && pwd)"
manifest_path="${script_dir}/install-manifest.json"

json_string() {
    local key="$1"
    sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$manifest_path" | head -n 1
}

json_array() {
    local key="$1"
    sed -n "/\"${key}\"[[:space:]]*:/,/]/p" "$manifest_path" \
        | sed -n 's/^[[:space:]]*"\([^"]*\)"[[:space:]]*,\{0,1\}[[:space:]]*$/\1/p'
}

copy_support_entry() {
    local rel="$1"
    local source="${script_dir}/${rel}"
    local destination="${support_dir}/${rel}"

    if [ ! -e "$source" ]; then
        echo -e "\033[31mManifest entry missing from installer: $rel\033[0m"
        exit 1
    fi

    mkdir -p "$(dirname "$destination")"
    if [ -d "$source" ]; then
        mkdir -p "$destination"
        cp -R "$source/." "$destination/"
    else
        cp "$source" "$destination"
    fi
    echo -e "\033[33mCopied $rel into support directory\033[0m"
}

remove_obsolete_entry() {
    local rel="$1"
    local target="${support_dir}/${rel}"

    if [ -e "$target" ] || [ -L "$target" ]; then
        rm -f "$target"
        echo -e "\033[36mRemoved obsolete support path $rel\033[0m"
    fi
}

if [ ! -f "$manifest_path" ]; then
    echo -e "\033[31mError: install-manifest.json not found at $manifest_path\033[0m"
    exit 1
fi

support_name="$(json_string supportDirectory)"
loader_name="$(json_string loader)"
settings_dev="$(json_string developmentSource)"
settings_release="$(json_string releaseSource)"
settings_destination="$(json_string destination)"

if [ -z "$support_name" ] || [ -z "$loader_name" ]; then
    echo -e "\033[31mError: install-manifest.json is missing supportDirectory or loader\033[0m"
    exit 1
fi

for required_array in files loaderHelpers scriptLoadOrder requiredAssets; do
    if [ -z "$(json_array "$required_array")" ]; then
        echo -e "\033[31mError: install-manifest.json is missing $required_array\033[0m"
        exit 1
    fi
done

echo -e "\033[32mInstalling RPG Maker Live Translator...\033[0m"

pushd "$game_root" > /dev/null

handled_any=false
for PKG_PATH in "package.json" "www/package.json"; do
  if [ ! -f "$PKG_PATH" ]; then
    continue
  fi
  handled_any=true
  if grep -q '"name"[[:space:]]*:[[:space:]]*""' "$PKG_PATH" 2>/dev/null; then
      echo -e "\033[33mFound empty name field in $PKG_PATH, setting to 'Game'\033[0m"
      sed -i.backup 's/"name"[[:space:]]*:[[:space:]]*""/"name": "Game"/' "$PKG_PATH"
      echo -e "\033[32mUpdated name field to 'Game' in $PKG_PATH\033[0m"
  elif grep -q '"name"[[:space:]]*:' "$PKG_PATH" 2>/dev/null; then
      NAME_VALUE=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$PKG_PATH" | sed 's/.*"\([^"]*\)".*/\1/')
      echo -e "\033[36m$PKG_PATH name field is already set to: '$NAME_VALUE'\033[0m"
  else
      echo -e "\033[33mNo name field found in $PKG_PATH (leaving file unchanged)\033[0m"
  fi
done

if [ "$handled_any" = false ]; then
  echo -e "\033[33mpackage.json not found - this is normal for some RPG Maker versions\033[0m"
fi

PLUGINS_DIR=""
PLUGINS_FILE=""

if [ -d "www/js/plugins" ]; then
    PLUGINS_DIR="www/js/plugins"
    PLUGINS_FILE="www/js/plugins.js"
    echo -e "\033[36mDetected www/js/plugins folder structure\033[0m"
elif [ -d "js/plugins" ]; then
    PLUGINS_DIR="js/plugins"
    PLUGINS_FILE="js/plugins.js"
    echo -e "\033[36mDetected js/plugins folder structure\033[0m"
else
    echo -e "\033[31mError: Could not find js/plugins or www/js/plugins directory\033[0m"
    echo -e "\033[33mPlease run this installer from your RPG Maker game's root directory\033[0m"
    popd > /dev/null
    exit 1
fi

loader_path="${script_dir}/${loader_name}"

if [ ! -f "$loader_path" ]; then
    echo -e "\033[31mError: $loader_name not found at $loader_path\033[0m"
    popd > /dev/null
    exit 1
fi

cp "$loader_path" "$PLUGINS_DIR/$loader_name"
echo -e "\033[33mLoader file copied successfully to $PLUGINS_DIR\033[0m"

support_dir="$PLUGINS_DIR/$support_name"
case "$support_dir" in
    "$PLUGINS_DIR"/*) ;;
    *)
        echo -e "\033[31mRefusing to use unexpected support directory: $support_dir\033[0m"
        popd > /dev/null
        exit 1
        ;;
esac

if [ ! -d "$support_dir" ]; then
    mkdir -p "$support_dir"
    echo -e "\033[36mCreated plugin support directory at $support_dir\033[0m"
else
    echo -e "\033[36mUsing existing plugin support directory at $support_dir\033[0m"
fi

while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    copy_support_entry "$entry"
done < <(json_array files)

settings_source="${script_dir}/${settings_dev}"
settings_source_name="local settings.json"
if [ ! -f "$settings_source" ]; then
    settings_source="${script_dir}/${settings_release}"
    settings_source_name="release settings template"
fi
if [ ! -f "$settings_source" ]; then
    echo -e "\033[31mError: no settings source found. Expected local settings.json or release template.\033[0m"
    popd > /dev/null
    exit 1
fi
cp "$settings_source" "$support_dir/$settings_destination"
echo -e "\033[33mCopied $settings_source_name to $settings_destination\033[0m"

while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    remove_obsolete_entry "$entry"
done < <(json_array obsolete)

created_plugins_backup=false
if [ -f "$PLUGINS_FILE" ]; then
    if grep -q "$loader_name" "$PLUGINS_FILE"; then
        echo -e "\033[33mPlugin entry already exists in $PLUGINS_FILE\033[0m"
    else
        echo -e "\033[33mAdding plugin entry to $PLUGINS_FILE...\033[0m"

        cp "$PLUGINS_FILE" "$PLUGINS_FILE.backup"
        created_plugins_backup=true
        echo -e "\033[36mBackup created: $PLUGINS_FILE.backup\033[0m"

        entry='{"name":"live-translator-loader","status":true,"description":"Entry point for the live translation system","parameters":{}},'
        if sed -E "0,/\[/s//[${entry}/" "$PLUGINS_FILE" > "$PLUGINS_FILE.tmp"; then
            mv "$PLUGINS_FILE.tmp" "$PLUGINS_FILE"
            echo -e "\033[32mPlugin entry added to $PLUGINS_FILE\033[0m"
        else
            rm -f "$PLUGINS_FILE.tmp"
            echo -e "\033[33mWarning: Unable to inject plugin entry into $PLUGINS_FILE automatically\033[0m"
        fi
    fi
else
    echo -e "\033[31mError: $PLUGINS_FILE not found\033[0m"
    popd > /dev/null
    exit 1
fi

popd > /dev/null

echo -e "\033[32mRPG Maker Live Translator installed successfully!\033[0m"
if [ "$created_plugins_backup" = true ]; then
    echo -e "\033[36mA backup of the original plugins.js was created as plugins.js.backup\033[0m"
fi
