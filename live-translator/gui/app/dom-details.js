// Translator monitor dom details helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function applyFoldedPanelDefault(panelId, stateKey, open, defaultKey) {
    const panel = refs[panelId];
    if (!panel || typeof panel.open === 'undefined') return;
    if (!state.panelDefaultKeys || typeof state.panelDefaultKeys !== 'object') {
        state.panelDefaultKeys = {};
    }
    const key = String(defaultKey === undefined ? open : defaultKey);
    if (state.panelDefaultKeys[stateKey] === key) return;
    state.panelDefaultKeys[stateKey] = key;
    panel.open = open === true;
}

function resetFoldedPanelDefaults() {
    state.panelDefaultKeys = {};
}

function syncFoldedPanelDefaults(policySnapshot = getGuiPolicySnapshot()) {
    const effectivePolicy = getGuiEffectivePolicy(policySnapshot);
    applyFoldedPanelDefault(
        'draw-capture-panel',
        'drawCaptureTrace',
        true,
        `draw:${effectivePolicy.drawCaptureTrace.panelVisible ? 'visible' : 'hidden'}`
    );
    applyFoldedPanelDefault(
        'foresight-panel',
        'foresight',
        true,
        `foresight:${effectivePolicy.foresight.configuredEnabled ? 'configured' : 'disabled'}:${effectivePolicy.foresight.controlsEnabled ? 'controls' : 'no-controls'}`
    );
    applyFoldedPanelDefault('active-text-panel', 'activeText', true, 'active:default');
    applyFoldedPanelDefault('detached-text-panel', 'detachedText', true, 'detached:default');
    applyFoldedPanelDefault('archived-text-panel', 'archivedText', true, 'archived:default');
    applyFoldedPanelDefault(
        'diagnostics-panel',
        'diagnostics',
        effectivePolicy.diagnostics.detailView,
        `diagnostics:${effectivePolicy.diagnostics.mode}`
    );
}

function createLine(value, kind) {
    return createTextElement('span', `text-line ${kind}`, String(value || '-'));
}

function createTextMetaGrid(item) {
    const grid = createMetadataGrid();
    appendMeta(grid, 'First seen', item.firstSeenAt ? formatTime(item.firstSeenAt) : '-');
    appendMeta(grid, 'Seen', item.seenAt ? formatTime(item.seenAt) : '-');
    appendMeta(grid, 'Updated', item.updatedAt ? formatTime(item.updatedAt) : '-');
    appendMeta(grid, 'Screen', item.screenState || (item.onScreen === false ? 'offscreen' : 'visible'));
    if (item.disappearedAt) appendMeta(grid, 'Disappeared', formatTime(item.disappearedAt));
    if (item.deactivatedAt) appendMeta(grid, 'Deactivated', formatTime(item.deactivatedAt));
    appendMeta(grid, 'Lifecycle', item.lifecycleState || item.displayLifecycle || '-');
    appendMeta(grid, 'Priority', Number.isFinite(Number(item.priority)) ? formatNumber(item.priority) : '-');
    const policy = getTextRecordRuntimePolicyDiagnostics(item);
    if (policy.lifecycle) appendMeta(grid, 'Last Lifecycle Policy', formatPolicySection(policy.lifecycle));
    if (policy.priority) appendMeta(grid, 'Last Priority Policy', formatPolicySection(policy.priority));
    if (policy.request) appendMeta(grid, 'Last Request Policy', formatPolicySection(policy.request));
    appendMeta(grid, 'Hook', item.hookKey || item.hook || '-');
    appendMeta(grid, 'Surface', item.surfaceType || item.windowType || item.ownerType || '-');
    appendMeta(grid, 'Method', item.methodName || '-');
    if (item.rawText && item.rawText !== item.original) appendMeta(grid, 'RawDetected', item.rawText);
    if (item.convertedText && item.convertedText !== item.original) appendMeta(grid, 'RenderResolved', item.convertedText);
    appendMeta(grid, 'TranslationSource', item.translationSource || item.normalizedSource || '-');
    appendMeta(grid, 'TranslationReceived', item.translationReceived || '-');
    appendMeta(grid, 'TranslationDrawn', item.translationDrawn || '-');
    if (Number.isFinite(Number(item.x)) || Number.isFinite(Number(item.y))) {
        appendMeta(grid, 'Position', `${formatCoordinate(item.x)}, ${formatCoordinate(item.y)}`);
    }
    if (item.bounds) {
        appendMeta(grid, 'Bounds', formatBounds(item.bounds));
    }
    Object.keys(item.metadata || {}).forEach((key) => {
        appendMeta(grid, key, item.metadata[key]);
    });
    return grid;
}

