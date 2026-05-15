// Translator monitor render panels helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
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
        const detailEnabled = isDiagnosticsDetailViewEnabled();
        const snapshotOptions = detailEnabled ? null : { detailView: false };
        const textSnapshot = snapshotOptions
            ? readTextOrchestratorSnapshot(gameWindow, snapshotOptions)
            : readTextOrchestratorSnapshot(gameWindow);
        const hasTextFeed = Boolean(textSnapshot);
        const textFeed = normalizeTextOrchestratorSnapshot(textSnapshot);
        state.activeTexts = textFeed.active;
        state.detachedTexts = textFeed.detached;
        state.archivedTexts = textFeed.archived;
        state.textSummary = textFeed.summary;
        state.diagnostics = normalizeDiagnosticsSnapshot(snapshotOptions
            ? readTranslationDiagnosticsSnapshot(gameWindow, snapshotOptions)
            : gameWindow.LiveTranslatorTranslationDiagnosticsSnapshot);
        state.drawCaptureTrace = normalizeDrawCaptureTraceSnapshot(gameWindow.LiveTranslatorDrawCaptureTraceSnapshot);
        state.foresight = normalizeForesightSnapshot(snapshotOptions
            ? readForesightDiagnosticsSnapshot(gameWindow, snapshotOptions)
            : gameWindow.LiveTranslatorForesightSnapshot);
        state.hookSummary = snapshot && snapshot.summary
            ? Object.assign({}, snapshot.summary)
            : (gameWindow.LiveTranslatorHookInstallSummary
                ? Object.assign({}, gameWindow.LiveTranslatorHookInstallSummary)
                : summarizeHookResults(state.hookResults));
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
        return false;
    }
}

function readTranslationDiagnosticsSnapshot(gameWindow, options = {}) {
    const api = gameWindow && gameWindow.LiveTranslatorTranslationDiagnostics;
    if (api && typeof api.getSnapshot === 'function') return api.getSnapshot(options);
    if (api && typeof api.snapshot === 'function') return api.snapshot(options);
    return gameWindow ? gameWindow.LiveTranslatorTranslationDiagnosticsSnapshot : null;
}

function readForesightDiagnosticsSnapshot(gameWindow, options = {}) {
    const api = gameWindow && gameWindow.LiveTranslatorForesightDiagnostics;
    if (api && typeof api.getSnapshot === 'function') return api.getSnapshot(options);
    if (api && typeof api.snapshot === 'function') return api.snapshot(options);
    return gameWindow ? gameWindow.LiveTranslatorForesightSnapshot : null;
}

function renderStatus() {
    renderDiagnosticsPanel();
    renderDrawCaptureTracePanel();
    renderForesightPanel();
}

function renderDiagnosticsPanel() {
    const diagnostics = state.diagnostics;
    if (!diagnostics) {
        setText('diag-concurrency', '0/0');
        setText('diag-queue', '0');
        setText('diag-subscribers', '0');
        setText('diag-cache', state.cacheEntries || '-');
        setText('diag-disk', state.cacheEntries && state.cacheEntries !== '-' ? 'on' : '-');
        renderReservedLaneReminder(null);
        return;
    }

    const provider = diagnostics.provider || {};
    const summary = diagnostics.summary || {};
    const queued = summary.queued || 0;
    const running = summary.running || 0;
    const capacity = provider.capacity || 0;

    setText('diag-concurrency', `${formatNumber(running)}/${formatNumber(capacity)}`);
    setText('diag-queue', formatNumber(queued));
    setText('diag-subscribers', formatNumber(summary.activeSubscribers || 0));
    setText('diag-cache', formatDiagnosticCache(diagnostics.cache));
    setText('diag-disk', diagnostics.cache && diagnostics.cache.diskEnabled ? 'on' : 'off');
    renderReservedLaneReminder(provider);
}

