import { state } from '../state.js';
import type { GuiTextRecord } from '../types.js';
import { falsyFallback, stringValue } from '../types.js';
export function getTextRecordKey(item: GuiTextRecord | null | undefined): string {
    if (!item)
        return '';
    if (item.id)
        return item.id;
    return [
        item.hookKey || item.hook || '',
        item.original || '',
        item.translationSource || item.normalizedSource || '',
    ].join('|');
}
export function getTextRecordOccurrenceKey(sectionId: string, item: GuiTextRecord, duplicateIndex: number): string {
    if (item.id)
        return item.id;
    return `fallback:${JSON.stringify([sectionId || 'text-records', duplicateIndex, getTextRecordKey(item)])}`;
}
export function getTextRecordKeyFromDetailKey(value: unknown): string {
    const detailKey = stringValue(falsyFallback(value, ''));
    if (!detailKey)
        return '';
    if (detailKey.startsWith('row:')) {
        try {
            const decoded: unknown = JSON.parse(detailKey.slice(4));
            return Array.isArray(decoded) && typeof decoded[1] === 'string' ? decoded[1] : '';
        }
        catch {
            return '';
        }
    }
    return detailKey;
}
export function getTextRecordDomKey(sectionId: string, recordKey: string, duplicateIndex: number): string {
    return `row:${JSON.stringify([sectionId || 'text-records', recordKey || '', duplicateIndex || 0])}`;
}
export function getTextRecordDetailKey(sectionId: string, recordKey: string, duplicateIndex: number): string {
    return getTextRecordDomKey(sectionId, recordKey, duplicateIndex);
}
export function getTextRecordDetailDomKey(recordKey: string): string {
    return ['text-detail', recordKey || ''].join('|');
}
export function getForesightTextRecords(): GuiTextRecord[] {
    return state.diagnosticRecords;
}
