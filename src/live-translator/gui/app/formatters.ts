import { falsyFallback, isGuiArray, isUnknownRecord, stringValue } from './types.js';
import type { UnknownRecord } from './types.js';
import type { RecordView } from './text-records/model.js';
import { hasFailedPresentation } from './text-records/model.js';
export function formatRecordOutcome(record: RecordView): string {
    if (hasFailedPresentation(record))
        return record.state === 'available' ? 'Translation accepted — redraw failed' : 'Redraw failed';
    switch (record.state) {
        case 'available':
            return record.translation !== null && record.translation === record.sourceText
                ? 'Translation accepted — unchanged output'
                : 'Translation accepted';
        case 'no-translation':
            return record.reason ? `Skipped by policy: ${record.reason}` : 'Skipped by policy';
        case 'failed':
            return 'Translation failed';
        case 'observed':
            return 'Observed';
        case 'translating':
            return 'Pending translation';
        default:
            return 'Translation state unknown';
    }
}
export function formatRecordEvent(type: string, message: string, fields: unknown) {
    const entries: UnknownRecord[] = isGuiArray(fields) ? fields.filter(isUnknownRecord) : [];
    if (type === 'semantic.context') {
        const stage = entries.find((field) => field['name'] === 'stage');
        const status = entries.find((field) => field['name'] === 'status');
        const reason = entries.find((field) => field['name'] === 'reason');
        const knownStage = typeof stage?.['value'] === 'string' &&
            ['observation', 'clue', 'association', 'layout', 'presentation'].includes(stage['value']);
        const knownStatus = typeof status?.['value'] === 'string' && status['value'].length > 0;
        const knownReason = typeof reason?.['value'] === 'string' && reason['value'].length > 0;
        const reasonText = knownReason ? String(reason['value']) : '';
        return {
            label: `Context ${knownStage ? String(stage['value']) : 'decision'}${knownStatus ? `: ${String(status['value'])}` : ''}`,
            message: [reasonText, message !== type && message !== reasonText ? message : '']
                .filter(Boolean)
                .join(' | '),
            fields: entries.filter((field) => !(knownStage && field === stage) &&
                !(knownStatus && field === status) &&
                !(knownReason && field === reason)),
        };
    }
    let label: string;
    switch (type) {
        case 'record.observed':
            label = 'Record observed';
            break;
        case 'record.changed':
            label = 'Record changed';
            break;
        case 'translation.requested':
            label = 'Translation requested';
            break;
        case 'translation.exchange':
            label = 'Translator input / output';
            break;
        case 'translation.available':
            label = 'Translation accepted';
            break;
        case 'translation.noop':
            return {
                label: message && message !== type ? `Skipped by policy: ${message}` : 'Skipped by policy',
                message: '',
                fields: entries,
            };
        case 'translation.rejected':
            label = 'Translation failed';
            break;
        case 'translation.superseded':
            label = 'Translation superseded';
            break;
        case 'presentation.drawn':
            label = 'Presentation drawn';
            break;
        case 'presentation.rejected':
            label = 'Presentation failed';
            break;
        case 'presentation.invalidated':
            label = 'Presentation invalidated';
            break;
        case 'record.released':
            label = 'Record released';
            break;
        case 'lifecycle.ignored':
            label = 'Lifecycle decision ignored';
            break;
        case 'failure':
            label = 'Record failure';
            break;
        case 'runtime.event':
            label = 'Runtime event';
            break;
        default:
            label = type || 'Record event';
    }
    return { label, message: message === type ? '' : message, fields: entries };
}
export type GuiTextStatusClass = 'completed' | 'translating' | 'pending' | 'detected' | 'failed' | 'skipped' | 'stale' | 'removed' | 'disappeared';
export function formatDetails(details: unknown): string {
    if (!isUnknownRecord(details))
        return '';
    return Object.keys(details)
        .filter((key) => details[key] !== undefined && details[key] !== null && details[key] !== '')
        .map((key) => `${key}=${formatDetailValue(details[key])}`)
        .join(', ');
}
export function formatDetailValue(value: unknown): string {
    if (value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value)) {
        return stringValue(value);
    }
    try {
        const serialized: unknown = JSON.stringify(value);
        return typeof serialized === 'string' ? serialized : stringValue(value);
    }
    catch {
        return stringValue(value);
    }
}
export function formatDrawRun(drawRun: unknown): string {
    if (!isUnknownRecord(drawRun))
        return '-';
    const parts: string[] = [];
    if (drawRun['type'])
        parts.push(stringValue(drawRun['type']));
    if (drawRun['confidence'])
        parts.push(`confidence=${stringValue(drawRun['confidence'])}`);
    if (drawRun['reason'])
        parts.push(`reason=${stringValue(drawRun['reason'])}`);
    if (Number.isFinite(Number(drawRun['unitCount'])))
        parts.push(`units=${String(Number(drawRun['unitCount']))}`);
    return parts.length ? parts.join(', ') : '-';
}
export function formatPolicySection(policy: unknown): string {
    if (!isUnknownRecord(policy))
        return '-';
    const pairs = Object.keys(policy)
        .filter((key) => key !== 'updatedAt' && policy[key] !== undefined && policy[key] !== null && policy[key] !== '')
        .map((key) => `${key}=${formatDetailValue(policy[key])}`);
    return pairs.length ? pairs.join(', ') : '-';
}
export function formatBounds(bounds: unknown): string {
    if (!isUnknownRecord(bounds))
        return '-';
    const x1 = formatCoordinate(bounds['x1']);
    const y1 = formatCoordinate(bounds['y1']);
    const x2 = formatCoordinate(bounds['x2']);
    const y2 = formatCoordinate(bounds['y2']);
    if ([x1, y1, x2, y2].some((value) => value === '-'))
        return '-';
    return `${x1}, ${y1} - ${x2}, ${y2}`;
}
export function normalizeStatusClass(status: unknown): GuiTextStatusClass {
    const value = stringValue(falsyFallback(status, 'detected')).toLowerCase();
    if (value === 'completed')
        return 'completed';
    if (value === 'translating' || value === 'pending' || value === 'detected')
        return value;
    if (value === 'failed' || value === 'error')
        return 'failed';
    if (value === 'noop')
        return 'skipped';
    if (value === 'skipped' || value === 'stale' || value === 'removed' || value === 'disappeared')
        return value;
    return 'detected';
}
export function normalizeTranslationDiagnosticsStatusClass(status: unknown): GuiTextStatusClass | 'running' | 'queued' | 'canceled' {
    const value = stringValue(falsyFallback(status, 'queued')).toLowerCase();
    if (value === 'running' || value === 'queued' || value === 'completed' || value === 'canceled')
        return value;
    if (value === 'failed' || value === 'error')
        return 'failed';
    if (value === 'skipped')
        return 'skipped';
    return normalizeStatusClass(value);
}
export function normalizeHookClass(hook: unknown): 'bitmap' | 'sprite' | 'choice' | 'message' | 'pixi' | 'window' | 'unknown' {
    const value = stringValue(falsyFallback(hook, '')).toLowerCase();
    if (value.includes('bitmap'))
        return 'bitmap';
    if (value.includes('sprite'))
        return 'sprite';
    if (value.includes('choice'))
        return 'choice';
    if (value.includes('message'))
        return 'message';
    if (value.includes('pixi'))
        return 'pixi';
    if (value.includes('draw') || value.includes('window'))
        return 'window';
    return 'unknown';
}
export function normalizeCoordinate(value: unknown): number | null {
    if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === ''))
        return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}
export function formatCoordinate(value: unknown): string {
    const numeric = normalizeCoordinate(value);
    return numeric === null ? '-' : String(Math.round(numeric));
}
export function toneForHookStatus(status: unknown): 'ok' | 'warn' | 'bad' | 'neutral' {
    if (status === 'installed')
        return 'ok';
    if (status === 'skipped')
        return 'warn';
    if (status === 'failed')
        return 'bad';
    return 'neutral';
}
