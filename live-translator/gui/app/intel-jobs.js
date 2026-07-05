// Translator monitor intel jobs helpers.
// These functions share state from gui/app/state.js and are loaded before app/index.js boots.
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

function getAllIntelJobs() {
    const intel = state.intel;
    const jobs = intel && intel.jobs ? intel.jobs : {};
    return []
        .concat((jobs.running || []).map((job) => Object.assign({}, job, { displayMode: 'running' })))
        .concat((jobs.queued || []).map((job) => Object.assign({}, job, { displayMode: 'queued' })))
        .concat((jobs.past || []).map((job) => Object.assign({}, job, { displayMode: 'past' })));
}

function getMatchedIntelJobs(item) {
    if (!item) return [];
    return getAllIntelJobs()
        .filter((job) => isIntelJobForTextRecord(job, item))
        .sort((a, b) => compareMatchedIntelJobs(a, b, item));
}

function getTextRecordPrimaryIntelJob(item) {
    const jobs = getMatchedIntelJobs(item);
    return jobs.length ? jobs[0] : null;
}

function isIntelJobForTextRecord(job, item) {
    if (!job || !item) return false;
    const recordId = item.id ? String(item.id) : '';
    if (recordId && getIntelJobRecordIds(job).includes(recordId)) return true;
    return doesIntelJobTextMatchRecord(job, item);
}

function getIntelJobRecordIds(job) {
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

function doesIntelJobTextMatchRecord(job, item) {
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

function compareMatchedIntelJobs(a, b, item) {
    const rankDiff = getIntelJobDisplayRank(a, item) - getIntelJobDisplayRank(b, item);
    if (rankDiff) return rankDiff;
    return getIntelJobActivityAt(b) - getIntelJobActivityAt(a);
}

function getIntelJobDisplayRank(job, item) {
    const status = normalizeIntelStatusClass(job && (job.status || job.displayMode));
    const itemStatus = normalizeStatusClass(item && item.status);
    if (status === 'running') return 0;
    if (status === 'queued') return 1;
    if (itemStatus === 'failed' && status === 'failed') return 2;
    if (itemStatus === 'completed' && status === 'completed') return 2;
    if (status === 'failed') return 3;
    if (status === 'completed') return 4;
    return 5;
}

function getIntelJobActivityAt(job) {
    return Number(job && (job.terminalAt || job.lastDeltaAt || job.startedAt || job.queuedAt || job.createdAt || 0)) || 0;
}

function getTextRecordTranslationRailInfo(item) {
    const job = getTextRecordPrimaryIntelJob(item);
    const fallback = getTextRecordRequestDetails(item);
    const priority = job
        ? normalizeOptionalPriority(job.effectivePriority)
        : fallback.priority;
    const stream = job ? job.stream === true : fallback.stream === true;
    const railState = getTextRecordTranslationRailState(item, job);
    const policy = getTextRecordRuntimePolicyIntel(item);
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
    // item.render_command_ready is intentionally not a completed outcome: it only
    // means the orchestrator emitted a command. The adapter may still
    // reject, defer, or later apply that command.
    return type === 'translation.completed'
        || type === 'item.translated'
        || type === 'item.cache_hit'
        || type === 'item.translation_reused'
        || type === 'item.render_committed'
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
    const source = getTextRecordRuntimePolicyIntel({ policy });
    const priority = source.priority || {};
    const lifecycle = source.lifecycle || {};
    const parts = [];
    if (priority.action || priority.reason) {
        parts.push(`priority policy ${[priority.action, priority.reason].filter(Boolean).join(': ')}`);
    }
    if (lifecycle.kind || lifecycle.priorityAction) {
        parts.push(`lifecycle policy ${[lifecycle.kind, lifecycle.priorityAction].filter(Boolean).join(': ')}`);
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

function createIntelJobPill(job, mode, detailKey, policySnapshot = refreshGuiPolicySnapshot()) {
    const button = document.createElement('button');
    const jobPolicy = getGuiIntelJobPolicy(policySnapshot);
    const detailEnabled = jobPolicy.detailsEnabled;
    button.type = 'button';
    button.className = `intel-job-pill intel-job-${normalizeIntelStatusClass(job.status || mode)}`;
    if (detailEnabled && jobPolicy.selectedDetailKey === detailKey) button.className += ' intel-job-active';
    button.setAttribute('aria-expanded', detailEnabled && jobPolicy.selectedDetailKey === detailKey ? 'true' : 'false');
    if (detailEnabled) {
        button.addEventListener('click', () => toggleIntelJobDetail(detailKey));
    } else {
        button.setAttribute('aria-disabled', 'true');
        button.title = 'Detail view disabled in settings.json';
    }

    button.appendChild(createTextElement('span', 'intel-job-text', job.textPreview || '-'));

    button.appendChild(createIntelPillMeta(`P${formatNumber(job.effectivePriority || 0)}`));
    button.appendChild(createIntelPillMeta(job.status || mode));
    if (job.queuePosition) button.appendChild(createIntelPillMeta(`#${job.queuePosition}`));
    if (job.stream) button.appendChild(createIntelPillMeta('stream'));
    return button;
}

function createIntelPillMeta(value) {
    return createTextElement('span', 'intel-job-meta', String(value || '-'));
}

function createIntelJobExpanded(job, mode, detailKey) {
    const expanded = document.createElement('div');
    expanded.className = `intel-job-expanded intel-job-${normalizeIntelStatusClass(job.status || mode)}`;
    expanded.dataset.detailKey = detailKey;

    const header = document.createElement('div');
    header.className = 'intel-job-expanded-header';
    header.appendChild(createTextElement(
        'span',
        'intel-job-expanded-title',
        `${job.id || '-'} | ${job.hook || '-'} | ${job.status || mode}`
    ));
    expanded.appendChild(header);

    const grid = createMetadataGrid();
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
    expanded.appendChild(createIntelHistory(job.history || []));
    return expanded;
}

function createIntelHistory(history) {
    const wrap = createHistoryContainer('History');

    const list = Array.isArray(history) ? history : [];
    if (!list.length) {
        wrap.appendChild(createHistoryEmpty('No scheduler history recorded.'));
        return wrap;
    }

    list.forEach((event) => {
        const detailsText = formatIntelEventDetails(event);
        wrap.appendChild(createHistoryRow({
            timeText: event.at ? formatTime(event.at) : '-',
            labelText: event.type || 'event',
            detailsText: detailsText && detailsText !== '-' ? detailsText : '',
        }));
    });
    return wrap;
}

function toggleIntelJobDetail(detailKey) {
    const policySnapshot = refreshGuiPolicySnapshot();
    if (!detailKey || !getGuiIntelJobPolicy(policySnapshot).detailsEnabled) return;
    state.intelDetailKey = state.intelDetailKey === detailKey ? '' : detailKey;
    renderIntelPanel(refreshGuiPolicySnapshot());
}

function getIntelJobDetailKey(mode, job) {
    return ['intel', 'job', job && job.id ? job.id : (mode || 'job')].join('|');
}

function formatIntelEventDetails(event) {
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
