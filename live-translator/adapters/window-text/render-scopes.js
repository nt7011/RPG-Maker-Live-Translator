// Window text adapter support: render guards, attribution, and translated scopes.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.renderScopes',
        factory() {

    function createRenderScopesController(context = {}) {
        const {
            replayService,
            textScaleOthers,
            createWindowTextScaleScope,
            captureBitmapDrawState,
            applyBitmapDrawState,
            isBitmapSurfaceTextEntry,
            perfLabel,
        } = context;
        const createScaleScope = requireFunction(createWindowTextScaleScope, 'createWindowTextScaleScope');
        const isBitmapSurfaceEntry = requireFunction(isBitmapSurfaceTextEntry, 'isBitmapSurfaceTextEntry');
        const labelPerf = requireFunction(perfLabel, 'perfLabel');
        const translatedDrawDepths = new WeakMap();
        const textScaleDepths = new WeakMap();

        function enterPendingDrawUnitFlushDeferral(contents, reason) {
            const bitmapDraws = getBitmapDraws();
            if (!bitmapDraws || typeof bitmapDraws.enterPendingDrawUnitFlushDeferral !== 'function') {
                throw new Error('[WindowText] pending draw-unit flush deferral service is required.');
            }
            return bitmapDraws.enterPendingDrawUnitFlushDeferral(contents, reason || 'window-pending-draw-units') || (() => {});
        }

        function withPendingDrawUnitFlushDeferral(contents, reason, callback) {
            if (typeof callback !== 'function') return undefined;
            const bitmapDraws = getBitmapDraws();
            if (!bitmapDraws || typeof bitmapDraws.withPendingDrawUnitFlushDeferral !== 'function') {
                throw new Error('[WindowText] pending draw-unit flush deferral service is required.');
            }
            return bitmapDraws.withPendingDrawUnitFlushDeferral(contents, reason || 'window-pending-draw-units', callback);
        }

        function withBitmapSkipGuard(bitmap, callback) {
            if (!bitmap) return typeof callback === 'function' ? callback() : undefined;
            const bitmapDraws = getBitmapDraws();
            if (!bitmapDraws || typeof bitmapDraws.withBitmapSkipGuard !== 'function') {
                throw new Error('[WindowText] bitmap skip guard service is required.');
            }
            return bitmapDraws.withBitmapSkipGuard(bitmap, callback);
        }

        function enterWindowPipelineGuard(bitmap, source) {
            if (!bitmap) return () => {};
            const bitmapDraws = getBitmapDraws();
            if (!bitmapDraws || typeof bitmapDraws.enterWindowPipelineGuard !== 'function') {
                throw new Error('[WindowText] bitmap window-pipeline guard service is required.');
            }
            return bitmapDraws.enterWindowPipelineGuard(bitmap, source || 'window-pipeline') || (() => {});
        }

        function withWindowPipelineGuard(bitmap, callback, source) {
            if (!bitmap) return typeof callback === 'function' ? callback() : undefined;
            const bitmapDraws = getBitmapDraws();
            if (!bitmapDraws || typeof bitmapDraws.withWindowPipelineGuard !== 'function') {
                throw new Error('[WindowText] bitmap window-pipeline guard service is required.');
            }
            return bitmapDraws.withWindowPipelineGuard(bitmap, callback, source || 'window-pipeline');
        }

        function getWindowNativeDrawAttribution(entry, route = '') {
            let attribution = 'windowDrawText';
            if (callIsBitmapSurfaceTextEntry(entry)) {
                attribution = 'windowBitmapSurface';
            } else if (entry && entry.type === 'drawTextEx') {
                attribution = 'windowDrawTextEx';
            }
            const suffix = route ? callPerfLabel(route, '') : '';
            return suffix ? `${attribution}.${suffix}` : attribution;
        }

        function withBitmapNativeDrawAttribution(bitmap, attribution, callback) {
            if (typeof callback !== 'function') return undefined;
            if (!bitmap || !attribution) return callback();
            const bitmapDraws = getBitmapDraws();
            if (!bitmapDraws || typeof bitmapDraws.withBitmapNativeDrawAttribution !== 'function') {
                throw new Error('[WindowText] bitmap native draw attribution service is required.');
            }
            return bitmapDraws.withBitmapNativeDrawAttribution(bitmap, attribution, callback);
        }

        function withTranslatedWindowTextScale(windowInstance, callback) {
            if (typeof callback !== 'function') return undefined;
            if (!Number.isInteger(textScaleOthers) || textScaleOthers <= 0 || textScaleOthers >= 100) {
                return callback();
            }
            if (getTextScaleDepth(windowInstance) > 0) return callback();
            if (windowInstance) {
                setWeakDepth(textScaleDepths, windowInstance, getTextScaleDepth(windowInstance) + 1);
            }
            let scope = null;
            try {
                scope = createScaleScope(windowInstance, textScaleOthers, {
                    captureBitmapDrawState,
                    applyBitmapDrawState,
                });
                return callback();
            } finally {
                if (scope && typeof scope.restore === 'function') {
                    try { scope.restore(); } catch (_) {}
                }
                if (windowInstance) {
                    setWeakDepth(textScaleDepths, windowInstance, getTextScaleDepth(windowInstance) - 1);
                }
            }
        }

        function withWindowTranslatedDrawScope(windowInstance, callback) {
            if (typeof callback !== 'function') return undefined;
            if (!windowInstance) return callback();
            setWeakDepth(translatedDrawDepths, windowInstance, getTranslatedDrawDepth(windowInstance) + 1);
            try {
                return withTranslatedWindowTextScale(windowInstance, callback);
            } finally {
                setWeakDepth(translatedDrawDepths, windowInstance, getTranslatedDrawDepth(windowInstance) - 1);
            }
        }

        function isWindowTranslatedDrawActive(windowInstance) {
            return getTranslatedDrawDepth(windowInstance) > 0;
        }

        function withWindowDrawTextExReplayScope(contents, callback) {
            if (typeof callback !== 'function') return undefined;
            if (!contents) return callback();
            const bitmapDraws = getBitmapDraws();
            if (!bitmapDraws || typeof bitmapDraws.withWindowDrawTextExReplayGuard !== 'function') {
                throw new Error('[WindowText] bitmap drawTextEx replay guard service is required.');
            }
            return bitmapDraws.withWindowDrawTextExReplayGuard(contents, callback);
        }

        function getTranslatedDrawDepth(windowInstance) {
            return getWeakDepth(translatedDrawDepths, windowInstance);
        }

        function getTextScaleDepth(windowInstance) {
            return getWeakDepth(textScaleDepths, windowInstance);
        }

        function getWeakDepth(depths, target) {
            if (!target || !depths || typeof depths.get !== 'function') return 0;
            return Math.max(0, Number(depths.get(target)) || 0);
        }

        function setWeakDepth(depths, target, depth) {
            if (!target || !depths || typeof depths.set !== 'function') return;
            const normalized = Math.max(0, Number(depth) || 0);
            if (normalized > 0) {
                depths.set(target, normalized);
            } else if (typeof depths.delete === 'function') {
                depths.delete(target);
            }
        }

        function getBitmapDraws() {
            return replayService && replayService.bitmapDraws || null;
        }

        function callIsBitmapSurfaceTextEntry(entry) {
            return isBitmapSurfaceEntry(entry);
        }

        function callPerfLabel(value, fallback) {
            return labelPerf(value, fallback);
        }

        return {
            enterPendingDrawUnitFlushDeferral,
            withPendingDrawUnitFlushDeferral,
            withBitmapSkipGuard,
            enterWindowPipelineGuard,
            withWindowPipelineGuard,
            getWindowNativeDrawAttribution,
            withBitmapNativeDrawAttribution,
            withTranslatedWindowTextScale,
            withWindowTranslatedDrawScope,
            isWindowTranslatedDrawActive,
            withWindowDrawTextExReplayScope,
        };
    }

    function requireFunction(callback, name) {
        if (typeof callback !== 'function') {
            throw new Error(`[WindowText] render scopes require ${name}.`);
        }
        return callback;
    }
            return { create: createRenderScopesController };
        },
    });
})();
