// Provider-mode context builder.
// Bootstrap uses this to decide whether runtime translation should call a local model, DeepL, or cache-only behavior.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.provider',
        requires: {
            configModule: 'runtime.config',
        },
        factory({ configModule }, { scope: runtimeScope }) {
            return {
                createProviderContext(options = {}) {
                    const scope = options.scope || runtimeScope;
                    const activeProvider = configModule.getActiveProvider(scope);
                    return {
                        activeProvider,
                        isLocalProvider: activeProvider === 'local',
                        isCacheOnlyProvider: activeProvider === 'none',
                    };
                },
            };
        },
    });
})();
