// Translator monitor text record details helpers.
// These functions share state from gui/app/state.js and are loaded before app/index.js boots.
'use strict';

function createTextRecordItem(item, options = {}, renderContext = createTextRecordRenderContext()) {
    const recordKey = options.recordKey || getTextRecordKey(item);
    const detailKey = options.detailKey || recordKey;
    const railInfo = getTextRecordTranslationRailInfo(item);
    const censored = isTextRecordSpoilerCensoredForContext(item, renderContext);
    const detailEnabled = isGuiTextRecordDetailAllowed(item, renderContext);
    const record = document.createElement('article');
    record.className = `text-record text-status-${normalizeStatusClass(item.status)} text-hook-${normalizeHookClass(item.hookKey || item.hook)} text-translation-${railInfo.state}`;
    if (options.inactive) record.className += ' text-record-inactive';
    if (options.active) record.className += ' text-record-active';
    if (censored) record.className += ' text-record-spoiler-censored';
    if (recordKey) record.dataset.recordKey = recordKey;
    if (detailKey) record.dataset.detailKey = detailKey;
    if (detailEnabled) {
        record.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            copyTextRecord(item, record);
        });
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-bubble';
    button.setAttribute('aria-expanded', detailEnabled && options.active ? 'true' : 'false');
    button.title = censored
        ? 'Foresight spoiler hidden'
        : (detailEnabled
            ? (options.active ? 'Hide text record details' : 'Show text record details')
            : 'Detail view disabled in settings.json');
    if (censored) {
        button.disabled = true;
        button.setAttribute('aria-label', 'Foresight spoiler hidden');
    } else if (!detailEnabled) {
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('aria-label', 'Detail view disabled');
    } else {
        button.addEventListener('click', () => toggleTextRecordDetail(detailKey));
    }

    const content = document.createElement('span');
    content.className = 'text-bubble-content';
    if (censored) content.setAttribute('aria-hidden', 'true');
    content.appendChild(createLine(item.rawText || item.original || item.visibleText || '', 'source'));
    content.appendChild(createLine(item.translation || '', 'translation'));
    button.appendChild(content);
    button.appendChild(createTextTranslationRail(railInfo));
    record.appendChild(button);
    return record;
}

function createTextTranslationRail(info) {
    const railInfo = info || {};
    const rail = document.createElement('span');
    rail.className = `text-translation-rail text-translation-rail-${railInfo.state || 'neutral'}`;
    rail.title = railInfo.title || '';
    rail.appendChild(createTextElement('span', 'text-translation-rail-label', railInfo.label || 'WAIT'));
    return rail;
}

function createTextRecordDetail(item, options = {}, renderContext = createTextRecordRenderContext()) {
    const recordKey = getTextRecordKey(item);
    const expanded = document.createElement('div');
    expanded.className = `text-expanded text-detail-row text-status-${normalizeStatusClass(item.status)} text-hook-${normalizeHookClass(item.hookKey || item.hook)}`;
    if (options.inactive) expanded.className += ' text-record-inactive';
    if (recordKey) expanded.dataset.recordKey = recordKey;
    expanded.appendChild(createExpandedRecordHeader(item, options));
    expanded.appendChild(createTextMetaGrid(item));
    const translationDetail = createTranslationDiagnosticDetail(item);
    if (translationDetail) expanded.appendChild(translationDetail);
    const policyDetail = createPolicyDiagnosticDetail(item);
    if (policyDetail) expanded.appendChild(policyDetail);
    expanded.appendChild(createHistoryList(item));
    return expanded;
}

function createPolicyDiagnosticDetail(item) {
    const policy = getTextRecordRuntimePolicyDiagnostics(item);
    if (!policy || !Object.keys(policy).length) return null;
    const panel = createExpandedRelatedPanel('Text Policy', formatPolicyHeadline(policy));
    const rows = [];
    if (policy.lifecycle) rows.push(`Last lifecycle | ${formatPolicySection(policy.lifecycle)}`);
    if (policy.priority) rows.push(`Last priority | ${formatPolicySection(policy.priority)}`);
    if (policy.request) rows.push(`Last request | ${formatPolicySection(policy.request)}`);
    if (policy.last) rows.push(`Last | ${formatPolicySection(policy.last)}`);
    panel.appendChild(createRelatedRowList('Policy State', rows));
    if (Array.isArray(policy.events) && policy.events.length) {
        panel.appendChild(createRelatedRowList(
            'Policy Events',
            policy.events.slice(-6).map((event) => [
                event.type || 'event',
                event.message || '',
                formatPolicySection(event.policy || {}),
            ].filter(Boolean).join(' | '))
        ));
    }
    return panel;
}

