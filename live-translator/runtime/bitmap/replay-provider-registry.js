// Bitmap replay provider registry.
//
// Bitmap services expose replay capability across adapters, but the provider
// contract itself is independent of service orchestration. This registry owns
// validation, provider replacement/unregistration, safe replay method calls,
// and direct replay-scope delegation.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.replayProviderRegistry',
        factory() {
            const REPLAY_REQUIRED_METHODS = [
                'ensureBitmapState',
                'nextDrawOrder',
                'collectReplayItems',
                'replayBitmapItems',
                'withBitmapReplay',
                'rectFromDimensions',
            ];
            const REPLAY_OPTIONAL_METHODS = [
                'isValidRect',
            ];

            function createReplayProviderRegistry(deps = {}) {
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};
                const warn = typeof deps.warn === 'function'
                    ? deps.warn
                    : () => {};
                let replayProvider = null;

                function registerReplayProvider(provider) {
                    const normalized = normalizeReplayProvider(provider);
                    if (!normalized) {
                        warn('[BitmapServices] Ignoring invalid bitmap replay provider.');
                        return () => {};
                    }
                    replayProvider = normalized;
                    return () => {
                        if (replayProvider === normalized) replayProvider = null;
                    };
                }

                function hasReplayProvider() {
                    return !!replayProvider;
                }

                function callReplayProvider(methodName, fallback, args = []) {
                    const provider = replayProvider;
                    const method = provider && provider[methodName];
                    if (typeof method !== 'function') return fallback;
                    try {
                        return method(...(Array.isArray(args) ? args : []));
                    } catch (error) {
                        reportError(`replay.${methodName}`, error);
                        return fallback;
                    }
                }

                function withBitmapReplay(bitmap, callback, source) {
                    const provider = replayProvider;
                    if (provider && typeof provider.withBitmapReplay === 'function') {
                        return provider.withBitmapReplay(bitmap, callback, source);
                    }
                    return typeof callback === 'function' ? callback() : undefined;
                }

                function normalizeReplayProvider(provider) {
                    if (!provider || typeof provider !== 'object') return null;
                    for (const methodName of REPLAY_REQUIRED_METHODS) {
                        if (typeof provider[methodName] !== 'function') return null;
                    }

                    const normalized = {};
                    REPLAY_REQUIRED_METHODS.concat(REPLAY_OPTIONAL_METHODS).forEach((methodName) => {
                        const method = provider[methodName];
                        if (typeof method !== 'function') return;
                        normalized[methodName] = (...args) => method.apply(provider, args);
                    });
                    return freezeApi(normalized);
                }

                return freezeApi({
                    registerReplayProvider,
                    hasReplayProvider,
                    callReplayProvider,
                    withBitmapReplay,
                });
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createReplayProviderRegistry,
            });
        },
    });
})();
