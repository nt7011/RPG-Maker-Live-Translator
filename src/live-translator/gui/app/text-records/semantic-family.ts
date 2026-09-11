import { isUnknownRecord, type GuiTextRecord } from '../types.js';
type SemanticFamily = 'game-message' | 'window';
export function getSemanticFamily(record: GuiTextRecord | null | undefined): SemanticFamily | null {
    const fields: unknown = record?.metadata['semanticContext'];
    if (!Array.isArray(fields))
        return null;
    const entries: readonly unknown[] = fields;
    if (!entries.some((field) => isUnknownRecord(field) && field['name'] === 'status' && field['value'] === 'accepted'))
        return null;
    const family = entries.find((field) => isUnknownRecord(field) && field['name'] === 'family');
    const value = isUnknownRecord(family) ? family['value'] : null;
    return value === 'game-message' || value === 'window' ? value : null;
}
export function getSemanticFamilyClass(record: GuiTextRecord | null | undefined): string {
    const family = getSemanticFamily(record);
    return family === 'game-message' ? 'message' : (family ?? 'unknown');
}
