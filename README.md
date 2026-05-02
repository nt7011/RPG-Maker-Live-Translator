## Overview
RPG Maker MV / MZ addon to translate all text that gets drawn on the screen. Supported translators: DeepL (bring your own key) and local LLM.

Since RPG Maker is a scriptable platform, no implementation of a translator will work against every game. Chances are that many games will have subtle issues or won't work at all unless you debug yourself.

## Implementation
1. Tries to detect all kinds of texts being drawn on the screen and read its contents.
2. Asynchronously query translation.
3. When translations arrive, clear the corresponding text.
4. Draw the translation in its place with invisible unicode watermarks so that the process does not repeat. 
- This addon shouldn't affect the game's logic in any way. 
5. Translations are cached in disk.

## Prerequisites:
1. If the game is packed with Enigma Virtual Box, unpack it first.
2. (Required for some games) Update the game's included nw.js library. All RPGMV/MZ games ship with nwjs installations - sometimes with very outdated ones that will not work with this addon. https://nwjs.io/downloads/ - Extract all files to the game directory (where Game.exe is) and change the name of nwjs.exe to Game.exe. 

## Instructions (Browser based automated installer)
Visit https://nt7011.github.io/

## Instructions (Installer):
0. Currently the installer is broken for Unix systems. Use the browser installer.
1. Download all files and copy `live-translator-installer/` to the game's folder (where Game.exe resides).
2. Right-click `live-translator-installer/installer.ps1` → `Run with PowerShell`. If blocked, open up powershell console as administrator and run `Set-ExecutionPolicy Bypass -Scope LocalMachine`. If you're confused, ask ChatGPT.
3. Go to `js/plugins/` or `www/js/plugins` to edit `live-translator-installer/translator.json` for provider settings and `live-translator-installer/settings.json` for addon behavior. For DeepL, set `"provider": "deepl"`, configure `settings.deepl.language`, and paste your API key into `settings.deepl.apiKey`. To use LM Studio API (`GET /api/v1/models`), set `"provider": "local"` and modify the prompt. To disable new external translation requests and only reuse entries already present in `translation-cache.log`, set `"provider": "none"`. Default name `"auto"` works if only one model is loaded in LM Studio. Set `gameMessage.textScale` in `settings.json` to an integer from `1` to `100` to shrink translated `Game_Message` text; set `textScaleOthers` to shrink translated non-message window, sprite, and PIXI text. `100` disables resizing. The files in the `installer` folder are not active!

## Instructions (Manual):
1. Copy `live-translator-installer/live-translator-loader.js` to the `js/plugins/` folder and add an entry to `plugins.js`.
2. Copy `live-translator-installer` to the `js/plugins/` folder.
3. Inspect `package.json` and make sure `name` field is not empty.
3. Go to `js/plugins/` or `www/js/plugins` to edit `live-translator-installer/translator.json` for provider settings and `live-translator-installer/settings.json` for addon behavior. For DeepL, set `"provider": "deepl"`, configure `settings.deepl.language`, and paste your API key into `settings.deepl.apiKey`. To use LM Studio API (`GET /api/v1/models`), set `"provider": "local"` and modify the prompt. To disable new external translation requests and only reuse entries already present in `translation-cache.log`, set `"provider": "none"`. Default name `"auto"` works if only one model is loaded in LM Studio. Set `gameMessage.textScale` in `settings.json` to an integer from `1` to `100` to shrink translated `Game_Message` text; set `textScaleOthers` to shrink translated non-message window, sprite, and PIXI text. `100` disables resizing. The files in the `installer` folder are not active!

## Dev Environment and Troubleshooting (Recommended):
1. Install `nwjs debugger for VSCode` plugin - https://marketplace.visualstudio.com/items?itemName=ruakr.vsc-nwjs
2. Put the game inside `experimentation/` folder.
3. Use included `launch.json` configurations to launch nwjs debugging session.
4. Open up your vibecodingpromasterTM software of your choice because surely you're not manually debugging this 2000 line jank like what, some kind of a caveman.

To translate other languages than Chinese, Japanese, or Korean, set `"translation.disableCjkFilter": true` in `settings.json`.

## Precacher GUI (Beta)
After installing the plugin, press `Ctrl+Shift+P` in the game window or run `LiveTranslatorPrecacher.open()` from DevTools.
Extraction follows `settings.json` `translation.disableCjkFilter` and uses the same CJK gate as live translation.

## Changelog
1.0 - major refactor - performance and accuracy improvements, etc

1.1 - fix DeepL 429, fix installer messing up `plugins.json` encoding

1.7 - move to Gemma 4 and fix game dependent crashes

1.8 - fix bitmap redraw clearing out graphics

1.10 - fix longstanding errorneous bitmap clear problems

1.11 - fix non-CJK games (English) and add an option to resize game_message

1.12 - Game_Message rewrite. Should handle multiline texts correctly and just be more robust in general.

1.13 - LLM auto works if there's one and only model loaded in LM Studio

1.14 - translation provider: none disables the translation and relies on translation-cache.log

2.0 - finally fixed the longstanding overlapping text problem

2.1 - fix text styling update not applying correctly on redrawn texts

2.2 - max token count per request is configurable

2.3 - major cosmetic fixes. original texts are replaced cleanly. fixed ghost text problem in selectable lists 

3.0 - Add precacher

3.0.3 - harden GameMessage and invalid battlelog bitmaps detection/handling 

3.1 - bitmap text handling major breaking change

3.2 - new: sprite-text-hook - replaces most of the bitmap text handling. new GUI for diagnosis/status. add options: textScaleOthers, originAwareLineBreaks

![License](https://img.shields.io/badge/License-CC%20BY%204.0-blue.svg)
