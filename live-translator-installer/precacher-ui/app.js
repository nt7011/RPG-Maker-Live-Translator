(() => {
    'use strict';

    const PRECACHE_STATS_REFRESH_INTERVAL_MS = 5000;

    const refs = {};
    const state = {
        busy: false,
        operation: '',
        abortController: null,
        logLines: [],
        pollTimer: null,
        uiSettingsLoaded: false,
        uiSettingsSaveTimer: null,
        statsRenderTimer: null,
        lastStatsRenderAt: 0,
        logRenderTimer: null,
        lastLogRenderAt: 0,
        metrics: createEmptyMetrics(),
        precacheStats: createEmptyPrecacheStats(),
        baselineTranslated: 0,
        preflightAutoCollapsed: false,
    };

    let fs = null;
    let path = null;
    let precacher = null;
    let pretranslator = null;
    let paths = null;

    function createEmptyMetrics() {
        return {
            failed: 0,
            activeWorkers: 0,
            completedBatches: 0,
            queueLength: 0,
            successfulTokens: 0,
            totalTokens: 0,
            tokensPerSecond: 0,
            etaSeconds: null,
        };
    }

    function createEmptyPrecacheStats() {
        return {
            total: 0,
            translated: 0,
            untranslated: 0,
        };
    }

    function initRefs() {
        for (const element of document.querySelectorAll('[id]')) {
            refs[element.id] = element;
        }
    }

    function getNodeRequire() {
        if (typeof require === 'function') return require;
        if (globalThis.nw && typeof nw.require === 'function') return nw.require;
        return null;
    }

    function initNode() {
        const req = getNodeRequire();
        if (!req) throw new Error('Node APIs are unavailable. Open this window from NW.js.');

        fs = req('fs');
        path = req('path');

        const supportDir = resolveSupportDir();
        const precacherDir = path.join(supportDir, 'precacher');

        paths = {
            gameRoot: process.cwd(),
            supportDir,
            precacherDir,
            dataDir: resolveDataDir(process.cwd()),
            outputFile: path.join(precacherDir, 'precache.json'),
            rejectedFile: path.join(precacherDir, 'precache-rejected.json'),
            translatorConfig: path.join(supportDir, 'translator.json'),
            settingsFile: path.join(supportDir, 'settings.json'),
            uiSettingsFile: path.join(supportDir, 'precacher-ui.json'),
        };

        precacher = req(path.join(precacherDir, 'precacher.js'));
        pretranslator = req(path.join(precacherDir, 'pretranslator.js'));
    }

    function resolveSupportDir() {
        const explicitPath = trimTrailingSeparator(getQueryValue('supportPath'));
        addLog(`[PrecacheUI] process.cwd(): ${process.cwd()}`);
        addLog(`[PrecacheUI] explicit supportPath: ${explicitPath || '(missing)'}`);

        if (!explicitPath) {
            throw new Error('Missing explicit live-translator supportPath from launcher.');
        }
        if (!isDirectory(explicitPath)) {
            throw new Error(`Explicit live-translator supportPath is not a directory: ${explicitPath}`);
        }
        return explicitPath;
    }

    function getQueryValue(name) {
        try {
            return new URL(window.location.href).searchParams.get(name) || '';
        } catch (_) {
            return '';
        }
    }

    function trimTrailingSeparator(value) {
        return String(value || '').replace(/[\\/]$/u, '');
    }

    function resolveDataDir(gameRoot) {
        const direct = path.join(gameRoot, 'data');
        if (isDirectory(direct)) return direct;
        const www = path.join(gameRoot, 'www', 'data');
        if (isDirectory(www)) return www;
        return direct;
    }

    function isFile(filePath) {
        try {
            return fs.statSync(filePath).isFile();
        } catch (_) {
            return false;
        }
    }

    function isDirectory(dirPath) {
        try {
            return fs.statSync(dirPath).isDirectory();
        } catch (_) {
            return false;
        }
    }

    function readJsonFile(filePath) {
        const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '');
        return JSON.parse(text);
    }

    function writeJsonFile(filePath, value) {
        fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    }

    function setText(id, value) {
        if (refs[id]) refs[id].textContent = String(value);
    }

    function setStatus(id, tone, value) {
        const el = refs[id];
        if (!el) return;
        el.className = `status ${tone}`;
        el.textContent = value;
    }

    function setRunState(tone, value) {
        refs['run-state'].className = `run-state ${tone}`;
        refs['run-state'].textContent = value;
    }

    function setPreflightOverview(tone, value) {
        if (!refs['preflight-overview']) return;
        refs['preflight-overview'].className = `summary-status ${tone}`;
        refs['preflight-overview'].textContent = value;
    }

    function formatNumber(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '0';
        return Math.round(numeric).toLocaleString('en-US');
    }

    function formatTime(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString();
    }

    function loadDefaultPrompt() {
        refs['system-prompt'].value = pretranslator.DEFAULT_BATCH_SYSTEM_PROMPT
            || pretranslator.buildBatchSystemPrompt({});
    }

    function loadUiSettings() {
        state.uiSettingsLoaded = false;
        let settings = null;

        if (isFile(paths.uiSettingsFile)) {
            try {
                settings = readJsonFile(paths.uiSettingsFile);
            } catch (err) {
                addLog(`[PrecacheUI] Failed to read precacher-ui.json: ${formatError(err)}`);
            }
        }

        if (settings && typeof settings === 'object') {
            applyUiSettings(settings);
        }
        state.uiSettingsLoaded = true;
    }

    function applyUiSettings(settings) {
        if (typeof settings.systemPrompt === 'string') {
            refs['system-prompt'].value = settings.systemPrompt;
        }

        const concurrency = normalizePositiveInteger(settings.concurrency);
        if (concurrency !== null) {
            refs.concurrency.value = String(concurrency);
        }

        const inputTokenBudget = firstPositiveInteger(
            settings.inputTokenBudget,
            settings.inputTokensPerRequest,
            settings.inputTokenPerRequest
        );
        if (inputTokenBudget !== null) {
            refs['token-budget'].value = String(inputTokenBudget);
        }
    }

    function collectUiSettings() {
        const concurrency = readPositiveInteger('concurrency');
        const inputTokenBudget = readPositiveInteger('token-budget');
        if (concurrency === null || inputTokenBudget === null) return null;
        return {
            version: 1,
            systemPrompt: refs['system-prompt'].value,
            concurrency,
            inputTokenBudget,
        };
    }

    function scheduleUiSettingsSave() {
        if (!state.uiSettingsLoaded || !paths) return;
        if (state.uiSettingsSaveTimer) clearTimeout(state.uiSettingsSaveTimer);
        state.uiSettingsSaveTimer = setTimeout(() => {
            state.uiSettingsSaveTimer = null;
            saveUiSettings({ silent: true });
        }, 350);
    }

    function flushUiSettingsSave() {
        if (!state.uiSettingsLoaded || !paths) return;
        saveUiSettings({ silent: true });
    }

    function saveUiSettings(options = {}) {
        if (!paths || !paths.uiSettingsFile) return false;
        if (state.uiSettingsSaveTimer) {
            clearTimeout(state.uiSettingsSaveTimer);
            state.uiSettingsSaveTimer = null;
        }

        const settings = collectUiSettings();
        if (!settings) return false;

        try {
            writeJsonFile(paths.uiSettingsFile, settings);
            return true;
        } catch (err) {
            if (!options.silent) {
                addLog(`[PrecacheUI] Failed to save precacher-ui.json: ${formatError(err)}`);
            }
            return false;
        }
    }

    async function refreshPreflight() {
        setPreflightOverview('neutral', 'Checking');

        const gameRootReady = isDirectory(paths.gameRoot);
        const dataDirReady = isDirectory(paths.dataDir);
        const outputReady = isFile(paths.outputFile);
        const translatorConfigReady = isFile(paths.translatorConfig);

        setText('game-root', paths.gameRoot);
        setText('data-folder', paths.dataDir);
        setText('output-file', paths.outputFile);
        setText('translator-config', paths.translatorConfig);

        setStatus('game-root-status', gameRootReady ? 'ok' : 'bad', gameRootReady ? 'ready' : 'missing');
        setStatus('data-folder-status', dataDirReady ? 'ok' : 'bad', dataDirReady ? 'ready' : 'missing');
        setStatus('output-file-status', outputReady ? 'ok' : 'warn', outputReady ? 'present' : 'not built');
        setStatus('translator-config-status', translatorConfigReady ? 'ok' : 'bad', translatorConfigReady ? 'ready' : 'missing');

        const modelReady = await refreshModelStatus();
        refreshExtractionFilterStatus();
        refreshExtractionSummary();
        refreshPrecacheStats();
        updatePreflightOverview({
            gameRootReady,
            dataDirReady,
            outputReady,
            translatorConfigReady,
            modelReady,
        });
        updateButtons();
    }

    function refreshExtractionFilterStatus() {
        const status = refs['extraction-filter-status'];
        if (!status) return null;

        const options = precacher.resolvePrecacheOptions({
            settingsFile: paths.settingsFile,
        });

        if (options.settingsReadError) {
            status.className = 'summary-status bad';
            status.textContent = 'CJK filter: settings error';
            status.title = `Could not read settings.json: ${formatError(options.settingsReadError)}`;
            return options;
        }

        if (options.disableCjkFilter) {
            status.className = 'summary-status warn';
            status.textContent = `CJK filter off (${options.minAsciiLetters}+ A-Z)`;
            status.title = 'settings.json translation.disableCjkFilter is true. Non-CJK strings need at least 3 A-Za-z characters.';
            return options;
        }

        status.className = 'summary-status ok';
        status.textContent = 'CJK filter on';
        status.title = 'Only strings containing CJK characters are extracted.';
        return options;
    }

    async function refreshModelStatus() {
        setStatus('local-model-status', 'neutral', 'checking');
        setText('local-model-detail', '-');

        try {
            const cfg = pretranslator.normalizeLocalConfig(readJsonFile(paths.translatorConfig));
            const selection = await pretranslator.resolveLocalChatModelSelection(cfg);
            setStatus('local-model-status', 'ok', 'connected');
            setText('local-model-detail', selection.expectedInstanceId);
            return true;
        } catch (err) {
            const message = formatError(err);
            const multiple = /has\s+[2-9][0-9]*\s+loaded LLM instance/i.test(message);
            setStatus('local-model-status', multiple ? 'warn' : 'bad', multiple ? 'multiple models loaded' : 'not connected');
            setText('local-model-detail', message);
            return false;
        }
    }

    function updatePreflightOverview(status) {
        const preflightReady = !!(status
            && status.gameRootReady
            && status.dataDirReady
            && status.outputReady
            && status.translatorConfigReady
            && status.modelReady);
        if (preflightReady) {
            setPreflightOverview('ok', 'All good');
            autoCollapsePreflightOnce();
            return;
        }

        const setupReady = !!(status
            && status.gameRootReady
            && status.dataDirReady
            && status.translatorConfigReady
            && status.modelReady);
        setPreflightOverview(setupReady ? 'warn' : 'bad', setupReady ? 'Build needed' : 'Needs attention');
    }

    function autoCollapsePreflightOnce() {
        if (state.preflightAutoCollapsed) return;
        state.preflightAutoCollapsed = true;
        if (refs['preflight-panel']) {
            refs['preflight-panel'].open = false;
        }
    }

    function refreshExtractionSummary() {
        if (isFile(paths.outputFile)) {
            try {
                const accepted = readJsonFile(paths.outputFile);
                if (Array.isArray(accepted)) setText('strings-extracted', formatNumber(accepted.length));
            } catch (_) {}
        }

        if (isFile(paths.rejectedFile)) {
            try {
                const rejected = readJsonFile(paths.rejectedFile);
                if (Array.isArray(rejected)) setText('strings-rejected', formatNumber(rejected.length));
            } catch (_) {}
        }

        if (!isFile(paths.outputFile)) return;
        try {
            const stat = fs.statSync(paths.outputFile);
            setText('last-extraction-time', formatTime(stat.mtime));
        } catch (_) {}
    }

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

    function formatRate(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) return '0.0';
        return numeric.toFixed(1);
    }

    function resetRuntimeMetrics() {
        state.metrics = createEmptyMetrics();
        refreshPrecacheStats();
    }

    function parsePositiveInteger(id) {
        const value = readPositiveInteger(id);
        if (value === null) {
            throw new Error(`${refs[id].previousElementSibling.textContent} must be a positive integer.`);
        }
        return value;
    }

    function readPositiveInteger(id) {
        return normalizePositiveInteger(refs[id] ? refs[id].value : null);
    }

    function normalizePositiveInteger(value) {
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
    }

    function firstPositiveInteger(...values) {
        for (const value of values) {
            const numeric = normalizePositiveInteger(value);
            if (numeric !== null) return numeric;
        }
        return null;
    }

    function setBusy(operation) {
        state.busy = true;
        state.operation = operation;
        updateButtons();
    }

    function clearBusy() {
        state.busy = false;
        state.operation = '';
        state.abortController = null;
        stopStatsPolling();
        updateButtons();
    }

    function updateButtons() {
        const canExtract = isDirectory(paths && paths.dataDir) && !state.busy;
        const canTranslate = isFile(paths && paths.outputFile) && isFile(paths && paths.translatorConfig) && !state.busy;
        refs['extract-strings'].disabled = !canExtract;
        refs['translate-missing'].disabled = !canTranslate;
        refs['stop-translation'].disabled = !(state.busy && state.operation === 'translate');
    }

    function clearLogs() {
        state.logLines = [];
        renderLogs({ force: true });
    }

    function showPrecacheRelaunchReminder() {
        const reminder = refs['precache-relaunch-reminder'];
        if (reminder) reminder.classList.remove('hidden');
    }

    function addLog(line) {
        const text = String(line || '').replace(/\s+$/u, '');
        if (!text) return;

        for (const part of text.split(/\r?\n/u)) {
            if (!part.trim()) continue;
            state.logLines.push(part);
            parseLogLine(part);
        }
        state.logLines = state.logLines.slice(-20);
        renderLogs();
    }

    function renderLogs(options = {}) {
        if (!options.force && state.operation === 'translate') {
            const now = Date.now();
            const elapsed = now - state.lastLogRenderAt;
            if (elapsed < PRECACHE_STATS_REFRESH_INTERVAL_MS) {
                if (!state.logRenderTimer) {
                    state.logRenderTimer = setTimeout(() => {
                        state.logRenderTimer = null;
                        renderLogs({ force: true });
                    }, PRECACHE_STATS_REFRESH_INTERVAL_MS - elapsed);
                }
                return;
            }
        }

        if (state.logRenderTimer) {
            clearTimeout(state.logRenderTimer);
            state.logRenderTimer = null;
        }
        state.lastLogRenderAt = Date.now();
        refs.logs.textContent = state.logLines.length ? state.logLines.join('\n') : 'No logs yet.';
        refs.logs.scrollTop = refs.logs.scrollHeight;
    }

    function parseLogLine(line) {
        const benchmark = line.match(/Benchmark: .*?\|\s+(\d+)\s+batch\(es\) saved \| active (\d+) \| queue (\d+) \| failed (\d+)/i);
        if (benchmark) {
            state.metrics.completedBatches = Number(benchmark[1]) || 0;
            state.metrics.activeWorkers = Number(benchmark[2]) || 0;
            state.metrics.queueLength = Number(benchmark[3]) || 0;
            state.metrics.failed = Number(benchmark[4]) || 0;
            const tokens = line.match(/Benchmark:\s+([\d,]+)\/([\d,]+)\s+est source tokens/i);
            if (tokens) {
                state.metrics.successfulTokens = parseFormattedInteger(tokens[1]);
                state.metrics.totalTokens = parseFormattedInteger(tokens[2]);
            }
            const rate = line.match(/\|\s+([0-9.]+)\s+tok\/s\b/i);
            if (rate) state.metrics.tokensPerSecond = Number(rate[1]) || 0;
            const eta = line.match(/\|\s+ETA\s+([^|]+?)\s+\|/i);
            if (eta) state.metrics.etaSeconds = parseDurationSeconds(eta[1]);
            renderStats();
            return;
        }

        const saved = line.match(/saved batch [^(]+ \((\d+) text\(s\), (\d+) record\(s\)\)/i);
        if (saved) {
            state.metrics.completedBatches += 1;
            incrementTranslatedRecords(saved[2]);
            renderStats();
            return;
        }

        if (/failed id \d+:/i.test(line)) {
            state.metrics.failed += 1;
            renderStats();
        }
    }

    function captureConsoleDuring(task) {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        const capture = (args) => {
            const line = args.map(formatConsoleValue).join(' ');
            if (/^\[(Precacher|PrecacheTranslator|PrecacheUI)\]/.test(line)) {
                addLog(line);
            }
        };

        console.log = (...args) => {
            capture(args);
            originalLog.apply(console, args);
        };
        console.warn = (...args) => {
            capture(args);
            originalWarn.apply(console, args);
        };
        console.error = (...args) => {
            capture(args);
            originalError.apply(console, args);
        };

        return Promise.resolve()
            .then(task)
            .finally(() => {
                console.log = originalLog;
                console.warn = originalWarn;
                console.error = originalError;
            });
    }

    function formatConsoleValue(value) {
        if (value instanceof Error) return value.stack || value.message;
        if (value && typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (_) {
                return String(value);
            }
        }
        return String(value);
    }

    async function runExtract() {
        clearLogs();
        resetRuntimeMetrics();
        setRunState('neutral', 'Extracting strings...');
        setBusy('extract');

        try {
            const result = await captureConsoleDuring(() => precacher.run([paths.dataDir], {
                settingsFile: paths.settingsFile,
            }));
            refreshExtractionFilterStatus();
            setText('strings-extracted', formatNumber(result.accepted.length));
            setText('strings-rejected', formatNumber(result.rejected.length));
            setText('json-files-scanned', formatNumber(result.files.length));
            setText('last-extraction-time', formatTime(new Date()));
            setRunState('ok', 'Extraction complete');
            showPrecacheRelaunchReminder();
        } catch (err) {
            addLog(`[PrecacheUI] Extract failed: ${formatError(err)}`);
            setRunState('bad', 'Extraction failed');
        } finally {
            clearBusy();
            await refreshPreflight();
        }
    }

    async function runTranslate() {
        clearLogs();
        resetRuntimeMetrics();
        state.baselineTranslated = state.precacheStats.translated;
        setRunState('neutral', 'Translating strings...');
        setBusy('translate');
        state.abortController = pretranslator.createAbortController
            ? pretranslator.createAbortController()
            : null;
        startStatsPolling();

        try {
            saveUiSettings();
            const result = await captureConsoleDuring(() => pretranslator.translatePrecache({
                in: paths.outputFile,
                config: paths.translatorConfig,
                concurrency: parsePositiveInteger('concurrency'),
                inputTokenBudget: parsePositiveInteger('token-budget'),
                retries: 2,
                pretty: true,
                overwrite: false,
                dryRun: false,
                systemPrompt: refs['system-prompt'].value,
                signal: state.abortController ? state.abortController.signal : undefined,
                onProgress: applyTranslationProgress,
            }));

            state.metrics.failed = result.failedJobs ? result.failedJobs.length : 0;
            const stats = refreshPrecacheStats();
            if (state.metrics.failed > 0) {
                setRunState('warn', `Done with failures: ${state.metrics.failed} strings failed`);
            } else if (stats.untranslated === 0) {
                setRunState('ok', 'Done: all strings translated');
            } else {
                setRunState('warn', `Done: ${stats.untranslated} strings untranslated`);
            }
            addLog('[PrecacheUI] Partial progress is saved to precache.json.');
            showPrecacheRelaunchReminder();
        } catch (err) {
            if (isAbortError(err)) {
                addLog('[PrecacheUI] Stopped by user. Partial progress is saved to precache.json.');
                setRunState('warn', 'Stopped: partial results saved');
                showPrecacheRelaunchReminder();
            } else {
                addLog(`[PrecacheUI] Translate failed: ${formatError(err)}`);
                setRunState('bad', 'Translation failed');
            }
        } finally {
            clearBusy();
            await refreshPreflight();
        }
    }

    function stopTranslation() {
        if (!state.abortController) {
            addLog('[PrecacheUI] Stop is unavailable in this runtime.');
            return;
        }
        addLog('[PrecacheUI] Stop requested. Completed progress remains saved in precache.json.');
        state.abortController.abort();
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

    function formatDuration(seconds) {
        const numeric = Number(seconds);
        if (!Number.isFinite(numeric) || numeric < 0) return '-';
        const totalSeconds = Math.ceil(numeric);
        if (totalSeconds < 60) return `${totalSeconds}s`;
        const minutes = Math.floor(totalSeconds / 60);
        const remainderSeconds = totalSeconds % 60;
        if (minutes < 60) return remainderSeconds
            ? `${minutes}m ${remainderSeconds}s`
            : `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const remainderMinutes = minutes % 60;
        return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
    }

    function parseDurationSeconds(value) {
        const text = String(value || '').trim().toLowerCase();
        if (!text || text === '-') return null;
        let total = 0;
        let matched = false;
        text.replace(/(\d+(?:\.\d+)?)\s*([hms])/g, (_, amount, unit) => {
            matched = true;
            const numeric = Number(amount);
            if (unit === 'h') total += numeric * 3600;
            if (unit === 'm') total += numeric * 60;
            if (unit === 's') total += numeric;
            return '';
        });
        return matched ? Math.ceil(total) : null;
    }

    function parseFormattedInteger(value) {
        const numeric = Number(String(value || '').replace(/,/g, ''));
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
    }

    function normalizeNullableMetric(value, fallback) {
        if (value === null) return null;
        if (typeof value === 'undefined') return fallback;
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
    }

    function normalizeMetric(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
    }

    function startStatsPolling() {
        stopStatsPolling();
        state.pollTimer = setInterval(refreshPrecacheStats, PRECACHE_STATS_REFRESH_INTERVAL_MS);
    }

    function stopStatsPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
        if (state.statsRenderTimer) {
            clearTimeout(state.statsRenderTimer);
            state.statsRenderTimer = null;
            renderStats({ force: true });
        }
        if (state.logRenderTimer) {
            clearTimeout(state.logRenderTimer);
            state.logRenderTimer = null;
            renderLogs({ force: true });
        }
    }

    function isAbortError(err) {
        return !!(err && (err.name === 'AbortError' || err.code === 'ABORT_ERR'));
    }

    function formatError(err) {
        if (!err) return 'unknown error';
        return err.message ? err.message : String(err);
    }

    function bindEvents() {
        refs['refresh-preflight'].addEventListener('click', () => {
            refreshPreflight().catch((err) => {
                addLog(`[PrecacheUI] Refresh failed: ${formatError(err)}`);
            });
        });
        refs['extract-strings'].addEventListener('click', () => {
            runExtract().catch((err) => {
                addLog(`[PrecacheUI] Extract crashed: ${formatError(err)}`);
                clearBusy();
            });
        });
        refs['translate-missing'].addEventListener('click', () => {
            runTranslate().catch((err) => {
                addLog(`[PrecacheUI] Translate crashed: ${formatError(err)}`);
                clearBusy();
            });
        });
        refs['stop-translation'].addEventListener('click', stopTranslation);
        for (const id of ['concurrency', 'token-budget', 'system-prompt']) {
            refs[id].addEventListener('input', scheduleUiSettingsSave);
            refs[id].addEventListener('change', flushUiSettingsSave);
            refs[id].addEventListener('blur', flushUiSettingsSave);
        }
        window.addEventListener('beforeunload', flushUiSettingsSave);
    }

    async function boot() {
        initRefs();
        bindEvents();
        try {
            initNode();
            loadDefaultPrompt();
            loadUiSettings();
            await refreshPreflight();
            setRunState('neutral', 'Idle');
        } catch (err) {
            addLog(`[PrecacheUI] ${formatError(err)}`);
            setRunState('bad', 'Initialization failed');
            for (const button of document.querySelectorAll('button')) {
                button.disabled = true;
            }
        }
    }

    boot();
})();
