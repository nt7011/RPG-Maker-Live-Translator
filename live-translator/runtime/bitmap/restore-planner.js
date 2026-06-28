// Bitmap restore planner.
//
// Produces data-only restore decisions for translated bitmap redraws. Render
// executors own drawing; this module only chooses which restore material a
// render plan should apply.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.restorePlanner',
        requires: {
            drawGraph: 'runtime.drawGraph',
            rectGeometry: 'runtime.bitmap.rectGeometry',
        },
        factory({ drawGraph, rectGeometry }) {
            const coverageContainsRect = rectGeometry.coverageContainsRect;
            const intersectRects = rectGeometry.intersectRects;
            const rectsOverlap = rectGeometry.rectsOverlap;

            const COVERAGE_EPSILON = 0.5;

            function createRestorePlanner(deps = {}) {
                const isBitmapSurfaceTextEntry = typeof deps.isBitmapSurfaceTextEntry === 'function'
                    ? deps.isBitmapSurfaceTextEntry
                    : defaultIsBitmapSurfaceTextEntry;
                const getReplayItemRect = typeof deps.getReplayItemRect === 'function'
                    ? deps.getReplayItemRect
                    : defaultGetReplayItemRect;
                const isValidRect = typeof deps.isValidRect === 'function'
                    ? deps.isValidRect
                    : defaultIsValidRect;
                const coverageEpsilon = Number.isFinite(Number(deps.coverageEpsilon))
                    ? Math.max(0, Number(deps.coverageEpsilon))
                    : COVERAGE_EPSILON;

                function chooseRestorePlan(input = {}) {
                    const entry = input.entry || null;
                    const targetRect = normalizeTargetRect(input.targetRect || input.replayRect || areaToRect(input.clearArea));
                    const snapshotStatus = input.snapshotStatus || {};
                    const snapshotAvailable = input.snapshotAvailable === true
                        || !!(entry && entry.backgroundSnapshot);
                    const nativeBackdrop = describeNativeBackdropSnapshotCoverage(entry, targetRect);
                    const snapshot = Object.assign(describeSnapshotCandidate(snapshotAvailable, snapshotStatus), {
                        nativeBackdrop,
                    });
                    const replay = describeReplayCandidate(entry, input.replayBefore, targetRect, input.targetBitmap);
                    const patches = describePatchCandidate(input.patches || (entry && entry.backgroundPatches), targetRect);
                    const replayAfterClear = replay.itemCount > 0 && replay.blockedBySelfCopy !== true;

                    if (isBitmapSurfaceTextEntry(entry) && replay.coversTarget) {
                        return createPlan('replay', {
                            clearMode: input.clearArea ? 'clearRectReplay' : 'clearReplay',
                            freshness: 'reconstructed',
                            replay: Object.assign({}, replay, {
                                applyAfterClear: true,
                                applyForPartialClear: true,
                            }),
                            snapshot,
                            patches,
                            source: 'replay',
                            steps: ['clear', 'replay'],
                        });
                    }

                    if (input.allowPatches === true && patches.available) {
                        return createPlan('patches', {
                            clearMode: input.clearArea
                                ? (replayAfterClear ? 'clearRectPatchReplay' : 'clearRectPatch')
                                : (replayAfterClear ? 'clearPatchReplay' : 'clearPatch'),
                            freshness: patches.coversTarget ? 'captured' : 'partial',
                            replay: Object.assign({}, replay, {
                                applyAfterClear: replayAfterClear,
                                applyForPartialClear: replayAfterClear,
                            }),
                            snapshot,
                            patches: Object.assign({}, patches, { apply: true }),
                            source: 'patches',
                            steps: replayAfterClear ? ['clear', 'patches', 'replay'] : ['clear', 'patches'],
                        });
                    }

                    if (snapshotStatus.usable === true) {
                        return createPlan('snapshot', {
                            clearMode: 'snapshot',
                            freshness: 'fresh',
                            replay: Object.assign({}, replay, {
                                applyAfterClear: false,
                                applyForPartialClear: replayAfterClear,
                            }),
                            snapshot: Object.assign({}, snapshot, { freshness: 'fresh' }),
                            patches,
                            source: 'snapshot',
                            steps: ['snapshot'],
                        });
                    }

                    if (snapshotStatus.reason === 'staleRevision' && input.allowStaleRevision === true) {
                        return createPlan('snapshot', {
                            clearMode: 'snapshotStaleRevision',
                            freshness: 'staleRevision',
                            replay: Object.assign({}, replay, {
                                applyAfterClear: false,
                                applyForPartialClear: replayAfterClear,
                            }),
                            restoreOptions: { allowStaleRevision: true },
                            snapshot: Object.assign({}, snapshot, { freshness: 'staleRevision' }),
                            patches,
                            source: 'snapshot',
                            steps: ['snapshot'],
                        });
                    }

                    if (snapshotStatus.reason === 'staleArea'
                        && nativeBackdrop.trusted === true
                        && nativeBackdrop.coversTarget === true) {
                        return createPlan('snapshot', {
                            clearMode: 'snapshotStaleArea',
                            freshness: 'staleArea',
                            replay: Object.assign({}, replay, {
                                applyAfterClear: false,
                                applyForPartialClear: replayAfterClear,
                            }),
                            restoreOptions: { allowStaleArea: true },
                            snapshot: Object.assign({}, snapshot, { freshness: 'staleArea' }),
                            patches,
                            source: 'snapshot',
                            steps: ['snapshot'],
                        });
                    }

                    return createPlan('clear', {
                        clearMode: input.clearArea ? 'clearRect' : 'clear',
                        freshness: 'none',
                        replay: Object.assign({}, replay, {
                            applyAfterClear: replayAfterClear,
                            applyForPartialClear: false,
                        }),
                        snapshot,
                        patches,
                        source: 'clear',
                        steps: replayAfterClear ? ['clear', 'replay'] : ['clear'],
                    });
                }

                function describeNativeBackdropSnapshotCoverage(entry, targetRect) {
                    const snapshot = entry && entry.backgroundSnapshot;
                    const snapshotRect = nativeBackdropSnapshotToRect(snapshot);
                    const target = normalizeTargetRect(targetRect);
                    const trusted = !!(snapshot
                        && snapshot.fromNativeTextBackdrop === true
                        && snapshot.trusted === true);
                    return {
                        available: !!snapshot,
                        fromNativeTextBackdrop: !!(snapshot && snapshot.fromNativeTextBackdrop === true),
                        trusted,
                        targetAvailable: !!target,
                        snapshotRectAvailable: !!snapshotRect,
                        coverageRects: snapshotRect ? 1 : 0,
                        coversTarget: !!(trusted
                            && target
                            && snapshotRect
                            && coverageContainsRect(target, [snapshotRect], { coverageEpsilon })),
                    };
                }

                function nativeBackdropSnapshotToRect(snapshot) {
                    if (!snapshot || snapshot.fromNativeTextBackdrop !== true) return null;
                    const x = finiteNumber(snapshot.x, 0);
                    const y = finiteNumber(snapshot.y, 0);
                    const w = positiveNumber(snapshot.w, snapshot.width);
                    const h = positiveNumber(snapshot.h, snapshot.height);
                    if (w <= 0 || h <= 0) return null;
                    return normalizeTargetRect({ x1: x, y1: y, x2: x + w, y2: y + h });
                }

                function describeReplayCandidate(entry, items, targetRect, targetBitmap = null) {
                    const target = normalizeTargetRect(targetRect);
                    const list = Array.isArray(items) ? items : [];
                    const graph = drawGraph.createDrawGraph(list, {
                        getItemRect: getReplayItemRect,
                        targetBitmap: targetBitmap || (entry && entry.contentsBitmap) || (entry && entry.bitmap) || null,
                    });
                    if (!target || !list.length) {
                        return {
                            applyAfterClear: false,
                            applyForPartialClear: false,
                            blockedBySelfCopy: false,
                            coverageRects: 0,
                            coversTarget: false,
                            freshness: 'none',
                            itemCount: list.length,
                        };
                    }
                    const coverageRects = graph.nodes.filter((node) => node && node.coversArea && node.replayable && node.rect).length;
                    if (graph.nodes.some((node) => node && node.copiesSelf)) {
                        return {
                            applyAfterClear: false,
                            applyForPartialClear: false,
                            blockedBySelfCopy: true,
                            coverageRects,
                            coversTarget: false,
                            freshness: 'unsafe',
                            itemCount: list.length,
                        };
                    }
                    return {
                        applyAfterClear: false,
                        applyForPartialClear: false,
                        blockedBySelfCopy: false,
                        coverageRects,
                        coversTarget: drawGraph.coverageContainsRect(graph.nodes, target, { coverageEpsilon }),
                        freshness: coverageRects ? 'reconstructed' : 'none',
                        itemCount: list.length,
                    };
                }

                function describePatchCandidate(patches, targetRect) {
                    const list = normalizePatches(patches);
                    const target = normalizeTargetRect(targetRect);
                    const coverage = list
                        .map((patch) => patch.rect)
                        .filter(Boolean);
                    return {
                        apply: false,
                        available: list.length > 0,
                        count: list.length,
                        coverageRects: coverage.length,
                        coversTarget: !!(target && coverageContainsRect(target, coverage, { coverageEpsilon })),
                        freshness: list.length ? 'captured' : 'none',
                    };
                }

                function normalizePatches(patches) {
                    const list = Array.isArray(patches) ? patches : [];
                    return list
                        .map((patch) => {
                            if (patch && patch.trusted === false) return null;
                            const rect = patchToRect(patch);
                            return rect ? { patch, rect } : null;
                        })
                        .filter(Boolean);
                }

                function patchToRect(patch) {
                    if (!patch || !patch.bitmap) return null;
                    const width = positiveNumber(patch.width, patch.bitmap && patch.bitmap.width);
                    const height = positiveNumber(patch.height, patch.bitmap && patch.bitmap.height);
                    if (width <= 0 || height <= 0) return null;
                    const x = finiteNumber(patch.x, 0);
                    const y = finiteNumber(patch.y, 0);
                    return normalizeTargetRect({ x1: x, y1: y, x2: x + width, y2: y + height });
                }

                function restorePatches(targetBitmap, patches, options = {}) {
                    if (!targetBitmap || typeof targetBitmap.blt !== 'function') return 0;
                    const targetRect = normalizeTargetRect(options.targetRect || null);
                    let restored = 0;
                    normalizePatches(patches).forEach(({ patch, rect }) => {
                        if (targetRect && !rectsOverlap(targetRect, rect)) return;
                        const restoreRect = targetRect ? intersectRects(rect, targetRect) : rect;
                        if (!restoreRect) return;
                        const width = restoreRect.x2 - restoreRect.x1;
                        const height = restoreRect.y2 - restoreRect.y1;
                        const sx = restoreRect.x1 - rect.x1;
                        const sy = restoreRect.y1 - rect.y1;
                        try {
                            targetBitmap.blt(patch.bitmap, sx, sy, width, height, restoreRect.x1, restoreRect.y1, width, height);
                            restored += 1;
                        } catch (_) {}
                    });
                    return restored;
                }

                function normalizeTargetRect(rect) {
                    if (!isValidRect(rect)) return null;
                    const x1 = Number(rect.x1);
                    const y1 = Number(rect.y1);
                    const x2 = Number(rect.x2);
                    const y2 = Number(rect.y2);
                    if (![x1, y1, x2, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) return null;
                    return { x1, y1, x2, y2 };
                }

                return {
                    chooseRestorePlan,
                    describePatchCandidate,
                    describeReplayCandidate,
                    restorePatches,
                };
            }

            function createPlan(kind, input = {}) {
                const steps = Array.isArray(input.steps) ? input.steps.slice() : [];
                return {
                    kind,
                    source: input.source || kind,
                    clearMode: input.clearMode || kind,
                    freshness: input.freshness || 'none',
                    restoreOptions: input.restoreOptions || null,
                    replay: input.replay || null,
                    snapshot: input.snapshot || null,
                    patches: input.patches || null,
                    restoreSemantics: {
                        clear: steps.indexOf('clear') >= 0,
                        patches: steps.indexOf('patches') >= 0,
                        replayAfterClear: steps.indexOf('replay') >= 0,
                        snapshot: steps.indexOf('snapshot') >= 0,
                    },
                    steps,
                };
            }

            function describeSnapshotCandidate(snapshotAvailable, snapshotStatus) {
                const usable = snapshotStatus && snapshotStatus.usable === true;
                const reason = String(snapshotStatus && snapshotStatus.reason || '');
                return {
                    available: snapshotAvailable === true,
                    usable,
                    freshness: usable ? 'fresh' : (reason || 'unusable'),
                    skippedReason: snapshotAvailable === true && !usable ? (reason || 'unusable') : '',
                };
            }

            function areaToRect(area) {
                if (!area) return null;
                const x = Number(area.x);
                const y = Number(area.y);
                const w = Number(area.w !== undefined ? area.w : area.width);
                const h = Number(area.h !== undefined ? area.h : area.height);
                if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
                return { x1: x, y1: y, x2: x + w, y2: y + h };
            }

            function finiteNumber(...values) {
                for (let i = 0; i < values.length; i += 1) {
                    const numeric = Number(values[i]);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

            function positiveNumber(...values) {
                for (let i = 0; i < values.length; i += 1) {
                    const numeric = Number(values[i]);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 0;
            }

            function defaultIsBitmapSurfaceTextEntry(entry) {
                const origin = entry && entry.drawOrigin;
                return !!(origin && origin.type === 'bitmapSurface');
            }

            function defaultGetReplayItemRect(item) {
                if (item && item.type === 'renderOp' && item.op) return item.op.rect || null;
                if (item && item.type === 'windowText' && item.entry) return item.entry.bounds || null;
                return null;
            }

            function defaultIsValidRect(rect) {
                return !!(rect
                    && Number.isFinite(Number(rect.x1))
                    && Number.isFinite(Number(rect.y1))
                    && Number.isFinite(Number(rect.x2))
                    && Number.isFinite(Number(rect.y2)));
            }

            return { create: createRestorePlanner };
        },
    });
})();
