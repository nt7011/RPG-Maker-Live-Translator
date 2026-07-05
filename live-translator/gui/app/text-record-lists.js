// Translator monitor text record lists helpers.
// These functions share state from gui/app/state.js and are loaded before app/index.js boots.
'use strict';

function toneForHookStatus(status) {
    if (status === 'installed') return 'ok';
    if (status === 'skipped') return 'warn';
    if (status === 'failed') return 'bad';
    return 'neutral';
}

function renderHookResults(policySnapshot = getGuiPolicySnapshot()) {
    const body = refs['hook-results'];
    if (!body) return;

    const visibleHookResults = getVisibleHookResults(policySnapshot);
    const summary = summarizeHookResults(visibleHookResults);
    const tone = summary.failed > 0 ? 'bad' : (summary.skipped > 0 ? 'warn' : 'ok');
    setSummaryStatus(
        'hook-summary',
        summary.total > 0 ? tone : 'neutral',
        summary.total > 0
            ? `${formatNumber(summary.installed)} installed, ${formatNumber(summary.skipped)} skipped, ${formatNumber(summary.failed)} failed`
            : '0 hooks'
    );
    renderIntelSummary();

    if (!visibleHookResults.length) {
        body.innerHTML = '<tr><td colspan="3" class="empty">No hook installation records.</td></tr>';
        return;
    }

    body.innerHTML = '';
    for (const item of visibleHookResults) {
        const row = document.createElement('tr');
        row.appendChild(createCell(item.displayName || item.name || '-'));
        row.appendChild(createStatusCell(item.status || '-'));
        row.appendChild(createCell(item.reason || '-'));
        body.appendChild(row);
    }
}

function renderTextRecordSections(policySnapshot = refreshGuiPolicySnapshot()) {
    const renderContext = createTextRecordRenderContext(policySnapshot);
    renderContext.reusableDetailNodes = collectTextRecordDetailNodesByRecordKey();
    pruneActiveTextRecordDetail(renderContext);
    renderActiveTexts(renderContext);
    renderDetachedTexts(renderContext);
    renderArchivedTexts(renderContext);
    cleanupTextRecordDetailRows(renderContext);
    syncTextRecordVolatileDom(renderContext);
}

function renderActiveTexts(renderContext = createTextRecordRenderContext()) {
    renderTextRecordList({
        panelId: 'active-text-panel',
        bodyId: 'active-texts',
        summaryId: 'active-text-summary',
        records: state.activeTexts,
        emptyText: 'No active text records.',
        hideWhenEmpty: true,
    }, renderContext);
}

function renderDetachedTexts(renderContext = createTextRecordRenderContext()) {
    const textRecordPolicy = renderContext.policy;
    const records = Array.isArray(state.detachedTexts) ? state.detachedTexts : [];
    renderTextRecordList({
        panelId: 'detached-text-panel',
        bodyId: 'detached-texts',
        summaryId: 'detached-text-summary',
        records,
        emptyText: 'No detached text records.',
        hideWhenEmpty: true,
        limit: textRecordPolicy.inactiveDisplayLimit,
        itemOptions: { inactive: true, lifecycleLabel: 'detached' },
    }, renderContext);
}

function renderArchivedTexts(renderContext = createTextRecordRenderContext()) {
    const textRecordPolicy = renderContext.policy;
    renderTextRecordList({
        panelId: 'archived-text-panel',
        bodyId: 'archived-texts',
        summaryId: 'archived-text-summary',
        records: state.archivedTexts,
        emptyText: 'No archived text records.',
        hideWhenEmpty: true,
        limit: textRecordPolicy.inactiveDisplayLimit,
        itemOptions: { inactive: true, lifecycleLabel: 'archived' },
    }, renderContext);
}

