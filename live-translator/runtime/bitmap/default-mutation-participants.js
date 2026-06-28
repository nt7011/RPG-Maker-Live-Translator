// Bitmap default mutation participants.
//
// The mutation journal owns phase execution and ordering. This module owns the
// runtime's built-in participant set so bitmap-services can stay a composer of
// runtime services instead of carrying participant policy inline.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.defaultMutationParticipants',
        factory() {
            function registerDefaultMutationParticipants(deps = {}) {
                const input = deps && typeof deps === 'object' ? deps : {};
                const mutationJournal = input.mutationJournal || null;
                if (!mutationJournal || typeof mutationJournal.registerParticipant !== 'function') {
                    throw new Error('[LiveTranslator] runtime.bitmap.defaultMutationParticipants requires mutationJournal.registerParticipant.');
                }

                const flushPendingDrawUnits = requireFunction(input.flushPendingDrawUnits, 'flushPendingDrawUnits');
                const ensureSurfaceLedgerMutationTransaction = requireFunction(
                    input.ensureSurfaceLedgerMutationTransaction,
                    'ensureSurfaceLedgerMutationTransaction'
                );
                const commitSurfaceLedgerMutation = requireFunction(input.commitSurfaceLedgerMutation, 'commitSurfaceLedgerMutation');
                const abortSurfaceLedgerMutation = requireFunction(input.abortSurfaceLedgerMutation, 'abortSurfaceLedgerMutation');
                const recordSurfaceLedgerCopyEdge = requireFunction(input.recordSurfaceLedgerCopyEdge, 'recordSurfaceLedgerCopyEdge');
                const captureCopiedTargetRestoreMaterial = requireFunction(
                    input.captureCopiedTargetRestoreMaterial,
                    'captureCopiedTargetRestoreMaterial'
                );
                const publishMutation = requireFunction(input.publishMutation, 'publishMutation');
                const reportError = typeof input.reportError === 'function' ? input.reportError : () => {};
                const unregisters = [];

                registerParticipant(mutationJournal, unregisters, {
                    name: 'pending-source-drain',
                    capability: 'pending-source-drain',
                    order: 10,
                    beforeNative(context) {
                        const drained = drainPendingMutationSourceDrawUnits(context, {
                            flushPendingDrawUnits,
                            reportError,
                        });
                        if (drained > 0 && context && typeof context.setMetadata === 'function') {
                            context.setMetadata('pendingSourceDrainCount', drained);
                        }
                        return { drained };
                    },
                });
                registerParticipant(mutationJournal, unregisters, {
                    name: 'surface-ledger',
                    capability: 'surface-ledger',
                    order: 30,
                    beforeNative(context) {
                        ensureSurfaceLedgerMutationTransaction(context);
                    },
                    afterNativeSuccess(context) {
                        return commitSurfaceLedgerMutation(context);
                    },
                    afterNativeFailure(context) {
                        return abortSurfaceLedgerMutation(context, 'native-failure');
                    },
                    finishSuppressed(context) {
                        return abortSurfaceLedgerMutation(context, 'suppressed');
                    },
                });
                registerParticipant(mutationJournal, unregisters, {
                    name: 'copy-lineage',
                    capability: 'copy-lineage',
                    order: 40,
                    beforeNative(context) {
                        ensureSurfaceLedgerMutationTransaction(context);
                        const material = captureCopiedTargetRestoreMaterial(context);
                        if (material && context && typeof context.setMetadata === 'function') {
                            context.setMetadata('copiedTargetRestoreMaterial', material);
                        }
                        return material ? { copiedTargetRestoreMaterialId: material.materialId } : null;
                    },
                    afterNativeSuccess(context) {
                        return recordSurfaceLedgerCopyEdge(context);
                    },
                    afterNativeFailure(context) {
                        return abortSurfaceLedgerMutation(context, 'native-failure');
                    },
                    finishSuppressed(context) {
                        return abortSurfaceLedgerMutation(context, 'suppressed');
                    },
                });
                registerParticipant(mutationJournal, unregisters, {
                    name: 'observer',
                    capability: 'observer',
                    order: 80,
                    afterNativeSuccess(context) {
                        return publishMutation(
                            context.bitmap,
                            context.methodName,
                            typeof context.getNativeArgs === 'function' ? context.getNativeArgs() : []
                        );
                    },
                });

                return function unregisterDefaultMutationParticipants() {
                    while (unregisters.length) {
                        const unregister = unregisters.pop();
                        try {
                            if (typeof unregister === 'function') unregister();
                        } catch (error) {
                            reportError('defaultMutationParticipants.unregister', error);
                        }
                    }
                };
            }

            function registerParticipant(mutationJournal, unregisters, participant) {
                const unregister = mutationJournal.registerParticipant(participant);
                if (typeof unregister === 'function') unregisters.push(unregister);
            }

            function drainPendingMutationSourceDrawUnits(context, deps) {
                const sourceBitmap = context && context.sourceBitmap || null;
                if (!sourceBitmap) return 0;
                const methodName = context && context.methodName || 'bitmap';
                try {
                    return Number(deps.flushPendingDrawUnits(
                        `pre-${methodName || 'bitmap'}-source`,
                        sourceBitmap,
                        {
                            phase: 'mutation-source-drain',
                            source: 'mutation-journal',
                        }
                    )) || 0;
                } catch (error) {
                    deps.reportError('pendingSourceDrain.flushPendingDrawUnits', error);
                    return 0;
                }
            }

            function requireFunction(value, name) {
                if (typeof value !== 'function') {
                    throw new Error(`[LiveTranslator] runtime.bitmap.defaultMutationParticipants requires ${name}.`);
                }
                return value;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                registerDefaultMutationParticipants,
            });
        },
    });
})();
