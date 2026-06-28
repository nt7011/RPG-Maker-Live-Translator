// Window text adapter support: entry service.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.entryService',
        requires: {
            displayStateModule: 'runtime.displayState',
            surfaceRoleState: 'runtime.windowSurfaceRoleState',
        },
        factory({ displayStateModule, surfaceRoleState }, { scope: globalScope }) {

    function createEntryServiceController(context = {}) {
    const { stripControls, entriesByRecordId, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, entryLifecycleState } = context;
    const { lifecycle: lifecycleService, surface: surfaceService, draw: drawService, replay: replayService } = context.services;
    const { diagnostics, requestLifecycle, renderCompletion, textConversion, textMetrics } = context.facades;
    const { roundDiagnosticNumber } = diagnostics;
    const { markRequestFailed } = requestLifecycle;
    const { updateOrchestratorItem } = renderCompletion;
    const { restoreTranslatedWindowText } = textConversion;
    const { describeEntryEligibility, getSurfaceId, getIdentitySurfaceId, createSlotKey, getWindowTypeName } = textMetrics;
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
                indexEntrySourceRun(entry);
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

    // Projected copied-target restoration starts from ledger source-run
    // identity, so the entry lookup index follows observation lifecycle here.
    function findEntryBySourceRun(input = {}) {
                const lookup = createSourceRunLookup(input);
                const keys = createSourceRunIndexKeys(lookup);
                if (!keys.length) return null;
                const index = getSourceRunEntryIndex(false);
                if (!index) return null;
                const visited = new Set();
                for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
                    const bucket = index.get(keys[keyIndex]);
                    if (!bucket || typeof bucket.forEach !== 'function') continue;
                    let found = null;
                    bucket.forEach((entry) => {
                        if (found || !entry || visited.has(entry)) return;
                        visited.add(entry);
                        if (entryLifecycleState.isStale(entry)) {
                            forgetEntrySourceRun(entry);
                            return;
                        }
                        if (!matchesEntrySourceRunLookup(entry, lookup)) return;
                        if (lookup.sourceBitmap
                            && !entryUsesSourceBitmap(entry, lookup.sourceBitmap)
                            && !entryAllowsReboundSourceRunLookup(entry, lookup)) {
                            return;
                        }
                        found = entry;
                    });
                    if (found) return found;
                }
                return null;
            }

    function findEntriesBySourceRegion(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const sourceBitmap = source.sourceBitmap || source.bitmap || null;
                if (!sourceBitmap) return [];
                const bucket = getSourceBitmapEntrySet(sourceBitmap, false);
                if (!bucket || typeof bucket.forEach !== 'function') return [];
                const sourceRect = cloneSourceRunRect(source.sourceRect || source.rect || source.bounds || null);
                const entries = [];
                bucket.forEach((entry) => {
                    if (!entry) return;
                    if (entryLifecycleState.isStale(entry)) {
                        forgetEntrySourceRun(entry);
                        return;
                    }
                    if (!entryUsesSourceBitmap(entry, sourceBitmap)) return;
                    if (sourceRect && !rectsOverlapSourceRun(sourceRect, entry.bounds)) return;
                    entries.push(entry);
                });
                return entries;
            }

    function indexEntrySourceRun(entry) {
                if (!entry || entryLifecycleState.isStale(entry)) return false;
                forgetEntrySourceRun(entry);
                const identity = createEntrySourceRunIdentity(entry);
                const indexedSourceBitmap = indexEntrySourceBitmap(entry, identity.sourceBitmap);
                const keys = createSourceRunIndexKeys(identity);
                if (!keys.length) return indexedSourceBitmap;
                const index = getSourceRunEntryIndex(true);
                const keyStore = getSourceRunEntryKeyStore(true);
                if (!index || !keyStore) return indexedSourceBitmap;
                keys.forEach((key) => {
                    let bucket = index.get(key);
                    if (!bucket) {
                        bucket = new Set();
                        index.set(key, bucket);
                    }
                    bucket.add(entry);
                });
                keyStore.set(entry, keys);
                return true;
            }

    function forgetEntrySourceRun(entry) {
                if (!entry) return false;
                const removedSourceBitmap = forgetEntrySourceBitmap(entry);
                const index = getSourceRunEntryIndex(false);
                const keyStore = getSourceRunEntryKeyStore(false);
                if (!index || !keyStore) return removedSourceBitmap;
                const keys = keyStore.get(entry);
                if (!Array.isArray(keys)) {
                    if (typeof keyStore.delete === 'function') keyStore.delete(entry);
                    return removedSourceBitmap;
                }
                keys.forEach((key) => {
                    const bucket = index.get(key);
                    if (!bucket || typeof bucket.delete !== 'function') return;
                    bucket.delete(entry);
                    if (bucket.size === 0) index.delete(key);
                });
                if (typeof keyStore.delete === 'function') keyStore.delete(entry);
                return true;
            }

    function indexEntrySourceBitmap(entry, sourceBitmap) {
                if (!entry || !sourceBitmap) return false;
                const index = getSourceBitmapEntryIndex(true);
                const keyStore = getSourceBitmapEntryKeyStore(true);
                if (!index || !keyStore) return false;
                let bucket = index.get(sourceBitmap);
                if (!bucket) {
                    bucket = new Set();
                    index.set(sourceBitmap, bucket);
                }
                bucket.add(entry);
                keyStore.set(entry, sourceBitmap);
                return true;
            }

    function forgetEntrySourceBitmap(entry) {
                if (!entry) return false;
                const index = getSourceBitmapEntryIndex(false);
                const keyStore = getSourceBitmapEntryKeyStore(false);
                if (!index || !keyStore) return false;
                const sourceBitmap = keyStore.get(entry);
                if (!sourceBitmap) {
                    if (typeof keyStore.delete === 'function') keyStore.delete(entry);
                    return false;
                }
                const bucket = index.get(sourceBitmap);
                if (bucket && typeof bucket.delete === 'function') {
                    bucket.delete(entry);
                    if (bucket.size === 0) index.delete(sourceBitmap);
                }
                if (typeof keyStore.delete === 'function') keyStore.delete(entry);
                return true;
            }

    function createEntrySourceRunIdentity(entry) {
                const origin = entry && entry.drawOrigin && typeof entry.drawOrigin === 'object'
                    ? entry.drawOrigin
                    : {};
                const boundary = origin.drawBoundary && typeof origin.drawBoundary === 'object'
                    ? origin.drawBoundary
                    : {};
                const sourceDraw = entry
                    && entry.renderLifecycle
                    && entry.renderLifecycle.sourceDraw
                    && typeof entry.renderLifecycle.sourceDraw === 'object'
                    ? entry.renderLifecycle.sourceDraw
                    : {};
                return {
                    sourceBitmap: entry && (entry.sourceContentsBitmap || entry.contentsBitmap || entry.ownerWindow && entry.ownerWindow.contents) || null,
                    sourceSurfaceId: firstSourceRunString(
                        origin.surfaceId,
                        boundary.surfaceId,
                        sourceDraw.surfaceId,
                        entry && entry.surfaceId
                    ),
                    sourceRunId: firstSourceRunString(
                        origin.runId,
                        boundary.runId,
                        sourceDraw.runId
                    ),
                    sourceRunIds: collectSourceRunStrings(
                        origin.runId,
                        boundary.runId,
                        sourceDraw.runId,
                        origin.ledgerRunIds,
                        boundary.ledgerRunIds,
                        sourceDraw.ledgerRunIds
                    ),
                    sourceSlotKey: firstSourceRunString(
                        origin.slotKey,
                        boundary.slotKey,
                        sourceDraw.slotKey,
                        entry && entry.slotKey
                    ),
                };
            }

    function createSourceRunLookup(input = {}) {
                const request = input && typeof input === 'object' ? input : {};
                const projection = request.projection && typeof request.projection === 'object'
                    ? request.projection
                    : {};
                const sourceTextRun = request.sourceTextRun && typeof request.sourceTextRun === 'object'
                    ? request.sourceTextRun
                    : (projection.sourceTextRun && typeof projection.sourceTextRun === 'object'
                        ? projection.sourceTextRun
                        : {});
                return {
                    sourceBitmap: request.sourceBitmap || projection.sourceBitmap || sourceTextRun.sourceBitmap || null,
                    sourceSurfaceId: firstSourceRunString(
                        request.sourceSurfaceId,
                        projection.sourceSurfaceId,
                        sourceTextRun.surfaceId,
                        sourceTextRun.sourceSurfaceId
                    ),
                    sourceRunId: firstSourceRunString(
                        request.sourceRunId,
                        projection.sourceRunId,
                        sourceTextRun.runId,
                        sourceTextRun.sourceRunId
                    ),
                    sourceSlotKey: firstSourceRunString(
                        request.sourceSlotKey,
                        projection.sourceSlotKey,
                        sourceTextRun.slotKey,
                        sourceTextRun.sourceSlotKey
                    ),
                };
            }

    function createSourceRunIndexKeys(identity) {
                const sourceSurfaceId = normalizeSourceRunString(identity && identity.sourceSurfaceId);
                if (!sourceSurfaceId) return [];
                const keys = [];
                const sourceRunIds = collectSourceRunStrings(
                    identity && identity.sourceRunIds,
                    identity && identity.sourceRunId
                );
                const sourceSlotKey = normalizeSourceRunString(identity && identity.sourceSlotKey);
                sourceRunIds.forEach((sourceRunId) => {
                    keys.push(`run:${sourceSurfaceId}:${sourceRunId}`);
                });
                if (sourceSlotKey) keys.push(`slot:${sourceSurfaceId}:${sourceSlotKey}`);
                return keys;
            }

    function matchesEntrySourceRunLookup(entry, lookup) {
                const identity = createEntrySourceRunIdentity(entry);
                if (lookup.sourceSurfaceId && identity.sourceSurfaceId !== lookup.sourceSurfaceId) return false;
                const lookupRunId = normalizeSourceRunString(lookup && lookup.sourceRunId);
                const sourceRunIds = collectSourceRunStrings(identity.sourceRunIds, identity.sourceRunId);
                if (lookupRunId && sourceRunIds.length) {
                    return sourceRunIds.indexOf(lookupRunId) >= 0;
                }
                return !!(lookup.sourceSlotKey && identity.sourceSlotKey && identity.sourceSlotKey === lookup.sourceSlotKey);
            }

    function entryUsesSourceBitmap(entry, sourceBitmap) {
                return !!(entry && sourceBitmap && (
                    entry.sourceContentsBitmap === sourceBitmap
                    || entry.contentsBitmap === sourceBitmap
                    || entry.ownerWindow && entry.ownerWindow.contents === sourceBitmap
                ));
            }

    function entryAllowsReboundSourceRunLookup(entry, lookup) {
                if (!entry || !hasStrongSourceRunLookup(lookup)) return false;
                if (!isCopiedSourceEntry(entry)) return false;
                return matchesEntrySourceRunLookup(entry, lookup);
            }

    function isCopiedSourceEntry(entry) {
                return surfaceRoleState.isCopiedSourceEntry(entry);
            }

    function hasStrongSourceRunLookup(lookup) {
                return !!(normalizeSourceRunString(lookup && lookup.sourceSurfaceId)
                    && (normalizeSourceRunString(lookup && lookup.sourceRunId)
                        || normalizeSourceRunString(lookup && lookup.sourceSlotKey)));
            }

    function getSourceRunEntryIndex(create) {
                if (!context.sourceRunEntriesByKey && create) context.sourceRunEntriesByKey = new Map();
                const index = context.sourceRunEntriesByKey;
                return index && typeof index.get === 'function' && typeof index.set === 'function'
                    ? index
                    : null;
            }

    function getSourceRunEntryKeyStore(create) {
                if (!context.sourceRunEntryKeys && create) context.sourceRunEntryKeys = new WeakMap();
                const keyStore = context.sourceRunEntryKeys;
                return keyStore && typeof keyStore.get === 'function' && typeof keyStore.set === 'function'
                    ? keyStore
                    : null;
            }

    function getSourceBitmapEntryIndex(create) {
                if (!context.sourceEntriesByBitmap && create) context.sourceEntriesByBitmap = new WeakMap();
                const index = context.sourceEntriesByBitmap;
                return index && typeof index.get === 'function' && typeof index.set === 'function'
                    ? index
                    : null;
            }

    function getSourceBitmapEntryKeyStore(create) {
                if (!context.sourceBitmapEntryKeys && create) context.sourceBitmapEntryKeys = new WeakMap();
                const keyStore = context.sourceBitmapEntryKeys;
                return keyStore && typeof keyStore.get === 'function' && typeof keyStore.set === 'function'
                    ? keyStore
                    : null;
            }

    function getSourceBitmapEntrySet(sourceBitmap, create) {
                if (!sourceBitmap) return null;
                const index = getSourceBitmapEntryIndex(create);
                if (!index) return null;
                let bucket = index.get(sourceBitmap);
                if (!bucket && create) {
                    bucket = new Set();
                    index.set(sourceBitmap, bucket);
                }
                return bucket || null;
            }

    function firstSourceRunString(...values) {
                for (let index = 0; index < values.length; index += 1) {
                    const value = normalizeSourceRunString(values[index]);
                    if (value) return value;
                }
                return '';
            }

    function collectSourceRunStrings(...values) {
                const result = [];
                const seen = new Set();
                const pushValue = (value) => {
                    if (Array.isArray(value)) {
                        value.forEach(pushValue);
                        return;
                    }
                    const normalized = normalizeSourceRunString(value);
                    if (!normalized || seen.has(normalized)) return;
                    seen.add(normalized);
                    result.push(normalized);
                };
                values.forEach(pushValue);
                return result;
            }

    function normalizeSourceRunString(value) {
                return value === undefined || value === null ? '' : String(value);
            }

    function cloneSourceRunRect(rect) {
                if (!rect || typeof rect !== 'object') return null;
                const x1 = Number(rect.x1);
                const y1 = Number(rect.y1);
                const x2 = Number(rect.x2);
                const y2 = Number(rect.y2);
                if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
                return { x1, y1, x2, y2 };
            }

    function rectsOverlapSourceRun(left, right) {
                const a = cloneSourceRunRect(left);
                const b = cloneSourceRunRect(right);
                if (!a || !b) return false;
                return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
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
                const refreshState = lifecycleService.getRefreshState(windowInstance, windowData);
                return Object.assign({
                    adapter: ADAPTER_ID,
                    surfaceType: 'window',
                    windowType: getWindowTypeName(windowInstance, windowData),
                    ownerType: getWindowTypeName(windowInstance, windowData),
                    methodName,
                    rawText: String(rawText ?? ''),
                    visibleText,
                    normalizedText: String(visibleText || '').trim(),
                    x: roundDiagnosticNumber(x),
                    y: roundDiagnosticNumber(y),
                    screenState: describeWindowScreenState(windowInstance, windowData),
                    contentsRevision: windowData && windowData.contentsRevision ? windowData.contentsRevision : 0,
                    pipeline: contents ? {
                        preferWindowPipeline: guardState.windowPipelineDepth > 0,
                        windowPipelineDepth: guardState.windowPipelineDepth,
                        windowPipelineSource: guardState.windowPipelineSource,
                        windowRefreshDepth: Number(refreshState && refreshState.depth) || 0,
                        bitmapSkipDepth: guardState.bitmapSkipDepth,
                        bitmapReplayDepth: guardState.bitmapReplayDepth,
                        spriteTextReplayDepth: guardState.spriteTextReplayDepth,
                        drawTextExReplayDepth: Number(guardState.windowDrawTextExReplayDepth) || 0,
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
                    windowPipelineDepth: Number(state && state.windowPipelineDepth) || 0,
                    windowPipelineSource: String(state && state.windowPipelineSource || ''),
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
                        drawOrigin: entry.drawOrigin && entry.drawOrigin.type ? entry.drawOrigin.type : '',
                        drawRun: normalizeDrawRunMetadata(entry.drawOrigin && entry.drawOrigin.drawRun),
                        x: entry.position && entry.position.x,
                        y: entry.position && entry.position.y,
                    },
                };
            }

    function normalizeDrawRunMetadata(drawRun) {
                if (!drawRun || typeof drawRun !== 'object') return null;
                return {
                    type: String(drawRun.type || ''),
                    reason: String(drawRun.reason || ''),
                    confidence: String(drawRun.confidence || ''),
                    runKey: String(drawRun.runKey || ''),
                    unitCount: Math.max(0, Math.floor(Number(drawRun.unitCount) || 0)),
                };
            }
    
        return { requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, findEntryBySourceRun, findEntriesBySourceRegion, forgetEntrySourceRun, firstNonEmptyString, isDrawCaptureTraceEnabled, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload };
    }
            return { create: createEntryServiceController };
        },
    });

})();
