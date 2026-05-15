// Disk cache and translation-manager context builder.
// It wires persistent cache, provider mode, telemetry, and translation-manager into the service hooks call.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/cache-context.js.');
    }

    function resolveDiskCacheFactory() {
        try {
            const module = requireRuntimeModule('runtime.diskCache');
            return module && typeof module.createDiskCache === 'function'
                ? module.createDiskCache
                : null;
        } catch (_) {
            return null;
        }
    }

    function resolveTranslationManagerFactory() {
        const module = requireRuntimeModule('runtime.translationManager');
        if (module && typeof module.createTranslationManager === 'function') {
            return module.createTranslationManager;
        }
        throw new Error('[LiveTranslator] runtime.translationManager did not export createTranslationManager.');
    }

    function resolveProviderFactory() {
        const module = requireRuntimeModule('runtime.translationProviders');
        if (module && typeof module.createProvider === 'function') {
            return module.createProvider;
        }
        throw new Error('[LiveTranslator] runtime.translationProviders did not export createProvider.');
    }

    function resolveConfigModule() {
        const module = requireRuntimeModule('config');
        if (module && typeof module.getTranslatorConfig === 'function') {
            return module;
        }
        throw new Error('[LiveTranslator] config module did not export getTranslatorConfig.');
    }

    function resolvePathContext() {
        try {
            const module = requireRuntimeModule('runtime.paths');
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

    defineRuntimeModule('runtime.cacheContext', {
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

            const { logger, telemetry, preview, dbg, diag } = loggerContext;
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
                diag,
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

            return {
                diskCache,
                diskCacheSettings,
                pathContext,
                hydrateCache,
                describeDiskCache,
                translationCache,
                translationService,
                translationManager,
            };
        },
    });
})();
