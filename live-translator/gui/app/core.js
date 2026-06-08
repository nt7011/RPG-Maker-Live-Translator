// Translator monitor core helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

const GUI_THEME_MODE_CYCLE = ['solarized', 'dark', 'light'];
const GUI_THEME_MODE_LABELS = {
    solarized: 'Solarized Light',
    dark: 'dark',
    light: 'light',
};

function initRefs() {
    for (const element of document.querySelectorAll('[id]')) {
        refs[element.id] = element;
    }
}

function getGuiPreviewController() {
    const preview = globalThis.LiveTranslatorGuiPreview;
    return preview && typeof preview === 'object' ? preview : null;
}

function isGuiPreviewMode(preview = getGuiPreviewController()) {
    return !!(preview
        && typeof preview.isEnabled === 'function'
        && preview.isEnabled());
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
    setToneText(el, 'status', tone, value);
}

function setSummaryStatus(id, tone, value) {
    const el = refs[id];
    if (!el) return;
    setToneText(el, 'summary-status', tone, value);
    syncPanelDisclosureIndicatorForStatus(el);
}

function setReservedLaneReminder(tone, value, visible = true) {
    const el = refs['diag-lane-reminder'];
    if (!el) return;
    el.hidden = visible !== true;
    setToneText(el, 'diagnostics-reminder', tone, value);
    updateHeaderComplaintsVisibility();
}

function setLmStudioStatus(tone, status) {
    const el = refs['lmstudio-status'];
    if (!el) return;
    const visible = !(status && status.visible === false);
    el.hidden = !visible;
    el.className = `lmstudio-status ${tone}`;
    const source = status && typeof status === 'object' ? status : {};
    const concurrencyVisible = source.concurrencyVisible === true && !!source.concurrency;
    setText('lmstudio-connection', source.connection || 'Pending');
    setText('lmstudio-model', source.model || 'model pending');
    setText('lmstudio-concurrency', source.concurrency || '');
    if (refs['lmstudio-concurrency']) refs['lmstudio-concurrency'].hidden = !concurrencyVisible;
    if (refs['lmstudio-concurrency-separator']) refs['lmstudio-concurrency-separator'].hidden = !concurrencyVisible;
}

function setLmStudioComplaint(tone, value, visible = true) {
    const el = refs['lmstudio-complaint'];
    if (!el) return;
    el.hidden = visible !== true;
    setToneText(el, 'header-complaint lmstudio-complaint', tone, value);
    updateHeaderComplaintsVisibility();
}

function updateHeaderComplaintsVisibility() {
    const container = refs['header-complaints'];
    if (!container) return;
    const visible = Array.from(container.children || [])
        .some((child) => child && child.hidden !== true);
    container.hidden = !visible;
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
    const nextFoldKey = createSettingsFoldKey(normalized);
    if (state.settingsFoldKey && state.settingsFoldKey !== nextFoldKey && typeof resetFoldedPanelDefaults === 'function') {
        resetFoldedPanelDefaults();
    }
    state.settingsFoldKey = nextFoldKey;
    state.settings = normalized;
    state.settingsSource = source || '';
    state.settingsError = '';
    return normalized;
}

function createSettingsFoldKey(settings) {
    try {
        return JSON.stringify(settings || {});
    } catch (_) {
        return String(Date.now());
    }
}

function normalizeTranslatorProviderName(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'lmstudio' || text === 'lm-studio') return 'local';
    if (text === 'mocktranslator' || text === 'mock-translator') return 'mocktranslator';
    return text;
}

function readTranslatorProvider(cfg) {
    return cfg && typeof cfg.provider === 'string' && cfg.provider.trim()
        ? cfg.provider.trim()
        : '';
}

function getLocalTranslatorConfig(cfg) {
    const settings = cfg && cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : {};
    return settings.local && typeof settings.local === 'object' ? settings.local : null;
}

