// Runtime path context accessor.
// Loader resolves the game/support/log/cache locations once, and other modules read that shared context here.
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
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/paths.js.');
    }

    function clonePathContext(paths) {
        return Object.assign({}, paths && typeof paths === 'object' ? paths : {});
    }

    function getPathContext() {
        return clonePathContext(globalScope.LiveTranslatorPaths);
    }

    function setPathContext(paths) {
        const next = clonePathContext(paths);
        globalScope.LiveTranslatorPaths = next;
        return getPathContext();
    }

    function getPath(name) {
        const paths = getPathContext();
        return typeof paths[name] === 'string' ? paths[name] : '';
    }

    defineRuntimeModule('runtime.paths', {
        getPathContext,
        setPathContext,
        getPath,
    });
})();
