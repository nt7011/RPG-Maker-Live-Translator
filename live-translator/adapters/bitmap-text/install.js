// Bitmap text adapter support: install.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/install.js.');
    }

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { scheduleFlush, scheduleFallbackFlush, flushQueuedBitmaps, flushAggregatedLines, takeFragmentsForFlush, finalizeFragmentOwnership, releaseFragmentOwnership, groupFragmentsIntoLines, canMergeFragments, createEntryFromGroup, registerBitmapEntry, refreshExistingEntry, observeEntry, requestEntryTranslation, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, restoreTranslatedEntryText, redrawBitmapEntry, markEntryTerminal, isEntryActive, getEntryStatus, isEntryRequestActive, isEntryCompleted, getEntryObservationStatus, retireEntry, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason, installBitmapMutationHooks, installBitmapMutationHook, shouldBypassMutation, getMutationBypassReason, hasMutationObserverInterest, shouldHandleBitmapMutation, hasBitmapStateMutationInterest, hasWindowEntryMutationInterest, hasAnyWindowEntries, recordNativeMutationAttribution, classifyBitmapMutationSurface, bucketBitmapPixels, bucketBitmapDimensions, bucketDimension, sanitizePerfLabel, describeMutation, handleBitmapMutation, flushFragmentsBeforeMutation, invalidateEntriesInRect, discardFragmentsInRect, invalidateWindowEntries, wasWindowEntryObservedInCurrentRefresh, isWindowRefreshMutation, installFrameFlushHooks, hasActiveFrameFlushHooks, ensureActiveFrameFlushHooks, installFrameFlushHook, hasHookInChain, installSmallTextMarkers, installSmallTextMarker, installNormalCharacterMarker, isSmallTextDrawActive, isSmallTextScratchBitmap, ensureBitmapState, getBitmapState, nextDrawOrder, recordBitmapRenderOp, recordNativeTextForReplay, discardRenderOpsInRect, withBitmapReplay, collectReplayItems, replayBitmapItems, replayBitmapRenderOp, replayBitmapEntry, drawBitmapTextValue, drawBitmapTextArgs, calculateClearRect, estimateTextWidth, computeFontSignature, sanitizeVisibleText, sanitizePerChar, isStandaloneGlyphText, sanitizeBitmapDrawText, safePrepareText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, roundTraceNumber, getBitmapFallbackMode, isBitmapFallbackCaptureEnabled, isBitmapFallbackRedrawEnabled, readBitmapOwner, hasDedicatedOwnerHook, windowEntryBelongsToBitmap, deriveWindowEntryRect, deriveEntryRect, fragmentRect, rectFromDimensions, isValidRect, rectHasArea, rectOrNull, rectanglesOverlap, normalizeCanvasTextAlign, describeOwnerType, shouldKeepWindowEntryTranslation, getWindowOwnerScreenState, retireWindowEntry, logTextDetected, updateItem, safeCall, isAdapterContractFailure, warn, stringify, finiteNumber, positiveNumber, pruneArray, errorMessage } = Object.fromEntries(['scheduleFlush', 'scheduleFallbackFlush', 'flushQueuedBitmaps', 'flushAggregatedLines', 'takeFragmentsForFlush', 'finalizeFragmentOwnership', 'releaseFragmentOwnership', 'groupFragmentsIntoLines', 'canMergeFragments', 'createEntryFromGroup', 'registerBitmapEntry', 'refreshExistingEntry', 'observeEntry', 'requestEntryTranslation', 'applyRenderCommand', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'restoreTranslatedEntryText', 'redrawBitmapEntry', 'markEntryTerminal', 'isEntryActive', 'getEntryStatus', 'isEntryRequestActive', 'isEntryCompleted', 'getEntryObservationStatus', 'retireEntry', 'shouldKeepRecordAfterRenderRejection', 'isRenderApplicationFailure', 'normalizeRenderRejectionReason', 'installBitmapMutationHooks', 'installBitmapMutationHook', 'shouldBypassMutation', 'getMutationBypassReason', 'hasMutationObserverInterest', 'shouldHandleBitmapMutation', 'hasBitmapStateMutationInterest', 'hasWindowEntryMutationInterest', 'hasAnyWindowEntries', 'recordNativeMutationAttribution', 'classifyBitmapMutationSurface', 'bucketBitmapPixels', 'bucketBitmapDimensions', 'bucketDimension', 'sanitizePerfLabel', 'describeMutation', 'handleBitmapMutation', 'flushFragmentsBeforeMutation', 'invalidateEntriesInRect', 'discardFragmentsInRect', 'invalidateWindowEntries', 'wasWindowEntryObservedInCurrentRefresh', 'isWindowRefreshMutation', 'installFrameFlushHooks', 'hasActiveFrameFlushHooks', 'ensureActiveFrameFlushHooks', 'installFrameFlushHook', 'hasHookInChain', 'installSmallTextMarkers', 'installSmallTextMarker', 'installNormalCharacterMarker', 'isSmallTextDrawActive', 'isSmallTextScratchBitmap', 'ensureBitmapState', 'getBitmapState', 'nextDrawOrder', 'recordBitmapRenderOp', 'recordNativeTextForReplay', 'discardRenderOpsInRect', 'withBitmapReplay', 'collectReplayItems', 'replayBitmapItems', 'replayBitmapRenderOp', 'replayBitmapEntry', 'drawBitmapTextValue', 'drawBitmapTextArgs', 'calculateClearRect', 'estimateTextWidth', 'computeFontSignature', 'sanitizeVisibleText', 'sanitizePerChar', 'isStandaloneGlyphText', 'sanitizeBitmapDrawText', 'safePrepareText', 'describeEntryEligibility', 'recordDrawTrace', 'bitmapTraceDetails', 'cloneTraceRect', 'roundTraceNumber', 'getBitmapFallbackMode', 'isBitmapFallbackCaptureEnabled', 'isBitmapFallbackRedrawEnabled', 'readBitmapOwner', 'hasDedicatedOwnerHook', 'windowEntryBelongsToBitmap', 'deriveWindowEntryRect', 'deriveEntryRect', 'fragmentRect', 'rectFromDimensions', 'isValidRect', 'rectHasArea', 'rectOrNull', 'rectanglesOverlap', 'normalizeCanvasTextAlign', 'describeOwnerType', 'shouldKeepWindowEntryTranslation', 'getWindowOwnerScreenState', 'retireWindowEntry', 'logTextDetected', 'updateItem', 'safeCall', 'isAdapterContractFailure', 'warn', 'stringify', 'finiteNumber', 'positiveNumber', 'pruneArray', 'errorMessage'].map((name) => [name, callScope(name)]));

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
                if (!installBitmapDrawWrapper(methodName)) scheduleBitmapDrawWrapperRetry(methodName);
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
        
            const original = current;
            const wrapped = function(...args) {
                return handleBitmapDrawText(this, methodName, original, args);
            };
            wrapped.__trBitmapTextAdapter = DRAW_WRAPPER_TOKEN;
            wrapped.__trOriginal = original;
            Bitmap.prototype[methodName] = wrapped;
            scope.perf.count('bitmapText.draw.wrapperInstalled');
            scope.perf.top('bitmapText.draw.method', methodName);
            scope.diag(`[BitmapText] Wrapped Bitmap.${methodName}`);
            return true;
        }
        
        function scheduleBitmapDrawWrapperRetry(methodName) {
            if (typeof setInterval !== 'function') return;
            let attempts = 0;
            const timer = setInterval(() => {
                attempts += 1;
                if (installBitmapDrawWrapper(methodName) || attempts >= 20) {
                    try { clearInterval(timer); } catch (_) {}
                }
            }, 500);
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
            if (hasDedicatedOwnerHook(owner) || (bitmap && bitmap._trHasDedicatedTextHook)) {
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
            const visibleText = sanitizeVisibleText(text);
            if (isWindowOwnedBitmap && visibleText) {
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
            const backgroundPatch = captureBitmapDrawBackdrop(bitmap, text, x, y, maxWidth, lineHeight, align);
            const nativeTextRegion = backgroundPatch && backgroundPatch.region
                ? backgroundPatch.region
                : (typeof scope.createBitmapTextRegion === 'function'
                    ? scope.createBitmapTextRegion(bitmap, text, x, y, maxWidth, lineHeight, align)
                    : null);
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
                        backgroundPatch,
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

        function captureBitmapDrawBackdrop(bitmap, text, x, y, maxWidth, lineHeight, align) {
            if (!bitmap || typeof Bitmap === 'undefined') return null;
            const region = typeof scope.createBitmapTextRegion === 'function'
                ? scope.createBitmapTextRegion(bitmap, text, x, y, maxWidth, lineHeight, align)
                : null;
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
                patchBitmap._trBitmapSkipDepth = (patchBitmap._trBitmapSkipDepth || 0) + 1;
                patchBitmap._trSpriteTextReplayDepth = (patchBitmap._trSpriteTextReplayDepth || 0) + 1;
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
            } catch (_) {
                return null;
            } finally {
                if (patchBitmap) {
                    patchBitmap._trBitmapSkipDepth = Math.max(0, (patchBitmap._trBitmapSkipDepth || 1) - 1);
                    patchBitmap._trSpriteTextReplayDepth = Math.max(0, (patchBitmap._trSpriteTextReplayDepth || 1) - 1);
                }
            }
        }

        function ensureRecordedDrawDelivery() {
            const bitmapHooksActive = ensureActiveFrameFlushHooks();
            if (!bitmapHooksActive) scheduleFallbackFlush();

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
            if (!isBitmapFallbackCaptureEnabled()) return 0;
            const bitmap = batch.bitmap;
            let state = null;
            let queued = 0;
            batch.forEachUnconsumed((unit) => {
                if (!unit || unit.bitmap !== bitmap || batch.isConsumed(unit)) return;
                if (!sanitizeVisibleText(unit.text)) return;
                const fragment = createFragment(bitmap, {
                    methodName: unit.methodName,
                    text: unit.text,
                    x: unit.x,
                    y: unit.y,
                    maxWidth: unit.maxWidth,
                    lineHeight: unit.lineHeight,
                    align: unit.align,
                    ownerType: 'Bitmap',
                    drawState: unit.drawState,
                });
                if (!fragment || !sanitizeVisibleText(fragment.visibleText)) return;
                const ownership = recordBitmapSurfaceDraw(bitmap, fragment, { candidateAdapters: [] });
                if (!ownership || ownership.status === 'ignored') return;
                if (ownership.status === 'claimed' && ownership.ownerAdapter && ownership.ownerAdapter !== ADAPTER_ID) return;
                fragment.ownershipToken = ownership.ownershipToken || ownership.token || null;
                if (!fragment.ownershipToken) return;
                fragment.ownershipStatus = ownership.status;
                if (!state) state = ensureBitmapState(bitmap);
                if (!state) return;
                state.fragments.push(fragment);
                pruneArray(state.fragments, MAX_FRAGMENTS);
                batch.consume(unit, ADAPTER_ID);
                queued += 1;
            });
            if (queued) flushAggregatedLines(bitmap, batch.reason || 'draw-batch');
            return queued;
        }
        
        function describeBitmapDrawBypassReason(bitmap) {
            if (!bitmap) return 'missingBitmap';
            if (bitmap._trBitmapReplayDepth > 0) return 'bitmapReplay';
            if (bitmap._trBitmapSkipDepth > 0) return 'bitmapSkipDepth';
            if (bitmap._trSpriteTextReplayDepth > 0) return 'spriteTextReplay';
            if (bitmap._trPreferWindowPipeline && bitmap._trWindowPipelineDepth > 0) return 'windowPipeline';
            if (bitmap._trMessageContents) return 'messageContents';
            if (isSmallTextScratchBitmap(bitmap)) return 'smallTextScratchBitmap';
            if (isSmallTextDrawActive(bitmap)) return 'smallTextDrawActive';
            return '';
        }
        
        function recordBitmapSurfaceDraw(bitmap, fragment, options = {}) {
            if (!bitmap || !fragment || !scope.adapterContract || typeof scope.adapterContract.recordSurfaceDraw !== 'function') {
                return { status: 'ignored', reason: 'surface-draw-unavailable' };
            }
            const candidateAdapters = Array.isArray(options.candidateAdapters)
                ? options.candidateAdapters
                : ['sprite'];
            return scope.adapterContract.recordSurfaceDraw({
                target: bitmap,
                surfaceType: SURFACE_TYPE,
                mode: 'bitmapFallback',
                role: 'bitmap-draw',
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
                candidateAdapters,
            });
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
                fontSignature: computeFontSignature(input.drawState, bitmap),
                recordedAt: Date.now(),
            };
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
            if (bypassReason === 'bitmapReplay') {
                return {
                    domain: 'translator-replay',
                    workload: 'bitmapReplay',
                };
            }
            if (bitmap && bitmap._trSpriteTextReplayDepth > 0) {
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

        return { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, scheduleBitmapDrawWrapperRetry, handleBitmapDrawText, shouldBypassBitmapDraw, describeBitmapDrawBypassReason, recordBitmapSurfaceDraw, createFragment, handleBitmapDrawBatch };
    }

    defineRuntimeModule('adapters.bitmapTextInstall', { create: createController });
})();
