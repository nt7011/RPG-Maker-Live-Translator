// Shared hook state and helper context builder.
// It creates the WeakMaps/Sets and helper references that let separate hook modules cooperate on the same windows.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function' || typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/hook-context.js.');
    }

    function resolveWindowHelpers() {
        return requireRuntimeModule('hooks.windowHelpers');
    }

    function resolveControlCodeHelpers() {
        return requireRuntimeModule('hooks.controlCodeHelpers');
    }

    defineRuntimeModule('runtime.hookContext', {
        createHookContext(options = {}) {
            const { textTracker = null } = options || {};
            const windowHelpers = resolveWindowHelpers();
            const controlCodeHelpers = resolveControlCodeHelpers();
            const windowRegistry = new WeakMap();
            const registeredWindows = new Set();
            const contentsOwners = new WeakMap();

            const { addWindowToRegistry, ensureWindowRegistered } = windowHelpers.createWindowRegistryHelpers({
                windowRegistry,
                registeredWindows,
                contentsOwners,
                textTracker,
            });

            return {
                windowHelpers,
                controlCodeHelpers,
                captureBitmapDrawState: windowHelpers.captureBitmapDrawState,
                applyBitmapDrawState: windowHelpers.applyBitmapDrawState,
                resolveTextScalePercent: windowHelpers.resolveTextScalePercent,
                scaleBitmapDrawState: windowHelpers.scaleBitmapDrawState,
                scaleFontSizeValue: windowHelpers.scaleFontSizeValue,
                createWindowTextScaleScope: windowHelpers.createWindowTextScaleScope,
                generateKey: windowHelpers.generateKey,
                stripRpgmEscapes: controlCodeHelpers.stripRpgmEscapes,
                prepareTextForTranslation: controlCodeHelpers.prepareTextForTranslation,
                restoreControlCodes: controlCodeHelpers.restoreControlCodes,
                windowRegistry,
                registeredWindows,
                contentsOwners,
                addWindowToRegistry,
                ensureWindowRegistered,
                REDRAW_SIGNATURE: '\u200B\u200C\u200D\u200B\u200C\u200D\uFEFF\u200B',
                PER_CHAR_MARK: '\u2060',
            };
        },
    });
})();
