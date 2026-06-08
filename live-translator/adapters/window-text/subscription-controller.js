// Window text adapter support: subscription controller.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/subscription-controller.js.');
    }

    function createSubscriptionControllerController(context = {}) {
    const { entriesByRecordId, RENDER_STRATEGY, entryLifecycleState } = context;
    const { lifecycle: lifecycleService, surface: surfaceService } = context.services;
    const { bitmapReplay, entryLifecycle, entryRecords, renderCommands, renderDraw, renderQueue, textConversion, textMetrics } = context.facades;
    const { observeEntry, firstNonEmptyString } = entryRecords;
    const { applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred } = renderCommands;
    const { drawTranslatedEntry } = renderDraw;
    const { rememberDetachedEntry, takeDetachedEntry, markRecordDisappeared, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, resolveWindowData, isWindowReadyForRedraw } = entryLifecycle;
    const { queueRenderRetry } = renderQueue;
    const { restoreTranslatedWindowText, sanitizeDrawTextOutput } = textConversion;
    const { getSurfaceId, createSlotKey, getWindowTypeName } = textMetrics;
    const { getRedrawContents } = bitmapReplay;

    function installOrchestratorSubscription() {
                lifecycleService.subscribeRecords({
                    token: RENDER_STRATEGY,
                    records: entriesByRecordId,
                    renderStrategy: RENDER_STRATEGY,
                    getRenderGeneration: getRenderGeneration,
                    isRenderTargetCurrent: isRenderTargetCurrent,
                    onRenderQueued: applyRenderCommand,
                    onRenderRejected: handleRenderRejected,
                    onMissingRecord(route, event) {
                        handleMissingRecordEvent(route, event);
                    },
                    onSkipped(entry, event) {
                        markRequestSkipped(entry, event.message || 'translation skipped', event.details || null);
                    },
                    onFailed(entry, event) {
                        markRequestFailed(entry, event.message || 'translation failed', event.details || null);
                    },
                    onEvent(entry, event) {
                        const type = event && event.type ? String(event.type) : '';
                        if (type !== 'item.cache_hit'
                            || !event.details
                            || event.details.lookupReuse !== true) {
                            return;
                        }
                        const received = firstNonEmptyString(
                            event && event.details && event.details.translationReceived,
                            event && event.details && event.details.translation,
                            event && event.details && event.details.text
                        );
                        if (!received) return;
                        entry.providerText = received;
                        entry.renderedText = restoreTranslatedWindowText(entry, received);
                        entry.translationTimestamp = Date.now();
                        entry.skipReason = '';
                    },
                });
            }

    function handleMissingRecordEvent(route, event) {
                const type = event && event.type ? String(event.type) : '';
                if (type !== 'item.translation_stored') return false;
                const details = event && event.details && typeof event.details === 'object' ? event.details : {};
                if (details.detached !== true && String(event && event.message || '') !== 'detached') return false;
                return renderDetachedTranslation(route, event, details);
            }

    function renderDetachedTranslation(route, event, details) {
                const recordId = firstNonEmptyString(
                    route && route.recordId,
                    route && route.itemId,
                    event && event.itemId,
                    event && event.id
                );
                const entry = takeDetachedEntry(recordId);
                if (!entry) return false;
                const received = firstNonEmptyString(
                    details && details.translationReceived,
                    details && details.translation,
                    details && details.receivedTranslation
                );
                if (!received) {
                    rememberDetachedEntry(entry, 'detached-translation-missing', {
                        key: entry.key || '',
                    });
                    return false;
                }
                if (isObsoleteDetachedEntry(entry)) return false;
                const match = findDetachedTranslationWindow(event, details, entry);
                if (!match || !match.windowInstance || !match.windowData) {
                    rememberDetachedEntry(entry, 'detached-window-missing', {
                        key: entry.key || '',
                    });
                    return false;
                }
                const windowInstance = match.windowInstance;
                const windowData = match.windowData;
                const reattached = reattachDetachedEntry(entry, windowInstance, windowData, received, route, event, details);
                if (!reattached) return false;
                const contents = getRedrawContents(windowInstance, entry);
                if (!isWindowReadyForRedraw(windowInstance, contents)) {
                    beginPendingRenderCommand(entry, {
                        id: `detached:${recordId}`,
                        text: received,
                    }, {
                        strategy: RENDER_STRATEGY,
                        commandGeneration: entry.surfaceRevision || 0,
                    }, received, entry.renderedText || '');
                    markPendingRenderDeferred(entry, 'detached-window-redraw-deferred', {
                        detached: true,
                        renderRoute: 'detached-record',
                        windowType: getWindowTypeName(windowInstance, windowData),
                        method: entry.type || '',
                    });
                    queueRenderRetry(windowInstance, windowData, entry, entry.key || getTextEntryKey(windowData, entry));
                    return true;
                }
                if (!drawTranslatedEntry(windowInstance, windowData, contents, entry)) {
                    markRecordDisappeared(entry, 'detached-redraw-failed', {
                        key: entry.key || '',
                        windowType: getWindowTypeName(windowInstance, windowData),
                    });
                    return false;
                }
                const rendered = entry.renderedText || '';
                updateOrchestratorItem(entry, {
                    status: 'completed',
                    translation: rendered,
                    translationReceived: received,
                    translationDrawn: rendered,
                }, 'item.rendered', {
                    detached: true,
                    renderRoute: 'detached-record',
                    windowType: getWindowTypeName(windowInstance, windowData),
                    method: entry.type || '',
                    key: entry.key || '',
                    translationReceived: received,
                    translationDrawn: rendered,
                });
                return true;
            }

    function isObsoleteDetachedEntry(entry) {
                const reason = firstNonEmptyString(
                    entryLifecycleState.getDetachedReason(entry),
                    entryLifecycleState.getCanceledReason(entry),
                    entryLifecycleState.getPendingInvalidation(entry) && entryLifecycleState.getPendingInvalidation(entry).sourceReason
                );
                const detachedDetails = entryLifecycleState.getDetachedDetails(entry);
                if (detachedDetails && detachedDetails.allowDetachedReattach === true && isContentsInvalidationReason(reason)) {
                    return false;
                }
                return reason === 'window-entry-replaced'
                    || reason === 'window-entry-empty'
                    || isContentsInvalidationReason(reason);
            }

    function isContentsInvalidationReason(reason) {
                const text = String(reason || '');
                return text === 'clear-contents'
                    || text === 'clearRect-contents'
                    || /-contents$/u.test(text);
            }

    function reattachDetachedEntry(entry, windowInstance, windowData, received, route, event, details) {
                if (!entry || !windowInstance || !windowData) return false;
                if (findSlotConflict(windowData, entry)) return false;
                const restored = restoreTranslatedWindowText(entry, received);
                const rendered = sanitizeDrawTextOutput(restored, entry.type);
                if (!rendered || rendered.trim() === String(entry.convertedText || '').trim()) return false;
                const key = getTextEntryKey(windowData, entry);
                if (!key || !windowData.texts) return false;
                entryLifecycleState.markReattached(entry);
                entry.key = key;
                entry.ownerWindow = windowInstance;
                entry.windowData = windowData;
                entry.contentsBitmap = windowInstance.contents || entry.contentsBitmap;
                entry.contentsRevision = windowData.contentsRevision || 0;
                entry.surfaceId = getSurfaceId(windowData) || entry.surfaceId;
                entry.identitySurfaceId = firstNonEmptyString(
                    entry.identitySurfaceId,
                    details && details.metadata && details.metadata.identitySurfaceId
                );
                entry.providerText = received;
                entry.renderedText = rendered;
                entry.translationTimestamp = Date.now();
                entry.surfaceRevision = (Number(entry.surfaceRevision) || 0) + 1;
                clearPendingInvalidation(entry);
                try { windowData.texts.set(key, entry); } catch (_) { return false; }
                observeEntry(windowData, entry, 'completed', {
                    eventType: 'item.observed',
                    message: 'detached-record-restored',
                    replace: false,
                    details: {
                        detached: true,
                        renderRoute: 'detached-record',
                        commandId: route && route.commandId || '',
                        eventType: event && event.type || '',
                    },
                });
                return true;
            }

    function findSlotConflict(windowData, entry) {
                if (!windowData || !windowData.texts || !entry) return null;
                const slotKey = entry.slotKey || createSlotKey(
                    entry.type,
                    entry.position && entry.position.x,
                    entry.position && entry.position.y,
                    entry.originalParams
                );
                let conflict = null;
                try {
                    windowData.texts.forEach((candidate) => {
                        if (conflict || !candidate || candidate === entry || entryLifecycleState.isStale(candidate)) return;
                        const candidateSlot = candidate.slotKey || createSlotKey(
                            candidate.type,
                            candidate.position && candidate.position.x,
                            candidate.position && candidate.position.y,
                            candidate.originalParams
                        );
                        if (candidateSlot === slotKey) conflict = candidate;
                    });
                } catch (_) {}
                return conflict;
            }

    function findDetachedTranslationWindow(event, details, entry = null) {
                const metadata = details && details.metadata && typeof details.metadata === 'object'
                    ? details.metadata
                    : {};
                const identitySurfaceId = firstNonEmptyString(
                    metadata.identitySurfaceId,
                    details && details.identitySurfaceId,
                    entry && entry.identitySurfaceId
                );
                const surfaceId = firstNonEmptyString(
                    event && event.surfaceId,
                    details && details.surfaceId,
                    metadata.surfaceId,
                    entry && entry.surfaceId
                );
                const entryWindow = entry && entry.ownerWindow ? entry.ownerWindow : null;
                const entryMatch = matchDetachedWindowCandidate(entryWindow, identitySurfaceId, surfaceId);
                if (entryMatch) return entryMatch;
                if (!identitySurfaceId && !surfaceId) return null;
                let match = null;
                try {
                    surfaceService.forEachRegisteredWindow((candidate) => {
                        if (match || !candidate) return;
                        match = matchDetachedWindowCandidate(candidate, identitySurfaceId, surfaceId);
                    });
                } catch (_) {}
                return match;
            }

    function matchDetachedWindowCandidate(candidate, identitySurfaceId, surfaceId) {
                if (!candidate) return null;
                const data = surfaceService.getWindowData(candidate);
                if (!data || data._trUnregistered || candidate._destroyed || candidate.destroyed) return null;
                const candidateSurfaceId = getSurfaceId(data);
                const candidateIdentitySurfaceId = firstNonEmptyString(data.identitySurfaceId, candidateSurfaceId);
                if ((identitySurfaceId
                        && (candidateIdentitySurfaceId === identitySurfaceId || candidateSurfaceId === identitySurfaceId))
                    || (surfaceId
                        && (candidateSurfaceId === surfaceId || candidateIdentitySurfaceId === surfaceId))) {
                    return { windowInstance: candidate, windowData: data };
                }
                return null;
            }
    
    function getRenderGeneration(entry) {
                return entry && entry.surfaceRevision ? Number(entry.surfaceRevision) : 0;
            }
    
    function isRenderTargetCurrent(entry) {
                if (!entry || entryLifecycleState.isStale(entry)) return false;
                const windowData = resolveWindowData(entry);
                return !!(windowData && getCurrentEntry(windowData, entry) === entry);
            }
    
    function handleRenderRejected(entry, decision) {
                if (!entry || !decision || decision.reason !== 'target-not-current') return;
                const windowData = resolveWindowData(entry);
                markRecordDisappeared(entry, 'window-entry-replaced', {
                    key: entry.key || '',
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                    commandId: decision.commandId || '',
                });
            }
    
        return { installOrchestratorSubscription, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected };
    }
    
    defineRuntimeModule('adapters.windowTextSubscriptionController', { create: createSubscriptionControllerController });

})();
