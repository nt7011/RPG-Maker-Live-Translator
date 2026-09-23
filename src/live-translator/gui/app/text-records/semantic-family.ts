import type { GuiTextRecord } from '../types.js';
export function getSemanticFamily(record: GuiTextRecord | null | undefined): 'window' | 'sprite' | 'game-message' | null {
    const value = record?.presentation?.semanticControl;
    return value === 'window' || value === 'sprite' || value === 'game-message' ? value : null;
}
export function getSemanticFamilyClass(record: GuiTextRecord | null | undefined): string {
    return record?.presentation?.semanticControl ?? 'unknown';
}