function formatPolicyHeadline(policy) {
    const priority = policy && policy.priority ? policy.priority : {};
    const lifecycle = policy && policy.lifecycle ? policy.lifecycle : {};
    return firstNonEmptyString(
        [priority.action, priority.priority].filter((value) => value !== undefined && value !== null && value !== '').join(' '),
        [lifecycle.intent, lifecycle.priorityAction].filter(Boolean).join(' '),
        'policy'
    );
}

function createTranslationDiagnosticDetail(item) {
    const jobs = getMatchedDiagnosticJobs(item);
    if (!jobs.length) return null;

    const primary = jobs[0];
    const panel = createExpandedRelatedPanel('Translation Job', primary.id || '-');
    panel.className += ` diagnostic-job-${normalizeDiagnosticStatusClass(primary.status || primary.displayMode)}`;

    const grid = createMetadataGrid();
    appendMeta(grid, 'Job', primary.id || '-');
    appendMeta(grid, 'Status', primary.status || primary.displayMode || '-');
    appendMeta(grid, 'Hook', primary.hook || '-');
    appendMeta(grid, 'Priority', formatPriority(primary));
    appendMeta(grid, 'Stream', formatStreamState(primary));
    appendMeta(grid, 'Subscribers', `${formatNumber(primary.subscribers || 0)}/${formatNumber(primary.totalSubscribers || 0)}`);
    appendMeta(grid, 'Queued', primary.queuedAt ? `${formatTime(primary.queuedAt)} (${formatElapsedSince(primary.queuedAt)} ago)` : '-');
    appendMeta(grid, 'Started', primary.startedAt ? `${formatTime(primary.startedAt)} (${formatElapsedSince(primary.startedAt)} ago)` : '-');
    if (primary.terminalAt) appendMeta(grid, 'Finished', `${formatTime(primary.terminalAt)} (${formatElapsedSince(primary.terminalAt)} ago)`);
    if (primary.queuePosition) appendMeta(grid, 'Queue Position', `#${formatNumber(primary.queuePosition)}`);
    if (primary.lastError) appendMeta(grid, 'Last Error', primary.lastError);
    if (primary.terminalReason) appendMeta(grid, 'Reason', primary.terminalReason);
    panel.appendChild(grid);

    const subscribers = getMatchedSubscriberRecords(primary, item);
    if (subscribers.length) {
        panel.appendChild(createRelatedRowList(
            'Subscribers',
            subscribers.map((subscriber) => formatSubscriberRecord(subscriber))
        ));
    }
    if (jobs.length > 1) {
        panel.appendChild(createRelatedRowList(
            'Related Jobs',
            jobs.slice(1, 4).map((job) => `${job.id || '-'} | ${job.status || job.displayMode || '-'} | ${formatPriority(job)} | ${job.textPreview || '-'}`)
        ));
    }
    panel.appendChild(createDiagnosticHistory(primary.history || []));
    return panel;
}

function createExpandedRelatedPanel(titleText, metaText) {
    const panel = document.createElement('section');
    panel.className = 'expanded-related-panel';
    panel.appendChild(createTitledMetaHeader({
        className: 'expanded-related-header',
        titleTag: 'h3',
        titleText: titleText || 'Details',
        metaClassName: 'expanded-related-meta',
        metaText: metaText || '-',
    }));
    return panel;
}

function createRelatedRowList(titleText, rows) {
    const wrap = createTitledContainer('related-row-list', titleText || 'Details');

    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (!list.length) {
        wrap.appendChild(createHistoryEmpty('No related records.'));
        return wrap;
    }

    list.forEach((rowText) => {
        wrap.appendChild(createTextElement('div', 'related-row', rowText));
    });
    return wrap;
}

function getMatchedSubscriberRecords(job, item) {
    if (!job || !item || !item.id) return [];
    const recordId = String(item.id);
    return (Array.isArray(job.subscriberRecords) ? job.subscriberRecords : [])
        .filter((subscriber) => subscriber && subscriber.recordId === recordId);
}

