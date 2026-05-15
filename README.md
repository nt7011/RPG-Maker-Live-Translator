## Overview
RPG Maker MV / MZ Live Translator - Simply translates the text on the game screen (does its best).

Supports most games. Since RPG Maker is a scriptable platform, no implementation of a translator will work against every game. Chances are that some games will have subtle issues or won't work at all.

Intended to be used with LM Studio (but deepl API key support exists as well for users without a GPU - for now)

<p>
  <img src="docs-assets/demo-1.png" alt="Screenshot 1" width="49%">
  <img src="docs-assets/demo-2.png" alt="Screenshot 2" width="49%">
</p>

## How it works

1. Intercepts all kinds of text draw.
2. See if cached translation is available.
3. If not, asynchronous translation request is sent to the LLM.
4. When ready, fulfill the promise by clearing out the original and draw the translation in place.
5. Foresight: Tries to peek ahead of the dialogue and finds texts to pre-translate. Branching paths (user choices, if's) are supported.

## Web Installer
Simply visit https://nt7011.github.io/ with a Chromium browser and point the game folder. The rest the will be taken care of.

## Prerequisites:
1. If there's no `scripts/` in your game folder, it's probably been hidden inside `.exe` with Enigma Virtual Box. Unpack first. 
2. (Required for most games) Update the game's included nw.js library. All RPGMV/MZ games ship with nwjs installations - sometimes with very outdated ones that will not work with this addon. https://nwjs.io/downloads/ - Extract all files to the game directory (where Game.exe is) and change the name of nwjs.exe to Game.exe. 

## Alternative Installations

### Local Installer
- Run `powershell -ExecutionPolicy Bypass -File local-installer\installer.ps1 -GameRoot "C:\Path\To\Game"`. If the release folders are already copied next to `Game.exe`, `-GameRoot` can be omitted.

### Manual Installation
1. Copy `live-translator/` to `js/plugins/live-translator/` or `www/js/plugins/live-translator/`.
2. Copy `live-translator/config-templates/settings.release.json` to `js/plugins/live-translator/settings.json` or `www/js/plugins/live-translator/settings.json`.
3. Add an enabled `plugins.js` entry named `live-translator/live-translator-loader`.
4. Inspect `package.json` and make sure `name` field is not empty.

Then, go to `js/plugins/live-translator/` or `www/js/plugins/live-translator/` to edit `translator.json` for provider settings and `settings.json` for addon behavior.

## Settings

`"translation.disableCjkFilter": true`: Enables translation from non-CJK (Chinese, Japanese, and Korean) sources.

`"overrideTranslationRegex"`: Perform a static translation based on regex

`"substitutePlaintextBeforeTranslation"`: Replace things like names before feeding to the LLM.

`textScale` and `textScaleOthers`: Resizes the translation text

and more

## Translator GUI
The translator monitor opens automatically when the game starts. If you close it, press `Ctrl+Shift+Enter` in the game window or run `LiveTranslatorGui.open()` from DevTools.

## Precacher GUI (Beta)
After installing the plugin, press `Ctrl+Shift+P` in the game window or run `LiveTranslatorPrecacher.open()` from DevTools.
Extraction follows `settings.json` `translation.disableCjkFilter` and uses the same CJK gate as live translation.

## Recommended LLMs to Get Started

VRAM 8GB - mradermacher/gemma-4-E4B-it-ultra-uncensored-heretic-i1-GGUF@IQ4_XS

VRAM 16GB - mradermacher/gemma-4-26B-A4B-it-ultra-uncensored-heretic-i1-GGUF@IQ4_XS - barely fits but it's so good

Load the model in LM Studio, test token speed by writing some chat in it, and then enable the server in LM Studio. The settings should work as is. 

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

3.2.6 - text async redraw background clear correctness

3.2.7 - performance improvement (handles slow revealing sprite text better)

3.2.8 - errorneous translation abort hotfix

4.0 - Almost a complete rewrite: foresight support. compatibility improvements, batching, priority, performance optimizations, and more
