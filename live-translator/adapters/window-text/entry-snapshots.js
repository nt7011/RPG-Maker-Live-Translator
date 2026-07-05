// Window text adapter support: entry source/background pixel snapshots.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.entrySnapshots',
        factory() {

    function createEntrySnapshotsController(context = {}) {
        const { entryLifecycleState } = context;
        const {
            isUsableBitmap: isUsableBitmapCallback,
            resolveBitmapWindowData: resolveBitmapWindowDataCallback,
            windowEntryBelongsToContents: windowEntryBelongsToContentsCallback,
            replayRectsOverlap: replayRectsOverlapCallback,
            finalizeWindowReplayBitmapDirty: finalizeWindowReplayBitmapDirtyCallback,
        } = context;
        const facades = context.facades || {};
        const bitmapTools = context.bitmapTools || {};
        const { entryRecords = {}, renderDraw = {} } = facades;
        const { isEntryCompleted } = entryRecords;
        const { drawTranslatedEntry } = renderDraw;
        const {
            mergeBounds,
            cloneIntelRect,
            estimateBitmapSurfaceTextBounds,
            getBitmapSnapshotContext,
            getEntryContentsRevision,
            getSnapshotContentsRevision,
            getWindowDataContentsRevision,
            getEntrySnapshotPadding,
            getSnapshotArea,
        } = bitmapTools;
        const isUsableBitmap = requireFunction(isUsableBitmapCallback, 'isUsableBitmap');
        const resolveBitmapWindowData = requireFunction(resolveBitmapWindowDataCallback, 'resolveBitmapWindowData');
        const windowEntryBelongsToContents = requireFunction(windowEntryBelongsToContentsCallback, 'windowEntryBelongsToContents');
        const replayRectsOverlap = requireFunction(replayRectsOverlapCallback, 'replayRectsOverlap');
        const finalizeWindowReplayBitmapDirty = requireFunction(finalizeWindowReplayBitmapDirtyCallback, 'finalizeWindowReplayBitmapDirty');
        requireFunction(isEntryCompleted, 'entryRecords.isEntryCompleted');
        requireFunction(drawTranslatedEntry, 'renderDraw.drawTranslatedEntry');
        requireFunction(mergeBounds, 'bitmapTools.mergeBounds');
        requireFunction(cloneIntelRect, 'bitmapTools.cloneIntelRect');
        requireFunction(estimateBitmapSurfaceTextBounds, 'bitmapTools.estimateBitmapSurfaceTextBounds');
        requireFunction(getBitmapSnapshotContext, 'bitmapTools.getBitmapSnapshotContext');
        requireFunction(getEntryContentsRevision, 'bitmapTools.getEntryContentsRevision');
        requireFunction(getSnapshotContentsRevision, 'bitmapTools.getSnapshotContentsRevision');
        requireFunction(getWindowDataContentsRevision, 'bitmapTools.getWindowDataContentsRevision');
        requireFunction(getEntrySnapshotPadding, 'bitmapTools.getEntrySnapshotPadding');
        requireFunction(getSnapshotArea, 'bitmapTools.getSnapshotArea');

        function captureWindowEntrySource(contents, entry) {
            return captureWindowEntryPixelSnapshot(contents, entry, 'sourceSnapshot');
        }

        function restoreWindowEntrySource(contents, entry, windowData = null) {
            return restoreWindowEntryPixelSnapshot(contents, entry, 'sourceSnapshot', windowData);
        }

        function restoreEntriesForBitmapMutation(bitmap, rect = null, reason = 'bitmap-mutation-source') {
            const match = resolveBitmapWindowData(bitmap);
            if (!match || !match.windowData || !match.windowData.texts || typeof match.windowData.texts.forEach !== 'function') return 0;
            const restored = [];
            try {
                match.windowData.texts.forEach((entry) => {
                    if (!entry || entryLifecycleState.isStale(entry) || !windowEntryBelongsToContents(entry, bitmap)) return;
                    if (!isEntryCompleted(entry)) return;
                    const bounds = getWindowEntrySnapshotBounds(bitmap, entry) || entry.bounds;
                    if (rect && bounds && !replayRectsOverlap(rect, bounds)) return;
                    let didRestore = restoreWindowEntrySource(bitmap, entry, match.windowData);
                    let fallback = '';
                    if (!didRestore && restoreWindowEntryBackground(bitmap, entry, match.windowData)) {
                        didRestore = true;
                        fallback = 'background';
                    }
                    if (!didRestore) return;
                    entry.sourceRestoredForBitmapMutation = {
                        reason: String(reason || 'bitmap-mutation-source'),
                        fallback,
                        at: Date.now(),
                    };
                    restored.push(entry);
                });
            } catch (_) {}
            return restored.length;
        }

        function redrawRestoredEntriesForBitmapMutation(bitmap, reason = 'bitmap-mutation-source') {
            const match = resolveBitmapWindowData(bitmap);
            if (!match || !match.windowInstance || !match.windowData || !match.windowData.texts || typeof match.windowData.texts.forEach !== 'function') return 0;
            const entries = [];
            try {
                match.windowData.texts.forEach((entry) => {
                    if (!entry || !entry.sourceRestoredForBitmapMutation) return;
                    entries.push(entry);
                });
            } catch (_) {}
            let redrawn = 0;
            entries.forEach((entry) => {
                try { delete entry.sourceRestoredForBitmapMutation; } catch (_) { entry.sourceRestoredForBitmapMutation = null; }
                if (!entry || entryLifecycleState.isStale(entry) || !windowEntryBelongsToContents(entry, bitmap)) return;
                if (!isEntryCompleted(entry)) return;
                if (drawTranslatedEntry(match.windowInstance, match.windowData, bitmap, entry)) {
                    redrawn += 1;
                }
            });
            return redrawn;
        }

        function captureWindowEntryPixelSnapshot(contents, entry, propertyName) {
            if (!contents || !entry || !entry.bounds) return false;
            const canvasContext = getBitmapSnapshotContext(contents);
            if (!canvasContext) return false;
            const nativeSourceArea = propertyName === 'sourceSnapshot'
                ? getNativeBackdropSnapshotArea(contents, entry)
                : null;
            const snapshotBounds = nativeSourceArea
                ? nativeSourceArea.bounds
                : getWindowEntrySnapshotBounds(contents, entry);
            const area = nativeSourceArea
                ? nativeSourceArea.area
                : getSnapshotArea(contents, snapshotBounds, getEntrySnapshotPadding(contents, entry));
            if (!area) return false;
            try {
                const imageData = canvasContext.getImageData(area.x, area.y, area.w, area.h);
                if (!imageData) return false;
                entry[propertyName] = {
                    contentsBitmap: contents,
                    x: area.x,
                    y: area.y,
                    w: area.w,
                    h: area.h,
                    bounds: cloneIntelRect(snapshotBounds),
                    contentsRevision: getEntryContentsRevision(entry),
                    capturedAt: Date.now(),
                    imageData,
                };
                return true;
            } catch (_) {
                entry[propertyName] = null;
                return false;
            }
        }

        function captureWindowEntryBackgroundPatch(contents, entry, patch) {
            if (!contents || !entry || !patch || !patch.bitmap) return false;
            const sourceContext = getBitmapSnapshotContext(patch.bitmap);
            if (!sourceContext) return false;
            const area = normalizeBackgroundPatchArea(contents, patch);
            if (!area) return false;
            try {
                // Window-owned bitmap draw units are delivered after native draw.
                // The bitmap hook already captured this patch before that draw,
                // so it is the only clean background for async redraw.
                const imageData = sourceContext.getImageData(0, 0, area.w, area.h);
                if (!imageData) return false;
                const bounds = {
                    x1: area.x,
                    y1: area.y,
                    x2: area.x + area.w,
                    y2: area.y + area.h,
                };
                entry.backgroundSnapshot = {
                    contentsBitmap: contents,
                    bitmapSnapshot: patch.bitmap,
                    x: area.x,
                    y: area.y,
                    w: area.w,
                    h: area.h,
                    bounds: cloneIntelRect(bounds),
                    contentsRevision: getEntryContentsRevision(entry),
                    capturedAt: Date.now(),
                    imageData,
                    fromNativeTextBackdrop: true,
                    allowAreaDrift: true,
                    trusted: patch.trusted === true,
                };
                return true;
            } catch (_) {
                return false;
            }
        }

        function normalizeBackgroundPatchArea(contents, patch) {
            const sourceWidth = Math.max(0, Math.floor(Number(contents && contents.width) || 0));
            const sourceHeight = Math.max(0, Math.floor(Number(contents && contents.height) || 0));
            if (!sourceWidth || !sourceHeight) return null;
            const x = Math.max(0, Math.floor(Number(patch.x) || 0));
            const y = Math.max(0, Math.floor(Number(patch.y) || 0));
            const w = Math.max(0, Math.floor(Number(patch.width) || Number(patch.bitmap && patch.bitmap.width) || 0));
            const h = Math.max(0, Math.floor(Number(patch.height) || Number(patch.bitmap && patch.bitmap.height) || 0));
            const right = Math.min(sourceWidth, x + w);
            const bottom = Math.min(sourceHeight, y + h);
            const width = right - x;
            const height = bottom - y;
            if (width <= 0 || height <= 0) return null;
            return { x, y, w: width, h: height };
        }

        function getNativeBackdropSnapshotArea(contents, entry) {
            const snapshot = entry && entry.backgroundSnapshot;
            if (!snapshot || snapshot.fromNativeTextBackdrop !== true) return null;
            if (snapshot.contentsBitmap && contents && snapshot.contentsBitmap !== contents) return null;
            const area = normalizeBackgroundPatchArea(contents, {
                x: snapshot.x,
                y: snapshot.y,
                width: snapshot.w,
                height: snapshot.h,
                bitmap: contents,
            });
            if (!area) return null;
            return {
                area,
                bounds: {
                    x1: area.x,
                    y1: area.y,
                    x2: area.x + area.w,
                    y2: area.y + area.h,
                },
            };
        }

        function captureWindowEntryBackground(contents, entry) {
            return captureWindowEntryPixelSnapshot(contents, entry, 'backgroundSnapshot');
        }

        function ensureWindowEntryBackground(contents, entry) {
            if (!contents || !entry) return false;
            const snapshot = getWindowEntryBackgroundSnapshotStatus(contents, entry, entry.windowData);
            if (snapshot.usable) return true;
            return captureWindowEntryBackground(contents, entry);
        }

        function getWindowEntrySnapshotBounds(contents, entry) {
            if (!entry) return null;
            const bitmapSurfaceBounds = estimateBitmapSurfaceTextBounds(
                contents,
                entry,
                entry.visibleText || entry.convertedText || entry.rawText || ''
            );
            return mergeBounds(entry.bounds, bitmapSurfaceBounds) || entry.bounds || bitmapSurfaceBounds;
        }

        function getWindowEntryBackgroundSnapshotStatus(contents, entry, windowData = null) {
            return getWindowEntryPixelSnapshotStatus(contents, entry, 'backgroundSnapshot', windowData);
        }

        function getWindowEntrySourceSnapshotStatus(contents, entry, windowData = null) {
            return getWindowEntryPixelSnapshotStatus(contents, entry, 'sourceSnapshot', windowData);
        }

        function getWindowEntryPixelSnapshotStatus(contents, entry, propertyName, windowData = null, options = null) {
            if (!entry) return { usable: false, reason: 'missingEntry' };
            const snapshot = entry[propertyName];
            if (!snapshot || !snapshot.imageData) return { usable: false, reason: 'missingSnapshot' };
            if (!contents || (snapshot.contentsBitmap && snapshot.contentsBitmap !== contents)) {
                return { usable: false, reason: 'bitmapChanged' };
            }
            const area = getSnapshotArea(contents, getWindowEntrySnapshotBounds(contents, entry), getEntrySnapshotPadding(contents, entry));
            if (!area) return { usable: false, reason: 'missingArea' };
            if (area.x !== snapshot.x || area.y !== snapshot.y || area.w !== snapshot.w || area.h !== snapshot.h) {
                // Native backdrop patches use engine text regions, while redraw
                // bounds may use measured font ink. Allow only those marked
                // patches to drift, and only when they still overlap this entry.
                if (!(options && options.allowStaleArea === true && snapshot.allowAreaDrift === true && snapshotAreaOverlaps(snapshot, area))) {
                    return { usable: false, reason: 'staleArea' };
                }
            }
            const staleArea = area.x !== snapshot.x || area.y !== snapshot.y || area.w !== snapshot.w || area.h !== snapshot.h;
            if (staleArea && !(options && options.allowStaleArea === true)) {
                return { usable: false, reason: 'staleArea' };
            }
            const staleRevision = getSnapshotContentsRevision(snapshot) !== getWindowDataContentsRevision(windowData || entry.windowData);
            if (staleRevision && !(options && options.allowStaleRevision === true)) {
                return { usable: false, reason: 'staleRevision' };
            }
            return {
                usable: true,
                reason: staleRevision ? 'staleRevisionAllowed' : (staleArea ? 'staleAreaAllowed' : ''),
                staleRevision,
                staleArea,
            };
        }

        function snapshotAreaOverlaps(snapshot, area) {
            if (!snapshot || !area) return false;
            const left = Math.max(Number(snapshot.x), Number(area.x));
            const top = Math.max(Number(snapshot.y), Number(area.y));
            const right = Math.min(Number(snapshot.x) + Number(snapshot.w), Number(area.x) + Number(area.w));
            const bottom = Math.min(Number(snapshot.y) + Number(snapshot.h), Number(area.y) + Number(area.h));
            return [left, top, right, bottom].every(Number.isFinite) && right > left && bottom > top;
        }

        function restoreWindowEntryPixelSnapshot(contents, entry, propertyName, windowData = null, options = null) {
            if (!contents || !entry || !entry[propertyName]) return false;
            const snapshot = entry[propertyName];
            if (!getWindowEntryPixelSnapshotStatus(contents, entry, propertyName, windowData, options).usable) return false;
            const canvasContext = getBitmapSnapshotContext(contents);
            if (!canvasContext || !snapshot.imageData) return false;
            try {
                if (restoreWindowEntryBitmapSnapshot(contents, snapshot)) return true;
                canvasContext.putImageData(snapshot.imageData, snapshot.x, snapshot.y);
                finalizeWindowReplayBitmapDirty(contents, 'window-entry-pixel-snapshot-restore');
                return true;
            } catch (_) {
                return false;
            }
        }

        function restoreWindowEntryBackground(contents, entry, windowData = null, options = null) {
            return restoreWindowEntryPixelSnapshot(contents, entry, 'backgroundSnapshot', windowData, options);
        }

        function restoreWindowEntryBitmapSnapshot(contents, snapshot) {
            if (!contents || !snapshot || !snapshot.bitmapSnapshot) return false;
            const source = snapshot.bitmapSnapshot;
            if (!isUsableBitmap(source) || typeof contents.blt !== 'function') return false;
            const width = Math.floor(Number(snapshot.w) || 0);
            const height = Math.floor(Number(snapshot.h) || 0);
            if (width <= 0 || height <= 0) return false;
            if (Number(source.width) < width || Number(source.height) < height) return false;
            try {
                contents.blt(source, 0, 0, width, height, snapshot.x, snapshot.y, width, height);
                finalizeWindowReplayBitmapDirty(contents, 'window-entry-bitmap-snapshot-restore');
                return true;
            } catch (_) {
                return false;
            }
        }

        return {
            captureWindowEntrySource,
            restoreWindowEntrySource,
            restoreEntriesForBitmapMutation,
            redrawRestoredEntriesForBitmapMutation,
            captureWindowEntryBackground,
            captureWindowEntryBackgroundPatch,
            ensureWindowEntryBackground,
            getWindowEntrySnapshotBounds,
            getWindowEntryBackgroundSnapshotStatus,
            getWindowEntrySourceSnapshotStatus,
            restoreWindowEntryBackground,
        };
    }

    function requireFunction(value, name) {
        if (typeof value !== 'function') {
            throw new Error(`[WindowText] entry snapshots require ${name}.`);
        }
        return value;
    }
            return { create: createEntrySnapshotsController };
        },
    });
})();