function renderTextRecordList(options, renderContext = createTextRecordRenderContext()) {
    const body = refs[options.bodyId];
    if (!body) return;

    const records = Array.isArray(options.records) ? options.records : [];
    setSummaryStatus(options.summaryId, 'neutral', `${formatNumber(records.length)} entries`);
    syncTextRecordListBodyVisibility(options, records.length > 0);

    if (!records.length) {
        body.innerHTML = '';
        if (!options.hideWhenEmpty) appendEmptyState(body, options.emptyText || 'No text records.');
        return;
    }

    const rows = createTextRecordRows(getPrioritizedTextRecords(records, options.limit), options);
    const activeIndex = findActiveTextRecordIndex(rows, renderContext);
    const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;
    const detailInsertIndex = activeIndex >= 0
        ? getTextRecordDetailInsertIndex(body, activeIndex, rows.length)
        : -1;
    const desired = [];
    rows.forEach((row, index) => {
        const active = index === activeIndex;
        const itemOptions = Object.assign({
            active,
            detailKey: row.detailKey,
            recordKey: row.recordKey,
            domKey: row.domKey,
        }, row.itemOptions);
        desired.push({
            kind: 'row',
            domKey: row.domKey,
            recordKey: row.recordKey,
            renderKey: createTextRecordRowRenderKey(row.item, itemOptions, renderContext),
            item: row.item,
            itemOptions,
        });
        if (index === detailInsertIndex) {
            const detailOptions = Object.assign({
                detailKey: activeRow.detailKey,
                recordKey: activeRow.recordKey,
                domKey: getTextRecordDetailDomKey(activeRow.recordKey),
            }, activeRow.itemOptions);
            desired.push({
                kind: 'detail',
                domKey: detailOptions.domKey,
                recordKey: activeRow.recordKey,
                renderKey: createTextRecordDetailRenderKey(activeRow.item, detailOptions, renderContext),
                item: activeRow.item,
                itemOptions: detailOptions,
            });
        }
    });
    reconcileTextRecordListBody(body, desired, renderContext);
}

function syncTextRecordListBodyVisibility(options, hasRecords) {
    const body = options.body || refs[options.bodyId];
    const panel = options.panel || (options.panelId ? refs[options.panelId] : null);
    const hidden = options.hideWhenEmpty === true && hasRecords !== true;
    if (body) body.hidden = hidden;
    if (panel && panel.classList) {
        panel.classList.toggle('collapsible-panel-body-empty', hidden);
    }
}

function createTextRecordRows(records, options = {}) {
    const duplicateCounts = new Map();
    return (records || []).map((item) => {
        const recordKey = getTextRecordKey(item);
        const duplicateIndex = duplicateCounts.get(recordKey) || 0;
        duplicateCounts.set(recordKey, duplicateIndex + 1);
        return {
            item,
            itemOptions: getTextRecordOptions(item, options),
            recordKey,
            domKey: getTextRecordDomKey(options.bodyId, recordKey, duplicateIndex),
            detailKey: getTextRecordDetailKey(options.bodyId, recordKey, duplicateIndex),
        };
    });
}

function reconcileTextRecordListBody(body, desiredEntries, renderContext) {
    const desired = Array.isArray(desiredEntries) ? desiredEntries : [];
    const desiredDomKeys = new Set(desired.map((entry) => entry.domKey).filter(Boolean));
    const existing = indexExistingTextRecordNodes(body);
    let previous = null;

    removeTextRecordListUnmanagedChildren(body);
    desired.forEach((entry) => {
        const node = getReconciledTextRecordNode(entry, existing, renderContext);
        if (!node) return;
        if (node.parentNode !== body || entry.replaced === true || entry.created === true || entry.kind === 'detail') {
            insertTextRecordNodeAfter(body, node, previous);
        }
        previous = node;
    });

    Array.from(body.children || []).forEach((child) => {
        if (!isTextRecordManagedNode(child)) return;
        const domKey = getTextRecordNodeDomKey(child);
        if (desiredDomKeys.has(domKey)) return;
        if (shouldKeepReusableSelectedDetailNode(child, renderContext)) return;
        removeTextRecordNode(child);
    });
}

function getReconciledTextRecordNode(entry, existing, renderContext) {
    if (!entry || !entry.domKey) return null;
    const nodeMap = entry.kind === 'detail' ? existing.details : existing.rows;
    const reusable = entry.kind === 'detail'
        ? (nodeMap.get(entry.domKey) || getReusableTextRecordDetailNode(entry.recordKey, renderContext))
        : nodeMap.get(entry.domKey);
    if (reusable && reusable.dataset && reusable.dataset.renderKey === entry.renderKey) {
        applyTextRecordNodeDataset(reusable, entry);
        if (entry.kind === 'detail') syncTextRecordDetailVolatileFields(reusable, entry.item, renderContext);
        return reusable;
    }
    if (reusable) {
        entry.replaced = true;
        removeTextRecordNode(reusable);
    } else {
        entry.created = true;
    }

    const node = entry.kind === 'detail'
        ? createTextRecordDetail(entry.item, entry.itemOptions, renderContext)
        : createTextRecordItem(entry.item, entry.itemOptions, renderContext);
    applyTextRecordNodeDataset(node, entry);
    return node;
}