function appendMeta(container, label, value) {
    appendMetadataItem(container, label, value);
}

function createHistoryList(item) {
    const wrap = createHistoryContainer('History');

    const history = getTextRecordHistory(item);
    if (!history.length) {
        wrap.appendChild(createHistoryEmpty('No history recorded.'));
        return wrap;
    }

    history.forEach((entry) => {
        const detailsText = formatDetails(entry.details);
        wrap.appendChild(createHistoryRow({
            timeText: entry.at ? formatTime(entry.at) : '-',
            labelText: entry.type || 'event',
            messageText: entry.message || '',
            detailsText,
        }));
    });
    return wrap;
}

function getTextRecordHistory(item) {
    const local = Array.isArray(item && item.history) ? item.history : [];
    const seen = new Set();
    return local
        .filter((entry) => {
            if (!entry) return false;
            const key = `${entry.at || ''}|${entry.type || ''}|${entry.message || ''}|${formatDetails(entry.details)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
}

function formatDetails(details) {
    if (!details || typeof details !== 'object') return '';
    return Object.keys(details)
        .filter((key) => details[key] !== undefined && details[key] !== null && details[key] !== '')
        .map((key) => `${key}=${formatDetailValue(details[key])}`)
        .join(', ');
}

function formatDetailValue(value) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return String(value);
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
}

function formatPolicySection(policy) {
    if (!policy || typeof policy !== 'object') return '-';
    const pairs = Object.keys(policy)
        .filter((key) => key !== 'updatedAt' && policy[key] !== undefined && policy[key] !== null && policy[key] !== '')
        .map((key) => `${key}=${formatDetailValue(policy[key])}`);
    return pairs.length ? pairs.join(', ') : '-';
}

function formatBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') return '-';
    const x1 = formatCoordinate(bounds.x1);
    const y1 = formatCoordinate(bounds.y1);
    const x2 = formatCoordinate(bounds.x2);
    const y2 = formatCoordinate(bounds.y2);
    if ([x1, y1, x2, y2].some((value) => value === '-')) return '-';
    return `${x1}, ${y1} - ${x2}, ${y2}`;
}

function normalizeStatusClass(status) {
    const value = String(status || 'detected').toLowerCase();
    if (value === 'completed') return 'completed';
    if (value === 'translating' || value === 'pending' || value === 'detected') return value;
    if (value === 'failed' || value === 'error') return 'failed';
    if (value === 'skipped' || value === 'stale' || value === 'removed' || value === 'disappeared') return value;
    return 'detected';
}

function normalizeDiagnosticStatusClass(status) {
    const value = String(status || 'queued').toLowerCase();
    if (value === 'running' || value === 'queued' || value === 'completed' || value === 'canceled') return value;
    if (value === 'failed' || value === 'error') return 'failed';
    if (value === 'skipped') return 'skipped';
    return normalizeStatusClass(value);
}

function normalizeHookClass(hook) {
    const value = String(hook || '').toLowerCase();
    if (value.includes('bitmap')) return 'bitmap';
    if (value.includes('sprite')) return 'sprite';
    if (value.includes('choice')) return 'choice';
    if (value.includes('message')) return 'message';
    if (value.includes('pixi')) return 'pixi';
    if (value.includes('draw') || value.includes('window')) return 'window';
    return 'unknown';
}

function formatCoordinate(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(Math.round(numeric)) : '-';
}

function createCell(value) {
    return createTextElement('td', '', value);
}

function createStatusCell(value) {
    const cell = document.createElement('td');
    cell.appendChild(createStatusPill(value, toneForHookStatus(value)));
    return cell;
}
