// Window text adapter support: render pending.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/render-pending.js.');
    }

    function createRenderPendingController(context = {}) {
    const callContext = (name) => (...args) => context[name](...args);
    const { logger, telemetry, adapterContract, windowRegistry, registeredWindows, windowLifecycle, ensureWindowRegistered, pruneDetachedRegisteredWindows, generateKey, captureBitmapDrawState, applyBitmapDrawState, createWindowTextScaleScope, preview, diag, dbg, drawCaptureTrace, bitmapReplay, settings, stripControls, encodeText, restoreText, entriesByRecordId, redrawSettings, textScaleOthers, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, WINDOW_WRAPPER_TOKEN, REDRAW_DIAGNOSTIC_ITEM_LIMIT, MAX_BACKGROUND_SNAPSHOT_PIXELS } = context;
    const { install, installOrchestratorSubscription, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, installWindowBaseWrappers, hasHookInChain, handleDrawText, handleDrawTextEx, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry, requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, firstNonEmptyString, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload, drawTranslatedEntry, calculateRedrawBounds, drawTranslatedWindowText, invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, withTranslatedWindowTextScale, withWindowTranslatedDrawScope, isWindowTranslatedDrawActive, withWindowDrawTextExReplayScope, findExistingEntry, retireEntriesInSameSlot, markEntryStale, cancelEntryTranslation, markRecordDisappeared, recordDecision, queuePendingRedraw, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropPendingRedraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds, estimateEntryBounds, measurePlainTextWidth, estimateDrawTextExFallbackWidth, estimateDrawTextExFallbackHeight, estimateMaxDrawTextExFallbackHeight, getDrawTextExLineCount, getLineHeight, getWindowIconWidth, countDrawTextExIcons, prepareTranslationSource, restoreTranslatedWindowText, sanitizeDrawTextOutput, convertWindowText, describeWindowTextEligibility, describeEntryEligibility, isDedicatedMessageWindow, rememberMessageStart, getSurfaceId, createSlotKey, createWindowTextRecordId, safeRecordIdPart, hashTextForRecordId, normalizeSlotNumber, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue, mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, withWindowRedrawClear, withWindowContents, isUsableBitmap, getRedrawContents, wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi, assignWindowTextDrawOrder, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems, windowEntryBelongsToContents, combineReplayItems, filterReplayForEntry, replayMixedItems, replayWindowTextEntry, getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground, ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus, restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'installWindowBaseWrappers', 'hasHookInChain', 'handleDrawText', 'handleDrawTextEx', 'createObservedEntry', 'recordSkippedEntry', 'createEntry', 'refreshEntry', 'requestEntryTranslation', 'observeEntry', 'syncEntryFromObservedItem', 'getEntryStatus', 'isEntryActive', 'isEntryRequestActive', 'isEntryCompleted', 'firstNonEmptyString', 'recordDrawTrace', 'windowTraceDetails', 'getRegisteredWindowData', 'markEntryObservedInRefresh', 'safeStripRpgmEscapes', 'describeWindowScreenState', 'buildOrchestratorPayload', 'drawTranslatedEntry', 'calculateRedrawBounds', 'drawTranslatedWindowText', 'invokeCompletedEntry', 'invokeOriginalDrawText', 'invokeOriginalDrawTextEx', 'withTranslatedWindowTextScale', 'withWindowTranslatedDrawScope', 'isWindowTranslatedDrawActive', 'withWindowDrawTextExReplayScope', 'findExistingEntry', 'retireEntriesInSameSlot', 'markEntryStale', 'cancelEntryTranslation', 'markRecordDisappeared', 'recordDecision', 'queuePendingRedraw', 'clearPendingInvalidation', 'getCurrentEntry', 'getTextEntryKey', 'dropPendingRedraw', 'resolveWindowData', 'resolveTargetWindow', 'isWindowReadyForRedraw', 'refreshEntryBounds', 'estimateEntryBounds', 'measurePlainTextWidth', 'estimateDrawTextExFallbackWidth', 'estimateDrawTextExFallbackHeight', 'estimateMaxDrawTextExFallbackHeight', 'getDrawTextExLineCount', 'getLineHeight', 'getWindowIconWidth', 'countDrawTextExIcons', 'prepareTranslationSource', 'restoreTranslatedWindowText', 'sanitizeDrawTextOutput', 'convertWindowText', 'describeWindowTextEligibility', 'describeEntryEligibility', 'isDedicatedMessageWindow', 'rememberMessageStart', 'getSurfaceId', 'createSlotKey', 'createWindowTextRecordId', 'safeRecordIdPart', 'hashTextForRecordId', 'normalizeSlotNumber', 'getWindowTypeName', 'getWindowCtorName', 'normalizeDrawTextAlignValue', 'mergeBounds', 'isValidRect', 'roundDiagnosticNumber', 'cloneDiagnosticRect', 'cloneDiagnosticArea', 'withWindowRedrawClear', 'withWindowContents', 'isUsableBitmap', 'getRedrawContents', 'wasDrawnToDetachedContents', 'isTransientRefreshWindow', 'isCoreRefreshWindowType', 'getBitmapReplayApi', 'assignWindowTextDrawOrder', 'createClearRectFromArea', 'getReplayItemRect', 'mergeReplayRect', 'expandReplayDirtyRect', 'replayRectsOverlap', 'collectWindowTextReplayItems', 'windowEntryBelongsToContents', 'combineReplayItems', 'filterReplayForEntry', 'replayMixedItems', 'replayWindowTextEntry', 'getWindowReplayText', 'getBitmapCanvasContext', 'supportsBitmapReplayClip', 'withBitmapReplayClip', 'getReplayClipArea', 'getBitmapSnapshotContext', 'captureWindowEntryBackground', 'ensureWindowEntryBackground', 'getWindowEntryBackgroundSnapshotStatus', 'restoreWindowEntryBackground', 'getEntryContentsRevision', 'getSnapshotContentsRevision', 'getWindowDataContentsRevision', 'getEntrySnapshotPadding', 'getSnapshotArea', 'getSnapshotDiagnostics', 'summarizeReplayItemsForDiagnostics', 'summarizeReplayStateForDiagnostics'].map((name) => [name, callContext(name)]));
    
    function applyRenderCommand(entry, command, route = {}) {
                const windowData = resolveWindowData(entry);
                if (!windowData) return false;
    
                const received = typeof command.text === 'string' ? command.text : '';
                const restored = restoreTranslatedWindowText(entry, received);
                entry.providerText = received;
    
                if (!restored || restored.trim() === String(entry.convertedText || '').trim()) {
                    const reason = restored ? 'translated-text-matched-original' : 'restored-text-empty';
                    entry.renderedText = '';
                    entry.skipReason = '';
                    return {
                        status: 'rejected',
                        reason,
                        details: {
                            windowType: windowData.windowType || '',
                            translationReceived: received,
                            restoredText: restored || '',
                        },
                    };
                }
    
                entry.renderedText = restored;
                entry.translationTimestamp = Date.now();
                beginPendingRenderCommand(entry, command, route, received, restored);
                const renderResult = redrawTranslatedText(entry, windowData);
                if (renderResult === 'deferred') {
                    markPendingRenderDeferred(entry, 'window-redraw-deferred', {
                        windowType: windowData.windowType || '',
                        translationReceived: received,
                        translationDrawn: restored,
                    });
                    return {
                        status: 'deferred',
                        reason: 'window-redraw-deferred',
                        details: getPendingRenderDetails(entry),
                    };
                }
                if (renderResult !== 'drawn') clearPendingRenderCommand(entry);
                return renderResult === 'drawn';
            }
    
    function markRequestSkipped(entry, reason, details = null) {
                if (!entry || entry._trStale) return;
                const windowData = resolveWindowData(entry);
                entry.skipReason = reason || 'translation skipped';
            }
    
    function markRequestFailed(entry, message, details = null) {
                if (!entry) return;
            }
    
    function updateOrchestratorItem(entry, patch, eventType, details = null) {
                return adapterContract.updateItem(entry, patch || {}, { eventType, details });
            }
    
    function beginPendingRenderCommand(entry, command, route, received, restored) {
                if (!entry || !command) return null;
                const pending = {
                    commandId: command.id ? String(command.id) : '',
                    strategy: route && route.strategy ? String(route.strategy) : RENDER_STRATEGY,
                    commandGeneration: Number(route && route.commandGeneration) || 0,
                    translationReceived: typeof received === 'string' ? received : '',
                    translationDrawn: typeof restored === 'string' ? restored : '',
                    deferred: false,
                };
                entry._trPendingRenderCommand = pending;
                return pending;
            }
    
    function markPendingRenderDeferred(entry, reason, details = null) {
                const pending = entry && entry._trPendingRenderCommand;
                if (!pending) return null;
                pending.deferred = true;
                pending.deferredReason = reason || 'window-redraw-deferred';
                pending.details = Object.assign({}, pending.details || {}, details || {});
                return adapterContract.recordRenderDeferred(entry, {
                    commandId: pending.commandId,
                    strategy: pending.strategy,
                    commandGeneration: pending.commandGeneration,
                    reason: pending.deferredReason,
                    details: getPendingRenderDetails(entry),
                });
            }
    
    function completePendingRenderCommand(entry, details = null) {
                const pending = entry && entry._trPendingRenderCommand;
                if (!pending) return false;
                const rendered = entry.renderedText || pending.translationDrawn || '';
                const renderDetails = Object.assign({}, getPendingRenderDetails(entry), details || {}, {
                    translationReceived: pending.translationReceived || '',
                    translationDrawn: rendered,
                });
                updateOrchestratorItem(entry, {
                    status: 'completed',
                    translation: rendered,
                    translationDrawn: rendered,
                }, 'item.rendered', renderDetails);
                if (pending.deferred === true) {
                    adapterContract.recordRenderAccepted(entry, {
                        commandId: pending.commandId,
                        strategy: pending.strategy,
                        commandGeneration: pending.commandGeneration,
                        reason: 'rendered',
                        details: renderDetails,
                    });
                }
                clearPendingRenderCommand(entry);
                return true;
            }
    
    function rejectPendingRender(entry, reason = 'window-redraw-rejected', details = null) {
                const pending = entry && entry._trPendingRenderCommand;
                if (!pending) return false;
                adapterContract.recordRenderRejected(entry, {
                    commandId: pending.commandId,
                    strategy: pending.strategy,
                    commandGeneration: pending.commandGeneration,
                    reason,
                    details: Object.assign({}, getPendingRenderDetails(entry), details || {}),
                });
                clearPendingRenderCommand(entry);
                return true;
            }
    
    function clearPendingRenderCommand(entry) {
                if (entry) delete entry._trPendingRenderCommand;
            }
    
    function getPendingRenderDetails(entry) {
                const pending = entry && entry._trPendingRenderCommand;
                return Object.assign({}, pending && pending.details || {}, {
                    commandId: pending && pending.commandId || '',
                    strategy: pending && pending.strategy || RENDER_STRATEGY,
                    commandGeneration: pending && pending.commandGeneration || 0,
                    deferred: pending && pending.deferred === true,
                    translationReceived: pending && pending.translationReceived || '',
                    translationDrawn: pending && pending.translationDrawn || '',
                });
            }
    
    function redrawTranslatedText(entry, windowData) {
                if (!entry) return false;
                if (entry._trStale) {
                    rejectPendingRender(entry, 'window-entry-stale');
                    return false;
                }
                const targetWindow = resolveTargetWindow(entry, windowData);
                const activeWindowData = windowData || resolveWindowData(entry);
                if (!targetWindow || !activeWindowData) {
                    markRecordDisappeared(entry, 'window-redraw-target-missing', {
                        windowType: activeWindowData && activeWindowData.windowType ? activeWindowData.windowType : '',
                    });
                    return false;
                }
    
                const textKey = entry.key || getTextEntryKey(activeWindowData, entry);
                const currentEntry = textKey && activeWindowData.texts ? activeWindowData.texts.get(textKey) : null;
                if (currentEntry !== entry) {
                    dropPendingRedraw(activeWindowData, entry, textKey);
                    markRecordDisappeared(entry, 'window-entry-replaced', {
                        key: textKey || '',
                        windowType: getWindowTypeName(targetWindow, activeWindowData),
                    });
                    return false;
                }
                if (entry._trPendingInvalidation) {
                    recordDecision(entry, 'draw.deferred', 'waiting for window redraw revalidation', {
                        key: textKey || '',
                        reason: entry._trPendingInvalidation.reason || '',
                    });
                    return 'deferred';
                }
    
                const contents = getRedrawContents(targetWindow, entry);
                const ready = isWindowReadyForRedraw(targetWindow, contents);
                if (!ready) {
                    queuePendingRedraw(targetWindow, activeWindowData, entry, textKey);
                    return 'deferred';
                }
                dropPendingRedraw(activeWindowData, entry, textKey);
    
                return drawTranslatedEntry(targetWindow, activeWindowData, contents, entry) ? 'drawn' : false;
            }
    
        return { applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred, completePendingRenderCommand, rejectPendingRender, clearPendingRenderCommand, getPendingRenderDetails, redrawTranslatedText };
    }
    
    defineRuntimeModule('adapters.windowTextRenderPending', { create: createRenderPendingController });

})();
