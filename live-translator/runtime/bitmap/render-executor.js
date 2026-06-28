// Bitmap render executor.
//
// Applies render planner output through adapter-provided drawing strategies.
// The planner decides what should happen; this module owns the stable ordering
// of clear, restore, replay, draw, and dirty-upload mechanics.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.renderExecutor',
        requires: {
            surfaceMutationProof: 'runtime.bitmap.surfaceMutationProof',
            stableSurfaceTransaction: 'runtime.bitmap.stableSurfaceTransaction',
        },
        factory({ surfaceMutationProof, stableSurfaceTransaction }, { scope }) {
            const captureBitmapSurfaceSample = surfaceMutationProof.captureBitmapSurfaceSample;
            const compareSurfaceSamples = surfaceMutationProof.compareSurfaceSamples;
            const isReadableSurfaceMutationProof = surfaceMutationProof.isReadableSurfaceMutationProof;

            function createRenderExecutor(context = {}) {
                const withActiveRedrawEntry = typeof context.withActiveRedrawEntry === 'function'
                    ? context.withActiveRedrawEntry
                    : ((_bitmap, _entry, callback) => callback());
                const withBitmapReplay = typeof context.withBitmapReplay === 'function'
                    ? context.withBitmapReplay
                    : ((_bitmap, callback) => callback());
                const withWindowRestoreScope = typeof context.withWindowRestoreScope === 'function'
                    ? context.withWindowRestoreScope
                    : ((_bitmap, _entry, callback) => callback());
                const withWindowDrawScope = typeof context.withWindowDrawScope === 'function'
                    ? context.withWindowDrawScope
                    : ((_bitmap, _entry, callback) => callback());
                const replayBitmapItems = typeof context.replayBitmapItems === 'function'
                    ? context.replayBitmapItems
                    : (() => false);
                const restorePatches = typeof context.restorePatches === 'function'
                    ? context.restorePatches
                    : (() => false);
                const drawText = typeof context.drawText === 'function'
                    ? context.drawText
                    : (() => false);
                const clearRect = typeof context.clearRect === 'function'
                    ? context.clearRect
                    : clearBitmapRect;
                const markBitmapPixelsDirty = typeof context.markBitmapPixelsDirty === 'function'
                    ? context.markBitmapPixelsDirty
                    : (() => false);
                const clearWindowBitmap = typeof context.clearWindowBitmap === 'function'
                    ? context.clearWindowBitmap
                    : defaultClearWindowBitmap;
                const restoreWindowSnapshot = typeof context.restoreWindowSnapshot === 'function'
                    ? context.restoreWindowSnapshot
                    : (() => false);
                const clearWindowSnapshotPartialAreas = typeof context.clearWindowSnapshotPartialAreas === 'function'
                    ? context.clearWindowSnapshotPartialAreas
                    : (() => null);
                const replayWindowSnapshotPartialBackground = typeof context.replayWindowSnapshotPartialBackground === 'function'
                    ? context.replayWindowSnapshotPartialBackground
                    : (() => 0);
                const replayWindowBefore = typeof context.replayWindowBefore === 'function'
                    ? context.replayWindowBefore
                    : (() => 0);
                const drawWindowText = typeof context.drawWindowText === 'function'
                    ? context.drawWindowText
                    : (() => null);
                const replayWindowAfter = typeof context.replayWindowAfter === 'function'
                    ? context.replayWindowAfter
                    : (() => 0);
                const prepareWindowDrawState = typeof context.prepareWindowDrawState === 'function'
                    ? context.prepareWindowDrawState
                    : (() => null);
                const captureSurfaceSample = typeof context.captureSurfaceSample === 'function'
                    ? context.captureSurfaceSample
                    : captureBitmapSurfaceSample;
                const createBitmap = typeof context.createBitmap === 'function'
                    ? context.createBitmap
                    : createRuntimeBitmap;
                const stableSurfaceRunner = stableSurfaceTransaction.createStableSurfaceTransactionRunner({
                    createBitmap,
                    markBitmapPixelsDirty,
                });

                function executeFallbackRenderPlan(plan, options = {}) {
                    if (!plan || typeof plan !== 'object') {
                        return createExecutionResult('rejected', 'missing-plan', plan, null, null, null);
                    }
                    if (plan.status !== 'planned') {
                        return createExecutionResult('rejected', stringify(plan.reason || plan.status || 'plan-rejected'), plan, null, null, null);
                    }

                    const targetBitmap = options.targetBitmap || plan.targetBitmap || null;
                    const entry = options.entry || plan.entry || null;
                    if (!targetBitmap || !entry) {
                        return createExecutionResult('rejected', 'missing-entry-or-target', plan, targetBitmap, entry, null);
                    }

                    const steps = plan.steps && typeof plan.steps === 'object' ? plan.steps : {};
                    const details = createExecutionDetails();
                    withActiveRedrawEntry(targetBitmap, entry, () => {
                        withBitmapReplay(targetBitmap, () => {
                            if (steps.clear === true) {
                                clearRect(targetBitmap, plan.clearRect);
                                details.clear = true;
                            }
                            if (steps.restorePatches === true) {
                                const patches = cloneArray(plan.restorePatches);
                                restorePatches(targetBitmap, patches, { targetRect: plan.clearBounds || null });
                                details.restorePatches = true;
                                details.patchCount = patches.length;
                            }
                            if (steps.replayBefore === true) {
                                const items = cloneArray(plan.replayBefore);
                                replayBitmapItems(targetBitmap, items);
                                details.replayBefore = items.length;
                            }
                            if (steps.drawText === true) {
                                drawText(targetBitmap, entry, stringify(plan.text), plan);
                                details.drawText = true;
                            }
                            if (steps.replayAfter === true) {
                                const items = cloneArray(plan.replayAfter);
                                replayBitmapItems(targetBitmap, items);
                                details.replayAfter = items.length;
                            }
                        }, stringify(options.replayReason || 'bitmap-fallback-redraw'));
                    });

                    if (steps.markDirty === true) {
                        const dirtyUpload = markBitmapPixelsDirty(targetBitmap, {
                            source: stringify(options.dirtySource || plan.dirtySource || 'bitmap-render-executor'),
                            reason: stringify(options.dirtyReason || plan.dirtyReason || 'bitmap-fallback-render-plan'),
                        });
                        details.markDirty = true;
                        details.dirtyUpload = normalizeDirtyUploadDetails(dirtyUpload);
                    }

                    const result = createExecutionResult('applied', 'bitmap-render-applied', plan, targetBitmap, entry, details);
                    result.dirtyUpload = details.dirtyUpload || null;
                    if (result.diagnostics && result.dirtyUpload) result.diagnostics.dirtyUpload = result.dirtyUpload;
                    return result;
                }

                function executeWindowRestorePlan(plan, options = {}) {
                    if (!plan || typeof plan !== 'object') {
                        return createExecutionResult('rejected', 'missing-plan', plan, null, null, createWindowRestoreExecutionDetails());
                    }
                    if (plan.status !== 'planned') {
                        return createExecutionResult('rejected', stringify(plan.reason || plan.status || 'plan-rejected'), plan, null, null, createWindowRestoreExecutionDetails());
                    }

                    const targetBitmap = options.targetBitmap || plan.targetBitmap || null;
                    const entry = options.entry || plan.entry || null;
                    if (!targetBitmap || !entry) {
                        return createExecutionResult('rejected', 'missing-entry-or-target', plan, targetBitmap, entry, createWindowRestoreExecutionDetails());
                    }

                    const steps = plan.steps && typeof plan.steps === 'object' ? plan.steps : {};
                    const clearPlan = plan.clearPlan && typeof plan.clearPlan === 'object' ? plan.clearPlan : {};
                    const snapshotRestorePlan = plan.snapshotRestorePlan && typeof plan.snapshotRestorePlan === 'object'
                        ? plan.snapshotRestorePlan
                        : {};
                    const details = createWindowRestoreExecutionDetails();
                    const beforeSurface = shouldSampleWindowRestoreSurface(steps)
                        ? captureSurfaceSample(targetBitmap, getWindowRenderSampleArea(plan), {
                            phase: 'before-window-restore',
                            plan,
                            entry,
                        })
                        : null;

                    if (steps.restoreSnapshot === true
                        && restoreWindowSnapshot(targetBitmap, entry, snapshotRestorePlan, plan, options) === true) {
                        details.restoreSnapshot = true;
                        details.staleRevisionSnapshot = snapshotRestorePlan.staleRevision === true;
                        details.staleAreaSnapshot = snapshotRestorePlan.staleArea === true;
                        const partialClear = clearWindowSnapshotPartialAreas(
                            targetBitmap,
                            plan.snapshotPartialClearPlan || {},
                            plan,
                            options
                        ) || {};
                        details.snapshotPartialClear = positiveInteger(partialClear.count);
                        details.clearMode = details.snapshotPartialClear > 0
                            ? `${stringify(clearPlan.snapshotMode || 'snapshot')}PartialClear`
                            : stringify(clearPlan.snapshotMode || 'snapshot');
                        if (details.snapshotPartialClear > 0
                            && plan.snapshotPartialClearPlan
                            && plan.snapshotPartialClearPlan.replayAfterClear === true) {
                            details.replayBefore = positiveInteger(replayWindowSnapshotPartialBackground(
                                targetBitmap,
                                entry,
                                cloneArray(plan.replayBefore),
                                cloneArray(partialClear.rects || partialClear.areas),
                                plan,
                                options
                            ));
                        }
                        details.surfaceMutation = compareSurfaceSamples(
                            beforeSurface,
                            captureSurfaceSample(targetBitmap, getWindowRenderSampleArea(plan), {
                                phase: 'after-window-restore',
                                plan,
                                entry,
                            })
                        );
                        return createExecutionResult('applied', 'window-restore-applied', plan, targetBitmap, entry, details);
                    }

                    if (steps.clear === true || steps.restoreSnapshot === true) {
                        const clearMode = clearWindowBitmap(targetBitmap, plan.clearArea || null, clearPlan, plan, options);
                        details.clear = true;
                        details.clearMode = stringify(clearMode || clearPlan.mode || (plan.clearArea ? 'clearRect' : 'clear'));
                    }
                    if (steps.replayBefore === true) {
                        details.replayBefore = positiveInteger(replayWindowBefore(
                            targetBitmap,
                            entry,
                            cloneArray(plan.replayBefore),
                            plan.replayRect || null,
                            plan,
                            options
                        ));
                    }
                    if (beforeSurface) {
                        details.surfaceMutation = compareSurfaceSamples(
                            beforeSurface,
                            captureSurfaceSample(targetBitmap, getWindowRenderSampleArea(plan), {
                                phase: 'after-window-restore',
                                plan,
                                entry,
                            })
                        );
                    }

                    return createExecutionResult('applied', 'window-restore-applied', plan, targetBitmap, entry, details);
                }

                function executeWindowDrawPlan(plan, options) {
                    options = options || {};
                    if (!plan || typeof plan !== 'object') {
                        return createWindowDrawExecutionResult('rejected', 'missing-plan', plan, null, null, null, null);
                    }
                    if (plan.status !== 'planned') {
                        return createWindowDrawExecutionResult('rejected', stringify(plan.reason || plan.status || 'plan-rejected'), plan, null, null, null, null);
                    }

                    const targetBitmap = options.targetBitmap || plan.targetBitmap || null;
                    const entry = options.entry || plan.entry || null;
                    if (!targetBitmap || !entry) {
                        return createWindowDrawExecutionResult('rejected', 'missing-entry-or-target', plan, targetBitmap, entry, null, null);
                    }

                    const steps = plan.steps && typeof plan.steps === 'object' ? plan.steps : {};
                    const details = createWindowDrawExecutionDetails();
                    let renderCommit = null;
                    const drawSampleArea = getWindowDrawSampleArea(plan);
                    const beforeSurface = shouldSampleWindowDrawSurface(steps)
                        ? captureSurfaceSample(targetBitmap, drawSampleArea, {
                            phase: 'before-window-draw',
                            plan,
                            entry,
                        })
                        : null;
                    if (steps.drawText === true) {
                        // Restore and replay run before this point and may mutate the
                        // Bitmap's ambient draw settings. Re-enter the target entry's
                        // state at the final draw boundary.
                        details.drawState = normalizeDrawStatePreparationDetails(
                            prepareWindowDrawState(targetBitmap, entry, plan, options)
                        );
                        const drawResult = drawWindowText(targetBitmap, entry, options.renderedText, plan, options);
                        if (isRenderCommitCommitted(drawResult)) {
                            renderCommit = drawResult;
                            details.drawText = true;
                        }
                    }
                    if (beforeSurface) {
                        details.drawTextSurfaceMutation = compareSurfaceSamples(
                            beforeSurface,
                            captureSurfaceSample(targetBitmap, drawSampleArea, {
                                phase: 'after-window-drawText',
                                plan,
                                entry,
                            })
                        );
                    }
                    if (renderCommit && steps.replayAfter === true) {
                        details.replayAfter = positiveInteger(replayWindowAfter(
                            targetBitmap,
                            entry,
                            cloneArray(plan.replayAfter),
                            plan.replayRect || null,
                            plan,
                            options
                        ));
                    }
                    if (beforeSurface) {
                        details.surfaceMutation = compareSurfaceSamples(
                            beforeSurface,
                            captureSurfaceSample(targetBitmap, drawSampleArea, {
                                phase: 'after-window-draw',
                                plan,
                                entry,
                            })
                        );
                    }

                    return createWindowDrawExecutionResult(
                        renderCommit ? 'applied' : 'missed',
                        renderCommit ? 'window-draw-applied' : 'window-draw-missed',
                        plan,
                        targetBitmap,
                        entry,
                        details,
                        renderCommit
                    );
                }

                function executeWindowRenderPlan(plan, options) {
                    options = options || {};
                    const targetBitmap = options.targetBitmap || plan && plan.targetBitmap || null;
                    const entry = options.entry || plan && plan.entry || null;
                    if (!plan || typeof plan !== 'object' || plan.status !== 'planned' || !targetBitmap || !entry) {
                        const restoreResult = executeWindowRestorePlan(plan, options);
                        return createWindowRenderExecutionResult(restoreResult.status, restoreResult.reason, plan, targetBitmap, entry, restoreResult, null);
                    }

                    let restoreResult = null;
                    withWindowRestoreScope(targetBitmap, entry, () => {
                        restoreResult = executeWindowRestorePlan(plan, Object.assign({}, options, {
                            targetBitmap,
                            entry,
                        }));
                    }, options);
                    restoreResult = restoreResult || executeWindowRestorePlan(plan, Object.assign({}, options, {
                        targetBitmap,
                        entry,
                    }));
                    if (restoreResult.status === 'rejected') {
                        return createWindowRenderExecutionResult(restoreResult.status, restoreResult.reason, plan, targetBitmap, entry, restoreResult, null);
                    }

                    let drawResult = null;
                    withWindowDrawScope(targetBitmap, entry, () => {
                        drawResult = executeWindowDrawPlan(plan, Object.assign({}, options, {
                            targetBitmap,
                            entry,
                        }));
                    }, options);
                    drawResult = drawResult || executeWindowDrawPlan(plan, Object.assign({}, options, {
                        targetBitmap,
                        entry,
                    }));
                    const dirtyUpload = finalizeWindowRenderDirty(plan, targetBitmap, restoreResult, drawResult, options);
                    return createWindowRenderExecutionResult(drawResult.status, drawResult.reason, plan, targetBitmap, entry, restoreResult, drawResult, dirtyUpload);
                }

                function executeWindowRenderPlanOnStableSurface(plan, options = {}) {
                    // Window redraws still use the normal render plan. This helper only
                    // adds a stable bitmap surface around that plan when the adapter
                    // knows native rendering may not safely target the live bitmap.
                    const targetBitmap = options.targetBitmap || options.contents || plan && plan.targetBitmap || null;
                    const entry = options.entry || plan && plan.entry || null;
                    const transaction = stableSurfaceRunner.execute({
                        liveBitmap: targetBitmap,
                        sampleArea: getStableSurfaceSampleArea(plan),
                        dirtySource: stringify(options.stableSurfaceDirtySource || options.dirtySource || 'window-render-stable-surface'),
                        dirtyReason: stringify(options.stableSurfaceDirtyReason || options.dirtyReason || 'window-render-stable-surface'),
                        withStableSurface: options.withStableSurface,
                        shouldCommit(result) {
                            return !!(result && result.didDraw === true && result.renderCommit);
                        },
                        execute(stagedBitmap) {
                            // The normal window plan still owns clear/restore/replay/draw
                            // ordering. The stable transaction only swaps the bitmap
                            // surface underneath that plan and commits the result back.
                            return executeWindowRenderPlan(plan, Object.assign({}, options, {
                                targetBitmap: stagedBitmap,
                                contents: stagedBitmap,
                                stableSurface: true,
                                deferDirtyUpload: true,
                            }));
                        },
                    });
                    if (transaction.result) return transaction.result;
                    return createStableSurfaceWindowRenderRejection(plan, targetBitmap, entry, transaction.proof);
                }

                function executeWindowRenderPlanWithStableSurface(plan, options = {}) {
                    const targetBitmap = options.targetBitmap || options.contents || plan && plan.targetBitmap || null;
                    if (options.stableSurfaceRequested === true && stableSurfaceTransaction.canTransferBitmapPixels(targetBitmap)) {
                        return executeWindowRenderPlanOnStableSurface(plan, options);
                    }
                    return executeWindowRenderPlan(plan, options);
                }

                function finalizeWindowRenderDirty(plan, targetBitmap, restoreResult, drawResult, options = {}) {
                    if (options.deferDirtyUpload === true) return null;
                    if (!shouldFinalizeWindowRenderDirty(plan, restoreResult, drawResult)) return null;
                    return markBitmapPixelsDirty(targetBitmap, {
                        source: stringify(options.dirtySource || 'window-render-executor'),
                        reason: stringify(options.dirtyReason || 'window-render-plan'),
                    });
                }

                return freezeApi({
                    executeFallbackRenderPlan,
                    executeWindowRestorePlan,
                    executeWindowDrawPlan,
                    executeWindowRenderPlan,
                    executeWindowRenderPlanOnStableSurface,
                    executeWindowRenderPlanWithStableSurface,
                });
            }

            function clearBitmapRect(bitmap, rect) {
                if (!bitmap || !rect || typeof bitmap.clearRect !== 'function') return false;
                bitmap.clearRect(rect.x, rect.y, rect.width, rect.height);
                return true;
            }

            function defaultClearWindowBitmap(bitmap, clearArea) {
                if (!bitmap) return false;
                if (clearArea && typeof bitmap.clearRect === 'function') {
                    bitmap.clearRect(clearArea.x, clearArea.y, clearArea.w, clearArea.h);
                    return 'clearRect';
                }
                if (typeof bitmap.clear === 'function') {
                    bitmap.clear();
                    return 'clear';
                }
                return false;
            }

            function createRuntimeBitmap(width, height) {
                if (typeof scope.Bitmap !== 'function') return null;
                return new scope.Bitmap(width, height);
            }

            function createStableSurfaceWindowRenderRejection(plan, targetBitmap, entry, proof) {
                const reason = stringify(proof && proof.error || 'stable-surface-unavailable');
                const result = createWindowRenderExecutionResult('rejected', reason, plan, targetBitmap, entry, null, null, null);
                stableSurfaceTransaction.attachStableSurfaceTransactionProof(result, proof);
                return result;
            }

            function createExecutionDetails() {
                return {
                    clear: false,
                    restorePatches: false,
                    patchCount: 0,
                    replayBefore: 0,
                    drawText: false,
                    replayAfter: 0,
                    markDirty: false,
                    dirtyUpload: null,
                };
            }

            function createWindowRestoreExecutionDetails() {
                return {
                    clear: false,
                    clearMode: 'none',
                    restoreSnapshot: false,
                    staleRevisionSnapshot: false,
                    staleAreaSnapshot: false,
                    snapshotPartialClear: 0,
                    replayBefore: 0,
                    surfaceMutation: null,
                };
            }

            function createWindowDrawExecutionDetails() {
                return {
                    drawState: null,
                    drawText: false,
                    replayAfter: 0,
                    drawTextSurfaceMutation: null,
                    surfaceMutation: null,
                };
            }

            function shouldFinalizeWindowRenderDirty(plan, restoreResult, drawResult) {
                const steps = plan && plan.steps && typeof plan.steps === 'object' ? plan.steps : {};
                return steps.markDirty === true && didWindowRenderMutatePixels(restoreResult, drawResult);
            }

            function didWindowRenderMutatePixels(restoreResult, drawResult) {
                const restore = restoreResult && restoreResult.details || {};
                const draw = drawResult && drawResult.details || {};
                const proofs = [
                    restore.surfaceMutation,
                    draw.drawTextSurfaceMutation,
                    draw.surfaceMutation,
                ].filter(isReadableSurfaceMutationProof);
                if (proofs.length) return proofs.some((proof) => proof.changed === true);
                return restore.clear === true
                    || restore.restoreSnapshot === true
                    || positiveInteger(restore.snapshotPartialClear) > 0
                    || positiveInteger(restore.replayBefore) > 0
                    || draw.drawText === true
                    || positiveInteger(draw.replayAfter) > 0;
            }

            function createExecutionResult(status, reason, plan, targetBitmap, entry, details) {
                const sourcePlan = plan && typeof plan === 'object' ? plan : {};
                const output = {
                    status,
                    reason: stringify(reason || status || ''),
                    type: stringify(sourcePlan.type || 'bitmapFallback'),
                    planId: stringify(sourcePlan.planId || ''),
                    entry: entry || sourcePlan.entry || null,
                    targetBitmap: targetBitmap || sourcePlan.targetBitmap || null,
                    details: details || createExecutionDetails(),
                };
                output.diagnostics = createExecutionDiagnostics(sourcePlan, output.status, output.reason);
                return output;
            }

            function createExecutionDiagnostics(plan, status, reason) {
                const source = plan && plan.diagnostics && typeof plan.diagnostics === 'object'
                    ? Object.assign({}, plan.diagnostics)
                    : {
                        planId: stringify(plan && plan.planId || ''),
                        type: stringify(plan && plan.type || ''),
                        status: stringify(plan && plan.status || ''),
                        reason: stringify(plan && plan.reason || ''),
                    };
                source.renderExecutionStatus = stringify(status || '');
                source.renderExecutionReason = stringify(reason || '');
                return source;
            }

            function createWindowDrawExecutionResult(status, reason, plan, targetBitmap, entry, details, renderCommit) {
                const result = createExecutionResult(
                    status,
                    reason,
                    plan,
                    targetBitmap,
                    entry,
                    details || createWindowDrawExecutionDetails()
                );
                result.didDraw = isRenderCommitCommitted(renderCommit);
                result.renderCommit = result.didDraw ? renderCommit : null;
                return result;
            }

            function createWindowRenderExecutionResult(status, reason, plan, targetBitmap, entry, restoreResult, drawResult, dirtyUpload) {
                const dirtyUploadDetails = normalizeDirtyUploadDetails(dirtyUpload);
                const markDirty = shouldFinalizeWindowRenderDirty(plan, restoreResult, drawResult);
                const result = createExecutionResult(status, reason, plan, targetBitmap, entry, {
                    restore: restoreResult && restoreResult.details || createWindowRestoreExecutionDetails(),
                    draw: drawResult && drawResult.details || createWindowDrawExecutionDetails(),
                    markDirty,
                    dirtyUpload: dirtyUploadDetails,
                });
                result.restoreResult = restoreResult || null;
                result.drawResult = drawResult || null;
                result.didDraw = !!(drawResult && drawResult.didDraw === true);
                result.renderCommit = result.didDraw ? drawResult.renderCommit : null;
                result.dirtyUpload = dirtyUploadDetails;
                if (result.diagnostics && dirtyUploadDetails) {
                    result.diagnostics.dirtyUpload = dirtyUploadDetails;
                }
                return result;
            }

            function normalizeDirtyUploadDetails(value) {
                if (!value || typeof value !== 'object') return null;
                return {
                    handled: value.handled === true,
                    marked: value.marked === true,
                    setDirty: value.setDirty === true,
                    dirtyFlags: cloneArray(value.dirtyFlags).map(stringify),
                    baseTextureUpdates: positiveInteger(value.baseTextureUpdates),
                    bitmapWidth: positiveInteger(value.bitmapWidth),
                    bitmapHeight: positiveInteger(value.bitmapHeight),
                    reason: stringify(value.reason || ''),
                    errors: positiveInteger(value.errors),
                };
            }

            function normalizeDrawStatePreparationDetails(value) {
                if (!value || typeof value !== 'object') return null;
                return {
                    applied: value.applied === true,
                    source: stringify(value.source || ''),
                    reason: stringify(value.reason || ''),
                    fontSize: finiteOrNull(value.fontSize),
                    outlineWidth: finiteOrNull(value.outlineWidth),
                };
            }

            function cloneArray(value) {
                return Array.isArray(value) ? value.slice() : [];
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function positiveInteger(value) {
                const number = Number(value);
                return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
            }

            function finiteOrNull(value) {
                const number = Number(value);
                return Number.isFinite(number) ? number : null;
            }

            function isRenderCommitCommitted(commit) {
                return !!(commit && commit.committed === true);
            }

            function shouldSampleWindowRestoreSurface(steps) {
                return !!(steps && (
                    steps.clear === true
                    || steps.restoreSnapshot === true
                    || steps.replayBefore === true
                ));
            }

            function shouldSampleWindowDrawSurface(steps) {
                return !!(steps && (
                    steps.drawText === true
                    || steps.replayAfter === true
                ));
            }

            function getWindowRenderSampleArea(plan) {
                if (!plan || typeof plan !== 'object') return null;
                if (plan.replayDirtyRect) return plan.replayDirtyRect;
                if (plan.replayRect) return plan.replayRect;
                if (plan.clearBounds) return plan.clearBounds;
                if (plan.clearArea) return plan.clearArea;
                if (plan.clearRect) return plan.clearRect;
                return null;
            }

            function getWindowDrawSampleArea(plan) {
                if (!plan || typeof plan !== 'object') return null;
                if (plan.drawSampleArea) return plan.drawSampleArea;
                if (plan.drawBounds) return plan.drawBounds;
                return getWindowRenderSampleArea(plan);
            }

            function getStableSurfaceSampleArea(plan) {
                if (!plan || typeof plan !== 'object') return null;
                if (plan.replayDirtyRect) return plan.replayDirtyRect;
                if (plan.replayRect) return plan.replayRect;
                if (plan.clearArea) return plan.clearArea;
                if (plan.drawSampleArea) return plan.drawSampleArea;
                if (plan.drawBounds) return plan.drawBounds;
                return null;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return { create: createRenderExecutor };
        },
    });
})();
