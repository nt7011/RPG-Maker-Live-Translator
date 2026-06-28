// Copied-target text materialization.
//
// Copy lineage projects text through copy edges. This module owns the service
// query boundary around that projection: resolving source runs from ledger
// snapshots, proving current target surfaces for committed edges, constructing
// pending copy edges before native copy completion, and resolving live surface
// handles/materials for adapter renderers.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetMaterialization',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            copyEdgeState: 'runtime.bitmap.copyEdgeState',
            copyLineage: 'runtime.bitmap.copyLineage',
            copiedTextProjection: 'runtime.bitmap.copiedTextProjection',
        },
        factory({ rectGeometry, copyEdgeState, copyLineage, copiedTextProjection }) {

            const cloneRect = rectGeometry.cloneRect;
            const isCurrentCopyEdgeState = copyEdgeState.isCurrentCopyEdgeState;
            const copyCopiedTextProjectionRecord = copiedTextProjection.copyCopiedTextProjectionRecord;

            function createCopiedTargetMaterializer(deps = {}) {
                const getSurfaceSnapshot = typeof deps.getSurfaceSnapshot === 'function'
                    ? deps.getSurfaceSnapshot
                    : () => null;
                const ensureSurfaceRecord = typeof deps.ensureSurfaceRecord === 'function'
                    ? deps.ensureSurfaceRecord
                    : () => null;
                const getSurfaceIdentity = typeof deps.getSurfaceIdentity === 'function'
                    ? deps.getSurfaceIdentity
                    : () => null;
                const getSurfaceById = typeof deps.getSurfaceById === 'function'
                    ? deps.getSurfaceById
                    : () => null;
                const getCopyEdgeState = typeof deps.getCopyEdgeState === 'function'
                    ? deps.getCopyEdgeState
                    : () => null;
                const getRecoverableProjectionStatesForTarget = typeof deps.getRecoverableProjectionStatesForTarget === 'function'
                    ? deps.getRecoverableProjectionStatesForTarget
                    : () => [];
                const resolveTargetRestoreMaterial = typeof deps.resolveTargetRestoreMaterial === 'function'
                    ? deps.resolveTargetRestoreMaterial
                    : () => null;
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};

                function getCopiedTextTargetMaterializations(sourceBitmap, input = {}) {
                    try {
                        const source = input && typeof input === 'object' ? input : { runId: input };
                        const sourceSnapshot = safeGetSurfaceSnapshot(sourceBitmap);
                        if (!sourceSnapshot) return [];
                        const textRun = resolveSurfaceTextRun(sourceSnapshot, source);
                        if (!textRun) return [];
                        const userResolver = source.resolveSurface || source.surfaceResolver;
                        const copyEdges = getCurrentCopyEdgesOut(sourceSnapshot);
                        return materializeFromCopyEdges(sourceBitmap, sourceSnapshot, textRun, copyEdges, source, {
                            resolveSurface(surfaceId, projection, role) {
                                if (role === 'source' || surfaceId === sourceSnapshot.surfaceId) {
                                    return source.sourceSurface || source.sourceBitmap || sourceBitmap;
                                }
                                const ledgerSurface = safeGetSurfaceById(surfaceId);
                                if (ledgerSurface) return ledgerSurface;
                                if (typeof userResolver === 'function') return userResolver(surfaceId, projection, role);
                                return null;
                            },
                        });
                    } catch (error) {
                        reportError('copiedTargetMaterialization.current', error);
                        return [];
                    }
                }

                function getPendingCopiedTextTargetMaterializations(sourceBitmap, input = {}) {
                    try {
                        const source = input && typeof input === 'object' ? input : { runId: input };
                        let sourceSnapshot = safeGetSurfaceSnapshot(sourceBitmap);
                        if (!sourceSnapshot && hasExplicitTextRunInput(source)) {
                            sourceSnapshot = safeEnsureSurfaceRecord(sourceBitmap, createSurfaceRecordInputFromExplicitRun(source));
                        }
                        if (!sourceSnapshot) return [];
                        const targetBitmap = source.targetBitmap || source.targetSurface || source.target || null;
                        const targetIdentity = safeGetSurfaceIdentity(targetBitmap);
                        if (!targetIdentity) return [];
                        const textRun = resolveSurfaceTextRun(sourceSnapshot, source);
                        if (!textRun) return [];
                        const sourceRect = cloneRect(source.sourceRect || null);
                        const targetRect = cloneRect(source.targetRectAfterCopy || source.targetRect || source.rect || null);
                        if (!sourceRect || !targetRect) return [];
                        const userResolver = source.resolveSurface || source.surfaceResolver;
                        const pendingEdge = createPendingCopyEdge(source, sourceSnapshot, targetIdentity, textRun, sourceRect, targetRect);
                        return materializeFromCopyEdges(sourceBitmap, sourceSnapshot, textRun, [pendingEdge], source, {
                            targetBitmap,
                            resolveSurface(surfaceId, projection, role) {
                                if (role === 'source' || surfaceId === sourceSnapshot.surfaceId) return sourceBitmap;
                                if (surfaceId === targetIdentity.surfaceId) return targetBitmap;
                                if (typeof userResolver === 'function') return userResolver(surfaceId, projection, role);
                                return null;
                            },
                        });
                    } catch (error) {
                        reportError('copiedTargetMaterialization.pending', error);
                        return [];
                    }
                }

                function getProjectedTextRunsForTarget(targetBitmap, input = {}) {
                    try {
                        const source = input && typeof input === 'object' ? input : {};
                        const targetSnapshot = safeGetSurfaceSnapshot(targetBitmap);
                        if (!targetSnapshot) return [];
                        const targetRect = cloneRect(source.targetRect || source.restoreRect || source.rect || null);
                        const copyEdges = getCurrentCopyEdgesIn(targetSnapshot, targetRect);
                        if (!copyEdges.length) return [];
                        return projectTextRunsForTargetEdges(targetBitmap, targetSnapshot, copyEdges, source);
                    } catch (error) {
                        reportError('copiedTargetMaterialization.projectedTargetRuns', error);
                        return [];
                    }
                }

                function resolveRecoverableProjectedRuns(targetBitmap, input = {}) {
                    try {
                        const source = input && typeof input === 'object' ? input : {};
                        const targetSnapshot = safeGetSurfaceSnapshot(targetBitmap);
                        if (!targetSnapshot) return [];
                        const projectionStates = safeGetRecoverableProjectionStatesForTarget(targetBitmap, source);
                        if (!projectionStates.length) return [];
                        return projectTextRunsForTargetEdges(targetBitmap, targetSnapshot, projectionStates, source);
                    } catch (error) {
                        reportError('copiedTargetMaterialization.recoverableProjectedRuns', error);
                        return [];
                    }
                }

                function projectTextRunsForTargetEdges(targetBitmap, targetSnapshot, copyEdges, source) {
                    const projected = [];
                    copyEdges.forEach((edge) => {
                        const sourceBitmap = safeGetSurfaceById(edge.sourceSurfaceId);
                        const liveSourceSnapshot = sourceBitmap ? safeGetSurfaceSnapshot(sourceBitmap) : null;
                        const edgeTextRuns = copyTextRuns(edge && edge.sourceTextRuns);
                        const liveTextRuns = Array.isArray(liveSourceSnapshot && liveSourceSnapshot.textRuns)
                            ? liveSourceSnapshot.textRuns
                            : [];
                        const textRuns = edgeTextRuns.length ? edgeTextRuns : liveTextRuns;
                        const sourceSnapshot = createProjectionSourceSnapshot(edge, liveSourceSnapshot, textRuns);
                        const resolvedTextRuns = Array.isArray(sourceSnapshot && sourceSnapshot.textRuns)
                            ? sourceSnapshot.textRuns
                            : [];
                        resolvedTextRuns.forEach((textRun) => {
                            materializeFromCopyEdges(sourceBitmap, sourceSnapshot, textRun, [edge], source, {
                                targetBitmap,
                                resolveSurface(surfaceId, projection, role) {
                                    if (role === 'source' || surfaceId === sourceSnapshot.surfaceId) return sourceBitmap || null;
                                    if (surfaceId === targetSnapshot.surfaceId) return targetBitmap;
                                    return safeGetSurfaceById(surfaceId);
                                },
                            }).forEach((target) => {
                                const projectionRecord = findProjectedTargetRecord(edge, textRun, target);
                                projected.push(createProjectedTextRunRecord(textRun, target, edge, sourceBitmap, targetBitmap, projectionRecord));
                            });
                        });
                    });
                    return projected;
                }

                function materializeFromCopyEdges(sourceBitmap, sourceSnapshot, textRun, copyEdges, source, options = {}) {
                    return copyLineage.materializeCopiedTextTargets(Object.assign({}, source, {
                        sourceSurfaceId: sourceSnapshot.surfaceId,
                        sourceSurface: source.sourceSurface || source.sourceBitmap || sourceBitmap,
                        sourceBitmap: source.sourceBitmap || source.sourceSurface || sourceBitmap,
                        targetBitmap: options.targetBitmap || source.targetBitmap || source.targetSurface || source.target || null,
                        textRun,
                        copyEdges,
                        includePartial: source.includePartial === true,
                        resolveSurface: options.resolveSurface,
                        resolveTargetRestoreMaterial(materialId, projection) {
                            return resolveTargetRestoreMaterial(materialId, projection);
                        },
                    }));
                }

                function getCurrentCopyEdgesIn(snapshot, targetRect) {
                    const edges = Array.isArray(snapshot && snapshot.copyEdgesIn) ? snapshot.copyEdgesIn : [];
                    return edges.filter((edge) => {
                        if (!isCurrentCopyEdgeTarget(edge)) return false;
                        if (!targetRect) return true;
                        return rectsOverlap(targetRect, edge && edge.targetRect || null);
                    });
                }

                function getCurrentCopyEdgesOut(snapshot) {
                    const edges = Array.isArray(snapshot && snapshot.copyEdgesOut) ? snapshot.copyEdgesOut : [];
                    return edges.filter(isCurrentCopyEdgeTarget);
                }

                function isCurrentCopyEdgeTarget(edge) {
                    if (!edge || !edge.targetSurfaceId) return false;
                    const targetBitmap = safeGetSurfaceById(edge.targetSurfaceId);
                    if (!targetBitmap) return false;
                    const targetIdentity = safeGetSurfaceIdentity(targetBitmap);
                    if (!targetIdentity) return false;
                    if (stringify(targetIdentity.surfaceId || '') !== stringify(edge.targetSurfaceId || '')) return false;
                    return isCurrentCopyEdgeState(safeGetCopyEdgeState(edge));
                }

                function safeGetSurfaceSnapshot(bitmap) {
                    try {
                        return getSurfaceSnapshot(bitmap);
                    } catch (error) {
                        reportError('copiedTargetMaterialization.getSurfaceSnapshot', error);
                        return null;
                    }
                }

                function safeEnsureSurfaceRecord(bitmap, input) {
                    try {
                        return ensureSurfaceRecord(bitmap, input);
                    } catch (error) {
                        reportError('copiedTargetMaterialization.ensureSurfaceRecord', error);
                        return null;
                    }
                }

                function safeGetSurfaceIdentity(bitmap) {
                    try {
                        return getSurfaceIdentity(bitmap);
                    } catch (error) {
                        reportError('copiedTargetMaterialization.getSurfaceIdentity', error);
                        return null;
                    }
                }

                function safeGetSurfaceById(surfaceId) {
                    try {
                        return getSurfaceById(surfaceId);
                    } catch (error) {
                        reportError('copiedTargetMaterialization.getSurfaceById', error);
                        return null;
                    }
                }

                function safeGetCopyEdgeState(edge) {
                    try {
                        return getCopyEdgeState(edge);
                    } catch (error) {
                        reportError('copiedTargetMaterialization.getCopyEdgeState', error);
                        return null;
                    }
                }

                function safeGetRecoverableProjectionStatesForTarget(targetBitmap, input) {
                    try {
                        const states = getRecoverableProjectionStatesForTarget(targetBitmap, input);
                        return Array.isArray(states) ? states : [];
                    } catch (error) {
                        reportError('copiedTargetMaterialization.getRecoverableProjectionStatesForTarget', error);
                        return [];
                    }
                }

                return freezeApi({
                    getCopiedTextTargetMaterializations,
                    getPendingCopiedTextTargetMaterializations,
                    getProjectedTextRunsForTarget,
                    resolveRecoverableProjectedRuns,
                });
            }

            function createProjectionSourceSnapshot(edge, liveSourceSnapshot, textRuns) {
                if (liveSourceSnapshot && typeof liveSourceSnapshot === 'object') {
                    return Object.assign({}, liveSourceSnapshot, {
                        textRuns: copyTextRuns(textRuns),
                    });
                }
                return {
                    surfaceId: stringify(edge && edge.sourceSurfaceId || ''),
                    revision: nonNegativeNumber(edge && edge.sourceRevision, 0),
                    generation: nonNegativeNumber(edge && edge.sourceGeneration, 0),
                    textRuns: copyTextRuns(textRuns),
                    copyEdgesOut: edge ? [edge] : [],
                };
            }

            function findProjectedTargetRecord(edge, textRun, target) {
                const records = Array.isArray(edge && edge.projectedTargetRecords)
                    ? edge.projectedTargetRecords
                    : [];
                if (!records.length) return null;
                return records.find((record) => isProjectedTargetRecordForTextRun(record, textRun, target)) || null;
            }

            function isProjectedTargetRecordForTextRun(record, textRun, target) {
                if (!record || !textRun) return false;
                const runId = stringify(textRun.runId || '');
                const slotKey = stringify(textRun.slotKey || '');
                if (runId && stringify(record.sourceRunId || '') === runId) return true;
                if (slotKey && stringify(record.sourceSlotKey || '') === slotKey) return true;
                const targetBounds = cloneRect(target && (target.targetBounds || target.bounds));
                const recordBounds = cloneRect(record.targetBounds || record.bounds || null);
                return !!(targetBounds && recordBounds
                    && Number(targetBounds.x1) === Number(recordBounds.x1)
                    && Number(targetBounds.y1) === Number(recordBounds.y1)
                    && Number(targetBounds.x2) === Number(recordBounds.x2)
                    && Number(targetBounds.y2) === Number(recordBounds.y2));
            }

            function createProjectedTextRunRecord(textRun, target, edge, sourceBitmap, targetBitmap, projectionRecord = null) {
                const sourceBounds = cloneRect(target && target.sourceBounds || textRun && textRun.bounds);
                const targetBounds = cloneRect(target && (target.targetBounds || target.bounds));
                const renderedText = stringify(projectionRecord && projectionRecord.renderedText || '');
                const displayText = stringify(projectionRecord && projectionRecord.displayText || renderedText);
                return {
                    projectionId: [
                        stringify(edge && edge.edgeId || target && target.edgeId || ''),
                        stringify(textRun && textRun.runId || target && target.sourceRunId || ''),
                    ].join(':'),
                    edgeId: stringify(edge && edge.edgeId || target && target.edgeId || ''),
                    sourceSurfaceId: stringify(edge && edge.sourceSurfaceId || target && target.sourceSurfaceId || ''),
                    targetSurfaceId: stringify(edge && edge.targetSurfaceId || target && target.targetSurfaceId || ''),
                    sourceRunId: stringify(textRun && textRun.runId || target && target.sourceRunId || ''),
                    sourceSlotKey: stringify(textRun && textRun.slotKey || target && target.sourceSlotKey || ''),
                    sourceRevision: nonNegativeNumber(textRun && textRun.revision, target && target.sourceRevision, 0),
                    targetRevision: nonNegativeNumber(edge && edge.targetRevision, target && target.targetRevision, 0),
                    projectionStatus: stringify(edge && (edge.projectionStatus || edge.status) || ''),
                    recoverable: edge && edge.recoverable === true,
                    sourceBitmap: sourceBitmap || null,
                    targetBitmap: targetBitmap || target && target.targetBitmap || null,
                    sourceTextRun: copyTextRun(textRun),
                    sourceBounds,
                    targetBounds,
                    bounds: cloneRect(targetBounds),
                    providerToken: stringify(projectionRecord && projectionRecord.providerToken || ''),
                    sourceAdapter: stringify(projectionRecord && projectionRecord.sourceAdapter || ''),
                    entryId: stringify(projectionRecord && projectionRecord.entryId || ''),
                    renderedText,
                    displayText,
                    displayTextSource: stringify(
                        projectionRecord && projectionRecord.displayTextSource
                        || (displayText && renderedText ? 'translated' : '')
                    ),
                    drawGeometry: clonePlainValue(projectionRecord && projectionRecord.drawGeometry || null),
                    drawState: projectionRecord && projectionRecord.drawState
                        ? copyPlainObject(projectionRecord.drawState)
                        : copyPlainObject(textRun && textRun.drawState || null),
                    sourceDrawOrder: nonNegativeNumber(projectionRecord && projectionRecord.sourceDrawOrder, 0),
                    textType: stringify(projectionRecord && projectionRecord.textType || ''),
                    methodName: stringify(projectionRecord && projectionRecord.methodName || target && target.methodName || ''),
                    projectionRecord: copyProjectedTargetRecord(projectionRecord),
                    materialization: target || null,
                };
            }

            function createPendingCopyEdge(source, sourceSnapshot, targetIdentity, textRun, sourceRect, targetRect) {
                return {
                    edgeId: stringify(source.edgeId || source.pendingEdgeId || 'pending-copy'),
                    sourceSurfaceId: sourceSnapshot.surfaceId,
                    targetSurfaceId: targetIdentity.surfaceId,
                    sourceRect,
                    targetRect,
                    sourceRevision: Math.max(
                        nonNegativeNumber(sourceSnapshot.revision, 0),
                        nonNegativeNumber(textRun && textRun.revision, 0)
                    ),
                    targetRevision: nonNegativeNumber(targetIdentity.revision, 0),
                    sourceGeneration: nonNegativeNumber(sourceSnapshot.generation, 0),
                    targetGeneration: nonNegativeNumber(targetIdentity.generation, 0),
                    createdByMutationId: stringify(source.mutationId || source.createdByMutationId || ''),
                    targetRestoreMaterialId: stringify(source.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(source.targetRestoreRect || null),
                    targetRestoreRevisionBefore: optionalNonNegativeNumber(source.targetRestoreRevisionBefore),
                    sourceTextRuns: [copyTextRun(textRun)].filter(Boolean),
                };
            }

            function hasExplicitTextRunInput(input = {}) {
                return !!(input
                    && typeof input === 'object'
                    && ((input.textRun && typeof input.textRun === 'object')
                        || (input.run && typeof input.run === 'object')
                        || (input.bounds && typeof input.bounds === 'object')));
            }

            function createSurfaceRecordInputFromExplicitRun(input = {}) {
                const run = input.textRun && typeof input.textRun === 'object'
                    ? input.textRun
                    : (input.run && typeof input.run === 'object' ? input.run : input);
                return {
                    surfaceId: stringify(input.sourceSurfaceId || run.surfaceId || ''),
                    revision: nonNegativeNumber(input.revision, run.revision, 0),
                };
            }

            function resolveSurfaceTextRun(snapshot, input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                if (source.textRun && typeof source.textRun === 'object') return source.textRun;
                if (source.run && typeof source.run === 'object') return source.run;
                if (source.bounds && typeof source.bounds === 'object') return source;
                const runId = stringify(source.runId || source.sourceRunId || '');
                const slotKey = stringify(source.slotKey || source.sourceSlotKey || '');
                const runs = Array.isArray(snapshot && snapshot.textRuns) ? snapshot.textRuns : [];
                if (!runId && !slotKey) return null;
                return runs.find((run) => run && (
                    (runId && stringify(run.runId || '') === runId)
                    || (slotKey && stringify(run.slotKey || '') === slotKey)
                )) || null;
            }

            function copyTextRun(run) {
                if (!run || typeof run !== 'object') return null;
                return {
                    runId: stringify(run.runId || ''),
                    surfaceId: stringify(run.surfaceId || ''),
                    revision: nonNegativeNumber(run.revision, 0),
                    slotKey: stringify(run.slotKey || ''),
                    text: stringify(run.text || ''),
                    visibleText: stringify(run.visibleText || ''),
                    units: Array.isArray(run.units) ? run.units.map((unit) => stringify(unit)).filter(Boolean) : [],
                    bounds: cloneRect(run.bounds || null),
                    drawState: copyPlainObject(run.drawState || null),
                    drawRun: clonePlainValue(run.drawRun || null),
                    sourceCommitted: run.sourceCommitted === true,
                    ownershipStatus: stringify(run.ownershipStatus || ''),
                };
            }

            function copyTextRuns(runs) {
                return Array.isArray(runs) ? runs.map(copyTextRun).filter(Boolean) : [];
            }

            function copyProjectedTargetRecord(record) {
                if (!record || typeof record !== 'object') return null;
                return copyCopiedTextProjectionRecord(record, {
                    targetRevision: 0,
                    sourceDrawOrder: 0,
                });
            }

            function copyPlainObject(value) {
                return value && typeof value === 'object' && !Array.isArray(value)
                    ? clonePlainValue(value)
                    : null;
            }

            function clonePlainValue(value, seen = null) {
                if (value === null || value === undefined) return null;
                if (Array.isArray(value)) return value.map((item) => clonePlainValue(item, seen));
                if (typeof value !== 'object') return value;
                const visited = seen || (typeof WeakSet === 'function' ? new WeakSet() : null);
                if (visited) {
                    if (visited.has(value)) return '[cycle]';
                    visited.add(value);
                }
                const output = {};
                Object.keys(value).forEach((key) => {
                    const item = value[key];
                    if (typeof item === 'function') return;
                    output[key] = clonePlainValue(item, visited);
                });
                return output;
            }

            function rectsOverlap(left, right) {
                const a = cloneRect(left);
                const b = cloneRect(right);
                if (!a || !b) return false;
                return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
            }

            function nonNegativeNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
                }
                return 0;
            }

            function optionalNonNegativeNumber(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopiedTargetMaterializer,
            });
        },
    });
})();
