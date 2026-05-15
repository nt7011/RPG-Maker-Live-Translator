// Translation manager support: runner.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/runner.js.');
    }

    function createController(scope = {}) {
        const { createAbortError, isAbortErrorLike, logger, preview, provider, maxRetries, retryBaseMs, retryMaxMs, requestTimeoutMs, completed } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { finalizeProviderSuccess, forgetJobKey, settleSubscriber, schedulePump } = Object.fromEntries(['finalizeProviderSuccess', 'forgetJobKey', 'settleSubscriber', 'schedulePump'].map((name) => [name, callScope(name)]));

        function createJobController(job) {
            if (typeof AbortController !== 'function') return null;
            const controller = new AbortController();
            job.controller = controller;
            return controller;
        }

        function notifyDelta(job, partial) {
            job.deltaCount = (job.deltaCount || 0) + 1;
            job.lastDeltaAt = Date.now();
            job.lastPartialLength = String(partial || '').length;
            scope.translationDiagnostics.increment('streamDeltas');
            if (!job.lastDeltaEventAt || job.lastDeltaAt - job.lastDeltaEventAt >= 1000) {
                job.lastDeltaEventAt = job.lastDeltaAt;
                scope.translationDiagnostics.record('stream.delta', {
                    jobId: job.id,
                    hook: scope.translationDiagnostics.getJobHook(job),
                    partialLength: job.lastPartialLength,
                    deltaCount: job.deltaCount,
                });
            } else {
                scope.translationDiagnostics.schedulePublish();
            }
            job.subscribers.forEach((subscriber) => {
                if (!subscriber.active || typeof subscriber.onDelta !== 'function') return;
                try {
                    subscriber.onDelta(partial);
                } catch (error) {
                    logger.warn(`[TranslationService] onDelta failed for ${subscriber.id}`, error);
                }
            });
        }

        function startJob(job) {
            if (!job || job.status !== 'queued') return;
            scope.activeCount += 1;
            job.status = 'running';
            job.startedAt = Date.now();
            const controller = createJobController(job);
            job.subscribers.forEach((subscriber) => {
                if (subscriber.active) subscriber.status = 'running';
            });
            scope.translationDiagnostics.increment('dispatched');
            scope.translationDiagnostics.record('job.dispatched', {
                jobId: job.id,
                hook: scope.translationDiagnostics.getJobHook(job),
                priority: job.effectivePriority,
                stream: job.stream,
                subscribers: scope.translationDiagnostics.getActiveSubscribers(job).length,
                capacity: scope.providerCapacity,
                running: scope.activeCount,
                textPreview: preview(job.key, 72),
            });

            runProviderWithRetries(job, controller ? controller.signal : undefined)
                .then((translated) => {
                    finalizeProviderSuccess(job, translated);
                    job.status = 'completed';
                    scope.translationDiagnostics.increment('completed');
                    scope.translationDiagnostics.record('job.completed', {
                        jobId: job.id,
                        hook: scope.translationDiagnostics.getJobHook(job),
                        priority: job.effectivePriority,
                        stream: job.stream,
                        subscribers: scope.translationDiagnostics.getActiveSubscribers(job).length,
                        elapsedMs: Date.now() - (job.startedAt || Date.now()),
                        textPreview: preview(job.key, 72),
                    });
                    scope.translationDiagnostics.rememberJob(job, 'completed');
                    job.subscribers.forEach((subscriber) => {
                        settleSubscriber(subscriber, 'resolve', translated);
                    });
                })
                .catch((error) => {
                    job.status = isAbortErrorLike(error) ? 'canceled' : 'failed';
                    job.lastError = error;
                    if (job.status === 'failed') scope.translationDiagnostics.increment('failed');
                    scope.translationDiagnostics.record(`job.${job.status}`, {
                        jobId: job.id,
                        hook: scope.translationDiagnostics.getJobHook(job),
                        priority: job.effectivePriority,
                        stream: job.stream,
                        elapsedMs: Date.now() - (job.startedAt || Date.now()),
                        error: scope.translationDiagnostics.formatError(error),
                        textPreview: preview(job.key, 72),
                    });
                    scope.translationDiagnostics.rememberJob(job, job.status, {
                        error: scope.translationDiagnostics.formatError(error),
                    });
                    job.subscribers.forEach((subscriber) => {
                        settleSubscriber(subscriber, 'reject', error);
                    });
                })
                .finally(() => {
                    forgetJobKey(job);
                    scope.activeCount = Math.max(0, scope.activeCount - 1);
                    scope.translationDiagnostics.schedulePublish();
                    schedulePump();
                });
        }

        async function runProviderWithRetries(job, signal) {
            let attempt = 0;
            while (true) {
                attempt += 1;
                job.attempt = attempt;
                job.nextRetryDelayMs = 0;
                scope.translationDiagnostics.schedulePublish();
                try {
                    const translated = await provider.translate({
                        text: job.text,
                        key: job.key,
                        stream: job.stream,
                        signal,
                        timeoutMs: job.timeoutMs || requestTimeoutMs,
                        priority: job.effectivePriority,
                        onDelta: (partial) => notifyDelta(job, partial),
                    });
                    if (typeof translated !== 'string' || !translated.trim()) {
                        const emptyError = new Error('Translator returned no usable text.');
                        try { emptyError.code = 'EMPTY_TRANSLATION_OUTPUT'; } catch (_) {}
                        try { emptyError.retryable = true; } catch (_) {}
                        throw emptyError;
                    }
                    logger.debug(`[TranslationService] ${job.id} completed "${preview(job.key)}"`);
                    return translated;
                } catch (error) {
                    if (isAbortErrorLike(error)) {
                        throw error;
                    }
                    job.lastError = error;
                    if (!shouldRetry(error, attempt)) throw error;
                    const waitMs = computeRetryDelayMs(error, attempt);
                    job.retryCount = (job.retryCount || 0) + 1;
                    job.lastRetryAt = Date.now();
                    job.nextRetryDelayMs = waitMs;
                    scope.translationDiagnostics.increment('retries');
                    scope.translationDiagnostics.record('job.retry', {
                        jobId: job.id,
                        hook: scope.translationDiagnostics.getJobHook(job),
                        attempt,
                        retryInMs: waitMs,
                        error: scope.translationDiagnostics.formatError(error),
                    });
                    logger.warn(`[TranslationService] ${job.id} attempt ${attempt} failed; retrying in ${waitMs}ms.`, error);
                    await waitForRetry(waitMs, signal);
                }
            }
        }

        function shouldRetry(error, attempt) {
            if (attempt > maxRetries) return false;
            if (!error) return false;
            if (error.retryable === true) return true;
            const status = Number(error.status);
            if (status === 429 || (status >= 500 && status <= 599)) return true;
            if (error.code === 'ETIMEDOUT' || error.code === 'EMPTY_TRANSLATION_OUTPUT' || error.code === 'EMPTY_STREAM_OUTPUT') return true;
            const message = error && error.message ? error.message : String(error);
            return /\b(network|fetch|timeout|temporarily|unavailable|ECONNRESET|ECONNREFUSED)\b/i.test(message);
        }

        function computeRetryDelayMs(error, attempt) {
            const retryAfter = Number(error && error.retryAfter);
            if (Number.isFinite(retryAfter) && retryAfter > 0) {
                return Math.min(retryMaxMs, Math.floor(retryAfter * 1000));
            }
            const exponential = retryBaseMs * Math.pow(2, Math.max(0, attempt - 1));
            const jitter = Math.floor(Math.random() * Math.min(250, retryBaseMs));
            return Math.min(retryMaxMs, Math.floor(exponential + jitter));
        }

        function waitForRetry(ms, signal) {
            return new Promise((resolve, reject) => {
                if (signal && signal.aborted) {
                    reject(signal.reason || createAbortError());
                    return;
                }
                let timeoutId = null;
                const cleanup = () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    timeoutId = null;
                    if (signal && typeof signal.removeEventListener === 'function') {
                        try { signal.removeEventListener('abort', onAbort); } catch (_) {}
                    }
                };
                const onAbort = () => {
                    cleanup();
                    reject(signal.reason || createAbortError());
                };
                timeoutId = setTimeout(() => {
                    cleanup();
                    resolve();
                }, Math.max(0, ms));
                if (signal && typeof signal.addEventListener === 'function') {
                    signal.addEventListener('abort', onAbort, { once: true });
                }
            });
        }

        return {
            createJobController,
            notifyDelta,
            startJob,
            runProviderWithRetries,
            shouldRetry,
            computeRetryDelayMs,
            waitForRetry,
        };
    }

    defineRuntimeModule('runtime.translationManagerRunner', { create: createController });
})();
