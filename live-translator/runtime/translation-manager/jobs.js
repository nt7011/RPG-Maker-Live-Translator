// Translation manager support: jobs.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    function createController(scope = {}) {
        const { MIN_PRIORITY, applySubstitutePlaintextBeforeTranslationRules, preview, requestTimeoutMs, substitutePlaintextBeforeTranslationRules, jobsByKey, queuedJobs } = scope;
        const { schedulePump } = scope.controllerFacades.queue;

        function createJob(request) {
            const providerText = applySubstitutePlaintextBeforeTranslationRules(request.normalized, substitutePlaintextBeforeTranslationRules);
            const providerInputChanged = providerText !== request.normalized;
            const job = {
                id: `job:${++scope.requestSequence}`,
                key: request.normalized,
                text: providerText,
                providerInputChanged,
                status: 'queued',
                createdAt: Date.now(),
                queuedAt: Date.now(),
                queueSeq: ++scope.queueSequence,
                effectivePriority: request.priority,
                subscribers: new Map(),
                controller: null,
                abortError: null,
                stream: request.stream === true,
                timeoutMs: request.timeoutMs || requestTimeoutMs,
                hook: request.hook || '',
                source: request.source || '',
                sourceHint: 'provider',
                metadata: request.metadata || {},
                attempt: 0,
                retryCount: 0,
                lastRetryAt: null,
                nextRetryDelayMs: 0,
                lastDeltaAt: null,
                deltaCount: 0,
                lastPartialLength: 0,
                lastDeltaEventAt: 0,
                lastError: null,
            };
            jobsByKey.set(job.key, job);
            queuedJobs.push(job);
            scope.translationIntel.increment('queued');
            scope.translationIntel.recordLazy('job.queued', () => ({
                jobId: job.id,
                hook: job.hook,
                priority: job.effectivePriority,
                stream: job.stream,
                textPreview: preview(job.key, 72),
                providerTextPreview: providerInputChanged ? preview(providerText, 72) : '',
            }));
            schedulePump();
            return job;
        }

        function recomputeJobPriority(job) {
            let nextPriority = MIN_PRIORITY;
            let hasSubscriber = false;
            let wantsStream = false;
            let timeoutMs = requestTimeoutMs;
            job.subscribers.forEach((subscriber) => {
                if (!subscriber.active) return;
                hasSubscriber = true;
                nextPriority = Math.max(nextPriority, subscriber.priority);
                wantsStream = wantsStream || subscriber.stream === true;
                if (subscriber.timeoutMs && subscriber.timeoutMs > timeoutMs) timeoutMs = subscriber.timeoutMs;
            });
            job.effectivePriority = hasSubscriber ? nextPriority : MIN_PRIORITY;
            if (job.status === 'queued') job.stream = wantsStream;
            job.timeoutMs = timeoutMs;
            scope.translationIntel.schedulePublish();
            return hasSubscriber;
        }

        function removeQueuedJob(job) {
            const index = queuedJobs.indexOf(job);
            if (index >= 0) queuedJobs.splice(index, 1);
        }

        function forgetJobKey(job) {
            if (job && jobsByKey.get(job.key) === job) jobsByKey.delete(job.key);
        }

        function getActiveSubscribers(job) {
            if (!job || !job.subscribers) return [];
            return Array.from(job.subscribers.values()).filter((subscriber) => subscriber && subscriber.active);
        }

        function hasActiveSubscribers(job) {
            return getActiveSubscribers(job).length > 0;
        }

        function compareQueuedJobsForDispatch(a, b) {
            if (b.effectivePriority !== a.effectivePriority) return b.effectivePriority - a.effectivePriority;
            return b.queueSeq - a.queueSeq;
        }

        function getSchedulerPolicy() {
            if (!scope.schedulerPolicy) {
                throw new Error('[TranslationService] Scheduler policy is unavailable.');
            }
            return scope.schedulerPolicy;
        }

        function getEnabledReservedPriorityLanes() {
            return getSchedulerPolicy().getEnabledReservedPriorityLanes();
        }

        function subscriberMatchesReservedLane(subscriber, lane) {
            return getSchedulerPolicy().subscriberMatchesReservedLane(subscriber, lane);
        }

        function jobMatchesReservedLane(job, lane) {
            return getSchedulerPolicy().jobMatchesReservedLane(job, lane);
        }

        function jobMatchesAnyReservedLane(job, lanes) {
            return getSchedulerPolicy().jobMatchesAnyReservedLane(job, lanes);
        }

        function countReservedRunningJobs(lanes) {
            return getSchedulerPolicy().countReservedRunningJobs(lanes);
        }

        function countLaneRunningJobs(lane) {
            return getSchedulerPolicy().countLaneRunningJobs(lane);
        }

        function countLaneQueuedJobs(lane) {
            return getSchedulerPolicy().countLaneQueuedJobs(lane);
        }

        function countReservedSlots(lanes) {
            return getSchedulerPolicy().countReservedSlots(lanes);
        }

        function getNormalDispatchCapacity(lanes) {
            return getSchedulerPolicy().getNormalDispatchCapacity(lanes);
        }

        function countNormalRunningJobs(lanes) {
            return getSchedulerPolicy().countNormalRunningJobs(lanes);
        }

        function hasBlockingReservedLaneWork(lanes) {
            return getSchedulerPolicy().hasBlockingReservedLaneWork(lanes);
        }

        function getReservedLaneDispatchState(lane) {
            return getSchedulerPolicy().getReservedLaneDispatchState(lane);
        }

        function getNormalDispatchState(lanes) {
            return getSchedulerPolicy().getNormalDispatchState(lanes);
        }

        function getQueueDispatchState(lanes) {
            return getSchedulerPolicy().getQueueDispatchState(lanes);
        }

        function getReservedPriorityLaneSnapshot() {
            return getSchedulerPolicy().getReservedPriorityLaneSnapshot();
        }

        return {
            createJob,
            recomputeJobPriority,
            removeQueuedJob,
            forgetJobKey,
            getActiveSubscribers,
            hasActiveSubscribers,
            compareQueuedJobsForDispatch,
            getEnabledReservedPriorityLanes,
            subscriberMatchesReservedLane,
            jobMatchesReservedLane,
            jobMatchesAnyReservedLane,
            countReservedRunningJobs,
            countLaneRunningJobs,
            countLaneQueuedJobs,
            countReservedSlots,
            getNormalDispatchCapacity,
            countNormalRunningJobs,
            hasBlockingReservedLaneWork,
            getReservedLaneDispatchState,
            getNormalDispatchState,
            getQueueDispatchState,
            getReservedPriorityLaneSnapshot,
        };
    }

    LiveTranslatorDefine({
        name: 'runtime.translationManager.jobs',
        factory() {
            return { create: createController };
        },
    });
})();
