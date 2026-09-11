import { applyFoldedPanelDefault, createStatusSummaryModel, formatNumber, formatTime, syncStatusPanelDefault, } from '../core.js';
import { appendMetadataItem, createHistoryContainer, createHistoryEmpty, createHistoryRow, createStatusPill, createTextElement, } from './builders.js';
import { formatBounds, formatCoordinate, formatDetails, formatDetailValue, formatDrawRun, formatPolicySection, formatRecordEvent, toneForHookStatus, } from '../formatters.js';
import { getGuiEffectivePolicy, getGuiPolicySnapshot } from '../policy.js';
import { getTextRecordRuntimePolicy, normalizeRecordHistory } from '../runtime/records.js';
import type { GuiHistoryEvent, GuiPolicySnapshot, GuiTextRecord } from '../types.js';
import { falsyFallback, isGuiArray, isUnknownRecord, propertyValue, stringValue } from '../types.js';
export function syncFoldedPanelDefaults(policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): void {
    const effectivePolicy = getGuiEffectivePolicy(policySnapshot);
    applyFoldedPanelDefault('draw-capture-panel', 'drawCaptureTrace', true, `draw:${effectivePolicy.drawCaptureTrace.panelVisible ? 'visible' : 'hidden'}`);
    applyFoldedPanelDefault('foresight-panel', 'foresight', true, `foresight:${effectivePolicy.foresight.visible ? 'visible' : 'disabled'}`);
    applyFoldedPanelDefault('text-record-panel', 'activeText', true, 'active:default');
    syncStatusPanelDefault(createStatusSummaryModel(policySnapshot));
}
export function createLine(value: unknown, kind: string): HTMLElement {
    return createTextElement('span', `text-line ${kind}`, falsyFallback(value, '-'));
}
export function appendTextMetadata(grid: HTMLElement, item: GuiTextRecord): void {
    if (item.firstSeenAt)
        appendMeta(grid, 'First seen', formatTime(item.firstSeenAt));
    if (item.seenAt)
        appendMeta(grid, 'Seen', formatTime(item.seenAt));
    if (item.updatedAt)
        appendMeta(grid, 'Updated', formatTime(item.updatedAt));
    if (item.screenState || typeof item.onScreen === 'boolean') {
        appendMeta(grid, 'Screen', item.screenState || (!item.onScreen ? 'offscreen' : 'visible'));
    }
    if (item.disappearedAt)
        appendMeta(grid, 'Disappeared', formatTime(item.disappearedAt));
    if (item.deactivatedAt)
        appendMeta(grid, 'Deactivated', formatTime(item.deactivatedAt));
    if (item.status)
        appendMeta(grid, 'Latest record status', item.status);
    if (item.lifecycleState)
        appendMeta(grid, 'Lifecycle', item.lifecycleState);
    if (item.priority !== null && item.priority !== undefined && Number.isFinite(Number(item.priority))) {
        appendMeta(grid, 'Priority', formatNumber(item.priority));
    }
    const policy = getTextRecordRuntimePolicy(item);
    if (policy.lifecycle)
        appendMeta(grid, 'Last Lifecycle Policy', formatPolicySection(policy.lifecycle));
    if (policy.priority)
        appendMeta(grid, 'Last Priority Policy', formatPolicySection(policy.priority));
    if (policy['request'])
        appendMeta(grid, 'Last Request Policy', formatPolicySection(policy['request']));
    const hook = item.hookKey || item.hook;
    if (hook && hook !== '-')
        appendMeta(grid, 'Hook', hook);
    const surface = item.surfaceType || item.windowType || item.ownerType;
    if (surface)
        appendMeta(grid, 'Surface', surface);
    if (item.methodName)
        appendMeta(grid, 'Method', item.methodName);
    if (item.drawRun)
        appendMeta(grid, 'Draw Run', formatDrawRun(item.drawRun));
    if (item.rawText && item.rawText !== item.original)
        appendMeta(grid, 'RawDetected', item.rawText);
    if (item.convertedText && item.convertedText !== item.original)
        appendMeta(grid, 'RenderResolved', item.convertedText);
    const translationSource = item.translationSource || item.normalizedSource;
    if (translationSource)
        appendMeta(grid, 'TranslationSource', translationSource);
    if (item.translationReceived)
        appendMeta(grid, 'TranslationReceived', item.translationReceived);
    if (item.translationDrawn)
        appendMeta(grid, 'TranslationDrawn', item.translationDrawn);
    const x = formatCoordinate(item.x), y = formatCoordinate(item.y);
    if (x !== '-' || y !== '-') {
        appendMeta(grid, 'Position', `${x}, ${y}`);
    }
    if (item.bounds) {
        appendMeta(grid, 'Bounds', formatBounds(item.bounds));
    }
    const metadata = isUnknownRecord(item.metadata) ? item.metadata : {};
    Object.keys(metadata).forEach((key) => {
        if (key === 'drawRun' || key === 'revision' || key === 'attempt' || key === 'failure')
            return;
        if (key === 'semanticContext' && isGuiArray(metadata[key])) {
            if (!metadata[key].length)
                return;
            const context = formatRecordEvent('semantic.context', '', metadata[key]);
            appendMeta(grid, context.label, [
                context.message,
                ...context.fields.map((field) => `${stringValue(field['name'])}=${formatDetailValue(field['value'])}`),
            ]
                .filter(Boolean)
                .join(' | '));
            return;
        }
        appendMeta(grid, key, metadata[key]);
    });
}
export function appendMeta(container: HTMLElement, label: unknown, value: unknown): void {
    appendMetadataItem(container, label, value);
}
export function createHistoryList(item: GuiTextRecord): HTMLElement {
    const retention = item.historyRetention;
    const title = retention?.status === 'current'
        ? retention.complete
            ? 'History (complete)'
            : `History (${formatNumber(retention.retained)} retained, ${formatNumber(retention.dropped)} dropped)`
        : retention?.status === 'failed'
            ? item.history.length
                ? 'History (stale)'
                : 'History (unavailable)'
            : 'History';
    const wrap = createHistoryContainer(title);
    const history = getTextRecordHistory(item);
    if (!history.length) {
        wrap.appendChild(createHistoryEmpty(retention?.status === 'failed' ? `History unavailable: ${retention.reason}` : 'No history recorded.'));
        return wrap;
    }
    history.forEach((entry) => {
        const event = formatRecordEvent(entry.type, entry.message, entry.details['fields']);
        const detailsText = formatDetails(isGuiArray(entry.details['fields'])
            ? { ...entry.details, fields: event.fields.length ? event.fields : undefined }
            : entry.details);
        wrap.appendChild(createHistoryRow({
            timeText: entry.at ? formatTime(entry.at) : '-',
            labelText: event.label,
            messageText: event.message,
            detailsText,
        }));
    });
    return wrap;
}
export function getTextRecordHistory(item: GuiTextRecord): GuiHistoryEvent[] {
    const local = normalizeRecordHistory(propertyValue(item, 'history'));
    const seen = new Set<string>();
    return local
        .filter((entry) => {
        const key = `${stringValue(falsyFallback(entry.at, ''))}|${entry.type ? entry.type : ''}|${entry.message ? entry.message : ''}|${formatDetails(entry.details)}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
}
export function createCell(value: unknown): HTMLElement {
    return createTextElement('td', '', value);
}
export function createStatusCell(value: unknown): HTMLElement {
    const cell = document.createElement('td');
    cell.appendChild(createStatusPill(value, toneForHookStatus(value)));
    return cell;
}
