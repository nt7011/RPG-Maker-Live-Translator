// Bitmap text adapter support: replay.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/replay.js.');
    }

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, scheduleBitmapDrawWrapperRetry, handleBitmapDrawText, shouldBypassBitmapDraw, describeBitmapDrawBypassReason, recordBitmapSurfaceDraw, createFragment, scheduleFlush, scheduleFallbackFlush, flushQueuedBitmaps, flushAggregatedLines, takeFragmentsForFlush, finalizeFragmentOwnership, releaseFragmentOwnership, groupFragmentsIntoLines, canMergeFragments, createEntryFromGroup, registerBitmapEntry, refreshExistingEntry, observeEntry, requestEntryTranslation, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, restoreTranslatedEntryText, redrawBitmapEntry, markEntryTerminal, isEntryActive, getEntryStatus, isEntryRequestActive, isEntryCompleted, getEntryObservationStatus, retireEntry, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason, installBitmapMutationHooks, installBitmapMutationHook, shouldBypassMutation, getMutationBypassReason, hasMutationObserverInterest, shouldHandleBitmapMutation, hasBitmapStateMutationInterest, hasWindowEntryMutationInterest, hasAnyWindowEntries, recordNativeMutationAttribution, classifyBitmapMutationSurface, bucketBitmapPixels, bucketBitmapDimensions, bucketDimension, sanitizePerfLabel, describeMutation, handleBitmapMutation, flushFragmentsBeforeMutation, invalidateEntriesInRect, discardFragmentsInRect, invalidateWindowEntries, wasWindowEntryObservedInCurrentRefresh, isWindowRefreshMutation, installFrameFlushHooks, installFrameFlushHook, hasHookInChain, installSmallTextMarkers, installSmallTextMarker, installNormalCharacterMarker, isSmallTextDrawActive, isSmallTextScratchBitmap, estimateTextWidth, computeFontSignature, sanitizeVisibleText, sanitizePerChar, isStandaloneGlyphText, sanitizeBitmapDrawText, safePrepareText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, roundTraceNumber, getBitmapFallbackMode, isBitmapFallbackCaptureEnabled, isBitmapFallbackRedrawEnabled, readBitmapOwner, hasDedicatedOwnerHook, windowEntryBelongsToBitmap, deriveWindowEntryRect, deriveEntryRect, fragmentRect, rectFromDimensions, isValidRect, rectHasArea, rectOrNull, rectanglesOverlap, normalizeCanvasTextAlign, describeOwnerType, shouldKeepWindowEntryTranslation, getWindowOwnerScreenState, retireWindowEntry, logTextDetected, updateItem, safeCall, isAdapterContractFailure, warn, stringify, finiteNumber, positiveNumber, pruneArray, errorMessage } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'registerBitmapCapabilities', 'exposeAdapterApi', 'installBitmapDrawWrappers', 'installBitmapDrawWrapper', 'scheduleBitmapDrawWrapperRetry', 'handleBitmapDrawText', 'shouldBypassBitmapDraw', 'describeBitmapDrawBypassReason', 'recordBitmapSurfaceDraw', 'createFragment', 'scheduleFlush', 'scheduleFallbackFlush', 'flushQueuedBitmaps', 'flushAggregatedLines', 'takeFragmentsForFlush', 'finalizeFragmentOwnership', 'releaseFragmentOwnership', 'groupFragmentsIntoLines', 'canMergeFragments', 'createEntryFromGroup', 'registerBitmapEntry', 'refreshExistingEntry', 'observeEntry', 'requestEntryTranslation', 'applyRenderCommand', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'restoreTranslatedEntryText', 'redrawBitmapEntry', 'markEntryTerminal', 'isEntryActive', 'getEntryStatus', 'isEntryRequestActive', 'isEntryCompleted', 'getEntryObservationStatus', 'retireEntry', 'shouldKeepRecordAfterRenderRejection', 'isRenderApplicationFailure', 'normalizeRenderRejectionReason', 'installBitmapMutationHooks', 'installBitmapMutationHook', 'shouldBypassMutation', 'getMutationBypassReason', 'hasMutationObserverInterest', 'shouldHandleBitmapMutation', 'hasBitmapStateMutationInterest', 'hasWindowEntryMutationInterest', 'hasAnyWindowEntries', 'recordNativeMutationAttribution', 'classifyBitmapMutationSurface', 'bucketBitmapPixels', 'bucketBitmapDimensions', 'bucketDimension', 'sanitizePerfLabel', 'describeMutation', 'handleBitmapMutation', 'flushFragmentsBeforeMutation', 'invalidateEntriesInRect', 'discardFragmentsInRect', 'invalidateWindowEntries', 'wasWindowEntryObservedInCurrentRefresh', 'isWindowRefreshMutation', 'installFrameFlushHooks', 'installFrameFlushHook', 'hasHookInChain', 'installSmallTextMarkers', 'installSmallTextMarker', 'installNormalCharacterMarker', 'isSmallTextDrawActive', 'isSmallTextScratchBitmap', 'estimateTextWidth', 'computeFontSignature', 'sanitizeVisibleText', 'sanitizePerChar', 'isStandaloneGlyphText', 'sanitizeBitmapDrawText', 'safePrepareText', 'describeEntryEligibility', 'recordDrawTrace', 'bitmapTraceDetails', 'cloneTraceRect', 'roundTraceNumber', 'getBitmapFallbackMode', 'isBitmapFallbackCaptureEnabled', 'isBitmapFallbackRedrawEnabled', 'readBitmapOwner', 'hasDedicatedOwnerHook', 'windowEntryBelongsToBitmap', 'deriveWindowEntryRect', 'deriveEntryRect', 'fragmentRect', 'rectFromDimensions', 'isValidRect', 'rectHasArea', 'rectOrNull', 'rectanglesOverlap', 'normalizeCanvasTextAlign', 'describeOwnerType', 'shouldKeepWindowEntryTranslation', 'getWindowOwnerScreenState', 'retireWindowEntry', 'logTextDetected', 'updateItem', 'safeCall', 'isAdapterContractFailure', 'warn', 'stringify', 'finiteNumber', 'positiveNumber', 'pruneArray', 'errorMessage'].map((name) => [name, callScope(name)]));

        function ensureBitmapState(bitmap) {
            if (!bitmap) return null;
            let state = scope.bitmapStates.get(bitmap);
            if (!state) {
                state = {
                    id: bitmap._trBitmapTextId || `btm-${(++scope.nextBitmapId).toString(36)}`,
                    bitmap,
                    revision: 1,
                    fragments: [],
                    entries: new Map(),
                    renderOps: [],
                    nativeTextOps: new Map(),
                    drawOrderCounter: 0,
                    flushQueued: false,
                    destroyed: false,
                };
                scope.bitmapStates.set(bitmap, state);
                try { bitmap._trBitmapTextId = state.id; } catch (_) {}
            }
            if (!Array.isArray(state.fragments)) state.fragments = [];
            if (!Array.isArray(state.renderOps)) state.renderOps = [];
            if (!state.entries || typeof state.entries.set !== 'function') state.entries = new Map();
            if (!state.nativeTextOps || typeof state.nativeTextOps.set !== 'function') state.nativeTextOps = new Map();
            return state;
        }
        
        function getBitmapState(bitmap) {
            if (!bitmap) return null;
            try { return scope.bitmapStates.get(bitmap) || null; } catch (_) { return null; }
        }
        
        function nextDrawOrder(state) {
            if (!state) return 0;
            state.drawOrderCounter = (state.drawOrderCounter || 0) + 1;
            return state.drawOrderCounter;
        }
        
        function recordBitmapRenderOp(bitmap, op) {
            if (!bitmap || !op || !op.methodName) return null;
            const state = ensureBitmapState(bitmap);
            if (!state) return null;
            const rect = op.rect && isValidRect(op.rect) ? op.rect : null;
            if (!rect) return null;
            const record = {
                methodName: op.methodName,
                args: Array.isArray(op.args) ? op.args.slice() : [],
                rect,
                drawOrder: nextDrawOrder(state),
                recordedAt: Date.now(),
                drawState: op.drawState || null,
                nativeTextKey: op.nativeTextKey || '',
                textPreview: op.textPreview || '',
                ownerType: op.ownerType || '',
                windowDrawTextExReplay: !!(op.windowDrawTextExReplay || (bitmap && bitmap._trWindowDrawTextExReplayDepth > 0)),
            };
            state.renderOps.push(record);
            pruneArray(state.renderOps, MAX_REPLAY_OPS);
            return record;
        }
        
        function recordNativeTextForReplay(entry) {
            if (!entry || !entry.state || !entry.key) return null;
            const rect = deriveEntryRect(entry);
            if (!rect) return null;
            const existing = entry.state.nativeTextOps.get(entry.key);
            const op = existing || {};
            Object.assign(op, {
                methodName: entry.methodName || 'drawText',
                args: [
                    entry.rawText,
                    entry.drawParams.x,
                    entry.drawParams.y,
                    entry.drawParams.maxWidth,
                    entry.drawParams.lineHeight,
                    entry.drawParams.align,
                ],
                rect,
                drawState: entry.drawState,
                drawOrder: entry.drawOrder,
                recordedAt: Date.now(),
                nativeTextKey: entry.key,
                textPreview: entry.visibleText,
                ownerType: entry.ownerType,
            });
            if (!existing) {
                entry.state.renderOps.push(op);
                entry.state.nativeTextOps.set(entry.key, op);
                pruneArray(entry.state.renderOps, MAX_REPLAY_OPS);
            }
            return op;
        }
        
        function discardRenderOpsInRect(state, rect) {
            if (!state || !Array.isArray(state.renderOps)) return;
            if (!rect || !isValidRect(rect)) {
                state.renderOps.length = 0;
                if (state.nativeTextOps) state.nativeTextOps.clear();
                return;
            }
            state.renderOps = state.renderOps.filter((op) => {
                const keep = !op || !op.rect || !rectanglesOverlap(op.rect, rect);
                if (!keep && op.nativeTextKey && state.nativeTextOps && state.nativeTextOps.get(op.nativeTextKey) === op) {
                    state.nativeTextOps.delete(op.nativeTextKey);
                }
                return keep;
            });
        }
        
        function withBitmapReplay(bitmap, callback, source = 'bitmap-replay') {
            if (!bitmap || typeof callback !== 'function') return undefined;
            const previousSource = bitmap._trBitmapReplaySource;
            bitmap._trBitmapReplayDepth = (bitmap._trBitmapReplayDepth || 0) + 1;
            bitmap._trBitmapReplaySource = source || previousSource || 'bitmap-replay';
            try { return callback(); }
            finally {
                bitmap._trBitmapReplayDepth = Math.max(0, (bitmap._trBitmapReplayDepth || 1) - 1);
                if (previousSource) bitmap._trBitmapReplaySource = previousSource;
                else {
                    try { delete bitmap._trBitmapReplaySource; } catch (_) { bitmap._trBitmapReplaySource = ''; }
                }
            }
        }
        
        function collectReplayItems(state, rect, currentEntry, relation) {
            if (!state || !rect || !isValidRect(rect) || typeof relation !== 'function') return [];
            const items = [];
            state.renderOps.forEach((op) => {
                if (!op || !op.rect || !rectanglesOverlap(rect, op.rect)) return;
                if (!relation(op.drawOrder || 0)) return;
                items.push({ type: 'renderOp', drawOrder: op.drawOrder || 0, op });
            });
            state.entries.forEach((entry) => {
                if (!entry || entry === currentEntry || entry.stale) return;
                const entryRect = deriveEntryRect(entry);
                if (!entryRect || !rectanglesOverlap(rect, entryRect)) return;
                if (!relation(entry.drawOrder || 0)) return;
                items.push({ type: 'text', drawOrder: entry.drawOrder || 0, entry });
            });
            items.sort((a, b) => (a.drawOrder || 0) - (b.drawOrder || 0));
            return items;
        }
        
        function replayBitmapItems(bitmap, items) {
            if (!bitmap || !Array.isArray(items) || !items.length) return;
            items.forEach((item) => {
                if (!item) return;
                if (item.type === 'renderOp') replayBitmapRenderOp(bitmap, item.op);
                else if (item.type === 'text') replayBitmapEntry(bitmap, item.entry);
            });
        }
        
        function replayBitmapRenderOp(bitmap, op) {
            if (!bitmap || !op || !op.methodName) return;
            try {
                if (op.drawState) scope.applyBitmapDrawState(bitmap, op.drawState);
                switch (op.methodName) {
                case 'drawText':
                case 'drawTextS':
                case 'drawTextM':
                    drawBitmapTextArgs(bitmap, op.methodName, op.args, op.drawState);
                    break;
                case 'fillRect':
                case 'gradientFillRect':
                case 'strokeRect':
                case 'drawCircle':
                case 'blt':
                case 'bltImage':
                    if (typeof bitmap[op.methodName] === 'function') bitmap[op.methodName](...op.args);
                    break;
                default:
                    break;
                }
            } catch (_) {}
        }
        
        function replayBitmapEntry(bitmap, entry) {
            if (!bitmap || !entry || entry.stale) return;
            const text = isEntryCompleted(entry) && entry.renderedText
                ? entry.renderedText
                : entry.rawText;
            drawBitmapTextValue(bitmap, entry, text);
        }
        
        function drawBitmapTextValue(bitmap, entry, text) {
            if (!bitmap || !entry || typeof text !== 'string' || !text) return;
            try { scope.applyBitmapDrawState(bitmap, entry.drawState); } catch (_) {}
            const methodName = entry.methodName && typeof bitmap[entry.methodName] === 'function'
                ? entry.methodName
                : 'drawText';
            const args = [
                sanitizeBitmapDrawText(text, methodName),
                entry.drawParams.x,
                entry.drawParams.y,
                entry.drawParams.maxWidth,
                entry.drawParams.lineHeight,
                entry.drawParams.align,
            ];
            drawBitmapTextArgs(bitmap, methodName, args, entry.drawState);
        }
        
        function drawBitmapTextArgs(bitmap, methodName, args) {
            const drawMethodName = typeof bitmap[methodName] === 'function' ? methodName : 'drawText';
            const drawFn = bitmap[drawMethodName] || bitmap.drawText;
            if (typeof drawFn !== 'function') return;
            drawFn.call(bitmap, ...args);
        }
        
        function calculateClearRect(bitmap, entry) {
            const bounds = entry && entry.bounds;
            if (!bitmap || !bounds) return null;
            const outline = entry.drawState && Number.isFinite(Number(entry.drawState.outlineWidth))
                ? Math.max(1, Number(entry.drawState.outlineWidth) + 1)
                : 2;
            const fontSize = positiveNumber(entry.drawState && entry.drawState.fontSize, entry.drawParams && entry.drawParams.lineHeight, 24);
            const topPad = Math.min(outline, Math.ceil(fontSize * 0.08));
            const bottomPad = Math.max(outline, Math.ceil(fontSize * 0.25));
            const x = Math.max(0, Math.floor(bounds.x1 - outline));
            const y = Math.max(0, Math.floor(bounds.y1 - topPad));
            const width = Math.ceil(bounds.x2 - bounds.x1 + outline * 2);
            const height = Math.ceil(bounds.y2 - bounds.y1 + topPad + bottomPad);
            return {
                x,
                y,
                width: Math.min(Math.max(0, Number(bitmap.width) || width), width, Math.max(0, (Number(bitmap.width) || x + width) - x)),
                height: Math.min(Math.max(0, Number(bitmap.height) || height), height, Math.max(0, (Number(bitmap.height) || y + height) - y)),
            };
        }

        return { ensureBitmapState, getBitmapState, nextDrawOrder, recordBitmapRenderOp, recordNativeTextForReplay, discardRenderOpsInRect, withBitmapReplay, collectReplayItems, replayBitmapItems, replayBitmapRenderOp, replayBitmapEntry, drawBitmapTextValue, drawBitmapTextArgs, calculateClearRect };
    }

    defineRuntimeModule('adapters.bitmapTextReplay', { create: createController });
})();
