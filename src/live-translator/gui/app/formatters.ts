import { falsyFallback, isUnknownRecord, stringValue } from './types.js';
import type { RecordView } from './text-records/model.js';
export function formatRecordOutcome(record: RecordView): string {
    return record.presentation.explanation;
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
