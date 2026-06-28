// Translator monitor render panels helpers.
// These functions share state from gui/app/state.js and are loaded before app/index.js boots.
'use strict';

function refreshRuntimeFeed() {
    const gameWindow = getGameWindow();
    if (!gameWindow) {
        state.hookResults = [];
        state.hookSummary = null;
        state.textSummary = null;
        state.diagnostics = null;
        state.drawCaptureTrace = null;
        state.foresight = null;
        state.activeTexts = [];
        state.detachedTexts = [];
        state.archivedTexts = [];
        refreshGuiPolicySnapshot();
        return false;
    }

    try {
        rememberSettings(gameWindow.LiveTranslatorSettings, 'runtime settings');
        const snapshot = gameWindow.LiveTranslatorHookInstallSnapshot;
        const results = snapshot && Array.isArray(snapshot.results)
            ? snapshot.results
            : (Array.isArray(gameWindow.LiveTranslatorHookInstallResults)
                ? gameWindow.LiveTranslatorHookInstallResults
                : []);
        state.hookResults = results.map(normalizeHookFeedResult);
        const snapshotOptions = getGuiDiagnosticsSnapshotRequest(refreshGuiPolicySnapshot());
        const textSnapshot = readTextOrchestratorSnapshot(gameWindow, snapshotOptions);
        const hasTextFeed = Boolean(textSnapshot);
        const textFeed = normalizeTextOrchestratorSnapshot(textSnapshot);
        state.activeTexts = textFeed.active;
        state.detachedTexts = textFeed.detached;
        state.archivedTexts = textFeed.archived;
        state.textSummary = textFeed.summary;
        state.diagnostics = normalizeDiagnosticsSnapshot(readTranslationIntelSnapshot(gameWindow, snapshotOptions));
        state.drawCaptureTrace = normalizeDrawCaptureTraceSnapshot(gameWindow.LiveTranslatorDrawCaptureTraceSnapshot);
        state.foresight = normalizeForesightSnapshot(readForesightIntelSnapshot(gameWindow, snapshotOptions));
        state.hookSummary = snapshot && snapshot.summary
            ? Object.assign({}, snapshot.summary)
            : (gameWindow.LiveTranslatorHookInstallSummary
                ? Object.assign({}, gameWindow.LiveTranslatorHookInstallSummary)
                : summarizeHookResults(state.hookResults));
        refreshGuiPolicySnapshot();
        return state.hookResults.length > 0 || hasTextFeed || !!state.diagnostics || !!state.drawCaptureTrace || !!state.foresight;
    } catch (err) {
        state.hookResults = [];
        state.hookSummary = null;
        state.textSummary = null;
        state.diagnostics = null;
        state.drawCaptureTrace = null;
        state.foresight = null;
        state.activeTexts = [];
        state.detachedTexts = [];
        state.archivedTexts = [];
        addLog('warn', `Runtime feed read failed: ${formatError(err)}`);
        refreshGuiPolicySnapshot();
        return false;
    }
}

function readTranslationIntelSnapshot(gameWindow, options = {}) {
    const api = gameWindow && gameWindow.LiveTranslatorTranslationIntel;
    if (api && typeof api.getSnapshot === 'function') return api.getSnapshot(options);
    if (api && typeof api.snapshot === 'function') return api.snapshot(options);
    return gameWindow ? gameWindow.LiveTranslatorTranslationIntelSnapshot : null;
}

function readForesightIntelSnapshot(gameWindow, options = {}) {
    const api = gameWindow && gameWindow.LiveTranslatorForesightIntel;
    if (api && typeof api.getSnapshot === 'function') return api.getSnapshot(options);
    if (api && typeof api.snapshot === 'function') return api.snapshot(options);
    return gameWindow ? gameWindow.LiveTranslatorForesightIntelSnapshot : null;
}

function renderStatus(policySnapshot = refreshGuiPolicySnapshot()) {
    if (typeof syncFoldedPanelDefaults === 'function') syncFoldedPanelDefaults(policySnapshot);
    renderDiagnosticsPanel(policySnapshot);
    renderDrawCaptureTracePanel(policySnapshot);
    renderForesightPanel(policySnapshot);
}

