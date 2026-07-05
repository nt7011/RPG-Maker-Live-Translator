// Text orchestrator support: items.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.items',
        factory() {
            function createController(scope = {}) {
                const { textLifecycle, renderTransaction, applyPatch, normalizeId, normalizeStatus, firstString, mergeDetails, pickSerializableObject, pruneMap, archivedLimit, activeItems, detachedItems, detachedItemsBySlotSignature, archivedItems, slotIndex } = scope;
                const { resolveLifecyclePolicy, applyLifecyclePolicy } = scope.controllerFacades.policy;
                const { buildSlotSignature } = scope.controllerFacades.identity;
                const { rememberSourceTranslation, isSkippedItem } = scope.controllerFacades.sourceCache;
                const { schedulePublish } = scope.controllerFacades.intel;

                /**
                 * Insert or update the canonical mutable item record.
                 *
                 * This is the only place that decides whether an item lives in active,
                 * detached-item, or archived maps. Public APIs return clones, but
                 * internal maps keep mutable records so promise handlers can validate
                 * handles/tokens cheaply.
                 */
                function upsertItem(id, source) {
                    const now = Date.now();
                    let item = getItemById(id);
                    if (!item) {
                        item = createEmptyItem(id);
                        item.firstSeenAt = now;
                    }
                    applyPatch(item, source);
                    item.status = normalizeStatus(item.status, 'detected');
                    if (isSkippedItem(item)) {
                        const handle = item.translationHandle;
                        if (handle && typeof handle.cancel === 'function') {
                            try { handle.cancel('translation skipped', { abortJob: true }); } catch (_) {}
                        }
                        clearItemTranslationRequest(item);
                        item.priority = null;
                    }
                    item.updatedAt = now;
                    item.lastSeenAt = now;
                    item.sequence = ++scope.sequence;
                    textLifecycle.applyTransition(item, item.status);
                    if (item.active) {
                        item.deactivatedAt = null;
                        moveToActive(item);
                    } else {
                        item.deactivatedAt = item.deactivatedAt || now;
                        placeInactiveItem(item);
                    }
                    rememberSourceTranslation(item);
                    schedulePublish();
                    return item;
                }

                /**
                 * Create the full item shape with stable default fields.
                 *
                 * Keeping every field present makes snapshots and tests predictable,
                 * and avoids adapters needing to check for missing keys.
                 */
                function createEmptyItem(id) {
                    return {
                        id,
                        surfaceId: '',
                        identitySurfaceId: '',
                        slotKey: '',
                        sourceAdapter: '',
                        hook: '',
                        surfaceType: '',
                        status: 'detected',
                        rawText: '',
                        visibleText: '',
                        original: '',
                        translationSource: '',
                        normalizedSource: '',
                        translation: '',
                        translationReceived: '',
                        translationDrawn: '',
                        sourceHint: '',
                        bounds: null,
                        priority: null,
                        generation: 0,
                        renderStrategy: '',
                        renderCycle: null,
                        renderTarget: null,
                        visible: true,
                        screenState: 'visible',
                        backgrounded: false,
                        policy: {},
                        metadata: {},
                        active: true,
                        firstSeenAt: Date.now(),
                        lastSeenAt: Date.now(),
                        updatedAt: Date.now(),
                        deactivatedAt: null,
                        sequence: 0,
                        translationHandle: null,
                        translationToken: null,
                        translationRenderStrategy: '',
                        translationStream: false,
                        translationHasDelta: false,
                    };
                }

                function clearItemTranslationRequest(item) {
                    if (!item) return;
                    item.translationHandle = null;
                    item.translationToken = null;
                    item.translationStream = false;
                    item.translationHasDelta = false;
                }

                function getItemById(id) {
                    const key = normalizeId(id);
                    if (!key) return null;
                    return activeItems.get(key)
                        || detachedItems.get(key)
                        || archivedItems.get(key)
                        || null;
                }

                function hasItem(id) {
                    return !!getItemById(id);
                }

                function hasLiveTranslationRequest(item) {
                    return !!(item && item.translationHandle && item.translationToken);
                }

                function moveToActive(item) {
                    if (!item || !item.id) return null;
                    removeDetachedItemIndex(item.id);
                    detachedItems.delete(item.id);
                    archivedItems.delete(item.id);
                    activeItems.set(item.id, item);
                    return item;
                }

                function placeInactiveItem(item) {
                    if (!item || !item.id) return null;
                    if (hasLiveTranslationRequest(item)) return moveToDetachedItem(item);
                    return moveToArchive(item);
                }

                function moveToDetachedItem(item) {
                    if (!item || !item.id) return null;
                    activeItems.delete(item.id);
                    archivedItems.delete(item.id);
                    detachedItems.set(item.id, item);
                    indexDetachedItem(item);
                    return item;
                }

                function moveToArchive(item) {
                    if (!item || !item.id) return null;
                    activeItems.delete(item.id);
                    detachedItems.delete(item.id);
                    removeDetachedItemIndex(item.id);
                    archivedItems.set(item.id, item);
                    pruneMap(archivedItems, archivedLimit);
                    return item;
                }

                function indexDetachedItem(item) {
                    if (!item || !item.id) return;
                    removeDetachedItemIndex(item.id);
                    const slotSignature = buildSlotSignature(item);
                    if (!slotSignature) return;
                    let ids = detachedItemsBySlotSignature.get(slotSignature);
                    if (!ids) {
                        ids = new Set();
                        detachedItemsBySlotSignature.set(slotSignature, ids);
                    }
                    ids.add(item.id);
                }

                function removeDetachedItemIndex(id) {
                    const key = normalizeId(id);
                    if (!key) return;
                    Array.from(detachedItemsBySlotSignature.entries()).forEach(([slotSignature, ids]) => {
                        if (!ids || typeof ids.delete !== 'function') return;
                        ids.delete(key);
                        if (ids.size === 0) detachedItemsBySlotSignature.delete(slotSignature);
                    });
                }

                /**
                 * Remove every slot signature currently pointing at an item.
                 *
                 * Called when an item is retired so future observations in the same
                 * slot do not accidentally refresh an inactive item.
                 */
                function releaseSlotIndexesForItem(id) {
                    Array.from(slotIndex.entries()).forEach(([slotSignature, itemId]) => {
                        if (itemId === id) slotIndex.delete(slotSignature);
                    });
                }

                function claimSlotSignature(slotSignature, id) {
                    if (!slotSignature || !id) return;
                    Array.from(slotIndex.entries()).forEach(([existingSignature, itemId]) => {
                        if (itemId === id && existingSignature !== slotSignature) {
                            slotIndex.delete(existingSignature);
                        }
                    });
                    slotIndex.set(slotSignature, id);
                }

                function resetItemForSourceReplacement(item) {
                    if (!item) return false;
                    applyLifecyclePolicy(item, resolveLifecyclePolicy(item, 'stale', {
                        message: 'same slot source changed',
                        policy: { kind: 'source-replaced' },
                        cancelOptions: { abortJob: true },
                    }));
                    clearItemTranslationRequest(item);
                    item.translation = '';
                    item.translationReceived = '';
                    item.translationDrawn = '';
                    item.sourceHint = '';
                    item.renderStrategy = '';
                    item.translationRenderStrategy = '';
                    item.renderCycle = null;
                    item.priority = null;
                    item.metadata = {};
                    return true;
                }

                function setItemRenderCycleFromObservation(item, source = {}) {
                    if (!item || !item.id || !source || typeof source.drawBoundary !== 'object' || !source.drawBoundary) return null;
                    const boundary = renderTransaction.createSourceDrawBoundary(source.drawBoundary);
                    const patch = createRenderCyclePatch(item, source, {
                        drawBoundary: boundary,
                        reason: firstString(source.reason, source.message, 'item-observed'),
                        details: {
                            status: source.status || item.status || '',
                            observed: true,
                        },
                    });
                    const targetPhase = boundary.sourceCommitted === true || boundary.phase === renderTransaction.PHASES.SOURCE_DRAW_COMMITTED
                        ? renderTransaction.PHASES.SOURCE_DRAW_COMMITTED
                        : renderTransaction.PHASES.SOURCE_DRAW_OBSERVED;
                    const existing = item.renderCycle && typeof item.renderCycle === 'object'
                        ? renderTransaction.createRenderCycle(item.renderCycle)
                        : null;
                    const sameBoundary = !!(existing
                        && existing.drawBoundary
                        && existing.drawBoundary.id
                        && boundary.id
                        && existing.drawBoundary.id === boundary.id
                        && existing.terminal !== true);
                    let transition = null;
                    if (!sameBoundary) {
                        transition = targetPhase === renderTransaction.PHASES.SOURCE_DRAW_OBSERVED
                            ? renderTransaction.observeRenderCycleSourceDraw(patch)
                            : renderTransaction.transitionRenderCycle(null, targetPhase, patch);
                    } else if (existing.phase === renderTransaction.PHASES.SOURCE_DRAW_OBSERVED
                        && targetPhase === renderTransaction.PHASES.SOURCE_DRAW_COMMITTED) {
                        transition = renderTransaction.commitRenderCycleSourceDraw(existing, patch);
                    } else if (existing.phase === targetPhase) {
                        item.renderCycle = renderTransaction.createRenderCycle(Object.assign({}, existing, patch, {
                            phase: existing.phase,
                            details: mergeDetails(existing.details, patch.details),
                        }));
                        return {
                            ok: true,
                            accepted: true,
                            valid: true,
                            status: item.renderCycle.status,
                            phase: item.renderCycle.phase,
                            previousPhase: existing.phase,
                            state: item.renderCycle,
                            event: null,
                            commit: null,
                        };
                    } else {
                        transition = renderTransaction.transitionRenderCycle(existing, targetPhase, patch);
                    }
                    if (transition && transition.ok && transition.state) {
                        item.renderCycle = transition.state;
                    }
                    return transition;
                }

                function markItemRenderCycleTranslationKnown(item, translation, details = {}) {
                    if (!item || !item.id) return null;
                    const patch = createRenderCyclePatch(item, details, {
                        translationReceived: firstString(translation, details && details.translationReceived, item.translationReceived, item.translation),
                        reason: firstString(details && details.reason, 'translation-known'),
                        details: mergeDetails(details, {
                            sourceHint: item.sourceHint || '',
                        }),
                    });
                    return advanceItemRenderCycleToPhase(item, renderTransaction.PHASES.TRANSLATION_KNOWN, patch);
                }

                function markItemRenderCycleAdmitted(item, command = {}) {
                    if (!item || !item.id) return null;
                    const patch = createRenderCyclePatch(item, command, {
                        commandId: firstString(command && command.commandId),
                        commandGeneration: Number(command && command.generation) || Number(item.generation) || 0,
                        renderCommand: pickSerializableObject(command || {}),
                        translationReceived: firstString(command && command.text, item.translationReceived, item.translation),
                        reason: firstString(command && command.reason, 'render-admitted'),
                        details: mergeDetails(command && command.metadata, {
                            strategy: firstString(command && command.strategy, item.renderStrategy),
                        }),
                    });
                    const prepared = ensureRenderCycleReadyForRender(item, patch);
                    if (!prepared || !prepared.ok) return prepared;
                    return advanceItemRenderCycleToPhase(item, renderTransaction.PHASES.RENDER_ADMITTED, patch);
                }

                function markItemRenderCycleDecision(item, status, decision = {}, command = null) {
                    if (!item || !item.id) return null;
                    const normalizedStatus = renderTransaction.normalizeCommitStatus(status);
                    const decisionSource = decision && typeof decision === 'object' ? decision : {};
                    const commandSource = command && typeof command === 'object' ? command : {};
                    const patch = createRenderCyclePatch(item, decisionSource, {
                        commandId: firstString(decisionSource.commandId, commandSource.commandId),
                        commandGeneration: Number(decisionSource.commandGeneration) || Number(commandSource.generation) || Number(item.generation) || 0,
                        renderCommand: pickSerializableObject(commandSource),
                        renderCommit: decisionSource.renderCommit && typeof decisionSource.renderCommit === 'object'
                            ? decisionSource.renderCommit
                            : null,
                        translationReceived: firstString(
                            decisionSource.translationReceived,
                            decisionSource.details && decisionSource.details.translationReceived,
                            commandSource.text,
                            item.translationReceived,
                            item.translation
                        ),
                        translationDrawn: firstString(
                            decisionSource.translationDrawn,
                            decisionSource.details && decisionSource.details.translationDrawn,
                            item.translationDrawn
                        ),
                        reason: firstString(decisionSource.reason, normalizedStatus),
                        details: mergeDetails(decisionSource.details, {
                            strategy: firstString(decisionSource.strategy, commandSource.strategy, item.renderStrategy),
                        }),
                    });
                    const prepared = ensureRenderCycleReadyForRender(item, patch);
                    if (!prepared || !prepared.ok) return prepared;
                    const targetPhase = normalizedStatus === 'committed' || normalizedStatus === 'accepted'
                        ? renderTransaction.PHASES.RENDER_COMMITTED
                        : (normalizedStatus === 'deferred'
                            ? renderTransaction.PHASES.RENDER_DEFERRED
                            : (normalizedStatus === 'noop'
                                ? renderTransaction.PHASES.RENDER_NOOP
                                : renderTransaction.PHASES.RENDER_REJECTED));
                    return advanceItemRenderCycleToPhase(item, targetPhase, patch);
                }

                function ensureRenderCycleReadyForRender(item, patch) {
                    const current = item && item.renderCycle && typeof item.renderCycle === 'object'
                        ? renderTransaction.createRenderCycle(item.renderCycle)
                        : null;
                    if (!current) {
                        return advanceItemRenderCycleToPhase(item, renderTransaction.PHASES.TRANSLATION_KNOWN, patch);
                    }
                    if (current.phase === renderTransaction.PHASES.SOURCE_DRAW_COMMITTED) {
                        return advanceItemRenderCycleToPhase(item, renderTransaction.PHASES.TRANSLATION_KNOWN, patch);
                    }
                    if (current.phase === renderTransaction.PHASES.TRANSLATION_KNOWN
                        || current.phase === renderTransaction.PHASES.RENDER_ADMITTED
                        || current.phase === renderTransaction.PHASES.RENDER_DEFERRED) {
                        return {
                            ok: true,
                            accepted: true,
                            valid: true,
                            status: current.status,
                            phase: current.phase,
                            previousPhase: current.phase,
                            state: current,
                            event: null,
                            commit: null,
                        };
                    }
                    return renderTransaction.transitionRenderCycle(current, renderTransaction.PHASES.TRANSLATION_KNOWN, patch);
                }

                function advanceItemRenderCycleToPhase(item, phase, patch = {}) {
                    if (!item || !item.id) return null;
                    const current = item.renderCycle && typeof item.renderCycle === 'object'
                        ? renderTransaction.createRenderCycle(item.renderCycle)
                        : null;
                    if (current && current.phase === phase) {
                        item.renderCycle = renderTransaction.createRenderCycle(Object.assign({}, current, patch, {
                            phase,
                            details: mergeDetails(current.details, patch && patch.details),
                        }));
                        return {
                            ok: true,
                            accepted: true,
                            valid: true,
                            status: item.renderCycle.status,
                            phase: item.renderCycle.phase,
                            previousPhase: current.phase,
                            state: item.renderCycle,
                            event: null,
                            commit: null,
                        };
                    }
                    const transition = renderTransaction.transitionRenderCycle(current, phase, patch);
                    if (transition && transition.ok && transition.state) {
                        item.renderCycle = transition.state;
                    }
                    return transition;
                }

                function createRenderCyclePatch(item, source = {}, extra = {}) {
                    const sourceObject = source && typeof source === 'object' ? source : {};
                    const extraObject = extra && typeof extra === 'object' ? extra : {};
                    const boundary = sourceObject.drawBoundary && typeof sourceObject.drawBoundary === 'object'
                        ? sourceObject.drawBoundary
                        : (item && item.drawBoundary && typeof item.drawBoundary === 'object' ? item.drawBoundary : null);
                    return Object.assign({
                        adapterId: firstString(sourceObject.adapterId, sourceObject.sourceAdapter, item && (item.sourceAdapter || item.hook)),
                        itemId: item && item.id ? item.id : firstString(sourceObject.itemId, sourceObject.recordId),
                        recordId: item && item.id ? item.id : firstString(sourceObject.recordId, sourceObject.itemId),
                        surfaceId: firstString(sourceObject.surfaceId, item && item.surfaceId),
                        identitySurfaceId: firstString(sourceObject.identitySurfaceId, item && item.identitySurfaceId),
                        slotKey: firstString(sourceObject.slotKey, item && item.slotKey),
                        generation: Number(sourceObject.generation) || Number(item && item.generation) || 0,
                        entryGeneration: Number(sourceObject.entryGeneration) || Number(sourceObject.generation) || Number(item && item.generation) || 0,
                        strategy: firstString(sourceObject.strategy, sourceObject.renderStrategy, item && item.renderStrategy),
                        renderStrategy: firstString(sourceObject.renderStrategy, sourceObject.strategy, item && item.renderStrategy),
                        commandId: firstString(sourceObject.commandId),
                        commandGeneration: Number(sourceObject.commandGeneration) || Number(sourceObject.generation) || Number(item && item.generation) || 0,
                        translationReceived: firstString(sourceObject.translationReceived, item && item.translationReceived, item && item.translation),
                        translationDrawn: firstString(sourceObject.translationDrawn, item && item.translationDrawn),
                        drawBoundary: boundary,
                        details: mergeDetails(sourceObject.details),
                    }, extraObject);
                }

                return {
                    upsertItem,
                    createEmptyItem,
                    clearItemTranslationRequest,
                    setItemRenderCycleFromObservation,
                    markItemRenderCycleTranslationKnown,
                    markItemRenderCycleAdmitted,
                    markItemRenderCycleDecision,
                    getItemById,
                    hasItem,
                    hasLiveTranslationRequest,
                    moveToActive,
                    placeInactiveItem,
                    moveToDetachedItem,
                    moveToArchive,
                    indexDetachedItem,
                    removeDetachedItemIndex,
                    releaseSlotIndexesForItem,
                    claimSlotSignature,
                    resetItemForSourceReplacement,
                };
            }

            return { create: createController };
        },
    });
})();
