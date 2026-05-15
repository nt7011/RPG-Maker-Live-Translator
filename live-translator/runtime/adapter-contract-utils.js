// Shared utilities for adapter contract modules.
//
// These helpers are intentionally small and side-effect free. The public
// contract, record state store, and subscription router all use the same
// normalization rules so adapters cannot drift between lifecycle paths.
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
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/adapter-contract-utils.js.');
    }

    function isRecordObject(target) {
        return !!(target && typeof target === 'object');
    }

    function getRecordId(target) {
        if (!isRecordObject(target)) return '';
        const keys = ['recordId', 'id', 'itemId'];
        for (const key of keys) {
            if (target[key] !== undefined && target[key] !== null && String(target[key])) {
                return String(target[key]);
            }
        }
        return '';
    }

    function nonEmptyString(...values) {
        for (const value of values) {
            if (value === undefined || value === null) continue;
            const text = String(value);
            if (text) return text;
        }
        return '';
    }

    function numberOrZero(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function copyPlainObject(value, fallback) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
        return Object.assign({}, value);
    }

    function freezePlainObject(value) {
        if (!value || typeof value !== 'object') return value;
        try { return Object.freeze(value); } catch (_) { return value; }
    }

    function normalizeRecordStatus(value, fallback = '') {
        const status = nonEmptyString(value, fallback).toLowerCase();
        if (status === 'requested' || status === 'request') return 'pending';
        if (status === 'error') return 'failed';
        if (status === 'cancelled' || status === 'canceled') return 'stale';
        if (status === 'gone') return 'disappeared';
        return status || '';
    }

    function normalizeRenderDecisionStatus(value) {
        const status = String(value || '').toLowerCase();
        if (status === 'accepted' || status === 'rendered' || status === 'drawn') return 'accepted';
        if (status === 'deferred' || status === 'queued' || status === 'pending') return 'deferred';
        return 'rejected';
    }

    function normalizeAdapterRenderDecision(status, decision = {}) {
        const source = decision && typeof decision === 'object' ? decision : { reason: nonEmptyString(decision) };
        const normalized = Object.assign({}, source);
        normalized.status = normalizeRenderDecisionStatus(status);
        normalized.reason = nonEmptyString(normalized.reason, normalized.status);
        return normalized;
    }

    function isAdapterContractError(error) {
        return !!(error
            && typeof error === 'object'
            && (error.name === 'AdapterContractError'
                || error.code === 'LIVE_TRANSLATOR_ADAPTER_CONTRACT'));
    }

    function describeCallbackError(error) {
        const details = {};
        const source = error && typeof error === 'object' ? error : null;
        const cause = source && source.cause !== undefined ? source.cause : null;
        appendErrorDetails(details, 'error', source || error);
        appendErrorDetails(details, 'cause', cause);
        if (source && source.operation) details.operation = String(source.operation);
        if (source && source.adapterId) details.adapterId = String(source.adapterId);
        return details;
    }

    function appendErrorDetails(details, prefix, error) {
        if (!details || error === undefined || error === null) return;
        if (typeof error === 'object') {
            const name = nonEmptyString(error.name);
            const message = nonEmptyString(error.message);
            const code = nonEmptyString(error.code);
            if (name) details[`${prefix}Name`] = name;
            if (message) details[`${prefix}Message`] = message;
            if (code) details[`${prefix}Code`] = code;
            return;
        }
        const message = nonEmptyString(error);
        if (message) details[`${prefix}Message`] = message;
    }

    function safeIdPart(value) {
        return String(value || 'adapter')
            .replace(/[^A-Za-z0-9_.:-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            || 'adapter';
    }

    function defaultEligibility(payload) {
        const source = payload && typeof payload === 'object' ? payload : {};
        const text = nonEmptyString(
            source.normalizedSource,
            source.translationSource,
            source.visibleText,
            source.rawText,
            source.original
        ).trim();
        return text
            ? { eligible: true, skip: false, category: 'eligible', reason: '' }
            : { eligible: false, skip: true, category: 'empty', reason: 'emptyNormalized' };
    }

    function deniedOwnership(reason) {
        return Object.freeze({
            status: 'denied',
            reason: nonEmptyString(reason, 'denied'),
            token: null,
            ownershipToken: null,
            claimId: '',
            ownerAdapter: '',
        });
    }

    defineRuntimeModule('runtime.adapterContractUtils', {
        isRecordObject,
        getRecordId,
        nonEmptyString,
        numberOrZero,
        copyPlainObject,
        freezePlainObject,
        normalizeRecordStatus,
        normalizeRenderDecisionStatus,
        normalizeAdapterRenderDecision,
        isAdapterContractError,
        describeCallbackError,
        safeIdPart,
        defaultEligibility,
        deniedOwnership,
    });
})();