function indexExistingTextRecordNodes(body) {
    const rows = new Map();
    const details = new Map();
    Array.from(body && body.children ? body.children : []).forEach((child) => {
        if (isTextRecordRowNode(child)) rows.set(getTextRecordNodeDomKey(child), child);
        if (isTextRecordDetailNode(child)) details.set(getTextRecordNodeDomKey(child), child);
    });
    return { rows, details };
}

function collectTextRecordDetailNodesByRecordKey() {
    const map = new Map();
    getTextRecordListBodies().forEach((body) => {
        Array.from(body && body.children ? body.children : []).forEach((child) => {
            if (!isTextRecordDetailNode(child) || !child.dataset || !child.dataset.recordKey) return;
            if (!map.has(child.dataset.recordKey)) map.set(child.dataset.recordKey, child);
        });
    });
    return map;
}

function getReusableTextRecordDetailNode(recordKey, renderContext) {
    const nodes = renderContext && renderContext.reusableDetailNodes instanceof Map
        ? renderContext.reusableDetailNodes
        : null;
    return nodes && recordKey ? nodes.get(recordKey) || null : null;
}

function applyTextRecordNodeDataset(node, entry) {
    if (!node || !entry || !node.dataset) return;
    node.dataset.domKey = entry.domKey || '';
    node.dataset.recordKey = entry.recordKey || '';
    node.dataset.renderKey = entry.renderKey || '';
    if (entry.itemOptions && entry.itemOptions.detailKey) node.dataset.detailKey = entry.itemOptions.detailKey;
}

function insertTextRecordNodeAfter(body, node, previous) {
    if (!body || !node) return;
    const children = Array.from(body.children || []);
    const previousIndex = previous && previous.parentNode === body ? children.indexOf(previous) : -1;
    const reference = previousIndex >= 0 ? children[previousIndex + 1] || null : children[0] || null;
    if (reference === node) return;
    body.insertBefore(node, reference);
}

function removeTextRecordListUnmanagedChildren(body) {
    Array.from(body && body.children ? body.children : []).forEach((child) => {
        if (!isTextRecordManagedNode(child)) removeTextRecordNode(child);
    });
}

function removeTextRecordNode(node) {
    if (!node || !node.parentNode) return;
    if (typeof node.parentNode.removeChild === 'function') {
        node.parentNode.removeChild(node);
        return;
    }
    if (Array.isArray(node.parentNode.children)) {
        node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
        node.parentNode = null;
    }
}

function cleanupTextRecordDetailRows(renderContext = createTextRecordRenderContext()) {
    const selectedKey = getSelectedTextRecordKey();
    let keptSelectedDetail = false;
    getTextRecordListBodies().forEach((body) => {
        Array.from(body && body.children ? body.children : []).forEach((child) => {
            if (!isTextRecordDetailNode(child)) return;
            const recordKey = child.dataset ? child.dataset.recordKey : '';
            if (!selectedKey || recordKey !== selectedKey || keptSelectedDetail) {
                removeTextRecordNode(child);
                return;
            }
            keptSelectedDetail = true;
            syncTextRecordDetailVolatileFields(child, getCurrentTextRecordByKey(recordKey), renderContext);
        });
    });
}

function shouldKeepReusableSelectedDetailNode(node, renderContext) {
    if (!isTextRecordDetailNode(node) || !node.dataset) return false;
    const selectedKey = getSelectedTextRecordKey();
    return Boolean(selectedKey
        && node.dataset.recordKey === selectedKey
        && isTextRecordKeyVisible(selectedKey, renderContext));
}

function getTextRecordListBodies() {
    return ['active-texts', 'detached-texts', 'archived-texts']
        .map((id) => refs[id])
        .filter(Boolean);
}

function isTextRecordManagedNode(node) {
    return isTextRecordRowNode(node) || isTextRecordDetailNode(node);
}