function renderRuntimePanelsForFeed(policySnapshot = refreshGuiPolicySnapshot(), options = {}) {
    const force = options && options.force === true;
    if (typeof syncFoldedPanelDefaults === 'function') syncFoldedPanelDefaults(policySnapshot);
    const keys = createRuntimePanelRenderKeys(policySnapshot);
    if (force || hasRuntimePanelKeyChanged('status', keys.status)) {
        renderStatus(policySnapshot);
        rememberRuntimePanelKey('status', keys.status);
    }
    if (force || hasRuntimePanelKeyChanged('hooks', keys.hooks)) {
        renderHookResults();
        rememberRuntimePanelKey('hooks', keys.hooks);
    }
    if (force || hasRuntimePanelKeyChanged('textRecords', keys.textRecords)) {
        renderTextRecordSections(policySnapshot);
        rememberRuntimePanelKey('textRecords', keys.textRecords);
    }
}

function hasRuntimePanelKeyChanged(name, key) {
    const renderedKeys = state.renderedPanelKeys || {};
    return renderedKeys[name] !== key;
}

function rememberRuntimePanelKey(name, key) {
    if (!state.renderedPanelKeys || typeof state.renderedPanelKeys !== 'object') {
        state.renderedPanelKeys = {};
    }
    state.renderedPanelKeys[name] = key;
}

function createRuntimePanelRenderKeys(policySnapshot = getGuiPolicySnapshot()) {
    const effectivePolicy = getGuiEffectivePolicy(policySnapshot);
    return {
        status: createRuntimePanelRenderKey({
            diagnostics: createIntelPanelKeySource(state.diagnostics),
            drawCaptureTrace: createDrawCapturePanelKeySource(state.drawCaptureTrace),
            foresight: createForesightPanelKeySource(state.foresight),
            intelPolicy: effectivePolicy.intel,
            drawCapturePolicy: effectivePolicy.drawCaptureTrace,
            foresightPolicy: effectivePolicy.foresight,
            cacheEntries: state.cacheEntries || '-',
        }),
        hooks: createRuntimePanelRenderKey({
            summary: state.hookSummary || null,
            results: (Array.isArray(state.hookResults) ? state.hookResults : []).map((item) => [
                item && item.name,
                item && item.displayName,
                item && item.status,
                item && item.reason,
            ]),
        }),
        textRecords: createRuntimePanelRenderKey({
            policy: {
                detailsEnabled: effectivePolicy.textRecords.detailsEnabled,
                inactiveDisplayLimit: effectivePolicy.textRecords.inactiveDisplayLimit,
                showForesightSpoilers: effectivePolicy.textRecords.showForesightSpoilers,
            },
            active: createTextRecordPanelKeySource(state.activeTexts),
            detached: createTextRecordPanelKeySource(state.detachedTexts),
            archived: createTextRecordPanelKeySource(state.archivedTexts),
        }),
    };
}

function createIntelPanelKeySource(diagnostics) {
    const source = diagnostics || {};
    const provider = source.provider || {};
    const jobs = source.jobs || {};
    const summary = source.summary || {};
    const cache = source.cache || {};
    return {
        updatedAt: source.updatedAt || '',
        translatorProvider: state.translatorProvider || state.provider || '',
        translatorConfigError: state.translatorConfigError || '',
        provider: {
            kind: provider.kind || '',
            apiResponding: provider.apiResponding === true,
            modelCatalogAt: provider.modelCatalogAt || '',
            modelCatalogError: provider.modelCatalogError || '',
            modelCount: provider.modelCount || 0,
            loadedLlmInstanceCount: provider.loadedLlmInstanceCount || 0,
            modelSelectionReady: provider.modelSelectionReady === true,
            modelSelectionError: provider.modelSelectionError || '',
            statusUpdatedAt: provider.statusUpdatedAt || '',
            modelKey: provider.modelKey || '',
            modelInstanceId: provider.modelInstanceId || '',
            modelAuthor: provider.modelAuthor || '',
            modelName: provider.modelName || '',
            quantization: provider.quantization || '',
            selectedVariant: provider.selectedVariant || '',
            capacity: provider.capacity || 0,
            capacityVerified: provider.capacityVerified === true,
            running: provider.running || 0,
            refreshingCapacity: provider.refreshingCapacity === true,
            lastCapacityRefreshAt: provider.lastCapacityRefreshAt || '',
            lastCapacityRefreshError: provider.lastCapacityRefreshError || '',
        },
        providerErrors: createLmStudioDiagnosticErrorKeySource(jobs),
        summary: {
            queued: summary.queued || 0,
            running: summary.running || 0,
            activeSubscribers: summary.activeSubscribers || 0,
        },
        cache: {
            completed: cache.completed || 0,
            diskEnabled: cache.diskEnabled === true,
        },
    };
}

