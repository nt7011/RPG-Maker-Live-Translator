// Bitmap text adapter support: mutations.
// Each controller receives one adapter instance scope from bitmap-text.js.
(() => {
    'use strict';

    let runtimeScope = null;
    let conversionScope = null;

    function createController(scope = {}) {
        const { MUTATION_WRAPPER_TOKEN } = scope;
        const { hasHookInChain } = scope.controllerFacades.frameMarkers;
        const { registerBitmapMutationParticipants } = scope.controllerFacades.mutationParticipants;
        const { beginBitmapMutationTransaction } = scope.controllerFacades.mutationJournal;
        const { applyNativeBitmapMutation } = scope.controllerFacades.mutationNative;

        function installBitmapMutationHooks() {
            registerBitmapMutationParticipants();
            const methods = [
                'clear',
                'clearRect',
                'resize',
                'fillRect',
                'fillAll',
                'gradientFillRect',
                'strokeRect',
                'drawCircle',
                'blt',
                'bltImage',
                'adjustTone',
                'rotateHue',
                'blur',
                'destroy',
            ];
            methods.forEach(installBitmapMutationHook);
        }
        
        function installBitmapMutationHook(methodName) {
            const current = runtimeScope.Bitmap.prototype[methodName];
            if (typeof current !== 'function') return false;
            if (hasHookInChain(current, '__trBitmapTextMutation', MUTATION_WRAPPER_TOKEN)) return true;
        
            const original = current;
            const wrapped = function(...args) {
                const routed = routeBitmapConversionMutation(this, methodName, args);
                if (routed) return routed.result;
                const mutationTransaction = beginBitmapMutationTransaction(this, methodName, args);
                if (mutationTransaction.callNative === false) {
                    mutationTransaction.finishSuppressed('mutation-suppressed');
                    return undefined;
                }
                const result = applyNativeBitmapMutation(original, this, methodName, mutationTransaction.nativeArgs, mutationTransaction);
                mutationTransaction.commitNativeSuccess();
                return result;
            };
            wrapped.__trBitmapTextMutation = MUTATION_WRAPPER_TOKEN;
            wrapped.__trOriginal = original;
            runtimeScope.Bitmap.prototype[methodName] = wrapped;
            return true;
        }

        function routeBitmapConversionMutation(bitmap, methodName, args) {
            if (!conversionScope || typeof conversionScope.tryRouteMutation !== 'function') return null;
            try {
                return conversionScope.tryRouteMutation(bitmap, methodName, args || null);
            } catch (_) {
                return null;
            }
        }

        return { installBitmapMutationHooks, installBitmapMutationHook };
    }

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutations',
        requires: {
            conversionScope: 'runtime.conversionScope',
        },
        factory({ conversionScope: conversionScopeModule }, { scope }) {
            runtimeScope = scope;
            conversionScope = conversionScopeModule;

            return { create: createController };
        },
    });
})();