function isTextRecordRowNode(node) {
    return !!(node && node.classList && node.classList.contains('text-record'));
}

function isTextRecordDetailNode(node) {
    return !!(node && node.classList && node.classList.contains('text-detail-row'));
}

function getTextRecordNodeDomKey(node) {
    if (!node || !node.dataset) return '';
    return node.dataset.domKey || node.dataset.detailKey || '';
}

function getPrioritizedTextRecords(records, limit) {
    const sorted = (Array.isArray(records) ? records : [])
        .map((item, index) => ({ item, index }))
        .sort(compareTextRecordDisplayPriority)
        .map((entry) => entry.item);
    const displayLimit = Number(limit);
    return Number.isFinite(displayLimit) && displayLimit > 0
        ? sorted.slice(0, displayLimit)
        : sorted;
}

function compareTextRecordDisplayPriority(a, b) {
    const skippedDiff = getSkippedPriority(a.item) - getSkippedPriority(b.item);
    if (skippedDiff) return skippedDiff;

    const messageDiff = getGameMessagePriority(a.item) - getGameMessagePriority(b.item);
    if (messageDiff) return messageDiff;

    return a.index - b.index;
}

function getSkippedPriority(item) {
    return normalizeStatusClass(item && item.status) === 'skipped' ? 1 : 0;
}

function getGameMessagePriority(item) {
    return isGameMessageRecord(item) ? 0 : 1;
}

function isGameMessageRecord(item) {
    if (!item) return false;
    return normalizeHookClass(item.hookKey || item.hook || item.methodName) === 'message';
}

function createTextRecordRenderContext(policySnapshot = getGuiPolicySnapshot(), records = getForesightTextRecords()) {
    const allRecords = Array.isArray(records) ? records : [];
    const basePolicy = getGuiTextRecordPolicy(policySnapshot);
    const selectedDetailKey = typeof getSelectedTextRecordKey === 'function'
        ? getSelectedTextRecordKey()
        : (basePolicy.selectedDetailKey || '');
    const policy = Object.assign({}, basePolicy, { selectedDetailKey });
    const foregroundSpoilerKeys = policy.showForesightSpoilers
        ? new Set()
        : getForegroundGameMessageSourceKeys(allRecords);
    return {
        policySnapshot,
        policy,
        records: allRecords,
        foregroundSpoilerKeys,
    };
}

function createTextRecordRowRenderKey(item, options = {}, renderContext = createTextRecordRenderContext()) {
    const railInfo = getTextRecordTranslationRailInfo(item);
    const censored = isTextRecordSpoilerCensoredForContext(item, renderContext);
    const detailEnabled = isGuiTextRecordDetailAllowed(item, renderContext);
    return createTextRecordStableRenderKey({
        recordKey: options.recordKey || getTextRecordKey(item),
        statusClass: normalizeStatusClass(item && item.status),
        hookClass: normalizeHookClass(item && (item.hookKey || item.hook)),
        translationClass: railInfo.state || 'neutral',
        inactive: options.inactive === true,
        active: options.active === true,
        censored,
        detailEnabled,
        source: item ? item.rawText || item.original || item.visibleText || '' : '',
        translation: item ? item.translation || '' : '',
        rail: {
            state: railInfo.state || 'neutral',
            label: railInfo.label || 'WAIT',
            title: railInfo.title || '',
        },
    });
}

function createTextRecordDetailRenderKey(item, options = {}, renderContext = createTextRecordRenderContext()) {
    return createTextRecordStableRenderKey({
        recordKey: options.recordKey || getTextRecordKey(item),
        statusClass: normalizeStatusClass(item && item.status),
        hookClass: normalizeHookClass(item && (item.hookKey || item.hook)),
        inactive: options.inactive === true,
        header: createTextRecordDetailHeaderKeySource(item, options),
        meta: createTextRecordDetailMetaKeySource(item),
        translationIntel: createTextRecordTranslationIntelKeySource(item, renderContext),
        policyIntel: createTextRecordPolicyIntelKeySource(item),
        history: isTextRecordHistoryVisible(renderContext) ? createTextRecordHistoryKeySource(item) : [],
    });
}