function createLmStudioDiagnosticErrorKeySource(jobs) {
    const source = jobs && typeof jobs === 'object' ? jobs : {};
    return ['running', 'queued', 'past'].map((name) => {
        const list = Array.isArray(source[name]) ? source[name] : [];
        return list.map((job) => [
            job && job.id,
            job && job.status,
            job && job.lastError,
            job && job.terminalAt,
            job && job.startedAt,
            job && job.queuedAt,
            job && job.createdAt,
        ]);
    });
}

function createDrawCapturePanelKeySource(trace) {
    const source = trace || {};
    return {
        updatedAt: source.updatedAt || '',
        enabled: source.enabled !== false,
        size: source.size || 0,
        sequence: source.sequence || 0,
        events: (Array.isArray(source.events) ? source.events : []).map((event) => [
            event && event.seq,
            event && event.at,
            event && event.stage,
            event && event.normalizedText,
            event && event.reason,
            event && event.status,
        ]),
    };
}

function createForesightPanelKeySource(snapshot) {
    const source = snapshot || {};
    const recent = Array.isArray(source.recent) ? source.recent : [];
    const scan = recent.length ? recent[recent.length - 1] : null;
    return {
        updatedAt: source.updatedAt || '',
        recent: recent.length,
        latestScan: scan ? [
            scan.at,
            scan.status,
            scan.blocks,
            scan.stopReason,
            scan.commandActionsTruncated,
            Array.isArray(scan.commandActions) ? scan.commandActions.length : 0,
        ] : null,
    };
}

function createTextRecordPanelKeySource(records) {
    return (Array.isArray(records) ? records : []).map((item) => [
        getTextRecordKey(item),
        item && item.status,
        item && item.lifecycleState,
        item && item.displayLifecycle,
        item && item.rawText,
        item && item.original,
        item && item.translation,
        item && item.translationReceived,
        item && item.translationDrawn,
        item && item.updatedAt,
        item && item.seenAt,
        item && item.disappearedAt,
        item && item.deactivatedAt,
        item && item.metadata && item.metadata.foresightConsumed,
        item && item.policy,
        Array.isArray(item && item.history) ? item.history.length : 0,
    ]);
}

function createRuntimePanelRenderKey(value) {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(Date.now());
    }
}

function renderDiagnosticsPanel(policySnapshot = refreshGuiPolicySnapshot()) {
    const diagnostics = state.diagnostics;
    const translatorStatus = createLmStudioStatusModel(diagnostics);
    renderLmStudioStatus(translatorStatus);
    renderLmStudioComplaint(translatorStatus);
    renderReservedLaneReminder(translatorStatus, policySnapshot);
}

function getLmStudioStatusSource() {
    return {
        provider: state.translatorProvider || state.provider || '',
        configError: state.translatorConfigError || '',
    };
}

function createLmStudioStatusModel(diagnostics, source = getLmStudioStatusSource()) {
    const configSource = source && typeof source === 'object' ? source : {};
    const diagnosticProvider = diagnostics && diagnostics.provider ? diagnostics.provider : null;
    const provider = diagnosticProvider || {};
    const runtimeProvider = normalizeTranslatorProviderName(provider.kind || '');
    const configuredProvider = normalizeTranslatorProviderName(configSource.provider || '');
    const effectiveProvider = runtimeProvider && runtimeProvider !== 'unknown'
        ? runtimeProvider
        : configuredProvider;

    if (effectiveProvider !== 'local') {
        return {
            visible: false,
            complaintVisible: false,
            laneVisible: false,
            provider: null,
        };
    }

    const connectionError = findLmStudioConnectionError(diagnostics, configSource);
    const availabilityComplaint = findLmStudioAvailabilityComplaint(provider);
    const statusUpdatedAt = getLmStudioStatusUpdatedAt(provider);
    const jobError = provider.modelSelectionReady === true
        ? findLatestLmStudioJobError(diagnostics && diagnostics.jobs, statusUpdatedAt)
        : '';
    const capacity = Number(provider.capacity) || 0;
    const concurrencyVisible = provider.capacityVerified === true && capacity > 0;
    const apiConnected = provider.apiResponding === true;
    const hasError = !!connectionError;
    const complaint = connectionError
        ? formatLmStudioComplaint(connectionError)
        : (availabilityComplaint || (jobError ? formatLmStudioComplaint(jobError) : ''));
    const model = formatLmStudioModelLabel(provider);
    const connection = hasError ? 'Error' : (apiConnected ? 'Connected' : 'Pending');
    const tone = hasError ? 'bad' : (complaint ? 'warn' : (connection === 'Connected' ? 'ok' : 'neutral'));

    return {
        visible: true,
        tone,
        connection,
        model,
        concurrency: concurrencyVisible ? `Concurrency ${formatNumber(capacity)}` : '',
        concurrencyVisible,
        complaint,
        complaintVisible: !!complaint,
        laneVisible: !hasError && !complaint && concurrencyVisible,
        provider: diagnosticProvider,
    };
}

