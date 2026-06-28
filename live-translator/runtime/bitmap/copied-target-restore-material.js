// Copied-target restore material contract.
//
// A copied-target redraw restores native pixels captured immediately before a
// bitmap copy. This module owns the exact material identity rules so restore
// proof and restore composition cannot drift into different definitions of the
// same native target state.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetRestoreMaterial',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
        },
        factory({ rectGeometry }) {

            const cloneRect = rectGeometry.cloneRect;
            const sameRect = rectGeometry.sameRect;

            function normalizeCopiedTargetRestoreMaterial(material, targetBitmap) {
                if (!material || !material.imageData) return null;
                if (targetBitmap && material.targetBitmap !== targetBitmap) return null;
                const rect = cloneRect(material.rect || {
                    x1: material.x,
                    y1: material.y,
                    x2: Number(material.x) + Number(material.w),
                    y2: Number(material.y) + Number(material.h),
                });
                if (!rect) return null;
                const x = finiteNumber(material.x, rect.x1);
                const y = finiteNumber(material.y, rect.y1);
                const w = positiveNumber(material.w, rect.x2 - rect.x1, 0);
                const h = positiveNumber(material.h, rect.y2 - rect.y1, 0);
                if (w <= 0 || h <= 0) return null;
                return {
                    materialId: stringify(material.materialId || ''),
                    kind: stringify(material.kind || 'copied-target-restore'),
                    targetBitmap: material.targetBitmap || targetBitmap || null,
                    targetSurfaceId: stringify(material.targetSurfaceId || ''),
                    targetRevisionBefore: nonNegativeNumber(material.targetRevisionBefore, 0),
                    rect,
                    x,
                    y,
                    w,
                    h,
                    imageData: material.imageData,
                };
            }

            function areSameCopiedTargetRestoreMaterials(left, right) {
                const leftMaterial = normalizeCopiedTargetRestoreMaterial(left, left && left.targetBitmap);
                const rightMaterial = normalizeCopiedTargetRestoreMaterial(right, right && right.targetBitmap);
                if (!leftMaterial || !rightMaterial) return false;
                if (leftMaterial.targetBitmap !== rightMaterial.targetBitmap) return false;
                const leftSurfaceId = stringify(leftMaterial.targetSurfaceId || '');
                const rightSurfaceId = stringify(rightMaterial.targetSurfaceId || '');
                if ((leftSurfaceId || rightSurfaceId) && leftSurfaceId !== rightSurfaceId) return false;
                const leftId = stringify(leftMaterial.materialId || '');
                const rightId = stringify(rightMaterial.materialId || '');
                if ((leftId || rightId) && (leftId === '' || leftId !== rightId)) return false;
                if (leftMaterial.targetRevisionBefore !== rightMaterial.targetRevisionBefore) return false;
                if (!leftId && leftMaterial.imageData !== rightMaterial.imageData) return false;
                if (!sameRect(leftMaterial.rect, rightMaterial.rect)) return false;
                return Number(leftMaterial.x) === Number(rightMaterial.x)
                    && Number(leftMaterial.y) === Number(rightMaterial.y)
                    && Number(leftMaterial.w) === Number(rightMaterial.w)
                    && Number(leftMaterial.h) === Number(rightMaterial.h);
            }

            function isCopiedTargetRestoreMaterialBoundToEdge(material, edge) {
                if (!material || !edge) return false;
                const materialId = stringify(material.materialId || '');
                if (!materialId || stringify(edge.targetRestoreMaterialId || '') !== materialId) return false;
                if (!sameRect(material.rect, edge.targetRestoreRect)) return false;
                const materialRevision = nonNegativeNumber(material.targetRevisionBefore, NaN);
                const edgeRevision = nonNegativeNumber(edge.targetRestoreRevisionBefore, NaN);
                return Number.isFinite(materialRevision)
                    && Number.isFinite(edgeRevision)
                    && materialRevision === edgeRevision;
            }

            function copyCopiedTargetRestoreMaterialDescriptor(material) {
                if (!material) return null;
                const materialId = stringify(material.materialId || '');
                if (!materialId) return null;
                return {
                    materialId,
                    kind: 'copied-target-restore',
                    targetSurfaceId: stringify(material.targetSurfaceId || ''),
                    targetRevisionBefore: nonNegativeNumber(material.targetRevisionBefore, 0),
                    rect: cloneRect(material.rect || null),
                };
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function finiteNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : fallback;
            }

            function positiveNumber(...values) {
                for (let index = 0; index < values.length; index += 1) {
                    const numeric = Number(values[index]);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 1;
            }

            function nonNegativeNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                normalizeCopiedTargetRestoreMaterial,
                areSameCopiedTargetRestoreMaterials,
                isCopiedTargetRestoreMaterialBoundToEdge,
                copyCopiedTargetRestoreMaterialDescriptor,
            });
        },
    });
})();
