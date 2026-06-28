// Window text adapter support: native source draw capture and lifecycle.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.sourceDrawSupport',
        factory() {

    function createSourceDrawSupportController(context = {}) {
        const services = context.services || {};
        const facades = context.facades || {};
        const { lifecycle: lifecycleService = {} } = services;
        const { bitmapReplay = {}, entryLifecycle = {}, entryRecords = {}, renderCommands = {}, sourceDraw = {}, textMetrics = {} } = facades;
        const { assignWindowTextDrawOrder } = bitmapReplay;
        const { getCurrentEntry, getTextEntryKey, resolveTargetWindow } = entryLifecycle;
        const { getRegisteredWindowData, isEntryCompleted } = entryRecords;
        const { redrawTranslatedText } = renderCommands;
        const { captureWindowEntrySource, beginEntryNativeSourceDraw, completeEntryNativeSourceDraw } = sourceDraw;
        const { getSurfaceId, getIdentitySurfaceId } = textMetrics;
        requireFunction(assignWindowTextDrawOrder, 'bitmapReplay.assignWindowTextDrawOrder');
        requireFunction(getCurrentEntry, 'entryLifecycle.getCurrentEntry');
        requireFunction(getTextEntryKey, 'entryLifecycle.getTextEntryKey');
        requireFunction(resolveTargetWindow, 'entryLifecycle.resolveTargetWindow');
        requireFunction(getRegisteredWindowData, 'entryRecords.getRegisteredWindowData');
        requireFunction(isEntryCompleted, 'entryRecords.isEntryCompleted');
        requireFunction(redrawTranslatedText, 'renderCommands.redrawTranslatedText');
        requireFunction(captureWindowEntrySource, 'sourceDraw.captureWindowEntrySource');
        requireFunction(beginEntryNativeSourceDraw, 'sourceDraw.beginEntryNativeSourceDraw');
        requireFunction(completeEntryNativeSourceDraw, 'sourceDraw.completeEntryNativeSourceDraw');
        requireFunction(getSurfaceId, 'textMetrics.getSurfaceId');
        requireFunction(getIdentitySurfaceId, 'textMetrics.getIdentitySurfaceId');
        requireFunction(lifecycleService.withRenderDrain, 'services.lifecycle.withRenderDrain');

        function captureSourceAfterNativeDraw(windowInstance, entry, observedContents = null) {
            if (!entry || !entry.translationSource || entry.skipReason) return false;
            const contents = observedContents
                || bindEntryToLiveSourceContents(windowInstance, entry)
                || entry.contentsBitmap
                || (windowInstance && windowInstance.contents)
                || null;
            let captured = false;
            try {
                captured = captureWindowEntrySource(contents, entry) === true;
            } catch (_) {
                captured = false;
            }
            completeNativeSourceDraw(entry);
            flushQueuedRenderAfterNativeSourceDraw(entry);
            return captured;
        }

        function beginNativeSourceDraw(entry, reason) {
            if (!shouldTrackNativeSourceDraw(entry)) return false;
            try {
                const result = beginEntryNativeSourceDraw(entry, reason);
                return !!(result && result.accepted === true && result.phase === 'source-draw-observed');
            } catch (_) {
                return false;
            }
        }

        function bindEntryToLiveSourceContents(windowInstance, entry) {
            if (!entry || !windowInstance || !windowInstance.contents) return entry && entry.contentsBitmap || null;
            const liveContents = windowInstance.contents;
            if (entry.contentsBitmap === liveContents) return liveContents;
            const windowData = getRegisteredWindowData(windowInstance) || entry.windowData || null;
            if (windowData && getCurrentEntry(windowData, entry) !== entry) {
                return entry.contentsBitmap || liveContents;
            }
            entry.contentsBitmap = liveContents;
            entry.ownerWindow = windowInstance;
            if (windowData) {
                entry.windowData = windowData;
                entry.contentsRevision = windowData.contentsRevision || 0;
                entry.surfaceId = getSurfaceId(windowData) || entry.surfaceId;
                entry.identitySurfaceId = getIdentitySurfaceId(windowInstance, windowData) || entry.identitySurfaceId;
            }
            assignWindowTextDrawOrder(liveContents, entry);
            return liveContents;
        }

        function completeNativeSourceDraw(entry) {
            try {
                const result = completeEntryNativeSourceDraw(entry, 'window-native-source-draw-complete');
                return !!(result && result.accepted === true && result.phase === 'source-draw-committed');
            } catch (_) {
                return false;
            }
        }

        function flushQueuedRenderAfterNativeSourceDraw(entry) {
            if (!entry || !entry.windowData || !entry.windowData.renderReadinessSchedule) return false;
            const key = entry.key || getTextEntryKey(entry.windowData, entry);
            const queued = key ? entry.windowData.renderReadinessSchedule.get(key) : null;
            if (!queued || queued.entry !== entry || queued.queue !== 'after-source-draw') return false;
            if (!isEntryCompleted(entry) || !entry.renderedText) return false;
            const ownerWindow = entry.ownerWindow || resolveTargetWindow(entry, entry.windowData);
            if (!ownerWindow) return false;
            return lifecycleService.withRenderDrain(
                ownerWindow,
                entry.windowData,
                'native-source-draw-complete',
                () => {
                    const result = redrawTranslatedText(entry, entry.windowData);
                    return !!(result && result.status === 'committed');
                }
            ) === true;
        }

        function shouldTrackNativeSourceDraw(entry) {
            return !!(entry
                && (!entry.drawOrigin || !entry.drawOrigin.type || entry.drawOrigin.type === 'window'));
        }

        return {
            beginNativeSourceDraw,
            captureSourceAfterNativeDraw,
        };
    }

    function requireFunction(value, name) {
        if (typeof value !== 'function') {
            throw new Error(`[WindowText] source draw support requires ${name}.`);
        }
        return value;
    }
            return { create: createSourceDrawSupportController };
        },
    });
})();