function formatLmStudioModelLabel(provider) {
    const source = provider && typeof provider === 'object' ? provider : {};
    const author = normalizeStatusText(source.modelAuthor);
    const name = normalizeStatusText(source.modelName);
    const quantization = normalizeStatusText(source.quantization);
    if (source.apiResponding === true
        && source.modelSelectionReady !== true
        && Number(source.loadedLlmInstanceCount) === 0
        && (source.modelSelectionError || source.modelCatalogAt)) {
        return 'no model loaded';
    }
    if (!author && !name && !quantization) return 'model pending';
    const base = author && name
        ? `${author}/${name}`
        : (name || author || 'model pending');
    return quantization ? `${base}@${quantization}` : base;
}

function normalizeStatusText(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim();
}

function findLmStudioConnectionError(diagnostics, source) {
    const configError = source && source.configError ? String(source.configError) : '';
    if (configError) return configError;

    const provider = diagnostics && diagnostics.provider ? diagnostics.provider : {};
    if (provider.apiResponding === true) return '';
    const providerError = provider.modelCatalogError || provider.lastCapacityRefreshError || '';
    return providerError ? String(providerError) : '';
}

function findLmStudioAvailabilityComplaint(provider) {
    const source = provider && typeof provider === 'object' ? provider : {};
    if (source.apiResponding !== true || source.modelSelectionReady === true) return '';
    const selectionError = normalizeStatusText(source.modelSelectionError || source.lastCapacityRefreshError);
    if (isLmStudioNoModelLoaded(source, selectionError)) return 'No LM Studio model loaded.';
    if (!selectionError) return '';
    return formatLmStudioComplaint(selectionError);
}

function isLmStudioNoModelLoaded(provider, errorText) {
    const loadedCount = Number(provider && provider.loadedLlmInstanceCount);
    if (Number.isFinite(loadedCount) && loadedCount === 0 && /auto|not loaded|loaded LLM instance|model/i.test(errorText || '')) return true;
    return /currently has 0 loaded LLM instance|0 loaded LLM instance|no loaded LLM/i.test(errorText || '');
}

function getLmStudioStatusUpdatedAt(provider) {
    const source = provider && typeof provider === 'object' ? provider : {};
    for (const key of ['statusUpdatedAt', 'modelCatalogAt', 'lastCapacityRefreshAt']) {
        const numeric = Number(source[key]);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
        const time = Date.parse(source[key] || '');
        if (Number.isFinite(time)) return time;
    }
    return 0;
}

function findLatestLmStudioJobError(jobs, ignoreAtOrBefore = 0) {
    const source = jobs && typeof jobs === 'object' ? jobs : {};
    const cutoff = Number(ignoreAtOrBefore) || 0;
    const candidates = [];
    ['running', 'queued', 'past'].forEach((name) => {
        const list = Array.isArray(source[name]) ? source[name] : [];
        list.forEach((job) => {
            const message = job && job.lastError ? String(job.lastError) : '';
            if (!message) return;
            const at = getLmStudioJobErrorTime(job);
            if (cutoff > 0 && at > 0 && at <= cutoff) return;
            candidates.push({
                message,
                at,
            });
        });
    });
    candidates.sort((left, right) => right.at - left.at);
    return candidates.length ? candidates[0].message : '';
}

function getLmStudioJobErrorTime(job) {
    const source = job || {};
    for (const key of ['terminalAt', 'startedAt', 'queuedAt', 'createdAt']) {
        const raw = source[key];
        const numeric = Number(raw);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
        const time = Date.parse(raw || '');
        if (Number.isFinite(time)) return time;
    }
    return 0;
}

