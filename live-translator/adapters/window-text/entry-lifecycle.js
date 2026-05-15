// Window text adapter support: entry lifecycle.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/entry-lifecycle.js.');
    }

    function createEntryLifecycleController(context = {}) {
    const callContext = (name) => (...args) => context[name](...args);
    const { logger, telemetry, adapterContract, windowRegistry, registeredWindows, windowLifecycle, ensureWindowRegistered, pruneDetachedRegisteredWindows, generateKey, captureBitmapDrawState, applyBitmapDrawState, createWindowTextScaleScope, preview, diag, dbg, drawCaptureTrace, bitmapReplay, settings, stripControls, encodeText, restoreText, entriesByRecordId, detachedEntriesByRecordId, redrawSettings, textScaleOthers, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, WINDOW_WRAPPER_TOKEN, REDRAW_DIAGNOSTIC_ITEM_LIMIT, MAX_BACKGROUND_SNAPSHOT_PIXELS, DETACHED_ENTRY_LIMIT } = context;
    const { install, installOrchestratorSubscription, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, installWindowBaseWrappers, hasHookInChain, handleDrawText, handleDrawTextEx, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry, requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, firstNonEmptyString, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload, applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred, completePendingRenderCommand, rejectPendingRender, clearPendingRenderCommand, getPendingRenderDetails, redrawTranslatedText, drawTranslatedEntry, calculateRedrawBounds, drawTranslatedWindowText, invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, withTranslatedWindowTextScale, withWindowTranslatedDrawScope, isWindowTranslatedDrawActive, withWindowDrawTextExReplayScope, estimateEntryBounds, measurePlainTextWidth, estimateDrawTextExFallbackWidth, estimateDrawTextExFallbackHeight, estimateMaxDrawTextExFallbackHeight, getDrawTextExLineCount, getLineHeight, getWindowIconWidth, countDrawTextExIcons, prepareTranslationSource, restoreTranslatedWindowText, sanitizeDrawTextOutput, convertWindowText, describeWindowTextEligibility, describeEntryEligibility, isDedicatedMessageWindow, rememberMessageStart, getSurfaceId, createSlotKey, createWindowTextRecordId, safeRecordIdPart, hashTextForRecordId, normalizeSlotNumber, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue, mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, withWindowRedrawClear, withWindowContents, isUsableBitmap, getRedrawContents, wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi, assignWindowTextDrawOrder, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems, windowEntryBelongsToContents, combineReplayItems, filterReplayForEntry, replayMixedItems, replayWindowTextEntry, getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground, ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus, restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'installWindowBaseWrappers', 'hasHookInChain', 'handleDrawText', 'handleDrawTextEx', 'createObservedEntry', 'recordSkippedEntry', 'createEntry', 'refreshEntry', 'requestEntryTranslation', 'observeEntry', 'syncEntryFromObservedItem', 'getEntryStatus', 'isEntryActive', 'isEntryRequestActive', 'isEntryCompleted', 'firstNonEmptyString', 'recordDrawTrace', 'windowTraceDetails', 'getRegisteredWindowData', 'markEntryObservedInRefresh', 'safeStripRpgmEscapes', 'describeWindowScreenState', 'buildOrchestratorPayload', 'applyRenderCommand', 'markRequestSkipped', 'markRequestFailed', 'updateOrchestratorItem', 'beginPendingRenderCommand', 'markPendingRenderDeferred', 'completePendingRenderCommand', 'rejectPendingRender', 'clearPendingRenderCommand', 'getPendingRenderDetails', 'redrawTranslatedText', 'drawTranslatedEntry', 'calculateRedrawBounds', 'drawTranslatedWindowText', 'invokeCompletedEntry', 'invokeOriginalDrawText', 'invokeOriginalDrawTextEx', 'withTranslatedWindowTextScale', 'withWindowTranslatedDrawScope', 'isWindowTranslatedDrawActive', 'withWindowDrawTextExReplayScope', 'estimateEntryBounds', 'measurePlainTextWidth', 'estimateDrawTextExFallbackWidth', 'estimateDrawTextExFallbackHeight', 'estimateMaxDrawTextExFallbackHeight', 'getDrawTextExLineCount', 'getLineHeight', 'getWindowIconWidth', 'countDrawTextExIcons', 'prepareTranslationSource', 'restoreTranslatedWindowText', 'sanitizeDrawTextOutput', 'convertWindowText', 'describeWindowTextEligibility', 'describeEntryEligibility', 'isDedicatedMessageWindow', 'rememberMessageStart', 'getSurfaceId', 'createSlotKey', 'createWindowTextRecordId', 'safeRecordIdPart', 'hashTextForRecordId', 'normalizeSlotNumber', 'getWindowTypeName', 'getWindowCtorName', 'normalizeDrawTextAlignValue', 'mergeBounds', 'isValidRect', 'roundDiagnosticNumber', 'cloneDiagnosticRect', 'cloneDiagnosticArea', 'withWindowRedrawClear', 'withWindowContents', 'isUsableBitmap', 'getRedrawContents', 'wasDrawnToDetachedContents', 'isTransientRefreshWindow', 'isCoreRefreshWindowType', 'getBitmapReplayApi', 'assignWindowTextDrawOrder', 'createClearRectFromArea', 'getReplayItemRect', 'mergeReplayRect', 'expandReplayDirtyRect', 'replayRectsOverlap', 'collectWindowTextReplayItems', 'windowEntryBelongsToContents', 'combineReplayItems', 'filterReplayForEntry', 'replayMixedItems', 'replayWindowTextEntry', 'getWindowReplayText', 'getBitmapCanvasContext', 'supportsBitmapReplayClip', 'withBitmapReplayClip', 'getReplayClipArea', 'getBitmapSnapshotContext', 'captureWindowEntryBackground', 'ensureWindowEntryBackground', 'getWindowEntryBackgroundSnapshotStatus', 'restoreWindowEntryBackground', 'getEntryContentsRevision', 'getSnapshotContentsRevision', 'getWindowDataContentsRevision', 'getEntrySnapshotPadding', 'getSnapshotArea', 'getSnapshotDiagnostics', 'summarizeReplayItemsForDiagnostics', 'summarizeReplayStateForDiagnostics'].map((name) => [name, callContext(name)]));
    
    function findExistingEntry(windowData, type, rawText, convertedTrimmed, x, y) {
                if (!windowData || !windowData.texts) return null;
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed);
                const entry = windowData.texts.get(key);
                if (!entry || entry._trStale) return null;
                return entry.rawText === rawText && entry.convertedText === convertedTrimmed ? entry : null;
            }
    
    function retireEntriesInSameSlot(windowData, type, x, y, exceptEntry = null, reason = 'window-entry-replaced') {
                if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return 0;
                const stale = [];
                const slotKey = createSlotKey(type, x, y);
                try {
                    windowData.texts.forEach((entry, key) => {
                        if (!entry || entry._trStale) return;
                        if (exceptEntry && entry === exceptEntry) return;
                        if ((entry.slotKey || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y)) === slotKey) {
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
                if (!entry || entry._trStale) return;
                const at = Date.now();
                entry._trPendingInvalidation = {
                    reason: 'window-entry-stale',
                    sourceReason: reason || 'window-entry-replaced',
                    at,
                    contentsRevision: windowData && Number.isFinite(Number(windowData.contentsRevision))
                        ? Number(windowData.contentsRevision)
                        : 0,
                };
                entry.canceledReason = reason || 'window-entry-replaced';
                entry.canceledAt = at;
            }
    
    function markEntryStale(windowData, key, entry, reason = 'window-entry-stale') {
                if (!entry) return;
                rejectPendingRender(entry, reason, {
                    key: String(key || ''),
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                });
                entry._trStale = true;
                entry.canceledReason = reason;
                entry.canceledAt = Date.now();
                forgetEntryRecord(entry, reason, {
                    key: String(key || ''),
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                });
                if (windowData && windowData.texts) {
                    try { windowData.texts.delete(key); } catch (_) {}
                }
                if (windowData && windowData.pendingRedraws) {
                    try { windowData.pendingRedraws.delete(key); } catch (_) {}
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
                entry._trDetachedAt = Date.now();
                entry._trDetachedReason = String(reason || entry.canceledReason || 'window-entry-detached');
                if (details && typeof details === 'object') {
                    entry._trDetachedDetails = {
                        key: String(details.key || ''),
                        windowType: String(details.windowType || ''),
                        allowDetachedReattach: details.allowDetachedReattach === true,
                    };
                }
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
                    canceled = adapterContract.cancelItemTranslation(entry, reason) === true;
                }
                return canceled;
            }
    
    function markRecordDisappeared(entry, reason, details = null) {
                if (!isEntryActive(entry)) return;
                rejectPendingRender(entry, reason || 'window-entry-disappeared', details);
                adapterContract.retireItem(entry, 'disappeared', {
                    eventType: 'item.disappeared',
                    message: reason || '',
                    details,
                });
                entry._trSurfaceVisible = false;
            }
    
    function recordDecision(entry, type, message = '', details = null) {
                adapterContract.recordDecision(entry, type, message, details);
            }
    
    function queuePendingRedraw(targetWindow, windowData, entry, key) {
                if (!windowData) return;
                if (!windowData.pendingRedraws) windowData.pendingRedraws = new Map();
                windowData.pendingRedraws.set(key, entry);
                if (entry._queueLogged) return;
                telemetry.logDraw('queue', entry.renderedText || entry.convertedText, entry.position.x, entry.position.y, {
                    windowType: getWindowTypeName(targetWindow, windowData),
                });
                recordDecision(entry, 'draw.queued', 'window redraw queued', {
                    windowType: getWindowTypeName(targetWindow, windowData),
                });
                entry._queueLogged = true;
            }
    
    function clearPendingInvalidation(entry) {
                if (!entry || !entry._trPendingInvalidation) return false;
                delete entry._trPendingInvalidation;
                delete entry.canceledReason;
                delete entry.canceledAt;
                return true;
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
                    entry.convertedText
                );
            }
    
    function dropPendingRedraw(windowData, entry, key = null) {
                if (!windowData || !windowData.pendingRedraws) return;
                const textKey = key || getTextEntryKey(windowData, entry);
                if (textKey) {
                    try { windowData.pendingRedraws.delete(textKey); } catch (_) {}
                }
                if (entry) entry._queueLogged = false;
            }
    
    function resolveWindowData(entry) {
                if (!entry) return null;
                if (entry.windowData) return entry.windowData;
                const owner = entry.ownerWindow || null;
                try {
                    return owner ? windowRegistry.get(owner) : null;
                } catch (_) {
                    return null;
                }
            }
    
    function resolveTargetWindow(entry, windowData) {
                if (typeof pruneDetachedRegisteredWindows === 'function') {
                    try { pruneDetachedRegisteredWindows(); } catch (_) {}
                }
                if (entry && entry.ownerWindow && (!windowData || windowRegistry.get(entry.ownerWindow) === windowData)) {
                    return entry.ownerWindow;
                }
                let target = null;
                try {
                    registeredWindows.forEach((candidate) => {
                        if (!target && windowRegistry.get(candidate) === windowData) target = candidate;
                    });
                } catch (_) {}
                return target;
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
    
        return { findExistingEntry, retireEntriesInSameSlot, markEntryStale, rememberDetachedEntry, takeDetachedEntry, peekDetachedEntry, forgetEntryRecord, cancelEntryTranslation, markRecordDisappeared, recordDecision, queuePendingRedraw, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropPendingRedraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds };
    }
    
    defineRuntimeModule('adapters.windowTextEntryLifecycle', { create: createEntryLifecycleController });

})();
