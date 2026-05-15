// Translation scheduler diagnostics.
// Keeps GUI-facing queue snapshots and recent scheduler events out of the translation manager.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/translation-diagnostics.js.');
    }

    const EVENT_LIMIT = 120;
    const JOB_LIMIT = 80;
    const PAST_JOB_LIMIT = 80;
    const JOB_HISTORY_LIMIT = 40;
    const SANITIZE_OBJECT_KEY_LIMIT = 64;
    const SANITIZE_NESTED_KEY_LIMIT = 32;
    const SANITIZE_ARRAY_LIMIT = 12;
    const SANITIZE_DEPTH = 3;

    function noop() {}

    function defaultPreview(text, max = 48) {
        const value = String(text ?? '').replace(/\s+/g, ' ').trim();
        return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`;
    }

    function createTranslationDiagnostics(options = {}) {
        const provider = options.provider || null;
        const disk = options.disk || {};
        const precacheStore = options.precacheStore || null;
        const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
        const preview = typeof options.preview === 'function' ? options.preview : defaultPreview;
        const getState = typeof options.getState === 'function' ? options.getState : () => ({});
        const isCacheOnlyProvider = options.isCacheOnlyProvider === true;
        const requestTimeoutMs = Number(options.requestTimeoutMs) || 0;
        const capacityRefreshMs = Number(options.capacityRefreshMs) || 0;

        let eventSequence = 0;
        let publishQueued = false;
        const events = [];
        const pastJobs = [];
        const counters = {
            requests: 0,
            cacheHits: 0,
            precacheHits: 0,
            skipped: 0,
            queued: 0,
            joined: 0,
            dispatched: 0,
            completed: 0,
            failed: 0,
            canceled: 0,
            retries: 0,
            priorityChanges: 0,
            streamDeltas: 0,
        };

        function getSnapshotPolicy(optionsArg = {}) {
            const policy = globalScope.LiveTranslatorDiagnosticsPolicy;
            if (policy && typeof policy.getSnapshotPolicy === 'function') {
                return policy.getSnapshotPolicy(Object.assign({
                    globalScope,
                    settings,
                }, optionsArg || {})) || { surface: true, detailView: true };
            }
            const guiState = globalScope.LiveTranslatorGuiState;
            const surface = !guiState || typeof guiState !== 'object'
                ? true
                : guiState.translatorOpen === true;
            const diagnostics = settings.diagnostics && typeof settings.diagnostics === 'object'
                ? settings.diagnostics
                : null;
            const performanceMode = diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'performanceMode')
                ? diagnostics.performanceMode === true
                : false;
            return {
                surface,
                detailView: surface
                    && !performanceMode
                    && optionsArg.detailView !== false
                    && optionsArg.includeDetails !== false,
                performanceMode,
            };
        }

        function isSurfaceEnabled() {
            return getSnapshotPolicy().surface === true;
        }

        function isDetailViewEnabled() {
            return getSnapshotPolicy().detailView === true;
        }

        function sanitize(value, depth = 2) {
            if (value === undefined) return undefined;
            if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
            if (depth <= 0) return String(value);
            if (Array.isArray(value)) {
                return value.slice(0, SANITIZE_ARRAY_LIMIT).map((item) => sanitize(item, depth - 1));
            }
            if (typeof value === 'object') {
                const output = {};
                const keyLimit = depth >= SANITIZE_DEPTH ? SANITIZE_OBJECT_KEY_LIMIT : SANITIZE_NESTED_KEY_LIMIT;
                Object.keys(value).slice(0, keyLimit).forEach((key) => {
                    const sanitized = sanitize(value[key], depth - 1);
                    if (sanitized !== undefined) output[key] = sanitized;
                });
                return output;
            }
            return String(value);
        }

        function formatError(error) {
            if (!error) return '';
            return error.message ? String(error.message) : String(error);
        }

        function record(type, details = {}) {
            if (!isSurfaceEnabled()) {
                clearCapturedDiagnostics();
                return null;
            }
            if (!isDetailViewEnabled()) {
                clearDetailDiagnostics();
                return null;
            }
            const event = sanitize(Object.assign({
                id: `diag:${++eventSequence}`,
                at: Date.now(),
                type: String(type || 'event'),
            }, details || {}), SANITIZE_DEPTH);
            events.push(event);
            while (events.length > EVENT_LIMIT) events.shift();
            schedulePublish();
            return event;
        }

        function increment(name, amount = 1) {
            if (!isSurfaceEnabled()) {
                clearCapturedDiagnostics();
                return;
            }
            if (!isDetailViewEnabled()) {
                clearDetailDiagnostics();
                return;
            }
            if (!Object.prototype.hasOwnProperty.call(counters, name)) counters[name] = 0;
            counters[name] += Number.isFinite(Number(amount)) ? Number(amount) : 1;
            schedulePublish();
        }

        function schedulePublish() {
            const policy = getSnapshotPolicy();
            if (!policy.surface) {
                publishQueued = false;
                clearCapturedDiagnostics();
                return;
            }
            if (!policy.detailView) {
                publishQueued = false;
                clearDetailDiagnostics();
                return;
            }
            if (publishQueued) return;
            publishQueued = true;
            Promise.resolve().then(() => {
                publishQueued = false;
                publish();
            }).catch(noop);
        }

        function publish() {
            const policy = getSnapshotPolicy();
            if (!policy.surface) {
                clearCapturedDiagnostics();
                return null;
            }
            const snapshot = getSnapshot();
            if (!policy.detailView) return snapshot;
            try {
                globalScope.LiveTranslatorTranslationDiagnosticsSnapshot = snapshot;
            } catch (_) {}
            return globalScope.LiveTranslatorTranslationDiagnosticsSnapshot || null;
        }

        function getActiveSubscribers(job) {
            if (!job || !job.subscribers) return [];
            return Array.from(job.subscribers.values()).filter((subscriber) => subscriber && subscriber.active);
        }

        function getJobHook(job) {
            const activeSubscribers = getActiveSubscribers(job);
            const highest = activeSubscribers
                .slice()
                .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))[0];
            return (highest && highest.hook) || (job && job.hook) || '';
        }

        function getJobHistory(jobOrId, optionsArg = {}) {
            if (optionsArg.detailView === false) return [];
            const jobId = typeof jobOrId === 'string'
                ? jobOrId
                : (jobOrId && jobOrId.id ? String(jobOrId.id) : '');
            if (!jobId) return [];
            return events
                .filter((event) => event && event.jobId === jobId)
                .slice(-JOB_HISTORY_LIMIT);
        }

        function compareQueuedJobsForDispatch(a, b) {
            if (b.effectivePriority !== a.effectivePriority) return b.effectivePriority - a.effectivePriority;
            return b.queueSeq - a.queueSeq;
        }

        function getSortedQueuedJobs(queuedJobs) {
            return (Array.isArray(queuedJobs) ? queuedJobs : [])
                .filter((job) => job && job.status === 'queued' && getActiveSubscribers(job).length > 0)
                .slice()
                .sort(compareQueuedJobsForDispatch);
        }

        function priorityBucket(priority) {
            const numeric = Number(priority);
            const value = Number.isFinite(numeric) ? Math.max(0, Math.min(1000, Math.round(numeric))) : 500;
            if (value >= 900) return '900-1000';
            if (value >= 700) return '700-899';
            if (value >= 500) return '500-699';
            if (value >= 250) return '250-499';
            return '0-249';
        }

        function createBreakdownRow(name) {
            return {
                name,
                queued: 0,
                running: 0,
                stream: 0,
                subscribers: 0,
            };
        }

        function summarizeBreakdowns(jobs) {
            const byPriority = new Map();
            const byHook = new Map();
            for (const job of jobs || []) {
                if (!job || (job.status !== 'queued' && job.status !== 'running')) continue;
                const activeSubscribers = getActiveSubscribers(job);
                const statusKey = job.status === 'running' ? 'running' : 'queued';
                const bucket = priorityBucket(job.effectivePriority);
                const hook = getJobHook(job) || 'unknown';
                if (!byPriority.has(bucket)) byPriority.set(bucket, createBreakdownRow(bucket));
                if (!byHook.has(hook)) byHook.set(hook, createBreakdownRow(hook));
                for (const row of [byPriority.get(bucket), byHook.get(hook)]) {
                    row[statusKey] += 1;
                    row.subscribers += activeSubscribers.length;
                    if (job.stream) row.stream += 1;
                }
            }
            return {
                priorityBuckets: Array.from(byPriority.values()).sort((a, b) => b.name.localeCompare(a.name)),
                hooks: Array.from(byHook.values()).sort((a, b) => {
                    const activityDiff = (b.running + b.queued) - (a.running + a.queued);
                    return activityDiff || a.name.localeCompare(b.name);
                }),
            };
        }

        function snapshotSubscriber(subscriber) {
            return {
                id: subscriber.id,
                status: subscriber.status || '',
                recordId: subscriber.recordId || '',
                hook: subscriber.hook || (subscriber.context && subscriber.context.hook) || '',
                source: subscriber.source || '',
                priority: subscriber.priority,
                stream: subscriber.stream === true,
                createdAt: subscriber.createdAt || null,
                lastPriorityChangedAt: subscriber.lastPriorityChangedAt || null,
                lastPriorityReason: subscriber.lastPriorityReason || '',
            };
        }

        function snapshotJob(job, queuePosition = null, optionsArg = {}) {
            const includeDetails = optionsArg.detailView !== false;
            const activeSubscribers = getActiveSubscribers(job);
            const terminalAt = job.terminalAt || job.completedAt || job.failedAt || job.canceledAt || null;
            return {
                id: job.id,
                status: job.status || '',
                hook: getJobHook(job),
                source: job.source || '',
                textPreview: preview(job.key || job.text || '', 72),
                textLength: String(job.key || job.text || '').length,
                providerTextPreview: job.providerInputChanged ? preview(job.text || '', 72) : '',
                createdAt: job.createdAt || null,
                queuedAt: job.queuedAt || job.createdAt || null,
                startedAt: job.startedAt || null,
                queuePosition,
                queueSeq: job.queueSeq || 0,
                effectivePriority: job.effectivePriority,
                priorityBucket: priorityBucket(job.effectivePriority),
                stream: job.stream === true,
                timeoutMs: job.timeoutMs || requestTimeoutMs,
                attempt: job.attempt || 0,
                retryCount: job.retryCount || 0,
                lastRetryAt: job.lastRetryAt || null,
                nextRetryDelayMs: job.nextRetryDelayMs || 0,
                lastDeltaAt: job.lastDeltaAt || null,
                deltaCount: job.deltaCount || 0,
                lastPartialLength: job.lastPartialLength || 0,
                lastError: formatError(job.lastError),
                subscribers: activeSubscribers.length,
                totalSubscribers: job.subscribers ? job.subscribers.size : 0,
                subscriberRecords: activeSubscribers.map(snapshotSubscriber).slice(0, 12),
                metadata: includeDetails ? sanitize(job.metadata || {}, 2) : {},
                terminalAt,
                terminalReason: job.terminalReason || '',
                history: includeDetails ? getJobHistory(job, optionsArg) : [],
            };
        }

        function rememberJob(job, terminalStatus, details = {}) {
            if (!isSurfaceEnabled()) {
                clearCapturedDiagnostics();
                return null;
            }
            const policy = getSnapshotPolicy();
            if (!job || !job.id) return null;
            const remembered = Object.assign({}, snapshotJob(job, null, policy), {
                status: terminalStatus || job.status || 'completed',
                terminalAt: Date.now(),
                terminalReason: details && details.reason ? String(details.reason) : '',
                lastError: details && details.error ? String(details.error) : formatError(job.lastError),
            });
            remembered.history = policy.detailView ? getJobHistory(job.id, policy) : [];
            pastJobs.push(remembered);
            while (pastJobs.length > PAST_JOB_LIMIT) pastJobs.shift();
            schedulePublish();
            return remembered;
        }

        function snapshotPastJob(job, optionsArg = {}) {
            const includeDetails = optionsArg.detailView !== false;
            if (includeDetails) return Object.assign({}, job, {
                subscriberRecords: Array.isArray(job.subscriberRecords) ? job.subscriberRecords.slice() : [],
                metadata: job.metadata && typeof job.metadata === 'object' ? Object.assign({}, job.metadata) : {},
                history: Array.isArray(job.history) ? job.history.slice() : [],
            });
            const light = Object.assign({}, job);
            light.metadata = {};
            light.history = [];
            light.subscriberRecords = Array.isArray(job.subscriberRecords) ? job.subscriberRecords.slice(0, 12) : [];
            return light;
        }

        function getPrecacheDiagnostics() {
            if (!precacheStore || typeof precacheStore.getStats !== 'function') {
                return {
                    active: false,
                    records: 0,
                    translatedRecords: 0,
                    exactKeys: 0,
                };
            }
            try {
                const stats = precacheStore.getStats() || {};
                return {
                    active: precacheStore.active === true,
                    records: Number(stats.records) || 0,
                    translatedRecords: Number(stats.translatedRecords) || 0,
                    exactKeys: Number(stats.exactKeys) || 0,
                };
            } catch (_) {
                return {
                    active: precacheStore.active === true,
                    records: 0,
                    translatedRecords: 0,
                    exactKeys: 0,
                    error: 'precache stats unavailable',
                };
            }
        }

        function getSnapshot(optionsArg = {}) {
            const optionsObject = optionsArg && typeof optionsArg === 'object' ? optionsArg : {};
            const policy = getSnapshotPolicy(optionsObject);
            if (!policy.detailView) {
                clearDetailDiagnostics();
                trimPastJobDetails();
            }
            const state = getState() || {};
            const limit = Math.max(1, Math.min(JOB_LIMIT, Number(optionsObject.jobLimit) || JOB_LIMIT));
            const jobs = Array.isArray(state.jobs) ? state.jobs : [];
            const queuedForDispatch = getSortedQueuedJobs(state.queuedJobs);
            const runningJobs = jobs
                .filter((job) => job && job.status === 'running')
                .sort((a, b) => (Number(a.startedAt) || 0) - (Number(b.startedAt) || 0));
            const activeSubscriberCount = jobs.reduce((count, job) => count + getActiveSubscribers(job).length, 0);
            const totalSubscriberCount = jobs.reduce((count, job) => count + (job && job.subscribers ? job.subscribers.size : 0), 0);
            const streamJobs = jobs.filter((job) => job && job.stream === true && (job.status === 'queued' || job.status === 'running'));
            const streamRunning = streamJobs.filter((job) => job.status === 'running');
            const breakdowns = summarizeBreakdowns(jobs);
            const providerCapacity = Number(state.providerCapacity) || 0;
            const activeCount = Number(state.activeCount) || 0;
            const completedSize = Number(state.completedSize) || 0;
            const reservedLanes = Array.isArray(state.reservedPriorityLanes) ? state.reservedPriorityLanes : [];

            return {
                updatedAt: Date.now(),
                provider: {
                    kind: provider && provider.kind ? String(provider.kind) : 'unknown',
                    cacheOnly: isCacheOnlyProvider,
                    capacity: providerCapacity,
                    running: activeCount,
                    available: Math.max(0, providerCapacity - activeCount),
                    refreshingCapacity: state.capacityRefreshing === true,
                    capacityExpiresAt: state.capacityExpiresAt || 0,
                    capacityRefreshMs,
                    lastCapacityRefreshAt: state.lastCapacityRefreshAt || 0,
                    lastCapacityRefreshError: state.lastCapacityRefreshError || '',
                },
                summary: {
                    queued: queuedForDispatch.length,
                    running: runningJobs.length,
                    jobs: jobs.length,
                    pastJobs: pastJobs.length,
                    activeSubscribers: activeSubscriberCount,
                    subscribers: totalSubscriberCount,
                    streamJobs: streamJobs.length,
                    streamRunning: streamRunning.length,
                    completedCacheEntries: completedSize,
                    pumpScheduled: state.pumpScheduled === true,
                    pumpRunning: state.pumpRunning === true,
                },
                cache: {
                    completed: completedSize,
                    diskEnabled: disk.enabled === true,
                    precache: getPrecacheDiagnostics(),
                },
                jobs: {
                    queued: queuedForDispatch.slice(0, limit).map((job, index) => snapshotJob(job, index + 1, policy)),
                    running: runningJobs.slice(0, limit).map((job) => snapshotJob(job, null, policy)),
                    past: pastJobs.slice(-limit).reverse().map((job) => snapshotPastJob(job, policy)),
                },
                reservedLanes,
                priorityBuckets: breakdowns.priorityBuckets,
                hooks: breakdowns.hooks,
                counters: Object.assign({}, counters),
                events: policy.detailView ? events.slice(-EVENT_LIMIT) : [],
                detailView: policy.detailView === true,
            };
        }

        function clearCapturedDiagnostics() {
            events.length = 0;
            pastJobs.length = 0;
            eventSequence = 0;
            resetCounters();
            clearPublishedSnapshot();
        }

        function clearDetailDiagnostics() {
            events.length = 0;
            eventSequence = 0;
            resetCounters();
            clearPublishedSnapshot();
        }

        function trimPastJobDetails() {
            pastJobs.forEach((job) => {
                if (!job || typeof job !== 'object') return;
                job.metadata = {};
                job.history = [];
                if (Array.isArray(job.subscriberRecords)) {
                    job.subscriberRecords = job.subscriberRecords.slice(0, 12);
                }
            });
        }

        function resetCounters() {
            Object.keys(counters).forEach((key) => {
                counters[key] = 0;
            });
        }

        function clearPublishedSnapshot() {
            try { delete globalScope.LiveTranslatorTranslationDiagnosticsSnapshot; } catch (_) {
                try { globalScope.LiveTranslatorTranslationDiagnosticsSnapshot = null; } catch (__) {}
            }
        }

        const api = {
            record,
            increment,
            schedulePublish,
            publish,
            getSnapshot,
            clearDiagnostics: clearCapturedDiagnostics,
            formatError,
            getActiveSubscribers,
            getJobHook,
            getJobHistory,
            rememberJob,
        };

        try {
            globalScope.LiveTranslatorTranslationDiagnostics = {
                getSnapshot,
                snapshot: getSnapshot,
                publish,
                clearDiagnostics: clearCapturedDiagnostics,
            };
        } catch (_) {}
        publish();
        return api;
    }

    defineRuntimeModule('runtime.translationDiagnostics', {
        createTranslationDiagnostics,
    });
})();
