import { formatDuration, formatTime } from '../core.js';
import { createHistoryContainer, createHistoryEmpty, createHistoryRow } from '../dom/builders.js';
import { formatDetailValue } from '../formatters.js';
import type { GuiTranslationDiagnosticsEvent } from '../types.js';
export function createTranslationDiagnosticsHistory(history: readonly GuiTranslationDiagnosticsEvent[]): HTMLElement {
    const wrap = createHistoryContainer('History');
    if (!history.length) {
        wrap.appendChild(createHistoryEmpty('No scheduler history recorded.'));
        return wrap;
    }
    for (const event of history) {
        const detailsText = formatTranslationDiagnosticsEventDetails(event);
        wrap.appendChild(createHistoryRow({
            timeText: event.at ? formatTime(event.at) : '-',
            labelText: event.type || 'event',
            detailsText: detailsText && detailsText !== '-' ? detailsText : '',
        }));
    }
    return wrap;
}
export function formatTranslationDiagnosticsEventDetails(event: GuiTranslationDiagnosticsEvent): string {
    const details = event.details;
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
    return (keys
        .filter((key) => details[key] !== undefined && details[key] !== null && details[key] !== '')
        .map((key) => `${key}=${formatDetailValue(details[key])}`)
        .join(', ') || '-');
}
export function formatElapsedSince(value: unknown): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0)
        return '-';
    return formatDuration(Date.now() - numeric);
}
