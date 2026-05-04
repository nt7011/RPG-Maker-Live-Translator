// Runtime composition root for live translation inside the game.
// It connects config, logging, cache, and hook modules, hydrates cached translations, then starts hook installation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const requireRuntimeModule = globalScope.LiveTranslatorRequire;

    function requireModule(path) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(path);
        }
        throw new Error(`[LiveTranslator] Runtime module registry unavailable while requiring: ${path}`);
    }

    const configModule = requireModule('config');
    const pathsModule = requireModule('runtime.paths');
    const providerModule = requireModule('runtime.provider');
    const textTrackerModule = requireModule('runtime.textTracker');
    const loggerContextModule = requireModule('runtime.loggerContext');
    const hookContextModule = requireModule('runtime.hookContext');
    const cacheContextModule = requireModule('runtime.cacheContext');
    const hookInstallerModule = requireModule('runtime.installHooks');

    const settings = configModule.requireSettings(globalScope);
    const pathContext = pathsModule.getPathContext();
    const providerContext = providerModule.createProviderContext({ scope: globalScope });
    const loggerContext = loggerContextModule.createLoggerContext({
        settings,
        paths: pathContext,
        isLocalProvider: providerContext.isLocalProvider,
    });
    const textTracker = textTrackerModule.createTextTracker({
        settings,
        logger: loggerContext.logger,
        preview: loggerContext.preview,
    });
    const hookContext = hookContextModule.createHookContext({ textTracker });
    const cacheContext = cacheContextModule.createCacheContext({
        settings,
        providerContext,
        loggerContext,
        textTracker,
        paths: pathContext,
    });
    const hookInstaller = hookInstallerModule.createHookInstaller({
        settings,
        cacheContext,
        hookContext,
        loggerContext,
        textTracker,
    });

    const { logger } = loggerContext;

    let initializationScheduled = false;
    let initializationStarted = false;
    let initializationCompleted = false;

    logger.info('LIVE TRANSLATOR BOOTSTRAP LOADED');

    function scheduleInitialization(delayMs = 100) {
        if (initializationScheduled) return;
        initializationScheduled = true;
        setTimeout(initializeLiveTranslator, delayMs);
    }

    function initializeLiveTranslator() {
        if (initializationCompleted) {
            logger.debug('[INIT] Initialization already completed; skipping.');
            return;
        }
        if (initializationStarted) {
            logger.debug('[INIT] Initialization already in progress; skipping.');
            return;
        }

        initializationStarted = true;
        try {
            const hookInstallResult = hookInstaller.installAll();
            initializationCompleted = true;
            logger.info('[INIT] Live translator bootstrap initialization completed');
            setTimeout(() => {
                const summary = hookInstallResult && hookInstallResult.hookSummary
                    ? hookInstallResult.hookSummary
                    : null;
                logger.info('[INIT] Live translator bootstrap initialized');
                if (summary) {
                    logger.info(`Hooks: ${summary.installed} installed, ${summary.skipped} skipped, ${summary.failed} failed`);
                }
                logger.info(`Disk cache: ${cacheContext.describeDiskCache()}`);
            }, 1000);
        } catch (error) {
            initializationStarted = false;
            initializationScheduled = false;
            logger.error('[INIT] Live translator bootstrap initialization failed:', error);
        }
    }

    async function hydrateAndInitialize() {
        await cacheContext.hydrateCache();
        scheduleInitialization(0);
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('load', () => {
            hydrateAndInitialize().catch((error) => logger.error('[DiskCache Hydrate Error]', error));
        });
    }

    if (typeof document !== 'undefined' && document.readyState === 'complete') {
        hydrateAndInitialize().catch((error) => logger.error('[DiskCache Hydrate Error]', error));
    }
})();
