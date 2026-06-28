// Copied-target restore planner.
//
// Copied-target redraw has two different geometry questions:
// where to search for copied-surface dependencies, and where to restore target
// pixels before replay/draw. This module keeps those roles explicit and
// data-only so the compositor can execute a plan instead of deriving policy
// while mutating pixels.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetRestorePlanner',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            surfaceLedgerIds: 'runtime.bitmap.surfaceLedgerIds',
            restoreMaterialContract: 'runtime.bitmap.copiedTargetRestoreMaterial',
            restoreInvariants: 'runtime.bitmap.copiedTargetRestoreInvariants',
        },
        factory({ rectGeometry, surfaceLedgerIds, restoreMaterialContract, restoreInvariants }) {

            const cloneRect = rectGeometry.cloneRect;
            const intersectRects = rectGeometry.intersectRects;
            const rectsOverlap = rectGeometry.rectsOverlap;
            const coverageContainsRect = rectGeometry.coverageContainsRect;
            const parseCopyEdgeOrder = surfaceLedgerIds.parseCopyEdgeOrder;
            const compareOrderKeys = surfaceLedgerIds.compareOrderKeys;
            const normalizeCopiedTargetRestoreMaterial = restoreMaterialContract.normalizeCopiedTargetRestoreMaterial;
            const validateCopiedTargetRestorePlan = restoreInvariants.validateCopiedTargetRestorePlan;

            function createCopiedTargetRestorePlanner(deps = {}) {
                const collectSurfaceReplayPlan = createSurfaceReplayPlanCollector(deps);
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};

                function createRestorePlan(input = {}) {
                    const targetBitmap = input && input.targetBitmap || input && input.target && input.target.targetBitmap || null;
                    const restoreMaterial = normalizeCopiedTargetRestoreMaterial(
                        input && input.restoreMaterial || input && input.targetRestoreMaterial || null,
                        targetBitmap
                    );
                    if (!targetBitmap || !restoreMaterial) return null;
                    const restoreMaterialRect = cloneRect(restoreMaterial.rect);
                    const restoreRect = resolveRestoreTransactionRect(input, restoreMaterialRect);
                    if (!restoreRect) return null;

                    const candidates = dedupeRestoreCandidates(input && input.candidates)
                        .filter((candidate) => isCandidateInsideRestore(candidate, targetBitmap, restoreRect))
                        .sort(compareRestoreCandidates);
                    if (!candidates.length) return null;

                    const candidateCoverageRects = collectCandidateCoverageRects(candidates, restoreRect);
                    const dependencySearchRects = collectDependencySearchRects(input, restoreRect);
                    const surfaceReplayPlan = collectSurfaceReplayPlanForRects(
                        input,
                        restoreMaterial,
                        restoreMaterialRect,
                        restoreRect,
                        dependencySearchRects
                    );
                    const surfaceReplayItems = dedupeSurfaceReplayItems(surfaceReplayPlan.items).sort(compareSurfaceReplayItems);
                    const replayCoverageRects = collectReplayCoverageRects(
                        surfaceReplayItems,
                        surfaceReplayPlan.coverageRects,
                        restoreRect
                    );
                    const requestedMaterialRestoreCoverageRects = collectMaterialRestoreCoverageRects(input, candidates, restoreRect);
                    const survivorCoverageRects = dedupeRects(candidateCoverageRects.concat(replayCoverageRects));
                    const materialRestoreSafety = classifyMaterialRestoreCoverage(
                        requestedMaterialRestoreCoverageRects,
                        survivorCoverageRects
                    );
                    const materialRestoreCoverageRects = materialRestoreSafety.acceptedRects;
                    const rejectedMaterialRestoreCoverageRects = materialRestoreSafety.rejectedRects;
                    const requiredRestoreCoverageRects = dedupeRects(
                        candidateCoverageRects
                            .concat(replayCoverageRects)
                            .concat(materialRestoreCoverageRects)
                    );
                    const restoreCoverageRects = dedupeRects(requiredRestoreCoverageRects);
                    if (!restoreCoverageRects.length) return null;

                    const coverageGaps = collectCoverageGaps(replayCoverageRects, restoreCoverageRects);
                    const plan = {
                        kind: 'copied-target-restore-plan',
                        compositionKey: stringify(input && input.compositionKey || createRestoreCompositionKey(candidates[0])),
                        reason: stringify(input && input.reason || 'copied-target-restore-composition'),
                        targetBitmap,
                        targetSurfaceId: stringify(input && input.targetSurfaceId || restoreMaterial.targetSurfaceId || ''),
                        restoreMaterial,
                        restoreMaterialRect,
                        restoreRect,
                        dependencySearchRects,
                        requestedMaterialRestoreCoverageRects,
                        survivorCoverageRects,
                        materialRestoreCoverageRects,
                        rejectedMaterialRestoreCoverageRects,
                        candidates,
                        seedCandidate: input && input.seedCandidate || candidates.find((candidate) => candidate.seed === true) || candidates[0],
                        skippedCandidates: copySkippedCandidates(input && input.skippedCandidates),
                        candidateCoverageRects,
                        surfaceReplayPlan: createSurfaceReplayPlanSummary(surfaceReplayPlan, surfaceReplayItems, replayCoverageRects),
                        surfaceReplayItems,
                        replayCoverageRects,
                        requiredRestoreCoverageRects,
                        restoreCoverageRects,
                        coverageGaps,
                        executionSteps: {
                            restoreMaterial: restoreCoverageRects.length > 0,
                            replayCopiedSurfaceLayer: surfaceReplayItems.length > 0,
                            drawCopiedTargets: candidates.length > 0,
                            markDirty: true,
                        },
                    };
                    const invariants = validateCopiedTargetRestorePlan(plan);
                    plan.invariants = invariants;
                    plan.diagnostics = createPlanDiagnostics({
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
                        surfaceReplayPlan,
                        surfaceReplayItems,
                        candidates,
                        invariants,
                    });
                    return plan;
                }

                function collectSurfaceReplayPlanForRects(input, restoreMaterial, restoreMaterialRect, restoreRect, searchRects) {
                    const merged = {
                        items: [],
                        coverageRects: [],
                        rejectedOps: [],
                        diagnostics: null,
                        searchProofs: [],
                    };
                    searchRects.forEach((searchRect) => {
                        let result = null;
                        try {
                            result = collectSurfaceReplayPlan(Object.assign({}, input || {}, {
                                restoreMaterial,
                                restoreMaterialRect: cloneRect(restoreMaterialRect),
                                restoreRect: cloneRect(searchRect),
                                restoreCoverageRect: cloneRect(searchRect),
                                dependencySearchRect: cloneRect(searchRect),
                                restoreTransactionRect: cloneRect(restoreRect),
                            }));
                        } catch (error) {
                            reportError('copiedTargetRestorePlanner.collectSurfaceReplayPlan', error);
                            result = null;
                        }
                        const normalized = normalizeSurfaceReplayPlan(result);
                        normalized.items.forEach((item) => merged.items.push(item));
                        normalized.coverageRects.forEach((rect) => merged.coverageRects.push(rect));
                        normalized.rejectedOps.forEach((op) => merged.rejectedOps.push(op));
                        if (normalized.diagnostics) merged.diagnostics = normalized.diagnostics;
                        merged.searchProofs.push({
                            dependencySearchRect: cloneRect(searchRect),
                            itemCount: normalized.items.length,
                            coverageRectCount: normalized.coverageRects.length,
                            rejectedOpCount: normalized.rejectedOps.length,
                        });
                    });
                    merged.coverageRects = dedupeRects(merged.coverageRects);
                    return merged;
                }

                return freezeApi({
                    createRestorePlan,
                    createRestoreCompositionKey,
                    compareRestoreCandidates,
                    dedupeRestoreCandidates,
                });
            }

            function createSurfaceReplayPlanCollector(deps) {
                if (deps && typeof deps.collectSurfaceReplayPlan === 'function') {
                    return deps.collectSurfaceReplayPlan;
                }
                const copiedSurfaceReplay = deps && deps.copiedSurfaceReplay
                    && typeof deps.copiedSurfaceReplay.collectReplayPlanForRestore === 'function'
                    ? deps.copiedSurfaceReplay
                    : null;
                if (copiedSurfaceReplay) {
                    return (input) => copiedSurfaceReplay.collectReplayPlanForRestore(input);
                }
                return () => ({ items: [] });
            }

            function resolveRestoreTransactionRect(input, restoreMaterialRect) {
                const requested = cloneRect(input && input.restoreRect || null);
                if (!requested) return cloneRect(restoreMaterialRect);
                return intersectRects(requested, restoreMaterialRect) || cloneRect(restoreMaterialRect);
            }

            function collectDependencySearchRects(input, restoreRect) {
                const explicit = [];
                if (input && input.dependencySearchRect) explicit.push(input.dependencySearchRect);
                if (Array.isArray(input && input.dependencySearchRects)) {
                    input.dependencySearchRects.forEach((rect) => explicit.push(rect));
                }
                const source = explicit.length ? explicit : [restoreRect];
                return dedupeRects(source
                    .map((rect) => intersectRects(rect, restoreRect))
                    .filter(Boolean));
            }

            function collectCandidateCoverageRects(candidates, restoreRect) {
                const rects = [];
                (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
                    const explicit = collectCandidateRestoreCoverageRects(candidate, restoreRect);
                    const targetBounds = intersectRects(candidate && candidate.targetBounds, restoreRect);
                    if (explicit.length) {
                        explicit.forEach((rect) => rects.push(rect));
                        if (targetBounds && !coverageContainsRect(targetBounds, explicit)) rects.push(targetBounds);
                        return;
                    }
                    if (targetBounds) rects.push(targetBounds);
                });
                return dedupeRects(rects);
            }

            function collectCandidateRestoreCoverageRects(candidate, restoreRect) {
                const rects = [];
                appendCandidateRestoreCoverageRects(rects, candidate);
                appendCandidateRestoreCoverageRects(rects, candidate && candidate.target);
                return dedupeRects(rects
                    .map((rect) => intersectRects(rect, restoreRect))
                    .filter(Boolean));
            }

            function appendCandidateRestoreCoverageRects(output, source) {
                if (!Array.isArray(output) || !source || typeof source !== 'object') return;
                if (source.restoreCoverageRect) output.push(source.restoreCoverageRect);
                if (Array.isArray(source.restoreCoverageRects)) {
                    source.restoreCoverageRects.forEach((rect) => output.push(rect));
                }
            }

            function collectMaterialRestoreCoverageRects(input, candidates, restoreRect) {
                const rects = [];
                appendMaterialRestoreCoverageRects(rects, input);
                (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
                    appendMaterialRestoreCoverageRects(rects, candidate);
                    appendMaterialRestoreCoverageRects(rects, candidate && candidate.target);
                });
                return dedupeRects(rects
                    .map((rect) => intersectRects(rect, restoreRect))
                    .filter(Boolean));
            }

            function classifyMaterialRestoreCoverage(materialRects, survivorCoverageRects) {
                const acceptedRects = [];
                const rejectedRects = [];
                (Array.isArray(materialRects) ? materialRects : []).forEach((rect) => {
                    if (coverageContainsRect(rect, survivorCoverageRects)) {
                        acceptedRects.push(rect);
                    } else {
                        rejectedRects.push(rect);
                    }
                });
                return {
                    acceptedRects: dedupeRects(acceptedRects),
                    rejectedRects: dedupeRects(rejectedRects),
                };
            }

            function appendMaterialRestoreCoverageRects(output, source) {
                if (!Array.isArray(output) || !source || typeof source !== 'object') return;
                if (source.materialRestoreCoverageRect) output.push(source.materialRestoreCoverageRect);
                if (Array.isArray(source.materialRestoreCoverageRects)) {
                    source.materialRestoreCoverageRects.forEach((rect) => output.push(rect));
                }
            }

            function collectReplayCoverageRects(surfaceReplayItems, explicitCoverageRects, restoreRect) {
                const rects = [];
                (Array.isArray(surfaceReplayItems) ? surfaceReplayItems : []).forEach((item) => {
                    const rect = intersectRects(item && item.op && item.op.rect, restoreRect);
                    if (rect) rects.push(rect);
                });
                (Array.isArray(explicitCoverageRects) ? explicitCoverageRects : []).forEach((rect) => {
                    const covered = intersectRects(rect, restoreRect);
                    if (covered) rects.push(covered);
                });
                return dedupeRects(rects);
            }

            function collectCoverageGaps(replayCoverageRects, restoreCoverageRects) {
                return (Array.isArray(replayCoverageRects) ? replayCoverageRects : [])
                    .filter((rect) => !coverageContainsRect(rect, restoreCoverageRects))
                    .map((rect) => ({
                        role: 'copied-surface-replay',
                        rect: cloneRect(rect),
                        reason: 'replay-coverage-not-restored',
                    }));
            }

            function createSurfaceReplayPlanSummary(source, items, replayCoverageRects) {
                return {
                    items: copyReplayItems(items),
                    itemCount: Array.isArray(items) ? items.length : 0,
                    coverageRects: copyRects(replayCoverageRects),
                    coverageRectCount: Array.isArray(replayCoverageRects) ? replayCoverageRects.length : 0,
                    rejectedOps: copyRejectedOps(source && source.rejectedOps),
                    rejectedOpCount: Array.isArray(source && source.rejectedOps) ? source.rejectedOps.length : 0,
                    searchProofs: copySearchProofs(source && source.searchProofs),
                    diagnostics: copyPlainObject(source && source.diagnostics),
                };
            }

            function createPlanDiagnostics(input) {
                const replayItems = Array.isArray(input && input.surfaceReplayItems) ? input.surfaceReplayItems : [];
                const rejectedOps = Array.isArray(input && input.surfaceReplayPlan && input.surfaceReplayPlan.rejectedOps)
                    ? input.surfaceReplayPlan.rejectedOps
                    : [];
                return {
                    dependencySearchCount: rectCount(input && input.dependencySearchRects),
                    requestedMaterialRestoreCoverageCount: rectCount(input && input.requestedMaterialRestoreCoverageRects),
                    survivorCoverageCount: rectCount(input && input.survivorCoverageRects),
                    materialRestoreCoverageCount: rectCount(input && input.materialRestoreCoverageRects),
                    rejectedMaterialRestoreCoverageCount: rectCount(input && input.rejectedMaterialRestoreCoverageRects),
                    candidateCoverageCount: rectCount(input && input.candidateCoverageRects),
                    replayCoverageCount: rectCount(input && input.replayCoverageRects),
                    requiredRestoreCoverageCount: rectCount(input && input.requiredRestoreCoverageRects),
                    restoreCoverageCount: rectCount(input && input.restoreCoverageRects),
                    coverageGapCount: Array.isArray(input && input.coverageGaps) ? input.coverageGaps.length : 0,
                    surfaceReplayItemCount: replayItems.length,
                    surfaceReplayRejectedOpCount: rejectedOps.length,
                    surfaceReplayMethodCounts: countReplayMethods(replayItems),
                    candidateCount: Array.isArray(input && input.candidates) ? input.candidates.length : 0,
                    invariantViolationCount: nonNegativeNumber(input && input.invariants && input.invariants.violationCount, 0),
                    invariantViolationReasons: copyStringNumberMap(input && input.invariants && input.invariants.reasonCounts),
                };
            }

            function normalizeSurfaceReplayPlan(result) {
                if (Array.isArray(result)) {
                    return {
                        items: result,
                        coverageRects: [],
                        rejectedOps: [],
                        diagnostics: null,
                    };
                }
                const source = result && typeof result === 'object' ? result : {};
                return {
                    items: Array.isArray(source.items)
                        ? source.items
                        : (Array.isArray(source.replayItems) ? source.replayItems : []),
                    coverageRects: Array.isArray(source.coverageRects) ? copyRects(source.coverageRects) : [],
                    rejectedOps: Array.isArray(source.rejectedOps) ? source.rejectedOps.slice() : [],
                    diagnostics: source.diagnostics && typeof source.diagnostics === 'object' ? source.diagnostics : null,
                };
            }

            function isCandidateInsideRestore(candidate, targetBitmap, restoreRect) {
                return !!(candidate
                    && candidate.targetBitmap === targetBitmap
                    && candidate.targetBounds
                    && rectsOverlap(candidate.targetBounds, restoreRect));
            }

            function dedupeRestoreCandidates(candidates) {
                const result = [];
                const seen = new Set();
                (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
                    if (!candidate) return;
                    const key = createRestoreCandidateKey(candidate);
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    result.push(candidate);
                });
                return result;
            }

            function createRestoreCandidateKey(candidate) {
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

            function createRestoreCompositionKey(candidate) {
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

            function compareRestoreCandidates(left, right) {
                const orderDelta = compareOrderKeys(getRestoreCandidateOrder(left), getRestoreCandidateOrder(right));
                if (orderDelta !== 0) return orderDelta;
                return compareStrings(left && left.providerToken, right && right.providerToken)
                    || compareStrings(left && left.entryId, right && right.entryId);
            }

            function getRestoreCandidateOrder(candidate) {
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

            function dedupeSurfaceReplayItems(items) {
                const seen = new Set();
                const output = [];
                (Array.isArray(items) ? items : []).forEach((item) => {
                    const key = [
                        stringify(item && item.edgeId || ''),
                        stringify(item && item.replayOpId || ''),
                        rectKey(item && item.op && item.op.rect),
                        stringify(item && item.op && item.op.methodName || ''),
                    ].join('|');
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    output.push(item);
                });
                return output;
            }

            function compareSurfaceReplayItems(left, right) {
                return compareOrderKeys(
                    stringify(left && left.drawOrder || '').split('.').map((part) => nonNegativeNumber(part, 0)),
                    stringify(right && right.drawOrder || '').split('.').map((part) => nonNegativeNumber(part, 0))
                );
            }

            function countReplayMethods(items) {
                const counts = {};
                (Array.isArray(items) ? items : []).forEach((item) => {
                    const methodName = stringify(item && item.op && item.op.methodName || '');
                    if (!methodName) return;
                    counts[methodName] = (counts[methodName] || 0) + 1;
                });
                return counts;
            }

            function dedupeRects(rects) {
                const seen = new Set();
                const output = [];
                (Array.isArray(rects) ? rects : []).forEach((rect) => {
                    const copied = cloneRect(rect);
                    const key = rectKey(copied);
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    output.push(copied);
                });
                return output;
            }

            function copyReplayItems(items) {
                return (Array.isArray(items) ? items : []).map((item) => {
                    if (!item || typeof item !== 'object') return null;
                    return {
                        type: stringify(item.type || ''),
                        drawOrder: stringify(item.drawOrder || ''),
                        copiedSurfaceReplay: item.copiedSurfaceReplay === true,
                        edgeId: stringify(item.edgeId || ''),
                        replayOpId: stringify(item.replayOpId || ''),
                        op: copyReplayOp(item.op),
                    };
                }).filter(Boolean);
            }

            function copyReplayOp(op) {
                if (!op || typeof op !== 'object') return null;
                return {
                    methodName: stringify(op.methodName || ''),
                    rect: cloneRect(op.rect || null),
                    copiedSurfaceReplay: op.copiedSurfaceReplay === true,
                    sourceReplayOpId: stringify(op.sourceReplayOpId || ''),
                };
            }

            function copyRejectedOps(items) {
                return (Array.isArray(items) ? items : []).map((item) => {
                    if (!item || typeof item !== 'object') return null;
                    return {
                        reason: stringify(item.reason || item.rejectedReason || ''),
                        edgeId: stringify(item.edgeId || ''),
                        replayOpId: stringify(item.replayOpId || ''),
                        methodName: stringify(item.methodName || item.op && item.op.methodName || ''),
                        rect: cloneRect(item.rect || item.op && item.op.rect || null),
                    };
                }).filter(Boolean);
            }

            function copySkippedCandidates(candidates) {
                return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
                    if (!candidate || typeof candidate !== 'object') return null;
                    return {
                        providerToken: stringify(candidate.providerToken || ''),
                        reason: stringify(candidate.reason || candidate.skipReason || candidate.copiedTargetSkipReason || ''),
                        entryId: stringify(candidate.entryId || ''),
                        edgeId: stringify(candidate.edgeId || ''),
                        targetSurfaceId: stringify(candidate.targetSurfaceId || ''),
                        targetBounds: cloneRect(candidate.targetBounds || candidate.bounds || null),
                    };
                }).filter(Boolean);
            }

            function copySearchProofs(value) {
                return (Array.isArray(value) ? value : []).map((proof) => {
                    if (!proof || typeof proof !== 'object') return null;
                    return {
                        dependencySearchRect: cloneRect(proof.dependencySearchRect || null),
                        itemCount: nonNegativeNumber(proof.itemCount, 0),
                        coverageRectCount: nonNegativeNumber(proof.coverageRectCount, 0),
                        rejectedOpCount: nonNegativeNumber(proof.rejectedOpCount, 0),
                    };
                }).filter(Boolean);
            }

            function copyRects(rects) {
                return (Array.isArray(rects) ? rects : [])
                    .map((rect) => cloneRect(rect))
                    .filter(Boolean);
            }

            function copyPlainObject(value) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
                const output = {};
                Object.keys(value).forEach((key) => {
                    const item = value[key];
                    if (item === undefined) return;
                    if (item === null || typeof item !== 'object') {
                        output[key] = item;
                    }
                });
                return output;
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

            function rectCount(rects) {
                return Array.isArray(rects) ? rects.length : 0;
            }

            function rectKey(rect) {
                const value = cloneRect(rect);
                return value ? `${value.x1},${value.y1},${value.x2},${value.y2}` : '';
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

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopiedTargetRestorePlanner,
            });
        },
    });
})();
