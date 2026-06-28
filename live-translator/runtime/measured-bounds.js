// Shared measured-bounds helpers for text redraw and replay surfaces.
//
// This module owns deterministic geometry derived from draw arguments, bitmap
// text state, and raw bitmap pixel comparisons.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.measuredBounds',
        factory() {
            function createBitmapTextInkRegion(input = {}) {
                const bitmap = input.bitmap || null;
                if (!bitmap || !hasVisibleText(input)) return null;
                const surface = getBitmapSurfaceSize(bitmap);
                if (!surface) return null;

                const measuredWidth = measureBitmapTextWidth(bitmap, input.text);
                const drawWidth = resolveBitmapTextDrawWidth(measuredWidth, input.maxWidth);
                if (!drawWidth) return null;

                const outline = Math.max(0, finiteNumber(bitmap.outlineWidth, 0) + 2);
                const fontSize = positiveNumber(bitmap.fontSize, 24);
                const textX = resolveAlignedTextX(input.x, input.maxWidth, drawWidth, input.align);
                const textY = finiteNumber(input.y, 0);
                const lineHeight = positiveNumber(input.lineHeight, fontSize, 24);
                const horizontalPadding = Math.max(outline, Math.ceil(fontSize * 0.25));
                const ink = estimateBitmapTextInkEnvelope(textY, lineHeight, fontSize);

                return clipRectToSurface({
                    x1: Math.floor(textX - horizontalPadding),
                    y1: Math.floor(ink.y1 - outline),
                    x2: Math.ceil(textX + drawWidth + horizontalPadding),
                    y2: Math.ceil(ink.y2 + outline),
                }, surface);
            }

            function createBitmapTextBackdropRegion(input = {}) {
                const bitmap = input.bitmap || null;
                if (!bitmap || !hasVisibleText(input)) return null;
                const surface = getBitmapSurfaceSize(bitmap);
                if (!surface) return null;

                const measuredWidth = measureBitmapTextWidth(bitmap, input.text);
                const drawWidth = resolveBitmapBackdropWidth(measuredWidth, input.maxWidth);
                if (!drawWidth) return null;

                const outline = Math.max(1, finiteNumber(bitmap.outlineWidth, 1) + 1);
                const fontSize = positiveNumber(bitmap.fontSize, input.lineHeight, 24);
                const lineHeight = positiveNumber(input.lineHeight, fontSize, 24);
                const topPad = Math.min(outline, Math.ceil(fontSize * 0.08));
                const bottomPad = Math.max(outline, Math.ceil(fontSize * 0.25));
                const x1 = Math.max(0, Math.floor(finiteNumber(input.x, 0) - outline));
                const y1 = Math.max(0, Math.floor(finiteNumber(input.y, 0) - topPad));
                const width = Math.ceil(drawWidth + outline * 2);
                const height = Math.ceil(lineHeight + topPad + bottomPad);
                const clippedWidth = Math.min(surface.width, width, Math.max(0, surface.width - x1));
                const clippedHeight = Math.min(surface.height, height, Math.max(0, surface.height - y1));
                if (clippedWidth <= 0 || clippedHeight <= 0) return null;
                return {
                    x1,
                    y1,
                    x2: x1 + clippedWidth,
                    y2: y1 + clippedHeight,
                };
            }

            function createBitmapSurfaceTextBounds(input = {}) {
                const params = input.params && typeof input.params === 'object' ? input.params : {};
                const position = input.position && typeof input.position === 'object' ? input.position : {};
                const existingBounds = isFiniteRect(input.existingBounds) ? input.existingBounds : null;
                const existingWidth = existingBounds
                    ? Math.abs(Number(existingBounds.x2) - Number(existingBounds.x1))
                    : 0;
                const existingHeight = existingBounds
                    ? Math.abs(Number(existingBounds.y2) - Number(existingBounds.y1))
                    : 0;
                const metrics = input.metrics && typeof input.metrics === 'object' ? input.metrics : {};
                const drawState = input.drawState && typeof input.drawState === 'object' ? input.drawState : {};
                const fontSize = positiveNumber(input.fontSize, drawState.fontSize, params.fontSize, 24);
                const lineHeight = positiveNumber(params.lineHeight, input.lineHeight, existingHeight, fontSize, 24);
                const textWidth = positiveNumber(metrics.width, input.measuredTextWidth, existingWidth, 1);
                const maxWidth = positiveNumber(params.maxWidth, input.maxWidth, existingWidth, textWidth, 1);
                const x = finiteNumber(position.x, existingBounds ? Number(existingBounds.x1) : 0);
                const y = finiteNumber(position.y, existingBounds ? Number(existingBounds.y1) : 0);
                const ascent = Math.max(nonNegativeNumber(metrics.ascent, 0), fontSize * 1.15);
                const descent = Math.max(nonNegativeNumber(metrics.descent, 0), fontSize * 0.25);
                const baseline = y + lineHeight / 2 + fontSize * 0.35;
                const bounds = {
                    x1: x,
                    y1: Math.min(y, baseline - ascent),
                    x2: x + maxWidth,
                    y2: Math.max(y + lineHeight, baseline + descent),
                };
                return isFiniteRect(bounds) ? bounds : null;
            }

            function createRedrawBounds(input = {}) {
                const position = input.position && typeof input.position === 'object' ? input.position : {};
                let mergedBounds = cloneFiniteRect(input.baseBounds) || {
                    x1: finiteNumber(position.x, 0),
                    y1: finiteNumber(position.y, 0),
                    x2: finiteNumber(position.x, 0),
                    y2: finiteNumber(position.y, 0),
                };
                const bitmapSurfaceOriginalBounds = cloneFiniteRect(input.bitmapSurfaceOriginalBounds);
                mergedBounds = mergeFiniteRects(mergedBounds, bitmapSurfaceOriginalBounds) || mergedBounds;
                const originalBounds = cloneFiniteRect(mergedBounds);

                const translatedBounds = mergeFiniteRects(input.translatedBounds, input.bitmapSurfaceTranslatedBounds);
                mergedBounds = mergeFiniteRects(mergedBounds, translatedBounds) || mergedBounds;

                const minimumHeight = Math.max(
                    0,
                    finiteNumber(input.calcTextHeight, 0),
                    finiteNumber(input.minimumHeight, 0)
                );
                const clearArea = createPaddedClearArea({
                    bounds: mergedBounds,
                    surface: input.surface,
                    outline: input.outline,
                    minimumHeight,
                });

                return {
                    clearArea,
                    originalBounds,
                    translatedBounds: cloneFiniteRect(translatedBounds),
                    bitmapSurfaceOriginalBounds,
                    bitmapSurfaceTranslatedBounds: cloneFiniteRect(input.bitmapSurfaceTranslatedBounds),
                    bitmapSurfaceYOffset: finiteNumber(input.bitmapSurfaceYOffset, 0),
                    mergedBounds: cloneFiniteRect(mergedBounds),
                    calcTextHeight: Number.isFinite(Number(input.calcTextHeight)) ? Number(input.calcTextHeight) : null,
                };
            }

            function createPaddedClearArea(input = {}) {
                const bounds = input.bounds;
                const surface = input.surface && typeof input.surface === 'object' ? input.surface : {};
                if (!isFiniteRect(bounds)) return null;
                const surfaceWidth = Math.max(0, Math.floor(Number(surface.width) || 0));
                const surfaceHeight = Math.max(0, Math.floor(Number(surface.height) || 0));
                if (surfaceWidth <= 0 || surfaceHeight <= 0) return null;

                const outline = Math.max(0, finiteNumber(input.outline, 0));
                let minX = Math.min(Number(bounds.x1), Number(bounds.x2));
                let minY = Math.min(Number(bounds.y1), Number(bounds.y2));
                let maxX = Math.max(Number(bounds.x1), Number(bounds.x2));
                let maxY = Math.max(Number(bounds.y1), Number(bounds.y2));
                const minimumHeight = finiteNumber(input.minimumHeight, 0);
                if (minimumHeight > 0 && maxY - minY < minimumHeight) maxY = minY + minimumHeight;

                const paddedX1 = Math.floor(minX - outline);
                const paddedY1 = Math.floor(minY - outline);
                const paddedX2 = Math.ceil(maxX + outline);
                const paddedY2 = Math.ceil(maxY + outline);

                const clearX = Math.max(0, Math.min(surfaceWidth, paddedX1));
                const clearY = Math.max(0, Math.min(surfaceHeight, paddedY1));
                const clearRight = Math.max(clearX, Math.min(surfaceWidth, paddedX2));
                const clearBottom = Math.max(clearY, Math.min(surfaceHeight, paddedY2));
                const clearW = clearRight - clearX;
                const clearH = clearBottom - clearY;
                return clearW > 0 && clearH > 0 ? { x: clearX, y: clearY, w: clearW, h: clearH } : null;
            }

            function measureSnapshotInk(background, source, options = {}) {
                const diagnostics = measureSnapshotInkDiagnostics(background, source, options);
                if (!diagnostics.available || !diagnostics.changed) return null;
                return {
                    localBounds: cloneFiniteRect(diagnostics.localBounds),
                    worldBounds: cloneFiniteRect(diagnostics.worldBounds),
                    pixelCount: diagnostics.pixelCount,
                };
            }

            function measureSnapshotInkDiagnostics(background, source, options = {}) {
                if (!background || !source) {
                    return { available: false, reason: 'missingSnapshots' };
                }
                const width = Math.max(0, Math.floor(Number(source.w) || 0));
                const height = Math.max(0, Math.floor(Number(source.h) || 0));
                if (width <= 0 || height <= 0) {
                    return { available: false, reason: 'emptyArea' };
                }
                if (background.x !== source.x || background.y !== source.y
                    || background.w !== source.w || background.h !== source.h) {
                    return {
                        available: false,
                        reason: 'areaMismatch',
                        backgroundArea: cloneArea(background),
                        sourceArea: cloneArea(source),
                    };
                }
                const areaPixels = width * height;
                if (!Number.isFinite(areaPixels) || areaPixels <= 0) {
                    return { available: false, reason: 'invalidArea' };
                }
                const requestedMaxPixels = Number(options.maxPixels);
                const maxPixels = Number.isFinite(requestedMaxPixels) && requestedMaxPixels > 0
                    ? requestedMaxPixels
                    : Infinity;
                if (areaPixels > maxPixels) {
                    return {
                        available: false,
                        reason: 'tooLarge',
                        area: cloneArea(source),
                        areaPixels,
                    };
                }
                const backgroundData = background.imageData && background.imageData.data;
                const sourceData = source.imageData && source.imageData.data;
                if (!backgroundData || !sourceData) {
                    return {
                        available: false,
                        reason: 'unavailablePixelData',
                        area: cloneArea(source),
                    };
                }
                const expectedBytes = areaPixels * 4;
                if (Number(backgroundData.length) < expectedBytes || Number(sourceData.length) < expectedBytes) {
                    return {
                        available: false,
                        reason: 'shortPixelData',
                        area: cloneArea(source),
                        expectedBytes,
                        backgroundBytes: Number(backgroundData.length) || 0,
                        sourceBytes: Number(sourceData.length) || 0,
                    };
                }

                const difference = measureImageDataDifferenceDetails(background.imageData, source.imageData, width, height);
                if (!difference || !difference.pixelCount) {
                    return {
                        available: true,
                        changed: false,
                        area: cloneArea(source),
                        pixelCount: 0,
                        localBounds: null,
                        worldBounds: null,
                        touches: { left: false, top: false, right: false, bottom: false },
                        edgeSlack: { left: width, top: height, right: width, bottom: height },
                    };
                }
                const localBounds = difference.localBounds;
                return {
                    available: true,
                    changed: true,
                    area: cloneArea(source),
                    pixelCount: difference.pixelCount,
                    localBounds: cloneFiniteRect(localBounds),
                    worldBounds: cloneFiniteRect({
                        x1: Number(source.x) + Number(localBounds.x1),
                        y1: Number(source.y) + Number(localBounds.y1),
                        x2: Number(source.x) + Number(localBounds.x2),
                        y2: Number(source.y) + Number(localBounds.y2),
                    }),
                    touches: difference.touches,
                    edgeSlack: difference.edgeSlack,
                };
            }

            function calculateSourceAlignedYOffset(input = {}) {
                const sourceInk = input.sourceInk || null;
                const translatedInk = input.translatedInk || null;
                const sourceTop = sourceInk && sourceInk.worldBounds
                    ? Number(sourceInk.worldBounds.y1)
                    : NaN;
                const translatedTop = translatedInk && translatedInk.worldBounds
                    ? Number(translatedInk.worldBounds.y1)
                    : NaN;
                if (!Number.isFinite(sourceTop) || !Number.isFinite(translatedTop)) return null;
                const fontSize = positiveNumber(input.fontSize, 0);
                const maxOffset = positiveNumber(input.maxOffset, Math.max(4, fontSize * 0.75), 4);
                // Top-align only comparable ink bands. If the source is much taller, it
                // must also cover enough of the expected source text width to prove this
                // is a full text band rather than a narrow copied slice or stray pixels.
                if (!areAlignedInkBandsComparable(sourceInk, translatedInk, fontSize, input.sourceTextWidth)) return null;
                const offset = sourceTop - translatedTop;
                if (!Number.isFinite(offset) || Math.abs(offset) < 0.01) return 0;
                return clampNumber(offset, -maxOffset, maxOffset);
            }

            function areAlignedInkBandsComparable(sourceInk, translatedInk, fontSize, sourceTextWidth) {
                const sourceHeight = getInkWorldHeight(sourceInk);
                const translatedHeight = getInkWorldHeight(translatedInk);
                if (!Number.isFinite(sourceHeight) || !Number.isFinite(translatedHeight)) return true;
                const maxHeightDelta = Math.max(4, positiveNumber(fontSize, 0) * 0.35);
                if (Math.abs(sourceHeight - translatedHeight) <= maxHeightDelta) return true;
                return isSourceInkWidthRepresentative(sourceInk, sourceTextWidth, fontSize);
            }

            function getInkWorldHeight(ink) {
                const bounds = ink && ink.worldBounds;
                if (!isFiniteRect(bounds)) return NaN;
                return Math.abs(Number(bounds.y2) - Number(bounds.y1));
            }

            function isSourceInkWidthRepresentative(sourceInk, sourceTextWidth, fontSize) {
                const sourceWidth = getInkWorldWidth(sourceInk);
                const expectedWidth = positiveNumber(sourceTextWidth, 0);
                if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || expectedWidth <= 0) return false;
                const minCoverageWidth = Math.min(expectedWidth * 0.45, expectedWidth - Math.max(2, fontSize * 0.25));
                return sourceWidth >= Math.max(1, minCoverageWidth);
            }

            function getInkWorldWidth(ink) {
                const bounds = ink && ink.worldBounds;
                if (!isFiniteRect(bounds)) return NaN;
                return Math.abs(Number(bounds.x2) - Number(bounds.x1));
            }

            function hasVisibleText(input) {
                const visible = input.visibleText !== undefined ? input.visibleText : input.text;
                return String(visible ?? '').trim().length > 0;
            }

            function getBitmapSurfaceSize(bitmap) {
                const width = Math.max(0, Math.ceil(Number(bitmap && bitmap.width) || 0));
                const height = Math.max(0, Math.ceil(Number(bitmap && bitmap.height) || 0));
                return width > 0 && height > 0 ? { width, height } : null;
            }

            function estimateBitmapTextInkEnvelope(textY, lineHeight, fontSize) {
                // Bitmap.drawText positions glyphs around a computed baseline, not
                // strictly inside y..y+lineHeight. Short line heights can put native ink
                // well above y, so clear/source regions use the font envelope.
                const baseline = textY + lineHeight / 2 + fontSize * 0.35;
                return {
                    y1: Math.min(textY, baseline - fontSize * 1.4),
                    y2: Math.max(textY + lineHeight, baseline + fontSize * 0.45),
                };
            }

            function measureBitmapTextWidth(bitmap, text) {
                try {
                    if (bitmap && typeof bitmap.measureTextWidth === 'function') {
                        const measured = Number(bitmap.measureTextWidth(String(text ?? '')));
                        if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
                    }
                } catch (_) {}
                const fontSize = positiveNumber(bitmap && bitmap.fontSize, 24);
                return Math.max(1, Math.ceil(String(text ?? '').length * Math.max(6, fontSize * 0.6)));
            }

            function measureImageDataDifference(background, foreground, width, height) {
                const details = measureImageDataDifferenceDetails(background, foreground, width, height);
                return details && details.pixelCount ? details.localBounds : null;
            }

            function measureImageDataDifferenceDetails(background, foreground, width, height) {
                const backgroundData = background && background.data;
                const foregroundData = foreground && foreground.data;
                const surfaceWidth = Math.max(0, Math.floor(Number(width) || 0));
                const surfaceHeight = Math.max(0, Math.floor(Number(height) || 0));
                if (!backgroundData || !foregroundData || surfaceWidth <= 0 || surfaceHeight <= 0) return null;
                const expectedBytes = surfaceWidth * surfaceHeight * 4;
                if (Number(backgroundData.length) < expectedBytes || Number(foregroundData.length) < expectedBytes) return null;

                let x1 = surfaceWidth;
                let y1 = surfaceHeight;
                let x2 = -1;
                let y2 = -1;
                let pixelCount = 0;
                for (let y = 0; y < surfaceHeight; y += 1) {
                    for (let x = 0; x < surfaceWidth; x += 1) {
                        const index = (y * surfaceWidth + x) * 4;
                        if (backgroundData[index] === foregroundData[index]
                            && backgroundData[index + 1] === foregroundData[index + 1]
                            && backgroundData[index + 2] === foregroundData[index + 2]
                            && backgroundData[index + 3] === foregroundData[index + 3]) {
                            continue;
                        }
                        if (x < x1) x1 = x;
                        if (y < y1) y1 = y;
                        if (x > x2) x2 = x;
                        if (y > y2) y2 = y;
                        pixelCount += 1;
                    }
                }
                if (!pixelCount) {
                    return {
                        pixelCount: 0,
                        localBounds: null,
                        touches: { left: false, top: false, right: false, bottom: false },
                        edgeSlack: { left: surfaceWidth, top: surfaceHeight, right: surfaceWidth, bottom: surfaceHeight },
                    };
                }
                return {
                    pixelCount,
                    localBounds: { x1, y1, x2: x2 + 1, y2: y2 + 1 },
                    touches: {
                        left: x1 === 0,
                        top: y1 === 0,
                        right: x2 === surfaceWidth - 1,
                        bottom: y2 === surfaceHeight - 1,
                    },
                    edgeSlack: {
                        left: x1,
                        top: y1,
                        right: Math.max(0, surfaceWidth - (x2 + 1)),
                        bottom: Math.max(0, surfaceHeight - (y2 + 1)),
                    },
                };
            }

            function resolveBitmapTextDrawWidth(measuredWidth, maxWidth) {
                const measured = Number(measuredWidth);
                const limit = Number(maxWidth);
                if (!Number.isFinite(measured) || measured <= 0) return 0;
                if (Number.isFinite(limit) && limit > 0) return Math.max(1, Math.min(Math.ceil(limit), Math.ceil(measured)));
                return Math.max(1, Math.ceil(measured));
            }

            function resolveBitmapBackdropWidth(measuredWidth, maxWidth) {
                const measured = Number(measuredWidth);
                const limit = Number(maxWidth);
                if (!Number.isFinite(measured) || measured <= 0) return 0;
                if (Number.isFinite(limit) && limit > 0) return Math.max(1, Math.max(Math.ceil(limit), Math.ceil(measured)));
                return Math.max(1, Math.ceil(measured));
            }

            function resolveAlignedTextX(x, maxWidth, drawWidth, align) {
                const originX = finiteNumber(x, 0);
                const boxWidth = positiveNumber(maxWidth, drawWidth, 1);
                const textWidth = positiveNumber(drawWidth, 1);
                const normalizedAlign = String(align || '').toLowerCase();
                if (normalizedAlign === 'right' || normalizedAlign === 'end') return originX + Math.max(0, boxWidth - textWidth);
                if (normalizedAlign === 'center') return originX + Math.max(0, (boxWidth - textWidth) / 2);
                return originX;
            }

            function clipRectToSurface(rect, surface) {
                if (!rect || !surface) return null;
                const x1 = Math.max(0, Math.floor(Number(rect.x1) || 0));
                const y1 = Math.max(0, Math.floor(Number(rect.y1) || 0));
                const x2 = Math.min(surface.width, Math.ceil(Number(rect.x2) || 0));
                const y2 = Math.min(surface.height, Math.ceil(Number(rect.y2) || 0));
                return x2 > x1 && y2 > y1 ? { x1, y1, x2, y2 } : null;
            }

            function isFiniteRect(rect) {
                return !!(rect
                    && Number.isFinite(Number(rect.x1))
                    && Number.isFinite(Number(rect.y1))
                    && Number.isFinite(Number(rect.x2))
                    && Number.isFinite(Number(rect.y2)));
            }

            function cloneFiniteRect(rect) {
                if (!isFiniteRect(rect)) return null;
                return {
                    x1: Number(rect.x1),
                    y1: Number(rect.y1),
                    x2: Number(rect.x2),
                    y2: Number(rect.y2),
                };
            }

            function mergeFiniteRects(left, right) {
                const a = cloneFiniteRect(left);
                const b = cloneFiniteRect(right);
                if (!a) return b;
                if (!b) return a;
                return {
                    x1: Math.min(a.x1, b.x1),
                    y1: Math.min(a.y1, b.y1),
                    x2: Math.max(a.x2, b.x2),
                    y2: Math.max(a.y2, b.y2),
                };
            }

            function isRectWithArea(rect) {
                return !!(rect
                    && Number.isFinite(Number(rect.x1))
                    && Number.isFinite(Number(rect.y1))
                    && Number.isFinite(Number(rect.x2))
                    && Number.isFinite(Number(rect.y2))
                    && Number(rect.x2) > Number(rect.x1)
                    && Number(rect.y2) > Number(rect.y1));
            }

            function cloneRect(rect) {
                if (!isRectWithArea(rect)) return null;
                return {
                    x1: Number(rect.x1),
                    y1: Number(rect.y1),
                    x2: Number(rect.x2),
                    y2: Number(rect.y2),
                };
            }

            function cloneArea(area) {
                if (!area) return null;
                const x = Number(area.x);
                const y = Number(area.y);
                const w = Number(area.w);
                const h = Number(area.h);
                if (![x, y, w, h].every(Number.isFinite)) return null;
                return { x, y, w, h };
            }

            function rectsOverlap(left, right) {
                return isRectWithArea(left)
                    && isRectWithArea(right)
                    && Number(left.x1) < Number(right.x2)
                    && Number(left.x2) > Number(right.x1)
                    && Number(left.y1) < Number(right.y2)
                    && Number(left.y2) > Number(right.y1);
            }

            function rectContains(outer, inner) {
                return isRectWithArea(outer)
                    && isRectWithArea(inner)
                    && Number(outer.x1) <= Number(inner.x1)
                    && Number(outer.y1) <= Number(inner.y1)
                    && Number(outer.x2) >= Number(inner.x2)
                    && Number(outer.y2) >= Number(inner.y2);
            }

            function finiteNumber(value, fallback = 0) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : fallback;
            }

            function nonNegativeNumber(value, fallback = 0) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            }

            function clampNumber(value, min, max) {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return 0;
                return Math.max(min, Math.min(max, numeric));
            }

            function positiveNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 0;
            }

            return {
                createBitmapTextInkRegion,
                createBitmapTextBackdropRegion,
                createBitmapSurfaceTextBounds,
                createRedrawBounds,
                createPaddedClearArea,
                estimateBitmapTextInkEnvelope,
                measureImageDataDifference,
                measureImageDataDifferenceDetails,
                measureSnapshotInk,
                measureSnapshotInkDiagnostics,
                calculateSourceAlignedYOffset,
                measureBitmapTextWidth,
                resolveAlignedTextX,
                resolveBitmapTextDrawWidth,
                resolveBitmapBackdropWidth,
                clipRectToSurface,
                isFiniteRect,
                cloneFiniteRect,
                mergeFiniteRects,
                isRectWithArea,
                cloneRect,
                cloneArea,
                rectsOverlap,
                rectContains,
                finiteNumber,
                nonNegativeNumber,
                clampNumber,
                positiveNumber,
            };
        },
    });
})();