function formatLmStudioComplaint(errorText) {
    const message = String(errorText || '').replace(/\s+/gu, ' ').trim();
    if (!message) return '';
    if (/currently has 0 loaded LLM instance|0 loaded LLM instance|no loaded LLM/i.test(message)) {
        return 'No LM Studio model loaded.';
    }
    if (/failed to fetch|network|cors|cross-origin|blocked|ECONNREFUSED|ECONNRESET|no response|load failed/i.test(message)) {
        return `LM Studio connection failed: ${message}`;
    }
    if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
        return `LM Studio did not respond before timeout: ${message}`;
    }
    if (/auto|exactly one|loaded LLM instance/i.test(message)) {
        return `LM Studio model selection failed: ${message}`;
    }
    if (/Local LLM (model list|stream|request|error)/i.test(message)) {
        return `LM Studio error: ${message}`;
    }
    if (/not loaded|was not found|auto-loaded|model|instance/i.test(message)) {
        return `LM Studio model issue: ${message}`;
    }
    return `LM Studio error: ${message}`;
}

function renderLmStudioStatus(status) {
    const model = status && typeof status === 'object' ? status : createLmStudioStatusModel(null);
    setLmStudioStatus(model.tone || 'neutral', {
        visible: model.visible === true,
        connection: model.connection || 'Pending',
        concurrency: model.concurrency || '',
        concurrencyVisible: model.concurrencyVisible === true,
        model: model.model || 'model pending',
    });
}

function renderLmStudioComplaint(status) {
    const model = status && typeof status === 'object' ? status : {};
    setLmStudioComplaint(model.tone || 'neutral', model.complaint || '', model.complaintVisible === true);
}

function renderDrawCaptureTracePanel(policySnapshot = refreshGuiPolicySnapshot()) {
    const trace = state.drawCaptureTrace;
    const panel = refs['draw-capture-panel'];
    const container = refs['draw-capture-trace'];
    const copyButton = refs['draw-capture-copy'];
    const tracePolicy = getGuiDrawCapturePolicy(policySnapshot);
    const enabled = tracePolicy.enabled;
    if (panel) panel.hidden = !tracePolicy.panelVisible;
    if (copyButton) {
        const canCopy = tracePolicy.copyEnabled;
        copyButton.disabled = !canCopy;
        copyButton.title = enabled
            ? (canCopy ? 'Copy draw capture trace' : 'No draw capture trace to copy')
            : tracePolicy.disabledReason;
    }
    if (!enabled) {
        setSummaryStatus('draw-capture-summary', 'neutral', 'disabled');
        if (container) {
            container.innerHTML = '';
            appendEmptyState(container, tracePolicy.disabledReason || 'Draw capture trace disabled.');
        }
        return;
    }
    if (!container) return;
    container.innerHTML = '';
    if (!trace) {
        setSummaryStatus('draw-capture-summary', 'neutral', 'no trace');
        appendEmpty(container, 'No draw capture trace.');
        return;
    }
    const events = Array.isArray(trace.events) ? trace.events : [];
    const label = trace.enabled
        ? `${formatNumber(events.length)} event${events.length === 1 ? '' : 's'}`
        : 'disabled';
    setSummaryStatus('draw-capture-summary', events.length ? 'ok' : 'neutral', label);
    if (!events.length) {
        appendEmpty(container, 'No draw capture trace.');
        return;
    }
    events.slice(-tracePolicy.eventDisplayLimit).reverse().forEach((event) => {
        container.appendChild(createDrawCaptureTraceRow(event));
    });
}

function createDrawCaptureTraceRow(event) {
    const row = document.createElement('div');
    row.className = 'capture-trace-row';

    const stage = createTextElement('div', 'capture-trace-stage', event.stage || 'draw');
    row.appendChild(stage);

    const main = document.createElement('div');
    main.className = 'capture-trace-main';

    const text = createTextElement('div', 'capture-trace-text', event.normalizedText || event.visibleText || event.rawText || '-');
    main.appendChild(text);

    const meta = createTextElement('div', 'capture-trace-meta', formatDrawCaptureTraceMeta(event));
    main.appendChild(meta);

    row.appendChild(main);
    return row;
}