function createTextRecordDetailHeaderKeySource(item, options = {}) {
    const source = item || {};
    const labels = [];
    const lifecycleLabel = String(options.lifecycleLabel || source.lifecycleState || '').trim();
    if (lifecycleLabel && lifecycleLabel !== 'active' && !labels.includes(lifecycleLabel)) labels.push(lifecycleLabel);
    return {
        hook: source.hook || '-',
        status: source.status || 'detected',
        labels,
    };
}

function createTextRecordDetailMetaKeySource(item) {
    const source = item || {};
    const policy = getTextRecordRuntimePolicyIntel(source);
    return {
        firstSeenAt: source.firstSeenAt || '',
        screen: source.screenState || (source.onScreen === false ? 'offscreen' : 'visible'),
        disappearedAt: source.disappearedAt || '',
        deactivatedAt: source.deactivatedAt || '',
        lifecycle: source.lifecycleState || '',
        priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : null,
        policy: {
            lifecycle: policy.lifecycle ? formatPolicySection(policy.lifecycle) : '',
            priority: policy.priority ? formatPolicySection(policy.priority) : '',
            request: policy.request ? formatPolicySection(policy.request) : '',
        },
        hook: source.hookKey || source.hook || '',
        surface: source.surfaceType || source.windowType || source.ownerType || '',
        method: source.methodName || '',
        drawRun: source.drawRun ? formatDrawRun(source.drawRun) : '',
        rawText: source.rawText && source.rawText !== source.original ? source.rawText : '',
        convertedText: source.convertedText && source.convertedText !== source.original ? source.convertedText : '',
        translationSource: source.translationSource || source.normalizedSource || '',
        translationReceived: source.translationReceived || '',
        translationDrawn: source.translationDrawn || '',
        position: Number.isFinite(Number(source.x)) || Number.isFinite(Number(source.y))
            ? [formatCoordinate(source.x), formatCoordinate(source.y)]
            : [],
        bounds: source.bounds ? formatBounds(source.bounds) : '',
        metadata: createTextRecordMetadataKeySource(source.metadata),
    };
}

function createTextRecordMetadataKeySource(metadata) {
    const source = metadata && typeof metadata === 'object' ? metadata : {};
    const result = {};
    Object.keys(source).sort().forEach((key) => {
        if (key === 'drawRun') return;
        result[key] = source[key];
    });
    return result;
}

function createTextRecordPolicyIntelKeySource(item) {
    const policy = getTextRecordRuntimePolicyIntel(item);
    if (!policy || !Object.keys(policy).length) return null;
    return {
        headline: formatPolicyHeadline(policy),
        rows: {
            lifecycle: policy.lifecycle ? formatPolicySection(policy.lifecycle) : '',
            priority: policy.priority ? formatPolicySection(policy.priority) : '',
            request: policy.request ? formatPolicySection(policy.request) : '',
            last: policy.last ? formatPolicySection(policy.last) : '',
        },
        events: Array.isArray(policy.events)
            ? policy.events.slice(-6).map((event) => [
                event && event.type || 'event',
                event && event.message || '',
                formatPolicySection(event && event.policy || {}),
            ])
            : [],
    };
}

function createTextRecordTranslationIntelKeySource(item, renderContext = createTextRecordRenderContext()) {
    const jobs = getMatchedIntelJobs(item);
    if (!jobs.length) return null;
    const primary = jobs[0];
    return {
        primary: createTextRecordIntelJobKeySource(primary, item, renderContext),
        subscribers: getMatchedSubscriberRecords(primary, item).map((subscriber) => formatSubscriberRecord(subscriber)),
        related: jobs.slice(1, 4).map((job) => `${job.id || '-'} | ${job.status || job.displayMode || '-'} | ${formatPriority(job)} | ${job.textPreview || '-'}`),
        history: isTextRecordHistoryVisible(renderContext) ? createIntelHistoryKeySource(primary.history || []) : [],
    };
}

function createTextRecordIntelJobKeySource(job) {
    const source = job || {};
    return {
        id: source.id || '',
        status: source.status || source.displayMode || '',
        hook: source.hook || '',
        priority: formatPriority(source),
        stream: {
            enabled: source.stream === true,
            deltaCount: source.deltaCount || 0,
            lastDeltaAt: source.lastDeltaAt || '',
        },
        subscribers: `${formatNumber(source.subscribers || 0)}/${formatNumber(source.totalSubscribers || 0)}`,
        queuedAt: source.queuedAt || '',
        startedAt: source.startedAt || '',
        terminalAt: source.terminalAt || '',
        queuePosition: source.queuePosition || '',
        lastError: source.lastError || '',
        terminalReason: source.terminalReason || '',
    };
}

