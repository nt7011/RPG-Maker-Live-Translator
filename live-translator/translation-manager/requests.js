// Translation manager support: requests.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/requests.js.');
    }

    function createController(scope = {}) {
        const { OVERRIDE_REGEX_SETTING, normalizeCacheKey, createImmediateHandle, preview, provider, precacheStore, completed, jobsByKey } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { describeIgnoreTranslationRegex, describeSkip, logTranslationEvent, normalizeRequest, requestContext, lookupCompleted, lookupOverrideTranslationRegex, resolvePrecacheShortcut, createJob, createSubscriber, schedulePump } = Object.fromEntries(['describeIgnoreTranslationRegex', 'describeSkip', 'logTranslationEvent', 'normalizeRequest', 'requestContext', 'lookupCompleted', 'lookupOverrideTranslationRegex', 'resolvePrecacheShortcut', 'createJob', 'createSubscriber', 'schedulePump'].map((name) => [name, callScope(name)]));

        function lookup(normalized) {
            const key = normalizeCacheKey(normalized);
            if (!key) return null;
            const override = lookupOverrideTranslationRegex(key);
            if (override) {
                return {
                    source: OVERRIDE_REGEX_SETTING,
                    sourceHint: OVERRIDE_REGEX_SETTING,
                    translation: override.translation,
                };
            }
            const ignored = describeIgnoreTranslationRegex(key);
            if (ignored.skip) return null;
            const precached = precacheStore && typeof precacheStore.lookup === 'function'
                ? precacheStore.lookup(key)
                : null;
            if (precached && typeof precached.translation === 'string') {
                return { source: 'precache', translation: precached.translation };
            }
            const cached = lookupCompleted(key);
            if (cached !== null) return { source: 'cache', translation: cached };
            return null;
        }

        function request(input, maybeOptions = {}) {
            const normalizedRequest = normalizeRequest(input, maybeOptions);
            const context = requestContext(normalizedRequest);
            scope.translationDiagnostics.increment('requests');
            scope.translationDiagnostics.record('request.received', {
                hook: normalizedRequest.hook,
                source: normalizedRequest.source,
                priority: normalizedRequest.priority,
                stream: normalizedRequest.stream,
                recordId: normalizedRequest.recordId,
                textPreview: preview(normalizedRequest.normalized, 72),
                textLength: normalizedRequest.normalized.length,
            });
            logTranslationEvent('request', normalizedRequest.normalized, null, context);

            const override = lookupOverrideTranslationRegex(normalizedRequest.normalized);
            if (override) {
                scope.translationDiagnostics.increment('overrideHits');
                scope.translationDiagnostics.record('request.override', {
                    hook: normalizedRequest.hook,
                    recordId: normalizedRequest.recordId,
                    source: OVERRIDE_REGEX_SETTING,
                    regex: override.regex,
                    regexIndex: override.regexIndex,
                    textPreview: preview(normalizedRequest.normalized, 72),
                });
                logTranslationEvent('override', normalizedRequest.normalized, override.translation, Object.assign({}, context, override, {
                    source: OVERRIDE_REGEX_SETTING,
                    sourceHint: OVERRIDE_REGEX_SETTING,
                }));
                return createImmediateHandle(override.translation, {
                    key: normalizedRequest.normalized,
                    status: 'completed',
                    priority: normalizedRequest.priority,
                    sourceHint: OVERRIDE_REGEX_SETTING,
                });
            }

            const ignored = describeIgnoreTranslationRegex(normalizedRequest.normalized);
            if (ignored.skip) {
                const reason = ignored.reason || 'translation filter';
                scope.translationDiagnostics.increment('skipped');
                scope.translationDiagnostics.record('request.skipped', {
                    hook: normalizedRequest.hook,
                    recordId: normalizedRequest.recordId,
                    reason,
                    source: 'filter',
                    textPreview: preview(normalizedRequest.normalized, 72),
                });
                logTranslationEvent('skip', normalizedRequest.normalized, reason, Object.assign({}, context, ignored, {
                    source: 'filter',
                    skipReason: reason,
                }));
                return createImmediateHandle(normalizedRequest.normalized, {
                    key: normalizedRequest.normalized,
                    status: 'skipped',
                    priority: normalizedRequest.priority,
                    sourceHint: 'filter',
                });
            }

            const precached = resolvePrecacheShortcut(normalizedRequest.normalized, context);
            if (precached !== null) {
                scope.translationDiagnostics.increment('precacheHits');
                scope.translationDiagnostics.record('request.precache_hit', {
                    hook: normalizedRequest.hook,
                    recordId: normalizedRequest.recordId,
                    textPreview: preview(normalizedRequest.normalized, 72),
                });
                return createImmediateHandle(precached, {
                    key: normalizedRequest.normalized,
                    status: 'completed',
                    priority: normalizedRequest.priority,
                    sourceHint: 'precache',
                });
            }

            const cached = lookupCompleted(normalizedRequest.normalized);
            if (cached !== null) {
                scope.translationDiagnostics.increment('cacheHits');
                scope.translationDiagnostics.record('request.cache_hit', {
                    hook: normalizedRequest.hook,
                    recordId: normalizedRequest.recordId,
                    textPreview: preview(normalizedRequest.normalized, 72),
                });
                logTranslationEvent('cache_hit', normalizedRequest.normalized, cached, Object.assign({}, context, { source: 'cache' }));
                return createImmediateHandle(cached, {
                    key: normalizedRequest.normalized,
                    status: 'completed',
                    priority: normalizedRequest.priority,
                    sourceHint: 'cache',
                });
            }

            const skipInfo = describeSkip(normalizedRequest.normalized);
            if (skipInfo.skip) {
                const reason = skipInfo.reason || 'translation filter';
                scope.translationDiagnostics.increment('skipped');
                scope.translationDiagnostics.record('request.skipped', {
                    hook: normalizedRequest.hook,
                    recordId: normalizedRequest.recordId,
                    reason,
                    source: 'filter',
                    textPreview: preview(normalizedRequest.normalized, 72),
                });
                logTranslationEvent('skip', normalizedRequest.normalized, reason, Object.assign({}, context, skipInfo, {
                    source: 'filter',
                    skipReason: reason,
                }));
                return createImmediateHandle(normalizedRequest.normalized, {
                    key: normalizedRequest.normalized,
                    status: 'skipped',
                    priority: normalizedRequest.priority,
                    sourceHint: 'filter',
                });
            }

            let job = jobsByKey.get(normalizedRequest.normalized);
            const streamUpgrade = shouldStartStreamUpgradeJob(job, normalizedRequest);
            const isJoin = !!job && !streamUpgrade;
            if (!job || streamUpgrade) {
                const upgradedFromJob = streamUpgrade ? job : null;
                job = createJob(normalizedRequest);
                if (upgradedFromJob) {
                    scope.translationDiagnostics.record('job.stream_upgrade_queued', {
                        jobId: job.id,
                        upgradedFromJobId: upgradedFromJob.id,
                        hook: normalizedRequest.hook,
                        recordId: normalizedRequest.recordId,
                        priority: normalizedRequest.priority,
                        textPreview: preview(normalizedRequest.normalized, 72),
                    });
                }
                logTranslationEvent('cache_miss', normalizedRequest.normalized, null, Object.assign({}, context, { source: 'provider' }));
            }

            const handle = createSubscriber(job, normalizedRequest);
            if (isJoin) {
                scope.translationDiagnostics.increment('joined');
                scope.translationDiagnostics.record('job.joined', {
                    jobId: job.id,
                    subscriberId: handle.id,
                    hook: normalizedRequest.hook,
                    recordId: normalizedRequest.recordId,
                    effectivePriority: job.effectivePriority,
                    stream: job.stream,
                });
                if (job.status === 'queued') schedulePump();
            }
            return handle;
        }

        function shouldStartStreamUpgradeJob(job, request) {
            return !!(job
                && job.status === 'running'
                && job.stream !== true
                && request
                && request.stream === true);
        }

        return {
            lookup,
            request,
            shouldStartStreamUpgradeJob,
        };
    }

    defineRuntimeModule('runtime.translationManagerRequests', { create: createController });
})();
