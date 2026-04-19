#!/bin/bash

# NOTE: Windows installer is the active path; keep this script as a reference only for now.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
game_root="$(cd "${script_dir}/.." && pwd)"

echo -e "\033[32mInstalling Text Replacement Addon...\033[0m"

pushd "$game_root" > /dev/null

# Check and fix name field in both package.json and www/package.json
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

# Detect folder structure
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

loader_path="${script_dir}/live-translator-loader.js"

if [ ! -f "$loader_path" ]; then
    echo -e "\033[31mError: live-translator-loader.js not found at $loader_path\033[0m"
    popd > /dev/null
    exit 1
fi

cp "$loader_path" "$PLUGINS_DIR/live-translator-loader.js"
echo -e "\033[33mLoader file copied successfully to $PLUGINS_DIR\033[0m"

support_dir="$PLUGINS_DIR/live-translator"
mkdir -p "$support_dir"

while IFS= read -r -d '' file; do
    name="$(basename "$file")"
    cp "$file" "$support_dir/$name"
    echo -e "\033[33mCopied $name into $support_dir\033[0m"
done < <(find "$script_dir" -maxdepth 1 -type f \
    ! -name "live-translator-loader.js" \
    ! -name "install" \
    ! -name "installer.ps1" \
    ! -name "installer.sh" \
    -print0)

# Check if the plugin entry already exists in plugins.js
if [ -f "$PLUGINS_FILE" ]; then
    if grep -q "live-translator-loader" "$PLUGINS_FILE"; then
        echo -e "\033[33mPlugin entry already exists in $PLUGINS_FILE\033[0m"
    else
        echo -e "\033[33mAdding plugin entry to $PLUGINS_FILE...\033[0m"

        # Create a backup
        cp "$PLUGINS_FILE" "$PLUGINS_FILE.backup"
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

echo -e "\033[32mText Replacement Addon installed successfully!\033[0m"
echo -e "\033[36mA backup of the original plugins.js was created as plugins.js.backup\033[0m"
