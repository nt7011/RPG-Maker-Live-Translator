// Bitmap text adapter support: records.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/records.js.');
    }

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { install, installOrchestratorSubscription, registerBitmapCapabilities, exposeAdapterApi, installBitmapDrawWrappers, installBitmapDrawWrapper, scheduleBitmapDrawWrapperRetry, handleBitmapDrawText, shouldBypassBitmapDraw, describeBitmapDrawBypassReason, recordBitmapSurfaceDraw, createFragment, scheduleFlush, scheduleFallbackFlush, flushQueuedBitmaps, flushAggregatedLines, takeFragmentsForFlush, finalizeFragmentOwnership, releaseFragmentOwnership, groupFragmentsIntoLines, canMergeFragments, createEntryFromGroup, registerBitmapEntry, refreshExistingEntry, installBitmapMutationHooks, installBitmapMutationHook, shouldBypassMutation, getMutationBypassReason, hasMutationObserverInterest, shouldHandleBitmapMutation, hasBitmapStateMutationInterest, hasWindowEntryMutationInterest, hasAnyWindowEntries, recordNativeMutationAttribution, classifyBitmapMutationSurface, bucketBitmapPixels, bucketBitmapDimensions, bucketDimension, sanitizePerfLabel, describeMutation, handleBitmapMutation, flushFragmentsBeforeMutation, invalidateEntriesInRect, discardFragmentsInRect, invalidateWindowEntries, wasWindowEntryObservedInCurrentRefresh, isWindowRefreshMutation, installFrameFlushHooks, installFrameFlushHook, hasHookInChain, installSmallTextMarkers, installSmallTextMarker, installNormalCharacterMarker, isSmallTextDrawActive, isSmallTextScratchBitmap, ensureBitmapState, getBitmapState, nextDrawOrder, recordBitmapRenderOp, recordNativeTextForReplay, discardRenderOpsInRect, withBitmapReplay, collectReplayItems, replayBitmapItems, replayBitmapRenderOp, replayBitmapEntry, drawBitmapTextValue, drawBitmapTextArgs, calculateClearRect, estimateTextWidth, computeFontSignature, sanitizeVisibleText, sanitizePerChar, isStandaloneGlyphText, sanitizeBitmapDrawText, safePrepareText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, roundTraceNumber, getBitmapFallbackMode, isBitmapFallbackCaptureEnabled, isBitmapFallbackRedrawEnabled, readBitmapOwner, hasDedicatedOwnerHook, windowEntryBelongsToBitmap, deriveWindowEntryRect, deriveEntryRect, fragmentRect, rectFromDimensions, isValidRect, rectHasArea, rectOrNull, rectanglesOverlap, normalizeCanvasTextAlign, describeOwnerType, shouldKeepWindowEntryTranslation, getWindowOwnerScreenState, retireWindowEntry, logTextDetected, updateItem, safeCall, isAdapterContractFailure, warn, stringify, finiteNumber, positiveNumber, pruneArray, errorMessage } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'registerBitmapCapabilities', 'exposeAdapterApi', 'installBitmapDrawWrappers', 'installBitmapDrawWrapper', 'scheduleBitmapDrawWrapperRetry', 'handleBitmapDrawText', 'shouldBypassBitmapDraw', 'describeBitmapDrawBypassReason', 'recordBitmapSurfaceDraw', 'createFragment', 'scheduleFlush', 'scheduleFallbackFlush', 'flushQueuedBitmaps', 'flushAggregatedLines', 'takeFragmentsForFlush', 'finalizeFragmentOwnership', 'releaseFragmentOwnership', 'groupFragmentsIntoLines', 'canMergeFragments', 'createEntryFromGroup', 'registerBitmapEntry', 'refreshExistingEntry', 'installBitmapMutationHooks', 'installBitmapMutationHook', 'shouldBypassMutation', 'getMutationBypassReason', 'hasMutationObserverInterest', 'shouldHandleBitmapMutation', 'hasBitmapStateMutationInterest', 'hasWindowEntryMutationInterest', 'hasAnyWindowEntries', 'recordNativeMutationAttribution', 'classifyBitmapMutationSurface', 'bucketBitmapPixels', 'bucketBitmapDimensions', 'bucketDimension', 'sanitizePerfLabel', 'describeMutation', 'handleBitmapMutation', 'flushFragmentsBeforeMutation', 'invalidateEntriesInRect', 'discardFragmentsInRect', 'invalidateWindowEntries', 'wasWindowEntryObservedInCurrentRefresh', 'isWindowRefreshMutation', 'installFrameFlushHooks', 'installFrameFlushHook', 'hasHookInChain', 'installSmallTextMarkers', 'installSmallTextMarker', 'installNormalCharacterMarker', 'isSmallTextDrawActive', 'isSmallTextScratchBitmap', 'ensureBitmapState', 'getBitmapState', 'nextDrawOrder', 'recordBitmapRenderOp', 'recordNativeTextForReplay', 'discardRenderOpsInRect', 'withBitmapReplay', 'collectReplayItems', 'replayBitmapItems', 'replayBitmapRenderOp', 'replayBitmapEntry', 'drawBitmapTextValue', 'drawBitmapTextArgs', 'calculateClearRect', 'estimateTextWidth', 'computeFontSignature', 'sanitizeVisibleText', 'sanitizePerChar', 'isStandaloneGlyphText', 'sanitizeBitmapDrawText', 'safePrepareText', 'describeEntryEligibility', 'recordDrawTrace', 'bitmapTraceDetails', 'cloneTraceRect', 'roundTraceNumber', 'getBitmapFallbackMode', 'isBitmapFallbackCaptureEnabled', 'isBitmapFallbackRedrawEnabled', 'readBitmapOwner', 'hasDedicatedOwnerHook', 'windowEntryBelongsToBitmap', 'deriveWindowEntryRect', 'deriveEntryRect', 'fragmentRect', 'rectFromDimensions', 'isValidRect', 'rectHasArea', 'rectOrNull', 'rectanglesOverlap', 'normalizeCanvasTextAlign', 'describeOwnerType', 'shouldKeepWindowEntryTranslation', 'getWindowOwnerScreenState', 'retireWindowEntry', 'logTextDetected', 'updateItem', 'safeCall', 'isAdapterContractFailure', 'warn', 'stringify', 'finiteNumber', 'positiveNumber', 'pruneArray', 'errorMessage'].map((name) => [name, callScope(name)]));

        function observeEntry(entry, status) {
            if (!entry || !entry.recordId) return null;
            const payload = {
                id: entry.recordId,
                sourceAdapter: ADAPTER_ID,
                hook: ADAPTER_ID,
                hookLabel: ADAPTER_LABEL,
                surfaceId: entry.surfaceId,
                slotKey: entry.slotKey,
                surfaceType: SURFACE_TYPE,
                status: status || getEntryObservationStatus(entry, 'detected'),
                rawText: entry.rawText,
                visibleText: entry.visibleText,
                original: entry.visibleText,
                translationSource: entry.translationSource,
                normalizedSource: entry.normalizedSource,
                priority: BITMAP_PRIORITY,
                generation: entry.surfaceRevision,
                renderStrategy: RENDER_STRATEGY,
                visible: true,
                screenState: 'visible',
                bounds: entry.bounds,
                metadata: {
                    ownerType: entry.ownerType,
                    methodName: entry.methodName,
                    fragments: entry.fragments ? entry.fragments.length : 0,
                    drawOrder: entry.drawOrder || 0,
                },
            };
            const observed = scope.adapterContract.observeRecord(entry, payload, { eventType: `item.${payload.status}` }, {
                registry: scope.entriesByItemId,
                ownership: entry.ownershipToken,
                ownershipRequired: true,
            });
            return observed;
        }
        
        function requestEntryTranslation(entry) {
            if (!entry || entry.stale || !entry.recordId || !entry.normalizedSource) return false;
            if (isEntryRequestActive(entry) || isEntryCompleted(entry)) return false;
            if (!isEntryActive(entry)) {
                observeEntry(entry, getEntryObservationStatus(entry, 'detected'));
                if (!isEntryActive(entry)) return false;
            }
            if (getEntryStatus(entry) === 'skipped') return false;
            const eligibility = describeEntryEligibility(entry);
            if (!eligibility.eligible) {
                entry.skipReason = eligibility.reason || 'translation skipped';
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason: entry.skipReason,
                    category: eligibility.category,
                });
                return false;
            }
            recordDrawTrace('bitmap.entry.requested', entry.rawText, bitmapTraceDetails(entry.bitmap, entry.methodName, entry.rawText, entry.drawParams && entry.drawParams.x, entry.drawParams && entry.drawParams.y, {
                recordId: entry.recordId || '',
                slotKey: entry.slotKey || '',
                status: 'pending',
                ownerType: entry.ownerType || '',
                fragments: entry.fragments ? entry.fragments.length : 0,
                bounds: cloneTraceRect(entry.bounds),
            }));
            try {
                const requested = scope.adapterContract.requestItemTranslation(entry, {
                    hook: ADAPTER_ID,
                    priority: BITMAP_PRIORITY,
                    renderStrategy: RENDER_STRATEGY,
                    metadata: {
                        ownerType: entry.ownerType,
                        methodName: entry.methodName,
                    },
                });
                if (!requested) {
                    updateItem(entry, { status: 'failed' }, 'item.failed', { reason: 'translation request failed' });
                    return false;
                }
                scope.perf.count('bitmapText.translation.requested');
                return true;
            } catch (error) {
                if (isAdapterContractFailure(error)) throw error;
                updateItem(entry, { status: 'failed' }, 'item.failed', { reason: errorMessage(error) });
                warn('[BitmapText] Failed to request translation.', error);
                return false;
            }
        }
        
        function applyRenderCommand(entry, command = {}) {
            const translated = stringify(command.text);
            const restored = restoreTranslatedEntryText(entry, translated);
            const visible = sanitizeVisibleText(restored);
            if (!visible || visible === entry.visibleText) {
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason: visible ? 'translated text matched original' : 'restored text empty',
                    translationReceived: translated,
                });
                return true;
            }
        
            redrawBitmapEntry(entry, restored, command);
            entry.renderedText = restored;
            updateItem(entry, {
                status: 'completed',
                translation: restored,
                translationDrawn: restored,
            }, 'item.rendered', {
                translationReceived: translated,
                translationDrawn: restored,
                sourceHint: command.metadata && command.metadata.sourceHint,
            });
            return true;
        }
        
        function getRenderGeneration(entry) {
            return entry && entry.surfaceRevision ? Number(entry.surfaceRevision) : 0;
        }
        
        function isRenderTargetCurrent(entry) {
            if (!entry || entry.stale || !entry.bitmap || !entry.state) return false;
            if (entry.state.entries.get(entry.key) !== entry) return false;
            return true;
        }
        
        function handleRenderRejected(entry, decision = {}) {
            if (!entry || entry.stale || shouldKeepRecordAfterRenderRejection(decision)) return;
            const reason = normalizeRenderRejectionReason(decision);
            retireEntry(
                entry,
                `bitmap-render-${reason}`,
                isRenderApplicationFailure(reason) ? 'failed' : 'stale'
            );
        }
        
        function restoreTranslatedEntryText(entry, translated) {
            try {
                const restored = scope.restoreText(translated, entry.codecState || {});
                return typeof restored === 'string' ? restored : entry.rawText;
            } catch (error) {
                warn('[BitmapText] Failed to restore control-code placeholders.', error);
                return translated;
            }
        }
        
        function redrawBitmapEntry(entry, restored, command) {
            const bitmap = entry.bitmap;
            const state = entry.state;
            const clearRect = calculateClearRect(bitmap, entry);
            const clearBounds = clearRect
                ? rectFromDimensions(clearRect.x, clearRect.y, clearRect.width, clearRect.height)
                : null;
            const order = entry.drawOrder || 0;
            const replayBefore = clearBounds ? collectReplayItems(state, clearBounds, entry, (value) => value < order) : [];
            const replayAfter = clearBounds ? collectReplayItems(state, clearBounds, entry, (value) => value > order) : [];
            const previousActiveEntry = bitmap._trActiveRedrawEntry || null;
            bitmap._trActiveRedrawEntry = entry;
            try {
                withBitmapReplay(bitmap, () => {
                    if (clearRect && clearRect.width > 0 && clearRect.height > 0 && typeof bitmap.clearRect === 'function') {
                        bitmap.clearRect(clearRect.x, clearRect.y, clearRect.width, clearRect.height);
                    }
                    replayBitmapItems(bitmap, replayBefore);
                    drawBitmapTextValue(bitmap, entry, restored, { scaleTranslated: true });
                    replayBitmapItems(bitmap, replayAfter);
                }, 'bitmap-fallback-redraw');
                if (scope.telemetry && typeof scope.telemetry.logDraw === 'function') {
                    scope.telemetry.logDraw('bitmap_redraw', restored, entry.drawParams.x, entry.drawParams.y, {
                        ownerType: entry.ownerType,
                        method: entry.methodName,
                        sourceHint: command && command.metadata && command.metadata.sourceHint,
                    });
                }
            } finally {
                bitmap._trActiveRedrawEntry = previousActiveEntry;
            }
        }
        
        function markEntryTerminal(entry, status, reason) {
            if (!entry || entry.stale) return;
        }
        
        function isEntryActive(entry) {
            return !!(entry
                && entry.recordId
                && scope.adapterContract
                && typeof scope.adapterContract.isRecordActive === 'function'
                && scope.adapterContract.isRecordActive(entry));
        }
        
        function getEntryStatus(entry, fallback = '') {
            if (!entry || !scope.adapterContract || typeof scope.adapterContract.getRecordStatus !== 'function') return fallback || '';
            return scope.adapterContract.getRecordStatus(entry, fallback || '');
        }
        
        function isEntryRequestActive(entry) {
            return !!(entry
                && scope.adapterContract
                && typeof scope.adapterContract.isRecordRequestActive === 'function'
                && scope.adapterContract.isRecordRequestActive(entry));
        }
        
        function isEntryCompleted(entry) {
            return getEntryStatus(entry) === 'completed';
        }
        
        function getEntryObservationStatus(entry, fallback = 'detected') {
            if (!entry) return fallback;
            const current = getEntryStatus(entry, '');
            if (current === 'pending' || current === 'translating') return current;
            if (entry.renderedText) return 'completed';
            if (entry.skipReason) return 'skipped';
            if (current === 'detected' || current === 'completed' || current === 'skipped' || current === 'failed') return current;
            return fallback;
        }
        
        function retireEntry(entry, reason = 'bitmap-entry-stale', status = 'stale') {
            if (!entry || entry.stale) return false;
            entry.stale = true;
            if (entry.recordId && isEntryActive(entry)) {
                scope.adapterContract.cancelItemTranslation(entry, reason, { abortJob: true });
                scope.adapterContract.retireItem(entry, status || 'stale', {
                    eventType: status === 'stale' ? 'item.stale' : `item.${status}`,
                    message: reason,
                    details: { ownerType: entry.ownerType, methodName: entry.methodName },
                });
            }
            if (entry.recordId) scope.entriesByItemId.delete(entry.recordId);
            if (entry.ownershipToken && scope.adapterContract && typeof scope.adapterContract.releaseTextClaim === 'function') {
                scope.adapterContract.releaseTextClaim(entry.ownershipToken, reason || 'bitmap-entry-stale');
                entry.ownershipToken = null;
            }
            if (entry.state && entry.state.entries.get(entry.key) === entry) entry.state.entries.delete(entry.key);
            return true;
        }
        
        function shouldKeepRecordAfterRenderRejection(decision = {}) {
            const reason = normalizeRenderRejectionReason(decision);
            if (reason !== 'generation-mismatch') return false;
            const targetGeneration = Number(decision.details && decision.details.targetGeneration);
            const commandGeneration = Number(decision.commandGeneration);
            return Number.isFinite(targetGeneration)
                && Number.isFinite(commandGeneration)
                && targetGeneration > commandGeneration;
        }
        
        function isRenderApplicationFailure(reason) {
            return reason === 'adapter-render-error' || reason === 'adapter-declined';
        }
        
        function normalizeRenderRejectionReason(decision = {}) {
            const reason = String(decision && decision.reason || '').trim();
            return reason || 'render-rejected';
        }

        return { observeEntry, requestEntryTranslation, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, restoreTranslatedEntryText, redrawBitmapEntry, markEntryTerminal, isEntryActive, getEntryStatus, isEntryRequestActive, isEntryCompleted, getEntryObservationStatus, retireEntry, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason };
    }

    defineRuntimeModule('adapters.bitmapTextRecords', { create: createController });
})();
