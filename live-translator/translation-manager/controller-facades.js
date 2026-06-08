// Translation manager support: explicit controller dependency facades.
// Child controllers use these facets instead of constructing ad hoc dispatchers.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/controller-facades.js.');
    }

    function createTranslationManagerControllerFacades(context = {}) {
        const callController = context.callController;
        if (typeof callController !== 'function') {
            throw new Error('[TranslationService] controller facades require a controller dispatcher.');
        }

        return Object.freeze({
            eligibility: bindControllerMethods(callController, [
                'describeIgnoreTranslationRegex',
                'describeOverrideTranslationRegex',
                'describeSkip',
                'describeEligibility',
                'shouldSkip',
                'shouldIgnoreTranslation',
                'lookupOverrideTranslationRegex',
                'logTranslationEvent',
                'normalizeRequest',
                'requestContext',
                'storeCompletedTranslation',
                'forgetCompletedTranslation',
                'lookupCompleted',
                'finalizeProviderSuccess',
                'resolvePrecacheShortcut',
            ]),
            jobs: bindControllerMethods(callController, [
                'createJob',
                'recomputeJobPriority',
                'removeQueuedJob',
                'forgetJobKey',
                'getActiveSubscribers',
                'hasActiveSubscribers',
                'compareQueuedJobsForDispatch',
                'getEnabledReservedPriorityLanes',
                'subscriberMatchesReservedLane',
                'jobMatchesReservedLane',
                'jobMatchesAnyReservedLane',
                'countReservedRunningJobs',
                'countLaneRunningJobs',
                'countLaneQueuedJobs',
                'countReservedSlots',
                'getNormalDispatchCapacity',
                'countNormalRunningJobs',
                'hasBlockingReservedLaneWork',
                'getReservedLaneDispatchState',
                'getNormalDispatchState',
                'getQueueDispatchState',
                'getReservedPriorityLaneSnapshot',
            ]),
            subscribers: bindControllerMethods(callController, [
                'unregisterSubscriber',
                'settleSubscriber',
                'cancelSubscriber',
                'setSubscriberPriority',
                'createSubscriber',
                'cancelByRecordId',
                'setPriorityByRecordId',
            ]),
            requests: bindControllerMethods(callController, [
                'lookup',
                'request',
                'shouldStartStreamUpgradeJob',
            ]),
            queue: bindControllerMethods(callController, [
                'refreshCapacityIfNeeded',
                'schedulePump',
                'pruneQueuedJobs',
                'takeNextQueuedJob',
                'dispatchReservedPriorityLaneJobs',
                'dispatchNormalJobs',
                'canDispatchQueuedWork',
                'pump',
            ]),
            runner: bindControllerMethods(callController, [
                'createJobController',
                'notifyDelta',
                'startJob',
                'runProviderWithRetries',
                'shouldRetry',
                'computeRetryDelayMs',
                'waitForRetry',
            ]),
            api: bindControllerMethods(callController, [
                'getStats',
                'createCompatibilityCache',
            ]),
        });
    }

    function bindControllerMethods(callController, names) {
        const facade = Object.create(null);
        names.forEach((name) => {
            facade[name] = (...args) => callController(name, ...args);
        });
        return Object.freeze(facade);
    }

    defineRuntimeModule('runtime.translationManagerControllerFacades', {
        create: createTranslationManagerControllerFacades,
    });
})();
