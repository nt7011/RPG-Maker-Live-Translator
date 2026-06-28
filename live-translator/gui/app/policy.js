// Translator monitor policy derivation.
// configuredPolicy contains external inputs only; effectivePolicy contains the
// final GUI decisions derived from config, runtime snapshots, and local view state.
'use strict';

function normalizeGuiPolicyObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}

function positiveGuiPolicyInteger(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return Math.max(1, Math.round(numeric));
}

function normalizeGuiPolicyStringList(value, max = 32) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const list = [];
    value.forEach((entry) => {
        const text = String(entry || '').trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        list.push(text);
    });
    return list.slice(0, max);
}

function isGuiUpdateStatusVisible(status) {
    return status === 'update'
        || status === 'error'
        || status === 'missing';
}

function readGuiIntelLimits(intel) {
    const source = normalizeGuiPolicyObject(intel && intel.limits)
        || {};
    return {
        foresightScans: positiveGuiPolicyInteger(source.foresightScans, 5),
        foresightMessages: positiveGuiPolicyInteger(source.foresightMessages, 5),
        archivedItems: positiveGuiPolicyInteger(source.archivedItems, 40),
        detachedItems: positiveGuiPolicyInteger(source.detachedItems, 40),
        pastJobs: positiveGuiPolicyInteger(source.pastJobs, 20),
    };
}

function createDefaultGuiPolicyConstants() {
    return {
        versionCheckUrl: VERSION_CHECK_URL,
        updatePageUrl: UPDATE_PAGE_URL,
        versionCheckIntervalMs: VERSION_CHECK_INTERVAL_MS,
        versionCheckTimeoutMs: VERSION_CHECK_TIMEOUT_MS,
        versionCheckMaxBytes: VERSION_CHECK_MAX_BYTES,
        versionCheckMaxRedirects: VERSION_CHECK_MAX_REDIRECTS,
        foresightActionDisplayLimit: FORESIGHT_ACTION_DISPLAY_LIMIT,
        inactiveTextDisplayLimit: INACTIVE_TEXT_DISPLAY_LIMIT,
        reservedLaneMinConcurrency: RESERVED_LANE_MIN_CONCURRENCY,
        reservedLaneReadyMessage: RESERVED_LANE_READY_MESSAGE,
        reservedLaneDisabledMessage: RESERVED_LANE_DISABLED_MESSAGE,
        reservedLaneWaitingMessage: RESERVED_LANE_WAITING_MESSAGE,
    };
}

function createGuiPolicyInput() {
    const runtimeContext = normalizeGuiPolicyObject(state.runtimeContext) || {};
    return {
        settings: state.settings,
        source: {
            settingsSource: state.settingsSource || '',
            settingsError: state.settingsError || '',
        },
        lifecycle: {
            supportPath: runtimeContext.supportPath || state.supportPath || '',
            gameRoot: runtimeContext.gameRoot || state.gameRoot || '',
            translationCacheFile: runtimeContext.translationCacheFile || state.translationCacheFile || '',
            closeWithGame: runtimeContext.closeWithGame === true,
        },
        constants: createDefaultGuiPolicyConstants(),
    };
}

function createGuiConfiguredPolicy(input = {}) {
    const sourceInput = normalizeGuiPolicyObject(input) || {};
    const settings = normalizeGuiPolicyObject(sourceInput.settings) || {};
    const intel = normalizeGuiPolicyObject(settings.intel) || {};
    const diagnostics = normalizeGuiPolicyObject(settings.diagnostics) || {};
    const trace = normalizeGuiPolicyObject(diagnostics.drawCaptureTrace) || {};
    const lifecycleInput = normalizeGuiPolicyObject(sourceInput.lifecycle) || {};
    const configSource = normalizeGuiPolicyObject(sourceInput.source) || {};
    const constants = Object.assign(createDefaultGuiPolicyConstants(), normalizeGuiPolicyObject(sourceInput.constants) || {});
    const lifecycle = {
        disableLiveTranslatorGui: settings.disableLiveTranslatorGui === true,
        supportPath: String(lifecycleInput.supportPath || ''),
        gameRoot: String(lifecycleInput.gameRoot || ''),
        translationCacheFile: String(lifecycleInput.translationCacheFile || ''),
        closeWithGame: lifecycleInput.closeWithGame === true,
    };
    return {
        source: {
            settingsSource: String(configSource.settingsSource || ''),
            settingsError: String(configSource.settingsError || ''),
        },
        lifecycle,
        updates: {
            checkUpdates: settings.checkUpdates !== false,
            versionCheckUrl: constants.versionCheckUrl,
            updatePageUrl: constants.updatePageUrl,
            intervalMs: constants.versionCheckIntervalMs,
            timeoutMs: constants.versionCheckTimeoutMs,
            maxBytes: constants.versionCheckMaxBytes,
            maxRedirects: constants.versionCheckMaxRedirects,
        },
        intel: {
            captureWhenGuiClosed: intel.captureWhenGuiClosed === true,
            limits: readGuiIntelLimits(intel),
        },
        diagnostics: {
            enabled: diagnostics.enabled === true,
        },
        drawCaptureTrace: {
            enabled: trace.enabled !== false,
            recordCjk: trace.recordCjk !== false,
            recordAll: trace.recordAll === true,
            limit: positiveGuiPolicyInteger(trace.limit, null),
            targetTexts: normalizeGuiPolicyStringList(trace.targetTexts),
        },
        foresight: {
            enabled: settings.enableForesight !== false,
            showSpoilers: settings.showForesightSpoilers === true,
            actionDisplayLimit: constants.foresightActionDisplayLimit,
        },
        textRecords: {
            inactiveDisplayLimit: constants.inactiveTextDisplayLimit,
        },
        reservedLane: {
            minConcurrency: constants.reservedLaneMinConcurrency,
            readyMessage: constants.reservedLaneReadyMessage,
            disabledMessage: constants.reservedLaneDisabledMessage,
            waitingMessage: constants.reservedLaneWaitingMessage,
        },
    };
}

