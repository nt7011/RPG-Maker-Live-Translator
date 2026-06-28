// Shared copy-edge state contract.
//
// The surface ledger produces copy-edge state, while restore/replay modules
// consume it. Keeping the state shape and "current" predicate here prevents
// each consumer from inventing its own copy-edge freshness semantics.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copyEdgeState',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            copiedTextProjection: 'runtime.bitmap.copiedTextProjection',
        },
        factory({ rectGeometry, copiedTextProjection }) {
            const cloneRect = rectGeometry.cloneRect;
            const copyCopiedTextProjectionRecord = copiedTextProjection.copyCopiedTextProjectionRecord;

            function createCopyEdgeState(edge, status, reasons = []) {
                const current = status === 'current';
                const projectionState = edge && edge.projectionState && typeof edge.projectionState === 'object'
                    ? edge.projectionState
                    : null;
                return {
                    edgeId: stringify(edge && edge.edgeId || ''),
                    sourceSurfaceId: stringify(edge && edge.sourceSurfaceId || ''),
                    targetSurfaceId: stringify(edge && edge.targetSurfaceId || ''),
                    sourceRect: cloneRect(edge && edge.sourceRect || null),
                    targetRect: cloneRect(edge && edge.targetRect || null),
                    sourceRevision: normalizeOptionalRevision(edge && edge.sourceRevision),
                    targetRevision: normalizeOptionalRevision(edge && edge.targetRevision),
                    sourceGeneration: normalizeOptionalRevision(edge && edge.sourceGeneration),
                    targetGeneration: normalizeOptionalRevision(edge && edge.targetGeneration),
                    createdByMutationId: stringify(edge && edge.createdByMutationId || ''),
                    targetRestoreMaterialId: stringify(edge && edge.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(edge && edge.targetRestoreRect || null),
                    targetRestoreRevisionBefore: normalizeOptionalRevision(edge && edge.targetRestoreRevisionBefore),
                    sourceTextRuns: copyTextRuns(edge && edge.sourceTextRuns),
                    projectedTargetRecords: copyProjectedTargetRecords(edge && edge.projectedTargetRecords),
                    projectionStatus: stringify(projectionState && projectionState.status || ''),
                    baseSourceRevision: normalizeOptionalRevision(projectionState && projectionState.baseSourceRevision),
                    baseTargetRevision: normalizeOptionalRevision(projectionState && projectionState.baseTargetRevision),
                    recoveredByTransactionId: stringify(projectionState && projectionState.recoveredByTransactionId || ''),
                    recoveredAtRevision: normalizeOptionalRevision(projectionState && projectionState.recoveredAtRevision),
                    recoveryReason: stringify(projectionState && projectionState.recoveryReason || ''),
                    damagedByMutationId: stringify(projectionState && projectionState.damagedByMutationId || ''),
                    damagedAtRevision: normalizeOptionalRevision(projectionState && projectionState.damagedAtRevision),
                    damageReason: stringify(projectionState && projectionState.damageReason || ''),
                    damageMethodName: stringify(projectionState && projectionState.damageMethodName || ''),
                    damageRect: cloneRect(projectionState && projectionState.damageRect || null),
                    damageFull: projectionState && projectionState.damageFull === true,
                    status,
                    current,
                    valid: current,
                    damaged: status === 'damaged',
                    invalidated: status === 'invalidated',
                    superseded: status === 'superseded',
                    reasons: cloneStringList(reasons),
                    sourceDamaged: false,
                    targetDamaged: false,
                    sourceDamage: null,
                    targetDamage: null,
                };
            }

            function copyProjectedTargetRecords(records) {
                return Array.isArray(records) ? records.map(copyProjectedTargetRecord).filter(Boolean) : [];
            }

            function copyProjectedTargetRecord(record) {
                if (!record || typeof record !== 'object') return null;
                return copyCopiedTextProjectionRecord(record);
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

            function isCurrentCopyEdgeState(state) {
                return !!(state
                    && state.current === true
                    && state.valid !== false
                    && state.status === 'current');
            }

            function markCopyEdgeInvalidated(state, reason) {
                if (!state) return state;
                state.status = 'invalidated';
                state.current = false;
                state.valid = false;
                state.invalidated = true;
                appendCopyEdgeStateReason(state, reason);
                return state;
            }

            function markCopyEdgeDamaged(state, role, damage) {
                if (!state || !damage) return state;
                if (!state.invalidated) state.status = 'damaged';
                state.current = false;
                state.valid = false;
                state.damaged = true;
                appendCopyEdgeStateReason(state, `${role}-${stringify(damage.reason || 'damage') || 'damage'}`);
                const copy = copySurfaceDamage(damage);
                if (role === 'source') {
                    state.sourceDamaged = true;
                    state.sourceDamage = copy;
                } else if (role === 'target') {
                    state.targetDamaged = true;
                    state.targetDamage = copy;
                }
                return state;
            }

            function appendCopyEdgeStateReason(state, reason) {
                const value = stringify(reason || '');
                if (!state || !value || state.reasons.indexOf(value) >= 0) return state;
                state.reasons.push(value);
                return state;
            }

            function copySurfaceDamage(damage) {
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

            function copyPlainObject(value) {
                return value && typeof value === 'object' && !Array.isArray(value)
                    ? clonePlainValue(value)
                    : {};
            }

            function clonePlainValue(value, seen = null) {
                if (value === null || value === undefined) return null;
                if (Array.isArray(value)) return value.map((item) => clonePlainValue(item, seen));
                if (typeof value !== 'object') return value;
                const visited = seen || (typeof WeakSet === 'function' ? new WeakSet() : null);
                if (visited) {
                    if (visited.has(value)) return '[cycle]';
                    visited.add(value);
                }
                const output = {};
                Object.keys(value).forEach((key) => {
                    const item = value[key];
                    if (typeof item === 'function') return;
                    output[key] = clonePlainValue(item, visited);
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

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopyEdgeState,
                isCurrentCopyEdgeState,
                markCopyEdgeInvalidated,
                markCopyEdgeDamaged,
            });
        },
    });
})();
