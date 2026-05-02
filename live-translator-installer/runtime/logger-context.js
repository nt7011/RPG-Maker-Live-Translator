// Logger and telemetry context builder for runtime modules.
// It creates the shared logger, preview formatter, and telemetry channel that hooks and caches use for diagnostics.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/logger-context.js.');
    }

    function resolveLoggerBundleFactory() {
        return requireRuntimeModule('createLoggerBundle');
    }

    function createPreview(loggerPreview) {
        if (typeof loggerPreview === 'function') return loggerPreview;
        return (text, max = 48) => {
            const s = String(text ?? '').replace(/\s+/g, ' ').trim();
            if (s.length <= max) return s;
            return s.slice(0, Math.max(0, max - 1)) + '...';
        };
    }

    defineRuntimeModule('runtime.loggerContext', {
        createLoggerContext(options = {}) {
            const settings = options.settings || {};
            const loggerBundleFactory = resolveLoggerBundleFactory();
            const loggingBundle = loggerBundleFactory({
                settings,
                paths: options.paths || globalScope.LiveTranslatorPaths || {},
                maxLogsPerFrame: 1000,
                shouldBypassThrottle: () => options.isLocalProvider === true,
            });

            const preview = createPreview(loggingBundle.preview);
            const telemetry = loggingBundle.createTelemetryChannel({ preview });
            const context = {
                loggingBundle,
                logger: loggingBundle.logger,
                dbg: loggingBundle.dbg,
                diag: loggingBundle.diag,
                getFastTimestamp: loggingBundle.getFastTimestamp,
                isLoggingEnabled: loggingBundle.isLoggingEnabled,
                preview,
                telemetry,
            };

            if (typeof window !== 'undefined') {
                window.translationLogger = context.logger;
                window.translationTelemetry = telemetry;
                window.translationDiagnostics = telemetry;
            }

            return context;
        },
    });
})();
