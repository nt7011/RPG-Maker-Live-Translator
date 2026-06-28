// Bitmap render planner.
//
// Produces data-only plans for bitmap text renderers. Executors still own
// drawing mechanics; this module owns the decision surface that says what
// should be cleared, restored, replayed, drawn, and marked dirty.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.renderPlanner',
        requires: {
            copiedTargetRenderPlansModule: 'runtime.bitmap.copiedTargetRenderPlans',
        },
        factory({ copiedTargetRenderPlansModule }) {

            function createRenderPlanner(context = {}) {
                const calculateClearRect = typeof context.calculateClearRect === 'function'
                    ? context.calculateClearRect
                    : (() => null);
                const rectFromDimensions = typeof context.rectFromDimensions === 'function'
                    ? context.rectFromDimensions
                    : (() => null);
                const collectReplayItems = typeof context.collectReplayItems === 'function'
                    ? context.collectReplayItems
                    : (() => []);
                const restorePlanner = context.restorePlanner && typeof context.restorePlanner.chooseRestorePlan === 'function'
                    ? context.restorePlanner
                    : { chooseRestorePlan: () => ({}) };
                const createClearRectFromArea = typeof context.createClearRectFromArea === 'function'
                    ? context.createClearRectFromArea
                    : (() => null);
                const expandReplayDirtyRect = typeof context.expandReplayDirtyRect === 'function'
                    ? context.expandReplayDirtyRect
                    : (() => null);
                const supportsBitmapReplayClip = typeof context.supportsBitmapReplayClip === 'function'
                    ? context.supportsBitmapReplayClip
                    : (() => false);
                const collectWindowTextReplayItems = typeof context.collectWindowTextReplayItems === 'function'
                    ? context.collectWindowTextReplayItems
                    : (() => []);
                const combineReplayItems = typeof context.combineReplayItems === 'function'
                    ? context.combineReplayItems
                    : ((left, right) => cloneArray(left).concat(cloneArray(right)));
                const filterReplayForEntry = typeof context.filterReplayForEntry === 'function'
                    ? context.filterReplayForEntry
                    : ((items) => cloneArray(items));
                const summarizeReplayState = typeof context.summarizeReplayState === 'function'
                    ? context.summarizeReplayState
                    : (() => null);
                let nextPlanId = 0;

                function createPlanId() {
                    return `bitmap-plan-${(++nextPlanId).toString(36)}`;
                }

                const copiedTargetRenderPlans = copiedTargetRenderPlansModule.createCopiedTargetRenderPlans({
                    createPlanId,
                });

                function createFallbackRenderPlan(input = {}) {
                    const entry = input.entry || null;
                    const targetBitmap = input.targetBitmap || entry && entry.bitmap || null;
                    if (!entry || !targetBitmap) {
                        return createRejectedPlan(createPlanId(), 'bitmapFallback', 'missing-entry-or-target', input);
                    }
                    const state = input.state || entry.state || null;
                    const clearRect = input.clearRect || calculateClearRect(targetBitmap, entry);
                    const clearBounds = clearRect
                        ? rectFromDimensions(clearRect.x, clearRect.y, clearRect.width, clearRect.height)
                        : null;
                    const order = finiteNumber(input.drawOrder, entry.drawOrder, 0);
                    const replayBefore = cloneArray(clearBounds
                        ? collectReplayItems(state, clearBounds, entry, (value) => value < order)
                        : []);
                    const replayAfter = cloneArray(clearBounds
                        ? collectReplayItems(state, clearBounds, entry, (value) => value > order)
                        : []);
                    const restorePatches = cloneArray(input.restorePatches !== undefined
                        ? input.restorePatches
                        : (input.patches !== undefined ? input.patches : entry.backgroundPatches));
                    const restorePlan = restorePlanner.chooseRestorePlan({
                        entry,
                        targetBitmap,
                        replayBefore,
                        replayRect: clearBounds,
                        clearArea: clearRect,
                        patches: restorePatches,
                        allowPatches: true,
                    });
                    const text = stringify(input.text !== undefined ? input.text : input.restoredText);
                    return attachPlanDiagnostics({
                        planId: createPlanId(),
                        type: 'bitmapFallback',
                        status: 'planned',
                        entry,
                        targetBitmap,
                        text,
                        clearRect,
                        clearBounds,
                        restorePatches,
                        replayBefore,
                        replayAfter,
                        restorePlan: restorePlan || {},
                        steps: {
                            clear: !!(clearRect && clearRect.width > 0 && clearRect.height > 0),
                            restorePatches: !!(restorePlan && restorePlan.patches && restorePlan.patches.apply === true),
                            replayBefore: !!(restorePlan && restorePlan.replay && restorePlan.replay.applyAfterClear === true),
                            drawText: !!text,
                            replayAfter: replayAfter.length > 0,
                            markDirty: true,
                        },
                        proof: {
                            targetRevision: finiteNumber(entry.surfaceRevision, entry.revision, 0),
                            drawOrder: order,
                            sourceCommitted: entry.sourceCommitted === true,
                        },
                    });
                }

                function createWindowBitmapReplayPlan(input = {}) {
                    const entry = input.entry || null;
                    const targetBitmap = input.targetBitmap || input.contents || null;
                    if (!entry || !targetBitmap) {
                        return createRejectedPlan(createPlanId(), 'windowBitmapReplay', 'missing-entry-or-target', input);
                    }
                    const replayApi = input.replayApi || null;
                    if (!replayApi) {
                        return createWindowReplayPlanResult({
                            planId: createPlanId(),
                            status: 'planned',
                            reason: 'missing-replay-api',
                            entry,
                            targetBitmap,
                            currentDrawOrder: finiteNumber(input.currentDrawOrder, input.drawOrder, entry.drawOrder, 0),
                        });
                    }

                    const currentDrawOrder = finiteNumber(input.currentDrawOrder, input.drawOrder, entry.drawOrder, 0);
                    const clearArea = cloneArea(input.clearArea || null);
                    try {
                        const state = typeof replayApi.ensureBitmapState === 'function'
                            ? replayApi.ensureBitmapState(targetBitmap)
                            : null;
                        const replayRect = createWindowReplayRect(targetBitmap, clearArea, replayApi, createClearRectFromArea);
                        const replayStateDiagnostics = summarizeReplayState(state);
                        if (!state || !replayRect || currentDrawOrder <= 0) {
                            return createWindowReplayPlanResult({
                                planId: createPlanId(),
                                status: 'planned',
                                entry,
                                targetBitmap,
                                currentDrawOrder,
                                replayRect,
                                replayClipRect: replayRect,
                                replayStateDiagnostics,
                            });
                        }

                        const bitmapBefore = cloneArray(replayApi.collectReplayItems(state, replayRect, entry, (order) => order < currentDrawOrder));
                        const bitmapAfter = cloneArray(replayApi.collectReplayItems(state, replayRect, entry, (order) => order > currentDrawOrder));
                        const bitmapReplayDirtyRect = cloneRect(expandReplayDirtyRect(replayRect, bitmapBefore.concat(bitmapAfter)));
                        const supportsReplayClip = supportsBitmapReplayClip(targetBitmap) === true;
                        const windowReplayRect = supportsReplayClip ? replayRect : bitmapReplayDirtyRect;
                        const windowItems = cloneArray(collectWindowTextReplayItems(
                            input.windowData || null,
                            entry,
                            targetBitmap,
                            windowReplayRect,
                            currentDrawOrder,
                            {
                                protectedEntries: cloneArray(input.protectedWindowEntries),
                            }
                        ));
                        const protectedWindowItems = windowItems.filter((item) => item && item.protectedReplayDependency === true);
                        const replayDirtyRect = cloneRect(expandReplayDirtyRect(bitmapReplayDirtyRect, protectedWindowItems));
                        // The executor clips mixed replay to replayClipRect. If a
                        // logical dependency sits just outside the clear rect, the
                        // selection and the clip must expand together.
                        const replayClipRect = cloneRect(supportsReplayClip
                            ? expandReplayDirtyRect(replayRect, protectedWindowItems)
                            : replayDirtyRect);
                        const beforeCandidate = cloneArray(combineReplayItems(
                            bitmapBefore,
                            windowItems.filter((item) => (Number(item && item.drawOrder) || 0) < currentDrawOrder)
                        ));
                        const afterCandidate = cloneArray(combineReplayItems(
                            bitmapAfter,
                            windowItems.filter((item) => (Number(item && item.drawOrder) || 0) > currentDrawOrder)
                        ));
                        const replayBefore = cloneArray(filterReplayForEntry(beforeCandidate, entry));
                        const replayAfter = cloneArray(filterReplayForEntry(afterCandidate, entry));
                        return createWindowReplayPlanResult({
                            planId: createPlanId(),
                            status: 'planned',
                            entry,
                            targetBitmap,
                            currentDrawOrder,
                            replayRect,
                            replayClipRect,
                            replayDirtyRect,
                            windowReplayRect,
                            supportsReplayClip,
                            replayStateDiagnostics,
                            replayBefore,
                            replayAfter,
                            replayBeforeFiltered: Math.max(0, beforeCandidate.length - replayBefore.length),
                            replayAfterFiltered: Math.max(0, afterCandidate.length - replayAfter.length),
                        });
                    } catch (error) {
                        return createWindowReplayPlanResult({
                            planId: createPlanId(),
                            status: 'planned',
                            reason: 'replay-collection-failed',
                            entry,
                            targetBitmap,
                            currentDrawOrder,
                            replayCollectError: true,
                        });
                    }
                }

                function createWindowBitmapRenderPlan(input = {}) {
                    const entry = input.entry || null;
                    const targetBitmap = input.targetBitmap || input.contents || null;
                    if (!entry || !targetBitmap) {
                        return createRejectedPlan(createPlanId(), 'windowBitmapRedraw', 'missing-entry-or-target', input);
                    }
                    const replayBefore = cloneArray(input.replayBefore);
                    const replayAfter = cloneArray(input.replayAfter);
                    const replayRect = cloneRect(input.replayRect || input.replayClipRect || null);
                    const drawSampleArea = cloneRect(input.drawSampleArea || input.sampleArea || input.drawBounds || null);
                    const clearArea = cloneArea(input.clearArea || null);
                    const snapshotStatus = clonePlainObject(input.snapshotStatus);
                    const allowStaleRevision = canUseAreaLocalBackgroundSnapshot(input);
                    const restorePlan = restorePlanner.chooseRestorePlan({
                        entry,
                        allowStaleRevision,
                        replayBefore,
                        replayRect,
                        snapshotStatus,
                        clearArea,
                        targetBitmap,
                    });
                    const clearPlan = createWindowBitmapClearPlan({
                        clearArea,
                        restorePlan,
                    });
                    const snapshotRestorePlan = createWindowBitmapSnapshotRestorePlan({
                        restorePlan,
                    });
                    const snapshotPartialClearPlan = createSnapshotPartialClearPlan({
                        entry,
                        targetBitmap,
                        clearArea,
                        snapshot: input.snapshot || entry && entry.backgroundSnapshot,
                        replayBefore,
                        restorePlan,
                    });
                    return attachPlanDiagnostics({
                        planId: createPlanId(),
                        type: 'windowBitmapRedraw',
                        status: 'planned',
                        entry,
                        targetBitmap,
                        clearArea,
                        drawSampleArea,
                        replayRect,
                        replayBefore,
                        replayAfter,
                        snapshotStatus,
                        restorePlan: restorePlan || {},
                        restoreDiagnostics: createWindowRestoreDiagnostics(restorePlan),
                        clearPlan,
                        snapshotRestorePlan,
                        snapshotPartialClearPlan,
                        steps: {
                            clear: !!(restorePlan && restorePlan.kind !== 'snapshot'),
                            restoreSnapshot: snapshotRestorePlan.active === true,
                            replayBefore: clearPlan.replayAfterClear === true,
                            drawText: true,
                            replayAfter: replayAfter.length > 0,
                            markDirty: true,
                        },
                        proof: {
                            allowStaleRevision,
                            targetProofValid: !!(input.targetProof && input.targetProof.accepted === true),
                            pendingInvalidation: !!input.pendingInvalidation,
                        },
                    });
                }

                function createWindowBitmapSnapshotRestorePlan(input = {}) {
                    const restorePlan = input.restorePlan || {};
                    const snapshot = restorePlan.snapshot || {};
                    const freshness = stringify(restorePlan.freshness || snapshot.freshness || '');
                    const restoreOptions = restorePlan.restoreOptions && typeof restorePlan.restoreOptions === 'object'
                        ? Object.assign({}, restorePlan.restoreOptions)
                        : null;
                    return {
                        active: restorePlan.kind === 'snapshot',
                        restoreOptions,
                        freshness,
                        skippedReason: stringify(snapshot.skippedReason || ''),
                        staleRevision: freshness === 'staleRevision',
                        staleArea: freshness === 'staleArea',
                    };
                }

                function createWindowBitmapClearPlan(input = {}) {
                    const clearArea = normalizeArea(input.clearArea);
                    const restorePlan = input.restorePlan || {};
                    const defaultMode = clearArea ? 'clearRect' : 'clear';
                    const restoreMode = stringify(restorePlan.clearMode || '');
                    const usesRestoreClearMode = restorePlan.kind === 'clear' || restorePlan.kind === 'replay';
                    return {
                        mode: usesRestoreClearMode && restoreMode ? restoreMode : defaultMode,
                        snapshotMode: restorePlan.kind === 'snapshot' && restoreMode ? restoreMode : 'snapshot',
                        hasClearArea: !!clearArea,
                        replayAfterClear: !!(restorePlan.replay && restorePlan.replay.applyAfterClear === true),
                    };
                }

                function canUseAreaLocalBackgroundSnapshot(input = {}) {
                    if (!input.entry || input.pendingInvalidation) return false;
                    const targetProof = input.targetProof || null;
                    // `contentsRevision` is window-wide. Later unrelated draws can
                    // advance it while this entry remains current. Target validation
                    // plus pending-invalidation absence is the area-local proof that
                    // the snapshot still belongs to the live draw slot.
                    return !!(targetProof && targetProof.accepted === true);
                }

                function createSnapshotPartialClearPlan(input = {}) {
                    const restorePlan = input.restorePlan || {};
                    if (!restorePlan || restorePlan.kind !== 'snapshot') {
                        return createSnapshotPartialClearResult('not-snapshot');
                    }
                    if (!restorePlan.replay || restorePlan.replay.applyForPartialClear !== true) {
                        return createSnapshotPartialClearResult('partial-clear-replay-disabled');
                    }
                    const replayBefore = cloneArray(input.replayBefore);
                    if (!replayBefore.length) {
                        return createSnapshotPartialClearResult('missing-replay-before');
                    }
                    const snapshot = input.snapshot || input.entry && input.entry.backgroundSnapshot || null;
                    if (snapshot && snapshot.fromNativeTextBackdrop === true) {
                        return createSnapshotPartialClearResult('native-text-backdrop');
                    }
                    if (!restorePlanner || typeof restorePlanner.describeReplayCandidate !== 'function') {
                        return createSnapshotPartialClearResult('replay-descriptor-unavailable');
                    }
                    const clear = normalizeAreaBounds(input.clearArea);
                    const cover = normalizeAreaBounds(snapshot);
                    if (!clear || !cover) {
                        return createSnapshotPartialClearResult('missing-clear-or-snapshot-area');
                    }
                    const candidateAreas = createSnapshotPartialClearCandidates(clear, cover);
                    const areas = candidateAreas.filter((area) => {
                        const replay = restorePlanner.describeReplayCandidate(
                            input.entry || null,
                            replayBefore,
                            areaToRect(area),
                            input.targetBitmap || null
                        );
                        return !!(replay
                            && replay.blockedBySelfCopy !== true
                            && replay.coversTarget === true);
                    });
                    return createSnapshotPartialClearResult(areas.length ? '' : 'no-covered-partial-clear-areas', {
                        areas,
                        candidateAreas: candidateAreas.length,
                        replayAfterClear: areas.length > 0,
                    });
                }

                function createSnapshotPartialClearCandidates(clear, cover) {
                    const candidates = [];
                    const addArea = (x, y, w, h) => {
                        const area = normalizeArea({ x, y, w, h });
                        if (area) candidates.push(area);
                    };
                    const ix1 = Math.max(clear.x1, cover.x1);
                    const iy1 = Math.max(clear.y1, cover.y1);
                    const ix2 = Math.min(clear.x2, cover.x2);
                    const iy2 = Math.min(clear.y2, cover.y2);
                    if (ix1 >= ix2 || iy1 >= iy2) {
                        addArea(clear.x1, clear.y1, clear.x2 - clear.x1, clear.y2 - clear.y1);
                        return candidates;
                    }
                    addArea(clear.x1, clear.y1, clear.x2 - clear.x1, iy1 - clear.y1);
                    addArea(clear.x1, iy2, clear.x2 - clear.x1, clear.y2 - iy2);
                    addArea(clear.x1, iy1, ix1 - clear.x1, iy2 - iy1);
                    addArea(ix2, iy1, clear.x2 - ix2, iy2 - iy1);
                    return candidates;
                }

                function createSnapshotPartialClearResult(reason = '', input = {}) {
                    const areas = Array.isArray(input.areas)
                        ? input.areas.map(normalizeArea).filter(Boolean)
                        : [];
                    return {
                        active: areas.length > 0,
                        reason: stringify(reason || ''),
                        areas,
                        candidateAreas: Math.max(0, finiteNumber(input.candidateAreas, 0)),
                        replayAfterClear: input.replayAfterClear === true && areas.length > 0,
                    };
                }

                return {
                    createFallbackRenderPlan,
                    createWindowBitmapReplayPlan,
                    createWindowBitmapRenderPlan,
                    createWindowCopiedTargetRenderPlan: copiedTargetRenderPlans.createWindowCopiedTargetRenderPlan,
                    createBitmapCopiedTargetRenderPlan: copiedTargetRenderPlans.createBitmapCopiedTargetRenderPlan,
                    createBitmapCopiedTargetRecoveryPlan: copiedTargetRenderPlans.createBitmapCopiedTargetRecoveryPlan,
                    createWindowCopiedTargetReadinessPlan: copiedTargetRenderPlans.createWindowCopiedTargetReadinessPlan,
                    createWindowCopiedTargetRecoveryPlan: copiedTargetRenderPlans.createWindowCopiedTargetRecoveryPlan,
                    createWindowSourceEntryCopiedTargetRenderPlan: copiedTargetRenderPlans.createWindowSourceEntryCopiedTargetRenderPlan,
                    createBitmapSourceEntryCopiedTargetRenderPlan: copiedTargetRenderPlans.createBitmapSourceEntryCopiedTargetRenderPlan,
                    createBitmapSourceEntryCopiedTargetRecoveryPlan: copiedTargetRenderPlans.createBitmapSourceEntryCopiedTargetRecoveryPlan,
                    createWindowSourceEntryCopiedTargetReadinessPlan: copiedTargetRenderPlans.createWindowSourceEntryCopiedTargetReadinessPlan,
                    createWindowSourceEntryCopiedTargetRecoveryPlan: copiedTargetRenderPlans.createWindowSourceEntryCopiedTargetRecoveryPlan,
                };
            }

            function createWindowReplayRect(targetBitmap, clearArea, replayApi, createClearRectFromArea) {
                if (clearArea) return cloneRect(createClearRectFromArea(clearArea, replayApi));
                if (replayApi && typeof replayApi.rectFromDimensions === 'function') {
                    return cloneRect(replayApi.rectFromDimensions(
                        0,
                        0,
                        Number(targetBitmap && targetBitmap.width) || 0,
                        Number(targetBitmap && targetBitmap.height) || 0
                    ));
                }
                return null;
            }

            function createWindowReplayPlanResult(input = {}) {
                return attachPlanDiagnostics({
                    planId: stringify(input.planId || ''),
                    type: 'windowBitmapReplay',
                    status: stringify(input.status || 'planned'),
                    reason: stringify(input.reason || ''),
                    entry: input.entry || null,
                    targetBitmap: input.targetBitmap || null,
                    currentDrawOrder: finiteNumber(input.currentDrawOrder, 0),
                    replayRect: cloneRect(input.replayRect || null),
                    replayClipRect: cloneRect(input.replayClipRect || null),
                    replayDirtyRect: cloneRect(input.replayDirtyRect || null),
                    windowReplayRect: cloneRect(input.windowReplayRect || null),
                    supportsReplayClip: input.supportsReplayClip === true,
                    replayCollectError: input.replayCollectError === true,
                    replayStateDiagnostics: input.replayStateDiagnostics || null,
                    replayBefore: cloneArray(input.replayBefore),
                    replayAfter: cloneArray(input.replayAfter),
                    replayBeforeFiltered: Math.max(0, finiteNumber(input.replayBeforeFiltered, 0)),
                    replayAfterFiltered: Math.max(0, finiteNumber(input.replayAfterFiltered, 0)),
                });
            }

            function createRejectedPlan(planId, type, reason, input = {}) {
                return attachPlanDiagnostics({
                    planId: stringify(planId || ''),
                    type: stringify(type || 'bitmapFallback'),
                    status: 'rejected',
                    reason: stringify(reason || 'rejected'),
                    entry: input.entry || null,
                    targetBitmap: input.targetBitmap || null,
                    text: stringify(input.text !== undefined ? input.text : input.restoredText),
                    clearRect: null,
                    clearBounds: null,
                    restorePatches: [],
                    replayBefore: [],
                    replayAfter: [],
                    restorePlan: {},
                    steps: {},
                    proof: {},
                });
            }

            function attachPlanDiagnostics(plan) {
                if (!plan || typeof plan !== 'object') return plan;
                plan.diagnostics = createPlanDiagnostics(plan);
                return plan;
            }

            function createPlanDiagnostics(plan) {
                switch (stringify(plan && plan.type || '')) {
                case 'bitmapFallback':
                    return createFallbackRenderDiagnostics(plan);
                case 'windowBitmapReplay':
                    return createWindowBitmapReplayDiagnostics(plan);
                case 'windowBitmapRedraw':
                    return createWindowBitmapRedrawDiagnostics(plan);
                default:
                    return createBasePlanDiagnostics(plan);
                }
            }

            function createBasePlanDiagnostics(plan) {
                return {
                    planId: stringify(plan && plan.planId || ''),
                    type: stringify(plan && plan.type || ''),
                    status: stringify(plan && plan.status || ''),
                    reason: stringify(plan && plan.reason || ''),
                };
            }

            function createFallbackRenderDiagnostics(plan) {
                const restorePatches = Array.isArray(plan && plan.restorePatches) ? plan.restorePatches : [];
                const trustedPatches = restorePatches.filter((patch) => patch && patch.trusted === true).length;
                const restore = createFallbackRestoreDiagnostics(plan && plan.restorePlan) || {};
                return Object.assign(createBasePlanDiagnostics(plan), {
                    renderPlanId: stringify(plan && plan.planId || ''),
                    renderPlanStatus: stringify(plan && plan.status || ''),
                    renderExecutionStatus: '',
                    clearRect: formatAreaForDiagnostics(plan && plan.clearRect || null),
                    clearBounds: formatRectForDiagnostics(plan && plan.clearBounds || null),
                    replayBefore: Array.isArray(plan && plan.replayBefore) ? plan.replayBefore.length : 0,
                    replayAfter: Array.isArray(plan && plan.replayAfter) ? plan.replayAfter.length : 0,
                    patchCount: restorePatches.length,
                    trustedPatchCount: trustedPatches,
                    untrustedPatchCount: restorePatches.length - trustedPatches,
                    backdropKind: restore.kind,
                    backdropSource: restore.source,
                    backdropClearMode: restore.clearMode,
                    backdropSteps: restore.steps,
                    backdropPatchesApply: restore.patchesApply,
                    backdropPatchCount: restore.patchCount,
                    backdropPatchesCoverTarget: restore.patchesCoverTarget,
                    backdropReplayApplyAfterClear: restore.replayApplyAfterClear,
                    backdropReplayItemCount: restore.replayItemCount,
                    backdropReplayCoversTarget: restore.replayCoversTarget,
                });
            }

            function createFallbackRestoreDiagnostics(plan) {
                if (!plan || typeof plan !== 'object') return null;
                return {
                    kind: stringify(plan.kind || ''),
                    source: stringify(plan.source || ''),
                    clearMode: stringify(plan.clearMode || ''),
                    steps: Array.isArray(plan.steps) ? plan.steps.map(stringify).join(',') : '',
                    patchesApply: !!(plan.patches && plan.patches.apply === true),
                    patchCount: finiteNumber(plan.patches && plan.patches.count, 0),
                    patchesCoverTarget: !!(plan.patches && plan.patches.coversTarget === true),
                    replayApplyAfterClear: !!(plan.replay && plan.replay.applyAfterClear === true),
                    replayItemCount: finiteNumber(plan.replay && plan.replay.itemCount, 0),
                    replayCoversTarget: !!(plan.replay && plan.replay.coversTarget === true),
                };
            }

            function createWindowBitmapReplayDiagnostics(plan) {
                return {
                    id: stringify(plan && plan.planId || ''),
                    type: stringify(plan && plan.type || ''),
                    status: stringify(plan && plan.status || ''),
                    reason: stringify(plan && plan.reason || ''),
                    replayBefore: Array.isArray(plan && plan.replayBefore) ? plan.replayBefore.length : 0,
                    replayAfter: Array.isArray(plan && plan.replayAfter) ? plan.replayAfter.length : 0,
                    replayBeforeFiltered: finiteNumber(plan && plan.replayBeforeFiltered, 0),
                    replayAfterFiltered: finiteNumber(plan && plan.replayAfterFiltered, 0),
                    supportsReplayClip: !!(plan && plan.supportsReplayClip === true),
                    replayCollectError: !!(plan && plan.replayCollectError === true),
                };
            }

            function createWindowBitmapRedrawDiagnostics(plan) {
                const clearPlan = plan && plan.clearPlan || {};
                const snapshotRestorePlan = plan && plan.snapshotRestorePlan || {};
                const steps = plan && plan.steps || {};
                return {
                    id: stringify(plan && plan.planId || ''),
                    type: stringify(plan && plan.type || ''),
                    status: stringify(plan && plan.status || ''),
                    reason: stringify(plan && plan.reason || ''),
                    copiedTargets: finiteNumber(plan && plan.copiedTargets, 0),
                    materializedTargets: Array.isArray(plan && plan.materializedTargets) ? plan.materializedTargets.length : 0,
                    drawSampleArea: formatRectForDiagnostics(plan && plan.drawSampleArea || null),
                    clearPlan: {
                        mode: stringify(clearPlan.mode || ''),
                        snapshotMode: stringify(clearPlan.snapshotMode || ''),
                        replayAfterClear: clearPlan.replayAfterClear === true,
                    },
                    snapshotRestorePlan: {
                        active: snapshotRestorePlan.active === true,
                        freshness: stringify(snapshotRestorePlan.freshness || ''),
                        skippedReason: stringify(snapshotRestorePlan.skippedReason || ''),
                        staleRevision: snapshotRestorePlan.staleRevision === true,
                        staleArea: snapshotRestorePlan.staleArea === true,
                    },
                    steps: {
                        clear: steps.clear === true,
                        restoreSnapshot: steps.restoreSnapshot === true,
                        replayBefore: steps.replayBefore === true,
                        drawText: steps.drawText === true,
                        replayAfter: steps.replayAfter === true,
                        markDirty: steps.markDirty === true,
                        materializeCopiedTargets: steps.materializeCopiedTargets === true,
                        redrawCopiedTargets: steps.redrawCopiedTargets === true,
                        completeRender: steps.completeRender === true,
                    },
                };
            }

            function createWindowRestoreDiagnostics(plan) {
                if (!plan || typeof plan !== 'object') return null;
                const replay = plan.replay || {};
                const snapshot = plan.snapshot || {};
                const nativeBackdrop = snapshot.nativeBackdrop || {};
                const patches = plan.patches || {};
                const restoreSemantics = plan.restoreSemantics || {};
                return {
                    kind: stringify(plan.kind || ''),
                    source: stringify(plan.source || ''),
                    clearMode: stringify(plan.clearMode || ''),
                    freshness: stringify(plan.freshness || ''),
                    restoreSemantics: {
                        clear: restoreSemantics.clear === true,
                        snapshot: restoreSemantics.snapshot === true,
                        patches: restoreSemantics.patches === true,
                        replayAfterClear: restoreSemantics.replayAfterClear === true,
                    },
                    replay: {
                        itemCount: finiteNumber(replay.itemCount, 0),
                        coverageRects: finiteNumber(replay.coverageRects, 0),
                        coversTarget: replay.coversTarget === true,
                        blockedBySelfCopy: replay.blockedBySelfCopy === true,
                        applyAfterClear: replay.applyAfterClear === true,
                        applyForPartialClear: replay.applyForPartialClear === true,
                        freshness: stringify(replay.freshness || ''),
                    },
                    snapshot: {
                        available: snapshot.available === true,
                        usable: snapshot.usable === true,
                        freshness: stringify(snapshot.freshness || ''),
                        skippedReason: stringify(snapshot.skippedReason || ''),
                        nativeBackdrop: {
                            available: nativeBackdrop.available === true,
                            fromNativeTextBackdrop: nativeBackdrop.fromNativeTextBackdrop === true,
                            trusted: nativeBackdrop.trusted === true,
                            targetAvailable: nativeBackdrop.targetAvailable === true,
                            snapshotRectAvailable: nativeBackdrop.snapshotRectAvailable === true,
                            coverageRects: finiteNumber(nativeBackdrop.coverageRects, 0),
                            coversTarget: nativeBackdrop.coversTarget === true,
                        },
                    },
                    patches: {
                        available: patches.available === true,
                        count: finiteNumber(patches.count, 0),
                        coverageRects: finiteNumber(patches.coverageRects, 0),
                        coversTarget: patches.coversTarget === true,
                        apply: patches.apply === true,
                        freshness: stringify(patches.freshness || ''),
                    },
                };
            }

            function cloneArray(value) {
                return Array.isArray(value) ? value.slice() : [];
            }

            function cloneRect(value) {
                if (!value || typeof value !== 'object') return null;
                const x1 = Number(value.x1);
                const y1 = Number(value.y1);
                const x2 = Number(value.x2);
                const y2 = Number(value.y2);
                if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
                return { x1, y1, x2, y2 };
            }

            function cloneArea(value) {
                if (!value || typeof value !== 'object') return null;
                const x = Number(value.x);
                const y = Number(value.y);
                const w = Number(value.w !== undefined ? value.w : value.width);
                const h = Number(value.h !== undefined ? value.h : value.height);
                if (![x, y, w, h].every(Number.isFinite)) return null;
                return { x, y, w, h };
            }

            function normalizeArea(value) {
                const area = cloneArea(value);
                if (!area || area.w <= 0 || area.h <= 0) return null;
                return area;
            }

            function normalizeAreaBounds(value) {
                const area = normalizeArea(value);
                if (area) {
                    return {
                        x1: area.x,
                        y1: area.y,
                        x2: area.x + area.w,
                        y2: area.y + area.h,
                    };
                }
                const rect = cloneRect(value);
                if (!rect || rect.x2 <= rect.x1 || rect.y2 <= rect.y1) return null;
                return rect;
            }

            function areaToRect(area) {
                return normalizeAreaBounds(area);
            }

            function formatAreaForDiagnostics(area) {
                if (!area || typeof area !== 'object') return '';
                return [
                    `x=${formatNumber(area.x)}`,
                    `y=${formatNumber(area.y)}`,
                    `w=${formatNumber(area.width !== undefined ? area.width : area.w)}`,
                    `h=${formatNumber(area.height !== undefined ? area.height : area.h)}`,
                ].join(',');
            }

            function formatRectForDiagnostics(rect) {
                if (!rect || typeof rect !== 'object') return '';
                return [
                    `x1=${formatNumber(rect.x1)}`,
                    `y1=${formatNumber(rect.y1)}`,
                    `x2=${formatNumber(rect.x2)}`,
                    `y2=${formatNumber(rect.y2)}`,
                ].join(',');
            }

            function formatNumber(value) {
                const number = Number(value);
                return Number.isFinite(number) ? String(Math.round(number * 1000) / 1000) : '';
            }

            function clonePlainObject(value) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
                return Object.assign({}, value);
            }

            function finiteNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            return { create: createRenderPlanner };
        },
    });
})();
