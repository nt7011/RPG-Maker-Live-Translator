// Window text adapter support: bitmap diagnostics and geometry.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.bitmapDiagnostics',
        requires: {
            measuredBounds: 'runtime.measuredBounds',
            drawGraph: 'runtime.drawGraph',
        },
        factory({ measuredBounds, drawGraph }, { scope: globalScope }) {


    function createBitmapDiagnosticsController(context = {}) {
        const { draw: drawService, replay: replayService, snapshot: snapshotService } = context.services;
        const { entryRecords } = context.facades;
        const preview = drawService.preview || ((text) => String(text ?? ''));
        const MAX_BACKGROUND_SNAPSHOT_PIXELS = snapshotService.maxBackgroundSnapshotPixels;
        const REDRAW_DIAGNOSTIC_ITEM_LIMIT = snapshotService.redrawDiagnosticItemLimit;
        const getEntryStatus = (...args) => entryRecords.getEntryStatus(...args);
        const applyBitmapDrawState = drawService.applyBitmapDrawState;

    function mergeBounds(a, b) {
                if (isValidRect(a) && isValidRect(b)) {
                    return {
                        x1: Math.min(a.x1, b.x1),
                        y1: Math.min(a.y1, b.y1),
                        x2: Math.max(a.x2, b.x2),
                        y2: Math.max(a.y2, b.y2),
                    };
                }
                return isValidRect(a) ? a : (isValidRect(b) ? b : null);
            }

    function isValidRect(rect) {
                return !!(rect
                    && Number.isFinite(Number(rect.x1))
                    && Number.isFinite(Number(rect.y1))
                    && Number.isFinite(Number(rect.x2))
                    && Number.isFinite(Number(rect.y2)));
            }

    function roundDiagnosticNumber(value) {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return null;
                return Math.round(numeric * 1000) / 1000;
            }

    function cloneDiagnosticRect(rect) {
                if (!rect) return null;
                const x1 = roundDiagnosticNumber(rect.x1);
                const y1 = roundDiagnosticNumber(rect.y1);
                const x2 = roundDiagnosticNumber(rect.x2);
                const y2 = roundDiagnosticNumber(rect.y2);
                if ([x1, y1, x2, y2].some(value => value === null)) return null;
                return { x1, y1, x2, y2 };
            }

    function cloneDiagnosticArea(area) {
                if (!area) return null;
                const x = roundDiagnosticNumber(area.x);
                const y = roundDiagnosticNumber(area.y);
                const w = roundDiagnosticNumber(area.w);
                const h = roundDiagnosticNumber(area.h);
                if ([x, y, w, h].some(value => value === null)) return null;
                return { x, y, w, h };
            }

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
                    const ink = measureImageDataDifference(before, rendered, width, height);
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

    function measureImageDataDifference(background, foreground, width, height) {
                return measuredBounds.measureImageDataDifference(background, foreground, width, height);
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

    function createClearRectFromArea(clearArea, replayApi) {
                if (!clearArea || !replayApi || typeof replayApi.rectFromDimensions !== 'function') return null;
                try {
                    return replayApi.rectFromDimensions(clearArea.x, clearArea.y, clearArea.w, clearArea.h);
                } catch (_) {
                    return null;
                }
            }

    function getReplayItemRect(item) {
                if (!item) return null;
                if (item.type === 'renderOp' && item.op && item.op.rect) return item.op.rect;
                if (item.type === 'windowText' && item.entry) return getWindowTextReplayBounds(item.entry);
                return null;
            }

    function getWindowTextReplayBounds(entry) {
                if (!entry) return null;
                if (isValidRect(entry.renderedBounds)) return entry.renderedBounds;
                return isValidRect(entry.bounds) ? entry.bounds : null;
            }

    function mergeReplayRect(a, b) {
                if (!isValidRect(a)) return isValidRect(b) ? b : null;
                if (!isValidRect(b)) return a;
                return {
                    x1: Math.min(Number(a.x1), Number(b.x1)),
                    y1: Math.min(Number(a.y1), Number(b.y1)),
                    x2: Math.max(Number(a.x2), Number(b.x2)),
                    y2: Math.max(Number(a.y2), Number(b.y2)),
                };
            }

    function expandReplayDirtyRect(baseRect, items) {
                let dirty = baseRect || null;
                if (Array.isArray(items)) {
                    items.forEach((item) => {
                        dirty = mergeReplayRect(dirty, getReplayItemRect(item));
                    });
                }
                return dirty;
            }

    function replayRectsOverlap(a, b) {
                if (!a || !b) return false;
                return Number(a.x1) < Number(b.x2)
                    && Number(a.x2) > Number(b.x1)
                    && Number(a.y1) < Number(b.y2)
                    && Number(a.y2) > Number(b.y1);
            }

    function getBitmapCanvasContext(contents) {
                if (!contents) return null;
                try {
                    const canvasContext = contents._context || contents.context || null;
                    if (!canvasContext
                        || typeof canvasContext.save !== 'function'
                        || typeof canvasContext.restore !== 'function'
                        || typeof canvasContext.rect !== 'function'
                        || typeof canvasContext.clip !== 'function') {
                        return null;
                    }
                    return canvasContext;
                } catch (_) {
                    return null;
                }
            }

    function supportsBitmapReplayClip(contents) {
                return !!getBitmapCanvasContext(contents);
            }

    function getReplayClipArea(contents, rect) {
                if (!contents || !rect) return null;
                const x1 = Math.max(0, Math.floor(Math.min(Number(rect.x1), Number(rect.x2))));
                const y1 = Math.max(0, Math.floor(Math.min(Number(rect.y1), Number(rect.y2))));
                let x2 = Math.ceil(Math.max(Number(rect.x1), Number(rect.x2)));
                let y2 = Math.ceil(Math.max(Number(rect.y1), Number(rect.y2)));
                if (Number.isFinite(Number(contents.width))) x2 = Math.min(Number(contents.width), x2);
                if (Number.isFinite(Number(contents.height))) y2 = Math.min(Number(contents.height), y2);
                const w = x2 - x1;
                const h = y2 - y1;
                if (![x1, y1, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
                return { x: x1, y: y1, w, h };
            }

    function getBitmapSnapshotContext(contents) {
                if (!contents) return null;
                try {
                    const canvasContext = contents._context || contents.context || null;
                    if (!canvasContext
                        || typeof canvasContext.getImageData !== 'function'
                        || typeof canvasContext.putImageData !== 'function') {
                        return null;
                    }
                    return canvasContext;
                } catch (_) {
                    return null;
                }
            }

    function getEntryContentsRevision(entry) {
                const value = Number(entry && entry.contentsRevision);
                return Number.isFinite(value) ? value : 0;
            }

    function getSnapshotContentsRevision(snapshot) {
                const value = Number(snapshot && snapshot.contentsRevision);
                return Number.isFinite(value) ? value : 0;
            }

    function getWindowDataContentsRevision(windowData) {
                const value = Number(windowData && windowData.contentsRevision);
                return Number.isFinite(value) ? value : 0;
            }

    function getEntrySnapshotPadding(contents, entry) {
                const fromEntry = entry
                    && entry.drawState
                    && Number.isFinite(Number(entry.drawState.outlineWidth))
                    ? Number(entry.drawState.outlineWidth)
                    : NaN;
                const fromContents = contents && Number.isFinite(Number(contents.outlineWidth))
                    ? Number(contents.outlineWidth)
                    : 0;
                return Math.max(0, Math.ceil(Number.isFinite(fromEntry) ? fromEntry : fromContents));
            }

    function getSnapshotArea(contents, bounds, padding = 0) {
                if (!contents || !bounds) return null;
                const x1 = Math.max(0, Math.floor(Math.min(Number(bounds.x1), Number(bounds.x2)) - padding));
                const y1 = Math.max(0, Math.floor(Math.min(Number(bounds.y1), Number(bounds.y2)) - padding));
                let x2 = Math.ceil(Math.max(Number(bounds.x1), Number(bounds.x2)) + padding);
                let y2 = Math.ceil(Math.max(Number(bounds.y1), Number(bounds.y2)) + padding);
                if (Number.isFinite(Number(contents.width))) x2 = Math.min(Number(contents.width), x2);
                if (Number.isFinite(Number(contents.height))) y2 = Math.min(Number(contents.height), y2);
                const w = x2 - x1;
                const h = y2 - y1;
                if (![x1, y1, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
                if (w * h > MAX_BACKGROUND_SNAPSHOT_PIXELS) return null;
                return { x: x1, y: y1, w, h };
            }

    function getSnapshotDiagnostics(entry, contents) {
                const snapshot = entry && entry.backgroundSnapshot ? entry.backgroundSnapshot : null;
                if (!snapshot) {
                    return {
                        available: false,
                        bitmapMatches: false,
                        area: null,
                        boundsAtCapture: null,
                        contentsRevisionAtCapture: null,
                        ageMs: null,
                    };
                }
                return {
                    available: true,
                    bitmapMatches: !!(contents && snapshot.contentsBitmap === contents),
                    area: cloneDiagnosticArea(snapshot),
                    boundsAtCapture: snapshot.bounds || null,
                    contentsRevisionAtCapture: snapshot.contentsRevision,
                    ageMs: Number.isFinite(Number(snapshot.capturedAt)) ? Math.max(0, Date.now() - Number(snapshot.capturedAt)) : null,
                };
            }

    function summarizeReplayItemsForDiagnostics(items, limit = REDRAW_DIAGNOSTIC_ITEM_LIMIT) {
                const graph = drawGraph.createDrawGraph(items);
                const summary = drawGraph.summarize(graph, limit);
                return Object.assign(summary, {
                    sample: graph.items.slice(0, limit).map((item) => {
                        if (!item) return { type: 'null' };
                        const base = {
                            type: item.type || 'unknown',
                            drawOrder: Number(item.drawOrder) || 0,
                        };
                        if (item.type === 'renderOp') {
                            const op = item.op || {};
                            return Object.assign(base, {
                                methodName: op.methodName || '',
                                rect: cloneDiagnosticRect(op.rect),
                                nativeTextKey: op.nativeTextKey || '',
                                textPreview: op.textPreview ? preview(op.textPreview, 40) : '',
                                ownerType: op.ownerType || '',
                                windowDrawTextExReplay: !!op.windowDrawTextExReplay,
                                argsCount: Array.isArray(op.args) ? op.args.length : 0,
                                ageMs: Number.isFinite(Number(op.recordedAt)) ? Math.max(0, Date.now() - Number(op.recordedAt)) : null,
                            });
                        }
                        if (item.type === 'windowText') {
                            const replayEntry = item.entry || {};
                            return Object.assign(base, {
                                methodName: replayEntry.type || '',
                                rect: cloneDiagnosticRect(replayEntry.bounds),
                                recordId: replayEntry.recordId || '',
                                status: getEntryStatus(replayEntry),
                                textPreview: preview(replayEntry.visibleText || replayEntry.convertedText || replayEntry.rawText || '', 40),
                            });
                        }
                        return base;
                    }),
                });
            }

    function summarizeReplayStateForDiagnostics(state) {
                if (!state) return null;
                return {
                    drawOrderCounter: Number(state.drawOrderCounter) || 0,
                    renderOps: Array.isArray(state.renderOps) ? state.renderOps.length : 0,
                    entries: state.entries && typeof state.entries.size === 'number' ? state.entries.size : 0,
                    nativeTextOps: state.nativeTextOps && typeof state.nativeTextOps.size === 'number' ? state.nativeTextOps.size : 0,
                };
            }

        return { mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, estimateBitmapSurfaceTextBounds, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, getBitmapCanvasContext, supportsBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, measureSnapshotInkDiagnostics: measuredBounds.measureSnapshotInkDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics };
    }
            return { create: createBitmapDiagnosticsController };
        },
    });

})();