function createTextRecordHistoryKeySource(item) {
    return getTextRecordHistory(item).map((entry) => ({
        at: entry.at || '',
        timeText: entry.at ? formatTime(entry.at) : '-',
        type: entry.type || 'event',
        message: entry.message || '',
        details: formatDetails(entry.details),
    }));
}

function createIntelHistoryKeySource(history) {
    return (Array.isArray(history) ? history : []).map((event) => ({
        at: event && event.at || '',
        timeText: event && event.at ? formatTime(event.at) : '-',
        type: event && event.type || 'event',
        details: formatIntelEventDetails(event),
    }));
}

function createTextRecordStableRenderKey(value) {
    try {
        return JSON.stringify(normalizeTextRecordRenderValue(value));
    } catch (_) {
        return String(Date.now());
    }
}

function normalizeTextRecordRenderValue(value) {
    if (Array.isArray(value)) return value.map(normalizeTextRecordRenderValue);
    if (!value || typeof value !== 'object') return value === undefined ? null : value;
    const result = {};
    Object.keys(value).sort().forEach((key) => {
        const entry = value[key];
        if (typeof entry === 'function' || entry === undefined) return;
        result[key] = normalizeTextRecordRenderValue(entry);
    });
    return result;
}

function isGuiTextRecordSpoilerCensored(item, records = getForesightTextRecords(), policySnapshot = null) {
    return isTextRecordSpoilerCensoredForContext(
        item,
        createTextRecordRenderContext(policySnapshot || getGuiPolicySnapshot(), records)
    );
}

function isTextRecordSpoilerCensoredForContext(item, renderContext) {
    const context = renderContext || createTextRecordRenderContext();
    return !context.policy.showForesightSpoilers
        && isUnconsumedForesightMessageRecord(item)
        && !hasForegroundGameMessageEquivalent(item, context.foregroundSpoilerKeys);
}

function isUnconsumedForesightMessageRecord(item) {
    const metadata = getTextRecordMetadata(item);
    return isGameMessageRecord(item)
        && metadata.foresight === true
        && metadata.foresightConsumed !== true;
}

function hasForegroundGameMessageEquivalent(item, recordsOrKeys) {
    const keys = getForesightSpoilerSourceKeys(item);
    if (!keys.length) return false;
    const foregroundKeys = recordsOrKeys instanceof Set
        ? recordsOrKeys
        : getForegroundGameMessageSourceKeys(recordsOrKeys);
    return keys.some((key) => foregroundKeys.has(key));
}

function getForegroundGameMessageSourceKeys(records = getForesightTextRecords()) {
    const keys = new Set();
    (Array.isArray(records) ? records : []).forEach((record) => {
        if (!isForegroundGameMessageRecord(record)) return;
        getForesightSpoilerSourceKeys(record).forEach((key) => keys.add(key));
    });
    return keys;
}

function isForegroundGameMessageRecord(item) {
    if (!isGameMessageRecord(item)) return false;
    const metadata = getTextRecordMetadata(item);
    return metadata.foresightConsumed === true || metadata.foresight !== true;
}

function getTextRecordMetadata(item) {
    return item && item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
}

function getForesightSpoilerSourceKey(item) {
    return getForesightSpoilerSourceKeys(item)[0] || '';
}