function createGuiRuntimeState() {
    const diagnostics = state.diagnostics || null;
    return {
        context: normalizeGuiPolicyObject(state.runtimeContext) || {
            supportPath: state.supportPath || '',
            gameRoot: state.gameRoot || '',
            translationCacheFile: state.translationCacheFile || '',
            closeWithGame: false,
            gameRootReady: null,
            supportPathReady: null,
            ready: null,
        },
        versions: {
            installedVersion: state.installedVersion || '',
            latestVersion: state.latestVersion || '',
            updateCheckStatus: state.updateCheckStatus || '',
            updateCheckMessage: state.updateCheckMessage || '',
            updateCheckError: state.updateCheckError || '',
            updateCheckInFlight: state.updateCheckInFlight === true,
        },
        hooks: {
            results: Array.isArray(state.hookResults) ? state.hookResults : [],
            summary: state.hookSummary || null,
        },
        textRecords: {
            active: Array.isArray(state.activeTexts) ? state.activeTexts : [],
            detached: Array.isArray(state.detachedTexts) ? state.detachedTexts : [],
            archived: Array.isArray(state.archivedTexts) ? state.archivedTexts : [],
            summary: state.textSummary || null,
        },
        diagnostics,
        provider: diagnostics && diagnostics.provider ? diagnostics.provider : null,
        drawCaptureTrace: state.drawCaptureTrace || null,
        foresight: state.foresight || null,
        providerLabel: state.provider || '-',
        cacheEntries: state.cacheEntries || '-',
    };
}

function createGuiViewState() {
    return {
        foresight: {
            messagesOnly: state.foresightMessagesOnly === true,
        },
        textRecords: {
            selectedDetailKey: state.activeTextRecordDetailKey || '',
            renderedDetailKey: state.renderedTextRecordDetailKey || '',
        },
        diagnostics: {
            selectedDetailKey: state.diagnosticDetailKey || '',
        },
        logs: {
            count: Array.isArray(state.logLines) ? state.logLines.length : 0,
        },
    };
}

function deriveGuiEffectivePolicy(configured, runtime, view) {
    const intelSurface = true;
    const detailsEnabled = true;
    const trace = runtime.drawCaptureTrace;
    const traceEvents = trace && Array.isArray(trace.events) ? trace.events : [];
    const traceRuntimeEnabled = !(trace && trace.enabled === false);
    const traceEnabled = configured.diagnostics.enabled
        && configured.drawCaptureTrace.enabled
        && traceRuntimeEnabled;
    const foresightControlsEnabled = configured.foresight.enabled && intelSurface;
    return {
        runtimeContext: deriveGuiRuntimeContextPolicy(runtime.context),
        updates: {
            checkUpdates: configured.updates.checkUpdates,
            status: runtime.versions.updateCheckStatus,
            inFlight: runtime.versions.updateCheckInFlight,
            statusVisible: isGuiUpdateStatusVisible(runtime.versions.updateCheckStatus),
        },
        intel: {
            surfaceEnabled: intelSurface,
            detailsEnabled,
            snapshotRequest: {
                forceIntelSurface: true,
            },
            limits: Object.assign({}, configured.intel.limits),
        },
        diagnostics: {
            enabled: configured.diagnostics.enabled,
        },
        drawCaptureTrace: {
            enabled: traceEnabled,
            panelVisible: configured.drawCaptureTrace.enabled,
            copyEnabled: traceEnabled && traceEvents.length > 0,
            disabledReason: getGuiDrawCaptureDisabledReason(configured, traceRuntimeEnabled),
            eventDisplayLimit: 28,
        },
        foresight: {
            configuredEnabled: configured.foresight.enabled,
            controlsEnabled: foresightControlsEnabled,
            visible: foresightControlsEnabled,
            messagesOnly: foresightControlsEnabled && view.foresight.messagesOnly,
            showSpoilers: configured.foresight.showSpoilers,
            actionDisplayLimit: configured.foresight.actionDisplayLimit,
            disabledReason: deriveGuiForesightDisabledReason(configured.foresight.enabled, intelSurface),
            messageFilterTitle: deriveGuiForesightMessageFilterTitle(configured.foresight.enabled, intelSurface, view.foresight.messagesOnly),
        },
        textRecords: {
            detailsEnabled,
            inactiveDisplayLimit: configured.textRecords.inactiveDisplayLimit,
            showForesightSpoilers: configured.foresight.showSpoilers,
            selectedDetailKey: view.textRecords.selectedDetailKey,
            renderedDetailKey: view.textRecords.renderedDetailKey,
        },
        diagnosticJobs: {
            detailsEnabled,
            selectedDetailKey: view.diagnostics.selectedDetailKey,
        },
        reservedLane: deriveGuiReservedLanePolicy(runtime.provider, configured.reservedLane),
    };
}

