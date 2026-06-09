// Bitmap text adapter support: install.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/install.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/bitmap-text/install.js.');
    }
    const bitmapDrawRuns = requireRuntimeModule('runtime.bitmapDrawRuns');
    if (!bitmapDrawRuns || typeof bitmapDrawRuns.collectRunsFromBatch !== 'function') {
        throw new Error('[LiveTranslator] runtime.bitmapDrawRuns is unavailable before adapters/bitmap-text/install.js.');
    }

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const renderTransaction = scope.renderTransaction;
        const { scheduleFallbackFlush, flushQueuedBitmaps, flushAggregatedLines } = scope.controllerFacades.aggregation;
        const { applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, markEntryTerminal } = scope.controllerFacades.records;
        const { installBitmapMutationHooks, sanitizePerfLabel } = scope.controllerFacades.mutations;
        const { installFrameFlushHooks, hasActiveFrameFlushHooks, ensureActiveFrameFlushHooks, hasHookInChain, installSmallTextMarkers, installNormalCharacterMarker, isSmallTextDrawActive, isNormalCharacterDrawActive, isSmallTextScratchBitmap } = scope.controllerFacades.frameMarkers;
        const { ensureBitmapState, getBitmapState, nextDrawOrder, withBitmapReplay, collectReplayItems, replayBitmapItems } = scope.controllerFacades.replay;
        const { estimateTextWidth, computeFontSignature, sanitizeVisibleText, isStandaloneGlyphText, recordDrawTrace, bitmapTraceDetails, readBitmapOwner, hasDedicatedOwnerHook, describeBitmapContentsOwnership, rectFromDimensions, isValidRect, normalizeCanvasTextAlign, describeOwnerType, stringify, finiteNumber, positiveNumber, pruneArray } = scope.controllerFacades.textUtils;

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
            scope.bitmapServices.registerFallbackFlush(flushQueuedBitmaps);
            scope.bitmapServices.registerMutationPublisher();
            scope.bitmapServices.subscribeDrawBatches({
                adapterId: ADAPTER_ID,
                token: 'bitmap-fallback-draws',
                priority: 300,
                onBatch: handleBitmapDrawBatch,
            });
        }
        
        function exposeAdapterApi() {
            const api = {
                __token: 'liveTranslator.bitmapTextAdapter',
                flush: flushQueuedBitmaps,
                flushQueuedBitmaps,
                flushAggregatedLines,
                getBitmapState,
                ensureBitmapState,
                hasFrameFlushHooksActive: hasActiveFrameFlushHooks,
                ensureFrameFlushHooks: ensureActiveFrameFlushHooks,
            };
            try { globalScope.LiveTranslatorBitmapTextAdapter = api; } catch (_) {}
        }
        
        function installBitmapDrawWrappers() {
            installBitmapDrawWrapper('drawText');
            ['drawTextS', 'drawTextM'].forEach((methodName) => {
                if (!installBitmapDrawWrapper(methodName)) installDeferredBitmapDrawWrapper(methodName);
            });
            try {
                Bitmap.prototype._trFlushAggregatedLines = function() {
                    flushAggregatedLines(this, 'bitmap.flush');
                };
            } catch (_) {}
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
            const traceEnabled = isBitmapDrawTraceEnabled();
            const earlyBypassReason = describeBitmapDrawBypassReason(bitmap);
            if (earlyBypassReason && !traceEnabled) {
                return invokeFastBypassedBitmapDraw(bitmap, methodName, original, args, earlyBypassReason);
            }

            const profilerOn = scope.isPerfEnabled();
            const hookStart = profilerOn ? perfNow() : null;
            let nativeDrawMs = 0;
            if (profilerOn) {
                perfCount('bitmap.drawText.calls', 1, 'hook');
                perfTop('bitmap.drawText.method', methodName, 1, 'hook');
            }

            const [inputText, rawX, rawY, rawMaxWidth, rawLineHeight, rawAlign] = args;
            const text = stringify(inputText);
            const align = normalizeCanvasTextAlign(rawAlign);
            const callArgs = [text, rawX, rawY, rawMaxWidth, rawLineHeight, align];
            const invokeBitmapDraw = (drawArgs, bypassReason = '') => {
                if (!profilerOn) return original.apply(bitmap, drawArgs);
                const nativeStart = perfNow();
                try {
                    return original.apply(bitmap, drawArgs);
                } finally {
                    const nativeMs = Math.max(0, perfNow() - nativeStart);
                    nativeDrawMs += nativeMs;
                    const attribution = classifyBitmapNativeDrawAttribution(bitmap, bypassReason);
                    recordBitmapNativeDrawTiming(methodName, nativeMs, attribution, bypassReason);
                }
            };
            const invokeOriginal = (bypassReason = '') => invokeBitmapDraw(callArgs, bypassReason);
            const x = finiteNumber(rawX, 0);
            const y = finiteNumber(rawY, 0);
            const lineHeight = positiveNumber(rawLineHeight, positiveNumber(bitmap && bitmap.fontSize, 24));
            const maxWidth = finiteNumber(rawMaxWidth, 0);
            let owner = null;
            let ownerType = '';
            if (traceEnabled) {
                owner = readBitmapOwner(bitmap);
                ownerType = describeOwnerType(owner, bitmap);
                recordDrawTrace('bitmap.drawText.enter', text, bitmapTraceDetails(bitmap, methodName, text, x, y, {
                    ownerType,
                    maxWidth,
                    lineHeight,
                    align,
                }));
            }
        
            const bypassReason = earlyBypassReason || describeBitmapDrawBypassReason(bitmap);
            if (bypassReason) {
                if (profilerOn) {
                    perfCount('bitmap.drawText.bypassed', 1, 'hook');
                    perfTop('bitmap.drawText.bypassReason', bypassReason, 1, 'hook');
                }
                if (traceEnabled) {
                    recordDrawTrace('bitmap.drawText.bypass', text, bitmapTraceDetails(bitmap, methodName, text, x, y, {
                        ownerType,
                        reason: bypassReason,
                        maxWidth,
                        lineHeight,
                        align,
                    }));
                }
                try {
                    return invokeOriginal(bypassReason);
                } finally {
                    recordBitmapHookTiming(hookStart, methodName, 'bypassed', bypassReason, nativeDrawMs);
                }
            }

            owner = owner || readBitmapOwner(bitmap);
            ownerType = ownerType || describeOwnerType(owner, bitmap);
            if (hasDedicatedOwnerHook(owner) || isDedicatedTextContents(bitmap)) {
                if (profilerOn) {
                    perfCount('bitmap.drawText.bypassed', 1, 'hook');
                    perfTop('bitmap.drawText.bypassReason', 'dedicatedOwnerHook', 1, 'hook');
                }
                if (traceEnabled) {
                    recordDrawTrace('bitmap.drawText.bypass', text, bitmapTraceDetails(bitmap, methodName, text, x, y, {
                        ownerType,
                        reason: 'dedicatedOwnerHook',
                        maxWidth,
                        lineHeight,
                        align,
                    }));
                }
                try {
                    return invokeOriginal('dedicatedOwnerHook');
                } finally {
                    recordBitmapHookTiming(hookStart, methodName, 'bypassed', 'dedicatedOwnerHook', nativeDrawMs);
                }
            }

            const isWindowOwnedBitmap = !!(owner && owner.contents === bitmap);
            const normalCharacterDrawActive = isNormalCharacterDrawActive(bitmap);
            const normalCharacterRunContext = normalCharacterDrawActive
                ? getActiveNormalCharacterRunContext(bitmap)
                : null;
            const visibleText = sanitizeVisibleText(text);
            const deferWindowOwnedGlyphSurfaceDraw = shouldDeferWindowOwnedGlyphSurfaceDraw(methodName, visibleText, normalCharacterDrawActive);
            if (isWindowOwnedBitmap && visibleText && !normalCharacterDrawActive && !deferWindowOwnedGlyphSurfaceDraw) {
                const fragment = createFragment(bitmap, {
                    methodName,
                    text,
                    x,
                    y,
                    maxWidth,
                    lineHeight,
                    align,
                    ownerType,
                    drawState: scope.captureBitmapDrawState(bitmap),
                });
                const ownership = fragment ? recordBitmapSurfaceDraw(bitmap, fragment) : null;
                if (ownership && ownership.status === 'claimed' && ownership.ownerAdapter && ownership.ownerAdapter !== ADAPTER_ID) {
                    const drawDecision = normalizeSurfaceDrawDecision(ownership.drawDecision, {
                        x,
                        y,
                        maxWidth,
                        lineHeight,
                        align,
                    });
                    if (drawDecision && drawDecision.action === 'replace-native-draw') {
                        if (traceEnabled) {
                            recordDrawTrace('bitmap.drawText.replaced', drawDecision.text, bitmapTraceDetails(bitmap, methodName, drawDecision.text, drawDecision.x, drawDecision.y, {
                                ownerType,
                                reason: drawDecision.reason || 'surfaceDrawDecision',
                                ownerAdapter: ownership.ownerAdapter,
                                ownershipReason: ownership.reason || '',
                                originalText: text,
                                maxWidth: drawDecision.maxWidth,
                                lineHeight: drawDecision.lineHeight,
                                align: drawDecision.align,
                            }));
                        }
                        try {
                            return invokeBitmapDraw([
                                drawDecision.text,
                                drawDecision.x,
                                drawDecision.y,
                                drawDecision.maxWidth,
                                drawDecision.lineHeight,
                                drawDecision.align,
                            ], 'surfaceOwnedReplace');
                        } finally {
                            recordBitmapHookTiming(hookStart, methodName, 'replaced', 'surfaceOwnedReplace', nativeDrawMs);
                        }
                    }
                    if (drawDecision && drawDecision.action === 'suppress-native-draw') {
                        if (traceEnabled) {
                            recordDrawTrace('bitmap.drawText.skip', text, bitmapTraceDetails(bitmap, methodName, text, x, y, {
                                ownerType,
                                reason: drawDecision.reason || 'surfaceDrawDecision',
                                ownerAdapter: ownership.ownerAdapter,
                                ownershipReason: ownership.reason || '',
                                maxWidth,
                                lineHeight,
                                align,
                            }));
                        }
                        recordBitmapHookTiming(hookStart, methodName, 'suppressed', 'surfaceOwnedSuppress', nativeDrawMs);
                        return undefined;
                    }
                }
            }

            let status = 'native-only';
            const normalCharacterBackdrop = normalCharacterRunContext
                ? captureNormalCharacterRunBackdrop(bitmap, normalCharacterRunContext, text, x, y, maxWidth, lineHeight, align)
                : null;
            const backgroundPatch = normalCharacterBackdrop
                || captureBitmapDrawBackdrop(bitmap, text, x, y, maxWidth, lineHeight, align, 'text');
            const fallbackBackgroundPatch = normalCharacterBackdrop
                || captureBitmapDrawBackdrop(bitmap, text, x, y, maxWidth, lineHeight, align, 'redraw')
                || backgroundPatch;
            const nativeTextRegion = typeof scope.createBitmapTextRegion === 'function'
                ? scope.createBitmapTextRegion(bitmap, text, x, y, maxWidth, lineHeight, align)
                : (backgroundPatch && backgroundPatch.region ? backgroundPatch.region : null);
            const measuredWidth = visibleText ? estimateTextWidth(bitmap, text, 0) : 0;
            try {
                const result = invokeOriginal('');
                if (visibleText) {
                    const drawState = scope.captureBitmapDrawState(bitmap);
                    const unit = scope.bitmapServices.recordDraw(bitmap, {
                        methodName,
                        text,
                        x,
                        y,
                        maxWidth,
                        lineHeight,
                        align,
                        ownerType,
                        drawState,
                        measuredWidth,
                        normalCharacter: normalCharacterDrawActive,
                        normalCharacterRunId: normalCharacterRunContext && normalCharacterRunContext.runId,
                        backgroundPatch,
                        fallbackBackgroundPatch,
                    });
                    status = unit ? 'recorded' : 'recordMissed';
                    if (profilerOn) perfCount(unit ? 'bitmap.drawText.recorded' : 'bitmap.drawText.recordMissed', 1, 'hook');
                    if (unit) ensureRecordedDrawDelivery();
                    if (unit && traceEnabled) {
                        recordDrawTrace('bitmap.drawText.recorded', text, bitmapTraceDetails(bitmap, methodName, text, x, y, {
                            ownerType,
                            drawUnitId: unit.id || '',
                            maxWidth,
                            lineHeight,
                            align,
                        }));
                    }
                    if (typeof scope.recordBitmapNativeTextInk === 'function') {
                        scope.recordBitmapNativeTextInk(bitmap, nativeTextRegion);
                    }
                } else if (profilerOn) {
                    perfCount('bitmap.drawText.notRecordable', 1, 'hook');
                }
                return result;
            } finally {
                recordBitmapHookTiming(hookStart, methodName, status, '', nativeDrawMs);
            }
        }

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
            // so the window adapter can restore clean pixels after batch grouping.
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

        function captureBitmapDrawBackdrop(bitmap, text, x, y, maxWidth, lineHeight, align, mode = 'text') {
            if (!bitmap || typeof Bitmap === 'undefined') return null;
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
                patchBitmap = new Bitmap(patchWidth, patchHeight);
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

        function ensureRecordedDrawDelivery() {
            const bitmapHooksActive = ensureActiveFrameFlushHooks();
            if (!bitmapHooksActive) scheduleFallbackFlush('bitmap.drawText.fallback');

            const spriteApi = globalScope.LiveTranslatorSpriteTextAdapter;
            if (!spriteApi || spriteApi.__token !== 'liveTranslator.spriteTextAdapter.v1') return bitmapHooksActive;
            let spriteHooksActive = false;
            try {
                if (typeof spriteApi.ensureFrameHooks === 'function') {
                    spriteHooksActive = spriteApi.ensureFrameHooks() === true;
                } else if (typeof spriteApi.hasFrameHooksActive === 'function') {
                    spriteHooksActive = spriteApi.hasFrameHooksActive() === true;
                } else {
                    spriteHooksActive = spriteApi.hasFrameHook === true;
                }
            } catch (_) {
                spriteHooksActive = false;
            }
            if (!spriteHooksActive && typeof spriteApi.scheduleFallbackFrameFlush === 'function') {
                try { spriteApi.scheduleFallbackFrameFlush('bitmap.drawText.fallback'); } catch (_) {}
            }
            return bitmapHooksActive && spriteHooksActive;
        }

        function shouldDeferWindowOwnedGlyphSurfaceDraw(methodName, visibleText, normalCharacterDrawActive) {
            if (normalCharacterDrawActive) return false;
            const method = stringify(methodName || 'drawText');
            if (method !== 'drawText' && method !== 'drawTextS' && method !== 'drawTextM') return false;
            const glyphs = Array.from(stringify(visibleText).trim()).filter((char) => !/\s/u.test(char));
            // Custom window renderers often emit one Bitmap.drawText per glyph
            // without using Window_Base.processNormalCharacter. Let the draw
            // batch collector decide whether adjacent glyphs form one source.
            return glyphs.length === 1;
        }

        function invokeFastBypassedBitmapDraw(bitmap, methodName, original, args, bypassReason) {
            const profilerOn = scope.isPerfEnabled();
            const hookStart = profilerOn ? perfNow() : null;
            const callArgs = normalizeBitmapDrawCallArgs(args);
            let nativeDrawMs = 0;
            if (!profilerOn) return original.apply(bitmap, callArgs);

            perfCount('bitmap.drawText.calls', 1, 'hook');
            perfCount('bitmap.drawText.bypassed', 1, 'hook');
            perfCount('bitmap.drawText.fastBypassed', 1, 'hook');
            perfTop('bitmap.drawText.method', methodName, 1, 'hook');
            perfTop('bitmap.drawText.bypassReason', bypassReason, 1, 'hook');
            perfTop('bitmap.drawText.fastBypassReason', bypassReason, 1, 'hook');

            const nativeStart = perfNow();
            try {
                return original.apply(bitmap, callArgs);
            } finally {
                const nativeMs = Math.max(0, perfNow() - nativeStart);
                nativeDrawMs += nativeMs;
                const attribution = classifyBitmapNativeDrawAttribution(bitmap, bypassReason);
                recordBitmapNativeDrawTiming(methodName, nativeMs, attribution, bypassReason);
                recordBitmapHookTiming(hookStart, methodName, 'bypassed', bypassReason, nativeDrawMs);
            }
        }

        function normalizeBitmapDrawCallArgs(args) {
            return [
                stringify(args && args[0]),
                args && args[1],
                args && args[2],
                args && args[3],
                args && args[4],
                normalizeCanvasTextAlign(args && args[5]),
            ];
        }

        function isBitmapDrawTraceEnabled() {
            if (!scope.drawCaptureTrace || typeof scope.drawCaptureTrace.record !== 'function') return false;
            try {
                return typeof scope.drawCaptureTrace.isEnabled !== 'function'
                    || scope.drawCaptureTrace.isEnabled() !== false;
            } catch (_) {
                return false;
            }
        }
        
        function shouldBypassBitmapDraw(bitmap) {
            return !!describeBitmapDrawBypassReason(bitmap);
        }

        function handleBitmapDrawBatch(batch) {
            if (!batch || !batch.bitmap || typeof batch.forEachUnconsumed !== 'function') return 0;
            const bitmap = batch.bitmap;
            let state = null;
            let queued = 0;
            bitmapDrawRuns.collectRunsFromBatch(batch, {
                allowFallbackGlyphRuns: false,
            }).forEach((run) => {
                if (!run || !Array.isArray(run.units) || !run.units.length) return;
                if (run.units.some((unit) => !unit || unit.bitmap !== bitmap || batch.isConsumed(unit))) return;
                const payload = bitmapDrawRuns.createSurfaceDrawPayload(batch, run, {
                    payload: {
                        ownershipStatus: '',
                        backgroundPatch: getRunFallbackBackgroundPatch(run),
                    },
                });
                if (!payload || !sanitizeVisibleText(payload.text)) return;
                const fragment = createFragment(bitmap, Object.assign({}, payload, {
                    ownerType: payload.ownerType || 'Bitmap',
                }));
                if (!fragment || !sanitizeVisibleText(fragment.visibleText)) return;
                const ownership = recordBitmapSurfaceDraw(bitmap, fragment, { candidateAdapters: [] });
                if (!ownership || ownership.status === 'ignored') return;
                if (ownership.status === 'claimed' && ownership.ownerAdapter && ownership.ownerAdapter !== ADAPTER_ID) return;
                fragment.ownershipToken = ownership.ownershipToken || ownership.token || null;
                if (!fragment.ownershipToken) return;
                fragment.ownershipStatus = ownership.status;
                if (ownership.drawBoundary && typeof ownership.drawBoundary === 'object') {
                    fragment.drawBoundary = cloneDrawBoundary(ownership.drawBoundary);
                }
                if (!state) state = ensureBitmapState(bitmap);
                if (!state) return;
                state.fragments.push(fragment);
                pruneArray(state.fragments, MAX_FRAGMENTS);
                run.units.forEach((unit) => batch.consume(unit, ADAPTER_ID));
                queued += run.units.length;
            });
            if (queued) flushAggregatedLines(bitmap, batch.reason || 'draw-batch');
            return queued;
        }

        function getRunFallbackBackgroundPatch(run) {
            const units = run && Array.isArray(run.units) ? run.units.slice() : [];
            units.sort(bitmapDrawRuns.compareUnits);
            const first = units[0];
            return first && (first.fallbackBackgroundPatch || first.backgroundPatch) || null;
        }
        
        function describeBitmapDrawBypassReason(bitmap) {
            if (!bitmap) return 'missingBitmap';
            const guardReason = scope.bitmapServices.getRenderGuardReason(bitmap);
            if (guardReason) return guardReason;
            const contentsReason = describeBitmapContentsBypassReason(bitmap);
            if (contentsReason) return contentsReason;
            if (isSmallTextScratchBitmap(bitmap)) return 'smallTextScratchBitmap';
            if (isSmallTextDrawActive(bitmap)) return 'smallTextDrawActive';
            if (shouldBypassNormalCharacterDraw(bitmap)) return 'normalCharacter';
            return '';
        }

        function describeBitmapContentsBypassReason(bitmap) {
            const ownership = describeBitmapContentsOwnership(bitmap);
            if (!ownership) return '';
            if (ownership.bypassBitmapDrawReason) return ownership.bypassBitmapDrawReason;
            return ownership.dedicatedTextHook ? 'dedicatedOwnerHook' : '';
        }

        function isDedicatedTextContents(bitmap) {
            const ownership = describeBitmapContentsOwnership(bitmap);
            return !!(ownership && ownership.dedicatedTextHook);
        }

        function shouldBypassNormalCharacterDraw(bitmap) {
            if (!bitmap || !isNormalCharacterDrawActive(bitmap)) return false;
            const owner = readBitmapOwner(bitmap);
            const ownerType = describeOwnerType(owner, bitmap);
            return !owner && ownerType === 'Bitmap';
        }
        
        function recordBitmapSurfaceDraw(bitmap, fragment, options = {}) {
            if (!bitmap || !fragment || !scope.adapterContract || typeof scope.adapterContract.recordSurfaceDraw !== 'function') {
                return { status: 'ignored', reason: 'surface-draw-unavailable' };
            }
            const candidateAdapters = Array.isArray(options.candidateAdapters)
                ? options.candidateAdapters
                : ['sprite'];
            const state = getBitmapState(bitmap);
            return scope.adapterContract.recordSurfaceDraw({
                target: bitmap,
                surfaceId: state && state.id ? state.id : stringify(bitmap && bitmap._trBitmapTextId),
                slotKey: createBitmapDrawSlotKey(fragment),
                surfaceType: SURFACE_TYPE,
                mode: 'bitmapFallback',
                role: 'bitmap-draw',
                generation: state && Number.isFinite(Number(state.revision)) ? Number(state.revision) : 0,
                methodName: fragment.methodName,
                text: fragment.rawText,
                x: fragment.x,
                y: fragment.y,
                maxWidth: fragment.maxWidth,
                lineHeight: fragment.lineHeight,
                align: fragment.align,
                ownerType: fragment.ownerType,
                drawState: fragment.drawState,
                measuredWidth: fragment.width,
                standaloneGlyph: isStandaloneGlyphText(sanitizeVisibleText(fragment.visibleText || fragment.rawText)),
                drawBoundary: fragment.drawBoundary,
                drawRun: fragment.drawRun,
                backgroundPatch: fragment.backgroundPatch,
                sourceCommitted: fragment.sourceCommitted === true,
                candidateAdapters,
            });
        }

        function createBitmapDrawSlotKey(fragment) {
            if (!fragment) return '';
            return [
                fragment.methodName || 'drawText',
                fragment.x,
                fragment.y,
                fragment.maxWidth,
                fragment.lineHeight,
                fragment.align || 'left',
            ].map((value) => stringify(value)).join(':');
        }

        function normalizeSurfaceDrawDecision(decision, fallback = {}) {
            if (!decision || typeof decision !== 'object') return null;
            const action = normalizeSurfaceDrawAction(decision.action);
            if (!action || action === 'draw-original') return action ? { action } : null;
            const text = decision.text !== undefined && decision.text !== null
                ? stringify(decision.text)
                : '';
            if (action === 'replace-native-draw' && !text) return null;
            return {
                action,
                text,
                x: Number.isFinite(Number(decision.x)) ? Number(decision.x) : finiteNumber(fallback.x, 0),
                y: Number.isFinite(Number(decision.y)) ? Number(decision.y) : finiteNumber(fallback.y, 0),
                maxWidth: Number.isFinite(Number(decision.maxWidth)) ? Number(decision.maxWidth) : finiteNumber(fallback.maxWidth, 0),
                lineHeight: positiveNumber(decision.lineHeight, fallback.lineHeight, 24),
                align: normalizeCanvasTextAlign(decision.align || fallback.align),
                reason: decision.reason ? stringify(decision.reason) : '',
            };
        }

        function normalizeSurfaceDrawAction(action) {
            const value = stringify(action).replace(/_/g, '-').toLowerCase();
            if (value === 'replace-native-draw' || value === 'replace-native' || value === 'replace') {
                return 'replace-native-draw';
            }
            if (value === 'suppress-native-draw' || value === 'skip-native' || value === 'suppress') {
                return 'suppress-native-draw';
            }
            if (value === 'draw-original' || value === 'native' || value === 'original') {
                return 'draw-original';
            }
            return '';
        }
        
        function createFragment(bitmap, input) {
            if (!bitmap || !input) return null;
            const width = estimateTextWidth(bitmap, input.text, input.maxWidth);
            return {
                bitmap,
                methodName: input.methodName || 'drawText',
                rawText: stringify(input.text),
                visibleText: scope.stripControls(stringify(input.text)),
                x: input.x,
                y: input.y,
                maxWidth: input.maxWidth > 0 ? input.maxWidth : width,
                lineHeight: input.lineHeight,
                align: input.align,
                width,
                ownerType: input.ownerType || 'Bitmap',
                drawState: input.drawState || scope.captureBitmapDrawState(bitmap),
                drawBoundary: cloneDrawBoundary(input.drawBoundary),
                backgroundPatch: input.backgroundPatch || null,
                drawRun: input.drawRun || null,
                sourceCommitted: input.sourceCommitted === true,
                fontSignature: computeFontSignature(input.drawState, bitmap),
                recordedAt: Date.now(),
            };
        }

        function cloneDrawBoundary(boundary) {
            if (!boundary || typeof boundary !== 'object') return null;
            return renderTransaction.createSourceDrawBoundary(boundary);
        }

        function perfNow() {
            try { return scope.perf && typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now(); } catch (_) { return Date.now(); }
        }

        function perfCount(name, amount = 1, domain = 'translator') {
            if (!scope.isPerfEnabled() || !scope.perf || typeof scope.perf.count !== 'function') return;
            try { scope.perf.count(name, amount, { domain }); } catch (_) {}
        }

        function perfTime(name, ms, domain = 'translator') {
            if (!scope.isPerfEnabled() || !scope.perf || typeof scope.perf.time !== 'function') return;
            try { scope.perf.time(name, ms, { domain }); } catch (_) {}
        }

        function perfTop(group, label, amount = 1, domain = 'translator') {
            if (!scope.isPerfEnabled() || !scope.perf || typeof scope.perf.top !== 'function') return;
            try { scope.perf.top(group, label, amount, { domain }); } catch (_) {}
        }

        function recordBitmapHookTiming(start, methodName, status, bypassReason, nativeDrawMs = 0) {
            if (!Number.isFinite(Number(start)) || !scope.isPerfEnabled()) return;
            const elapsed = Math.max(0, perfNow() - start - (Number(nativeDrawMs) || 0));
            perfTime('bitmap.drawText.hook.ms', elapsed, 'hook');
            perfTime(`bitmap.drawText.hook.method.${sanitizePerfLabel(methodName)}.ms`, elapsed, 'hook');
            perfTop('bitmap.drawText.hook.status', status || 'unknown', 1, 'hook');
            if (bypassReason) perfTop('bitmap.drawText.hook.bypassReason', bypassReason, 1, 'hook');
        }

        function recordBitmapNativeDrawTiming(methodName, nativeMs, attribution, bypassReason) {
            const drawAttribution = attribution && typeof attribution === 'object' ? attribution : {};
            const targetDomain = drawAttribution.domain || 'game';
            const workload = drawAttribution.workload || targetDomain;
            perfTime('bitmap.drawText.native.ms', nativeMs, targetDomain);
            perfTime(`bitmap.drawText.native.method.${sanitizePerfLabel(methodName)}.ms`, nativeMs, targetDomain);
            perfTime(`bitmap.drawText.native.workload.${sanitizePerfLabel(workload)}.ms`, nativeMs, targetDomain);
            perfTop('bitmap.drawText.native.methodTime', methodName || 'drawText', nativeMs, targetDomain);
            perfTop('bitmap.drawText.native.domain', targetDomain, 1, targetDomain);
            perfTop('bitmap.drawText.native.workload', workload, 1, targetDomain);
            if (bypassReason) {
                perfTop('bitmap.drawText.native.bypassReason', bypassReason, 1, targetDomain);
                perfTime(`bitmap.drawText.native.bypass.${sanitizePerfLabel(bypassReason)}.ms`, nativeMs, targetDomain);
            }
        }

        function classifyBitmapNativeDrawAttribution(bitmap, bypassReason) {
            const owner = sanitizeBitmapNativeDrawOwner(bitmap && bitmap._trBitmapNativeDrawOwner);
            if (owner) {
                return {
                    domain: `translator-render.${owner}`,
                    workload: owner,
                };
            }
            const guardState = bitmap ? scope.bitmapServices.getRenderGuardState(bitmap) : null;
            if (guardState && guardState.bitmapReplayDepth > 0) {
                return {
                    domain: 'translator-replay',
                    workload: 'bitmapReplay',
                };
            }
            if (guardState && guardState.spriteTextReplayDepth > 0) {
                return {
                    domain: 'translator-render.spriteOverlay',
                    workload: 'spriteOverlay',
                };
            }
            return {
                domain: 'game',
                workload: bypassReason ? `game.${bypassReason}` : 'game',
            };
        }

        function sanitizeBitmapNativeDrawOwner(owner) {
            const safe = sanitizePerfLabel(owner || '');
            return safe === 'unknown' ? '' : safe;
        }

        return { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, installDeferredBitmapDrawWrapper, handleBitmapDrawText, shouldBypassBitmapDraw, describeBitmapDrawBypassReason, recordBitmapSurfaceDraw, createFragment, handleBitmapDrawBatch };
    }

    defineRuntimeModule('adapters.bitmapTextInstall', { create: createController });
})();
