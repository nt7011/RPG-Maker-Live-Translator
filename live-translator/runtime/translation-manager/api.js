// Translation manager support: api.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    function createController(scope = {}) {
        const { DEFAULT_PRIORITY, completed, controllerFacades, jobsByKey } = scope;
        const {
            describeIgnoreTranslationRegex,
            describeOverrideTranslationRegex,
            describeSkip,
            describeEligibility,
            shouldSkip,
            shouldIgnoreTranslation,
            storeCompletedTranslation,
            forgetCompletedTranslation,
        } = controllerFacades.eligibility;
        const { cancelByRecordId, setPriorityByRecordId } = controllerFacades.subscribers;
        const { lookup, request } = controllerFacades.requests;

        function getStats() {
            const diagnostics = scope.translationIntel.getSnapshot({ jobLimit: 1 });
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
                getIntelSnapshot: scope.translationIntel.getSnapshot,
            };
        }

        return {
            getStats,
            createCompatibilityCache,
        };
    }

    LiveTranslatorDefine({
        name: 'runtime.translationManager.api',
        factory() {
            return { create: createController };
        },
    });
})();
