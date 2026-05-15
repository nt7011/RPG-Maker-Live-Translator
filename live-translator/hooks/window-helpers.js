// Window helper composition module.
// Hook installers use this public facade for bitmap draw state, text scaling,
// stable text keys, and Window-to-Bitmap registry ownership.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks) {
        globalScope.LiveTranslatorModules.hooks = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/window-helpers.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before hooks/window-helpers.js.');
    }

    const textScale = requireRuntimeModule('hooks.windowTextScale');
    const registry = requireRuntimeModule('hooks.windowRegistryHelpers');
    const {
        captureBitmapDrawState,
        applyBitmapDrawState,
        normalizeTextScalePercent,
        resolveTextScalePercent,
        scaleBitmapDrawState,
        scaleFontSizeValue,
        createWindowTextScaleScope,
    } = textScale;
    const { createWindowRegistryHelpers } = registry;

    function generateKey(type, x, y, windowType = null, text = null) {
        const base = `${type},${x},${y}`;
        const textValue = String(text ?? '').trim();
        return textValue ? `${base},${hashTextForKey(textValue)}` : base;
    }

    function hashTextForKey(text) {
        const value = String(text || '');
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    const windowHelpers = {
        captureBitmapDrawState,
        applyBitmapDrawState,
        normalizeTextScalePercent,
        resolveTextScalePercent,
        scaleBitmapDrawState,
        scaleFontSizeValue,
        createWindowTextScaleScope,
        generateKey,
        createWindowRegistryHelpers,
    };

    defineRuntimeModule('hooks.windowHelpers', windowHelpers);
})();
