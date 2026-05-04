// Central hook installation coordinator.
// Bootstrap calls this to install window, bitmap, sprite text, and PIXI hooks in order.
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

    function resolveRuntimeFactory(moduleName, factoryName, loadHint) {
        const runtimeModule = requireRuntimeModule(`runtime.${moduleName}`);
        if (runtimeModule && typeof runtimeModule[factoryName] === 'function') {
            return runtimeModule[factoryName];
        }
        throw new Error(`[LiveTranslator] ${loadHint} module missing; ensure it loads before bootstrap.js.`);
    }

    function resolveWindowDrawInstaller() {
        return resolveHookInstaller('windowDraw', 'window-draw-hooks.js');
    }

    function resolveWindowStateInstaller() {
        return resolveHookInstaller('windowState', 'window-state-hooks.js');
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
                textTracker = null,
                settings = {},
            } = options;
            if (!cacheContext || !hookContext || !loggerContext) {
                throw new Error('[LiveTranslator] cache, hook, and logger contexts are required before hook installation.');
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
            const hookOptions = {
                logger,
                dbg,
                diag,
                preview,
                stripRpgmEscapes: hookContext.stripRpgmEscapes,
                prepareTextForTranslation: hookContext.prepareTextForTranslation,
                restoreControlCodes: hookContext.restoreControlCodes,
                telemetry,
                textTracker,
                translationCache: cacheContext.translationCache,
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
                PER_CHAR_MARK: hookContext.PER_CHAR_MARK,
                REDRAW_SIGNATURE: hookContext.REDRAW_SIGNATURE,
                perf,
                logEscape: createLogEscape(logger),
            };

            const windowStateInstaller = resolveWindowStateInstaller();
            const windowDrawInstaller = resolveWindowDrawInstaller();
            const gameMessageInstaller = resolveHookInstaller('gameMessage', 'game-message-hook.js');
            const helpWindowInstaller = resolveHookInstaller('helpWindow', 'help-window-hook.js');
            const spriteTextInstaller = resolveHookInstaller('spriteText', 'sprite-text-hook.js');
            const bitmapDrawTextInstaller = resolveHookInstaller('bitmapDrawText', 'bitmap-draw-text-hook.js');
            const pixiTextInstaller = resolveHookInstaller('pixiText', 'pixi-text-hook.js');
            let gameMessageHelpers = null;
            let windowDrawHelpers = null;

            function installWindowStateHooks() {
                return windowStateInstaller({
                    logger,
                    dbg,
                    textTracker,
                    windowRegistry: hookContext.windowRegistry,
                    registeredWindows: hookContext.registeredWindows,
                    addWindowToRegistry: hookContext.addWindowToRegistry,
                    getWindowDrawHelpers: () => windowDrawHelpers,
                    getRedrawGameMessageText: () => gameMessageHelpers && gameMessageHelpers.redrawGameMessageText,
                });
            }

            function installWindowDrawHooks() {
                const result = windowDrawInstaller({
                    logger,
                    telemetry,
                    textTracker,
                    translationCache: cacheContext.translationCache,
                    windowRegistry: hookContext.windowRegistry,
                    registeredWindows: hookContext.registeredWindows,
                    ensureWindowRegistered: hookContext.ensureWindowRegistered,
                    generateKey: hookContext.generateKey,
                    captureBitmapDrawState: hookContext.captureBitmapDrawState,
                    applyBitmapDrawState: hookContext.applyBitmapDrawState,
                    resolveTextScalePercent: hookContext.resolveTextScalePercent,
                    createWindowTextScaleScope: hookContext.createWindowTextScaleScope,
                    stripRpgmEscapes: hookContext.stripRpgmEscapes,
                    prepareTextForTranslation: hookContext.prepareTextForTranslation,
                    restoreControlCodes: hookContext.restoreControlCodes,
                    preview,
                    settings,
                    REDRAW_SIGNATURE: hookContext.REDRAW_SIGNATURE,
                    diag,
                    dbg,
                }) || null;
                windowDrawHelpers = result && result.helpers ? result.helpers : null;
                return result;
            }

            function installGameMessageHooks() {
                const result = gameMessageInstaller(hookOptions) || null;
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
                    name: 'window-state',
                    displayName: 'Window State',
                    category: 'window',
                    module: 'window-state-hooks.js',
                }, installWindowStateHooks);
                runHookPhase(results, {
                    name: 'game-message',
                    displayName: 'Game Message',
                    category: 'message',
                    module: 'game-message-hook.js',
                }, installGameMessageHooks);
                runHookPhase(results, {
                    name: 'window-draw',
                    displayName: 'Window Draw',
                    category: 'window',
                    module: 'window-draw-hooks.js',
                }, installWindowDrawHooks);
                runHookPhase(results, {
                    name: 'help-window',
                    displayName: 'Help Window',
                    category: 'window',
                    module: 'help-window-hook.js',
                }, () => helpWindowInstaller(hookOptions));
                runHookPhase(results, {
                    name: 'bitmap',
                    displayName: 'Bitmap',
                    category: 'bitmap',
                    module: 'bitmap-draw-text-hook.js',
                }, () => bitmapDrawTextInstaller(hookOptions));
                runHookPhase(results, {
                    name: 'sprite-text',
                    displayName: 'Sprite Text',
                    category: 'sprite',
                    module: 'sprite-text-hook.js',
                }, () => spriteTextInstaller(hookOptions));
                runHookPhase(results, {
                    name: 'pixi',
                    displayName: 'PIXI',
                    category: 'pixi',
                    module: 'pixi-text-hook.js',
                }, () => pixiTextInstaller(hookOptions));

                const snapshot = publishHookInstallResults(results);

                return {
                    gameMessageHelpers,
                    windowDrawHelpers,
                    hookResults: snapshot.results,
                    hookSummary: snapshot.summary,
                };
            }

            return { installAll };
        },
    });
})();