function getForesightSpoilerSourceKeys(item) {
    if (!item) return [];
    const seen = new Set();
    return [
        item.normalizedSource,
        item.translationSource,
        item.original,
        item.visibleText,
        item.rawText,
    ].map(normalizeForesightSpoilerText).filter((key) => {
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function normalizeForesightSpoilerText(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/gu, ' ').trim();
}

function findActiveTextRecordIndex(rows, renderContext = createTextRecordRenderContext()) {
    return (rows || []).findIndex((row) => (
        isGuiTextRecordDetailAllowed(row.item, renderContext)
        && shouldRenderActiveTextRecordDetail(row.recordKey, renderContext)
    ));
}

function getTextRecordDetailInsertIndex(container, activeIndex, recordCount) {
    const flexRowEndIndex = getTextRecordFlexRowEndIndex(container, activeIndex);
    if (flexRowEndIndex >= activeIndex) return Math.min(recordCount - 1, flexRowEndIndex);
    const columns = getTextRecordGridColumnCount(container);
    const rowEndIndex = activeIndex + (columns - ((activeIndex % columns) + 1));
    return Math.min(recordCount - 1, rowEndIndex);
}

function getTextRecordFlexRowEndIndex(container, activeIndex) {
    if (!container || activeIndex < 0) return -1;
    const records = Array.from(container.children || [])
        .filter((child) => child && child.classList && child.classList.contains('text-record'));
    const activeRecord = records[activeIndex];
    if (!activeRecord) return -1;
    const rowTop = activeRecord.offsetTop;
    let rowEndIndex = activeIndex;
    for (let index = activeIndex + 1; index < records.length; index += 1) {
        if (Math.abs(records[index].offsetTop - rowTop) > 1) break;
        rowEndIndex = index;
    }
    return rowEndIndex;
}

function getTextRecordGridColumnCount(container) {
    try {
        const style = window.getComputedStyle(container);
        const columns = style && String(style.gridTemplateColumns || '').trim();
        if (!columns || columns === 'none') return 1;
        return Math.max(1, columns.split(/\s+/u).filter(Boolean).length);
    } catch (_) {
        return 1;
    }
}

function getTextRecordOptions(item, listOptions = {}) {
    return typeof listOptions.itemOptions === 'function'
        ? listOptions.itemOptions(item)
        : (listOptions.itemOptions || {});
}

function getForesightTextRecords() {
    return []
        .concat(state.activeTexts || [])
        .concat(state.detachedTexts || [])
        .concat(state.archivedTexts || []);
}

function getCurrentForesightGameMessageRecord(records = state.activeTexts || []) {
    return getPrioritizedTextRecords(records)
        .find((item) => isForegroundGameMessageRecord(item) && item.onScreen !== false)
        || null;
}

function createForesightTranslationPill(item) {
    if (!item) return null;
    const renderContext = createTextRecordRenderContext(getGuiPolicySnapshot());
    return createForesightTranslationPillForContext(item, renderContext);
}

function createForesightTranslationPillForContext(item, renderContext) {
    if (!item) return null;
    const censored = isTextRecordSpoilerCensoredForContext(item, renderContext);
    const detailEnabled = isGuiTextRecordDetailAllowed(item, renderContext);
    const railInfo = getTextRecordTranslationRailInfo(item);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = [
        'foresight-text-pill',
        `text-status-${normalizeStatusClass(item.status)}`,
        `text-hook-${normalizeHookClass(item.hookKey || item.hook)}`,
        `text-translation-${railInfo.state}`,
        censored ? 'foresight-spoiler-censored' : '',
    ].join(' ');
    if (item.id) button.dataset.recordId = item.id;
    button.title = censored
        ? 'Foresight spoiler hidden'
        : (detailEnabled ? 'Show text record details' : 'Detail view disabled in settings.json');
    if (censored) {
        button.disabled = true;
        button.setAttribute('aria-label', 'Foresight spoiler hidden');
    } else if (detailEnabled) {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const detailKey = findTextRecordDetailKeyForRecord(item, renderContext);
            if (!detailKey) return;
            setSelectedTextRecordKey(getTextRecordKey(item));
            renderTextRecordSections(refreshGuiPolicySnapshot());
            scrollTextRecordDetailIntoView(detailKey);
        });
    } else {
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('aria-label', 'Detail view disabled');
    }

    const content = document.createElement('span');
    content.className = 'foresight-text-pill-content';
    if (censored) content.setAttribute('aria-hidden', 'true');
    content.appendChild(createLine(item.rawText || item.original || item.visibleText || '', 'source'));
    content.appendChild(createLine(item.translation || item.translationReceived || '', 'translation'));
    button.appendChild(content);
    button.appendChild(createTextTranslationRail(railInfo));
    return button;
}