function formatDrawCaptureTraceMeta(event) {
    const parts = [];
    if (event.at) parts.push(formatTime(event.at));
    if (event.adapter) parts.push(event.adapter);
    if (event.methodName) parts.push(event.methodName);
    if (event.windowType) parts.push(event.windowType);
    else if (event.ownerType) parts.push(event.ownerType);
    if (event.reason) parts.push(event.reason);
    if (event.status) parts.push(event.status);
    const x = Number(event.x);
    const y = Number(event.y);
    if (Number.isFinite(x) || Number.isFinite(y)) {
        parts.push(`(${Number.isFinite(x) ? x : '-'},${Number.isFinite(y) ? y : '-'})`);
    }
    return parts.join(' | ');
}

function appendEmpty(container, text) {
    if (!container) return;
    appendEmptyState(container, text);
}

function renderReservedLaneReminder(translatorStatus, policySnapshot = refreshGuiPolicySnapshot()) {
    const status = translatorStatus && typeof translatorStatus === 'object' ? translatorStatus : {};
    if (status.visible !== true || status.laneVisible !== true) {
        setReservedLaneReminder('neutral', '', false);
        return;
    }
    const lanePolicy = getGuiReservedLanePolicy(status.provider || null, policySnapshot);
    setReservedLaneReminder(lanePolicy.tone, lanePolicy.message, lanePolicy.status !== 'ready');
}

function renderForesightPanel(policySnapshot = refreshGuiPolicySnapshot()) {
    const container = refs['foresight-tree'];
    const panel = refs['foresight-panel'];
    const foresightPolicy = getGuiForesightPolicy(policySnapshot);
    if (panel) panel.hidden = false;
    if (!container) return;
    syncForesightPanelDisabledState(foresightPolicy);
    syncForesightMessageFilterToggle(policySnapshot);
    if (!foresightPolicy.controlsEnabled) {
        container.innerHTML = '';
        container.hidden = true;
        setSummaryStatus('foresight-summary', 'neutral', 'disabled');
        setForesightCopyEnabled(false);
        return;
    }
    container.hidden = false;
    const viewer = globalThis.LiveTranslatorForesightTreeViewer
        || (globalThis.window && globalThis.window.LiveTranslatorForesightTreeViewer);
    if (!viewer || typeof viewer.render !== 'function') {
        setSummaryStatus('foresight-summary', 'warn', 'viewer missing');
        setForesightCopyEnabled(false);
        container.innerHTML = '';
        appendEmptyState(container, 'Foresight viewer is unavailable.');
        return;
    }

    const textRecords = getForesightTextRecords();
    const textRecordRenderContext = createTextRecordRenderContext(policySnapshot, textRecords);
    const model = viewer.render(container, {
        snapshot: state.foresight,
        textRecords,
        currentMessageRecord: getCurrentForesightGameMessageRecord(state.activeTexts || []),
        createTranslationPill: (item) => createForesightTranslationPillForContext(item, textRecordRenderContext),
        maxActions: foresightPolicy.actionDisplayLimit,
        messagesOnly: foresightPolicy.messagesOnly,
        dynamicRenderKey: createForesightDynamicRenderKey(policySnapshot),
        formatTime,
    });
    renderForesightSummary(model);
    setForesightCopyEnabled(Boolean(model && model.hasSnapshot && model.scan));
}

function syncForesightPanelDisabledState(foresightPolicy = getGuiForesightPolicy()) {
    const panel = refs['foresight-panel'];
    const disabled = !foresightPolicy.controlsEnabled;
    if (!panel) return;
    if (panel.classList) panel.classList.toggle('foresight-panel-disabled', disabled);
    if (disabled) {
        panel.open = false;
        if (typeof panel.setAttribute === 'function') panel.setAttribute('aria-disabled', 'true');
        panel.title = foresightPolicy.disabledReason || 'Foresight disabled';
    } else {
        if (typeof panel.removeAttribute === 'function') panel.removeAttribute('aria-disabled');
        panel.title = '';
    }
}

function syncForesightMessageFilterToggle(policySnapshot = refreshGuiPolicySnapshot()) {
    const toggle = refs['foresight-message-filter-toggle'];
    if (!toggle) return;
    const foresightPolicy = getGuiForesightPolicy(policySnapshot);
    toggle.checked = foresightPolicy.controlsEnabled && foresightPolicy.messagesOnly;
    toggle.disabled = !foresightPolicy.controlsEnabled;
    toggle.title = foresightPolicy.messageFilterTitle;
    const wrapper = toggle.parentNode;
    if (wrapper && typeof wrapper.hidden !== 'undefined') wrapper.hidden = !foresightPolicy.controlsEnabled;
}

