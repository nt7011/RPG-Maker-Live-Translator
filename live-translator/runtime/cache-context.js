// Disk cache and translation-manager context builder.
// It wires persistent cache, provider mode, telemetry, and translation-manager into the service hooks call.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.cacheContext',
        requires: {
            diskCache: 'runtime.cache.diskCache',
            translationManager: 'runtime.translationManager',
            translationProviders: 'runtime.translationProviders',
            config: 'runtime.config',
            pathContextModule: 'runtime.paths',
        },
        factory({ diskCache, translationManager, translationProviders, config, pathContextModule }, { scope: globalScope }) {
            function resolveDiskCacheFactory() {
                try {
                    const module = diskCache;
                    return module && typeof module.createDiskCache === 'function'
                        ? module.createDiskCache
                        : null;
                } catch (_) {
                    return null;
                }
            }

            function resolveTranslationManagerFactory() {
                const module = translationManager;
                if (module && typeof module.createTranslationManager === 'function') {
                    return module.createTranslationManager;
                }
                throw new Error('[LiveTranslator] runtime.translationManager did not export createTranslationManager.');
            }

            function resolveProviderFactory() {
                const module = translationProviders;
                if (module && typeof module.createProvider === 'function') {
                    return module.createProvider;
                }
                throw new Error('[LiveTranslator] runtime.translationProviders did not export createProvider.');
            }

            function resolveConfigModule() {
                const module = config;
                if (module && typeof module.getTranslatorConfig === 'function') {
                    return module;
                }
                throw new Error('[LiveTranslator] config module did not export getTranslatorConfig.');
            }

            function resolvePathContext() {
                try {
                    const module = pathContextModule;
                    if (module && typeof module.getPathContext === 'function') {
                        return module.getPathContext();
                    }
                } catch (_) {}
                return globalScope.LiveTranslatorPaths && typeof globalScope.LiveTranslatorPaths === 'object'
                    ? globalScope.LiveTranslatorPaths
                    : {};
            }

            function getCacheEntryLimit() {
                return 0;
            }

            function pruneMapToLimit() {}

            return {
                createCacheContext(options = {}) {
                    const {
                        settings = {},
                        providerContext = {},
                        loggerContext,
                        paths = null,
                    } = options;
                    if (!loggerContext || !loggerContext.logger || !loggerContext.telemetry) {
                        throw new Error('[LiveTranslator] logger context is required before cache context.');
                    }

                    const { logger, telemetry, preview, dbg, traceLog } = loggerContext;
                    const pathContext = paths && typeof paths === 'object' ? paths : resolvePathContext();
                    const configModule = resolveConfigModule();
                    const translatorConfig = configModule.getTranslatorConfig(globalScope);
                    const providerFactory = resolveProviderFactory();
                    const provider = providerFactory({
                        translatorConfig,
                        settings,
                        logger,
                        fetch: typeof globalScope.fetch === 'function' ? globalScope.fetch.bind(globalScope) : undefined,
                    });
                    const diskCacheFactory = resolveDiskCacheFactory();
                    const diskCacheSettings = settings.diskCache || {};
                    const diskCache = diskCacheFactory
                        ? diskCacheFactory({
                            logger,
                            settings: diskCacheSettings,
                            defaultCacheMegabytes: Number(diskCacheSettings.maxMegabytes) || 32,
                            paths: pathContext,
                        })
                        : {
                            enabled: false,
                            appendRecord: async () => {},
                            loadAll: async () => [],
                            flush: async () => {},
                            ensureLaunchPrune: async () => {},
                            getMaxMegabytes: () => Number(diskCacheSettings.maxMegabytes) || 0,
                        };

                    const translationManager = resolveTranslationManagerFactory()({
                        logger,
                        telemetry,
                        diskCache,
                        preview,
                        getCacheEntryLimit,
                        pruneMapToLimit,
                        provider,
                        isLocalProvider: providerContext.isLocalProvider === true,
                        isCacheOnlyProvider: providerContext.isCacheOnlyProvider === true,
                        dbg,
                        traceLog,
                        settings,
                        paths: pathContext,
                    });

                    if (!translationManager || !translationManager.translationCache) {
                        throw new Error('[LiveTranslator] translation-manager failed to provide a translation cache.');
                    }

                    const translationCache = translationManager.translationCache;
                    const translationService = translationManager.translationService || null;

                    async function hydrateCache() {
                        if (!diskCache.enabled) return;
                        const records = await diskCache.loadAll();
                        for (const rec of records) {
                            if (rec && typeof rec.in === 'string' && typeof rec.out === 'string') {
                                if (typeof translationCache.storeCompletedTranslation === 'function') {
                                    translationCache.storeCompletedTranslation(rec.in, rec.out);
                                } else {
                                    translationCache.completed.set(rec.in.trim(), rec.out);
                                }
                            }
                        }
                        dbg(`[DiskCache] Loaded ${records.length} records`);
                    }

                    function describeDiskCache() {
                        const maxMb = diskCache.enabled && typeof diskCache.getMaxMegabytes === 'function'
                            ? diskCache.getMaxMegabytes()
                            : Number(diskCacheSettings.maxMegabytes);
                        const retention = Number.isFinite(maxMb) && maxMb > 0 ? `${Math.floor(maxMb)} MB` : 'unlimited';
                        return `${diskCache.enabled ? 'enabled' : 'disabled'}${diskCache.enabled ? ` (${retention})` : ''}`;
                    }

                    async function flushDiskCache() {
                        if (!diskCache.enabled || typeof diskCache.flush !== 'function') return;
                        await diskCache.flush();
                    }

                    return {
                        diskCache,
                        diskCacheSettings,
                        pathContext,
                        hydrateCache,
                        flushDiskCache,
                        describeDiskCache,
                        translationCache,
                        translationService,
                        translationManager,
                    };
                },
            };
        },
    });
})();