function formatSubscriberRecord(subscriber) {
    const priority = normalizeOptionalPriority(subscriber && subscriber.priority);
    const parts = [
        subscriber && subscriber.id ? subscriber.id : '-',
        subscriber && subscriber.status ? subscriber.status : '-',
    ];
    if (Number.isFinite(priority)) parts.push(`${priority}${subscriber.stream ? 'S' : ''}`);
    if (subscriber && subscriber.hook) parts.push(subscriber.hook);
    if (subscriber && subscriber.lastPriorityReason) parts.push(subscriber.lastPriorityReason);
    return parts.join(' | ');
}

function toggleTextRecordDetail(recordKey) {
    const policySnapshot = refreshGuiPolicySnapshot();
    if (!recordKey || !getGuiTextRecordPolicy(policySnapshot).detailsEnabled) return;
    state.activeTextRecordDetailKey = state.activeTextRecordDetailKey === recordKey
        ? ''
        : recordKey;
    renderTextRecordSections(refreshGuiPolicySnapshot());
}

function shouldRenderActiveTextRecordDetail(recordKey, renderContext = createTextRecordRenderContext()) {
    const textRecordPolicy = renderContext.policy;
    return Boolean(recordKey
        && textRecordPolicy.selectedDetailKey === recordKey
        && textRecordPolicy.renderedDetailKey !== recordKey);
}

function isGuiTextRecordDetailAllowed(item, renderContext = createTextRecordRenderContext()) {
    return renderContext.policy.detailsEnabled
        && !isTextRecordSpoilerCensoredForContext(item, renderContext);
}

function createExpandedRecordHeader(item, options = {}) {
    const header = document.createElement('div');
    header.className = 'text-expanded-header';
    const labels = [];
    const lifecycleLabel = String(options.lifecycleLabel || item.displayLifecycle || item.lifecycleState || '').trim();
    if (lifecycleLabel && lifecycleLabel !== 'active' && !labels.includes(lifecycleLabel)) labels.push(lifecycleLabel);
    header.appendChild(createTextElement(
        'span',
        'text-expanded-meta',
        `${item.hook || '-'} | ${item.status || 'detected'}${labels.length ? ` | ${labels.join(' | ')}` : ''}`
    ));
    header.appendChild(createTextRecordCopyButton(item));
    return header;
}

function pruneActiveTextRecordDetail(renderContext = createTextRecordRenderContext()) {
    if (!state.activeTextRecordDetailKey) return;
    const activeKeys = getVisibleTextRecordDetailKeys(renderContext);
    if (!activeKeys.includes(state.activeTextRecordDetailKey)) state.activeTextRecordDetailKey = '';
}

function getVisibleTextRecordDetailKeys(renderContext = createTextRecordRenderContext()) {
    const textRecordPolicy = renderContext.policy;
    return []
        .concat(createTextRecordRows(getPrioritizedTextRecords(state.activeTexts || []), { bodyId: 'active-texts' }))
        .concat(createTextRecordRows(getPrioritizedTextRecords(state.detachedTexts || [], textRecordPolicy.inactiveDisplayLimit), {
            bodyId: 'detached-texts',
        }))
        .concat(createTextRecordRows(getPrioritizedTextRecords(state.archivedTexts || [], textRecordPolicy.inactiveDisplayLimit), {
            bodyId: 'archived-texts',
        }))
        .filter((row) => isGuiTextRecordDetailAllowed(row.item, renderContext))
        .map((row) => row.detailKey)
        .filter(Boolean);
}

function getTextRecordKey(item) {
    if (!item) return '';
    if (item.id) return item.id;
    return [item.hookKey || item.hook || '', item.original || '', item.translationSource || item.normalizedSource || ''].join('|');
}

function getTextRecordDetailKey(sectionId, recordKey, duplicateIndex) {
    return [sectionId || 'text-records', recordKey || '', String(duplicateIndex || 0)].join('|');
}

function createTextRecordCopyButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-record-button';
    button.textContent = 'Copy';
    button.title = 'Copy full text record';
    button.setAttribute('aria-label', 'Copy full text record');
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        copyTextRecord(item, button);
    });
    return button;
}
