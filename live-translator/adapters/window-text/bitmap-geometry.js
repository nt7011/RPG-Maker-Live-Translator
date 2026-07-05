// Window text adapter support: bitmap replay and snapshot geometry.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.bitmapGeometry',
        factory() {

    function createBitmapGeometryController(context = {}) {
        const services = context.services || {};
        const snapshotService = services.snapshot || {};
        const MAX_BACKGROUND_SNAPSHOT_PIXELS = snapshotService.maxBackgroundSnapshotPixels;

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

        return Object.freeze({
            mergeBounds,
            isValidRect,
            createClearRectFromArea,
            getReplayItemRect,
            mergeReplayRect,
            expandReplayDirtyRect,
            replayRectsOverlap,
            getBitmapCanvasContext,
            supportsBitmapReplayClip,
            getReplayClipArea,
            getBitmapSnapshotContext,
            getEntrySnapshotPadding,
            getSnapshotArea,
        });
    }
            return { create: createBitmapGeometryController };
        },
    });

})();
