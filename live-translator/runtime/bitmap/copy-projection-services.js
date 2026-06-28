// Bitmap copy projection service graph.
//
// The individual copied-target modules own their algorithms. This module owns
// the service graph that combines source replay, restore proof/material storage,
// copied text materialization, and restore composition for bitmap-services.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copyProjectionServices',
        requires: {
            copiedSurfaceReplayModule: 'runtime.bitmap.copiedSurfaceReplay',
            copiedTargetRestoreProofModule: 'runtime.bitmap.copiedTargetRestoreProof',
            copiedTargetRestoreStoreModule: 'runtime.bitmap.copiedTargetRestoreStore',
            copiedTargetMaterializationModule: 'runtime.bitmap.copiedTargetMaterialization',
            copiedTargetCompositorModule: 'runtime.bitmap.copiedTargetCompositor',
            copiedTextProjectionSyncModule: 'runtime.bitmap.copiedTextProjectionSync',
        },
        factory({ copiedSurfaceReplayModule, copiedTargetRestoreProofModule, copiedTargetRestoreStoreModule, copiedTargetMaterializationModule, copiedTargetCompositorModule, copiedTextProjectionSyncModule }) {

            function createCopyProjectionServices(deps = {}) {
                const input = deps && typeof deps === 'object' ? deps : {};
                const settings = input.settings && typeof input.settings === 'object' ? input.settings : {};
                const surfaceLedgerBoundary = requireNamespace(input.surfaceLedgerBoundary, 'surfaceLedgerBoundary', [
                    'getCopyEdgesTo',
                    'getCopyEdgeState',
                    'getCopyEdgeSourceReplayState',
                    'getSurfaceById',
                    'getSurfaceSnapshot',
                    'ensureSurfaceRecord',
                    'getSurfaceIdentity',
                    'getRecoverableProjectionStatesForTarget',
                    'upsertCopyEdgeProjectedTargetRecord',
                ]);
                const replay = requireNamespace(input.replay, 'replay', [
                    'withBitmapReplayGuard',
                    'replayBitmapItems',
                ]);
                const dirty = requireNamespace(input.dirty, 'dirty', [
                    'markBitmapPixelsDirty',
                ]);
                const reportError = typeof input.reportError === 'function'
                    ? input.reportError
                    : () => {};
                const warn = typeof input.warn === 'function'
                    ? input.warn
                    : () => {};

                const copiedSurfaceReplay = copiedSurfaceReplayModule.createCopiedSurfaceReplayProjector({
                    getCopyEdgesTo(bitmap) {
                        return surfaceLedgerBoundary.getCopyEdgesTo(bitmap);
                    },
                    getCopyEdgeState(edge) {
                        return surfaceLedgerBoundary.getCopyEdgeState(edge);
                    },
                    getCopyEdgeSourceReplayState(edge, options) {
                        return surfaceLedgerBoundary.getCopyEdgeSourceReplayState(edge, options);
                    },
                    getSurfaceById(surfaceId) {
                        return surfaceLedgerBoundary.getSurfaceById(surfaceId);
                    },
                    getSurfaceSnapshot(bitmap) {
                        return surfaceLedgerBoundary.getSurfaceSnapshot(bitmap);
                    },
                    reportError(operation, error) {
                        reportError(operation, error);
                    },
                });
                const copiedTargetRestoreProof = copiedTargetRestoreProofModule.createCopiedTargetRestoreProofValidator({
                    getCopyEdgesTo(bitmap) {
                        return surfaceLedgerBoundary.getCopyEdgesTo(bitmap);
                    },
                    getCopyEdgeState(edge) {
                        return surfaceLedgerBoundary.getCopyEdgeState(edge);
                    },
                    reportError(operation, error) {
                        reportError(operation, error);
                    },
                });
                const copiedTargetRestoreStore = copiedTargetRestoreStoreModule.createCopiedTargetRestoreStore({
                    maxMaterials: readPositiveInteger(
                        settings.copiedTargetRestoreMaterials && settings.copiedTargetRestoreMaterials.maxMaterials,
                        2048
                    ),
                    getSurfaceIdentity(bitmap) {
                        return surfaceLedgerBoundary.getSurfaceIdentity(bitmap);
                    },
                    getSurfaceById(surfaceId) {
                        return surfaceLedgerBoundary.getSurfaceById(surfaceId);
                    },
                    reportError(operation, error, details) {
                        reportError(operation, error, details);
                    },
                });
                const copiedTargetMaterializer = copiedTargetMaterializationModule.createCopiedTargetMaterializer({
                    getSurfaceSnapshot(bitmap) {
                        return surfaceLedgerBoundary.getSurfaceSnapshot(bitmap);
                    },
                    ensureSurfaceRecord(bitmap, input) {
                        return surfaceLedgerBoundary.ensureSurfaceRecord(bitmap, input);
                    },
                    getSurfaceIdentity(bitmap) {
                        return surfaceLedgerBoundary.getSurfaceIdentity(bitmap);
                    },
                    getSurfaceById(surfaceId) {
                        return surfaceLedgerBoundary.getSurfaceById(surfaceId);
                    },
                    getCopyEdgeState(edge) {
                        return surfaceLedgerBoundary.getCopyEdgeState(edge);
                    },
                    getRecoverableProjectionStatesForTarget(targetBitmap, input) {
                        return surfaceLedgerBoundary.getRecoverableProjectionStatesForTarget(targetBitmap, input);
                    },
                    resolveTargetRestoreMaterial(materialId, projection) {
                        return copiedTargetRestoreStore.resolve(materialId, projection);
                    },
                    reportError(operation, error, details) {
                        reportError(operation, error, details);
                    },
                });
                const copiedTargetCompositor = copiedTargetCompositorModule.createCopiedTargetCompositor({
                    restoreProof: copiedTargetRestoreProof,
                    copiedSurfaceReplay,
                    restoreMaterial(targetBitmap, material, options) {
                        return copiedTargetRestoreStore.restoreMaterial(targetBitmap, material, options);
                    },
                    replayBitmapItems(targetBitmap, items, reason) {
                        return replay.withBitmapReplayGuard(targetBitmap, () => {
                            return replay.replayBitmapItems(targetBitmap, items);
                        }, reason) === true;
                    },
                    markBitmapPixelsDirty(bitmap, input) {
                        return dirty.markBitmapPixelsDirty(bitmap, input);
                    },
                    markCopyEdgeRecovered(edge, input) {
                        return typeof surfaceLedgerBoundary.markCopyEdgeRecovered === 'function'
                            ? surfaceLedgerBoundary.markCopyEdgeRecovered(edge, input)
                            : null;
                    },
                    reportError(operation, error, details) {
                        reportError(operation, error, details);
                    },
                    warn,
                });
                const copiedTextProjectionSync = copiedTextProjectionSyncModule.createCopiedTextProjectionSync({
                    upsertCopyEdgeProjectedTargetRecord(input) {
                        return surfaceLedgerBoundary.upsertCopyEdgeProjectedTargetRecord(input);
                    },
                    reportError(operation, error, details) {
                        reportError(operation, error, details);
                    },
                });

                return freezeApi({
                    captureCopiedTargetRestoreMaterial(context) {
                        return copiedTargetRestoreStore.captureForCopy(context);
                    },
                    recordCopiedTextTargetPayload: copiedTextProjectionSync.recordCopiedTextTargetPayload,
                    getCopiedTextTargetMaterializations: copiedTargetMaterializer.getCopiedTextTargetMaterializations,
                    getPendingCopiedTextTargetMaterializations: copiedTargetMaterializer.getPendingCopiedTextTargetMaterializations,
                    getProjectedTextRunsForTarget: copiedTargetMaterializer.getProjectedTextRunsForTarget,
                    resolveRecoverableProjectedRuns: copiedTargetMaterializer.resolveRecoverableProjectedRuns,
                    registerCopiedTargetProvider: copiedTargetCompositor.registerCopiedTargetProvider,
                    collectCopiedTargetRestoreSeeds: copiedTargetCompositor.collectCopiedTargetRestoreSeeds,
                    redrawCopiedTargetRestoreComposition: copiedTargetCompositor.redrawCopiedTargetRestoreComposition,
                });
            }

            function requireNamespace(value, name, methods) {
                const namespace = value && typeof value === 'object' ? value : null;
                if (!namespace) {
                    throw new Error(`[LiveTranslator] runtime.bitmap.copyProjectionServices requires ${name}.`);
                }
                methods.forEach((methodName) => {
                    if (typeof namespace[methodName] !== 'function') {
                        throw new Error(`[LiveTranslator] runtime.bitmap.copyProjectionServices requires ${name}.${methodName}.`);
                    }
                });
                return namespace;
            }

            function readPositiveInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopyProjectionServices,
            });
        },
    });
})();
