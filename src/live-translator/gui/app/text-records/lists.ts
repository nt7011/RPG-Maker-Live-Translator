import { formatNumber, renderStatusSummary, setSummaryStatus } from '../core.js';
import { appendEmptyState } from '../dom/builders.js';
import { createCell, createStatusCell } from '../dom/details.js';
import { formatRecordOutcome } from '../formatters.js';
import { getGuiEffectivePolicy, getGuiPolicySnapshot, getGuiTextRecordPolicy, refreshGuiPolicySnapshot, } from '../policy.js';
import { getVisibleHookResults, summarizeHookResults } from '../runtime/records.js';
import { refs, state } from '../state.js';
import { createTextRecordPill, projectTextRecordPill } from './pill.js';
import { getRecordViews, diagnosticRecordView } from './model.js';
import type { RecordView } from './model.js';
import { createRecordDetail, copyCurrentRecord } from './details.js';
import { syncTextRecordDetailLayout } from './list-layout.js';
import { createTextRecordStableRenderKey, createTextRecordStableRenderKeyFrom } from './render-key.js';
import type { TextRecordRenderKey } from './render-key.js';
import { applyCachedTextRecordHistory } from './details.js';
import { createTextRecordRenderContext, createTextRecordRows, getCurrentTextRecordByKey, getSelectedTextRecordKey, isSameTextRecord, isTextRecordHistoryVisible, setSelectedTextRecordKey, shouldRenderActiveTextRecordDetail, } from './view-model.js';
import type { TextRecordItemOptions, TextRecordRenderContext, TextRecordRenderRow } from './view-model.js';
import type { GuiPolicySnapshot, GuiTextRecord } from '../types.js';
import { falsyFallback, isGuiButtonElement, isGuiHtmlElement, propertyValue } from '../types.js';
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
const textRecordKeyHasOwn = Object.hasOwn;
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
    const selectedIndex = records.findIndex((view) => view.key === context.policy.selectedDetailKey && (!view.diagnostics || context.policy.detailsEnabled));
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
    });
    if (selectedView) {
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
        state: view.state,
        outcome: formatRecordOutcome(view),
        presentation: detail
            ? view.presentation
            : {
                result: view.presentation.result,
                label: view.presentation.label,
                explanation: view.presentation.explanation,
                semanticControl: view.presentation.semanticControl,
                warnings: view.presentation.warnings,
            },
        translation: view.translation,
        active: options.active === true,
        diagnostic: diagnosticKey?.key ?? null,
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
    const desiredDomKeys = new Set<string>(desired
        .values()
        .map((entry) => entry.domKey)
        .filter(Boolean));
    const existing = indexExistingTextRecordNodes(body);
    let previous: HTMLElement | null = null;
    let selectedDetail: HTMLElement | null = null;
    removeTextRecordListUnmanagedChildren(body);
    desired.forEach((entry) => {
        const node = getReconciledTextRecordNode(entry, existing, renderContext);
        if (!node)
            return;
        if (entry.kind === 'detail') {
            selectedDetail = node;
            return;
        }
        let reference = previous ? previous.nextElementSibling : body.firstElementChild;
        while (isTextRecordDetailNode(reference))
            reference = reference.nextElementSibling;
        if (reference !== node)
            body.insertBefore(node, reference);
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
    syncTextRecordDetailLayout(body, selectedDetail);
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
        return reusable;
    }
    const diagnostic = entry.view.diagnostics;
    const allowed = !diagnostic || renderContext.policy.detailsEnabled;
    const options = {
        ...entry.itemOptions,
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
    for (const child of body.children) {
        if (isTextRecordRowNode(child))
            rows.set(getTextRecordNodeDomKey(child), child);
        if (isTextRecordDetailNode(child))
            details.set(getTextRecordNodeDomKey(child), child);
    }
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
    const reference = previous?.parentNode === body ? previous.nextElementSibling : body.firstElementChild;
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
    const body = refs['text-records'];
    return body === undefined ? [] : [body];
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
    const admission = admitTextRecordRenderKeyInputs(item, false);
    if (admission)
        return admission;
    return createTextRecordStableRenderKeyFrom(() => ({
        ...projectTextRecordPill(diagnosticRecordView(item)),
        active: options.active === true,
        inactive: options.inactive === true,
        detailEnabled: renderContext.policy.detailsEnabled,
    }));
}
export function createTextRecordDetailRenderKey(item: GuiTextRecord, options: TextRecordItemOptions = {}, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): TextRecordRenderKey {
    const admission = admitTextRecordRenderKeyInputs(item);
    if (admission)
        return admission;
    return createTextRecordStableRenderKeyFrom(() => ({
        row: createTextRecordRowRenderKey(item, options, renderContext),
        presentation: item.presentation ?? null,
        history: isTextRecordHistoryVisible(renderContext) ? item.history : [],
        retention: isTextRecordHistoryVisible(renderContext) ? (item.historyRetention ?? null) : null,
    }));
}
function admitTextRecordRenderKeyInputs(item: GuiTextRecord, includeHistory = true): TextRecordRenderKey | null {
    const admission = createTextRecordStableRenderKeyFrom(() => {
        const presentation = readTextRecordKeyDataProperty(item, 'presentation');
        const summaryPresentation = !includeHistory && presentation !== null && typeof presentation === 'object'
            ? {
                result: readTextRecordKeyDataProperty(presentation, 'result'),
                label: readTextRecordKeyDataProperty(presentation, 'label'),
                explanation: readTextRecordKeyDataProperty(presentation, 'explanation'),
                semanticControl: readTextRecordKeyDataProperty(presentation, 'semanticControl'),
                warnings: readTextRecordKeyDataProperty(presentation, 'warnings'),
            }
            : presentation;
        return {
            ...(includeHistory
                ? {
                    history: readTextRecordKeyDataProperty(item, 'history'),
                    historyRetention: readTextRecordKeyDataProperty(item, 'historyRetention'),
                }
                : {}),
            presentation: summaryPresentation,
            metadata: readTextRecordKeyDataProperty(item, 'metadata'),
            policy: readTextRecordKeyDataProperty(item, 'policy'),
        };
    });
    return admission.complete ? null : admission;
}
function readTextRecordKeyDataProperty(item: object, key: PropertyKey): unknown {
    const descriptor: PropertyDescriptor | undefined = applyTextRecordKeyFunction(describeTextRecordKeyProperty, Object, [item, key]);
    if (!descriptor)
        return null;
    if (!textRecordKeyHasOwn(descriptor, 'value'))
        return UNREADABLE_TEXT_RECORD_KEY_FIELD;
    return descriptor.value ?? null;
}
export function findActiveTextRecordIndex(rows: readonly TextRecordRenderRow[], renderContext: TextRecordRenderContext = createTextRecordRenderContext()): number {
    return rows.findIndex((row) => renderContext.policy.detailsEnabled && shouldRenderActiveTextRecordDetail(row.recordKey, renderContext));
}
import { getDiagnosticTextRecords } from './identity.js';
export { getDiagnosticTextRecords } from './identity.js';
export { createTextRecordRenderContext, createTextRecordRows, getCurrentTextRecordByKey, getPrioritizedTextRecords, } from './view-model.js';
export function findTextRecordDetailKeyForRecord(record: GuiTextRecord | null): string {
    if (!record)
        return '';
    const rows = createTextRecordRows(getDiagnosticTextRecords(), { bodyId: 'text-records' });
    const match = rows.find((row) => row.item === record) ?? rows.find((row) => isSameTextRecord(row.item, record));
    if (match)
        return match.detailKey;
    return '';
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
    return (Iterator.from(document.querySelectorAll(selector)).find((element): element is HTMLElement => isGuiHtmlElement(element) && element.dataset[key] === value) ?? null);
}
