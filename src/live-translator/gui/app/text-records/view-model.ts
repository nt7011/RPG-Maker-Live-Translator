import { normalizeHookClass, normalizeStatusClass } from '../formatters.js';
import { getSemanticFamily } from './semantic-family.js';
import { getGuiPolicySnapshot, getGuiTextRecordPolicy } from '../policy.js';
import { state } from '../state.js';
import { getForesightTextRecords, getTextRecordDetailKey, getTextRecordDomKey, getTextRecordKey, getTextRecordOccurrenceKey, } from './identity.js';
import type { GuiPolicySnapshot, GuiTextRecord, UnknownRecord } from '../types.js';
import { falsyFallback, isUnknownRecord, stringValue } from '../types.js';
export interface TextRecordItemOptions {
    inactive?: boolean;
    active?: boolean;
    lifecycleLabel?: string;
    recordKey?: string;
    detailKey?: string;
    domKey?: string;
}
export interface TextRecordRowOptions {
    bodyId?: string;
    itemOptions?: TextRecordItemOptions | ((item: GuiTextRecord) => TextRecordItemOptions);
}
export interface TextRecordRenderRow {
    item: GuiTextRecord;
    itemOptions: TextRecordItemOptions;
    recordKey: string;
    domKey: string;
    detailKey: string;
}
export interface TextRecordRenderContext {
    policySnapshot: GuiPolicySnapshot;
    policy: ReturnType<typeof getGuiTextRecordPolicy>;
    records: GuiTextRecord[];
    foregroundSpoilerKeys: Set<string>;
}
interface IndexedTextRecord {
    item: GuiTextRecord;
    index: number;
}
export function createTextRecordRows(records: readonly GuiTextRecord[], options: TextRecordRowOptions = {}): TextRecordRenderRow[] {
    const duplicateCounts = new Map<string, number>();
    return records.map((item) => {
        const baseKey = getTextRecordKey(item);
        const duplicateIndex = duplicateCounts.get(baseKey) ?? 0;
        duplicateCounts.set(baseKey, duplicateIndex + 1);
        const sectionId = falsyFallback(options.bodyId, 'text-records');
        const recordKey = getTextRecordOccurrenceKey(sectionId, item, duplicateIndex);
        return {
            item,
            itemOptions: getTextRecordOptions(item, options),
            recordKey,
            domKey: getTextRecordDomKey(sectionId, recordKey, duplicateIndex),
            detailKey: getTextRecordDetailKey(sectionId, recordKey, duplicateIndex),
        };
    });
}
export function getTextRecordOptions(item: GuiTextRecord, listOptions: TextRecordRowOptions = {}): TextRecordItemOptions {
    if (typeof listOptions.itemOptions === 'function')
        return listOptions.itemOptions(item);
    return listOptions.itemOptions ?? {};
}
export function getPrioritizedTextRecords(records: readonly GuiTextRecord[], limit?: number): GuiTextRecord[] {
    const sorted = records
        .map((item, index) => ({ item, index }))
        .sort(compareTextRecordDisplayPriority)
        .map((entry) => entry.item);
    const displayLimit = Number(limit);
    return Number.isFinite(displayLimit) && displayLimit > 0 ? sorted.slice(0, displayLimit) : sorted;
}
export function compareTextRecordDisplayPriority(left: IndexedTextRecord, right: IndexedTextRecord): number {
    const skippedDifference = getSkippedPriority(left.item) - getSkippedPriority(right.item);
    if (skippedDifference)
        return skippedDifference;
    const messageDifference = getGameMessagePriority(left.item) - getGameMessagePriority(right.item);
    return messageDifference || left.index - right.index;
}
export function getSkippedPriority(item: GuiTextRecord): number {
    return normalizeStatusClass(item.status) === 'skipped' ? 1 : 0;
}
export function getGameMessagePriority(item: GuiTextRecord): number {
    return isGameMessageRecord(item) ? 0 : 1;
}
export function isGameMessageRecord(item: GuiTextRecord | null | undefined): boolean {
    const family = getSemanticFamily(item);
    if (family !== null || item?.metadata['kind'] === 'bitmap-text')
        return family === 'game-message';
    return Boolean(item && normalizeHookClass(item.hookKey || item.hook || item.methodName) === 'message');
}
export function createTextRecordRenderContext(policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot(), records: GuiTextRecord[] = getForesightTextRecords()): TextRecordRenderContext {
    const basePolicy = getGuiTextRecordPolicy(policySnapshot);
    const policy = { ...basePolicy, selectedDetailKey: getSelectedTextRecordKey() || basePolicy.selectedDetailKey };
    const foregroundSpoilerKeys = policy.showForesightSpoilers
        ? new Set<string>()
        : getForegroundGameMessageSourceKeys(records);
    return { policySnapshot, policy, records, foregroundSpoilerKeys };
}
export function isGuiTextRecordSpoilerCensored(item: GuiTextRecord, records: GuiTextRecord[] = getForesightTextRecords(), policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): boolean {
    return isTextRecordSpoilerCensoredForContext(item, createTextRecordRenderContext(policySnapshot, records));
}
export function isTextRecordSpoilerCensoredForContext(item: GuiTextRecord, renderContext: TextRecordRenderContext): boolean {
    return (!renderContext.policy.showForesightSpoilers &&
        isUnconsumedForesightMessageRecord(item) &&
        !hasForegroundGameMessageEquivalent(item, renderContext.foregroundSpoilerKeys));
}
export function isUnconsumedForesightMessageRecord(item: GuiTextRecord): boolean {
    const metadata = getTextRecordMetadata(item);
    return isGameMessageRecord(item) && metadata['foresight'] === true && metadata['foresightConsumed'] !== true;
}
export function hasForegroundGameMessageEquivalent(item: GuiTextRecord, recordsOrKeys: readonly GuiTextRecord[] | Set<string>): boolean {
    const keys = getForesightSpoilerSourceKeys(item);
    if (!keys.length)
        return false;
    const foregroundKeys = recordsOrKeys instanceof Set ? recordsOrKeys : getForegroundGameMessageSourceKeys(recordsOrKeys);
    return keys.some((key) => foregroundKeys.has(key));
}
export function getForegroundGameMessageSourceKeys(records: readonly GuiTextRecord[] = getForesightTextRecords()): Set<string> {
    const keys = new Set<string>();
    for (const record of records) {
        if (!isForegroundGameMessageRecord(record))
            continue;
        for (const key of getForesightSpoilerSourceKeys(record))
            keys.add(key);
    }
    return keys;
}
export function isForegroundGameMessageRecord(item: GuiTextRecord): boolean {
    if (!isGameMessageRecord(item))
        return false;
    const metadata = getTextRecordMetadata(item);
    return metadata['foresightConsumed'] === true || metadata['foresight'] !== true;
}
export function getTextRecordMetadata(item: GuiTextRecord | null | undefined): UnknownRecord {
    return item && isUnknownRecord(item.metadata) ? item.metadata : {};
}
export function getForesightSpoilerSourceKey(item: GuiTextRecord): string {
    return getForesightSpoilerSourceKeys(item)[0] ?? '';
}
export function getForesightSpoilerSourceKeys(item: GuiTextRecord | null | undefined): string[] {
    if (!item)
        return [];
    const seen = new Set<string>();
    return [item.normalizedSource, item.translationSource, item.original, item.visibleText, item.rawText]
        .map(normalizeForesightSpoilerText)
        .filter((key) => {
        if (!key || seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
export function normalizeForesightSpoilerText(value: unknown): string {
    return stringValue(value ?? '')
        .replace(/\s+/gu, ' ')
        .trim();
}
export function getCurrentForesightGameMessageRecord(records: readonly GuiTextRecord[] = state.diagnosticRecords): GuiTextRecord | null {
    return (getPrioritizedTextRecords(records).find((item) => isForegroundGameMessageRecord(item) && item.onScreen) ?? null);
}
export function getCurrentTextRecordByKey(recordKey: unknown): GuiTextRecord | null {
    const key = stringValue(falsyFallback(recordKey, ''));
    if (!key)
        return null;
    const rows = createTextRecordRows(getForesightTextRecords(), { bodyId: 'text-records' });
    return rows.find((row) => row.recordKey === key)?.item ?? null;
}
export function isSameTextRecord(left: GuiTextRecord | null, right: GuiTextRecord | null): boolean {
    if (!left || !right)
        return false;
    if (left === right)
        return true;
    if (left.id && right.id && left.id === right.id)
        return true;
    return getTextRecordKey(left) === getTextRecordKey(right);
}
export function getSelectedTextRecordKey(): string {
    return state.selectedTextRecordKey;
}
export function setSelectedTextRecordKey(recordKey: string): void {
    state.selectedTextRecordKey = recordKey;
}
export function shouldRenderActiveTextRecordDetail(recordKey: string, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): boolean {
    return Boolean(recordKey && renderContext.policy.selectedDetailKey === recordKey);
}
export function isGuiTextRecordDetailAllowed(item: GuiTextRecord, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): boolean {
    return renderContext.policy.detailsEnabled && !isTextRecordSpoilerCensoredForContext(item, renderContext);
}
export function isTextRecordHistoryVisible(renderContext: TextRecordRenderContext = createTextRecordRenderContext()): boolean {
    return renderContext.policy.historyVisible;
}
