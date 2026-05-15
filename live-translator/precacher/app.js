// Precacher UI window controller for extraction and batch translation.
// This standalone page runs offline-style jobs against game data and writes precache files for later game launches.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const { PrecacheUiSupport, PrecacheUiDom, PrecacheUiFiles, PrecacheUiLogs, PrecacheUiSettings, PrecacheUiStats } = globalScope;
    if (!PrecacheUiSupport || !PrecacheUiDom || !PrecacheUiFiles || !PrecacheUiLogs || !PrecacheUiSettings || !PrecacheUiStats) {
        throw new Error('[PrecacheUI] support scripts must load before app.js.');
    }
    const {
        createEmptyMetrics,
        createEmptyPrecacheStats,
        firstPositiveInteger,
        formatConsoleValue,
        formatDuration,
        formatError,
        formatNumber,
        formatRate,
        formatTime,
        getNodeRequire,
        getQueryValue,
        isAbortError,
        normalizeMetric,
        normalizeNullableMetric,
        normalizePositiveInteger,
        parseDurationSeconds,
        parseFormattedInteger,
        trimTrailingSeparator,
    } = PrecacheUiSupport;

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
    let fileHelpers = null;
    let statsController = null;
    let logController = null;
    let domController = null;
    let uiSettingsController = null;

    function getFileHelpers() {
        if (!fileHelpers) fileHelpers = PrecacheUiFiles.createFileHelpers({ fs, path });
        return fileHelpers;
    }

    function resolveDataDir(gameRoot) { return getFileHelpers().resolveDataDir(gameRoot); }
    function isFile(filePath) { return getFileHelpers().isFile(filePath); }
    function isDirectory(dirPath) { return getFileHelpers().isDirectory(dirPath); }
    function readJsonFile(filePath) { return getFileHelpers().readJsonFile(filePath); }
    function writeJsonFile(filePath, value) { return getFileHelpers().writeJsonFile(filePath, value); }

    function getDomController() {
        if (!domController) {
            domController = PrecacheUiDom.createDomController({
            refs,
            state,
            getPaths: () => paths,
            isDirectory,
            isFile,
            formatError,
            addLog,
            refreshPreflight,
            runExtract,
            runTranslate,
            stopTranslation,
            stopStatsPolling,
            scheduleUiSettingsSave,
            flushUiSettingsSave,
        });
        }
        return domController;
    }

    function setText(id, value) { return getDomController().setText(id, value); }
    function setStatus(id, tone, value) { return getDomController().setStatus(id, tone, value); }
    function setRunState(tone, value) { return getDomController().setRunState(tone, value); }
    function setPreflightOverview(tone, value) { return getDomController().setPreflightOverview(tone, value); }
    function showPrecacheRelaunchReminder() { return getDomController().showPrecacheRelaunchReminder(); }
    function setBusy(operation) { return getDomController().setBusy(operation); }
    function clearBusy() { return getDomController().clearBusy(); }
    function updateButtons() { return getDomController().updateButtons(); }
    function bindEvents() { return getDomController().bindEvents(); }

    function getStatsController() {
        if (!statsController) {
            statsController = PrecacheUiStats.createStatsController({
                state,
                getPaths: () => paths,
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
            });
        }
        return statsController;
    }
    function refreshPrecacheStats() { return getStatsController().refreshPrecacheStats(); }   function incrementTranslatedRecords(count) { return getStatsController().incrementTranslatedRecords(count); }
    function renderStats(options = {}) { return getStatsController().renderStats(options); }
    function resetRuntimeMetrics() { return getStatsController().resetRuntimeMetrics(); }
    function applyTranslationProgress(progress) { return getStatsController().applyTranslationProgress(progress); }

    function getLogController() {
        if (!logController) {
            logController = PrecacheUiLogs.createLogController({
                state,
                refs,
                intervalMs: PRECACHE_STATS_REFRESH_INTERVAL_MS,
                renderStats,
                incrementTranslatedRecords,
                formatConsoleValue,
                parseDurationSeconds,
                parseFormattedInteger,
            });
        }
        return logController;
    }

    function clearLogs() { return getLogController().clearLogs(); }
    function addLog(line) { return getLogController().addLog(line); }
    function renderLogs(options = {}) { return getLogController().renderLogs(options); }
    function captureConsoleDuring(task) { return getLogController().captureConsoleDuring(task); }

    function getUiSettingsController() {
        if (!uiSettingsController) {
            uiSettingsController = PrecacheUiSettings.createUiSettingsController({
                refs,
                state,
                getPaths: () => paths,
                isFile,
                readJsonFile,
                writeJsonFile,
                addLog,
                formatError,
                readPositiveInteger,
                normalizePositiveInteger,
                firstPositiveInteger,
            });
        }
        return uiSettingsController;
    }

    function loadUiSettings() { return getUiSettingsController().loadUiSettings(); }
    function scheduleUiSettingsSave() { return getUiSettingsController().scheduleUiSettingsSave(); }
    function flushUiSettingsSave() { return getUiSettingsController().flushUiSettingsSave(); }
    function saveUiSettings(options = {}) { return getUiSettingsController().saveUiSettings(options); }

    function initRefs() {
        for (const element of document.querySelectorAll('[id]')) {
            refs[element.id] = element;
        }
    }
    function initNode() {
        const req = getNodeRequire();
        if (!req) throw new Error('Node APIs are unavailable. Open this window from NW.js.');

        fs = req('fs');
        path = req('path');

        const supportDir = resolveSupportDir();
        const precacherDir = path.join(supportDir, 'precacher');

        const gameRoot = trimTrailingSeparator(getQueryValue('gameRoot')) || process.cwd();

        paths = {
            gameRoot,
            supportDir,
            precacherDir,
            dataDir: resolveDataDir(gameRoot),
            outputFile: path.join(precacherDir, 'precache.json'),
            rejectedFile: path.join(precacherDir, 'precache-rejected.json'),
            translatorConfig: path.join(supportDir, 'translator.json'),
            settingsFile: path.join(supportDir, 'settings.json'),
            uiSettingsFile: path.join(precacherDir, 'ui.json'),
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
    function loadDefaultPrompt() {
        refs['system-prompt'].value = pretranslator.DEFAULT_BATCH_SYSTEM_PROMPT
            || pretranslator.buildBatchSystemPrompt({});
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
            status.textContent = 'CJK filter off';
            status.title = 'settings.json translation.disableCjkFilter is true. Extraction does not require CJK characters.';
            return options;
        }

        status.className = 'summary-status ok';
        status.textContent = 'CJK filter on';
        status.title = 'Extraction matches the live translator filter: Korean is skipped; Japanese or Chinese text is extracted.';
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
