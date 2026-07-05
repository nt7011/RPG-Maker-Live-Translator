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
            renderPlanIntelModule: 'runtime.bitmap.renderPlanIntel',
            renderRestoreGeometryModule: 'runtime.bitmap.renderRestoreGeometry',
        },
        factory({ copiedTargetRenderPlansModule, renderPlanIntelModule, renderRestoreGeometryModule }) {

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
                const renderPlanIntel = renderPlanIntelModule.create();
                const { attachPlanIntel, createWindowRestoreIntel } = renderPlanIntel;
                const renderRestoreGeometry = renderRestoreGeometryModule.create({ restorePlanner });
                const {
                    canUseAreaLocalBackgroundSnapshot,
                    createWindowBitmapClearPlan,
                    createWindowBitmapSnapshotRestorePlan,
                    createSnapshotPartialClearPlan,
                } = renderRestoreGeometry;

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
                    return attachPlanIntel({
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
                        const replayStateIntel = summarizeReplayState(state);
                        if (!state || !replayRect || currentDrawOrder <= 0) {
                            return createWindowReplayPlanResult({
                                planId: createPlanId(),
                                status: 'planned',
                                entry,
                                targetBitmap,
                                currentDrawOrder,
                                replayRect,
                                replayClipRect: replayRect,
                                replayStateIntel,
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
                            replayStateIntel,
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
                    return attachPlanIntel({
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
                        restoreIntel: createWindowRestoreIntel(restorePlan),
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

                function createWindowReplayPlanResult(input = {}) {
                    return attachPlanIntel({
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
                        replayStateIntel: input.replayStateIntel || null,
                        replayBefore: cloneArray(input.replayBefore),
                        replayAfter: cloneArray(input.replayAfter),
                        replayBeforeFiltered: Math.max(0, finiteNumber(input.replayBeforeFiltered, 0)),
                        replayAfterFiltered: Math.max(0, finiteNumber(input.replayAfterFiltered, 0)),
                    });
                }

                function createRejectedPlan(planId, type, reason, input = {}) {
                    return attachPlanIntel({
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
