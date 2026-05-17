// Translator monitor text record lists helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function toneForHookStatus(status) {
    if (status === 'installed') return 'ok';
    if (status === 'skipped') return 'warn';
    if (status === 'failed') return 'bad';
    return 'neutral';
}

function renderHookResults() {
    const body = refs['hook-results'];
    if (!body) return;

    const summary = state.hookSummary || summarizeHookResults(state.hookResults);
    const tone = summary.failed > 0 ? 'bad' : (summary.skipped > 0 ? 'warn' : 'ok');
    const hooksReady = summary.total > 0
        && summary.failed === 0
        && summary.skipped === 0
        && summary.installed === summary.total;
    setPanelAutoCollapsed('hook-installation-panel', 'hookInstallation', hooksReady);
    setSummaryStatus(
        'hook-summary',
        summary.total > 0 ? tone : 'neutral',
        summary.total > 0
            ? `${formatNumber(summary.installed)} installed, ${formatNumber(summary.skipped)} skipped, ${formatNumber(summary.failed)} failed`
            : '0 hooks'
    );

    if (!state.hookResults.length) {
        body.innerHTML = '<tr><td colspan="3" class="empty">No hook installation records.</td></tr>';
        return;
    }

    body.innerHTML = '';
    for (const item of state.hookResults) {
        const row = document.createElement('tr');
        row.appendChild(createCell(item.displayName || item.name || '-'));
        row.appendChild(createStatusCell(item.status || '-'));
        row.appendChild(createCell(item.reason || '-'));
        body.appendChild(row);
    }
}

function renderTextRecordSections() {
    pruneActiveTextRecordDetail();
    state.renderedTextRecordDetailKey = '';
    renderActiveTexts();
    renderDetachedTexts();
    renderArchivedTexts();
}

function renderActiveTexts() {
    renderTextRecordList({
        bodyId: 'active-texts',
        summaryId: 'active-text-summary',
        records: state.activeTexts,
        emptyText: 'No active text records.',
    });
}

function renderDetachedTexts() {
    renderTextRecordList({
        bodyId: 'detached-texts',
        summaryId: 'detached-text-summary',
        records: state.detachedTexts,
        emptyText: 'No detached text records.',
        limit: INACTIVE_TEXT_DISPLAY_LIMIT,
        itemOptions: { inactive: true, lifecycleLabel: 'detached' },
    });
}

function renderArchivedTexts() {
    renderTextRecordList({
        bodyId: 'archived-texts',
        summaryId: 'archived-text-summary',
        records: state.archivedTexts,
        emptyText: 'No archived text records.',
        limit: INACTIVE_TEXT_DISPLAY_LIMIT,
        itemOptions: { inactive: true, lifecycleLabel: 'archived' },
    });
}

function renderTextRecordList(options) {
    const body = refs[options.bodyId];
    if (!body) return;

    const records = Array.isArray(options.records) ? options.records : [];
    setSummaryStatus(options.summaryId, 'neutral', `${formatNumber(records.length)} entries`);

    if (!records.length) {
        body.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = options.emptyText || 'No text records.';
        body.appendChild(empty);
        return;
    }

    const rows = createTextRecordRows(getPrioritizedTextRecords(records, options.limit), options);
    const activeIndex = findActiveTextRecordIndex(rows);
    const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;
    const detailInsertIndex = activeIndex >= 0
        ? getTextRecordDetailInsertIndex(body, activeIndex, rows.length)
        : -1;

    body.innerHTML = '';
    rows.forEach((row, index) => {
        const active = index === activeIndex;
        body.appendChild(createTextRecordItem(row.item, Object.assign({
            active,
            detailKey: row.detailKey,
            recordKey: row.recordKey,
        }, row.itemOptions)));
        if (index === detailInsertIndex) {
            body.appendChild(createTextRecordDetail(activeRow.item, activeRow.itemOptions));
            state.renderedTextRecordDetailKey = activeRow.detailKey;
        }
    });
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
            detailKey: getTextRecordDetailKey(options.bodyId, recordKey, duplicateIndex),
        };
    });
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

function shouldCensorForesightSpoilerRecord(item, records = getForesightTextRecords()) {
    return !shouldShowForesightSpoilers()
        && isUnconsumedForesightMessageRecord(item)
        && !hasForegroundGameMessageEquivalent(item, records);
}

function isUnconsumedForesightMessageRecord(item) {
    const metadata = getTextRecordMetadata(item);
    return isGameMessageRecord(item)
        && metadata.foresight === true
        && metadata.foresightConsumed !== true;
}

function hasForegroundGameMessageEquivalent(item, records) {
    const keys = getForesightSpoilerSourceKeys(item);
    if (!keys.length) return false;
    const foregroundKeys = getForegroundGameMessageSourceKeys(records);
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

function findActiveTextRecordIndex(rows) {
    return (rows || []).findIndex((row) => (
        canOpenTextRecordDetail(row.item)
        && shouldRenderActiveTextRecordDetail(row.detailKey)
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

function createForesightTranslationPill(item) {
    if (!item) return null;
    const censored = shouldCensorForesightSpoilerRecord(item);
    const detailEnabled = canOpenTextRecordDetail(item);
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
            const detailKey = findTextRecordDetailKeyForRecord(item);
            if (!detailKey) return;
            state.activeTextRecordDetailKey = detailKey;
            renderTextRecordSections();
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

function findTextRecordDetailKeyForRecord(record) {
    if (!record) return '';
    const sections = [
        { bodyId: 'active-texts', records: getPrioritizedTextRecords(state.activeTexts || []) },
        { bodyId: 'detached-texts', records: getPrioritizedTextRecords(state.detachedTexts || [], INACTIVE_TEXT_DISPLAY_LIMIT) },
        { bodyId: 'archived-texts', records: getPrioritizedTextRecords(state.archivedTexts || [], INACTIVE_TEXT_DISPLAY_LIMIT) },
    ];
    for (const section of sections) {
        const rows = createTextRecordRows(section.records, { bodyId: section.bodyId });
        const match = rows.find((row) => isSameTextRecord(row.item, record));
        if (match) return match.detailKey;
    }
    return '';
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

function withDisplayLifecycle(record, lifecycle) {
    return Object.assign({}, record, {
        displayLifecycle: lifecycle,
        lifecycleState: record && record.lifecycleState ? record.lifecycleState : lifecycle,
    });
}
