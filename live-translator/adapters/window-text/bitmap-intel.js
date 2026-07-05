// Window text adapter support: bitmap intel.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.bitmapIntel',
        requires: {
            measuredBounds: 'runtime.measuredBounds',
            drawGraph: 'runtime.drawGraph',
        },
        factory({ measuredBounds, drawGraph }) {


    function createBitmapIntelController(context = {}) {
        const { draw: drawService, snapshot: snapshotService } = context.services;
        const { entryRecords } = context.facades;
        const preview = drawService.preview || ((text) => String(text ?? ''));
        const REDRAW_INTEL_ITEM_LIMIT = snapshotService.redrawIntelItemLimit;
        const getEntryStatus = (...args) => entryRecords.getEntryStatus(...args);

    function roundIntelNumber(value) {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return null;
                return Math.round(numeric * 1000) / 1000;
            }

    function cloneIntelRect(rect) {
                if (!rect) return null;
                const x1 = roundIntelNumber(rect.x1);
                const y1 = roundIntelNumber(rect.y1);
                const x2 = roundIntelNumber(rect.x2);
                const y2 = roundIntelNumber(rect.y2);
                if ([x1, y1, x2, y2].some(value => value === null)) return null;
                return { x1, y1, x2, y2 };
            }

    function cloneIntelArea(area) {
                if (!area) return null;
                const x = roundIntelNumber(area.x);
                const y = roundIntelNumber(area.y);
                const w = roundIntelNumber(area.w);
                const h = roundIntelNumber(area.h);
                if ([x, y, w, h].some(value => value === null)) return null;
                return { x, y, w, h };
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

    function getSnapshotIntel(entry, contents) {
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
                    area: cloneIntelArea(snapshot),
                    boundsAtCapture: snapshot.bounds || null,
                    contentsRevisionAtCapture: snapshot.contentsRevision,
                    ageMs: Number.isFinite(Number(snapshot.capturedAt)) ? Math.max(0, Date.now() - Number(snapshot.capturedAt)) : null,
                };
            }

    function summarizeReplayItemsForIntel(items, limit = REDRAW_INTEL_ITEM_LIMIT) {
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
                                rect: cloneIntelRect(op.rect),
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
                                rect: cloneIntelRect(replayEntry.bounds),
                                recordId: replayEntry.recordId || '',
                                status: getEntryStatus(replayEntry),
                                textPreview: preview(replayEntry.visibleText || replayEntry.convertedText || replayEntry.rawText || '', 40),
                            });
                        }
                        return base;
                    }),
                });
            }

    function summarizeReplayStateForIntel(state) {
                if (!state) return null;
                return {
                    drawOrderCounter: Number(state.drawOrderCounter) || 0,
                    renderOps: Array.isArray(state.renderOps) ? state.renderOps.length : 0,
                    entries: state.entries && typeof state.entries.size === 'number' ? state.entries.size : 0,
                    nativeTextOps: state.nativeTextOps && typeof state.nativeTextOps.size === 'number' ? state.nativeTextOps.size : 0,
                };
            }

        return { roundIntelNumber, cloneIntelRect, cloneIntelArea, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getSnapshotIntel, measureSnapshotInkIntel: measuredBounds.measureSnapshotInkIntel, summarizeReplayItemsForIntel, summarizeReplayStateForIntel };
    }
            return { create: createBitmapIntelController };
        },
    });

})();
