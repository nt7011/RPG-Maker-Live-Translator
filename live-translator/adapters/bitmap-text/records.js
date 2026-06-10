// Bitmap text adapter support: records.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/records.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/bitmap-text/records.js.');
    }
    const backdropProviderModule = requireRuntimeModule('runtime.backdropProvider');

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const renderTransaction = scope.renderTransaction;
        const { withBitmapReplay, collectReplayItems, replayBitmapItems, drawBitmapTextValue, calculateClearRect, redrawCopiedBitmapTargets, forgetCopiedBitmapTargets, markBitmapPixelsDirty } = scope.controllerFacades.replay;
        const { sanitizeVisibleText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, rectFromDimensions, isValidRect, updateItem, isAdapterContractFailure, warn, stringify, errorMessage } = scope.controllerFacades.textUtils;
        const backdropProvider = backdropProviderModule.create({ isValidRect });

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
                drawBoundary: createEntryDrawBoundary(entry),
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

        function createEntryDrawBoundary(entry) {
            const source = entry && entry.drawBoundary && typeof entry.drawBoundary === 'object'
                ? entry.drawBoundary
                : null;
            if (!source) return null;
            return renderTransaction.createSourceDrawBoundary(Object.assign({}, source, {
                itemId: entry.recordId || source.itemId || '',
                recordId: entry.recordId || source.recordId || '',
                surfaceId: entry.surfaceId || source.surfaceId || '',
                slotKey: entry.slotKey || source.slotKey || '',
                generation: Number(entry.surfaceRevision) || Number(source.generation) || 0,
            }));
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
                if (!requested || requested.handled !== true) {
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
        
        function applyRenderCommand(entry, command = {}, route = {}) {
            const translated = stringify(command.text);
            const restored = restoreTranslatedEntryText(entry, translated);
            const visible = sanitizeVisibleText(restored);
            if (!visible || visible === entry.visibleText) {
                const reason = visible ? 'translated-text-matched-original' : 'restored-text-empty';
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason,
                    translationReceived: translated,
                });
                return createBitmapRenderCommit('rejected', reason, entry, command, route, {
                    translationReceived: translated,
                    translationDrawn: '',
                    restoredText: restored || '',
                });
            }
        
            let redrawDiagnostics = null;
            if (!isCopiedTargetDetachedEntry(entry)) {
                redrawDiagnostics = redrawBitmapEntry(entry, restored, command);
            }
            entry.renderedText = restored;
            const copiedTargetRedraws = redrawCopiedBitmapTargets(entry, restored);
            if (isCopiedTargetDetachedEntry(entry) && copiedTargetRedraws <= 0) {
                const reason = 'copied-bitmap-target-missing';
                retireEntry(entry, reason, 'stale');
                return createBitmapRenderCommit('rejected', reason, entry, command, route, {
                    translationReceived: translated,
                    translationDrawn: '',
                    copiedTargetRedraws,
                });
            }
            updateItem(entry, {
                status: 'completed',
                translation: restored,
                translationDrawn: restored,
            }, 'item.rendered', {
                translationReceived: translated,
                translationDrawn: restored,
                sourceHint: command.metadata && command.metadata.sourceHint,
                copiedTargetRedraws,
                detachedCopiedTarget: isCopiedTargetDetachedEntry(entry) === true,
            });
            return createBitmapRenderCommit('accepted', 'bitmap-redraw-applied', entry, command, route, {
                translationReceived: translated,
                translationDrawn: restored,
                sourceHint: command.metadata && command.metadata.sourceHint,
                ownerType: entry.ownerType,
                methodName: entry.methodName,
                copiedTargetRedraws,
                detachedCopiedTarget: isCopiedTargetDetachedEntry(entry) === true,
                redraw: redrawDiagnostics,
            });
        }

        function createBitmapRenderCommit(status, reason, entry, command = {}, route = {}, details = {}) {
            const payload = {
                status,
                mode: 'bitmap-redraw',
                reason: reason || status || 'bitmap-redraw',
                adapterId: ADAPTER_ID,
                itemId: entry && entry.recordId || '',
                recordId: entry && entry.recordId || '',
                surfaceId: entry && entry.surfaceId || '',
                slotKey: entry && entry.slotKey || '',
                strategy: route && route.strategy || command.strategy || RENDER_STRATEGY,
                commandId: command && command.id || '',
                commandGeneration: Number(route && route.commandGeneration) || Number(command && command.generation) || 0,
                generation: entry && entry.surfaceRevision || 0,
                translationReceived: details.translationReceived || '',
                translationDrawn: details.translationDrawn || '',
                drawBoundary: entry && entry.renderLifecycle && entry.renderLifecycle.sourceDraw
                    ? entry.renderLifecycle.sourceDraw
                    : (command && command.metadata && command.metadata.drawBoundary || null),
                details,
            };
            return renderTransaction && typeof renderTransaction.createRenderCommit === 'function'
                ? renderTransaction.createRenderCommit(payload)
                : payload;
        }
        
        function getRenderGeneration(entry) {
            return entry && entry.surfaceRevision ? Number(entry.surfaceRevision) : 0;
        }
        
        function isRenderTargetCurrent(entry) {
            if (!entry || entry.stale || !entry.bitmap || !entry.state) return false;
            if (isCopiedTargetDetachedEntry(entry)) return hasCopiedBitmapTargets(entry);
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
            const backdropPlan = backdropProvider.chooseRestorePlan({
                entry,
                targetBitmap: bitmap,
                replayBefore,
                replayRect: clearBounds,
                clearArea: clearRect,
                patches: entry.backgroundPatches,
                allowPatches: true,
            });
            const redrawDiagnostics = createBitmapRedrawDiagnostics(clearRect, clearBounds, replayBefore, replayAfter, backdropPlan, entry);
            scope.bitmapServices.withActiveRedrawEntry(bitmap, entry, () => {
                withBitmapReplay(bitmap, () => {
                    if (clearRect && clearRect.width > 0 && clearRect.height > 0 && typeof bitmap.clearRect === 'function') {
                        bitmap.clearRect(clearRect.x, clearRect.y, clearRect.width, clearRect.height);
                    }
                    if (backdropPlan.patches && backdropPlan.patches.apply === true) {
                        backdropProvider.restorePatches(bitmap, entry.backgroundPatches, { targetRect: clearBounds });
                    }
                    if (backdropPlan.replay && backdropPlan.replay.applyAfterClear === true) {
                        replayBitmapItems(bitmap, replayBefore);
                    }
                    drawBitmapTextValue(bitmap, entry, restored, { scaleTranslated: true });
                    replayBitmapItems(bitmap, replayAfter);
                }, 'bitmap-fallback-redraw');
            });
            // Bitmap fallback redraws mutate the source canvas directly under a
            // replay guard; make the renderer upload those pixels this frame.
            markBitmapPixelsDirty(bitmap);
            if (scope.telemetry && typeof scope.telemetry.logDraw === 'function') {
                scope.telemetry.logDraw('bitmap_redraw', restored, entry.drawParams.x, entry.drawParams.y, {
                    ownerType: entry.ownerType,
                    method: entry.methodName,
                    sourceHint: command && command.metadata && command.metadata.sourceHint,
                });
            }
            return redrawDiagnostics;
        }

        function createBitmapRedrawDiagnostics(clearRect, clearBounds, replayBefore, replayAfter, backdropPlan, entry) {
            const patches = Array.isArray(entry && entry.backgroundPatches) ? entry.backgroundPatches : [];
            const trustedPatches = patches.filter((patch) => patch && patch.trusted === true).length;
            const backdrop = summarizeBitmapBackdropPlan(backdropPlan) || {};
            return {
                clearRect: formatArea(clearRect),
                clearBounds: formatRect(clearBounds),
                replayBefore: Array.isArray(replayBefore) ? replayBefore.length : 0,
                replayAfter: Array.isArray(replayAfter) ? replayAfter.length : 0,
                patchCount: patches.length,
                trustedPatchCount: trustedPatches,
                untrustedPatchCount: patches.length - trustedPatches,
                backdropKind: backdrop.kind,
                backdropSource: backdrop.source,
                backdropClearMode: backdrop.clearMode,
                backdropSteps: backdrop.steps,
                backdropPatchesApply: backdrop.patchesApply,
                backdropPatchCount: backdrop.patchCount,
                backdropPatchesCoverTarget: backdrop.patchesCoverTarget,
                backdropReplayApplyAfterClear: backdrop.replayApplyAfterClear,
                backdropReplayItemCount: backdrop.replayItemCount,
                backdropReplayCoversTarget: backdrop.replayCoversTarget,
            };
        }

        function summarizeBitmapBackdropPlan(plan) {
            if (!plan || typeof plan !== 'object') return null;
            return {
                kind: plan.kind || '',
                source: plan.source || '',
                clearMode: plan.clearMode || '',
                steps: Array.isArray(plan.steps) ? plan.steps.join(',') : '',
                patchesApply: plan.patches && plan.patches.apply === true,
                patchCount: plan.patches ? Number(plan.patches.count) || 0 : 0,
                patchesCoverTarget: plan.patches && plan.patches.coversTarget === true,
                replayApplyAfterClear: plan.replay && plan.replay.applyAfterClear === true,
                replayItemCount: plan.replay ? Number(plan.replay.itemCount) || 0 : 0,
                replayCoversTarget: plan.replay && plan.replay.coversTarget === true,
            };
        }

        function formatArea(area) {
            if (!area) return '';
            return [
                `x=${formatNumber(area.x)}`,
                `y=${formatNumber(area.y)}`,
                `w=${formatNumber(area.width)}`,
                `h=${formatNumber(area.height)}`,
            ].join(',');
        }

        function formatRect(rect) {
            if (!rect) return '';
            return [
                `x1=${formatNumber(rect.x1)}`,
                `y1=${formatNumber(rect.y1)}`,
                `x2=${formatNumber(rect.x2)}`,
                `y2=${formatNumber(rect.y2)}`,
            ].join(',');
        }

        function formatNumber(value) {
            const number = Number(value);
            return Number.isFinite(number) ? String(Math.round(number * 1000) / 1000) : '';
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
            forgetCopiedBitmapTargets(entry);
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

        function detachEntryForCopiedTargets(entry, reason = 'bitmap-source-invalidated') {
            if (!entry || entry.stale || !hasCopiedBitmapTargets(entry)) return false;
            entry._trSourceDetachedForCopiedTargets = true;
            entry._trCopiedSourceInvalidationReason = reason || 'bitmap-source-invalidated';
            if (entry.state && entry.state.entries && entry.state.entries.get(entry.key) === entry) {
                entry.state.entries.delete(entry.key);
            }
            if (entry.ownershipToken && scope.adapterContract && typeof scope.adapterContract.releaseTextClaim === 'function') {
                scope.adapterContract.releaseTextClaim(entry.ownershipToken, reason || 'bitmap-source-invalidated');
                entry.ownershipToken = null;
            }
            if (entry.recordId && isEntryActive(entry) && scope.adapterContract && typeof scope.adapterContract.backgroundItem === 'function') {
                scope.adapterContract.backgroundItem(entry, {
                    reason: reason || 'bitmap-source-invalidated',
                    screenState: 'copied-bitmap-target',
                    copiedTargets: countCopiedBitmapTargets(entry),
                    sourceSurfaceId: entry.surfaceId || '',
                    ownerType: entry.ownerType || '',
                    methodName: entry.methodName || '',
                });
            }
            return true;
        }

        function isCopiedTargetDetachedEntry(entry) {
            return !!(entry && entry._trSourceDetachedForCopiedTargets === true);
        }

        function hasCopiedBitmapTargets(entry) {
            return !!(entry
                && Array.isArray(entry._trCopiedBitmapTargets)
                && entry._trCopiedBitmapTargets.some((target) => target && target.targetBitmap));
        }

        function countCopiedBitmapTargets(entry) {
            if (!entry || !Array.isArray(entry._trCopiedBitmapTargets)) return 0;
            return entry._trCopiedBitmapTargets.filter((target) => target && target.targetBitmap).length;
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

        return { observeEntry, requestEntryTranslation, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, restoreTranslatedEntryText, redrawBitmapEntry, markEntryTerminal, isEntryActive, getEntryStatus, isEntryRequestActive, isEntryCompleted, getEntryObservationStatus, retireEntry, detachEntryForCopiedTargets, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason };
    }

    defineRuntimeModule('adapters.bitmapTextRecords', { create: createController });
})();
