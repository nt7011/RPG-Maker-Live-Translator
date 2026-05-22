// Bitmap text adapter support: aggregation.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/aggregation.js.');
    }

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, scheduleBitmapDrawWrapperRetry, handleBitmapDrawText, shouldBypassBitmapDraw, describeBitmapDrawBypassReason, recordBitmapSurfaceDraw, createFragment, observeEntry, requestEntryTranslation, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, restoreTranslatedEntryText, redrawBitmapEntry, markEntryTerminal, isEntryActive, getEntryStatus, isEntryRequestActive, isEntryCompleted, getEntryObservationStatus, retireEntry, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason, installBitmapMutationHooks, installBitmapMutationHook, shouldBypassMutation, getMutationBypassReason, hasMutationObserverInterest, shouldHandleBitmapMutation, hasBitmapStateMutationInterest, hasWindowEntryMutationInterest, hasAnyWindowEntries, recordNativeMutationAttribution, classifyBitmapMutationSurface, bucketBitmapPixels, bucketBitmapDimensions, bucketDimension, sanitizePerfLabel, describeMutation, handleBitmapMutation, flushFragmentsBeforeMutation, invalidateEntriesInRect, discardFragmentsInRect, invalidateWindowEntries, wasWindowEntryObservedInCurrentRefresh, isWindowRefreshMutation, installFrameFlushHooks, installFrameFlushHook, hasHookInChain, installSmallTextMarkers, installSmallTextMarker, installNormalCharacterMarker, isSmallTextDrawActive, isSmallTextScratchBitmap, ensureBitmapState, getBitmapState, nextDrawOrder, recordBitmapRenderOp, recordNativeTextForReplay, discardRenderOpsInRect, withBitmapReplay, collectReplayItems, replayBitmapItems, replayBitmapRenderOp, replayBitmapEntry, drawBitmapTextValue, drawBitmapTextArgs, calculateClearRect, estimateTextWidth, computeFontSignature, sanitizeVisibleText, sanitizePerChar, isStandaloneGlyphText, sanitizeBitmapDrawText, safePrepareText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, roundTraceNumber, getBitmapFallbackMode, isBitmapFallbackCaptureEnabled, isBitmapFallbackRedrawEnabled, readBitmapOwner, hasDedicatedOwnerHook, windowEntryBelongsToBitmap, deriveWindowEntryRect, deriveEntryRect, fragmentRect, rectFromDimensions, isValidRect, rectHasArea, rectOrNull, rectanglesOverlap, normalizeCanvasTextAlign, describeOwnerType, shouldKeepWindowEntryTranslation, getWindowOwnerScreenState, retireWindowEntry, logTextDetected, updateItem, safeCall, isAdapterContractFailure, warn, stringify, finiteNumber, positiveNumber, pruneArray, errorMessage } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'registerBitmapCapabilities', 'exposeAdapterApi', 'installBitmapDrawWrappers', 'installBitmapDrawWrapper', 'scheduleBitmapDrawWrapperRetry', 'handleBitmapDrawText', 'shouldBypassBitmapDraw', 'describeBitmapDrawBypassReason', 'recordBitmapSurfaceDraw', 'createFragment', 'observeEntry', 'requestEntryTranslation', 'applyRenderCommand', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'restoreTranslatedEntryText', 'redrawBitmapEntry', 'markEntryTerminal', 'isEntryActive', 'getEntryStatus', 'isEntryRequestActive', 'isEntryCompleted', 'getEntryObservationStatus', 'retireEntry', 'shouldKeepRecordAfterRenderRejection', 'isRenderApplicationFailure', 'normalizeRenderRejectionReason', 'installBitmapMutationHooks', 'installBitmapMutationHook', 'shouldBypassMutation', 'getMutationBypassReason', 'hasMutationObserverInterest', 'shouldHandleBitmapMutation', 'hasBitmapStateMutationInterest', 'hasWindowEntryMutationInterest', 'hasAnyWindowEntries', 'recordNativeMutationAttribution', 'classifyBitmapMutationSurface', 'bucketBitmapPixels', 'bucketBitmapDimensions', 'bucketDimension', 'sanitizePerfLabel', 'describeMutation', 'handleBitmapMutation', 'flushFragmentsBeforeMutation', 'invalidateEntriesInRect', 'discardFragmentsInRect', 'invalidateWindowEntries', 'wasWindowEntryObservedInCurrentRefresh', 'isWindowRefreshMutation', 'installFrameFlushHooks', 'installFrameFlushHook', 'hasHookInChain', 'installSmallTextMarkers', 'installSmallTextMarker', 'installNormalCharacterMarker', 'isSmallTextDrawActive', 'isSmallTextScratchBitmap', 'ensureBitmapState', 'getBitmapState', 'nextDrawOrder', 'recordBitmapRenderOp', 'recordNativeTextForReplay', 'discardRenderOpsInRect', 'withBitmapReplay', 'collectReplayItems', 'replayBitmapItems', 'replayBitmapRenderOp', 'replayBitmapEntry', 'drawBitmapTextValue', 'drawBitmapTextArgs', 'calculateClearRect', 'estimateTextWidth', 'computeFontSignature', 'sanitizeVisibleText', 'sanitizePerChar', 'isStandaloneGlyphText', 'sanitizeBitmapDrawText', 'safePrepareText', 'describeEntryEligibility', 'recordDrawTrace', 'bitmapTraceDetails', 'cloneTraceRect', 'roundTraceNumber', 'getBitmapFallbackMode', 'isBitmapFallbackCaptureEnabled', 'isBitmapFallbackRedrawEnabled', 'readBitmapOwner', 'hasDedicatedOwnerHook', 'windowEntryBelongsToBitmap', 'deriveWindowEntryRect', 'deriveEntryRect', 'fragmentRect', 'rectFromDimensions', 'isValidRect', 'rectHasArea', 'rectOrNull', 'rectanglesOverlap', 'normalizeCanvasTextAlign', 'describeOwnerType', 'shouldKeepWindowEntryTranslation', 'getWindowOwnerScreenState', 'retireWindowEntry', 'logTextDetected', 'updateItem', 'safeCall', 'isAdapterContractFailure', 'warn', 'stringify', 'finiteNumber', 'positiveNumber', 'pruneArray', 'errorMessage'].map((name) => [name, callScope(name)]));

        function scheduleFlush(bitmap) {
            const state = getBitmapState(bitmap);
            if (!state || state.flushQueued) return;
            state.flushQueued = true;
            scope.pendingFlushBitmaps.add(bitmap);
            if (!scope.frameFlushInstalled) scheduleFallbackFlush();
        }
        
        function scheduleFallbackFlush() {
            if (scope.fallbackFlushTimer || typeof setTimeout !== 'function') return;
            scope.fallbackFlushTimer = setTimeout(() => {
                scope.fallbackFlushTimer = null;
                flushQueuedBitmaps('fallback-timer');
            }, 0);
        }
        
        function flushQueuedBitmaps(reason = 'frame') {
            if (scope.bitmapServices && typeof scope.bitmapServices.flushDrawBatches === 'function') {
                scope.bitmapServices.flushDrawBatches(reason);
            }
            if (!scope.pendingFlushBitmaps.size) return;
            const bitmaps = Array.from(scope.pendingFlushBitmaps);
            scope.pendingFlushBitmaps.clear();
            bitmaps.forEach((bitmap) => {
                const state = getBitmapState(bitmap);
                if (state) state.flushQueued = false;
                try { flushAggregatedLines(bitmap, reason); } catch (error) {
                    if (isAdapterContractFailure(error)) throw error;
                    warn('[BitmapText] Failed to flush bitmap fragments.', error);
                }
            });
        }
        
        function flushAggregatedLines(bitmap, reason = 'manual', targetRect = null) {
            const state = getBitmapState(bitmap);
            if (!state || !Array.isArray(state.fragments) || !state.fragments.length) return;
        
            const fragments = takeFragmentsForFlush(state, targetRect).filter(finalizeFragmentOwnership);
            if (!fragments.length) return;
        
            const groups = groupFragmentsIntoLines(fragments);
            const activationQueue = [];
            groups.forEach((group) => {
                const entry = createEntryFromGroup(bitmap, state, group);
                if (entry) registerBitmapEntry(state, entry, activationQueue);
            });
            activationQueue.forEach(requestEntryTranslation);
            scope.perf.count('bitmapText.flush.calls');
            scope.perf.count('bitmapText.flush.entries', activationQueue.length);
            scope.perf.top('bitmapText.flush.reason', reason || 'unknown');
        }
        
        function takeFragmentsForFlush(state, targetRect) {
            if (!targetRect || !isValidRect(targetRect)) {
                const fragments = state.fragments.splice(0, state.fragments.length);
                state.flushQueued = false;
                scope.pendingFlushBitmaps.delete(state.bitmap);
                return fragments;
            }
        
            const selected = [];
            const remaining = [];
            state.fragments.forEach((fragment) => {
                const rect = fragmentRect(fragment);
                if (rect && rectanglesOverlap(rect, targetRect)) selected.push(fragment);
                else remaining.push(fragment);
            });
            state.fragments = remaining;
            if (!state.fragments.length) {
                state.flushQueued = false;
                scope.pendingFlushBitmaps.delete(state.bitmap);
            }
            return selected;
        }
        
        function finalizeFragmentOwnership(fragment) {
            if (!fragment || !fragment.ownershipToken) return false;
            if (!scope.adapterContract || typeof scope.adapterContract.finalizeTextClaim !== 'function') return false;
            const result = scope.adapterContract.finalizeTextClaim(fragment.ownershipToken, {
                target: fragment.bitmap,
                surfaceType: SURFACE_TYPE,
                mode: 'bitmapFallback',
                role: 'bitmap-fragment',
                text: fragment.rawText,
                standaloneGlyph: isStandaloneGlyphText(sanitizeVisibleText(fragment.visibleText || fragment.rawText)),
            });
            if (result && result.status === 'claimed') return true;
            scope.perf.count('bitmapText.fragment.ownershipRevoked');
            recordDrawTrace('bitmap.drawText.ownershipRevoked', fragment.rawText, bitmapTraceDetails(
                fragment.bitmap,
                fragment.methodName,
                fragment.rawText,
                fragment.x,
                fragment.y,
                {
                    ownerType: fragment.ownerType || '',
                    reason: result && result.reason ? result.reason : 'ownership-revoked',
                    ownerAdapter: result && result.ownerAdapter ? result.ownerAdapter : '',
                }
            ));
            return false;
        }
        
        function releaseFragmentOwnership(fragment, reason) {
            if (!fragment || !fragment.ownershipToken) return false;
            if (!scope.adapterContract || typeof scope.adapterContract.releaseTextClaim !== 'function') return false;
            const released = scope.adapterContract.releaseTextClaim(fragment.ownershipToken, reason || 'bitmap-fragment-released') === true;
            fragment.ownershipToken = null;
            return released;
        }
        
        function groupFragmentsIntoLines(fragments) {
            const lines = new Map();
            fragments.forEach((fragment) => {
                if (!fragment || !sanitizeVisibleText(fragment.visibleText)) return;
                const key = `${Math.round(fragment.y)}:${Math.round(fragment.lineHeight)}:${fragment.fontSignature || ''}`;
                if (!lines.has(key)) lines.set(key, []);
                lines.get(key).push(fragment);
            });
        
            const groups = [];
            lines.forEach((lineFragments) => {
                lineFragments.sort((a, b) => a.x - b.x);
                let current = [];
                let last = null;
                lineFragments.forEach((fragment) => {
                    if (!last || canMergeFragments(last, fragment)) {
                        current.push(fragment);
                    } else {
                        if (current.length) groups.push(current);
                        current = [fragment];
                    }
                    last = fragment;
                });
                if (current.length) groups.push(current);
            });
            return groups;
        }
        
        function canMergeFragments(left, right) {
            if (!left || !right) return false;
            if (left.fontSignature !== right.fontSignature) return false;
            if (left.align !== right.align) return false;
            const lineHeight = Math.max(1, Number(left.lineHeight || right.lineHeight) || 24);
            const gapLimit = Math.max(GAP_MIN, Math.ceil(lineHeight * GAP_RATIO));
            return right.x - (left.x + left.width) <= gapLimit;
        }
        
        function createEntryFromGroup(bitmap, state, group) {
            if (!bitmap || !state || !Array.isArray(group) || !group.length) return null;
            const bounds = group.reduce((acc, fragment) => ({
                x1: Math.min(acc.x1, fragment.x),
                y1: Math.min(acc.y1, fragment.y),
                x2: Math.max(acc.x2, fragment.x + Math.max(1, fragment.width)),
                y2: Math.max(acc.y2, fragment.y + Math.max(1, fragment.lineHeight)),
            }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
            if (!isValidRect(bounds)) return null;
        
            const rawText = group.map((fragment) => fragment.rawText).join('');
            const visibleText = sanitizeVisibleText(group.map((fragment) => fragment.visibleText).join(''));
            if (!visibleText) return null;
        
            const dominant = group.reduce((best, fragment) => {
                if (!best || Number(fragment.width || 0) > Number(best.width || 0)) return fragment;
                return best;
            }, null) || group[0];
            const maxWidth = Math.max(
                bounds.x2 - bounds.x1,
                ...group.map((fragment) => Number(fragment.maxWidth) || 0),
                1
            );
            const lineHeight = Math.max(...group.map((fragment) => Number(fragment.lineHeight) || 0), 1);
            const slotKey = [
                Math.round(group.length === 1 ? dominant.x : bounds.x1),
                Math.round(bounds.y1),
                Math.round(maxWidth),
                group.length === 1 ? dominant.align : 'left',
                dominant.fontSignature || '',
                dominant.ownerType || 'Bitmap',
                dominant.methodName || 'drawText',
            ].join(':');
            const codecState = safePrepareText(rawText);
            const translationSource = stringify(codecState.translationText !== undefined
                ? codecState.translationText
                : rawText);
        
            return {
                bitmap,
                state,
                key: slotKey,
                recordId: '',
                surfaceId: `bitmap:${state.id}`,
                slotKey,
                rawText,
                visibleText,
                translationSource,
                normalizedSource: translationSource.trim(),
                codecState,
                renderedText: '',
                surfaceRevision: state.revision,
                drawOrder: nextDrawOrder(state),
                drawParams: {
                    x: group.length === 1 ? dominant.x : bounds.x1,
                    y: bounds.y1,
                    maxWidth,
                    lineHeight,
                    align: group.length === 1 ? dominant.align : 'left',
                },
                bounds,
                drawState: dominant.drawState,
                backgroundPatches: group
                    .map((fragment) => fragment && fragment.backgroundPatch)
                    .filter((patch) => patch && patch.bitmap && patch.width > 0 && patch.height > 0),
                methodName: dominant.methodName || 'drawText',
                ownerType: dominant.ownerType || 'Bitmap',
                fragments: group,
                ownershipToken: dominant.ownershipToken || (group[0] && group[0].ownershipToken) || null,
                createdAt: Date.now(),
                lastSeenAt: Date.now(),
                stale: false,
            };
        }
        
        function registerBitmapEntry(state, entry, activationQueue) {
            const existing = state.entries.get(entry.key);
            if (existing && existing.visibleText === entry.visibleText) {
                refreshExistingEntry(existing, entry);
                const eligibility = describeEntryEligibility(existing);
                let observationStatus = getEntryObservationStatus(existing, 'detected');
                if (!eligibility.eligible) {
                    existing.skipReason = eligibility.reason || 'translation skipped';
                    observationStatus = 'skipped';
                }
                observeEntry(existing, eligibility.eligible ? observationStatus : 'skipped');
                recordDrawTrace('bitmap.entry.existing', existing.rawText, bitmapTraceDetails(existing.bitmap, existing.methodName, existing.rawText, existing.drawParams && existing.drawParams.x, existing.drawParams && existing.drawParams.y, {
                    recordId: existing.recordId || '',
                    slotKey: existing.slotKey || '',
                    status: getEntryStatus(existing, observationStatus),
                    reason: eligibility.eligible ? '' : (existing.skipReason || 'translation skipped'),
                    category: eligibility.category || '',
                    ownerType: existing.ownerType || '',
                    fragments: existing.fragments ? existing.fragments.length : 0,
                    bounds: cloneTraceRect(existing.bounds),
                }));
                if (eligibility.eligible && getEntryStatus(existing, 'detected') === 'detected' && isBitmapFallbackRedrawEnabled()) activationQueue.push(existing);
                return existing;
            }
            if (existing) retireEntry(existing, 'bitmap-entry-replaced', 'stale');
        
            entry.recordId = `bitmap:${state.id}:${(++scope.nextEntryId).toString(36)}`;
            state.entries.set(entry.key, entry);
            const eligibility = describeEntryEligibility(entry);
            let observationStatus = 'detected';
            if (!eligibility.eligible) {
                entry.skipReason = eligibility.reason || 'translation skipped';
                observationStatus = 'skipped';
            }
            observeEntry(entry, observationStatus);
            recordNativeTextForReplay(entry);
            logTextDetected(entry);
            recordDrawTrace(eligibility.eligible ? 'bitmap.entry.detected' : 'bitmap.entry.skipped', entry.rawText, bitmapTraceDetails(entry.bitmap, entry.methodName, entry.rawText, entry.drawParams && entry.drawParams.x, entry.drawParams && entry.drawParams.y, {
                recordId: entry.recordId || '',
                slotKey: entry.slotKey || '',
                status: getEntryStatus(entry, observationStatus),
                reason: eligibility.eligible ? '' : (entry.skipReason || 'translation skipped'),
                category: eligibility.category || '',
                ownerType: entry.ownerType || '',
                fragments: entry.fragments ? entry.fragments.length : 0,
                bounds: cloneTraceRect(entry.bounds),
            }));
        
            if (eligibility.eligible && entry.normalizedSource && isBitmapFallbackRedrawEnabled()) {
                activationQueue.push(entry);
            } else if (isEntryActive(entry) && (!eligibility.eligible || !entry.normalizedSource)) {
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason: entry.skipReason || (entry.normalizedSource ? 'translation skipped' : 'emptyNormalized'),
                    category: eligibility.category || '',
                });
            }
            return entry;
        }
        
        function refreshExistingEntry(existing, fresh) {
            existing.rawText = fresh.rawText;
            existing.visibleText = fresh.visibleText;
            existing.translationSource = fresh.translationSource;
            existing.normalizedSource = fresh.normalizedSource;
            existing.codecState = fresh.codecState;
            existing.surfaceRevision = fresh.surfaceRevision;
            existing.drawOrder = fresh.drawOrder;
            existing.drawParams = fresh.drawParams;
            existing.bounds = fresh.bounds;
            existing.drawState = fresh.drawState;
            existing.backgroundPatches = fresh.backgroundPatches;
            existing.methodName = fresh.methodName;
            existing.ownerType = fresh.ownerType;
            existing.fragments = fresh.fragments;
            existing.ownershipToken = fresh.ownershipToken;
            existing.lastSeenAt = Date.now();
            existing.stale = false;
        }

        return { scheduleFlush, scheduleFallbackFlush, flushQueuedBitmaps, flushAggregatedLines, takeFragmentsForFlush, finalizeFragmentOwnership, releaseFragmentOwnership, groupFragmentsIntoLines, canMergeFragments, createEntryFromGroup, registerBitmapEntry, refreshExistingEntry };
    }

    defineRuntimeModule('adapters.bitmapTextAggregation', { create: createController });
})();
