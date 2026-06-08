// Shared lifecycle reason constants for adapter/runtime boundaries.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/lifecycle-reasons.js.');
    }

    const reasons = Object.freeze({
        CONTENTS_REPLACED: 'contents-replaced',
        NOT_CURRENT_SCENE: 'not-current-scene',
        SCENE_TERMINATED: 'scene-terminated',
        WINDOW_DESTROYED: 'window-destroyed',
        WINDOW_DETACHED: 'window-detached',
        WINDOW_OFFSCREEN: 'window-offscreen',
        WINDOW_STALE: 'window-stale',
        WINDOW_UNREGISTERED: 'window-unregistered',
        WINDOW_VISIBLE: 'window-visible',
    });

    defineRuntimeModule('runtime.lifecycleReasons', {
        reasons,
    });
})();
