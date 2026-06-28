// Bitmap copied-target render plans.
//
// Copied-target redraws have their own proof surface: materialized copy
// targets, detached source entries, and staging-readiness decisions. This
// module owns those data-only plans and diagnostics so the general render
// planner does not carry copied-target policy inline.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetRenderPlans',
        requires: {
            surfaceRoleState: 'runtime.windowSurfaceRoleState',
        },
        factory({ surfaceRoleState }) {

            function createCopiedTargetRenderPlans(deps = {}) {
                const input = deps && typeof deps === 'object' ? deps : {};
                let nextFallbackPlanId = 0;
                const createPlanId = typeof input.createPlanId === 'function'
                    ? input.createPlanId
                    : () => `copied-target-plan-${(++nextFallbackPlanId).toString(36)}`;

                function createWindowCopiedTargetRenderPlan(source = {}) {
                    const entry = source.entry || null;
                    const text = stringify(source.text !== undefined ? source.text : source.renderedText);
                    if (!entry) {
                        return createRejectedPlan(createPlanId(), 'windowCopiedTargetRedraw', 'missing-entry', source);
                    }
                    if (!text) {
                        return createRejectedPlan(createPlanId(), 'windowCopiedTargetRedraw', 'missing-rendered-text', source);
                    }
                    const materializedTargets = cloneArray(source.materializedTargets);
                    const copiedTargets = materializedTargets.length;
                    if (isLiveWindowCurrentContentsSource(source) && copiedTargets <= 0) {
                        return createLiveWindowCurrentContentsRejectedPlan(createPlanId(), source, text);
                    }
                    if (copiedTargets <= 0) {
                        return createRejectedPlan(createPlanId(), 'windowCopiedTargetRedraw', 'missing-copied-targets', source);
                    }
                    const redrawOptions = createCopiedTargetRedrawOptions(materializedTargets);
                    const roleState = surfaceRoleState.describeWindowEntrySurface(entry);
                    return attachPlanDiagnostics({
                        planId: createPlanId(),
                        type: 'windowCopiedTargetRedraw',
                        status: 'planned',
                        entry,
                        targetBitmap: null,
                        text,
                        materializedTargets,
                        copiedTargets,
                        redrawOptions,
                        steps: {
                            materializeCopiedTargets: materializedTargets.length > 0,
                            redrawCopiedTargets: true,
                            markDirty: true,
                            completeRender: true,
                        },
                        proof: {
                            requiresCopiedTarget: roleState.requiresCopiedTarget === true,
                            sourceContentsRole: roleState.sourceContentsRole,
                            renderSurfaceRole: roleState.renderSurfaceRole,
                            sourceCommitted: source.sourceCommitted === true,
                        },
                    });
                }

                function createBitmapCopiedTargetRenderPlan(source = {}) {
                    const entry = source.entry || null;
                    const text = stringify(source.text !== undefined ? source.text : source.renderedText);
                    if (!entry) {
                        return createRejectedPlan(createPlanId(), 'bitmapCopiedTargetRedraw', 'missing-entry', source);
                    }
                    if (!text) {
                        return createRejectedPlan(createPlanId(), 'bitmapCopiedTargetRedraw', 'missing-rendered-text', source);
                    }
                    const materializedTargets = cloneArray(source.materializedTargets);
                    const copiedTargets = materializedTargets.length;
                    const detachedEntry = source.detachedEntry === true || isCopiedTargetDetachedEntry(entry);
                    if (copiedTargets <= 0) {
                        return createRejectedPlan(createPlanId(), 'bitmapCopiedTargetRedraw', 'missing-copied-targets', source);
                    }
                    const redrawOptions = createCopiedTargetRedrawOptions(materializedTargets);
                    return attachPlanDiagnostics({
                        planId: createPlanId(),
                        type: 'bitmapCopiedTargetRedraw',
                        status: 'planned',
                        entry,
                        targetBitmap: null,
                        text,
                        materializedTargets,
                        copiedTargets,
                        redrawOptions,
                        steps: {
                            redrawCopiedTargets: copiedTargets > 0,
                            markDirty: copiedTargets > 0,
                            completeDetachedEntry: !detachedEntry || copiedTargets > 0,
                        },
                        proof: {
                            detachedEntry,
                            sourceCommitted: entry.sourceCommitted === true,
                            sourceRunId: stringify(entry.sourceRunId || ''),
                            sourceSlotKey: stringify(entry.sourceSlotKey || entry.slotKey || ''),
                            sourceSurfaceRevision: finiteNumber(entry.sourceSurfaceRevision, entry.surfaceRevision, 0),
                        },
                    });
                }

                function createBitmapCopiedTargetRecoveryPlan(source = {}) {
                    const entry = source.entry || null;
                    if (!entry) {
                        return createRejectedPlan(createPlanId(), 'bitmapCopiedTargetRecovery', 'missing-entry', source);
                    }
                    const materializedTargets = cloneArray(source.materializedTargets);
                    const copiedTargets = materializedTargets.length;
                    const hasCopiedTargets = copiedTargets > 0;
                    if (!hasCopiedTargets) {
                        return createRejectedPlan(createPlanId(), 'bitmapCopiedTargetRecovery', 'missing-copied-target-proof', source);
                    }
                    return attachPlanDiagnostics({
                        planId: createPlanId(),
                        type: 'bitmapCopiedTargetRecovery',
                        status: 'planned',
                        entry,
                        targetBitmap: null,
                        materializedTargets,
                        copiedTargets,
                        hasCopiedTargets: true,
                        steps: {
                            keepDetachedEntry: true,
                        },
                        proof: {
                            sourceCommitted: entry.sourceCommitted === true,
                            sourceRunId: stringify(entry.sourceRunId || ''),
                            sourceSlotKey: stringify(entry.sourceSlotKey || entry.slotKey || ''),
                            sourceSurfaceRevision: finiteNumber(entry.sourceSurfaceRevision, entry.surfaceRevision, 0),
                        },
                    });
                }

                function createWindowCopiedTargetReadinessPlan(source = {}) {
                    const entry = source.entry || null;
                    if (!entry) {
                        return createRejectedPlan(createPlanId(), 'windowCopiedTargetReadiness', 'missing-entry', source);
                    }
                    const roleState = surfaceRoleState.describeWindowEntrySurface(entry, {
                        pendingInvalidation: source.pendingInvalidation === true,
                    });
                    if (!surfaceRoleState.isCopiedStagingEntry(entry)) {
                        return createRejectedPlan(createPlanId(), 'windowCopiedTargetReadiness', 'not-copied-staging-entry', source);
                    }
                    const materializedTargets = cloneArray(source.materializedTargets);
                    const copiedTargets = materializedTargets.length;
                    const hasCopiedTargets = copiedTargets > 0;
                    if (!hasCopiedTargets) {
                        return createRejectedPlan(createPlanId(), 'windowCopiedTargetReadiness', 'missing-copied-target-proof', source);
                    }
                    return attachPlanDiagnostics({
                        planId: createPlanId(),
                        type: 'windowCopiedTargetReadiness',
                        status: 'planned',
                        entry,
                        targetBitmap: null,
                        materializedTargets,
                        copiedTargets,
                        hasCopiedTargets: true,
                        steps: {
                            acceptPendingInvalidation: true,
                        },
                        proof: {
                            requiresCopiedTarget: roleState.requiresCopiedTarget === true,
                            sourceContentsRole: roleState.sourceContentsRole,
                            renderSurfaceRole: roleState.renderSurfaceRole,
                            pendingInvalidation: source.pendingInvalidation === true,
                        },
                    });
                }

                function createWindowCopiedTargetRecoveryPlan(source = {}) {
                    const entry = source.entry || null;
                    if (!entry) {
                        return createRejectedPlan(createPlanId(), 'windowCopiedTargetRecovery', 'missing-entry', source);
                    }
                    const materializedTargets = cloneArray(source.materializedTargets);
                    const copiedTargets = materializedTargets.length;
                    const hasCopiedTargets = copiedTargets > 0;
                    if (!hasCopiedTargets) {
                        return createRejectedPlan(createPlanId(), 'windowCopiedTargetRecovery', 'missing-copied-target-proof', source);
                    }
                    const roleState = surfaceRoleState.describeWindowEntrySurface(entry, {
                        pendingInvalidation: source.pendingInvalidation === true,
                        screenState: source.screenState,
                    });
                    return attachPlanDiagnostics({
                        planId: createPlanId(),
                        type: 'windowCopiedTargetRecovery',
                        status: 'planned',
                        entry,
                        targetBitmap: null,
                        materializedTargets,
                        copiedTargets,
                        hasCopiedTargets: true,
                        steps: {
                            keepDetachedTranslation: true,
                        },
                        proof: {
                            requiresCopiedTarget: roleState.requiresCopiedTarget === true,
                            sourceContentsRole: roleState.sourceContentsRole,
                            renderSurfaceRole: roleState.renderSurfaceRole,
                            pendingInvalidation: source.pendingInvalidation === true,
                            screenState: roleState.screenState,
                        },
                    });
                }

                function createWindowSourceEntryCopiedTargetRenderPlan(source = {}) {
                    return createWindowCopiedTargetRenderPlan(withProjectedTargets(source));
                }

                function createBitmapSourceEntryCopiedTargetRenderPlan(source = {}) {
                    return createBitmapCopiedTargetRenderPlan(withProjectedTargets(source));
                }

                function createBitmapSourceEntryCopiedTargetRecoveryPlan(source = {}) {
                    return createBitmapCopiedTargetRecoveryPlan(withProjectedTargets(source));
                }

                function createWindowSourceEntryCopiedTargetReadinessPlan(source = {}) {
                    return createWindowCopiedTargetReadinessPlan(withProjectedTargets(source));
                }

                function createWindowSourceEntryCopiedTargetRecoveryPlan(source = {}) {
                    return createWindowCopiedTargetRecoveryPlan(withProjectedTargets(source));
                }

                return freezeApi({
                    createWindowCopiedTargetRenderPlan,
                    createBitmapCopiedTargetRenderPlan,
                    createBitmapCopiedTargetRecoveryPlan,
                    createWindowCopiedTargetReadinessPlan,
                    createWindowCopiedTargetRecoveryPlan,
                    createWindowSourceEntryCopiedTargetRenderPlan,
                    createBitmapSourceEntryCopiedTargetRenderPlan,
                    createBitmapSourceEntryCopiedTargetRecoveryPlan,
                    createWindowSourceEntryCopiedTargetReadinessPlan,
                    createWindowSourceEntryCopiedTargetRecoveryPlan,
                });
            }

            function withProjectedTargets(source = {}) {
                const projectedTargets = collectProjectedTargets(source);
                return Object.assign({}, source, {
                    materializedTargets: projectedTargets,
                    copiedTargets: projectedTargets.length,
                });
            }

            function collectProjectedTargets(source = {}) {
                const explicitTargets = Array.isArray(source.projectedTargets)
                    ? source.projectedTargets
                    : Array.isArray(source.materializedTargets)
                        ? source.materializedTargets
                        : null;
                if (explicitTargets) return explicitTargets.slice();

                const collect = typeof source.collectProjectedTargets === 'function'
                    ? source.collectProjectedTargets
                    : typeof source.materializeProjectedTargets === 'function'
                        ? source.materializeProjectedTargets
                        : null;
                if (!collect) return [];
                try {
                    const targets = collect(source.entry || null, source);
                    return Array.isArray(targets) ? targets.slice() : [];
                } catch (_) {
                    return [];
                }
            }

            function createCopiedTargetRedrawOptions(materializedTargets) {
                return Array.isArray(materializedTargets) && materializedTargets.length > 0
                    ? { materializedTargets: materializedTargets.slice() }
                    : {};
            }

            function isLiveWindowCurrentContentsSource(source = {}) {
                const entry = source && source.entry || null;
                return surfaceRoleState.isLiveCurrentContentsEntry(entry);
            }

            function createLiveWindowCurrentContentsRejectedPlan(planId, source = {}, text = undefined) {
                const entry = source && source.entry || null;
                const roleState = surfaceRoleState.describeWindowEntrySurface(entry);
                return attachPlanDiagnostics({
                    planId: stringify(planId || ''),
                    type: 'windowCopiedTargetRedraw',
                    status: 'rejected',
                    reason: 'live-window-current-contents',
                    entry,
                    targetBitmap: null,
                    text: stringify(text !== undefined ? text : (
                        source && source.text !== undefined ? source.text : source && source.renderedText
                    )),
                    materializedTargets: [],
                    copiedTargets: 0,
                    redrawOptions: {},
                    steps: {
                        materializeCopiedTargets: false,
                        redrawCopiedTargets: false,
                        markDirty: false,
                        completeRender: false,
                    },
                    proof: {
                        requiresCopiedTarget: false,
                        sourceContentsRole: roleState.sourceContentsRole,
                        renderSurfaceRole: roleState.renderSurfaceRole,
                        sourceCommitted: source && source.sourceCommitted === true,
                    },
                });
            }

            function createRejectedPlan(planId, type, reason, input = {}) {
                return attachPlanDiagnostics({
                    planId: stringify(planId || ''),
                    type: stringify(type || ''),
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
                case 'windowCopiedTargetRedraw':
                    return createWindowCopiedTargetRenderDiagnostics(plan);
                case 'bitmapCopiedTargetRedraw':
                    return createBitmapCopiedTargetRenderDiagnostics(plan);
                case 'bitmapCopiedTargetRecovery':
                    return createBitmapCopiedTargetRecoveryDiagnostics(plan);
                case 'windowCopiedTargetReadiness':
                    return createWindowCopiedTargetReadinessDiagnostics(plan);
                case 'windowCopiedTargetRecovery':
                    return createWindowCopiedTargetRecoveryDiagnostics(plan);
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

            function createWindowCopiedTargetRenderDiagnostics(plan) {
                return Object.assign(createBasePlanDiagnostics(plan), {
                    copiedTargets: finiteNumber(plan && plan.copiedTargets, 0),
                    materializedTargets: Array.isArray(plan && plan.materializedTargets) ? plan.materializedTargets.length : 0,
                    steps: {
                        materializeCopiedTargets: !!(plan && plan.steps && plan.steps.materializeCopiedTargets === true),
                        redrawCopiedTargets: !!(plan && plan.steps && plan.steps.redrawCopiedTargets === true),
                        markDirty: !!(plan && plan.steps && plan.steps.markDirty === true),
                        completeRender: !!(plan && plan.steps && plan.steps.completeRender === true),
                    },
                    proof: {
                        requiresCopiedTarget: !!(plan && plan.proof && plan.proof.requiresCopiedTarget === true),
                        sourceContentsRole: stringify(plan && plan.proof && plan.proof.sourceContentsRole || ''),
                        renderSurfaceRole: stringify(plan && plan.proof && plan.proof.renderSurfaceRole || ''),
                        sourceCommitted: !!(plan && plan.proof && plan.proof.sourceCommitted === true),
                    },
                });
            }

            function createBitmapCopiedTargetRenderDiagnostics(plan) {
                return Object.assign(createBasePlanDiagnostics(plan), {
                    copiedTargets: finiteNumber(plan && plan.copiedTargets, 0),
                    steps: {
                        redrawCopiedTargets: !!(plan && plan.steps && plan.steps.redrawCopiedTargets === true),
                        markDirty: !!(plan && plan.steps && plan.steps.markDirty === true),
                        completeDetachedEntry: !!(plan && plan.steps && plan.steps.completeDetachedEntry === true),
                    },
                    proof: {
                        detachedEntry: !!(plan && plan.proof && plan.proof.detachedEntry === true),
                        sourceCommitted: !!(plan && plan.proof && plan.proof.sourceCommitted === true),
                        sourceRunId: stringify(plan && plan.proof && plan.proof.sourceRunId || ''),
                        sourceSlotKey: stringify(plan && plan.proof && plan.proof.sourceSlotKey || ''),
                        sourceSurfaceRevision: finiteNumber(plan && plan.proof && plan.proof.sourceSurfaceRevision, 0),
                    },
                });
            }

            function createBitmapCopiedTargetRecoveryDiagnostics(plan) {
                return Object.assign(createBasePlanDiagnostics(plan), {
                    materializedTargets: Array.isArray(plan && plan.materializedTargets) ? plan.materializedTargets.length : 0,
                    copiedTargets: finiteNumber(plan && plan.copiedTargets, 0),
                    hasCopiedTargets: !!(plan && plan.hasCopiedTargets === true),
                    steps: {
                        keepDetachedEntry: !!(plan && plan.steps && plan.steps.keepDetachedEntry === true),
                    },
                    proof: {
                        sourceCommitted: !!(plan && plan.proof && plan.proof.sourceCommitted === true),
                        sourceRunId: stringify(plan && plan.proof && plan.proof.sourceRunId || ''),
                        sourceSlotKey: stringify(plan && plan.proof && plan.proof.sourceSlotKey || ''),
                        sourceSurfaceRevision: finiteNumber(plan && plan.proof && plan.proof.sourceSurfaceRevision, 0),
                    },
                });
            }

            function createWindowCopiedTargetReadinessDiagnostics(plan) {
                return Object.assign(createBasePlanDiagnostics(plan), {
                    copiedTargets: finiteNumber(plan && plan.copiedTargets, 0),
                    materializedTargets: Array.isArray(plan && plan.materializedTargets) ? plan.materializedTargets.length : 0,
                    hasCopiedTargets: !!(plan && plan.hasCopiedTargets === true),
                    steps: {
                        acceptPendingInvalidation: !!(plan && plan.steps && plan.steps.acceptPendingInvalidation === true),
                    },
                    proof: {
                        requiresCopiedTarget: !!(plan && plan.proof && plan.proof.requiresCopiedTarget === true),
                        sourceContentsRole: stringify(plan && plan.proof && plan.proof.sourceContentsRole || ''),
                        renderSurfaceRole: stringify(plan && plan.proof && plan.proof.renderSurfaceRole || ''),
                        pendingInvalidation: !!(plan && plan.proof && plan.proof.pendingInvalidation === true),
                    },
                });
            }

            function createWindowCopiedTargetRecoveryDiagnostics(plan) {
                return Object.assign(createBasePlanDiagnostics(plan), {
                    materializedTargets: Array.isArray(plan && plan.materializedTargets) ? plan.materializedTargets.length : 0,
                    copiedTargets: finiteNumber(plan && plan.copiedTargets, 0),
                    hasCopiedTargets: !!(plan && plan.hasCopiedTargets === true),
                    steps: {
                        keepDetachedTranslation: !!(plan && plan.steps && plan.steps.keepDetachedTranslation === true),
                    },
                    proof: {
                        requiresCopiedTarget: !!(plan && plan.proof && plan.proof.requiresCopiedTarget === true),
                        sourceContentsRole: stringify(plan && plan.proof && plan.proof.sourceContentsRole || ''),
                        renderSurfaceRole: stringify(plan && plan.proof && plan.proof.renderSurfaceRole || ''),
                        pendingInvalidation: !!(plan && plan.proof && plan.proof.pendingInvalidation === true),
                        screenState: stringify(plan && plan.proof && plan.proof.screenState || ''),
                    },
                });
            }

            function isCopiedTargetDetachedEntry(entry) {
                const lifecycle = entry && entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                    ? entry.renderLifecycle
                    : null;
                const detachment = lifecycle && lifecycle.copiedTargetDetachment && typeof lifecycle.copiedTargetDetachment === 'object'
                    ? lifecycle.copiedTargetDetachment
                    : null;
                return !!(detachment && detachment.detached === true);
            }

            function cloneArray(value) {
                return Array.isArray(value) ? value.slice() : [];
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

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopiedTargetRenderPlans,
            });
        },
    });
})();
