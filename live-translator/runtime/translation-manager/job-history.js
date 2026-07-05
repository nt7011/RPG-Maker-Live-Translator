// Translation scheduler job history store.
//
// Job histories are live Intel state. They are bounded by job and event count
// so the monitor can explain scheduler behavior without depending on the
// optional diagnostics plugin.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.translationManager.jobHistory',
        factory() {
            const DEFAULT_HISTORY_LIMIT = 40;
            const MAX_HISTORY_LIMIT = 200;
            const DEFAULT_JOB_LIMIT = 160;
            const MAX_JOB_LIMIT = 1000;
            const SANITIZE_ARRAY_LIMIT = 12;

            function createTranslationJobHistoryStore(options = {}) {
                const historyLimit = positiveInteger(options.historyLimit, DEFAULT_HISTORY_LIMIT, 1, MAX_HISTORY_LIMIT);
                const jobLimit = positiveInteger(options.jobLimit, DEFAULT_JOB_LIMIT, 1, MAX_JOB_LIMIT);
                const cloneEvent = typeof options.cloneEvent === 'function' ? options.cloneEvent : cloneEventRecord;
                const historiesByJobId = new Map();

                function recordJobEvent(event) {
                    const jobId = readJobId(event);
                    if (!jobId) return false;
                    const history = getHistory(jobId, true);
                    history.push(cloneEvent(event));
                    while (history.length > historyLimit) history.shift();
                    pruneJobs();
                    return true;
                }

                function getJobHistory(jobOrId) {
                    const jobId = readJobId(jobOrId);
                    if (!jobId) return [];
                    const history = historiesByJobId.get(jobId);
                    return Array.isArray(history) ? history.map(cloneEvent) : [];
                }

                function clear(jobIds) {
                    if (Array.isArray(jobIds)) {
                        jobIds.forEach((jobId) => {
                            const key = readJobId(jobId);
                            if (key) historiesByJobId.delete(key);
                        });
                        return true;
                    }
                    historiesByJobId.clear();
                    return true;
                }

                function getHistory(jobId, create) {
                    let history = historiesByJobId.get(jobId);
                    if (!history && create) {
                        history = [];
                        historiesByJobId.set(jobId, history);
                    }
                    return Array.isArray(history) ? history : [];
                }

                function pruneJobs() {
                    while (historiesByJobId.size > jobLimit) {
                        const oldest = historiesByJobId.keys().next();
                        if (oldest.done) return;
                        historiesByJobId.delete(oldest.value);
                    }
                }

                return {
                    recordJobEvent,
                    getJobHistory,
                    clear,
                };
            }

            function readJobId(value) {
                if (typeof value === 'string' && value) return value;
                if (!value || typeof value !== 'object') return '';
                if (value.jobId !== undefined && value.jobId !== null) return String(value.jobId);
                if (value.id !== undefined && value.id !== null) return String(value.id);
                return '';
            }

            function cloneEventRecord(event) {
                const source = event && typeof event === 'object' ? event : {};
                return sanitize(source, 3);
            }

            function positiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
                const numeric = Number(value);
                if (!Number.isInteger(numeric)) return fallback;
                return Math.max(min, Math.min(max, numeric));
            }

            function sanitize(value, depth = 2) {
                if (value === undefined) return undefined;
                if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
                if (depth <= 0) return String(value);
                if (Array.isArray(value)) return value.slice(0, SANITIZE_ARRAY_LIMIT).map((item) => sanitize(item, depth - 1));
                if (typeof value === 'object') {
                    const output = {};
                    Object.keys(value).slice(0, 40).forEach((key) => {
                        const sanitized = sanitize(value[key], depth - 1);
                        if (sanitized !== undefined) output[key] = sanitized;
                    });
                    return output;
                }
                return String(value);
            }

            return {
                createTranslationJobHistoryStore,
            };
        },
    });
})();
