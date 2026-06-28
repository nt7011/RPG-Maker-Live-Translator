// Copied-target proof schema.
//
// Copied-target redraw diagnostics cross bitmap composition, render commits,
// and snapshot artifacts. This module owns the canonical data shape so those
// boundaries copy the same fields instead of maintaining parallel clone logic.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.copiedTargetProofSchema',
        factory() {
            function normalizeCopiedTargetProof(input = {}) {
                const source = objectOrEmpty(input);
                const dependencySearchRects = copyRects(source.dependencySearchRects);
                const requestedMaterialRestoreCoverageRects = copyRects(source.requestedMaterialRestoreCoverageRects);
                const survivorCoverageRects = copyRects(source.survivorCoverageRects);
                const materialRestoreCoverageRects = copyRects(source.materialRestoreCoverageRects);
                const rejectedMaterialRestoreCoverageRects = copyRects(source.rejectedMaterialRestoreCoverageRects);
                const candidateCoverageRects = copyRects(source.candidateCoverageRects);
                const replayCoverageRects = copyRects(source.replayCoverageRects);
                const requiredRestoreCoverageRects = copyRects(source.requiredRestoreCoverageRects);
                const restoreCoverageRects = copyRects(source.restoreCoverageRects);
                const coverageGaps = copyCoverageGaps(source.coverageGaps);
                const dirtySource = objectOrEmpty(source.dirtyUpload || source.dirtyResult);
                return {
                    required: booleanValue(source.required),
                    planned: booleanValue(source.planned),
                    materialized: finiteNumber(source.materialized, source.materializedTargets),
                    redrawn: finiteNumber(source.redrawn),
                    copiedTargets: finiteNumber(source.copiedTargets, source.redrawn),
                    targetSurfaceId: firstString(source.targetSurfaceId),
                    restoreMaterialId: firstString(source.restoreMaterialId),
                    compositionCount: finiteNumber(source.compositionCount),
                    compositionCandidateCount: finiteNumber(source.compositionCandidateCount, source.candidateCount),
                    dependencySearchRects,
                    requestedMaterialRestoreCoverageCount: Math.max(
                        finiteNumber(source.requestedMaterialRestoreCoverageCount),
                        requestedMaterialRestoreCoverageRects.length
                    ),
                    requestedMaterialRestoreCoverageRects,
                    survivorCoverageCount: Math.max(finiteNumber(source.survivorCoverageCount), survivorCoverageRects.length),
                    survivorCoverageRects,
                    materialRestoreCoverageCount: Math.max(
                        finiteNumber(source.materialRestoreCoverageCount),
                        materialRestoreCoverageRects.length
                    ),
                    materialRestoreCoverageRects,
                    rejectedMaterialRestoreCoverageCount: Math.max(
                        finiteNumber(source.rejectedMaterialRestoreCoverageCount),
                        rejectedMaterialRestoreCoverageRects.length
                    ),
                    rejectedMaterialRestoreCoverageRects,
                    candidateCoverageRects,
                    replayCoverageRects,
                    requiredRestoreCoverageCount: Math.max(
                        finiteNumber(source.requiredRestoreCoverageCount),
                        requiredRestoreCoverageRects.length
                    ),
                    requiredRestoreCoverageRects,
                    restoreCoverageCount: Math.max(finiteNumber(source.restoreCoverageCount), restoreCoverageRects.length),
                    restoreCoverageRects,
                    coverageGaps,
                    coverageGapCount: Math.max(finiteNumber(source.coverageGapCount), coverageGaps.length),
                    surfaceReplayPlan: copySurfaceReplayPlan(source.surfaceReplayPlan),
                    executionSteps: copyExecutionSteps(source.executionSteps),
                    plannerDiagnostics: copyPlannerDiagnostics(source.plannerDiagnostics),
                    dirtyUpload: copyDirtyUpload(dirtySource),
                    skippedCandidates: copySkippedCandidates(source.skippedCandidates),
                    candidateProofs: copyCandidateProofs(source.candidateProofs),
                    compositionSurfaceProofs: copyCompositionSurfaceProofs(source.compositionSurfaceProofs),
                    surfaceSummary: copyCopiedTargetSurfaceSummary(source.surfaceSummary),
                    sourceContentsRole: firstString(source.sourceContentsRole),
                    sourceCommitted: booleanValue(source.sourceCommitted),
                };
            }

            function summarizeCopiedTargetProofs(proofs, redrawn) {
                const compositions = (Array.isArray(proofs) ? proofs : [])
                    .filter((proof) => proof && typeof proof === 'object');
                if (!(redrawn > 0) && !compositions.length) return null;

                const skippedCandidates = [];
                const candidateProofs = [];
                const compositionSurfaceProofs = [];
                const dependencySearchRects = collectProofRects(compositions, 'dependencySearchRects');
                const requestedMaterialRestoreCoverageRects = collectProofRects(compositions, 'requestedMaterialRestoreCoverageRects');
                const survivorCoverageRects = collectProofRects(compositions, 'survivorCoverageRects');
                const materialRestoreCoverageRects = collectProofRects(compositions, 'materialRestoreCoverageRects');
                const rejectedMaterialRestoreCoverageRects = collectProofRects(compositions, 'rejectedMaterialRestoreCoverageRects');
                const candidateCoverageRects = collectProofRects(compositions, 'candidateCoverageRects');
                const replayCoverageRects = collectProofRects(compositions, 'replayCoverageRects');
                const requiredRestoreCoverageRects = collectProofRects(compositions, 'requiredRestoreCoverageRects');
                const restoreCoverageRects = collectProofRects(compositions, 'restoreCoverageRects');
                const coverageGaps = collectCoverageGaps(compositions);

                compositions.forEach((proof) => {
                    copySkippedCandidates(proof.skippedCandidates).forEach((candidate) => {
                        skippedCandidates.push(candidate);
                    });
                    copyCandidateProofs(proof.candidateProofs).forEach((candidateProof) => {
                        candidateProofs.push(candidateProof);
                    });
                    const surfaceProof = copyCompositionSurfaceProof(proof.surfaceProof);
                    if (surfaceProof) {
                        compositionSurfaceProofs.push(surfaceProof);
                        copyCandidateProofs(surfaceProof.candidates).forEach((candidateProof) => {
                            if (!hasCandidateProof(candidateProofs, candidateProof)) candidateProofs.push(candidateProof);
                        });
                    }
                });

                return normalizeCopiedTargetProof({
                    required: true,
                    planned: true,
                    materialized: sumProofNumber(compositions, 'materialized', 'candidateCount'),
                    redrawn: Math.max(0, Number(redrawn) || 0),
                    copiedTargets: Math.max(0, Number(redrawn) || 0),
                    targetSurfaceId: firstProofString(compositions, 'targetSurfaceId'),
                    restoreMaterialId: firstProofString(compositions, 'restoreMaterialId'),
                    compositionCount: compositions.length,
                    compositionCandidateCount: sumProofNumber(compositions, 'compositionCandidateCount', 'candidateCount'),
                    requestedMaterialRestoreCoverageCount: Math.max(
                        requestedMaterialRestoreCoverageRects.length,
                        sumProofNumber(compositions, 'requestedMaterialRestoreCoverageCount')
                    ),
                    requestedMaterialRestoreCoverageRects,
                    survivorCoverageCount: Math.max(
                        survivorCoverageRects.length,
                        sumProofNumber(compositions, 'survivorCoverageCount')
                    ),
                    survivorCoverageRects,
                    dependencySearchRects,
                    materialRestoreCoverageCount: Math.max(
                        materialRestoreCoverageRects.length,
                        sumProofNumber(compositions, 'materialRestoreCoverageCount')
                    ),
                    materialRestoreCoverageRects,
                    rejectedMaterialRestoreCoverageCount: Math.max(
                        rejectedMaterialRestoreCoverageRects.length,
                        sumProofNumber(compositions, 'rejectedMaterialRestoreCoverageCount')
                    ),
                    rejectedMaterialRestoreCoverageRects,
                    candidateCoverageRects,
                    replayCoverageRects,
                    requiredRestoreCoverageCount: Math.max(
                        requiredRestoreCoverageRects.length,
                        sumProofNumber(compositions, 'requiredRestoreCoverageCount')
                    ),
                    requiredRestoreCoverageRects,
                    restoreCoverageCount: Math.max(
                        restoreCoverageRects.length,
                        sumProofNumber(compositions, 'restoreCoverageCount')
                    ),
                    restoreCoverageRects,
                    coverageGaps,
                    coverageGapCount: Math.max(
                        coverageGaps.length,
                        sumProofNumber(compositions, 'coverageGapCount')
                    ),
                    surfaceReplayPlan: summarizeSurfaceReplayPlans(compositions, replayCoverageRects),
                    executionSteps: summarizeExecutionSteps(compositions),
                    plannerDiagnostics: summarizePlannerDiagnostics(compositions, {
                        dependencySearchRects,
                        requestedMaterialRestoreCoverageRects,
                        survivorCoverageRects,
                        materialRestoreCoverageRects,
                        rejectedMaterialRestoreCoverageRects,
                        candidateCoverageRects,
                        replayCoverageRects,
                        requiredRestoreCoverageRects,
                        restoreCoverageRects,
                        coverageGaps,
                    }),
                    dirtyUpload: summarizeCopiedTargetDirtyUpload(compositions),
                    skippedCandidates,
                    candidateProofs,
                    compositionSurfaceProofs,
                    surfaceSummary: summarizeCompositionSurfaceProofs(compositionSurfaceProofs, candidateProofs),
                });
            }

            function collectProofRects(proofs, fieldName) {
                const seen = new Set();
                const rects = [];
                (Array.isArray(proofs) ? proofs : []).forEach((proof) => {
                    (Array.isArray(proof && proof[fieldName]) ? proof[fieldName] : []).forEach((rect) => {
                        const copied = copyRect(rect);
                        const key = rectKey(copied);
                        if (!key || seen.has(key)) return;
                        seen.add(key);
                        rects.push(copied);
                    });
                });
                return rects;
            }

            function collectCoverageGaps(proofs) {
                const seen = new Set();
                const gaps = [];
                (Array.isArray(proofs) ? proofs : []).forEach((proof) => {
                    copyCoverageGaps(proof && proof.coverageGaps).forEach((gap) => {
                        const key = [
                            gap && gap.role,
                            gap && gap.reason,
                            rectKey(gap && gap.rect),
                        ].join('|');
                        if (!key || seen.has(key)) return;
                        seen.add(key);
                        gaps.push(gap);
                    });
                });
                return gaps;
            }

            function summarizeCopiedTargetDirtyUpload(proofs) {
                const result = {
                    handled: false,
                    marked: false,
                    setDirty: false,
                    baseTextureUpdates: 0,
                    bitmapWidth: 0,
                    bitmapHeight: 0,
                    errors: 0,
                    reason: '',
                };
                (Array.isArray(proofs) ? proofs : []).forEach((proof) => {
                    const dirty = objectOrEmpty(proof && (proof.dirtyUpload || proof.dirtyResult));
                    if (!Object.keys(dirty).length) return;
                    result.handled = result.handled || dirty.handled === true;
                    result.marked = result.marked || dirty.marked === true;
                    result.setDirty = result.setDirty || dirty.setDirty === true;
                    result.baseTextureUpdates += nonNegativeNumber(dirty.baseTextureUpdates);
                    result.bitmapWidth = Math.max(result.bitmapWidth, nonNegativeNumber(dirty.bitmapWidth));
                    result.bitmapHeight = Math.max(result.bitmapHeight, nonNegativeNumber(dirty.bitmapHeight));
                    result.errors += nonNegativeNumber(dirty.errors);
                    if (!result.reason && dirty.reason) result.reason = firstString(dirty.reason);
                });
                return result;
            }

            function summarizeSurfaceReplayPlans(proofs, replayCoverageRects) {
                const rejectedOps = [];
                const searchProofs = [];
                const methodCounts = {};
                let itemCount = 0;
                let coverageRectCount = 0;
                let rejectedOpCount = 0;
                (Array.isArray(proofs) ? proofs : []).forEach((proof) => {
                    const plan = objectOrEmpty(proof && proof.surfaceReplayPlan);
                    if (!Object.keys(plan).length) return;
                    itemCount += nonNegativeNumber(plan.itemCount);
                    coverageRectCount += nonNegativeNumber(plan.coverageRectCount);
                    rejectedOpCount += nonNegativeNumber(plan.rejectedOpCount);
                    copySurfaceReplayRejectedOps(plan.rejectedOps).forEach((item) => rejectedOps.push(item));
                    copySurfaceReplaySearchProofs(plan.searchProofs).forEach((item) => searchProofs.push(item));
                    const diagnostics = objectOrEmpty(proof && proof.plannerDiagnostics);
                    const diagnosticMethodCounts = objectOrEmpty(diagnostics.surfaceReplayMethodCounts);
                    if (Object.keys(diagnosticMethodCounts).length) {
                        mergeStringNumberMap(methodCounts, diagnosticMethodCounts);
                    } else {
                        mergeStringNumberMap(methodCounts, plan.methodCounts);
                    }
                });
                const dedupedRejectedOps = dedupeRejectedOps(rejectedOps);
                return {
                    itemCount,
                    coverageRects: copyRects(replayCoverageRects),
                    coverageRectCount: Math.max(rectCount(replayCoverageRects), coverageRectCount),
                    rejectedOps: dedupedRejectedOps,
                    rejectedOpCount: Math.max(dedupedRejectedOps.length, rejectedOpCount),
                    searchProofs,
                    methodCounts,
                };
            }

            function summarizeExecutionSteps(proofs) {
                const result = {
                    restoreMaterial: false,
                    replayCopiedSurfaceLayer: false,
                    drawCopiedTargets: false,
                    markDirty: false,
                };
                (Array.isArray(proofs) ? proofs : []).forEach((proof) => {
                    const steps = objectOrEmpty(proof && proof.executionSteps);
                    result.restoreMaterial = result.restoreMaterial || steps.restoreMaterial === true;
                    result.replayCopiedSurfaceLayer = result.replayCopiedSurfaceLayer || steps.replayCopiedSurfaceLayer === true;
                    result.drawCopiedTargets = result.drawCopiedTargets || steps.drawCopiedTargets === true;
                    result.markDirty = result.markDirty || steps.markDirty === true;
                });
                return result;
            }

            function summarizePlannerDiagnostics(proofs, coverage) {
                const methodCounts = {};
                let surfaceReplayItemCount = 0;
                let surfaceReplayRejectedOpCount = 0;
                let candidateCount = 0;
                let invariantViolationCount = 0;
                const invariantViolationReasons = {};
                (Array.isArray(proofs) ? proofs : []).forEach((proof) => {
                    const diagnostics = objectOrEmpty(proof && proof.plannerDiagnostics);
                    surfaceReplayItemCount += nonNegativeNumber(diagnostics.surfaceReplayItemCount);
                    surfaceReplayRejectedOpCount += nonNegativeNumber(diagnostics.surfaceReplayRejectedOpCount);
                    candidateCount += nonNegativeNumber(diagnostics.candidateCount);
                    invariantViolationCount += nonNegativeNumber(diagnostics.invariantViolationCount);
                    mergeStringNumberMap(methodCounts, diagnostics.surfaceReplayMethodCounts);
                    mergeStringNumberMap(invariantViolationReasons, diagnostics.invariantViolationReasons);
                });
                return {
                    dependencySearchCount: rectCount(coverage && coverage.dependencySearchRects),
                    requestedMaterialRestoreCoverageCount: rectCount(coverage && coverage.requestedMaterialRestoreCoverageRects),
                    survivorCoverageCount: rectCount(coverage && coverage.survivorCoverageRects),
                    materialRestoreCoverageCount: rectCount(coverage && coverage.materialRestoreCoverageRects),
                    rejectedMaterialRestoreCoverageCount: rectCount(coverage && coverage.rejectedMaterialRestoreCoverageRects),
                    candidateCoverageCount: rectCount(coverage && coverage.candidateCoverageRects),
                    replayCoverageCount: rectCount(coverage && coverage.replayCoverageRects),
                    requiredRestoreCoverageCount: rectCount(coverage && coverage.requiredRestoreCoverageRects),
                    restoreCoverageCount: rectCount(coverage && coverage.restoreCoverageRects),
                    coverageGapCount: rectCount(coverage && coverage.coverageGaps),
                    surfaceReplayItemCount,
                    surfaceReplayRejectedOpCount,
                    surfaceReplayMethodCounts: methodCounts,
                    candidateCount,
                    invariantViolationCount,
                    invariantViolationReasons,
                };
            }

            function summarizeCompositionSurfaceProofs(compositionSurfaceProofs, candidateProofs) {
                const compositions = Array.isArray(compositionSurfaceProofs) ? compositionSurfaceProofs : [];
                const candidates = Array.isArray(candidateProofs) ? candidateProofs : [];
                return {
                    compositionCount: compositions.length,
                    restoreReadable: countProofs(compositions, 'restore', 'readable'),
                    restoreChanged: countProofs(compositions, 'restore', 'changed'),
                    replayReadable: countProofs(compositions, 'replay', 'readable'),
                    replayChanged: countProofs(compositions, 'replay', 'changed'),
                    drawReadable: countProofs(compositions, 'draw', 'readable'),
                    drawChanged: countProofs(compositions, 'draw', 'changed'),
                    dirtyReadable: countProofs(compositions, 'dirty', 'readable'),
                    dirtyChanged: countProofs(compositions, 'dirty', 'changed'),
                    candidateCount: candidates.length,
                    acceptedCandidates: countCandidates(candidates, 'accepted'),
                    drawChangedCandidates: countNestedCandidateProofs(candidates, 'draw', 'changed'),
                    acceptedWithoutDrawChange: candidates.filter((candidate) => {
                        return candidate.accepted === true && !(candidate.draw && candidate.draw.changed === true);
                    }).length,
                    dirtyChangedCandidates: countNestedCandidateProofs(candidates, 'dirty', 'changed'),
                };
            }

            function copySurfaceReplayPlan(value) {
                const source = objectOrEmpty(value);
                return {
                    itemCount: finiteNumber(source.itemCount),
                    coverageRects: copyRects(source.coverageRects),
                    coverageRectCount: Math.max(finiteNumber(source.coverageRectCount), rectCount(source.coverageRects)),
                    rejectedOps: copySurfaceReplayRejectedOps(source.rejectedOps),
                    rejectedOpCount: Math.max(
                        finiteNumber(source.rejectedOpCount),
                        rectCount(source.rejectedOps)
                    ),
                    searchProofs: copySurfaceReplaySearchProofs(source.searchProofs),
                    methodCounts: copyStringNumberMap(source.methodCounts),
                    diagnostics: copyPlainScalars(source.diagnostics),
                };
            }

            function copySurfaceReplayRejectedOps(value) {
                return (Array.isArray(value) ? value : []).map((op) => {
                    const item = objectOrEmpty(op);
                    const output = {
                        reason: firstString(item.reason, item.rejectedReason),
                        edgeId: firstString(item.edgeId),
                        replayOpId: firstString(item.replayOpId),
                        methodName: firstString(item.methodName),
                        rect: copyRect(item.rect),
                    };
                    return output.reason || output.edgeId || output.replayOpId || output.methodName || output.rect
                        ? output
                        : null;
                }).filter(Boolean);
            }

            function copySurfaceReplaySearchProofs(value) {
                return (Array.isArray(value) ? value : []).map((proof) => {
                    const item = objectOrEmpty(proof);
                    const output = {
                        dependencySearchRect: copyRect(item.dependencySearchRect),
                        itemCount: finiteNumber(item.itemCount),
                        coverageRectCount: finiteNumber(item.coverageRectCount),
                        rejectedOpCount: finiteNumber(item.rejectedOpCount),
                    };
                    return output.dependencySearchRect
                        || output.itemCount
                        || output.coverageRectCount
                        || output.rejectedOpCount
                        ? output
                        : null;
                }).filter(Boolean);
            }

            function copyExecutionSteps(value) {
                const source = objectOrEmpty(value);
                return {
                    restoreMaterial: booleanValue(source.restoreMaterial),
                    replayCopiedSurfaceLayer: booleanValue(source.replayCopiedSurfaceLayer),
                    drawCopiedTargets: booleanValue(source.drawCopiedTargets),
                    markDirty: booleanValue(source.markDirty),
                };
            }

            function copyPlannerDiagnostics(value) {
                const source = objectOrEmpty(value);
                return {
                    dependencySearchCount: finiteNumber(source.dependencySearchCount),
                    requestedMaterialRestoreCoverageCount: finiteNumber(source.requestedMaterialRestoreCoverageCount),
                    survivorCoverageCount: finiteNumber(source.survivorCoverageCount),
                    materialRestoreCoverageCount: finiteNumber(source.materialRestoreCoverageCount),
                    rejectedMaterialRestoreCoverageCount: finiteNumber(source.rejectedMaterialRestoreCoverageCount),
                    candidateCoverageCount: finiteNumber(source.candidateCoverageCount),
                    replayCoverageCount: finiteNumber(source.replayCoverageCount),
                    requiredRestoreCoverageCount: finiteNumber(source.requiredRestoreCoverageCount),
                    restoreCoverageCount: finiteNumber(source.restoreCoverageCount),
                    coverageGapCount: finiteNumber(source.coverageGapCount),
                    surfaceReplayItemCount: finiteNumber(source.surfaceReplayItemCount),
                    surfaceReplayRejectedOpCount: finiteNumber(source.surfaceReplayRejectedOpCount),
                    surfaceReplayMethodCounts: copyStringNumberMap(source.surfaceReplayMethodCounts),
                    candidateCount: finiteNumber(source.candidateCount),
                    invariantViolationCount: finiteNumber(source.invariantViolationCount),
                    invariantViolationReasons: copyStringNumberMap(source.invariantViolationReasons),
                };
            }

            function copyDirtyUpload(value) {
                const source = objectOrEmpty(value);
                return {
                    handled: booleanValue(source.handled),
                    marked: booleanValue(source.marked),
                    setDirty: booleanValue(source.setDirty),
                    baseTextureUpdates: finiteNumber(source.baseTextureUpdates),
                    bitmapWidth: finiteNumber(source.bitmapWidth),
                    bitmapHeight: finiteNumber(source.bitmapHeight),
                    errors: finiteNumber(source.errors),
                    reason: firstString(source.reason),
                };
            }

            function copySkippedCandidates(value) {
                return (Array.isArray(value) ? value : []).map((candidate) => {
                    const item = objectOrEmpty(candidate);
                    const output = {
                        providerToken: firstString(item.providerToken),
                        reason: firstString(item.reason, item.skipReason, item.copiedTargetSkipReason),
                        entryId: firstString(item.entryId),
                        edgeId: firstString(item.edgeId),
                        targetSurfaceId: firstString(item.targetSurfaceId),
                        targetBounds: copyRect(item.targetBounds || item.bounds),
                    };
                    return output.providerToken || output.reason || output.entryId || output.edgeId || output.targetSurfaceId || output.targetBounds
                        ? output
                        : null;
                }).filter(Boolean);
            }

            function copyCandidateProofs(value) {
                return (Array.isArray(value) ? value : [])
                    .map(copyCandidateProof)
                    .filter(Boolean);
            }

            function copyCandidateProof(proof) {
                const item = objectOrEmpty(proof);
                if (!Object.keys(item).length) return null;
                return {
                    providerToken: firstString(item.providerToken),
                    entryId: firstString(item.entryId),
                    renderedText: firstString(item.renderedText),
                    displayText: firstString(item.displayText),
                    targetSurfaceId: firstString(item.targetSurfaceId),
                    sourceSurfaceId: firstString(item.sourceSurfaceId),
                    sourceRunId: firstString(item.sourceRunId),
                    sourceSlotKey: firstString(item.sourceSlotKey),
                    edgeId: firstString(item.edgeId),
                    targetBounds: copyRect(item.targetBounds),
                    accepted: booleanValue(item.accepted),
                    recovered: booleanValue(item.recovered),
                    draw: copySurfaceMutationProof(item.draw),
                    beforeDrawSample: copySurfaceSample(item.beforeDrawSample),
                    afterDrawSample: copySurfaceSample(item.afterDrawSample),
                    afterDirtySample: copySurfaceSample(item.afterDirtySample),
                    dirty: copySurfaceMutationProof(item.dirty),
                    error: firstString(item.error),
                };
            }

            function copyCompositionSurfaceProofs(value) {
                return (Array.isArray(value) ? value : [])
                    .map(copyCompositionSurfaceProof)
                    .filter(Boolean);
            }

            function copyCompositionSurfaceProof(proof) {
                const item = objectOrEmpty(proof);
                if (!Object.keys(item).length) return null;
                const candidates = copyCandidateProofs(item.candidates);
                const output = {
                    restore: copySurfaceMutationProof(item.restore),
                    replay: copySurfaceMutationProof(item.replay),
                    draw: copySurfaceMutationProof(item.draw),
                    dirty: copySurfaceMutationProof(item.dirty),
                    beforeRestoreSample: copySurfaceSample(item.beforeRestoreSample),
                    afterRestoreSample: copySurfaceSample(item.afterRestoreSample),
                    afterReplaySample: copySurfaceSample(item.afterReplaySample),
                    afterDrawSample: copySurfaceSample(item.afterDrawSample),
                    afterDirtySample: copySurfaceSample(item.afterDirtySample),
                    candidates,
                    summary: copyCompositionSurfaceSummary(item.summary),
                };
                return output.restore
                    || output.replay
                    || output.draw
                    || output.dirty
                    || output.beforeRestoreSample
                    || output.afterRestoreSample
                    || output.afterReplaySample
                    || output.afterDrawSample
                    || output.afterDirtySample
                    || output.candidates.length
                    || output.summary
                    ? output
                    : null;
            }

            function copyCoverageGaps(value) {
                return (Array.isArray(value) ? value : []).map((gap) => {
                    const item = objectOrEmpty(gap);
                    const output = {
                        role: firstString(item.role),
                        reason: firstString(item.reason),
                        rect: copyRect(item.rect),
                    };
                    return output.role || output.reason || output.rect ? output : null;
                }).filter(Boolean);
            }

            function copySurfaceMutationProof(value) {
                const proof = objectOrEmpty(value);
                if (!Object.keys(proof).length) return null;
                return {
                    available: booleanValue(proof.available),
                    readable: booleanValue(proof.readable),
                    changed: booleanValue(proof.changed),
                    beforeChecksum: finiteNumber(proof.beforeChecksum),
                    afterChecksum: finiteNumber(proof.afterChecksum),
                    beforeAlphaSum: finiteNumber(proof.beforeAlphaSum),
                    afterAlphaSum: finiteNumber(proof.afterAlphaSum),
                    beforeNonTransparent: finiteNumber(proof.beforeNonTransparent),
                    afterNonTransparent: finiteNumber(proof.afterNonTransparent),
                    error: firstString(proof.error),
                    rect: copySurfaceProofRect(proof.rect),
                };
            }

            function copySurfaceSample(sample) {
                const source = objectOrEmpty(sample);
                if (!Object.keys(source).length) return null;
                return {
                    available: booleanValue(source.available),
                    readable: booleanValue(source.readable),
                    rect: copySurfaceSampleRect(source.rect),
                    pixels: finiteNumber(source.pixels),
                    sampledPixels: finiteNumber(source.sampledPixels),
                    stride: finiteNumber(source.stride),
                    checksum: finiteNumber(source.checksum),
                    alphaSum: finiteNumber(source.alphaSum),
                    rgbSum: finiteNumber(source.rgbSum),
                    nonTransparent: finiteNumber(source.nonTransparent),
                    error: firstString(source.error),
                };
            }

            function copySurfaceSampleRect(rect) {
                const source = objectOrEmpty(rect);
                if (!Object.keys(source).length) return null;
                const output = {};
                copyNullableNumber(output, 'x', source.x);
                copyNullableNumber(output, 'y', source.y);
                copyNullableNumber(output, 'width', source.width);
                copyNullableNumber(output, 'height', source.height);
                return Object.keys(output).length ? output : null;
            }

            function copySurfaceProofRect(rect) {
                const source = objectOrEmpty(rect);
                if (!Object.keys(source).length) return null;
                const output = {};
                copyNullableNumber(output, 'x1', source.x1);
                copyNullableNumber(output, 'y1', source.y1);
                copyNullableNumber(output, 'x2', source.x2);
                copyNullableNumber(output, 'y2', source.y2);
                copyNullableNumber(output, 'x', source.x);
                copyNullableNumber(output, 'y', source.y);
                copyNullableNumber(output, 'width', source.width);
                copyNullableNumber(output, 'height', source.height);
                return Object.keys(output).length ? output : null;
            }

            function copyCompositionSurfaceSummary(summary) {
                const source = objectOrEmpty(summary);
                if (!Object.keys(source).length) return null;
                return {
                    total: finiteNumber(source.total),
                    accepted: finiteNumber(source.accepted),
                    recovered: finiteNumber(source.recovered),
                    drawReadable: finiteNumber(source.drawReadable),
                    drawChanged: finiteNumber(source.drawChanged),
                    acceptedWithoutDrawChange: finiteNumber(source.acceptedWithoutDrawChange),
                    dirtyReadable: finiteNumber(source.dirtyReadable),
                    dirtyChanged: finiteNumber(source.dirtyChanged),
                    errors: finiteNumber(source.errors),
                };
            }

            function copyCopiedTargetSurfaceSummary(summary) {
                const source = objectOrEmpty(summary);
                if (!Object.keys(source).length) return null;
                return {
                    compositionCount: finiteNumber(source.compositionCount),
                    restoreReadable: finiteNumber(source.restoreReadable),
                    restoreChanged: finiteNumber(source.restoreChanged),
                    replayReadable: finiteNumber(source.replayReadable),
                    replayChanged: finiteNumber(source.replayChanged),
                    drawReadable: finiteNumber(source.drawReadable),
                    drawChanged: finiteNumber(source.drawChanged),
                    dirtyReadable: finiteNumber(source.dirtyReadable),
                    dirtyChanged: finiteNumber(source.dirtyChanged),
                    candidateCount: finiteNumber(source.candidateCount),
                    acceptedCandidates: finiteNumber(source.acceptedCandidates),
                    drawChangedCandidates: finiteNumber(source.drawChangedCandidates),
                    acceptedWithoutDrawChange: finiteNumber(source.acceptedWithoutDrawChange),
                    dirtyChangedCandidates: finiteNumber(source.dirtyChangedCandidates),
                    errors: finiteNumber(source.errors),
                };
            }

            function copyRects(value) {
                return (Array.isArray(value) ? value : [])
                    .map(copyRect)
                    .filter(Boolean);
            }

            function copyRect(rect) {
                const source = objectOrEmpty(rect);
                if (!Object.keys(source).length) return null;
                const x1 = finiteNumber(source.x1, 0);
                const y1 = finiteNumber(source.y1, 0);
                const x2 = finiteNumber(source.x2, x1);
                const y2 = finiteNumber(source.y2, y1);
                return { x1, y1, x2, y2 };
            }

            function rectKey(rect) {
                const copied = copyRect(rect);
                return copied ? `${copied.x1},${copied.y1},${copied.x2},${copied.y2}` : '';
            }

            function dedupeRejectedOps(items) {
                const seen = new Set();
                const output = [];
                (Array.isArray(items) ? items : []).forEach((item) => {
                    const key = [
                        item && item.reason,
                        item && item.edgeId,
                        item && item.replayOpId,
                        item && item.methodName,
                        rectKey(item && item.rect),
                    ].join('|');
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    output.push(item);
                });
                return output;
            }

            function copyStringNumberMap(value) {
                const source = objectOrEmpty(value);
                const output = {};
                Object.keys(source).forEach((key) => {
                    const name = firstString(key);
                    if (!name) return;
                    output[name] = finiteNumber(source[key]);
                });
                return output;
            }

            function mergeStringNumberMap(target, source) {
                const values = objectOrEmpty(source);
                Object.keys(values).forEach((key) => {
                    const name = firstString(key);
                    if (!name) return;
                    target[name] = (target[name] || 0) + nonNegativeNumber(values[key]);
                });
                return target;
            }

            function copyPlainScalars(value) {
                const source = objectOrEmpty(value);
                const output = {};
                Object.keys(source).forEach((key) => {
                    const item = source[key];
                    if (item === undefined || item === null || typeof item === 'object') return;
                    output[key] = item;
                });
                return output;
            }

            function hasCandidateProof(candidateProofs, candidateProof) {
                const key = createCandidateProofKey(candidateProof);
                return !!key && candidateProofs.some((existing) => createCandidateProofKey(existing) === key);
            }

            function createCandidateProofKey(proof) {
                if (!proof || typeof proof !== 'object') return '';
                return [
                    proof.providerToken || '',
                    proof.entryId || '',
                    proof.sourceRunId || '',
                    proof.sourceSlotKey || '',
                    proof.edgeId || '',
                    rectKey(proof.targetBounds),
                ].join('|');
            }

            function sumProofNumber(proofs, primaryKey, fallbackKey) {
                return (Array.isArray(proofs) ? proofs : []).reduce((total, proof) => {
                    const value = proof && proof[primaryKey] !== undefined ? proof[primaryKey] : proof && proof[fallbackKey];
                    return total + nonNegativeNumber(value);
                }, 0);
            }

            function firstProofString(proofs, key) {
                for (const proof of Array.isArray(proofs) ? proofs : []) {
                    const value = proof && proof[key];
                    if (value !== undefined && value !== null && firstString(value)) return firstString(value);
                }
                return '';
            }

            function countProofs(proofs, key, field) {
                return (Array.isArray(proofs) ? proofs : []).filter((proof) => {
                    return proof && proof[key] && proof[key][field] === true;
                }).length;
            }

            function countCandidates(candidates, field) {
                return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
                    return candidate && candidate[field] === true;
                }).length;
            }

            function countNestedCandidateProofs(candidates, key, field) {
                return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
                    return candidate && candidate[key] && candidate[key][field] === true;
                }).length;
            }

            function rectCount(value) {
                return Array.isArray(value) ? value.length : 0;
            }

            function objectOrEmpty(value) {
                return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            }

            function firstString(...values) {
                for (const value of values) {
                    if (value === undefined || value === null) continue;
                    if (typeof value === 'string') {
                        if (value) return value;
                        continue;
                    }
                    if (typeof value === 'object') continue;
                    const text = String(value);
                    if (text) return text;
                }
                return '';
            }

            function booleanValue(...values) {
                for (const value of values) {
                    if (value === true) return true;
                    if (value === false) return false;
                }
                return false;
            }

            function nullableNumber(...values) {
                for (const value of values) {
                    if (value === undefined || value === null) continue;
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return null;
            }

            function copyNullableNumber(output, key, value) {
                const numeric = nullableNumber(value);
                if (numeric !== null) output[key] = numeric;
            }

            function finiteNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

            function nonNegativeNumber(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                normalizeCopiedTargetProof,
                summarizeCopiedTargetProofs,
                copyRects,
                copyCoverageGaps,
                copySurfaceReplayPlan,
                copyExecutionSteps,
                copyPlannerDiagnostics,
                copyDirtyUpload,
                copySkippedCandidates,
                copyCandidateProofs,
                copyCompositionSurfaceProofs,
                copyCopiedTargetSurfaceSummary,
                rectKey,
            });
        },
    });
})();
