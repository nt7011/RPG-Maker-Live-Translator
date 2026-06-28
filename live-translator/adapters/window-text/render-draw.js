// Window text adapter support: render draw.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.renderDraw',
        requires: {
            measuredBounds: 'runtime.measuredBounds',
            bitmapRenderExecutorModule: 'runtime.bitmap.renderExecutor',
            completedSubstitutionModule: 'adapters.windowText.completedSubstitution',
            drawTextExRendererModule: 'adapters.windowText.drawTextExRenderer',
            copiedTargetRenderModule: 'adapters.windowText.copiedTargetRender',
            renderCommitProofModule: 'adapters.windowText.renderCommitProof',
            redrawDiagnosticsModule: 'adapters.windowText.redrawDiagnostics',
            renderSurfaceBindingsModule: 'adapters.windowText.renderSurfaceBindings',
            renderGeometryModule: 'adapters.windowText.renderGeometry',
            renderScopesModule: 'adapters.windowText.renderScopes',
            renderPerfModule: 'adapters.windowText.renderPerf',
        },
        factory({ measuredBounds, bitmapRenderExecutorModule, completedSubstitutionModule, drawTextExRendererModule, copiedTargetRenderModule, renderCommitProofModule, redrawDiagnosticsModule, renderSurfaceBindingsModule, renderGeometryModule, renderScopesModule, renderPerfModule }) {

    function createRenderDrawController(context = {}) {
    const { logger, telemetry, generateKey, preview, perf, textCodec, textScaleOthers, ADAPTER_ID, RENDER_STRATEGY, entryLifecycleState } = context;
    const { draw: drawService, replay: replayService } = context.services;
    const {
                bitmapReplay,
                diagnostics,
                entryLifecycle,
                entryRecords,
                renderCompletion,
                renderReadinessSchedule,
                renderReadiness,
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
            } = diagnostics;
    const { getCurrentEntry, getTextEntryKey, resolveWindowData, resolveTargetWindow } = entryLifecycle;
    const { updateOrchestratorItem, completePendingRenderCommand, rejectPendingRender } = renderCompletion;
    const { dropScheduledRenderRetry } = renderReadinessSchedule;
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
                replayMixedItems,
                windowEntryBelongsToContents,
                redrawCopiedWindowTextTargets,
                getWindowEntryBackgroundSnapshotStatus,
                restoreWindowEntryBackground,
            } = bitmapReplay;
    const {
                planWindowBitmapReplay,
                planWindowBitmapRedraw,
                planWindowCopiedTargetRedraw,
            } = renderReadiness;
    const drawTextExRenderer = drawTextExRendererModule.create({
                textCodec,
                convertWindowText,
                getLineHeight,
                applyBitmapDrawState,
            });
    const {
                toDrawTextExInputText,
                withCapturedDrawTextExState,
            } = drawTextExRenderer;
    const renderPerf = renderPerfModule.create({
                perf,
                isBitmapSurfaceTextEntry,
            });
    const {
                perfStart,
                perfCount,
                perfElapsed,
                perfTop,
                perfLabel,
                getWindowTextPerfMethod,
                getWindowTextMetricPrefix,
            } = renderPerf;
    const renderCommitProof = renderCommitProofModule.create({
                ADAPTER_ID,
                RENDER_STRATEGY,
                renderTransaction: context.renderTransaction,
                getCurrentEntry,
                getTextEntryKey,
                getWindowTypeName,
                isUsableBitmap,
                roundDiagnosticNumber,
            });
    const copiedTargetRenderer = copiedTargetRenderModule.create({
                generateKey,
                telemetry,
                getWindowTypeName,
                planWindowCopiedTargetRedraw,
                redrawCopiedWindowTextTargets,
                completePendingRenderCommand,
                recordDecision,
                createRenderSurfaceProof: renderCommitProof.createRenderSurfaceProof,
            });
    const redrawDiagnostics = redrawDiagnosticsModule.create({
                measuredBounds,
                cloneDiagnosticArea,
                cloneDiagnosticRect,
                roundDiagnosticNumber,
            });
    const renderScopes = renderScopesModule.create({
                replayService,
                textScaleOthers,
                createWindowTextScaleScope,
                captureBitmapDrawState,
                applyBitmapDrawState,
                isBitmapSurfaceTextEntry,
                perfLabel,
            });
    const renderSurfaceBindings = renderSurfaceBindingsModule.create({
                applyBitmapDrawState,
                withWindowContents,
                enterWindowPipelineGuard: renderScopes.enterWindowPipelineGuard,
                isBitmapSurfaceTextEntry,
            });
    const renderGeometry = renderGeometryModule.create({
                measuredBounds,
                estimateEntryBounds,
                estimateMaxDrawTextExFallbackHeight,
                getLineHeight,
                calculateBitmapSurfaceTextYOffset,
                estimateBitmapSurfaceTextBounds,
                mergeBounds,
                isValidRect,
                withWindowContents,
                withCapturedDrawTextExState,
                withTranslatedWindowTextScale: renderScopes.withTranslatedWindowTextScale,
                isBitmapSurfaceTextEntry,
                getEntryDrawTextExBaseLineHeight,
                measureDrawTextExHeightForEntry,
                windowEntryBelongsToContents,
                getEntryStatus: entryRecords.getEntryStatus,
                cloneDiagnosticRect,
                roundDiagnosticNumber,
                perfStart,
                perfCount,
                perfTop,
                perfElapsed,
                getWindowTextPerfMethod,
            });
    const bitmapRenderExecutor = bitmapRenderExecutorModule.create({
                withWindowRestoreScope(bitmap, _entry, callback, options) {
                    return withWindowRedrawClear(bitmap, () => {
                        if (options && options.replayApi) {
                            return options.replayApi.withBitmapReplay(bitmap, callback, 'window-redraw-clear');
                        }
                        return callback();
                    });
                },
                withWindowDrawScope(bitmap, _entry, callback, options) {
                    if (options && options.replayApi) {
                        return options.replayApi.withBitmapReplay(bitmap, callback, 'window-redraw-draw');
                    }
                    return callback();
                },
                markBitmapPixelsDirty(bitmap, input) {
                    const api = replayService && replayService.bitmapDraws;
                    if (!api || typeof api.markBitmapPixelsDirty !== 'function') return null;
                    return api.markBitmapPixelsDirty(bitmap, Object.assign({
                        source: 'window-text-render',
                    }, input || {}));
                },
                clearWindowBitmap(bitmap, clearArea, clearPlan) {
                    const plan = clearPlan || {};
                    const mode = plan.mode || (clearArea ? 'clearRect' : 'clear');
                    if (clearArea && bitmap && typeof bitmap.clearRect === 'function') {
                        bitmap.clearRect(clearArea.x, clearArea.y, clearArea.w, clearArea.h);
                    } else if (bitmap && typeof bitmap.clear === 'function') {
                        bitmap.clear();
                    }
                    return mode;
                },
                restoreWindowSnapshot(bitmap, entry, snapshotRestorePlan, _renderPlan, options) {
                    return restoreWindowEntryBackground(
                        bitmap,
                        entry,
                        options && options.windowData,
                        snapshotRestorePlan && snapshotRestorePlan.restoreOptions
                    );
                },
                clearWindowSnapshotPartialAreas(bitmap, partialClearPlan) {
                    const partialClearRects = [];
                    const count = clearPlannedPartialClearAreas(
                        bitmap,
                        partialClearPlan && partialClearPlan.areas,
                        partialClearRects
                    );
                    return { count, rects: partialClearRects };
                },
                replayWindowSnapshotPartialBackground(bitmap, _entry, replayBefore, partialClearRects, _renderPlan, options) {
                    return replaySnapshotPartialClearBackground(
                        bitmap,
                        options && options.targetWindow,
                        replayBefore,
                        options && options.replayApi,
                        partialClearRects,
                        options && options.replayOptions || {}
                    );
                },
                replayWindowBefore(bitmap, _entry, replayBefore, _replayRect, _renderPlan, options) {
                    if (!options || !options.replayApi || !Array.isArray(replayBefore) || !replayBefore.length) return 0;
                    replayMixedItems(
                        bitmap,
                        options.targetWindow,
                        replayBefore,
                        options.replayApi,
                        options.replayClipRect || null,
                        options.replayOptions || {}
                    );
                    return replayBefore.length;
                },
                drawWindowText(bitmap, entry, renderedText, _renderPlan, options) {
                    return drawTranslatedWindowText(
                        options && options.targetWindow,
                        bitmap,
                        entry,
                        renderedText,
                        {
                            route: 'asyncRedraw',
                            textFit: options && options.textFit || null,
                        }
                    );
                },
                prepareWindowDrawState(bitmap, entry) {
                    return renderSurfaceBindings.prepareWindowEntryDrawState(bitmap, entry);
                },
                replayWindowAfter(bitmap, _entry, replayAfter, _replayRect, _renderPlan, options) {
                    if (!options || !options.replayApi || !Array.isArray(replayAfter) || !replayAfter.length) return 0;
                    replayMixedItems(
                        bitmap,
                        options.targetWindow,
                        replayAfter,
                        options.replayApi,
                        options.replayClipRect || null,
                        options.replayOptions || {}
                    );
                    return replayAfter.length;
                },
            });
    const completedSubstitution = completedSubstitutionModule.create({
                telemetry,
                sanitizeDrawTextOutput,
                toDrawTextExInputText,
                getWindowTextMetricPrefix,
                getWindowTextPerfMethod,
                getWindowNativeDrawAttribution: renderScopes.getWindowNativeDrawAttribution,
                getRedrawContents,
                resolveWindowData,
                resolveTargetWindow,
                dropScheduledRenderRetry,
                updateOrchestratorItem,
                recordDecision,
                recordDrawTrace,
                windowTraceDetails,
                captureWindowEntrySource,
                completeEntryNativeSourceDraw,
                resolveHorizontalTextFit: renderGeometry.resolveHorizontalTextFit,
                summarizeHorizontalTextFit: renderGeometry.summarizeHorizontalTextFit,
                perfCount,
                perfTop,
                perfStart,
                perfElapsed,
            });
    const {
                invokeCompletedEntry,
                captureCompletedSourceSnapshot,
            } = completedSubstitution;

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

                const geometry = renderGeometry.describeEntryRenderGeometry(entry);
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

                const copiedTargetRender = copiedTargetRenderer.renderStagingCopiedTargets({
                    entry,
                    targetWindow,
                    windowData,
                    renderedText,
                });
                if (copiedTargetRender) return copiedTargetRender;
                const pendingInvalidation = entryLifecycleState
                    && typeof entryLifecycleState.getPendingInvalidation === 'function'
                    ? entryLifecycleState.getPendingInvalidation(entry)
                    : null;
                if (pendingInvalidation) {
                    redrawOutcome = 'pendingInvalidation';
                    perfCount('windowText.redraw.pendingInvalidation');
                    perfTop('windowText.redraw.outcome', redrawOutcome);
                    perfElapsed('windowText.redraw.ms', redrawStart);
                    return rejectTerminalRedraw(entry, 'window-redraw-invalidated', 'window redraw skipped because the entry was invalidated before redraw', {
                        windowType: getWindowTypeName(targetWindow, windowData),
                        method: entry.type || '',
                        reason: pendingInvalidation.reason || '',
                        sourceReason: pendingInvalidation.sourceReason || '',
                    });
                }

                contents = bindEntryToLiveRenderContents(targetWindow, windowData, contents, entry);
                const targetProof = renderCommitProof.validateRenderTargetBeforeDraw(targetWindow, windowData, contents, entry);
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

                let sourceInkDiagnostics = redrawDiagnostics.getSourceInkDiagnostics(entry);
                redrawDiagnostics.updateSourceInkObservation(entry, sourceInkDiagnostics);
                if (redrawDiagnostics.shouldSuppressRedrawForSourceInk(entry, sourceInkDiagnostics)) {
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
                let releasePendingDrawUnitFlushDeferral = () => {};
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
                let restoreDiagnostics = null;
                let replayPlanDiagnostics = null;
                let bitmapRedrawPlan = null;
                let renderPlanDiagnostics = null;
                let clearArea = null;
                let originalBounds = null;
                let translatedBounds = null;
                let bitmapSurfaceOriginalBounds = null;
                let bitmapSurfaceTranslatedBounds = null;
                let uncappedOriginalBounds = null;
                let uncappedBitmapSurfaceOriginalBounds = null;
                let bitmapSurfaceYOffset = 0;
                let mergedBounds = null;
                let calcTextHeight = null;
                let textFit = null;
                let protectedWindowEntries = [];
                let sourceInkSourceCap = null;
                let sourceInkSourceExpansion = null;
                const currentDrawOrder = Number(entry.drawOrder) || 0;
                const replayWindowTextOptions = {
                    resolveTextFit: (replayEntry, replayText) => renderGeometry.resolveHorizontalTextFit(
                        targetWindow,
                        windowData,
                        contents,
                        replayEntry,
                        replayText
                    ),
                };
                const prepareStart = perfStart();
    
                try {
                    if (contents && storedDrawState) applyBitmapDrawState(contents, storedDrawState);
                    if (contents) {
                        const boundsInfo = renderGeometry.calculateRedrawBounds(targetWindow, windowData, contents, entry, renderedText, sourceInkDiagnostics);
                        clearArea = boundsInfo.clearArea;
                        originalBounds = boundsInfo.originalBounds;
                        translatedBounds = boundsInfo.translatedBounds;
                        bitmapSurfaceOriginalBounds = boundsInfo.bitmapSurfaceOriginalBounds;
                        bitmapSurfaceTranslatedBounds = boundsInfo.bitmapSurfaceTranslatedBounds;
                        uncappedOriginalBounds = boundsInfo.uncappedOriginalBounds || null;
                        uncappedBitmapSurfaceOriginalBounds = boundsInfo.uncappedBitmapSurfaceOriginalBounds || null;
                        bitmapSurfaceYOffset = boundsInfo.bitmapSurfaceYOffset;
                        mergedBounds = boundsInfo.mergedBounds;
                        calcTextHeight = boundsInfo.calcTextHeight;
                        textFit = boundsInfo.textFit || null;
                        protectedWindowEntries = collectTextFitReplayDependencies(windowData, textFit);
                        sourceInkSourceCap = boundsInfo.sourceInkSourceCap || null;
                        sourceInkSourceExpansion = boundsInfo.sourceInkSourceExpansion || null;
    
                        replayApi = getBitmapReplayApi();
                        if (replayApi) {
                            const replayPlan = planWindowBitmapReplay({
                                entry,
                                targetBitmap: contents,
                                windowData,
                                replayApi,
                                currentDrawOrder,
                                clearArea,
                                protectedWindowEntries,
                            });
                            replayPlanDiagnostics = replayPlan && replayPlan.diagnostics || null;
                            replayBefore = replayPlan.replayBefore;
                            replayAfter = replayPlan.replayAfter;
                            replayBeforeFiltered = replayPlan.replayBeforeFiltered;
                            replayAfterFiltered = replayPlan.replayAfterFiltered;
                            replayDirtyRect = replayPlan.replayDirtyRect;
                            replayClipRect = replayPlan.replayClipRect;
                            replayRectForDiagnostics = cloneDiagnosticRect(replayPlan.replayRect);
                            windowReplayRectForDiagnostics = cloneDiagnosticRect(replayPlan.windowReplayRect);
                            replayStateDiagnostics = replayPlan.replayStateDiagnostics;
                            supportsReplayClip = replayPlan.supportsReplayClip;
                            replayCollectError = replayPlan.replayCollectError;
                        }
    
                        releasePendingDrawUnitFlushDeferral = renderScopes.enterPendingDrawUnitFlushDeferral(contents, 'window-redraw');
                        snapshotRestoreAttempted = !!(entry && entry.backgroundSnapshot);
                        const snapshotStatus = getWindowEntryBackgroundSnapshotStatus(contents, entry, windowData);
                        if (!snapshotStatus.usable && snapshotRestoreAttempted) {
                            snapshotRestoreSkippedReason = snapshotStatus.reason || 'unusable';
                        }
                        const renderPlan = planWindowBitmapRedraw({
                            entry,
                            replayBefore,
                            replayAfter,
                            replayRect: replayClipRect,
                            drawSampleArea: mergedBounds,
                            snapshotStatus,
                            clearArea,
                            targetBitmap: contents,
                            targetProof,
                            pendingInvalidation,
                        });
                        bitmapRedrawPlan = renderPlan;
                        renderPlanDiagnostics = renderPlan && renderPlan.diagnostics || null;
                        const snapshotRestorePlan = renderPlan.snapshotRestorePlan || {};
                        restoreDiagnostics = renderPlan && renderPlan.restoreDiagnostics || null;
                        snapshotRestoreSkippedReason = snapshotRestorePlan.skippedReason
                            ? snapshotRestorePlan.skippedReason
                            : snapshotRestoreSkippedReason;
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
                        releaseWindowPipelineGuard = renderScopes.enterWindowPipelineGuard(contents, 'window-redraw');
                    }

                    const renderExecution = renderSurfaceBindings.executeWindowRenderPlanWithStableSurface(
                        bitmapRenderExecutor,
                        bitmapRedrawPlan,
                        {
                            targetBitmap: contents,
                            entry,
                            targetWindow,
                            contents,
                            renderedText,
                            replayApi,
                            replayAfter,
                            replayClipRect,
                            replayOptions: replayWindowTextOptions,
                            textFit,
                            windowData,
                        }
                    ) || {};
                    const restoreDetails = renderExecution.details && renderExecution.details.restore || {};
                    usedBackgroundSnapshot = restoreDetails.restoreSnapshot === true;
                    usedStaleRevisionSnapshot = restoreDetails.staleRevisionSnapshot === true;
                    usedStaleAreaSnapshot = restoreDetails.staleAreaSnapshot === true;
                    snapshotPartialClearCount = Math.max(0, Number(restoreDetails.snapshotPartialClear) || 0);
                    replayBeforeAppliedCount = Math.max(
                        replayBeforeAppliedCount,
                        Math.max(0, Number(restoreDetails.replayBefore) || 0)
                    );
                    clearMode = restoreDetails.clearMode || clearMode;
                    const didDraw = renderExecution.didDraw === true;
                    const renderCommit = renderExecution.renderCommit || null;
                    if (!didDraw) {
                        redrawOutcome = 'missed';
                        return false;
                    }
                    const commitProof = renderCommitProof.validateRenderCommit(renderCommit, targetWindow, windowData, contents, entry, renderExecution);
                    if (!commitProof.accepted) {
                        redrawOutcome = commitProof.reason || 'commitRejected';
                        recordTerminalRedrawRejection(entry, commitProof.reason || 'render-commit-rejected');
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
                        dropScheduledRenderRetry(windowData, entry);
                        return false;
                    }

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
                    const sourceSnapshotDiagnostics = redrawDiagnostics.getEntryPixelSnapshotDiagnostics(entry, contents, 'sourceSnapshot');
                    sourceInkDiagnostics = sourceInkDiagnostics || redrawDiagnostics.getSourceInkDiagnostics(entry);
                    const replayBeforeItems = summarizeReplayItemsForDiagnostics(replayBefore);
                    const replayAfterItems = summarizeReplayItemsForDiagnostics(replayAfter);
                    const diagnostics = {
                        clearMode,
                        clearArea: cloneDiagnosticArea(clearArea),
                        originalBounds,
                        uncappedOriginalBounds,
                        translatedBounds: cloneDiagnosticRect(translatedBounds),
                        bitmapSurfaceOriginalBounds,
                        uncappedBitmapSurfaceOriginalBounds,
                        bitmapSurfaceTranslatedBounds,
                        bitmapSurfaceYOffset: roundDiagnosticNumber(bitmapSurfaceYOffset),
                        bitmapSurfaceYOffsetSource: entry && entry.bitmapSurfaceYOffsetCache
                            ? String(entry.bitmapSurfaceYOffsetCache.source || '')
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
                        replayPlan: replayPlanDiagnostics,
                        renderPlan: renderPlanDiagnostics,
                        restore: restoreDiagnostics,
                        sourceSnapshot: sourceSnapshotDiagnostics,
                        sourceInk: sourceInkDiagnostics,
                        sourceInkSourceCap,
                        textFit: renderGeometry.summarizeHorizontalTextFit(textFit),
                        sourceInkSourceExpansion,
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
                        diagnosticSummary: redrawDiagnostics.buildRedrawDiagnosticSummary({
                            clearMode,
                            clearArea,
                            snapshotDiagnostics,
                            sourceInkDiagnostics,
                            replayBeforeItems,
                            replayAfterItems,
                            replayBeforeFiltered,
                            replayAfterFiltered,
                            restoreDiagnostics,
                            replayRect: replayRectForDiagnostics,
                            replayDirtyRect,
                            replayClipRect,
                            drawSampleArea: mergedBounds,
                            supportsReplayClip,
                            bitmapSurfaceYOffsetSource: diagnostics.bitmapSurfaceYOffsetSource,
                            sourceInkSourceCap,
                            sourceInkSourceExpansion,
                        }),
                        diagnostics,
                    };
    
                    redrawDetails.surfaceProof = commitProof.surfaceProof;
                    renderGeometry.rememberRenderedEntryBounds(entry, translatedBounds, bitmapSurfaceTranslatedBounds);
                    copiedTargetRenderer.renderCopiedTargetsAfterWindowRedraw({
                        entry,
                        renderedText,
                        textFit,
                        redrawDetails,
                        diagnostics,
                    });
                    if (contents && prevDrawState) applyBitmapDrawState(contents, prevDrawState);
    
                    telemetry.logDraw('redraw', renderedText, x, y, redrawDetails);
                    recordDecision(entry, 'draw.redraw', 'window redraw applied', redrawDetails);
                    const renderCommitResult = completePendingRenderCommand(entry, redrawDetails);
    
                    const key = generateKey(entry.type, x, y, windowData.windowType, entry.convertedText, entry.slotKey);
                    if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
                    windowData.recentlyRedrawn.set(key, Date.now());
                    redrawOutcome = 'drawn';
                    return renderCommitResult || true;
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
                    releasePendingDrawUnitFlushDeferral();
                }
            }

    function clearPlannedPartialClearAreas(contents, plannedAreas, clearedRects = null) {
                if (!contents || typeof contents.clearRect !== 'function') return 0;
                if (!Array.isArray(plannedAreas) || !plannedAreas.length) return 0;
                let count = 0;
                plannedAreas.forEach((area) => {
                    const normalized = normalizePositiveArea(area);
                    if (!normalized) return;
                    count += clearPositiveRect(contents, normalized.x, normalized.y, normalized.w, normalized.h, clearedRects);
                });
                return count;
            }

    function replaySnapshotPartialClearBackground(contents, targetWindow, replayBefore, replayApi, partialClearRects, replayOptions = {}) {
                if (!replayApi || !Array.isArray(replayBefore) || !replayBefore.length) return 0;
                if (!Array.isArray(partialClearRects) || !partialClearRects.length) return 0;

                // The clean snapshot covers the original source patch only. Any
                // cleared translation extension must be rebuilt from earlier
                // bitmap/window layers, clipped to the strips we just cleared.
                partialClearRects.forEach((area) => {
                    const rect = replayApi.rectFromDimensions(area.x, area.y, area.w, area.h);
                    replayMixedItems(contents, targetWindow, replayBefore, replayApi, rect, replayOptions);
                });
                return replayBefore.length;
            }

    function normalizePositiveArea(area) {
                if (!area) return null;
                const x = Number(area.x);
                const y = Number(area.y);
                const w = Number(area.w);
                const h = Number(area.h);
                if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
                return { x, y, w, h };
            }

    function clearPositiveRect(contents, x, y, width, height, clearedRects = null) {
                if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return 0;
                contents.clearRect(x, y, width, height);
                if (Array.isArray(clearedRects)) {
                    clearedRects.push({ x, y, w: width, h: height });
                }
                return 1;
            }

    function rejectTerminalRedraw(entry, reason, message, details = null) {
                recordTerminalRedrawRejection(entry, reason || 'window-redraw-rejected');
                recordDecision(entry, 'draw.skipped', message || reason || 'window redraw skipped', details);
                rejectPendingRender(entry, reason || 'window-redraw-rejected', details);
                dropScheduledRenderRetry(resolveWindowData(entry), entry);
                return false;
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

    function clearTerminalRedrawSuppression(entry) {
                if (!entry) return;
                const lifecycle = entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                    ? entry.renderLifecycle
                    : null;
                if (!lifecycle) return;
                try { delete lifecycle.redrawRejection; } catch (_) { lifecycle.redrawRejection = null; }
            }

    function isTerminalRedrawSuppressed(entry) {
                const reason = getTerminalRedrawRejectionReason(entry);
                return reason === 'invalid-render-geometry' || reason === 'source-draw-empty';
            }

    function recordTerminalRedrawRejection(entry, reason) {
                if (!entry) return;
                const lifecycle = entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                    ? entry.renderLifecycle
                    : (entry.renderLifecycle = {});
                lifecycle.redrawRejection = {
                    reason: String(reason || 'window-redraw-rejected'),
                    at: Date.now(),
                };
            }

    function getTerminalRedrawRejectionReason(entry) {
                const lifecycle = entry && entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                    ? entry.renderLifecycle
                    : null;
                const rejection = lifecycle && lifecycle.redrawRejection && typeof lifecycle.redrawRejection === 'object'
                    ? lifecycle.redrawRejection
                    : null;
                return String(rejection && rejection.reason || '');
            }

    function collectTextFitReplayDependencies(windowData, textFit) {
                // The fit calculation already picked the nearest same-line
                // neighbor that constrains this drawTextEx. Preserve that
                // neighbor as a replay dependency even when the clear area is
                // capped before it.
                const neighbor = textFit && textFit.neighbor || null;
                const neighborSlotKey = neighbor && neighbor.slotKey ? String(neighbor.slotKey) : '';
                if (!neighborSlotKey || !windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return [];
                const dependencies = [];
                try {
                    windowData.texts.forEach((entry) => {
                        if (!entry || entry.slotKey !== neighborSlotKey) return;
                        if (neighbor.type && entry.type !== neighbor.type) return;
                        dependencies.push(entry);
                    });
                } catch (_) {}
                return dependencies;
            }

    function drawTranslatedWindowText(targetWindow, contents, entry, translatedText, options = {}) {
                const params = entry.originalParams || {};
                const geometry = renderGeometry.describeEntryRenderGeometry(entry);
                if (!geometry.drawable) return false;
                if (String(options.targetRole || '') !== 'copied-render-target') {
                    const targetProof = renderCommitProof.validateRenderTargetBeforeDraw(targetWindow, entry && entry.windowData, contents, entry);
                    if (!targetProof.accepted) return false;
                }
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
                    renderScopes.withBitmapNativeDrawAttribution(contents, renderScopes.getWindowNativeDrawAttribution(entry, route), () => {
                        withWindowContents(targetWindow, contents, () => {
                            if (!isBitmapSurfaceTextEntry(entry)
                                && entry.type === 'drawTextEx'
                                && typeof targetWindow.drawTextEx === 'function') {
                                const drawTextExInput = toDrawTextExInputText(translatedText);
                                renderScopes.withWindowTranslatedDrawScope(targetWindow, () => {
                                    withCapturedDrawTextExState(targetWindow, contents, entry, () => {
                                        const drawResult = drawNativeWindowDrawTextEx(targetWindow, contents, entry, drawTextExInput, drawX, drawY, {
                                            scaleX: options.textFit && options.textFit.applied === true
                                                ? options.textFit.scaleX
                                                : 1,
                                        });
                                        drew = !!(drawResult && drawResult.drawn);
                                        if (drew) {
                                            commit = renderCommitProof.createRenderCommit('native-drawTextEx', targetWindow, contents, entry, route, {
                                                drawTextExInputConverted: drawTextExInput !== String(translatedText ?? ''),
                                                drawTextExInputHasEsc: /\x1b/.test(drawTextExInput),
                                                processedTextHasEsc: false,
                                                nativeDrawTextExArgCount: drawResult.argCount || 0,
                                                bitmapTextDrawCount: drawResult.textDrawCount || 0,
                                                bitmapBltDrawCount: drawResult.bltDrawCount || 0,
                                                bitmapDrawPrimitiveCount: drawResult.drawPrimitiveCount || 0,
                                                bitmapDrawnTextPreview: preview(drawResult.drawnText || ''),
                                                horizontalTextFit: renderGeometry.summarizeHorizontalTextFit(options.textFit),
                                            });
                                        }
                                    });
                                });
                            } else {
                                renderScopes.withWindowTranslatedDrawScope(targetWindow, () => {
                                    if (isBitmapSurfaceTextEntry(entry) && contents && typeof contents.drawText === 'function') {
                                        drew = drawBitmapSurfaceWindowText(targetWindow, contents, entry, translatedText);
                                        if (drew) commit = renderCommitProof.createRenderCommit('bitmap-surface-drawText', targetWindow, contents, entry, route);
                                    } else if (typeof targetWindow.drawText === 'function') {
                                        targetWindow.drawText(translatedText, drawX, drawY, params.maxWidth, params.align);
                                        drew = true;
                                        commit = renderCommitProof.createRenderCommit('direct-drawText', targetWindow, contents, entry, route);
                                    }
                                });
                            }
                        });
                    });
                    return drew ? (commit || renderCommitProof.createRenderCommit('direct-draw', targetWindow, contents, entry, route)) : false;
                } catch (error) {
                    perfCount(`${metricPrefix}.errors`);
                    throw error;
                } finally {
                    perfElapsed(`${metricPrefix}.ms`, drawStart);
                    perfCount(`${metricPrefix}.${drew ? 'drawn' : 'missed'}`);
                }
            }

    function drawNativeWindowDrawTextEx(targetWindow, contents, entry, text, x, y, options = {}) {
                if (!targetWindow || typeof targetWindow.drawTextEx !== 'function' || !contents) return null;
                const args = createNativeDrawTextExArgs(entry, text, x, y);
                let textDrawCount = 0;
                let bltDrawCount = 0;
                let drawnText = '';
                const originalDrawText = typeof contents.drawText === 'function' ? contents.drawText : null;
                const originalBlt = typeof contents.blt === 'function' ? contents.blt : null;
                if (originalDrawText) {
                    contents.drawText = function(drawText, drawX, drawY, maxWidth, lineHeight, align) {
                        const visible = String(drawText ?? '');
                        if (visible) {
                            textDrawCount += 1;
                            drawnText += visible;
                        }
                        return originalDrawText.apply(this, arguments);
                    };
                }
                if (originalBlt) {
                    contents.blt = function() {
                        bltDrawCount += 1;
                        return originalBlt.apply(this, arguments);
                    };
                }
                try {
                    const draw = () => targetWindow.drawTextEx.apply(targetWindow, args);
                    withHorizontalDrawTextExSqueeze(contents, x, options && options.scaleX, draw);
                    return {
                        drawn: true,
                        argCount: args.length,
                        textDrawCount,
                        bltDrawCount,
                        drawPrimitiveCount: textDrawCount + bltDrawCount,
                        drawnText,
                    };
                } finally {
                    if (originalDrawText) contents.drawText = originalDrawText;
                    if (originalBlt) contents.blt = originalBlt;
                }
            }

    function createNativeDrawTextExArgs(entry, text, x, y) {
                const params = entry && entry.originalParams && typeof entry.originalParams === 'object'
                    ? entry.originalParams
                    : {};
                const args = [String(text ?? ''), x, y];
                const maxWidth = Number(params.maxWidth);
                if (params.maxWidthInferred !== true && Number.isFinite(maxWidth) && maxWidth > 0) {
                    args.push(maxWidth);
                }
                return args;
            }

    function withHorizontalDrawTextExSqueeze(contents, originX, scaleX, callback) {
                if (typeof callback !== 'function') return undefined;
                const factor = Number(scaleX);
                if (!Number.isFinite(factor) || factor <= 0 || factor >= 0.999) return callback();
                const canvasContext = contents && (contents._context || contents.context);
                if (!canvasContext
                    || typeof canvasContext.save !== 'function'
                    || typeof canvasContext.restore !== 'function'
                    || typeof canvasContext.translate !== 'function'
                    || typeof canvasContext.scale !== 'function') {
                    return callback();
                }
                const origin = Number.isFinite(Number(originX)) ? Number(originX) : 0;
                canvasContext.save();
                try {
                    canvasContext.translate(origin, 0);
                    canvasContext.scale(factor, 1);
                    canvasContext.translate(-origin, 0);
                    return callback();
                } finally {
                    canvasContext.restore();
                }
            }

    function drawBitmapSurfaceWindowText(targetWindow, contents, entry, translatedText) {
                const position = entry.position || {};
                const params = entry.originalParams || {};
                const positionX = renderGeometry.normalizeRenderCoordinate(position.x);
                const positionY = renderGeometry.normalizeRenderCoordinate(position.y);
                if (positionX === null || positionY === null) return false;
                const lineHeight = Number.isFinite(Number(params.lineHeight)) && Number(params.lineHeight) > 0
                    ? Number(params.lineHeight)
                    : getLineHeight(targetWindow, contents);
                const yOffset = calculateBitmapSurfaceTextYOffset(contents, entry, translatedText);
                return renderScopes.withWindowPipelineGuard(contents, () => {
                    return renderScopes.withPendingDrawUnitFlushDeferral(contents, 'window-bitmap-surface', () => {
                        contents.drawText(
                            translatedText,
                            positionX,
                            positionY + yOffset,
                            params.maxWidth,
                            lineHeight,
                            normalizeDrawTextAlignValue(params.align)
                        );
                        return true;
                    });
                }, 'window-bitmap-surface');
            }

    function isBitmapSurfaceTextEntry(entry) {
                const origin = entry && entry.drawOrigin;
                return !!(origin && origin.type === 'bitmapSurface');
            }

    function invokeOriginalDrawText(windowInstance, originalDrawText, value, x, y, maxWidth, align, options = {}) {
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const draw = () => {
                    if (!contents) return originalDrawText.call(windowInstance, value, x, y, maxWidth, align);
                    const attribution = options.nativeDrawAttribution || (options.scaleText ? 'windowDrawText' : '');
                    return renderScopes.withBitmapNativeDrawAttribution(contents, attribution, () => {
                        return renderScopes.withWindowPipelineGuard(contents, () => {
                            return renderScopes.withPendingDrawUnitFlushDeferral(contents, 'window-drawText', () => {
                                return originalDrawText.call(windowInstance, value, x, y, maxWidth, align);
                            });
                        }, attribution || 'window-drawText');
                    });
                };
                return options && options.scaleText ? renderScopes.withWindowTranslatedDrawScope(windowInstance, draw) : draw();
            }

    function invokeOriginalDrawTextEx(windowInstance, originalDrawTextEx, value, x, y, options = {}) {
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const draw = () => {
                    const callArgs = createOriginalDrawTextExArgs(value, x, y, options.originalArgs);
                    return renderScopes.withBitmapNativeDrawAttribution(contents, options.nativeDrawAttribution || (options.scaleText ? 'windowDrawTextEx' : ''), () => {
                        return withHorizontalTextSqueeze(contents, options.textFit, () => {
                            return renderScopes.withBitmapSkipGuard(contents, () => {
                                return renderScopes.withWindowDrawTextExReplayScope(contents, () => originalDrawTextEx.apply(windowInstance, callArgs));
                            });
                        });
                    });
                };
                return options && options.scaleText ? renderScopes.withWindowTranslatedDrawScope(windowInstance, draw) : draw();
            }

    function createOriginalDrawTextExArgs(value, x, y, originalArgs) {
                const args = Array.isArray(originalArgs) ? originalArgs.slice() : [];
                if (!args.length) args.push(value, x, y);
                args[0] = value;
                if (args.length < 2) args[1] = x;
                if (args.length < 3) args[2] = y;
                return args;
            }

    function withHorizontalTextSqueeze(contents, textFit, callback) {
                if (typeof callback !== 'function') return undefined;
                if (!textFit || textFit.applied !== true) return callback();
                const factor = Number(textFit.scaleX);
                const origin = Number(textFit.originX);
                if (!Number.isFinite(factor) || factor <= 0 || factor >= 0.999
                    || !Number.isFinite(origin)) {
                    return callback();
                }
                const canvasContext = contents && (contents._context || contents.context);
                if (!canvasContext
                    || typeof canvasContext.save !== 'function'
                    || typeof canvasContext.restore !== 'function'
                    || typeof canvasContext.translate !== 'function'
                    || typeof canvasContext.scale !== 'function') {
                    return callback();
                }
                canvasContext.save();
                try {
                    canvasContext.translate(origin, 0);
                    canvasContext.scale(factor, 1);
                    canvasContext.translate(-origin, 0);
                    return callback();
                } finally {
                    canvasContext.restore();
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
                const maxWidth = resolveDrawTextExMeasureWidth(contents, params, drawX);
                if (targetWindow && typeof targetWindow.createTextState === 'function') {
                    try {
                        return targetWindow.createTextState(
                            String(text || ''),
                            drawX,
                            drawY,
                            maxWidth
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
                    width: maxWidth,
                    drawing: true,
                    height: Math.max(1, Number(fallbackHeight) || 0),
                };
            }

    function resolveDrawTextExMeasureWidth(contents, params, x) {
                const storedWidth = Number(params && params.maxWidth);
                if (Number.isFinite(storedWidth) && storedWidth > 0) return storedWidth;
                const contentsWidth = Number(contents && contents.width);
                const drawX = Number(x);
                if (Number.isFinite(contentsWidth) && contentsWidth > 0 && Number.isFinite(drawX)) {
                    return Math.max(1, contentsWidth - drawX);
                }
                return 1;
            }

        return {
            drawTranslatedEntry,
            calculateRedrawBounds: renderGeometry.calculateRedrawBounds,
            drawTranslatedWindowText,
            invokeCompletedEntry,
            invokeOriginalDrawText,
            invokeOriginalDrawTextEx,
            withTranslatedWindowTextScale: renderScopes.withTranslatedWindowTextScale,
            withWindowTranslatedDrawScope: renderScopes.withWindowTranslatedDrawScope,
            isWindowTranslatedDrawActive: renderScopes.isWindowTranslatedDrawActive,
            withWindowDrawTextExReplayScope: renderScopes.withWindowDrawTextExReplayScope,
        };
    }
            return { create: createRenderDrawController };
        },
    });

})();
