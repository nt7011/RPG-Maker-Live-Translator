// Bitmap text adapter support: mutation journal participants.
// Participant registration lives here; mutation wrappers stay in mutations.js.
(() => {
    'use strict';

    function createController(scope = {}) {
        const {
            invalidateCopiedBitmapTargetsForMutation,
            materializeCopiedBitmapTargetsBeforeMutation,
            redrawMaterializedCopiedBitmapTargetsAfterMutation,
        } = scope.controllerFacades.copiedTargets;
        const { createMutationDescriptorFromJournalContext } = scope.controllerFacades.mutationDescriptor;
        const { handleBitmapMutation } = scope.controllerFacades.mutationInvalidation;

        function registerBitmapMutationParticipants() {
            if (scope.bitmapMutationParticipantsRegistered) return true;
            const services = scope.bitmapServices;
            if (!services || typeof services.registerMutationParticipant !== 'function') return false;
            scope.bitmapMutationParticipantsRegistered = true;
            const copiedTargetMaterializationsByContext = new WeakMap();
            services.registerMutationParticipant({
                name: 'native-ink',
                capability: 'native-ink',
                order: 60,
                afterNativeSuccess(context) {
                    if (typeof scope.applyBitmapNativePaintMutation !== 'function') return false;
                    return scope.applyBitmapNativePaintMutation(context.bitmap, context.methodName, {
                        rect: context.targetRect || null,
                        clearReplay: context.clearReplay || '',
                        full: context.full === true,
                    });
                },
            });
            services.registerMutationParticipant({
                name: 'copied-target-invalidation',
                capability: 'invalidation',
                order: 65,
                afterNativeSuccess(context) {
                    const mutation = createMutationDescriptorFromJournalContext(context);
                    const invalidated = invalidateCopiedBitmapTextTargetsAfterMutation(
                        context.bitmap,
                        context.methodName,
                        mutation
                    );
                    return { invalidatedCopiedTargets: invalidated };
                },
            });
            services.registerMutationParticipant({
                name: 'invalidation',
                capability: 'invalidation',
                order: 70,
                afterNativeSuccess(context) {
                    const runInvalidation = () => {
                        handleBitmapMutation(
                            context.bitmap,
                            context.methodName,
                            context.args,
                            createMutationDescriptorFromJournalContext(context)
                        );
                        return { invalidated: true };
                    };
                    return scope.isPerfEnabled()
                        ? scope.measurePerf('bitmap.mutation.handle.ms', runInvalidation)
                        : runInvalidation();
                },
            });
            services.registerMutationParticipant({
                name: 'copied-target-materialization',
                capability: 'copied-target-materialization',
                order: 90,
                beforeNative(context) {
                    const mutation = createMutationDescriptorFromJournalContext(context);
                    const materialized = {
                        bitmapTargets: materializeCopiedBitmapTextTargetsBeforeMutation(context.bitmap, context.methodName, mutation),
                    };
                    const count = materialized.bitmapTargets.length;
                    if (count > 0) {
                        copiedTargetMaterializationsByContext.set(context, materialized);
                        appendCopiedTargetProjectionRecords(context, materialized.bitmapTargets);
                    }
                    return { materializedCopiedTargets: count };
                },
                afterNativeSuccess(context) {
                    const materialized = copiedTargetMaterializationsByContext.get(context);
                    copiedTargetMaterializationsByContext.delete(context);
                    if (!materialized) return { committedCopiedTargets: 0 };
                    const mutation = createMutationDescriptorFromJournalContext(context);
                    const bitmapResult = redrawMaterializedCopiedBitmapTextTargetsAfterMutation(
                        context.bitmap,
                        context.methodName,
                        mutation,
                        materialized.bitmapTargets
                    ) || {};
                    return {
                        committedCopiedTargets: Number(bitmapResult.committed) || 0,
                        redrawnCopiedTargets: Number(bitmapResult.redrawn) || 0,
                    };
                },
                afterNativeFailure(context) {
                    copiedTargetMaterializationsByContext.delete(context);
                },
            });
            return true;
        }

        function invalidateCopiedBitmapTextTargetsAfterMutation(targetBitmap, methodName, mutation) {
            if (!mutation) return 0;
            try {
                const rect = mutation.rect || null;
                return Number(invalidateCopiedBitmapTargetsForMutation(
                    targetBitmap,
                    rect,
                    `${methodName || 'bitmap'}-bitmap`
                )) || 0;
            } catch (error) {
                reportMutationError('bitmap.invalidateCopiedTargetsForBitmapMutation', error);
                return 0;
            }
        }

        function materializeCopiedBitmapTextTargetsBeforeMutation(targetBitmap, methodName, mutation) {
            if (!mutation) return [];
            try {
                const materialized = materializeCopiedBitmapTargetsBeforeMutation(targetBitmap, methodName, mutation);
                return Array.isArray(materialized) ? materialized : [];
            } catch (error) {
                reportMutationError('bitmap.materializeCopiedTargetsForBitmapMutation', error);
                return [];
            }
        }

        function redrawMaterializedCopiedBitmapTextTargetsAfterMutation(targetBitmap, methodName, mutation, materialized) {
            if (!Array.isArray(materialized) || !materialized.length) return null;
            try {
                return redrawMaterializedCopiedBitmapTargetsAfterMutation(targetBitmap, methodName, mutation, materialized);
            } catch (error) {
                reportMutationError('bitmap.redrawMaterializedCopiedTargetsForBitmapMutation', error);
                return null;
            }
        }

        function appendCopiedTargetProjectionRecords(context, materialized) {
            if (!context || typeof context.setMetadata !== 'function') return;
            const records = collectCopiedTargetProjectionRecords(materialized);
            if (!records.length) return;
            const existing = typeof context.getMetadata === 'function'
                ? context.getMetadata('copiedTargetProjectionRecords')
                : [];
            const merged = Array.isArray(existing) ? existing.concat(records) : records;
            context.setMetadata('copiedTargetProjectionRecords', merged);
        }

        function collectCopiedTargetProjectionRecords(materialized) {
            const records = [];
            (Array.isArray(materialized) ? materialized : []).forEach((item) => {
                if (item && item.projectionRecord) records.push(item.projectionRecord);
            });
            return records;
        }

        function reportMutationError(operation, error) {
            if (typeof scope.reportAdapterError === 'function') {
                scope.reportAdapterError(`mutation.${operation}`, error);
            }
        }

        return {
            registerBitmapMutationParticipants,
        };
    }

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutationParticipants',
        factory() {
            return { create: createController };
        },
    });
})();
