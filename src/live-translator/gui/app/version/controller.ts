import { addLog, formatError, isFile, readJsonFile, refreshSettingsState, updateHeaderComplaintsVisibility, } from '../core.js';
import { setToneText } from '../dom/builders.js';
import { getBrowserShell, hasFileSystemSupport, joinPath } from '../node-bridge.js';
import { createGuiConfiguredPolicy, getGuiConfiguredPolicy } from '../policy.js';
import { refs, state } from '../state.js';
import type { BrowserShell } from '../node-bridge.js';
import type { UnknownRecord } from '../types.js';
import { falsyFallback, propertyValue, stringValue } from '../types.js';
import { fetchRemoteText } from './network.js';
import { getVersionCheckResult, isLocalVersionString, normalizeVersionString, parseVersionPayload } from './model.js';
const versionUpdateActionBindings = new WeakSet<EventTarget>();
export function setVersionStatus(status: string, message: string, error = ''): void {
    state.updateCheckStatus = status;
    state.updateCheckMessage = message;
    state.updateCheckError = error;
}
export function toneForVersionStatus(): 'ok' | 'warn' | 'neutral' {
    if (state.updateCheckStatus === 'local')
        return 'ok';
    if (state.updateCheckStatus === 'latest')
        return 'ok';
    if (state.updateCheckStatus === 'update' ||
        state.updateCheckStatus === 'error' ||
        state.updateCheckStatus === 'missing')
        return 'warn';
    return 'neutral';
}
export function renderVersionPanel(): void {
    const indicator = refs['version-indicator'];
    if (indicator) {
        const versionLabel = formatVersionIndicatorVersion();
        const versionState = formatVersionHeaderState();
        indicator.className = `version-indicator ${toneForVersionStatus()}`;
        indicator.textContent = versionState ? `${versionLabel} (${versionState})` : versionLabel;
        indicator.title = state.updateCheckError || '';
    }
    const status = refs['version-status-message'];
    if (status) {
        const statusText = formatVersionStatusText();
        const actionAvailable = isVersionUpdateActionAvailable(statusText);
        status.hidden = !statusText;
        setToneText(status, `header-complaint version-status-message${actionAvailable ? ' version-update-button' : ''}`, toneForVersionStatus(), statusText || '');
        syncVersionUpdateActionElement(status, actionAvailable, statusText);
        status.title =
            state.updateCheckError ||
                (actionAvailable ? 'Open rmlt.pages.dev in the default browser' : statusText || '');
    }
    updateHeaderComplaintsVisibility();
}
export function bindVersionUpdateAction(): void {
    const status = refs['version-status-message'];
    if (!status || versionUpdateActionBindings.has(status))
        return;
    versionUpdateActionBindings.add(status);
    status.addEventListener('click', handleVersionUpdateActionClick);
    status.addEventListener('keydown', handleVersionUpdateActionKeydown);
}
export function isVersionUpdateActionAvailable(statusText = formatVersionStatusText()): boolean {
    return state.updateCheckStatus === 'update' && !!state.latestVersion && !!statusText;
}
export function syncVersionUpdateActionElement(element: HTMLElement | null | undefined, enabled: boolean, statusText: string): void {
    if (!element)
        return;
    if (enabled) {
        setVersionUpdateActionAttribute(element, 'role', 'button');
        setVersionUpdateActionAttribute(element, 'tabindex', '0');
        setVersionUpdateActionAttribute(element, 'aria-label', `Open update page: ${statusText}`);
        return;
    }
    removeVersionUpdateActionAttribute(element, 'role');
    removeVersionUpdateActionAttribute(element, 'tabindex');
    removeVersionUpdateActionAttribute(element, 'aria-label');
}
export function setVersionUpdateActionAttribute(element: HTMLElement, name: string, value: string): void {
    element.setAttribute(name, value);
}
export function removeVersionUpdateActionAttribute(element: HTMLElement, name: string): void {
    element.removeAttribute(name);
}
export function handleVersionUpdateActionClick(event: Event): boolean {
    if (!isVersionUpdateActionAvailable())
        return false;
    consumeVersionUpdateActionEvent(event);
    return openGuiUpdatePage();
}
export function handleVersionUpdateActionKeydown(event: Event): boolean {
    const key = propertyValue(event, 'key');
    if (key !== 'Enter' && key !== ' ')
        return false;
    if (!isVersionUpdateActionAvailable())
        return false;
    consumeVersionUpdateActionEvent(event);
    return openGuiUpdatePage();
}
export function consumeVersionUpdateActionEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
}
export function openGuiUpdatePage(): boolean {
    const updatePageUrl = getGuiConfiguredPolicy().updates.updatePageUrl;
    const shell = getGuiDefaultBrowserShell();
    if (!shell) {
        addLog('warn', 'Update page could not be opened: NW Shell API unavailable.');
        return false;
    }
    try {
        shell.openExternal(updatePageUrl);
        return true;
    }
    catch (err) {
        addLog('warn', `Update page could not be opened: ${formatError(err)}`);
        return false;
    }
}
export function getGuiDefaultBrowserShell(): BrowserShell | null {
    return getBrowserShell();
}
export function formatVersionIndicatorVersion(): string {
    if (state.updateCheckStatus === 'local')
        return state.installedVersion || 'local';
    if (state.installedVersionDisplay && state.installedVersionDisplaySource === state.installedVersion) {
        return state.installedVersionDisplay;
    }
    return state.installedVersion || 'unknown';
}
export function setInstalledVersionDisplay(displayVersion: unknown, sourceVersion: unknown = state.installedVersion): void {
    state.installedVersionDisplay = normalizeVersionString(displayVersion);
    state.installedVersionDisplaySource = state.installedVersionDisplay
        ? stringValue(falsyFallback(sourceVersion, ''))
        : '';
}
export function formatVersionHeaderState(): string {
    if (state.updateCheckStatus === 'local')
        return 'local';
    if (state.updateCheckStatus === 'latest')
        return 'latest';
    if (state.updateCheckStatus === 'ahead')
        return 'newer than current release';
    if (state.updateCheckStatus === 'update')
        return 'outdated';
    if (state.updateCheckStatus === 'checking')
        return 'Checking';
    if (state.updateCheckStatus === 'error' || state.updateCheckStatus === 'missing')
        return 'Error';
    if (state.updateCheckStatus === 'disabled')
        return 'Update Check Disabled';
    return '';
}
export function formatVersionStatusText(): string {
    if (state.updateCheckStatus === 'update') {
        return state.latestVersion ? `Update Available (${state.latestVersion})` : 'Update Available';
    }
    if (state.updateCheckStatus === 'error')
        return 'Update Check Failed';
    if (state.updateCheckStatus === 'missing')
        return 'Version Info Error';
    return '';
}
export function readInstalledVersion(): string {
    if (!hasFileSystemSupport() || !state.supportPath)
        return '';
    const descriptorFile = joinPath(state.supportPath, 'rmlt-package.json');
    if (!isFile(descriptorFile))
        return '';
    try {
        const payload = readJsonFile(descriptorFile);
        return normalizeVersionString(propertyValue(payload, 'version'));
    }
    catch (err) {
        addLog('warn', `rmlt-package.json read failed: ${formatError(err)}`);
        return '';
    }
}
export function readCheckUpdatesSetting(): boolean {
    const settings = state.settings ?? refreshSettingsState();
    if (!settings || typeof settings !== 'object')
        return true;
    const gui = propertyValue(settings, 'gui');
    if (gui &&
        typeof gui === 'object' &&
        Object.hasOwn(gui, 'checkUpdates') &&
        propertyValue(gui, 'checkUpdates') !== false &&
        propertyValue(gui, 'checkUpdates') !== true) {
        addLog('warn', 'settings.jsonc "gui.checkUpdates" should be a boolean. Defaulting to true.');
    }
    return createGuiConfiguredPolicy({ settings }).updates.checkUpdates;
}
export function refreshVersionSettings(): void {
    state.installedVersion = readInstalledVersion();
    setInstalledVersionDisplay(state.installedVersion);
    state.latestVersion = '';
    state.checkUpdates = readCheckUpdatesSetting();
    state.updateCheckError = '';
    if (isLocalVersionString(state.installedVersion)) {
        setVersionStatus('local', 'Local development build');
        renderVersionPanel();
        return;
    }
    if (!state.checkUpdates) {
        setVersionStatus('disabled', 'Update checks disabled');
        renderVersionPanel();
        return;
    }
    if (!state.installedVersion) {
        setVersionStatus('missing', 'Installed version unavailable');
        renderVersionPanel();
        return;
    }
    setVersionStatus('idle', 'Ready to check updates');
    renderVersionPanel();
}
export async function runUpdateCheck(): Promise<void> {
    if (state.updateCheckInFlight || !state.checkUpdates)
        return;
    if (isLocalVersionString(state.installedVersion))
        return;
    const previousUpdateStatus = state.updateCheckStatus;
    const previousLatestVersion = state.latestVersion;
    state.updateCheckInFlight = true;
    setVersionStatus('checking', 'Checking for updates');
    renderVersionPanel();
    try {
        const remote = await fetchRemoteVersion();
        const result = getVersionCheckResult(state.installedVersion, remote);
        const wasSameUpdate = previousUpdateStatus === 'update' && previousLatestVersion === result.targetVersion;
        state.latestVersion = result.targetVersion || '';
        setInstalledVersionDisplay(result.currentVersion || state.installedVersion);
        setVersionStatus(result.status, result.message);
        if (result.status === 'update' && !wasSameUpdate && result.logMessage) {
            addLog('warn', result.logMessage);
        }
        else if (result.status === 'error' && result.logMessage) {
            addLog('warn', result.logMessage);
        }
    }
    catch (err) {
        state.latestVersion = '';
        setVersionStatus('error', 'Update check failed', formatError(err));
        addLog('warn', `Update check failed: ${formatError(err)}`);
    }
    finally {
        state.updateCheckInFlight = false;
        renderVersionPanel();
    }
}
export function startUpdateChecker(): void {
    refreshVersionSettings();
    if (!state.checkUpdates)
        return;
    if (isLocalVersionString(state.installedVersion))
        return;
    void runUpdateCheck();
    state.updateCheckTimer = setInterval(runUpdateCheck, getGuiConfiguredPolicy().updates.intervalMs);
}
export function stopUpdateChecker(): void {
    if (state.updateCheckTimer)
        clearInterval(state.updateCheckTimer);
    state.updateCheckTimer = null;
}
export async function fetchRemoteVersion(): Promise<UnknownRecord> {
    const text = await fetchRemoteText(getGuiConfiguredPolicy().updates.versionCheckUrl);
    return parseVersionPayload(text);
}
