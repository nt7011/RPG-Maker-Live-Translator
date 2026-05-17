// Translator monitor diagnostic jobs helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function formatPriority(job) {
    const priority = Number(job && job.effectivePriority);
    const label = Number.isFinite(priority) ? formatNumber(priority) : '-';
    return job && job.priorityBucket ? `${label} (${job.priorityBucket})` : label;
}

function formatStreamState(job) {
    if (!job || !job.stream) return 'no';
    const parts = ['yes'];
    if (job.deltaCount) parts.push(`${formatNumber(job.deltaCount)} deltas`);
    if (job.lastDeltaAt) parts.push(`${formatElapsedSince(job.lastDeltaAt)} ago`);
    return parts.join(' / ');
}

function getAllDiagnosticJobs() {
    const diagnostics = state.diagnostics;
    const jobs = diagnostics && diagnostics.jobs ? diagnostics.jobs : {};
    return []
        .concat((jobs.running || []).map((job) => Object.assign({}, job, { displayMode: 'running' })))
        .concat((jobs.queued || []).map((job) => Object.assign({}, job, { displayMode: 'queued' })))
        .concat((jobs.past || []).map((job) => Object.assign({}, job, { displayMode: 'past' })));
}

function getMatchedDiagnosticJobs(item) {
    if (!item) return [];
    return getAllDiagnosticJobs()
        .filter((job) => isDiagnosticJobForTextRecord(job, item))
        .sort((a, b) => compareMatchedDiagnosticJobs(a, b, item));
}

function getTextRecordPrimaryDiagnosticJob(item) {
    const jobs = getMatchedDiagnosticJobs(item);
    return jobs.length ? jobs[0] : null;
}

function isDiagnosticJobForTextRecord(job, item) {
    if (!job || !item) return false;
    const recordId = item.id ? String(item.id) : '';
    if (recordId && getDiagnosticJobRecordIds(job).includes(recordId)) return true;
    return doesDiagnosticJobTextMatchRecord(job, item);
}

function getDiagnosticJobRecordIds(job) {
    const ids = new Set();
    (job && Array.isArray(job.subscriberRecords) ? job.subscriberRecords : []).forEach((subscriber) => {
        if (subscriber && subscriber.recordId) ids.add(String(subscriber.recordId));
    });
    (job && Array.isArray(job.history) ? job.history : []).forEach((event) => {
        if (!event) return;
        if (event.recordId) ids.add(String(event.recordId));
        const details = event.details && typeof event.details === 'object' ? event.details : {};
        if (details.recordId) ids.add(String(details.recordId));
    });
    return Array.from(ids);
}

function doesDiagnosticJobTextMatchRecord(job, item) {
    const preview = normalizeComparableText(job && job.textPreview);
    if (!preview || preview.length < 8) return false;
    const jobHook = normalizeHookClass(job && job.hook);
    const itemHook = normalizeHookClass(item.hookKey || item.hook || item.methodName || item.surfaceType);
    if (jobHook !== 'unknown' && itemHook !== 'unknown' && jobHook !== itemHook) return false;

    return getTextRecordComparableTexts(item).some((candidate) => {
        if (!candidate) return false;
        if (candidate === preview) return true;
        if (preview.endsWith('...')) {
            const prefix = preview.slice(0, -3);
            return prefix.length >= 8 && candidate.startsWith(prefix);
        }
        return false;
    });
}

function getTextRecordComparableTexts(item) {
    return [
        item && item.normalizedSource,
        item && item.translationSource,
        item && item.original,
        item && item.visibleText,
        item && item.convertedText,
        item && item.rawText,
    ].map(normalizeComparableText).filter(Boolean);
}

function normalizeComparableText(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim();
}

function compareMatchedDiagnosticJobs(a, b, item) {
    const rankDiff = getDiagnosticJobDisplayRank(a, item) - getDiagnosticJobDisplayRank(b, item);
    if (rankDiff) return rankDiff;
    return getDiagnosticJobActivityAt(b) - getDiagnosticJobActivityAt(a);
}

function getDiagnosticJobDisplayRank(job, item) {
    const status = normalizeDiagnosticStatusClass(job && (job.status || job.displayMode));
    const itemStatus = normalizeStatusClass(item && item.status);
    if (status === 'running') return 0;
    if (status === 'queued') return 1;
    if (itemStatus === 'failed' && status === 'failed') return 2;
    if (itemStatus === 'completed' && status === 'completed') return 2;
    if (status === 'failed') return 3;
    if (status === 'completed') return 4;
    return 5;
}

