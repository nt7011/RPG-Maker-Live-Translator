// Bitmap text adapter support: mutation descriptors.
// Mutation wrappers execute transactions; this module shapes mutation data.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutationDescriptor',
        requires: {
            bitmapRenderOps: 'runtime.bitmapRenderOps',
        },
        factory({ bitmapRenderOps }) {

    function createController(scope = {}) {
        const { rectFromDimensions, rectOrNull, finiteNumber, positiveNumber } = scope.controllerFacades.textUtils;

        function describeMutation(bitmap, methodName, args) {
            const full = rectFromDimensions(0, 0, bitmap && bitmap.width, bitmap && bitmap.height);
            const traits = bitmapRenderOps.classifyMutation(methodName, {
                args,
                targetBitmap: bitmap,
            });
            const recordOp = () => createMutationRecordOp(methodName, args, traits);
            switch (methodName) {
            case 'clear':
                return { rect: null, clearReplay: 'all', full: true, traits };
            case 'resize':
                return { rect: null, clearReplay: 'all', full: true, sourceBitmap: bitmap, sourceRect: full, traits };
            case 'destroy':
                return { rect: null, clearReplay: 'all', full: true, traits };
            case 'fillAll':
                return { rect: full, clearReplay: 'all', full: true, recordOp: recordOp(), traits };
            case 'clearRect':
                return { rect: rectOrNull(rectFromDimensions(args[0], args[1], args[2], args[3])), clearReplay: 'rect', traits };
            case 'fillRect':
                return { rect: rectOrNull(rectFromDimensions(args[0], args[1], args[2], args[3])), recordOp: recordOp(), traits };
            case 'gradientFillRect':
                return { rect: rectOrNull(rectFromDimensions(args[0], args[1], args[2], args[3])), recordOp: recordOp(), traits };
            case 'strokeRect':
                return { rect: rectOrNull(rectFromDimensions(args[0], args[1], args[2], args[3])), recordOp: recordOp(), traits };
            case 'drawCircle': {
                const r = finiteNumber(args[2], 0);
                return { rect: rectOrNull(rectFromDimensions(finiteNumber(args[0], 0) - r, finiteNumber(args[1], 0) - r, r * 2, r * 2)), recordOp: recordOp(), traits };
            }
            case 'blt':
            case 'bltImage': {
                const sxOffset = methodName === 'blt' ? 3 : 3;
                const sourceRect = rectOrNull(rectFromDimensions(args[1], args[2], args[3], args[4]));
                const sw = finiteNumber(args[sxOffset], 0);
                const sh = finiteNumber(args[sxOffset + 1], 0);
                const dx = finiteNumber(args[sxOffset + 2], 0);
                const dy = finiteNumber(args[sxOffset + 3], 0);
                const dw = positiveNumber(args[sxOffset + 4], sw);
                const dh = positiveNumber(args[sxOffset + 5], sh);
                return { rect: rectOrNull(rectFromDimensions(dx, dy, dw, dh)), sourceBitmap: args[0] || null, sourceRect, recordOp: recordOp(), traits };
            }
            case 'adjustTone':
            case 'rotateHue':
            case 'blur':
                return { rect: full, sourceBitmap: bitmap, sourceRect: full, unsupported: true, traits };
            default:
                return { rect: null, traits };
            }
        }

        function createMutationRecordOp(methodName, args, traits) {
            if (!traits || traits.replayable !== true) return null;
            return {
                methodName,
                args: Array.isArray(args) ? args.slice() : [],
                sourceBitmap: traits.sourceBitmap || null,
                traits,
            };
        }

        function createMutationJournalInput(methodName, args, mutation, capabilities) {
            const input = createLedgerMutationInput(methodName, args, mutation);
            input.capabilities = Array.isArray(capabilities) ? capabilities.slice() : [];
            return input;
        }

        function createLedgerMutationInput(methodName, args, mutation) {
            const descriptor = mutation && typeof mutation === 'object' ? mutation : {};
            return {
                methodName: String(methodName || 'mutation') || 'mutation',
                args: Array.isArray(args) ? args.slice() : [],
                targetRect: descriptor.rect || null,
                targetRectAfterCopy: descriptor.rect || null,
                sourceBitmap: descriptor.sourceBitmap || null,
                sourceRect: descriptor.sourceRect || null,
                full: descriptor.full === true,
                clearReplay: descriptor.clearReplay || '',
                replayOp: descriptor.recordOp || null,
                recordOp: descriptor.recordOp || null,
                destroyed: methodName === 'destroy',
                newGeneration: methodName === 'resize',
            };
        }

        function createMutationDescriptorFromJournalContext(context) {
            if (!context || typeof context !== 'object') return {};
            const targetRestoreMaterial = getCopiedTargetRestoreMaterialDescriptor(context);
            return {
                rect: context.targetRect || null,
                sourceBitmap: context.sourceBitmap || null,
                sourceRect: context.sourceRect || null,
                full: context.full === true,
                clearReplay: context.clearReplay || '',
                recordOp: context.recordOp || null,
                targetRestoreMaterialId: targetRestoreMaterial ? targetRestoreMaterial.materialId : '',
                targetRestoreRect: targetRestoreMaterial ? targetRestoreMaterial.rect : null,
                targetRestoreRevisionBefore: targetRestoreMaterial ? targetRestoreMaterial.targetRevisionBefore : undefined,
            };
        }

        function getCopiedTargetRestoreMaterialDescriptor(context) {
            if (!context || typeof context.getMetadata !== 'function') return null;
            const material = context.getMetadata('copiedTargetRestoreMaterial');
            const materialId = String(material && material.materialId || '');
            if (!materialId) return null;
            return {
                materialId,
                rect: material.rect || null,
                targetRevisionBefore: Number(material.targetRevisionBefore),
            };
        }

        return {
            describeMutation,
            createMutationJournalInput,
            createLedgerMutationInput,
            createMutationDescriptorFromJournalContext,
        };
    }

            return { create: createController };
        },
    });
})();
