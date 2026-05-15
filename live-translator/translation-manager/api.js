// Translation manager support: api.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/api.js.');
    }

    function createController(scope = {}) {
        const { DEFAULT_PRIORITY, completed, jobsByKey } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { describeIgnoreTranslationRegex, describeOverrideTranslationRegex, describeSkip, describeEligibility, shouldSkip, shouldIgnoreTranslation, storeCompletedTranslation, forgetCompletedTranslation, cancelByRecordId, setPriorityByRecordId, lookup, request } = Object.fromEntries(['describeIgnoreTranslationRegex', 'describeOverrideTranslationRegex', 'describeSkip', 'describeEligibility', 'shouldSkip', 'shouldIgnoreTranslation', 'storeCompletedTranslation', 'forgetCompletedTranslation', 'cancelByRecordId', 'setPriorityByRecordId', 'lookup', 'request'].map((name) => [name, callScope(name)]));

        function getStats() {
            const diagnostics = scope.translationDiagnostics.getSnapshot({ jobLimit: 1 });
            return {
                queued: diagnostics.summary.queued,
                running: diagnostics.summary.running,
                capacity: diagnostics.provider.capacity,
                jobs: diagnostics.summary.jobs,
                completed: diagnostics.cache.completed,
                subscribers: diagnostics.summary.activeSubscribers,
                streamJobs: diagnostics.summary.streamJobs,
            };
        }

        function createCompatibilityCache() {
            return {
                completed,
                ongoing: jobsByKey,
                request,
                lookup,
                requestTranslation(text, context = {}) {
                    return request(text, context).promise;
                },
                requestTranslationHandle(text, context = {}) {
                    return request(text, context);
                },
                requestTranslationStream(text, context = {}) {
                    return request(text, Object.assign({}, context, { stream: true })).promise;
                },
                cancelByRecordId,
                setPriorityByRecordId,
                shouldSkip,
                describeSkip,
                describeEligibility,
                getSkipReason: (text) => describeSkip(text).reason,
                shouldIgnoreTranslation,
                describeIgnoreTranslationRegex,
                describeOverrideTranslationRegex,
                storeCompletedTranslation,
                forgetCompletedTranslation,
                performTranslation(text) {
                    return request(text, { priority: DEFAULT_PRIORITY }).promise;
                },
                performTranslationStream(text, context = {}) {
                    return request(text, Object.assign({}, context, { stream: true })).promise;
                },
                getStats,
                getDiagnosticsSnapshot: scope.translationDiagnostics.getSnapshot,
            };
        }

        return {
            getStats,
            createCompatibilityCache,
        };
    }

    defineRuntimeModule('runtime.translationManagerApi', { create: createController });
})();
