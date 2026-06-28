// Provider clients for live translation.
//
// This composition module keeps the public provider API stable while the
// provider implementations live in runtime/translation-providers/*.js. Translation
// scheduling remains the translation manager's responsibility.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.translationProviders',
        requires: {
            utils: 'runtime.translationProviders.common',
            localProvider: 'runtime.translationProviders.local',
            deeplProvider: 'runtime.translationProviders.deepl',
            mockTranslatorProvider: 'runtime.translationProviders.mock',
            localProtocol: 'runtime.translationProviders.localProtocol',
        },
        factory({ utils, localProvider, deeplProvider, mockTranslatorProvider, localProtocol }) {
            const {
                getGlobalTranslatorConfig,
                isAbortErrorLike,
                normalizeDeepLConfig,
                normalizeLocalConfig,
                normalizeProviderName,
            } = utils;
            const { createLocalProvider } = localProvider;
            const { createDeepLProvider, createNoneProvider } = deeplProvider;
            const { createMockTranslatorProvider } = mockTranslatorProvider;
            const { createLocalModelMetadata, getLoadedLlmInstances, readParallelCapacityDetail, selectLocalChatModel } = localProtocol;

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
                if (providerName === 'mocktranslator') {
                    return createMockTranslatorProvider(options);
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
                createMockTranslatorProvider,
                createNoneProvider,
                normalizeLocalConfig,
                normalizeDeepLConfig,
                createLocalModelMetadata,
                readParallelCapacityDetail,
                getLoadedLlmInstances,
                selectLocalChatModel,
                isAbortErrorLike,
            };

            if (typeof module !== 'undefined' && module.exports) {
                module.exports = api;
            }
            return api;
        },
    });
})();
