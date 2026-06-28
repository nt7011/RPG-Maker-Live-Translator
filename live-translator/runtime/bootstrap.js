// Runtime composition root for live translation inside the game.
// It connects config, logging, cache, and hook modules, hydrates cached translations, then starts hook installation.
(() => {
    'use strict';

    const ADAPTER_ORCHESTRATOR_METHODS = [
        'observeRecord',
        'updateItem',
        'requestItemTranslation',
        'cancelItemTranslation',
        'setItemTranslationPriority',
        'setItemVisibility',
        'backgroundItem',
        'retireItem',
        'recordDecision',
        'describeTextEligibility',
        'claimSurface',
        'releaseSurface',
        'claimText',
        'finalizeTextClaim',
        'releaseTextClaim',
        'recordSurfaceDraw',
        'recordRenderCommitted',
        'recordRenderDeferred',
        'recordRenderRejected',
        'queueStoredRenderCommand',
        'notifyRenderCommandReady',
        'getUnresolvedRenderCommandsForItem',
        'subscribeSurfaceDraws',
        'subscribe',
    ];

    function createAdapterOrchestratorGateway(controller) {
        const missingMethods = ADAPTER_ORCHESTRATOR_METHODS.filter((methodName) => {
            return !(controller && typeof controller[methodName] === 'function');
        });
        if (missingMethods.length) {
            throw new Error(`[LiveTranslator] Text orchestrator missing adapter gateway methods: ${missingMethods.join(', ')}`);
        }
        const gateway = {};
        ADAPTER_ORCHESTRATOR_METHODS.forEach((methodName) => {
            gateway[methodName] = controller[methodName].bind(controller);
        });
        return Object.freeze(gateway);
    }

    function createAdapterBoundaryFactory(options = {}) {
        const {
            createAdapterContract,
            orchestratorGateway,
            logger,
        } = options;
        if (typeof createAdapterContract !== 'function') {
            throw new Error('[LiveTranslator] runtime.adapterContract did not export createAdapterContract.');
        }
        return function createAdapterBoundary(adapterId, defaultHook) {
            return createAdapterContract({
                adapterId,
                defaultHook: defaultHook || adapterId,
                orchestratorGateway,
                logger,
            });
        };
    }

    function subscribeProviderAvailabilityRestored(translationService, textOrchestrator, logger) {
        if (!translationService
            || typeof translationService.subscribeProviderAvailability !== 'function'
            || !textOrchestrator
            || typeof textOrchestrator.retryFailedTranslations !== 'function') {
            return false;
        }
        translationService.subscribeProviderAvailability((event) => {
            if (!event || event.type !== 'provider.availability_restored') return;
            try {
                const result = textOrchestrator.retryFailedTranslations({
                    reason: 'lmstudio-availability-restored',
                    includeActive: true,
                    includeForesight: true,
                });
                if (result && result.attempted > 0 && logger && typeof logger.info === 'function') {
                    logger.info(`[LM Studio] Availability restored; retried ${result.attempted} failed translation request(s).`);
                }
            } catch (error) {
                if (logger && typeof logger.warn === 'function') {
                    logger.warn('[LM Studio] Availability restored retry failed.', error);
                }
            }
        });
        return true;
    }

    LiveTranslatorRun({
        name: 'runtime.bootstrap',
        requires: {
            configModule: 'runtime.config',
            pathsModule: 'runtime.paths',
            providerModule: 'runtime.provider',
            textOrchestratorModule: 'runtime.textOrchestrator',
            adapterContractModule: 'runtime.adapterContract',
            loggerContextModule: 'runtime.loggerContext',
            hookContextModule: 'runtime.hookContext',
            cacheContextModule: 'runtime.cacheContext',
            hookInstallerModule: 'runtime.installHooks',
        },
        loadAfter: ['runtime.installHooks'],
        scriptBefore: ['ui-launcher/window-support.js'],
        run({
            configModule,
            pathsModule,
            providerModule,
            textOrchestratorModule,
            adapterContractModule,
            loggerContextModule,
            hookContextModule,
            cacheContextModule,
            hookInstallerModule,
        }, { scope: globalScope }) {
            const settings = configModule.requireSettings(globalScope);
            const pathContext = pathsModule.getPathContext();
            const providerContext = providerModule.createProviderContext({ scope: globalScope });
            const loggerContext = loggerContextModule.createLoggerContext({
                settings,
                paths: pathContext,
                isLocalProvider: providerContext.isLocalProvider,
            });
            const textOrchestrator = textOrchestratorModule.createTextOrchestrator({
                settings,
                providerContext,
                logger: loggerContext.logger,
                preview: loggerContext.preview,
            });
            const adapterOrchestratorGateway = createAdapterOrchestratorGateway(textOrchestrator);
            const createAdapterBoundary = createAdapterBoundaryFactory({
                createAdapterContract: adapterContractModule && adapterContractModule.createAdapterContract,
                orchestratorGateway: adapterOrchestratorGateway,
                logger: loggerContext.logger,
            });
            const windowAdapterContract = createAdapterBoundary('window', 'window');
            const hookContext = hookContextModule.createHookContext({
                windowAdapterContract,
            });
            const cacheContext = cacheContextModule.createCacheContext({
                settings,
                providerContext,
                loggerContext,
                paths: pathContext,
            });
            try {
                globalScope.LiveTranslatorRuntimeCache = {
                    flushDiskCache: typeof cacheContext.flushDiskCache === 'function'
                        ? cacheContext.flushDiskCache
                        : async () => {},
                };
            } catch (_) {}
            const translationService = cacheContext.translationService
                || (cacheContext.translationManager && cacheContext.translationManager.translationService)
                || null;
            if (typeof textOrchestrator.setTranslationService === 'function') {
                textOrchestrator.setTranslationService(translationService);
            }
            subscribeProviderAvailabilityRestored(translationService, textOrchestrator, loggerContext.logger);
            const hookInstaller = hookInstallerModule.createHookInstaller({
                settings,
                cacheContext,
                hookContext,
                loggerContext,
                createAdapterBoundary,
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
        },
    });
})();
