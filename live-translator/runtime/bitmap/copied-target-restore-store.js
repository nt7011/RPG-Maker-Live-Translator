// Copied-target restore material store.
//
// The bitmap services coordinator should not own captured target pixel
// lifetimes. This store captures the native target pixels before a bitmap copy,
// keeps those pixels private, resolves material ids back into live material
// objects, and applies the captured pixels back to the target when a copied
// target redraw is proven current.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTargetRestoreStore',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            restoreMaterialContract: 'runtime.bitmap.copiedTargetRestoreMaterial',
        },
        factory({ rectGeometry, restoreMaterialContract }) {

            const cloneRect = rectGeometry.cloneRect;
            const coverageContainsRect = rectGeometry.coverageContainsRect;
            const normalizeCopiedTargetRestoreMaterial = restoreMaterialContract.normalizeCopiedTargetRestoreMaterial;
            const copyCopiedTargetRestoreMaterialDescriptor = restoreMaterialContract.copyCopiedTargetRestoreMaterialDescriptor;

            function createCopiedTargetRestoreStore(deps = {}) {
                const materials = new Map();
                const maxMaterials = positiveInteger(deps.maxMaterials, 2048);
                const getSurfaceIdentity = typeof deps.getSurfaceIdentity === 'function'
                    ? deps.getSurfaceIdentity
                    : () => null;
                const getSurfaceById = typeof deps.getSurfaceById === 'function'
                    ? deps.getSurfaceById
                    : () => null;
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};
                const now = typeof deps.now === 'function'
                    ? deps.now
                    : () => Date.now();
                let nextMaterialId = 0;

                function captureForCopy(context) {
                    if (!isCopyMutationContext(context)) return null;
                    const targetBitmap = context.bitmap;
                    const targetIdentity = safeGetSurfaceIdentity(targetBitmap);
                    const targetSurfaceId = stringify(targetIdentity && targetIdentity.surfaceId || '');
                    if (!targetSurfaceId) return null;
                    const area = normalizeCopiedTargetRestoreArea(context.targetRectAfterCopy || context.targetRect, targetBitmap);
                    if (!area) return null;
                    const canvasContext = getBitmapImageDataContext(targetBitmap);
                    if (!canvasContext || typeof canvasContext.getImageData !== 'function') return null;
                    try {
                        const imageData = canvasContext.getImageData(area.x, area.y, area.w, area.h);
                        if (!imageData) return null;
                        const material = {
                            materialId: `ctrm-${(++nextMaterialId).toString(36)}`,
                            kind: 'copied-target-restore',
                            targetBitmap,
                            targetSurfaceId,
                            targetRevisionBefore: nonNegativeNumber(targetIdentity.revision, 0),
                            rect: cloneRect(area.rect),
                            x: area.x,
                            y: area.y,
                            w: area.w,
                            h: area.h,
                            imageData,
                            createdAt: now(),
                        };
                        materials.set(material.materialId, material);
                        prune();
                        return copyDescriptor(material);
                    } catch (error) {
                        reportError('copiedTargetRestoreStore.capture', error);
                        return null;
                    }
                }

                function resolve(materialId, projection) {
                    const id = stringify(materialId || '');
                    if (!id) return null;
                    const material = materials.get(id) || null;
                    if (!material) return null;
                    const targetSurfaceId = stringify(projection && projection.targetSurfaceId || '');
                    if (targetSurfaceId && material.targetSurfaceId !== targetSurfaceId) return null;
                    const targetBitmap = safeGetSurfaceById(material.targetSurfaceId);
                    if (!targetBitmap || targetBitmap !== material.targetBitmap) return null;
                    const targetBounds = cloneRect(projection && (projection.targetBounds || projection.bounds) || null);
                    if (!coverageContainsRect(targetBounds, [material.rect])) return null;
                    const normalized = normalizeCopiedTargetRestoreMaterial(material, targetBitmap);
                    if (!normalized) return null;
                    return {
                        materialId: normalized.materialId,
                        kind: normalized.kind,
                        targetBitmap: normalized.targetBitmap,
                        targetSurfaceId: normalized.targetSurfaceId,
                        targetRevisionBefore: normalized.targetRevisionBefore,
                        rect: cloneRect(normalized.rect),
                        x: normalized.x,
                        y: normalized.y,
                        w: normalized.w,
                        h: normalized.h,
                        imageData: normalized.imageData,
                    };
                }

                function restoreMaterial(targetBitmap, material, options = {}) {
                    const restoreMaterial = normalizeCopiedTargetRestoreMaterial(material, targetBitmap);
                    if (!restoreMaterial) return false;
                    const canvasContext = getBitmapImageDataContext(targetBitmap);
                    if (!canvasContext || typeof canvasContext.putImageData !== 'function') return false;
                    const hasRequestedClip = !!(options && options.restoreRect !== undefined);
                    const requestedClip = hasRequestedClip ? cloneRect(options.restoreRect) : null;
                    if (hasRequestedClip && !requestedClip) return false;
                    const clippedRestore = requestedClip ? normalizeRestoreClip(restoreMaterial, requestedClip) : null;
                    if (hasRequestedClip && !clippedRestore) return false;
                    try {
                        if (clippedRestore && clippedRestore.full !== true) {
                            canvasContext.putImageData(
                                restoreMaterial.imageData,
                                restoreMaterial.x,
                                restoreMaterial.y,
                                clippedRestore.dirtyX,
                                clippedRestore.dirtyY,
                                clippedRestore.dirtyWidth,
                                clippedRestore.dirtyHeight
                            );
                        } else {
                            canvasContext.putImageData(restoreMaterial.imageData, restoreMaterial.x, restoreMaterial.y);
                        }
                        return true;
                    } catch (error) {
                        reportError('copiedTargetRestoreStore.restore', error);
                        return false;
                    }
                }

                function copyDescriptor(material) {
                    return copyCopiedTargetRestoreMaterialDescriptor(material);
                }

                function prune() {
                    while (materials.size > maxMaterials) {
                        const first = materials.keys().next();
                        if (first.done) return;
                        materials.delete(first.value);
                    }
                }

                function safeGetSurfaceIdentity(bitmap) {
                    try {
                        return getSurfaceIdentity(bitmap);
                    } catch (error) {
                        reportError('copiedTargetRestoreStore.getSurfaceIdentity', error);
                        return null;
                    }
                }

                function safeGetSurfaceById(surfaceId) {
                    try {
                        return getSurfaceById(surfaceId);
                    } catch (error) {
                        reportError('copiedTargetRestoreStore.getSurfaceById', error);
                        return null;
                    }
                }

                return freezeApi({
                    captureForCopy,
                    resolve,
                    restoreMaterial,
                    copyDescriptor,
                });
            }

            function isCopyMutationContext(context) {
                return !!(context
                    && context.bitmap
                    && context.sourceBitmap
                    && context.sourceBitmap !== context.bitmap
                    && context.sourceRect
                    && (context.targetRectAfterCopy || context.targetRect));
            }

            function normalizeCopiedTargetRestoreArea(rect, bitmap) {
                const source = cloneRect(rect);
                if (!source) return null;
                const width = readBitmapDimension(bitmap, 'width');
                const height = readBitmapDimension(bitmap, 'height');
                if (width <= 0 || height <= 0) return null;
                const x1 = Math.max(0, Math.floor(Math.min(source.x1, source.x2)));
                const y1 = Math.max(0, Math.floor(Math.min(source.y1, source.y2)));
                const x2 = Math.min(width, Math.ceil(Math.max(source.x1, source.x2)));
                const y2 = Math.min(height, Math.ceil(Math.max(source.y1, source.y2)));
                if (x2 <= x1 || y2 <= y1) return null;
                return {
                    x: x1,
                    y: y1,
                    w: x2 - x1,
                    h: y2 - y1,
                    rect: { x1, y1, x2, y2 },
                };
            }

            function normalizeRestoreClip(material, restoreRect) {
                const requested = restoreRect;
                const materialRect = cloneRect(material && material.rect);
                if (!requested || !materialRect) return null;
                const x1 = Math.max(materialRect.x1, Math.floor(Math.min(requested.x1, requested.x2)));
                const y1 = Math.max(materialRect.y1, Math.floor(Math.min(requested.y1, requested.y2)));
                const x2 = Math.min(materialRect.x2, Math.ceil(Math.max(requested.x1, requested.x2)));
                const y2 = Math.min(materialRect.y2, Math.ceil(Math.max(requested.y1, requested.y2)));
                if (x2 <= x1 || y2 <= y1) return null;
                if (x1 === materialRect.x1 && y1 === materialRect.y1 && x2 === materialRect.x2 && y2 === materialRect.y2) {
                    return { full: true };
                }
                return {
                    full: false,
                    dirtyX: x1 - Number(material.x),
                    dirtyY: y1 - Number(material.y),
                    dirtyWidth: x2 - x1,
                    dirtyHeight: y2 - y1,
                };
            }

            function getBitmapImageDataContext(bitmap) {
                if (!bitmap) return null;
                if (bitmap._context) return bitmap._context;
                if (bitmap.context) return bitmap.context;
                const canvas = bitmap._canvas || bitmap.canvas || null;
                if (canvas && typeof canvas.getContext === 'function') {
                    try { return canvas.getContext('2d') || null; } catch (_) { return null; }
                }
                return null;
            }

            function readBitmapDimension(bitmap, propertyName) {
                if (!bitmap) return 0;
                return positiveInteger(
                    bitmap[propertyName],
                    positiveInteger(
                        bitmap._canvas && bitmap._canvas[propertyName],
                        positiveInteger(bitmap._image && bitmap._image[propertyName], 0)
                    )
                );
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function positiveInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
            }

            function nonNegativeNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopiedTargetRestoreStore,
            });
        },
    });
})();
