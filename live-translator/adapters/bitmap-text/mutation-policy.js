// Bitmap text adapter support: mutation policy.
// Mutation wrappers live in mutations.js; bypass classification lives here.
(() => {
    'use strict';

    function createController(scope = {}) {
        const { isSmallTextDrawActive, isSmallTextScratchBitmap } = scope.controllerFacades.frameMarkers;

        function shouldBypassMutation(bitmap) {
            return !!getMutationBypassReason(bitmap);
        }

        function getMutationBypassReason(bitmap) {
            if (!bitmap) return 'no-bitmap';
            const guardReason = scope.bitmapServices.getRenderGuardReason(bitmap);
            if (guardReason) return guardReason;
            if (isSmallTextScratchBitmap(bitmap)) return 'small-text-scratch';
            if (isSmallTextDrawActive(bitmap)) return 'small-text-active';
            return '';
        }

        return {
            shouldBypassMutation,
            getMutationBypassReason,
        };
    }

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutationPolicy',
        factory() {
            return { create: createController };
        },
    });
})();