function renderDrawCaptureTracePanel() {
    const trace = state.drawCaptureTrace;
    const panel = refs['draw-capture-panel'];
    const container = refs['draw-capture-trace'];
    const copyButton = refs['draw-capture-copy'];
    const enabled = isDrawCaptureTraceEnabled();
    if (panel) panel.hidden = !enabled;
    if (copyButton) {
        const canCopy = enabled && Boolean(trace && trace.events && trace.events.length);
        copyButton.disabled = !canCopy;
        copyButton.title = enabled
            ? (canCopy ? 'Copy draw capture trace' : 'No draw capture trace to copy')
            : 'Draw capture trace disabled in settings.json';
    }
    if (!enabled) {
        setSummaryStatus('draw-capture-summary', 'neutral', 'disabled');
        if (container) container.innerHTML = '';
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
    events.slice(-28).reverse().forEach((event) => {
        container.appendChild(createDrawCaptureTraceRow(event));
    });
}

function createDrawCaptureTraceRow(event) {
    const row = document.createElement('div');
    row.className = 'capture-trace-row';

    const stage = document.createElement('div');
    stage.className = 'capture-trace-stage';
    stage.textContent = event.stage || 'draw';
    row.appendChild(stage);

    const main = document.createElement('div');
    main.className = 'capture-trace-main';

    const text = document.createElement('div');
    text.className = 'capture-trace-text';
    text.textContent = event.normalizedText || event.visibleText || event.rawText || '-';
    main.appendChild(text);

    const meta = document.createElement('div');
    meta.className = 'capture-trace-meta';
    meta.textContent = formatDrawCaptureTraceMeta(event);
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
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = text;
    container.appendChild(empty);
}

function renderReservedLaneReminder(provider) {
    const capacity = provider && Number(provider.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
        setReservedLaneReminder('neutral', RESERVED_LANE_WAITING_MESSAGE);
        return;
    }
    if (capacity >= RESERVED_LANE_MIN_CONCURRENCY) {
        setReservedLaneReminder('ok', RESERVED_LANE_READY_MESSAGE);
        return;
    }
    setReservedLaneReminder('warn', RESERVED_LANE_DISABLED_MESSAGE);
}

function renderForesightPanel() {
    const container = refs['foresight-tree'];
    const panel = refs['foresight-panel'];
    if (panel) panel.hidden = false;
    if (!container) return;
    syncForesightVisibilityToggle();
    syncForesightMessageFilterToggle();
    if (!isForesightEnabled()) {
        container.hidden = true;
        container.innerHTML = '';
        setSummaryStatus('foresight-summary', 'neutral', getForesightDisabledMessage());
        setForesightCopyEnabled(false);
        return;
    }
    const detailEnabled = isDiagnosticsDetailViewEnabled();
    const surfaceOnly = !detailEnabled;
    if (!state.foresightVisible) {
        container.hidden = true;
        setSummaryStatus('foresight-summary', 'neutral', 'hidden');
        const model = surfaceOnly
            ? createForesightDiagnosticsModel(state.foresight, getForesightTextRecords(), {
                maxActions: FORESIGHT_SURFACE_DISPLAY_LIMIT,
                messagesOnly: true,
                surfaceOnly: true,
            })
            : createForesightDiagnosticsModel(state.foresight, getForesightTextRecords());
        setForesightCopyEnabled(detailEnabled && Boolean(model && model.hasSnapshot && model.scan));
        return;
    }
    container.hidden = false;
    const viewer = globalThis.LiveTranslatorForesightTreeViewer
        || (globalThis.window && globalThis.window.LiveTranslatorForesightTreeViewer);
    if (!viewer || typeof viewer.render !== 'function') {
        setSummaryStatus('foresight-summary', 'warn', 'viewer missing');
        setForesightCopyEnabled(false);
        container.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Foresight viewer is unavailable.';
        container.appendChild(empty);
        return;
    }

    const renderOptions = {
        snapshot: state.foresight,
        textRecords: getForesightTextRecords(),
        createTranslationPill: createForesightTranslationPill,
        maxActions: FORESIGHT_ACTION_DISPLAY_LIMIT,
        messagesOnly: state.foresightMessagesOnly,
        dynamicRenderKey: createForesightDynamicRenderKey(),
        formatTime,
    };
    if (surfaceOnly) {
        renderOptions.maxActions = FORESIGHT_SURFACE_DISPLAY_LIMIT;
        renderOptions.messagesOnly = true;
        renderOptions.surfaceOnly = true;
    }
    const model = viewer.render(container, renderOptions);
    renderForesightSummary(model);
    setForesightCopyEnabled(detailEnabled && Boolean(model && model.hasSnapshot && model.scan));
}

function syncForesightVisibilityToggle() {
    const toggle = refs['foresight-view-toggle'];
    if (!toggle) return;
    const enabled = isForesightEnabled();
    toggle.disabled = !enabled;
    toggle.checked = enabled && state.foresightVisible;
    toggle.title = enabled
        ? (state.foresightVisible ? 'Hide foresight' : 'Show foresight')
        : 'Foresight disabled in settings.json';
}

function syncForesightMessageFilterToggle() {
    const toggle = refs['foresight-message-filter-toggle'];
    if (!toggle) return;
    const detailEnabled = isDiagnosticsDetailViewEnabled();
    const enabled = isForesightEnabled() && detailEnabled;
    toggle.checked = detailEnabled ? (enabled && state.foresightMessagesOnly) : true;
    toggle.disabled = !enabled || !state.foresightVisible;
    toggle.title = !enabled
        ? (isForesightEnabled() ? 'Performance mode; showing limited foresight messages' : 'Foresight disabled in settings.json')
        : (state.foresightMessagesOnly
        ? 'Show all foresight actions'
        : 'Only show game messages and message-bearing paths');
}

function createForesightDynamicRenderKey() {
    const diagnostics = state.diagnostics || {};
    const summary = diagnostics.summary || {};
    return [
        shouldShowForesightSpoilers() ? 'spoilers:show' : 'spoilers:censor',
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
    if (model.surfaceOnly === true) {
        const messageCount = count || blocks;
        const suffix = hidden > 0 ? ` / +${formatNumber(hidden)} hidden` : '';
        setSummaryStatus('foresight-summary', getForesightSummaryTone(model), `${formatNumber(messageCount)} messages${suffix}`);
        return;
    }
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

function formatDiagnosticCache(cache) {
    const source = cache || {};
    return formatNumber(source.completed || 0);
}

function renderDiagnosticJobList(bodyId, jobs, mode) {
    const list = Array.isArray(jobs) ? jobs : [];
    const container = refs[bodyId];
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = mode === 'past'
            ? 'No past translation jobs.'
            : (mode === 'queued' ? 'No queued translation jobs.' : 'No running translation jobs.');
        container.appendChild(empty);
        return;
    }

    container.innerHTML = '';
    list.forEach((job) => {
        const key = getDiagnosticJobDetailKey(mode, job);
        container.appendChild(createDiagnosticJobPill(job, mode, key));
        if (isDiagnosticsDetailViewEnabled() && state.diagnosticDetailKey === key) {
            container.appendChild(createDiagnosticJobExpanded(job, mode, key));
        }
    });
}