function createForesightDynamicRenderKey(policySnapshot = refreshGuiPolicySnapshot()) {
    const diagnostics = state.diagnostics || {};
    const summary = diagnostics.summary || {};
    const textRecordPolicy = getGuiTextRecordPolicy(policySnapshot);
    return [
        textRecordPolicy.showForesightSpoilers ? 'spoilers:show' : 'spoilers:censor',
        diagnostics.updatedAt || '',
        summary.queued || 0,
        summary.running || 0,
        summary.activeSubscribers || 0,
    ].join('|');
}

function renderForesightSummary(model) {
    if (!model || !model.hasSnapshot || !model.scan) {
        setSummaryStatus('foresight-summary', 'neutral', 'no scans');
        return;
    }
    const count = Number(model.actionCount) || 0;
    const hidden = Number(model.actionsTruncated) || 0;
    const condensed = Number(model.condensedActionCount) || 0;
    const blocks = Number(model.scan.blocks) || 0;
    const suffix = [
        hidden > 0 ? `+${formatNumber(hidden)} hidden` : '',
        condensed > 0 ? `${formatNumber(condensed)} condensed` : '',
        blocks > 0 ? `${formatNumber(blocks)} messages` : '',
    ].filter(Boolean).join(' / ');
    const label = suffix ? `${formatNumber(count)} actions / ${suffix}` : `${formatNumber(count)} actions`;
    setSummaryStatus('foresight-summary', getForesightSummaryTone(model), label);
}

function getForesightSummaryTone(model) {
    const scan = model && model.scan ? model.scan : {};
    if (scan.routeBarriers
        || (scan.barrierCode !== null && scan.barrierCode !== undefined)) return 'warn';
    if (scan.stopReason && !['event-end', 'message-limit', 'scan-limit'].includes(scan.stopReason)) return 'warn';
    return model && model.actionCount ? 'ok' : 'neutral';
}

function setForesightCopyEnabled(enabled) {
    const button = refs['foresight-copy'];
    if (!button) return;
    const foresightPolicy = getGuiForesightPolicy();
    button.hidden = !foresightPolicy.controlsEnabled;
    button.disabled = !enabled;
    button.title = enabled ? 'Copy foresight diagnostics' : 'No foresight diagnostics to copy';
}

function renderCapacityStatus(provider) {
    const source = provider || {};
    if (source.lastCapacityRefreshError) {
        setSummaryStatus('diag-capacity-status', 'bad', 'capacity fallback');
        if (refs['diag-capacity-status']) refs['diag-capacity-status'].title = source.lastCapacityRefreshError;
        return;
    }
    if (refs['diag-capacity-status']) refs['diag-capacity-status'].title = '';
    if (source.refreshingCapacity) {
        setSummaryStatus('diag-capacity-status', 'neutral', 'refreshing capacity');
        return;
    }
    if (source.lastCapacityRefreshAt) {
        setSummaryStatus('diag-capacity-status', 'ok', `capacity refreshed ${formatElapsedSince(source.lastCapacityRefreshAt)} ago`);
        return;
    }
    setSummaryStatus('diag-capacity-status', 'neutral', 'capacity pending');
}

function renderDiagnosticJobList(bodyId, jobs, mode, policySnapshot = refreshGuiPolicySnapshot()) {
    const list = Array.isArray(jobs) ? jobs : [];
    const container = refs[bodyId];
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '';
        appendEmptyState(container, mode === 'past'
            ? 'No past translation jobs.'
            : (mode === 'queued' ? 'No queued translation jobs.' : 'No running translation jobs.'));
        return;
    }

    container.innerHTML = '';
    list.forEach((job) => {
        const key = getDiagnosticJobDetailKey(mode, job);
        container.appendChild(createDiagnosticJobPill(job, mode, key, policySnapshot));
        const jobPolicy = getGuiDiagnosticJobPolicy(policySnapshot);
        if (jobPolicy.detailsEnabled && jobPolicy.selectedDetailKey === key) {
            container.appendChild(createDiagnosticJobExpanded(job, mode, key));
        }
    });
}
