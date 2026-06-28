// Bitmap text adapter support: install.
// Each controller receives one adapter instance scope from bitmap-text.js.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.install',
        requires: {
            conversionScope: 'runtime.conversionScope',
        },
        factory({ conversionScope }, { scope: globalScope }) {
            const BITMAP_FALLBACK_TEXT_RUN_CLAIM_ORDER = 2;

    function createController(scope = {}) {
        const { ADAPTER_ID, RENDER_STRATEGY, DRAW_WRAPPER_TOKEN } = scope;
        const { beginBitmapTextDrawTransaction } = scope.controllerFacades.drawCapture;
        const { applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, markEntryTerminal } = scope.controllerFacades.records;
        const { registerCopiedBitmapTargetProvider } = scope.controllerFacades.copiedTargets;
        const { installBitmapMutationHooks } = scope.controllerFacades.mutations;
        const { installFrameFlushHooks, hasActiveFrameFlushHooks, ensureActiveFrameFlushHooks, hasHookInChain, installSmallTextMarkers, installNormalCharacterMarker } = scope.controllerFacades.frameMarkers;
        const { ensureBitmapState, getBitmapState, nextDrawOrder, withBitmapReplay, collectReplayItems, replayBitmapItems } = scope.controllerFacades.replay;
        const { handleBitmapTextRuns } = scope.controllerFacades.fallbackObserver;
        const { beginBitmapDrawHookDiagnostics, isBitmapDrawTraceEnabled, recordBitmapDrawEnterIfEnabled, recordBitmapDrawTransactionOutcome, createBitmapNativeDrawInvoker, finishBitmapDrawHookDiagnostics } = scope.controllerFacades.drawDiagnostics;
        const { rectFromDimensions, isValidRect } = scope.controllerFacades.textUtils;

        function install() {
            if (typeof Bitmap === 'undefined' || !Bitmap || !Bitmap.prototype) {
                scope.diag('[BitmapText] Bitmap unavailable; skipping bitmap adapter.');
                return { status: 'skipped', reason: 'Bitmap is unavailable.' };
            }
            if (!scope.hasRequiredOrchestrator(scope.adapterContract)) {
                scope.diag('[BitmapText] Text orchestrator unavailable; skipping bitmap adapter.');
                return { status: 'skipped', reason: 'Text orchestrator is unavailable.' };
            }
            if (Bitmap.prototype.drawText
                && hasHookInChain(Bitmap.prototype.drawText, '__trBitmapTextAdapter', DRAW_WRAPPER_TOKEN)) {
                registerBitmapCapabilities();
                exposeAdapterApi();
                return { status: 'installed', reason: 'Bitmap text adapter was already installed.' };
            }

            registerBitmapCapabilities();
            exposeAdapterApi();
            installOrchestratorSubscription();
            installBitmapMutationHooks();
            installSmallTextMarkers();
            installNormalCharacterMarker();
            installBitmapDrawWrappers();
            scope.frameFlushInstalled = installFrameFlushHooks();

            return {
                status: 'installed',
                reason: scope.frameFlushInstalled
                    ? 'Bitmap text adapter installed with frame-boundary flushing.'
                    : 'Bitmap text adapter installed; frame hook target was unavailable.',
            };
        }

        function installOrchestratorSubscription() {
            scope.adapterContract.subscribeRecords({
                token: RENDER_STRATEGY,
                records: scope.entriesByItemId,
                renderStrategy: RENDER_STRATEGY,
                getRenderGeneration: getRenderGeneration,
                isRenderTargetCurrent: isRenderTargetCurrent,
                onRenderQueued: applyRenderCommand,
                onRenderRejected: handleRenderRejected,
                onSkipped(entry, event) {
                    markEntryTerminal(entry, 'skipped', event.message || 'translation skipped');
                },
                onFailed(entry, event) {
                    markEntryTerminal(entry, 'failed', event.message || 'translation failed');
                },
            });
        }

        function registerBitmapCapabilities() {
            registerCopiedBitmapTargetProvider();
            scope.bitmapServices.registerReplayProvider({
                getBitmapState,
                ensureBitmapState,
                nextDrawOrder,
                collectReplayItems,
                replayBitmapItems,
                withBitmapReplay,
                rectFromDimensions,
                isValidRect,
            });
            scope.bitmapServices.registerMutationPublisher();
            scope.bitmapServices.subscribeTextRuns({
                adapterId: ADAPTER_ID,
                token: 'bitmap-fallback-draws',
                claimOrder: BITMAP_FALLBACK_TEXT_RUN_CLAIM_ORDER,
                onRuns: handleBitmapTextRuns,
            });
        }
        
        function exposeAdapterApi() {
            const api = {
                __token: 'liveTranslator.bitmapTextAdapter',
                flush: flushPendingDrawUnits,
                flushPendingDrawUnits,
                getBitmapState,
                ensureBitmapState,
                hasFrameFlushHooksActive: hasActiveFrameFlushHooks,
                ensureFrameFlushHooks: ensureActiveFrameFlushHooks,
            };
            try { globalScope.LiveTranslatorBitmapTextAdapter = api; } catch (_) {}
        }

        function flushPendingDrawUnits(reason = 'frame', targetBitmap = null, options = undefined) {
            if (!scope.bitmapServices || typeof scope.bitmapServices.flushPendingDrawUnits !== 'function') return 0;
            return scope.bitmapServices.flushPendingDrawUnits(reason, targetBitmap, options) || 0;
        }
        
        function installBitmapDrawWrappers() {
            installBitmapDrawWrapper('drawText');
            ['drawTextS', 'drawTextM'].forEach((methodName) => {
                if (!installBitmapDrawWrapper(methodName)) installDeferredBitmapDrawWrapper(methodName);
            });
        }

        function installBitmapDrawWrapper(methodName) {
            const current = Bitmap.prototype[methodName];
            if (typeof current !== 'function') return false;
            if (hasHookInChain(current, '__trBitmapTextAdapter', DRAW_WRAPPER_TOKEN)) return true;
        
            Bitmap.prototype[methodName] = createBitmapDrawWrapper(methodName, current);
            scope.perf.count('bitmapText.draw.wrapperInstalled');
            scope.perf.top('bitmapText.draw.method', methodName);
            scope.diag(`[BitmapText] Wrapped Bitmap.${methodName}`);
            return true;
        }

        function installDeferredBitmapDrawWrapper(methodName) {
            const prototype = Bitmap && Bitmap.prototype;
            if (!prototype || !methodName) return false;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
            if (descriptor && descriptor.configurable === false) return false;
            if (descriptor && (descriptor.get || descriptor.set)) return isDeferredBitmapDrawWrapper(descriptor);

            let assigned = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
                ? descriptor.value
                : undefined;
            const enumerable = descriptor ? descriptor.enumerable === true : true;
            const getter = function() {
                return assigned;
            };
            const setter = function(value) {
                assigned = typeof value === 'function'
                    ? createBitmapDrawWrapper(methodName, value)
                    : value;
            };
            getter.__trBitmapTextDeferredWrapper = DRAW_WRAPPER_TOKEN;
            setter.__trBitmapTextDeferredWrapper = DRAW_WRAPPER_TOKEN;
            Object.defineProperty(prototype, methodName, {
                configurable: true,
                enumerable,
                get: getter,
                set: setter,
            });
            if (typeof assigned === 'function') setter(assigned);
            return true;
        }

        function isDeferredBitmapDrawWrapper(descriptor) {
            return !!(descriptor
                && descriptor.get
                && descriptor.set
                && descriptor.get.__trBitmapTextDeferredWrapper === DRAW_WRAPPER_TOKEN
                && descriptor.set.__trBitmapTextDeferredWrapper === DRAW_WRAPPER_TOKEN);
        }

        function createBitmapDrawWrapper(methodName, original) {
            if (hasHookInChain(original, '__trBitmapTextAdapter', DRAW_WRAPPER_TOKEN)) return original;
            const wrapped = function(...args) {
                return handleBitmapDrawText(this, methodName, original, args);
            };
            wrapped.__trBitmapTextAdapter = DRAW_WRAPPER_TOKEN;
            wrapped.__trOriginal = original;
            return wrapped;
        }
        
        function handleBitmapDrawText(bitmap, methodName, original, args) {
            if (conversionScope && typeof conversionScope.isActive === 'function' && conversionScope.isActive()) {
                const routed = conversionScope.routeMutation(bitmap, methodName, args);
                if (routed && routed.handled) return routed.result;
                return 0;
            }
            const traceEnabled = isBitmapDrawTraceEnabled();
            const hookDiagnostics = beginBitmapDrawHookDiagnostics(methodName);
            const profilerOn = hookDiagnostics.profilerOn === true;
            const hookStart = hookDiagnostics.hookStart;

            const nativeDraw = createBitmapNativeDrawInvoker(bitmap, methodName, original);
            const drawTransaction = beginBitmapTextDrawTransaction(bitmap, {
                methodName,
                args,
                requireOwner: traceEnabled,
            });
            const drawTraceInput = drawTransaction.traceInput || {};
            drawTraceInput.ownerType = drawTransaction.ownerType || '';
            recordBitmapDrawEnterIfEnabled(bitmap, { traceEnabled, traceInput: drawTraceInput });
        
            let status = 'native-only';
            let nativeSucceeded = false;
            try {
                if (drawTransaction.callNative === false) {
                    const suppressed = drawTransaction.finishSuppressed('capture-suppressed');
                    status = suppressed && suppressed.status ? suppressed.status : 'suppressed';
                    recordBitmapDrawTransactionOutcome(bitmap, {
                        outcome: suppressed,
                        traceEnabled,
                        traceInput: drawTraceInput,
                        profilerOn,
                    });
                    return suppressed ? suppressed.result : undefined;
                }
                const result = nativeDraw.invoke(drawTransaction.nativeArgs, drawTransaction.nativeTimingReason || '');
                nativeSucceeded = true;
                const outcome = drawTransaction.commitNativeSuccess();
                status = outcome && outcome.status ? outcome.status : status;
                recordBitmapDrawTransactionOutcome(bitmap, {
                    outcome,
                    traceEnabled,
                    traceInput: drawTraceInput,
                    profilerOn,
                });
                return result;
            } catch (error) {
                drawTransaction.abortNativeFailure(error);
                throw error;
            } finally {
                drawTransaction.abortUncommitted(nativeSucceeded ? 'record-missed' : 'native-failure');
                finishBitmapDrawHookDiagnostics({
                    hookStart,
                    methodName,
                    status,
                    bypassReason: drawTransaction.bypassReason || '',
                    nativeDraw,
                });
            }
        }

        return { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, installDeferredBitmapDrawWrapper, handleBitmapDrawText };
    }

            return { create: createController };
        },
    });
})();
