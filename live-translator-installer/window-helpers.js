(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }

    const DRAW_STATE_KEYS = [
        'fontFace',
        'fontSize',
        'fontBold',
        'fontItalic',
        'fontUnderline',
        'fontGradient',
        'textColor',
        'outlineColor',
        'outlineWidth',
        'paintOpacity',
        'gradientType',
        'gradientColor1',
        'gradientColor2'
    ];

    function captureBitmapDrawState(bitmap) {
        if (!bitmap) return null;
        const state = {};
        let hasAny = false;
        for (const key of DRAW_STATE_KEYS) {
            const value = bitmap[key];
            if (value !== undefined) {
                state[key] = value;
                hasAny = true;
            }
        }
        return hasAny ? state : null;
    }

    function applyBitmapDrawState(bitmap, state) {
        if (!bitmap || !state) return;
        for (const key of DRAW_STATE_KEYS) {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                try { bitmap[key] = state[key]; } catch (_) {}
            }
        }
    }

    function generateKey(type, x, y, windowType = null, text = null) {
        if (windowType === 'Window_ChoiceList' && text) {
            const textHash = String(text).split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
            }, 0);
            return `${type},${x},${y},${Math.abs(textHash)}`;
        }
        return `${type},${x},${y}`;
    }

    function createWindowRegistryHelpers(context = {}) {
        const { windowRegistry, registeredWindows, contentsOwners } = context;
        if (!windowRegistry || !registeredWindows || !contentsOwners) {
            throw new Error('[WindowHelpers] Missing window registry references.');
        }

        function addWindowToRegistry(window, windowData) {
            windowData.windowType = window.constructor.name;
            windowData.registrationTime = Date.now();
            if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
            windowRegistry.set(window, windowData);
            registeredWindows.add(window);
            try {
                if (window && window.contents) {
                    contentsOwners.set(window.contents, window);
                    if (!window.contents._trWindowPipelineDepth) {
                        window.contents._trWindowPipelineDepth = 0;
                    }
                }
            } catch (_) {}
        }

        function ensureWindowRegistered(window) {
            let windowData = windowRegistry.get(window);
            if (!windowData) {
                window._uniqueId = window._uniqueId || Math.random().toString(36).substring(2, 11);
                windowData = { texts: new Map(), isOpen: true, pendingRedraws: new Map(), recentlyRedrawn: new Map() };
                addWindowToRegistry(window, windowData);
            } else if (!windowData.pendingRedraws) {
                windowData.pendingRedraws = new Map();
                if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
            }
            try {
                if (window && window.contents) {
                    contentsOwners.set(window.contents, window);
                    if (!window.contents._trWindowPipelineDepth) {
                        window.contents._trWindowPipelineDepth = 0;
                    }
                }
            } catch (_) {}
            return windowData;
        }

        return { addWindowToRegistry, ensureWindowRegistered };
    }

    globalScope.LiveTranslatorModules.windowHelpers = {
        captureBitmapDrawState,
        applyBitmapDrawState,
        generateKey,
        createWindowRegistryHelpers,
    };
})();
