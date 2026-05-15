// Runtime and precache-count stats for the Precacher UI.
// The page controller supplies filesystem, DOM, and formatting callbacks while this module owns counter updates.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    function createStatsController(context) {
        const {
            state,
            getPaths,
            isFile,
            readJsonFile,
            addLog,
            formatError,
            setText,
            createEmptyMetrics,
            formatDuration,
            formatNumber,
            formatRate,
            normalizeMetric,
            normalizeNullableMetric,
        } = context;

        function readPrecacheStats() {
                if (!isFile(paths.outputFile)) {
                    return { total: 0, translated: 0, untranslated: 0 };
                }
                const records = readJsonFile(paths.outputFile);
                if (!Array.isArray(records)) {
                    return { total: 0, translated: 0, untranslated: 0 };
                }
        
                let translated = 0;
                for (const record of records) {
                    if (record && typeof record.codedTranslation === 'string' && record.codedTranslation.trim()) {
                        translated += 1;
                    }
                }
                return {
                    total: records.length,
                    translated,
                    untranslated: Math.max(0, records.length - translated),
                };
            }
        
        function refreshPrecacheStats() {
                try {
                    const stats = readPrecacheStats();
                    setPrecacheStats(stats);
                } catch (err) {
                    addLog(`[PrecacheUI] Failed to read precache.json: ${formatError(err)}`);
                }
        
                renderStats({ force: true });
                return state.precacheStats;
            }
        
        function setPrecacheStats(stats) {
                const total = normalizeMetric(stats && stats.total, 0);
                const translated = Math.min(total, normalizeMetric(stats && stats.translated, 0));
                state.precacheStats = {
                    total,
                    translated,
                    untranslated: Math.max(0, total - translated),
                };
                if (!state.busy || state.operation !== 'translate') {
                    state.baselineTranslated = translated;
                }
            }
        
        function updatePrecacheStatsFromProgress(progress) {
                if (!progress || state.operation !== 'translate') return;
        
                const total = Math.max(
                    state.precacheStats.total,
                    normalizeMetric(progress.totalRecords, state.precacheStats.total)
                );
                const updatedRecords = normalizeMetric(progress.updatedRecords, 0);
                const translated = Math.min(total, state.baselineTranslated + updatedRecords);
        
                state.precacheStats = {
                    total,
                    translated,
                    untranslated: Math.max(0, total - translated),
                };
            }
        
        function incrementTranslatedRecords(count) {
                const increment = normalizeMetric(count, 0);
                if (increment <= 0) return;
                const total = state.precacheStats.total;
                const translated = Math.min(total, state.precacheStats.translated + increment);
                state.precacheStats = {
                    total,
                    translated,
                    untranslated: Math.max(0, total - translated),
                };
            }
        
        function renderStats(options = {}) {
                if (!options.force && state.operation === 'translate') {
                    const now = Date.now();
                    const elapsed = now - state.lastStatsRenderAt;
                    if (elapsed < PRECACHE_STATS_REFRESH_INTERVAL_MS) {
                        if (!state.statsRenderTimer) {
                            state.statsRenderTimer = setTimeout(() => {
                                state.statsRenderTimer = null;
                                renderStats({ force: true });
                            }, PRECACHE_STATS_REFRESH_INTERVAL_MS - elapsed);
                        }
                        return;
                    }
                }
        
                if (state.statsRenderTimer) {
                    clearTimeout(state.statsRenderTimer);
                    state.statsRenderTimer = null;
                }
                state.lastStatsRenderAt = Date.now();
                setText('total-strings', formatNumber(state.precacheStats.total));
                setText('translated-count', formatNumber(state.precacheStats.translated));
                setText('untranslated-count', formatNumber(state.precacheStats.untranslated));
                setText('failed-count', formatNumber(state.metrics.failed));
                setText('active-workers', formatNumber(state.metrics.activeWorkers));
                setText('completed-batches', formatNumber(state.metrics.completedBatches));
                setText('queue-length', formatNumber(state.metrics.queueLength));
                setText('token-progress', `${formatNumber(state.metrics.successfulTokens)} / ${formatNumber(state.metrics.totalTokens)}`);
                setText('tokens-per-second', formatRate(state.metrics.tokensPerSecond));
                setText('eta-remaining', formatDuration(state.metrics.etaSeconds));
            }
        
        function resetRuntimeMetrics() {
                state.metrics = createEmptyMetrics();
                refreshPrecacheStats();
            }
        
        function applyTranslationProgress(progress) {
                if (!progress || typeof progress !== 'object') return;
                state.metrics.failed = normalizeMetric(progress.failed, state.metrics.failed);
                state.metrics.activeWorkers = normalizeMetric(progress.activeWorkers, state.metrics.activeWorkers);
                state.metrics.completedBatches = normalizeMetric(progress.completedBatches, state.metrics.completedBatches);
                state.metrics.queueLength = normalizeMetric(progress.queueLength, state.metrics.queueLength);
                state.metrics.successfulTokens = normalizeMetric(progress.successfulTokens, state.metrics.successfulTokens);
                state.metrics.totalTokens = normalizeMetric(progress.totalTokens, state.metrics.totalTokens);
                state.metrics.tokensPerSecond = normalizeMetric(progress.tokensPerSecond, state.metrics.tokensPerSecond);
                state.metrics.etaSeconds = normalizeNullableMetric(progress.etaSeconds, state.metrics.etaSeconds);
                updatePrecacheStatsFromProgress(progress);
                renderStats();
            }

        return {
            applyTranslationProgress,
            incrementTranslatedRecords,
            readPrecacheStats,
            refreshPrecacheStats,
            renderStats,
            resetRuntimeMetrics,
            setPrecacheStats,
            updatePrecacheStatsFromProgress,
        };
    }

    globalScope.PrecacheUiStats = Object.freeze({ createStatsController });
})();
