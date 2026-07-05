// Bitmap render restore geometry.
//
// Builds the data-only restore and clear geometry plans used by window bitmap
// redraw execution. The render planner decides when redraw happens; this module
// owns how clear, snapshot restore, and partial-clear areas are represented.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.renderRestoreGeometry',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
        },
        factory({ rectGeometry }) {

            function createRenderRestoreGeometry(context = {}) {
                const restorePlanner = context.restorePlanner
                    && typeof context.restorePlanner.describeReplayCandidate === 'function'
                    ? context.restorePlanner
                    : null;
                return freezeApi({
                    canUseAreaLocalBackgroundSnapshot,
                    createWindowBitmapClearPlan,
                    createWindowBitmapSnapshotRestorePlan,
                    createSnapshotPartialClearPlan: (input) => createSnapshotPartialClearPlan(input, restorePlanner),
                });
            }

            function createWindowBitmapSnapshotRestorePlan(input = {}) {
                const restorePlan = input.restorePlan || {};
                const snapshot = restorePlan.snapshot || {};
                const freshness = stringify(restorePlan.freshness || snapshot.freshness || '');
                const restoreOptions = restorePlan.restoreOptions && typeof restorePlan.restoreOptions === 'object'
                    ? Object.assign({}, restorePlan.restoreOptions)
                    : null;
                return {
                    active: restorePlan.kind === 'snapshot',
                    restoreOptions,
                    freshness,
                    skippedReason: stringify(snapshot.skippedReason || ''),
                    staleRevision: freshness === 'staleRevision',
                    staleArea: freshness === 'staleArea',
                };
            }

            function createWindowBitmapClearPlan(input = {}) {
                const clearArea = normalizeArea(input.clearArea);
                const restorePlan = input.restorePlan || {};
                const defaultMode = clearArea ? 'clearRect' : 'clear';
                const restoreMode = stringify(restorePlan.clearMode || '');
                const usesRestoreClearMode = restorePlan.kind === 'clear' || restorePlan.kind === 'replay';
                return {
                    mode: usesRestoreClearMode && restoreMode ? restoreMode : defaultMode,
                    snapshotMode: restorePlan.kind === 'snapshot' && restoreMode ? restoreMode : 'snapshot',
                    hasClearArea: !!clearArea,
                    replayAfterClear: !!(restorePlan.replay && restorePlan.replay.applyAfterClear === true),
                };
            }

            function canUseAreaLocalBackgroundSnapshot(input = {}) {
                if (!input.entry || input.pendingInvalidation) return false;
                const targetProof = input.targetProof || null;
                // `contentsRevision` is window-wide. Later unrelated draws can
                // advance it while this entry remains current. Target validation
                // plus pending-invalidation absence is the area-local proof that
                // the snapshot still belongs to the live draw slot.
                return !!(targetProof && targetProof.accepted === true);
            }

            function createSnapshotPartialClearPlan(input = {}, restorePlanner = null) {
                const restorePlan = input.restorePlan || {};
                if (!restorePlan || restorePlan.kind !== 'snapshot') {
                    return createSnapshotPartialClearResult('not-snapshot');
                }
                if (!restorePlan.replay || restorePlan.replay.applyForPartialClear !== true) {
                    return createSnapshotPartialClearResult('partial-clear-replay-disabled');
                }
                const replayBefore = cloneArray(input.replayBefore);
                if (!replayBefore.length) {
                    return createSnapshotPartialClearResult('missing-replay-before');
                }
                const snapshot = input.snapshot || input.entry && input.entry.backgroundSnapshot || null;
                if (snapshot && snapshot.fromNativeTextBackdrop === true) {
                    return createSnapshotPartialClearResult('native-text-backdrop');
                }
                if (!restorePlanner) {
                    return createSnapshotPartialClearResult('replay-descriptor-unavailable');
                }
                const clear = normalizeAreaBounds(input.clearArea);
                const cover = normalizeAreaBounds(snapshot);
                if (!clear || !cover) {
                    return createSnapshotPartialClearResult('missing-clear-or-snapshot-area');
                }
                const candidateAreas = createSnapshotPartialClearCandidates(clear, cover);
                const areas = candidateAreas.filter((area) => {
                    const replay = restorePlanner.describeReplayCandidate(
                        input.entry || null,
                        replayBefore,
                        areaToRect(area),
                        input.targetBitmap || null
                    );
                    return !!(replay
                        && replay.blockedBySelfCopy !== true
                        && replay.coversTarget === true);
                });
                return createSnapshotPartialClearResult(areas.length ? '' : 'no-covered-partial-clear-areas', {
                    areas,
                    candidateAreas: candidateAreas.length,
                    replayAfterClear: areas.length > 0,
                });
            }

            function createSnapshotPartialClearCandidates(clear, cover) {
                return rectGeometry.subtractRect(clear, cover)
                    .map(rectToArea)
                    .filter(Boolean);
            }

            function createSnapshotPartialClearResult(reason = '', input = {}) {
                const areas = Array.isArray(input.areas)
                    ? input.areas.map(normalizeArea).filter(Boolean)
                    : [];
                return {
                    active: areas.length > 0,
                    reason: stringify(reason || ''),
                    areas,
                    candidateAreas: Math.max(0, finiteNumber(input.candidateAreas, 0)),
                    replayAfterClear: input.replayAfterClear === true && areas.length > 0,
                };
            }

            function normalizeArea(value) {
                const area = cloneArea(value);
                if (!area || area.w <= 0 || area.h <= 0) return null;
                return area;
            }

            function normalizeAreaBounds(value) {
                const area = normalizeArea(value);
                if (area) {
                    return rectGeometry.rectFromDimensions(area.x, area.y, area.w, area.h);
                }
                const rect = rectGeometry.cloneRect(value);
                if (!rect || rect.x2 <= rect.x1 || rect.y2 <= rect.y1) return null;
                return rect;
            }

            function areaToRect(area) {
                return normalizeAreaBounds(area);
            }

            function rectToArea(rect) {
                const source = rectGeometry.cloneRect(rect);
                if (!source || source.x2 <= source.x1 || source.y2 <= source.y1) return null;
                return {
                    x: source.x1,
                    y: source.y1,
                    w: source.x2 - source.x1,
                    h: source.y2 - source.y1,
                };
            }

            function cloneArray(value) {
                return Array.isArray(value) ? value.slice() : [];
            }

            function cloneArea(value) {
                if (!value || typeof value !== 'object') return null;
                const x = Number(value.x);
                const y = Number(value.y);
                const w = Number(value.w !== undefined ? value.w : value.width);
                const h = Number(value.h !== undefined ? value.h : value.height);
                if (![x, y, w, h].every(Number.isFinite)) return null;
                return { x, y, w, h };
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

            return { create: createRenderRestoreGeometry };
        },
    });
})();