function deriveGuiRuntimeContextPolicy(context) {
    const source = normalizeGuiPolicyObject(context) || {};
    const gameRootReady = source.gameRootReady === true;
    const supportPathReady = source.supportPathReady === true;
    const closeWithGame = source.closeWithGame === true;
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

function getGuiDrawCaptureDisabledReason(configured, traceRuntimeEnabled) {
    if (!configured.diagnostics.enabled) return 'Draw capture trace disabled in settings.json';
    if (!configured.drawCaptureTrace.enabled) return 'Draw capture trace disabled in settings.json';
    if (!traceRuntimeEnabled) return 'Draw capture trace disabled by the runtime.';
    return '';
}

function deriveGuiForesightDisabledReason(configuredEnabled, intelSurface) {
    if (!configuredEnabled) return 'Foresight disabled in settings.json';
    if (!intelSurface) return 'Intel disabled in settings.json';
    return '';
}

function deriveGuiForesightMessageFilterTitle(configuredEnabled, intelSurface, messagesOnly) {
    if (!configuredEnabled) return 'Foresight disabled in settings.json';
    if (!intelSurface) return 'Intel disabled in settings.json';
    return messagesOnly
        ? 'Show all foresight actions'
        : 'Only show game messages and message-bearing paths';
}

function deriveGuiReservedLanePolicy(provider, configured) {
    const capacity = Number(provider && provider.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
        return {
            status: 'waiting',
            tone: 'neutral',
            message: configured.waitingMessage,
            ready: false,
            capacity: null,
        };
    }
    if (capacity >= configured.minConcurrency) {
        return {
            status: 'ready',
            tone: 'ok',
            message: configured.readyMessage,
            ready: true,
            capacity,
        };
    }
    return {
        status: 'disabled',
        tone: 'warn',
        message: configured.disabledMessage,
        ready: false,
        capacity,
    };
}

function createGuiPolicySnapshot() {
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

function refreshGuiPolicySnapshot() {
    const snapshot = createGuiPolicySnapshot();
    state.configuredPolicy = snapshot.configuredPolicy;
    state.runtimeState = snapshot.runtimeState;
    state.viewState = snapshot.viewState;
    state.effectivePolicy = snapshot.effectivePolicy;
    return snapshot;
}

function getGuiPolicySnapshot() {
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

function getGuiConfiguredPolicy(policySnapshot = null) {
    return (policySnapshot || getGuiPolicySnapshot()).configuredPolicy;
}

function getGuiRuntimeState(policySnapshot = null) {
    return (policySnapshot || getGuiPolicySnapshot()).runtimeState;
}

function getGuiViewState(policySnapshot = null) {
    return (policySnapshot || getGuiPolicySnapshot()).viewState;
}

function getGuiEffectivePolicy(policySnapshot = null) {
    return (policySnapshot || getGuiPolicySnapshot()).effectivePolicy;
}

function getGuiDiagnosticsSnapshotRequest(policySnapshot = null) {
    return getGuiEffectivePolicy(policySnapshot).intel.snapshotRequest;
}

function getGuiDrawCapturePolicy(policySnapshot = null) {
    return getGuiEffectivePolicy(policySnapshot).drawCaptureTrace;
}

function getGuiForesightPolicy(policySnapshot = null) {
    return getGuiEffectivePolicy(policySnapshot).foresight;
}

function getGuiTextRecordPolicy(policySnapshot = null) {
    return getGuiEffectivePolicy(policySnapshot).textRecords;
}

function getGuiDiagnosticJobPolicy(policySnapshot = null) {
    return getGuiEffectivePolicy(policySnapshot).diagnosticJobs;
}

function getGuiReservedLanePolicy(provider = null, policySnapshot = null) {
    if (provider) {
        return deriveGuiReservedLanePolicy(provider, getGuiConfiguredPolicy(policySnapshot).reservedLane);
    }
    return getGuiEffectivePolicy(policySnapshot).reservedLane;
}
