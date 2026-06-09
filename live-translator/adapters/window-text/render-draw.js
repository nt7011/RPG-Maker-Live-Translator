// Window text adapter support: render draw.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/render-draw.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/window-text/render-draw.js.');
    }
    const backdropProviderModule = requireRuntimeModule('runtime.backdropProvider');
    const measuredBounds = requireRuntimeModule('runtime.measuredBounds');
    const renderTransaction = requireRuntimeModule('runtime.renderTransaction');
    const completedSubstitutionModule = requireRuntimeModule('adapters.windowTextCompletedSubstitution');
    const drawTextExRendererModule = requireRuntimeModule('adapters.windowTextDrawTextExRenderer');

    function createRenderDrawController(context = {}) {
    const { logger, telemetry, generateKey, preview, perf, textCodec, textScaleOthers, ADAPTER_ID, RENDER_STRATEGY } = context;
    const { draw: drawService, replay: replayService } = context.services;
    const {
                bitmapReplay,
                diagnostics,
                entryLifecycle,
                renderCompletion,
                renderQueue,
                sourceDraw,
                textConversion,
                textMetrics,
            } = context.facades;
    const captureBitmapDrawState = drawService.captureBitmapDrawState;
    const applyBitmapDrawState = drawService.applyBitmapDrawState;
    const createWindowTextScaleScope = drawService.createWindowTextScaleScope;
    const {
                recordDrawTrace,
                windowTraceDetails,
                recordDecision,
                roundDiagnosticNumber,
                cloneDiagnosticRect,
                cloneDiagnosticArea,
                getSnapshotDiagnostics,
                summarizeReplayItemsForDiagnostics,
                summarizeReplayStateForDiagnostics,
            } = diagnostics;
    const { getCurrentEntry, getTextEntryKey, resolveWindowData, resolveTargetWindow } = entryLifecycle;
    const { updateOrchestratorItem, completePendingRenderCommand, rejectPendingRender } = renderCompletion;
    const { dropRenderRetry } = renderQueue;
    const { captureWindowEntrySource, completeEntryNativeSourceDraw } = sourceDraw;
    const { sanitizeDrawTextOutput, convertWindowText } = textConversion;
    const {
                estimateEntryBounds,
                estimateMaxDrawTextExFallbackHeight,
                getLineHeight,
                getSurfaceId,
                getWindowTypeName,
                normalizeDrawTextAlignValue,
            } = textMetrics;
    const {
                mergeBounds,
                isValidRect,
                calculateBitmapSurfaceTextYOffset,
                estimateBitmapSurfaceTextBounds,
                withWindowRedrawClear,
                withWindowContents,
                isUsableBitmap,
                getRedrawContents,
                getBitmapReplayApi,
                assignWindowTextDrawOrder,
                createClearRectFromArea,
                getReplayItemRect,
                expandReplayDirtyRect,
                collectWindowTextReplayItems,
                combineReplayItems,
                filterReplayForEntry,
                replayMixedItems,
                redrawCopiedWindowTextTargets,
                supportsBitmapReplayClip,
                getWindowEntryBackgroundSnapshotStatus,
                restoreWindowEntryBackground,
            } = bitmapReplay;
    const WINDOW_TEXT_PERF_DOMAIN = 'translator-render.windowText';
    const backdropProvider = backdropProviderModule.create({
                getReplayItemRect,
                isBitmapSurfaceTextEntry,
                isValidRect,
            });
    const drawTextExRenderer = drawTextExRendererModule.create({
                textCodec,
                convertWindowText,
                getLineHeight,
                applyBitmapDrawState,
            });
    const {
                toDrawTextExInputText,
                toProcessedDrawTextExText,
                drawProcessedDrawTextEx,
                withCapturedDrawTextExState,
            } = drawTextExRenderer;
    const completedSubstitution = completedSubstitutionModule.create({
                telemetry,
                sanitizeDrawTextOutput,
                toDrawTextExInputText,
                getWindowTextMetricPrefix,
                getWindowTextPerfMethod,
                getWindowNativeDrawOwner,
                getRedrawContents,
                resolveWindowData,
                resolveTargetWindow,
                dropRenderRetry,
                updateOrchestratorItem,
                recordDecision,
                recordDrawTrace,
                windowTraceDetails,
                captureWindowEntrySource,
                completeEntryNativeSourceDraw,
                perfCount,
                perfTop,
                perfStart,
                perfElapsed,
            });
    const {
                invokeCompletedEntry,
                captureCompletedSourceSnapshot,
            } = completedSubstitution;

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

                const geometry = describeEntryRenderGeometry(entry);
                if (!geometry.drawable) {
                    redrawOutcome = 'invalidGeometry';
                    perfCount('windowText.redraw.invalidGeometry');
                    perfTop('windowText.redraw.outcome', redrawOutcome);
                    perfElapsed('windowText.redraw.ms', redrawStart);
                    return rejectTerminalRedraw(entry, 'invalid-render-geometry', 'window redraw skipped because draw geometry is invalid', {
                        windowType: getWindowTypeName(targetWindow, windowData),
                        method: entry.type || '',
                        geometry: geometry.details,
                    });
                }

                contents = bindEntryToLiveRenderContents(targetWindow, windowData, contents, entry);
                const targetProof = validateRenderTargetBeforeDraw(targetWindow, windowData, contents, entry);
                if (!targetProof.accepted) {
                    redrawOutcome = targetProof.reason || 'targetRejected';
                    perfCount('windowText.redraw.targetRejected');
                    perfTop('windowText.redraw.outcome', redrawOutcome);
                    perfElapsed('windowText.redraw.ms', redrawStart);
                    return rejectTerminalRedraw(entry, targetProof.reason || 'window-redraw-target-rejected', 'window redraw skipped because target contents is not current', {
                        windowType: getWindowTypeName(targetWindow, windowData),
                        method: entry.type || '',
                        target: targetProof.details,
                    });
                }

                let sourceInkDiagnostics = getSourceInkDiagnostics(entry);
                updateSourceInkObservation(entry, sourceInkDiagnostics);
                if (shouldSuppressRedrawForSourceInk(entry, sourceInkDiagnostics)) {
                    redrawOutcome = 'sourceNoInk';
                    perfCount('windowText.redraw.sourceNoInk');
                    perfTop('windowText.redraw.outcome', redrawOutcome);
                    perfElapsed('windowText.redraw.ms', redrawStart);
                    return rejectTerminalRedraw(entry, 'source-draw-empty', 'window redraw skipped because native source draw produced no ink', {
                        windowType: getWindowTypeName(targetWindow, windowData),
                        method: entry.type || '',
                        sourceInk: sourceInkDiagnostics,
                    });
                }
                clearTerminalRedrawSuppression(entry);
    
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
                let backdropDiagnostics = null;
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
                        const clearSnapshotOutsideArea = (backdropPlan) => {
                            const partialClearRects = [];
                            const count = shouldClearOutsideSnapshot(entry)
                                ? clearAreaOutsideSnapshot(contents, clearArea, entry && entry.backgroundSnapshot, { clearedRects: partialClearRects })
                                : 0;
                            if (count > 0 && shouldReplayAfterSnapshotPartialClear(backdropPlan)) {
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
                            const clearBitmapAreaAndReplay = (mode, shouldReplay) => {
                                if (clearArea) {
                                    clearMode = mode || 'clearRectReplay';
                                    contents.clearRect(clearArea.x, clearArea.y, clearArea.w, clearArea.h);
                                } else {
                                    clearMode = mode || 'clearReplay';
                                    contents.clear();
                                }
                                if (shouldReplay && replayApi && replayBefore.length) {
                                    replayMixedItems(contents, targetWindow, replayBefore, replayApi, replayClipRect);
                                    replayBeforeAppliedCount = Math.max(replayBeforeAppliedCount, replayBefore.length);
                                }
                            };
                            const backdropPlan = backdropProvider.chooseRestorePlan({
                                entry,
                                replayBefore,
                                replayRect: replayClipRect,
                                snapshotStatus,
                                clearArea,
                                targetBitmap: contents,
                            });
                            backdropDiagnostics = summarizeBackdropPlanForDiagnostics(backdropPlan);
                            snapshotRestoreSkippedReason = backdropPlan.snapshot && backdropPlan.snapshot.skippedReason
                                ? backdropPlan.snapshot.skippedReason
                                : snapshotRestoreSkippedReason;
                            if (backdropPlan.kind === 'replay') {
                                clearBitmapAreaAndReplay(backdropPlan.clearMode, backdropPlan.replay && backdropPlan.replay.applyAfterClear === true);
                                return;
                            }
                            if (backdropPlan.kind === 'snapshot'
                                && restoreWindowEntryBackground(contents, entry, windowData, backdropPlan.restoreOptions)) {
                                usedBackgroundSnapshot = true;
                                usedStaleRevisionSnapshot = backdropPlan.freshness === 'staleRevision';
                                usedStaleAreaSnapshot = backdropPlan.freshness === 'staleArea';
                                snapshotPartialClearCount = clearSnapshotOutsideArea(backdropPlan);
                                clearMode = snapshotPartialClearCount > 0
                                    ? `${backdropPlan.clearMode}PartialClear`
                                    : backdropPlan.clearMode;
                                return;
                            }
                            const fallbackClearMode = backdropPlan.kind === 'clear'
                                ? backdropPlan.clearMode
                                : (clearArea ? 'clearRect' : 'clear');
                            clearBitmapAreaAndReplay(fallbackClearMode, backdropPlan.replay && backdropPlan.replay.applyAfterClear === true);
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
    
                let releaseWindowPipelineGuard = () => {};
                try {
                    if (contents) {
                        releaseWindowPipelineGuard = enterWindowPipelineGuard(contents, 'window-redraw');
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
                    sourceInkDiagnostics = sourceInkDiagnostics || getSourceInkDiagnostics(entry);
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
                        backdrop: backdropDiagnostics,
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
                    let renderCommit = null;
                    const drawAndReplayAfter = () => {
                        const drawResult = drawTranslatedWindowText(targetWindow, contents, entry, renderedText, { route: 'asyncRedraw' });
                        didDraw = isRenderCommitAccepted(drawResult);
                        renderCommit = didDraw ? drawResult : null;
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
                    const commitProof = validateRenderCommit(renderCommit, targetWindow, windowData, contents, entry);
                    if (!commitProof.accepted) {
                        redrawOutcome = commitProof.reason || 'commitRejected';
                        entry._trLastRedrawRejectedReason = commitProof.reason || 'render-commit-rejected';
                        entry._trLastRedrawRejectedAt = Date.now();
                        recordDecision(entry, 'draw.rejected', 'window redraw commit rejected', {
                            windowType: getWindowTypeName(targetWindow, windowData),
                            method: entry.type || '',
                            reason: commitProof.reason || 'render-commit-rejected',
                            renderCommit: commitProof.details,
                        });
                        rejectPendingRender(entry, commitProof.reason || 'render-commit-rejected', {
                            windowType: getWindowTypeName(targetWindow, windowData),
                            method: entry.type || '',
                            renderCommit: commitProof.details,
                        });
                        dropRenderRetry(windowData, entry);
                        return false;
                    }
                    redrawDetails.renderCommit = commitProof.details;
                    diagnostics.renderCommit = commitProof.details;
                    rememberRenderedEntryBounds(entry, translatedBounds, bitmapSurfaceTranslatedBounds);
                    const copiedTargetRedraws = typeof redrawCopiedWindowTextTargets === 'function'
                        ? redrawCopiedWindowTextTargets(entry, renderedText)
                        : 0;
                    if (copiedTargetRedraws > 0) {
                        redrawDetails.copiedTargets = copiedTargetRedraws;
                        diagnostics.copiedTargets = copiedTargetRedraws;
                    }
                    if (contents && prevDrawState) applyBitmapDrawState(contents, prevDrawState);
    
                    telemetry.logDraw('redraw', renderedText, x, y, redrawDetails);
                    recordDecision(entry, 'draw.redraw', 'window redraw applied', redrawDetails);
                    const renderAccepted = completePendingRenderCommand(entry, redrawDetails);
    
                    const key = generateKey(entry.type, x, y, windowData.windowType, entry.convertedText, entry.slotKey);
                    if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
                    windowData.recentlyRedrawn.set(key, Date.now());
                    redrawOutcome = 'drawn';
                    return renderAccepted || true;
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
                    releaseWindowPipelineGuard();
                    if (contents) {
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

    function shouldReplayAfterSnapshotPartialClear(backdropPlan) {
                return !!(backdropPlan
                    && backdropPlan.replay
                    && backdropPlan.replay.applyForPartialClear === true);
            }

    function summarizeBackdropPlanForDiagnostics(plan) {
                if (!plan) return null;
                const replay = plan.replay || {};
                const snapshot = plan.snapshot || {};
                const patches = plan.patches || {};
                return {
                    kind: String(plan.kind || ''),
                    source: String(plan.source || ''),
                    clearMode: String(plan.clearMode || ''),
                    freshness: String(plan.freshness || ''),
                    restoreSemantics: {
                        clear: !!(plan.restoreSemantics && plan.restoreSemantics.clear),
                        snapshot: !!(plan.restoreSemantics && plan.restoreSemantics.snapshot),
                        patches: !!(plan.restoreSemantics && plan.restoreSemantics.patches),
                        replayAfterClear: !!(plan.restoreSemantics && plan.restoreSemantics.replayAfterClear),
                    },
                    replay: {
                        itemCount: Number(replay.itemCount) || 0,
                        coverageRects: Number(replay.coverageRects) || 0,
                        coversTarget: replay.coversTarget === true,
                        blockedBySelfCopy: replay.blockedBySelfCopy === true,
                        applyAfterClear: replay.applyAfterClear === true,
                        applyForPartialClear: replay.applyForPartialClear === true,
                        freshness: String(replay.freshness || ''),
                    },
                    snapshot: {
                        available: snapshot.available === true,
                        usable: snapshot.usable === true,
                        freshness: String(snapshot.freshness || ''),
                        skippedReason: String(snapshot.skippedReason || ''),
                    },
                    patches: {
                        available: patches.available === true,
                        count: Number(patches.count) || 0,
                        coverageRects: Number(patches.coverageRects) || 0,
                        coversTarget: patches.coversTarget === true,
                        apply: patches.apply === true,
                        freshness: String(patches.freshness || ''),
                    },
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
                return measuredBounds.measureSnapshotInkDiagnostics(
                    entry && entry.backgroundSnapshot,
                    entry && entry.sourceSnapshot,
                    { maxPixels: 32768 }
                );
            }

    function updateSourceInkObservation(entry, diagnostics) {
                if (!entry || !diagnostics || diagnostics.available !== true) return false;
                if (diagnostics.changed === true) {
                    entry._trSourceInkObserved = true;
                    return true;
                }
                return false;
            }

    function shouldSuppressRedrawForSourceInk(entry, diagnostics) {
                if (!entry || !diagnostics || diagnostics.available !== true) return false;
                if (diagnostics.changed !== false) return false;
                // A completed entry may be redrawn after its original source was
                // already proven visible. Only suppress entries that never showed
                // native ink; those are native no-op draws, not text to translate.
                return entry._trSourceInkObserved !== true;
            }

    function describeEntryRenderGeometry(entry) {
                const position = entry && entry.position ? entry.position : {};
                const params = entry && entry.originalParams ? entry.originalParams : {};
                const invalid = [];
                const x = normalizeRenderCoordinate(position.x);
                const y = normalizeRenderCoordinate(position.y);
                if (x === null) invalid.push('x');
                if (y === null) invalid.push('y');
                if (entry && entry.type !== 'drawTextEx') {
                    const maxWidth = normalizeRenderCoordinate(params.maxWidth);
                    if (maxWidth === null || maxWidth <= 0) invalid.push('maxWidth');
                }
                if (!invalid.length) {
                    return {
                        drawable: true,
                        details: {
                            x,
                            y,
                        },
                    };
                }
                return {
                    drawable: false,
                    details: {
                        invalid,
                        x: describeRenderCoordinate(position.x),
                        y: describeRenderCoordinate(position.y),
                        maxWidth: describeRenderCoordinate(params.maxWidth),
                    },
                };
            }

    function rejectTerminalRedraw(entry, reason, message, details = null) {
                if (entry) {
                    entry._trLastRedrawRejectedReason = reason || 'window-redraw-rejected';
                    entry._trLastRedrawRejectedAt = Date.now();
                }
                recordDecision(entry, 'draw.skipped', message || reason || 'window redraw skipped', details);
                rejectPendingRender(entry, reason || 'window-redraw-rejected', details);
                dropRenderRetry(resolveWindowData(entry), entry);
                return false;
            }

    function validateRenderTargetBeforeDraw(targetWindow, windowData, contents, entry) {
                // Redraw can temporarily bind arbitrary bitmaps through
                // withWindowContents(). Prove the bitmap is live before any
                // clear, replay, cache blit, or translated draw mutates it.
                const details = createRenderTargetDetails(targetWindow, windowData, contents, entry);
                if (!targetWindow) return rejectRenderTarget('window-redraw-target-missing', details);
                if (!windowData) return rejectRenderTarget('window-redraw-data-missing', details);
                if (!contents) return rejectRenderTarget('window-redraw-contents-missing', details);
                if (!isUsableBitmap(contents)) return rejectRenderTarget('window-redraw-contents-unusable', details);
                if (targetWindow.contents !== contents) return rejectRenderTarget('window-redraw-contents-not-live', details);
                if (entry && entry.contentsBitmap && entry.contentsBitmap !== contents) {
                    return rejectRenderTarget('window-redraw-entry-contents-stale', details);
                }
                if (entry && windowData && windowData.texts && getCurrentEntry(windowData, entry) !== entry) {
                    return rejectRenderTarget('window-entry-replaced', details);
                }
                return { accepted: true, reason: '', details };
            }

    function bindEntryToLiveRenderContents(targetWindow, windowData, contents, entry) {
                if (!targetWindow || !entry || !isUsableBitmap(targetWindow.contents)) return contents;
                const liveContents = targetWindow.contents;
                const renderContents = liveContents || contents || null;
                if (!renderContents || entry.contentsBitmap === renderContents) return renderContents;
                if (!windowData || (windowData.texts && getCurrentEntry(windowData, entry) !== entry)) {
                    return renderContents;
                }

                // A window-text entry represents a logical draw slot. The Bitmap
                // captured during source draw is only a surface observation; RPG
                // Maker can swap that Bitmap before the queued render drains. If
                // this entry is still the current slot, move the entry to the live
                // contents before target validation and keep the stale guard for
                // genuinely replaced entries.
                entry.contentsBitmap = renderContents;
                entry.ownerWindow = targetWindow;
                entry.windowData = windowData;
                entry.contentsRevision = Number.isFinite(Number(windowData.contentsRevision))
                    ? Number(windowData.contentsRevision)
                    : (Number.isFinite(Number(entry.contentsRevision)) ? Number(entry.contentsRevision) : 0);
                try { windowData.contentsBitmap = renderContents; } catch (_) {}
                entry.surfaceId = getSurfaceId(windowData) || entry.surfaceId;
                entry.identitySurfaceId = entry.identitySurfaceId || entry.surfaceId || '';
                assignWindowTextDrawOrder(renderContents, entry);
                captureCompletedSourceSnapshot(renderContents, entry);
                return renderContents;
            }

    function validateRenderCommit(commit, targetWindow, windowData, contents, entry) {
                // A render function only succeeds when it returns an accepted
                // commit and the target is still the same live entry afterward.
                const targetProof = validateRenderTargetBeforeDraw(targetWindow, windowData, contents, entry);
                if (!targetProof.accepted) return targetProof;
                if (!isRenderCommitAccepted(commit)) {
                    return rejectRenderTarget('window-redraw-commit-missing', Object.assign({}, targetProof.details, {
                        renderCommit: summarizeRenderCommit(commit),
                    }));
                }
                const details = Object.assign({}, commit, {
                    target: targetProof.details,
                });
                if (commit.entryGeneration !== targetProof.details.entryGeneration) {
                    return rejectRenderTarget('window-redraw-entry-generation-changed', details);
                }
                if (commit.windowContentsCurrent !== true) {
                    return rejectRenderTarget('window-redraw-commit-not-live', details);
                }
                if (entry && entry.contentsBitmap && commit.contentsSameAsEntry !== true) {
                    return rejectRenderTarget('window-redraw-commit-entry-contents-mismatch', details);
                }
                if ((commit.mode === 'direct-drawTextEx' || commit.mode === 'process-drawTextEx') && commit.bitmapMarkedDirty !== true) {
                    return rejectRenderTarget('window-redraw-commit-no-bitmap-mutation', details);
                }
                if (commit.mode === 'process-drawTextEx' && positiveInteger(commit.bitmapDrawPrimitiveCount) <= 0) {
                    return rejectRenderTarget('window-redraw-commit-no-bitmap-draw', details);
                }
                return { accepted: true, reason: '', details };
            }

    function createRenderCommit(mode, targetWindow, contents, entry, route, details = {}) {
                // The commit is serialized into diagnostics and render events;
                // keep it primitive and avoid leaking live RPG Maker objects.
                const targetDetails = createRenderTargetDetails(targetWindow, entry && entry.windowData, contents, entry);
                const evidence = Object.assign({
                    bitmapMarkedDirty: isBitmapMarkedDirty(contents),
                }, details || {}, targetDetails);
                return renderTransaction.createRenderCommit({
                    status: 'accepted',
                    mode: String(mode || ''),
                    route: String(route || ''),
                    adapterId: ADAPTER_ID,
                    itemId: entry && entry.recordId || '',
                    recordId: entry && entry.recordId || '',
                    surfaceId: entry && entry.surfaceId || '',
                    slotKey: entry && entry.slotKey || '',
                    strategy: RENDER_STRATEGY,
                    commandId: entry && entry.renderTransaction && entry.renderTransaction.commandId || '',
                    commandGeneration: entry && entry.renderTransaction && entry.renderTransaction.commandGeneration || 0,
                    generation: entry && entry.surfaceRevision || 0,
                    translationReceived: entry && entry.providerText || '',
                    translationDrawn: entry && entry.renderedText || '',
                    drawBoundary: entry && entry.renderLifecycle && entry.renderLifecycle.sourceDraw || null,
                    details: evidence,
                });
            }

    function createRenderTargetDetails(targetWindow, windowData, contents, entry) {
                const textKey = getSafeRenderTextKey(windowData, entry);
                const currentEntry = entry && windowData && windowData.texts
                    ? getCurrentEntry(windowData, entry)
                    : null;
                return {
                    windowType: getWindowTypeName(targetWindow, windowData),
                    method: entry && entry.type || '',
                    textKey,
                    surfaceId: entry && entry.surfaceId || '',
                    identitySurfaceId: entry && entry.identitySurfaceId || '',
                    entryGeneration: Number(entry && entry.surfaceRevision) || 0,
                    contentsSameAsEntry: !!(entry && contents && entry.contentsBitmap === contents),
                    windowContentsCurrent: !!(targetWindow && contents && targetWindow.contents === contents),
                    currentEntryMatches: !!(entry && currentEntry === entry),
                    entryContentsRevision: Number.isFinite(Number(entry && entry.contentsRevision)) ? Number(entry.contentsRevision) : null,
                    windowContentsRevision: windowData && Number.isFinite(Number(windowData.contentsRevision)) ? Number(windowData.contentsRevision) : null,
                    contentsWidth: Number(contents && contents.width) || 0,
                    contentsHeight: Number(contents && contents.height) || 0,
                    entryContentsWidth: Number(entry && entry.contentsBitmap && entry.contentsBitmap.width) || 0,
                    entryContentsHeight: Number(entry && entry.contentsBitmap && entry.contentsBitmap.height) || 0,
                };
            }

    function getSafeRenderTextKey(windowData, entry) {
                try {
                    return entry && (entry.key || getTextEntryKey(windowData, entry)) || '';
                } catch (_) {
                    return entry && entry.key || '';
                }
            }

    function rejectRenderTarget(reason, details) {
                return {
                    accepted: false,
                    reason: String(reason || 'window-redraw-target-rejected'),
                    details: details || null,
                };
            }

    function isRenderCommitAccepted(commit) {
                return !!(commit && commit.accepted === true);
            }

    function summarizeRenderCommit(commit) {
                if (!commit || typeof commit !== 'object') return null;
                return {
                    accepted: commit.accepted === true,
                    mode: String(commit.mode || ''),
                    route: String(commit.route || ''),
                    bitmapMarkedDirty: commit.bitmapMarkedDirty === true,
                    windowType: String(commit.windowType || ''),
                    method: String(commit.method || ''),
                    contentsSameAsEntry: commit.contentsSameAsEntry === true,
                    windowContentsCurrent: commit.windowContentsCurrent === true,
                    currentEntryMatches: commit.currentEntryMatches === true,
                    entryGeneration: Number(commit.entryGeneration) || 0,
                };
            }

    function isBitmapMarkedDirty(bitmap) {
                return !!(bitmap && (bitmap._dirty === true || bitmap.dirty === true || bitmap._needsUpdate === true));
            }

    function positiveInteger(value) {
                const number = Number(value);
                return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
            }

    function clearTerminalRedrawSuppression(entry) {
                if (!entry) return;
                try { delete entry._trLastRedrawRejectedReason; } catch (_) { entry._trLastRedrawRejectedReason = ''; }
                try { delete entry._trLastRedrawRejectedAt; } catch (_) { entry._trLastRedrawRejectedAt = 0; }
            }

    function isTerminalRedrawSuppressed(entry) {
                const reason = String(entry && entry._trLastRedrawRejectedReason || '');
                return reason === 'invalid-render-geometry' || reason === 'source-draw-empty';
            }

    function normalizeRenderCoordinate(value) {
                if (value === null || value === undefined) return null;
                if (typeof value === 'number') return Number.isFinite(value) ? value : null;
                if (typeof value === 'string') {
                    if (!value.trim()) return null;
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? numeric : null;
                }
                return null;
            }

    function describeRenderCoordinate(value) {
                const numeric = normalizeRenderCoordinate(value);
                return numeric === null ? null : numeric;
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
                const positionX = normalizeRenderCoordinate(position.x);
                const positionY = normalizeRenderCoordinate(position.y);
                const baseBounds = entry.bounds || {
                    x1: positionX === null ? NaN : positionX,
                    y1: positionY === null ? NaN : positionY,
                    x2: positionX === null ? NaN : positionX,
                    y2: positionY === null ? NaN : positionY,
                };
                let bitmapSurfaceOriginalBounds = null;
                let bitmapSurfaceTranslatedBounds = null;
                try {
                    bitmapSurfaceOriginalBounds = estimateBitmapSurfaceTextBounds(
                        contents,
                        entry,
                        entry.visibleText || entry.convertedText || entry.rawText || ''
                    );
                } catch (_) {}
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
                                    y: (positionY === null ? 0 : positionY) + bitmapSurfaceYOffset,
                                },
                            })
                            : entry;
                        bitmapSurfaceTranslatedBounds = estimateBitmapSurfaceTextBounds(contents, translatedEntry, translatedText);
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
                let minimumHeight = 0;
                if (entry.type === 'drawTextEx') {
                    minimumHeight = estimateMaxDrawTextExFallbackHeight(
                        getEntryDrawTextExBaseLineHeight(targetWindow, contents, entry),
                        translatedText,
                        entry.convertedText,
                        entry.rawText
                    );
                }
                const outline = Math.max(
                    0,
                    typeof contents.outlineWidth === 'number'
                        ? contents.outlineWidth
                        : 0
                );
                const result = measuredBounds.createRedrawBounds({
                    position,
                    baseBounds,
                    translatedBounds,
                    bitmapSurfaceOriginalBounds,
                    bitmapSurfaceTranslatedBounds,
                    bitmapSurfaceYOffset,
                    calcTextHeight,
                    minimumHeight,
                    surface: contents,
                    outline,
                });
                perfElapsed('windowText.redraw.bounds.ms', boundsStart);
                return result;
            }
    
    function drawTranslatedWindowText(targetWindow, contents, entry, translatedText, options = {}) {
                const params = entry.originalParams || {};
                const geometry = describeEntryRenderGeometry(entry);
                if (!geometry.drawable) return false;
                const targetProof = validateRenderTargetBeforeDraw(targetWindow, entry && entry.windowData, contents, entry);
                if (!targetProof.accepted) return false;
                const drawX = geometry.details.x;
                const drawY = geometry.details.y;
                const route = perfLabel(options.route || 'redraw', 'redraw');
                const metricPrefix = getWindowTextMetricPrefix(entry, route);
                const drawStart = perfStart();
                let drew = false;
                let commit = null;
                perfCount(`${metricPrefix}.calls`);
                perfTop('windowText.render.route', route);
                perfTop('windowText.render.method', getWindowTextPerfMethod(entry));
                try {
                    withBitmapNativeDrawOwner(contents, getWindowNativeDrawOwner(entry, route), () => {
                        withWindowContents(targetWindow, contents, () => {
                            if (!isBitmapSurfaceTextEntry(entry)
                                && entry.type === 'drawTextEx'
                                && typeof targetWindow.processCharacter === 'function') {
                                const drawTextExInput = toDrawTextExInputText(translatedText);
                                const processedText = toProcessedDrawTextExText(targetWindow, drawTextExInput, translatedText);
                                withWindowTranslatedDrawScope(targetWindow, () => {
                                    withCapturedDrawTextExState(targetWindow, contents, entry, () => {
                                        const drawResult = drawProcessedDrawTextEx(targetWindow, contents, entry, processedText, drawX, drawY);
                                        drew = !!(drawResult && drawResult.processed);
                                        if (drew) {
                                            commit = createRenderCommit('process-drawTextEx', targetWindow, contents, entry, route, {
                                                drawTextExInputConverted: drawTextExInput !== String(translatedText ?? ''),
                                                drawTextExInputHasEsc: /\x1b/.test(drawTextExInput),
                                                processedTextHasEsc: /\x1b/.test(processedText),
                                                bitmapTextDrawCount: drawResult.textDrawCount || 0,
                                                bitmapBltDrawCount: drawResult.bltDrawCount || 0,
                                                bitmapDrawPrimitiveCount: drawResult.drawPrimitiveCount || 0,
                                                bitmapDrawnTextPreview: preview(drawResult.drawnText || ''),
                                            });
                                        }
                                    });
                                });
                            } else {
                                withWindowTranslatedDrawScope(targetWindow, () => {
                                    if (isBitmapSurfaceTextEntry(entry) && contents && typeof contents.drawText === 'function') {
                                        drew = drawBitmapSurfaceWindowText(targetWindow, contents, entry, translatedText);
                                        if (drew) commit = createRenderCommit('bitmap-surface-drawText', targetWindow, contents, entry, route);
                                    } else if (typeof targetWindow.drawText === 'function') {
                                        targetWindow.drawText(translatedText, drawX, drawY, params.maxWidth, params.align);
                                        drew = true;
                                        commit = createRenderCommit('direct-drawText', targetWindow, contents, entry, route);
                                    }
                                });
                            }
                        });
                    });
                    return drew ? (commit || createRenderCommit('direct-draw', targetWindow, contents, entry, route)) : false;
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
                const positionX = normalizeRenderCoordinate(position.x);
                const positionY = normalizeRenderCoordinate(position.y);
                if (positionX === null || positionY === null) return false;
                const lineHeight = Number.isFinite(Number(params.lineHeight)) && Number(params.lineHeight) > 0
                    ? Number(params.lineHeight)
                    : getLineHeight(targetWindow, contents);
                const yOffset = calculateBitmapSurfaceTextYOffset(contents, entry, translatedText);
                return withWindowPipelineGuard(contents, () => {
                    contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                    try {
                        contents.drawText(
                            translatedText,
                            positionX,
                            positionY + yOffset,
                            params.maxWidth,
                            lineHeight,
                            normalizeDrawTextAlignValue(params.align)
                        );
                        return true;
                    } finally {
                        contents._trAggregationDepth = Math.max(0, (contents._trAggregationDepth || 1) - 1);
                        if (contents._trAggregationDepth === 0
                            && typeof contents._trFlushAggregatedLines === 'function') {
                            try { contents._trFlushAggregatedLines(); } catch (_) {}
                        }
                    }
                }, 'window-bitmap-surface');
            }

    function rememberRenderedEntryBounds(entry, translatedBounds, bitmapSurfaceTranslatedBounds) {
                if (!entry) return;
                // `entry.bounds` tracks the source slot. Bitmap-surface redraws can
                // move translated ink vertically to match the captured native ink,
                // so replay needs the actual translated footprint as well.
                const renderedBounds = mergeBounds(translatedBounds, bitmapSurfaceTranslatedBounds)
                    || translatedBounds
                    || bitmapSurfaceTranslatedBounds
                    || entry.bounds;
                entry.renderedBounds = cloneRenderedBounds(renderedBounds);
            }

    function cloneRenderedBounds(bounds) {
                if (!isValidRect(bounds)) return null;
                return {
                    x1: Number(bounds.x1),
                    y1: Number(bounds.y1),
                    x2: Number(bounds.x2),
                    y2: Number(bounds.y2),
                };
            }

    function isBitmapSurfaceTextEntry(entry) {
                const origin = entry && entry.drawOrigin;
                return !!(origin && origin.type === 'bitmapSurface');
            }

    function invokeOriginalDrawText(windowInstance, originalDrawText, value, x, y, maxWidth, align, options = {}) {
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const draw = () => {
                    if (!contents) return originalDrawText.call(windowInstance, value, x, y, maxWidth, align);
                    return withBitmapNativeDrawOwner(contents, options.nativeDrawOwner || (options.scaleText ? 'windowDrawText' : ''), () => {
                        return withWindowPipelineGuard(contents, () => {
                            contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                            try {
                                return originalDrawText.call(windowInstance, value, x, y, maxWidth, align);
                            } finally {
                                contents._trAggregationDepth = Math.max(0, (contents._trAggregationDepth || 1) - 1);
                                if (contents._trAggregationDepth === 0 && typeof contents._trFlushAggregatedLines === 'function') {
                                    try { contents._trFlushAggregatedLines(); } catch (_) {}
                                }
                            }
                        }, options.nativeDrawOwner || (options.scaleText ? 'windowDrawText' : 'window-drawText'));
                    });
                };
                return options && options.scaleText ? withWindowTranslatedDrawScope(windowInstance, draw) : draw();
            }
    
    function invokeOriginalDrawTextEx(windowInstance, originalDrawTextEx, value, x, y, options = {}) {
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const draw = () => {
                    return withBitmapNativeDrawOwner(contents, options.nativeDrawOwner || (options.scaleText ? 'windowDrawTextEx' : ''), () => {
                        return withBitmapSkipGuard(contents, () => {
                            return withWindowDrawTextExReplayScope(contents, () => originalDrawTextEx.call(windowInstance, value, x, y));
                        });
                    });
                };
                return options && options.scaleText ? withWindowTranslatedDrawScope(windowInstance, draw) : draw();
            }

    function withBitmapSkipGuard(bitmap, callback) {
                if (!bitmap) return typeof callback === 'function' ? callback() : undefined;
                const bitmapDraws = replayService && replayService.bitmapDraws;
                if (!bitmapDraws || typeof bitmapDraws.withBitmapSkipGuard !== 'function') {
                    throw new Error('[WindowText] bitmap skip guard service is required.');
                }
                return bitmapDraws.withBitmapSkipGuard(bitmap, callback);
            }

    function enterWindowPipelineGuard(bitmap, source) {
                if (!bitmap) return () => {};
                const bitmapDraws = replayService && replayService.bitmapDraws;
                if (!bitmapDraws || typeof bitmapDraws.enterWindowPipelineGuard !== 'function') {
                    throw new Error('[WindowText] bitmap window-pipeline guard service is required.');
                }
                return bitmapDraws.enterWindowPipelineGuard(bitmap, source || 'window-pipeline') || (() => {});
            }

    function withWindowPipelineGuard(bitmap, callback, source) {
                if (!bitmap) return typeof callback === 'function' ? callback() : undefined;
                const bitmapDraws = replayService && replayService.bitmapDraws;
                if (!bitmapDraws || typeof bitmapDraws.withWindowPipelineGuard !== 'function') {
                    throw new Error('[WindowText] bitmap window-pipeline guard service is required.');
                }
                return bitmapDraws.withWindowPipelineGuard(bitmap, callback, source || 'window-pipeline');
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
