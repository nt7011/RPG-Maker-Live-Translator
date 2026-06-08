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
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/window-text/entry-service.js.');
    }
    const displayStateModule = requireRuntimeModule('runtime.displayState');

    function createEntryServiceController(context = {}) {
    const { stripControls, entriesByRecordId, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, entryLifecycleState } = context;
    const { lifecycle: lifecycleService, surface: surfaceService, draw: drawService, replay: replayService } = context.services;
    const { diagnostics, requestLifecycle, renderCompletion, textConversion, textMetrics } = context.facades;
    const { roundDiagnosticNumber } = diagnostics;
    const { markRequestFailed } = requestLifecycle;
    const { updateOrchestratorItem } = renderCompletion;
    const { restoreTranslatedWindowText } = textConversion;
    const { describeEntryEligibility, getSurfaceId, getIdentitySurfaceId, createSlotKey, getWindowTypeName, getWindowCtorName } = textMetrics;
    const displayState = displayStateModule.createDisplayStateService(globalScope);
    const drawCaptureTrace = drawService.drawCaptureTrace;

    function requestEntryTranslation(windowData, entry) {
                if (!entry || !entry.recordId || !isEntryActive(entry) || !entry.normalizedSource || entryLifecycleState.isStale(entry)) return null;
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
    
                const requested = lifecycleService.requestItemTranslation(entry, {
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
                if (!requested || requested.handled !== true) {
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
                const observed = lifecycleService.observeRecord(entry, payload, normalizeObservationOptionsForRefresh(windowData, entry, eventOptions), {
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
                const refreshState = lifecycleService.getRefreshState(ownerWindow, windowData);
                return !!(refreshState && refreshState.active);
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
                return lifecycleService.getRecordStatus(entry, fallback);
            }
    
    function isEntryActive(entry) {
                return !!(entry && entry.recordId && lifecycleService.isRecordActive(entry));
            }
    
    function isEntryRequestActive(entry) {
                return !!(entry && entry.recordId && lifecycleService.isRecordRequestActive(entry));
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
    
    function isDrawCaptureTraceEnabled() {
                if (!drawCaptureTrace || typeof drawCaptureTrace.record !== 'function') return false;
                try {
                    return typeof drawCaptureTrace.isEnabled !== 'function'
                        || drawCaptureTrace.isEnabled() !== false;
                } catch (_) {
                    return false;
                }
            }

    function recordDrawTrace(stage, rawText, details = {}) {
                if (!isDrawCaptureTraceEnabled()) return null;
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
                if (!isDrawCaptureTraceEnabled()) return null;
                const windowData = getRegisteredWindowData(windowInstance);
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const visibleText = safeStripRpgmEscapes(String(rawText ?? ''));
                const guardState = getBitmapRenderGuardState(contents);
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
                        bitmapSkipDepth: guardState.bitmapSkipDepth,
                        bitmapReplayDepth: guardState.bitmapReplayDepth,
                        spriteTextReplayDepth: guardState.spriteTextReplayDepth,
                        drawTextExReplayDepth: Number(contents._trWindowTextDrawTextExReplayDepth || contents._trWindowDrawTextExReplayDepth) || 0,
                    } : null,
                }, extra || {});
            }

    function getBitmapRenderGuardState(bitmap) {
                const bitmapDraws = getBitmapDrawGuardService();
                const state = bitmapDraws.getRenderGuardState(bitmap);
                return {
                    bitmapSkipDepth: Number(state && state.bitmapSkipDepth) || 0,
                    bitmapReplayDepth: Number(state && state.bitmapReplayDepth) || 0,
                    spriteTextReplayDepth: Number(state && state.spriteTextReplayDepth) || 0,
                };
            }

    function getBitmapDrawGuardService() {
                const bitmapDraws = replayService && replayService.bitmapDraws;
                if (!bitmapDraws || typeof bitmapDraws.getRenderGuardState !== 'function') {
                    throw new Error('[WindowText] bitmap draw guard service is required.');
                }
                return bitmapDraws;
            }
    
    function getRegisteredWindowData(windowInstance) {
                try {
                    return surfaceService.getWindowData(windowInstance);
                } catch (_) {
                    return null;
                }
            }
    
    function markEntryObservedInRefresh(entry, windowInstance, windowData = null) {
                if (!entry) return 0;
                try {
                    return lifecycleService.markEntryObservedInRefresh(entry, windowInstance, windowData);
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
                const chainState = displayState.describeDisplayChain(windowInstance);
                if (chainState.state === 'inactive-scene') return 'inactive-scene';
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
                if (!hasOpenArea) return isOpenState ? 'opening' : 'closed';
                if (!isOpenState) return 'closed';
                if (!textOpacityVisible) return 'transparent';
                return 'visible';
            }
    
    function buildOrchestratorPayload(windowData, entry, status) {
                const windowType = windowData && windowData.windowType ? windowData.windowType : '';
                const screenState = describeWindowScreenState(entry && entry.ownerWindow, windowData);
                const onScreen = screenState === 'visible';
                return {
                    sourceAdapter: ADAPTER_ID,
                    hook: entry.type || 'window',
                    hookLabel: ADAPTER_LABEL,
                    surfaceId: entry.surfaceId || getSurfaceId(windowData),
                    identitySurfaceId: entry.identitySurfaceId || entry.surfaceId || getIdentitySurfaceId(null, windowData),
                    slotKey: entry.slotKey || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y, entry.originalParams),
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
                    drawBoundary: entry.renderLifecycle && entry.renderLifecycle.sourceDraw
                        ? entry.renderLifecycle.sourceDraw
                        : null,
                    onScreen,
                    screenState,
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
    
        return { requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, firstNonEmptyString, isDrawCaptureTraceEnabled, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload };
    }
    
    defineRuntimeModule('adapters.windowTextEntryService', { create: createEntryServiceController });

})();
