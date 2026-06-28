(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.drawCaptureTrace',
        factory(_dependencies, { scope: globalScope }) {
            function createNoopDrawCaptureTrace() {
                function noop() { return null; }
                const api = {
                    record: noop,
                    clear() {},
                    clearDiagnostics() {},
                    setEnabled() { return false; },
                    getSnapshot() { return null; },
                    snapshot() { return null; },
                    publish() {
                        try { delete globalScope.LiveTranslatorDrawCaptureTraceSnapshot; } catch (_) {
                            try { globalScope.LiveTranslatorDrawCaptureTraceSnapshot = null; } catch (__) {}
                        }
                        return null;
                    },
                    isEnabled() { return false; },
                };
                try { globalScope.LiveTranslatorDrawCaptureTrace = api; } catch (_) {}
                api.publish();
                return api;
            }

            function resolveInjectedFactory() {
                const hooks = globalScope.LiveTranslatorDiagnosticsHooks;
                if (!hooks || typeof hooks !== 'object') return null;
                if (typeof hooks.createDrawCaptureTrace === 'function') return hooks.createDrawCaptureTrace;
                if (typeof hooks.drawCaptureTrace === 'function') return hooks.drawCaptureTrace;
                return null;
            }

            function createDrawCaptureTrace(options = {}) {
                const factory = resolveInjectedFactory();
                if (factory) {
                    try {
                        const api = factory(Object.assign({ globalScope }, options || {}));
                        if (api && typeof api === 'object') return api;
                    } catch (_) {}
                }
                return createNoopDrawCaptureTrace();
            }

            return {
                createDrawCaptureTrace,
            };
        },
    });
})();
