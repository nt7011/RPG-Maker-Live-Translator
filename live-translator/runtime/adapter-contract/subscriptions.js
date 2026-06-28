// Subscription routing for adapter contracts.
//
// Adapters subscribe to orchestrator events through record-backed callbacks.
// This module validates render commands, routes skipped/failed events to the
// owning record, and ACKs/NACKs render commands back through the gateway.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.adapterContract.subscriptions',
        requires: {
            utils: 'runtime.adapterContract.utils',
            renderTransaction: 'runtime.renderTransaction',
        },
        factory({ utils, renderTransaction }) {
            const {
                copyPlainObject,
                freezePlainObject,
                isRecordObject,
                nonEmptyString,
                normalizeRenderDecisionStatus,
                numberOrZero,
            } = utils;

            function createAdapterSubscriptionRouter(options = {}) {
                const adapterId = nonEmptyString(options.adapterId, 'adapter');
                const gateway = options.gateway || null;
                const subscribe = typeof options.subscribe === 'function' ? options.subscribe : () => false;
                const getRecordRegistry = typeof options.getRecordRegistry === 'function' ? options.getRecordRegistry : () => null;
                const hasBackingMethod = typeof options.hasBackingMethod === 'function' ? options.hasBackingMethod : () => false;
                const hasMethod = typeof options.hasMethod === 'function' ? options.hasMethod : () => false;
                const callGateway = typeof options.callGateway === 'function' ? options.callGateway : (_operation, callback) => callback();
                const callAdapterCallback = typeof options.callAdapterCallback === 'function'
                    ? options.callAdapterCallback
                    : (_operation, callback) => callback();
                const canTouchRecord = typeof options.canTouchRecord === 'function' ? options.canTouchRecord : () => false;
                const rememberRecordEvent = typeof options.rememberRecordEvent === 'function' ? options.rememberRecordEvent : () => null;
                const describeCallbackError = typeof options.describeCallbackError === 'function'
                    ? options.describeCallbackError
                    : () => ({});

                function subscribeRecords(subscriptionOptions = {}) {
                    if (!hasMethod('subscribeRecords')) return false;
                    const source = subscriptionOptions && typeof subscriptionOptions === 'object' ? subscriptionOptions : {};
                    const token = nonEmptyString(source.token, source.subscriptionToken, source.renderStrategy, 'records');
                    const records = getRecordRegistry(source);
                    const renderStrategy = nonEmptyString(source.renderStrategy, source.strategy);

                    return subscribe((event) => {
                        if (!event || typeof event !== 'object') return;
                        const eventType = String(event.type || '');
                        if (eventType === 'item.render_queued') {
                            const command = createRenderCommand(event.details);
                            if (renderStrategy && String(command.strategy || '') !== renderStrategy) return;
                            dispatchRenderCommand(source, event, command, records);
                            return;
                        }

                        if (source.adapterEventsOnly !== false
                            && event.adapterId
                            && String(event.adapterId) !== adapterId) {
                            return;
                        }
                        if (eventType === 'item.skipped') {
                            dispatchRecordEvent(source, source.onSkipped, event, null, records, 'skipped');
                        } else if (eventType === 'item.failed'
                            || eventType === 'item.translation_noop'
                            || eventType === 'item.translation_noop_detached') {
                            dispatchRecordEvent(source, source.onFailed, event, null, records, 'failed');
                        } else if (typeof source.onEvent === 'function') {
                            dispatchRecordEvent(source, source.onEvent, event, null, records, eventType || 'event');
                        }
                    }, token);
                }

                function dispatchRenderCommand(source, event, command, records) {
                    if (typeof source.onRenderQueued !== 'function') return false;
                    const recordId = getEventRecordId(event, command);
                    const route = createRenderRoute(event, command, recordId, adapterId);
                    const target = resolveEventRecord(source, recordId, event, command, records);
                    if (!target) {
                        dispatchRenderRejected(
                            source,
                            null,
                            createRenderDecision('rejected', 'missing-adapter-record', command, route),
                            route
                        );
                        dispatchMissingRecord(source, route, event, command, 'render_queued');
                        return false;
                    }
                    const lifecycleRecord = resolveLifecycleRecord(source, target, command, route);

                    const rejected = validateRenderCommand(source, target, lifecycleRecord, command, route);
                    if (rejected) {
                        if (rejected.status === 'rebased') return true;
                        dispatchRenderRejected(source, target, rejected, route);
                        return false;
                    }

                    rememberRecordEvent(lifecycleRecord, recordId, event);
                    let adapterOutcome = false;
                    try {
                        adapterOutcome = callAdapterCallback('subscribeRecords.render_queued', () => {
                            return source.onRenderQueued(target, command, route);
                        });
                    } catch (error) {
                        dispatchRenderRejected(
                            source,
                            target,
                            createRenderDecision(
                                'rejected',
                                'adapter-render-error',
                                command,
                                route,
                                describeCallbackError(error)
                            ),
                            route
                        );
                        return false;
                    }
                    const callbackDecision = normalizeRenderCallbackDecision(adapterOutcome, command, route);
                    if (callbackDecision.status === 'deferred') {
                        dispatchRenderDeferred(callbackDecision, route);
                        return true;
                    }
                    if (callbackDecision.status !== 'committed') {
                        dispatchRenderRejected(source, target, callbackDecision, route);
                        return false;
                    }

                    dispatchRenderCommitted(callbackDecision, route);
                    if (typeof source.onRenderCommitted === 'function') {
                        callAdapterCallback('subscribeRecords.render_committed', () => {
                            source.onRenderCommitted(target, callbackDecision, route);
                        });
                    }
                    return true;
                }

                function validateRenderCommand(source, target, lifecycleRecord, command, route) {
                    if (!command.itemId || !command.strategy) {
                        return createRenderDecision('rejected', 'invalid-command', command, route);
                    }
                    if (!isRecordObject(lifecycleRecord)) {
                        return createRenderDecision('rejected', 'missing-lifecycle-record', command, route);
                    }
                    if (!canTouchRecord(lifecycleRecord)) {
                        return createRenderDecision('rejected', 'inactive-record', command, route);
                    }
                    const generationDecision = validateRenderGeneration(source, target, command, route);
                    if (generationDecision) return generationDecision;
                    if (typeof source.isRenderTargetCurrent !== 'function') {
                        return createRenderDecision('rejected', 'missing-current-validator', command, route);
                    }
                    const current = callAdapterCallback('subscribeRecords.isRenderTargetCurrent', () => {
                        return source.isRenderTargetCurrent(target, command, route);
                    });
                    if (current === true) return null;
                    const details = current && typeof current === 'object' ? current : {};
                    const reason = nonEmptyString(details.reason, details.status, 'target-not-current');
                    return createRenderDecision('rejected', reason, command, route, details);
                }

                function validateRenderGeneration(source, record, command, route) {
                    const commandGeneration = Number(command.generation);
                    if (!Number.isFinite(commandGeneration) || commandGeneration <= 0) {
                        return createRenderDecision('rejected', 'missing-generation', command, route, {
                            commandGeneration: numberOrZero(command && command.generation),
                        });
                    }
                    const targetGeneration = resolveRenderGeneration(source, record, command, route);
                    if (!Number.isFinite(targetGeneration)) {
                        return createRenderDecision('rejected', 'missing-generation', command, route, {
                            commandGeneration,
                        });
                    }
                    if (targetGeneration === commandGeneration) return null;
                    if (commandGeneration < targetGeneration) {
                        const rebased = resolveRenderCommandRebase(source, record, command, route, {
                            commandGeneration,
                            targetGeneration,
                        });
                        if (rebased && rebased.status === 'rebased') return rebased;
                        if (rebased && rebased.status === 'rejected') return rebased;
                    }
                    if (targetGeneration !== commandGeneration) {
                        return createRenderDecision('rejected', 'generation-mismatch', command, route, {
                            commandGeneration,
                            targetGeneration,
                        });
                    }
                    return null;
                }

                function resolveRenderCommandRebase(source, record, command, route, proofContext) {
                    if (!hasBackingMethod('rebaseRenderCommand')) return null;
                    if (typeof source.resolveRenderCommandRebase !== 'function') return null;
                    const context = createRenderCommandRebaseProofContext(command, route, proofContext);
                    let proof = null;
                    try {
                        proof = callAdapterCallback('subscribeRecords.resolveRenderCommandRebase', () => {
                            return source.resolveRenderCommandRebase(record, command, route, context);
                        });
                    } catch (error) {
                        return createRenderDecision(
                            'rejected',
                            'adapter-rebase-error',
                            command,
                            route,
                            describeCallbackError(error)
                        );
                    }
                    if (isDeniedRenderCommandRebase(proof)) {
                        return createRenderDecision('rejected', 'generation-mismatch', command, route, {
                            commandGeneration: context.commandGeneration,
                            targetGeneration: context.targetGeneration,
                            rebaseDeniedReason: nonEmptyString(proof && proof.reason, 'render-command-rebase-denied'),
                            rebaseDeniedDetails: copyPlainObject(proof && proof.details, {}),
                        });
                    }
                    const request = normalizeRenderCommandRebaseRequest(proof, command, route, context);
                    if (!request) return null;
                    const itemId = nonEmptyString(route && route.itemId, route && route.recordId, command && command.itemId);
                    if (!itemId) return null;
                    const result = callGateway('rebaseRenderCommand', () => {
                        return gateway.rebaseRenderCommand(itemId, request);
                    });
                    if (!result || result.rebased !== true) return null;
                    const normalized = freezePlainObject({
                        status: 'rebased',
                        reason: nonEmptyString(result.reason, request.reason, 'render-command-rebased'),
                        recordId: itemId,
                        itemId,
                        commandId: request.commandId,
                        replacementCommandId: nonEmptyString(result.replacementCommandId),
                        details: freezePlainObject(copyPlainObject(result, {})),
                    });
                    if (typeof source.onRenderRebased === 'function') {
                        callAdapterCallback('subscribeRecords.render_rebased', () => {
                            source.onRenderRebased(record, normalized, route);
                        });
                    }
                    return normalized;
                }

                function resolveLifecycleRecord(source, target, command, route) {
                    if (typeof source.getLifecycleRecord === 'function') {
                        return callAdapterCallback('subscribeRecords.getLifecycleRecord', () => {
                            return source.getLifecycleRecord(target, command, route);
                        }) || null;
                    }
                    return target;
                }

                function resolveRenderGeneration(source, record, command, route) {
                    if (typeof source.getRenderGeneration !== 'function') return NaN;
                    const value = callAdapterCallback('subscribeRecords.getRenderGeneration', () => {
                        return source.getRenderGeneration(record, command, route);
                    });
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? numeric : NaN;
                }

                function dispatchRenderRejected(source, record, decision, route) {
                    notifyRenderDecisionGateway('recordRenderRejected', decision, route);
                    if (typeof source.onRenderRejected !== 'function') return false;
                    callAdapterCallback('subscribeRecords.render_rejected', () => {
                        source.onRenderRejected(record, decision, route);
                    });
                    return true;
                }

                function dispatchRenderCommitted(decision, route) {
                    notifyRenderDecisionGateway('recordRenderCommitted', decision, route);
                    return true;
                }

                function dispatchRenderDeferred(decision, route) {
                    notifyRenderDecisionGateway('recordRenderDeferred', decision, route);
                    return true;
                }

                function notifyRenderDecisionGateway(methodName, decision, route) {
                    if (!hasBackingMethod(methodName)) return null;
                    const itemId = nonEmptyString(
                        decision && decision.itemId,
                        route && route.itemId,
                        route && route.recordId
                    );
                    if (!itemId) return null;
                    return callGateway(methodName, () => gateway[methodName](itemId, decision || {}));
                }

                function dispatchRecordEvent(source, handler, event, command, records, operation) {
                    if (typeof handler !== 'function') return false;
                    const recordId = getEventRecordId(event, command);
                    const record = resolveEventRecord(source, recordId, event, command, records);
                    const route = {
                        recordId,
                        itemId: recordId,
                        eventType: event && event.type ? String(event.type) : '',
                        adapterId: event && event.adapterId ? String(event.adapterId) : '',
                        event,
                        command,
                    };
                    if (!record) {
                        return dispatchMissingRecord(source, route, event, command, operation);
                    }
                    if (!canTouchRecord(record)) return false;
                    rememberRecordEvent(record, recordId, event);
                    callAdapterCallback(`subscribeRecords.${operation}`, () => {
                        if (command) handler(record, command, event, route);
                        else handler(record, event, route);
                    });
                    return true;
                }

                function dispatchMissingRecord(source, route, event, command, operation) {
                    if (typeof source.onMissingRecord !== 'function') return false;
                    callAdapterCallback(`subscribeRecords.${operation}.missing`, () => {
                        source.onMissingRecord(route, event, command);
                    });
                    return true;
                }

                function resolveEventRecord(source, recordId, event, command, records) {
                    if (typeof source.resolveRecord === 'function') {
                        return callAdapterCallback('subscribeRecords.resolveRecord', () => {
                            return source.resolveRecord(recordId, event, command);
                        }) || null;
                    }
                    if (!records || typeof records.get !== 'function' || !recordId) return null;
                    return records.get(recordId) || null;
                }

                return Object.freeze({
                    subscribeRecords,
                });
            }

            function getEventRecordId(event, command) {
                return nonEmptyString(
                    command && command.itemId,
                    event && event.itemId,
                    event && event.id
                );
            }

            function createRenderCommand(details) {
                const source = details && typeof details === 'object' ? details : {};
                const commandId = nonEmptyString(source.commandId, source.id);
                return freezePlainObject({
                    commandId,
                    // Legacy alias: adapter callbacks still receive command.id.
                    // Remove after adapter render paths use commandId directly.
                    id: commandId,
                    itemId: nonEmptyString(source.itemId),
                    surfaceId: nonEmptyString(source.surfaceId),
                    targetSurfaceId: nonEmptyString(source.targetSurfaceId, source.surfaceId),
                    strategy: nonEmptyString(source.strategy),
                    text: typeof source.text === 'string' ? source.text : nonEmptyString(source.text),
                    generation: numberOrZero(source.generation),
                    renderIntent: nonEmptyString(source.renderIntent),
                    sourceKind: nonEmptyString(source.sourceKind),
                    recoveryProof: freezePlainObject(copyPlainObject(source.recoveryProof, null)),
                    bounds: copyPlainObject(source.bounds, null),
                    metadata: freezePlainObject(copyPlainObject(source.metadata, {})),
                    status: nonEmptyString(source.status, 'ready'),
                    resumeWhen: freezePlainObject(copyPlainObject(source.resumeWhen, null)),
                    retryCount: numberOrZero(source.retryCount),
                    dispatchCount: numberOrZero(source.dispatchCount),
                    queuedAt: numberOrZero(source.queuedAt),
                });
            }

            function createRenderRoute(event, command, recordId, adapterId = '') {
                return freezePlainObject({
                    recordId: nonEmptyString(recordId),
                    itemId: nonEmptyString(recordId),
                    eventType: event && event.type ? String(event.type) : '',
                    adapterId: nonEmptyString(event && event.adapterId, adapterId),
                    surfaceId: nonEmptyString(command && command.surfaceId, event && event.surfaceId),
                    targetSurfaceId: nonEmptyString(command && command.targetSurfaceId, command && command.surfaceId, event && event.surfaceId),
                    status: event && event.status ? String(event.status) : '',
                    message: event && event.message ? String(event.message) : '',
                    commandId: nonEmptyString(command && command.commandId, command && command.id),
                    strategy: nonEmptyString(command && command.strategy),
                    commandGeneration: numberOrZero(command && command.generation),
                    renderIntent: nonEmptyString(command && command.renderIntent),
                    sourceKind: nonEmptyString(command && command.sourceKind),
                });
            }

            function createRenderDecision(status, reason, command, route, details = {}, source = {}) {
                const normalizedStatus = nonEmptyString(status, 'rejected');
                const normalizedReason = nonEmptyString(reason, status, 'rejected');
                const normalizedDetails = normalizeRenderDecisionDetails(details, source);
                const renderCommit = createDecisionRenderCommit(
                    normalizedStatus,
                    normalizedReason,
                    command,
                    route,
                    normalizedDetails,
                    source
                );
                const decision = {
                    status: normalizedStatus,
                    reason: normalizedReason,
                    recordId: route && route.recordId ? route.recordId : '',
                    itemId: route && route.itemId ? route.itemId : '',
                    commandId: command && (command.commandId || command.id) ? (command.commandId || command.id) : '',
                    strategy: command && command.strategy ? command.strategy : '',
                    commandGeneration: numberOrZero(command && command.generation),
                    details: normalizedDetails,
                    renderCommit,
                };
                const sourceObject = source && typeof source === 'object' ? source : {};
                if (normalizedDetails.resumeWhen && typeof normalizedDetails.resumeWhen === 'object') {
                    decision.resumeWhen = normalizedDetails.resumeWhen;
                }
                if (Object.prototype.hasOwnProperty.call(sourceObject, 'terminal')) {
                    decision.terminal = sourceObject.terminal === true;
                }
                return freezePlainObject(decision);
            }

            function createRenderCommandRebaseProofContext(command, route, proofContext = {}) {
                const source = proofContext && typeof proofContext === 'object' ? proofContext : {};
                const commandGeneration = numberOrZero(source.commandGeneration) || numberOrZero(route && route.commandGeneration) || numberOrZero(command && command.generation);
                const targetGeneration = numberOrZero(source.targetGeneration);
                return freezePlainObject({
                    reason: 'generation-mismatch',
                    commandId: nonEmptyString(command && command.commandId, command && command.id, route && route.commandId),
                    recordId: nonEmptyString(route && route.recordId, command && command.itemId),
                    itemId: nonEmptyString(route && route.itemId, route && route.recordId, command && command.itemId),
                    adapterId: nonEmptyString(route && route.adapterId),
                    strategy: nonEmptyString(route && route.strategy, command && command.strategy),
                    targetSurfaceId: nonEmptyString(route && route.targetSurfaceId, command && command.targetSurfaceId),
                    renderIntent: nonEmptyString(route && route.renderIntent, command && command.renderIntent),
                    sourceKind: nonEmptyString(route && route.sourceKind, command && command.sourceKind),
                    commandGeneration,
                    targetGeneration,
                    oldGeneration: commandGeneration,
                    newGeneration: targetGeneration,
                });
            }

            function normalizeRenderCommandRebaseRequest(proof, command, route, context) {
                if (!isAcceptedRenderCommandRebase(proof)) return null;
                const source = proof && typeof proof === 'object' ? proof : {};
                const replacementSource = source.replacementCommand && typeof source.replacementCommand === 'object'
                    ? source.replacementCommand
                    : {};
                const commandMetadata = command && command.metadata && typeof command.metadata === 'object'
                    ? command.metadata
                    : {};
                const currentSlotProof = copyPlainObject(
                    source.currentSlotProof
                    || source.proof
                    || source.currentProof
                    || source.details && source.details.currentSlotProof
                    || replacementSource.currentSlotProof,
                    null
                );
                const oldGeneration = numberOrZero(source.oldGeneration)
                    || numberOrZero(source.commandGeneration)
                    || numberOrZero(context && context.commandGeneration);
                const newGeneration = numberOrZero(source.newGeneration)
                    || numberOrZero(source.targetGeneration)
                    || numberOrZero(source.generation)
                    || numberOrZero(replacementSource.generation)
                    || numberOrZero(context && context.targetGeneration);
                const metadata = Object.assign(
                    {},
                    copyPlainObject(commandMetadata, {}),
                    copyPlainObject(source.metadata, {}),
                    copyPlainObject(replacementSource.metadata, {}),
                    {
                        rebasedFromCommandId: nonEmptyString(command && command.commandId, command && command.id, route && route.commandId),
                        oldGeneration,
                        newGeneration,
                    }
                );
                if (currentSlotProof) metadata.currentSlotProof = currentSlotProof;
                const details = Object.assign({}, copyPlainObject(source.details, {}), {
                    commandGeneration: oldGeneration,
                    targetGeneration: newGeneration,
                });
                if (currentSlotProof) details.currentSlotProof = currentSlotProof;
                return freezePlainObject({
                    reason: nonEmptyString(source.reason, 'render-command-rebased'),
                    commandId: nonEmptyString(command && command.commandId, command && command.id, route && route.commandId),
                    oldGeneration,
                    newGeneration,
                    commandGeneration: oldGeneration,
                    targetGeneration: newGeneration,
                    currentSlotProof: freezePlainObject(currentSlotProof),
                    details: freezePlainObject(details),
                    replacementCommand: freezePlainObject(Object.assign({}, replacementSource, {
                        strategy: nonEmptyString(replacementSource.strategy, source.strategy, route && route.strategy, command && command.strategy),
                        text: getRebaseReplacementText(source, replacementSource, command),
                        generation: newGeneration,
                        targetSurfaceId: nonEmptyString(
                            replacementSource.targetSurfaceId,
                            replacementSource.surfaceId,
                            source.targetSurfaceId,
                            source.surfaceId,
                            route && route.targetSurfaceId,
                            command && command.targetSurfaceId
                        ),
                        renderIntent: nonEmptyString(replacementSource.renderIntent, replacementSource.intent, source.renderIntent, source.intent, route && route.renderIntent, command && command.renderIntent),
                        sourceKind: nonEmptyString(replacementSource.sourceKind, replacementSource.source, source.sourceKind, source.source, route && route.sourceKind, command && command.sourceKind),
                        recoveryProof: freezePlainObject(copyPlainObject(replacementSource.recoveryProof || source.recoveryProof || command && command.recoveryProof, null)),
                        bounds: copyPlainObject(replacementSource.bounds || source.bounds || command && command.bounds, null),
                        metadata: freezePlainObject(metadata),
                    })),
                });
            }

            function isAcceptedRenderCommandRebase(value) {
                if (!value || typeof value !== 'object') return false;
                const status = String(value.status || value.result || value.decision || '').toLowerCase();
                return value.accepted === true
                    || value.rebased === true
                    || status === 'accepted'
                    || status === 'rebased';
            }

            function isDeniedRenderCommandRebase(value) {
                if (!value || typeof value !== 'object') return false;
                const status = String(value.status || value.result || value.decision || '').toLowerCase();
                return value.accepted === false
                    || status === 'denied'
                    || status === 'rejected';
            }

            function getRebaseReplacementText(source, replacementSource, command) {
                if (replacementSource && Object.prototype.hasOwnProperty.call(replacementSource, 'text')) {
                    return typeof replacementSource.text === 'string'
                        ? replacementSource.text
                        : nonEmptyString(replacementSource.text);
                }
                if (source && Object.prototype.hasOwnProperty.call(source, 'text')) {
                    return typeof source.text === 'string' ? source.text : nonEmptyString(source.text);
                }
                return typeof command.text === 'string' ? command.text : nonEmptyString(command && command.text);
            }

            function normalizeRenderCallbackDecision(value, command, route) {
                if (value === true) return createRenderDecision('committed', 'committed', command, route);
                if (typeof value === 'string') {
                    const status = normalizeRenderDecisionStatus(value);
                    if (status === 'committed') return createRenderDecision('committed', value || 'committed', command, route);
                    if (status === 'deferred') return createRenderDecision('deferred', value || 'deferred', command, route);
                    return createRenderDecision('rejected', value || 'adapter-declined', command, route);
                }
                if (value && typeof value === 'object') {
                    const status = normalizeRenderDecisionStatus(value.status || value.result || value.decision);
                    const reason = nonEmptyString(value.reason, status === 'committed' ? 'committed' : (status === 'deferred' ? 'deferred' : 'adapter-declined'));
                    return createRenderDecision(status, reason, command, route, value.details || {}, value);
                }
                return createRenderDecision('rejected', 'adapter-declined', command, route);
            }

            function normalizeRenderDecisionDetails(details, source = {}) {
                const normalized = copyPlainObject(details, {});
                if (normalized.renderCommit && typeof normalized.renderCommit === 'object') {
                    delete normalized.renderCommit;
                }
                const sourceDetails = source && typeof source === 'object' ? source : {};
                if (sourceDetails.proof && typeof sourceDetails.proof === 'object' && !normalized.proof) {
                    normalized.proof = copyPlainObject(sourceDetails.proof, {});
                }
                if (sourceDetails.resumeWhen && typeof sourceDetails.resumeWhen === 'object' && !normalized.resumeWhen) {
                    normalized.resumeWhen = copyPlainObject(sourceDetails.resumeWhen, {});
                }
                if (Object.prototype.hasOwnProperty.call(sourceDetails, 'terminal')
                    && !Object.prototype.hasOwnProperty.call(normalized, 'terminal')) {
                    normalized.terminal = sourceDetails.terminal === true;
                }
                if (sourceDetails.renderCommit && typeof sourceDetails.renderCommit === 'object') {
                    const commitDetails = copyPlainObject(sourceDetails.renderCommit.details, null);
                    if (commitDetails) Object.assign(normalized, commitDetails);
                }
                return freezePlainObject(normalized);
            }

            function createDecisionRenderCommit(status, reason, command, route, details = {}, source = {}) {
                const sourceObject = source && typeof source === 'object' ? source : {};
                const existingCommit = sourceObject.renderCommit && typeof sourceObject.renderCommit === 'object'
                    ? sourceObject.renderCommit
                    : (isRenderCommitObject(sourceObject) ? sourceObject : null);
                const existingDetailsCommit = sourceObject.details
                    && sourceObject.details.renderCommit
                    && typeof sourceObject.details.renderCommit === 'object'
                    && !existingCommit
                    ? sourceObject.details.renderCommit
                    : null;
                const commitSource = existingCommit || existingDetailsCommit || {};
                const commandMetadata = command && command.metadata && typeof command.metadata === 'object'
                    ? command.metadata
                    : {};
                const recoveryProof = command && command.recoveryProof && typeof command.recoveryProof === 'object'
                    ? command.recoveryProof
                    : null;
                const detailsWithProof = Object.assign({}, details || {});
                if (recoveryProof && !detailsWithProof.recoveryProof) detailsWithProof.recoveryProof = recoveryProof;
                return renderTransaction.createRenderCommit(Object.assign({}, commitSource, {
                    status,
                    phase: resolveDecisionRenderPhase(status),
                    reason,
                    route: nonEmptyString(commitSource.route, 'adapter-subscription'),
                    adapterId: nonEmptyString(route && route.adapterId, commitSource.adapterId),
                    itemId: nonEmptyString(route && route.itemId, commitSource.itemId),
                    recordId: nonEmptyString(route && route.recordId, commitSource.recordId),
                    surfaceId: nonEmptyString(route && route.targetSurfaceId, route && route.surfaceId, command && command.targetSurfaceId, command && command.surfaceId, commitSource.surfaceId),
                    slotKey: nonEmptyString(sourceObject.slotKey, details && details.slotKey, commandMetadata.slotKey, commitSource.slotKey),
                    strategy: nonEmptyString(command && command.strategy, route && route.strategy, commitSource.strategy),
                    commandId: nonEmptyString(command && command.commandId, command && command.id, route && route.commandId, commitSource.commandId),
                    commandGeneration: numberOrZero(command && command.generation) || numberOrZero(route && route.commandGeneration) || numberOrZero(commitSource.commandGeneration),
                    generation: numberOrZero(command && command.generation) || numberOrZero(commitSource.generation),
                    translationReceived: nonEmptyString(details && details.translationReceived, sourceObject.translationReceived, command && command.text, commitSource.translationReceived),
                    translationDrawn: nonEmptyString(details && details.translationDrawn, sourceObject.translationDrawn, commitSource.translationDrawn),
                    drawBoundary: sourceObject.drawBoundary
                        || details && details.drawBoundary
                        || commandMetadata.drawBoundary
                        || commitSource.drawBoundary
                        || null,
                    details: detailsWithProof,
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

            function resolveDecisionRenderPhase(status) {
                const phases = renderTransaction.PHASES || {};
                const normalized = String(status || '').toLowerCase();
                // Legacy callback payload alias: remove after callback result strings
                // are fully migrated from "accepted" to "committed".
                if (normalized === 'committed' || normalized === 'accepted') return phases.RENDER_COMMITTED || 'render-committed';
                if (normalized === 'deferred') return phases.RENDER_DEFERRED || 'render-deferred';
                if (normalized === 'noop') return phases.RENDER_NOOP || 'render-noop';
                return phases.RENDER_REJECTED || 'render-rejected';
            }

            return {
                createAdapterSubscriptionRouter,
            };
        },
    });
})();
