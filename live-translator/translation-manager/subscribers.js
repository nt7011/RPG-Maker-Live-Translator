// Translation manager support: subscribers.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/subscribers.js.');
    }

    function createController(scope = {}) {
        const { noop, clampPriority, createAbortError, isAbortErrorLike, createDeferred, decorateHandle, provider, requestTimeoutMs, completed, subscribersByRecordId } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { logTranslationEvent, requestContext, recomputeJobPriority, removeQueuedJob, forgetJobKey, request, schedulePump } = Object.fromEntries(['logTranslationEvent', 'requestContext', 'recomputeJobPriority', 'removeQueuedJob', 'forgetJobKey', 'request', 'schedulePump'].map((name) => [name, callScope(name)]));

        function unregisterSubscriber(subscriber) {
            if (!subscriber || !subscriber.recordId) return;
            const list = subscribersByRecordId.get(subscriber.recordId);
            if (!list) return;
            list.delete(subscriber);
            if (!list.size) subscribersByRecordId.delete(subscriber.recordId);
        }

        function settleSubscriber(subscriber, kind, value) {
            if (!subscriber || !subscriber.active) return false;
            subscriber.active = false;
            subscriber.status = kind === 'resolve' ? 'completed' : isAbortErrorLike(value) ? 'canceled' : 'failed';
            unregisterSubscriber(subscriber);
            subscriber.job.subscribers.delete(subscriber.id);
            scope.translationDiagnostics.record(`subscriber.${subscriber.status}`, {
                jobId: subscriber.job.id,
                subscriberId: subscriber.id,
                recordId: subscriber.recordId || '',
                hook: subscriber.hook || '',
                message: kind === 'resolve' ? '' : scope.translationDiagnostics.formatError(value),
            });
            if (kind === 'resolve') {
                logTranslationEvent('completed', subscriber.job.key, value, subscriber.context);
                subscriber.deferred.resolve(value);
            } else {
                const message = value && value.message ? value.message : String(value || 'translation failed');
                logTranslationEvent(isAbortErrorLike(value) ? 'aborted' : 'error', subscriber.job.key, message, subscriber.context);
                subscriber.deferred.reject(value);
            }
            return true;
        }

        function cancelSubscriber(subscriber, reason = 'canceled', options = {}) {
            if (!subscriber || !subscriber.active) return false;
            const job = subscriber.job;
            const error = createAbortError(reason);
            const cancelOptions = normalizeCancelOptions(options);
            scope.translationDiagnostics.increment('canceled');
            settleSubscriber(subscriber, 'reject', error);
            const stillActive = recomputeJobPriority(job);
            if (!stillActive && cancelOptions.abortJob === true) {
                job.abortError = error;
                if (job.status === 'queued') {
                    removeQueuedJob(job);
                    forgetJobKey(job);
                    job.status = 'canceled';
                    scope.translationDiagnostics.record('job.canceled', {
                        jobId: job.id,
                        hook: job.hook || '',
                        reason: scope.translationDiagnostics.formatError(error),
                        status: 'queued',
                    });
                    scope.translationDiagnostics.rememberJob(job, 'canceled', {
                        reason: scope.translationDiagnostics.formatError(error),
                    });
                } else if (job.status === 'running' && job.controller && typeof job.controller.abort === 'function') {
                    try { job.controller.abort(error); } catch (_) {}
                    scope.translationDiagnostics.record('job.abort_requested', {
                        jobId: job.id,
                        hook: job.hook || '',
                        reason: scope.translationDiagnostics.formatError(error),
                    });
                }
            } else if (!stillActive) {
                job.detached = true;
                scope.translationDiagnostics.record('job.detached', {
                    jobId: job.id,
                    hook: job.hook || '',
                    reason: scope.translationDiagnostics.formatError(error),
                    status: job.status || '',
                });
                if (job.status === 'queued') schedulePump();
            } else if (job.status === 'queued') {
                schedulePump();
            }
            scope.translationDiagnostics.schedulePublish();
            return true;
        }

        function setSubscriberPriority(subscriber, priority, reason = '') {
            if (!subscriber || !subscriber.active) return false;
            const nextPriority = clampPriority(priority);
            if (subscriber.priority === nextPriority) return false;
            const previousPriority = subscriber.priority;
            subscriber.priority = nextPriority;
            subscriber.lastPriorityChangedAt = Date.now();
            subscriber.lastPriorityReason = String(reason || '');
            recomputeJobPriority(subscriber.job);
            scope.translationDiagnostics.increment('priorityChanges');
            scope.translationDiagnostics.record('priority.changed', {
                jobId: subscriber.job.id,
                subscriberId: subscriber.id,
                recordId: subscriber.recordId || '',
                hook: subscriber.hook || '',
                previousPriority,
                priority: nextPriority,
                effectivePriority: subscriber.job.effectivePriority,
                reason: reason || '',
            });
            // Priority changes can alter lane membership even for running jobs.
            // A demoted priority-1000 job should immediately release the normal
            // queue gate, while a promoted queued job may become eligible for the
            // reserved lane.
            schedulePump();
            return true;
        }

        function createSubscriber(job, request) {
            const deferred = createDeferred();
            const subscriber = {
                id: `sub:${++scope.subscriberSequence}`,
                job,
                active: true,
                status: job.status === 'running' ? 'running' : 'queued',
                priority: request.priority,
                stream: request.stream === true,
                timeoutMs: request.timeoutMs || requestTimeoutMs,
                onDelta: request.onDelta,
                recordId: request.recordId || '',
                hook: request.hook || '',
                source: request.source || '',
                metadata: request.metadata || {},
                createdAt: Date.now(),
                lastPriorityChangedAt: null,
                lastPriorityReason: '',
                context: requestContext(request),
                deferred,
            };

            job.subscribers.set(subscriber.id, subscriber);
            if (subscriber.recordId) {
                if (!subscribersByRecordId.has(subscriber.recordId)) {
                    subscribersByRecordId.set(subscriber.recordId, new Set());
                }
                subscribersByRecordId.get(subscriber.recordId).add(subscriber);
            }
            recomputeJobPriority(job);
            scope.translationDiagnostics.record('subscriber.added', {
                jobId: job.id,
                subscriberId: subscriber.id,
                recordId: subscriber.recordId,
                hook: subscriber.hook,
                priority: subscriber.priority,
                stream: subscriber.stream,
                jobStatus: job.status,
            });

            const handle = decorateHandle({
                id: subscriber.id,
                jobId: job.id,
                key: job.key,
                sourceHint: job.sourceHint || 'provider',
                promise: deferred.promise,
                cancel: (reason, options) => cancelSubscriber(subscriber, reason, options),
                setPriority: (priority, reason) => setSubscriberPriority(subscriber, priority, reason),
                getPriority: () => subscriber.priority,
                getStatus: () => subscriber.status,
                getSourceHint: () => job.sourceHint || 'provider',
            });

            if (request.signal && typeof request.signal.addEventListener === 'function') {
                if (request.signal.aborted) {
                    cancelSubscriber(subscriber, request.signal.reason || 'request signal aborted', { abortJob: true });
                } else {
                    const abortHandler = () => cancelSubscriber(subscriber, request.signal.reason || 'request signal aborted', { abortJob: true });
                    request.signal.addEventListener('abort', abortHandler, { once: true });
                    deferred.promise.finally(() => {
                        try { request.signal.removeEventListener('abort', abortHandler); } catch (_) {}
                    }).catch(noop);
                }
            }

            return handle;
        }

        function cancelByRecordId(recordId, reason = 'record canceled', options = {}) {
            const list = subscribersByRecordId.get(String(recordId || ''));
            if (!list || !list.size) return 0;
            let count = 0;
            Array.from(list).forEach((subscriber) => {
                if (cancelSubscriber(subscriber, reason, options)) count += 1;
            });
            return count;
        }

        function normalizeCancelOptions(options) {
            return options && typeof options === 'object' ? options : {};
        }

        function setPriorityByRecordId(recordId, priority, reason = '') {
            const list = subscribersByRecordId.get(String(recordId || ''));
            if (!list || !list.size) return 0;
            let count = 0;
            Array.from(list).forEach((subscriber) => {
                if (setSubscriberPriority(subscriber, priority, reason)) count += 1;
            });
            return count;
        }

        return {
            unregisterSubscriber,
            settleSubscriber,
            cancelSubscriber,
            setSubscriberPriority,
            createSubscriber,
            cancelByRecordId,
            setPriorityByRecordId,
        };
    }

    defineRuntimeModule('runtime.translationManagerSubscribers', { create: createController });
})();
