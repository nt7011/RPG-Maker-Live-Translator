// Adapter-facing TextOrchestrator contract.
//
// Adapters observe engine-specific facts and render adapter-specific output.
// This wrapper is the only boundary they should use for canonical lifecycle,
// translation requests, visibility, priority, diagnostics, and subscription
// calls into runtime/text-orchestrator.js. Small support modules own the
// reusable normalization, record-state, and subscription-routing mechanics;
// this file documents and exposes the public adapter API.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/adapter-contract.js.');
    }

    const utils = requireModule('runtime.adapterContractUtils');
    const config = requireModule('runtime.adapterContractConfig');
    const recordStateModule = requireModule('runtime.adapterRecordState');
    const subscriptionModule = requireModule('runtime.adapterSubscriptions');
    const {
        defaultEligibility,
        describeCallbackError,
        getRecordId,
        isAdapterContractError,
        isRecordObject,
        nonEmptyString,
        normalizeAdapterRenderDecision,
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
            if (!canTouchRecord(target) || !hasMethod('requestItemTranslation')) return false;
            const id = getCapabilityRecordId(target);
            if (!id) return false;
            const requestResult = callGateway('requestItemTranslation', () => {
                return gateway.requestItemTranslation(id, Object.assign({
                    hook: defaultHook,
                }, requestOptions || {}));
            });
            if (!requestResult) return false;
            if (!isRecordTerminal(target)) {
                markRecordStatus(target, id, 'pending', { requestActive: true });
            }
            return true;
        }

        function cancelItemTranslation(target, reason = '', options = {}) {
            if (!canTouchRecord(target) || !hasMethod('cancelItemTranslation')) return false;
            const id = getCapabilityRecordId(target);
            if (!id) return false;
            const canceled = callGateway('cancelItemTranslation', () => {
                return gateway.cancelItemTranslation(id, reason, options && typeof options === 'object' ? options : {});
            });
            return canceled === true;
        }

        function setItemTranslationPriority(target, priority, reason = '') {
            if (!canTouchRecord(target) || !hasMethod('setItemTranslationPriority')) return false;
            const id = getCapabilityRecordId(target);
            if (!id) return false;
            const changed = callGateway('setItemTranslationPriority', () => {
                return gateway.setItemTranslationPriority(id, priority, reason);
            });
            return changed === true;
        }

        function setItemVisibility(target, visible, details = null) {
            if (!canTouchRecord(target) || !hasMethod('setItemVisibility')) return null;
            const id = getCapabilityRecordId(target);
            if (!id) return null;
            return callGateway('setItemVisibility', () => {
                return gateway.setItemVisibility(id, visible === true, details || {});
            });
        }

        function backgroundItem(target, details = {}) {
            if (!canTouchRecord(target) || !hasMethod('backgroundItem')) return null;
            const id = getCapabilityRecordId(target);
            if (!id) return null;
            return callGateway('backgroundItem', () => {
                return gateway.backgroundItem(id, details || {});
            });
        }

        function retireItem(target, status = 'disappeared', eventOptions = {}) {
            if (!canTouchRecord(target) || !hasMethod('retireItem')) return null;
            const id = getCapabilityRecordId(target);
            if (!id) return null;
            const normalizedOptions = normalizeEventOptions(eventOptions);
            const recordDetached = normalizedOptions.recordDetached === true;
            const orchestratorOptions = Object.assign({}, normalizedOptions);
            delete orchestratorOptions.recordDetached;
            const retired = callGateway('retireItem', () => {
                return gateway.retireItem(id, status || 'disappeared', orchestratorOptions);
            });
            markRetired(target, id, status, recordDetached);
            return retired;
        }

        function recordDecision(target, type, message = '', details = null) {
            if (!canTouchRecord(target) || !hasMethod('recordDecision')) return null;
            const id = getCapabilityRecordId(target);
            if (!id) return null;
            return callGateway('recordDecision', () => {
                return gateway.recordDecision(id, type, message, details);
            });
        }

        function recordRenderAccepted(target, decision = {}) {
            return recordRenderDecision(target, 'recordRenderAccepted', 'accepted', decision);
        }

        function recordRenderDeferred(target, decision = {}) {
            return recordRenderDecision(target, 'recordRenderDeferred', 'deferred', decision);
        }

        function recordRenderRejected(target, decision = {}) {
            return recordRenderDecision(target, 'recordRenderRejected', 'rejected', decision);
        }

        function recordRenderDecision(target, methodName, status, decision = {}) {
            if (!canTouchRecord(target) || !hasMethod(methodName)) return null;
            const id = getCapabilityRecordId(target);
            if (!id) return null;
            return callGateway(methodName, () => {
                return gateway[methodName](id, normalizeAdapterRenderDecision(status, decision));
            });
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
            if (!token || !hasMethod('releaseSurface')) return false;
            return callGateway('releaseSurface', () => {
                return gateway.releaseSurface(token, reason || 'surface released') === true;
            }) === true;
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
            if (!token || !hasMethod('releaseTextClaim')) return false;
            return callGateway('releaseTextClaim', () => {
                return gateway.releaseTextClaim(token, reason || 'text claim released') === true;
            }) === true;
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
            recordDecision,
            recordRenderAccepted,
            recordRenderDeferred,
            recordRenderRejected,
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

    function requireModule(name) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(name);
        }
        const modules = globalScope.LiveTranslatorModules || {};
        if (modules[name]) return modules[name];
        return String(name || '').split('.').reduce((current, part) => {
            return current && current[part] ? current[part] : null;
        }, modules);
    }

    try { globalScope.LiveTranslatorCreateAdapterContract = createAdapterContract; } catch (_) {}

    defineRuntimeModule('runtime.adapterContract', {
        createAdapterContract,
        isAdapterContractError,
    });
})();