function findTextRecordDetailKeyForRecord(record, renderContext = createTextRecordRenderContext()) {
    if (!record) return '';
    const textRecordPolicy = renderContext.policy;
    const sections = [
        { bodyId: 'active-texts', records: getPrioritizedTextRecords(state.activeTexts || []) },
        { bodyId: 'detached-texts', records: getPrioritizedTextRecords(state.detachedTexts || [], textRecordPolicy.inactiveDisplayLimit) },
        { bodyId: 'archived-texts', records: getPrioritizedTextRecords(state.archivedTexts || [], textRecordPolicy.inactiveDisplayLimit) },
    ];
    for (const section of sections) {
        const rows = createTextRecordRows(section.records, { bodyId: section.bodyId });
        const match = rows.find((row) => isSameTextRecord(row.item, record));
        if (match) return match.detailKey;
    }
    return '';
}

function getCurrentTextRecordByKey(recordKey) {
    const key = String(recordKey || '');
    if (!key) return null;
    return getForesightTextRecords().find((record) => getTextRecordKey(record) === key) || null;
}

function isTextRecordKeyVisible(recordKey, renderContext = createTextRecordRenderContext()) {
    return getVisibleTextRecordKeys(renderContext).includes(String(recordKey || ''));
}

function getVisibleTextRecordKeys(renderContext = createTextRecordRenderContext()) {
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
        .map((row) => row.recordKey)
        .filter(Boolean);
}

function syncTextRecordVolatileDom(renderContext = createTextRecordRenderContext()) {
    getTextRecordListBodies().forEach((body) => {
        Array.from(body && body.children ? body.children : []).forEach((child) => {
            if (!isTextRecordDetailNode(child) || !child.dataset) return;
            syncTextRecordDetailVolatileFields(
                child,
                getCurrentTextRecordByKey(child.dataset.recordKey),
                renderContext
            );
        });
    });
}

function syncTextRecordDetailVolatileFields(detailNode, item) {
    if (!detailNode || !item) return;
    setTextRecordMetaValue(detailNode, 'First seen', item.firstSeenAt ? formatTime(item.firstSeenAt) : '-');
    setTextRecordMetaValue(detailNode, 'Seen', item.seenAt ? formatTime(item.seenAt) : '-');
    setTextRecordMetaValue(detailNode, 'Updated', item.updatedAt ? formatTime(item.updatedAt) : '-');

    const primary = getMatchedIntelJobs(item)[0];
    if (!primary) return;
    setTextRecordMetaValue(detailNode, 'Stream', formatStreamState(primary));
    setTextRecordMetaValue(detailNode, 'Queued', primary.queuedAt ? `${formatTime(primary.queuedAt)} (${formatElapsedSince(primary.queuedAt)} ago)` : '-');
    setTextRecordMetaValue(detailNode, 'Started', primary.startedAt ? `${formatTime(primary.startedAt)} (${formatElapsedSince(primary.startedAt)} ago)` : '-');
    if (primary.terminalAt) {
        setTextRecordMetaValue(detailNode, 'Finished', `${formatTime(primary.terminalAt)} (${formatElapsedSince(primary.terminalAt)} ago)`);
    }
}

function setTextRecordMetaValue(root, label, value) {
    const item = findTextRecordMetaItem(root, label);
    if (!item) return;
    const valueNode = Array.from(item.children || []).find((child) => String(child.tagName || '').toUpperCase() === 'STRONG')
        || Array.from(item.children || []).slice(-1)[0];
    if (valueNode) valueNode.textContent = value === undefined || value === null || value === '' ? '-' : String(value);
}

function findTextRecordMetaItem(root, label) {
    const wanted = String(label || '');
    const stack = Array.from(root && root.children ? root.children : []);
    while (stack.length) {
        const current = stack.shift();
        if (current && current.dataset && current.dataset.metaLabel === wanted) return current;
        if (current && Array.isArray(current.children) && current.children.length) {
            stack.unshift(...current.children);
        }
    }
    return null;
}

function isSameTextRecord(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.id && right.id && String(left.id) === String(right.id)) return true;
    return getTextRecordKey(left) === getTextRecordKey(right);
}

function scrollTextRecordDetailIntoView(detailKey) {
    setTimeout(() => {
        const target = findElementByDataAttribute('detailKey', detailKey);
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, 0);
}

function findElementByDataAttribute(key, value) {
    if (!key || !value || typeof document.querySelectorAll !== 'function') return null;
    const selector = `[data-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}]`;
    return Array.from(document.querySelectorAll(selector))
        .find((element) => element && element.dataset && element.dataset[key] === value) || null;
}
