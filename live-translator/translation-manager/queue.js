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
        const callScope = (name) => (...args) => scope[name](...args);
        const { forgetJobKey, compareQueuedJobsForDispatch, getEnabledReservedPriorityLanes, jobMatchesReservedLane, jobMatchesAnyReservedLane, countLaneQueuedJobs, getNormalDispatchCapacity, countNormalRunningJobs, hasBlockingReservedLaneWork, startJob } = Object.fromEntries(['forgetJobKey', 'compareQueuedJobsForDispatch', 'getEnabledReservedPriorityLanes', 'jobMatchesReservedLane', 'jobMatchesAnyReservedLane', 'countLaneQueuedJobs', 'getNormalDispatchCapacity', 'countNormalRunningJobs', 'hasBlockingReservedLaneWork', 'startJob'].map((name) => [name, callScope(name)]));

        async function refreshCapacityIfNeeded(force = false) {
            const now = Date.now();
            if (!force && now < scope.capacityExpiresAt) return scope.providerCapacity;
            if (scope.capacityPromise) return scope.capacityPromise;
            if (!provider || typeof provider.getCapacity !== 'function') {
                scope.providerCapacity = 1;
                scope.capacityExpiresAt = now + capacityRefreshMs;
                return scope.providerCapacity;
            }

            scope.capacityPromise = Promise.resolve()
                .then(() => provider.getCapacity({ timeoutMs: Math.min(requestTimeoutMs, 10000) }))
                .then((capacity) => {
                    const numeric = Number(capacity);
                    scope.providerCapacity = Number.isInteger(numeric) && numeric > 0
                        ? Math.min(numeric, Number.MAX_SAFE_INTEGER)
                        : 1;
                    scope.capacityExpiresAt = Date.now() + capacityRefreshMs;
                    scope.lastCapacityRefreshAt = Date.now();
                    scope.lastCapacityRefreshError = '';
                    scope.translationDiagnostics.record('capacity.refreshed', {
                        capacity: scope.providerCapacity,
                    });
                    return scope.providerCapacity;
                })
                .catch((error) => {
                    logger.warn('[TranslationService] Failed to refresh provider capacity; using 1.', error);
                    scope.providerCapacity = 1;
                    scope.capacityExpiresAt = Date.now() + capacityRefreshMs;
                    scope.lastCapacityRefreshAt = Date.now();
                    scope.lastCapacityRefreshError = scope.translationDiagnostics.formatError(error);
                    scope.translationDiagnostics.record('capacity.failed', {
                        capacity: scope.providerCapacity,
                        error: scope.lastCapacityRefreshError,
                    });
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
            // Reserved lanes are checked before the normal queue. In v1 the only
            // lane is adapter-agnostic priority 1000. reservedSlots is the
            // normal-work reservation, not a cap on matching work: if multiple
            // priority-1000 jobs are ready, they may use every free provider
            // slot. We do not preempt already-running normal work; the idle slot
            // prevents most latency without depending on provider cancellation
            // actually stopping token generation.
            // TODO(priority-lanes): when lane policies become configurable,
            // decide whether each lane should have a separate matching-job cap.
            for (const lane of lanes) {
                while (scope.activeCount < scope.providerCapacity) {
                    const job = takeNextQueuedJob((candidate) => jobMatchesReservedLane(candidate, lane));
                    if (!job) break;
                    startJob(job);
                }
            }
        }

        function dispatchNormalJobs(lanes) {
            // Normal jobs can never consume reserved slots while the lane is
            // enabled. If priority-1000 work is queued or running, v1 stops
            // admitting new normal work so token generation speed is not further
            // diluted while urgent text is being translated.
            // TODO(priority-lanes): make the blocking behavior lane-specific and
            // configurable after real-world diagnostics show whether all normal
            // classes should pause, or only lower-priority/background work.
            if (hasBlockingReservedLaneWork(lanes)) return;
            const normalCapacity = getNormalDispatchCapacity(lanes);
            while (scope.activeCount < scope.providerCapacity && countNormalRunningJobs(lanes) < normalCapacity) {
                const job = takeNextQueuedJob((candidate) => !jobMatchesAnyReservedLane(candidate, lanes));
                if (!job) break;
                startJob(job);
            }
        }

        function canDispatchQueuedWork() {
            pruneQueuedJobs();
            if (!queuedJobs.length || scope.activeCount >= scope.providerCapacity) return false;
            const lanes = getEnabledReservedPriorityLanes();
            if (lanes.some((lane) => countLaneQueuedJobs(lane) > 0)) {
                return true;
            }
            if (hasBlockingReservedLaneWork(lanes)) return false;
            if (countNormalRunningJobs(lanes) >= getNormalDispatchCapacity(lanes)) return false;
            return queuedJobs.some((job) => !jobMatchesAnyReservedLane(job, lanes));
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