function getDiagnosticJobActivityAt(job) {
    return Number(job && (job.terminalAt || job.lastDeltaAt || job.startedAt || job.queuedAt || job.createdAt || 0)) || 0;
}

function getTextRecordTranslationRailInfo(item) {
    const job = getTextRecordPrimaryDiagnosticJob(item);
    const fallback = getTextRecordRequestDetails(item);
    const priority = job
        ? normalizeOptionalPriority(job.effectivePriority)
        : fallback.priority;
    const stream = job ? job.stream === true : fallback.stream === true;
    const railState = getTextRecordTranslationRailState(item, job);
    const policy = getTextRecordPolicyDiagnostics(item);
    return {
        state: railState,
        label: getTranslationRailLabel(railState, priority, stream),
        title: getTranslationRailTitle(railState, priority, stream, job, policy),
        priority,
        stream,
        policy,
        job,
    };
}

function getTextRecordTranslationRailState(item, job) {
    const jobRailState = getTranslationRailState(job && (job.status || job.displayMode));
    if (jobRailState === 'translating' || jobRailState === 'queued') return jobRailState;

    const recordOutcome = getTextRecordTranslationOutcome(item);
    if (recordOutcome !== 'neutral') return recordOutcome;
    if (jobRailState === 'completed' || jobRailState === 'failed' || jobRailState === 'skipped') return jobRailState;
    if (isTerminalTextLifecycleStatus(item && item.status)) return 'skipped';
    return getTranslationRailState(item && item.status);
}

function getTextRecordTranslationOutcome(item) {
    const status = normalizeStatusClass(item && item.status);
    if (status === 'failed') return 'failed';
    if (status === 'completed') return 'completed';
    if (hasTextRecordTranslation(item)) return 'completed';

    const historyOutcome = getTextRecordHistoryOutcome(item);
    if (historyOutcome !== 'neutral') return historyOutcome;
    if (status === 'skipped') return 'skipped';
    return 'neutral';
}

function isTerminalTextLifecycleStatus(status) {
    const value = normalizeStatusClass(status);
    return value === 'disappeared' || value === 'removed' || value === 'stale';
}

function hasTextRecordTranslation(item) {
    return Boolean(item && [
        item.translation,
        item.translationDrawn,
        item.translationReceived,
    ].some((value) => typeof value === 'string' && value.trim()));
}

function getTextRecordHistoryOutcome(item) {
    const history = getTextRecordHistory(item);
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const event = history[index] || {};
        const type = String(event.type || '').toLowerCase();
        const status = normalizeStatusClass(event.status);
        if (isCompletedTextEvent(type) || status === 'completed') return 'completed';
        if (isFailedTextEvent(type) || status === 'failed') return 'failed';
        if (isSkippedTextEvent(type) || status === 'skipped') return 'skipped';
    }
    return 'neutral';
}

function isCompletedTextEvent(type) {
    // item.render_queued is intentionally not a completed outcome: it only
    // means the orchestrator emitted a command. The adapter may still
    // reject, defer, or later apply that command.
    return type === 'translation.completed'
        || type === 'item.translated'
        || type === 'item.cache_hit'
        || type === 'item.translation_reused'
        || type === 'item.rendered';
}

function isFailedTextEvent(type) {
    return type === 'translation.failed'
        || type === 'translation.error'
        || type === 'item.failed'
        || type === 'item.render_failed';
}

function isSkippedTextEvent(type) {
    return type === 'translation.skipped'
        || type === 'translation.skip'
        || type === 'item.skipped'
        || type === 'item.canceled'
        || type === 'item.render_skipped';
}

function getTextRecordRequestDetails(item) {
    const result = {
        priority: null,
        stream: false,
    };
    const history = getTextRecordHistory(item).slice().reverse();
    for (const event of history) {
        const details = event && event.details && typeof event.details === 'object' ? event.details : {};
        const priority = normalizeOptionalPriority(details.effectivePriority !== undefined ? details.effectivePriority : details.priority);
        if (priority !== null && result.priority === null) result.priority = priority;
        if (details.stream === true || details.mode === 'stream') result.stream = true;
        if (result.priority !== null && result.stream) break;
    }
    const metadata = item && item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    if (result.priority === null && item) {
        result.priority = normalizeOptionalPriority(item.priority);
    }
    if (result.priority === null) {
        result.priority = normalizeOptionalPriority(metadata.effectivePriority !== undefined ? metadata.effectivePriority : metadata.priority);
    }
    if (!result.stream && (metadata.stream === true || metadata.mode === 'stream')) result.stream = true;
    return result;
}

