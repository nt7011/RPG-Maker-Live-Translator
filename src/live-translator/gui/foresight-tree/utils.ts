export interface ControlFlowTarget {
    kind: string;
    sourceIndex: number | null;
    targetIndex: number;
    targetCode: number | null;
    targetLabel: string;
    targetName: string;
    labelName: string;
    direction: string;
    viaIndex: number | null;
    viaCode: number | null;
    viaLabel: string;
}
type PropertyBag = Record<PropertyKey, unknown>;
function isPropertyBag(value: unknown): value is PropertyBag {
    return typeof value === 'object' && value !== null;
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function truthyOr(value: unknown, fallback: unknown): unknown {
    if (value)
        return value;
    return fallback;
}
export function stringValue(value: unknown): string {
    try {
        const converted: unknown = Reflect.apply(String, undefined, [value]);
        return typeof converted === 'string' ? converted : '';
    }
    catch {
        return '';
    }
}
export function normalizeComparableText(value: unknown): string {
    return stringValue(truthyOr(value, '')).replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').trim();
}
export function normalizeClass(value: unknown): string {
    const text = stringValue(truthyOr(value, '')).trim().toLowerCase();
    return text || 'unknown';
}
export function normalizeAction(value: unknown): string {
    return stringValue(truthyOr(value, '')).trim().toLowerCase() || 'command';
}
export function normalizeControlFlowTarget(target: unknown): ControlFlowTarget | null {
    if (!isPropertyBag(target))
        return null;
    const targetIndex = finiteNumber(target['targetIndex']);
    if (targetIndex === null)
        return null;
    const targetCode = target['targetCode'];
    const viaCode = target['viaCode'];
    return {
        kind: nonEmptyString(target['kind']),
        sourceIndex: finiteNumber(target['sourceIndex']),
        targetIndex,
        targetCode: targetCode === null || targetCode === undefined ? null : finiteNumber(targetCode),
        targetLabel: nonEmptyString(target['targetLabel']),
        targetName: nonEmptyString(target['targetName']),
        labelName: nonEmptyString(target['labelName']),
        direction: nonEmptyString(target['direction']),
        viaIndex: finiteNumber(target['viaIndex']),
        viaCode: viaCode === null || viaCode === undefined ? null : finiteNumber(viaCode),
        viaLabel: nonEmptyString(target['viaLabel']),
    };
}
export function formatControlFlowKind(kind: unknown): string {
    const value = stringValue(truthyOr(kind, '')).trim().toLowerCase();
    if (value === 'jump-label')
        return 'jump';
    if (value === 'break-loop')
        return 'break';
    if (value === 'repeat-loop')
        return 'repeat';
    if (value === 'loop-repeat')
        return 'loop';
    return value || 'flow';
}
export function formatControlFlowTarget(target: unknown): string {
    const index = finiteNumber(propertyValue(target, 'targetIndex'));
    const rawCode = propertyValue(target, 'targetCode');
    const code = rawCode === null ? null : finiteNumber(rawCode);
    const label = nonEmptyString(propertyValue(target, 'targetName')) ||
        nonEmptyString(propertyValue(target, 'targetLabel')) ||
        (code === null ? 'End' : 'Target');
    return `to #${index === null ? '?' : String(index)} ${label}`;
}
export function cssToken(value: unknown): string {
    return (stringValue(truthyOr(value, 'unknown'))
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '') || 'unknown');
}
export function formatCount(value: unknown): string {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(Math.round(numeric)) : '0';
}
export function defaultFormatTime(value: unknown): string {
    const candidate: unknown = Reflect.construct(Date, [value]);
    if (!(candidate instanceof Date))
        return '-';
    return Number.isNaN(candidate.getTime()) ? '-' : candidate.toLocaleTimeString();
}
export function positiveInteger(value: unknown, fallback: number): number {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
    return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}
export function finiteNumber(value: unknown): number | null {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === ''))
        return null;
    const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
    return Number.isFinite(numeric) ? numeric : null;
}
export function nonEmptyString(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}
