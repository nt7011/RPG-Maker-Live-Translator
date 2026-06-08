// Translation manager support: queue.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/queue.js.');
    }

    function createController(scope = {}) {
        const { logger, provider, capacityRefreshMs, requestTimeoutMs, queuedJobs } = scope;
        const {
            forgetJobKey,
            compareQueuedJobsForDispatch,
            getEnabledReservedPriorityLanes,
            jobMatchesReservedLane,
            jobMatchesAnyReservedLane,
            getReservedLaneDispatchState,
            getNormalDispatchState,
            getQueueDispatchState,
        } = scope.controllerFacades.jobs;
        const { startJob } = scope.controllerFacades.runner;

        function isCapacityVerifiedByProvider() {
            if (!provider || typeof provider.getStatus !== 'function') return true;
            try {
                const status = provider.getStatus() || {};
                if (Object.prototype.hasOwnProperty.call(status, 'capacityVerified')) {
                    return status.capacityVerified === true;
                }
            } catch (_) {
                return false;
            }
            return true;
        }

        async function refreshCapacityIfNeeded(force = false) {
            const now = Date.now();
            if (!force && now < scope.capacityExpiresAt) return scope.providerCapacity;
            if (scope.capacityPromise) return scope.capacityPromise;
            if (!provider || typeof provider.getCapacity !== 'function') {
                scope.providerCapacity = 1;
                scope.providerCapacityVerified = false;
                scope.capacityExpiresAt = now + capacityRefreshMs;
                return scope.providerCapacity;
            }

            scope.capacityPromise = Promise.resolve()
                .then(() => provider.getCapacity({ timeoutMs: Math.min(requestTimeoutMs, 10000) }))
                .then((capacity) => {
                    const numeric = Number(capacity);
                    const validCapacity = Number.isInteger(numeric) && numeric > 0;
                    scope.providerCapacity = validCapacity
                        ? Math.min(numeric, Number.MAX_SAFE_INTEGER)
                        : 1;
                    scope.providerCapacityVerified = validCapacity && isCapacityVerifiedByProvider();
                    scope.capacityExpiresAt = Date.now() + capacityRefreshMs;
                    scope.lastCapacityRefreshAt = Date.now();
                    scope.lastCapacityRefreshError = '';
                    scope.translationDiagnostics.recordLazy('capacity.refreshed', () => ({
                        capacity: scope.providerCapacity,
                    }));
                    scope.recordProviderAvailability('capacity-refreshed');
                    return scope.providerCapacity;
                })
                .catch((error) => {
                    logger.warn('[TranslationService] Failed to refresh provider capacity; using 1.', error);
                    scope.providerCapacity = 1;
                    scope.providerCapacityVerified = false;
                    scope.capacityExpiresAt = Date.now() + capacityRefreshMs;
                    scope.lastCapacityRefreshAt = Date.now();
                    scope.lastCapacityRefreshError = scope.translationDiagnostics.formatError(error);
                    scope.translationDiagnostics.recordLazy('capacity.failed', () => ({
                        capacity: scope.providerCapacity,
                        error: scope.lastCapacityRefreshError,
                    }));
                    scope.recordProviderAvailability('capacity-failed', error);
                    return scope.providerCapacity;
                })
                .finally(() => {
                    scope.capacityPromise = null;
                });
            return scope.capacityPromise;
        }

        function schedulePump() {
            if (scope.pumpScheduled) return;
            scope.pumpScheduled = true;
            Promise.resolve().then(pump).catch((error) => {
                logger.error('[TranslationService] queue pump failed', error);
            });
        }

        function pruneQueuedJobs() {
            for (let index = queuedJobs.length - 1; index >= 0; index -= 1) {
                const job = queuedJobs[index];
                if (!job || job.status !== 'queued') {
                    queuedJobs.splice(index, 1);
                    forgetJobKey(job);
                }
            }
        }

        function takeNextQueuedJob(predicate = null) {
            pruneQueuedJobs();
            if (!queuedJobs.length) return null;
            queuedJobs.sort(compareQueuedJobsForDispatch);
            if (typeof predicate !== 'function') return queuedJobs.shift() || null;
            for (let index = 0; index < queuedJobs.length; index += 1) {
                const job = queuedJobs[index];
                if (predicate(job)) {
                    queuedJobs.splice(index, 1);
                    return job;
                }
            }
            return null;
        }

        function dispatchReservedPriorityLaneJobs(lanes) {
            for (const lane of lanes) {
                while (getReservedLaneDispatchState(lane).canDispatch) {
                    const job = takeNextQueuedJob((candidate) => jobMatchesReservedLane(candidate, lane));
                    if (!job) break;
                    startJob(job);
                }
            }
        }

        function dispatchNormalJobs(lanes) {
            let state = getNormalDispatchState(lanes);
            while (state.canDispatch) {
                const job = takeNextQueuedJob((candidate) => !jobMatchesAnyReservedLane(candidate, lanes));
                if (!job) break;
                startJob(job);
                state = getNormalDispatchState(lanes);
            }
        }

        function canDispatchQueuedWork() {
            pruneQueuedJobs();
            if (!queuedJobs.length || scope.activeCount >= scope.providerCapacity) return false;
            const lanes = getEnabledReservedPriorityLanes();
            return getQueueDispatchState(lanes).canDispatch === true;
        }

        async function pump() {
            scope.pumpScheduled = false;
            if (scope.pumpRunning) return;
            scope.pumpRunning = true;
            try {
                await refreshCapacityIfNeeded(false);
                const lanes = getEnabledReservedPriorityLanes();
                dispatchReservedPriorityLaneJobs(lanes);
                dispatchNormalJobs(lanes);
            } finally {
                scope.pumpRunning = false;
                if (canDispatchQueuedWork()) schedulePump();
            }
        }

        return {
            refreshCapacityIfNeeded,
            schedulePump,
            pruneQueuedJobs,
            takeNextQueuedJob,
            dispatchReservedPriorityLaneJobs,
            dispatchNormalJobs,
            canDispatchQueuedWork,
            pump,
        };
    }

    defineRuntimeModule('runtime.translationManagerQueue', { create: createController });
})();
