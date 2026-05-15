// Provider clients for live translation.
//
// This composition module keeps the public provider API stable while the
// provider implementations live in translator/providers/*.js. Translation
// scheduling remains the translation manager's responsibility.
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
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translator.js.');
    }

    const utils = requireModule('runtime.translationProviderUtils');
    const localProvider = requireModule('runtime.translationLocalProvider');
    const deeplProvider = requireModule('runtime.translationDeeplProvider');
    const localProtocol = requireModule('runtime.translationLocalProtocol');
    const {
        getGlobalTranslatorConfig,
        isAbortErrorLike,
        normalizeDeepLConfig,
        normalizeLocalConfig,
        normalizeProviderName,
    } = utils;
    const { createLocalProvider } = localProvider;
    const { createDeepLProvider, createNoneProvider } = deeplProvider;
    const { getLoadedLlmInstances, selectLocalChatModel } = localProtocol;

    function requireModule(name) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(name);
        }
        const modules = globalScope.LiveTranslatorModules || {};
        if (modules[name]) return modules[name];
        return String(name || '').split('.').reduce((current, part) => {
            return current && current[part] ? current[part] : null;
        }, modules);
    }

    function createProvider(options = {}) {
        const translatorConfig = options.translatorConfig || getGlobalTranslatorConfig();
        const providerName = normalizeProviderName(
            options.provider
            || (translatorConfig && translatorConfig.provider)
        );

        if (providerName === 'local') {
            return createLocalProvider(options);
        }
        if (providerName === 'deepl') {
            return createDeepLProvider(options);
        }
        if (providerName === 'none') {
            return createNoneProvider(options);
        }

        throw new Error(`translator.json contains unsupported provider "${providerName || '<empty>'}".`);
    }

    const api = {
        createProvider,
        createLocalProvider,
        createDeepLProvider,
        createNoneProvider,
        normalizeLocalConfig,
        normalizeDeepLConfig,
        getLoadedLlmInstances,
        selectLocalChatModel,
        isAbortErrorLike,
    };

    defineRuntimeModule('runtime.translationProviders', api);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
