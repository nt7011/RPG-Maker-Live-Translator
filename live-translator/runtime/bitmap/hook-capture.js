// Bitmap hook capture facade.
//
// Bitmap hooks should eventually reduce to transaction shells. This facade
// keeps that transaction shape separate from adapter policy while delegating
// durable facts to the surface ledger.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.hookCapture',
        factory() {
            function createHookCapture(options = {}) {
                const surfaceLedger = options.surfaceLedger || null;
                if (!surfaceLedger || typeof surfaceLedger.beginTextDraw !== 'function' || typeof surfaceLedger.beginMutation !== 'function') {
                    throw new Error('[LiveTranslator] runtime.bitmap.hookCapture requires a surface ledger.');
                }

                function beginTextDraw(bitmap, input = {}) {
                    const normalized = normalizeTextDrawInput(input);
                    const ledgerTx = surfaceLedger.beginTextDraw(bitmap, normalized);
                    if (!ledgerTx) return null;
                    return createTransaction(ledgerTx, 'text-draw');
                }

                function beginMutation(bitmap, input = {}) {
                    const normalized = normalizeMutationInput(input);
                    const ledgerTx = surfaceLedger.beginMutation(bitmap, normalized);
                    if (!ledgerTx) return null;
                    return createTransaction(ledgerTx, 'mutation');
                }

                return freezeApi({
                    beginTextDraw,
                    beginMutation,
                });
            }

            function createTransaction(ledgerTx, kind) {
                let status = 'pending';
                const tx = {
                    kind,
                    intentId: ledgerTx.intentId || '',
                    mutationId: ledgerTx.mutationId || '',
                    surfaceId: ledgerTx.surfaceId || '',
                    callNative: ledgerTx.callNative !== false,
                    nativeArgs: Array.isArray(ledgerTx.nativeArgs) ? ledgerTx.nativeArgs.slice() : [],
                    getStatus() {
                        return status;
                    },
                    commitNativeSuccess(input = {}) {
                        if (status !== 'pending') return null;
                        status = 'committed';
                        return ledgerTx.commitNativeSuccess(input);
                    },
                    abortNativeFailure(error) {
                        if (status !== 'pending') return false;
                        status = 'aborted';
                        if (typeof ledgerTx.abortNativeFailure === 'function') {
                            return ledgerTx.abortNativeFailure(error);
                        }
                        return false;
                    },
                    finishSuppressed(reason = 'suppressed') {
                        if (status !== 'pending') return false;
                        status = 'suppressed';
                        if (typeof ledgerTx.finishSuppressed === 'function') {
                            return ledgerTx.finishSuppressed(reason);
                        }
                        if (typeof ledgerTx.abortNativeFailure === 'function') {
                            return ledgerTx.abortNativeFailure(new Error(reason));
                        }
                        return false;
                    },
                };
                return freezeApi(tx);
            }

            function normalizeTextDrawInput(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const args = Array.isArray(source.args) ? source.args : [];
                return {
                    methodName: stringify(source.methodName || 'drawText'),
                    nativeArgs: Array.isArray(source.nativeArgs) ? source.nativeArgs.slice() : args.slice(),
                    text: source.text !== undefined ? source.text : args[0],
                    x: source.x !== undefined ? source.x : args[1],
                    y: source.y !== undefined ? source.y : args[2],
                    maxWidth: source.maxWidth !== undefined ? source.maxWidth : args[3],
                    lineHeight: source.lineHeight !== undefined ? source.lineHeight : args[4],
                    align: source.align !== undefined ? source.align : args[5],
                    drawState: source.drawState || null,
                    preNativeBackdropToken: source.preNativeBackdropToken || '',
                    nativeReplaceable: source.nativeReplaceable !== false,
                    boundary: source.boundary || null,
                    surfaceId: source.surfaceId || '',
                    surfaceType: source.surfaceType || 'bitmap',
                    ownerKind: source.ownerKind || '',
                    ownerRef: source.ownerRef || null,
                };
            }

            function normalizeMutationInput(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                return {
                    methodName: stringify(source.methodName || 'mutation') || 'mutation',
                    args: Array.isArray(source.args) ? source.args.slice() : [],
                    targetRect: source.targetRect || source.rect || null,
                    targetRectAfterCopy: source.targetRectAfterCopy || source.targetRect || source.rect || null,
                    sourceBitmap: source.sourceBitmap || null,
                    sourceRect: source.sourceRect || null,
                    full: source.full === true,
                    surfaceId: source.surfaceId || '',
                    recordOp: source.recordOp || source.replayOp || null,
                    replayOp: source.replayOp || source.recordOp || null,
                    participants: Array.isArray(source.participants) ? source.participants.slice() : [],
                    destroyed: source.destroyed === true,
                    newGeneration: source.newGeneration === true,
                    targetRestoreMaterialId: source.targetRestoreMaterialId || '',
                    targetRestoreRect: source.targetRestoreRect || null,
                    targetRestoreRevisionBefore: source.targetRestoreRevisionBefore,
                };
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return {
                createHookCapture,
            };
        },
    });
})();
