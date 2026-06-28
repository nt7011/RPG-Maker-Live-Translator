// Logger and telemetry context builder for runtime modules.
// It creates the shared logger, preview formatter, and telemetry channel that hooks and caches use for diagnostics.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.loggerContext',
        requires: {
            createLoggerBundle: 'runtime.logger',
        },
        factory({ createLoggerBundle }, { scope: runtimeScope }) {
            function resolveLoggerBundleFactory() {
                return createLoggerBundle;
            }

            function createPreview(loggerPreview) {
                if (typeof loggerPreview === 'function') return loggerPreview;
                return (text, max = 48) => {
                    const s = String(text ?? '').replace(/\s+/g, ' ').trim();
                    if (s.length <= max) return s;
                    return s.slice(0, Math.max(0, max - 1)) + '...';
                };
            }

            return {
                createLoggerContext(options = {}) {
                    const settings = options.settings || {};
                    const loggerBundleFactory = resolveLoggerBundleFactory();
                    const loggingBundle = loggerBundleFactory({
                        settings,
                        paths: options.paths || runtimeScope && runtimeScope.LiveTranslatorPaths || {},
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

                    const runtimeWindow = runtimeScope && runtimeScope.window || null;
                    if (runtimeWindow) {
                        runtimeWindow.translationLogger = context.logger;
                        runtimeWindow.translationTelemetry = telemetry;
                        runtimeWindow.translationDiagnostics = telemetry;
                    }

                    return context;
                },
            };
        },
    });
})();
