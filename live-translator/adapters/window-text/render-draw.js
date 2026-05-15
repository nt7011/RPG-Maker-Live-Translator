// Window text adapter support: render draw.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/render-draw.js.');
    }

    function createRenderDrawController(context = {}) {
    const callContext = (name) => (...args) => context[name](...args);
    const { logger, telemetry, adapterContract, windowRegistry, registeredWindows, windowLifecycle, ensureWindowRegistered, pruneDetachedRegisteredWindows, generateKey, captureBitmapDrawState, applyBitmapDrawState, createWindowTextScaleScope, preview, diag, dbg, perf, drawCaptureTrace, bitmapReplay, settings, stripControls, encodeText, restoreText, entriesByRecordId, redrawSettings, textScaleOthers, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, WINDOW_WRAPPER_TOKEN, REDRAW_DIAGNOSTIC_ITEM_LIMIT, MAX_BACKGROUND_SNAPSHOT_PIXELS } = context;
    const { install, installOrchestratorSubscription, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, installWindowBaseWrappers, hasHookInChain, handleDrawText, handleDrawTextEx, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry, requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, firstNonEmptyString, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload, applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred, completePendingRenderCommand, rejectPendingRender, clearPendingRenderCommand, getPendingRenderDetails, redrawTranslatedText, findExistingEntry, retireEntriesInSameSlot, markEntryStale, cancelEntryTranslation, markRecordDisappeared, recordDecision, queuePendingRedraw, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropPendingRedraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds, estimateEntryBounds, measurePlainTextWidth, estimateDrawTextExFallbackWidth, estimateDrawTextExFallbackHeight, estimateMaxDrawTextExFallbackHeight, getDrawTextExLineCount, getLineHeight, getWindowIconWidth, countDrawTextExIcons, prepareTranslationSource, restoreTranslatedWindowText, sanitizeDrawTextOutput, convertWindowText, describeWindowTextEligibility, describeEntryEligibility, isDedicatedMessageWindow, rememberMessageStart, getSurfaceId, createSlotKey, createWindowTextRecordId, safeRecordIdPart, hashTextForRecordId, normalizeSlotNumber, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue, mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, estimateBitmapSurfaceTextBounds, withWindowRedrawClear, withWindowContents, isUsableBitmap, getRedrawContents, wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi, assignWindowTextDrawOrder, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems, windowEntryBelongsToContents, combineReplayItems, filterReplayForEntry, replayMixedItems, replayWindowTextEntry, getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground, ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus, restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'installWindowBaseWrappers', 'hasHookInChain', 'handleDrawText', 'handleDrawTextEx', 'createObservedEntry', 'recordSkippedEntry', 'createEntry', 'refreshEntry', 'requestEntryTranslation', 'observeEntry', 'syncEntryFromObservedItem', 'getEntryStatus', 'isEntryActive', 'isEntryRequestActive', 'isEntryCompleted', 'firstNonEmptyString', 'recordDrawTrace', 'windowTraceDetails', 'getRegisteredWindowData', 'markEntryObservedInRefresh', 'safeStripRpgmEscapes', 'describeWindowScreenState', 'buildOrchestratorPayload', 'applyRenderCommand', 'markRequestSkipped', 'markRequestFailed', 'updateOrchestratorItem', 'beginPendingRenderCommand', 'markPendingRenderDeferred', 'completePendingRenderCommand', 'rejectPendingRender', 'clearPendingRenderCommand', 'getPendingRenderDetails', 'redrawTranslatedText', 'findExistingEntry', 'retireEntriesInSameSlot', 'markEntryStale', 'cancelEntryTranslation', 'markRecordDisappeared', 'recordDecision', 'queuePendingRedraw', 'clearPendingInvalidation', 'getCurrentEntry', 'getTextEntryKey', 'dropPendingRedraw', 'resolveWindowData', 'resolveTargetWindow', 'isWindowReadyForRedraw', 'refreshEntryBounds', 'estimateEntryBounds', 'measurePlainTextWidth', 'estimateDrawTextExFallbackWidth', 'estimateDrawTextExFallbackHeight', 'estimateMaxDrawTextExFallbackHeight', 'getDrawTextExLineCount', 'getLineHeight', 'getWindowIconWidth', 'countDrawTextExIcons', 'prepareTranslationSource', 'restoreTranslatedWindowText', 'sanitizeDrawTextOutput', 'convertWindowText', 'describeWindowTextEligibility', 'describeEntryEligibility', 'isDedicatedMessageWindow', 'rememberMessageStart', 'getSurfaceId', 'createSlotKey', 'createWindowTextRecordId', 'safeRecordIdPart', 'hashTextForRecordId', 'normalizeSlotNumber', 'getWindowTypeName', 'getWindowCtorName', 'normalizeDrawTextAlignValue', 'mergeBounds', 'isValidRect', 'roundDiagnosticNumber', 'cloneDiagnosticRect', 'cloneDiagnosticArea', 'calculateBitmapSurfaceTextYOffset', 'estimateBitmapSurfaceTextBounds', 'withWindowRedrawClear', 'withWindowContents', 'isUsableBitmap', 'getRedrawContents', 'wasDrawnToDetachedContents', 'isTransientRefreshWindow', 'isCoreRefreshWindowType', 'getBitmapReplayApi', 'assignWindowTextDrawOrder', 'createClearRectFromArea', 'getReplayItemRect', 'mergeReplayRect', 'expandReplayDirtyRect', 'replayRectsOverlap', 'collectWindowTextReplayItems', 'windowEntryBelongsToContents', 'combineReplayItems', 'filterReplayForEntry', 'replayMixedItems', 'replayWindowTextEntry', 'getWindowReplayText', 'getBitmapCanvasContext', 'supportsBitmapReplayClip', 'withBitmapReplayClip', 'getReplayClipArea', 'getBitmapSnapshotContext', 'captureWindowEntryBackground', 'ensureWindowEntryBackground', 'getWindowEntryBackgroundSnapshotStatus', 'restoreWindowEntryBackground', 'getEntryContentsRevision', 'getSnapshotContentsRevision', 'getWindowDataContentsRevision', 'getEntrySnapshotPadding', 'getSnapshotArea', 'getSnapshotDiagnostics', 'summarizeReplayItemsForDiagnostics', 'summarizeReplayStateForDiagnostics'].map((name) => [name, callContext(name)]));

    const WINDOW_TEXT_PERF_DOMAIN = 'translator-render.windowText';
    const DRAWTEXTEX_RENDER_CACHE_VERSION = 1;
    const DRAWTEXTEX_RENDER_CACHE_DEFAULT_MAX_ENTRIES = 128;
    const DRAWTEXTEX_RENDER_CACHE_DEFAULT_MAX_PIXELS = 8 * 1024 * 1024;
    const drawTextExRenderCacheMaxEntries = resolveNonNegativeInteger(
                settings && settings.drawTextExRenderCacheMaxEntries,
                DRAWTEXTEX_RENDER_CACHE_DEFAULT_MAX_ENTRIES
            );
    const drawTextExRenderCacheMaxPixels = resolveNonNegativeInteger(
                settings && settings.drawTextExRenderCacheMaxPixels,
                DRAWTEXTEX_RENDER_CACHE_DEFAULT_MAX_PIXELS
            );
    const drawTextExRenderCache = new Map();
    const drawTextExRenderFunctionIds = typeof WeakMap === 'function' ? new WeakMap() : null;
    let drawTextExRenderCachePixels = 0;
    let drawTextExRenderCacheClock = 0;
    let drawTextExRenderFunctionId = 0;

    function isPerfEnabled() {
                if (!perf) return false;
                if (typeof perf.isEnabled === 'function') {
                    try { return perf.isEnabled() === true; } catch (_) { return false; }
                }
                return typeof perf.count === 'function' || typeof perf.time === 'function' || typeof perf.top === 'function';
            }

    function perfNow() {
                try {
                    if (perf && typeof perf.now === 'function') return Number(perf.now()) || 0;
                } catch (_) {}
                try {
                    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
                        return performance.now();
                    }
                } catch (_) {}
                return Date.now();
            }

    function perfStart() {
                return isPerfEnabled() ? perfNow() : null;
            }

    function perfCount(name, amount = 1, domain = WINDOW_TEXT_PERF_DOMAIN) {
                if (!perf || typeof perf.count !== 'function') return;
                try { perf.count(name, amount, { domain }); } catch (_) {}
            }

    function perfElapsed(name, start, domain = WINDOW_TEXT_PERF_DOMAIN) {
                if (!perf || typeof perf.time !== 'function') return;
                if (start === null || start === undefined) return;
                const value = Number(start);
                if (!Number.isFinite(value)) return;
                const ms = Math.max(0, perfNow() - value);
                try { perf.time(name, ms, { domain }); } catch (_) {}
            }

    function perfTop(group, label, amount = 1, domain = WINDOW_TEXT_PERF_DOMAIN) {
                if (!perf || typeof perf.top !== 'function') return;
                try { perf.top(group, label, amount, { domain }); } catch (_) {}
            }

    function perfLabel(value, fallback = 'unknown') {
                const text = String(value || fallback || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 48);
                return text || fallback || 'unknown';
            }

    function getWindowTextPerfMethod(entry) {
                if (isBitmapSurfaceTextEntry(entry)) return 'bitmapSurface';
                return entry && entry.type === 'drawTextEx' ? 'drawTextEx' : 'drawText';
            }

    function getWindowTextMetricPrefix(entry, route) {
                return `windowText.${getWindowTextPerfMethod(entry)}.${perfLabel(route, 'redraw')}`;
            }
    
    function drawTranslatedEntry(targetWindow, windowData, contents, entry) {
                const position = entry.position || {};
                const x = position.x;
                const y = position.y;
                const originalText = entry.convertedText || '';
                const renderedText = sanitizeDrawTextOutput(entry.renderedText || originalText, entry.type);
                const redrawStart = perfStart();
                const redrawMethod = getWindowTextPerfMethod(entry);
                let redrawOutcome = 'unknown';
                perfCount('windowText.redraw.calls');
                perfTop('windowText.redraw.method', redrawMethod);
                if (!renderedText || renderedText === originalText) {
                    redrawOutcome = 'skippedSame';
                    perfCount('windowText.redraw.skippedSame');
                    perfTop('windowText.redraw.outcome', redrawOutcome);
                    perfElapsed('windowText.redraw.ms', redrawStart);
                    telemetry.logDraw('skip_same', originalText, x, y, { windowType: getWindowTypeName(targetWindow, windowData) });
                    recordDecision(entry, 'draw.skipped', 'redraw matched original', {
                        windowType: getWindowTypeName(targetWindow, windowData),
                    });
                    return false;
                }
    
                const prevDrawState = contents ? captureBitmapDrawState(contents) : null;
                const storedDrawState = contents ? entry.drawState : null;
                let aggregationIncremented = false;
                let replayApi = null;
                let replayBefore = [];
                let replayAfter = [];
                let replayBeforeFiltered = 0;
                let replayAfterFiltered = 0;
                let replayDirtyRect = null;
                let replayClipRect = null;
                let replayRectForDiagnostics = null;
                let windowReplayRectForDiagnostics = null;
                let replayStateDiagnostics = null;
                let supportsReplayClip = false;
                let replayCollectError = false;
                let usedBackgroundSnapshot = false;
                let usedStaleRevisionSnapshot = false;
                let usedStaleAreaSnapshot = false;
                let snapshotRestoreAttempted = false;
                let snapshotRestoreSkippedReason = '';
                let snapshotPartialClearCount = 0;
                let replayBeforeAppliedCount = 0;
                let clearMode = 'none';
                let clearArea = null;
                let originalBounds = null;
                let translatedBounds = null;
                let bitmapSurfaceOriginalBounds = null;
                let bitmapSurfaceTranslatedBounds = null;
                let bitmapSurfaceYOffset = 0;
                let mergedBounds = null;
                let calcTextHeight = null;
                const currentDrawOrder = Number(entry.drawOrder) || 0;
                const prepareStart = perfStart();
    
                try {
                    if (contents && storedDrawState) applyBitmapDrawState(contents, storedDrawState);
                    if (contents) {
                        const boundsInfo = calculateRedrawBounds(targetWindow, contents, entry, renderedText);
                        clearArea = boundsInfo.clearArea;
                        originalBounds = boundsInfo.originalBounds;
                        translatedBounds = boundsInfo.translatedBounds;
                        bitmapSurfaceOriginalBounds = boundsInfo.bitmapSurfaceOriginalBounds;
                        bitmapSurfaceTranslatedBounds = boundsInfo.bitmapSurfaceTranslatedBounds;
                        bitmapSurfaceYOffset = boundsInfo.bitmapSurfaceYOffset;
                        mergedBounds = boundsInfo.mergedBounds;
                        calcTextHeight = boundsInfo.calcTextHeight;
    
                        replayApi = getBitmapReplayApi();
                        if (replayApi) {
                            try {
                                const state = replayApi.ensureBitmapState(contents);
                                const replayRect = clearArea
                                    ? createClearRectFromArea(clearArea, replayApi)
                                    : replayApi.rectFromDimensions(0, 0, contents.width, contents.height);
                                replayRectForDiagnostics = cloneDiagnosticRect(replayRect);
                                replayClipRect = replayRect;
                                replayStateDiagnostics = summarizeReplayStateForDiagnostics(state);
                                if (state && replayRect && currentDrawOrder > 0) {
                                    const bitmapBefore = replayApi.collectReplayItems(state, replayRect, entry, order => order < currentDrawOrder);
                                    const bitmapAfter = replayApi.collectReplayItems(state, replayRect, entry, order => order > currentDrawOrder);
                                    replayDirtyRect = expandReplayDirtyRect(replayRect, bitmapBefore.concat(bitmapAfter));
                                    supportsReplayClip = supportsBitmapReplayClip(contents);
                                    const windowReplayRect = supportsReplayClip ? replayRect : replayDirtyRect;
                                    windowReplayRectForDiagnostics = cloneDiagnosticRect(windowReplayRect);
                                    const windowItems = collectWindowTextReplayItems(
                                        windowData,
                                        entry,
                                        contents,
                                        windowReplayRect,
                                        currentDrawOrder
                                    );
                                    const beforeCandidate = combineReplayItems(
                                        bitmapBefore,
                                        windowItems.filter(item => (Number(item.drawOrder) || 0) < currentDrawOrder)
                                    );
                                    const afterCandidate = combineReplayItems(
                                        bitmapAfter,
                                        windowItems.filter(item => (Number(item.drawOrder) || 0) > currentDrawOrder)
                                    );
                                    replayBefore = filterReplayForEntry(beforeCandidate, entry);
                                    replayAfter = filterReplayForEntry(afterCandidate, entry);
                                    replayBeforeFiltered = Math.max(0, beforeCandidate.length - replayBefore.length);
                                    replayAfterFiltered = Math.max(0, afterCandidate.length - replayAfter.length);
                                }
                            } catch (_) {
                                replayBefore = [];
                                replayAfter = [];
                                replayBeforeFiltered = 0;
                                replayAfterFiltered = 0;
                                replayDirtyRect = null;
                                replayCollectError = true;
                            }
                        }
    
                        contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                        aggregationIncremented = true;
                        const clearSnapshotOutsideArea = () => {
                            const partialClearRects = [];
                            const count = shouldClearOutsideSnapshot(entry)
                                ? clearAreaOutsideSnapshot(contents, clearArea, entry && entry.backgroundSnapshot, { clearedRects: partialClearRects })
                                : 0;
                            if (count > 0) {
                                const replayed = replaySnapshotPartialClearBackground(
                                    contents,
                                    targetWindow,
                                    replayBefore,
                                    replayApi,
                                    partialClearRects
                                );
                                replayBeforeAppliedCount = Math.max(replayBeforeAppliedCount, replayed);
                            }
                            return count;
                        };
                        const clearAndReplay = () => {
                            snapshotRestoreAttempted = !!(entry && entry.backgroundSnapshot);
                            const snapshotStatus = getWindowEntryBackgroundSnapshotStatus(contents, entry, windowData);
                            if (!snapshotStatus.usable && snapshotRestoreAttempted) {
                                snapshotRestoreSkippedReason = snapshotStatus.reason || 'unusable';
                            }
                            if (snapshotStatus.usable && restoreWindowEntryBackground(contents, entry, windowData)) {
                                usedBackgroundSnapshot = true;
                                snapshotPartialClearCount = clearSnapshotOutsideArea();
                                clearMode = snapshotPartialClearCount > 0 ? 'snapshotPartialClear' : 'snapshot';
                                return;
                            }
                            if (!snapshotStatus.usable
                                && snapshotStatus.reason === 'staleRevision'
                                && restoreWindowEntryBackground(contents, entry, windowData, { allowStaleRevision: true })) {
                                usedBackgroundSnapshot = true;
                                usedStaleRevisionSnapshot = true;
                                snapshotPartialClearCount = clearSnapshotOutsideArea();
                                clearMode = snapshotPartialClearCount > 0 ? 'snapshotStaleRevisionPartialClear' : 'snapshotStaleRevision';
                                return;
                            }
                            if (!snapshotStatus.usable
                                && snapshotStatus.reason === 'staleArea'
                                && restoreWindowEntryBackground(contents, entry, windowData, { allowStaleArea: true })) {
                                usedBackgroundSnapshot = true;
                                usedStaleAreaSnapshot = true;
                                snapshotPartialClearCount = clearSnapshotOutsideArea();
                                clearMode = snapshotPartialClearCount > 0 ? 'snapshotStaleAreaPartialClear' : 'snapshotStaleArea';
                                return;
                            }
                            if (clearArea) {
                                clearMode = 'clearRect';
                                contents.clearRect(clearArea.x, clearArea.y, clearArea.w, clearArea.h);
                            } else {
                                clearMode = 'clear';
                                contents.clear();
                            }
                            if (replayApi && replayBefore.length) {
                                replayMixedItems(contents, targetWindow, replayBefore, replayApi, replayClipRect);
                                replayBeforeAppliedCount = Math.max(replayBeforeAppliedCount, replayBefore.length);
                            }
                        };
                        withWindowRedrawClear(contents, () => {
                            if (replayApi) {
                                replayApi.withBitmapReplay(contents, clearAndReplay, 'window-redraw-clear');
                            } else {
                                clearAndReplay();
                            }
                        });
                    }
                } catch (error) {
                    logger.error('[WindowText] Redraw preparation failed.', error);
                    perfCount('windowText.redraw.prepare.errors');
                } finally {
                    perfElapsed('windowText.redraw.prepare.ms', prepareStart);
                }
    
                try {
                    if (contents) {
                        contents._trPreferWindowPipeline = true;
                        contents._trWindowPipelineDepth = (contents._trWindowPipelineDepth || 0) + 1;
                    }
                    if (contents && storedDrawState) applyBitmapDrawState(contents, storedDrawState);
    
                    const snapshotDiagnostics = Object.assign(getSnapshotDiagnostics(entry, contents), {
                        restoreAttempted: snapshotRestoreAttempted,
                        restoreSkippedReason: snapshotRestoreSkippedReason,
                        restoreSucceeded: usedBackgroundSnapshot,
                        staleRevisionFallback: usedStaleRevisionSnapshot,
                        staleAreaFallback: usedStaleAreaSnapshot,
                        partialClear: snapshotPartialClearCount > 0,
                        partialClearRects: snapshotPartialClearCount,
                        contentsRevisionAtRedraw: windowData.contentsRevision || 0,
                    });
                    const sourceSnapshotDiagnostics = getEntryPixelSnapshotDiagnostics(entry, contents, 'sourceSnapshot');
                    const sourceInkDiagnostics = getSourceInkDiagnostics(entry);
                    const replayBeforeItems = summarizeReplayItemsForDiagnostics(replayBefore);
                    const replayAfterItems = summarizeReplayItemsForDiagnostics(replayAfter);
                    const diagnostics = {
                        clearMode,
                        clearArea: cloneDiagnosticArea(clearArea),
                        originalBounds,
                        translatedBounds: cloneDiagnosticRect(translatedBounds),
                        bitmapSurfaceOriginalBounds,
                        bitmapSurfaceTranslatedBounds,
                        bitmapSurfaceYOffset: roundDiagnosticNumber(bitmapSurfaceYOffset),
                        bitmapSurfaceYOffsetSource: entry && entry._trBitmapSurfaceYOffsetCache
                            ? String(entry._trBitmapSurfaceYOffsetCache.source || '')
                            : '',
                        mergedBounds,
                        calcTextHeight: roundDiagnosticNumber(calcTextHeight),
                        replayRect: replayRectForDiagnostics,
                        replayDirtyRect: cloneDiagnosticRect(replayDirtyRect),
                        replayClipRect: cloneDiagnosticRect(replayClipRect),
                        windowReplayRect: windowReplayRectForDiagnostics,
                        supportsReplayClip,
                        replayCollectError,
                        drawOrder: {
                            current: currentDrawOrder,
                            state: replayStateDiagnostics,
                        },
                        snapshot: snapshotDiagnostics,
                        sourceSnapshot: sourceSnapshotDiagnostics,
                        sourceInk: sourceInkDiagnostics,
                        replayBeforeItems,
                        replayAfterItems,
                        replayBeforeFiltered,
                        replayAfterFiltered,
                        text: {
                            rawLength: String(entry.rawText || '').length,
                            convertedLength: String(entry.convertedText || '').length,
                            visibleLength: String(entry.visibleText || '').length,
                            translatedLength: String(renderedText || '').length,
                            rawHasEscapes: /(?:\x1b|\\)/.test(String(entry.rawText || entry.convertedText || '')),
                            translatedHasEscapes: /(?:\x1b|\\)/.test(String(renderedText || '')),
                        },
                        contents: {
                            width: Number(contents && contents.width) || 0,
                            height: Number(contents && contents.height) || 0,
                            sameAsEntry: !!(contents && entry.contentsBitmap === contents),
                            revisionAtEntry: Number.isFinite(Number(entry.contentsRevision)) ? Number(entry.contentsRevision) : null,
                            revisionAtRedraw: windowData.contentsRevision || 0,
                        },
                    };
                    const redrawDetails = {
                        windowType: getWindowTypeName(targetWindow, windowData),
                        method: entry.type || '',
                        clearArea,
                        backgroundSnapshot: usedBackgroundSnapshot,
                        backgroundSnapshotStaleRevision: usedStaleRevisionSnapshot,
                        backgroundSnapshotStaleArea: usedStaleAreaSnapshot,
                        replayBefore: replayBeforeAppliedCount,
                        replayAfter: replayAfter.length,
                        translationDrawn: renderedText,
                        translationReceived: entry.providerText || '',
                        diagnosticSummary: buildRedrawDiagnosticSummary({
                            clearMode,
                            clearArea,
                            snapshotDiagnostics,
                            sourceInkDiagnostics,
                            replayBeforeItems,
                            replayAfterItems,
                            replayBeforeFiltered,
                            replayAfterFiltered,
                            replayRect: replayRectForDiagnostics,
                            replayDirtyRect,
                            replayClipRect,
                            supportsReplayClip,
                            bitmapSurfaceYOffsetSource: diagnostics.bitmapSurfaceYOffsetSource,
                        }),
                        diagnostics,
                    };
    
                    let didDraw = false;
                    const drawAndReplayAfter = () => {
                        didDraw = drawTranslatedWindowText(targetWindow, contents, entry, renderedText, { route: 'asyncRedraw' }) === true;
                        if (didDraw && replayApi && replayAfter.length) {
                            replayMixedItems(contents, targetWindow, replayAfter, replayApi, replayClipRect);
                        }
                    };
                    if (replayApi && contents) {
                        replayApi.withBitmapReplay(contents, drawAndReplayAfter, 'window-redraw-draw');
                    } else {
                        drawAndReplayAfter();
                    }
                    if (!didDraw) {
                        redrawOutcome = 'missed';
                        return false;
                    }
                    if (contents && prevDrawState) applyBitmapDrawState(contents, prevDrawState);
    
                    telemetry.logDraw('redraw', renderedText, x, y, redrawDetails);
                    recordDecision(entry, 'draw.redraw', 'window redraw applied', redrawDetails);
                    completePendingRenderCommand(entry, redrawDetails);
    
                    const key = generateKey(entry.type, x, y, windowData.windowType, entry.convertedText);
                    if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
                    windowData.recentlyRedrawn.set(key, Date.now());
                    redrawOutcome = 'drawn';
                    return true;
                } catch (error) {
                    logger.error('[WindowText] Redraw failed.', error);
                    redrawOutcome = 'error';
                    perfCount('windowText.redraw.errors');
                    return false;
                } finally {
                    perfElapsed('windowText.redraw.ms', redrawStart);
                    perfTop('windowText.redraw.outcome', redrawOutcome);
                    perfTop('windowText.redraw.clearMode', clearMode || 'none');
                    perfCount('windowText.redraw.replayBefore.items', replayBefore.length);
                    perfCount('windowText.redraw.replayAfter.items', replayAfter.length);
                    if (usedBackgroundSnapshot) perfCount('windowText.redraw.snapshot.used');
                    if (snapshotPartialClearCount > 0) perfCount('windowText.redraw.snapshot.partialClearRects', snapshotPartialClearCount);
                    if (replayCollectError) perfCount('windowText.redraw.replayCollect.errors');
                    if (contents) {
                        contents._trWindowPipelineDepth = Math.max(0, (contents._trWindowPipelineDepth || 1) - 1);
                        if (aggregationIncremented) {
                            contents._trAggregationDepth = Math.max(0, (contents._trAggregationDepth || 1) - 1);
                            if (contents._trAggregationDepth === 0
                                && typeof contents._trFlushAggregatedLines === 'function') {
                                try { contents._trFlushAggregatedLines(); } catch (_) {}
                            }
                        }
                    }
                }
            }
    
    function buildRedrawDiagnosticSummary(input = {}) {
                const snapshot = input.snapshotDiagnostics || {};
                const sourceInk = input.sourceInkDiagnostics || {};
                const replayBeforeItems = input.replayBeforeItems || {};
                const replayAfterItems = input.replayAfterItems || {};
                return {
                    clearMode: String(input.clearMode || 'none'),
                    clearArea: formatDiagnosticAreaForSummary(input.clearArea),
                    snapshotAvailable: snapshot.available === true,
                    snapshotBitmapMatches: snapshot.bitmapMatches === true,
                    snapshotRestoreAttempted: snapshot.restoreAttempted === true,
                    snapshotRestoreSucceeded: snapshot.restoreSucceeded === true,
                    snapshotStaleRevisionFallback: snapshot.staleRevisionFallback === true,
                    snapshotStaleAreaFallback: snapshot.staleAreaFallback === true,
                    snapshotPartialClear: snapshot.partialClear === true,
                    snapshotPartialClearRects: Number(snapshot.partialClearRects) || 0,
                    snapshotRestoreSkippedReason: String(snapshot.restoreSkippedReason || ''),
                    snapshotArea: formatDiagnosticAreaForSummary(snapshot.area),
                    snapshotRevision: formatSnapshotRevisionForSummary(snapshot),
                    replayCounts: formatReplayCountsForSummary(input, replayBeforeItems, replayAfterItems),
                    replayBeforeMethods: formatReplayMethodsForSummary(replayBeforeItems),
                    replayAfterMethods: formatReplayMethodsForSummary(replayAfterItems),
                    replayRect: formatDiagnosticRectForSummary(input.replayRect),
                    replayDirtyRect: formatDiagnosticRectForSummary(input.replayDirtyRect),
                    replayClipRect: formatDiagnosticRectForSummary(input.replayClipRect),
                    supportsReplayClip: input.supportsReplayClip === true,
                    bitmapSurfaceYOffsetSource: String(input.bitmapSurfaceYOffsetSource || ''),
                    sourceInkBounds: formatDiagnosticRectForSummary(sourceInk.worldBounds),
                    sourceInkBottomEdge: sourceInk.touches && sourceInk.touches.bottom === true,
                };
            }

    function shouldClearOutsideSnapshot(entry) {
                const snapshot = entry && entry.backgroundSnapshot;
                // Native bitmap draw backdrops are captured from the exact pre-draw
                // text patch. Recomputed font bounds can be taller than that patch;
                // clearing the excess would erase unrelated window art.
                return !(snapshot && snapshot.fromNativeTextBackdrop === true);
            }

    function clearAreaOutsideSnapshot(contents, clearArea, snapshot, options = {}) {
                if (!contents || typeof contents.clearRect !== 'function') return 0;
                const clear = normalizeAreaBounds(clearArea);
                const cover = normalizeAreaBounds(snapshot);
                if (!clear || !cover) return 0;
                const clearedRects = options && Array.isArray(options.clearedRects)
                    ? options.clearedRects
                    : null;

                // Snapshots restore only the captured source area. Clear uncovered
                // dirty strips so wider translations cannot leave old glyph tails.
                const ix1 = Math.max(clear.x1, cover.x1);
                const iy1 = Math.max(clear.y1, cover.y1);
                const ix2 = Math.min(clear.x2, cover.x2);
                const iy2 = Math.min(clear.y2, cover.y2);
                if (ix1 >= ix2 || iy1 >= iy2) {
                    return clearPositiveRect(contents, clear.x1, clear.y1, clear.x2 - clear.x1, clear.y2 - clear.y1, clearedRects);
                }

                let count = 0;
                count += clearPositiveRect(contents, clear.x1, clear.y1, clear.x2 - clear.x1, iy1 - clear.y1, clearedRects);
                count += clearPositiveRect(contents, clear.x1, iy2, clear.x2 - clear.x1, clear.y2 - iy2, clearedRects);
                count += clearPositiveRect(contents, clear.x1, iy1, ix1 - clear.x1, iy2 - iy1, clearedRects);
                count += clearPositiveRect(contents, ix2, iy1, clear.x2 - ix2, iy2 - iy1, clearedRects);
                return count;
            }

    function replaySnapshotPartialClearBackground(contents, targetWindow, replayBefore, replayApi, partialClearRects) {
                if (!replayApi || !Array.isArray(replayBefore) || !replayBefore.length) return 0;
                if (!Array.isArray(partialClearRects) || !partialClearRects.length) return 0;

                // The clean snapshot covers the original source patch only. Any
                // cleared translation extension must be rebuilt from earlier
                // bitmap/window layers, clipped to the strips we just cleared.
                partialClearRects.forEach((area) => {
                    const rect = replayApi.rectFromDimensions(area.x, area.y, area.w, area.h);
                    replayMixedItems(contents, targetWindow, replayBefore, replayApi, rect);
                });
                return replayBefore.length;
            }

    function normalizeAreaBounds(area) {
                if (!area) return null;
                const x = Number(area.x);
                const y = Number(area.y);
                const w = Number(area.w);
                const h = Number(area.h);
                if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
                return {
                    x1: x,
                    y1: y,
                    x2: x + w,
                    y2: y + h,
                };
            }

    function clearPositiveRect(contents, x, y, width, height, clearedRects = null) {
                if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return 0;
                contents.clearRect(x, y, width, height);
                if (Array.isArray(clearedRects)) {
                    clearedRects.push({ x, y, w: width, h: height });
                }
                return 1;
            }

    function getEntryPixelSnapshotDiagnostics(entry, contents, propertyName) {
                const snapshot = entry && propertyName ? entry[propertyName] : null;
                if (!snapshot) {
                    return {
                        available: false,
                        bitmapMatches: false,
                        area: null,
                        boundsAtCapture: null,
                        contentsRevisionAtCapture: null,
                        ageMs: null,
                    };
                }
                return {
                    available: true,
                    bitmapMatches: !!(contents && snapshot.contentsBitmap === contents),
                    area: cloneDiagnosticArea(snapshot),
                    boundsAtCapture: snapshot.bounds || null,
                    contentsRevisionAtCapture: snapshot.contentsRevision,
                    ageMs: Number.isFinite(Number(snapshot.capturedAt)) ? Math.max(0, Date.now() - Number(snapshot.capturedAt)) : null,
                };
            }

    function getSourceInkDiagnostics(entry) {
                const background = entry && entry.backgroundSnapshot ? entry.backgroundSnapshot : null;
                const source = entry && entry.sourceSnapshot ? entry.sourceSnapshot : null;
                if (!background || !source) {
                    return { available: false, reason: 'missingSnapshots' };
                }
                const width = Math.max(0, Math.floor(Number(source.w) || 0));
                const height = Math.max(0, Math.floor(Number(source.h) || 0));
                if (width <= 0 || height <= 0) {
                    return { available: false, reason: 'emptyArea' };
                }
                if (background.x !== source.x || background.y !== source.y
                    || background.w !== source.w || background.h !== source.h) {
                    return {
                        available: false,
                        reason: 'areaMismatch',
                        backgroundArea: cloneDiagnosticArea(background),
                        sourceArea: cloneDiagnosticArea(source),
                    };
                }
                const areaPixels = width * height;
                if (!Number.isFinite(areaPixels) || areaPixels <= 0) {
                    return { available: false, reason: 'invalidArea' };
                }
                if (areaPixels > 32768) {
                    return {
                        available: false,
                        reason: 'tooLarge',
                        area: cloneDiagnosticArea(source),
                        areaPixels,
                    };
                }
                const backgroundData = background.imageData && background.imageData.data;
                const sourceData = source.imageData && source.imageData.data;
                if (!backgroundData || !sourceData) {
                    return {
                        available: false,
                        reason: 'unavailablePixelData',
                        area: cloneDiagnosticArea(source),
                    };
                }
                const expectedBytes = areaPixels * 4;
                if (Number(backgroundData.length) < expectedBytes || Number(sourceData.length) < expectedBytes) {
                    return {
                        available: false,
                        reason: 'shortPixelData',
                        area: cloneDiagnosticArea(source),
                        expectedBytes,
                        backgroundBytes: Number(backgroundData.length) || 0,
                        sourceBytes: Number(sourceData.length) || 0,
                    };
                }
                let minX = width;
                let minY = height;
                let maxX = -1;
                let maxY = -1;
                let pixelCount = 0;
                for (let index = 0; index < expectedBytes; index += 4) {
                    if (backgroundData[index] === sourceData[index]
                        && backgroundData[index + 1] === sourceData[index + 1]
                        && backgroundData[index + 2] === sourceData[index + 2]
                        && backgroundData[index + 3] === sourceData[index + 3]) {
                        continue;
                    }
                    const pixelIndex = index / 4;
                    const x = pixelIndex % width;
                    const y = Math.floor(pixelIndex / width);
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    pixelCount += 1;
                }
                if (!pixelCount) {
                    return {
                        available: true,
                        changed: false,
                        area: cloneDiagnosticArea(source),
                        pixelCount: 0,
                        localBounds: null,
                        worldBounds: null,
                        touches: { left: false, top: false, right: false, bottom: false },
                        edgeSlack: { left: width, top: height, right: width, bottom: height },
                    };
                }
                const localBounds = {
                    x1: minX,
                    y1: minY,
                    x2: maxX + 1,
                    y2: maxY + 1,
                };
                return {
                    available: true,
                    changed: true,
                    area: cloneDiagnosticArea(source),
                    pixelCount,
                    localBounds: cloneDiagnosticRect(localBounds),
                    worldBounds: cloneDiagnosticRect({
                        x1: Number(source.x) + minX,
                        y1: Number(source.y) + minY,
                        x2: Number(source.x) + maxX + 1,
                        y2: Number(source.y) + maxY + 1,
                    }),
                    touches: {
                        left: minX === 0,
                        top: minY === 0,
                        right: maxX === width - 1,
                        bottom: maxY === height - 1,
                    },
                    edgeSlack: {
                        left: minX,
                        top: minY,
                        right: Math.max(0, width - (maxX + 1)),
                        bottom: Math.max(0, height - (maxY + 1)),
                    },
                };
            }

    function formatReplayCountsForSummary(input, replayBeforeItems, replayAfterItems) {
                const beforeCount = finiteDiagnosticCount(replayBeforeItems && replayBeforeItems.count);
                const afterCount = finiteDiagnosticCount(replayAfterItems && replayAfterItems.count);
                const beforeFiltered = finiteDiagnosticCount(input && input.replayBeforeFiltered);
                const afterFiltered = finiteDiagnosticCount(input && input.replayAfterFiltered);
                return [
                    `before=${beforeCount}`,
                    `after=${afterCount}`,
                    `beforeFiltered=${beforeFiltered}`,
                    `afterFiltered=${afterFiltered}`,
                ].join(';');
            }

    function finiteDiagnosticCount(value) {
                const number = Number(value);
                return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
            }

    function formatReplayMethodsForSummary(summary) {
                const methods = summary && summary.methods && typeof summary.methods === 'object'
                    ? summary.methods
                    : {};
                return Object.keys(methods)
                    .sort()
                    .map((name) => `${name}:${finiteDiagnosticCount(methods[name])}`);
            }

    function formatSnapshotRevisionForSummary(snapshot) {
                return [
                    `capture=${formatNullableDiagnosticValue(snapshot && snapshot.contentsRevisionAtCapture)}`,
                    `redraw=${formatNullableDiagnosticValue(snapshot && snapshot.contentsRevisionAtRedraw)}`,
                ].join(';');
            }

    function formatDiagnosticAreaForSummary(area) {
                if (!area) return '';
                const clone = cloneDiagnosticArea(area);
                if (!clone) return '';
                return `x=${clone.x},y=${clone.y},w=${clone.w},h=${clone.h}`;
            }

    function formatDiagnosticRectForSummary(rect) {
                if (!rect) return '';
                const clone = cloneDiagnosticRect(rect);
                if (!clone) return '';
                return `x1=${clone.x1},y1=${clone.y1},x2=${clone.x2},y2=${clone.y2}`;
            }

    function formatNullableDiagnosticValue(value) {
                return value === null || value === undefined ? 'null' : String(value);
            }

    function calculateRedrawBounds(targetWindow, contents, entry, translatedText) {
                const boundsStart = perfStart();
                perfCount('windowText.redraw.bounds.calls');
                perfTop('windowText.redraw.bounds.method', getWindowTextPerfMethod(entry));
                const position = entry.position || {};
                let bounds = entry.bounds || {
                    x1: Number(position.x) || 0,
                    y1: Number(position.y) || 0,
                    x2: Number(position.x) || 0,
                    y2: Number(position.y) || 0,
                };
                let bitmapSurfaceOriginalBounds = null;
                let bitmapSurfaceTranslatedBounds = null;
                try {
                    bitmapSurfaceOriginalBounds = estimateBitmapSurfaceTextBounds(
                        contents,
                        entry,
                        entry.visibleText || entry.convertedText || entry.rawText || ''
                    );
                    bounds = mergeBounds(bounds, bitmapSurfaceOriginalBounds) || bounds;
                } catch (_) {}
                const originalBounds = cloneDiagnosticRect(bounds);
                let translatedBounds = null;
                let calcTextHeight = null;
                let bitmapSurfaceYOffset = 0;
                try {
                    const measureTranslatedBounds = () => withCapturedDrawTextExState(targetWindow, contents, entry, () => {
                        bitmapSurfaceYOffset = calculateBitmapSurfaceTextYOffset(contents, entry, translatedText);
                        translatedBounds = withWindowContents(targetWindow, contents, () => estimateEntryBounds(
                            targetWindow,
                            entry.type,
                            translatedText,
                            position.x,
                            position.y,
                            translatedText,
                            entry.originalParams
                        ));
                        const translatedEntry = bitmapSurfaceYOffset
                            ? Object.assign({}, entry, {
                                position: {
                                    x: position.x,
                                    y: (Number(position.y) || 0) + bitmapSurfaceYOffset,
                                },
                            })
                            : entry;
                        bitmapSurfaceTranslatedBounds = estimateBitmapSurfaceTextBounds(contents, translatedEntry, translatedText);
                        translatedBounds = mergeBounds(translatedBounds, bitmapSurfaceTranslatedBounds) || translatedBounds;
                        bounds = mergeBounds(bounds, translatedBounds) || bounds;
                        const measuredHeight = measureDrawTextExHeightForEntry(
                            targetWindow,
                            contents,
                            entry,
                            translatedText || entry.convertedText || '',
                            position.x,
                            position.y,
                            0
                        );
                        if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
                            calcTextHeight = measuredHeight;
                        }
                    });
                    if (isBitmapSurfaceTextEntry(entry)) {
                        withTranslatedWindowTextScale(targetWindow, measureTranslatedBounds);
                    } else {
                        measureTranslatedBounds();
                    }
                } catch (_) {}
                let clearX = Math.min(bounds.x1, bounds.x2);
                let clearY = Math.min(bounds.y1, bounds.y2);
                let clearW = Math.abs(bounds.x2 - bounds.x1);
                let clearH = Math.abs(bounds.y2 - bounds.y1);
                if (Number.isFinite(calcTextHeight) && calcTextHeight > 0) {
                    clearH = Math.max(clearH, calcTextHeight);
                }
                if (entry.type === 'drawTextEx') {
                    clearH = Math.max(
                        clearH,
                        estimateMaxDrawTextExFallbackHeight(
                            getEntryDrawTextExBaseLineHeight(targetWindow, contents, entry),
                            translatedText,
                            entry.convertedText,
                            entry.rawText
                        )
                    );
                }
    
                let clearArea = null;
                if (Number.isFinite(clearW) && Number.isFinite(clearH)) {
                    const outline = Math.max(
                        0,
                        typeof contents.outlineWidth === 'number'
                            ? contents.outlineWidth
                            : redrawSettings.defaultOutline
                    );
                    clearX = Math.floor(clearX - outline - redrawSettings.extraPadding);
                    clearY = Math.floor(clearY - outline - redrawSettings.extraPadding);
                    clearW = Math.ceil(clearW + outline * 2 + redrawSettings.extraPadding * 2);
                    clearH = Math.ceil(clearH + outline * 2 + redrawSettings.extraPadding * 2);
                    clearX = Math.max(0, clearX);
                    clearY = Math.max(0, clearY);
                    clearW = Math.max(0, Math.min(Number(contents.width) - clearX, clearW));
                    clearH = Math.max(0, Math.min(Number(contents.height) - clearY, clearH));
                    clearArea = { x: clearX, y: clearY, w: clearW, h: clearH };
                }
                perfElapsed('windowText.redraw.bounds.ms', boundsStart);
                return {
                    clearArea,
                    originalBounds,
                    translatedBounds,
                    bitmapSurfaceOriginalBounds: cloneDiagnosticRect(bitmapSurfaceOriginalBounds),
                    bitmapSurfaceTranslatedBounds: cloneDiagnosticRect(bitmapSurfaceTranslatedBounds),
                    bitmapSurfaceYOffset,
                    mergedBounds: cloneDiagnosticRect(bounds),
                    calcTextHeight,
                };
            }
    
    function drawTranslatedWindowText(targetWindow, contents, entry, translatedText, options = {}) {
                const position = entry.position || {};
                const params = entry.originalParams || {};
                const route = perfLabel(options.route || 'redraw', 'redraw');
                const metricPrefix = getWindowTextMetricPrefix(entry, route);
                const drawStart = perfStart();
                let drew = false;
                perfCount(`${metricPrefix}.calls`);
                perfTop('windowText.render.route', route);
                perfTop('windowText.render.method', getWindowTextPerfMethod(entry));
                try {
                    withBitmapNativeDrawOwner(contents, getWindowNativeDrawOwner(entry, route), () => {
                        withWindowContents(targetWindow, contents, () => {
                            if (!isBitmapSurfaceTextEntry(entry)
                                && entry.type === 'drawTextEx'
                                && typeof targetWindow.drawTextEx === 'function') {
                                const cached = drawCachedDrawTextEx(targetWindow, contents, entry, translatedText, route);
                                if (cached && cached.drew) {
                                    drew = true;
                                } else {
                                    withWindowTranslatedDrawScope(targetWindow, () => {
                                        withCapturedDrawTextExState(targetWindow, contents, entry, () => {
                                            targetWindow.drawTextEx(translatedText, position.x, position.y);
                                        });
                                        drew = true;
                                    });
                                }
                            } else {
                                withWindowTranslatedDrawScope(targetWindow, () => {
                                    if (isBitmapSurfaceTextEntry(entry) && contents && typeof contents.drawText === 'function') {
                                        drew = drawBitmapSurfaceWindowText(targetWindow, contents, entry, translatedText);
                                    } else if (typeof targetWindow.drawText === 'function') {
                                        targetWindow.drawText(translatedText, position.x, position.y, params.maxWidth, params.align);
                                        drew = true;
                                    }
                                });
                            }
                        });
                    });
                    return drew;
                } catch (error) {
                    perfCount(`${metricPrefix}.errors`);
                    throw error;
                } finally {
                    perfElapsed(`${metricPrefix}.ms`, drawStart);
                    perfCount(`${metricPrefix}.${drew ? 'drawn' : 'missed'}`);
                }
            }

    function drawBitmapSurfaceWindowText(targetWindow, contents, entry, translatedText) {
                const position = entry.position || {};
                const params = entry.originalParams || {};
                const lineHeight = Number.isFinite(Number(params.lineHeight)) && Number(params.lineHeight) > 0
                    ? Number(params.lineHeight)
                    : getLineHeight(targetWindow, contents);
                const yOffset = calculateBitmapSurfaceTextYOffset(contents, entry, translatedText);
                contents._trPreferWindowPipeline = true;
                contents._trWindowPipelineDepth = (contents._trWindowPipelineDepth || 0) + 1;
                contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                try {
                    contents.drawText(
                        translatedText,
                        position.x,
                        (Number(position.y) || 0) + yOffset,
                        params.maxWidth,
                        lineHeight,
                        normalizeDrawTextAlignValue(params.align)
                    );
                    return true;
                } finally {
                    contents._trWindowPipelineDepth = Math.max(0, (contents._trWindowPipelineDepth || 1) - 1);
                    contents._trAggregationDepth = Math.max(0, (contents._trAggregationDepth || 1) - 1);
                    if (contents._trAggregationDepth === 0
                        && typeof contents._trFlushAggregatedLines === 'function') {
                        try { contents._trFlushAggregatedLines(); } catch (_) {}
                    }
                }
            }

    function isBitmapSurfaceTextEntry(entry) {
                const origin = entry && entry.drawOrigin;
                return !!(origin && origin.type === 'bitmapSurface');
            }

    function drawCachedDrawTextEx(targetWindow, contents, entry, translatedText, route) {
                const routeLabel = perfLabel(route || 'redraw', 'redraw');
                const metricPrefix = getWindowTextMetricPrefix(entry, routeLabel);
                const cacheStart = perfStart();
                let outcome = 'unknown';
                perfCount(`${metricPrefix}.renderCache.calls`);
                try {
                    const plan = createDrawTextExRenderPlan(targetWindow, contents, entry, translatedText);
                    if (!plan) {
                        outcome = 'skipped';
                        perfCount(`${metricPrefix}.renderCache.skipped`);
                        return null;
                    }
                    const key = createDrawTextExRenderCacheKey(targetWindow, contents, entry, translatedText, plan);
                    let cached = drawTextExRenderCache.get(key);
                    if (cached && cached.bitmap) {
                        cached.lastUsed = ++drawTextExRenderCacheClock;
                        outcome = 'hit';
                        perfCount(`${metricPrefix}.renderCache.hit`);
                    } else {
                        outcome = 'miss';
                        perfCount(`${metricPrefix}.renderCache.miss`);
                        cached = renderDrawTextExCacheEntry(targetWindow, contents, entry, translatedText, plan, routeLabel);
                        if (!cached) {
                            outcome = 'renderFailed';
                            perfCount(`${metricPrefix}.renderCache.renderFailed`);
                            return null;
                        }
                        rememberDrawTextExRenderCacheEntry(key, cached);
                    }
                    if (!blitDrawTextExCacheEntry(contents, entry, cached, plan, routeLabel)) {
                        outcome = 'blitFailed';
                        perfCount(`${metricPrefix}.renderCache.blitFailed`);
                        return null;
                    }
                    perfCount(`${metricPrefix}.renderCache.drawn`);
                    return { drew: true, result: cached.result };
                } catch (error) {
                    outcome = 'error';
                    perfCount(`${metricPrefix}.renderCache.errors`);
                    return null;
                } finally {
                    perfTop('windowText.drawTextEx.renderCache.outcome', outcome);
                    perfElapsed(`${metricPrefix}.renderCache.ms`, cacheStart);
                }
            }

    function createDrawTextExRenderPlan(targetWindow, contents, entry, translatedText) {
                if (!isDrawTextExRenderCacheEnabled()) return null;
                if (!targetWindow || !contents || !entry || entry.type !== 'drawTextEx') return null;
                if (isBitmapSurfaceTextEntry(entry)) return null;
                if (typeof targetWindow.drawTextEx !== 'function') return null;
                if (hasPositionSensitiveDrawTextExControls(translatedText)) return null;
                if (hasUnsupportedDrawTextExRenderCacheControls(translatedText)) return null;
                const BitmapCtor = globalScope && globalScope.Bitmap;
                if (typeof BitmapCtor !== 'function') return null;
                if (!canBlitDrawTextExRenderCache(contents)) return null;

                const contentWidth = Math.ceil(Number(contents.width) || 0);
                const contentHeight = Math.ceil(Number(contents.height) || 0);
                if (contentWidth <= 0 || contentHeight <= 0) return null;

                const padding = getDrawTextExRenderCachePadding(contents);
                const drawX = padding;
                const drawY = padding;
                const lineHeight = getEntryDrawTextExBaseLineHeight(targetWindow, contents, entry);
                const fallbackHeight = estimateMaxDrawTextExFallbackHeight(
                    lineHeight,
                    translatedText,
                    entry.convertedText,
                    entry.rawText
                );
                let estimatedHeight = fallbackHeight;
                try {
                    const bounds = withCapturedDrawTextExState(targetWindow, contents, entry, () => withWindowContents(targetWindow, contents, () => estimateEntryBounds(
                        targetWindow,
                        entry.type,
                        translatedText,
                        drawX,
                        drawY,
                        translatedText,
                        entry.originalParams
                    )));
                    if (bounds && [bounds.y1, bounds.y2].every(Number.isFinite)) {
                        estimatedHeight = Math.max(estimatedHeight, Math.ceil(Math.abs(bounds.y2 - bounds.y1)));
                    }
                } catch (_) {}
                estimatedHeight = Math.max(
                    estimatedHeight,
                    measureDrawTextExRenderCacheHeight(targetWindow, contents, entry, translatedText, drawX, drawY, fallbackHeight),
                    lineHeight
                );

                const width = Math.max(1, contentWidth + padding * 2);
                const height = Math.max(1, Math.ceil(estimatedHeight + padding * 2));
                const pixels = width * height;
                if (!Number.isFinite(pixels) || pixels <= 0) return null;
                if (drawTextExRenderCacheMaxPixels > 0 && pixels > drawTextExRenderCacheMaxPixels) return null;
                if (width > 8192 || height > 8192) return null;

                const position = entry.position || {};
                const destX = (Number.isFinite(Number(position.x)) ? Number(position.x) : 0) - padding;
                const destY = (Number.isFinite(Number(position.y)) ? Number(position.y) : 0) - padding;
                return {
                    width,
                    height,
                    pixels,
                    padding,
                    drawX,
                    drawY,
                    destX,
                    destY,
                    lineHeight,
                    contentWidth,
                    contentHeight,
                    escapeSignature: getDrawTextExEscapeSignature(targetWindow, translatedText),
                };
            }

    function isDrawTextExRenderCacheEnabled() {
                if (settings && settings.drawTextExRenderCache === false) return false;
                return drawTextExRenderCacheMaxEntries > 0 && drawTextExRenderCacheMaxPixels > 0;
            }

    function canBlitDrawTextExRenderCache(contents) {
                if (!contents) return false;
                if (typeof contents.blt === 'function') return true;
                const context = getBitmapCanvasContext(contents);
                return !!(context && typeof context.drawImage === 'function');
            }

    function getDrawTextExRenderCachePadding(contents) {
                const outline = Math.max(
                    0,
                    typeof contents.outlineWidth === 'number'
                        ? contents.outlineWidth
                        : redrawSettings.defaultOutline
                );
                return Math.ceil(outline + redrawSettings.extraPadding + 2);
            }

    function measureDrawTextExRenderCacheHeight(targetWindow, contents, entry, text, x, y, fallbackHeight) {
                return Math.max(
                    Math.max(1, Math.ceil(Number(fallbackHeight) || 0)),
                    measureDrawTextExHeightForEntry(targetWindow, contents, entry, text, x, y, fallbackHeight)
                );
            }

    function createDrawTextExRenderCacheKey(targetWindow, contents, entry, translatedText, plan) {
                const drawState = entry && entry.drawState
                    ? entry.drawState
                    : (contents ? captureBitmapDrawState(contents) : null);
                return stableCacheString([
                    DRAWTEXTEX_RENDER_CACHE_VERSION,
                    String(translatedText || ''),
                    plan.escapeSignature,
                    getDrawTextExRendererSignature(targetWindow, entry),
                    drawState || null,
                    {
                        width: plan.width,
                        height: plan.height,
                        padding: plan.padding,
                        lineHeight: plan.lineHeight,
                        contentWidth: plan.contentWidth,
                        contentHeight: plan.contentHeight,
                        iconWidth: getWindowIconWidth(),
                        textScaleOthers,
                    },
                ]);
            }

    function getDrawTextExRendererSignature(targetWindow, entry) {
                return {
                    windowType: getWindowTypeName(targetWindow, entry && entry.windowData ? entry.windowData : null),
                    ctor: getWindowCtorName(targetWindow),
                    drawTextEx: getFunctionCacheId(targetWindow && targetWindow.drawTextEx && targetWindow.drawTextEx.__trOriginal
                        ? targetWindow.drawTextEx.__trOriginal
                        : (targetWindow ? targetWindow.drawTextEx : null)),
                    convertEscapeCharacters: getFunctionCacheId(targetWindow ? targetWindow.convertEscapeCharacters : null),
                    processEscapeCharacter: getFunctionCacheId(targetWindow ? targetWindow.processEscapeCharacter : null),
                    drawIcon: getFunctionCacheId(targetWindow ? targetWindow.drawIcon : null),
                };
            }

    function getFunctionCacheId(fn) {
                if (typeof fn !== 'function') return '';
                if (!drawTextExRenderFunctionIds) return String(fn).slice(0, 160);
                let id = drawTextExRenderFunctionIds.get(fn);
                if (!id) {
                    id = `fn:${++drawTextExRenderFunctionId}`;
                    drawTextExRenderFunctionIds.set(fn, id);
                }
                return id;
            }

    function getDrawTextExEscapeSignature(targetWindow, text) {
                const value = String(text || '');
                try {
                    if (targetWindow && typeof targetWindow.convertEscapeCharacters === 'function') {
                        return String(targetWindow.convertEscapeCharacters(value));
                    }
                } catch (_) {}
                return value;
            }

    function hasPositionSensitiveDrawTextExControls(text) {
                return /(?:\x1b|\\)(?:PX|PY|POS|XY|X|Y)\s*(?:\[|<)/i.test(String(text || ''));
            }

    function hasUnsupportedDrawTextExRenderCacheControls(text) {
                const value = String(text || '');
                const safeCodes = {
                    C: true,
                    I: true,
                    FS: true,
                    V: true,
                    N: true,
                    P: true,
                    G: true,
                    OC: true,
                    OW: true,
                };
                const safeSingles = {
                    '{': true,
                    '}': true,
                    '.': true,
                    '|': true,
                    '!': true,
                    '>': true,
                    '<': true,
                    '^': true,
                    '$': true,
                };
                const pattern = /(?:\x1b|\\)([A-Za-z]+|[{}.$|!><^])(?:\[[^\]]*\]|<[^>]*>)?/g;
                let match = null;
                while ((match = pattern.exec(value))) {
                    const code = String(match[1] || '').toUpperCase();
                    if (!code) continue;
                    if (safeCodes[code] || safeSingles[code]) continue;
                    return true;
                }
                return false;
            }

    function renderDrawTextExCacheEntry(targetWindow, contents, entry, translatedText, plan, route) {
                const bitmap = createDrawTextExRenderCacheBitmap(plan.width, plan.height);
                if (!bitmap) return null;
                const drawState = entry && entry.drawState
                    ? entry.drawState
                    : (contents ? captureBitmapDrawState(contents) : null);
                try {
                    clearDrawTextExRenderCacheBitmap(bitmap, plan.width, plan.height);
                    if (drawState) applyBitmapDrawState(bitmap, drawState);
                    const result = withWindowContents(targetWindow, bitmap, () => {
                        return withWindowTranslatedDrawScope(targetWindow, () => {
                            return withBitmapNativeDrawOwner(
                                bitmap,
                                getWindowNativeDrawOwner(entry, `${route}.renderCache`),
                                () => withCapturedDrawTextExState(targetWindow, bitmap, entry, () => withWindowDrawTextExReplayScope(bitmap, () => targetWindow.drawTextEx(translatedText, plan.drawX, plan.drawY)))
                            );
                        });
                    });
                    return {
                        bitmap,
                        result,
                        width: plan.width,
                        height: plan.height,
                        pixels: plan.pixels,
                        lastUsed: ++drawTextExRenderCacheClock,
                    };
                } catch (_) {
                    destroyDrawTextExRenderCacheBitmap(bitmap);
                    return null;
                }
            }

    function createDrawTextExRenderCacheBitmap(width, height) {
                const BitmapCtor = globalScope && globalScope.Bitmap;
                if (typeof BitmapCtor !== 'function') return null;
                try {
                    const bitmap = new BitmapCtor(width, height);
                    if (bitmap && typeof bitmap.resize === 'function'
                        && (Math.ceil(Number(bitmap.width) || 0) !== width
                            || Math.ceil(Number(bitmap.height) || 0) !== height)) {
                        try { bitmap.resize(width, height); } catch (_) {}
                    }
                    return bitmap || null;
                } catch (_) {
                    return null;
                }
            }

    function clearDrawTextExRenderCacheBitmap(bitmap, width, height) {
                if (!bitmap) return;
                try {
                    if (typeof bitmap.clear === 'function') {
                        bitmap.clear();
                        return;
                    }
                } catch (_) {}
                try {
                    if (typeof bitmap.clearRect === 'function') {
                        bitmap.clearRect(0, 0, width, height);
                        return;
                    }
                } catch (_) {}
                try {
                    const context = getBitmapCanvasContext(bitmap);
                    if (context && typeof context.clearRect === 'function') context.clearRect(0, 0, width, height);
                } catch (_) {}
            }

    function rememberDrawTextExRenderCacheEntry(key, entry) {
                if (!key || !entry) return;
                if (drawTextExRenderCacheMaxEntries <= 0 || drawTextExRenderCacheMaxPixels <= 0) return;
                drawTextExRenderCache.set(key, entry);
                drawTextExRenderCachePixels += Math.max(0, Number(entry.pixels) || 0);
                evictDrawTextExRenderCache();
            }

    function evictDrawTextExRenderCache() {
                while (drawTextExRenderCache.size > drawTextExRenderCacheMaxEntries
                    || drawTextExRenderCachePixels > drawTextExRenderCacheMaxPixels) {
                    let oldestKey = null;
                    let oldestEntry = null;
                    drawTextExRenderCache.forEach((entry, key) => {
                        if (!oldestEntry || Number(entry.lastUsed || 0) < Number(oldestEntry.lastUsed || 0)) {
                            oldestEntry = entry;
                            oldestKey = key;
                        }
                    });
                    if (!oldestKey) return;
                    drawTextExRenderCache.delete(oldestKey);
                    drawTextExRenderCachePixels = Math.max(
                        0,
                        drawTextExRenderCachePixels - Math.max(0, Number(oldestEntry && oldestEntry.pixels) || 0)
                    );
                    destroyDrawTextExRenderCacheBitmap(oldestEntry && oldestEntry.bitmap);
                }
            }

    function destroyDrawTextExRenderCacheBitmap(bitmap) {
                if (!bitmap || typeof bitmap.destroy !== 'function') return;
                try { bitmap.destroy(); } catch (_) {}
            }

    function blitDrawTextExCacheEntry(contents, entry, cached, plan, route) {
                if (!contents || !cached || !cached.bitmap || !plan) return false;
                const owner = getWindowNativeDrawOwner(entry, `${route}.renderCacheBlit`);
                return withBitmapNativeDrawOwner(contents, owner, () => {
                    contents._trPreferWindowPipeline = true;
                    contents._trWindowPipelineDepth = (contents._trWindowPipelineDepth || 0) + 1;
                    contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                    contents._trBitmapSkipDepth = (contents._trBitmapSkipDepth || 0) + 1;
                    try {
                        if (typeof contents.blt === 'function') {
                            contents.blt(
                                cached.bitmap,
                                0,
                                0,
                                plan.width,
                                plan.height,
                                plan.destX,
                                plan.destY,
                                plan.width,
                                plan.height
                            );
                            return true;
                        }
                        const source = getBitmapCanvasSource(cached.bitmap);
                        const context = getBitmapCanvasContext(contents);
                        if (source && context && typeof context.drawImage === 'function') {
                            context.drawImage(
                                source,
                                0,
                                0,
                                plan.width,
                                plan.height,
                                plan.destX,
                                plan.destY,
                                plan.width,
                                plan.height
                            );
                            markBitmapDirty(contents);
                            return true;
                        }
                    } catch (_) {
                        return false;
                    } finally {
                        contents._trBitmapSkipDepth = Math.max(0, (contents._trBitmapSkipDepth || 1) - 1);
                        contents._trWindowPipelineDepth = Math.max(0, (contents._trWindowPipelineDepth || 1) - 1);
                        contents._trAggregationDepth = Math.max(0, (contents._trAggregationDepth || 1) - 1);
                        if (contents._trAggregationDepth === 0
                            && typeof contents._trFlushAggregatedLines === 'function') {
                            try { contents._trFlushAggregatedLines(); } catch (_) {}
                        }
                    }
                    return false;
                });
            }

    function getBitmapCanvasSource(bitmap) {
                if (!bitmap) return null;
                if (bitmap.canvas) return bitmap.canvas;
                if (bitmap._canvas) return bitmap._canvas;
                if (bitmap._image) return bitmap._image;
                try {
                    const texture = bitmap._baseTexture || bitmap.baseTexture;
                    const resource = texture && texture.resource;
                    if (resource && resource.source) return resource.source;
                } catch (_) {}
                return null;
            }

    function markBitmapDirty(bitmap) {
                if (!bitmap) return;
                try {
                    if (typeof bitmap._setDirty === 'function') {
                        bitmap._setDirty();
                        return;
                    }
                } catch (_) {}
                try {
                    if (bitmap.baseTexture && typeof bitmap.baseTexture.update === 'function') {
                        bitmap.baseTexture.update();
                    }
                } catch (_) {}
            }

    function resolveNonNegativeInteger(value, fallback) {
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric >= 0) return Math.floor(numeric);
                return fallback;
            }

    function stableCacheString(value) {
                return stableCacheStringValue(value, 0);
            }

    function stableCacheStringValue(value, depth) {
                if (value === null || value === undefined) return 'null';
                const type = typeof value;
                if (type === 'string') return quoteCacheString(value);
                if (type === 'number' || type === 'boolean') return String(value);
                if (type === 'function') return quoteCacheString(getFunctionCacheId(value));
                if (depth > 6) return quoteCacheString('[depth]');
                if (Array.isArray(value)) {
                    return `[${value.map((item) => stableCacheStringValue(item, depth + 1)).join(',')}]`;
                }
                if (type === 'object') {
                    const keys = Object.keys(value).sort();
                    const parts = [];
                    keys.forEach((key) => {
                        const item = value[key];
                        if (item === undefined || typeof item === 'function') return;
                        parts.push(`${quoteCacheString(key)}:${stableCacheStringValue(item, depth + 1)}`);
                    });
                    return `{${parts.join(',')}}`;
                }
                return quoteCacheString(String(value));
            }

    function quoteCacheString(value) {
                return `"${String(value)
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\r/g, '\\r')
                    .replace(/\n/g, '\\n')}"`;
            }
    
    function invokeCompletedEntry(entry, originalText, invokeOriginal, eventName) {
                const translated = sanitizeDrawTextOutput(entry.renderedText, entry.type);
                const route = 'completedSubstitution';
                const metricPrefix = getWindowTextMetricPrefix(entry, route);
                perfCount(`${metricPrefix}.calls`);
                perfTop('windowText.completedSubstitution.method', getWindowTextPerfMethod(entry));
                perfTop('windowText.completedSubstitution.event', eventName || 'unknown');
                if (typeof translated !== 'string' || translated.trim() === String(originalText || '').trim()) {
                    perfCount(`${metricPrefix}.skippedSame`);
                    recordDecision(entry, 'draw.skipped', 'cached redraw matched original', {
                        method: eventName,
                        windowType: entry.windowData && entry.windowData.windowType ? entry.windowData.windowType : '',
                    });
                    return invokeOriginal();
                }
                const completedStart = perfStart();
                telemetry.logDraw('redraw', translated, entry.position.x, entry.position.y, {
                    windowType: entry.windowData && entry.windowData.windowType ? entry.windowData.windowType : '',
                    method: eventName,
                });
                let drew = false;
                try {
                    const windowData = resolveWindowData(entry);
                    const targetWindow = resolveTargetWindow(entry, windowData);
                    const contents = getRedrawContents(targetWindow, entry);
                    const result = invokeOriginal(undefined, {
                        nativeDrawOwner: getWindowNativeDrawOwner(entry, `${route}.source`),
                    });
                    captureCompletedSourceSnapshot(contents, entry);
                    if (targetWindow && windowData && contents) {
                        drew = drawTranslatedEntry(targetWindow, windowData, contents, entry) === true;
                    }
                    if (drew) {
                        recordDecision(entry, 'draw.existing', 'existing translated text redrawn', {
                            windowType: entry.windowData && entry.windowData.windowType ? entry.windowData.windowType : '',
                            method: eventName,
                            translationDrawn: translated,
                        });
                    } else {
                        recordDecision(entry, 'draw.deferred', 'existing source text left until redraw is possible', {
                            windowType: entry.windowData && entry.windowData.windowType ? entry.windowData.windowType : '',
                            method: eventName,
                            translationReceived: translated,
                        });
                        if (targetWindow && windowData) {
                            queuePendingRedraw(targetWindow, windowData, entry, entry.key || getTextEntryKey(windowData, entry));
                        }
                    }
                    return result;
                } finally {
                    perfElapsed(`${metricPrefix}.ms`, completedStart);
                    perfCount(`${metricPrefix}.${drew ? 'drawn' : 'missed'}`);
                }
            }

    function captureCompletedSourceSnapshot(contents, entry) {
                const capture = context && typeof context.captureWindowEntrySource === 'function'
                    ? context.captureWindowEntrySource
                    : null;
                if (!capture || !contents || !entry) return false;
                try {
                    return capture(contents, entry) === true;
                } catch (_) {
                    return false;
                }
            }
    
    function invokeOriginalDrawText(windowInstance, originalDrawText, value, x, y, maxWidth, align, options = {}) {
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const draw = () => {
                    if (!contents) return originalDrawText.call(windowInstance, value, x, y, maxWidth, align);
                    return withBitmapNativeDrawOwner(contents, options.nativeDrawOwner || (options.scaleText ? 'windowDrawText' : ''), () => {
                        contents._trPreferWindowPipeline = true;
                        contents._trWindowPipelineDepth = (contents._trWindowPipelineDepth || 0) + 1;
                        contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                        try {
                            return originalDrawText.call(windowInstance, value, x, y, maxWidth, align);
                        } finally {
                            contents._trWindowPipelineDepth = Math.max(0, (contents._trWindowPipelineDepth || 1) - 1);
                            contents._trAggregationDepth = Math.max(0, (contents._trAggregationDepth || 1) - 1);
                            if (contents._trAggregationDepth === 0 && typeof contents._trFlushAggregatedLines === 'function') {
                                try { contents._trFlushAggregatedLines(); } catch (_) {}
                            }
                        }
                    });
                };
                return options && options.scaleText ? withWindowTranslatedDrawScope(windowInstance, draw) : draw();
            }
    
    function invokeOriginalDrawTextEx(windowInstance, originalDrawTextEx, value, x, y, options = {}) {
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const draw = () => {
                    return withBitmapNativeDrawOwner(contents, options.nativeDrawOwner || (options.scaleText ? 'windowDrawTextEx' : ''), () => {
                        if (contents) contents._trBitmapSkipDepth = (contents._trBitmapSkipDepth || 0) + 1;
                        try {
                            return withWindowDrawTextExReplayScope(contents, () => originalDrawTextEx.call(windowInstance, value, x, y));
                        } finally {
                            if (contents) contents._trBitmapSkipDepth = Math.max(0, (contents._trBitmapSkipDepth || 1) - 1);
                        }
                    });
                };
                return options && options.scaleText ? withWindowTranslatedDrawScope(windowInstance, draw) : draw();
            }

    function getWindowNativeDrawOwner(entry, route = '') {
                let owner = 'windowDrawText';
                if (isBitmapSurfaceTextEntry(entry)) {
                    owner = 'windowBitmapSurface';
                } else if (entry && entry.type === 'drawTextEx') {
                    owner = 'windowDrawTextEx';
                }
                const suffix = route ? perfLabel(route, '') : '';
                return suffix ? `${owner}.${suffix}` : owner;
            }

    function withBitmapNativeDrawOwner(bitmap, owner, callback) {
                if (typeof callback !== 'function') return undefined;
                if (!bitmap || !owner) return callback();
                const previous = bitmap._trBitmapNativeDrawOwner;
                bitmap._trBitmapNativeDrawOwner = owner;
                try {
                    return callback();
                } finally {
                    if (previous === undefined) {
                        try { delete bitmap._trBitmapNativeDrawOwner; } catch (_) { bitmap._trBitmapNativeDrawOwner = undefined; }
                    } else {
                        bitmap._trBitmapNativeDrawOwner = previous;
                    }
                }
            }

    function withCapturedDrawTextExState(targetWindow, contents, entry, callback) {
                if (typeof callback !== 'function') return undefined;
                if (!targetWindow || !contents || !entry || entry.type !== 'drawTextEx' || !entry.drawState) {
                    return callback();
                }
                const originalReset = typeof targetWindow.resetFontSettings === 'function'
                    ? targetWindow.resetFontSettings
                    : null;
                const reapply = () => {
                    try { applyBitmapDrawState(contents, entry.drawState); } catch (_) {}
                };
                if (!originalReset) {
                    reapply();
                    return callback();
                }
                targetWindow.resetFontSettings = function() {
                    const result = originalReset.apply(this, arguments);
                    reapply();
                    return result;
                };
                try {
                    reapply();
                    return callback();
                } finally {
                    targetWindow.resetFontSettings = originalReset;
                }
            }

    function getEntryDrawTextExBaseLineHeight(targetWindow, contents, entry) {
                const params = entry && entry.originalParams ? entry.originalParams : null;
                const requestedLineHeight = Number(params && params.lineHeight);
                if (Number.isFinite(requestedLineHeight) && requestedLineHeight > 0) {
                    return Math.max(1, Math.ceil(requestedLineHeight));
                }
                if (targetWindow && typeof targetWindow.calcTextHeight === 'function') {
                    const drawStateFontSize = Number(entry && entry.drawState && entry.drawState.fontSize);
                    if (Number.isFinite(drawStateFontSize) && drawStateFontSize > 0) {
                        return Math.max(1, Math.ceil(drawStateFontSize));
                    }
                    if (contents && typeof contents.fontSize === 'number') {
                        const fontSize = Number(contents.fontSize);
                        if (Number.isFinite(fontSize) && fontSize > 0) {
                            return Math.max(1, Math.ceil(fontSize));
                        }
                    }
                }
                return getLineHeight(targetWindow, contents);
            }

    function measureDrawTextExHeightForEntry(targetWindow, contents, entry, text, x, y, fallbackHeight) {
                if (!targetWindow || !entry || entry.type !== 'drawTextEx' || typeof targetWindow.calcTextHeight !== 'function') {
                    return Math.max(0, Number(fallbackHeight) || 0);
                }
                const calcHeightStart = perfStart();
                perfCount('windowText.measure.calcTextHeight.calls');
                perfTop('windowText.measure.calcTextHeight.method', getWindowTextPerfMethod(entry));
                try {
                    return withCapturedDrawTextExState(targetWindow, contents, entry, () => {
                        const textState = createDrawTextExMeasureStateForEntry(targetWindow, entry, text, x, y, fallbackHeight);
                        const measured = Number(withWindowContents(targetWindow, contents, () => targetWindow.calcTextHeight(textState, true)));
                        return Number.isFinite(measured) && measured > 0
                            ? Math.ceil(measured)
                            : Math.max(0, Number(fallbackHeight) || 0);
                    });
                } catch (_) {
                    return Math.max(0, Number(fallbackHeight) || 0);
                } finally {
                    perfElapsed('windowText.measure.calcTextHeight.ms', calcHeightStart);
                }
            }

    function createDrawTextExMeasureStateForEntry(targetWindow, entry, text, x, y, fallbackHeight) {
                const params = entry && entry.originalParams ? entry.originalParams : {};
                const drawX = Number.isFinite(Number(x)) ? Number(x) : 0;
                const drawY = Number.isFinite(Number(y)) ? Number(y) : 0;
                const maxWidth = Number(params.maxWidth);
                if (targetWindow && typeof targetWindow.createTextState === 'function') {
                    try {
                        return targetWindow.createTextState(
                            String(text || ''),
                            drawX,
                            drawY,
                            Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : 0
                        );
                    } catch (_) {}
                }
                return {
                    index: 0,
                    text: String(text || ''),
                    x: drawX,
                    y: drawY,
                    left: drawX,
                    startX: drawX,
                    startY: drawY,
                    height: Math.max(1, Number(fallbackHeight) || 0),
                };
            }

    function withTranslatedWindowTextScale(windowInstance, callback) {
                if (typeof callback !== 'function') return undefined;
                if (!Number.isInteger(textScaleOthers) || textScaleOthers <= 0 || textScaleOthers >= 100
                    || typeof createWindowTextScaleScope !== 'function') {
                    return callback();
                }
                if (windowInstance && windowInstance._trTextScaleOthersDepth > 0) return callback();
                if (windowInstance) {
                    windowInstance._trTextScaleOthersDepth = (windowInstance._trTextScaleOthersDepth || 0) + 1;
                }
                let scope = null;
                try {
                    scope = createWindowTextScaleScope(windowInstance, textScaleOthers, {
                        captureBitmapDrawState,
                        applyBitmapDrawState,
                    });
                    return callback();
                } finally {
                    if (scope && typeof scope.restore === 'function') {
                        try { scope.restore(); } catch (_) {}
                    }
                    if (windowInstance) {
                        windowInstance._trTextScaleOthersDepth = Math.max(0, (windowInstance._trTextScaleOthersDepth || 1) - 1);
                    }
                }
            }
    
    function withWindowTranslatedDrawScope(windowInstance, callback) {
                if (typeof callback !== 'function') return undefined;
                if (!windowInstance) return callback();
                windowInstance._trWindowTranslatedDrawDepth = (windowInstance._trWindowTranslatedDrawDepth || 0) + 1;
                try {
                    return withTranslatedWindowTextScale(windowInstance, callback);
                } finally {
                    windowInstance._trWindowTranslatedDrawDepth = Math.max(0, (windowInstance._trWindowTranslatedDrawDepth || 1) - 1);
                }
            }
    
    function isWindowTranslatedDrawActive(windowInstance) {
                return !!(windowInstance && windowInstance._trWindowTranslatedDrawDepth > 0);
            }
    
    function withWindowDrawTextExReplayScope(contents, callback) {
                if (typeof callback !== 'function') return undefined;
                if (!contents) return callback();
                contents._trWindowTextDrawTextExReplayDepth = (contents._trWindowTextDrawTextExReplayDepth || 0) + 1;
                contents._trWindowDrawTextExReplayDepth = (contents._trWindowDrawTextExReplayDepth || 0) + 1;
                try {
                    return callback();
                } finally {
                    contents._trWindowTextDrawTextExReplayDepth = Math.max(0, (contents._trWindowTextDrawTextExReplayDepth || 1) - 1);
                    contents._trWindowDrawTextExReplayDepth = Math.max(0, (contents._trWindowDrawTextExReplayDepth || 1) - 1);
                }
            }
    
        return { drawTranslatedEntry, calculateRedrawBounds, drawTranslatedWindowText, invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, withTranslatedWindowTextScale, withWindowTranslatedDrawScope, isWindowTranslatedDrawActive, withWindowDrawTextExReplayScope };
    }
    
    defineRuntimeModule('adapters.windowTextRenderDraw', { create: createRenderDrawController });

})();
