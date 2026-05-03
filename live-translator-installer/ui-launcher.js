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
                applyWindowGeometry(openedWindow, resolveWindowGeometry(config));
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
            applyWindowGeometry(openedWindow, resolveWindowGeometry(config));
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
            const geometry = resolveWindowGeometry(config);
            const windowOptions = {
                width: geometry.width,
                height: geometry.height,
                focus: shouldFocus,
            };
            if (geometry.position) windowOptions.position = geometry.position;

            if (globalThis.nw && nw.Window && typeof nw.Window.open === 'function') {
                nw.Window.open(uiUrl, windowOptions, rememberOpenedWindow);
                return;
            }

            openedWindow = window.open(uiUrl, config.title, buildWindowFeatures(geometry));
            applyWindowGeometry(openedWindow, geometry);
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

    function resolveWindowGeometry(config) {
        const fallbackWidth = normalizePositiveInteger(config && config.width, 800);
        const fallbackHeight = normalizePositiveInteger(config && config.height, 600);
        const geometry = {
            width: fallbackWidth,
            height: fallbackHeight,
            x: null,
            y: null,
            position: 'center',
        };
        const screenFit = config && config.screenFit && typeof config.screenFit === 'object'
            ? config.screenFit
            : null;
        if (!screenFit) return geometry;

        const workArea = getCurrentScreenWorkArea();
        if (!workArea) return geometry;

        geometry.width = resolveRatioDimension(workArea.width, screenFit.widthRatio, fallbackWidth);
        geometry.height = resolveRatioDimension(workArea.height, screenFit.heightRatio, fallbackHeight);
        geometry.position = null;

        if (screenFit.anchor === 'top-right') {
            geometry.x = workArea.x + Math.max(0, workArea.width - geometry.width);
            geometry.y = workArea.y;
        }

        return geometry;
    }

    function resolveRatioDimension(available, ratio, fallback) {
        const availableSize = Number(available);
        const ratioValue = Number(ratio);
        if (!Number.isFinite(availableSize) || availableSize <= 0 || !Number.isFinite(ratioValue) || ratioValue <= 0) {
            return fallback;
        }
        return Math.max(1, Math.min(Math.round(availableSize), Math.round(availableSize * ratioValue)));
    }

    function getCurrentScreenWorkArea() {
        const nwWorkArea = getCurrentNwScreenWorkArea();
        if (nwWorkArea) return nwWorkArea;
        return getBrowserScreenWorkArea();
    }

    function getCurrentNwScreenWorkArea() {
        try {
            if (!globalThis.nw || !nw.Screen || typeof nw.Screen.Init !== 'function') return null;
            nw.Screen.Init();
            const screens = Array.isArray(nw.Screen.screens) ? nw.Screen.screens : [];
            if (!screens.length) return null;
            const currentBounds = getCurrentWindowBounds();
            const screen = findScreenForBounds(screens, currentBounds) || screens[0];
            return normalizeWorkArea(screen && (screen.work_area || screen.bounds));
        } catch (_) {
            return null;
        }
    }

    function getCurrentWindowBounds() {
        const x = firstFiniteNumber(globalThis.screenX, globalThis.screenLeft, 0);
        const y = firstFiniteNumber(globalThis.screenY, globalThis.screenTop, 0);
        const width = firstFiniteNumber(globalThis.outerWidth, globalThis.innerWidth, 1);
        const height = firstFiniteNumber(globalThis.outerHeight, globalThis.innerHeight, 1);
        return { x, y, width, height };
    }

    function findScreenForBounds(screens, bounds) {
        const centerX = bounds.x + (bounds.width / 2);
        const centerY = bounds.y + (bounds.height / 2);
        const containing = screens.find((screen) => pointInRect(centerX, centerY, screen.work_area || screen.bounds));
        if (containing) return containing;

        const best = screens
            .map((screen) => ({
                screen,
                overlap: getRectOverlap(bounds, screen.work_area || screen.bounds),
            }))
            .sort((a, b) => b.overlap - a.overlap)[0];
        return best ? best.screen : null;
    }

    function pointInRect(x, y, rect) {
        const area = normalizeWorkArea(rect);
        return !!(area
            && x >= area.x
            && y >= area.y
            && x < area.x + area.width
            && y < area.y + area.height);
    }

    function getRectOverlap(a, b) {
        const area = normalizeWorkArea(b);
        if (!area) return 0;
        const left = Math.max(a.x, area.x);
        const top = Math.max(a.y, area.y);
        const right = Math.min(a.x + a.width, area.x + area.width);
        const bottom = Math.min(a.y + a.height, area.y + area.height);
        return Math.max(0, right - left) * Math.max(0, bottom - top);
    }

    function normalizeWorkArea(area) {
        if (!area || typeof area !== 'object') return null;
        const x = firstFiniteNumber(area.x, area.left, 0);
        const y = firstFiniteNumber(area.y, area.top, 0);
        const width = firstFiniteNumber(area.width, area.w, 0);
        const height = firstFiniteNumber(area.height, area.h, 0);
        if (width <= 0 || height <= 0) return null;
        return {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
        };
    }

    function getBrowserScreenWorkArea() {
        try {
            const screenRef = globalThis.screen || {};
            const width = firstFiniteNumber(screenRef.availWidth, screenRef.width, 0);
            const height = firstFiniteNumber(screenRef.availHeight, screenRef.height, 0);
            if (width <= 0 || height <= 0) return null;
            return {
                x: Math.round(firstFiniteNumber(screenRef.availLeft, screenRef.left, 0)),
                y: Math.round(firstFiniteNumber(screenRef.availTop, screenRef.top, 0)),
                width: Math.round(width),
                height: Math.round(height),
            };
        } catch (_) {
            return null;
        }
    }

    function firstFiniteNumber(...values) {
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return 0;
    }

    function normalizePositiveInteger(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
    }

    function applyWindowGeometry(win, geometry) {
        if (!win || !geometry) return;
        try {
            if (typeof win.resizeTo === 'function') win.resizeTo(geometry.width, geometry.height);
        } catch (_) {}
        try {
            if (Number.isFinite(Number(geometry.x))
                && Number.isFinite(Number(geometry.y))
                && typeof win.moveTo === 'function') {
                win.moveTo(Math.round(Number(geometry.x)), Math.round(Number(geometry.y)));
            }
        } catch (_) {}
    }

    function buildWindowFeatures(geometry) {
        const features = [
            `width=${geometry.width}`,
            `height=${geometry.height}`,
        ];
        if (Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
            const x = Math.round(Number(geometry.x));
            const y = Math.round(Number(geometry.y));
            features.push(`left=${x}`, `top=${y}`, `screenX=${x}`, `screenY=${y}`);
        }
        return features.join(',');
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
