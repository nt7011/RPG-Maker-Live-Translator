import { formatNumber, formatTime, renderStatusSummary, setSummaryStatus } from '../core.js';
import { appendEmptyState } from '../dom/builders.js';
import { createCell, createLine, createStatusCell } from '../dom/details.js';
import { formatRecordOutcome, normalizeHookClass, normalizeStatusClass } from '../formatters.js';
import { formatPriority, formatStreamState, getMatchedTranslationDiagnosticsJobs, getTextRecordTranslationRailInfo, } from '../translation-diagnostics/job-model.js';
import type { GuiTranslationDiagnosticsDisplayJob } from '../translation-diagnostics/job-model.js';
import { formatElapsedSince } from '../translation-diagnostics/jobs.js';
import { getGuiEffectivePolicy, getGuiPolicySnapshot, getGuiTextRecordPolicy, refreshGuiPolicySnapshot, } from '../policy.js';
import { getTextRecordRuntimePolicy, getVisibleHookResults, summarizeHookResults } from '../runtime/records.js';
import { refs, state } from '../state.js';
import { getSemanticFamily } from './semantic-family.js';
import { getTextRecordKey, getTextRecordKeyFromDetailKey } from './identity.js';
import { createTextTranslationRail, createTextRecordPill } from './pill.js';
import { getRecordViews, hasFailedSemanticAssociation, diagnosticRecordView } from './model.js';
import type { RecordView } from './model.js';
import { createRecordDetail, copyCurrentRecord } from './details.js';
import { getTextRecordDetailInsertIndex } from './list-layout.js';
import { createTextRecordStableRenderKey, createTextRecordStableRenderKeyFrom } from './render-key.js';
import type { TextRecordRenderKey } from './render-key.js';
import { applyCachedTextRecordHistory, formatSubscriberRecord, getMatchedSubscriberRecords } from './details.js';
import { createTextRecordRenderContext, createTextRecordRows, getCurrentTextRecordByKey, getSelectedTextRecordKey, isGuiTextRecordDetailAllowed, isSameTextRecord, isTextRecordHistoryVisible, isTextRecordSpoilerCensoredForContext, setSelectedTextRecordKey, shouldRenderActiveTextRecordDetail, } from './view-model.js';
import type { TextRecordItemOptions, TextRecordRenderContext, TextRecordRenderRow } from './view-model.js';
import type { GuiPolicySnapshot, GuiTextRecord, UnknownRecord } from '../types.js';
import { falsyFallback, isGuiButtonElement, isGuiHtmlElement, propertyValue, stringValue } from '../types.js';
interface DesiredTextRecordEntry {
    kind: 'row' | 'detail';
    domKey: string;
    recordKey: string;
    renderKey: TextRecordRenderKey;
    view: RecordView;
    itemOptions: TextRecordItemOptions;
    replaced?: boolean;
    created?: boolean;
}
interface ExistingTextRecordNodes {
    rows: Map<string, HTMLElement>;
    details: Map<string, HTMLElement>;
}
const pillComponents = new WeakMap<HTMLElement, ReturnType<typeof createTextRecordPill>>();
const describeTextRecordKeyProperty = Object.getOwnPropertyDescriptor;
const applyTextRecordKeyFunction = Reflect.apply;
const UNREADABLE_TEXT_RECORD_KEY_FIELD = Symbol('unreadable-text-record-key-field');
export function renderHookResults(policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): void {
    const body = refs['hook-results'];
    if (!body)
        return;
    const panel = refs['hook-installation-panel'];
    const panelVisible = getGuiEffectivePolicy(policySnapshot).hookInstallation.panelVisible;
    if (panel)
        panel.hidden = !panelVisible;
    if (!panelVisible) {
        body.innerHTML = '';
        setSummaryStatus('hook-summary', 'neutral', 'unavailable');
        renderStatusSummary();
        return;
    }
    const visibleHookResults = getVisibleHookResults(policySnapshot);
    const summary = summarizeHookResults(visibleHookResults);
    const tone = summary.failed > 0 ? 'bad' : summary.skipped > 0 ? 'warn' : 'ok';
    setSummaryStatus('hook-summary', summary.total > 0 ? tone : 'neutral', summary.total > 0
        ? `${formatNumber(summary.installed)} installed, ${formatNumber(summary.skipped)} skipped, ${formatNumber(summary.failed)} failed`
        : '0 hooks');
    renderStatusSummary();
    if (!visibleHookResults.length) {
        body.innerHTML = '<tr><td colspan="3" class="empty">No hook installation records.</td></tr>';
        return;
    }
    body.innerHTML = '';
    for (const item of visibleHookResults) {
        const row = document.createElement('tr');
        row.appendChild(createCell(item.displayName || item.name || '-'));
        row.appendChild(createStatusCell(item.status || '-'));
        row.appendChild(createCell(item.category || '-'));
        body.appendChild(row);
    }
}
export function renderTextRecordSections(policySnapshot: GuiPolicySnapshot = refreshGuiPolicySnapshot()): void {
    const context = createTextRecordRenderContext(policySnapshot);
    const body = refs['text-records'] ?? document.getElementById('text-records');
    if (!body)
        return;
    const records = getRecordViews();
    const selected = getSelectedTextRecordKey();
    if (selected && !records.some((record) => record.key === selected))
        setSelectedTextRecordKey('');
    context.policy.selectedDetailKey = getSelectedTextRecordKey();
    const selectedIndex = records.findIndex((view) => view.key === context.policy.selectedDetailKey &&
        (!view.diagnostics || isGuiTextRecordDetailAllowed(view.diagnostics, context)));
    const insertIndex = selectedIndex < 0 ? -1 : getTextRecordDetailInsertIndex(body, selectedIndex, records.length);
    const selectedView = records[selectedIndex];
    const desired: DesiredTextRecordEntry[] = [];
    records.forEach((view, index) => {
        const options = {
            recordKey: view.key,
            detailKey: view.key,
            domKey: `record:${view.key}`,
            active: index === selectedIndex,
        };
        desired.push({
            kind: 'row',
            view,
            itemOptions: options,
            recordKey: view.key,
            domKey: options.domKey,
            renderKey: createRecordViewRenderKey(view, false, options, context),
        });
        if (index === insertIndex && selectedView) {
            const detailOptions = {
                recordKey: selectedView.key,
                detailKey: selectedView.key,
                domKey: `detail:${selectedView.key}`,
            };
            desired.push({
                kind: 'detail',
                view: selectedView,
                itemOptions: detailOptions,
                recordKey: selectedView.key,
                domKey: detailOptions.domKey,
                renderKey: createRecordViewRenderKey(selectedView, true, detailOptions, context),
            });
        }
    });
    reconcileTextRecordListBody(body, desired, context);
    const summary = refs['text-record-summary'] ?? document.getElementById('text-record-summary');
    if (summary)
        summary.textContent = `${String(records.length)} entries`;
    if (!records.length)
        appendEmptyState(body, 'No records.');
    syncTextTroubleshootingLogCopyEnabled();
}
function createRecordViewRenderKey(view: RecordView, detail: boolean, options: TextRecordItemOptions, context: TextRecordRenderContext): TextRecordRenderKey {
    const diagnosticKey = view.diagnostics
        ? detail
            ? createTextRecordDetailRenderKey(view.diagnostics, options, context)
            : createTextRecordRowRenderKey(view.diagnostics, options, context)
        : null;
    if (diagnosticKey && !diagnosticKey.complete)
        return diagnosticKey;
    return createTextRecordStableRenderKey({
        key: view.key,
        revision: view.revision,
        attempt: view.attempt,
        source: view.sourceText,
        request: view.request,
        translator: view.translator,
        state: view.state,
        outcome: formatRecordOutcome(view),
        associationFailed: hasFailedSemanticAssociation(view),
        translation: view.translation,
        active: options.active === true,
        diagnostic: diagnosticKey?.key ?? null,
        ...(detail ? { reason: view.reason, failure: view.failure } : {}),
    });
}
export function syncTextTroubleshootingLogCopyEnabled(): void {
    const button = refs['text-log-copy'];
    if (!isGuiButtonElement(button))
        return;
    const connected = state.diagnosticsFeedRevision !== null;
    button.disabled = !connected;
    button.title = connected ? 'Copy the retained chronological text log' : 'Text diagnostics are unavailable';
}
export function reconcileTextRecordListBody(body: HTMLElement, desiredEntries: DesiredTextRecordEntry[], renderContext: TextRecordRenderContext): void {
    const desired = desiredEntries;
    const desiredDomKeys = new Set<string>(desired.map((entry) => entry.domKey).filter(Boolean));
    const existing = indexExistingTextRecordNodes(body);
    let previous: HTMLElement | null = null;
    removeTextRecordListUnmanagedChildren(body);
    desired.forEach((entry) => {
        const node = getReconciledTextRecordNode(entry, existing, renderContext);
        if (!node)
            return;
        const isInDesiredPosition = previous ? previous.nextElementSibling === node : body.firstElementChild === node;
        if (!isInDesiredPosition) {
            insertTextRecordNodeAfter(body, node, previous);
        }
        previous = node;
    });
    Array.from(body.children).forEach((child) => {
        if (!isTextRecordManagedNode(child))
            return;
        const domKey = getTextRecordNodeDomKey(child);
        if (desiredDomKeys.has(domKey))
            return;
        removeTextRecordNode(child);
    });
}
export function getReconciledTextRecordNode(entry: DesiredTextRecordEntry, existing: ExistingTextRecordNodes, renderContext: TextRecordRenderContext): HTMLElement | null {
    if (!entry.domKey)
        return null;
    const nodeMap = entry.kind === 'detail' ? existing.details : existing.rows;
    const reusable = nodeMap.get(entry.domKey);
    if (entry.renderKey.complete &&
        reusable?.dataset['renderKeyComplete'] === 'true' &&
        reusable.dataset['renderKey'] === entry.renderKey.key) {
        applyTextRecordNodeDataset(reusable, entry);
        if (entry.kind === 'detail')
            syncTextRecordDetailVolatileFields(reusable, entry.view.diagnostics, renderContext);
        return reusable;
    }
    const diagnostic = entry.view.diagnostics;
    const allowed = !diagnostic || isGuiTextRecordDetailAllowed(diagnostic, renderContext);
    const options = {
        ...entry.itemOptions,
        censored: diagnostic ? isTextRecordSpoilerCensoredForContext(diagnostic, renderContext) : false,
        ...(allowed
            ? {
                onToggle: () => {
                    handleTextRecordDetailToggle(entry.recordKey);
                },
                onCopy: (target: HTMLElement) => {
                    copyCurrentRecord(entry.recordKey, target);
                },
            }
            : {}),
    };
    const component = reusable && entry.kind === 'row' ? pillComponents.get(reusable) : undefined;
    if (component) {
        component.update(entry.view, options);
        applyTextRecordNodeDataset(component.element, entry);
        return component.element;
    }
    if (reusable) {
        entry.replaced = true;
        removeTextRecordNode(reusable);
    }
    else {
        entry.created = true;
    }
    let node: HTMLElement;
    if (entry.kind === 'detail')
        node = createRecordDetail(entry.view, renderContext);
    else {
        const pill = createTextRecordPill(entry.view, options);
        node = pill.element;
        pillComponents.set(node, pill);
    }
    applyTextRecordNodeDataset(node, entry);
    return node;
}
function handleTextRecordDetailToggle(recordKey: string): void {
    const policySnapshot = refreshGuiPolicySnapshot();
    if (!recordKey || !getGuiTextRecordPolicy(policySnapshot).detailsEnabled)
        return;
    const opening = getSelectedTextRecordKey() !== recordKey;
    if (opening) {
        const item = getCurrentTextRecordByKey(recordKey);
        if (item)
            applyCachedTextRecordHistory(item);
    }
    setSelectedTextRecordKey(opening ? recordKey : '');
    renderTextRecordSections(refreshGuiPolicySnapshot());
}
export function indexExistingTextRecordNodes(body: HTMLElement): ExistingTextRecordNodes {
    const rows = new Map<string, HTMLElement>();
    const details = new Map<string, HTMLElement>();
    Array.from(body.children).forEach((child) => {
        if (isTextRecordRowNode(child))
            rows.set(getTextRecordNodeDomKey(child), child);
        if (isTextRecordDetailNode(child))
            details.set(getTextRecordNodeDomKey(child), child);
    });
    return { rows, details };
}
export function applyTextRecordNodeDataset(node: HTMLElement, entry: DesiredTextRecordEntry): void {
    node.dataset['domKey'] = entry.domKey || '';
    node.dataset['recordKey'] = entry.recordKey || '';
    node.dataset['renderKey'] = entry.renderKey.key;
    node.dataset['renderKeyComplete'] = String(entry.renderKey.complete);
    if (entry.itemOptions.detailKey)
        node.dataset['detailKey'] = entry.itemOptions.detailKey;
}
export function insertTextRecordNodeAfter(body: HTMLElement, node: HTMLElement, previous: HTMLElement | null): void {
    const children = Array.from(body.children);
    const previousIndex = previous?.parentNode === body ? children.indexOf(previous) : -1;
    const reference = previousIndex >= 0 ? (children[previousIndex + 1] ?? null) : (children[0] ?? null);
    if (reference === node)
        return;
    body.insertBefore(node, reference);
}
export function removeTextRecordListUnmanagedChildren(body: HTMLElement): void {
    Array.from(body.children).forEach((child) => {
        if (!isTextRecordManagedNode(child))
            removeTextRecordNode(child);
    });
}
export function removeTextRecordNode(node: Node): void {
    const parent = node.parentNode;
    if (!parent)
        return;
    const removeChild = propertyValue(parent, 'removeChild');
    if (typeof removeChild === 'function') {
        Reflect.apply(removeChild, parent, [node]);
        return;
    }
    const children = propertyValue(parent, 'children');
    if (Array.isArray(children)) {
        Reflect.set(parent, 'children', children.filter((child) => child !== node));
        Reflect.set(node, 'parentNode', null);
    }
}
export function getTextRecordListBodies(): HTMLElement[] {
    return ['text-records'].map((id) => refs[id]).filter((body): body is HTMLElement => body !== undefined);
}
export function isTextRecordManagedNode(node: unknown): node is HTMLElement {
    return isTextRecordRowNode(node) || isTextRecordDetailNode(node);
}
export function isTextRecordRowNode(node: unknown): node is HTMLElement {
    return isGuiHtmlElement(node) && node.classList.contains('text-record');
}
export function isTextRecordDetailNode(node: unknown): node is HTMLElement {
    return isGuiHtmlElement(node) && node.classList.contains('text-detail-row');
}
export function getTextRecordNodeDomKey(node: HTMLElement): string {
    return falsyFallback(node.dataset['domKey'], falsyFallback(node.dataset['detailKey'], ''));
}
export function createTextRecordRowRenderKey(item: GuiTextRecord, options: TextRecordItemOptions = {}, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): TextRecordRenderKey {
    const sourceAdmission = admitTextRecordRenderKeyInputs(item, false);
    if (sourceAdmission)
        return sourceAdmission;
    const railInfo = getTextRecordTranslationRailInfo(item);
    const censored = isTextRecordSpoilerCensoredForContext(item, renderContext);
    const detailEnabled = isGuiTextRecordDetailAllowed(item, renderContext);
    return createTextRecordStableRenderKey({
        recordKey: falsyFallback(options.recordKey, getTextRecordKey(item)),
        translationState: item.translationState,
        associationFailed: hasFailedSemanticAssociation(diagnosticRecordView(item)),
        semanticFamily: getSemanticFamily(item),
        policyReason: item.policyReason ?? null,
        statusClass: normalizeStatusClass(item.status),
        hookClass: normalizeHookClass(falsyFallback(item.hookKey, item.hook)),
        translationClass: falsyFallback(railInfo.state, 'neutral'),
        inactive: options.inactive === true,
        active: options.active === true,
        censored,
        detailEnabled,
        source: falsyFallback(item.rawText, falsyFallback(item.original, falsyFallback(item.visibleText, ''))),
        translation: falsyFallback(item.translation, ''),
        rail: {
            state: falsyFallback(railInfo.state, 'neutral'),
            label: railInfo.label,
            title: falsyFallback(railInfo.title, ''),
        },
    });
}
export function createTextRecordDetailRenderKey(item: GuiTextRecord, options: TextRecordItemOptions = {}, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): TextRecordRenderKey {
    const sourceAdmission = admitTextRecordRenderKeyInputs(item);
    if (sourceAdmission)
        return sourceAdmission;
    return createTextRecordStableRenderKey({
        recordKey: falsyFallback(options.recordKey, getTextRecordKey(item)),
        translationState: item.translationState,
        statusClass: normalizeStatusClass(item.status),
        hookClass: normalizeHookClass(falsyFallback(item.hookKey, item.hook)),
        inactive: options.inactive === true,
        header: createTextRecordDetailHeaderKeySource(item, options),
        meta: createTextRecordDetailMetaKeySource(item),
        translationDiagnostics: createTextRecordTranslationDiagnosticsKeySource(item, renderContext),
        policyDiagnostics: createTextRecordPolicyDiagnosticsKeySource(item),
        history: isTextRecordHistoryVisible(renderContext) ? createTextRecordHistoryKeySource(item) : [],
        historyRetention: isTextRecordHistoryVisible(renderContext) ? (item.historyRetention ?? null) : null,
    });
}
export function createTextRecordDetailHeaderKeySource(item: GuiTextRecord, options: TextRecordItemOptions = {}): UnknownRecord {
    const labels: string[] = [];
    const lifecycleLabel = falsyFallback(options.lifecycleLabel, falsyFallback(item.lifecycleState, '')).trim();
    if (lifecycleLabel && lifecycleLabel !== 'active' && !labels.includes(lifecycleLabel))
        labels.push(lifecycleLabel);
    return {
        hook: item.hook || '-',
        status: item.status || 'detected',
        labels,
    };
}
export function createTextRecordDetailMetaKeySource(item: GuiTextRecord): UnknownRecord {
    const source = item;
    return {
        firstSeenAt: falsyFallback(source.firstSeenAt, ''),
        screen: falsyFallback(source.screenState, !source.onScreen ? 'offscreen' : 'visible'),
        disappearedAt: falsyFallback(source.disappearedAt, ''),
        deactivatedAt: falsyFallback(source.deactivatedAt, ''),
        lifecycle: falsyFallback(source.lifecycleState, ''),
        priority: propertyValue(source, 'priority') ?? null,
        policy: propertyValue(source, 'policy') ?? null,
        hook: falsyFallback(source.hookKey, falsyFallback(source.hook, '')),
        surface: falsyFallback(source.surfaceType, falsyFallback(source.windowType, falsyFallback(source.ownerType, ''))),
        method: falsyFallback(source.methodName, ''),
        drawRun: propertyValue(source, 'drawRun') ?? null,
        rawText: source.rawText && source.rawText !== source.original ? source.rawText : '',
        convertedText: source.convertedText && source.convertedText !== source.original ? source.convertedText : '',
        translationSource: falsyFallback(source.translationSource, falsyFallback(source.normalizedSource, '')),
        translationReceived: falsyFallback(source.translationReceived, ''),
        translationDrawn: falsyFallback(source.translationDrawn, ''),
        position: {
            x: propertyValue(source, 'x') ?? null,
            y: propertyValue(source, 'y') ?? null,
        },
        bounds: propertyValue(source, 'bounds') ?? null,
        metadata: propertyValue(source, 'metadata') ?? null,
    };
}
export function createTextRecordPolicyDiagnosticsKeySource(item: GuiTextRecord): UnknownRecord | null {
    const policy = getTextRecordRuntimePolicy(item);
    if (!Object.keys(policy).length)
        return null;
    return policy;
}
export function createTextRecordTranslationDiagnosticsKeySource(item: GuiTextRecord, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): UnknownRecord | null {
    const jobs = getMatchedTranslationDiagnosticsJobs(item);
    if (!jobs.length)
        return null;
    const primary = jobs[0];
    if (!primary)
        return null;
    return {
        primary: createTextRecordTranslationDiagnosticsJobKeySource(primary),
        subscribers: getMatchedSubscriberRecords(primary, item).map((subscriber) => formatSubscriberRecord(subscriber)),
        related: jobs
            .slice(1, 4)
            .map((job) => `${falsyFallback(job.id, '-')} | ${falsyFallback(job.status, job.displayMode)} | ${formatPriority(job)} | ${falsyFallback(job.textPreview, '-')}`),
        history: isTextRecordHistoryVisible(renderContext) ? primary.history : [],
    };
}
export function createTextRecordTranslationDiagnosticsJobKeySource(job: GuiTranslationDiagnosticsDisplayJob): UnknownRecord {
    const source = job;
    return {
        id: falsyFallback(source.id, ''),
        status: falsyFallback(source.status, source.displayMode),
        hook: falsyFallback(source.hook, ''),
        priority: formatPriority(source),
        stream: {
            enabled: source.stream,
            deltaCount: falsyFallback(source.deltaCount, 0),
            lastDeltaAt: falsyFallback(source.lastDeltaAt, ''),
        },
        subscribers: `${formatNumber(falsyFallback(source.subscribers, 0))}/${formatNumber(falsyFallback(source.totalSubscribers, 0))}`,
        queuedAt: falsyFallback(source.queuedAt, ''),
        startedAt: falsyFallback(source.startedAt, ''),
        terminalAt: falsyFallback(source.terminalAt, ''),
        queuePosition: falsyFallback(source.queuePosition, ''),
        lastError: falsyFallback(source.lastError, ''),
        terminalReason: falsyFallback(source.terminalReason, ''),
    };
}
export function createTextRecordHistoryKeySource(item: GuiTextRecord): readonly unknown[] {
    return item.history;
}
function admitTextRecordRenderKeyInputs(item: GuiTextRecord, includeHistory = true): TextRecordRenderKey | null {
    const admission = createTextRecordStableRenderKeyFrom(() => ({
        ...(includeHistory
            ? {
                history: readTextRecordKeyDataProperty(item, 'history'),
                historyRetention: readTextRecordKeyDataProperty(item, 'historyRetention'),
            }
            : {}),
        metadata: readTextRecordKeyDataProperty(item, 'metadata'),
        policy: readTextRecordKeyDataProperty(item, 'policy'),
    }));
    return admission.complete ? null : admission;
}
function readTextRecordKeyDataProperty(item: GuiTextRecord, key: PropertyKey): unknown {
    const descriptor: PropertyDescriptor | undefined = applyTextRecordKeyFunction(describeTextRecordKeyProperty, Object, [item, key]);
    if (!descriptor)
        return null;
    if (!('value' in descriptor))
        return UNREADABLE_TEXT_RECORD_KEY_FIELD;
    return descriptor.value ?? null;
}
export function findActiveTextRecordIndex(rows: readonly TextRecordRenderRow[], renderContext: TextRecordRenderContext = createTextRecordRenderContext()): number {
    return rows.findIndex((row) => isGuiTextRecordDetailAllowed(row.item, renderContext) &&
        shouldRenderActiveTextRecordDetail(row.recordKey, renderContext));
}
import { getForesightTextRecords } from './identity.js';
export { getForesightTextRecords } from './identity.js';
export { createTextRecordRenderContext, createTextRecordRows, getCurrentForesightGameMessageRecord, getCurrentTextRecordByKey, getPrioritizedTextRecords, isGuiTextRecordSpoilerCensored, } from './view-model.js';
export function createForesightTranslationPill(item: GuiTextRecord | null): HTMLButtonElement | null {
    if (!item)
        return null;
    const renderContext = createTextRecordRenderContext(getGuiPolicySnapshot());
    return createForesightTranslationPillForContext(item, renderContext);
}
export function createForesightTranslationPillForContext(item: GuiTextRecord | null, renderContext: TextRecordRenderContext): HTMLButtonElement | null {
    if (!item)
        return null;
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
    if (item.id)
        button.dataset['recordId'] = item.id;
    button.title = censored
        ? 'Foresight spoiler hidden'
        : detailEnabled
            ? 'Show text record details'
            : 'Detail view disabled in settings.jsonc';
    if (censored) {
        button.disabled = true;
        button.setAttribute('aria-label', 'Foresight spoiler hidden');
    }
    else if (detailEnabled) {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const detailKey = findTextRecordDetailKeyForRecord(item);
            if (!detailKey)
                return;
            applyCachedTextRecordHistory(item);
            setSelectedTextRecordKey(getTextRecordKeyFromDetailKey(detailKey));
            renderTextRecordSections(refreshGuiPolicySnapshot());
            scrollTextRecordDetailIntoView(detailKey);
        });
    }
    else {
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('aria-label', 'Detail view disabled');
    }
    const content = document.createElement('span');
    content.className = 'foresight-text-pill-content';
    if (censored)
        content.setAttribute('aria-hidden', 'true');
    content.appendChild(createLine(item.rawText || item.original || item.visibleText || '', 'source'));
    content.appendChild(createLine(item.translation ?? (item.translationReceived || ''), 'translation'));
    button.appendChild(content);
    button.appendChild(createTextTranslationRail(railInfo));
    return button;
}
export function findTextRecordDetailKeyForRecord(record: GuiTextRecord | null): string {
    if (!record)
        return '';
    const rows = createTextRecordRows(getForesightTextRecords(), { bodyId: 'text-records' });
    const match = rows.find((row) => row.item === record) ?? rows.find((row) => isSameTextRecord(row.item, record));
    if (match)
        return match.detailKey;
    return '';
}
export function syncTextRecordVolatileDom(renderContext: TextRecordRenderContext = createTextRecordRenderContext()): void {
    getTextRecordListBodies().forEach((body) => {
        Array.from(body.children).forEach((child) => {
            if (!isTextRecordDetailNode(child))
                return;
            syncTextRecordDetailVolatileFields(child, getCurrentTextRecordByKey(child.dataset['recordKey']), renderContext);
        });
    });
}
export function syncTextRecordDetailVolatileFields(detailNode: HTMLElement, item: GuiTextRecord | null, renderContext?: TextRecordRenderContext): void {
    void renderContext;
    if (!item)
        return;
    setTextRecordMetaValue(detailNode, 'First seen', item.firstSeenAt ? formatTime(item.firstSeenAt) : '-');
    setTextRecordMetaValue(detailNode, 'Seen', item.seenAt ? formatTime(item.seenAt) : '-');
    setTextRecordMetaValue(detailNode, 'Updated', item.updatedAt ? formatTime(item.updatedAt) : '-');
    const primary = getMatchedTranslationDiagnosticsJobs(item)[0];
    if (!primary)
        return;
    setTextRecordMetaValue(detailNode, 'Stream', formatStreamState(primary));
    setTextRecordMetaValue(detailNode, 'Queued', primary.queuedAt ? `${formatTime(primary.queuedAt)} (${formatElapsedSince(primary.queuedAt)} ago)` : '-');
    setTextRecordMetaValue(detailNode, 'Started', primary.startedAt ? `${formatTime(primary.startedAt)} (${formatElapsedSince(primary.startedAt)} ago)` : '-');
    if (primary.terminalAt) {
        setTextRecordMetaValue(detailNode, 'Finished', `${formatTime(primary.terminalAt)} (${formatElapsedSince(primary.terminalAt)} ago)`);
    }
}
export function setTextRecordMetaValue(root: HTMLElement, label: string, value: unknown): void {
    const item = findTextRecordMetaItem(root, label);
    if (!item)
        return;
    const valueNode = Array.from(item.children).find((child) => child.tagName.toUpperCase() === 'STRONG') ??
        Array.from(item.children).slice(-1)[0];
    if (valueNode)
        valueNode.textContent = value === undefined || value === null || value === '' ? '-' : stringValue(value);
}
export function findTextRecordMetaItem(root: HTMLElement, label: string): HTMLElement | null {
    const wanted = label;
    const stack = Array.from(root.children).filter(isGuiHtmlElement);
    while (stack.length) {
        const current = stack.shift();
        if (!current)
            continue;
        if (current.dataset['metaLabel'] === wanted)
            return current;
        if (current.children.length) {
            stack.unshift(...Array.from(current.children).filter(isGuiHtmlElement));
        }
    }
    return null;
}
export function scrollTextRecordDetailIntoView(detailKey: string): void {
    const target = findElementByDataAttribute('detailKey', detailKey);
    if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}
export function findElementByDataAttribute(key: string, value: string): HTMLElement | null {
    if (!key || !value)
        return null;
    const selector = `[data-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}]`;
    return (Array.from(document.querySelectorAll(selector)).find((element): element is HTMLElement => isGuiHtmlElement(element) && element.dataset[key] === value) ?? null);
}
