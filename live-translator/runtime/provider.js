// Provider-mode context builder.
// Bootstrap uses this to decide whether runtime translation should call a local model, DeepL, or cache-only behavior.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/provider.js.');
    }

    defineRuntimeModule('runtime.provider', {
        createProviderContext(options = {}) {
            const scope = options.scope || globalScope;
            const configModule = requireRuntimeModule('config');
            const activeProvider = configModule.getActiveProvider(scope);
            return {
                activeProvider,
                isLocalProvider: activeProvider === 'local',
                isCacheOnlyProvider: activeProvider === 'none',
            };
        },
    });
})();
