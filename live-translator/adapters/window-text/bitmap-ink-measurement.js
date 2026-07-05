// Window text adapter support: bitmap ink measurement.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.bitmapInkMeasurement',
        requires: {
            measuredBounds: 'runtime.measuredBounds',
            bitmapGeometry: 'adapters.windowText.bitmapGeometry',
        },
        factory({ measuredBounds, bitmapGeometry }, { scope: globalScope }) {

    function createBitmapInkMeasurementController(context = {}) {
        const services = context.services || {};
        const drawService = services.draw || {};
        const replayService = services.replay || {};
        const snapshotService = services.snapshot || {};
        const MAX_BACKGROUND_SNAPSHOT_PIXELS = snapshotService.maxBackgroundSnapshotPixels;
        const applyBitmapDrawState = drawService.applyBitmapDrawState;
        const { isValidRect, getBitmapSnapshotContext } = bitmapGeometry.create(context);

    function firstFiniteNumber(...values) {
                for (let i = 0; i < values.length; i += 1) {
                    const numeric = Number(values[i]);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

    function firstPositiveNumber(...values) {
                for (let i = 0; i < values.length; i += 1) {
                    const numeric = Number(values[i]);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 0;
            }

    function firstNonNegativeNumber(...values) {
                for (let i = 0; i < values.length; i += 1) {
                    const numeric = Number(values[i]);
                    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
                }
                return 0;
            }

    function isBitmapSurfaceTextEntry(entry) {
                const origin = entry && entry.drawOrigin;
                return !!(origin && origin.type === 'bitmapSurface');
            }

    function measureCanvasTextMetrics(contents, text) {
                const canvasContext = contents ? (contents._context || contents.context || null) : null;
                if (!canvasContext || typeof canvasContext.measureText !== 'function') return null;
                const hadFont = Object.prototype.hasOwnProperty.call(canvasContext, 'font');
                const previousFont = canvasContext.font;
                let changedFont = false;
                try {
                    if (contents && typeof contents._makeFontNameText === 'function') {
                        canvasContext.font = contents._makeFontNameText();
                        changedFont = true;
                    }
                    const metrics = canvasContext.measureText(String(text || ''));
                    if (!metrics) return null;
                    return {
                        width: firstNonNegativeNumber(metrics.width, NaN),
                        ascent: Number.isFinite(Number(metrics.actualBoundingBoxAscent))
                            ? Number(metrics.actualBoundingBoxAscent)
                            : null,
                        descent: Number.isFinite(Number(metrics.actualBoundingBoxDescent))
                            ? Number(metrics.actualBoundingBoxDescent)
                            : null,
                    };
                } catch (_) {
                    return null;
                } finally {
                    if (changedFont) {
                        try {
                            if (hadFont) canvasContext.font = previousFont;
                            else delete canvasContext.font;
                        } catch (_) {}
                    }
                }
            }

    function measureBitmapTextWidth(contents, text) {
                return measuredBounds.measureBitmapTextWidth(contents, text);
            }

    function hasActualTextMetrics(metrics) {
                return !!(metrics
                    && Number.isFinite(Number(metrics.ascent))
                    && Number.isFinite(Number(metrics.descent)));
            }

    function calculateBitmapSurfaceTextYOffset(contents, entry, translatedText) {
                const params = entry && entry.originalParams ? entry.originalParams : null;
                if (!isBitmapSurfaceTextEntry(entry) || !params) return 0;
                const sourceText = String(entry.visibleText || entry.convertedText || entry.rawText || '');
                const renderedText = String(translatedText || entry.renderedText || '');
                if (!sourceText || !renderedText) return 0;
                const sourceMetrics = measureCanvasTextMetrics(contents, sourceText);
                const translatedMetrics = measureCanvasTextMetrics(contents, renderedText);
                const drawState = entry.drawState || {};
                const fontSize = firstPositiveNumber(drawState.fontSize, contents && contents.fontSize, params.fontSize, 24);
                const maxOffset = Math.max(2, fontSize * 0.4);
                let metricOffset = 0;
                if (hasActualTextMetrics(sourceMetrics) && hasActualTextMetrics(translatedMetrics)) {
                    const offset = Number(translatedMetrics.ascent) - Number(sourceMetrics.ascent);
                    if (Number.isFinite(offset) && Math.abs(offset) >= 0.01) {
                        metricOffset = measuredBounds.clampNumber(offset, -maxOffset, maxOffset);
                    }
                }
                const sourceTextWidth = firstPositiveNumber(
                    sourceMetrics && sourceMetrics.width,
                    measureBitmapTextWidth(contents, sourceText),
                    params.maxWidth
                );
                const sourceInkOffset = calculateBitmapSurfaceSourceInkYOffset(contents, entry, renderedText, fontSize, sourceTextWidth);
                const finalOffset = Number.isFinite(sourceInkOffset) ? sourceInkOffset : metricOffset;
                rememberBitmapSurfaceYOffsetSource(entry, Number.isFinite(sourceInkOffset)
                    ? 'sourceInk'
                    : (Math.abs(metricOffset) >= 0.01 ? 'metrics' : 'none'));
                return finalOffset;
            }

    function rememberBitmapSurfaceYOffsetSource(entry, source = '') {
                if (entry) {
                    try { entry.bitmapSurfaceYOffsetCache = { source: String(source || '') }; } catch (_) {}
                }
            }

    function calculateBitmapSurfaceSourceInkYOffset(contents, entry, renderedText, fontSize, sourceTextWidth = 0) {
                const sourceInk = measuredBounds.measureSnapshotInk(entry && entry.backgroundSnapshot, entry && entry.sourceSnapshot);
                const translatedInk = measureBitmapSurfaceRenderedInk(contents, entry, renderedText, fontSize, createBitmapCurrentDrawState(contents));
                return measuredBounds.calculateSourceAlignedYOffset({ sourceInk, translatedInk, fontSize, sourceTextWidth });
            }

    function createBitmapCurrentDrawState(contents) {
                if (!contents) return null;
                const state = {};
                [
                    'fontFace',
                    'fontSize',
                    'fontBold',
                    'fontItalic',
                    'textColor',
                    'outlineColor',
                    'outlineWidth',
                    'paintOpacity',
                ].forEach((key) => {
                    if (contents[key] !== undefined) state[key] = contents[key];
                });
                return state;
            }

    function measureBitmapSurfaceRenderedInk(contents, entry, text, fontSize, drawStateOverride = null) {
                const params = entry && entry.originalParams ? entry.originalParams : null;
                const BitmapCtor = globalScope && typeof globalScope.Bitmap === 'function' ? globalScope.Bitmap : null;
                if (!contents || !entry || !params || !BitmapCtor || !String(text || '')) return null;
                const drawState = drawStateOverride || entry.drawState || {};
                const position = entry.position || {};
                const existingBounds = isValidRect(entry.bounds) ? entry.bounds : null;
                const existingWidth = existingBounds
                    ? Math.abs(Number(existingBounds.x2) - Number(existingBounds.x1))
                    : 0;
                const activeFontSize = firstPositiveNumber(drawState.fontSize, fontSize, contents && contents.fontSize, 24);
                const lineHeight = firstPositiveNumber(params.lineHeight, activeFontSize, 24);
                const maxWidth = firstPositiveNumber(
                    params.maxWidth,
                    existingWidth,
                    measureBitmapTextWidth(contents, text),
                    String(text || '').length * activeFontSize,
                    1
                );
                const outline = Math.max(
                    0,
                    firstFiniteNumber(drawState.outlineWidth, contents && contents.outlineWidth, 0)
                );
                const horizontalPadding = Math.ceil(Math.max(outline * 2 + 4, activeFontSize));
                const verticalPadding = Math.ceil(Math.max(outline * 2 + 4, activeFontSize * 1.5, lineHeight));
                const width = Math.ceil(maxWidth + horizontalPadding * 2);
                const height = Math.ceil(lineHeight + verticalPadding * 2);
                if (width <= 0 || height <= 0) return null;
                if (width * height > MAX_BACKGROUND_SNAPSHOT_PIXELS) return null;
                let scratch = null;
                try {
                    scratch = createScratchBitmap(BitmapCtor, width, height);
                    if (!scratch || typeof scratch.drawText !== 'function') return null;
                    const scratchContext = getBitmapSnapshotContext(scratch);
                    if (!scratchContext) return null;
                    clearScratchBitmap(scratch, scratchContext, width, height);
                    if (applyBitmapDrawState) {
                        try { applyBitmapDrawState(scratch, drawState || {}); } catch (_) {}
                    }
                    const before = scratchContext.getImageData(0, 0, width, height);
                    // Skip translation hooks while still invoking the engine's native
                    // drawText implementation. The scratch bitmap is only a measuring
                    // surface and must not create adapter records.
                    withWindowPipelineGuard(scratch, () => {
                        withBitmapSkipAndSpriteReplayGuard(scratch, () => {
                            scratch.drawText(
                                text,
                                horizontalPadding,
                                verticalPadding,
                                maxWidth,
                                lineHeight,
                                String(params.align || 'left')
                            );
                        });
                    }, 'window-measurement');
                    const rendered = scratchContext.getImageData(0, 0, width, height);
                    const ink = measuredBounds.measureImageDataDifference(before, rendered, width, height);
                    if (!ink) return null;
                    return {
                        localBounds: ink,
                        worldBounds: {
                            x1: (Number(position.x) || 0) + ink.x1 - horizontalPadding,
                            y1: (Number(position.y) || 0) + ink.y1 - verticalPadding,
                            x2: (Number(position.x) || 0) + ink.x2 - horizontalPadding,
                            y2: (Number(position.y) || 0) + ink.y2 - verticalPadding,
                        },
                    };
                } catch (_) {
                    return null;
                }
            }

    function withBitmapSkipAndSpriteReplayGuard(bitmap, callback) {
                const bitmapDraws = replayService && replayService.bitmapDraws;
                if (!bitmapDraws || typeof bitmapDraws.withBitmapSkipAndSpriteReplayGuard !== 'function') {
                    throw new Error('[WindowText] bitmap replay guard service is required.');
                }
                return bitmapDraws.withBitmapSkipAndSpriteReplayGuard(bitmap, callback);
            }

    function withWindowPipelineGuard(bitmap, callback, source) {
                const bitmapDraws = replayService && replayService.bitmapDraws;
                if (!bitmapDraws || typeof bitmapDraws.withWindowPipelineGuard !== 'function') {
                    throw new Error('[WindowText] bitmap window-pipeline guard service is required.');
                }
                return bitmapDraws.withWindowPipelineGuard(bitmap, callback, source || 'window-pipeline');
            }

    function createScratchBitmap(BitmapCtor, width, height) {
                const scratch = new BitmapCtor(width, height);
                if (scratch && typeof scratch.resize === 'function'
                    && (Math.ceil(Number(scratch.width) || 0) !== width
                        || Math.ceil(Number(scratch.height) || 0) !== height)) {
                    try { scratch.resize(width, height); } catch (_) {}
                }
                return scratch || null;
            }

    function clearScratchBitmap(bitmap, canvasContext, width, height) {
                if (!bitmap) return;
                try {
                    if (typeof bitmap.clear === 'function') {
                        bitmap.clear();
                        return;
                    }
                } catch (_) {}
                try {
                    if (canvasContext && typeof canvasContext.clearRect === 'function') {
                        canvasContext.clearRect(0, 0, width, height);
                    }
                } catch (_) {}
            }

    function estimateBitmapSurfaceTextBounds(contents, entry, textOverride = null) {
                const params = entry && entry.originalParams ? entry.originalParams : null;
                if (!isBitmapSurfaceTextEntry(entry) || !params) return null;
                const position = entry.position || {};
                const existingBounds = isValidRect(entry.bounds) ? entry.bounds : null;
                const drawState = entry.drawState || {};
                const text = textOverride !== null && textOverride !== undefined
                    ? String(textOverride)
                    : String(entry.visibleText || entry.convertedText || entry.rawText || '');
                const metrics = measureCanvasTextMetrics(contents, text);
                const fontSize = firstPositiveNumber(drawState.fontSize, contents && contents.fontSize, params.fontSize, 24);
                return measuredBounds.createBitmapSurfaceTextBounds({
                    params,
                    position,
                    existingBounds,
                    drawState,
                    text,
                    metrics,
                    fontSize,
                    measuredTextWidth: measureBitmapTextWidth(contents, text),
                });
            }

        return Object.freeze({
            calculateBitmapSurfaceTextYOffset,
            estimateBitmapSurfaceTextBounds,
        });
    }
            return { create: createBitmapInkMeasurementController };
        },
    });

})();
