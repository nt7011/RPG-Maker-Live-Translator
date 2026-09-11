import type { UnknownRecord } from '../types.js';
import { stringValue } from '../types.js';
export function copyTimestamp(value: unknown): UnknownRecord | null {
    if (value === undefined || value === null || value === '')
        return null;
    const date = value instanceof Date
        ? value
        : new Date(typeof value === 'number' || typeof value === 'string' ? value : stringValue(value));
    if (Number.isNaN(date.getTime()))
        return null;
    return {
        epochMs: date.getTime(),
        local: date.toLocaleString(),
    };
}
