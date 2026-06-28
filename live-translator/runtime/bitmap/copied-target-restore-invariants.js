// Copied-target restore plan invariants.
//
// Restore planning has distinct geometry roles: candidate text redraw coverage,
// copied-surface replay coverage, and the actual pixels restored before either
// layer is drawn. This module validates those roles without mutating pixels.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetRestoreInvariants',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
        },
        factory({ rectGeometry }) {

            const cloneRect = rectGeometry.cloneRect;
            const coverageContainsRect = rectGeometry.coverageContainsRect;

            function validateCopiedTargetRestorePlan(plan = {}) {
                const source = plan && typeof plan === 'object' ? plan : {};
                const restoreRect = cloneRect(source.restoreRect);
                const candidateCoverageRects = copyRects(source.candidateCoverageRects);
                const survivorCoverageRects = copyRects(source.survivorCoverageRects);
                const materialRestoreCoverageRects = copyRects(source.materialRestoreCoverageRects);
                const replayCoverageRects = copyRects(source.replayCoverageRects);
                const requiredRestoreCoverageRects = copyRects(source.requiredRestoreCoverageRects);
                const restoreCoverageRects = copyRects(source.restoreCoverageRects);
                const replayItemRects = collectSurfaceReplayItemRects(source.surfaceReplayItems);
                const coverageGaps = copyCoverageGaps(source.coverageGaps);
                const violations = [];

                if (!restoreRect) {
                    pushViolation(violations, 'missing-restore-rect', 'restore', null);
                }
                if (!restoreCoverageRects.length) {
                    pushViolation(violations, 'missing-restore-coverage', 'restore', restoreRect);
                }

                candidateCoverageRects.forEach((rect) => {
                    requireCovered(violations, rect, restoreCoverageRects, 'candidate-coverage-not-restored', 'candidate');
                    requireCovered(violations, rect, [restoreRect], 'candidate-coverage-outside-restore-rect', 'candidate');
                });
                replayCoverageRects.forEach((rect) => {
                    requireCovered(violations, rect, restoreCoverageRects, 'replay-coverage-not-restored', 'copied-surface-replay');
                    requireCovered(violations, rect, [restoreRect], 'replay-coverage-outside-restore-rect', 'copied-surface-replay');
                });
                materialRestoreCoverageRects.forEach((rect) => {
                    requireCovered(violations, rect, restoreCoverageRects, 'material-restore-coverage-not-restored', 'copied-target-material');
                    requireCovered(violations, rect, survivorCoverageRects, 'material-restore-coverage-not-survivable', 'copied-target-material');
                    requireCovered(violations, rect, [restoreRect], 'material-restore-coverage-outside-restore-rect', 'copied-target-material');
                });
                requiredRestoreCoverageRects.forEach((rect) => {
                    requireCovered(violations, rect, restoreCoverageRects, 'required-restore-coverage-not-restored', 'required-restore');
                    requireCovered(violations, rect, [restoreRect], 'required-restore-coverage-outside-restore-rect', 'required-restore');
                });
                restoreCoverageRects.forEach((rect) => {
                    requireCovered(violations, rect, [restoreRect], 'restore-coverage-outside-restore-rect', 'restore');
                });
                replayItemRects.forEach((rect) => {
                    requireCovered(violations, rect, replayCoverageRects, 'surface-replay-item-not-covered', 'copied-surface-replay');
                    requireCovered(violations, rect, restoreCoverageRects, 'surface-replay-item-not-restored', 'copied-surface-replay');
                });
                coverageGaps.forEach((gap) => {
                    if (!gap.rect) return;
                    if (!coverageContainsRect(gap.rect, replayCoverageRects)) {
                        pushViolation(violations, 'coverage-gap-without-replay-coverage', gap.role || 'coverage-gap', gap.rect);
                    }
                    if (coverageContainsRect(gap.rect, restoreCoverageRects)) {
                        pushViolation(violations, 'stale-coverage-gap', gap.role || 'coverage-gap', gap.rect);
                    }
                });

                validateExecutionSteps(source, {
                    candidates: Array.isArray(source.candidates) ? source.candidates : [],
                    restoreCoverageRects,
                    replayItemRects,
                }, violations);

                const reasonCounts = countViolationReasons(violations);
                return {
                    valid: violations.length === 0,
                    violationCount: violations.length,
                    violations,
                    reasonCounts,
                };
            }

            function validateExecutionSteps(plan, coverage, violations) {
                const steps = plan && plan.executionSteps && typeof plan.executionSteps === 'object'
                    ? plan.executionSteps
                    : {};
                requireStep(
                    violations,
                    steps.restoreMaterial === true,
                    coverage.restoreCoverageRects.length > 0,
                    'execution-restore-material-mismatch'
                );
                requireStep(
                    violations,
                    steps.replayCopiedSurfaceLayer === true,
                    coverage.replayItemRects.length > 0,
                    'execution-replay-layer-mismatch'
                );
                requireStep(
                    violations,
                    steps.drawCopiedTargets === true,
                    coverage.candidates.length > 0,
                    'execution-draw-copied-targets-mismatch'
                );
                requireStep(
                    violations,
                    steps.markDirty === true,
                    coverage.restoreCoverageRects.length > 0 || coverage.replayItemRects.length > 0 || coverage.candidates.length > 0,
                    'execution-mark-dirty-mismatch'
                );
            }

            function requireCovered(violations, rect, coverageRects, reason, role) {
                if (!rect) return;
                if (coverageContainsRect(rect, coverageRects)) return;
                pushViolation(violations, reason, role, rect);
            }

            function requireStep(violations, actual, expected, reason) {
                if (actual === expected) return;
                pushViolation(violations, reason, 'execution', null);
            }

            function pushViolation(violations, reason, role, rect) {
                violations.push({
                    reason: stringify(reason || 'restore-plan-invariant-violation'),
                    role: stringify(role || ''),
                    rect: cloneRect(rect),
                });
            }

            function collectSurfaceReplayItemRects(items) {
                return (Array.isArray(items) ? items : [])
                    .map((item) => cloneRect(item && item.op && item.op.rect || null))
                    .filter(Boolean);
            }

            function copyCoverageGaps(value) {
                return (Array.isArray(value) ? value : []).map((gap) => {
                    if (!gap || typeof gap !== 'object') return null;
                    const rect = cloneRect(gap.rect || null);
                    return rect ? {
                        role: stringify(gap.role || ''),
                        reason: stringify(gap.reason || ''),
                        rect,
                    } : null;
                }).filter(Boolean);
            }

            function copyRects(value) {
                return (Array.isArray(value) ? value : [])
                    .map((rect) => cloneRect(rect))
                    .filter(Boolean);
            }

            function countViolationReasons(violations) {
                const counts = {};
                (Array.isArray(violations) ? violations : []).forEach((violation) => {
                    const reason = stringify(violation && violation.reason || '');
                    if (!reason) return;
                    counts[reason] = (counts[reason] || 0) + 1;
                });
                return counts;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                validateCopiedTargetRestorePlan,
            });
        },
    });
})();
