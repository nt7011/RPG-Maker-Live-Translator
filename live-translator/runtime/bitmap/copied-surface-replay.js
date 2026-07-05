// Copied surface replay projection.
//
// Bitmap blts can move already-rendered non-text pixels from an offscreen
// source to a visible target. This module reconstructs the non-text layer that
// existed on the source at the copy revision, projects it through current copy
// edges, and emits ordinary bitmap replay items for the target compositor.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedSurfaceReplay',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            copyEdgeGeometry: 'runtime.bitmap.copyEdgeGeometry',
            surfaceLedgerIds: 'runtime.bitmap.surfaceLedgerIds',
            copyEdgeState: 'runtime.bitmap.copyEdgeState',
            surfaceReplaySourceCoverage: 'runtime.bitmap.surfaceReplaySourceCoverage',
            surfaceReplayOpProjection: 'runtime.bitmap.surfaceReplayOpProjection',
        },
        factory({ rectGeometry, copyEdgeGeometry, surfaceLedgerIds, copyEdgeState, surfaceReplaySourceCoverage, surfaceReplayOpProjection }) {
            const cloneRect = rectGeometry.cloneRect;
            const intersectRects = rectGeometry.intersectRects;
            const rectsOverlap = rectGeometry.rectsOverlap;
            const projectCopyEdgeSourceRect = copyEdgeGeometry.projectCopyEdgeSourceRect;
            const unprojectCopyEdgeTargetRect = copyEdgeGeometry.unprojectCopyEdgeTargetRect;
            const isCurrentCopyEdgeState = copyEdgeState.isCurrentCopyEdgeState;
            const collectSurvivingReplaySourcePieces = surfaceReplaySourceCoverage.collectSurvivingReplaySourcePieces;
            const parseCopyEdgeOrder = surfaceLedgerIds.parseCopyEdgeOrder;
            const parseReplayOpOrder = surfaceLedgerIds.parseReplayOpOrder;
            const compareOrderKeys = surfaceLedgerIds.compareOrderKeys;

            function createCopiedSurfaceReplayProjector(deps = {}) {
                const getCopyEdgesTo = typeof deps.getCopyEdgesTo === 'function'
                    ? deps.getCopyEdgesTo
                    : () => [];
                const getCopyEdgeState = typeof deps.getCopyEdgeState === 'function'
                    ? deps.getCopyEdgeState
                    : () => null;
                const getCopyEdgeSourceReplayState = typeof deps.getCopyEdgeSourceReplayState === 'function'
                    ? deps.getCopyEdgeSourceReplayState
                    : () => null;
                const getSurfaceById = typeof deps.getSurfaceById === 'function'
                    ? deps.getSurfaceById
                    : () => null;
                const getSurfaceSnapshot = typeof deps.getSurfaceSnapshot === 'function'
                    ? deps.getSurfaceSnapshot
                    : () => null;
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};
                const surfaceReplayOpProjector = surfaceReplayOpProjection.createSurfaceReplayOpProjector({
                    getCopyEdgeSourceReplayState,
                    getSurfaceById: readSurfaceById,
                    reportError,
                });

                function collectReplayPlanForRestore(input = {}) {
                    const plan = createReplayPlan();
                    if (!input || !input.targetBitmap || !input.restoreRect) return plan;
                    const targetSurfaceId = stringify(input.targetSurfaceId || '');
                    const restoreRect = cloneRect(input.restoreRect);
                    if (!restoreRect) return plan;
                    const edges = readCopyEdgesTo(input.targetBitmap);
                    plan.intel.copyEdgeCount = Array.isArray(edges) ? edges.length : 0;
                    if (!Array.isArray(edges) || !edges.length) return plan;
                    edges.forEach((edge) => {
                        const admission = createCopyEdgeReplayAdmission(edge, targetSurfaceId, restoreRect);
                        if (!admission.accepted) {
                            plan.intel.rejectedEdgeCount += 1;
                            return;
                        }
                        plan.intel.currentEdgeCount += 1;
                        materializeReplayItemsForEdge(edge, restoreRect, plan).forEach((item) => {
                            if (item) plan.items.push(item);
                        });
                    });
                    plan.items = dedupeReplayItems(plan.items).sort(compareReplayItems);
                    plan.coverageRects = collectReplayCoverageRects(plan.items, restoreRect);
                    plan.intel.projectedItemCount = plan.items.length;
                    plan.intel.rejectedOpCount = plan.rejectedOps.length;
                    return plan;
                }

                function readCopyEdgesTo(targetBitmap) {
                    try {
                        return getCopyEdgesTo(targetBitmap);
                    } catch (error) {
                        reportError('copiedSurfaceReplay.getCopyEdgesTo', error);
                        return [];
                    }
                }

                function createCopyEdgeReplayAdmission(edge, targetSurfaceId, restoreRect) {
                    if (!edge || !edge.sourceSurfaceId || !edge.targetSurfaceId) {
                        return { accepted: false, reason: 'invalid-copy-edge' };
                    }
                    if (targetSurfaceId && stringify(edge.targetSurfaceId || '') !== targetSurfaceId) {
                        return { accepted: false, reason: 'target-surface-mismatch' };
                    }
                    if (!rectsOverlap(edge.targetRect, restoreRect)) {
                        return { accepted: false, reason: 'edge-outside-restore' };
                    }
                    const state = readCopyEdgeState(edge);
                    if (!isCurrentCopyEdgeState(state)) {
                        return { accepted: false, reason: 'copy-edge-not-current', state };
                    }
                    return { accepted: true, state };
                }

                function readCopyEdgeState(edge) {
                    try {
                        return getCopyEdgeState(edge);
                    } catch (error) {
                        reportError('copiedSurfaceReplay.getCopyEdgeState', error);
                        return null;
                    }
                }

                function materializeReplayItemsForEdge(edge, restoreRect, plan) {
                    const sourceBitmap = readSurfaceById(edge && edge.sourceSurfaceId, { includeDestroyed: true });
                    if (!sourceBitmap) {
                        rejectReplayOp(plan, 'missing-source-surface', edge, null, intersectRects(edge && edge.targetRect, restoreRect));
                        return [];
                    }
                    const sourceSnapshot = readSurfaceSnapshot(sourceBitmap);
                    if (!sourceSnapshot) {
                        rejectReplayOp(plan, 'missing-source-snapshot', edge, null, intersectRects(edge && edge.targetRect, restoreRect));
                        return [];
                    }
                    const replayOps = Array.isArray(sourceSnapshot && sourceSnapshot.replayOps)
                        ? sourceSnapshot.replayOps
                        : [];
                    plan.intel.replayOpCount += replayOps.length;
                    if (!replayOps.length) return [];
                    const items = [];
                    replayOps.forEach((op) => {
                        materializeReplayItems(sourceSnapshot, edge, op, restoreRect, plan).forEach((item) => {
                            if (item) items.push(item);
                        });
                    });
                    return items;
                }

                function readSurfaceById(surfaceId, options = {}) {
                    try {
                        return getSurfaceById(surfaceId, options);
                    } catch (error) {
                        reportError('copiedSurfaceReplay.getSurfaceById', error);
                        return null;
                    }
                }

                function readSurfaceSnapshot(bitmap) {
                    try {
                        return getSurfaceSnapshot(bitmap);
                    } catch (error) {
                        reportError('copiedSurfaceReplay.getSurfaceSnapshot', error);
                        return null;
                    }
                }

                function materializeReplayItems(sourceSnapshot, edge, op, restoreRect, plan) {
                    const opRect = cloneRect(op && op.rect);
                    if (!opRect) {
                        if (surfaceReplayOpProjector.isReplayableSurfaceOp(op)) {
                            rejectReplayOp(plan, 'missing-op-rect', edge, op, null);
                        }
                        return [];
                    }
                    const sourceRectResult = intersectReplaySourceRect(opRect, edge, restoreRect);
                    if (!sourceRectResult.copiedSourceRect) {
                        if (sourceRectResult.rejected === true) {
                            rejectReplayOp(plan, sourceRectResult.reason, edge, op, opRect);
                        }
                        return [];
                    }
                    if (!surfaceReplayOpProjector.isReplayableSurfaceOp(op)) {
                        rejectReplayOp(plan, 'non-replayable-op', edge, op, opRect);
                        return [];
                    }
                    plan.intel.replayableOpCount += 1;
                    const survivingPieces = collectSurvivingReplaySourcePieces({
                        sourceSnapshot,
                        replayOp: op,
                        sourceRect: sourceRectResult.copiedSourceRect,
                        untilRevision: edge && edge.sourceRevision,
                    });
                    if (!survivingPieces.length) {
                        rejectReplayOp(plan, 'source-coverage-not-survived', edge, op, sourceRectResult.copiedSourceRect);
                        return [];
                    }
                    return survivingPieces.map((sourcePiece, index) => {
                        const targetRect = projectCopyEdgeSourceRect(sourcePiece, edge);
                        if (!targetRect || !rectsOverlap(targetRect, restoreRect)) {
                            rejectReplayOp(plan, 'projected-piece-outside-restore', edge, op, targetRect);
                            return null;
                        }
                        const projection = surfaceReplayOpProjector.projectSurfaceReplayOpResult({
                            sourceSnapshot,
                            op,
                            copiedSourceRect: sourcePiece,
                            targetRect,
                            opRect,
                        });
                        if (!projection || projection.accepted !== true || !projection.op) {
                            rejectReplayOp(
                                plan,
                                projection && projection.reason || 'projection-rejected',
                                edge,
                                op,
                                projection && projection.rect || targetRect
                            );
                            return null;
                        }
                        return {
                            type: 'renderOp',
                            drawOrder: createReplayOrder(edge, op, index),
                            copiedSurfaceReplay: true,
                            edgeId: stringify(edge && edge.edgeId || ''),
                            replayOpId: stringify(op && op.replayOpId || ''),
                            op: projection.op,
                        };
                    }).filter(Boolean);
                }

                function intersectReplaySourceRect(opRect, edge, restoreRect) {
                    const edgeSourceRect = cloneRect(edge && edge.sourceRect);
                    const restoreSourceRect = unprojectCopyEdgeTargetRect(restoreRect, edge);
                    if (!opRect) return { copiedSourceRect: null, reason: 'missing-op-rect', rejected: true };
                    if (!edgeSourceRect) return { copiedSourceRect: null, reason: 'missing-edge-source-rect', rejected: true };
                    if (!restoreSourceRect) return { copiedSourceRect: null, reason: 'restore-outside-copy-edge', rejected: true };
                    const edgeIntersection = intersectRects(opRect, edgeSourceRect);
                    if (!edgeIntersection) return { copiedSourceRect: null, reason: 'op-outside-copy-source', rejected: false };
                    const copiedSourceRect = intersectRects(edgeIntersection, restoreSourceRect);
                    return copiedSourceRect
                        ? { copiedSourceRect, reason: '' }
                        : { copiedSourceRect: null, reason: 'op-outside-restore-search', rejected: false };
                }

                return freezeApi({
                    collectReplayPlanForRestore,
                });
            }

            function createReplayPlan() {
                return {
                    items: [],
                    coverageRects: [],
                    rejectedOps: [],
                    intel: {
                        copyEdgeCount: 0,
                        currentEdgeCount: 0,
                        rejectedEdgeCount: 0,
                        replayOpCount: 0,
                        replayableOpCount: 0,
                        projectedItemCount: 0,
                        rejectedOpCount: 0,
                    },
                };
            }

            function rejectReplayOp(plan, reason, edge, op, rect) {
                if (!plan) return;
                plan.rejectedOps.push({
                    reason: stringify(reason || 'replay-op-rejected'),
                    edgeId: stringify(edge && edge.edgeId || ''),
                    replayOpId: stringify(op && op.replayOpId || ''),
                    methodName: stringify(op && op.methodName || ''),
                    rect: cloneRect(rect || null),
                });
            }

            function createReplayOrder(edge, op, sourcePieceIndex = 0) {
                return [
                    nonNegativeNumber(edge && edge.targetRevision, 0),
                    parseCopyEdgeOrder(edge && edge.edgeId),
                    nonNegativeNumber(op && op.revision, 0),
                    parseReplayOpOrder(op && op.replayOpId),
                    nonNegativeNumber(sourcePieceIndex, 0),
                ].join('.');
            }

            function dedupeReplayItems(items) {
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

            function collectReplayCoverageRects(items, restoreRect) {
                return dedupeRects((Array.isArray(items) ? items : [])
                    .map((item) => intersectRects(item && item.op && item.op.rect, restoreRect))
                    .filter(Boolean));
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

            function compareReplayItems(left, right) {
                return compareOrderKeys(
                    stringify(left && left.drawOrder || '').split('.').map((part) => nonNegativeNumber(part, 0)),
                    stringify(right && right.drawOrder || '').split('.').map((part) => nonNegativeNumber(part, 0))
                );
            }

            function rectKey(rect) {
                const normalized = cloneRect(rect);
                return normalized
                    ? `${normalized.x1},${normalized.y1},${normalized.x2},${normalized.y2}`
                    : '';
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function nonNegativeNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return {
                createCopiedSurfaceReplayProjector,
            };
        },
    });
})();
