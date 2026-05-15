// Translation manager support: jobs.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/jobs.js.');
    }

    function createController(scope = {}) {
        const { MIN_PRIORITY, applySubstitutePlaintextBeforeTranslationRules, clampPriority, preview, provider, requestTimeoutMs, reservedPriorityLanePolicies, substitutePlaintextBeforeTranslationRules, jobsByKey, queuedJobs } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { request, schedulePump } = Object.fromEntries(['request', 'schedulePump'].map((name) => [name, callScope(name)]));

        function createJob(request) {
            const providerText = applySubstitutePlaintextBeforeTranslationRules(request.normalized, substitutePlaintextBeforeTranslationRules);
            const providerInputChanged = providerText !== request.normalized;
            const job = {
                id: `job:${++scope.requestSequence}`,
                key: request.normalized,
                text: providerText,
                textPreview: preview(request.normalized, 72),
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
            scope.translationDiagnostics.increment('queued');
            scope.translationDiagnostics.record('job.queued', {
                jobId: job.id,
                hook: job.hook,
                priority: job.effectivePriority,
                stream: job.stream,
                textPreview: job.textPreview,
                providerTextPreview: providerInputChanged ? preview(providerText, 72) : '',
            });
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
            scope.translationDiagnostics.schedulePublish();
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

        function getEnabledReservedPriorityLanes() {
            return reservedPriorityLanePolicies.filter((lane) => scope.providerCapacity >= lane.enabledAtCapacity);
        }

        function subscriberMatchesReservedLane(subscriber, lane) {
            if (!subscriber || !subscriber.active || !lane) return false;
            if (clampPriority(subscriber.priority) < lane.priority) return false;
            if (!lane.hooks.length) return true;
            const hook = String(subscriber.hook || (subscriber.context && subscriber.context.hook) || '').trim();
            return lane.hooks.includes(hook);
        }

        function jobMatchesReservedLane(job, lane) {
            if (!job || !lane) return false;
            const activeSubscribers = getActiveSubscribers(job);
            if (activeSubscribers.length) {
                return activeSubscribers.some((subscriber) => subscriberMatchesReservedLane(subscriber, lane));
            }
            const hook = String(job.hook || '').trim();
            return clampPriority(job.effectivePriority) >= lane.priority
                && (!lane.hooks.length || lane.hooks.includes(hook));
        }

        function jobMatchesAnyReservedLane(job, lanes) {
            return (lanes || getEnabledReservedPriorityLanes()).some((lane) => jobMatchesReservedLane(job, lane));
        }

        function countReservedRunningJobs(lanes) {
            const enabledLanes = lanes || getEnabledReservedPriorityLanes();
            return Array.from(jobsByKey.values()).filter((job) => {
                return job && job.status === 'running' && jobMatchesAnyReservedLane(job, enabledLanes);
            }).length;
        }

        function countLaneRunningJobs(lane) {
            return Array.from(jobsByKey.values()).filter((job) => {
                return job && job.status === 'running' && jobMatchesReservedLane(job, lane);
            }).length;
        }

        function countLaneQueuedJobs(lane) {
            return queuedJobs.filter((job) => {
                return job && job.status === 'queued' && hasActiveSubscribers(job) && jobMatchesReservedLane(job, lane);
            }).length;
        }

        function countReservedSlots(lanes) {
            const total = (lanes || getEnabledReservedPriorityLanes()).reduce((sum, lane) => {
                return sum + Math.max(0, Math.floor(Number(lane.reservedSlots) || 0));
            }, 0);
            return Math.min(scope.providerCapacity, total);
        }

        function getNormalDispatchCapacity(lanes) {
            return Math.max(0, scope.providerCapacity - countReservedSlots(lanes));
        }

        function countNormalRunningJobs(lanes) {
            return Math.max(0, scope.activeCount - countReservedRunningJobs(lanes));
        }

        function hasBlockingReservedLaneWork(lanes) {
            return (lanes || getEnabledReservedPriorityLanes()).some((lane) => {
                return lane.blocksNormalDispatch === true
                    && (countLaneRunningJobs(lane) > 0 || countLaneQueuedJobs(lane) > 0);
            });
        }

        function getReservedPriorityLaneSnapshot() {
            return reservedPriorityLanePolicies.map((lane) => {
                const enabled = scope.providerCapacity >= lane.enabledAtCapacity;
                const running = enabled ? countLaneRunningJobs(lane) : 0;
                const queued = enabled ? countLaneQueuedJobs(lane) : 0;
                return {
                    name: lane.name,
                    enabled,
                    enabledAtCapacity: lane.enabledAtCapacity,
                    reservedSlots: lane.reservedSlots,
                    priority: lane.priority,
                    hooks: lane.hooks.slice(),
                    blocksNormalDispatch: lane.blocksNormalDispatch === true,
                    queued,
                    running,
                    available: enabled ? Math.max(0, lane.reservedSlots - running) : 0,
                };
            });
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
            getReservedPriorityLaneSnapshot,
        };
    }

    defineRuntimeModule('runtime.translationManagerJobs', { create: createController });
})();
