// Bitmap surface mutation proof helpers.
//
// Render execution needs exact pixel evidence when deciding whether a restore
// or draw really changed a bitmap. This module owns the sampling and proof
// shape so executors can consume mutation facts without owning pixel-probe
// mechanics.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.surfaceMutationProof',
        factory() {
            function captureBitmapSurfaceSample(bitmap, area) {
                const result = createEmptySurfaceSample();
                const context = getBitmapPixelContext(bitmap);
                if (!context || typeof context.getImageData !== 'function') {
                    result.error = 'context-unavailable';
                    return result;
                }
                const canvas = context && context.canvas || bitmap && (bitmap._canvas || bitmap.canvas) || null;
                if (!canvas) {
                    result.error = 'canvas-unavailable';
                    return result;
                }
                const rect = normalizeSurfaceSampleArea(area, bitmap, context);
                result.rect = rect;
                if (!rect || rect.width <= 0 || rect.height <= 0) {
                    result.error = 'empty-rect';
                    return result;
                }
                result.available = true;
                result.pixels = rect.width * rect.height;
                try {
                    const imageData = context.getImageData(rect.x, rect.y, rect.width, rect.height);
                    const data = imageData && imageData.data || [];
                    const stride = 1;
                    let checksum = 2166136261;
                    for (let index = 0; index < data.length; index += 4 * stride) {
                        const r = data[index] || 0;
                        const g = data[index + 1] || 0;
                        const b = data[index + 2] || 0;
                        const a = data[index + 3] || 0;
                        result.sampledPixels += 1;
                        if (a > 0) result.nonTransparent += 1;
                        result.alphaSum += a;
                        result.rgbSum += r + g + b;
                        checksum ^= r;
                        checksum = Math.imul(checksum, 16777619);
                        checksum ^= g;
                        checksum = Math.imul(checksum, 16777619);
                        checksum ^= b;
                        checksum = Math.imul(checksum, 16777619);
                        checksum ^= a;
                        checksum = Math.imul(checksum, 16777619);
                    }
                    result.readable = true;
                    result.stride = stride;
                    result.checksum = checksum >>> 0;
                } catch (error) {
                    result.error = error && error.message ? stringify(error.message) : stringify(error || 'getImageData-failed');
                }
                return result;
            }

            function compareSurfaceSamples(before, after) {
                const left = before || createEmptySurfaceSample();
                const right = after || createEmptySurfaceSample();
                const readable = left.readable === true && right.readable === true;
                return {
                    available: left.available === true || right.available === true,
                    readable,
                    changed: readable && (
                        left.checksum !== right.checksum
                        || left.alphaSum !== right.alphaSum
                        || left.rgbSum !== right.rgbSum
                        || left.nonTransparent !== right.nonTransparent
                    ),
                    beforeChecksum: positiveInteger(left.checksum),
                    afterChecksum: positiveInteger(right.checksum),
                    beforeAlphaSum: positiveInteger(left.alphaSum),
                    afterAlphaSum: positiveInteger(right.alphaSum),
                    beforeNonTransparent: positiveInteger(left.nonTransparent),
                    afterNonTransparent: positiveInteger(right.nonTransparent),
                    error: stringify(left.error || right.error || ''),
                    rect: left.rect || right.rect || null,
                };
            }

            function cloneSurfaceMutationProof(proof) {
                if (!proof || typeof proof !== 'object') return null;
                return {
                    available: proof.available === true,
                    readable: proof.readable === true,
                    changed: proof.changed === true,
                    beforeChecksum: positiveInteger(proof.beforeChecksum),
                    afterChecksum: positiveInteger(proof.afterChecksum),
                    beforeAlphaSum: positiveInteger(proof.beforeAlphaSum),
                    afterAlphaSum: positiveInteger(proof.afterAlphaSum),
                    beforeNonTransparent: positiveInteger(proof.beforeNonTransparent),
                    afterNonTransparent: positiveInteger(proof.afterNonTransparent),
                    error: stringify(proof.error || ''),
                    rect: cloneSurfaceSampleRect(proof.rect),
                };
            }

            function isReadableSurfaceMutationProof(proof) {
                return !!(proof && proof.readable === true);
            }

            function createEmptySurfaceSample() {
                return {
                    available: false,
                    readable: false,
                    rect: null,
                    pixels: 0,
                    sampledPixels: 0,
                    stride: 1,
                    checksum: 0,
                    alphaSum: 0,
                    rgbSum: 0,
                    nonTransparent: 0,
                    error: '',
                };
            }

            function normalizeSurfaceSampleArea(area, bitmap, context) {
                const canvas = context && context.canvas || bitmap && (bitmap._canvas || bitmap.canvas) || null;
                const width = positiveInteger(bitmap && bitmap.width)
                    || positiveInteger(canvas && canvas.width)
                    || positiveInteger(context && context.canvas && context.canvas.width);
                const height = positiveInteger(bitmap && bitmap.height)
                    || positiveInteger(canvas && canvas.height)
                    || positiveInteger(context && context.canvas && context.canvas.height);
                if (!width || !height) return null;
                const source = area && typeof area === 'object' ? area : {};
                const hasRectBounds = Number.isFinite(Number(source.x1))
                    || Number.isFinite(Number(source.y1))
                    || Number.isFinite(Number(source.x2))
                    || Number.isFinite(Number(source.y2));
                const rawX = hasRectBounds ? source.x1 : source.x;
                const rawY = hasRectBounds ? source.y1 : source.y;
                const rawWidth = hasRectBounds ? Number(source.x2) - Number(source.x1) : (source.w !== undefined ? source.w : source.width);
                const rawHeight = hasRectBounds ? Number(source.y2) - Number(source.y1) : (source.h !== undefined ? source.h : source.height);
                const x = clampSampleInteger(rawX, 0, width);
                const y = clampSampleInteger(rawY, 0, height);
                const rectWidth = clampSampleInteger(rawWidth, width - x, width - x);
                const rectHeight = clampSampleInteger(rawHeight, height - y, height - y);
                return {
                    x,
                    y,
                    width: Math.max(0, Math.min(rectWidth, width - x)),
                    height: Math.max(0, Math.min(rectHeight, height - y)),
                };
            }

            function cloneSurfaceSampleRect(rect) {
                if (!rect || typeof rect !== 'object') return null;
                return {
                    x: positiveInteger(rect.x),
                    y: positiveInteger(rect.y),
                    width: positiveInteger(rect.width),
                    height: positiveInteger(rect.height),
                };
            }

            function getBitmapPixelContext(bitmap) {
                return bitmap && (bitmap._context || bitmap.context) || null;
            }

            function clampSampleInteger(value, fallback, maxValue) {
                const numeric = Number(value);
                const normalized = Number.isFinite(numeric) ? Math.floor(numeric) : Math.floor(Number(fallback) || 0);
                return Math.max(0, Math.min(normalized, Math.max(0, Math.floor(Number(maxValue) || 0))));
            }

            function positiveInteger(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                captureBitmapSurfaceSample,
                compareSurfaceSamples,
                cloneSurfaceMutationProof,
                isReadableSurfaceMutationProof,
            });
        },
    });
})();
