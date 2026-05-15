// Bitmap text adapter support: mutations.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/mutations.js.');
    }

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, scheduleBitmapDrawWrapperRetry, handleBitmapDrawText, shouldBypassBitmapDraw, describeBitmapDrawBypassReason, recordBitmapSurfaceDraw, createFragment, scheduleFlush, scheduleFallbackFlush, flushQueuedBitmaps, flushAggregatedLines, takeFragmentsForFlush, finalizeFragmentOwnership, releaseFragmentOwnership, groupFragmentsIntoLines, canMergeFragments, createEntryFromGroup, registerBitmapEntry, refreshExistingEntry, observeEntry, requestEntryTranslation, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, restoreTranslatedEntryText, redrawBitmapEntry, markEntryTerminal, isEntryActive, getEntryStatus, isEntryRequestActive, isEntryCompleted, getEntryObservationStatus, retireEntry, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason, installFrameFlushHooks, installFrameFlushHook, hasHookInChain, installSmallTextMarkers, installSmallTextMarker, installNormalCharacterMarker, isSmallTextDrawActive, isSmallTextScratchBitmap, ensureBitmapState, getBitmapState, nextDrawOrder, recordBitmapRenderOp, recordNativeTextForReplay, discardRenderOpsInRect, withBitmapReplay, collectReplayItems, replayBitmapItems, replayBitmapRenderOp, replayBitmapEntry, drawBitmapTextValue, drawBitmapTextArgs, calculateClearRect, estimateTextWidth, computeFontSignature, sanitizeVisibleText, sanitizePerChar, isStandaloneGlyphText, sanitizeBitmapDrawText, safePrepareText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, roundTraceNumber, getBitmapFallbackMode, isBitmapFallbackCaptureEnabled, isBitmapFallbackRedrawEnabled, readBitmapOwner, hasDedicatedOwnerHook, windowEntryBelongsToBitmap, deriveWindowEntryRect, deriveEntryRect, fragmentRect, rectFromDimensions, isValidRect, rectHasArea, rectOrNull, rectanglesOverlap, normalizeCanvasTextAlign, describeOwnerType, shouldKeepWindowEntryTranslation, getWindowOwnerScreenState, retireWindowEntry, logTextDetected, updateItem, safeCall, isAdapterContractFailure, warn, stringify, finiteNumber, positiveNumber, pruneArray, errorMessage } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'registerBitmapCapabilities', 'exposeAdapterApi', 'installBitmapDrawWrappers', 'installBitmapDrawWrapper', 'scheduleBitmapDrawWrapperRetry', 'handleBitmapDrawText', 'shouldBypassBitmapDraw', 'describeBitmapDrawBypassReason', 'recordBitmapSurfaceDraw', 'createFragment', 'scheduleFlush', 'scheduleFallbackFlush', 'flushQueuedBitmaps', 'flushAggregatedLines', 'takeFragmentsForFlush', 'finalizeFragmentOwnership', 'releaseFragmentOwnership', 'groupFragmentsIntoLines', 'canMergeFragments', 'createEntryFromGroup', 'registerBitmapEntry', 'refreshExistingEntry', 'observeEntry', 'requestEntryTranslation', 'applyRenderCommand', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'restoreTranslatedEntryText', 'redrawBitmapEntry', 'markEntryTerminal', 'isEntryActive', 'getEntryStatus', 'isEntryRequestActive', 'isEntryCompleted', 'getEntryObservationStatus', 'retireEntry', 'shouldKeepRecordAfterRenderRejection', 'isRenderApplicationFailure', 'normalizeRenderRejectionReason', 'installFrameFlushHooks', 'installFrameFlushHook', 'hasHookInChain', 'installSmallTextMarkers', 'installSmallTextMarker', 'installNormalCharacterMarker', 'isSmallTextDrawActive', 'isSmallTextScratchBitmap', 'ensureBitmapState', 'getBitmapState', 'nextDrawOrder', 'recordBitmapRenderOp', 'recordNativeTextForReplay', 'discardRenderOpsInRect', 'withBitmapReplay', 'collectReplayItems', 'replayBitmapItems', 'replayBitmapRenderOp', 'replayBitmapEntry', 'drawBitmapTextValue', 'drawBitmapTextArgs', 'calculateClearRect', 'estimateTextWidth', 'computeFontSignature', 'sanitizeVisibleText', 'sanitizePerChar', 'isStandaloneGlyphText', 'sanitizeBitmapDrawText', 'safePrepareText', 'describeEntryEligibility', 'recordDrawTrace', 'bitmapTraceDetails', 'cloneTraceRect', 'roundTraceNumber', 'getBitmapFallbackMode', 'isBitmapFallbackCaptureEnabled', 'isBitmapFallbackRedrawEnabled', 'readBitmapOwner', 'hasDedicatedOwnerHook', 'windowEntryBelongsToBitmap', 'deriveWindowEntryRect', 'deriveEntryRect', 'fragmentRect', 'rectFromDimensions', 'isValidRect', 'rectHasArea', 'rectOrNull', 'rectanglesOverlap', 'normalizeCanvasTextAlign', 'describeOwnerType', 'shouldKeepWindowEntryTranslation', 'getWindowOwnerScreenState', 'retireWindowEntry', 'logTextDetected', 'updateItem', 'safeCall', 'isAdapterContractFailure', 'warn', 'stringify', 'finiteNumber', 'positiveNumber', 'pruneArray', 'errorMessage'].map((name) => [name, callScope(name)]));

        function installBitmapMutationHooks() {
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
            const current = Bitmap.prototype[methodName];
            if (typeof current !== 'function') return false;
            if (hasHookInChain(current, '__trBitmapTextMutation', MUTATION_WRAPPER_TOKEN)) return true;
        
            const original = current;
            const wrapped = function(...args) {
                const profilerOn = scope.isPerfEnabled();
                const bypassReason = getMutationBypassReason(this);
                const bypassMutation = !!bypassReason;
                const notifySubscribers = !bypassMutation && hasMutationObserverInterest(this);
                const handleMutation = !bypassMutation && shouldHandleBitmapMutation(this, methodName);
                const restoreSource = !bypassMutation && hasWindowTextMutationSource(this, methodName, args);
                const handleTextInk = !bypassMutation
                    && typeof scope.hasBitmapNativeTextInkInterest === 'function'
                    && scope.hasBitmapNativeTextInkInterest(this);
                const observeMutation = notifySubscribers || handleMutation || restoreSource || handleTextInk;
                if (profilerOn && observeMutation) {
                    scope.perf.count('bitmap.mutation.calls');
                    scope.perf.top('bitmap.mutation.method', methodName);
                } else if (profilerOn) {
                    scope.perf.count(bypassMutation ? 'bitmap.mutation.bypassed' : 'bitmap.mutation.ignored');
                    if (bypassMutation) {
                        scope.perf.top('bitmap.mutation.bypassMethod', methodName);
                        scope.perf.top('bitmap.mutation.bypassReason', bypassReason);
                    } else {
                        scope.perf.top('bitmap.mutation.ignoredMethod', methodName);
                    }
                }
                let nativeMs = 0;
                let result;
                let mutation = null;
                let restoredSourceBitmaps = [];
                if (observeMutation) {
                    mutation = describeMutation(this, methodName, args);
                    restoredSourceBitmaps = restoreWindowTextSourcesBeforeMutation(this, methodName, mutation);
                }
                let nativeSucceeded = false;
                if (profilerOn && observeMutation) {
                    const start = typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now();
                    try {
                        result = original.apply(this, args);
                        nativeSucceeded = true;
                    } finally {
                        const end = typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now();
                        nativeMs = Math.max(0, end - start);
                        scope.perf.time('bitmap.mutation.native.ms', nativeMs);
                        scope.perf.time(bypassMutation ? 'bitmap.mutation.native.bypassed.ms' : 'bitmap.mutation.native.observed.ms', nativeMs);
                        recordNativeMutationAttribution(this, methodName, nativeMs, bypassReason);
                        if (!nativeSucceeded) redrawRestoredWindowTextSources(restoredSourceBitmaps, methodName);
                    }
                } else {
                    try {
                        result = original.apply(this, args);
                        nativeSucceeded = true;
                    } finally {
                        if (!nativeSucceeded) redrawRestoredWindowTextSources(restoredSourceBitmaps, methodName);
                    }
                }
                if (bypassMutation) {
                    return result;
                }
                if (!observeMutation) return result;
                try {
                    if (handleTextInk && typeof scope.applyBitmapNativePaintMutation === 'function') {
                        if (!mutation) mutation = describeMutation(this, methodName, args);
                        scope.applyBitmapNativePaintMutation(this, methodName, mutation);
                    }
                    if (profilerOn) {
                        if (notifySubscribers) scope.measurePerf('bitmap.mutation.notify.ms', () => scope.bitmapServices.publishMutation(this, methodName, args));
                        if (handleMutation) {
                            if (!mutation) mutation = scope.measurePerf('bitmap.mutation.describe.ms', () => describeMutation(this, methodName, args));
                            scope.measurePerf('bitmap.mutation.handle.ms', () => handleBitmapMutation(this, methodName, args, mutation));
                        }
                    } else {
                        if (notifySubscribers) scope.bitmapServices.publishMutation(this, methodName, args);
                        if (handleMutation) {
                            if (!mutation) mutation = describeMutation(this, methodName, args);
                            handleBitmapMutation(this, methodName, args, mutation);
                        }
                    }
                } finally {
                    redrawRestoredWindowTextSources(restoredSourceBitmaps, methodName);
                }
                return result;
            };
            wrapped.__trBitmapTextMutation = MUTATION_WRAPPER_TOKEN;
            wrapped.__trOriginal = original;
            Bitmap.prototype[methodName] = wrapped;
            return true;
        }
        
        function shouldBypassMutation(bitmap) {
            return !!getMutationBypassReason(bitmap);
        }
        
        function getMutationBypassReason(bitmap) {
            if (!bitmap) return 'no-bitmap';
            if (bitmap._trBitmapReplayDepth > 0) return bitmap._trBitmapReplaySource || 'bitmap-replay';
            if (bitmap._trSpriteTextReplayDepth > 0) return 'sprite-text-replay';
            if (isSmallTextScratchBitmap(bitmap)) return 'small-text-scratch';
            if (isSmallTextDrawActive(bitmap)) return 'small-text-active';
            return '';
        }
        
        function hasMutationObserverInterest(bitmap) {
            return !!(bitmap && scope.bitmapServices.hasMutationInterest(bitmap));
        }
        
        function shouldHandleBitmapMutation(bitmap, methodName) {
            if (!bitmap) return false;
            const state = getBitmapState(bitmap);
            if (hasBitmapStateMutationInterest(state, methodName)) return true;
            return hasWindowEntryMutationInterest(bitmap);
        }
        
        function hasBitmapStateMutationInterest(state, methodName) {
            if (!state) return false;
            if (methodName === 'destroy') return true;
            if (state.destroyed) return false;
            if (state.flushQueued) return true;
            if (Array.isArray(state.fragments) && state.fragments.length) return true;
            if (state.entries && typeof state.entries.size === 'number' && state.entries.size > 0) return true;
            if (Array.isArray(state.renderOps) && state.renderOps.length) return true;
            if (state.nativeTextOps && typeof state.nativeTextOps.size === 'number' && state.nativeTextOps.size > 0) return true;
            return false;
        }
        
        function hasWindowEntryMutationInterest(bitmap) {
            if (!bitmap || !scope.contentsOwners || !scope.windowRegistry || bitmap._trWindowRedrawClearDepth > 0) return false;
            const owner = readBitmapOwner(bitmap);
            if (!owner) return false;
            const data = safeCall(() => scope.windowRegistry.get(owner));
            return hasAnyWindowEntries(data && data.texts);
        }

        function hasWindowTextMutationSource(targetBitmap, methodName, args) {
            switch (methodName) {
            case 'blt':
            case 'bltImage':
                return hasWindowEntryMutationInterest(args && args[0]);
            case 'resize':
            case 'adjustTone':
            case 'rotateHue':
            case 'blur':
                return hasWindowEntryMutationInterest(targetBitmap);
            default:
                return false;
            }
        }
        
        function hasAnyWindowEntries(texts) {
            if (!texts) return false;
            if (typeof texts.size === 'number') return texts.size > 0;
            if (typeof texts.forEach !== 'function') return false;
            let found = false;
            try {
                texts.forEach(() => {
                    found = true;
                });
            } catch (_) {}
            return found;
        }
        
        function recordNativeMutationAttribution(bitmap, methodName, nativeMs, bypassReason) {
            if (!Number.isFinite(nativeMs) || nativeMs < 0) return;
            const methodLabel = sanitizePerfLabel(methodName || 'unknown');
            const surface = classifyBitmapMutationSurface(bitmap, bypassReason);
            scope.perf.top('bitmap.mutation.nativeTime.method', methodLabel, nativeMs);
            scope.perf.top('bitmap.mutation.nativeTime.surface', surface, nativeMs);
            scope.perf.top('bitmap.mutation.surface', surface);
            scope.perf.top('bitmap.mutation.sizeBucket', bucketBitmapPixels(bitmap));
            scope.perf.top('bitmap.mutation.dimensionBucket', bucketBitmapDimensions(bitmap));
            scope.perf.time(`bitmap.mutation.native.method.${methodLabel}.ms`, nativeMs);
            scope.perf.time(`bitmap.mutation.native.surface.${sanitizePerfLabel(surface)}.ms`, nativeMs);
        }
        
        function classifyBitmapMutationSurface(bitmap, bypassReason) {
            if (bypassReason) return String(bypassReason);
            if (!bitmap) return 'no-bitmap';
            if (bitmap._trSpriteTextOverlayBitmap) return 'sprite-overlay';
            if (bitmap._trMessageContents) return 'message';
            try {
                if (scope.contentsOwners && typeof scope.contentsOwners.get === 'function' && scope.contentsOwners.get(bitmap)) return 'window';
            } catch (_) {}
            if (bitmap._trPreferWindowPipeline || bitmap._trWindowPipelineDepth > 0 || bitmap._trWindowRefreshDepth > 0) return 'window';
            if (bitmap._trSpriteTextHasTextInterest) return 'sprite-text-interest';
            if (bitmap._trSpriteTextOwned) return 'sprite-owned';
            if (getBitmapState(bitmap)) return 'bitmap-fallback-state';
            return 'untracked';
        }
        
        function bucketBitmapPixels(bitmap) {
            const width = Math.max(0, Number(bitmap && bitmap.width) || 0);
            const height = Math.max(0, Number(bitmap && bitmap.height) || 0);
            const pixels = width * height;
            if (!pixels) return '0';
            if (pixels <= 4096) return '<=4k';
            if (pixels <= 16384) return '4k-16k';
            if (pixels <= 65536) return '16k-64k';
            if (pixels <= 262144) return '64k-256k';
            return '>256k';
        }
        
        function bucketBitmapDimensions(bitmap) {
            const width = Math.max(0, Number(bitmap && bitmap.width) || 0);
            const height = Math.max(0, Number(bitmap && bitmap.height) || 0);
            if (!width || !height) return '0x0';
            return `${bucketDimension(width)}x${bucketDimension(height)}`;
        }
        
        function bucketDimension(value) {
            const number = Math.max(0, Number(value) || 0);
            if (number <= 32) return '<=32';
            if (number <= 64) return '33-64';
            if (number <= 128) return '65-128';
            if (number <= 256) return '129-256';
            if (number <= 512) return '257-512';
            if (number <= 1024) return '513-1024';
            return '>1024';
        }
        
        function sanitizePerfLabel(value) {
            return String(value || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 48) || 'unknown';
        }
        
        function describeMutation(bitmap, methodName, args) {
            const full = rectFromDimensions(0, 0, bitmap && bitmap.width, bitmap && bitmap.height);
            switch (methodName) {
            case 'clear':
                return { rect: null, clearReplay: 'all', full: true };
            case 'resize':
                return { rect: null, clearReplay: 'all', full: true, sourceBitmap: bitmap, sourceRect: full };
            case 'destroy':
                return { rect: null, clearReplay: 'all', full: true };
            case 'fillAll':
                return { rect: null, clearReplay: 'all', full: true };
            case 'clearRect':
                return { rect: rectOrNull(rectFromDimensions(args[0], args[1], args[2], args[3])), clearReplay: 'rect' };
            case 'fillRect':
                return { rect: rectOrNull(rectFromDimensions(args[0], args[1], args[2], args[3])), recordOp: { methodName, args: args.slice() } };
            case 'gradientFillRect':
                return { rect: rectOrNull(rectFromDimensions(args[0], args[1], args[2], args[3])), recordOp: { methodName, args: args.slice() } };
            case 'strokeRect':
                return { rect: rectOrNull(rectFromDimensions(args[0], args[1], args[2], args[3])), recordOp: { methodName, args: args.slice() } };
            case 'drawCircle': {
                const r = finiteNumber(args[2], 0);
                return { rect: rectOrNull(rectFromDimensions(finiteNumber(args[0], 0) - r, finiteNumber(args[1], 0) - r, r * 2, r * 2)), recordOp: { methodName, args: args.slice() } };
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
                return { rect: rectOrNull(rectFromDimensions(dx, dy, dw, dh)), sourceBitmap: args[0] || null, sourceRect, recordOp: { methodName, args: args.slice() } };
            }
            case 'adjustTone':
            case 'rotateHue':
            case 'blur':
                return { rect: full, sourceBitmap: bitmap, sourceRect: full, unsupported: true };
            default:
                return { rect: null };
            }
        }

        function restoreWindowTextSourcesBeforeMutation(targetBitmap, methodName, mutation) {
            if (!mutation) return [];
            const helpers = getWindowTextHelpers();
            if (!helpers || typeof helpers.restoreEntriesForBitmapMutation !== 'function') return [];
            const restored = [];
            const sources = [];
            if (mutation.sourceBitmap && mutation.sourceRect) {
                sources.push({ bitmap: mutation.sourceBitmap, rect: mutation.sourceRect });
            }
            sources.forEach((source) => {
                if (!source || !source.bitmap) return;
                const count = safeCall(() => helpers.restoreEntriesForBitmapMutation(
                    source.bitmap,
                    source.rect,
                    `${methodName || 'bitmap'}-source`
                ));
                if (Number(count) > 0 && restored.indexOf(source.bitmap) < 0) restored.push(source.bitmap);
            });
            return restored;
        }

        function redrawRestoredWindowTextSources(bitmaps, methodName) {
            if (!Array.isArray(bitmaps) || !bitmaps.length) return 0;
            const helpers = getWindowTextHelpers();
            if (!helpers || typeof helpers.redrawRestoredEntriesForBitmapMutation !== 'function') return 0;
            let redrawn = 0;
            bitmaps.forEach((bitmap) => {
                redrawn += Number(safeCall(() => helpers.redrawRestoredEntriesForBitmapMutation(
                    bitmap,
                    `${methodName || 'bitmap'}-source`
                ))) || 0;
            });
            return redrawn;
        }

        function getWindowTextHelpers() {
            if (typeof scope.getWindowTextHelpers !== 'function') return null;
            return safeCall(() => scope.getWindowTextHelpers());
        }
        
        function handleBitmapMutation(bitmap, methodName, args, mutation) {
            if (!bitmap || !mutation) return;
            const targetRect = mutation.rect && isValidRect(mutation.rect) ? mutation.rect : null;
            invalidateWindowEntries(bitmap, targetRect, methodName, mutation);
        
            const state = getBitmapState(bitmap);
            if (!state) return;
            state.revision += 1;
            if (methodName === 'destroy') state.destroyed = true;
        
            flushFragmentsBeforeMutation(bitmap, methodName, targetRect, mutation.full);
            if (mutation.clearReplay) discardRenderOpsInRect(state, mutation.clearReplay === 'all' ? null : targetRect);
            if (!mutation.skipEntryInvalidation) invalidateEntriesInRect(state, targetRect, `${methodName}-bitmap`);
            else discardFragmentsInRect(state, targetRect, `${methodName}-skip`);
            if (mutation.recordOp && targetRect) {
                recordBitmapRenderOp(bitmap, Object.assign({}, mutation.recordOp, { rect: targetRect }));
            }
        }
        
        function flushFragmentsBeforeMutation(bitmap, methodName, targetRect, full) {
            const state = getBitmapState(bitmap);
            if (!state || !Array.isArray(state.fragments) || !state.fragments.length) return;
            if (targetRect && !full) flushAggregatedLines(bitmap, `pre-${methodName}`, targetRect);
            else flushAggregatedLines(bitmap, `pre-${methodName}`);
        }
        
        function invalidateEntriesInRect(state, rect, reason) {
            if (!state || !state.entries || !state.entries.size) return 0;
            const skipEntry = state.bitmap && state.bitmap._trActiveRedrawEntry ? state.bitmap._trActiveRedrawEntry : null;
            let removed = 0;
            Array.from(state.entries.values()).forEach((entry) => {
                if (!entry || entry === skipEntry || entry.stale) return;
                const entryRect = deriveEntryRect(entry);
                if (!rect || !entryRect || rectanglesOverlap(rect, entryRect)) {
                    retireEntry(entry, reason, 'stale');
                    removed += 1;
                }
            });
            return removed;
        }
        
        function discardFragmentsInRect(state, rect) {
            if (!state || !Array.isArray(state.fragments) || !state.fragments.length) return;
            if (!rect || !isValidRect(rect)) {
                state.fragments.length = 0;
                return;
            }
            state.fragments = state.fragments.filter((fragment) => {
                const current = fragmentRect(fragment);
                return !current || !rectanglesOverlap(current, rect);
            });
        }

        function clipRectToBitmap(rect, bitmap) {
            if (!isValidRect(rect) || !bitmap) return null;
            const bitmapRect = rectOrNull(rectFromDimensions(0, 0, bitmap.width, bitmap.height));
            if (!bitmapRect) return null;
            const clipped = {
                x1: Math.max(Number(rect.x1), Number(bitmapRect.x1)),
                y1: Math.max(Number(rect.y1), Number(bitmapRect.y1)),
                x2: Math.min(Number(rect.x2), Number(bitmapRect.x2)),
                y2: Math.min(Number(rect.y2), Number(bitmapRect.y2)),
            };
            return rectOrNull(clipped);
        }

        function isPendingWindowEntryTranslation(entry) {
            if (!entry
                || !scope.windowLifecycle
                || typeof scope.windowLifecycle.isEntryTranslationPending !== 'function') {
                return false;
            }
            try {
                return scope.windowLifecycle.isEntryTranslationPending(entry) === true;
            } catch (_) {
                return false;
            }
        }

        function canRecoverDetachedWindowEntryAfterBlt(entry, options = {}) {
            const method = String(options && options.methodName || options && options.reason || '');
            if (method !== 'blt') return false;
            // A bitmap copy mutates the surface, but it does not prove the logical
            // text source disappeared. Keep pending window text recoverable unless
            // a later observation claims the slot or replaces the source.
            return isPendingWindowEntryTranslation(entry);
        }

        function canRetargetDetachedWindowEntryAfterSelfBlt(entryRect, bitmap, targetRect, options = {}) {
            const sourceBitmap = options && options.sourceBitmap ? options.sourceBitmap : null;
            const sourceRect = options && isValidRect(options.sourceRect) ? options.sourceRect : null;
            if (!sourceBitmap || sourceBitmap !== bitmap || !sourceRect) return false;
            if (!isValidRect(targetRect) || !isValidRect(entryRect)) return false;
            const clippedEntryRect = clipRectToBitmap(entryRect, bitmap);
            if (!clippedEntryRect) return false;
            const sourceWidth = Number(sourceRect.x2) - Number(sourceRect.x1);
            const sourceHeight = Number(sourceRect.y2) - Number(sourceRect.y1);
            const targetWidth = Number(targetRect.x2) - Number(targetRect.x1);
            const targetHeight = Number(targetRect.y2) - Number(targetRect.y1);
            if (sourceWidth !== targetWidth || sourceHeight !== targetHeight) return false;
            return rectanglesOverlap(sourceRect, clippedEntryRect);
        }

        function retargetDetachedWindowEntryForSelfBlt(entry, entryRect, sourceRect, targetRect) {
            if (!entry || !isValidRect(entryRect) || !isValidRect(sourceRect) || !isValidRect(targetRect)) return false;
            const deltaX = Number(targetRect.x1) - Number(sourceRect.x1);
            const deltaY = Number(targetRect.y1) - Number(sourceRect.y1);
            if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return false;

            const position = entry.position && typeof entry.position === 'object'
                ? entry.position
                : { x: 0, y: 0 };
            entry.position = {
                x: finiteNumber(position.x, 0) + deltaX,
                y: finiteNumber(position.y, 0) + deltaY,
            };
            entry.bounds = {
                x1: Number(entryRect.x1) + deltaX,
                y1: Number(entryRect.y1) + deltaY,
                x2: Number(entryRect.x2) + deltaX,
                y2: Number(entryRect.y2) + deltaY,
            };
            delete entry.key;
            delete entry.slotKey;
            return true;
        }
        
        function invalidateWindowEntries(bitmap, rect, reason, options = {}) {
            if (!bitmap || !scope.contentsOwners || !scope.windowRegistry || bitmap._trWindowRedrawClearDepth > 0) return 0;
            if (options && options.skipEntryInvalidation) return 0;
            const owner = safeCall(() => scope.contentsOwners.get(bitmap));
            const data = owner ? safeCall(() => scope.windowRegistry.get(owner)) : null;
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return 0;
        
            const deferUntilRefreshEnds = isWindowRefreshMutation(owner, bitmap);
            const removed = [];
            data.texts.forEach((entry, key) => {
                if (!entry || !windowEntryBelongsToBitmap(entry, bitmap, owner, data)) return;
                const entryRect = deriveWindowEntryRect(entry);
                if (!rect || !entryRect || rectanglesOverlap(rect, entryRect)) {
                    if (deferUntilRefreshEnds && wasWindowEntryObservedInCurrentRefresh(entry, owner, data)) return;
                    const allowDetachedReattach = canRecoverDetachedWindowEntryAfterBlt(entry, {
                        methodName: reason,
                    });
                    if (allowDetachedReattach && canRetargetDetachedWindowEntryAfterSelfBlt(entryRect, bitmap, rect, {
                        sourceBitmap: options && options.sourceBitmap ? options.sourceBitmap : null,
                        sourceRect: options && options.sourceRect ? options.sourceRect : null,
                    })) {
                        retargetDetachedWindowEntryForSelfBlt(entry, entryRect, options.sourceRect, rect);
                    }
                    removed.push({ key, entry, allowDetachedReattach });
                }
            });
            removed.forEach(({ key, entry, allowDetachedReattach }) => {
                const sourceReason = `${reason}-contents`;
                if (deferUntilRefreshEnds) {
                    entry._trPendingInvalidation = {
                        reason: 'window-entry-stale',
                        sourceReason,
                        at: Date.now(),
                    };
                } else {
                    entry._trStale = true;
                    if (entry.recordId) {
                        const screenState = getWindowOwnerScreenState(owner, data);
                        retireWindowEntry(entry, sourceReason, {
                            windowType: describeOwnerType(owner, bitmap),
                            screenState,
                            allowDetachedReattach: allowDetachedReattach === true,
                        }, {
                            cancelTranslation: false,
                        });
                    }
                    data.texts.delete(key);
                }
                if (data.pendingRedraws && typeof data.pendingRedraws.delete === 'function') data.pendingRedraws.delete(key);
            });
            if (removed.length) data.contentsRevision = (data.contentsRevision || 0) + 1;
            return removed.length;
        }
        
        function wasWindowEntryObservedInCurrentRefresh(entry, owner, data) {
            if (!entry || !scope.windowLifecycle || typeof scope.windowLifecycle.wasEntryObservedInRefresh !== 'function') return false;
            try {
                return scope.windowLifecycle.wasEntryObservedInRefresh(entry, owner, data) === true;
            } catch (_) {
                return false;
            }
        }
        
        function isWindowRefreshMutation(owner, bitmap) {
            return !!((owner && owner._trWindowRefreshDepth > 0)
                || (owner && owner._trTranslationRefreshDepth > 0)
                || (bitmap && bitmap._trWindowRefreshDepth > 0));
        }

        return { installBitmapMutationHooks, installBitmapMutationHook, shouldBypassMutation, getMutationBypassReason, hasMutationObserverInterest, shouldHandleBitmapMutation, hasBitmapStateMutationInterest, hasWindowEntryMutationInterest, hasAnyWindowEntries, recordNativeMutationAttribution, classifyBitmapMutationSurface, bucketBitmapPixels, bucketBitmapDimensions, bucketDimension, sanitizePerfLabel, describeMutation, handleBitmapMutation, flushFragmentsBeforeMutation, invalidateEntriesInRect, discardFragmentsInRect, invalidateWindowEntries, wasWindowEntryObservedInCurrentRefresh, isWindowRefreshMutation };
    }

    defineRuntimeModule('adapters.bitmapTextMutations', { create: createController });
})();
