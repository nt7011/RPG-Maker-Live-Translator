import { formatTime, formatNumber } from '../core.js';
import { createTextElement, createMetadataGrid, appendMetadataItem, createHistoryContainer, createHistoryEmpty, createHistoryRow, } from '../dom/builders.js';
import { state } from '../state.js';
import { getTextRecordKey } from './identity.js';
import { diagnosticRecordView, getRecordViews, type RecordView } from './model.js';
import { copyTextRecordValue } from '../copy/actions.js';
import { createTextRecordPill, createTextRecordDetailShell } from './pill.js';
import { controlLabel } from './presentation.js';
import { createTextRecordRenderContext, isTextRecordHistoryVisible } from './view-model.js';
import type { TextRecordItemOptions, TextRecordRenderContext } from './view-model.js';
import type { GuiTextRecord } from '../types.js';
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
    const detailEnabled = renderContext.policy.detailsEnabled;
    return createTextRecordPill(diagnosticRecordView(item, recordKey), {
        ...options,
        detailKey: falsyFallback(options.detailKey, recordKey),
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
export function recordCopyView(view: RecordView) {
    return {
        source: view.sourceText,
        translation: view.translation,
        request: view.request,
        result: view.presentation,
        history: view.diagnostics?.history ?? [],
        retention: view.diagnostics?.historyRetention ?? null,
    };
}
export function copyCurrentRecord(key: string, target: HTMLElement): void {
    copyTextRecordValue(() => {
        const view = getRecordViews().find((record) => record.key === key);
        if (!view)
            throw new Error('Record is no longer retained.');
        return recordCopyView(view);
    }, target);
}
export function createRecordDetail(view: RecordView, context: TextRecordRenderContext): HTMLElement {
    const presentation = view.presentation;
    const detail = createTextRecordDetailShell(view.key, {
        detailKey: view.key,
        statusClass: presentation.result,
        control: presentation.semanticControl ?? 'unknown',
    });
    const header = createTextElement('div', 'text-expanded-header', '');
    header.appendChild(createTextElement('span', 'text-expanded-meta', presentation.explanation));
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
    appendMetadataItem(grid, 'Semantic control', controlLabel(presentation.semanticControl));
    if (view.request) {
        appendMetadataItem(grid, 'Priority', view.request.priority);
        appendMetadataItem(grid, 'Stream', view.request.stream ? 'Yes' : 'No');
    }
    detail.appendChild(grid);
    const groups = new Map<string, HTMLElement>();
    for (const section of presentation.sections) {
        if (section.group === undefined) {
            appendMetadataItem(grid, section.title, section.text);
            continue;
        }
        let panel = groups.get(section.group);
        if (!panel) {
            panel = createTextElement('section', 'expanded-related-panel', '');
            panel.appendChild(createTextElement('h3', 'expanded-related-header', section.group));
            detail.appendChild(panel);
            groups.set(section.group, panel);
        }
        panel.appendChild(createTextElement('div', 'expanded-related-header', section.title));
        panel.appendChild(createTextElement('pre', 'record-detail-text', section.text));
    }
    if (view.diagnostics && isTextRecordHistoryVisible(context)) {
        const retention = view.diagnostics.historyRetention;
        const title = retention?.status === 'current'
            ? retention.complete
                ? 'History (complete)'
                : `History (${formatNumber(retention.retained)} retained, ${formatNumber(retention.dropped)} dropped)`
            : retention?.status === 'failed'
                ? view.diagnostics.history.length
                    ? 'History (stale)'
                    : 'History (unavailable)'
                : 'History';
        const history = createHistoryContainer(title);
        history.classList.add('record-history');
        if (!view.diagnostics.history.length)
            history.appendChild(createHistoryEmpty(retention?.status === 'failed'
                ? `History unavailable: ${retention.reason}`
                : 'No history recorded.'));
        for (const event of view.diagnostics.history) {
            history.appendChild(createHistoryRow({
                timeText: event.at === null || event.at === undefined ? '-' : formatTime(event.at),
                labelText: event.type,
                messageText: event.message,
            }));
        }
        detail.appendChild(history);
    }
    return detail;
}
