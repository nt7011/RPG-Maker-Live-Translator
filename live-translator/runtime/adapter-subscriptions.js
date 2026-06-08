// Subscription routing for adapter contracts.
//
// Adapters subscribe to orchestrator events through record-backed callbacks.
// This module validates render commands, routes skipped/failed events to the
// owning record, and ACKs/NACKs render commands back through the gateway.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/adapter-subscriptions.js.');
    }

    const utils = requireModule('runtime.adapterContractUtils');
    const renderTransaction = requireModule('runtime.renderTransaction');
    if (!renderTransaction || typeof renderTransaction.createRenderCommit !== 'function') {
        throw new Error('[LiveTranslator] runtime.renderTransaction is unavailable before runtime/adapter-subscriptions.js.');
    }
    const {
        copyPlainObject,
        freezePlainObject,
        isRecordObject,
        nonEmptyString,
        normalizeRenderDecisionStatus,
        numberOrZero,
    } = utils;

    function requireModule(name) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(name);
        }
        const modules = globalScope.LiveTranslatorModules || {};
        return modules[name] || (modules.runtime && modules.runtime.adapterContractUtils) || null;
    }

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
                dispatchRenderRejected(source, target, rejected, route);
                return false;
            }

            rememberRecordEvent(lifecycleRecord, recordId, event);
            let accepted = false;
            try {
                accepted = callAdapterCallback('subscribeRecords.render_queued', () => {
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
            const callbackDecision = normalizeRenderCallbackDecision(accepted, command, route);
            if (callbackDecision.status === 'deferred') {
                dispatchRenderDeferred(callbackDecision, route);
                return true;
            }
            if (callbackDecision.status !== 'accepted') {
                dispatchRenderRejected(source, target, callbackDecision, route);
                return false;
            }

            dispatchRenderAccepted(callbackDecision, route);
            if (typeof source.onRenderAccepted === 'function') {
                callAdapterCallback('subscribeRecords.render_accepted', () => {
                    source.onRenderAccepted(target, callbackDecision, route);
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
            if (!Number.isFinite(commandGeneration) || commandGeneration <= 0) return null;
            const targetGeneration = resolveRenderGeneration(source, record, command, route);
            if (!Number.isFinite(targetGeneration)) {
                return createRenderDecision('rejected', 'missing-generation', command, route, {
                    commandGeneration,
                });
            }
            if (targetGeneration !== commandGeneration) {
                return createRenderDecision('rejected', 'generation-mismatch', command, route, {
                    commandGeneration,
                    targetGeneration,
                });
            }
            return null;
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

        function dispatchRenderAccepted(decision, route) {
            notifyRenderDecisionGateway('recordRenderAccepted', decision, route);
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
        return freezePlainObject({
            id: nonEmptyString(source.id),
            itemId: nonEmptyString(source.itemId),
            surfaceId: nonEmptyString(source.surfaceId),
            strategy: nonEmptyString(source.strategy),
            text: typeof source.text === 'string' ? source.text : nonEmptyString(source.text),
            generation: numberOrZero(source.generation),
            bounds: copyPlainObject(source.bounds, null),
            metadata: freezePlainObject(copyPlainObject(source.metadata, {})),
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
            status: event && event.status ? String(event.status) : '',
            message: event && event.message ? String(event.message) : '',
            commandId: nonEmptyString(command && command.id),
            strategy: nonEmptyString(command && command.strategy),
            commandGeneration: numberOrZero(command && command.generation),
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
        return freezePlainObject({
            status: normalizedStatus,
            reason: normalizedReason,
            recordId: route && route.recordId ? route.recordId : '',
            itemId: route && route.itemId ? route.itemId : '',
            commandId: command && command.id ? command.id : '',
            strategy: command && command.strategy ? command.strategy : '',
            commandGeneration: numberOrZero(command && command.generation),
            details: normalizedDetails,
            renderCommit,
        });
    }

    function normalizeRenderCallbackDecision(value, command, route) {
        if (value === true) return createRenderDecision('accepted', 'accepted', command, route);
        if (typeof value === 'string') {
            const status = normalizeRenderDecisionStatus(value);
            if (status === 'accepted') return createRenderDecision('accepted', value || 'accepted', command, route);
            if (status === 'deferred') return createRenderDecision('deferred', value || 'deferred', command, route);
            return createRenderDecision('rejected', value || 'adapter-declined', command, route);
        }
        if (value && typeof value === 'object') {
            const status = normalizeRenderDecisionStatus(value.status || value.result || value.decision);
            const reason = nonEmptyString(value.reason, status === 'accepted' ? 'accepted' : (status === 'deferred' ? 'deferred' : 'adapter-declined'));
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
            : null;
        const existingDetailsCommit = sourceObject.details
            && sourceObject.details.renderCommit
            && typeof sourceObject.details.renderCommit === 'object'
            ? sourceObject.details.renderCommit
            : null;
        const commitSource = existingCommit || existingDetailsCommit || {};
        const commandMetadata = command && command.metadata && typeof command.metadata === 'object'
            ? command.metadata
            : {};
        return renderTransaction.createRenderCommit(Object.assign({}, commitSource, {
            status,
            phase: resolveDecisionRenderPhase(status),
            reason,
            route: nonEmptyString(commitSource.route, 'adapter-subscription'),
            adapterId: nonEmptyString(route && route.adapterId, commitSource.adapterId),
            itemId: nonEmptyString(route && route.itemId, commitSource.itemId),
            recordId: nonEmptyString(route && route.recordId, commitSource.recordId),
            surfaceId: nonEmptyString(route && route.surfaceId, command && command.surfaceId, commitSource.surfaceId),
            slotKey: nonEmptyString(sourceObject.slotKey, details && details.slotKey, commandMetadata.slotKey, commitSource.slotKey),
            strategy: nonEmptyString(command && command.strategy, route && route.strategy, commitSource.strategy),
            commandId: nonEmptyString(command && command.id, route && route.commandId, commitSource.commandId),
            commandGeneration: numberOrZero(command && command.generation) || numberOrZero(route && route.commandGeneration) || numberOrZero(commitSource.commandGeneration),
            generation: numberOrZero(command && command.generation) || numberOrZero(commitSource.generation),
            translationReceived: nonEmptyString(details && details.translationReceived, sourceObject.translationReceived, command && command.text, commitSource.translationReceived),
            translationDrawn: nonEmptyString(details && details.translationDrawn, sourceObject.translationDrawn, commitSource.translationDrawn),
            drawBoundary: sourceObject.drawBoundary
                || details && details.drawBoundary
                || commandMetadata.drawBoundary
                || commitSource.drawBoundary
                || null,
            details,
        }));
    }

    function resolveDecisionRenderPhase(status) {
        const phases = renderTransaction.PHASES || {};
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'accepted') return phases.RENDER_COMMITTED || 'render-committed';
        if (normalized === 'deferred') return phases.RENDER_DEFERRED || 'render-deferred';
        if (normalized === 'noop') return phases.RENDER_NOOP || 'render-noop';
        return phases.RENDER_REJECTED || 'render-rejected';
    }

    defineRuntimeModule('runtime.adapterSubscriptions', {
        createAdapterSubscriptionRouter,
    });
})();
