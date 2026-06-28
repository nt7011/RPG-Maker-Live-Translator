// Bitmap text adapter support: mutation journal lifecycle.
// The runtime journal lives in runtime/bitmap; this controller adapts bitmap hooks to it.
(() => {
    'use strict';

    function createController(scope = {}) {
        const { planBitmapMutationObservation } = scope.controllerFacades.mutationInterest;
        const { getMutationBypassReason } = scope.controllerFacades.mutationPolicy;
        const { recordMutationHookDecision } = scope.controllerFacades.mutationDiagnostics;
        const { describeMutation, createMutationJournalInput, createLedgerMutationInput } = scope.controllerFacades.mutationDescriptor;

        function beginBitmapMutationTransaction(bitmap, methodName, args) {
            const profilerOn = scope.isPerfEnabled();
            const bypassReason = getMutationBypassReason(bitmap);
            const bypassMutation = !!bypassReason;
            const observation = beginBitmapMutationObservation(bitmap, methodName, args, bypassReason);
            const observeMutation = observation.observe === true;
            const mutation = observation.mutation || null;
            const journal = observation.journal || null;
            recordMutationHookDecision(methodName, { profilerOn, observeMutation, bypassReason });
            const nativeArgs = journal && Array.isArray(journal.nativeArgs)
                ? journal.nativeArgs.slice()
                : (Array.isArray(args) ? args.slice() : []);

            function commitNativeSuccess() {
                if (bypassMutation || !observeMutation || !journal) return null;
                const committedMutation = describeMutation(bitmap, methodName, nativeArgs);
                return commitBitmapMutationJournal(bitmap, methodName, nativeArgs, committedMutation || mutation, journal);
            }

            function abortNativeFailure() {
                return abortBitmapMutationJournal(journal, methodName);
            }

            function finishSuppressed(reason = 'mutation-suppressed') {
                if (bypassMutation || !observeMutation || !journal) return null;
                if (typeof journal.finishSuppressed !== 'function') return null;
                try {
                    return journal.finishSuppressed(reason);
                } catch (error) {
                    reportMutationError('bitmapServices.finishSuppressedMutationJournal', error);
                    return null;
                }
            }

            return {
                profilerOn,
                bypassReason,
                observeMutation,
                callNative: !(journal && journal.callNative === false),
                nativeArgs,
                commitNativeSuccess,
                abortNativeFailure,
                finishSuppressed,
            };
        }

        function beginBitmapMutationObservation(bitmap, methodName, args, bypassReason = '') {
            const plan = planBitmapMutationObservation(bitmap, methodName, args, bypassReason);
            if (!plan || plan.observe !== true) return { observe: false, mutation: null, journal: null };
            const mutation = describeMutation(bitmap, methodName, args);
            const capabilities = Array.isArray(plan.capabilities) ? plan.capabilities : [];
            const journal = capabilities.length
                ? beginBitmapMutationJournal(bitmap, methodName, args, mutation, capabilities)
                : null;
            return { observe: true, mutation, journal };
        }

        function beginBitmapMutationJournal(targetBitmap, methodName, args, mutation, capabilities) {
            const services = scope.bitmapServices;
            if (!services || typeof services.beginMutationJournal !== 'function') return null;
            try {
                return services.beginMutationJournal(targetBitmap, createMutationJournalInput(methodName, args, mutation, capabilities));
            } catch (error) {
                reportMutationError('bitmapServices.beginMutationJournal', error);
                return null;
            }
        }

        function commitBitmapMutationJournal(targetBitmap, methodName, args, mutation, journal) {
            if (journal && typeof journal.commitNativeSuccess === 'function') {
                try {
                    const descriptor = mutation || describeMutation(targetBitmap, methodName, args);
                    return journal.commitNativeSuccess(createLedgerMutationInput(methodName, args, descriptor));
                } catch (error) {
                    reportMutationError('bitmapServices.commitMutationJournal', error);
                    return null;
                }
            }
            return null;
        }

        function abortBitmapMutationJournal(journal, methodName) {
            if (!journal || typeof journal.abortNativeFailure !== 'function') return false;
            try {
                return journal.abortNativeFailure(new Error(`${methodName || 'bitmap'} native mutation failed`));
            } catch (error) {
                reportMutationError('bitmapServices.abortMutationJournal', error);
                return false;
            }
        }

        function reportMutationError(operation, error) {
            if (typeof scope.reportAdapterError === 'function') {
                scope.reportAdapterError(`mutation.${operation}`, error);
            }
        }

        return {
            beginBitmapMutationTransaction,
        };
    }

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutationJournal',
        factory() {
            return { create: createController };
        },
    });
})();
