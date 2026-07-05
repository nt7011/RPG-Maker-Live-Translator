// Copied-target restore compositor.
//
// Copied text redraws restore native target pixels before drawing translator
// text. That restore is destructive for every translated copied target sharing
// the restored target state, no matter which adapter found the text. This
// module owns that transaction: group by logical restore material, collect all
// affected provider candidates, restore only candidate-owned target coverage,
// replay copied non-text, then draw the translated candidates in deterministic
// target order.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetCompositor',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            surfaceLedgerIds: 'runtime.bitmap.surfaceLedgerIds',
            restoreMaterialContract: 'runtime.bitmap.copiedTargetRestoreMaterial',
            restorePlannerModule: 'runtime.bitmap.copiedTargetRestorePlanner',
            surfaceMutationProof: 'runtime.bitmap.surfaceMutationProof',
        },
        factory({ rectGeometry, surfaceLedgerIds, restoreMaterialContract, restorePlannerModule, surfaceMutationProof }) {

            const cloneRect = rectGeometry.cloneRect;
            const rectsOverlap = rectGeometry.rectsOverlap;
            const parseCopyEdgeOrder = surfaceLedgerIds.parseCopyEdgeOrder;
            const compareOrderKeys = surfaceLedgerIds.compareOrderKeys;
            const normalizeCopiedTargetRestoreMaterial = restoreMaterialContract.normalizeCopiedTargetRestoreMaterial;
            const createCopiedTargetRestorePlanner = restorePlannerModule.createCopiedTargetRestorePlanner;
            const captureBitmapSurfaceSample = surfaceMutationProof.captureBitmapSurfaceSample;
            const compareSurfaceSamples = surfaceMutationProof.compareSurfaceSamples;
            const cloneSurfaceMutationProof = surfaceMutationProof.cloneSurfaceMutationProof;

            function createCopiedTargetCompositor(deps = {}) {
                const copiedTargetProviders = new Map();
                const restoreProof = deps.restoreProof && typeof deps.restoreProof.isCandidateCurrent === 'function'
                    ? deps.restoreProof
                    : null;
                const copiedSurfaceReplay = deps.copiedSurfaceReplay
                    && typeof deps.copiedSurfaceReplay.collectReplayPlanForRestore === 'function'
                    ? deps.copiedSurfaceReplay
                    : null;
                if (!restoreProof) throw new Error('[LiveTranslator] copied target compositor requires restoreProof.isCandidateCurrent.');
                if (!copiedSurfaceReplay) throw new Error('[LiveTranslator] copied target compositor requires copiedSurfaceReplay.collectReplayPlanForRestore.');
                const restoreMaterial = requireFunction(deps.restoreMaterial, 'restoreMaterial');
                const replayBitmapItems = requireFunction(deps.replayBitmapItems, 'replayBitmapItems');
                const markBitmapPixelsDirty = requireFunction(deps.markBitmapPixelsDirty, 'markBitmapPixelsDirty');
                const markCopyEdgeRecovered = typeof deps.markCopyEdgeRecovered === 'function'
                    ? deps.markCopyEdgeRecovered
                    : () => null;
                const recordCopiedTargetCompositionProof = typeof deps.recordCopiedTargetCompositionProof === 'function'
                    ? deps.recordCopiedTargetCompositionProof
                    : () => {};
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};
                const warn = typeof deps.warn === 'function'
                    ? deps.warn
                    : () => {};
                const copiedTargetRestorePlanner = createCopiedTargetRestorePlanner({
                    copiedSurfaceReplay,
                    reportError(operation, error, details) {
                        reportError(operation, error, details);
                    },
                });

                function registerCopiedTargetProvider(provider) {
                    const normalized = normalizeCopiedTargetProvider(provider);
                    if (!normalized) {
                        warn('[BitmapServices] Ignoring invalid copied target provider.');
                        return () => {};
                    }
                    copiedTargetProviders.set(normalized.token, normalized);
                    return () => {
                        if (copiedTargetProviders.get(normalized.token) === normalized) {
                            copiedTargetProviders.delete(normalized.token);
                        }
                    };
                }

                function redrawCopiedTargetRestoreComposition(input = {}) {
                    const seedCandidates = collectCopiedTargetSeedCandidates(input);
                    if (!seedCandidates.length) return 0;
                    let redrawn = 0;
                    createCopiedTargetRestoreCompositions(seedCandidates, input).forEach((composition) => {
                        redrawn += redrawCopiedTargetRestoreCompositionGroup(composition, input);
                    });
                    return redrawn;
                }

                function collectCopiedTargetRestoreSeeds(input = {}) {
                    const targetBitmap = input && input.targetBitmap || null;
                    const restoreRect = cloneRect(input && (input.restoreRect || input.targetRect || input.rect) || null);
                    if (!targetBitmap || !restoreRect) return [];
                    const targetSurfaceId = stringify(input && input.targetSurfaceId || '');
                    const providerToken = stringify(input && input.providerToken || '');
                    const reason = stringify(input && input.reason || 'copied-target-pre-mutation');
                    const seeds = [];
                    copiedTargetProviders.forEach((provider) => {
                        if (providerToken && provider.token !== providerToken) return;
                        collectProviderRestoreSeeds(provider, {
                            targetBitmap,
                            targetSurfaceId,
                            restoreRect,
                            reason,
                            mutationMethodName: stringify(input && input.mutationMethodName || ''),
                        }).forEach((candidate) => {
                            seeds.push(candidate);
                        });
                    });
                    return dedupeCopiedTargetCandidates(seeds).sort(compareCopiedTargetRestoreCandidates);
                }

                function collectProviderRestoreSeeds(provider, request) {
                    let candidates = [];
                    try {
                        candidates = provider.collectCopiedTargetCandidates(request);
                    } catch (error) {
                        reportError('copiedTargetProvider.collectSeeds', error, { provider: provider.token });
                        candidates = [];
                    }
                    if (!Array.isArray(candidates) || !candidates.length) return [];
                    const output = [];
                    candidates.forEach((candidate) => {
                        const normalized = normalizeCopiedTargetCandidate(candidate, provider.token, {
                            seed: true,
                            providerPriority: provider.priority,
                        });
                        if (!isUsablePreMutationRestoreSeed(normalized, request)) return;
                        normalized.restoreTransactionProof = createPreMutationRestoreProof(normalized, request);
                        output.push(normalized);
                    });
                    return output;
                }

                function collectCopiedTargetSeedCandidates(input = {}) {
                    const source = input && typeof input === 'object' ? input : {};
                    const rawSeeds = Array.isArray(source.seedCandidates)
                        ? source.seedCandidates
                        : (Array.isArray(source.candidates)
                            ? source.candidates
                            : [source.seedCandidate || source]);
                    const seeds = [];
                    rawSeeds.forEach((candidate) => {
                        const normalized = normalizeCopiedTargetCandidate(candidate, source.providerToken, {
                            seed: true,
                            options: source.options || null,
                        });
                        if (isUsableCopiedTargetSeedCandidate(normalized)) seeds.push(normalized);
                    });
                    return seeds;
                }

                function createCopiedTargetRestoreCompositions(seedCandidates, input = {}) {
                    const compositions = [];
                    seedCandidates.forEach((seedCandidate) => {
                        const compositionKey = createCopiedTargetRestoreCompositionKey(seedCandidate);
                        if (!compositionKey) return;
                        let composition = compositions.find((candidate) => {
                            return candidate.targetBitmap === seedCandidate.targetBitmap
                                && candidate.compositionKey === compositionKey;
                        });
                        if (!composition) {
                            const targetRestoreMaterial = normalizeCopiedTargetRestoreMaterial(
                                seedCandidate.targetRestoreMaterial,
                                seedCandidate.targetBitmap
                            );
                            if (!targetRestoreMaterial) return;
                            composition = {
                                seedCandidate,
                                compositionKey,
                                targetBitmap: seedCandidate.targetBitmap,
                                targetSurfaceId: seedCandidate.targetSurfaceId,
                                restoreMaterial: targetRestoreMaterial,
                                restoreRect: cloneRect(targetRestoreMaterial.rect),
                                candidates: [],
                            };
                            compositions.push(composition);
                        }
                        composition.candidates.push(seedCandidate);
                    });
                    compositions.forEach((composition) => {
                        appendCopiedTargetRestoreProviderCandidates(composition, input);
                        const candidates = dedupeCopiedTargetCandidates(composition.candidates)
                            .filter((candidate) => isCopiedTargetCandidateAffectedByRestore(candidate, composition))
                            .sort(compareCopiedTargetRestoreCandidates);
                        applyCopiedTargetRestorePlan(composition, copiedTargetRestorePlanner.createRestorePlan({
                            compositionKey: composition.compositionKey,
                            targetBitmap: composition.targetBitmap,
                            targetSurfaceId: composition.targetSurfaceId,
                            restoreMaterial: composition.restoreMaterial,
                            restoreRect: composition.restoreRect,
                            candidates,
                            seedCandidate: composition.seedCandidate,
                            skippedCandidates: composition.skippedCandidates,
                            reason: stringify(input && input.reason || 'copied-target-restore-composition'),
                        }));
                    });
                    return compositions.filter((composition) => {
                        return composition.plan
                            && Array.isArray(composition.candidates)
                            && composition.candidates.length > 0
                            && Array.isArray(composition.restoreCoverageRects)
                            && composition.restoreCoverageRects.length > 0;
                    });
                }

                function applyCopiedTargetRestorePlan(composition, plan) {
                    composition.plan = plan || null;
                    if (!plan) {
                        composition.candidates = [];
                        composition.restoreCoverageRects = [];
                        composition.surfaceReplayItems = [];
                        return;
                    }
                    composition.restoreRect = cloneRect(plan.restoreRect);
                    composition.candidates = Array.isArray(plan.candidates) ? plan.candidates : [];
                    composition.dependencySearchRects = copyRects(plan.dependencySearchRects);
                    composition.requestedMaterialRestoreCoverageRects = copyRects(plan.requestedMaterialRestoreCoverageRects);
                    composition.survivorCoverageRects = copyRects(plan.survivorCoverageRects);
                    composition.materialRestoreCoverageRects = copyRects(plan.materialRestoreCoverageRects);
                    composition.rejectedMaterialRestoreCoverageRects = copyRects(plan.rejectedMaterialRestoreCoverageRects);
                    composition.candidateCoverageRects = copyRects(plan.candidateCoverageRects);
                    composition.replayCoverageRects = copyRects(plan.replayCoverageRects);
                    composition.requiredRestoreCoverageRects = copyRects(plan.requiredRestoreCoverageRects);
                    composition.restoreCoverageRects = copyRects(plan.restoreCoverageRects);
                    composition.coverageGaps = copyCoverageGaps(plan.coverageGaps);
                    composition.surfaceReplayPlan = copySurfaceReplayPlan(plan.surfaceReplayPlan);
                    composition.surfaceReplayItems = Array.isArray(plan.surfaceReplayItems) ? plan.surfaceReplayItems : [];
                    composition.executionSteps = copyExecutionSteps(plan.executionSteps);
                    composition.plannerIntel = copyPlannerIntel(plan.intel);
                }

                function appendCopiedTargetRestoreProviderCandidates(composition, input = {}) {
                    if (!composition || !composition.targetBitmap || !composition.restoreRect) return;
                    const request = {
                        targetBitmap: composition.targetBitmap,
                        targetSurfaceId: composition.targetSurfaceId,
                        restoreRect: cloneRect(composition.restoreRect),
                        compositionKey: composition.compositionKey,
                        edgeId: stringify(composition.seedCandidate && composition.seedCandidate.edgeId || ''),
                        targetRestoreMaterialId: stringify(composition.restoreMaterial && composition.restoreMaterial.materialId || ''),
                        targetRestoreRevisionBefore: nonNegativeNumber(
                            composition.restoreMaterial && composition.restoreMaterial.targetRevisionBefore,
                            0
                        ),
                        skippedCandidates: [],
                        seedCandidate: composition.seedCandidate,
                        reason: stringify(input && input.reason || 'copied-target-restore-composition'),
                    };
                    copiedTargetProviders.forEach((provider) => {
                        let candidates = [];
                        try {
                            candidates = provider.collectCopiedTargetCandidates(request);
                        } catch (error) {
                            reportError('copiedTargetProvider.collect', error, { provider: provider.token });
                            candidates = [];
                        }
                        if (!Array.isArray(candidates) || !candidates.length) return;
                        candidates.forEach((candidate) => {
                            const normalized = normalizeCopiedTargetCandidate(candidate, provider.token, {
                                providerPriority: provider.priority,
                            });
                            if (normalized) composition.candidates.push(normalized);
                        });
                    });
                    composition.skippedCandidates = Array.isArray(request.skippedCandidates)
                        ? request.skippedCandidates.map(copySkippedCandidate).filter(Boolean)
                        : [];
                }

                function redrawCopiedTargetRestoreCompositionGroup(composition, input = {}) {
                    if (!composition || !composition.targetBitmap || !composition.restoreMaterial) return 0;
                    const beforeRestoreSample = captureCompositionSurfaceSample(composition, composition.restoreRect);
                    if (!restoreCompositionMaterial(
                        composition.targetBitmap,
                        composition.restoreMaterial,
                        composition.restoreCoverageRects
                    )) return 0;
                    const afterRestoreSample = captureCompositionSurfaceSample(composition, composition.restoreRect);
                    const reason = stringify(input && input.reason || 'copied-target-restore-composition');
                    replayCopiedSurfaceLayer(composition, reason);
                    const afterReplaySample = captureCompositionSurfaceSample(composition, composition.restoreRect);
                    let redrawn = 0;
                    const candidateProofs = [];
                    composition.candidates.forEach((candidate) => {
                        const provider = copiedTargetProviders.get(candidate.providerToken);
                        if (!provider) return;
                        const beforeDrawSample = captureCompositionSurfaceSample(composition, candidate.targetBounds);
                        try {
                            const accepted = provider.drawCopiedTargetCandidate(candidate, {
                                reason,
                                restoreRect: cloneRect(composition.restoreRect),
                                restoreCoverageRects: copyRects(composition.restoreCoverageRects),
                                seedCandidate: composition.seedCandidate,
                            });
                            const afterDrawSample = captureCompositionSurfaceSample(composition, candidate.targetBounds);
                            let recovered = false;
                            if (accepted === true) {
                                redrawn += 1;
                                recovered = !!markRecoveredCopyEdge(candidate, composition, reason);
                            }
                            candidateProofs.push(createCandidateDrawProof(
                                candidate,
                                accepted === true,
                                recovered,
                                beforeDrawSample,
                                afterDrawSample,
                                ''
                            ));
                        } catch (error) {
                            const afterErrorSample = captureCompositionSurfaceSample(composition, candidate.targetBounds);
                            candidateProofs.push(createCandidateDrawProof(
                                candidate,
                                false,
                                false,
                                beforeDrawSample,
                                afterErrorSample,
                                error && error.message ? error.message : error
                            ));
                            reportError('copiedTargetProvider.draw', error, { provider: provider.token });
                        }
                    });
                    const afterDrawSample = captureCompositionSurfaceSample(composition, composition.restoreRect);
                    const dirtyResult = markCompositionDirty(composition.targetBitmap, {
                        source: 'bitmap-services-copied-target-compositor',
                        reason: redrawn > 0 ? reason : 'copied-target-restore-material',
                    });
                    const afterDirtySample = captureCompositionSurfaceSample(composition, composition.restoreRect);
                    finalizeCandidateDirtyProofs(composition, candidateProofs);
                    recordCompositionProof(composition, {
                        reason,
                        redrawn,
                        dirtyResult,
                        surfaceProof: createCompositionSurfaceProof({
                            beforeRestoreSample,
                            afterRestoreSample,
                            afterReplaySample,
                            afterDrawSample,
                            afterDirtySample,
                            candidateProofs,
                        }),
                        proofSink: input && input.proofSink,
                        compositionProofs: input && input.compositionProofs,
                        proofs: input && input.proofs,
                    });
                    return redrawn;
                }

                function recordCompositionProof(composition, input = {}) {
                    try {
                        const proof = createCopiedTargetCompositionProof(composition, input);
                        const sinks = [
                            input && input.proofSink,
                            input && input.compositionProofs,
                            input && input.proofs,
                        ];
                        sinks.forEach((sink) => {
                            if (Array.isArray(sink)) sink.push(proof);
                        });
                        recordCopiedTargetCompositionProof(proof);
                    } catch (error) {
                        reportError('copiedTargetCompositor.recordProof', error);
                    }
                }

                function createCopiedTargetCompositionProof(composition, input = {}) {
                    const restoreMaterial = composition && composition.restoreMaterial || {};
                    return {
                        kind: 'copied-target-restore-composition',
                        reason: stringify(input && input.reason || ''),
                        compositionKey: stringify(composition && composition.compositionKey || ''),
                        required: true,
                        planned: true,
                        targetSurfaceId: stringify(composition && composition.targetSurfaceId || ''),
                        restoreMaterialId: stringify(restoreMaterial.materialId || ''),
                        targetRestoreRevisionBefore: nonNegativeNumber(restoreMaterial.targetRevisionBefore, 0),
                        restoreRect: cloneRect(composition && composition.restoreRect || null),
                        dependencySearchRects: copyRects(composition && composition.dependencySearchRects),
                        requestedMaterialRestoreCoverageRects: copyRects(composition && composition.requestedMaterialRestoreCoverageRects),
                        survivorCoverageRects: copyRects(composition && composition.survivorCoverageRects),
                        materialRestoreCoverageRects: copyRects(composition && composition.materialRestoreCoverageRects),
                        rejectedMaterialRestoreCoverageRects: copyRects(composition && composition.rejectedMaterialRestoreCoverageRects),
                        rejectedMaterialRestoreCoverageCount: Array.isArray(composition && composition.rejectedMaterialRestoreCoverageRects)
                            ? composition.rejectedMaterialRestoreCoverageRects.length
                            : 0,
                        materialRestoreCoverageCount: Array.isArray(composition && composition.materialRestoreCoverageRects)
                            ? composition.materialRestoreCoverageRects.length
                            : 0,
                        candidateCoverageRects: copyRects(composition && composition.candidateCoverageRects),
                        replayCoverageRects: copyRects(composition && composition.replayCoverageRects),
                        requiredRestoreCoverageRects: copyRects(composition && composition.requiredRestoreCoverageRects),
                        requiredRestoreCoverageCount: Array.isArray(composition && composition.requiredRestoreCoverageRects)
                            ? composition.requiredRestoreCoverageRects.length
                            : 0,
                        restoreCoverageRects: copyRects(composition && composition.restoreCoverageRects),
                        restoreCoverageCount: Array.isArray(composition && composition.restoreCoverageRects)
                            ? composition.restoreCoverageRects.length
                            : 0,
                        coverageGaps: copyCoverageGaps(composition && composition.coverageGaps),
                        coverageGapCount: Array.isArray(composition && composition.coverageGaps)
                            ? composition.coverageGaps.length
                            : 0,
                        surfaceReplayPlan: copySurfaceReplayPlan(composition && composition.surfaceReplayPlan),
                        executionSteps: copyExecutionSteps(composition && composition.executionSteps),
                        plannerIntel: copyPlannerIntel(composition && composition.plannerIntel),
                        candidateCount: Array.isArray(composition && composition.candidates)
                            ? composition.candidates.length
                            : 0,
                        compositionCandidateCount: Array.isArray(composition && composition.candidates)
                            ? composition.candidates.length
                            : 0,
                        materialized: Array.isArray(composition && composition.candidates)
                            ? composition.candidates.length
                            : 0,
                        redrawn: nonNegativeNumber(input && input.redrawn, 0),
                        surfaceProof: copyCompositionSurfaceProof(input && input.surfaceProof),
                        candidateProofs: copyCandidateDrawProofs(input && input.surfaceProof && input.surfaceProof.candidates),
                        dirtyResult: input && input.dirtyResult || null,
                        dirtyUpload: copyDirtyResult(input && input.dirtyResult),
                        skippedCandidates: Array.isArray(composition && composition.skippedCandidates)
                            ? composition.skippedCandidates.map(copySkippedCandidate).filter(Boolean)
                            : [],
                    };
                }

                function markRecoveredCopyEdge(candidate, composition, reason) {
                    if (!candidate || !candidate.edgeId) return null;
                    try {
                        return markCopyEdgeRecovered(candidate, {
                            targetBitmap: composition && composition.targetBitmap || candidate.targetBitmap,
                            targetSurfaceId: composition && composition.targetSurfaceId || candidate.targetSurfaceId,
                            restoreRect: cloneRect(composition && composition.restoreRect || candidate.targetBounds),
                            reason: stringify(reason || 'copied-target-restore-composition'),
                        });
                    } catch (error) {
                        reportError('copiedTargetCompositor.markRecoveredCopyEdge', error);
                        return null;
                    }
                }

                function restoreCompositionMaterial(targetBitmap, material, restoreRects) {
                    const coverageRects = Array.isArray(restoreRects) ? restoreRects : [];
                    if (!coverageRects.length) return false;
                    let restoredCount = 0;
                    try {
                        coverageRects.forEach((restoreRect) => {
                            if (restoreMaterial(targetBitmap, material, { restoreRect: cloneRect(restoreRect) }) === true) {
                                restoredCount += 1;
                            }
                        });
                        return restoredCount === coverageRects.length;
                    } catch (error) {
                        reportError('copiedTargetCompositor.restoreMaterial', error);
                        return false;
                    }
                }

                function replayCopiedSurfaceLayer(composition, reason) {
                    const items = Array.isArray(composition && composition.surfaceReplayItems)
                        ? composition.surfaceReplayItems
                        : [];
                    if (!items.length || !composition.targetBitmap) return false;
                    try {
                        return replayBitmapItems(
                            composition.targetBitmap,
                            items,
                            `${reason || 'copied-target-restore-composition'}:copied-surface-layer`
                        ) === true;
                    } catch (error) {
                        reportError('copiedTargetCompositor.replayCopiedSurfaceLayer', error);
                        return false;
                    }
                }

                function markCompositionDirty(targetBitmap, input) {
                    try {
                        return markBitmapPixelsDirty(targetBitmap, input);
                    } catch (error) {
                        reportError('copiedTargetCompositor.markDirty', error);
                        return null;
                    }
                }

                function captureCompositionSurfaceSample(composition, area) {
                    const bitmap = composition && composition.targetBitmap || null;
                    try {
                        return captureBitmapSurfaceSample(bitmap, area);
                    } catch (error) {
                        reportError('copiedTargetCompositor.surfaceSample', error);
                        return null;
                    }
                }

                function createCompositionSurfaceProof(input = {}) {
                    const candidateProofs = Array.isArray(input.candidateProofs)
                        ? input.candidateProofs
                        : [];
                    return {
                        restore: compareSamples(input.beforeRestoreSample, input.afterRestoreSample),
                        replay: compareSamples(input.afterRestoreSample, input.afterReplaySample),
                        draw: compareSamples(input.afterReplaySample, input.afterDrawSample),
                        dirty: compareSamples(input.afterDrawSample, input.afterDirtySample),
                        beforeRestoreSample: copySurfaceSample(input.beforeRestoreSample),
                        afterRestoreSample: copySurfaceSample(input.afterRestoreSample),
                        afterReplaySample: copySurfaceSample(input.afterReplaySample),
                        afterDrawSample: copySurfaceSample(input.afterDrawSample),
                        afterDirtySample: copySurfaceSample(input.afterDirtySample),
                        candidates: candidateProofs.map(copyCandidateDrawProof).filter(Boolean),
                        summary: summarizeCandidateSurfaceProofs(candidateProofs),
                    };
                }

                function createCandidateDrawProof(candidate, accepted, recovered, beforeDrawSample, afterDrawSample, error) {
                    return {
                        providerToken: stringify(candidate && candidate.providerToken || ''),
                        entryId: stringify(candidate && candidate.entryId || ''),
                        renderedText: stringify(candidate && candidate.renderedText || ''),
                        displayText: stringify(candidate && candidate.displayText || ''),
                        targetSurfaceId: stringify(candidate && candidate.targetSurfaceId || ''),
                        sourceSurfaceId: stringify(candidate && candidate.sourceSurfaceId || ''),
                        sourceRunId: stringify(candidate && candidate.sourceRunId || ''),
                        sourceSlotKey: stringify(candidate && candidate.sourceSlotKey || ''),
                        edgeId: stringify(candidate && candidate.edgeId || ''),
                        targetBounds: cloneRect(candidate && candidate.targetBounds || null),
                        accepted: accepted === true,
                        recovered: recovered === true,
                        draw: compareSamples(beforeDrawSample, afterDrawSample),
                        beforeDrawSample: copySurfaceSample(beforeDrawSample),
                        afterDrawSample: copySurfaceSample(afterDrawSample),
                        afterDirtySample: null,
                        dirty: null,
                        error: stringify(error || ''),
                    };
                }

                function finalizeCandidateDirtyProofs(composition, candidateProofs) {
                    (Array.isArray(candidateProofs) ? candidateProofs : []).forEach((proof) => {
                        if (!proof || !proof.targetBounds) return;
                        const afterDirtySample = captureCompositionSurfaceSample(composition, proof.targetBounds);
                        proof.afterDirtySample = copySurfaceSample(afterDirtySample);
                        proof.dirty = compareSamples(proof.afterDrawSample, afterDirtySample);
                    });
                }

                function compareSamples(before, after) {
                    try {
                        return cloneSurfaceMutationProof(compareSurfaceSamples(before, after));
                    } catch (error) {
                        reportError('copiedTargetCompositor.compareSamples', error);
                        return null;
                    }
                }

                function normalizeCopiedTargetProvider(provider) {
                    if (!provider || typeof provider !== 'object') return null;
                    const token = stringify(provider.token || provider.providerToken || '');
                    if (!token) return null;
                    if (typeof provider.collectCopiedTargetCandidates !== 'function') return null;
                    if (typeof provider.drawCopiedTargetCandidate !== 'function') return null;
                    return freezeApi({
                        token,
                        collectCopiedTargetCandidates(input) {
                            return provider.collectCopiedTargetCandidates(input);
                        },
                        drawCopiedTargetCandidate(candidate, context) {
                            return provider.drawCopiedTargetCandidate(candidate, context);
                        },
                        priority: nonNegativeNumber(provider.priority, 0),
                    });
                }

                function normalizeCopiedTargetCandidate(candidate, fallbackProviderToken = '', defaults = {}) {
                    if (!candidate || typeof candidate !== 'object') return null;
                    const target = candidate.target && typeof candidate.target === 'object' ? candidate.target : candidate;
                    const providerToken = stringify(candidate.providerToken || fallbackProviderToken || '');
                    if (!providerToken) return null;
                    const targetBitmap = candidate.targetBitmap || target.targetBitmap || null;
                    if (!targetBitmap) return null;
                    const targetRestoreMaterial = normalizeCopiedTargetRestoreMaterial(
                        candidate.targetRestoreMaterial || target.targetRestoreMaterial || null,
                        targetBitmap
                    );
                    const targetBounds = cloneRect(candidate.targetBounds || candidate.bounds || target.targetBounds || target.bounds || null);
                    const restoreCoverageRects = normalizeCandidateRestoreCoverageRects(candidate, target);
                    const materialRestoreCoverageRects = normalizeCandidateMaterialRestoreCoverageRects(
                        candidate,
                        target
                    );
                    const renderedText = stringify(
                        candidate.renderedText !== undefined
                            ? candidate.renderedText
                            : (candidate.text !== undefined ? candidate.text : candidate.translationDrawn)
                    );
                    const entry = candidate.entry || null;
                    return {
                        providerToken,
                        entryId: stringify(candidate.entryId || candidate.itemId || candidate.recordId || entry && (entry.recordId || entry.itemId || entry.id || entry.key) || ''),
                        entry,
                        target,
                        renderedText,
                        displayText: stringify(candidate.displayText || renderedText || ''),
                        displayTextSource: stringify(candidate.displayTextSource || ''),
                        targetBitmap,
                        targetSurfaceId: stringify(candidate.targetSurfaceId || target.targetSurfaceId || targetRestoreMaterial && targetRestoreMaterial.targetSurfaceId || ''),
                        targetBounds,
                        targetRestoreMaterial,
                        restoreCoverageRects,
                        materialRestoreCoverageRects,
                        edgeId: stringify(candidate.edgeId || target.edgeId || ''),
                        sourceSurfaceId: stringify(candidate.sourceSurfaceId || target.sourceSurfaceId || ''),
                        sourceRunId: stringify(candidate.sourceRunId || target.sourceRunId || ''),
                        sourceSlotKey: stringify(candidate.sourceSlotKey || target.sourceSlotKey || ''),
                        targetRevision: nonNegativeNumber(candidate.targetRevision !== undefined ? candidate.targetRevision : target.targetRevision, 0),
                        targetRestoreRevisionBefore: nonNegativeNumber(
                            candidate.targetRestoreRevisionBefore !== undefined
                                ? candidate.targetRestoreRevisionBefore
                                : targetRestoreMaterial && targetRestoreMaterial.targetRevisionBefore,
                            0
                        ),
                        sourceDrawOrder: nonNegativeNumber(candidate.sourceDrawOrder !== undefined ? candidate.sourceDrawOrder : candidate.drawOrder, 0),
                        targetOrderKey: nonNegativeNumber(candidate.targetOrderKey, Number.NaN),
                        providerPriority: nonNegativeNumber(
                            candidate.providerPriority !== undefined
                                ? candidate.providerPriority
                                : defaults.providerPriority,
                            0
                        ),
                        seed: candidate.seed === true || defaults.seed === true,
                        restoreTransactionProof: normalizeRestoreTransactionProof(candidate.restoreTransactionProof),
                        stale: candidate.stale === true,
                        current: candidate.current === false ? false : true,
                        options: candidate.options || defaults.options || null,
                    };
                }

                function normalizeCandidateRestoreCoverageRects(candidate, target) {
                    const rects = [];
                    appendCandidateRestoreCoverageRects(rects, candidate);
                    appendCandidateRestoreCoverageRects(rects, target);
                    return copyRects(rects.length ? rects : []);
                }

                function appendCandidateRestoreCoverageRects(output, source) {
                    if (!Array.isArray(output) || !source || typeof source !== 'object') return;
                    if (source.restoreCoverageRect) output.push(source.restoreCoverageRect);
                    if (Array.isArray(source.restoreCoverageRects)) {
                        source.restoreCoverageRects.forEach((rect) => output.push(rect));
                    }
                }

                function normalizeCandidateMaterialRestoreCoverageRects(candidate, target) {
                    const rects = [];
                    appendCandidateMaterialRestoreCoverageRects(rects, candidate);
                    appendCandidateMaterialRestoreCoverageRects(rects, target);
                    return copyRects(rects.length ? rects : []);
                }

                function appendCandidateMaterialRestoreCoverageRects(output, source) {
                    if (!Array.isArray(output) || !source || typeof source !== 'object') return;
                    if (source.materialRestoreCoverageRect) output.push(source.materialRestoreCoverageRect);
                    if (Array.isArray(source.materialRestoreCoverageRects)) {
                        source.materialRestoreCoverageRects.forEach((rect) => output.push(rect));
                    }
                }

                function isUsableCopiedTargetSeedCandidate(candidate) {
                    return !!(candidate
                        && candidate.providerToken
                        && candidate.targetBitmap
                        && candidate.targetRestoreMaterial
                        && hasUsableCandidateProof(candidate)
                        && candidate.targetBounds
                        && candidate.renderedText);
                }

                function isCopiedTargetCandidateAffectedByRestore(candidate, composition) {
                    if (!candidate || !composition) return false;
                    if (!candidate.renderedText) return false;
                    if (candidate.current === false || candidate.stale === true) return false;
                    if (isCopiedTargetEntryStale(candidate.entry)) return false;
                    if (candidate.targetBitmap !== composition.targetBitmap) return false;
                    if (composition.targetSurfaceId && candidate.targetSurfaceId && candidate.targetSurfaceId !== composition.targetSurfaceId) return false;
                    if (!isSameCopiedTargetRestoreComposition(composition.seedCandidate, candidate)) return false;
                    if (!candidate.targetBounds || !rectsOverlap(composition.restoreRect, candidate.targetBounds)) return false;
                    if (!hasUsableCandidateProof(candidate)) return false;
                    return true;
                }

                function hasUsableCandidateProof(candidate) {
                    return hasPreMutationRestoreProof(candidate)
                        || isCandidateCurrent(candidate);
                }

                function hasPreMutationRestoreProof(candidate) {
                    const proof = candidate && candidate.restoreTransactionProof;
                    if (!(candidate && candidate.seed === true && proof && proof.kind === 'copied-target-pre-mutation')) return false;
                    if (proof.edgeId && candidate.edgeId && proof.edgeId !== candidate.edgeId) return false;
                    if (proof.targetSurfaceId && candidate.targetSurfaceId && proof.targetSurfaceId !== candidate.targetSurfaceId) return false;
                    const materialId = stringify(candidate.targetRestoreMaterial && candidate.targetRestoreMaterial.materialId || '');
                    if (proof.restoreMaterialId && materialId && proof.restoreMaterialId !== materialId) return false;
                    return true;
                }

                function isUsablePreMutationRestoreSeed(candidate, request) {
                    if (!candidate || !candidate.targetBitmap || !candidate.targetRestoreMaterial) return false;
                    if (candidate.targetBitmap !== request.targetBitmap) return false;
                    if (request.targetSurfaceId && candidate.targetSurfaceId && candidate.targetSurfaceId !== request.targetSurfaceId) return false;
                    if (!candidate.targetBounds || !rectsOverlap(request.restoreRect, candidate.targetBounds)) return false;
                    return isCandidateCurrent(candidate);
                }

                function createPreMutationRestoreProof(candidate, request) {
                    return {
                        kind: 'copied-target-pre-mutation',
                        edgeId: stringify(candidate && candidate.edgeId || ''),
                        targetSurfaceId: stringify(candidate && candidate.targetSurfaceId || ''),
                        targetRevision: nonNegativeNumber(candidate && candidate.targetRevision, 0),
                        restoreMaterialId: stringify(candidate && candidate.targetRestoreMaterial && candidate.targetRestoreMaterial.materialId || ''),
                        mutationMethodName: stringify(request && request.mutationMethodName || ''),
                        mutationRect: cloneRect(request && request.restoreRect || null),
                    };
                }

                function isCandidateCurrent(candidate) {
                    try {
                        return restoreProof.isCandidateCurrent(candidate) === true;
                    } catch (error) {
                        reportError('copiedTargetCompositor.restoreProof', error);
                        return false;
                    }
                }

                function isSameCopiedTargetRestoreComposition(left, right) {
                    if (!left || !right) return false;
                    if (left.targetBitmap !== right.targetBitmap) return false;
                    const leftKey = createCopiedTargetRestoreCompositionKey(left);
                    return !!(leftKey && leftKey === createCopiedTargetRestoreCompositionKey(right));
                }

                return freezeApi({
                    registerCopiedTargetProvider,
                    collectCopiedTargetRestoreSeeds,
                    redrawCopiedTargetRestoreComposition,
                });
            }

            function isCopiedTargetEntryStale(entry) {
                if (!entry || typeof entry !== 'object') return false;
                if (entry.stale === true || entry.backgrounded === true && entry.status === 'stale') return true;
                const lifecycleState = stringify(entry.lifecycleState || '');
                if (lifecycleState === 'archived' || lifecycleState === 'retired') return true;
                const status = stringify(entry.status || '');
                return status === 'stale' || status === 'retired';
            }

            function dedupeCopiedTargetCandidates(candidates) {
                const result = [];
                const seen = new Set();
                (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
                    if (!candidate) return;
                    const key = createCopiedTargetCandidateKey(candidate);
                    if (seen.has(key)) return;
                    seen.add(key);
                    result.push(candidate);
                });
                return result;
            }

            function createCopiedTargetCandidateKey(candidate) {
                const target = candidate && candidate.target && typeof candidate.target === 'object'
                    ? candidate.target
                    : candidate;
                const sourceSurfaceId = stringify(candidate && candidate.sourceSurfaceId || target && target.sourceSurfaceId || '');
                const sourceRunId = stringify(candidate && candidate.sourceRunId || target && target.sourceRunId || '');
                const sourceSlotKey = stringify(candidate && candidate.sourceSlotKey || target && target.sourceSlotKey || '');
                const edgeId = stringify(candidate && candidate.edgeId || target && target.edgeId || '');
                const targetSurfaceId = stringify(candidate && candidate.targetSurfaceId || target && target.targetSurfaceId || '');
                const targetBoundsKey = rectKey(candidate && candidate.targetBounds || target && (target.targetBounds || target.bounds));
                if ((sourceRunId || sourceSlotKey) && (edgeId || targetSurfaceId || targetBoundsKey)) {
                    return [
                        stringify(candidate && candidate.providerToken || ''),
                        sourceSurfaceId,
                        sourceRunId,
                        sourceSlotKey,
                        edgeId,
                        targetSurfaceId,
                        targetBoundsKey,
                    ].join('|');
                }
                return [
                    stringify(candidate && candidate.providerToken || ''),
                    stringify(candidate && candidate.entryId || ''),
                    '',
                    '',
                    '',
                ].join('|');
            }

            function createCopiedTargetRestoreCompositionKey(candidate) {
                if (!candidate || !candidate.targetBitmap) return '';
                const material = normalizeCopiedTargetRestoreMaterial(
                    candidate.targetRestoreMaterial || null,
                    candidate.targetBitmap
                );
                if (!material) return '';
                const targetSurfaceId = stringify(candidate.targetSurfaceId || material.targetSurfaceId || '');
                const edgeId = stringify(candidate.edgeId || '');
                const materialId = stringify(material.materialId || '');
                const restoreRevision = nonNegativeNumber(
                    candidate.targetRestoreRevisionBefore !== undefined
                        ? candidate.targetRestoreRevisionBefore
                        : material.targetRevisionBefore,
                    0
                );
                return [
                    targetSurfaceId,
                    edgeId,
                    materialId,
                    stringify(restoreRevision),
                    rectKey(material.rect),
                ].join('|');
            }

            function rectKey(rect) {
                const value = cloneRect(rect);
                return value ? `${value.x1},${value.y1},${value.x2},${value.y2}` : '';
            }

            function copyRects(rects) {
                return (Array.isArray(rects) ? rects : [])
                    .map((rect) => cloneRect(rect))
                    .filter(Boolean);
            }

            function copyCoverageGaps(gaps) {
                return (Array.isArray(gaps) ? gaps : []).map((gap) => {
                    if (!gap || typeof gap !== 'object') return null;
                    return {
                        role: stringify(gap.role || ''),
                        rect: cloneRect(gap.rect || null),
                        reason: stringify(gap.reason || ''),
                    };
                }).filter(Boolean);
            }

            function copySurfaceReplayPlan(plan) {
                if (!plan || typeof plan !== 'object') return null;
                return {
                    itemCount: nonNegativeNumber(plan.itemCount, 0),
                    coverageRects: copyRects(plan.coverageRects),
                    coverageRectCount: nonNegativeNumber(plan.coverageRectCount, 0),
                    rejectedOps: copySurfaceReplayRejectedOps(plan.rejectedOps),
                    rejectedOpCount: nonNegativeNumber(plan.rejectedOpCount, 0),
                    searchProofs: copySurfaceReplaySearchProofs(plan.searchProofs),
                };
            }

            function copySurfaceReplayRejectedOps(items) {
                return (Array.isArray(items) ? items : []).map((item) => {
                    if (!item || typeof item !== 'object') return null;
                    return {
                        reason: stringify(item.reason || item.rejectedReason || ''),
                        edgeId: stringify(item.edgeId || ''),
                        replayOpId: stringify(item.replayOpId || ''),
                        methodName: stringify(item.methodName || ''),
                        rect: cloneRect(item.rect || null),
                    };
                }).filter(Boolean);
            }

            function copySurfaceReplaySearchProofs(items) {
                return (Array.isArray(items) ? items : []).map((item) => {
                    if (!item || typeof item !== 'object') return null;
                    return {
                        dependencySearchRect: cloneRect(item.dependencySearchRect || null),
                        itemCount: nonNegativeNumber(item.itemCount, 0),
                        coverageRectCount: nonNegativeNumber(item.coverageRectCount, 0),
                        rejectedOpCount: nonNegativeNumber(item.rejectedOpCount, 0),
                    };
                }).filter(Boolean);
            }

            function copyExecutionSteps(steps) {
                const source = steps && typeof steps === 'object' ? steps : {};
                return {
                    restoreMaterial: source.restoreMaterial === true,
                    replayCopiedSurfaceLayer: source.replayCopiedSurfaceLayer === true,
                    drawCopiedTargets: source.drawCopiedTargets === true,
                    markDirty: source.markDirty === true,
                };
            }

            function copyPlannerIntel(intel) {
                if (!intel || typeof intel !== 'object') return null;
                return {
                    dependencySearchCount: nonNegativeNumber(intel.dependencySearchCount, 0),
                    requestedMaterialRestoreCoverageCount: nonNegativeNumber(intel.requestedMaterialRestoreCoverageCount, 0),
                    survivorCoverageCount: nonNegativeNumber(intel.survivorCoverageCount, 0),
                    materialRestoreCoverageCount: nonNegativeNumber(intel.materialRestoreCoverageCount, 0),
                    rejectedMaterialRestoreCoverageCount: nonNegativeNumber(intel.rejectedMaterialRestoreCoverageCount, 0),
                    candidateCoverageCount: nonNegativeNumber(intel.candidateCoverageCount, 0),
                    replayCoverageCount: nonNegativeNumber(intel.replayCoverageCount, 0),
                    requiredRestoreCoverageCount: nonNegativeNumber(intel.requiredRestoreCoverageCount, 0),
                    restoreCoverageCount: nonNegativeNumber(intel.restoreCoverageCount, 0),
                    coverageGapCount: nonNegativeNumber(intel.coverageGapCount, 0),
                    surfaceReplayItemCount: nonNegativeNumber(intel.surfaceReplayItemCount, 0),
                    surfaceReplayRejectedOpCount: nonNegativeNumber(intel.surfaceReplayRejectedOpCount, 0),
                    surfaceReplayMethodCounts: copyStringNumberMap(intel.surfaceReplayMethodCounts),
                    candidateCount: nonNegativeNumber(intel.candidateCount, 0),
                    invariantViolationCount: nonNegativeNumber(intel.invariantViolationCount, 0),
                    invariantViolationReasons: copyStringNumberMap(intel.invariantViolationReasons),
                };
            }

            function copyStringNumberMap(value) {
                const source = value && typeof value === 'object' ? value : {};
                const output = {};
                Object.keys(source).forEach((key) => {
                    const name = stringify(key || '');
                    if (!name) return;
                    output[name] = nonNegativeNumber(source[key], 0);
                });
                return output;
            }

            function normalizeRestoreTransactionProof(proof) {
                if (!proof || typeof proof !== 'object') return null;
                return {
                    kind: stringify(proof.kind || ''),
                    edgeId: stringify(proof.edgeId || ''),
                    targetSurfaceId: stringify(proof.targetSurfaceId || ''),
                    targetRevision: nonNegativeNumber(proof.targetRevision, 0),
                    restoreMaterialId: stringify(proof.restoreMaterialId || ''),
                    mutationMethodName: stringify(proof.mutationMethodName || ''),
                    mutationRect: cloneRect(proof.mutationRect || null),
                };
            }

            function copyDirtyResult(result) {
                if (!result || typeof result !== 'object') return null;
                return {
                    handled: result.handled === true,
                    marked: result.marked === true,
                    setDirty: result.setDirty === true,
                    baseTextureUpdates: nonNegativeNumber(result.baseTextureUpdates, 0),
                    bitmapWidth: nonNegativeNumber(result.bitmapWidth, 0),
                    bitmapHeight: nonNegativeNumber(result.bitmapHeight, 0),
                    errors: nonNegativeNumber(result.errors, 0),
                    reason: stringify(result.reason || ''),
                };
            }

            function copyCompositionSurfaceProof(proof) {
                if (!proof || typeof proof !== 'object') return null;
                const candidates = copyCandidateDrawProofs(proof.candidates);
                return {
                    restore: cloneSurfaceMutationProof(proof.restore),
                    replay: cloneSurfaceMutationProof(proof.replay),
                    draw: cloneSurfaceMutationProof(proof.draw),
                    dirty: cloneSurfaceMutationProof(proof.dirty),
                    beforeRestoreSample: copySurfaceSample(proof.beforeRestoreSample),
                    afterRestoreSample: copySurfaceSample(proof.afterRestoreSample),
                    afterReplaySample: copySurfaceSample(proof.afterReplaySample),
                    afterDrawSample: copySurfaceSample(proof.afterDrawSample),
                    afterDirtySample: copySurfaceSample(proof.afterDirtySample),
                    candidates,
                    summary: copyCandidateSurfaceProofSummary(proof.summary, candidates),
                };
            }

            function copyCandidateDrawProofs(value) {
                return (Array.isArray(value) ? value : [])
                    .map(copyCandidateDrawProof)
                    .filter(Boolean);
            }

            function copyCandidateDrawProof(proof) {
                if (!proof || typeof proof !== 'object') return null;
                return {
                    providerToken: stringify(proof.providerToken || ''),
                    entryId: stringify(proof.entryId || ''),
                    renderedText: stringify(proof.renderedText || ''),
                    displayText: stringify(proof.displayText || ''),
                    targetSurfaceId: stringify(proof.targetSurfaceId || ''),
                    sourceSurfaceId: stringify(proof.sourceSurfaceId || ''),
                    sourceRunId: stringify(proof.sourceRunId || ''),
                    sourceSlotKey: stringify(proof.sourceSlotKey || ''),
                    edgeId: stringify(proof.edgeId || ''),
                    targetBounds: cloneRect(proof.targetBounds || null),
                    accepted: proof.accepted === true,
                    recovered: proof.recovered === true,
                    draw: cloneSurfaceMutationProof(proof.draw),
                    beforeDrawSample: copySurfaceSample(proof.beforeDrawSample),
                    afterDrawSample: copySurfaceSample(proof.afterDrawSample),
                    afterDirtySample: copySurfaceSample(proof.afterDirtySample),
                    dirty: cloneSurfaceMutationProof(proof.dirty),
                    error: stringify(proof.error || ''),
                };
            }

            function summarizeCandidateSurfaceProofs(candidateProofs) {
                const summary = {
                    total: 0,
                    accepted: 0,
                    recovered: 0,
                    drawReadable: 0,
                    drawChanged: 0,
                    acceptedWithoutDrawChange: 0,
                    dirtyReadable: 0,
                    dirtyChanged: 0,
                    errors: 0,
                };
                (Array.isArray(candidateProofs) ? candidateProofs : []).forEach((proof) => {
                    if (!proof) return;
                    summary.total += 1;
                    if (proof.accepted === true) summary.accepted += 1;
                    if (proof.recovered === true) summary.recovered += 1;
                    if (proof.draw && proof.draw.readable === true) summary.drawReadable += 1;
                    if (proof.draw && proof.draw.changed === true) summary.drawChanged += 1;
                    if (proof.accepted === true && !(proof.draw && proof.draw.changed === true)) {
                        summary.acceptedWithoutDrawChange += 1;
                    }
                    if (proof.dirty && proof.dirty.readable === true) summary.dirtyReadable += 1;
                    if (proof.dirty && proof.dirty.changed === true) summary.dirtyChanged += 1;
                    if (proof.error) summary.errors += 1;
                });
                return summary;
            }

            function copyCandidateSurfaceProofSummary(summary, candidates) {
                const source = summary && typeof summary === 'object'
                    ? summary
                    : summarizeCandidateSurfaceProofs(candidates);
                return {
                    total: nonNegativeNumber(source.total, 0),
                    accepted: nonNegativeNumber(source.accepted, 0),
                    recovered: nonNegativeNumber(source.recovered, 0),
                    drawReadable: nonNegativeNumber(source.drawReadable, 0),
                    drawChanged: nonNegativeNumber(source.drawChanged, 0),
                    acceptedWithoutDrawChange: nonNegativeNumber(source.acceptedWithoutDrawChange, 0),
                    dirtyReadable: nonNegativeNumber(source.dirtyReadable, 0),
                    dirtyChanged: nonNegativeNumber(source.dirtyChanged, 0),
                    errors: nonNegativeNumber(source.errors, 0),
                };
            }

            function copySurfaceSample(sample) {
                if (!sample || typeof sample !== 'object') return null;
                return {
                    available: sample.available === true,
                    readable: sample.readable === true,
                    rect: copySurfaceSampleRect(sample.rect),
                    pixels: nonNegativeNumber(sample.pixels, 0),
                    sampledPixels: nonNegativeNumber(sample.sampledPixels, 0),
                    stride: nonNegativeNumber(sample.stride, 0),
                    checksum: nonNegativeNumber(sample.checksum, 0),
                    alphaSum: nonNegativeNumber(sample.alphaSum, 0),
                    rgbSum: nonNegativeNumber(sample.rgbSum, 0),
                    nonTransparent: nonNegativeNumber(sample.nonTransparent, 0),
                    error: stringify(sample.error || ''),
                };
            }

            function copySurfaceSampleRect(rect) {
                if (!rect || typeof rect !== 'object') return null;
                return {
                    x: nonNegativeNumber(rect.x, 0),
                    y: nonNegativeNumber(rect.y, 0),
                    width: nonNegativeNumber(rect.width, 0),
                    height: nonNegativeNumber(rect.height, 0),
                };
            }

            function copySkippedCandidate(candidate) {
                if (!candidate || typeof candidate !== 'object') return null;
                return {
                    providerToken: stringify(candidate.providerToken || ''),
                    reason: stringify(candidate.reason || candidate.skipReason || candidate.copiedTargetSkipReason || ''),
                    entryId: stringify(candidate.entryId || ''),
                    edgeId: stringify(candidate.edgeId || ''),
                    targetSurfaceId: stringify(candidate.targetSurfaceId || ''),
                    targetBounds: cloneRect(candidate.targetBounds || candidate.bounds || null),
                };
            }

            function compareCopiedTargetRestoreCandidates(left, right) {
                const leftOrder = getCopiedTargetRestoreCandidateOrder(left);
                const rightOrder = getCopiedTargetRestoreCandidateOrder(right);
                const orderDelta = compareOrderKeys(leftOrder, rightOrder);
                if (orderDelta !== 0) return orderDelta;
                return compareStrings(left && left.providerToken, right && right.providerToken)
                    || compareStrings(left && left.entryId, right && right.entryId);
            }

            function getCopiedTargetRestoreCandidateOrder(candidate) {
                const bounds = candidate && candidate.targetBounds || null;
                const sourceDrawOrder = nonNegativeNumber(
                    candidate && candidate.sourceDrawOrder,
                    nonNegativeNumber(candidate && candidate.targetOrderKey, 0)
                );
                return [
                    parseCopyEdgeOrder(candidate && candidate.edgeId),
                    bounds ? finiteNumber(bounds.y1, 0) : 0,
                    bounds ? finiteNumber(bounds.x1, 0) : 0,
                    sourceDrawOrder,
                    nonNegativeNumber(candidate && candidate.providerPriority, 0),
                    nonNegativeNumber(candidate && candidate.targetOrderKey, 0),
                ];
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function finiteNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : fallback;
            }

            function nonNegativeNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            }

            function compareStrings(left, right) {
                const leftValue = stringify(left || '');
                const rightValue = stringify(right || '');
                if (leftValue < rightValue) return -1;
                if (leftValue > rightValue) return 1;
                return 0;
            }

            function requireFunction(value, name) {
                if (typeof value !== 'function') {
                    throw new Error(`[LiveTranslator] copied target compositor requires ${name}.`);
                }
                return value;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopiedTargetCompositor,
            });
        },
    });
})();
