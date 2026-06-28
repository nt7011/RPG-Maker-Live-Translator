// Surface replay operation projection.
//
// Copied-surface replay works from ledger facts, not from a live canvas guess.
// This module owns the question "can this recorded native non-text operation be
// replayed into another target rect without inventing stale pixels?" Copy-edge
// traversal and damage slicing stay in copied-surface-replay; argument
// projection and live nested-source proof stay here.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.surfaceReplayOpProjection',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            copyEdgeState: 'runtime.bitmap.copyEdgeState',
        },
        factory({ rectGeometry, copyEdgeState }) {

            const cloneRect = rectGeometry.cloneRect;
            const rectFromDimensions = rectGeometry.rectFromDimensions;
            const sameRect = rectGeometry.sameRect;
            const isCurrentCopyEdgeState = copyEdgeState.isCurrentCopyEdgeState;

            function createSurfaceReplayOpProjector(deps = {}) {
                const getCopyEdgeSourceReplayState = typeof deps.getCopyEdgeSourceReplayState === 'function'
                    ? deps.getCopyEdgeSourceReplayState
                    : () => null;
                const getSurfaceById = typeof deps.getSurfaceById === 'function'
                    ? deps.getSurfaceById
                    : () => null;
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};

                function isReplayableSurfaceOp(op) {
                    const traits = op && op.traits && typeof op.traits === 'object' ? op.traits : null;
                    return !!(op
                        && op.methodName
                        && traits
                        && traits.replayable === true
                        && traits.paintsArea === true
                        && traits.nativeText !== true
                        && traits.unsupported !== true);
                }

                function projectSurfaceReplayOpResult(input = {}) {
                    const op = input && input.op || null;
                    const sourceSnapshot = input && input.sourceSnapshot || null;
                    const copiedSourceRect = cloneRect(input && (input.copiedSourceRect || input.sourceRect) || null);
                    const targetRect = cloneRect(input && input.targetRect || null);
                    const opRect = cloneRect(input && input.opRect || op && op.rect || null);
                    const methodName = stringify(op && op.methodName || '');
                    if (!isReplayableSurfaceOp(op)) {
                        return createProjectionRejection('non-replayable-op', op, methodName, targetRect || opRect);
                    }
                    if (!copiedSourceRect || !targetRect || !opRect) {
                        return createProjectionRejection('missing-projection-rect', op, methodName, targetRect || opRect);
                    }
                    if (!canProjectReplayPiece(methodName, copiedSourceRect, opRect)) {
                        return createProjectionRejection('unclippable-partial-op', op, methodName, targetRect);
                    }
                    if (methodName === 'fillAll') {
                        return createProjectionAcceptance(
                            createProjectedReplayOp(op, targetRect, createFillAllReplayArgs(op, targetRect), 'fillRect'),
                            op
                        );
                    }
                    if (isRectFirstReplayMethod(methodName)) {
                        return createProjectionAcceptance(
                            createProjectedReplayOp(op, targetRect, createRectFirstReplayArgs(op, targetRect)),
                            op
                        );
                    }
                    if (methodName === 'blt' || methodName === 'bltImage') {
                        const argsResult = createProjectedBltReplayArgsResult(sourceSnapshot, op, copiedSourceRect, targetRect);
                        if (!argsResult.accepted) {
                            return createProjectionRejection(argsResult.reason, op, methodName, targetRect);
                        }
                        return createProjectionAcceptance(
                            createProjectedReplayOp(op, targetRect, argsResult.args),
                            op
                        );
                    }
                    return createProjectionRejection('unsupported-replay-method', op, methodName, targetRect);
                }

                function createProjectedBltReplayArgsResult(sourceSnapshot, op, copiedSourceRect, targetRect) {
                    const args = Array.isArray(op && op.args) ? op.args : [];
                    const sourceSurfaceId = replaySurfaceArgumentId(args[0]);
                    const sourceImageRect = rectFromDimensions(args[1], args[2], args[3], args[4]);
                    const sourceDestinationRect = rectFromDimensions(args[5], args[6], positiveNumber(args[7], args[3]), positiveNumber(args[8], args[4]));
                    if (!sourceImageRect || !sourceDestinationRect) {
                        return createProjectionArgsRejection('missing-blt-geometry');
                    }
                    const scaleX = (sourceImageRect.x2 - sourceImageRect.x1) / Math.max(1, sourceDestinationRect.x2 - sourceDestinationRect.x1);
                    const scaleY = (sourceImageRect.y2 - sourceImageRect.y1) / Math.max(1, sourceDestinationRect.y2 - sourceDestinationRect.y1);
                    const clippedSourceImageRect = {
                        x1: sourceImageRect.x1 + (copiedSourceRect.x1 - sourceDestinationRect.x1) * scaleX,
                        y1: sourceImageRect.y1 + (copiedSourceRect.y1 - sourceDestinationRect.y1) * scaleY,
                        x2: sourceImageRect.x1 + (copiedSourceRect.x2 - sourceDestinationRect.x1) * scaleX,
                        y2: sourceImageRect.y1 + (copiedSourceRect.y2 - sourceDestinationRect.y1) * scaleY,
                    };
                    const sourceProof = readReplayBltSourceProof(sourceSnapshot, op, sourceSurfaceId, clippedSourceImageRect);
                    if (!sourceProof.live) return createProjectionArgsRejection(sourceProof.reason);
                    const sourceBitmap = resolveReplaySurfaceArgument(args[0]);
                    if (!sourceBitmap) return createProjectionArgsRejection('missing-nested-source');
                    return {
                        accepted: true,
                        args: [
                            sourceBitmap,
                            clippedSourceImageRect.x1,
                            clippedSourceImageRect.y1,
                            clippedSourceImageRect.x2 - clippedSourceImageRect.x1,
                            clippedSourceImageRect.y2 - clippedSourceImageRect.y1,
                            targetRect.x1,
                            targetRect.y1,
                            targetRect.x2 - targetRect.x1,
                            targetRect.y2 - targetRect.y1,
                        ],
                    };
                }

                function readReplayBltSourceProof(sourceSnapshot, op, sourceSurfaceId, sourceRect) {
                    if (!sourceSurfaceId) return { live: false, reason: 'missing-blt-source-surface-id' };
                    const edge = findReplayOpCopyEdge(sourceSnapshot, op, sourceSurfaceId);
                    if (!edge) return { live: false, reason: 'missing-nested-source-copy-edge' };
                    const state = readCopyEdgeSourceReplayState(edge, sourceRect);
                    if (!isCurrentCopyEdgeState(state)) return { live: false, reason: 'stale-nested-source' };
                    return { live: true, reason: '' };
                }

                function findReplayOpCopyEdge(sourceSnapshot, op, sourceSurfaceId) {
                    const mutationId = stringify(op && op.mutationId || '');
                    if (!mutationId) return null;
                    const targetSurfaceId = stringify(sourceSnapshot && sourceSnapshot.surfaceId || '');
                    const expectedSourceSurfaceId = stringify(sourceSurfaceId || '');
                    const edges = Array.isArray(sourceSnapshot && sourceSnapshot.copyEdgesIn)
                        ? sourceSnapshot.copyEdgesIn
                        : [];
                    return edges.find((edge) => {
                        return !!(edge
                            && stringify(edge.createdByMutationId || '') === mutationId
                            && (!targetSurfaceId || stringify(edge.targetSurfaceId || '') === targetSurfaceId)
                            && (!expectedSourceSurfaceId || stringify(edge.sourceSurfaceId || '') === expectedSourceSurfaceId));
                    }) || null;
                }

                function readCopyEdgeSourceReplayState(edge, sourceRect) {
                    try {
                        return getCopyEdgeSourceReplayState(edge, { sourceRect: cloneRect(sourceRect) });
                    } catch (error) {
                        reportError('surfaceReplayOpProjection.getCopyEdgeSourceReplayState', error);
                        return null;
                    }
                }

                function resolveReplaySurfaceArgument(value) {
                    if (!value) return null;
                    if (typeof value === 'object' && value.surfaceId) return readSurfaceById(value.surfaceId);
                    const type = typeof value;
                    return type === 'object' || type === 'function' ? value : null;
                }

                function readSurfaceById(surfaceId) {
                    try {
                        return getSurfaceById(surfaceId);
                    } catch (error) {
                        reportError('surfaceReplayOpProjection.getSurfaceById', error);
                        return null;
                    }
                }

                return freezeApi({
                    isReplayableSurfaceOp,
                    projectSurfaceReplayOpResult,
                });
            }

            function isRectFirstReplayMethod(methodName) {
                return methodName === 'fillRect'
                    || methodName === 'gradientFillRect'
                    || methodName === 'strokeRect';
            }

            function canProjectReplayPiece(methodName, copiedSourceRect, opRect) {
                if (methodName === 'fillRect'
                    || methodName === 'fillAll'
                    || methodName === 'blt'
                    || methodName === 'bltImage') {
                    return true;
                }
                return sameRect(copiedSourceRect, opRect);
            }

            function createFillAllReplayArgs(op, targetRect) {
                const args = Array.isArray(op && op.args) ? op.args.slice() : [];
                return [
                    targetRect.x1,
                    targetRect.y1,
                    targetRect.x2 - targetRect.x1,
                    targetRect.y2 - targetRect.y1,
                    args[0],
                ];
            }

            function createRectFirstReplayArgs(op, targetRect) {
                const args = Array.isArray(op && op.args) ? op.args.slice() : [];
                return [
                    targetRect.x1,
                    targetRect.y1,
                    targetRect.x2 - targetRect.x1,
                    targetRect.y2 - targetRect.y1,
                ].concat(args.slice(4));
            }

            function createProjectedReplayOp(sourceOp, targetRect, args, methodNameOverride = '') {
                const methodName = stringify(methodNameOverride || sourceOp && sourceOp.methodName || '');
                const traits = sourceOp && sourceOp.traits && typeof sourceOp.traits === 'object'
                    ? Object.assign({}, sourceOp.traits, { methodName })
                    : null;
                return {
                    methodName,
                    args,
                    rect: cloneRect(targetRect),
                    traits,
                    sourceBitmap: (methodName === 'blt' || methodName === 'bltImage') && Array.isArray(args)
                        ? args[0] || null
                        : null,
                    copiedSurfaceReplay: true,
                    sourceReplayOpId: stringify(sourceOp && sourceOp.replayOpId || ''),
                };
            }

            function createProjectionAcceptance(op, sourceOp) {
                return {
                    accepted: true,
                    rejected: false,
                    reason: '',
                    op,
                    rect: cloneRect(op && op.rect || null),
                    methodName: stringify(op && op.methodName || ''),
                    replayOpId: stringify(sourceOp && sourceOp.replayOpId || ''),
                };
            }

            function createProjectionRejection(reason, sourceOp, methodName, rect) {
                return {
                    accepted: false,
                    rejected: true,
                    reason: stringify(reason || 'projection-rejected'),
                    op: null,
                    rect: cloneRect(rect || null),
                    methodName: stringify(methodName || sourceOp && sourceOp.methodName || ''),
                    replayOpId: stringify(sourceOp && sourceOp.replayOpId || ''),
                };
            }

            function createProjectionArgsRejection(reason) {
                return {
                    accepted: false,
                    reason: stringify(reason || 'projection-args-rejected'),
                    args: null,
                };
            }

            function replaySurfaceArgumentId(value) {
                return value && typeof value === 'object' && value.surfaceId
                    ? stringify(value.surfaceId || '')
                    : '';
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function positiveNumber(...values) {
                for (let index = 0; index < values.length; index += 1) {
                    const numeric = Number(values[index]);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 1;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createSurfaceReplayOpProjector,
            });
        },
    });
})();
