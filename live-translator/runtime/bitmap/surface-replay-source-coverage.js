// Surface replay source coverage proof.
//
// Recorded native non-text paint can be replayed only where the source pixels
// survived until the engine copied them. This module turns the shared surface
// damage timeline into deterministic source rect pieces, dropping coverage
// whenever the ledger cannot prove the older pixels still existed.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.surfaceReplaySourceCoverage',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            surfaceDamage: 'runtime.bitmap.surfaceDamage',
        },
        factory({ rectGeometry, surfaceDamage }) {

            const cloneRect = rectGeometry.cloneRect;
            const subtractRect = rectGeometry.subtractRect;
            const collectSurfaceDamage = surfaceDamage.collectSurfaceDamage;
            const compareSurfaceDamageEvents = surfaceDamage.compareSurfaceDamageEvents;

            function collectSurvivingReplaySourcePieces(input = {}) {
                const sourceSurface = input && (input.sourceSurface || input.sourceSnapshot || input.surface) || null;
                const replayOp = input && (input.replayOp || input.op) || null;
                const sourceRect = cloneRect(input && (input.sourceRect || input.copiedSourceRect || input.rect) || null);
                const sinceRevision = nonNegativeNumber(
                    input && input.sinceRevision,
                    replayOp && replayOp.revision,
                    NaN
                );
                const untilRevision = nonNegativeNumber(
                    input && input.untilRevision,
                    input && input.edgeSourceRevision,
                    NaN
                );
                if (!sourceRect || !Number.isFinite(sinceRevision) || !Number.isFinite(untilRevision)) return [];
                if (sinceRevision > untilRevision) return [];

                let pieces = [sourceRect];
                collectSurfaceDamage(sourceSurface, {
                    sinceRevision,
                    untilRevision,
                    protectedRect: sourceRect,
                    ignoredMutationId: stringify(input && input.ignoredMutationId || replayOp && replayOp.mutationId || ''),
                })
                    .sort(compareSurfaceDamageEvents)
                    .forEach((damage) => {
                        if (!pieces.length) return;
                        if (damage.full === true || damage.unknown === true) {
                            pieces = [];
                            return;
                        }
                        const cover = cloneRect(damage.rect);
                        if (!cover) {
                            pieces = [];
                            return;
                        }
                        const next = [];
                        pieces.forEach((piece) => {
                            subtractRect(piece, cover).forEach((remaining) => next.push(remaining));
                        });
                        pieces = next;
                    });
                return pieces;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function nonNegativeNumber(...values) {
                for (let index = 0; index < values.length; index += 1) {
                    const numeric = Number(values[index]);
                    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
                }
                return NaN;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                collectSurvivingReplaySourcePieces,
            });
        },
    });
})();
