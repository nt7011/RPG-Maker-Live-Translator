import { FORESIGHT_ACTION_DISPLAY_LIMIT, INACTIVE_TEXT_DISPLAY_LIMIT, UPDATE_PAGE_URL, VERSION_CHECK_INTERVAL_MS, VERSION_CHECK_MAX_BYTES, VERSION_CHECK_MAX_REDIRECTS, VERSION_CHECK_TIMEOUT_MS, VERSION_CHECK_URL, state, } from './state.js';
import type { GuiConfiguredPolicy, GuiEffectivePolicy, GuiDiagnosticsLimits, GuiPolicySnapshot, GuiRuntimeContextPolicy, GuiRuntimeState, GuiViewState, UnknownRecord, } from './types.js';
import { GUI_PROJECTION_LIMITS, readGuiProjectionPolicy, resolveGuiProjectionLimits, type GuiProjectionLimits, type GuiProjectionPolicy, } from '../projection.js';
import { assignGuiOwnDataRecord, copyGuiOwnDataRecord, createGuiOwnDataRecord, defineGuiOwnDataProperty, falsyFallback, isGuiArray, isUnknownRecord, propertyValue, stringValue, } from './types.js';
const applyGuiPolicyFunction = Reflect.apply;
const guiPolicyObjectHasOwn = Object.hasOwn;
const guiPolicyNumber = Number;
const guiPolicyNumberIsFinite = Number.isFinite;
const maximumGuiPolicyNumber = Math.max;
const minimumGuiPolicyNumber = Math.min;
const roundGuiPolicyNumber = Math.round;
const trimGuiPolicyString = String.prototype.trim;
export function normalizeGuiPolicyObject(value: unknown): UnknownRecord | null {
    return isUnknownRecord(value) ? value : null;
}
export function positiveGuiPolicyInteger(value: unknown, fallback: number): number;
export function positiveGuiPolicyInteger(value: unknown, fallback: null): number | null;
export function positiveGuiPolicyInteger(value: unknown, fallback: number | null): number | null {
    const numeric = applyGuiPolicyFunction(guiPolicyNumber, undefined, [value]);
    if (!guiPolicyNumberIsFinite(numeric) || numeric <= 0)
        return fallback;
    return maximumGuiPolicyNumber(1, roundGuiPolicyNumber(numeric));
}
export function normalizeGuiPolicyStringList(value: unknown, max = 32): string[] {
    if (!isGuiArray(value))
        return [];
    const seen = createGuiOwnDataRecord();
    const list: string[] = [];
    let outputIndex = 0;
    for (let index = 0; index < value.length && outputIndex < max; index += 1) {
        const source = stringValue(falsyFallback(value[index], ''));
        const text = applyGuiPolicyFunction(trimGuiPolicyString, source, []);
        if (!text || applyGuiPolicyFunction(guiPolicyObjectHasOwn, Object, [seen, text]))
            continue;
        defineGuiOwnDataProperty(seen, text, true);
        defineGuiOwnDataProperty(list, outputIndex, text);
        outputIndex += 1;
    }
    return list;
}
export function isGuiUpdateStatusVisible(status: unknown): boolean {
    return status === 'update' || status === 'error' || status === 'missing';
}
export function readGuiDiagnosticsLimits(diagnostics: unknown): GuiDiagnosticsLimits {
    const source = normalizeGuiPolicyObject(propertyValue(diagnostics, 'limits')) ?? createGuiOwnDataRecord();
    return {
        foresightScans: positiveGuiPolicyInteger(source['foresightScans'], 5),
        foresightMessages: positiveGuiPolicyInteger(source['foresightMessages'], 5),
        archivedItems: positiveGuiPolicyInteger(source['archivedItems'], 40),
        detachedItems: positiveGuiPolicyInteger(source['detachedItems'], 40),
        pastJobs: positiveGuiPolicyInteger(source['pastJobs'], 20),
    };
}
export function readGuiProjectionPolicyFromSettings(settings: unknown = state.settings): GuiProjectionPolicy {
    const settingsSource = normalizeGuiPolicyObject(settings) ?? createGuiOwnDataRecord();
    const diagnostics = normalizeGuiPolicyObject(settingsSource['diagnostics']) ?? createGuiOwnDataRecord();
    return readGuiProjectionPolicy(diagnostics['guiProjection']);
}
export function getConfiguredGuiProjectionLimits(defaults: GuiProjectionLimits = GUI_PROJECTION_LIMITS, settings: unknown = state.settings): GuiProjectionLimits {
    return resolveGuiProjectionLimits(readGuiProjectionPolicyFromSettings(settings), defaults);
}
export function createDefaultGuiPolicyConstants() {
    return {
        versionCheckUrl: VERSION_CHECK_URL,
        updatePageUrl: UPDATE_PAGE_URL,
        versionCheckIntervalMs: VERSION_CHECK_INTERVAL_MS,
        versionCheckTimeoutMs: VERSION_CHECK_TIMEOUT_MS,
        versionCheckMaxBytes: VERSION_CHECK_MAX_BYTES,
        versionCheckMaxRedirects: VERSION_CHECK_MAX_REDIRECTS,
        foresightActionDisplayLimit: FORESIGHT_ACTION_DISPLAY_LIMIT,
        inactiveTextDisplayLimit: INACTIVE_TEXT_DISPLAY_LIMIT,
    };
}
export function createGuiPolicyInput(): UnknownRecord {
    const runtimeContext = normalizeGuiPolicyObject(state.runtimeContext) ?? createGuiOwnDataRecord();
    return {
        settings: state.settings,
        source: {
            settingsSource: state.settingsSource || '',
            settingsError: state.settingsError || '',
        },
        lifecycle: {
            supportPath: falsyFallback(runtimeContext['supportPath'], state.supportPath),
            gameRoot: falsyFallback(runtimeContext['gameRoot'], state.gameRoot),
            translationCacheFile: falsyFallback(runtimeContext['translationCacheFile'], state.translationCacheFile),
            closeWithGame: runtimeContext['closeWithGame'] === true,
        },
        constants: createDefaultGuiPolicyConstants(),
    };
}
export function createGuiConfiguredPolicy(input: unknown = createGuiOwnDataRecord()): GuiConfiguredPolicy {
    const sourceInput = normalizeGuiPolicyObject(input) ?? createGuiOwnDataRecord();
    const settings = normalizeGuiPolicyObject(sourceInput['settings']) ?? createGuiOwnDataRecord();
    const gui = normalizeGuiPolicyObject(settings['gui']) ?? createGuiOwnDataRecord();
    const targets = normalizeGuiPolicyObject(settings['targets']) ?? createGuiOwnDataRecord();
    const diagnostics = normalizeGuiPolicyObject(settings['diagnostics']) ?? createGuiOwnDataRecord();
    const trace = normalizeGuiPolicyObject(diagnostics['drawCaptureTrace']) ?? createGuiOwnDataRecord();
    const lifecycleInput = normalizeGuiPolicyObject(sourceInput['lifecycle']) ?? createGuiOwnDataRecord();
    const configSource = normalizeGuiPolicyObject(sourceInput['source']) ?? createGuiOwnDataRecord();
    const constants = createDefaultGuiPolicyConstants();
    assignGuiOwnDataRecord(constants, normalizeGuiPolicyObject(sourceInput['constants']) ?? createGuiOwnDataRecord());
    const lifecycle = {
        disableLiveTranslatorGui: gui['enableLiveTranslatorGui'] === false,
        supportPath: stringValue(falsyFallback(lifecycleInput['supportPath'], '')),
        gameRoot: stringValue(falsyFallback(lifecycleInput['gameRoot'], '')),
        translationCacheFile: stringValue(falsyFallback(lifecycleInput['translationCacheFile'], '')),
        closeWithGame: lifecycleInput['closeWithGame'] === true,
    };
    return {
        source: {
            settingsSource: stringValue(falsyFallback(configSource['settingsSource'], '')),
            settingsError: stringValue(falsyFallback(configSource['settingsError'], '')),
        },
        lifecycle,
        updates: {
            checkUpdates: gui['checkUpdates'] !== false,
            versionCheckUrl: constants.versionCheckUrl,
            updatePageUrl: constants.updatePageUrl,
            intervalMs: constants.versionCheckIntervalMs,
            timeoutMs: constants.versionCheckTimeoutMs,
            maxBytes: constants.versionCheckMaxBytes,
            maxRedirects: constants.versionCheckMaxRedirects,
        },
        diagnostics: {
            enabled: diagnostics['enabled'] === true,
            captureWhenGuiClosed: diagnostics['captureWhenGuiClosed'] === true,
            limits: readGuiDiagnosticsLimits(diagnostics),
            guiProjection: readGuiProjectionPolicy(diagnostics['guiProjection']),
        },
        drawCaptureTrace: {
            enabled: trace['enabled'] !== false,
            recordOnlyCjk: trace['recordOnlyCjk'] === true,
            recordAll: trace['recordAll'] === true,
            limit: positiveGuiPolicyInteger(trace['limit'], null),
            targetTexts: normalizeGuiPolicyStringList(trace['targetTexts']),
        },
        foresight: {
            enabled: targets['enableForesight'] !== false,
            showSpoilers: gui['showForesightSpoilers'] === true,
            actionDisplayLimit: constants.foresightActionDisplayLimit,
        },
        textRecords: {
            inactiveDisplayLimit: constants.inactiveTextDisplayLimit,
        },
    };
}
export function createGuiRuntimeState(): GuiRuntimeState {
    const translationDiagnostics = state.translationDiagnostics ?? null;
    return {
        context: normalizeGuiPolicyObject(state.runtimeContext) ?? {
            supportPath: state.supportPath,
            gameRoot: state.gameRoot,
            translationCacheFile: state.translationCacheFile,
            closeWithGame: false,
            gameRootReady: null,
            supportPathReady: null,
            ready: null,
        },
        versions: {
            installedVersion: state.installedVersion,
            latestVersion: state.latestVersion,
            updateCheckStatus: state.updateCheckStatus,
            updateCheckMessage: state.updateCheckMessage,
            updateCheckError: state.updateCheckError,
            updateCheckInFlight: state.updateCheckInFlight,
        },
        hooks: {
            results: isGuiArray(state.hookResults) ? state.hookResults : [],
            summary: state.hookSummary ?? null,
            diagnosticsSurface: state.hookDiagnosticsSurface,
        },
        textRecords: {
            summary: state.textSummary ?? null,
            diagnosticsSurface: state.textDiagnosticsSurface,
        },
        translationDiagnostics,
        provider: translationDiagnostics?.provider ?? null,
        drawCaptureTrace: state.drawCaptureTrace ?? null,
        foresight: state.foresight ?? null,
        providerLabel: falsyFallback(state.provider, '-'),
    };
}
export function createGuiViewState(): GuiViewState {
    return {
        foresight: {
            messagesOnly: state.foresightMessagesOnly,
        },
        textRecords: {
            selectedDetailKey: state.selectedTextRecordKey,
        },
        logs: {
            count: isGuiArray(state.logLines) ? state.logLines.length : 0,
        },
    };
}
export function deriveGuiEffectivePolicy(configured: GuiConfiguredPolicy, runtime: GuiRuntimeState, view: GuiViewState): GuiEffectivePolicy {
    const translationDiagnosticsSurface = runtime.translationDiagnostics?.diagnosticsSurface === true;
    const diagnosticsSurface = runtime.hooks.diagnosticsSurface ||
        runtime.textRecords.diagnosticsSurface ||
        translationDiagnosticsSurface ||
        runtime.drawCaptureTrace !== null ||
        runtime.foresight?.diagnosticsSurface === true;
    const detailsEnabled = true;
    const trace = runtime.drawCaptureTrace;
    const traceEvents = isGuiArray(trace?.events) ? trace.events : [];
    const traceRuntimeEnabled = trace?.enabled !== false;
    const tracePanelVisible = runtime.drawCaptureTrace !== null;
    const traceEnabled = tracePanelVisible && traceRuntimeEnabled;
    const foresightControlsEnabled = configured.foresight.enabled && runtime.foresight?.diagnosticsSurface === true;
    return {
        runtimeContext: deriveGuiRuntimeContextPolicy(runtime.context),
        updates: {
            checkUpdates: configured.updates.checkUpdates,
            status: runtime.versions.updateCheckStatus,
            inFlight: runtime.versions.updateCheckInFlight,
            statusVisible: isGuiUpdateStatusVisible(runtime.versions.updateCheckStatus),
        },
        diagnostics: {
            enabled: configured.diagnostics.enabled,
            surfaceEnabled: diagnosticsSurface,
            detailsEnabled: diagnosticsSurface,
            snapshotRequest: {
                forceDiagnosticsSurface: true,
                activeJobLimit: 8,
                eventLimit: 40,
                jobHistoryLimit: 2,
                pastJobLimit: minimumGuiPolicyNumber(configured.diagnostics.limits.pastJobs, 12),
                subscriberRecordLimit: 4,
            },
            limits: copyGuiOwnDataRecord(configured.diagnostics.limits) as unknown as GuiDiagnosticsLimits,
        },
        hookInstallation: {
            panelVisible: runtime.hooks.diagnosticsSurface,
        },
        drawCaptureTrace: {
            enabled: traceEnabled,
            panelVisible: tracePanelVisible,
            copyEnabled: traceEnabled && traceEvents.length > 0,
            disabledReason: getGuiDrawCaptureDisabledReason(traceRuntimeEnabled),
            eventDisplayLimit: 28,
        },
        foresight: {
            configuredEnabled: configured.foresight.enabled,
            controlsEnabled: foresightControlsEnabled,
            visible: foresightControlsEnabled,
            messagesOnly: foresightControlsEnabled && view.foresight.messagesOnly,
            showSpoilers: configured.foresight.showSpoilers,
            actionDisplayLimit: configured.foresight.actionDisplayLimit,
            disabledReason: deriveGuiForesightDisabledReason(configured.foresight.enabled),
            messageFilterTitle: deriveGuiForesightMessageFilterTitle(configured.foresight.enabled, view.foresight.messagesOnly),
        },
        textRecords: {
            detailsEnabled,
            historyVisible: runtime.textRecords.diagnosticsSurface,
            inactiveDisplayLimit: configured.textRecords.inactiveDisplayLimit,
            showForesightSpoilers: configured.foresight.showSpoilers,
            selectedDetailKey: view.textRecords.selectedDetailKey,
        },
    };
}
export function deriveGuiRuntimeContextPolicy(context: unknown): GuiRuntimeContextPolicy {
    const source = normalizeGuiPolicyObject(context) ?? createGuiOwnDataRecord();
    const gameRootReady = source['gameRootReady'] === true;
    const supportPathReady = source['supportPathReady'] === true;
    const closeWithGame = source['closeWithGame'] === true;
    const ready = gameRootReady && supportPathReady && closeWithGame;
    return {
        gameRootReady,
        supportPathReady,
        closeWithGame,
        ready,
        summaryTone: ready ? 'ok' : 'warn',
        summaryText: ready ? 'ready' : 'needs attention',
        gameRootTone: gameRootReady ? 'ok' : 'warn',
        gameRootText: gameRootReady ? 'ready' : 'unknown',
        supportPathTone: supportPathReady ? 'ok' : 'bad',
        supportPathText: supportPathReady ? 'ready' : 'missing',
        closeWithGameTone: closeWithGame ? 'ok' : 'warn',
        closeWithGameText: closeWithGame ? 'linked' : 'unlinked',
    };
}
export function getGuiDrawCaptureDisabledReason(traceRuntimeEnabled: boolean): string {
    if (!traceRuntimeEnabled)
        return 'Draw capture trace disabled by the runtime.';
    return '';
}
export function deriveGuiForesightDisabledReason(configuredEnabled: boolean): string {
    if (!configuredEnabled)
        return 'Foresight disabled in settings.jsonc';
    return '';
}
export function deriveGuiForesightMessageFilterTitle(configuredEnabled: boolean, messagesOnly: boolean): string {
    if (!configuredEnabled)
        return 'Foresight disabled in settings.jsonc';
    return messagesOnly ? 'Show all foresight actions' : 'Only show game messages and message-bearing paths';
}
export function createGuiPolicySnapshot(): GuiPolicySnapshot {
    const configuredPolicy = createGuiConfiguredPolicy(createGuiPolicyInput());
    const runtimeState = createGuiRuntimeState();
    const viewState = createGuiViewState();
    const effectivePolicy = deriveGuiEffectivePolicy(configuredPolicy, runtimeState, viewState);
    return {
        configuredPolicy,
        runtimeState,
        viewState,
        effectivePolicy,
    };
}
export function refreshGuiPolicySnapshot(): GuiPolicySnapshot {
    const snapshot = createGuiPolicySnapshot();
    state.configuredPolicy = snapshot.configuredPolicy;
    state.runtimeState = snapshot.runtimeState;
    state.viewState = snapshot.viewState;
    state.effectivePolicy = snapshot.effectivePolicy;
    return snapshot;
}
export function getGuiPolicySnapshot(): GuiPolicySnapshot {
    if (state.configuredPolicy && state.runtimeState && state.viewState && state.effectivePolicy) {
        return {
            configuredPolicy: state.configuredPolicy,
            runtimeState: state.runtimeState,
            viewState: state.viewState,
            effectivePolicy: state.effectivePolicy,
        };
    }
    return createGuiPolicySnapshot();
}
export function getGuiConfiguredPolicy(policySnapshot: GuiPolicySnapshot | null = null): GuiConfiguredPolicy {
    return (policySnapshot ?? getGuiPolicySnapshot()).configuredPolicy;
}
export function getGuiRuntimeState(policySnapshot: GuiPolicySnapshot | null = null): GuiRuntimeState {
    return (policySnapshot ?? getGuiPolicySnapshot()).runtimeState;
}
export function getGuiViewState(policySnapshot: GuiPolicySnapshot | null = null): GuiViewState {
    return (policySnapshot ?? getGuiPolicySnapshot()).viewState;
}
export function getGuiEffectivePolicy(policySnapshot: GuiPolicySnapshot | null = null): GuiEffectivePolicy {
    return (policySnapshot ?? getGuiPolicySnapshot()).effectivePolicy;
}
export function getGuiDiagnosticsSnapshotRequest(policySnapshot: GuiPolicySnapshot | null = null): GuiEffectivePolicy['diagnostics']['snapshotRequest'] {
    return getGuiEffectivePolicy(policySnapshot).diagnostics.snapshotRequest;
}
export function getGuiDrawCapturePolicy(policySnapshot: GuiPolicySnapshot | null = null): GuiEffectivePolicy['drawCaptureTrace'] {
    return getGuiEffectivePolicy(policySnapshot).drawCaptureTrace;
}
export function getGuiForesightPolicy(policySnapshot: GuiPolicySnapshot | null = null): GuiEffectivePolicy['foresight'] {
    return getGuiEffectivePolicy(policySnapshot).foresight;
}
export function getGuiTextRecordPolicy(policySnapshot: GuiPolicySnapshot | null = null): GuiEffectivePolicy['textRecords'] {
    return getGuiEffectivePolicy(policySnapshot).textRecords;
}
