// Record capability state for adapter contracts.
//
// The adapter contract grants lifecycle capabilities only to record objects it
// has observed. This module owns that bookkeeping so public contract methods
// can stay focused on gateway calls instead of WeakMap and id-index details.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/adapter-record-state.js.');
    }

    const utils = requireModule('runtime.adapterContractUtils');
    const {
        getRecordId,
        isRecordObject,
        nonEmptyString,
        normalizeRecordStatus,
        safeIdPart,
    } = utils;

    const REQUEST_ACTIVE_STATUSES = Object.freeze({
        pending: true,
        translating: true,
    });
    const RECORD_ACTIVE_STATUSES = Object.freeze({
        detected: true,
        pending: true,
        translating: true,
        completed: true,
        skipped: true,
        failed: true,
    });
    let recordStateKeySequence = 0;

    function requireModule(name) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(name);
        }
        const modules = globalScope.LiveTranslatorModules || {};
        return modules[name] || (modules.runtime && modules.runtime.adapterContractUtils) || null;
    }

    function createAdapterRecordStateStore(options = {}) {
        const adapterId = nonEmptyString(options.adapterId, 'adapter');
        const recordStates = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
        const recordStatesById = new Map();
        const recordStateKey = `__liveTranslatorAdapterRecordState_${safeIdPart(adapterId)}_${++recordStateKeySequence}`;

        function canTouchRecord(target) {
            const state = getExactRecordState(target);
            return !!(state && (state.active !== false || state.detached === true));
        }

        function rememberRecord(record, id, snapshot = {}) {
            if (!isRecordObject(record) || !id) return null;
            const status = normalizeRecordStatus(snapshot && snapshot.status, 'detected');
            const state = getOrCreateRecordState(record, id);
            setRecordStateId(state, id);
            state.status = status;
            state.active = RECORD_ACTIVE_STATUSES[status] === true;
            state.detached = false;
            state.requestActive = REQUEST_ACTIVE_STATUSES[status] === true;
            state.updatedAt = Date.now();
            return state;
        }

        function rememberRecordPatch(record, id, patch = {}) {
            if (!isRecordObject(record) || !id) return null;
            const state = getExactRecordState(record);
            if (!state) return null;
            setRecordStateId(state, id);
            if (patch && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                updateRecordStateStatus(state, patch.status);
            }
            state.updatedAt = Date.now();
            return state;
        }

        function rememberRecordEvent(record, id, event = {}) {
            if (!isRecordObject(record) || !id) return null;
            const state = getExactRecordState(record);
            if (!state) return null;
            setRecordStateId(state, id);
            if (event && event.status) updateRecordStateStatus(state, event.status);
            const eventType = String(event && event.type || '');
            if (eventType === 'item.render_queued') updateRecordStateStatus(state, 'completed');
            if (eventType === 'item.skipped') updateRecordStateStatus(state, 'skipped');
            if (eventType === 'item.failed') updateRecordStateStatus(state, 'failed');
            if (eventType === 'item.translation_noop'
                || eventType === 'item.translation_noop_detached') {
                updateRecordStateStatus(state, 'failed');
            }
            if (eventType === 'item.stale' || eventType === 'item.disappeared' || eventType === 'item.removed') {
                state.active = false;
                state.requestActive = false;
            }
            state.updatedAt = Date.now();
            return state;
        }

        function markRecordStatus(record, id, status, options = {}) {
            const state = getExactRecordState(record);
            if (!state) return null;
            setRecordStateId(state, id);
            updateRecordStateStatus(state, status);
            if (options && Object.prototype.hasOwnProperty.call(options, 'requestActive')) {
                state.requestActive = options.requestActive === true;
            }
            state.updatedAt = Date.now();
            return state;
        }

        function updateRecordStateStatus(state, status) {
            if (!state) return null;
            const normalized = normalizeRecordStatus(status, state.status || 'detected');
            state.status = normalized;
            state.active = RECORD_ACTIVE_STATUSES[normalized] === true;
            state.requestActive = REQUEST_ACTIVE_STATUSES[normalized] === true;
            return state;
        }

        function getOrCreateRecordState(record, id = '') {
            let state = getExactRecordState(record);
            if (!state) {
                state = {
                    id: String(id || getRecordId(record) || ''),
                    status: 'detected',
                    active: true,
                    detached: false,
                    requestActive: false,
                    updatedAt: Date.now(),
                };
                rememberExactRecordState(record, state);
            }
            if (id) setRecordStateId(state, id);
            return state;
        }

        function getRecordState(record) {
            return getExactRecordState(record);
        }

        function getExactRecordState(record) {
            if (!isRecordObject(record)) return null;
            if (recordStates) {
                return recordStates.get(record) || null;
            }
            try {
                return record[recordStateKey] || null;
            } catch (_) {
                return null;
            }
        }

        function rememberExactRecordState(record, state) {
            if (!isRecordObject(record) || !state) return false;
            if (recordStates) {
                recordStates.set(record, state);
                return true;
            }
            try {
                Object.defineProperty(record, recordStateKey, {
                    value: state,
                    configurable: true,
                });
                return true;
            } catch (_) {
                try {
                    record[recordStateKey] = state;
                    return true;
                } catch (__) {
                    return false;
                }
            }
        }

        function getCapabilityRecordId(record) {
            const state = getExactRecordState(record);
            return state && state.id ? String(state.id) : '';
        }

        function setRecordStateId(state, id) {
            if (!state) return null;
            const nextId = nonEmptyString(id);
            if (state.id && state.id !== nextId) forgetRecordId(state.id, state);
            state.id = nextId;
            if (!nextId) return state;
            const previous = recordStatesById.get(nextId);
            if (previous && previous !== state) revokeRecordState(previous);
            recordStatesById.set(nextId, state);
            return state;
        }

        function revokeRecordState(state) {
            if (!state) return null;
            state.active = false;
            state.detached = false;
            state.requestActive = false;
            state.updatedAt = Date.now();
            return state;
        }

        function forgetRecordId(id, state) {
            const key = nonEmptyString(id);
            if (!key) return false;
            const current = recordStatesById.get(key);
            if (!current) return false;
            if (state && state !== current) return false;
            recordStatesById.delete(key);
            return true;
        }

        function getRecordStatus(target, fallback = '') {
            const state = getRecordState(target);
            return state ? state.status : nonEmptyString(fallback);
        }

        function isRecordActive(target) {
            const state = getRecordState(target);
            return !!(state && state.active !== false);
        }

        function isRecordObserved(target) {
            return !!getRecordState(target);
        }

        function isRecordRequestActive(target) {
            const state = getRecordState(target);
            return !!(state && state.requestActive === true);
        }

        function isRecordTerminal(target) {
            const status = getRecordStatus(target);
            return status === 'completed' || status === 'skipped' || status === 'failed';
        }

        function markRetired(target, id, status, recordDetached) {
            const state = getExactRecordState(target);
            if (!state) return;
            setRecordStateId(state, nonEmptyString(id, state.id));
            state.status = normalizeRecordStatus(status, state.status);
            state.active = false;
            state.detached = recordDetached === true;
            state.requestActive = state.detached && REQUEST_ACTIVE_STATUSES[state.status] === true;
            state.updatedAt = Date.now();
            if (!state.detached) forgetRecordId(state.id, state);
        }

        return Object.freeze({
            canTouchRecord,
            rememberRecord,
            rememberRecordPatch,
            rememberRecordEvent,
            markRecordStatus,
            getExactRecordState,
            getCapabilityRecordId,
            forgetRecordId,
            getRecordStatus,
            isRecordActive,
            isRecordObserved,
            isRecordRequestActive,
            isRecordTerminal,
            markRetired,
        });
    }

    defineRuntimeModule('runtime.adapterRecordState', {
        createAdapterRecordStateStore,
    });
})();
