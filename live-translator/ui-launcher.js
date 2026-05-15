// Opens the translator monitor and precacher UI windows from the running game.
//
// The launcher owns public commands, default GUI launch, hotkeys, and game
// lifetime behavior. Window creation, URL construction, and screen geometry
// live in ui-launcher/window-support.js.
(() => {
    'use strict';

    const support = globalThis.LiveTranslatorUiLauncherSupport;
    if (!support || typeof support.createUiWindow !== 'function') {
        throw new Error('[LiveTranslatorUiLauncher] window support was not loaded before ui-launcher.js.');
    }

    const script = document.currentScript;
    const scriptUrl = script && script.src ? script.src : '';
    const runtimePaths = globalThis.LiveTranslatorPaths && typeof globalThis.LiveTranslatorPaths === 'object'
        ? globalThis.LiveTranslatorPaths
        : {};
    const supportUrl = runtimePaths.supportUrl || (scriptUrl ? new URL('.', scriptUrl).href : '');
    const supportPath = runtimePaths.supportPath || support.resolveSupportPath(script, scriptUrl);
    const guiState = globalThis.LiveTranslatorGuiState && typeof globalThis.LiveTranslatorGuiState === 'object'
        ? globalThis.LiveTranslatorGuiState
        : { translatorOpen: false, updatedAt: Date.now() };
    globalThis.LiveTranslatorGuiState = guiState;
    const testOptions = globalThis.__LiveTranslatorUiLauncherTestOptions && typeof globalThis.__LiveTranslatorUiLauncherTestOptions === 'object'
        ? globalThis.__LiveTranslatorUiLauncherTestOptions
        : {};
    const OPEN_CALLBACK_TIMEOUT_MS = support.normalizePositiveInteger(testOptions.openCallbackTimeoutMs, 4000);
    const DEFAULT_LAUNCH_RETRY_MS = support.normalizePositiveInteger(testOptions.defaultLaunchRetryMs, 1000);
    const windowContext = {
        supportUrl,
        supportPath,
        runtimePaths,
        guiState,
        openCallbackTimeoutMs: OPEN_CALLBACK_TIMEOUT_MS,
        setTranslatorOpen,
    };

    const windows = {
        precacher: support.createUiWindow({
            id: 'precacher',
            title: 'LiveTranslatorPrecacher',
            file: 'precacher/index.html',
            width: 1040,
            height: 760,
            errorPrefix: '[LiveTranslatorPrecacher]',
            closeWithGame: false,
            matchHotkey: (event) => {
                const key = String(event.key || '').toLowerCase();
                const code = String(event.code || '').toLowerCase();
                return key === 'p' || code === 'keyp';
            },
        }, windowContext),
        translator: support.createUiWindow({
            id: 'translator',
            title: 'LiveTranslatorGui',
            file: 'gui/index.html',
            width: 1100,
            height: 950,
            screenFit: {
                widthRatio: 0.25,
                heightRatio: 0.95,
                anchor: 'top-right',
            },
            errorPrefix: '[LiveTranslatorGui]',
            closeWithGame: true,
            defaultOpen: true,
            query: { closeWithGame: '1' },
            matchHotkey: (event) => {
                const key = String(event.key || '').toLowerCase();
                const code = String(event.code || '').toLowerCase();
                return key === 'enter' || code === 'enter' || code === 'numpadenter';
            },
        }, windowContext),
    };

    function setTranslatorOpen(open) {
        guiState.translatorOpen = open === true;
        guiState.updatedAt = Date.now();
    }

    function installHotkeys() {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
        document.addEventListener('keydown', (event) => {
            if (!event.ctrlKey || !event.shiftKey) return;
            if (support.isEditableTarget(event.target)) return;

            for (const entry of Object.values(windows)) {
                if (typeof entry.matchHotkey !== 'function' || !entry.matchHotkey(event)) continue;
                event.preventDefault();
                entry.open({ focus: true });
                return;
            }
        }, true);
    }

    function closeGameScopedWindows() {
        for (const entry of Object.values(windows)) {
            if (entry.closeWithGame) entry.close();
        }
    }

    function installLifecycleCloseHandlers() {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('pagehide', closeGameScopedWindows);
            window.addEventListener('beforeunload', closeGameScopedWindows);
            window.addEventListener('unload', closeGameScopedWindows);
        }

        try {
            if (globalThis.nw && nw.Window && typeof nw.Window.get === 'function') {
                const gameWindow = nw.Window.get();
                if (gameWindow && typeof gameWindow.on === 'function') {
                    gameWindow.on('closed', closeGameScopedWindows);
                }
            }
        } catch (_) {}
    }

    function launchDefaultWindows() {
        const defaultEntries = Object.values(windows).filter((entry) => entry.defaultOpen);
        const launch = () => {
            let pending = false;
            for (const entry of defaultEntries) {
                if (typeof entry.openedOnce === 'function' && entry.openedOnce()) continue;
                if (typeof entry.isOpening === 'function' && entry.isOpening()) {
                    pending = true;
                    continue;
                }
                try {
                    entry.open({ focus: true });
                } catch (err) {
                    try { console.warn(`[LiveTranslatorUiLauncher] Default ${entry.id} launch failed:`, err); } catch (_) {}
                }
                if (typeof entry.openedOnce === 'function' && !entry.openedOnce()) {
                    pending = true;
                }
            }

            if (pending && defaultEntries.some((entry) => typeof entry.openedOnce !== 'function' || !entry.openedOnce())) {
                setTimeout(launch, DEFAULT_LAUNCH_RETRY_MS);
            }
        };

        if (typeof document !== 'undefined' && document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(launch, 0), { once: true });
            return;
        }
        setTimeout(launch, 0);
    }

    globalThis.LiveTranslatorPrecacher = {
        open: windows.precacher.open,
        close: windows.precacher.close,
        url: windows.precacher.url,
    };

    globalThis.LiveTranslatorGui = {
        open: windows.translator.open,
        close: windows.translator.close,
        isOpen: windows.translator.isOpen,
        url: windows.translator.url,
    };

    globalThis.LiveTranslatorUiLauncher = {
        openPrecacher: windows.precacher.open,
        closePrecacher: windows.precacher.close,
        openTranslator: windows.translator.open,
        closeTranslator: windows.translator.close,
        isTranslatorOpen: windows.translator.isOpen,
        urls: {
            precacher: windows.precacher.url,
            translator: windows.translator.url,
        },
    };

    installLifecycleCloseHandlers();
    installHotkeys();
    launchDefaultWindows();
})();
