// Window text adapter support: entry service.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/entry-service.js.');
    }

    function createEntryServiceController(context = {}) {
    const callContext = (name) => (...args) => context[name](...args);
    const { logger, telemetry, adapterContract, windowRegistry, registeredWindows, windowLifecycle, ensureWindowRegistered, pruneDetachedRegisteredWindows, generateKey, captureBitmapDrawState, applyBitmapDrawState, createWindowTextScaleScope, preview, diag, dbg, drawCaptureTrace, bitmapReplay, settings, stripControls, encodeText, restoreText, entriesByRecordId, redrawSettings, textScaleOthers, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, WINDOW_WRAPPER_TOKEN, REDRAW_DIAGNOSTIC_ITEM_LIMIT, MAX_BACKGROUND_SNAPSHOT_PIXELS } = context;
    const { install, installOrchestratorSubscription, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, installWindowBaseWrappers, hasHookInChain, handleDrawText, handleDrawTextEx, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry, applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred, completePendingRenderCommand, rejectPendingRender, clearPendingRenderCommand, getPendingRenderDetails, redrawTranslatedText, drawTranslatedEntry, calculateRedrawBounds, drawTranslatedWindowText, invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, withTranslatedWindowTextScale, withWindowTranslatedDrawScope, isWindowTranslatedDrawActive, withWindowDrawTextExReplayScope, findExistingEntry, retireEntriesInSameSlot, markEntryStale, cancelEntryTranslation, markRecordDisappeared, recordDecision, queuePendingRedraw, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropPendingRedraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds, estimateEntryBounds, measurePlainTextWidth, estimateDrawTextExFallbackWidth, estimateDrawTextExFallbackHeight, estimateMaxDrawTextExFallbackHeight, getDrawTextExLineCount, getLineHeight, getWindowIconWidth, countDrawTextExIcons, prepareTranslationSource, restoreTranslatedWindowText, sanitizeDrawTextOutput, convertWindowText, describeWindowTextEligibility, describeEntryEligibility, isDedicatedMessageWindow, rememberMessageStart, getSurfaceId, getIdentitySurfaceId, createSlotKey, createWindowTextRecordId, safeRecordIdPart, hashTextForRecordId, normalizeSlotNumber, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue, mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, withWindowRedrawClear, withWindowContents, isUsableBitmap, getRedrawContents, wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi, assignWindowTextDrawOrder, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems, windowEntryBelongsToContents, combineReplayItems, filterReplayForEntry, replayMixedItems, replayWindowTextEntry, getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground, ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus, restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'installWindowBaseWrappers', 'hasHookInChain', 'handleDrawText', 'handleDrawTextEx', 'createObservedEntry', 'recordSkippedEntry', 'createEntry', 'refreshEntry', 'applyRenderCommand', 'markRequestSkipped', 'markRequestFailed', 'updateOrchestratorItem', 'beginPendingRenderCommand', 'markPendingRenderDeferred', 'completePendingRenderCommand', 'rejectPendingRender', 'clearPendingRenderCommand', 'getPendingRenderDetails', 'redrawTranslatedText', 'drawTranslatedEntry', 'calculateRedrawBounds', 'drawTranslatedWindowText', 'invokeCompletedEntry', 'invokeOriginalDrawText', 'invokeOriginalDrawTextEx', 'withTranslatedWindowTextScale', 'withWindowTranslatedDrawScope', 'isWindowTranslatedDrawActive', 'withWindowDrawTextExReplayScope', 'findExistingEntry', 'retireEntriesInSameSlot', 'markEntryStale', 'cancelEntryTranslation', 'markRecordDisappeared', 'recordDecision', 'queuePendingRedraw', 'clearPendingInvalidation', 'getCurrentEntry', 'getTextEntryKey', 'dropPendingRedraw', 'resolveWindowData', 'resolveTargetWindow', 'isWindowReadyForRedraw', 'refreshEntryBounds', 'estimateEntryBounds', 'measurePlainTextWidth', 'estimateDrawTextExFallbackWidth', 'estimateDrawTextExFallbackHeight', 'estimateMaxDrawTextExFallbackHeight', 'getDrawTextExLineCount', 'getLineHeight', 'getWindowIconWidth', 'countDrawTextExIcons', 'prepareTranslationSource', 'restoreTranslatedWindowText', 'sanitizeDrawTextOutput', 'convertWindowText', 'describeWindowTextEligibility', 'describeEntryEligibility', 'isDedicatedMessageWindow', 'rememberMessageStart', 'getSurfaceId', 'getIdentitySurfaceId', 'createSlotKey', 'createWindowTextRecordId', 'safeRecordIdPart', 'hashTextForRecordId', 'normalizeSlotNumber', 'getWindowTypeName', 'getWindowCtorName', 'normalizeDrawTextAlignValue', 'mergeBounds', 'isValidRect', 'roundDiagnosticNumber', 'cloneDiagnosticRect', 'cloneDiagnosticArea', 'withWindowRedrawClear', 'withWindowContents', 'isUsableBitmap', 'getRedrawContents', 'wasDrawnToDetachedContents', 'isTransientRefreshWindow', 'isCoreRefreshWindowType', 'getBitmapReplayApi', 'assignWindowTextDrawOrder', 'createClearRectFromArea', 'getReplayItemRect', 'mergeReplayRect', 'expandReplayDirtyRect', 'replayRectsOverlap', 'collectWindowTextReplayItems', 'windowEntryBelongsToContents', 'combineReplayItems', 'filterReplayForEntry', 'replayMixedItems', 'replayWindowTextEntry', 'getWindowReplayText', 'getBitmapCanvasContext', 'supportsBitmapReplayClip', 'withBitmapReplayClip', 'getReplayClipArea', 'getBitmapSnapshotContext', 'captureWindowEntryBackground', 'ensureWindowEntryBackground', 'getWindowEntryBackgroundSnapshotStatus', 'restoreWindowEntryBackground', 'getEntryContentsRevision', 'getSnapshotContentsRevision', 'getWindowDataContentsRevision', 'getEntrySnapshotPadding', 'getSnapshotArea', 'getSnapshotDiagnostics', 'summarizeReplayItemsForDiagnostics', 'summarizeReplayStateForDiagnostics'].map((name) => [name, callContext(name)]));
    
    function requestEntryTranslation(windowData, entry) {
                if (!entry || !entry.recordId || !isEntryActive(entry) || !entry.normalizedSource || entry._trStale) return null;
                if (isEntryRequestActive(entry) || isEntryCompleted(entry)) return true;
                const eligibility = describeEntryEligibility(entry);
                if (!eligibility.eligible) {
                    entry.skipReason = eligibility.reason || 'translation skipped';
                    updateOrchestratorItem(entry, { status: 'skipped' }, 'item.skipped', {
                        reason: entry.skipReason,
                        category: eligibility.category,
                        windowType: windowData && windowData.windowType ? windowData.windowType : '',
                    });
                    return null;
                }
    
                const requested = adapterContract.requestItemTranslation(entry, {
                    hook: entry.type || 'window',
                    priority: WINDOW_PRIORITY_VISIBLE,
                    renderStrategy: RENDER_STRATEGY,
                    queueLookupRender: false,
                    metadata: {
                        windowType: windowData && windowData.windowType ? windowData.windowType : '',
                        method: entry.type || '',
                        slotKey: entry.slotKey || '',
                    },
                });
                if (!requested) {
                    const details = {
                        windowType: windowData && windowData.windowType ? windowData.windowType : '',
                    };
                    updateOrchestratorItem(entry, { status: 'failed' }, 'item.failed', details);
                    markRequestFailed(entry, 'translation request failed', details);
                    return null;
                }
                return true;
            }
    
    function observeEntry(windowData, entry, status, eventOptions = {}) {
                if (!entry) return null;
                const payload = buildOrchestratorPayload(windowData, entry, status);
                if (entry.recordId) payload.id = entry.recordId;
                const observed = adapterContract.observeRecord(entry, payload, normalizeObservationOptionsForRefresh(windowData, entry, eventOptions), {
                    registry: entriesByRecordId,
                });
                if (observed && observed.id) {
                    syncEntryFromObservedItem(entry, observed);
                }
                return observed;
            }

    function normalizeObservationOptionsForRefresh(windowData, entry, eventOptions = {}) {
                const options = Object.assign({}, eventOptions || {});
                if (Object.prototype.hasOwnProperty.call(options, 'replace')) return options;
                if (isRefreshScopedObservation(windowData, entry)) options.replace = false;
                return options;
            }

    function isRefreshScopedObservation(windowData, entry) {
                const ownerWindow = entry && entry.ownerWindow;
                const token = Number(entry && entry._trLastObservedRefreshToken);
                const activeToken = Number(windowData && windowData._trActiveRefreshToken);
                return !!((windowData && Number(windowData._trWindowRefreshDepth) > 0)
                    || (ownerWindow && Number(ownerWindow._trWindowRefreshDepth) > 0)
                    || (Number.isFinite(token) && token > 0 && Number.isFinite(activeToken) && token === activeToken));
            }
    
    function syncEntryFromObservedItem(entry, observed) {
                if (!entry || !observed) return false;
                if (observed.status === 'skipped') {
                    entry.skipReason = observed.metadata && observed.metadata.skipReason
                        ? observed.metadata.skipReason
                        : (entry.skipReason || 'translation skipped');
                    return true;
                }
                if (observed.status !== 'completed') return false;
                const received = firstNonEmptyString(
                    observed.translationReceived,
                    observed.translation,
                    observed.translationDrawn
                );
                if (!received) return false;
                const restored = restoreTranslatedWindowText(entry, received);
                entry.providerText = received;
                entry.renderedText = restored;
                entry.translationTimestamp = Date.now();
                entry.skipReason = '';
                return true;
            }
    
    function getEntryStatus(entry, fallback = '') {
                if (!entry || !entry.recordId) return String(fallback || '');
                if (adapterContract && typeof adapterContract.getRecordStatus === 'function') {
                    return adapterContract.getRecordStatus(entry, fallback);
                }
                return String(fallback || '');
            }
    
    function isEntryActive(entry) {
                return !!(entry
                    && entry.recordId
                    && adapterContract
                    && typeof adapterContract.isRecordActive === 'function'
                    && adapterContract.isRecordActive(entry));
            }
    
    function isEntryRequestActive(entry) {
                return !!(entry
                    && entry.recordId
                    && adapterContract
                    && typeof adapterContract.isRecordRequestActive === 'function'
                    && adapterContract.isRecordRequestActive(entry));
            }
    
    function isEntryCompleted(entry) {
                return !!(entry && entry.renderedText && getEntryStatus(entry) === 'completed');
            }
    
    function firstNonEmptyString(...values) {
                for (const value of values) {
                    if (typeof value === 'string' && value) return value;
                    if (value !== undefined && value !== null && typeof value !== 'object') {
                        const text = String(value);
                        if (text) return text;
                    }
                }
                return '';
            }
    
    function recordDrawTrace(stage, rawText, details = {}) {
                if (!drawCaptureTrace || typeof drawCaptureTrace.record !== 'function') return null;
                try {
                    return drawCaptureTrace.record(stage, Object.assign({
                        adapter: ADAPTER_ID,
                        rawText: String(rawText ?? ''),
                    }, details || {}));
                } catch (_) {
                    return null;
                }
            }
    
    function windowTraceDetails(windowInstance, methodName, rawText, x, y, extra = {}) {
                const windowData = getRegisteredWindowData(windowInstance);
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const visibleText = safeStripRpgmEscapes(String(rawText ?? ''));
                return Object.assign({
                    adapter: ADAPTER_ID,
                    surfaceType: 'window',
                    windowType: getWindowTypeName(windowInstance, windowData),
                    ownerType: getWindowCtorName(windowInstance),
                    methodName,
                    rawText: String(rawText ?? ''),
                    visibleText,
                    normalizedText: String(visibleText || '').trim(),
                    x: roundDiagnosticNumber(x),
                    y: roundDiagnosticNumber(y),
                    screenState: describeWindowScreenState(windowInstance, windowData),
                    contentsRevision: windowData && windowData.contentsRevision ? windowData.contentsRevision : 0,
                    pipeline: contents ? {
                        preferWindowPipeline: contents._trPreferWindowPipeline === true,
                        windowPipelineDepth: Number(contents._trWindowPipelineDepth) || 0,
                        windowRefreshDepth: Number(contents._trWindowRefreshDepth) || 0,
                        bitmapSkipDepth: Number(contents._trBitmapSkipDepth) || 0,
                        drawTextExReplayDepth: Number(contents._trWindowTextDrawTextExReplayDepth || contents._trWindowDrawTextExReplayDepth) || 0,
                    } : null,
                }, extra || {});
            }
    
    function getRegisteredWindowData(windowInstance) {
                if (!windowInstance || !windowRegistry || typeof windowRegistry.get !== 'function') return null;
                try {
                    return windowRegistry.get(windowInstance) || null;
                } catch (_) {
                    return null;
                }
            }
    
    function markEntryObservedInRefresh(entry, windowInstance, windowData = null) {
                if (!entry || !windowLifecycle || typeof windowLifecycle.markEntryObservedInRefresh !== 'function') return 0;
                try {
                    return windowLifecycle.markEntryObservedInRefresh(entry, windowInstance, windowData);
                } catch (_) {}
                return 0;
            }
    
    function safeStripRpgmEscapes(text) {
                try {
                    return stripControls(String(text ?? ''));
                } catch (_) {
                    return String(text ?? '');
                }
            }
    
    function describeWindowScreenState(windowInstance, windowData = null) {
                if (!windowInstance) return 'missing';
                if (windowInstance.visible === false) return 'hidden';
                const openness = Number(windowInstance.openness);
                const hasOpenArea = Number.isFinite(openness)
                    ? openness > 0
                    : (typeof windowInstance.isOpen === 'function' ? windowInstance.isOpen() : true);
                const contentsOpacity = Number(windowInstance.contentsOpacity);
                const textOpacityVisible = !Number.isFinite(contentsOpacity) || contentsOpacity > 0;
                const isOpenState = windowData && Object.prototype.hasOwnProperty.call(windowData, 'isOpen')
                    ? windowData.isOpen !== false
                    : true;
                if (!hasOpenArea || !isOpenState) return 'closed';
                if (!textOpacityVisible) return 'transparent';
                return 'visible';
            }
    
    function buildOrchestratorPayload(windowData, entry, status) {
                const windowType = windowData && windowData.windowType ? windowData.windowType : '';
                return {
                    sourceAdapter: ADAPTER_ID,
                    hook: entry.type || 'window',
                    hookLabel: ADAPTER_LABEL,
                    surfaceId: entry.surfaceId || getSurfaceId(windowData),
                    identitySurfaceId: entry.identitySurfaceId || entry.surfaceId || getIdentitySurfaceId(null, windowData),
                    slotKey: entry.slotKey || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y),
                    surfaceType: 'window',
                    status: status || getEntryStatus(entry, 'detected'),
                    rawText: entry.rawText || '',
                    visibleText: entry.visibleText || entry.convertedText || entry.rawText || '',
                    original: entry.visibleText || entry.convertedText || entry.rawText || '',
                    translationSource: entry.translationSource || '',
                    normalizedSource: String(entry.normalizedSource || entry.translationSource || '').trim(),
                    translation: entry.renderedText || '',
                    translationReceived: entry.providerText || '',
                    translationDrawn: entry.renderedText || '',
                    bounds: entry.bounds || null,
                    priority: WINDOW_PRIORITY_VISIBLE,
                    generation: entry.surfaceRevision || 0,
                    renderStrategy: RENDER_STRATEGY,
                    onScreen: true,
                    screenState: 'visible',
                    metadata: {
                        adapter: 'windowText',
                        windowType,
                        methodName: entry.type || '',
                        identitySurfaceId: entry.identitySurfaceId || '',
                        contentsRevision: windowData && windowData.contentsRevision ? windowData.contentsRevision : 0,
                        x: entry.position && entry.position.x,
                        y: entry.position && entry.position.y,
                    },
                };
            }
    
        return { requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, firstNonEmptyString, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload };
    }
    
    defineRuntimeModule('adapters.windowTextEntryService', { create: createEntryServiceController });

})();
