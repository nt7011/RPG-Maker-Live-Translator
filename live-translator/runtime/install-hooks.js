// Central runtime instrumentation coordinator.
// Bootstrap calls this to install adapters/hooks in dependency order.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/install-hooks.js.');
    }

    function resolveHookInstaller(moduleName, loadHint) {
        const hookModule = requireRuntimeModule(`hooks.${moduleName}`);
        if (hookModule && typeof hookModule.install === 'function') {
            return hookModule.install;
        }
        throw new Error(`[LiveTranslator] hooks/${loadHint} module missing; ensure it loads before bootstrap.js.`);
    }

    function resolveAdapterInstaller(moduleName, loadHint) {
        const adapterModule = requireRuntimeModule(`adapters.${moduleName}`);
        if (adapterModule && typeof adapterModule.install === 'function') {
            return adapterModule.install;
        }
        throw new Error(`[LiveTranslator] adapters/${loadHint} module missing; ensure it loads before bootstrap.js.`);
    }

    function resolveRuntimeFactory(moduleName, factoryName, loadHint) {
        const runtimeModule = requireRuntimeModule(`runtime.${moduleName}`);
        if (runtimeModule && typeof runtimeModule[factoryName] === 'function') {
            return runtimeModule[factoryName];
        }
        throw new Error(`[LiveTranslator] ${loadHint} module missing; ensure it loads before bootstrap.js.`);
    }

    function resolveWindowTextInstaller() {
        return resolveAdapterInstaller('windowText', 'window-text-adapter.js');
    }

    function resolveGameMessageInstaller() {
        return resolveAdapterInstaller('gameMessage', 'game-message-adapter.js');
    }

    function resolvePixiTextInstaller() {
        return resolveAdapterInstaller('pixiText', 'pixi-text-adapter.js');
    }

    function resolveBitmapTextInstaller() {
        return resolveAdapterInstaller('bitmapText', 'bitmap-text-adapter.js');
    }

    function resolveDrawCaptureTraceFactory() {
        return resolveRuntimeFactory('drawCaptureTrace', 'createDrawCaptureTrace', 'runtime/draw-capture-trace.js');
    }

    function resolveBitmapServicesFactory() {
        return resolveRuntimeFactory('bitmapServices', 'createBitmapServices', 'runtime/bitmap-services.js');
    }

    function resolveSpriteTextInstaller() {
        return resolveAdapterInstaller('spriteText', 'sprite-text-adapter.js');
    }

    function resolveWindowLifecycleInstaller() {
        return resolveHookInstaller('windowLifecycle', 'window-lifecycle-hooks.js');
    }

    function createLogEscape(logger) {
        return function logEscape(level, message, details) {
            try {
                const logFn = logger && typeof logger[level] === 'function'
                    ? logger[level]
                    : (level === 'trace' && logger && typeof logger.debug === 'function' ? logger.debug : null);
                if (!logFn) return;
                if (details) {
                    logFn(`[EscapeCodes] ${message}`, details);
                } else {
                    logFn(`[EscapeCodes] ${message}`);
                }
            } catch (_) {
                // Hooks should never fail because diagnostics failed.
            }
        };
    }

    function normalizeHookDescriptor(descriptor) {
        if (descriptor && typeof descriptor === 'object') {
            return {
                name: String(descriptor.name || 'unknown-hook'),
                displayName: String(descriptor.displayName || descriptor.name || 'Unknown Hook'),
                category: descriptor.category ? String(descriptor.category) : '',
                module: descriptor.module ? String(descriptor.module) : '',
            };
        }
        const name = String(descriptor || 'unknown-hook');
        return {
            name,
            displayName: name,
            category: '',
            module: '',
        };
    }

    function createHookResult(descriptor, status, reason = '', overrides = {}) {
        const hook = normalizeHookDescriptor(descriptor);
        return {
            name: overrides.name || hook.name,
            displayName: overrides.displayName || hook.displayName,
            category: overrides.category || hook.category,
            module: overrides.module || hook.module,
            status,
            reason: reason || '',
            timestamp: Date.now(),
        };
    }

    function normalizeHookResult(descriptor, value) {
        if (value && typeof value === 'object' && typeof value.status === 'string') {
            const hook = normalizeHookDescriptor(descriptor);
            return createHookResult(
                hook,
                value.status,
                value.reason || '',
                {
                    name: value.name || hook.name,
                    displayName: value.displayName || hook.displayName,
                    category: value.category || hook.category,
                    module: value.module || hook.module,
                }
            );
        }
        return createHookResult(descriptor, 'installed', 'Hook phase completed.');
    }

    function summarizeHookResults(results) {
        const summary = {
            installed: 0,
            skipped: 0,
            failed: 0,
            total: Array.isArray(results) ? results.length : 0,
            updatedAt: Date.now(),
        };
        for (const result of results || []) {
            if (!result || typeof result.status !== 'string') continue;
            if (Object.prototype.hasOwnProperty.call(summary, result.status)) {
                summary[result.status] += 1;
            }
        }
        return summary;
    }

    defineRuntimeModule('runtime.installHooks', {
        createHookInstaller(options = {}) {
            const {
                cacheContext,
                hookContext,
                loggerContext,
                createAdapterBoundary,
                settings = {},
            } = options;
            if (!cacheContext || !hookContext || !loggerContext) {
                throw new Error('[LiveTranslator] cache, hook, and logger contexts are required before hook installation.');
            }
            if (typeof createAdapterBoundary !== 'function') {
                throw new Error('[LiveTranslator] adapter boundary factory is required before hook installation.');
            }

            const { logger, dbg, diag, preview, telemetry } = loggerContext;
            const createLiveTranslatorPerf = resolveRuntimeFactory(
                'performanceProfiler',
                'createLiveTranslatorPerf',
                'runtime/performance-profiler.js'
            );
            const perf = createLiveTranslatorPerf({
                settings,
                logger,
            });
            const createDrawCaptureTrace = resolveDrawCaptureTraceFactory();
            const drawCaptureTrace = createDrawCaptureTrace({
                settings,
                logger,
                preview,
            });
            const createBitmapServices = resolveBitmapServicesFactory();
            const bitmapServices = createBitmapServices({
                settings,
                logger,
                captureBitmapDrawState: hookContext.captureBitmapDrawState,
            });
            const bitmapAdapterServices = bitmapServices.forBitmapAdapter();
            const windowBitmapReplay = bitmapServices.forWindowAdapter();
            const spriteBitmapServices = bitmapServices.forSpriteAdapter();

            function getAdapterBoundary(adapterId, defaultHook) {
                return createAdapterBoundary(adapterId, defaultHook || adapterId);
            }

            function getWindowAdapterBoundary() {
                return hookContext.windowAdapterContract || getAdapterBoundary('window', 'window');
            }

            function withAdapterContract(options, adapterId, defaultHook) {
                return Object.assign({}, options || {}, {
                    adapterContract: getAdapterBoundary(adapterId, defaultHook),
                });
            }

            const hookOptions = {
                logger,
                dbg,
                diag,
                preview,
                stripControls: hookContext.stripControls,
                encodeText: hookContext.encodeText,
                restoreText: hookContext.restoreText,
                telemetry,
                settings,
                captureBitmapDrawState: hookContext.captureBitmapDrawState,
                applyBitmapDrawState: hookContext.applyBitmapDrawState,
                resolveTextScalePercent: hookContext.resolveTextScalePercent,
                scaleBitmapDrawState: hookContext.scaleBitmapDrawState,
                scaleFontSizeValue: hookContext.scaleFontSizeValue,
                createWindowTextScaleScope: hookContext.createWindowTextScaleScope,
                generateKey: hookContext.generateKey,
                contentsOwners: hookContext.contentsOwners,
                windowRegistry: hookContext.windowRegistry,
                registeredWindows: hookContext.registeredWindows,
                windowLifecycle: hookContext.windowLifecycle,
                unregisterWindow: hookContext.unregisterWindow,
                pruneDetachedRegisteredWindows: hookContext.pruneDetachedRegisteredWindows,
                PER_CHAR_MARK: hookContext.PER_CHAR_MARK,
                perf,
                logEscape: createLogEscape(logger),
                drawCaptureTrace,
            };

            const windowLifecycleInstaller = resolveWindowLifecycleInstaller();
            const windowTextAdapterInstaller = resolveWindowTextInstaller();
            const gameMessageAdapterInstaller = resolveGameMessageInstaller();
            const bitmapTextAdapterInstaller = resolveBitmapTextInstaller();
            const spriteTextAdapterInstaller = resolveSpriteTextInstaller();
            const pixiTextAdapterInstaller = resolvePixiTextInstaller();
            let gameMessageHelpers = null;
            let windowTextAdapterHelpers = null;

            function installWindowLifecycleHooks() {
                return windowLifecycleInstaller({
                    logger,
                    dbg,
                    windowLifecycle: hookContext.windowLifecycle,
                    windowRegistry: hookContext.windowRegistry,
                    registeredWindows: hookContext.registeredWindows,
                    addWindowToRegistry: hookContext.addWindowToRegistry,
                    unregisterWindow: hookContext.unregisterWindow,
                    pruneDetachedRegisteredWindows: hookContext.pruneDetachedRegisteredWindows,
                    getWindowTextHelpers: () => windowTextAdapterHelpers,
                    getGameMessageHelpers: () => gameMessageHelpers,
                    getRedrawGameMessageText: () => gameMessageHelpers && gameMessageHelpers.redrawGameMessageText,
                });
            }

            function installWindowTextAdapter() {
                const result = windowTextAdapterInstaller({
                    logger,
                    telemetry,
                    adapterContract: getWindowAdapterBoundary(),
                    windowRegistry: hookContext.windowRegistry,
                    registeredWindows: hookContext.registeredWindows,
                    windowLifecycle: hookContext.windowLifecycle,
                    ensureWindowRegistered: hookContext.ensureWindowRegistered,
                    pruneDetachedRegisteredWindows: hookContext.pruneDetachedRegisteredWindows,
                    generateKey: hookContext.generateKey,
                    captureBitmapDrawState: hookContext.captureBitmapDrawState,
                    applyBitmapDrawState: hookContext.applyBitmapDrawState,
                    resolveTextScalePercent: hookContext.resolveTextScalePercent,
                    createWindowTextScaleScope: hookContext.createWindowTextScaleScope,
                    stripControls: hookContext.stripControls,
                    encodeText: hookContext.encodeText,
                    restoreText: hookContext.restoreText,
                    preview,
                    settings,
                    diag,
                    dbg,
                    perf,
                    drawCaptureTrace,
                    contentsOwners: hookContext.contentsOwners,
                    bitmapReplay: windowBitmapReplay,
                    bitmapDraws: windowBitmapReplay,
                }) || null;
                windowTextAdapterHelpers = result && result.helpers ? result.helpers : null;
                return result;
            }

            function installGameMessageAdapter() {
                const result = gameMessageAdapterInstaller(withAdapterContract(hookOptions, 'message', 'message')) || null;
                gameMessageHelpers = result && result.helpers ? result.helpers : null;
                return result;
            }

            function publishHookInstallResults(results) {
                const summary = summarizeHookResults(results);
                const snapshot = {
                    results: results.slice(),
                    summary,
                    updatedAt: Date.now(),
                };
                try { globalScope.LiveTranslatorHookInstallResults = snapshot.results; } catch (_) {}
                try { globalScope.LiveTranslatorHookInstallSummary = snapshot.summary; } catch (_) {}
                try { globalScope.LiveTranslatorHookInstallSnapshot = snapshot; } catch (_) {}
                return snapshot;
            }

            function runHookPhase(results, descriptor, installer) {
                const hook = normalizeHookDescriptor(descriptor);
                try {
                    const value = installer();
                    const result = normalizeHookResult(hook, value);
                    results.push(result);
                    if (result.status === 'installed') {
                        logger.debug(`[INIT] ${hook.name} hooks installed`);
                    } else if (result.status === 'skipped') {
                        logger.debug(`[INIT] ${hook.name} hooks skipped: ${result.reason || 'no reason provided'}`);
                    } else {
                        logger.warn(`[INIT] ${hook.name} hooks ${result.status}: ${result.reason || 'no reason provided'}`);
                    }
                    return result;
                } catch (error) {
                    const result = createHookResult(hook, 'failed', error && error.message ? error.message : String(error || 'unknown error'));
                    results.push(result);
                    logger.error(`[INIT] ${hook.name} hooks failed`, error);
                    return result;
                }
            }

            function installAll() {
                logger.info('[INIT] Starting live translator hook installation...');
                logger.debug('[INIT] Window_Base available:', typeof Window_Base !== 'undefined');
                logger.debug('[INIT] Window_Base.prototype.drawText available:', typeof Window_Base !== 'undefined' && typeof Window_Base.prototype.drawText === 'function');
                const results = [];

                runHookPhase(results, {
                    name: 'window-lifecycle',
                    displayName: 'Window Lifecycle',
                    category: 'window',
                    module: 'window-lifecycle-hooks.js',
                }, installWindowLifecycleHooks);
                runHookPhase(results, {
                    name: 'game-message',
                    displayName: 'Game Message Adapter',
                    category: 'message',
                    module: 'game-message-adapter.js',
                }, installGameMessageAdapter);
                runHookPhase(results, {
                    name: 'window-text',
                    displayName: 'Window Text Adapter',
                    category: 'window',
                    module: 'window-text-adapter.js',
                }, installWindowTextAdapter);
                runHookPhase(results, {
                    name: 'bitmap',
                    displayName: 'Bitmap Text Adapter',
                    category: 'bitmap',
                    module: 'bitmap-text-adapter.js',
                }, () => bitmapTextAdapterInstaller(withAdapterContract(Object.assign({}, hookOptions, {
                    bitmapServices: bitmapAdapterServices,
                    getWindowTextHelpers: () => windowTextAdapterHelpers,
                }), 'bitmap', 'bitmap')));
                runHookPhase(results, {
                    name: 'sprite-text',
                    displayName: 'Sprite Text Adapter',
                    category: 'sprite',
                    module: 'sprite-text-adapter.js',
                }, () => spriteTextAdapterInstaller(withAdapterContract(Object.assign({}, hookOptions, {
                    bitmapServices: spriteBitmapServices,
                }), 'sprite', 'sprite_text')));
                runHookPhase(results, {
                    name: 'pixi',
                    displayName: 'PIXI Text Adapter',
                    category: 'pixi',
                    module: 'pixi-text-adapter.js',
                }, () => pixiTextAdapterInstaller(withAdapterContract(hookOptions, 'pixi', 'pixi')));
                runHookPhase(results, {
                    name: 'performance-engine-stage',
                    displayName: 'Performance Engine Stage Profiler',
                    category: 'diagnostics',
                    module: 'runtime/performance-profiler.js',
                }, () => {
                    if (!perf || typeof perf.installEngineStageHooks !== 'function') {
                        return { status: 'skipped', reason: 'Performance profiler API unavailable.' };
                    }
                    if (!perf.isEnabled || !perf.isEnabled()) {
                        return { status: 'skipped', reason: 'Performance profiler disabled.' };
                    }
                    return perf.installEngineStageHooks()
                        ? { status: 'installed', reason: 'Engine stage methods are being timed.' }
                        : { status: 'skipped', reason: 'No SceneManager or Graphics stage methods were available.' };
                });

                const snapshot = publishHookInstallResults(results);

                return {
                    gameMessageHelpers,
                    windowTextHelpers: windowTextAdapterHelpers,
                    windowTextAdapterHelpers,
                    hookResults: snapshot.results,
                    hookSummary: snapshot.summary,
                };
            }

            return { installAll };
        },
    });
})();
