import { formatNumber, formatTime } from '../core.js';
import { appendMetadataItem, createHistoryEmpty, createMetadataGrid, createTextElement, createTitledContainer, createTitledMetaHeader, } from '../dom/builders.js';
import { appendMeta, appendTextMetadata, createHistoryList } from '../dom/details.js';
import { formatPolicySection, formatRecordOutcome, normalizeTranslationDiagnosticsStatusClass } from '../formatters.js';
import { formatPriority, formatStreamState, getMatchedTranslationDiagnosticsJobs, normalizeOptionalPriority, } from '../translation-diagnostics/job-model.js';
import { createTranslationDiagnosticsHistory, formatElapsedSince } from '../translation-diagnostics/jobs.js';
import { firstNonEmptyString, getTextRecordRuntimePolicy } from '../runtime/records.js';
import { state } from '../state.js';
import { getTextRecordKey } from './identity.js';
import { diagnosticRecordView, getRecordViews, hasFailedPresentation, type RecordView } from './model.js';
import { buildTextRecordCopyPayload, copyTextRecordValue } from '../copy/actions.js';
import { createTextRecordPill, createTextRecordDetailShell, recordStates } from './pill.js';
import { getSemanticFamilyClass } from './semantic-family.js';
import { createTextRecordRenderContext, isGuiTextRecordDetailAllowed, isTextRecordHistoryVisible, isTextRecordSpoilerCensoredForContext, } from './view-model.js';
import type { TextRecordItemOptions, TextRecordRenderContext } from './view-model.js';
import type { GuiTranslationDiagnosticsJob, GuiTranslationDiagnosticsSubscriber, GuiTextPolicy, GuiTextRecord, } from '../types.js';
import { falsyFallback } from '../types.js';
export function applyCachedTextRecordHistory(item: GuiTextRecord): boolean {
    if (!item.id)
        return false;
    const cached = state.textHistoryById.get(item.id);
    if (!cached)
        return false;
    item.history = cached.history;
    item.historyRetention = cached.retention;
    return true;
}
export function createTextRecordItem(item: GuiTextRecord, options: TextRecordItemOptions = {}, onToggle: (recordKey: string) => void, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): HTMLElement {
    const recordKey = falsyFallback(options.recordKey, getTextRecordKey(item));
    const detailEnabled = isGuiTextRecordDetailAllowed(item, renderContext);
    return createTextRecordPill(diagnosticRecordView(item, recordKey), {
        ...options,
        detailKey: falsyFallback(options.detailKey, recordKey),
        censored: isTextRecordSpoilerCensoredForContext(item, renderContext),
        ...(detailEnabled
            ? {
                onToggle: () => {
                    onToggle(recordKey);
                },
                onCopy: (target: HTMLElement) => {
                    copyCurrentRecord(recordKey, target);
                },
            }
            : {}),
    }).element;
}
export function createTextRecordDetail(item: GuiTextRecord, options: TextRecordItemOptions = {}, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): HTMLElement {
    return createRecordDetail(diagnosticRecordView(item, options.recordKey ?? getTextRecordKey(item)), renderContext);
}
export function appendRecordDiagnostics(expanded: HTMLElement, item: GuiTextRecord, renderContext: TextRecordRenderContext): void {
    const translationDetail = createTranslationDiagnosticsDetail(item, renderContext);
    if (translationDetail)
        expanded.appendChild(translationDetail);
    const policyDetail = createPolicyDiagnosticsDetail(item);
    if (policyDetail)
        expanded.appendChild(policyDetail);
    if (isTextRecordHistoryVisible(renderContext))
        expanded.appendChild(createHistoryList(item));
}
export function createPolicyDiagnosticsDetail(item: GuiTextRecord): HTMLElement | null {
    const policy = getTextRecordRuntimePolicy(item);
    if (!Object.keys(policy).length)
        return null;
    const panel = createExpandedRelatedPanel('Text Policy', formatPolicyHeadline(policy));
    const rows: string[] = [];
    if (policy.lifecycle)
        rows.push(`Last lifecycle | ${formatPolicySection(policy.lifecycle)}`);
    if (policy.priority)
        rows.push(`Last priority | ${formatPolicySection(policy.priority)}`);
    if (policy['request'])
        rows.push(`Last request | ${formatPolicySection(policy['request'])}`);
    if (policy.last)
        rows.push(`Last | ${formatPolicySection(policy.last)}`);
    panel.appendChild(createRelatedRowList('Policy State', rows));
    if (Array.isArray(policy.events) && policy.events.length) {
        panel.appendChild(createRelatedRowList('Policy Events', policy.events
            .slice(-6)
            .map((event) => [event.type || 'event', event.message || '', formatPolicySection(event.policy)]
            .filter(Boolean)
            .join(' | '))));
    }
    return panel;
}
export function formatPolicyHeadline(policy: GuiTextPolicy): string {
    const priority = policy.priority ?? {};
    const lifecycle = policy.lifecycle ?? {};
    return firstNonEmptyString([priority['action'], priority['priority']]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .join(' '), [lifecycle['kind'], lifecycle['priorityAction']].filter(Boolean).join(' '), 'policy');
}
export function createTranslationDiagnosticsDetail(item: GuiTextRecord, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): HTMLElement | null {
    const jobs = getMatchedTranslationDiagnosticsJobs(item);
    if (!jobs.length)
        return null;
    const primary = jobs[0];
    if (!primary)
        return null;
    const panel = createExpandedRelatedPanel('Translation Job', primary.id || '-');
    panel.className += ` translation-diagnostics-job-${normalizeTranslationDiagnosticsStatusClass(primary.status || primary.displayMode)}`;
    const grid = createMetadataGrid();
    appendMeta(grid, 'Job', primary.id || '-');
    appendMeta(grid, 'Status', primary.status || primary.displayMode);
    appendMeta(grid, 'Hook', primary.hook || '-');
    appendMeta(grid, 'Priority', formatPriority(primary));
    appendMeta(grid, 'Stream', formatStreamState(primary));
    appendMeta(grid, 'Subscribers', `${formatNumber(primary.subscribers || 0)}/${formatNumber(primary.totalSubscribers || 0)}`);
    appendMeta(grid, 'Queued', primary.queuedAt ? `${formatTime(primary.queuedAt)} (${formatElapsedSince(primary.queuedAt)} ago)` : '-');
    appendMeta(grid, 'Started', primary.startedAt ? `${formatTime(primary.startedAt)} (${formatElapsedSince(primary.startedAt)} ago)` : '-');
    if (primary.terminalAt)
        appendMeta(grid, 'Finished', `${formatTime(primary.terminalAt)} (${formatElapsedSince(primary.terminalAt)} ago)`);
    if (primary.queuePosition)
        appendMeta(grid, 'Queue Position', `#${formatNumber(primary.queuePosition)}`);
    if (primary.lastError)
        appendMeta(grid, 'Last Error', primary.lastError);
    if (primary.terminalReason)
        appendMeta(grid, 'Reason', primary.terminalReason);
    panel.appendChild(grid);
    const subscribers = getMatchedSubscriberRecords(primary, item);
    if (subscribers.length) {
        panel.appendChild(createRelatedRowList('Subscribers', subscribers.map((subscriber) => formatSubscriberRecord(subscriber))));
    }
    if (jobs.length > 1) {
        panel.appendChild(createRelatedRowList('Related Jobs', jobs
            .slice(1, 4)
            .map((job) => `${job.id || '-'} | ${job.status || job.displayMode} | ${formatPriority(job)} | ${job.textPreview || '-'}`)));
    }
    if (isTextRecordHistoryVisible(renderContext)) {
        panel.appendChild(createTranslationDiagnosticsHistory(primary.history));
    }
    return panel;
}
export function createExpandedRelatedPanel(titleText: unknown, metaText: unknown): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'expanded-related-panel';
    panel.appendChild(createTitledMetaHeader({
        className: 'expanded-related-header',
        titleTag: 'h3',
        titleText: falsyFallback(titleText, 'Details'),
        metaClassName: 'expanded-related-meta',
        metaText: falsyFallback(metaText, '-'),
    }));
    return panel;
}
export function createRelatedRowList(titleText: unknown, rows: readonly string[]): HTMLElement {
    const wrap = createTitledContainer('related-row-list', falsyFallback(titleText, 'Details'));
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
export function getMatchedSubscriberRecords(job: GuiTranslationDiagnosticsJob, item: GuiTextRecord): GuiTranslationDiagnosticsSubscriber[] {
    if (!item.id)
        return [];
    const recordId = item.id;
    return job.subscriberRecords.filter((subscriber) => subscriber.recordId === recordId);
}
export function formatSubscriberRecord(subscriber: GuiTranslationDiagnosticsSubscriber): string {
    const priority = normalizeOptionalPriority(subscriber.priority);
    const parts = [subscriber.id || '-', subscriber.status || '-'];
    if (priority !== null && Number.isFinite(priority)) {
        parts.push(`${String(priority)}${subscriber.stream ? 'S' : ''}`);
    }
    if (subscriber.hook)
        parts.push(subscriber.hook);
    if (subscriber.lastPriorityReason)
        parts.push(subscriber.lastPriorityReason);
    return parts.join(' | ');
}
export function copyCurrentRecord(key: string, target: HTMLElement): void {
    copyTextRecordValue(() => {
        const view = getRecordViews().find((record) => record.key === key);
        if (!view)
            throw new Error('Record is no longer retained.');
        const { diagnostics, ...current } = view;
        if (diagnostics)
            applyCachedTextRecordHistory(diagnostics);
        return { ...current, ...(diagnostics ? { diagnostics: buildTextRecordCopyPayload(diagnostics) } : {}) };
    }, target);
}
export function createRecordDetail(view: RecordView, context: TextRecordRenderContext): HTMLElement {
    const status = hasFailedPresentation(view)
        ? recordStates.failed
        : view.state === null
            ? null
            : recordStates[view.state];
    const detail = createTextRecordDetailShell(view.key, {
        detailKey: view.key,
        statusClass: status?.status ?? 'detected',
        hookClass: getSemanticFamilyClass(view.diagnostics),
    });
    const header = createTextElement('div', 'text-expanded-header', '');
    header.appendChild(createTextElement('span', 'text-expanded-meta', formatRecordOutcome(view)));
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-record-button';
    copy.textContent = 'Copy';
    copy.title = 'Copy full text record';
    copy.setAttribute('aria-label', 'Copy full text record');
    copy.addEventListener('click', () => {
        copyCurrentRecord(view.key, copy);
    });
    header.appendChild(copy);
    detail.appendChild(header);
    const grid = createMetadataGrid();
    if (view.revision !== null)
        appendMetadataItem(grid, 'Semantic revision', view.revision);
    if (view.attempt !== null)
        appendMetadataItem(grid, 'Attempt', view.attempt);
    if (view.reason !== null)
        appendMetadataItem(grid, 'Policy reason', view.reason);
    const failureLabels: Record<string, string> = {
        stage: 'Failure stage',
        reason: 'Failure reason',
        code: 'Failure code',
        message: 'Failure message',
        truncated: 'Message truncated',
        recovery: 'Recovery',
    };
    for (const field of view.failure) {
        const name = String(field['name']);
        const value = field['value'];
        if (value !== null)
            appendMetadataItem(grid, failureLabels[name] ?? name, typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value);
    }
    if (view.diagnostics)
        appendTextMetadata(grid, view.diagnostics);
    detail.appendChild(grid);
    const exchange = createExpandedRelatedPanel('Raw Translator Input / Output', 'Before formatting restoration');
    for (const [label, text] of [
        ['Input', view.translator?.input ?? null],
        ['Output', view.translator?.output ?? null],
    ]) {
        exchange.appendChild(createTextElement('div', 'expanded-related-header', label ?? ''));
        exchange.appendChild(createTextElement('pre', 'translator-exchange-text', text === null ? 'Not available yet' : (text ?? '')));
    }
    detail.appendChild(exchange);
    if (view.diagnostics)
        appendRecordDiagnostics(detail, view.diagnostics, context);
    return detail;
}
