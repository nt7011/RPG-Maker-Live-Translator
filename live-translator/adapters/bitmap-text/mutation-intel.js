// Bitmap text adapter support: mutation intel.
// Mutation wrappers live in mutations.js; timing attribution and labels live here.
(() => {
    'use strict';

    function createController(scope = {}) {
        const { getBitmapState } = scope.controllerFacades.replay;
        const { describeBitmapContentsOwnership, resolveBitmapWindowSurface } = scope.controllerFacades.textUtils;

        function recordMutationHookDecision(methodName, options = {}) {
            const profilerOn = options.profilerOn === true;
            if (!profilerOn) return;
            const observeMutation = options.observeMutation === true;
            const bypassReason = options.bypassReason || '';
            const bypassMutation = !!bypassReason;
            if (observeMutation) {
                scope.perf.count('bitmap.mutation.calls');
                scope.perf.top('bitmap.mutation.method', methodName);
                return;
            }
            scope.perf.count(bypassMutation ? 'bitmap.mutation.bypassed' : 'bitmap.mutation.ignored');
            if (bypassMutation) {
                scope.perf.top('bitmap.mutation.bypassMethod', methodName);
                scope.perf.top('bitmap.mutation.bypassReason', bypassReason);
            } else {
                scope.perf.top('bitmap.mutation.ignoredMethod', methodName);
            }
        }

        function recordNativeMutationAttribution(bitmap, methodName, nativeMs, bypassReason) {
            if (!Number.isFinite(nativeMs) || nativeMs < 0) return;
            const methodLabel = sanitizePerfLabel(methodName || 'unknown');
            const surface = classifyBitmapMutationSurface(bitmap, bypassReason);
            scope.perf.top('bitmap.mutation.nativeTime.method', methodLabel, nativeMs);
            scope.perf.top('bitmap.mutation.nativeTime.surface', surface, nativeMs);
            scope.perf.top('bitmap.mutation.surface', surface);
            scope.perf.top('bitmap.mutation.sizeBucket', bucketBitmapPixels(bitmap));
            scope.perf.top('bitmap.mutation.dimensionBucket', bucketBitmapDimensions(bitmap));
            scope.perf.time(`bitmap.mutation.native.method.${methodLabel}.ms`, nativeMs);
            scope.perf.time(`bitmap.mutation.native.surface.${sanitizePerfLabel(surface)}.ms`, nativeMs);
        }

        function classifyBitmapMutationSurface(bitmap, bypassReason) {
            if (bypassReason) return String(bypassReason);
            if (!bitmap) return 'no-bitmap';
            const spriteSurface = describeSpriteBitmapSurface(bitmap);
            if (spriteSurface && spriteSurface.kind === 'sprite-overlay') return 'sprite-overlay';
            const contentsOwnership = describeBitmapContentsOwnership(bitmap);
            if (contentsOwnership && (contentsOwnership.surfaceType === 'message' || contentsOwnership.role === 'message-contents')) return 'message';
            if (resolveBitmapWindowSurface(bitmap)) return 'window';
            const guardState = scope.bitmapServices.getRenderGuardState(bitmap);
            if (guardState && guardState.windowPipelineDepth > 0) return 'window';
            if (spriteSurface && spriteSurface.kind === 'sprite-text-interest') return 'sprite-text-interest';
            if (spriteSurface && spriteSurface.kind === 'sprite-owned') return 'sprite-owned';
            if (getBitmapState(bitmap)) return 'bitmap-fallback-state';
            return 'untracked';
        }

        function describeSpriteBitmapSurface(bitmap) {
            if (!scope.bitmapServices || typeof scope.bitmapServices.describeSurface !== 'function') {
                return null;
            }
            try {
                const description = scope.bitmapServices.describeSurface(bitmap, {
                    adapterId: 'sprite',
                    reason: 'mutation-intel',
                });
                return description && typeof description === 'object' ? description : null;
            } catch (_) {
                return null;
            }
        }

        function bucketBitmapPixels(bitmap) {
            const width = Math.max(0, Number(bitmap && bitmap.width) || 0);
            const height = Math.max(0, Number(bitmap && bitmap.height) || 0);
            const pixels = width * height;
            if (!pixels) return '0';
            if (pixels <= 4096) return '<=4k';
            if (pixels <= 16384) return '4k-16k';
            if (pixels <= 65536) return '16k-64k';
            if (pixels <= 262144) return '64k-256k';
            return '>256k';
        }

        function bucketBitmapDimensions(bitmap) {
            const width = Math.max(0, Number(bitmap && bitmap.width) || 0);
            const height = Math.max(0, Number(bitmap && bitmap.height) || 0);
            if (!width || !height) return '0x0';
            return `${bucketDimension(width)}x${bucketDimension(height)}`;
        }

        function bucketDimension(value) {
            const number = Math.max(0, Number(value) || 0);
            if (number <= 32) return '<=32';
            if (number <= 64) return '33-64';
            if (number <= 128) return '65-128';
            if (number <= 256) return '129-256';
            if (number <= 512) return '257-512';
            if (number <= 1024) return '513-1024';
            return '>1024';
        }

        function sanitizePerfLabel(value) {
            return String(value || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 48) || 'unknown';
        }

        return {
            recordMutationHookDecision,
            recordNativeMutationAttribution,
            classifyBitmapMutationSurface,
            bucketBitmapPixels,
            bucketBitmapDimensions,
            bucketDimension,
            sanitizePerfLabel,
        };
    }

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutationIntel',
        factory() {
            return { create: createController };
        },
    });
})();
