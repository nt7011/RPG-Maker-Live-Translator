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
    const callContext = (name) => (...args) => context[name](...args);
    const { logger, telemetry, adapterContract, windowRegistry, registeredWindows, windowLifecycle, ensureWindowRegistered, pruneDetachedRegisteredWindows, generateKey, captureBitmapDrawState, applyBitmapDrawState, createWindowTextScaleScope, preview, diag, dbg, drawCaptureTrace, bitmapReplay, settings, stripControls, encodeText, restoreText, entriesByRecordId, redrawSettings, textScaleOthers, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, WINDOW_WRAPPER_TOKEN, REDRAW_DIAGNOSTIC_ITEM_LIMIT, MAX_BACKGROUND_SNAPSHOT_PIXELS } = context;
    const { install, installWindowBaseWrappers, hasHookInChain, handleDrawText, handleDrawTextEx, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry, requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, firstNonEmptyString, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload, applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred, completePendingRenderCommand, rejectPendingRender, clearPendingRenderCommand, getPendingRenderDetails, redrawTranslatedText, drawTranslatedEntry, calculateRedrawBounds, drawTranslatedWindowText, invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, withTranslatedWindowTextScale, withWindowTranslatedDrawScope, isWindowTranslatedDrawActive, withWindowDrawTextExReplayScope, findExistingEntry, retireEntriesInSameSlot, markEntryStale, rememberDetachedEntry, takeDetachedEntry, peekDetachedEntry, cancelEntryTranslation, markRecordDisappeared, recordDecision, queuePendingRedraw, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropPendingRedraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds, estimateEntryBounds, measurePlainTextWidth, estimateDrawTextExFallbackWidth, estimateDrawTextExFallbackHeight, estimateMaxDrawTextExFallbackHeight, getDrawTextExLineCount, getLineHeight, getWindowIconWidth, countDrawTextExIcons, prepareTranslationSource, restoreTranslatedWindowText, sanitizeDrawTextOutput, convertWindowText, describeWindowTextEligibility, describeEntryEligibility, isDedicatedMessageWindow, rememberMessageStart, getSurfaceId, createSlotKey, createWindowTextRecordId, safeRecordIdPart, hashTextForRecordId, normalizeSlotNumber, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue, mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, withWindowRedrawClear, withWindowContents, isUsableBitmap, getRedrawContents, wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi, assignWindowTextDrawOrder, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems, windowEntryBelongsToContents, combineReplayItems, filterReplayForEntry, replayMixedItems, replayWindowTextEntry, getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground, ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus, restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = Object.fromEntries(['install', 'installWindowBaseWrappers', 'hasHookInChain', 'handleDrawText', 'handleDrawTextEx', 'createObservedEntry', 'recordSkippedEntry', 'createEntry', 'refreshEntry', 'requestEntryTranslation', 'observeEntry', 'syncEntryFromObservedItem', 'getEntryStatus', 'isEntryActive', 'isEntryRequestActive', 'isEntryCompleted', 'firstNonEmptyString', 'recordDrawTrace', 'windowTraceDetails', 'getRegisteredWindowData', 'markEntryObservedInRefresh', 'safeStripRpgmEscapes', 'describeWindowScreenState', 'buildOrchestratorPayload', 'applyRenderCommand', 'markRequestSkipped', 'markRequestFailed', 'updateOrchestratorItem', 'beginPendingRenderCommand', 'markPendingRenderDeferred', 'completePendingRenderCommand', 'rejectPendingRender', 'clearPendingRenderCommand', 'getPendingRenderDetails', 'redrawTranslatedText', 'drawTranslatedEntry', 'calculateRedrawBounds', 'drawTranslatedWindowText', 'invokeCompletedEntry', 'invokeOriginalDrawText', 'invokeOriginalDrawTextEx', 'withTranslatedWindowTextScale', 'withWindowTranslatedDrawScope', 'isWindowTranslatedDrawActive', 'withWindowDrawTextExReplayScope', 'findExistingEntry', 'retireEntriesInSameSlot', 'markEntryStale', 'rememberDetachedEntry', 'takeDetachedEntry', 'peekDetachedEntry', 'cancelEntryTranslation', 'markRecordDisappeared', 'recordDecision', 'queuePendingRedraw', 'clearPendingInvalidation', 'getCurrentEntry', 'getTextEntryKey', 'dropPendingRedraw', 'resolveWindowData', 'resolveTargetWindow', 'isWindowReadyForRedraw', 'refreshEntryBounds', 'estimateEntryBounds', 'measurePlainTextWidth', 'estimateDrawTextExFallbackWidth', 'estimateDrawTextExFallbackHeight', 'estimateMaxDrawTextExFallbackHeight', 'getDrawTextExLineCount', 'getLineHeight', 'getWindowIconWidth', 'countDrawTextExIcons', 'prepareTranslationSource', 'restoreTranslatedWindowText', 'sanitizeDrawTextOutput', 'convertWindowText', 'describeWindowTextEligibility', 'describeEntryEligibility', 'isDedicatedMessageWindow', 'rememberMessageStart', 'getSurfaceId', 'createSlotKey', 'createWindowTextRecordId', 'safeRecordIdPart', 'hashTextForRecordId', 'normalizeSlotNumber', 'getWindowTypeName', 'getWindowCtorName', 'normalizeDrawTextAlignValue', 'mergeBounds', 'isValidRect', 'roundDiagnosticNumber', 'cloneDiagnosticRect', 'cloneDiagnosticArea', 'withWindowRedrawClear', 'withWindowContents', 'isUsableBitmap', 'getRedrawContents', 'wasDrawnToDetachedContents', 'isTransientRefreshWindow', 'isCoreRefreshWindowType', 'getBitmapReplayApi', 'assignWindowTextDrawOrder', 'createClearRectFromArea', 'getReplayItemRect', 'mergeReplayRect', 'expandReplayDirtyRect', 'replayRectsOverlap', 'collectWindowTextReplayItems', 'windowEntryBelongsToContents', 'combineReplayItems', 'filterReplayForEntry', 'replayMixedItems', 'replayWindowTextEntry', 'getWindowReplayText', 'getBitmapCanvasContext', 'supportsBitmapReplayClip', 'withBitmapReplayClip', 'getReplayClipArea', 'getBitmapSnapshotContext', 'captureWindowEntryBackground', 'ensureWindowEntryBackground', 'getWindowEntryBackgroundSnapshotStatus', 'restoreWindowEntryBackground', 'getEntryContentsRevision', 'getSnapshotContentsRevision', 'getWindowDataContentsRevision', 'getEntrySnapshotPadding', 'getSnapshotArea', 'getSnapshotDiagnostics', 'summarizeReplayItemsForDiagnostics', 'summarizeReplayStateForDiagnostics'].map((name) => [name, callContext(name)]));
    
    function installOrchestratorSubscription() {
                adapterContract.subscribeRecords({
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
                    queuePendingRedraw(windowInstance, windowData, entry, entry.key || getTextEntryKey(windowData, entry));
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
                    entry && entry._trDetachedReason,
                    entry && entry.canceledReason,
                    entry && entry._trPendingInvalidation && entry._trPendingInvalidation.sourceReason
                );
                const detachedDetails = entry && entry._trDetachedDetails && typeof entry._trDetachedDetails === 'object'
                    ? entry._trDetachedDetails
                    : null;
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
                delete entry._trStale;
                delete entry._trPendingInvalidation;
                delete entry.canceledReason;
                delete entry.canceledAt;
                delete entry._trDetachedAt;
                delete entry._trDetachedReason;
                delete entry._trDetachedDetails;
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
                    entry.position && entry.position.y
                );
                let conflict = null;
                try {
                    windowData.texts.forEach((candidate) => {
                        if (conflict || !candidate || candidate === entry || candidate._trStale) return;
                        const candidateSlot = candidate.slotKey || createSlotKey(
                            candidate.type,
                            candidate.position && candidate.position.x,
                            candidate.position && candidate.position.y
                        );
                        if (candidateSlot === slotKey) conflict = candidate;
                    });
                } catch (_) {}
                return conflict;
            }

    function findDetachedTranslationWindow(event, details, entry = null) {
                if (!registeredWindows || typeof registeredWindows.forEach !== 'function') return null;
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
                    registeredWindows.forEach((candidate) => {
                        if (match || !candidate) return;
                        match = matchDetachedWindowCandidate(candidate, identitySurfaceId, surfaceId);
                    });
                } catch (_) {}
                return match;
            }

    function matchDetachedWindowCandidate(candidate, identitySurfaceId, surfaceId) {
                if (!candidate) return null;
                const data = windowRegistry && typeof windowRegistry.get === 'function'
                    ? windowRegistry.get(candidate)
                    : null;
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
                if (!entry || entry._trStale) return false;
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
