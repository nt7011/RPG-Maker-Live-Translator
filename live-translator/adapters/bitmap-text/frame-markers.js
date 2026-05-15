// Bitmap text adapter support: frame markers.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/frame-markers.js.');
    }

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, scheduleBitmapDrawWrapperRetry, handleBitmapDrawText, shouldBypassBitmapDraw, describeBitmapDrawBypassReason, recordBitmapSurfaceDraw, createFragment, scheduleFlush, scheduleFallbackFlush, flushQueuedBitmaps, flushAggregatedLines, takeFragmentsForFlush, finalizeFragmentOwnership, releaseFragmentOwnership, groupFragmentsIntoLines, canMergeFragments, createEntryFromGroup, registerBitmapEntry, refreshExistingEntry, observeEntry, requestEntryTranslation, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, restoreTranslatedEntryText, redrawBitmapEntry, markEntryTerminal, isEntryActive, getEntryStatus, isEntryRequestActive, isEntryCompleted, getEntryObservationStatus, retireEntry, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason, installBitmapMutationHooks, installBitmapMutationHook, shouldBypassMutation, getMutationBypassReason, hasMutationObserverInterest, shouldHandleBitmapMutation, hasBitmapStateMutationInterest, hasWindowEntryMutationInterest, hasAnyWindowEntries, recordNativeMutationAttribution, classifyBitmapMutationSurface, bucketBitmapPixels, bucketBitmapDimensions, bucketDimension, sanitizePerfLabel, describeMutation, handleBitmapMutation, flushFragmentsBeforeMutation, invalidateEntriesInRect, discardFragmentsInRect, invalidateWindowEntries, wasWindowEntryObservedInCurrentRefresh, isWindowRefreshMutation, ensureBitmapState, getBitmapState, nextDrawOrder, recordBitmapRenderOp, recordNativeTextForReplay, discardRenderOpsInRect, withBitmapReplay, collectReplayItems, replayBitmapItems, replayBitmapRenderOp, replayBitmapEntry, drawBitmapTextValue, drawBitmapTextArgs, calculateClearRect, estimateTextWidth, computeFontSignature, sanitizeVisibleText, sanitizePerChar, isStandaloneGlyphText, sanitizeBitmapDrawText, safePrepareText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, roundTraceNumber, getBitmapFallbackMode, isBitmapFallbackCaptureEnabled, isBitmapFallbackRedrawEnabled, readBitmapOwner, hasDedicatedOwnerHook, windowEntryBelongsToBitmap, deriveWindowEntryRect, deriveEntryRect, fragmentRect, rectFromDimensions, isValidRect, rectHasArea, rectOrNull, rectanglesOverlap, normalizeCanvasTextAlign, describeOwnerType, shouldKeepWindowEntryTranslation, getWindowOwnerScreenState, retireWindowEntry, logTextDetected, updateItem, safeCall, isAdapterContractFailure, warn, stringify, finiteNumber, positiveNumber, pruneArray, errorMessage } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'registerBitmapCapabilities', 'exposeAdapterApi', 'installBitmapDrawWrappers', 'installBitmapDrawWrapper', 'scheduleBitmapDrawWrapperRetry', 'handleBitmapDrawText', 'shouldBypassBitmapDraw', 'describeBitmapDrawBypassReason', 'recordBitmapSurfaceDraw', 'createFragment', 'scheduleFlush', 'scheduleFallbackFlush', 'flushQueuedBitmaps', 'flushAggregatedLines', 'takeFragmentsForFlush', 'finalizeFragmentOwnership', 'releaseFragmentOwnership', 'groupFragmentsIntoLines', 'canMergeFragments', 'createEntryFromGroup', 'registerBitmapEntry', 'refreshExistingEntry', 'observeEntry', 'requestEntryTranslation', 'applyRenderCommand', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'restoreTranslatedEntryText', 'redrawBitmapEntry', 'markEntryTerminal', 'isEntryActive', 'getEntryStatus', 'isEntryRequestActive', 'isEntryCompleted', 'getEntryObservationStatus', 'retireEntry', 'shouldKeepRecordAfterRenderRejection', 'isRenderApplicationFailure', 'normalizeRenderRejectionReason', 'installBitmapMutationHooks', 'installBitmapMutationHook', 'shouldBypassMutation', 'getMutationBypassReason', 'hasMutationObserverInterest', 'shouldHandleBitmapMutation', 'hasBitmapStateMutationInterest', 'hasWindowEntryMutationInterest', 'hasAnyWindowEntries', 'recordNativeMutationAttribution', 'classifyBitmapMutationSurface', 'bucketBitmapPixels', 'bucketBitmapDimensions', 'bucketDimension', 'sanitizePerfLabel', 'describeMutation', 'handleBitmapMutation', 'flushFragmentsBeforeMutation', 'invalidateEntriesInRect', 'discardFragmentsInRect', 'invalidateWindowEntries', 'wasWindowEntryObservedInCurrentRefresh', 'isWindowRefreshMutation', 'ensureBitmapState', 'getBitmapState', 'nextDrawOrder', 'recordBitmapRenderOp', 'recordNativeTextForReplay', 'discardRenderOpsInRect', 'withBitmapReplay', 'collectReplayItems', 'replayBitmapItems', 'replayBitmapRenderOp', 'replayBitmapEntry', 'drawBitmapTextValue', 'drawBitmapTextArgs', 'calculateClearRect', 'estimateTextWidth', 'computeFontSignature', 'sanitizeVisibleText', 'sanitizePerChar', 'isStandaloneGlyphText', 'sanitizeBitmapDrawText', 'safePrepareText', 'describeEntryEligibility', 'recordDrawTrace', 'bitmapTraceDetails', 'cloneTraceRect', 'roundTraceNumber', 'getBitmapFallbackMode', 'isBitmapFallbackCaptureEnabled', 'isBitmapFallbackRedrawEnabled', 'readBitmapOwner', 'hasDedicatedOwnerHook', 'windowEntryBelongsToBitmap', 'deriveWindowEntryRect', 'deriveEntryRect', 'fragmentRect', 'rectFromDimensions', 'isValidRect', 'rectHasArea', 'rectOrNull', 'rectanglesOverlap', 'normalizeCanvasTextAlign', 'describeOwnerType', 'shouldKeepWindowEntryTranslation', 'getWindowOwnerScreenState', 'retireWindowEntry', 'logTextDetected', 'updateItem', 'safeCall', 'isAdapterContractFailure', 'warn', 'stringify', 'finiteNumber', 'positiveNumber', 'pruneArray', 'errorMessage'].map((name) => [name, callScope(name)]));

        function installFrameFlushHooks() {
            let installed = false;
            try {
                if (typeof SceneManager !== 'undefined' && SceneManager) {
                    installed = installFrameFlushHook(SceneManager, 'updateScene', 'SceneManager.updateScene', false) || installed;
                    installed = installFrameFlushHook(SceneManager, 'renderScene', 'SceneManager.renderScene', true) || installed;
                }
            } catch (_) {}
            try {
                if (typeof Graphics !== 'undefined' && Graphics) {
                    installed = installFrameFlushHook(Graphics, 'render', 'Graphics.render', true) || installed;
                }
            } catch (_) {}
            return installed;
        }

        function hasActiveFrameFlushHooks() {
            try {
                if (typeof SceneManager !== 'undefined' && SceneManager) {
                    if (hasHookInChain(SceneManager.updateScene, '__trBitmapTextFrameFlush', FRAME_FLUSH_TOKEN)) return true;
                    if (hasHookInChain(SceneManager.renderScene, '__trBitmapTextFrameFlush', FRAME_FLUSH_TOKEN)) return true;
                }
            } catch (_) {}
            try {
                if (typeof Graphics !== 'undefined' && Graphics) {
                    if (hasHookInChain(Graphics.render, '__trBitmapTextFrameFlush', FRAME_FLUSH_TOKEN)) return true;
                }
            } catch (_) {}
            return false;
        }

        function ensureActiveFrameFlushHooks() {
            if (hasActiveFrameFlushHooks()) return true;
            const installed = installFrameFlushHooks();
            if (installed) scope.frameFlushInstalled = true;
            return hasActiveFrameFlushHooks();
        }
        
        function installFrameFlushHook(target, methodName, label, flushBefore) {
            if (!target || typeof target[methodName] !== 'function') return false;
            if (hasHookInChain(target[methodName], '__trBitmapTextFrameFlush', FRAME_FLUSH_TOKEN)) return true;
            const original = target[methodName];
            const wrapped = function(...args) {
                if (flushBefore) flushQueuedBitmaps(label);
                const result = original.apply(this, args);
                if (!flushBefore) flushQueuedBitmaps(label);
                return result;
            };
            wrapped.__trOriginal = original;
            wrapped.__trBitmapTextFrameFlush = FRAME_FLUSH_TOKEN;
            target[methodName] = wrapped;
            return true;
        }
        
        function hasHookInChain(fn, property, token) {
            const seen = [];
            let current = typeof fn === 'function' ? fn : null;
            while (current && seen.indexOf(current) < 0) {
                if (current[property] === token) return true;
                seen.push(current);
                current = typeof current.__trOriginal === 'function' ? current.__trOriginal : null;
            }
            return false;
        }
        
        function installSmallTextMarkers() {
            installSmallTextMarker(Bitmap.prototype, 'drawSmallText');
            installSmallTextMarker(Bitmap, 'drawSmallText');
        }
        
        function installSmallTextMarker(target, methodName) {
            if (!target || typeof target[methodName] !== 'function') return false;
            const current = target[methodName];
            if (hasHookInChain(current, '__trBitmapTextSmallText', SMALL_TEXT_TOKEN)) return true;
            const original = current;
            const wrapped = function(...args) {
                scope.smallTextDepth += 1;
                try { return original.apply(this, args); }
                finally { scope.smallTextDepth = Math.max(0, scope.smallTextDepth - 1); }
            };
            wrapped.__trBitmapTextSmallText = SMALL_TEXT_TOKEN;
            wrapped.__trOriginal = original;
            target[methodName] = wrapped;
            return true;
        }
        
        function installNormalCharacterMarker() {
            try {
                if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) return false;
                const current = Window_Base.prototype.processNormalCharacter;
                if (typeof current !== 'function' || hasHookInChain(current, '__trBitmapTextNormalChar', NORMAL_CHAR_TOKEN)) return true;
                const original = current;
                const wrapped = function(...args) {
                    scope.normalCharacterDepth += 1;
                    if (this && this.contents) this.contents._trNormalCharDepth = (this.contents._trNormalCharDepth || 0) + 1;
                    try { return original.apply(this, args); }
                    finally {
                        scope.normalCharacterDepth = Math.max(0, scope.normalCharacterDepth - 1);
                        if (this && this.contents) this.contents._trNormalCharDepth = Math.max(0, (this.contents._trNormalCharDepth || 1) - 1);
                    }
                };
                wrapped.__trBitmapTextNormalChar = NORMAL_CHAR_TOKEN;
                wrapped.__trOriginal = original;
                Window_Base.prototype.processNormalCharacter = wrapped;
                return true;
            } catch (_) {
                return false;
            }
        }
        
        function isSmallTextDrawActive(bitmap) {
            return scope.smallTextDepth > 0 || scope.normalCharacterDepth > 0 || !!(bitmap && (bitmap._trSmallTextDepth > 0 || bitmap._trNormalCharDepth > 0));
        }
        
        function isSmallTextScratchBitmap(bitmap) {
            try {
                return !!(bitmap && typeof Bitmap !== 'undefined' && Bitmap.drawSmallTextBitmap && bitmap === Bitmap.drawSmallTextBitmap);
            } catch (_) {
                return false;
            }
        }

        return { installFrameFlushHooks, hasActiveFrameFlushHooks, ensureActiveFrameFlushHooks, installFrameFlushHook, hasHookInChain, installSmallTextMarkers, installSmallTextMarker, installNormalCharacterMarker, isSmallTextDrawActive, isSmallTextScratchBitmap };
    }

    defineRuntimeModule('adapters.bitmapTextFrameMarkers', { create: createController });
})();
