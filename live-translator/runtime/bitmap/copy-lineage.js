// Bitmap copy lineage helpers.
//
// The surface ledger owns copy edges as physical bitmap facts. This module
// projects committed text-run bounds through those edges without knowing about
// adapters, text entries, or render policy.
//
// Copied-target invariant:
// A copy edge transfers text-run visibility from the source bitmap to the
// target bitmap. Once a text run has a valid projection through a current copy
// edge, that target projection remains renderable from copy-edge metadata even
// if the source bitmap is later cleared, resized, or detached. Source-entry
// liveness can decide whether direct source redraw is allowed; it must not be
// the sole authority for whether the copied target can be recomposed.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copyLineage',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            copyEdgeGeometry: 'runtime.bitmap.copyEdgeGeometry',
        },
        factory({ rectGeometry, copyEdgeGeometry }) {
            const cloneRect = rectGeometry.normalizeRect;
            const intersectRects = rectGeometry.intersectRects;
            const rectHasArea = rectGeometry.rectHasArea;
            const getCopyEdgeGeometry = copyEdgeGeometry.getCopyEdgeGeometry;
            const projectCopyEdgeSourceRect = copyEdgeGeometry.projectCopyEdgeSourceRect;
            const mapCopyEdgeSourceNumber = copyEdgeGeometry.mapCopyEdgeSourceNumber;
            const scaleCopyEdgeDimension = copyEdgeGeometry.scaleCopyEdgeDimension;

            function collectCopyEdgeProjections(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const run = source.textRun || source.run || null;
                const runBounds = cloneRect(source.bounds || run && run.bounds);
                if (!run || !runBounds || !rectHasArea(runBounds)) return [];

                const sourceSurfaceId = stringify(source.sourceSurfaceId || run.surfaceId || '');
                const runRevision = nonNegativeNumber(source.revision, run.revision, 0);
                const includePartial = source.includePartial === true;
                const edges = Array.isArray(source.copyEdges) ? source.copyEdges : [];
                const targets = [];

                edges.forEach((edge) => {
                    const target = projectTextRunThroughEdge({
                        edge,
                        sourceSurfaceId,
                        runRevision,
                        runBounds,
                        includePartial,
                        run,
                    });
                    if (target) targets.push(target);
                });
                return targets;
            }

            function projectTextRunThroughEdge(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const edge = source.edge && typeof source.edge === 'object' ? source.edge : null;
                if (!edge) return null;
                const sourceSurfaceId = stringify(source.sourceSurfaceId || '');
                if (sourceSurfaceId && stringify(edge.sourceSurfaceId || '') !== sourceSurfaceId) return null;

                const edgeSourceRect = cloneRect(edge.sourceRect);
                const edgeTargetRect = cloneRect(edge.targetRect);
                const runBounds = cloneRect(source.runBounds || source.bounds);
                if (!rectHasArea(edgeSourceRect) || !rectHasArea(edgeTargetRect) || !rectHasArea(runBounds)) return null;

                const edgeRevision = nonNegativeNumber(edge.sourceRevision, NaN);
                const runRevision = nonNegativeNumber(source.runRevision, source.revision, NaN);
                if (Number.isFinite(edgeRevision) && Number.isFinite(runRevision) && runRevision > edgeRevision) return null;

                const sourceBounds = source.includePartial === true
                    ? intersectRects(runBounds, edgeSourceRect)
                    : (rectContainsRect(edgeSourceRect, runBounds) ? runBounds : null);
                if (!rectHasArea(sourceBounds)) return null;

                const edgeGeometry = getCopyEdgeGeometry(edge);
                const targetBounds = projectCopyEdgeSourceRect(sourceBounds, edge);
                if (!rectHasArea(targetBounds)) return null;
                const run = source.run || {};
                const projection = {
                    edgeId: stringify(edge.edgeId || ''),
                    sourceSurfaceId: stringify(edge.sourceSurfaceId || sourceSurfaceId),
                    targetSurfaceId: stringify(edge.targetSurfaceId || ''),
                    sourceRunId: stringify(run.runId || source.runId || ''),
                    sourceSlotKey: stringify(run.slotKey || source.slotKey || ''),
                    sourceRevision: Number.isFinite(runRevision) ? runRevision : nonNegativeNumber(edge.sourceRevision, 0),
                    targetRevision: nonNegativeNumber(edge.targetRevision, 0),
                    sourceRect: cloneRect(edgeSourceRect),
                    targetRect: cloneRect(edgeTargetRect),
                    sourceBounds,
                    targetBounds,
                    scaleX: edgeGeometry ? edgeGeometry.scaleX : 1,
                    scaleY: edgeGeometry ? edgeGeometry.scaleY : 1,
                    createdByMutationId: stringify(edge.createdByMutationId || ''),
                    targetRestoreMaterialId: stringify(edge.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(edge.targetRestoreRect || null),
                    targetRestoreRevisionBefore: optionalNonNegativeNumber(edge.targetRestoreRevisionBefore),
                };
                copyIdentityAliases(projection, 'sourceRunIds', run.sourceRunIds, run.runIds, source.sourceRunIds, source.runIds);
                copyIdentityAliases(projection, 'sourceSlotKeys', run.sourceSlotKeys, run.slotKeys, source.sourceSlotKeys, source.slotKeys);
                return projection;
            }

            function materializeCopiedTextTargets(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const projections = Array.isArray(source.copiedTargets)
                    ? source.copiedTargets
                    : (Array.isArray(source.targets)
                        ? source.targets
                        : collectCopyEdgeProjections(source));
                if (!Array.isArray(projections) || !projections.length) return [];

                const materialized = [];
                projections.forEach((projection) => {
                    const target = materializeCopiedTextTarget(projection, source);
                    if (target) materialized.push(target);
                });
                return materialized;
            }

            function materializeCopiedTextTarget(projection, input) {
                if (!projection || typeof projection !== 'object') return null;
                const targetBounds = cloneRect(projection.targetBounds || projection.bounds);
                if (!rectHasArea(targetBounds)) return null;

                const targetSurface = resolveCopiedSurface(projection.targetSurfaceId, projection, input, 'target');
                if (!targetSurface) return null;
                if (input.requireUsableTarget !== false && !isUsableSurface(targetSurface)) return null;

                const sourceSurface = input.sourceSurface || input.sourceBitmap
                    || resolveCopiedSurface(projection.sourceSurfaceId, projection, input, 'source');
                const drawGeometry = materializeCopiedDrawGeometry(input, projection);
                const restoreMaterials = materializeRestoreMaterials(input, projection);
                const targetRestoreMaterial = materializeTargetRestoreMaterial(input, projection);
                const drawState = copyPlainObject(input.drawState || input.textRun && input.textRun.drawState || input.run && input.run.drawState || null);

                const target = {
                    edgeId: stringify(projection.edgeId || ''),
                    sourceSurfaceId: stringify(projection.sourceSurfaceId || ''),
                    targetSurfaceId: stringify(projection.targetSurfaceId || ''),
                    sourceRunId: stringify(projection.sourceRunId || ''),
                    sourceSlotKey: stringify(projection.sourceSlotKey || ''),
                    sourceRevision: nonNegativeNumber(projection.sourceRevision, 0),
                    targetRevision: nonNegativeNumber(projection.targetRevision, 0),
                    createdByMutationId: stringify(projection.createdByMutationId || ''),
                    sourceSurface: sourceSurface || null,
                    sourceBitmap: sourceSurface || null,
                    targetSurface,
                    targetBitmap: targetSurface,
                    sourceRect: cloneRect(projection.sourceRect),
                    targetRect: cloneRect(projection.targetRect),
                    sourceBounds: cloneRect(projection.sourceBounds),
                    targetBounds,
                    bounds: cloneRect(targetBounds),
                    scaleX: positiveNumber(projection.scaleX, 1),
                    scaleY: positiveNumber(projection.scaleY, 1),
                    drawGeometry,
                    drawParams: drawGeometry ? copyPlainObject(drawGeometry) : null,
                    drawState,
                    restoreMaterials,
                    backgroundMaterials: restoreMaterials,
                    targetRestoreMaterial,
                    projection: copyProjection(projection),
                };
                copyIdentityAliases(target, 'sourceRunIds', projection.sourceRunIds);
                copyIdentityAliases(target, 'sourceSlotKeys', projection.sourceSlotKeys);
                return target;
            }

            function resolveCopiedSurface(surfaceId, projection, input, role) {
                const resolver = input && (input.resolveSurface || input.surfaceResolver);
                if (typeof resolver !== 'function') return null;
                try {
                    return resolver(stringify(surfaceId || ''), projection, role) || null;
                } catch (_) {
                    return null;
                }
            }

            function materializeCopiedDrawGeometry(input, projection) {
                const drawGeometry = input.drawGeometry || input.drawParams || input.geometry
                    || input.textRun && input.textRun.drawGeometry
                    || input.run && input.run.drawGeometry
                    || null;
                if (!drawGeometry || typeof drawGeometry !== 'object') return null;
                const sourceRect = cloneRect(projection.sourceRect);
                const targetRect = cloneRect(projection.targetRect);
                const projectionGeometry = createProjectionGeometry(projection, sourceRect, targetRect);
                const mapped = {
                    x: mapCopyEdgeSourceNumber(drawGeometry.x, projectionGeometry, 'x'),
                    y: mapCopyEdgeSourceNumber(drawGeometry.y, projectionGeometry, 'y'),
                    maxWidth: scaleCopyEdgeDimension(drawGeometry.maxWidth, projectionGeometry, 'x'),
                    lineHeight: scaleCopyEdgeDimension(drawGeometry.lineHeight, projectionGeometry, 'y'),
                    align: drawGeometry.align,
                };
                if (!Number.isFinite(Number(mapped.x)) || !Number.isFinite(Number(mapped.y))) return null;
                return mapped;
            }

            function materializeRestoreMaterials(input, projection) {
                const materials = Array.isArray(input.restoreMaterials)
                    ? input.restoreMaterials
                    : (Array.isArray(input.backgroundMaterials) ? input.backgroundMaterials : []);
                if (!materials.length) return [];
                const mapper = input.mapRestoreMaterial || input.mapBackgroundMaterial;
                return materials.map((material) => {
                    if (!material || typeof material !== 'object') return null;
                    if (typeof mapper !== 'function') return copyMaterial(material);
                    try {
                        const geometry = createProjectionGeometry(projection);
                        const mapped = mapper(material, projection, {
                            mapRect(rect) {
                                return projectCopyEdgeSourceRect(rect, geometry);
                            },
                            mapNumber(value, axis = 'x') {
                                return mapCopyEdgeSourceNumber(value, geometry, axis);
                            },
                            scaleDimension(value, axis = 'x') {
                                return scaleCopyEdgeDimension(value, geometry, axis);
                            },
                            cloneRect,
                        });
                        return mapped && typeof mapped === 'object' ? mapped : null;
                    } catch (_) {
                        return null;
                    }
                }).filter(Boolean);
            }

            function materializeTargetRestoreMaterial(input, projection) {
                const materialId = stringify(projection && projection.targetRestoreMaterialId || '');
                if (!materialId) return null;
                const resolver = input && (input.resolveTargetRestoreMaterial || input.targetRestoreMaterialResolver);
                if (typeof resolver !== 'function') return null;
                try {
                    const material = resolver(materialId, projection);
                    return material && typeof material === 'object' ? copyMaterial(material) : null;
                } catch (_) {
                    return null;
                }
            }

            function rectContainsRect(outer, inner) {
                return !!(outer && inner
                    && inner.x1 >= outer.x1
                    && inner.y1 >= outer.y1
                    && inner.x2 <= outer.x2
                    && inner.y2 <= outer.y2);
            }

            function createProjectionGeometry(projection, sourceRect = null, targetRect = null) {
                return getCopyEdgeGeometry({
                    sourceRect: cloneRect(sourceRect || projection && projection.sourceRect),
                    targetRect: cloneRect(targetRect || projection && projection.targetRect),
                    scaleX: positiveNumber(projection && projection.scaleX, 1),
                    scaleY: positiveNumber(projection && projection.scaleY, 1),
                });
            }

            function isUsableSurface(surface) {
                return !!(surface
                    && Number.isFinite(Number(surface.width))
                    && Number(surface.width) > 0
                    && Number.isFinite(Number(surface.height))
                    && Number(surface.height) > 0);
            }

            function copyProjection(projection) {
                if (!projection || typeof projection !== 'object') return null;
                const copied = {
                    edgeId: stringify(projection.edgeId || ''),
                    sourceSurfaceId: stringify(projection.sourceSurfaceId || ''),
                    targetSurfaceId: stringify(projection.targetSurfaceId || ''),
                    sourceRunId: stringify(projection.sourceRunId || ''),
                    sourceSlotKey: stringify(projection.sourceSlotKey || ''),
                    sourceRevision: nonNegativeNumber(projection.sourceRevision, 0),
                    targetRevision: nonNegativeNumber(projection.targetRevision, 0),
                    sourceRect: cloneRect(projection.sourceRect),
                    targetRect: cloneRect(projection.targetRect),
                    sourceBounds: cloneRect(projection.sourceBounds),
                    targetBounds: cloneRect(projection.targetBounds || projection.bounds),
                    scaleX: positiveNumber(projection.scaleX, 1),
                    scaleY: positiveNumber(projection.scaleY, 1),
                    createdByMutationId: stringify(projection.createdByMutationId || ''),
                    targetRestoreMaterialId: stringify(projection.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(projection.targetRestoreRect || null),
                    targetRestoreRevisionBefore: optionalNonNegativeNumber(projection.targetRestoreRevisionBefore),
                };
                copyIdentityAliases(copied, 'sourceRunIds', projection.sourceRunIds);
                copyIdentityAliases(copied, 'sourceSlotKeys', projection.sourceSlotKeys);
                return copied;
            }

            function copyIdentityAliases(target, key, ...values) {
                const aliases = [];
                values.forEach((value) => pushIdentityAlias(aliases, value));
                if (aliases.length) target[key] = aliases;
            }

            function pushIdentityAlias(output, value) {
                if (Array.isArray(value)) {
                    value.forEach((item) => pushIdentityAlias(output, item));
                    return;
                }
                const text = stringify(value);
                if (text && output.indexOf(text) < 0) output.push(text);
            }

            function copyPlainObject(value) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
                const output = {};
                Object.keys(value).forEach((key) => {
                    const item = value[key];
                    const type = typeof item;
                    if (item === null || type === 'string' || type === 'number' || type === 'boolean') {
                        output[key] = item;
                    }
                });
                return output;
            }

            function copyMaterial(value) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
                const output = {};
                Object.keys(value).forEach((key) => {
                    const item = value[key];
                    if (typeof item !== 'function') output[key] = item;
                });
                return output;
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

            function positiveNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 0;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            return {
                materializeCopiedTextTargets,
            };
        },
    });
})();
