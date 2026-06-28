// Window text adapter support: bitmap replay service and surface bindings.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.bitmapReplayBindings',
        factory() {

    function createBitmapReplayBindingsController(context = {}) {
        const services = context.services || {};
        const { replay: replayService = {}, surface: surfaceService = {} } = services;
        const windowRedrawClearDepths = new WeakMap();

        function withWindowRedrawClear(contents, callback) {
            if (!contents || typeof callback !== 'function') return undefined;
            windowRedrawClearDepths.set(contents, getWindowRedrawClearDepth(contents) + 1);
            try {
                return callback();
            } finally {
                const nextDepth = Math.max(0, getWindowRedrawClearDepth(contents) - 1);
                if (nextDepth > 0) windowRedrawClearDepths.set(contents, nextDepth);
                else windowRedrawClearDepths.delete(contents);
            }
        }

        function isWindowRedrawClearActive(contents) {
            return getWindowRedrawClearDepth(contents) > 0;
        }

        function getWindowRedrawClearDepth(contents) {
            if (!contents) return 0;
            try { return Number(windowRedrawClearDepths.get(contents)) || 0; } catch (_) { return 0; }
        }

        function withWindowContents(windowInstance, contents, callback) {
            if (!windowInstance || !contents || typeof callback !== 'function') return undefined;
            if (windowInstance.contents === contents) return callback();
            const previous = windowInstance.contents;
            const hasInstalledAccessor = windowInstance._trWindowContentsAccessorInstalled === true
                && Object.prototype.hasOwnProperty.call(windowInstance, '_trWindowContentsValue');
            try {
                if (hasInstalledAccessor) windowInstance._trWindowContentsValue = contents;
                else windowInstance.contents = contents;
                return callback();
            } finally {
                if (hasInstalledAccessor) windowInstance._trWindowContentsValue = previous;
                else windowInstance.contents = previous;
            }
        }

        function isUsableBitmap(bitmap) {
            return !!(bitmap
                && Number.isFinite(Number(bitmap.width))
                && Number(bitmap.width) > 0
                && Number.isFinite(Number(bitmap.height))
                && Number(bitmap.height) > 0);
        }

        function getRedrawContents(windowInstance, entry = null) {
            if (windowInstance && isUsableBitmap(windowInstance.contents)) return windowInstance.contents;
            return null;
        }

        function wasDrawnToDetachedContents(windowInstance, entry) {
            return !!(windowInstance
                && entry
                && isUsableBitmap(entry.contentsBitmap)
                && isUsableBitmap(windowInstance.contents)
                && entry.contentsBitmap !== windowInstance.contents);
        }

        function getBitmapReplayApi() {
            try {
                const api = replayService.bitmapReplay;
                if (!api || typeof api !== 'object') return null;
                if (typeof api.hasProvider !== 'function' || api.hasProvider() !== true) return null;
                if (typeof api.ensureBitmapState !== 'function'
                    || typeof api.nextDrawOrder !== 'function'
                    || typeof api.collectReplayItems !== 'function'
                    || typeof api.replayBitmapItems !== 'function'
                    || typeof api.withBitmapReplay !== 'function'
                    || typeof api.rectFromDimensions !== 'function') {
                    return null;
                }
                return api;
            } catch (_) {
                return null;
            }
        }

        function assignWindowTextDrawOrder(contents, entry) {
            if (!contents || !entry) return;
            const replayApi = getBitmapReplayApi();
            if (!replayApi) return;
            try {
                const state = replayApi.ensureBitmapState(contents);
                if (state) entry.drawOrder = replayApi.nextDrawOrder(state);
            } catch (_) {}
        }

        function rememberInlineReplacement(input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            const replayApi = getBitmapReplayApi();
            if (!replayApi || typeof replayApi.rememberInlineReplacement !== 'function') return null;
            const surface = source.surface || source.bitmap || source.target || null;
            let generation = finiteNumber(source.generation, NaN);
            if (!Number.isFinite(generation) && surface && typeof replayApi.getSurfaceLedgerIdentity === 'function') {
                try {
                    const identity = replayApi.getSurfaceLedgerIdentity(surface);
                    generation = finiteNumber(identity && identity.revision, NaN);
                } catch (_) {}
            }
            try {
                return replayApi.rememberInlineReplacement(Object.assign({}, source, {
                    surface,
                    generation: Number.isFinite(generation) ? generation : 0,
                }));
            } catch (_) {
                return null;
            }
        }

        function resolveBitmapWindowData(bitmap) {
            if (!bitmap || typeof surfaceService.resolveWindowSurfaceForContents !== 'function') return null;
            const match = surfaceService.resolveWindowSurfaceForContents(bitmap);
            if (match && match.windowData) {
                return {
                    windowInstance: match.windowInstance || match.owner || null,
                    windowData: match.windowData,
                };
            }
            return null;
        }

        function windowEntryBelongsToContents(entry, contents) {
            if (typeof surfaceService.windowEntryBelongsToContents !== 'function') return false;
            return surfaceService.windowEntryBelongsToContents(entry, contents);
        }

        function finalizeWindowReplayBitmapDirty(bitmap, reason) {
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.markBitmapPixelsDirty !== 'function') return null;
            return bitmapDraws.markBitmapPixelsDirty(bitmap, {
                source: 'window-text-bitmap-replay',
                reason: String(reason || 'window-bitmap-replay'),
            });
        }

        function finiteNumber(value, fallback) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
        }

        return {
            withWindowRedrawClear,
            isWindowRedrawClearActive,
            withWindowContents,
            isUsableBitmap,
            getRedrawContents,
            wasDrawnToDetachedContents,
            getBitmapReplayApi,
            assignWindowTextDrawOrder,
            rememberInlineReplacement,
            resolveBitmapWindowData,
            windowEntryBelongsToContents,
            finalizeWindowReplayBitmapDirty,
        };
    }
            return { create: createBitmapReplayBindingsController };
        },
    });
})();
