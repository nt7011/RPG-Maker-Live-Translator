import { GUI_PROJECTION_LIMITS, projectGuiValueOutcome } from '../../projection.js';
import type { UnknownRecord } from '../types.js';
const limits = {
    ...GUI_PROJECTION_LIMITS,
    maxArrayEntries: 64,
    maxObjectKeys: 32,
    maxNodes: 32768,
    maxDescriptorReads: 65536,
    maxStringCodeUnits: 256,
};
function record(value: unknown): value is UnknownRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function restoreArrays(value: unknown): void {
    if (value === null || typeof value !== 'object')
        return;
    if (Array.isArray(value))
        Object.setPrototypeOf(value, Array.prototype);
    for (const child of Object.values(value))
        restoreArrays(child);
}
export function readLagIncidents(value: unknown, previous: UnknownRecord | null = null, incremental = false): UnknownRecord | null | undefined {
    if (value == null)
        return incremental ? undefined : null;
    const copy = projectGuiValueOutcome(value, limits);
    if (copy.complete)
        restoreArrays(copy.value);
    const view = copy.value;
    if (!copy.complete ||
        !record(view) ||
        view['version'] !== 1 ||
        !record(view['policy']) ||
        !Array.isArray(view['incidents']) ||
        view['incidents'].length > 6 ||
        !['waiting', 'recording', 'suspended', 'unavailable', 'disposed'].includes(String(view['status'])))
        return undefined;
    const incoming = new Map<string, UnknownRecord>();
    for (const item of view['incidents']) {
        if (!record(item) ||
            typeof item['id'] !== 'string' ||
            incoming.has(item['id']) ||
            !Number.isSafeInteger(item['number']) ||
            (item['number'] as number) < 1 ||
            !Number.isSafeInteger(item['revision']) ||
            (item['revision'] as number) < 1 ||
            !record(item['first']) ||
            !record(item['worst']) ||
            !Array.isArray(item['context']) ||
            item['context'].length > 16)
            return undefined;
        incoming.set(item['id'], item);
    }
    if (incremental) {
        if (previous === null ||
            !Array.isArray(view['removed']) ||
            view['removed'].length > 6 ||
            !view['removed'].every((id) => typeof id === 'string'))
            return undefined;
        for (const item of previous['incidents'] as UnknownRecord[]) {
            const id = item['id'] as string;
            if (!incoming.has(id) && !view['removed'].includes(id))
                incoming.set(id, item);
        }
    }
    if (incoming.size > 6)
        return undefined;
    view['incidents'] = [...incoming.values()].sort((a, b) => Number(b['startedAt']) - Number(a['startedAt']));
    delete view['removed'];
    return view;
}
