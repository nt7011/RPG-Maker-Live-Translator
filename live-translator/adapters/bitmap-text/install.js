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
        const { beginBitmapDrawHookIntel, isBitmapDrawTraceEnabled, recordBitmapDrawEnterIfEnabled, recordBitmapDrawTransactionOutcome, createBitmapNativeDrawInvoker, finishBitmapDrawHookIntel } = scope.controllerFacades.drawIntel;
        const { rectFromDimensions, isValidRect } = scope.controllerFacades.textUtils;
        const bitmapTextRedactor = createBitmapTextRedactor(scope.settings);

        function install() {
            if (typeof Bitmap === 'undefined' || !Bitmap || !Bitmap.prototype) {
                scope.traceLog('[BitmapText] Bitmap unavailable; skipping bitmap adapter.');
                return { status: 'skipped', reason: 'Bitmap is unavailable.' };
            }
            if (!scope.hasRequiredOrchestrator(scope.adapterContract)) {
                scope.traceLog('[BitmapText] Text orchestrator unavailable; skipping bitmap adapter.');
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
                onRenderCommandReady: applyRenderCommand,
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
        
            Bitmap.prototype[methodName] = createInstalledBitmapDrawWrapper(methodName, current);
            scope.perf.count('bitmapText.draw.wrapperInstalled');
            scope.perf.top('bitmapText.draw.method', methodName);
            scope.traceLog(`[BitmapText] Wrapped Bitmap.${methodName}`);
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
                    ? createInstalledBitmapDrawWrapper(methodName, value)
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

        function createInstalledBitmapDrawWrapper(methodName, original) {
            // Redaction is a separate wrapper so disabled mode keeps the hot draw path unchanged.
            return bitmapTextRedactor
                ? createRedactedBitmapDrawWrapper(methodName, original, bitmapTextRedactor)
                : createBitmapDrawWrapper(methodName, original);
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

        function createRedactedBitmapDrawWrapper(methodName, original, redactor) {
            if (hasHookInChain(original, '__trBitmapTextAdapter', DRAW_WRAPPER_TOKEN)) return original;
            const wrapped = function(...args) {
                return handleRedactedBitmapDrawText(this, methodName, original, args, redactor);
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
            const hookIntel = beginBitmapDrawHookIntel(methodName);
            const profilerOn = hookIntel.profilerOn === true;
            const hookStart = hookIntel.hookStart;

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
                finishBitmapDrawHookIntel({
                    hookStart,
                    methodName,
                    status,
                    bypassReason: drawTransaction.bypassReason || '',
                    nativeDraw,
                });
            }
        }

        function handleRedactedBitmapDrawText(bitmap, methodName, original, args, redactor) {
            if (conversionScope && typeof conversionScope.isActive === 'function' && conversionScope.isActive()) {
                const routed = conversionScope.routeMutation(bitmap, methodName, args);
                if (routed && routed.handled) return routed.result;
                return 0;
            }
            const traceEnabled = isBitmapDrawTraceEnabled();
            const hookIntel = beginBitmapDrawHookIntel(methodName);
            const profilerOn = hookIntel.profilerOn === true;
            const hookStart = hookIntel.hookStart;
            const redactedArgs = redactBitmapDrawArgs(args, redactor);

            const nativeDraw = createBitmapNativeDrawInvoker(bitmap, methodName, original);
            // The transaction receives randomized source text; native drawing receives original args.
            const drawTransaction = beginBitmapTextDrawTransaction(bitmap, {
                methodName,
                args: redactedArgs,
                nativeArgs: args,
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
                finishBitmapDrawHookIntel({
                    hookStart,
                    methodName,
                    status,
                    bypassReason: drawTransaction.bypassReason || '',
                    nativeDraw,
                });
            }
        }

        function createBitmapTextRedactor(settings) {
            if (!settings || typeof settings !== 'object') return null;
            const logging = settings.logging && typeof settings.logging === 'object' ? settings.logging : null;
            if (!logging || logging.redactText !== true) return null;

            const seed = createRedactionSeed();
            const cache = new Map();
            return {
                redact(text) {
                    const source = String(text ?? '');
                    if (!source) return source;
                    const cached = cache.get(source);
                    if (cached !== undefined) return cached;
                    const rng = createRedactionRng(seed, source);
                    const redacted = Array.from(source, (char) => redactBitmapTextCharacter(char, rng)).join('');
                    cache.set(source, redacted);
                    return redacted;
                },
            };
        }

        function redactBitmapDrawArgs(args, redactor) {
            const redactedArgs = Array.isArray(args) ? args.slice() : Array.prototype.slice.call(args || []);
            if (!redactedArgs.length || redactedArgs[0] === undefined || redactedArgs[0] === null) return redactedArgs;
            redactedArgs[0] = redactor.redact(redactedArgs[0]);
            return redactedArgs;
        }

        function createRedactionSeed() {
            try {
                if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
                    const values = new Uint32Array(1);
                    crypto.getRandomValues(values);
                    if (values[0]) return values[0] >>> 0;
                }
            } catch (_) {}
            return (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0) || 0x9E3779B9;
        }

        function createRedactionRng(seed, text) {
            let state = hashRedactionText(seed, text) || 0x6D2B79F5;
            // Mulberry32 gives stable replacement text for repeated source strings in this runtime session.
            return function nextRandom() {
                state = (state + 0x6D2B79F5) >>> 0;
                let value = Math.imul(state ^ (state >>> 15), state | 1);
                value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
                return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
            };
        }

        function hashRedactionText(seed, text) {
            let hash = (seed ^ 2166136261) >>> 0;
            for (let index = 0; index < text.length; index += 1) {
                hash ^= text.charCodeAt(index);
                hash = Math.imul(hash, 16777619) >>> 0;
            }
            return hash >>> 0;
        }

        function redactBitmapTextCharacter(char, rng) {
            const code = char.charCodeAt(0);
            if (/\s/u.test(char) || code === 0x00A4) return char;
            if (code >= 0x30 && code <= 0x39) return randomCharInRange(rng, 0x30, 0x39, code);
            if (code >= 0x41 && code <= 0x5A) return randomCharInRange(rng, 0x41, 0x5A, code);
            if (code >= 0x61 && code <= 0x7A) return randomCharInRange(rng, 0x61, 0x7A, code);
            if (code >= 0xFF10 && code <= 0xFF19) return randomCharInRange(rng, 0xFF10, 0xFF19, code);
            if (code >= 0xFF21 && code <= 0xFF3A) return randomCharInRange(rng, 0xFF21, 0xFF3A, code);
            if (code >= 0xFF41 && code <= 0xFF5A) return randomCharInRange(rng, 0xFF41, 0xFF5A, code);
            if (code >= 0x3041 && code <= 0x3096) return randomCharInRange(rng, 0x3041, 0x3096, code);
            if (code >= 0x30A1 && code <= 0x30FA) return randomCharInRange(rng, 0x30A1, 0x30FA, code);
            if (code >= 0x4E00 && code <= 0x9FFF) return randomCharInRange(rng, 0x4E00, 0x9FFF, code);
            if (code >= 0xAC00 && code <= 0xD7A3) return randomCharInRange(rng, 0xAC00, 0xD7A3, code);
            return char;
        }

        function randomCharInRange(rng, min, max, original) {
            let code = min + Math.floor(rng() * (max - min + 1));
            if (code === original && max > min) code = code === max ? min : code + 1;
            return String.fromCharCode(code);
        }

        return { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, installDeferredBitmapDrawWrapper, handleBitmapDrawText };
    }

            return { create: createController };
        },
    });
})();
