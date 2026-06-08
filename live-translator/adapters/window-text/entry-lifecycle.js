// Window text adapter support: entry lifecycle.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/entry-lifecycle.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/window-text/entry-lifecycle.js.');
    }
    const renderTransaction = requireRuntimeModule('runtime.renderTransaction');

    function createEntryLifecycleController(context = {}) {
    const { telemetry, pruneDetachedRegisteredWindows, generateKey, entriesByRecordId, detachedEntriesByRecordId, ADAPTER_ID, DETACHED_ENTRY_LIMIT, entryLifecycleState } = context;
    const { lifecycle: lifecycleService, surface: surfaceService } = context.services;
    const { entryRecords, renderCompletion, textMetrics } = context.facades;
    const { getEntryStatus, isEntryActive } = entryRecords;
    const { updateOrchestratorItem, rejectPendingRender } = renderCompletion;
    const { estimateEntryBounds, createSlotKey, getWindowTypeName } = textMetrics;

    function findExistingEntry(windowData, type, rawText, convertedTrimmed, x, y, params = null) {
                if (!windowData || !windowData.texts) return null;
                const slotKey = createSlotKey(type, x, y, params);
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed, slotKey);
                const entry = windowData.texts.get(key);
                if (!entry || entryLifecycleState.isStale(entry)) return null;
                if ((entry.slotKey || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y, entry.originalParams)) !== slotKey) {
                    return null;
                }
                return entry.rawText === rawText && entry.convertedText === convertedTrimmed ? entry : null;
            }
    
    function retireEntriesInSameSlot(windowData, type, x, y, exceptEntry = null, reason = 'window-entry-replaced', params = null) {
                if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return 0;
                const stale = [];
                const slotKey = createSlotKey(type, x, y, params);
                try {
                    windowData.texts.forEach((entry, key) => {
                        if (!entry || entryLifecycleState.isStale(entry)) return;
                        if (exceptEntry && entry === exceptEntry) return;
                        if ((entry.slotKey || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y, entry.originalParams)) === slotKey) {
                            stale.push({ entry, key });
                        }
                    });
                } catch (_) {}
                stale.forEach(({ entry, key }) => {
                    if (shouldDeferWindowEntryReplacement(windowData, entry)) {
                        markEntryPendingStale(windowData, entry, reason);
                    } else {
                        markEntryStale(windowData, key, entry, reason);
                    }
                });
                return stale.length;
            }

    function shouldDeferWindowEntryReplacement(windowData, entry) {
                const ownerWindow = entry && entry.ownerWindow;
                return !!((windowData && Number(windowData._trWindowRefreshDepth) > 0)
                    || (windowData && Number(windowData._trActiveRefreshToken) > 0)
                    || (ownerWindow && Number(ownerWindow._trWindowRefreshDepth) > 0)
                    || (ownerWindow && Number(ownerWindow._trTranslationRefreshDepth) > 0));
            }

    function markEntryPendingStale(windowData, entry, reason) {
                if (!entry || entryLifecycleState.isStale(entry)) return;
                const at = Date.now();
                entryLifecycleState.markPendingInvalidation(entry, 'window-entry-stale', {
                    sourceReason: reason || 'window-entry-replaced',
                    at,
                    contentsRevision: windowData && Number.isFinite(Number(windowData.contentsRevision))
                        ? Number(windowData.contentsRevision)
                        : 0,
                });
            }
    
    function markEntryStale(windowData, key, entry, reason = 'window-entry-stale') {
                if (!entry) return;
                rejectPendingRender(entry, reason, {
                    key: String(key || ''),
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                });
                entryLifecycleState.markStale(entry, reason, {
                    surfaceVisible: false,
                    screenState: 'hidden',
                });
                forgetEntryRecord(entry, reason, {
                    key: String(key || ''),
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                });
                if (windowData && windowData.texts) {
                    try { windowData.texts.delete(key); } catch (_) {}
                }
                if (windowData && windowData.renderQueue) {
                    try { windowData.renderQueue.delete(key); } catch (_) {}
                }
                markRecordDisappeared(entry, reason, {
                    key: String(key || ''),
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                });
            }

    function rememberDetachedEntry(entry, reason = 'window-entry-detached', details = null) {
                if (!entry || !entry.recordId || !detachedEntriesByRecordId) return false;
                if (!entry.normalizedSource && !entry.translationSource) return false;
                const recordId = String(entry.recordId || '');
                if (!recordId) return false;
                entryLifecycleState.markDetached(entry, reason || entryLifecycleState.getCanceledReason(entry) || 'window-entry-detached', details);
                try {
                    detachedEntriesByRecordId.delete(recordId);
                    detachedEntriesByRecordId.set(recordId, entry);
                    pruneDetachedEntries();
                    return true;
                } catch (_) {
                    return false;
                }
            }

    function takeDetachedEntry(recordOrId) {
                if (!detachedEntriesByRecordId) return null;
                const recordId = typeof recordOrId === 'string'
                    ? recordOrId
                    : String(recordOrId && recordOrId.recordId || '');
                if (!recordId) return null;
                try {
                    const entry = detachedEntriesByRecordId.get(recordId) || null;
                    if (entry) detachedEntriesByRecordId.delete(recordId);
                    return entry;
                } catch (_) {
                    return null;
                }
            }

    function peekDetachedEntry(recordOrId) {
                if (!detachedEntriesByRecordId) return null;
                const recordId = typeof recordOrId === 'string'
                    ? recordOrId
                    : String(recordOrId && recordOrId.recordId || '');
                if (!recordId) return null;
                try {
                    return detachedEntriesByRecordId.get(recordId) || null;
                } catch (_) {
                    return null;
                }
            }

    function pruneDetachedEntries() {
                if (!detachedEntriesByRecordId || typeof detachedEntriesByRecordId.size !== 'number') return;
                const limit = Number.isFinite(Number(DETACHED_ENTRY_LIMIT)) && Number(DETACHED_ENTRY_LIMIT) > 0
                    ? Math.floor(Number(DETACHED_ENTRY_LIMIT))
                    : 256;
                while (detachedEntriesByRecordId.size > limit) {
                    const first = detachedEntriesByRecordId.keys().next();
                    if (!first || first.done) break;
                    detachedEntriesByRecordId.delete(first.value);
                }
            }

    function forgetEntryRecord(entry, reason = 'window-entry-detached', details = null) {
                if (!entry || !entry.recordId || !entriesByRecordId) return false;
                try {
                    if (entriesByRecordId.get(entry.recordId) !== entry) return false;
                    rememberDetachedEntry(entry, reason, details);
                    return entriesByRecordId.delete(entry.recordId) === true;
                } catch (_) {
                    return false;
                }
            }
    
    function cancelEntryTranslation(entry, reason = 'window-entry-stale') {
                let canceled = false;
                if (isEntryActive(entry)) {
                    const result = lifecycleService.cancelItemTranslation(entry, reason);
                    canceled = !!(result && result.changed === true);
                }
                return canceled;
            }
    
    function markRecordDisappeared(entry, reason, details = null) {
                if (!isEntryActive(entry)) return;
                rejectPendingRender(entry, reason || 'window-entry-disappeared', details);
                lifecycleService.retireItem(entry, 'disappeared', {
                    eventType: 'item.disappeared',
                    message: reason || '',
                    details,
                });
                entryLifecycleState.setSurfaceVisible(entry, false, {
                    reason: reason || 'window-entry-disappeared',
                    screenState: 'hidden',
                });
            }
    
    function recordDecision(entry, type, message = '', details = null) {
                lifecycleService.recordDecision(entry, type, message, details);
            }
    
    function queueRenderRetry(targetWindow, windowData, entry, key, plan = null) {
                if (!windowData) return;
                if (!windowData.renderQueue) windowData.renderQueue = new Map();
                const queueKey = key || getTextEntryKey(windowData, entry);
                if (!queueKey) return;
                windowData.renderQueue.set(queueKey, createRenderQueueRecord(targetWindow, windowData, entry, queueKey, plan));
                if (entry._queueLogged) return;
                telemetry.logDraw('queue', entry.renderedText || entry.convertedText, entry.position.x, entry.position.y, {
                    windowType: getWindowTypeName(targetWindow, windowData),
                });
                recordDecision(entry, 'draw.queued', 'window redraw queued', {
                    windowType: getWindowTypeName(targetWindow, windowData),
                    queue: plan && plan.queue ? String(plan.queue) : '',
                    reason: plan && plan.reason ? String(plan.reason) : '',
                });
                entry._queueLogged = true;
            }

    function createRenderQueueRecord(targetWindow, windowData, entry, key, plan = null) {
                const pending = entry && entry.renderTransaction;
                return {
                    key: String(key || ''),
                    entry,
                    queue: plan && plan.queue ? String(plan.queue) : 'on-update-ready',
                    reason: plan && plan.reason ? String(plan.reason) : 'window-redraw-deferred',
                    commandId: pending && pending.commandId ? String(pending.commandId) : '',
                    commandGeneration: Number(pending && pending.commandGeneration) || 0,
                    entryGeneration: Number(entry && entry.surfaceRevision) || 0,
                    windowType: getWindowTypeName(targetWindow, windowData),
                    queuedAt: Date.now(),
                };
            }
    
    function clearPendingInvalidation(entry) {
                return entryLifecycleState.clearPendingInvalidation(entry);
            }
    
    function getCurrentEntry(windowData, entry) {
                const key = entry && (entry.key || getTextEntryKey(windowData, entry));
                return key && windowData && windowData.texts ? windowData.texts.get(key) : null;
            }
    
    function getTextEntryKey(windowData, entry) {
                if (!windowData || !entry) return null;
                return generateKey(
                    entry.type,
                    entry.position && entry.position.x,
                    entry.position && entry.position.y,
                    windowData.windowType,
                    entry.convertedText,
                    entry.slotKey || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y, entry.originalParams)
                );
            }
    
    function dropRenderRetry(windowData, entry, key = null) {
                if (!windowData || !windowData.renderQueue) return;
                const textKey = key || getTextEntryKey(windowData, entry);
                if (textKey) {
                    try { windowData.renderQueue.delete(textKey); } catch (_) {}
                }
                if (entry) entry._queueLogged = false;
            }

    function beginEntryNativeSourceDraw(entry, reason = 'native-source-draw') {
                if (!entry || entry.skipReason || !entry.translationSource) {
                    return createSourceDrawTransitionResult('ignored', 'source-draw-not-trackable', null, entry);
                }
                const lifecycle = ensureEntryRenderLifecycle(entry);
                const originBoundary = entry.drawOrigin
                    && entry.drawOrigin.drawBoundary
                    && typeof entry.drawOrigin.drawBoundary === 'object'
                    ? entry.drawOrigin.drawBoundary
                    : null;
                const transition = renderTransaction.observeSourceDraw(Object.assign({}, originBoundary || {}, {
                    adapterId: originBoundary && originBoundary.adapterId ? originBoundary.adapterId : ADAPTER_ID,
                    itemId: entry.recordId || (originBoundary && originBoundary.itemId) || '',
                    recordId: entry.recordId || (originBoundary && originBoundary.recordId) || '',
                    surfaceId: entry.surfaceId || (originBoundary && originBoundary.surfaceId) || '',
                    identitySurfaceId: entry.identitySurfaceId || (originBoundary && originBoundary.identitySurfaceId) || '',
                    slotKey: entry.slotKey || (originBoundary && originBoundary.slotKey) || '',
                    generation: Number(entry.surfaceRevision) || Number(originBoundary && originBoundary.generation) || 0,
                    reason: String(reason || 'native-source-draw'),
                    details: Object.assign({}, originBoundary && originBoundary.details || {}, {
                        method: entry.type || '',
                    }),
                }));
                lifecycle.sourceDraw = transition.state;
                return createSourceDrawTransitionResult('observed', reason, transition, entry);
            }

    function completeEntryNativeSourceDraw(entry, reason = 'native-source-draw-complete') {
                if (!entry || !entry.renderLifecycle || !entry.renderLifecycle.sourceDraw) {
                    return createSourceDrawTransitionResult('ignored', 'source-draw-missing', null, entry);
                }
                const transition = renderTransaction.commitSourceDraw(entry.renderLifecycle.sourceDraw, {
                    reason: String(reason || 'native-source-draw-complete'),
                    details: {
                        method: entry.type || '',
                    },
                });
                entry.renderLifecycle.sourceDraw = transition.state;
                if (entry.recordId && isEntryActive(entry)) {
                    updateOrchestratorItem(entry, {
                        status: getEntryStatus(entry, 'detected'),
                        translation: entry.renderedText || '',
                        translationReceived: entry.providerText || '',
                        translationDrawn: entry.renderedText || '',
                        drawBoundary: transition.state,
                    }, 'item.source_draw_committed', {
                        phase: transition.state && transition.state.phase ? transition.state.phase : '',
                        previousPhase: transition.previousPhase || '',
                        reason: String(reason || 'native-source-draw-complete'),
                    });
                }
                return createSourceDrawTransitionResult('committed', reason, transition, entry);
            }

    function createSourceDrawTransitionResult(status, reason, transition = null, entry = null) {
                const state = transition && transition.state ? transition.state : null;
                return Object.freeze({
                    status,
                    accepted: status === 'observed' || status === 'committed',
                    reason: String(reason || status || ''),
                    phase: state && state.phase ? state.phase : '',
                    previousPhase: transition && transition.previousPhase ? transition.previousPhase : '',
                    sourceDraw: state,
                    recordId: entry && entry.recordId ? String(entry.recordId) : '',
                    surfaceId: entry && entry.surfaceId ? String(entry.surfaceId) : '',
                    slotKey: entry && entry.slotKey ? String(entry.slotKey) : '',
                    generation: state && Number.isFinite(Number(state.generation)) ? Number(state.generation) : 0,
                });
            }

    function ensureEntryRenderLifecycle(entry) {
                if (!entry.renderLifecycle || typeof entry.renderLifecycle !== 'object') {
                    entry.renderLifecycle = {};
                }
                return entry.renderLifecycle;
            }
    
    function resolveWindowData(entry) {
                if (!entry) return null;
                if (entry.windowData) return entry.windowData;
                const owner = entry.ownerWindow || null;
                try {
                    return owner ? surfaceService.getWindowData(owner) : null;
                } catch (_) {
                    return null;
                }
            }
    
    function resolveTargetWindow(entry, windowData) {
                if (typeof pruneDetachedRegisteredWindows === 'function') {
                    try { pruneDetachedRegisteredWindows(); } catch (_) {}
                }
                if (entry && entry.ownerWindow && (!windowData || surfaceService.getWindowData(entry.ownerWindow) === windowData)) {
                    return entry.ownerWindow;
                }
                return surfaceService.findWindowByData(windowData);
            }
    
    function isWindowReadyForRedraw(windowInstance, contents) {
                if (!windowInstance || !contents) return false;
                const visible = windowInstance.visible !== false;
                const isOpen = typeof windowInstance.isOpen === 'function' ? windowInstance.isOpen() : true;
                const fullyOpen = typeof windowInstance.openness === 'number' ? windowInstance.openness >= 255 : true;
                return visible && (isOpen || fullyOpen);
            }
    
    function refreshEntryBounds(windowInstance, entry, textForMeasure) {
                try {
                    entry.bounds = estimateEntryBounds(
                        windowInstance,
                        entry.type,
                        textForMeasure,
                        entry.position && entry.position.x,
                        entry.position && entry.position.y,
                        textForMeasure,
                        entry.originalParams
                    );
                } catch (_) {
                    entry.bounds = null;
                }
                return entry.bounds;
            }
    
        return { findExistingEntry, retireEntriesInSameSlot, markEntryStale, rememberDetachedEntry, takeDetachedEntry, peekDetachedEntry, forgetEntryRecord, cancelEntryTranslation, markRecordDisappeared, recordDecision, queueRenderRetry, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropRenderRetry, beginEntryNativeSourceDraw, completeEntryNativeSourceDraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds };
    }
    
    defineRuntimeModule('adapters.windowTextEntryLifecycle', { create: createEntryLifecycleController });

})();