function normalizeOptionalPriority(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null;
}

function getTranslationRailState(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'running' || value === 'translating') return 'translating';
    if (value === 'queued' || value === 'pending') return 'queued';
    if (value === 'completed') return 'completed';
    if (value === 'failed' || value === 'error') return 'failed';
    if (value === 'skip' || value === 'skipped' || value === 'canceled') return 'skipped';
    return 'neutral';
}

function getTranslationRailLabel(railState, priority, stream) {
    if (Number.isFinite(priority)) return `${priority}${stream ? 'S' : ''}`;
    if (railState === 'completed') return 'OK';
    if (railState === 'failed') return 'FAIL';
    if (railState === 'queued') return 'QUEUE';
    if (railState === 'translating') return 'RUN';
    if (railState === 'skipped') return 'SKIP';
    return 'WAIT';
}

function getTranslationRailTitle(railState, priority, stream, job, policy = null) {
    const parts = [formatTranslationRailState(railState)];
    if (Number.isFinite(priority)) {
        parts.push(`${stream ? 'streaming request' : 'request'} priority ${priority}`);
    } else if (stream) {
        parts.push('streaming request');
    }
    const policyTitle = formatPolicyRailTitle(policy);
    if (policyTitle) parts.push(policyTitle);
    if (job && job.id) parts.push(job.id);
    return parts.join(' - ');
}

function formatPolicyRailTitle(policy) {
    const source = getTextRecordPolicyDiagnostics({ policy });
    const priority = source.priority || {};
    const lifecycle = source.lifecycle || {};
    const parts = [];
    if (priority.action || priority.reason) {
        parts.push(`priority policy ${[priority.action, priority.reason].filter(Boolean).join(': ')}`);
    }
    if (lifecycle.intent || lifecycle.priorityAction) {
        parts.push(`lifecycle policy ${[lifecycle.intent, lifecycle.priorityAction].filter(Boolean).join(': ')}`);
    }
    return parts.join(' / ');
}

function formatTranslationRailState(railState) {
    if (railState === 'translating') return 'translating';
    if (railState === 'queued') return 'queued';
    if (railState === 'completed') return 'translated';
    if (railState === 'failed') return 'failed';
    if (railState === 'skipped') return 'skipped';
    return 'not requested';
}

function createDiagnosticJobPill(job, mode, detailKey) {
    const button = document.createElement('button');
    const detailEnabled = isDiagnosticsDetailViewEnabled();
    button.type = 'button';
    button.className = `diagnostic-job-pill diagnostic-job-${normalizeDiagnosticStatusClass(job.status || mode)}`;
    if (detailEnabled && state.diagnosticDetailKey === detailKey) button.className += ' diagnostic-job-active';
    button.setAttribute('aria-expanded', detailEnabled && state.diagnosticDetailKey === detailKey ? 'true' : 'false');
    if (detailEnabled) {
        button.addEventListener('click', () => toggleDiagnosticJobDetail(detailKey));
    } else {
        button.setAttribute('aria-disabled', 'true');
        button.title = 'Detail view disabled in settings.json';
    }

    const text = document.createElement('span');
    text.className = 'diagnostic-job-text';
    text.textContent = job.textPreview || '-';
    button.appendChild(text);

    button.appendChild(createDiagnosticPillMeta(`P${formatNumber(job.effectivePriority || 0)}`));
    button.appendChild(createDiagnosticPillMeta(job.status || mode));
    if (job.queuePosition) button.appendChild(createDiagnosticPillMeta(`#${job.queuePosition}`));
    if (job.stream) button.appendChild(createDiagnosticPillMeta('stream'));
    return button;
}

function createDiagnosticPillMeta(value) {
    const meta = document.createElement('span');
    meta.className = 'diagnostic-job-meta';
    meta.textContent = String(value || '-');
    return meta;
}

