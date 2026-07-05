// Translation scheduler Intel.
// Keeps GUI-facing queue snapshots and recent scheduler events out of the translation manager.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.translationIntel',
        requires: {
            jobHistory: 'runtime.translationManager.jobHistory',
        },
        factory({ jobHistory }, { scope: globalScope }) {
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

            const noopJobHistoryStore = Object.freeze({
                recordJobEvent() { return false; },
                getJobHistory() { return []; },
                clear() { return false; },
            });

            function resolveJobHistoryStore(globalScopeRef, options) {
                const factory = jobHistory && typeof jobHistory.createTranslationJobHistoryStore === 'function'
                    ? jobHistory.createTranslationJobHistoryStore
                    : null;
                if (!factory) return noopJobHistoryStore;
                try {
                    return normalizeJobHistoryStore(factory(Object.assign({
                        globalScope: globalScopeRef,
                    }, options || {})));
                } catch (_) {
                    return noopJobHistoryStore;
                }
            }

            function normalizeJobHistoryStore(store) {
                if (!store || typeof store !== 'object') return noopJobHistoryStore;
                return {
                    recordJobEvent: typeof store.recordJobEvent === 'function'
                        ? store.recordJobEvent.bind(store)
                        : noopJobHistoryStore.recordJobEvent,
                    getJobHistory: typeof store.getJobHistory === 'function'
                        ? store.getJobHistory.bind(store)
                        : noopJobHistoryStore.getJobHistory,
                    clear: typeof store.clear === 'function'
                        ? store.clear.bind(store)
                        : noopJobHistoryStore.clear,
                };
            }

            function createTranslationIntel(options = {}) {
                const provider = options.provider || null;
                const disk = options.disk || {};
                const precacheStore = options.precacheStore || null;
                const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
                const preview = typeof options.preview === 'function' ? options.preview : defaultPreview;
                const getState = typeof options.getState === 'function' ? options.getState : () => ({});
                const isCacheOnlyProvider = options.isCacheOnlyProvider === true;
                const requestTimeoutMs = Number(options.requestTimeoutMs) || 0;
                const capacityRefreshMs = Number(options.capacityRefreshMs) || 0;
                const jobHistoryStore = resolveJobHistoryStore(globalScope, {
                    historyLimit: JOB_HISTORY_LIMIT,
                    jobLimit: JOB_LIMIT + PAST_JOB_LIMIT,
                    cloneEvent: (event) => sanitize(event, SANITIZE_DEPTH),
                });

                let eventSequence = 0;
                let publishQueued = false;
                let capturedIntelDirty = false;
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
                    const policy = globalScope.LiveTranslatorIntelPolicy;
                    if (policy && typeof policy.getSnapshotPolicy === 'function') {
                        return policy.getSnapshotPolicy(Object.assign({
                            globalScope,
                            settings,
                        }, optionsArg || {})) || createClosedIntelPolicy();
                    }
                    return createClosedIntelPolicy();
                }

                function createClosedIntelPolicy() {
                    return {
                        surface: false,
                        publish: false,
                        captureEvents: false,
                        limits: {},
                    };
                }

                function isSurfaceEnabled() {
                    return getSnapshotPolicy().surface === true;
                }

                function shouldCaptureEvents() {
                    const policy = getSnapshotPolicy();
                    return policy.surface === true && policy.captureEvents === true;
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

                function getProviderStatus() {
                    if (!provider || typeof provider.getStatus !== 'function') return {};
                    try {
                        const status = provider.getStatus();
                        return status && typeof status === 'object' ? sanitize(status, 2) : {};
                    } catch (error) {
                        return { error: formatError(error) };
                    }
                }

                function readStatusString(status, key) {
                    const value = status && Object.prototype.hasOwnProperty.call(status, key)
                        ? status[key]
                        : '';
                    return typeof value === 'string' && value.trim() ? value.trim() : '';
                }

                function readStatusInteger(status, key) {
                    const value = status && Object.prototype.hasOwnProperty.call(status, key)
                        ? Number(status[key])
                        : 0;
                    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
                }

                function isProviderCapacityVerified(state, status) {
                    if (state.providerCapacityVerified !== true) return false;
                    if (status && Object.prototype.hasOwnProperty.call(status, 'capacityVerified')) {
                        return status.capacityVerified === true;
                    }
                    return true;
                }

                function record(type, details = {}) {
                    const capture = getCapturePolicy();
                    if (!capture.surface) {
                        clearCapturedIntel();
                        return null;
                    }
                    if (!capture.captureEvents && !capture.captureHistories) {
                        schedulePublish();
                        return null;
                    }
                    const event = sanitize(Object.assign({
                        id: `intel:${++eventSequence}`,
                        at: Date.now(),
                        type: String(type || 'event'),
                    }, details || {}), SANITIZE_DEPTH);
                    if (capture.captureEvents) {
                        events.push(event);
                        while (events.length > EVENT_LIMIT) events.shift();
                    }
                    if (capture.captureHistories) recordJobHistoryEvent(event);
                    capturedIntelDirty = true;
                    schedulePublish();
                    return event;
                }

                function recordLazy(type, detailsFactory) {
                    const capture = getCapturePolicy();
                    if (!capture.surface) {
                        clearCapturedIntel();
                        return null;
                    }
                    if (!capture.captureEvents && !capture.captureHistories) {
                        schedulePublish();
                        return null;
                    }
                    let details = {};
                    try {
                        details = typeof detailsFactory === 'function' ? detailsFactory() : detailsFactory;
                    } catch (error) {
                        details = { error: formatError(error) };
                    }
                    return record(type, details && typeof details === 'object' ? details : {});
                }

                function increment(name, amount = 1) {
                    if (!isSurfaceEnabled()) {
                        clearCapturedIntel();
                        return;
                    }
                    if (!Object.prototype.hasOwnProperty.call(counters, name)) counters[name] = 0;
                    counters[name] += Number.isFinite(Number(amount)) ? Number(amount) : 1;
                    capturedIntelDirty = true;
                    schedulePublish();
                }

                function schedulePublish() {
                    if (!isSurfaceEnabled()) {
                        publishQueued = false;
                        clearCapturedIntel();
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
                    if (!isSurfaceEnabled()) {
                        clearCapturedIntel();
                        try { delete globalScope.LiveTranslatorTranslationIntelSnapshot; } catch (_) {
                            try { globalScope.LiveTranslatorTranslationIntelSnapshot = null; } catch (__) {}
                        }
                        return null;
                    }
                    try {
                        globalScope.LiveTranslatorTranslationIntelSnapshot = getSnapshot();
                    } catch (_) {}
                    return globalScope.LiveTranslatorTranslationIntelSnapshot || null;
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
                    if (optionsArg.captureHistories !== true) return [];
                    const jobId = typeof jobOrId === 'string'
                        ? jobOrId
                        : (jobOrId && jobOrId.id ? String(jobOrId.id) : '');
                    if (!jobId) return [];
                    return jobHistoryStore.getJobHistory(jobId);
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
                    const includeDetails = optionsArg.captureEvents === true;
                    const includeHistory = optionsArg.captureHistories === true && optionsArg.includeHistory !== false;
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
                        history: includeHistory ? getJobHistory(job, optionsArg) : [],
                    };
                }

                function rememberJob(job, terminalStatus, details = {}) {
                    if (!isSurfaceEnabled()) {
                        clearCapturedIntel();
                        return null;
                    }
                    const policy = getSnapshotPolicy();
                    if (!job || !job.id) return null;
                    const remembered = Object.assign({}, snapshotJob(job, null, Object.assign({}, policy, {
                        includeHistory: false,
                    })), {
                        status: terminalStatus || job.status || 'completed',
                        terminalAt: Date.now(),
                        terminalReason: details && details.reason ? String(details.reason) : '',
                        lastError: details && details.error ? String(details.error) : formatError(job.lastError),
                    });
                    remembered.history = [];
                    pastJobs.push(remembered);
                    capturedIntelDirty = true;
                    while (pastJobs.length > getPastJobRetentionLimit(policy)) pastJobs.shift();
                    schedulePublish();
                    return remembered;
                }

                function snapshotPastJob(job, optionsArg = {}) {
                    const includeDetails = optionsArg.captureEvents === true;
                    const includeHistory = optionsArg.captureHistories === true;
                    if (includeDetails || includeHistory) return Object.assign({}, job, {
                        subscriberRecords: Array.isArray(job.subscriberRecords) ? job.subscriberRecords.slice() : [],
                        metadata: includeDetails && job.metadata && typeof job.metadata === 'object' ? Object.assign({}, job.metadata) : {},
                        history: includeHistory ? getJobHistory(job.id, optionsArg) : [],
                    });
                    const light = Object.assign({}, job);
                    light.metadata = {};
                    light.history = [];
                    light.subscriberRecords = Array.isArray(job.subscriberRecords) ? job.subscriberRecords.slice(0, 12) : [];
                    return light;
                }

                function getPrecacheIntel() {
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
                    if (!policy.captureEvents) events.length = 0;
                    if (!policy.captureHistories) clearJobHistories();
                    const state = getState() || {};
                    const limit = Math.max(1, Math.min(JOB_LIMIT, Number(optionsObject.jobLimit) || JOB_LIMIT));
                    const pastLimit = Math.max(1, Math.min(limit, getPastJobRetentionLimit(policy)));
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
                    const providerStatus = getProviderStatus();

                    return {
                        updatedAt: Date.now(),
                        provider: {
                            kind: provider && provider.kind ? String(provider.kind) : 'unknown',
                            cacheOnly: isCacheOnlyProvider,
                            apiResponding: providerStatus.apiResponding === true,
                            modelCatalogAt: readStatusInteger(providerStatus, 'modelCatalogAt'),
                            modelCatalogError: readStatusString(providerStatus, 'modelCatalogError'),
                            modelCount: readStatusInteger(providerStatus, 'modelCount'),
                            loadedLlmInstanceCount: readStatusInteger(providerStatus, 'loadedLlmInstanceCount'),
                            modelSelectionReady: providerStatus.modelSelectionReady === true,
                            modelSelectionError: readStatusString(providerStatus, 'modelSelectionError'),
                            statusUpdatedAt: readStatusInteger(providerStatus, 'statusUpdatedAt'),
                            modelKey: readStatusString(providerStatus, 'modelKey'),
                            modelInstanceId: readStatusString(providerStatus, 'modelInstanceId'),
                            modelAuthor: readStatusString(providerStatus, 'modelAuthor'),
                            modelName: readStatusString(providerStatus, 'modelName'),
                            quantization: readStatusString(providerStatus, 'quantization'),
                            selectedVariant: readStatusString(providerStatus, 'selectedVariant'),
                            capacity: providerCapacity,
                            capacityVerified: isProviderCapacityVerified(state, providerStatus),
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
                            precache: getPrecacheIntel(),
                        },
                        jobs: {
                            queued: queuedForDispatch.slice(0, limit).map((job, index) => snapshotJob(job, index + 1, policy)),
                            running: runningJobs.slice(0, limit).map((job) => snapshotJob(job, null, policy)),
                            past: pastJobs.slice(-pastLimit).reverse().map((job) => snapshotPastJob(job, policy)),
                        },
                        reservedLanes,
                        priorityBuckets: breakdowns.priorityBuckets,
                        hooks: breakdowns.hooks,
                        counters: Object.assign({}, counters),
                        events: policy.captureEvents ? events.slice(-EVENT_LIMIT) : [],
                        intelSurface: policy.surface === true,
                    };
                }

                function getPastJobRetentionLimit(policy) {
                    const configured = Number(policy && policy.limits && policy.limits.pastJobs);
                    if (Number.isFinite(configured) && configured > 0) return Math.max(1, Math.min(PAST_JOB_LIMIT, Math.round(configured)));
                    return PAST_JOB_LIMIT;
                }

                function clearCapturedIntel() {
                    if (!capturedIntelDirty && eventSequence === 0 && !events.length && !pastJobs.length) return false;
                    events.length = 0;
                    pastJobs.length = 0;
                    clearJobHistories();
                    eventSequence = 0;
                    Object.keys(counters).forEach((key) => {
                        counters[key] = 0;
                    });
                    capturedIntelDirty = false;
                    return true;
                }

                function recordJobHistoryEvent(event) {
                    if (!jobHistoryStore || typeof jobHistoryStore.recordJobEvent !== 'function') return false;
                    return jobHistoryStore.recordJobEvent(event);
                }

                function getCapturePolicy() {
                    const policy = getSnapshotPolicy();
                    const surface = policy.surface === true;
                    return {
                        surface,
                        captureEvents: surface && policy.captureEvents === true,
                        captureHistories: surface && policy.captureHistories === true,
                    };
                }

                function clearJobHistories() {
                    if (!jobHistoryStore || typeof jobHistoryStore.clear !== 'function') return false;
                    return jobHistoryStore.clear();
                }

                const api = {
                    record,
                    recordLazy,
                    increment,
                    schedulePublish,
                    publish,
                    getSnapshot,
                    clearIntel: clearCapturedIntel,
                    formatError,
                    getActiveSubscribers,
                    getJobHook,
                    getJobHistory,
                    rememberJob,
                };

                try {
                    globalScope.LiveTranslatorTranslationIntel = {
                        getSnapshot,
                        snapshot: getSnapshot,
                        publish,
                        clearIntel: clearCapturedIntel,
                    };
                } catch (_) {}
                publish();
                return api;
            }

            return {
                createTranslationIntel,
            };
        },
    });
})();
