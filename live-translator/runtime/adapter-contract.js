// Adapter-facing TextOrchestrator contract.
//
// Adapters observe engine-specific facts and render adapter-specific output.
// This wrapper is the only boundary they should use for canonical lifecycle,
// translation requests, visibility, priority, intel, and subscription
// calls into runtime/text-orchestrator.js. Small support modules own the
// reusable normalization, record-state, and subscription-routing mechanics;
// this file documents and exposes the public adapter API.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.adapterContract',
        requires: {
            utils: 'runtime.adapterContract.utils',
            config: 'runtime.adapterContract.config',
            recordStateModule: 'runtime.adapterContract.recordState',
            subscriptionModule: 'runtime.adapterContract.subscriptions',
            renderTransaction: 'runtime.renderTransaction',
        },
        factory({ utils, config, recordStateModule, subscriptionModule, renderTransaction }) {
            const {
                defaultEligibility,
                describeCallbackError,
                getRecordId,
                isAdapterContractError,
                isRecordObject,
                nonEmptyString,
                normalizeAdapterRenderDecision,
                numberOrZero,
                safeIdPart,
                deniedOwnership,
            } = utils;
            const { createAdapterRecordStateStore } = recordStateModule;
            const { createAdapterSubscriptionRouter } = subscriptionModule;
            const {
                DEFAULT_REQUIRED_METHODS,
                BACKING_METHOD_BY_PUBLIC_METHOD,
                getSubscriptionRegistry,
            } = config;

            function createAdapterContract(options = {}) {
                const adapterId = nonEmptyString(options.adapterId, options.sourceAdapter, 'text');
                const defaultHook = nonEmptyString(options.defaultHook, adapterId);
                const gateway = options.orchestratorGateway || null;
                const logger = options.logger || {};
                const recordStateStore = createAdapterRecordStateStore({ adapterId });
                const {
                    canTouchRecord,
                    rememberRecord,
                    rememberRecordPatch,
                    rememberRecordEvent,
                    markRecordStatus,
                    getCapabilityRecordId,
                    forgetRecordId,
                    getRecordStatus,
                    isRecordActive,
                    isRecordObserved,
                    isRecordRequestActive,
                    isRecordTerminal,
                    markRetired,
                } = recordStateStore;
                const subscriptionRouter = createAdapterSubscriptionRouter({
                    adapterId,
                    gateway,
                    subscribe,
                    getRecordRegistry,
                    hasBackingMethod,
                    hasMethod,
                    callGateway,
                    callAdapterCallback,
                    canTouchRecord,
                    rememberRecordEvent,
                    describeCallbackError,
                });

                function hasBackingMethod(name) {
                    return !!(gateway && typeof gateway[name] === 'function');
                }

                function hasMethod(name) {
                    const backingName = BACKING_METHOD_BY_PUBLIC_METHOD[String(name || '')] || '';
                    return !!(backingName && hasBackingMethod(backingName));
                }

                function hasRequiredMethods(requiredMethods = DEFAULT_REQUIRED_METHODS) {
                    return (requiredMethods || DEFAULT_REQUIRED_METHODS).every(hasMethod);
                }

                function isAvailable() {
                    return hasRequiredMethods();
                }

                function observeRecord(record, payload = {}, eventOptions = {}, observeOptions = {}) {
                    if (!isRecordObject(record)) return null;
                    const idField = nonEmptyString(observeOptions.idField, 'recordId');
                    const currentId = getRecordId(record);
                    const nextPayload = Object.assign({}, payload || {});
                    if (!nextPayload.id && currentId) nextPayload.id = currentId;

                    const observed = callGateway('observeRecord', () => {
                        return gateway.observeRecord(
                            normalizePayload(nextPayload),
                            normalizeObserveEventOptions(eventOptions, observeOptions)
                        );
                    });
                    if (record && typeof record === 'object' && observed && observed.id) {
                        const nextId = String(observed.id);
                        reconcileRecordId(record, currentId, nextId, observed, observeOptions);
                        record[idField] = nextId;
                        rememberRecord(record, nextId, observed);
                        registerRecord(record, nextId, observed, observeOptions);
                    }
                    return observed;
                }

                function reconcileRecordId(record, previousId, nextId, observed, observeOptions = {}) {
                    if (!previousId || previousId === nextId) return;
                    forgetRecordId(previousId, record);
                    const registry = getRecordRegistry(observeOptions);
                    if (registry && typeof registry.delete === 'function') {
                        callAdapterCallback('observeRecord.registry.delete', () => {
                            registry.delete(previousId);
                        });
                    }
                }

                function registerRecord(record, nextId, observed, observeOptions = {}) {
                    const registry = getRecordRegistry(observeOptions);
                    if (!registry || typeof registry.set !== 'function' || !nextId) return;
                    const value = getRegistryValue(record, observed, nextId, observeOptions);
                    callAdapterCallback('observeRecord.registry.set', () => {
                        registry.set(nextId, value);
                    });
                }

                function getRecordRegistry(observeOptions = {}) {
                    const registry = observeOptions.registry
                        || observeOptions.recordRegistry
                        || observeOptions.records
                        || observeOptions.recordsById
                        || observeOptions.map;
                    return registry && typeof registry === 'object' ? registry : null;
                }

                function getRegistryValue(record, observed, nextId, observeOptions = {}) {
                    if (typeof observeOptions.registryValue === 'function') {
                        const value = callAdapterCallback('observeRecord.registryValue', () => {
                            return observeOptions.registryValue(record, observed, nextId);
                        });
                        return value === undefined || value === null ? record : value;
                    }
                    if (Object.prototype.hasOwnProperty.call(observeOptions, 'registryValue')) {
                        return observeOptions.registryValue;
                    }
                    return record;
                }

                function updateItem(target, patch = {}, eventOptions = {}) {
                    if (!canTouchRecord(target) || !hasMethod('updateItem')) return null;
                    const id = getCapabilityRecordId(target);
                    if (!id) return null;
                    const updated = callGateway('updateItem', () => {
                        return gateway.updateItem(id, patch || {}, normalizeEventOptions(eventOptions));
                    });
                    if (updated) rememberRecord(target, id, updated);
                    else rememberRecordPatch(target, id, patch);
                    return updated;
                }

                function requestItemTranslation(target, requestOptions = {}) {
                    if (!canTouchRecord(target)) return createOperationResult('missing-capability', target, 'request', 'record-capability-required');
                    if (!hasMethod('requestItemTranslation')) return createOperationResult('unavailable', target, 'request', 'requestItemTranslation unavailable');
                    const id = getCapabilityRecordId(target);
                    if (!id) return createOperationResult('missing-record-id', target, 'request', 'record-id-required');
                    const requestResult = callGateway('requestItemTranslation', () => {
                        return gateway.requestItemTranslation(id, Object.assign({
                            hook: defaultHook,
                        }, requestOptions || {}));
                    });
                    const result = normalizeOperationResult(requestResult, target, 'request', 'translation-request');
                    if (result.handled === true && !isRecordTerminal(target)) {
                        markRecordStatus(target, id, 'pending', { requestActive: true });
                    }
                    return result;
                }

                function cancelItemTranslation(target, reason = '', options = {}) {
                    if (!canTouchRecord(target)) return createOperationResult('missing-capability', target, 'cancel', 'record-capability-required');
                    if (!hasMethod('cancelItemTranslation')) return createOperationResult('unavailable', target, 'cancel', 'cancelItemTranslation unavailable');
                    const id = getCapabilityRecordId(target);
                    if (!id) return createOperationResult('missing-record-id', target, 'cancel', 'record-id-required');
                    const canceled = callGateway('cancelItemTranslation', () => {
                        return gateway.cancelItemTranslation(id, reason, options && typeof options === 'object' ? options : {});
                    });
                    return normalizeOperationResult(canceled, target, 'cancel', reason || 'translation canceled');
                }

                function setItemTranslationPriority(target, priority, reason = '') {
                    if (!canTouchRecord(target)) return createOperationResult('missing-capability', target, 'priority', 'record-capability-required');
                    if (!hasMethod('setItemTranslationPriority')) return createOperationResult('unavailable', target, 'priority', 'setItemTranslationPriority unavailable');
                    const id = getCapabilityRecordId(target);
                    if (!id) return createOperationResult('missing-record-id', target, 'priority', 'record-id-required');
                    const changed = callGateway('setItemTranslationPriority', () => {
                        return gateway.setItemTranslationPriority(id, priority, reason);
                    });
                    return normalizeOperationResult(changed, target, 'priority', reason || 'priority changed');
                }

                function setItemVisibility(target, visible, details = null) {
                    if (!canTouchRecord(target)) return createOperationResult('missing-capability', target, 'visibility', 'record-capability-required');
                    if (!hasMethod('setItemVisibility')) return createOperationResult('unavailable', target, 'visibility', 'setItemVisibility unavailable');
                    const id = getCapabilityRecordId(target);
                    if (!id) return createOperationResult('missing-record-id', target, 'visibility', 'record-id-required');
                    return normalizeOperationResult(callGateway('setItemVisibility', () => {
                        return gateway.setItemVisibility(id, visible === true, details || {});
                    }), target, 'visibility', visible === true ? 'item visible' : 'item hidden');
                }

                function backgroundItem(target, details = {}) {
                    if (!canTouchRecord(target)) return createOperationResult('missing-capability', target, 'background', 'record-capability-required');
                    if (!hasMethod('backgroundItem')) return createOperationResult('unavailable', target, 'background', 'backgroundItem unavailable');
                    const id = getCapabilityRecordId(target);
                    if (!id) return createOperationResult('missing-record-id', target, 'background', 'record-id-required');
                    return normalizeOperationResult(callGateway('backgroundItem', () => {
                        return gateway.backgroundItem(id, details || {});
                    }), target, 'background', details && details.reason ? details.reason : 'item backgrounded');
                }

                function retireItem(target, status = 'disappeared', eventOptions = {}) {
                    if (!canTouchRecord(target)) return createOperationResult('missing-capability', target, 'retire', 'record-capability-required');
                    if (!hasMethod('retireItem')) return createOperationResult('unavailable', target, 'retire', 'retireItem unavailable');
                    const id = getCapabilityRecordId(target);
                    if (!id) return createOperationResult('missing-record-id', target, 'retire', 'record-id-required');
                    const normalizedOptions = normalizeEventOptions(eventOptions);
                    const recordDetached = normalizedOptions.recordDetached === true;
                    const orchestratorOptions = Object.assign({}, normalizedOptions);
                    delete orchestratorOptions.recordDetached;
                    const retired = callGateway('retireItem', () => {
                        return gateway.retireItem(id, status || 'disappeared', orchestratorOptions);
                    });
                    const result = normalizeOperationResult(retired, target, 'retire', status || 'disappeared');
                    if (result.handled === true) markRetired(target, id, status, recordDetached);
                    return result;
                }

                function invalidateRenderTarget(target, details = {}) {
                    return applyRenderTargetLifecycle(target, 'invalidateRenderTarget', 'invalidate-render-target', details);
                }

                function retargetRenderTarget(target, details = {}) {
                    return applyRenderTargetLifecycle(target, 'retargetRenderTarget', 'retarget-render-target', details);
                }

                function applyRenderTargetLifecycle(target, methodName, operation, details = {}) {
                    if (!canTouchRecord(target)) return createOperationResult('missing-capability', target, operation, 'record-capability-required');
                    if (!hasMethod(methodName)) return createOperationResult('unavailable', target, operation, methodName + ' unavailable');
                    const id = getCapabilityRecordId(target);
                    if (!id) return createOperationResult('missing-record-id', target, operation, 'record-id-required');
                    const result = callGateway(methodName, () => {
                        return gateway[methodName](id, normalizeEventOptions(details));
                    });
                    return normalizeOperationResult(result, target, operation, details && details.reason ? details.reason : operation);
                }

                function recordDecision(target, type, message = '', details = null) {
                    if (!canTouchRecord(target) || !hasMethod('recordDecision')) return null;
                    const id = getCapabilityRecordId(target);
                    if (!id) return null;
                    return callGateway('recordDecision', () => {
                        return gateway.recordDecision(id, type, message, details);
                    });
                }

                function recordRenderCommitted(target, decision = {}) {
                    return recordRenderDecision(target, 'recordRenderCommitted', 'committed', decision);
                }

                function recordRenderDeferred(target, decision = {}) {
                    return recordRenderDecision(target, 'recordRenderDeferred', 'deferred', decision);
                }

                function recordRenderRejected(target, decision = {}) {
                    return recordRenderDecision(target, 'recordRenderRejected', 'rejected', decision);
                }

                function notifyRenderCommandReady(commandId, details = {}) {
                    if (!hasMethod('notifyRenderCommandReady')) {
                        return createRenderCommandReadyResult('unavailable', commandId, 'notifyRenderCommandReady unavailable', false, true);
                    }
                    const id = normalizeRenderCommandId(commandId);
                    if (!id) {
                        return createRenderCommandReadyResult('missing-command-id', commandId, 'render-command-id-required', false, true);
                    }
                    const readinessDetails = details && typeof details === 'object' ? details : { reason: nonEmptyString(details) };
                    const result = callGateway('notifyRenderCommandReady', () => {
                        return gateway.notifyRenderCommandReady(id, readinessDetails);
                    });
                    return normalizeRenderCommandReadyResult(result, id);
                }

                function getUnresolvedRenderCommandsForItem(target) {
                    if (!canTouchRecord(target) || !hasMethod('getUnresolvedRenderCommandsForItem')) return Object.freeze([]);
                    const id = getCapabilityRecordId(target);
                    if (!id) return Object.freeze([]);
                    const commands = callGateway('getUnresolvedRenderCommandsForItem', () => {
                        return gateway.getUnresolvedRenderCommandsForItem(id);
                    });
                    return normalizeRenderCommandList(commands);
                }

                function queueStoredRenderCommand(target, recovery = {}) {
                    if (!canTouchRecord(target) || !hasMethod('queueStoredRenderCommand')) return null;
                    const id = getCapabilityRecordId(target);
                    if (!id) return null;
                    const command = callGateway('queueStoredRenderCommand', () => {
                        return gateway.queueStoredRenderCommand(id, recovery && typeof recovery === 'object' ? recovery : {});
                    });
                    return normalizeRenderCommand(command);
                }

                function recordRenderDecision(target, methodName, status, decision = {}) {
                    if (!canTouchRecord(target) || !hasMethod(methodName)) return null;
                    const id = getCapabilityRecordId(target);
                    if (!id) return null;
                    const normalizedDecision = normalizeDirectRenderDecision(id, status, decision);
                    return callGateway(methodName, () => {
                        return gateway[methodName](id, normalizedDecision);
                    });
                }

                function normalizeDirectRenderDecision(id, status, decision = {}) {
                    const normalized = normalizeAdapterRenderDecision(status, decision);
                    normalized.renderCommit = createDirectRenderCommit(id, normalized);
                    return normalized;
                }

                function normalizeRenderCommandId(value) {
                    if (value && typeof value === 'object') return nonEmptyString(value.commandId);
                    return nonEmptyString(value);
                }

                function normalizeRenderCommandList(commands) {
                    if (!Array.isArray(commands) || !commands.length) return Object.freeze([]);
                    return Object.freeze(commands
                        .filter((command) => command && typeof command === 'object')
                        .map(normalizeRenderCommand)
                        .filter(Boolean));
                }

                function normalizeRenderCommand(command) {
                    if (!command || typeof command !== 'object') return null;
                    const commandId = normalizeRenderCommandId(command);
                    return Object.freeze(Object.assign({}, command, {
                        commandId,
                        itemId: nonEmptyString(command.itemId),
                        status: nonEmptyString(command.status),
                        strategy: nonEmptyString(command.strategy),
                        targetSurfaceId: nonEmptyString(command.targetSurfaceId),
                        generation: numberOrZero(command.generation),
                        renderIntent: nonEmptyString(command.renderIntent),
                        sourceKind: nonEmptyString(command.sourceKind),
                        retryCount: numberOrZero(command.retryCount),
                        dispatchCount: numberOrZero(command.dispatchCount),
                    }));
                }

                function normalizeRenderCommandReadyResult(result, commandId) {
                    if (!result || typeof result !== 'object') {
                        return createRenderCommandReadyResult('failed', commandId, 'render-command-ready-failed', false, true);
                    }
                    const status = nonEmptyString(result.status, result.changed === true ? 'ready' : 'failed');
                    return Object.freeze(Object.assign({}, result, {
                        status,
                        handled: result.handled === true || result.changed === true,
                        changed: result.changed === true,
                        terminal: result.terminal === true,
                        commandId: nonEmptyString(result.commandId, commandId),
                        reason: nonEmptyString(result.reason, status),
                    }));
                }

                function createRenderCommandReadyResult(status, commandId, reason, handled, terminal) {
                    return Object.freeze({
                        status,
                        handled: handled === true,
                        changed: false,
                        terminal: terminal === true,
                        commandId: normalizeRenderCommandId(commandId),
                        reason: nonEmptyString(reason, status),
                    });
                }

                function createDirectRenderCommit(id, decision = {}) {
                    const decisionDetails = decision.details && typeof decision.details === 'object'
                        ? decision.details
                        : {};
                    const detailsCommit = decisionDetails.renderCommit && typeof decisionDetails.renderCommit === 'object'
                        ? decisionDetails.renderCommit
                        : null;
                    const existingCommit = decision.renderCommit && typeof decision.renderCommit === 'object'
                        ? decision.renderCommit
                        : (isRenderCommitObject(decision) ? decision : detailsCommit);
                    const existingDetails = existingCommit
                        && existingCommit.details
                        && typeof existingCommit.details === 'object'
                        ? existingCommit.details
                        : {};
                    const details = Object.assign({}, existingDetails, decisionDetails);
                    if (details.renderCommit && typeof details.renderCommit === 'object') {
                        delete details.renderCommit;
                    }
                    const commitSource = existingCommit || {};
                    return renderTransaction.createRenderCommit(Object.assign({}, commitSource, {
                        status: decision.status,
                        phase: resolveRenderDecisionPhase(decision.status),
                        reason: nonEmptyString(decision.reason, decision.status),
                        route: nonEmptyString(commitSource.route, 'adapter-contract'),
                        adapterId: nonEmptyString(commitSource.adapterId, adapterId),
                        itemId: nonEmptyString(commitSource.itemId, id),
                        recordId: nonEmptyString(commitSource.recordId, id),
                        surfaceId: nonEmptyString(decision.surfaceId, details.surfaceId, commitSource.surfaceId),
                        slotKey: nonEmptyString(decision.slotKey, details.slotKey, commitSource.slotKey),
                        strategy: nonEmptyString(decision.strategy, commitSource.strategy),
                        commandId: nonEmptyString(decision.commandId, commitSource.commandId),
                        commandGeneration: numberOrZero(decision.commandGeneration) || numberOrZero(commitSource.commandGeneration),
                        generation: numberOrZero(decision.generation) || numberOrZero(decision.commandGeneration) || numberOrZero(commitSource.generation),
                        translationReceived: nonEmptyString(details.translationReceived, decision.translationReceived, commitSource.translationReceived),
                        translationDrawn: nonEmptyString(details.translationDrawn, decision.translationDrawn, commitSource.translationDrawn),
                        drawBoundary: decision.drawBoundary
                            || details.drawBoundary
                            || commitSource.drawBoundary
                            || null,
                        details,
                    }));
                }

                function isRenderCommitObject(value) {
                    if (!value || typeof value !== 'object') return false;
                    if (Number(value.schemaVersion) !== 1) return false;
                    return value.committed === true
                        || value.deferred === true
                        || value.rejected === true
                        || value.noop === true
                        || String(value.phase || '').indexOf('render-') === 0;
                }

                function resolveRenderDecisionPhase(status) {
                    const phases = renderTransaction.PHASES || {};
                    const normalized = String(status || '').trim();
                    if (normalized === 'committed') return phases.RENDER_COMMITTED || 'render-committed';
                    if (normalized === 'deferred') return phases.RENDER_DEFERRED || 'render-deferred';
                    if (normalized === 'noop') return phases.RENDER_NOOP || 'render-noop';
                    return phases.RENDER_REJECTED || 'render-rejected';
                }

                function describeTextEligibility(payload = {}) {
                    if (!hasMethod('describeTextEligibility')) {
                        return defaultEligibility(payload);
                    }
                    return callGateway('describeTextEligibility', () => {
                        return gateway.describeTextEligibility(normalizePayload(payload));
                    }) || defaultEligibility(payload);
                }

                function claimSurface(payload = {}) {
                    if (!hasMethod('claimSurface')) return deniedOwnership('unavailable');
                    return callGateway('claimSurface', () => {
                        return gateway.claimSurface(normalizeOwnershipPayload(payload));
                    }) || deniedOwnership('failed');
                }

                function releaseSurface(token, reason = '') {
                    const releaseReason = reason || 'surface released';
                    if (!token) return createOwnershipReleaseResult('missing-token', 'surface', releaseReason, token);
                    if (!hasMethod('releaseSurface')) return createOwnershipReleaseResult('unavailable', 'surface', releaseReason, token);
                    return normalizeOwnershipReleaseResult(callGateway('releaseSurface', () => {
                        return gateway.releaseSurface(token, releaseReason);
                    }), 'surface', releaseReason, token);
                }

                function claimText(payload = {}) {
                    if (!hasMethod('claimText')) return deniedOwnership('unavailable');
                    return callGateway('claimText', () => {
                        return gateway.claimText(normalizeOwnershipPayload(payload));
                    }) || deniedOwnership('failed');
                }

                function finalizeTextClaim(token, payload = {}) {
                    if (!token || !hasMethod('finalizeTextClaim')) return deniedOwnership('missing-token');
                    return callGateway('finalizeTextClaim', () => {
                        return gateway.finalizeTextClaim(token, normalizeOwnershipPayload(payload));
                    }) || deniedOwnership('failed');
                }

                function releaseTextClaim(token, reason = '') {
                    const releaseReason = reason || 'text claim released';
                    if (!token) return createOwnershipReleaseResult('missing-token', 'text', releaseReason, token);
                    if (!hasMethod('releaseTextClaim')) return createOwnershipReleaseResult('unavailable', 'text', releaseReason, token);
                    return normalizeOwnershipReleaseResult(callGateway('releaseTextClaim', () => {
                        return gateway.releaseTextClaim(token, releaseReason);
                    }), 'text', releaseReason, token);
                }

                function recordSurfaceDraw(payload = {}) {
                    if (!hasMethod('recordSurfaceDraw')) {
                        return { status: 'ignored', reason: 'unavailable' };
                    }
                    return callGateway('recordSurfaceDraw', () => {
                        return gateway.recordSurfaceDraw(normalizeOwnershipPayload(payload));
                    }) || { status: 'ignored', reason: 'failed' };
                }

                function subscribeSurfaceDraws(options = {}) {
                    if (!hasMethod('subscribeSurfaceDraws')) return false;
                    const source = options && typeof options === 'object' ? options : {};
                    const token = nonEmptyString(source.token, 'surface-draws');
                    return subscribeThrough('subscribeSurfaceDraws', (event) => {
                        if (!event || typeof event !== 'object') return;
                        if (event.adapterId && String(event.adapterId) !== adapterId) return;
                        if (typeof source.onDraw === 'function') {
                            return callAdapterCallback('subscribeSurfaceDraws.onDraw', () => {
                                return source.onDraw(event.payload || {}, event);
                            });
                        }
                        return undefined;
                    }, token);
                }

                function subscribeThrough(methodName, listener, token = '') {
                    if (typeof listener !== 'function' || !hasMethod(methodName)) return false;
                    const subscriptionToken = `${safeIdPart(adapterId)}:${safeIdPart(methodName)}:${safeIdPart(token || 'default')}`;
                    const registry = getSubscriptionRegistry(gateway);
                    if (registry && registry[subscriptionToken]) return true;
                    const backingName = BACKING_METHOD_BY_PUBLIC_METHOD[String(methodName || '')];
                    const unsubscribe = callGateway(methodName, () => {
                        return gateway[backingName](listener, {
                            adapterId,
                            token,
                        });
                    });
                    if (unsubscribe === null) return false;
                    if (registry) registry[subscriptionToken] = unsubscribe || true;
                    return true;
                }

                function subscribe(listener, token = '') {
                    if (typeof listener !== 'function' || !hasMethod('subscribe')) return false;
                    const subscriptionToken = `${safeIdPart(adapterId)}:${safeIdPart(token || 'default')}`;
                    const registry = getSubscriptionRegistry(gateway);
                    if (registry && registry[subscriptionToken]) return true;
                    const unsubscribe = callGateway('subscribe', () => gateway.subscribe(listener));
                    if (unsubscribe === null) return false;
                    if (registry) registry[subscriptionToken] = unsubscribe || true;
                    return true;
                }

                function subscribeRecords(options = {}) {
                    return subscriptionRouter.subscribeRecords(options);
                }

                function normalizePayload(payload) {
                    const next = Object.assign({}, payload || {});
                    if (next.sourceAdapter && String(next.sourceAdapter) !== adapterId) {
                        warn(`[AdapterContract:${adapterId}] Overriding mismatched sourceAdapter "${next.sourceAdapter}".`);
                    }
                    next.sourceAdapter = adapterId;
                    if (!next.hook) next.hook = defaultHook;
                    return next;
                }

                function normalizeOwnershipPayload(payload) {
                    const next = normalizePayload(payload);
                    // Keep raw render targets on the payload; these calls are not
                    // serialized into snapshots and the orchestrator needs object
                    // identity to arbitrate surface ownership.
                    return next;
                }

                function normalizeOperationResult(result, target, operation, reason) {
                    if (!result || typeof result !== 'object') {
                        return createOperationResult('failed', target, operation, reason);
                    }
                    const recordId = nonEmptyString(result.recordId, result.id, getCapabilityRecordId(target));
                    const status = nonEmptyString(result.status, result.handled === true ? 'handled' : 'failed');
                    const normalized = Object.assign({}, result, {
                        status,
                        handled: result.handled === true,
                        changed: result.changed === true,
                        terminal: result.terminal === true,
                        recordId,
                        id: nonEmptyString(result.id, recordId),
                        adapterId: nonEmptyString(result.adapterId, adapterId),
                        operation: nonEmptyString(result.operation, operation),
                        reason: nonEmptyString(result.reason, reason, status),
                    });
                    delete normalized.translationHandle;
                    return Object.freeze(normalized);
                }

                function createOperationResult(status, target, operation, reason) {
                    const recordId = nonEmptyString(getCapabilityRecordId(target));
                    return Object.freeze({
                        status,
                        handled: false,
                        changed: false,
                        terminal: true,
                        recordId,
                        id: recordId,
                        adapterId,
                        operation: nonEmptyString(operation),
                        reason: nonEmptyString(reason, status),
                    });
                }

                function normalizeOwnershipReleaseResult(result, expectedKind, reason, token) {
                    if (!result || typeof result !== 'object') {
                        return createOwnershipReleaseResult('failed', expectedKind, reason, token);
                    }
                    const status = nonEmptyString(result.status, result.released === true ? 'released' : 'failed');
                    const released = status === 'released' || result.released === true;
                    return Object.freeze(Object.assign({}, result, {
                        status,
                        released,
                        changed: result.changed === true || released,
                        handled: result.handled === true || released,
                        token: result.token || result.ownershipToken || token || null,
                        ownershipToken: result.ownershipToken || result.token || token || null,
                        claimId: nonEmptyString(result.claimId),
                        kind: nonEmptyString(result.kind, expectedKind),
                        adapterId: nonEmptyString(result.adapterId, adapterId),
                        surfaceId: nonEmptyString(result.surfaceId),
                        surfaceType: nonEmptyString(result.surfaceType),
                        mode: nonEmptyString(result.mode),
                        reason: nonEmptyString(result.reason, reason, status),
                        terminal: result.terminal !== false,
                    }));
                }

                function createOwnershipReleaseResult(status, expectedKind, reason, token) {
                    return Object.freeze({
                        status,
                        released: false,
                        changed: false,
                        handled: false,
                        terminal: true,
                        token: token || null,
                        ownershipToken: token || null,
                        claimId: '',
                        kind: nonEmptyString(expectedKind),
                        adapterId,
                        surfaceId: '',
                        surfaceType: '',
                        mode: '',
                        reason: nonEmptyString(reason, status),
                    });
                }

                function normalizeObserveEventOptions(eventOptions, observeOptions = {}) {
                    const next = normalizeEventOptions(eventOptions);
                    const token = observeOptions && (observeOptions.ownershipToken || observeOptions.ownership);
                    if (token) next.ownershipToken = token;
                    if (observeOptions && observeOptions.ownershipRequired === true) {
                        next.ownershipRequired = true;
                    }
                    return next;
                }

                function normalizeEventOptions(eventOptions) {
                    return eventOptions && typeof eventOptions === 'object' ? eventOptions : {};
                }

                function callGateway(operation, callback) {
                    try {
                        return callback();
                    } catch (error) {
                        throw createBoundaryError(operation, error);
                    }
                }

                function callAdapterCallback(operation, callback) {
                    try {
                        return callback();
                    } catch (error) {
                        throw createBoundaryError(operation, error);
                    }
                }

                function createBoundaryError(operation, cause) {
                    if (isAdapterContractError(cause)) return cause;
                    const error = new Error(`[AdapterContract:${adapterId}] ${operation} failed.`);
                    error.name = 'AdapterContractError';
                    error.code = 'LIVE_TRANSLATOR_ADAPTER_CONTRACT';
                    error.adapterId = adapterId;
                    error.operation = String(operation || '');
                    try { error.cause = cause; } catch (_) {}
                    return error;
                }

                function isContractError(error) {
                    return isAdapterContractError(error);
                }

                function warn(message, error) {
                    if (logger && typeof logger.warn === 'function') {
                        try {
                            if (error !== undefined) logger.warn(message, error);
                            else logger.warn(message);
                        } catch (_) {}
                    }
                }

                return Object.freeze({
                    adapterId,
                    defaultHook,
                    hasMethod,
                    hasRequiredMethods,
                    isAvailable,
                    observeRecord,
                    updateItem,
                    requestItemTranslation,
                    cancelItemTranslation,
                    setItemTranslationPriority,
                    setItemVisibility,
                    backgroundItem,
                    retireItem,
                    invalidateRenderTarget,
                    retargetRenderTarget,
                    recordDecision,
                    recordRenderCommitted,
                    recordRenderDeferred,
                    recordRenderRejected,
                    queueStoredRenderCommand,
                    notifyRenderCommandReady,
                    getUnresolvedRenderCommandsForItem,
                    describeTextEligibility,
                    claimSurface,
                    releaseSurface,
                    claimText,
                    finalizeTextClaim,
                    releaseTextClaim,
                    recordSurfaceDraw,
                    subscribeSurfaceDraws,
                    subscribe,
                    subscribeRecords,
                    isContractError,
                    getRecordStatus,
                    isRecordActive,
                    isRecordObserved,
                    isRecordRequestActive,
                    isRecordTerminal,
                });

            }

            return {
                createAdapterContract,
                isAdapterContractError,
            };
        },
    });
})();