function describeTranslatorConfigError(cfg, provider) {
    if (provider !== 'local') return '';
    const local = getLocalTranslatorConfig(cfg);
    if (!local) return 'translator.json missing "settings.local" object for LM Studio provider.';
    if (typeof local.model !== 'string' || !local.model.trim()) {
        return 'translator.json missing "settings.local.model" for LM Studio provider.';
    }
    return '';
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

function refreshConfigSummary() {
    state.provider = '-';
    state.translatorProvider = '';
    state.translatorConfigError = '';
    state.cacheEntries = '-';

    if (!fs || !path || !state.supportPath) return;
    refreshSettingsState();

    const translatorConfig = path.join(state.supportPath, 'translator.json');
    if (isFile(translatorConfig)) {
        try {
            const cfg = readJsonFile(translatorConfig);
            const provider = readTranslatorProvider(cfg);
            state.provider = provider || 'unknown';
            state.translatorProvider = normalizeTranslatorProviderName(provider);
            state.translatorConfigError = describeTranslatorConfigError(cfg, state.translatorProvider);
        } catch (err) {
            state.provider = 'config error';
            state.translatorProvider = '';
            state.translatorConfigError = formatError(err);
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
    state.runtimeContext = {
        supportPath: state.supportPath,
        gameRoot: state.gameRoot,
        translationCacheFile: state.translationCacheFile,
        gameRootReady,
        supportPathReady,
        closeWithGame,
        ready: gameRootReady && supportPathReady && closeWithGame,
    };
    const policySnapshot = refreshGuiPolicySnapshot();
    const contextPolicy = getGuiEffectivePolicy(policySnapshot).runtimeContext;

    setText('game-root', state.gameRoot || '-');
    setStatus('game-root-status', contextPolicy.gameRootTone, contextPolicy.gameRootText);

    setText('support-path', state.supportPath || '-');
    setStatus('support-path-status', contextPolicy.supportPathTone, contextPolicy.supportPathText);

    setStatus('main-window-link', contextPolicy.closeWithGameTone, contextPolicy.closeWithGameText);
    setSummaryStatus('runtime-context-summary', contextPolicy.summaryTone, contextPolicy.summaryText);
    renderDiagnosticsSummary();
}

function getGameWindow() {
    const preview = getGuiPreviewController();
    if (isGuiPreviewMode(preview) && typeof preview.getGameWindow === 'function') {
        return preview.getGameWindow();
    }
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
        : ['clearDiagnostics', 'clearSnapshot', 'publish'];
    [
        gameWindow && gameWindow.LiveTranslatorTextOrchestrator,
        gameWindow && gameWindow.LiveTranslatorTranslationDiagnostics,
        gameWindow && gameWindow.LiveTranslatorForesightDiagnostics,
        gameWindow && gameWindow.LiveTranslatorDrawCaptureTrace,
    ].forEach((api) => {
        if (!api || typeof api !== 'object') return;
        for (const method of methods) {
            if (typeof api[method] !== 'function') continue;
            try { api[method](); } catch (_) {}
            if (open) break;
        }
    });
}

function addLog(level, message) {
    const stamp = new Date().toLocaleTimeString();
    const normalized = String(message || '').replace(/\s+$/u, '');
    if (!normalized) return;
    state.logLines.push(`[${stamp}] ${String(level || 'info').toUpperCase()} ${normalized}`);
    state.logLines = state.logLines.slice(-80);
    renderLogs();
}

function renderLogs() {
    if (!refs.logs) return;
    const lines = state.logLines.slice(-80);
    refs.logs.textContent = lines.length ? lines.join('\n') : 'No log entries.';
    refs.logs.scrollTop = refs.logs.scrollHeight;
    renderDiagnosticsSummary();
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
        refreshRuntimeFeed();
        renderRuntimePanelsForFeed(getGuiPolicySnapshot());
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
    applyGuiThemeMode(state.themeMode);
    bindThemeModeToggle();
    if (refs['clear-log']) refs['clear-log'].addEventListener('click', clearLog);
    if (refs['foresight-copy']) {
        refs['foresight-copy'].addEventListener('click', () => copyForesightDiagnostics(refs['foresight-copy']));
    }
    if (refs['draw-capture-copy']) {
        refs['draw-capture-copy'].addEventListener('click', () => copyDrawCaptureTrace(refs['draw-capture-copy']));
    }
    bindDisabledForesightPanelGuard();
    if (refs['foresight-message-filter-toggle']) {
        refs['foresight-message-filter-toggle'].checked = getGuiViewState(refreshGuiPolicySnapshot()).foresight.messagesOnly;
        refs['foresight-message-filter-toggle'].addEventListener('change', () => {
            state.foresightMessagesOnly = refs['foresight-message-filter-toggle'].checked === true;
            renderForesightPanel(refreshGuiPolicySnapshot());
        });
    }
    bindFoldedPanelSummaryControls();
    syncPanelDisclosureIndicators();
}

function bindDisabledForesightPanelGuard() {
    const panel = refs['foresight-panel'];
    const summary = panel && typeof panel.querySelector === 'function'
        ? panel.querySelector('summary')
        : null;
    if (!summary || summary.__liveTranslatorDisabledGuardBound === true) return;
    summary.__liveTranslatorDisabledGuardBound = true;
    summary.addEventListener('click', (event) => {
        if (!isForesightPanelDisabled()) return;
        event.preventDefault();
        event.stopPropagation();
        if (panel) panel.open = false;
    });
    summary.addEventListener('keydown', (event) => {
        if (!isForesightPanelDisabled()) return;
        if (event && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        if (panel) panel.open = false;
    });
}

function isForesightPanelDisabled() {
    const panel = refs['foresight-panel'];
    return !!(panel && panel.classList && panel.classList.contains('foresight-panel-disabled'));
}

function bindThemeModeToggle() {
    const toggle = refs['theme-mode-toggle'];
    if (!toggle) return;
    toggle.addEventListener('click', () => {
        applyGuiThemeMode(getNextGuiThemeMode(state.themeMode));
    });
}

function normalizeGuiThemeMode(mode) {
    const value = String(mode || '');
    return GUI_THEME_MODE_CYCLE.includes(value) ? value : 'solarized';
}

function getNextGuiThemeMode(mode) {
    const current = normalizeGuiThemeMode(mode);
    const index = GUI_THEME_MODE_CYCLE.indexOf(current);
    return GUI_THEME_MODE_CYCLE[(index + 1) % GUI_THEME_MODE_CYCLE.length];
}

function applyGuiThemeMode(mode) {
    const nextMode = normalizeGuiThemeMode(mode);
    state.themeMode = nextMode;
    const darkEnabled = nextMode === 'dark';
    const solarizedEnabled = nextMode === 'solarized';
    const root = document.documentElement;
    if (root && root.classList) {
        root.classList.toggle('gui-dark-mode', darkEnabled);
        root.classList.toggle('gui-solarized-mode', solarizedEnabled);
    }
    if (document.body && document.body.classList) {
        document.body.classList.toggle('gui-dark-mode', darkEnabled);
        document.body.classList.toggle('gui-solarized-mode', solarizedEnabled);
    }
    renderThemeModeToggle();
}

function renderThemeModeToggle() {
    const toggle = refs['theme-mode-toggle'];
    if (!toggle) return;
    const mode = normalizeGuiThemeMode(state.themeMode);
    const nextMode = getNextGuiThemeMode(mode);
    const label = `Switch to ${GUI_THEME_MODE_LABELS[nextMode]} mode`;
    toggle.textContent = mode === 'dark' ? '\u263c' : (mode === 'light' ? 'S' : '\u263e');
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    toggle.removeAttribute('aria-pressed');
}

function bindFoldedPanelSummaryControls() {
    const controls = document.querySelectorAll('summary button, summary input, summary label, summary a');
    controls.forEach((control) => {
        control.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    });
}

function syncPanelDisclosureIndicators(root = document) {
    const source = root && typeof root.querySelectorAll === 'function' ? root : null;
    if (!source) return;
    Array.from(source.querySelectorAll('.collapsible-panel')).forEach(syncPanelDisclosureIndicator);
}

function syncPanelDisclosureIndicator(panel) {
    if (!panel || !panel.classList || typeof panel.classList.toggle !== 'function') return;
    const summary = typeof panel.querySelector === 'function' ? panel.querySelector('summary') : null;
    panel.classList.toggle('collapsible-panel-has-status', summaryHasDisclosureStatus(summary));
}

function syncPanelDisclosureIndicatorForStatus(statusElement) {
    const summary = findSummaryAncestor(statusElement);
    const panel = summary ? getDisclosurePanelForSummary(summary) : null;
    if (panel) syncPanelDisclosureIndicator(panel);
}

function summaryHasDisclosureStatus(summary) {
    if (!summary || typeof summary.querySelectorAll !== 'function') return false;
    return Array.from(summary.querySelectorAll('.summary-status')).some((status) => {
        if (!status || status.hidden === true) return false;
        return String(status.textContent || '').trim() !== '';
    });
}

function findSummaryAncestor(element) {
    let current = element || null;
    while (current) {
        const name = String(current.tagName || current.nodeName || '').toUpperCase();
        if (name === 'SUMMARY') return current;
        current = current.parentElement || current.parentNode || null;
    }
    return null;
}

function getDisclosurePanelForSummary(summary) {
    const panel = summary && (summary.parentElement || summary.parentNode);
    return panel
        && panel.classList
        && typeof panel.classList.contains === 'function'
        && panel.classList.contains('collapsible-panel')
        ? panel
        : null;
}

function renderDiagnosticsSummary() {
    const policySnapshot = getGuiPolicySnapshot();
    const contextPolicy = getGuiEffectivePolicy(policySnapshot).runtimeContext;
    const hookSummary = state.hookSummary || summarizeHookResults(state.hookResults);
    const hooksReady = hookSummary.total > 0
        && hookSummary.failed === 0
        && hookSummary.skipped === 0
        && hookSummary.installed === hookSummary.total;
    const logCount = Array.isArray(state.logLines) ? state.logLines.length : 0;
    const hasBad = contextPolicy.ready !== true || hookSummary.failed > 0;
    const hasWarn = hookSummary.skipped > 0 || hookSummary.total === 0;
    const tone = hasBad ? 'bad' : (hasWarn ? 'warn' : 'ok');
    const text = hasBad || hasWarn
        ? 'needs attention'
        : (logCount ? `ready, ${formatNumber(logCount)} logs` : 'ready');
    setSummaryStatus('diagnostics-summary', tone, text);
}

function boot() {
    const preview = getGuiPreviewController();
    const previewEnabled = isGuiPreviewMode(preview);
    if (previewEnabled && typeof preview.installControls === 'function') {
        preview.installControls();
    }
    initRefs();
    bindEvents();
    if (previewEnabled && typeof preview.beforeBoot === 'function') {
        preview.beforeBoot();
    }
    if (!previewEnabled) notifyGuiState(true);
    window.addEventListener('beforeunload', () => {
        if (!previewEnabled) notifyGuiState(false);
        stopUpdateChecker();
    });
    const nodeReady = previewEnabled ? false : initNode();
    if (previewEnabled) {
        if (typeof preview.refreshRuntimeContext === 'function') preview.refreshRuntimeContext();
        if (typeof preview.refreshConfigSummary === 'function') preview.refreshConfigSummary();
        if (typeof preview.refreshVersionPanel === 'function') preview.refreshVersionPanel();
    } else {
        refreshRuntimeContext();
        refreshConfigSummary();
        startUpdateChecker();
    }
    refreshRuntimeFeed();
    const policySnapshot = getGuiPolicySnapshot();
    renderRuntimePanelsForFeed(policySnapshot, { force: true });
    updateHeartbeat();
    if (!previewEnabled) installGameCloseWatcher();
    if (previewEnabled && typeof preview.afterBoot === 'function') preview.afterBoot();
    addLog('info', previewEnabled
        ? 'GUI monitor preview loaded.'
        : (nodeReady ? 'GUI monitor loaded.' : 'GUI monitor loaded without Node APIs.'));
    if (!state.hookResults.length) addLog('info', 'Runtime feed is not connected.');
}
