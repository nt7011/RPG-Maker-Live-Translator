// Translator monitor core helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

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
    if (!req) return false;
    fs = req('fs');
    path = req('path');
    https = req('https');
    try {
        state.gameRoot = getQueryValue('gameRoot') || (typeof process !== 'undefined' && typeof process.cwd === 'function'
            ? process.cwd()
            : '');
    } catch (_) {
        state.gameRoot = '';
    }
    return true;
}

function getQueryValue(name) {
    try {
        return new URL(window.location.href).searchParams.get(name) || '';
    } catch (_) {
        return '';
    }
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

function setSummaryStatus(id, tone, value) {
    const el = refs[id];
    if (!el) return;
    el.className = `summary-status ${tone}`;
    el.textContent = value;
}

function setReservedLaneReminder(tone, value) {
    const el = refs['diag-lane-reminder'];
    if (!el) return;
    el.className = `diagnostics-reminder ${tone}`;
    el.textContent = value;
}

function formatNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return Math.round(numeric).toLocaleString('en-US');
}

function formatTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString();
}

function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(Number(ms) / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function isFile(filePath) {
    if (!fs || !filePath) return false;
    try {
        return fs.statSync(filePath).isFile();
    } catch (_) {
        return false;
    }
}

function isDirectory(dirPath) {
    if (!fs || !dirPath) return false;
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

function normalizeSettingsObject(settings) {
    return settings && typeof settings === 'object' && !Array.isArray(settings)
        ? settings
        : null;
}

function rememberSettings(settings, source) {
    const normalized = normalizeSettingsObject(settings);
    if (!normalized) return null;
    state.settings = normalized;
    state.settingsSource = source || '';
    state.settingsError = '';
    return normalized;
}

function refreshSettingsState() {
    state.settings = null;
    state.settingsSource = '';
    state.settingsError = '';

    if (!fs || !path || !state.supportPath) return null;
    const settingsFile = path.join(state.supportPath, 'settings.json');
    if (!isFile(settingsFile)) return null;

    try {
        const settings = readJsonFile(settingsFile);
        if (!normalizeSettingsObject(settings)) {
            state.settingsError = 'settings.json is not a JSON object';
            addLog('warn', state.settingsError);
            return null;
        }
        return rememberSettings(settings, 'settings.json');
    } catch (err) {
        state.settingsError = formatError(err);
        addLog('warn', `settings.json read failed: ${state.settingsError}`);
        return null;
    }
}

function getMonitorSettings() {
    return normalizeSettingsObject(state.settings) || {};
}

function isForesightEnabled() {
    return getMonitorSettings().enableForesight !== false;
}

function shouldShowForesightSpoilers() {
    return getMonitorSettings().showForesightSpoilers === true;
}

function isDiagnosticsPerformanceModeEnabled() {
    const settings = getMonitorSettings();
    const diagnostics = normalizeSettingsObject(settings.diagnostics);
    if (diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'performanceMode')) {
        return diagnostics.performanceMode === true;
    }
    return false;
}

function isDiagnosticsDetailViewEnabled() {
    return !isDiagnosticsPerformanceModeEnabled();
}

function isDrawCaptureTraceEnabled() {
    const settings = getMonitorSettings();
    const traceSettings = normalizeSettingsObject(settings.drawCaptureTrace);
    if (traceSettings && traceSettings.enabled === false) return false;
    return !(state.drawCaptureTrace && state.drawCaptureTrace.enabled === false);
}

function getForesightDisabledMessage() {
    return 'disabled in settings.json';
}

function refreshConfigSummary() {
    state.provider = '-';
    state.cacheEntries = '-';

    if (!fs || !path || !state.supportPath) return;
    refreshSettingsState();

    const translatorConfig = path.join(state.supportPath, 'translator.json');
    if (isFile(translatorConfig)) {
        try {
            const cfg = readJsonFile(translatorConfig);
            state.provider = cfg && typeof cfg.provider === 'string' && cfg.provider.trim()
                ? cfg.provider.trim()
                : 'unknown';
        } catch (err) {
            state.provider = 'config error';
            addLog('warn', `translator.json read failed: ${formatError(err)}`);
        }
    }

    const diskCache = state.translationCacheFile || path.join(state.supportPath || state.gameRoot || '', 'translation-cache.log');
    if (isFile(diskCache)) {
        try {
            const text = fs.readFileSync(diskCache, 'utf8');
            const lines = text.split(/\r?\n/u).filter((line) => line.trim());
            state.cacheEntries = formatNumber(lines.length);
        } catch (_) {
            state.cacheEntries = 'error';
        }
    }
}

function refreshRuntimeContext() {
    state.supportPath = getQueryValue('supportPath');
    state.gameRoot = getQueryValue('gameRoot') || state.gameRoot;
    state.translationCacheFile = getQueryValue('translationCacheFile')
        || (path && state.supportPath ? path.join(state.supportPath, 'translation-cache.log') : '');

    const gameRootReady = Boolean(state.gameRoot && isDirectory(state.gameRoot));
    const supportPathReady = Boolean(state.supportPath && isDirectory(state.supportPath));
    const closeWithGame = getQueryValue('closeWithGame') === '1';
    const runtimeReady = gameRootReady && supportPathReady && closeWithGame;

    setText('game-root', state.gameRoot || '-');
    setStatus('game-root-status', gameRootReady ? 'ok' : 'warn', gameRootReady ? 'ready' : 'unknown');

    setText('support-path', state.supportPath || '-');
    setStatus('support-path-status', supportPathReady ? 'ok' : 'bad', supportPathReady ? 'ready' : 'missing');

    setStatus('main-window-link', closeWithGame ? 'ok' : 'warn', closeWithGame ? 'linked' : 'unlinked');
    setSummaryStatus('runtime-context-summary', runtimeReady ? 'ok' : 'warn', runtimeReady ? 'ready' : 'needs attention');
    setPanelAutoCollapsed('runtime-context-panel', 'runtimeContext', runtimeReady);
}

function getGameWindow() {
    try {
        if (window.opener && window.opener !== window && window.opener.closed !== true) {
            return window.opener;
        }
    } catch (_) {}
    return null;
}

function notifyGuiState(open) {
    const gameWindow = getGameWindow();
    if (!gameWindow) return;
    try {
        const guiState = gameWindow.LiveTranslatorGuiState && typeof gameWindow.LiveTranslatorGuiState === 'object'
            ? gameWindow.LiveTranslatorGuiState
            : {};
        guiState.translatorOpen = open === true;
        guiState.updatedAt = Date.now();
        gameWindow.LiveTranslatorGuiState = guiState;
        syncRuntimeDiagnosticsForGuiState(gameWindow, open === true);
    } catch (_) {}
}

function syncRuntimeDiagnosticsForGuiState(gameWindow, open) {
    const methods = open
        ? ['publish']
        : ['clearDiagnostics', 'clearSnapshot'];
    [
        gameWindow && gameWindow.LiveTranslatorTextOrchestrator,
        gameWindow && gameWindow.LiveTranslatorTranslationDiagnostics,
        gameWindow && gameWindow.LiveTranslatorForesightDiagnostics,
    ].forEach((api) => {
        if (!api || typeof api !== 'object') return;
        for (const method of methods) {
            if (typeof api[method] !== 'function') continue;
            try { api[method](); } catch (_) {}
            break;
        }
    });
}

function addLog(level, message) {
    if (isDiagnosticsPerformanceModeEnabled()) {
        state.logLines = [];
        renderLogs();
        return;
    }
    const stamp = new Date().toLocaleTimeString();
    const normalized = String(message || '').replace(/\s+$/u, '');
    if (!normalized) return;
    state.logLines.push(`[${stamp}] ${String(level || 'info').toUpperCase()} ${normalized}`);
    state.logLines = state.logLines.slice(-80);
    renderLogs();
}

function renderLogs() {
    const panel = refs['runtime-log-panel'];
    const performanceMode = isDiagnosticsPerformanceModeEnabled();
    if (panel) panel.hidden = performanceMode;
    if (performanceMode) {
        state.logLines = [];
        return;
    }
    if (!refs.logs) return;
    const lines = state.logLines.slice(-80);
    refs.logs.textContent = lines.length ? lines.join('\n') : 'No log entries.';
    refs.logs.scrollTop = refs.logs.scrollHeight;
}

function clearLog() {
    state.logLines = [];
    renderLogs();
}

function updateHeartbeat() {
    setText('heartbeat', `open ${formatDuration(Date.now() - state.startedAt)} - ${formatTime(new Date())}`);
}

function installGameCloseWatcher() {
    if (getQueryValue('closeWithGame') !== '1') return;
    state.heartbeatTimer = setInterval(() => {
        updateHeartbeat();
        if (refreshRuntimeFeed()) {
            renderStatus();
            renderHookResults();
            renderTextRecordSections();
            renderLogs();
        }
        try {
            if (window.opener && window.opener.closed === true) {
                closeSelf();
            }
        } catch (_) {
            closeSelf();
        }
    }, 1000);

    window.addEventListener('beforeunload', () => {
        notifyGuiState(false);
        if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = null;
    });
}

function closeSelf() {
    try {
        if (globalThis.nw && nw.Window && typeof nw.Window.get === 'function') {
            nw.Window.get().close(true);
            return;
        }
    } catch (_) {}
    try { window.close(); } catch (_) {}
}

function formatError(err) {
    if (!err) return 'unknown error';
    return err.message ? err.message : String(err);
}

function bindEvents() {
    if (refs['clear-log']) refs['clear-log'].addEventListener('click', clearLog);
    if (refs['foresight-copy']) {
        refs['foresight-copy'].addEventListener('click', () => copyForesightDiagnostics(refs['foresight-copy']));
    }
    if (refs['draw-capture-copy']) {
        refs['draw-capture-copy'].addEventListener('click', () => copyDrawCaptureTrace(refs['draw-capture-copy']));
    }
    if (refs['foresight-view-toggle']) {
        refs['foresight-view-toggle'].checked = state.foresightVisible;
        refs['foresight-view-toggle'].addEventListener('change', () => {
            state.foresightVisible = refs['foresight-view-toggle'].checked === true;
            renderForesightPanel();
        });
    }
    if (refs['foresight-message-filter-toggle']) {
        refs['foresight-message-filter-toggle'].checked = state.foresightMessagesOnly;
        refs['foresight-message-filter-toggle'].addEventListener('change', () => {
            state.foresightMessagesOnly = refs['foresight-message-filter-toggle'].checked === true;
            renderForesightPanel();
        });
    }
}

function boot() {
    initRefs();
    bindEvents();
    notifyGuiState(true);
    window.addEventListener('beforeunload', () => {
        notifyGuiState(false);
        stopUpdateChecker();
    });
    const nodeReady = initNode();
    refreshRuntimeContext();
    refreshConfigSummary();
    startUpdateChecker();
    refreshRuntimeFeed();
    renderStatus();
    renderHookResults();
    renderTextRecordSections();
    updateHeartbeat();
    installGameCloseWatcher();
    addLog('info', nodeReady ? 'GUI monitor loaded.' : 'GUI monitor loaded without Node APIs.');
    if (!state.hookResults.length) addLog('info', 'Runtime feed is not connected.');
}
