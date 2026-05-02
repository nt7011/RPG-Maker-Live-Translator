// Opens the translator monitor and precacher UI windows from the running game.
// It owns the default GUI launch, hotkeys, and window lifetime behavior without depending on translation internals.
(() => {
    'use strict';

    const script = document.currentScript;
    const scriptUrl = script && script.src ? script.src : '';
    const runtimePaths = globalThis.LiveTranslatorPaths && typeof globalThis.LiveTranslatorPaths === 'object'
        ? globalThis.LiveTranslatorPaths
        : {};
    const supportUrl = runtimePaths.supportUrl || (scriptUrl ? new URL('.', scriptUrl).href : '');
    const supportPath = runtimePaths.supportPath || resolveSupportPath();
    const guiState = globalThis.LiveTranslatorGuiState && typeof globalThis.LiveTranslatorGuiState === 'object'
        ? globalThis.LiveTranslatorGuiState
        : { translatorOpen: false, updatedAt: Date.now() };
    globalThis.LiveTranslatorGuiState = guiState;

    const windows = {
        precacher: createUiWindow({
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
        }),
        translator: createUiWindow({
            id: 'translator',
            title: 'LiveTranslatorGui',
            file: 'gui/index.html',
            width: 1100,
            height: 920,
            errorPrefix: '[LiveTranslatorGui]',
            closeWithGame: true,
            defaultOpen: true,
            query: { closeWithGame: '1' },
            matchHotkey: (event) => {
                const key = String(event.key || '').toLowerCase();
                const code = String(event.code || '').toLowerCase();
                return key === 'enter' || code === 'enter' || code === 'numpadenter';
            },
        }),
    };

    function resolveSupportPath() {
        try {
            const req = typeof require === 'function' ? require : null;
            if (!req) return '';
            const path = req('path');
            const rawSrc = script && typeof script.getAttribute === 'function'
                ? (script.getAttribute('src') || scriptUrl)
                : scriptUrl;
            if (!rawSrc) return '';

            const launcherUrl = new URL(rawSrc, window.location.href);
            let resolvedPath = decodeURIComponent(new URL('.', launcherUrl.href).pathname || '');
            resolvedPath = resolvedPath.replace(/^\/+/u, '');
            resolvedPath = resolvedPath.replace(/\//gu, path.sep);

            if (/^[A-Za-z]:[\\/]/u.test(resolvedPath)) return path.normalize(resolvedPath);
            return path.resolve(process.cwd(), resolvedPath);
        } catch (_) {
            return '';
        }
    }

    function createUiUrl(file, query = {}) {
        if (!supportUrl) return '';
        const url = new URL(file, supportUrl);
        if (supportPath) url.searchParams.set('supportPath', supportPath);
        if (runtimePaths.gameRoot) url.searchParams.set('gameRoot', runtimePaths.gameRoot);
        if (runtimePaths.translationCacheFile) url.searchParams.set('translationCacheFile', runtimePaths.translationCacheFile);
        if (runtimePaths.precacheLogFile) url.searchParams.set('precacheLogFile', runtimePaths.precacheLogFile);
        for (const [key, value] of Object.entries(query || {})) {
            url.searchParams.set(key, String(value));
        }
        return url.href;
    }

    function isClosedWindow(win) {
        try {
            return !win || win.closed === true;
        } catch (_) {
            return true;
        }
    }

    function setTranslatorOpen(open) {
        guiState.translatorOpen = open === true;
        guiState.updatedAt = Date.now();
        try {
            const tracker = globalThis.LiveTranslatorTextTracker;
            if (tracker && typeof tracker.setGuiActive === 'function') {
                tracker.setGuiActive(guiState.translatorOpen);
            }
        } catch (_) {}
    }

    function createUiWindow(config) {
        const uiUrl = createUiUrl(config.file, config.query);
        let openedWindow = null;
        let opening = false;

        function markOpen(open) {
            if (config.id === 'translator') setTranslatorOpen(open);
        }

        function focusExistingWindow() {
            try {
                if (isClosedWindow(openedWindow)) {
                    openedWindow = null;
                    markOpen(false);
                    return false;
                }
                markOpen(true);
                if (typeof openedWindow.focus === 'function') openedWindow.focus();
                return true;
            } catch (_) {
                openedWindow = null;
                markOpen(false);
                return false;
            }
        }

        function rememberOpenedWindow(opened) {
            opening = false;
            openedWindow = opened || null;
            markOpen(!isClosedWindow(openedWindow));
            if (openedWindow && typeof openedWindow.on === 'function') {
                openedWindow.on('closed', () => {
                    openedWindow = null;
                    markOpen(false);
                });
            }
        }

        function open(options = {}) {
            if (!uiUrl) {
                throw new Error(`${config.errorPrefix} Unable to resolve UI URL.`);
            }
            if (focusExistingWindow() || opening) return;

            opening = true;
            const shouldFocus = options.focus !== false;
            const windowOptions = {
                width: config.width,
                height: config.height,
                position: 'center',
                focus: shouldFocus,
            };

            if (globalThis.nw && nw.Window && typeof nw.Window.open === 'function') {
                nw.Window.open(uiUrl, windowOptions, rememberOpenedWindow);
                return;
            }

            openedWindow = window.open(uiUrl, config.title, `width=${config.width},height=${config.height}`);
            opening = false;
            markOpen(!isClosedWindow(openedWindow));
        }

        function close() {
            const win = openedWindow;
            openedWindow = null;
            opening = false;
            markOpen(false);
            try {
                if (isClosedWindow(win)) return;
                if (typeof win.close === 'function') win.close(true);
            } catch (_) {}
        }

        function isOpen() {
            if (isClosedWindow(openedWindow)) {
                openedWindow = null;
                markOpen(false);
                return false;
            }
            markOpen(true);
            return true;
        }

        return {
            id: config.id,
            url: uiUrl,
            defaultOpen: !!config.defaultOpen,
            closeWithGame: !!config.closeWithGame,
            matchHotkey: config.matchHotkey,
            isOpen,
            open,
            close,
        };
    }

    function isEditableTarget(target) {
        if (!target) return false;
        const tag = String(target.tagName || '').toLowerCase();
        return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
    }

    function installHotkeys() {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
        document.addEventListener('keydown', (event) => {
            if (!event.ctrlKey || !event.shiftKey) return;
            if (isEditableTarget(event.target)) return;

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
        const launch = () => {
            for (const entry of Object.values(windows)) {
                if (!entry.defaultOpen) continue;
                try {
                    entry.open({ focus: true });
                } catch (err) {
                    try { console.warn(`[LiveTranslatorUiLauncher] Default ${entry.id} launch failed:`, err); } catch (_) {}
                }
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
