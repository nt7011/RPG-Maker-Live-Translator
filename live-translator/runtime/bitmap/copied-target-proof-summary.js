// Copied-target proof summary helpers.
//
// The compositor emits one proof per restore composition. Rendering adapters
// need a stable item/render-level summary, while the schema module owns the
// copied-target proof vocabulary shared across runtime boundaries.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetProofSummary',
        requires: {
            proofSchema: 'runtime.copiedTargetProofSchema',
        },
        factory({ proofSchema }) {

            function createCopiedTargetProofSummary(proofs, redrawn) {
                return proofSchema.summarizeCopiedTargetProofs(proofs, redrawn);
            }

            function createCopiedTargetSurfaceProof(surfaceProof, copiedTargetProof, createSurfaceProof) {
                if (!copiedTargetProof) return surfaceProof || null;
                const source = Object.assign({}, surfaceProof && typeof surfaceProof === 'object' ? surfaceProof : {}, {
                    copiedTargets: proofSchema.normalizeCopiedTargetProof(copiedTargetProof),
                });
                return typeof createSurfaceProof === 'function' ? createSurfaceProof(source) : source;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopiedTargetProofSummary,
                createCopiedTargetSurfaceProof,
            });
        },
    });
})();
