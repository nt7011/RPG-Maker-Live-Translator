// Bitmap render plan diagnostics.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.renderPlanIntel',
        factory() {

            function createRenderPlanIntel() {
                function attachPlanIntel(plan) {
                    if (!plan || typeof plan !== 'object') return plan;
                    plan.intel = createPlanIntel(plan);
                    return plan;
                }

                function createPlanIntel(plan) {
                    switch (stringify(plan && plan.type || '')) {
                    case 'bitmapFallback':
                        return createFallbackRenderIntel(plan);
                    case 'windowBitmapReplay':
                        return createWindowBitmapReplayIntel(plan);
                    case 'windowBitmapRedraw':
                        return createWindowBitmapRedrawIntel(plan);
                    default:
                        return createBasePlanIntel(plan);
                    }
                }

                function createBasePlanIntel(plan) {
                    return {
                        planId: stringify(plan && plan.planId || ''),
                        type: stringify(plan && plan.type || ''),
                        status: stringify(plan && plan.status || ''),
                        reason: stringify(plan && plan.reason || ''),
                    };
                }

                function createFallbackRenderIntel(plan) {
                    const restorePatches = Array.isArray(plan && plan.restorePatches) ? plan.restorePatches : [];
                    const trustedPatches = restorePatches.filter((patch) => patch && patch.trusted === true).length;
                    const restore = createFallbackRestoreIntel(plan && plan.restorePlan) || {};
                    return Object.assign(createBasePlanIntel(plan), {
                        renderPlanId: stringify(plan && plan.planId || ''),
                        renderPlanStatus: stringify(plan && plan.status || ''),
                        renderExecutionStatus: '',
                        clearRect: formatAreaForIntel(plan && plan.clearRect || null),
                        clearBounds: formatRectForIntel(plan && plan.clearBounds || null),
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

                function createFallbackRestoreIntel(plan) {
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

                function createWindowBitmapReplayIntel(plan) {
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

                function createWindowBitmapRedrawIntel(plan) {
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
                        drawSampleArea: formatRectForIntel(plan && plan.drawSampleArea || null),
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

                function createWindowRestoreIntel(plan) {
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

                return Object.freeze({
                    attachPlanIntel,
                    createWindowRestoreIntel,
                });
            }

            function formatAreaForIntel(area) {
                if (!area || typeof area !== 'object') return '';
                return [
                    `x=${formatNumber(area.x)}`,
                    `y=${formatNumber(area.y)}`,
                    `w=${formatNumber(area.width !== undefined ? area.width : area.w)}`,
                    `h=${formatNumber(area.height !== undefined ? area.height : area.h)}`,
                ].join(',');
            }

            function formatRectForIntel(rect) {
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

            return { create: createRenderPlanIntel };
        },
    });
})();
