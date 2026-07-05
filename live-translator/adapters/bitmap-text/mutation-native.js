// Bitmap text adapter support: native mutation execution.
// Mutation transactions own observation lifecycle; this module invokes native
// bitmap methods and records native timing.
(() => {
    'use strict';

    function createController(scope = {}) {
        const { recordNativeMutationAttribution } = scope.controllerFacades.mutationIntel;

        function applyNativeBitmapMutation(original, bitmap, methodName, nativeArgs, mutationTransaction) {
            const transaction = mutationTransaction && typeof mutationTransaction === 'object'
                ? mutationTransaction
                : {};
            const profilerOn = transaction.profilerOn === true;
            const observeMutation = transaction.observeMutation === true;
            const bypassReason = transaction.bypassReason || '';
            let nativeSucceeded = false;
            if (profilerOn && observeMutation) {
                const start = typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now();
                try {
                    const result = original.apply(bitmap, nativeArgs);
                    nativeSucceeded = true;
                    return result;
                } finally {
                    const end = typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now();
                    const nativeMs = Math.max(0, end - start);
                    scope.perf.time('bitmap.mutation.native.ms', nativeMs);
                    scope.perf.time(bypassReason ? 'bitmap.mutation.native.bypassed.ms' : 'bitmap.mutation.native.observed.ms', nativeMs);
                    recordNativeMutationAttribution(bitmap, methodName, nativeMs, bypassReason);
                    if (!nativeSucceeded) abortNativeMutationFailure(transaction);
                }
            }
            try {
                const result = original.apply(bitmap, nativeArgs);
                nativeSucceeded = true;
                return result;
            } finally {
                if (!nativeSucceeded) abortNativeMutationFailure(transaction);
            }
        }

        function abortNativeMutationFailure(transaction) {
            if (!transaction || typeof transaction.abortNativeFailure !== 'function') return false;
            return transaction.abortNativeFailure();
        }

        return {
            applyNativeBitmapMutation,
        };
    }

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutationNative',
        factory() {
            return { create: createController };
        },
    });
})();
