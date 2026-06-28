// Bitmap text adapter support: mutation invalidation.
// Journal participants call here after native bitmap mutations succeed.
(() => {
    'use strict';

    function createController(scope = {}) {
        const { retireEntry, detachEntryForCopiedTargets, rejectUnresolvedRenderCommandsForInvalidation } = scope.controllerFacades.records;
        const { ensureBitmapState, getBitmapState, recordBitmapRenderOp, discardRenderOpsInRect } = scope.controllerFacades.replay;
        const { deriveEntryRect, isValidRect, rectanglesOverlap } = scope.controllerFacades.textUtils;

        function handleBitmapMutation(bitmap, methodName, args, mutation) {
            if (!bitmap || !mutation) return;
            const targetRect = mutation.rect && isValidRect(mutation.rect) ? mutation.rect : null;

            const state = getBitmapState(bitmap) || ensureBitmapState(bitmap);
            if (!state) return;
            state.revision += 1;
            if (methodName === 'destroy') state.destroyed = true;

            if (mutation.clearReplay) discardRenderOpsInRect(state, mutation.clearReplay === 'all' ? null : targetRect);
            if (!mutation.skipEntryInvalidation) invalidateEntriesInRect(state, targetRect, `${methodName}-bitmap`);
            if (mutation.recordOp && targetRect) {
                recordBitmapRenderOp(bitmap, Object.assign({}, mutation.recordOp, { rect: targetRect }));
            }
        }

        function invalidateEntriesInRect(state, rect, reason) {
            if (!state || !state.entries || !state.entries.size) return 0;
            const skipEntry = scope.bitmapServices.getActiveRedrawEntry(state.bitmap);
            let removed = 0;
            Array.from(state.entries.values()).forEach((entry) => {
                if (!entry || entry === skipEntry || entry.stale) return;
                const entryRect = deriveEntryRect(entry);
                if (!rect || !entryRect || rectanglesOverlap(rect, entryRect)) {
                    if (!detachEntryForCopiedTargets(entry, reason)) {
                        const recovery = rejectUnresolvedRenderCommandsForInvalidation(entry, reason);
                        retireEntry(entry, reason, 'stale', recovery);
                    }
                    removed += 1;
                }
            });
            return removed;
        }

        return {
            handleBitmapMutation,
            invalidateEntriesInRect,
        };
    }

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutationInvalidation',
        factory() {
            return { create: createController };
        },
    });
})();
