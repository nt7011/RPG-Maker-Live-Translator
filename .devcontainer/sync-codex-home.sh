#!/usr/bin/env bash
set -euo pipefail

persisted_codex_home="/root/.codex-persist"
runtime_codex_home="/root/.codex"

mkdir -p "$persisted_codex_home" "$runtime_codex_home"

for path in auth.json config.toml; do
  rm -rf "$runtime_codex_home/$path"
  ln -s "$persisted_codex_home/$path" "$runtime_codex_home/$path"
done

# Keep runtime temp files on the container filesystem so helper binaries remain executable.
rm -rf "$runtime_codex_home/tmp"
mkdir -p "$runtime_codex_home/tmp"
chmod 700 "$runtime_codex_home/tmp"
