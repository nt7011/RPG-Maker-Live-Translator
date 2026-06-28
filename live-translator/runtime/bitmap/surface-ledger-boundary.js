// Bitmap surface ledger boundary.
//
// Bitmap services compose adapters with the surface ledger, but they should not
// own ledger transaction state or copy-edge query policy. This boundary wraps
// ledger access with stable error handling, mutation-journal transaction
// bookkeeping, copy-edge commit logic, and adapter-facing surface queries.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.surfaceLedgerBoundary',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            copyEdgeState: 'runtime.bitmap.copyEdgeState',
            restoreMaterialContract: 'runtime.bitmap.copiedTargetRestoreMaterial',
            copiedTextProjection: 'runtime.bitmap.copiedTextProjection',
        },
        factory({ rectGeometry, copyEdgeState, restoreMaterialContract, copiedTextProjection }) {

            const cloneRect = rectGeometry.cloneRect;
            const createCopyEdgeState = copyEdgeState.createCopyEdgeState;
            const isCurrentCopyEdgeState = copyEdgeState.isCurrentCopyEdgeState;
            const copyCopiedTargetRestoreMaterialDescriptor = restoreMaterialContract.copyCopiedTargetRestoreMaterialDescriptor;
            const copyCopiedTextProjectionRecord = copiedTextProjection.copyCopiedTextProjectionRecord;

            function createSurfaceLedgerBoundary(deps = {}) {
                const surfaceLedger = deps.surfaceLedger || null;
                if (!surfaceLedger) {
                    throw new Error('[LiveTranslator] runtime.bitmap.surfaceLedgerBoundary requires a surface ledger dependency.');
                }
                const hookCapture = deps.hookCapture || null;
                if (!hookCapture || typeof hookCapture.beginMutation !== 'function') {
                    throw new Error('[LiveTranslator] runtime.bitmap.surfaceLedgerBoundary requires a hook capture dependency.');
                }
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};
                const mutationLedgerTransactions = new WeakMap();

                function recordCommittedDraw(bitmap, input, unit) {
                    try {
                        const captureTransaction = input && input.captureTransaction;
                        const commitInput = Object.assign({}, input, {
                            nativeUnitId: unit && unit.id,
                            order: unit && unit.order,
                            drawStateId: unit && unit.styleId,
                        });
                        return captureTransaction && typeof captureTransaction.commitNativeSuccess === 'function'
                            ? captureTransaction.commitNativeSuccess(commitInput)
                            : surfaceLedger.recordCommittedDraw(bitmap, commitInput);
                    } catch (error) {
                        reportError('surfaceLedger.recordCommittedDraw', error);
                        return null;
                    }
                }

                function ensureMutationTransaction(context) {
                    if (!context || mutationLedgerTransactions.has(context)) {
                        return mutationLedgerTransactions.get(context) || null;
                    }
                    const transaction = hookCapture.beginMutation(
                        context.bitmap,
                        createMutationInput(context)
                    );
                    if (transaction) mutationLedgerTransactions.set(context, transaction);
                    return transaction || null;
                }

                function commitMutation(context) {
                    const transaction = mutationLedgerTransactions.get(context);
                    if (!transaction || typeof transaction.commitNativeSuccess !== 'function') return null;
                    mutationLedgerTransactions.delete(context);
                    const mutation = transaction.commitNativeSuccess(createMutationInput(context));
                    if (mutation && typeof context.setMetadata === 'function') {
                        context.setMetadata('surfaceLedgerMutationId', mutation.mutationId || '');
                    }
                    return mutation;
                }

                function abortMutation(context, reason) {
                    const transaction = mutationLedgerTransactions.get(context);
                    if (!transaction) return null;
                    mutationLedgerTransactions.delete(context);
                    if (typeof transaction.finishSuppressed === 'function' && reason === 'suppressed') {
                        return transaction.finishSuppressed(reason);
                    }
                    if (typeof transaction.abortNativeFailure !== 'function') return null;
                    return transaction.abortNativeFailure(new Error(reason || 'native-failure'));
                }

                function recordCopyEdge(context) {
                    let mutationId = typeof context.getMetadata === 'function'
                        ? stringify(context.getMetadata('surfaceLedgerMutationId') || '')
                        : '';
                    let committedMutation = null;
                    if (!mutationId) {
                        committedMutation = commitMutation(context);
                        mutationId = stringify(committedMutation && committedMutation.mutationId || '');
                    }
                    if (!mutationId || typeof surfaceLedger.recordCopyEdge !== 'function') {
                        return { recordedCopyEdge: false };
                    }
                    try {
                        const edge = surfaceLedger.recordCopyEdge(context.bitmap, Object.assign(
                            createMutationInput(context),
                            { mutationId }
                        ));
                        return {
                            recordedCopyEdge: !!edge,
                            copyEdgeId: edge && edge.edgeId || '',
                        };
                    } catch (error) {
                        reportError('surfaceLedger.recordCopyEdge', error);
                        return { recordedCopyEdge: false };
                    }
                }

                function markCopyEdgeRecovered(edge, input = {}) {
                    if (!edge || typeof surfaceLedger.markCopyEdgeRecovered !== 'function') return null;
                    try {
                        return surfaceLedger.markCopyEdgeRecovered(edge, input);
                    } catch (error) {
                        reportError('surfaceLedger.markCopyEdgeRecovered', error);
                        return null;
                    }
                }

                function markProjectionDamagedByMutation(input) {
                    if (typeof surfaceLedger.markProjectionDamagedByMutation !== 'function') return [];
                    try {
                        const states = surfaceLedger.markProjectionDamagedByMutation(input);
                        return Array.isArray(states) ? states.map(copyProjectionState).filter(Boolean) : [];
                    } catch (error) {
                        reportError('surfaceLedger.markProjectionDamagedByMutation', error);
                        return [];
                    }
                }

                function markProjectionRecoveredByRestore(input) {
                    if (typeof surfaceLedger.markProjectionRecoveredByRestore !== 'function') return null;
                    try {
                        return copyProjectionState(surfaceLedger.markProjectionRecoveredByRestore(input));
                    } catch (error) {
                        reportError('surfaceLedger.markProjectionRecoveredByRestore', error);
                        return null;
                    }
                }

                function upsertCopyEdgeProjectedTargetRecord(input = {}) {
                    if (typeof surfaceLedger.upsertCopyEdgeProjectedTargetRecord !== 'function') return null;
                    try {
                        return copyProjectedTargetRecord(surfaceLedger.upsertCopyEdgeProjectedTargetRecord(input));
                    } catch (error) {
                        reportError('surfaceLedger.upsertCopyEdgeProjectedTargetRecord', error, input);
                        return null;
                    }
                }

                function createMutationInput(context) {
                    const participants = context && typeof context.getParticipantNames === 'function'
                        ? context.getParticipantNames()
                        : [];
                    const hasCopyLineageParticipant = participants.indexOf('copy-lineage') >= 0;
                    const restoreMaterial = getMutationRestoreMaterialDescriptor(context);
                    return {
                        methodName: context.methodName,
                        args: typeof context.getNativeArgs === 'function' ? context.getNativeArgs() : [],
                        targetRect: context.targetRect || null,
                        targetRectAfterCopy: context.targetRectAfterCopy || context.targetRect || null,
                        sourceBitmap: context.sourceBitmap || null,
                        sourceRect: context.sourceRect || null,
                        full: context.full === true,
                        surfaceId: context.surfaceId || '',
                        replayOp: context.replayOp || context.recordOp || null,
                        recordOp: context.recordOp || context.replayOp || null,
                        participants,
                        destroyed: context.destroyed === true,
                        newGeneration: context.newGeneration === true,
                        recordCopyEdge: !hasCopyLineageParticipant,
                        targetRestoreMaterialId: restoreMaterial ? restoreMaterial.materialId : '',
                        targetRestoreRect: restoreMaterial ? restoreMaterial.rect : null,
                        targetRestoreRevisionBefore: restoreMaterial ? restoreMaterial.targetRevisionBefore : undefined,
                        projectedTargetRecords: getMutationProjectedTargetRecords(context),
                    };
                }

                function getMutationRestoreMaterialDescriptor(context) {
                    if (!context || typeof context.getMetadata !== 'function') return null;
                    return copyCopiedTargetRestoreMaterialDescriptor(context.getMetadata('copiedTargetRestoreMaterial'));
                }

                function getMutationProjectedTargetRecords(context) {
                    if (!context || typeof context.getMetadata !== 'function') return [];
                    const records = context.getMetadata('copiedTargetProjectionRecords');
                    return Array.isArray(records) ? records.map(copyProjectedTargetRecordDescriptor).filter(Boolean) : [];
                }

                function getSurfaceSnapshot(bitmap) {
                    try {
                        return surfaceLedger.getSurfaceSnapshot(bitmap);
                    } catch (error) {
                        reportError('surfaceLedger.getSurfaceSnapshot', error);
                        return null;
                    }
                }

                function getSurfaceIdentity(bitmap) {
                    try {
                        return surfaceLedger.getSurfaceIdentity(bitmap);
                    } catch (error) {
                        reportError('surfaceLedger.getSurfaceIdentity', error);
                        return null;
                    }
                }

                function ensureSurfaceRecord(bitmap, input = {}) {
                    try {
                        return surfaceLedger.ensureSurfaceRecord(bitmap, input);
                    } catch (error) {
                        reportError('surfaceLedger.ensureSurfaceRecord', error);
                        return null;
                    }
                }

                function getSurfaceById(surfaceId, options = {}) {
                    try {
                        return surfaceLedger.getSurfaceById(surfaceId, options);
                    } catch (error) {
                        reportError('surfaceLedger.getSurfaceById', error);
                        return null;
                    }
                }

                function hasSurfaceRecord(bitmap) {
                    try {
                        return surfaceLedger.hasSurfaceRecord(bitmap) === true;
                    } catch (error) {
                        reportError('surfaceLedger.hasSurfaceRecord', error);
                        return false;
                    }
                }

                function getTextRuns(bitmap) {
                    try {
                        return surfaceLedger.getTextRuns(bitmap);
                    } catch (error) {
                        reportError('surfaceLedger.getTextRuns', error);
                        return [];
                    }
                }

                function getCopyEdgesTo(bitmap) {
                    try {
                        return surfaceLedger.getCopyEdgesTo(bitmap);
                    } catch (error) {
                        reportError('surfaceLedger.getCopyEdgesTo', error);
                        return [];
                    }
                }

                function getCopyEdgeSourceReplayState(edge, options = {}) {
                    try {
                        return surfaceLedger.getCopyEdgeSourceReplayState(edge, options);
                    } catch (error) {
                        reportError('surfaceLedger.getCopyEdgeSourceReplayState', error);
                        return null;
                    }
                }

                function hasCurrentCopyEdgesTo(bitmap) {
                    return getCopyEdgesToTargetState(bitmap, (state) => isCurrentCopyEdgeState(state)).length > 0;
                }

                function getInvalidatedCopyEdgesTo(bitmap, input = {}) {
                    return getCopyEdgesToTargetState(bitmap, (state) => !!(state
                        && (state.invalidated === true || state.superseded === true)));
                }

                function getDamagedCopyEdgesTo(bitmap, input = {}) {
                    const damageRect = cloneRect(input && (input.targetRect || input.damageRect || input.rect) || null);
                    return getCopyEdgesToTargetState(bitmap, (state, edge) => {
                        if (!(state && state.damaged === true && state.targetDamaged === true)) return false;
                        return !damageRect || rectsOverlap(damageRect, edge && edge.targetRect || null);
                    });
                }

                function getProjectionState(edge) {
                    return copyProjectionState(getCopyEdgeState(edge));
                }

                function getProjectionStatesForTarget(bitmap, input = {}) {
                    const targetRect = cloneRect(input && (input.targetRect || input.rect || input.damageRect) || null);
                    return getCopyEdgesToTargetState(bitmap, (state, edge) => {
                        const bounds = edge && edge.targetRect || state && state.targetRect || null;
                        return !targetRect || rectsOverlap(targetRect, bounds);
                    }).map((edge) => getProjectionState(edge)).filter(Boolean);
                }

                function getRecoverableProjectionStatesForTarget(bitmap, input = {}) {
                    if (typeof surfaceLedger.getRecoverableProjectionStatesForTarget === 'function') {
                        try {
                            const states = surfaceLedger.getRecoverableProjectionStatesForTarget(bitmap, input);
                            return Array.isArray(states) ? states.map(copyProjectionState).filter(Boolean) : [];
                        } catch (error) {
                            reportError('surfaceLedger.getRecoverableProjectionStatesForTarget', error);
                            return [];
                        }
                    }
                    return getProjectionStatesForTarget(bitmap, input).filter((state) => state && state.recoverable === true);
                }

                function getCopyEdgesToTargetState(bitmap, predicate) {
                    if (!bitmap || typeof predicate !== 'function') return [];
                    const identity = getSurfaceIdentity(bitmap);
                    const targetSurfaceId = stringify(identity && identity.surfaceId || '');
                    if (!targetSurfaceId) return [];
                    const edges = getCopyEdgesTo(bitmap);
                    if (!Array.isArray(edges) || !edges.length) return [];
                    return edges.filter((edge) => {
                        if (!edge || stringify(edge.targetSurfaceId || '') !== targetSurfaceId) return false;
                        if (!edge.sourceSurfaceId) return false;
                        return predicate(getCopyEdgeState(edge), edge);
                    });
                }

                function getCopyEdgeState(edge) {
                    if (!edge || typeof surfaceLedger.getCopyEdgeState !== 'function') {
                        return createCopyEdgeState(edge, 'invalidated', ['missing-copy-edge-state']);
                    }
                    try {
                        return surfaceLedger.getCopyEdgeState(edge);
                    } catch (error) {
                        reportError('surfaceLedger.getCopyEdgeState', error);
                        return createCopyEdgeState(edge, 'invalidated', ['copy-edge-state-error']);
                    }
                }

                return freezeApi({
                    recordCommittedDraw,
                    ensureMutationTransaction,
                    commitMutation,
                    abortMutation,
                    recordCopyEdge,
                    markCopyEdgeRecovered,
                    markProjectionDamagedByMutation,
                    markProjectionRecoveredByRestore,
                    upsertCopyEdgeProjectedTargetRecord,
                    getSurfaceSnapshot,
                    getSurfaceIdentity,
                    ensureSurfaceRecord,
                    getSurfaceById,
                    hasSurfaceRecord,
                    getTextRuns,
                    getCopyEdgesTo,
                    getCopyEdgeSourceReplayState,
                    hasCurrentCopyEdgesTo,
                    getInvalidatedCopyEdgesTo,
                    getDamagedCopyEdgesTo,
                    getProjectionState,
                    getProjectionStatesForTarget,
                    getRecoverableProjectionStatesForTarget,
                    getCopyEdgeState,
                });
            }

            function copyProjectionState(state) {
                if (!state) return null;
                const recoverable = state.damaged === true
                    && state.targetDamaged === true
                    && state.superseded !== true
                    && state.sourceDamaged !== true
                    && state.invalidated !== true;
                const edgeId = stringify(state.edgeId || '');
                return {
                    projectionId: edgeId,
                    edgeId,
                    sourceSurfaceId: stringify(state.sourceSurfaceId || ''),
                    targetSurfaceId: stringify(state.targetSurfaceId || ''),
                    sourceRect: cloneRect(state.sourceRect),
                    targetRect: cloneRect(state.targetRect),
                    sourceRevision: normalizeOptionalRevision(state.sourceRevision),
                    targetRevision: normalizeOptionalRevision(state.targetRevision),
                    sourceGeneration: normalizeOptionalRevision(state.sourceGeneration),
                    targetGeneration: normalizeOptionalRevision(state.targetGeneration),
                    createdByMutationId: stringify(state.createdByMutationId || ''),
                    targetRestoreMaterialId: stringify(state.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(state.targetRestoreRect),
                    targetRestoreRevisionBefore: normalizeOptionalRevision(state.targetRestoreRevisionBefore),
                    sourceTextRuns: copyTextRuns(state.sourceTextRuns),
                    projectedTargetRecords: copyProjectedTargetRecords(state.projectedTargetRecords),
                    projectionStatus: stringify(state.projectionStatus || ''),
                    baseSourceRevision: normalizeOptionalRevision(state.baseSourceRevision),
                    baseTargetRevision: normalizeOptionalRevision(state.baseTargetRevision),
                    recoveredByTransactionId: stringify(state.recoveredByTransactionId || ''),
                    recoveredAtRevision: normalizeOptionalRevision(state.recoveredAtRevision),
                    recoveryReason: stringify(state.recoveryReason || ''),
                    damagedByMutationId: stringify(state.damagedByMutationId || ''),
                    damagedAtRevision: normalizeOptionalRevision(state.damagedAtRevision),
                    damageReason: stringify(state.damageReason || ''),
                    damageMethodName: stringify(state.damageMethodName || ''),
                    damageRect: cloneRect(state.damageRect),
                    damageFull: state.damageFull === true,
                    status: stringify(state.status || 'invalidated'),
                    current: state.current === true,
                    valid: state.valid !== false,
                    damaged: state.damaged === true,
                    recoverable,
                    invalidated: state.invalidated === true,
                    superseded: state.superseded === true,
                    sourceDamaged: state.sourceDamaged === true,
                    targetDamaged: state.targetDamaged === true,
                    sourceDamage: copyProjectionDamage(state.sourceDamage),
                    targetDamage: copyProjectionDamage(state.targetDamage),
                    reasons: cloneStringList(state.reasons),
                };
            }

            function copyTextRuns(runs) {
                return Array.isArray(runs) ? runs.map(copyTextRun).filter(Boolean) : [];
            }

            function copyTextRun(run) {
                if (!run || typeof run !== 'object') return null;
                return {
                    runId: stringify(run.runId || ''),
                    surfaceId: stringify(run.surfaceId || ''),
                    revision: normalizeOptionalRevision(run.revision),
                    slotKey: stringify(run.slotKey || ''),
                    text: stringify(run.text || ''),
                    visibleText: stringify(run.visibleText || ''),
                    units: cloneStringList(run.units),
                    bounds: cloneRect(run.bounds || null),
                    drawState: copyPlainObject(run.drawState || null),
                    drawRun: clonePlainValue(run.drawRun || null),
                    sourceCommitted: run.sourceCommitted === true,
                    ownershipStatus: stringify(run.ownershipStatus || ''),
                };
            }

            function copyProjectedTargetRecords(records) {
                return Array.isArray(records) ? records.map(copyProjectedTargetRecord).filter(Boolean) : [];
            }

            function copyProjectedTargetRecord(record) {
                if (!record || typeof record !== 'object') return null;
                return copyCopiedTextProjectionRecord(record);
            }

            function copyProjectionDamage(damage) {
                if (!damage || typeof damage !== 'object') return null;
                return {
                    reason: stringify(damage.reason || ''),
                    revision: normalizeOptionalRevision(damage.revision),
                    rect: cloneRect(damage.rect),
                    full: damage.full === true,
                    unknown: damage.unknown === true,
                    mutationId: stringify(damage.mutationId || ''),
                    methodName: stringify(damage.methodName || ''),
                };
            }

            function copyProjectedTargetRecordDescriptor(record) {
                if (!record || typeof record !== 'object') return null;
                const sourceSurfaceId = stringify(record.sourceSurfaceId || '');
                const targetSurfaceId = stringify(record.targetSurfaceId || '');
                const sourceRunId = stringify(record.sourceRunId || '');
                const sourceSlotKey = stringify(record.sourceSlotKey || '');
                const targetBounds = cloneRect(record.targetBounds || record.bounds || null);
                const sourceBounds = cloneRect(record.sourceBounds || null);
                if (!sourceSurfaceId || !targetSurfaceId || (!sourceRunId && !sourceSlotKey) || !targetBounds) return null;
                return copyCopiedTextProjectionRecord(record, {
                    sourceSurfaceId,
                    sourceRunId,
                    sourceSlotKey,
                    targetSurfaceId,
                    targetBounds,
                    bounds: targetBounds,
                    sourceBounds,
                });
            }

            function copyPlainObject(value) {
                return value && typeof value === 'object' && !Array.isArray(value)
                    ? clonePlainValue(value)
                    : {};
            }

            function clonePlainValue(value) {
                if (value === null || value === undefined) return null;
                if (Array.isArray(value)) return value.map(clonePlainValue);
                if (typeof value !== 'object') return value;
                const output = {};
                Object.keys(value).forEach((key) => {
                    const item = value[key];
                    if (typeof item === 'function') return;
                    output[key] = clonePlainValue(item);
                });
                return output;
            }

            function cloneStringList(value) {
                if (!Array.isArray(value)) return [];
                return value.map((item) => stringify(item)).filter(Boolean);
            }

            function normalizeOptionalRevision(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : undefined;
            }

            function rectsOverlap(left, right) {
                const a = cloneRect(left);
                const b = cloneRect(right);
                if (!a || !b) return false;
                return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createSurfaceLedgerBoundary,
            });
        },
    });
})();
