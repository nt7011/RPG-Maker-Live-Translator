// Translator monitor dom details helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function setPanelAutoCollapsed(panelId, stateKey, healthy) {
    const panel = refs[panelId];
    if (!panel) return;
    const nextHealth = Boolean(healthy);
    if (state.panelHealth[stateKey] === nextHealth) return;
    state.panelHealth[stateKey] = nextHealth;
    panel.open = !nextHealth;
}

function createLine(value, kind) {
    const line = document.createElement('span');
    line.className = `text-line ${kind}`;
    line.textContent = String(value || '-');
    return line;
}

function createTextMetaGrid(item) {
    const grid = document.createElement('div');
    grid.className = 'text-meta-grid';
    appendMeta(grid, 'First seen', item.firstSeenAt ? formatTime(item.firstSeenAt) : '-');
    appendMeta(grid, 'Seen', item.seenAt ? formatTime(item.seenAt) : '-');
    appendMeta(grid, 'Updated', item.updatedAt ? formatTime(item.updatedAt) : '-');
    appendMeta(grid, 'Screen', item.screenState || (item.onScreen === false ? 'offscreen' : 'visible'));
    if (item.disappearedAt) appendMeta(grid, 'Disappeared', formatTime(item.disappearedAt));
    if (item.deactivatedAt) appendMeta(grid, 'Deactivated', formatTime(item.deactivatedAt));
    appendMeta(grid, 'Lifecycle', item.lifecycleState || item.displayLifecycle || '-');
    appendMeta(grid, 'Priority', Number.isFinite(Number(item.priority)) ? formatNumber(item.priority) : '-');
    const policy = getTextRecordPolicyDiagnostics(item);
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
    const item = document.createElement('div');
    item.className = 'text-meta-item';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    valueEl.textContent = String(value === undefined || value === null || value === '' ? '-' : value);
    item.appendChild(labelEl);
    item.appendChild(valueEl);
    container.appendChild(item);
}

function createHistoryList(item) {
    const wrap = document.createElement('div');
    wrap.className = 'history-list';
    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = 'History';
    wrap.appendChild(title);

    const history = getTextRecordHistory(item);
    if (!history.length) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = 'No history recorded.';
        wrap.appendChild(empty);
        return wrap;
    }

    history.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'history-row';

        const time = document.createElement('span');
        time.className = 'history-time';
        time.textContent = entry.at ? formatTime(entry.at) : '-';
        row.appendChild(time);

        const body = document.createElement('div');
        body.className = 'history-body';
        const label = document.createElement('strong');
        label.textContent = entry.type || 'event';
        body.appendChild(label);
        if (entry.message) {
            const message = document.createElement('span');
            message.textContent = entry.message;
            body.appendChild(message);
        }
        const detailsText = formatDetails(entry.details);
        if (detailsText) {
            const detailsEl = document.createElement('code');
            detailsEl.textContent = detailsText;
            body.appendChild(detailsEl);
        }
        row.appendChild(body);
        wrap.appendChild(row);
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
    const cell = document.createElement('td');
    cell.textContent = String(value);
    return cell;
}

function createStatusCell(value) {
    const cell = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `status ${toneForHookStatus(value)}`;
    pill.textContent = String(value);
    cell.appendChild(pill);
    return cell;
}