function createDiagnosticJobExpanded(job, mode, detailKey) {
    const expanded = document.createElement('div');
    expanded.className = `diagnostic-job-expanded diagnostic-job-${normalizeDiagnosticStatusClass(job.status || mode)}`;
    expanded.dataset.detailKey = detailKey;

    const header = document.createElement('div');
    header.className = 'diagnostic-job-expanded-header';
    const title = document.createElement('span');
    title.className = 'diagnostic-job-expanded-title';
    title.textContent = `${job.id || '-'} | ${job.hook || '-'} | ${job.status || mode}`;
    header.appendChild(title);
    expanded.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'text-meta-grid';
    appendMeta(grid, 'Priority', formatPriority(job));
    appendMeta(grid, 'Status', job.status || mode);
    appendMeta(grid, 'Hook', job.hook || '-');
    appendMeta(grid, 'Subscribers', `${formatNumber(job.subscribers || 0)}/${formatNumber(job.totalSubscribers || 0)}`);
    appendMeta(grid, 'Queued', job.queuedAt ? `${formatTime(job.queuedAt)} (${formatElapsedSince(job.queuedAt)} ago)` : '-');
    appendMeta(grid, 'Started', job.startedAt ? `${formatTime(job.startedAt)} (${formatElapsedSince(job.startedAt)} ago)` : '-');
    if (job.terminalAt) appendMeta(grid, 'Finished', `${formatTime(job.terminalAt)} (${formatElapsedSince(job.terminalAt)} ago)`);
    appendMeta(grid, 'Stream', formatStreamState(job));
    appendMeta(grid, 'Retries', formatNumber(job.retryCount || 0));
    appendMeta(grid, 'Attempt', formatNumber(job.attempt || 0));
    appendMeta(grid, 'Text', job.textPreview || '-');
    if (job.lastError) appendMeta(grid, 'Last Error', job.lastError);
    if (job.terminalReason) appendMeta(grid, 'Reason', job.terminalReason);
    expanded.appendChild(grid);
    expanded.appendChild(createDiagnosticHistory(job.history || []));
    return expanded;
}

function createDiagnosticHistory(history) {
    const wrap = document.createElement('div');
    wrap.className = 'history-list';
    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = 'History';
    wrap.appendChild(title);

    const list = Array.isArray(history) ? history : [];
    if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = 'No scheduler history recorded.';
        wrap.appendChild(empty);
        return wrap;
    }

    list.forEach((event) => {
        const row = document.createElement('div');
        row.className = 'history-row';

        const time = document.createElement('span');
        time.className = 'history-time';
        time.textContent = event.at ? formatTime(event.at) : '-';
        row.appendChild(time);

        const body = document.createElement('div');
        body.className = 'history-body';
        const label = document.createElement('strong');
        label.textContent = event.type || 'event';
        body.appendChild(label);
        const detailsText = formatDiagnosticEventDetails(event);
        if (detailsText && detailsText !== '-') {
            const details = document.createElement('code');
            details.textContent = detailsText;
            body.appendChild(details);
        }
        row.appendChild(body);
        wrap.appendChild(row);
    });
    return wrap;
}

function toggleDiagnosticJobDetail(detailKey) {
    if (!detailKey || !isDiagnosticsDetailViewEnabled()) return;
    state.diagnosticDetailKey = state.diagnosticDetailKey === detailKey ? '' : detailKey;
    renderDiagnosticsPanel();
}

function getDiagnosticJobDetailKey(mode, job) {
    return ['diagnostic', 'job', job && job.id ? job.id : (mode || 'job')].join('|');
}

function formatDiagnosticEventDetails(event) {
    const details = event && event.details && typeof event.details === 'object' ? event.details : {};
    const keys = [
        'jobId',
        'subscriberId',
        'recordId',
        'priority',
        'effectivePriority',
        'previousPriority',
        'capacity',
        'running',
        'subscribers',
        'attempt',
        'retryInMs',
        'deltaCount',
        'partialLength',
        'reason',
        'error',
        'textPreview',
    ];
    return keys
        .filter((key) => details[key] !== undefined && details[key] !== null && details[key] !== '')
        .map((key) => `${key}=${formatDetailValue(details[key])}`)
        .join(', ') || '-';
}

function formatElapsedSince(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return '-';
    return formatDuration(Date.now() - numeric);
}
