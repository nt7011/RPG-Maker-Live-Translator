// Copied target restore proof validation.
//
// A copied-target redraw is allowed to restore a pre-copy target patch only
// when the candidate still matches a current ledger copy edge and the restore
// material is the exact material captured for that edge. This prevents a later
// native paint from being overwritten by a stale translator restore.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetRestoreProof',
        requires: {
            copyEdgeState: 'runtime.bitmap.copyEdgeState',
            restoreMaterialContract: 'runtime.bitmap.copiedTargetRestoreMaterial',
        },
        factory({ copyEdgeState, restoreMaterialContract }) {
            const isCurrentCopyEdgeState = copyEdgeState.isCurrentCopyEdgeState;
            const isCopiedTargetRestoreMaterialBoundToEdge = restoreMaterialContract.isCopiedTargetRestoreMaterialBoundToEdge;

            function createCopiedTargetRestoreProofValidator(deps = {}) {
                const getCopyEdgesTo = typeof deps.getCopyEdgesTo === 'function'
                    ? deps.getCopyEdgesTo
                    : () => [];
                const getCopyEdgeState = typeof deps.getCopyEdgeState === 'function'
                    ? deps.getCopyEdgeState
                    : () => null;
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};

                function isCandidateCurrent(candidate) {
                    const edge = resolveCandidateEdge(candidate);
                    if (!edge) return false;
                    if (!isCurrentCopyEdgeState(readCopyEdgeState(edge))) return false;
                    return isCopiedTargetRestoreMaterialBoundToEdge(
                        candidate && candidate.targetRestoreMaterial || null,
                        edge
                    );
                }

                function resolveCandidateEdge(candidate) {
                    if (!candidate || !candidate.targetBitmap) return null;
                    const edgeId = stringify(candidate.edgeId || '');
                    if (!edgeId) return null;
                    const targetSurfaceId = stringify(candidate.targetSurfaceId || '');
                    return readCopyEdgesTo(candidate.targetBitmap).find((edge) => {
                        return !!(edge
                            && stringify(edge.edgeId || '') === edgeId
                            && (!targetSurfaceId || stringify(edge.targetSurfaceId || '') === targetSurfaceId));
                    }) || null;
                }

                function readCopyEdgesTo(targetBitmap) {
                    try {
                        const edges = getCopyEdgesTo(targetBitmap);
                        return Array.isArray(edges) ? edges : [];
                    } catch (error) {
                        reportError('copiedTargetRestoreProof.getCopyEdgesTo', error);
                        return [];
                    }
                }

                function readCopyEdgeState(edge) {
                    try {
                        return getCopyEdgeState(edge);
                    } catch (error) {
                        reportError('copiedTargetRestoreProof.getCopyEdgeState', error);
                        return null;
                    }
                }

                return freezeApi({
                    isCandidateCurrent,
                });
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return {
                createCopiedTargetRestoreProofValidator,
            };
        },
    });
})();
