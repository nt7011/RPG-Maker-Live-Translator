import { setToneText } from './dom/builders.js';
import { parseJsonc } from '../../configuration/jsonc.js';
import { captureLogRedactor } from '../../runtime/log-redaction-port.js';
import { closeNwWindow, getNodeRequire as getBoundaryNodeRequire, getProcessCwd, hasFileSystemSupport, initializeNodeModules, isDirectory as isNodeDirectory, isFile as isNodeFile, joinPath, readTextFile, } from './node-bridge.js';
import { getGuiEffectivePolicy, getGuiPolicySnapshot, refreshGuiPolicySnapshot } from './policy.js';
import { getVisibleHookSummary, summarizeHookResults } from './runtime/records.js';
import { refs, state } from './state.js';
import type { GuiHookSummary, GuiStatusSummaryModel, GuiPolicySnapshot, GuiRuntimeContextPolicy, UnknownRecord, } from './types.js';
import { falsyFallback, isGuiDetailsElement, isGuiHtmlElement, isUnknownRecord, propertyValue, stringValue, } from './types.js';
const disabledForesightSummaryBindings = new WeakSet<EventTarget>();
const logRedactor = captureLogRedactor(getGameWindow());
export function initRefs(): void {
    for (const element of document.querySelectorAll('[id]')) {
        if (isGuiHtmlElement(element))
            refs[element.id] = element;
    }
}
export function getNodeRequire() {
    return getBoundaryNodeRequire();
}
export function initNode(): boolean {
    if (!initializeNodeModules())
        return false;
    state.gameRoot = getQueryValue('gameRoot') || getProcessCwd();
    return true;
}
export function getQueryValue(name: string): string {
    try {
        return new URL(window.location.href).searchParams.get(name) ?? '';
    }
    catch {
        return '';
    }
}
export function setText(id: string, value: unknown): void {
    const element = refs[id];
    if (element)
        element.textContent = stringValue(value);
}
export function setStatus(id: string, tone: string, value: unknown): void {
    const el = refs[id];
    if (!el)
        return;
    setToneText(el, 'status', tone, value);
}
export function setSummaryStatus(id: string, tone: string, value: unknown): void {
    const el = refs[id];
    if (!el)
        return;
    setToneText(el, 'summary-status', tone, value);
    syncPanelDisclosureIndicatorForStatus(el);
}
export function updateHeaderComplaintsVisibility(): void {
    const container = refs['header-complaints'];
    if (!container)
        return;
    const visible = Iterator.from(container.children).some((child) => isGuiHtmlElement(child) && child.hidden !== true);
    container.hidden = !visible;
}
export function formatNumber(value: unknown): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return '0';
    return Math.round(numeric).toLocaleString('en-US');
}
export function formatTime(value: unknown): string {
    const date = value instanceof Date
        ? value
        : new Date(typeof value === 'number' || typeof value === 'string' ? value : stringValue(value));
    if (Number.isNaN(date.getTime()))
        return '-';
    return date.toLocaleTimeString();
}
export function formatDuration(ms: unknown): string {
    const seconds = Math.max(0, Math.floor(Number(ms) / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${String(mins)}m ${String(secs)}s` : `${String(secs)}s`;
}
export function isFile(filePath: string): boolean {
    return isNodeFile(filePath);
}
export function isDirectory(directoryPath: string): boolean {
    return isNodeDirectory(directoryPath);
}
export function readJsonFile(filePath: string): unknown {
    return parseJsonc(readTextFile(filePath));
}
export function normalizeSettingsObject(settings: unknown): UnknownRecord | null {
    return isUnknownRecord(settings) ? settings : null;
}
export function rememberSettings(settings: unknown, source: string): UnknownRecord | null {
    const normalized = normalizeSettingsObject(settings);
    if (!normalized)
        return null;
    const nextFoldKey = createSettingsFoldKey(normalized);
    if (state.settingsFoldKey && state.settingsFoldKey !== nextFoldKey) {
        resetFoldedPanelDefaults();
    }
    state.settingsFoldKey = nextFoldKey;
    state.settings = normalized;
    state.settingsSource = source || '';
    state.settingsError = '';
    return normalized;
}
export function applyFoldedPanelDefault(panelId: string, stateKey: string, open: boolean, defaultKey: unknown): void {
    const panel = refs[panelId];
    if (!isGuiDetailsElement(panel))
        return;
    const key = stringValue(defaultKey === undefined ? open : defaultKey);
    if (state.panelDefaultKeys[stateKey] === key)
        return;
    state.panelDefaultKeys[stateKey] = key;
    panel.open = open;
}
export function resetFoldedPanelDefaults(): void {
    state.panelDefaultKeys = {};
}
export function createSettingsFoldKey(settings: unknown): string {
    try {
        return JSON.stringify(falsyFallback(settings, {}));
    }
    catch {
        return String(Date.now());
    }
}
export function normalizeTranslatorProviderName(value: unknown): string {
    const text = stringValue(falsyFallback(value, '')).trim().toLowerCase();
    if (text === 'lm-studio')
        return 'lmstudio';
    if (text === 'llama.cpp' || text === 'llama-cpp')
        return 'llamacpp';
    if (text === 'mocktranslator' || text === 'mock-translator')
        return 'mocktranslator';
    return text;
}
export function readTranslatorProvider(config: unknown): string {
    const provider = propertyValue(config, 'provider');
    return typeof provider === 'string' && provider.trim() ? provider.trim() : '';
}
export function getLmStudioTranslatorConfig(config: unknown): UnknownRecord | null {
    const settings = propertyValue(config, 'settings');
    const lmStudio = propertyValue(settings, 'lmstudio');
    return isUnknownRecord(lmStudio) ? lmStudio : null;
}
export function getLlamaCppTranslatorConfig(config: unknown): UnknownRecord | null {
    const settings = propertyValue(config, 'settings');
    const llamaCpp = propertyValue(settings, 'llamacpp');
    return isUnknownRecord(llamaCpp) ? llamaCpp : null;
}
export function describeTranslatorConfigError(config: unknown, provider: string): string {
    if (provider === 'llamacpp') {
        const llamaCpp = getLlamaCppTranslatorConfig(config);
        if (!llamaCpp)
            return 'translator.jsonc missing "settings.llamacpp" object for llama.cpp provider.';
        if (typeof llamaCpp['model'] !== 'string' || !llamaCpp['model'].trim()) {
            return 'translator.jsonc missing "settings.llamacpp.model" for llama.cpp provider.';
        }
        return '';
    }
    if (provider === 'lmstudio') {
        const lmStudio = getLmStudioTranslatorConfig(config);
        if (!lmStudio)
            return 'translator.jsonc missing "settings.lmstudio" object for LM Studio provider.';
        if (typeof lmStudio['model'] !== 'string' || !lmStudio['model'].trim()) {
            return 'translator.jsonc missing "settings.lmstudio.model" for LM Studio provider.';
        }
    }
    return '';
}
export function refreshSettingsState(): UnknownRecord | null {
    state.settings = null;
    state.settingsSource = '';
    state.settingsError = '';
    if (!hasFileSystemSupport() || !state.supportPath)
        return null;
    const settingsFile = joinPath(state.supportPath, 'settings.jsonc');
    if (!isFile(settingsFile))
        return null;
    try {
        const settings = readJsonFile(settingsFile);
        if (!normalizeSettingsObject(settings)) {
            state.settingsError = 'settings.jsonc is not a JSON object';
            addLog('warn', state.settingsError);
            return null;
        }
        return rememberSettings(settings, 'settings.jsonc');
    }
    catch (err) {
        state.settingsError = formatError(err);
        addLog('warn', `settings.jsonc read failed: ${state.settingsError}`);
        return null;
    }
}
export function refreshConfigSummary(): void {
    state.provider = '-';
    state.translatorProvider = '';
    state.translatorConfigError = '';
    if (!hasFileSystemSupport() || !state.supportPath)
        return;
    refreshSettingsState();
    const translatorConfig = joinPath(state.supportPath, 'translator.jsonc');
    if (isFile(translatorConfig)) {
        try {
            const cfg = readJsonFile(translatorConfig);
            const provider = readTranslatorProvider(cfg);
            state.provider = provider || 'unknown';
            state.translatorProvider = normalizeTranslatorProviderName(provider);
            state.translatorConfigError = describeTranslatorConfigError(cfg, state.translatorProvider);
        }
        catch (err) {
            state.provider = 'config error';
            state.translatorProvider = '';
            state.translatorConfigError = formatError(err);
            addLog('warn', `translator.jsonc read failed: ${formatError(err)}`);
        }
    }
}
export function refreshRuntimeContext(): void {
    state.supportPath = getQueryValue('supportPath');
    state.gameRoot = getQueryValue('gameRoot') || state.gameRoot;
    state.translationCacheFile =
        getQueryValue('translationCacheFile') ||
            (hasFileSystemSupport() && state.supportPath ? joinPath(state.supportPath, 'translation-cache.log') : '');
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
    renderStatusSummary();
}
export function getGameWindow(): unknown {
    try {
        const opener: unknown = window.opener;
        if (opener && opener !== window && propertyValue(opener, 'closed') !== true) {
            return opener;
        }
    }
    catch {
    }
    return null;
}
export function notifyGuiState(open: boolean): void {
    const gameWindow = getGameWindow();
    if (!isUnknownRecord(gameWindow))
        return;
    try {
        const existingGuiState = gameWindow['LiveTranslatorGuiState'];
        const guiState = isUnknownRecord(existingGuiState) ? existingGuiState : {};
        guiState['translatorOpen'] = open;
        guiState['updatedAt'] = Date.now();
        gameWindow['LiveTranslatorGuiState'] = guiState;
    }
    catch {
    }
}
export function addLog(level: unknown, message: unknown): void {
    const stamp = new Date().toLocaleTimeString();
    let normalized = stringValue(falsyFallback(message, '')).replace(/\s+$/u, '');
    if (logRedactor) {
        try {
            normalized = logRedactor.text(normalized);
        }
        catch {
            return;
        }
    }
    if (!normalized)
        return;
    state.logLines.push(`[${stamp}] ${stringValue(falsyFallback(level, 'info')).toUpperCase()} ${normalized}`);
    state.logLines = state.logLines.slice(-80);
    renderLogs();
}
export function renderLogs(): void {
    const logs = refs['logs'];
    if (!logs)
        return;
    const lines = state.logLines.slice(-80);
    logs.textContent = lines.length ? lines.join('\n') : 'No log entries.';
    logs.scrollTop = logs.scrollHeight;
    renderStatusSummary();
}
export function clearLog(): void {
    state.logLines = [];
    renderLogs();
}
export function updateHeartbeat(): void {
    setText('heartbeat', `open ${formatDuration(Date.now() - state.startedAt)} - ${formatTime(new Date())}`);
}
export function closeSelf(): void {
    if (closeNwWindow())
        return;
    try {
        window.close();
    }
    catch {
    }
}
export function formatError(err: unknown): string {
    if (!err)
        return 'unknown error';
    const message = propertyValue(err, 'message');
    return message ? stringValue(message) : stringValue(err);
}
export function bindDisabledForesightPanelGuard(): void {
    const panel = refs['foresight-panel'];
    const summary = panel?.querySelectorAll('summary').item(0) ?? null;
    if (!summary || disabledForesightSummaryBindings.has(summary))
        return;
    disabledForesightSummaryBindings.add(summary);
    summary.addEventListener('click', (event) => {
        if (!isForesightPanelDisabled())
            return;
        event.preventDefault();
        event.stopPropagation();
        if (isGuiDetailsElement(panel))
            panel.open = false;
    });
    summary.addEventListener('keydown', (event) => {
        if (!isForesightPanelDisabled())
            return;
        if (event.key !== 'Enter' && event.key !== ' ')
            return;
        event.preventDefault();
        event.stopPropagation();
        if (isGuiDetailsElement(panel))
            panel.open = false;
    });
}
export function isForesightPanelDisabled(): boolean {
    const panel = refs['foresight-panel'];
    return panel?.classList.contains('foresight-panel-disabled') === true;
}
export function bindFoldedPanelSummaryControls(): void {
    const controls = document.querySelectorAll('summary button, summary input, summary label, summary a');
    controls.forEach((control) => {
        control.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    });
}
export function syncPanelDisclosureIndicators(root: Document | Element = document): void {
    root.querySelectorAll('.collapsible-panel').forEach(syncPanelDisclosureIndicator);
}
export function syncPanelDisclosureIndicator(panel: Element): void {
    const summary = panel.querySelector('summary');
    panel.classList.toggle('collapsible-panel-has-status', summaryHasDisclosureStatus(summary));
}
export function syncPanelDisclosureIndicatorForStatus(statusElement: Element): void {
    const summary = findSummaryAncestor(statusElement);
    const panel = summary ? getDisclosurePanelForSummary(summary) : null;
    if (panel)
        syncPanelDisclosureIndicator(panel);
}
export function summaryHasDisclosureStatus(summary: Element | null): boolean {
    if (!summary)
        return false;
    return Iterator.from(summary.querySelectorAll('.summary-status')).some((status) => {
        if (!isGuiHtmlElement(status) || status.hidden === true)
            return false;
        return falsyFallback(status.textContent, '').trim() !== '';
    });
}
export function findSummaryAncestor(element: unknown): HTMLElement | null {
    let current: unknown = falsyFallback(element, null);
    while (current) {
        const name = stringValue(falsyFallback(propertyValue(current, 'tagName'), falsyFallback(propertyValue(current, 'nodeName'), ''))).toUpperCase();
        if (name === 'SUMMARY' && isGuiHtmlElement(current))
            return current;
        current = falsyFallback(propertyValue(current, 'parentElement'), falsyFallback(propertyValue(current, 'parentNode'), null));
    }
    return null;
}
export function getDisclosurePanelForSummary(summary: HTMLElement): HTMLElement | null {
    const panel = summary.parentElement ?? summary.parentNode;
    return isGuiHtmlElement(panel) && panel.classList.contains('collapsible-panel') ? panel : null;
}
export function renderStatusSummary(): void {
    const model = createStatusSummaryModel();
    setSummaryStatus('status-summary', model.tone, model.text);
    syncStatusPanelDefault(model);
}
export function createStatusSummaryModel(policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): GuiStatusSummaryModel {
    const effectivePolicy = getGuiEffectivePolicy(policySnapshot);
    const contextPolicy = effectivePolicy.runtimeContext;
    const hookSummary = getVisibleHookSummary(policySnapshot);
    const logCount = Array.isArray(state.logLines) ? state.logLines.length : 0;
    return deriveStatusSummaryModel(contextPolicy, hookSummary, logCount, effectivePolicy.hookInstallation.panelVisible);
}
export function deriveStatusSummaryModel(contextPolicy: GuiRuntimeContextPolicy | null | undefined, hookSummary: GuiHookSummary | null | undefined, logCount: unknown, hookSurfaceAvailable = true): GuiStatusSummaryModel {
    const context = contextPolicy ?? {
        gameRootReady: false,
        supportPathReady: false,
        closeWithGame: false,
        ready: false,
        summaryTone: 'warn',
        summaryText: 'needs attention',
        gameRootTone: 'warn',
        gameRootText: 'unknown',
        supportPathTone: 'bad',
        supportPathText: 'missing',
        closeWithGameTone: 'warn',
        closeWithGameText: 'unlinked',
    };
    const summary = hookSummary ?? summarizeHookResults([]);
    const hasBad = !context.ready || summary.failed > 0;
    const hasWarn = summary.skipped > 0 || (hookSurfaceAvailable && summary.total === 0);
    const tone = hasBad ? 'bad' : hasWarn ? 'warn' : 'ok';
    const text = hasBad || hasWarn ? 'needs attention' : Number(logCount) ? `ready, ${formatNumber(logCount)} logs` : 'ready';
    return {
        tone,
        text,
        openDefault: tone !== 'ok',
        defaultKey: `status:${tone}`,
    };
}
export function syncStatusPanelDefault(model: GuiStatusSummaryModel = createStatusSummaryModel()): void {
    if (typeof applyFoldedPanelDefault !== 'function')
        return;
    applyFoldedPanelDefault('status-panel', 'status', model.openDefault, model.defaultKey);
}
