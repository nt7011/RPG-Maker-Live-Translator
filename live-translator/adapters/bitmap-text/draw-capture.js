// Bitmap text adapter support: draw capture.
// Hook installation stays in install.js; backdrop and ledger capture helpers
// live here so the hook body can keep moving toward a transaction shell.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.drawCapture',
        requires: {
            sourceObservationContract: 'runtime.bitmap.sourceObservation',
        },
        factory({ sourceObservationContract }, { scope: globalScope }) {

    function createController(scope = {}) {
        const {
            estimateTextWidth,
            createBitmapDrawContext,
            sanitizeVisibleText,
            stringify,
            finiteNumber,
            positiveNumber,
            normalizeCanvasTextAlign,
        } = scope.controllerFacades.textUtils;
        const { ensureRecordedDrawDelivery, isNormalCharacterDrawActive } = scope.controllerFacades.frameMarkers;
        const { createBitmapDrawRoutingDecision, resolveInlineBitmapReplacement } = scope.controllerFacades.drawPolicy;

        function captureNormalCharacterRunBackdrop(bitmap, runContext, text, x, y, maxWidth, lineHeight, align) {
            const runInfo = runContext && runContext.runInfo && typeof runContext.runInfo === 'object'
                ? runContext.runInfo
                : null;
            const runId = runContext && runContext.runId ? stringify(runContext.runId) : '';
            if (!runInfo || !runId || (runInfo.runId && stringify(runInfo.runId) !== runId)) return null;
            if (runInfo.backgroundPatch) return runInfo.backgroundPatch;
            const runText = sanitizeVisibleText(runInfo.text) ? stringify(runInfo.text) : stringify(text);
            const runX = finiteNumber(runInfo.x, x);
            const runY = finiteNumber(runInfo.y, y);
            const runLineHeight = positiveNumber(runInfo.lineHeight, lineHeight, bitmap && bitmap.fontSize, 24);
            const runAlign = normalizeCanvasTextAlign(runInfo.align || align);
            const measuredWidth = estimateTextWidth(bitmap, runText, 0);
            const runMaxWidth = Math.max(
                1,
                measuredWidth,
                finiteNumber(runInfo.maxWidth, 0),
                finiteNumber(maxWidth, 0)
            );
            // The first glyph draw is the last moment before the whole
            // processNormalCharacter run paints source text onto the contents.
            // Capture one run-wide backdrop here and share it with each glyph unit
            // so the window adapter can restore clean pixels after source-run grouping.
            const patch = captureBitmapDrawBackdrop(bitmap, runText, runX, runY, runMaxWidth, runLineHeight, runAlign, 'redraw')
                || captureBitmapDrawBackdrop(bitmap, runText, runX, runY, runMaxWidth, runLineHeight, runAlign, 'text');
            if (patch) runInfo.backgroundPatch = patch;
            return patch || null;
        }

        function getActiveNormalCharacterRunContext(bitmap) {
            const context = scope.bitmapServices && typeof scope.bitmapServices.getActiveDrawRunContext === 'function'
                ? scope.bitmapServices.getActiveDrawRunContext(bitmap)
                : null;
            return context && context.type === 'normalCharacter' && context.runId ? context : null;
        }

        function describeBitmapTextDrawRecordability(bitmap, input = {}) {
            const text = stringify(input.text);
            const normalCharacterDrawActive = isNormalCharacterDrawActive(bitmap);
            const normalCharacterRunContext = normalCharacterDrawActive
                ? getActiveNormalCharacterRunContext(bitmap)
                : null;
            return {
                visibleText: sanitizeVisibleText(text),
                normalCharacterDrawActive,
                normalCharacterRunContext,
            };
        }

        function prepareBitmapTextDrawMaterial(bitmap, input = {}) {
            const text = stringify(input.text);
            const x = finiteNumber(input.x, 0);
            const y = finiteNumber(input.y, 0);
            const maxWidth = finiteNumber(input.maxWidth, 0);
            const lineHeight = positiveNumber(input.lineHeight, bitmap && bitmap.fontSize, 24);
            const align = normalizeCanvasTextAlign(input.align);
            const normalCharacterRunContext = input.normalCharacterRunContext || null;
            const normalCharacterBackdrop = normalCharacterRunContext
                ? captureNormalCharacterRunBackdrop(bitmap, normalCharacterRunContext, text, x, y, maxWidth, lineHeight, align)
                : null;
            const backgroundPatch = normalCharacterBackdrop
                || captureBitmapDrawBackdrop(bitmap, text, x, y, maxWidth, lineHeight, align, 'text');
            const fallbackBackgroundPatch = normalCharacterBackdrop
                || captureBitmapDrawBackdrop(bitmap, text, x, y, maxWidth, lineHeight, align, 'redraw')
                || backgroundPatch;
            const nativeTextRegion = createBitmapNativeTextRegion(bitmap, text, x, y, maxWidth, lineHeight, align, backgroundPatch);

            return {
                backgroundPatch,
                fallbackBackgroundPatch,
                nativeTextRegion,
            };
        }

        function prepareBitmapTextDrawRecord(bitmap, input = {}) {
            const context = input.drawContext && typeof input.drawContext === 'object'
                ? input.drawContext
                : input;
            const recordability = input.recordability && typeof input.recordability === 'object'
                ? input.recordability
                : {};
            const text = stringify(context.text);
            const x = finiteNumber(context.x, 0);
            const y = finiteNumber(context.y, 0);
            const maxWidth = finiteNumber(context.maxWidth, 0);
            const lineHeight = positiveNumber(context.lineHeight, bitmap && bitmap.fontSize, 24);
            const align = normalizeCanvasTextAlign(context.align);
            const visibleText = recordability.visibleText !== undefined
                ? stringify(recordability.visibleText)
                : sanitizeVisibleText(text);
            const normalCharacterRunContext = recordability.normalCharacterRunContext || null;
            const drawMaterial = prepareBitmapTextDrawMaterial(bitmap, {
                text,
                x,
                y,
                maxWidth,
                lineHeight,
                align,
                normalCharacterRunContext,
            }) || {};
            return {
                methodName: stringify(context.methodName || 'drawText') || 'drawText',
                nativeArgs: Array.isArray(context.callArgs) ? context.callArgs.slice() : [],
                text,
                x,
                y,
                maxWidth,
                lineHeight,
                align,
                visibleText,
                normalCharacterDrawActive: recordability.normalCharacterDrawActive === true,
                normalCharacterRunContext,
                measuredWidth: visibleText ? estimateTextWidth(bitmap, text, 0) : 0,
                drawMaterial,
            };
        }

        function createBitmapTextDrawCaptureInput(drawRecord, ownerType = '') {
            if (!drawRecord || typeof drawRecord !== 'object') return null;
            return {
                methodName: drawRecord.methodName,
                nativeArgs: Array.isArray(drawRecord.nativeArgs) ? drawRecord.nativeArgs.slice() : [],
                text: drawRecord.text,
                x: drawRecord.x,
                y: drawRecord.y,
                maxWidth: drawRecord.maxWidth,
                lineHeight: drawRecord.lineHeight,
                align: drawRecord.align,
                ownerKind: stringify(ownerType),
            };
        }

        function createCommittedBitmapDrawInput(drawRecord, ownerType = '', captureTransaction = null) {
            if (!drawRecord || typeof drawRecord !== 'object') return null;
            const drawMaterial = drawRecord.drawMaterial || {};
            const normalCharacterRunContext = drawRecord.normalCharacterRunContext || null;
            return {
                methodName: drawRecord.methodName,
                text: drawRecord.text,
                x: drawRecord.x,
                y: drawRecord.y,
                maxWidth: drawRecord.maxWidth,
                lineHeight: drawRecord.lineHeight,
                align: drawRecord.align,
                ownerType: stringify(ownerType),
                measuredWidth: drawRecord.measuredWidth,
                normalCharacter: drawRecord.normalCharacterDrawActive === true,
                normalCharacterRunId: normalCharacterRunContext && normalCharacterRunContext.runId,
                backgroundPatch: drawMaterial.backgroundPatch || null,
                fallbackBackgroundPatch: drawMaterial.fallbackBackgroundPatch || null,
                captureTransaction,
                nativeTextRegion: drawMaterial.nativeTextRegion || null,
            };
        }

        function beginBitmapTextDrawCapture(bitmap, input) {
            const services = scope.bitmapServices;
            if (!services || typeof services.beginTextDrawCapture !== 'function') return null;
            try {
                return services.beginTextDrawCapture(bitmap, input);
            } catch (_) {
                return null;
            }
        }

        function abortBitmapTextDrawCapture(transaction, reason) {
            if (!transaction || typeof transaction.abortNativeFailure !== 'function') return false;
            try {
                return transaction.abortNativeFailure(reason instanceof Error ? reason : new Error(stringify(reason || 'aborted')));
            } catch (_) {
                return false;
            }
        }

        function recordCommittedBitmapDraw(bitmap, input = {}) {
            if (!bitmap || !input) return null;
            const drawState = typeof scope.captureBitmapDrawState === 'function'
                ? scope.captureBitmapDrawState(bitmap)
                : null;
            const unit = scope.bitmapServices.recordDraw(bitmap, Object.assign({}, input, { drawState }));
            if (input.nativeTextRegion && typeof scope.recordBitmapNativeTextInk === 'function') {
                scope.recordBitmapNativeTextInk(bitmap, input.nativeTextRegion);
            }
            return unit;
        }

        function commitBitmapTextDrawRecord(bitmap, input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            const unit = recordCommittedBitmapDraw(
                bitmap,
                createCommittedBitmapDrawInput(source.drawRecord, source.ownerType, source.drawCapture)
            );
            if (unit) ensureRecordedDrawDelivery(bitmap, unit);
            return unit;
        }

        function beginBitmapTextDrawTransaction(bitmap, input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            const drawContext = source.drawContext && typeof source.drawContext === 'object'
                ? source.drawContext
                : createBitmapDrawContext(bitmap, source.methodName || 'drawText', Array.isArray(source.args) ? source.args : []);
            const hasRecordabilityInput = source.visibleText !== undefined
                || source.normalCharacterDrawActive !== undefined
                || source.normalCharacterRunContext !== undefined;
            const recordability = source.recordability && typeof source.recordability === 'object'
                ? source.recordability
                : (hasRecordabilityInput ? source : describeBitmapTextDrawRecordability(bitmap, drawContext));
            const fallbackNativeArgs = Array.isArray(source.nativeArgs)
                ? source.nativeArgs
                : (Array.isArray(drawContext.callArgs) ? drawContext.callArgs : []);
            const routingDecision = source.routingDecision && typeof source.routingDecision === 'object'
                ? source.routingDecision
                : createBitmapDrawRoutingDecision(bitmap, {
                    earlyBypassReason: source.earlyBypassReason,
                    requireOwner: source.requireOwner === true,
                });
            const owner = routingDecision.owner || source.owner || null;
            const ownerType = routingDecision.ownerType || source.ownerType || '';
            const sourceObservation = sourceObservationContract.normalizeSourceObservation(
                routingDecision.sourceObservation,
                routingDecision.bypassReason ? 'ignored' : 'observed',
                routingDecision.bypassReason
            );
            const bypassReason = routingDecision.bypassReason || sourceObservation.reason || '';
            if (sourceObservation.status !== 'observed') {
                return createUnobservedBitmapTextDrawTransaction({
                    owner,
                    ownerType,
                    bypassReason,
                    sourceObservation,
                    nativeArgs: fallbackNativeArgs,
                    drawContext,
                });
            }
            const inlineReplacement = resolveInlineBitmapReplacement(bitmap, {
                owner,
                drawContext,
                recordability,
            });
            if (isActionableInlineReplacement(inlineReplacement)) {
                return createInlineReplacementDrawTransaction(inlineReplacement, {
                    owner,
                    ownerType,
                    nativeArgs: fallbackNativeArgs,
                    drawContext,
                });
            }
            const drawRecord = source.drawRecord || prepareBitmapTextDrawRecord(bitmap, {
                drawContext,
                recordability,
            });
            const visibleText = !!(source.visibleText || recordability.visibleText || drawRecord.visibleText);
            let drawCapture = visibleText
                ? beginBitmapTextDrawCapture(bitmap, createBitmapTextDrawCaptureInput(drawRecord, ownerType))
                : null;
            let closed = false;

            function finishSuppressed(reason = 'capture-suppressed') {
                if (drawCapture && typeof drawCapture.finishSuppressed === 'function') {
                    drawCapture.finishSuppressed(reason);
                }
                drawCapture = null;
                closed = true;
                return {
                    status: 'suppressed',
                    result: undefined,
                    unit: null,
                    recordResult: false,
                    sourceObservation: sourceObservationContract.createSourceObservation('suppressed', reason),
                };
            }

            function commitNativeSuccess() {
                if (!visibleText) {
                    closed = true;
                    return {
                        status: 'native-only',
                        unit: null,
                        recordResult: false,
                        notRecordable: true,
                        sourceObservation: sourceObservationContract.createSourceObservation('ignored', 'empty-visible-text'),
                    };
                }
                const unit = commitBitmapTextDrawRecord(bitmap, { drawRecord, ownerType, drawCapture });
                drawCapture = null;
                closed = true;
                return {
                    status: unit ? 'recorded' : 'recordMissed',
                    unit,
                    recordResult: true,
                    notRecordable: false,
                    sourceObservation: sourceObservationContract.createSourceObservation(
                        unit ? 'observed' : 'rejected',
                        unit ? '' : 'record-missed'
                    ),
                };
            }

            function abortNativeFailure(error) {
                const aborted = abortBitmapTextDrawCapture(drawCapture, error);
                drawCapture = null;
                closed = true;
                return aborted;
            }

            function abortUncommitted(reason) {
                if (closed || !drawCapture) return false;
                return abortNativeFailure(reason);
            }

            return {
                owner,
                ownerType,
                bypassReason: '',
                sourceObservation,
                drawContext,
                traceInput: drawContext.traceInput || {},
                callNative: !(drawCapture && drawCapture.callNative === false),
                nativeArgs: drawCapture && Array.isArray(drawCapture.nativeArgs) && drawCapture.nativeArgs.length
                    ? drawCapture.nativeArgs
                    : fallbackNativeArgs,
                finishSuppressed,
                commitNativeSuccess,
                abortNativeFailure,
                abortUncommitted,
                inlineReplacement: null,
            };
        }

        function createUnobservedBitmapTextDrawTransaction(input = {}) {
            const drawContext = input.drawContext && typeof input.drawContext === 'object' ? input.drawContext : {};
            const sourceObservation = sourceObservationContract.normalizeSourceObservation(
                input.sourceObservation,
                input.bypassReason ? 'ignored' : 'suppressed',
                input.bypassReason
            );
            const status = sourceObservation.status === 'suppressed' ? 'source-suppressed' : 'source-ignored';
            return {
                owner: input.owner || null,
                ownerType: input.ownerType || '',
                bypassReason: input.bypassReason || '',
                nativeTimingReason: input.bypassReason || '',
                sourceObservation,
                drawContext,
                traceInput: drawContext.traceInput || {},
                callNative: true,
                nativeArgs: Array.isArray(input.nativeArgs) ? input.nativeArgs : [],
                finishSuppressed() {
                    return {
                        status,
                        result: undefined,
                        unit: null,
                        recordResult: false,
                        notRecordable: sourceObservation.status === 'ignored',
                        sourceObservation,
                    };
                },
                commitNativeSuccess() {
                    return {
                        status,
                        unit: null,
                        recordResult: false,
                        notRecordable: sourceObservation.status === 'ignored',
                        bypassReason: input.bypassReason || '',
                        sourceObservation,
                    };
                },
                abortNativeFailure() {
                    return false;
                },
                abortUncommitted() {
                    return false;
                },
                inlineReplacement: null,
            };
        }

        function isActionableInlineReplacement(inlineReplacement) {
            const action = inlineReplacement && inlineReplacement.action;
            return action === 'replace-native-draw' || action === 'suppress-native-draw';
        }

        function createInlineReplacementDrawTransaction(inlineReplacement, input = {}) {
            const drawContext = input.drawContext && typeof input.drawContext === 'object' ? input.drawContext : {};
            const fallbackNativeArgs = Array.isArray(input.nativeArgs) ? input.nativeArgs : [];
            const replacementArgs = Array.isArray(inlineReplacement.nativeArgs) && inlineReplacement.nativeArgs.length
                ? inlineReplacement.nativeArgs
                : fallbackNativeArgs;
            const status = inlineReplacement.action === 'suppress-native-draw' ? 'suppressed' : 'replaced';
            const sourceObservation = sourceObservationContract.createSourceObservation(
                'suppressed',
                inlineReplacement.reason || 'inlineReplacementIndex'
            );
            return {
                owner: input.owner || null,
                ownerType: input.ownerType || '',
                bypassReason: '',
                nativeTimingReason: 'inlineReplacementIndex',
                sourceObservation,
                drawContext,
                traceInput: drawContext.traceInput || {},
                callNative: inlineReplacement.action !== 'suppress-native-draw',
                nativeArgs: replacementArgs,
                finishSuppressed() {
                    return {
                        status: 'suppressed',
                        result: undefined,
                        unit: null,
                        recordResult: false,
                        inlineReplacement,
                        sourceObservation,
                    };
                },
                commitNativeSuccess() {
                    return {
                        status,
                        unit: null,
                        recordResult: false,
                        notRecordable: false,
                        inlineReplacement,
                        sourceObservation,
                    };
                },
                abortNativeFailure() {
                    return false;
                },
                abortUncommitted() {
                    return false;
                },
                inlineReplacement,
            };
        }

        function createBitmapNativeTextRegion(bitmap, text, x, y, maxWidth, lineHeight, align, backgroundPatch) {
            if (typeof scope.createBitmapTextRegion === 'function') {
                return scope.createBitmapTextRegion(bitmap, text, x, y, maxWidth, lineHeight, align);
            }
            return backgroundPatch && backgroundPatch.region ? backgroundPatch.region : null;
        }

        function captureBitmapDrawBackdrop(bitmap, text, x, y, maxWidth, lineHeight, align, mode = 'text') {
            if (!bitmap || typeof globalScope.Bitmap === 'undefined') return null;
            const useRedrawRegion = mode === 'redraw';
            const region = useRedrawRegion && typeof scope.createBitmapTextBackdropRegion === 'function'
                ? scope.createBitmapTextBackdropRegion(bitmap, text, x, y, maxWidth, lineHeight, align)
                : (typeof scope.createBitmapTextRegion === 'function'
                    ? scope.createBitmapTextRegion(bitmap, text, x, y, maxWidth, lineHeight, align)
                    : null);
            if (!region) return null;
            const patchX = region.x1;
            const patchY = region.y1;
            const patchWidth = region.x2 - region.x1;
            const patchHeight = region.y2 - region.y1;
            const trusted = typeof scope.isBitmapTextBackdropTrusted === 'function'
                ? scope.isBitmapTextBackdropTrusted(bitmap, region) === true
                : false;

            let patchBitmap = null;
            try {
                patchBitmap = new globalScope.Bitmap(patchWidth, patchHeight);
                return scope.bitmapServices.withBitmapSkipAndSpriteReplayGuard(patchBitmap, () => {
                    patchBitmap.blt(bitmap, patchX, patchY, patchWidth, patchHeight, 0, 0, patchWidth, patchHeight);
                    return {
                        bitmap: patchBitmap,
                        x: patchX,
                        y: patchY,
                        width: patchWidth,
                        height: patchHeight,
                        region,
                        trusted,
                    };
                });
            } catch (_) {
                return null;
            }
        }

        return {
            getActiveNormalCharacterRunContext,
            describeBitmapTextDrawRecordability,
            prepareBitmapTextDrawMaterial,
            prepareBitmapTextDrawRecord,
            createBitmapTextDrawCaptureInput,
            createCommittedBitmapDrawInput,
            beginBitmapTextDrawCapture,
            abortBitmapTextDrawCapture,
            recordCommittedBitmapDraw,
            commitBitmapTextDrawRecord,
            beginBitmapTextDrawTransaction,
        };
    }

            return { create: createController };
        },
    });
})();
