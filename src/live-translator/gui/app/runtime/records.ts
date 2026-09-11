import type { GuiTextStatusClass } from '../formatters.js';
import { getGuiEffectivePolicy, getGuiPolicySnapshot } from '../policy.js';
import { state } from '../state.js';
import type { GuiDrawRun, GuiHistoryEvent, GuiHookResult, GuiHookSummary, GuiPolicyEvent, GuiPolicySnapshot, GuiTextPolicy, GuiTextRecord, GuiTextSummary, UnknownRecord, } from '../types.js';
import { assignGuiOwnDataRecord, copyGuiOwnDataRecord, createGuiOwnDataRecord, defineGuiOwnDataProperty, falsyFallback, isGuiArray, isUnknownRecord, propertyValue, stringValue, } from '../types.js';
const applyRuntimeRecordFunction = Reflect.apply;
const listRuntimeRecordKeys = Object.keys;
const runtimeRecordObjectHasOwn = Object.hasOwn;
const describeRuntimeRecordProperty = Object.getOwnPropertyDescriptor;
const sortRuntimeRecordArray = Array.prototype.sort;
const runtimeRecordNumber = Number;
const floorRuntimeRecordNumber = Math.floor;
const maximumRuntimeRecordNumber = Math.max;
const RuntimeRecordSet = Set;
const addRuntimeRecordSetValue = Set.prototype.add;
const deleteRuntimeRecordSetValue = Set.prototype.delete;
const hasRuntimeRecordSetValue = Set.prototype.has;
const trimRuntimeRecordString = String.prototype.trim;
const lowerRuntimeRecordString = String.prototype.toLowerCase;
const upperRuntimeRecordString = String.prototype.toUpperCase;
const replaceRuntimeRecordString = String.prototype.replace;
function copyRuntimeRecordArray<Value>(values: readonly Value[]): Value[] {
    const copied: Value[] = [];
    const length = values.length;
    for (let index = 0; index < length; index += 1) {
        defineGuiOwnDataProperty(copied, index, values[index]);
    }
    return copied;
}
function copyRuntimeRecordArrayFrom<Value>(values: readonly Value[], start: number): Value[] {
    const copied: Value[] = [];
    let outputIndex = 0;
    for (let index = start; index < values.length; index += 1) {
        defineGuiOwnDataProperty(copied, outputIndex, values[index]);
        outputIndex += 1;
    }
    return copied;
}
function normalizeRuntimeRecordStatusClass(status: unknown): GuiTextStatusClass {
    const source = stringValue(falsyFallback(status, 'detected'));
    const value = applyRuntimeRecordFunction(lowerRuntimeRecordString, source, []);
    if (value === 'completed')
        return 'completed';
    if (value === 'translating' || value === 'pending' || value === 'detected')
        return value;
    if (value === 'failed' || value === 'error')
        return 'failed';
    if (value === 'skipped' || value === 'stale' || value === 'removed' || value === 'disappeared')
        return value;
    return 'detected';
}
function normalizeRuntimeVisibility(value: unknown, defaultValue: boolean | null): boolean | null {
    if (value === true || value === false || value === null)
        return value;
    return defaultValue;
}
function runtimeHistoryDetailKey(value: unknown, active: Set<object> = new RuntimeRecordSet<object>(), depth = 0): string {
    if (value === null)
        return 'null';
    if (value === undefined)
        return 'undefined';
    if (typeof value === 'string')
        return `string:${stringValue(value.length)}:${value}`;
    if (typeof value === 'number')
        return `number:${stringValue(value)}`;
    if (typeof value === 'boolean')
        return value ? 'boolean:1' : 'boolean:0';
    if (depth >= 16)
        return 'depth-limit';
    if (isGuiArray(value)) {
        if (applyRuntimeRecordFunction(hasRuntimeRecordSetValue, active, [value]))
            return 'cycle';
        applyRuntimeRecordFunction(addRuntimeRecordSetValue, active, [value]);
        let result = `array:${stringValue(value.length)}:`;
        try {
            for (let index = 0; index < value.length; index += 1) {
                const descriptor = applyRuntimeRecordFunction(describeRuntimeRecordProperty, Object, [value, index]);
                if (!descriptor ||
                    !applyRuntimeRecordFunction(runtimeRecordObjectHasOwn, Object, [descriptor, 'value'])) {
                    result += 'missing;';
                    continue;
                }
                const item = runtimeHistoryDetailKey(descriptor.value, active, depth + 1);
                result += `${stringValue(item.length)}:${item};`;
            }
            return result;
        }
        finally {
            applyRuntimeRecordFunction(deleteRuntimeRecordSetValue, active, [value]);
        }
    }
    if (!isUnknownRecord(value))
        return `unsupported:${typeof value}`;
    if (applyRuntimeRecordFunction(hasRuntimeRecordSetValue, active, [value]))
        return 'cycle';
    applyRuntimeRecordFunction(addRuntimeRecordSetValue, active, [value]);
    const keys = applyRuntimeRecordFunction(listRuntimeRecordKeys, Object, [value]);
    applyRuntimeRecordFunction(sortRuntimeRecordArray, keys, []);
    let result = `record:${stringValue(keys.length)}:`;
    try {
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (key === undefined)
                continue;
            const descriptor = applyRuntimeRecordFunction(describeRuntimeRecordProperty, Object, [value, key]);
            if (!descriptor || !applyRuntimeRecordFunction(runtimeRecordObjectHasOwn, Object, [descriptor, 'value'])) {
                result += `${stringValue(key.length)}:${key}:missing;`;
                continue;
            }
            const item = runtimeHistoryDetailKey(descriptor.value, active, depth + 1);
            result += `${stringValue(key.length)}:${key}:${stringValue(item.length)}:${item};`;
        }
        return result;
    }
    finally {
        applyRuntimeRecordFunction(deleteRuntimeRecordSetValue, active, [value]);
    }
}
export function summarizeHookResults(results: readonly GuiHookResult[]): GuiHookSummary {
    const summary: GuiHookSummary = {
        installed: 0,
        skipped: 0,
        failed: 0,
        total: isGuiArray(results) ? results.length : 0,
    };
    const length = results.length;
    for (let index = 0; index < length; index += 1) {
        const result = results[index];
        if (!result)
            continue;
        if (typeof result.status !== 'string')
            continue;
        if (applyRuntimeRecordFunction(runtimeRecordObjectHasOwn, Object, [summary, result.status])) {
            summary[result.status] = (summary[result.status] ?? 0) + 1;
        }
    }
    return summary;
}
export function isDiagnosticsHookResult(result: GuiHookResult): boolean {
    const category = stringValue(result.category || '');
    const trimmed = applyRuntimeRecordFunction(trimRuntimeRecordString, category, []);
    return applyRuntimeRecordFunction(lowerRuntimeRecordString, trimmed, []) === 'diagnostics';
}
export function filterVisibleHookResults(results: readonly GuiHookResult[], policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): GuiHookResult[] {
    const list = results;
    const diagnosticsEnabled = getGuiEffectivePolicy(policySnapshot).diagnostics.enabled;
    if (diagnosticsEnabled)
        return copyRuntimeRecordArray(list);
    const visible: GuiHookResult[] = [];
    let outputIndex = 0;
    for (let index = 0; index < list.length; index += 1) {
        const result = list[index];
        if (!result || isDiagnosticsHookResult(result))
            continue;
        defineGuiOwnDataProperty(visible, outputIndex, result);
        outputIndex += 1;
    }
    return visible;
}
export function getVisibleHookResults(policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): GuiHookResult[] {
    return filterVisibleHookResults(state.hookResults, policySnapshot);
}
export function getVisibleHookSummary(policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): GuiHookSummary {
    return summarizeHookResults(getVisibleHookResults(policySnapshot));
}
export function normalizeHookFeedResult(result: unknown): GuiHookResult {
    const source = isUnknownRecord(result) ? result : createGuiOwnDataRecord();
    return {
        name: source['name'] ? stringValue(source['name']) : '-',
        displayName: source['displayName']
            ? stringValue(source['displayName'])
            : source['name']
                ? stringValue(source['name'])
                : '-',
        category: source['category'] ? stringValue(source['category']) : '',
        module: source['module'] ? stringValue(source['module']) : '',
        status: source['status'] ? stringValue(source['status']) : 'unknown',
        reason: source['reason'] ? stringValue(source['reason']) : '',
        timestamp: falsyFallback(source['timestamp'], null),
    };
}
export function readHookDiagnostics(gameWindow: unknown): unknown {
    return propertyValue(gameWindow, 'LiveTranslatorHookInstallSnapshot');
}
export function readTextCoreStatus(gameWindow: unknown): unknown {
    const status = propertyValue(gameWindow, 'LiveTranslatorTextCoreStatus');
    const getSnapshot = propertyValue(status, 'getSnapshot');
    if (typeof getSnapshot === 'function') {
        return applyRuntimeRecordFunction(getSnapshot, status, []);
    }
    return null;
}
export function readTranslationStatus(gameWindow: unknown): unknown {
    const status = propertyValue(gameWindow, 'LiveTranslatorTranslationStatus');
    const getSnapshot = propertyValue(status, 'getSnapshot');
    if (typeof getSnapshot === 'function') {
        return applyRuntimeRecordFunction(getSnapshot, status, []);
    }
    return null;
}
export function readTextCoreDiagnostics(gameWindow: unknown): unknown {
    const diagnostics = propertyValue(gameWindow, 'LiveTranslatorTextCoreDiagnostics');
    const getSnapshot = propertyValue(diagnostics, 'getSnapshot');
    if (typeof getSnapshot === 'function') {
        return applyRuntimeRecordFunction(getSnapshot, diagnostics, []);
    }
    return propertyValue(gameWindow, 'LiveTranslatorTextCoreDiagnosticsSnapshot');
}
export function normalizeTextCoreStatus(snapshot: unknown): {
    active: GuiTextRecord[];
    attached: GuiTextRecord[];
    detached: GuiTextRecord[];
    archived: GuiTextRecord[];
    summary: GuiTextSummary | null;
    updatedAt: unknown;
} {
    if (!isUnknownRecord(snapshot)) {
        return {
            active: [],
            attached: [],
            detached: [],
            archived: [],
            summary: null,
            updatedAt: null,
        };
    }
    const active = normalizeTextCoreItemList(snapshot['active'], 'active');
    const attached = normalizeTextCoreItemList(snapshot['attached'], 'attached');
    const detached = normalizeTextCoreItemList(snapshot['detached'], 'detached');
    const archived = normalizeTextCoreItemList(isGuiArray(snapshot['archived']) ? snapshot['archived'] : snapshot['inactive'], 'archived');
    const summary = summarizeTextCoreTextRecords(active, attached, detached, archived);
    const publishedSummary = isUnknownRecord(snapshot['summary'])
        ? (assignGuiOwnDataRecord(copyGuiOwnDataRecord(snapshot['summary']), summary) as unknown as GuiTextSummary)
        : summary;
    return {
        active,
        attached,
        detached,
        archived,
        summary: publishedSummary,
        updatedAt: falsyFallback(snapshot['updatedAt'], null),
    };
}
export function normalizeTextCoreItemList(items: unknown, lifecycle: string): GuiTextRecord[] {
    if (!isGuiArray(items))
        return [];
    const normalized: GuiTextRecord[] = [];
    const length = items.length;
    for (let index = 0; index < length; index += 1) {
        defineGuiOwnDataProperty(normalized, index, normalizeTextCoreTextRecord(items[index], lifecycle));
    }
    return normalized;
}
export function normalizeTextCoreTextRecord(record: unknown, lifecycle: string): GuiTextRecord {
    const source = isUnknownRecord(record) ? record : createGuiOwnDataRecord();
    const metadata = isUnknownRecord(source['metadata']) ? source['metadata'] : createGuiOwnDataRecord();
    const adapter = source['sourceAdapter'] ? stringValue(source['sourceAdapter']) : '';
    const hook = source['hook'] ? stringValue(source['hook']) : '';
    const methodName = firstNonEmptyString(metadata['methodName'], metadata['method'], hook);
    const history = normalizeRecordHistory(source['history']);
    const policy = normalizeTextRecordPolicy(source, history);
    const drawRun = normalizeDrawRunMetadata(metadata['drawRun']);
    const prepared = copyGuiOwnDataRecord(source);
    assignGuiOwnDataRecord(prepared, {
        hookLabel: formatTextRecordHookLabel(adapter, hook),
        hook,
        methodName,
        windowType: firstNonEmptyString(metadata['windowType']),
        ownerType: firstNonEmptyString(metadata['ownerType'], adapter),
        drawRun,
        x: metadata['x'],
        y: metadata['y'],
        onScreen: normalizeRuntimeVisibility(source['visible'], null),
        screenState: falsyFallback(source['screenState'], source['visible'] === true ? 'visible' : source['visible'] === false ? 'hidden' : 'unverified'),
        lifecycleState: lifecycle,
        policy,
        history,
    });
    const normalized = normalizeActiveTextRecord(prepared);
    defineGuiOwnDataProperty(normalized, 'sourceAdapter', adapter);
    normalized.priority = source['priority'];
    normalized.backgrounded = source['backgrounded'] === true;
    normalized.active = source['active'] === true;
    normalized.policy = policy;
    normalized.lifecycleState = lifecycle;
    return normalized;
}
export function summarizeTextCoreTextRecords(active: readonly GuiTextRecord[], attached: readonly GuiTextRecord[], detached: readonly GuiTextRecord[], archived: readonly GuiTextRecord[]): GuiTextSummary {
    const summary = createGuiOwnDataRecord() as unknown as GuiTextSummary;
    defineGuiOwnDataProperty(summary, 'active', active.length);
    defineGuiOwnDataProperty(summary, 'attached', attached.length);
    defineGuiOwnDataProperty(summary, 'detached', detached.length);
    defineGuiOwnDataProperty(summary, 'archived', archived.length);
    summarizeTextCoreRecordList(summary, active);
    summarizeTextCoreRecordList(summary, attached);
    summarizeTextCoreRecordList(summary, detached);
    summarizeTextCoreRecordList(summary, archived);
    return summary;
}
function summarizeTextCoreRecordList(summary: GuiTextSummary, records: readonly GuiTextRecord[]): void {
    for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (!record)
            continue;
        const status = normalizeRuntimeRecordStatusClass(record.status);
        const current = runtimeRecordObjectHasOwn(summary, status) ? summary[status] : 0;
        defineGuiOwnDataProperty(summary, status, (current ?? 0) + 1);
    }
}
export function formatTextRecordHookLabel(adapter: unknown, hook: unknown): string {
    const adapterLabel = formatAdapterLabel(adapter);
    const hookLabel = hook ? stringValue(hook) : '';
    if (adapterLabel &&
        hookLabel &&
        applyRuntimeRecordFunction(lowerRuntimeRecordString, adapterLabel, []) !==
            applyRuntimeRecordFunction(lowerRuntimeRecordString, hookLabel, [])) {
        return `${adapterLabel} ${hookLabel}`;
    }
    return adapterLabel || hookLabel || '-';
}
export function formatAdapterLabel(value: unknown): string {
    const source = stringValue(falsyFallback(value, ''));
    const text = applyRuntimeRecordFunction(trimRuntimeRecordString, source, []);
    if (!text)
        return '';
    if (applyRuntimeRecordFunction(lowerRuntimeRecordString, text, []) === 'pixi')
        return 'PIXI';
    const spaced = stringValue(applyRuntimeRecordFunction(replaceRuntimeRecordString, text, [/[_-]+/gu, ' ']));
    return stringValue(applyRuntimeRecordFunction(replaceRuntimeRecordString, spaced, [/\b\w/gu, capitalizeRuntimeRecordMatch]));
}
function capitalizeRuntimeRecordMatch(match: string): string {
    return applyRuntimeRecordFunction(upperRuntimeRecordString, match, []);
}
export function firstNonEmptyString(...values: unknown[]): string {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (typeof value === 'string' && value)
            return value;
        if (value !== undefined && value !== null && typeof value !== 'object') {
            const text = stringValue(value);
            if (text)
                return text;
        }
    }
    return '';
}
export function normalizeActiveTextRecord(record: unknown): GuiTextRecord {
    const source = isUnknownRecord(record) ? record : createGuiOwnDataRecord();
    const history = normalizeRecordHistory(source['history']);
    return {
        id: source['id'] ? stringValue(source['id']) : '',
        hook: source['hookLabel']
            ? stringValue(source['hookLabel'])
            : source['hook']
                ? stringValue(source['hook'])
                : '-',
        hookKey: source['hook'] ? stringValue(source['hook']) : '',
        surfaceType: source['surfaceType'] ? stringValue(source['surfaceType']) : '',
        original: source['original']
            ? stringValue(source['original'])
            : source['visibleText']
                ? stringValue(source['visibleText'])
                : '',
        rawText: source['rawText'] ? stringValue(source['rawText']) : '',
        convertedText: source['convertedText'] ? stringValue(source['convertedText']) : '',
        visibleText: source['visibleText'] ? stringValue(source['visibleText']) : '',
        translationSource: source['translationSource'] ? stringValue(source['translationSource']) : '',
        normalizedSource: source['normalizedSource'] ? stringValue(source['normalizedSource']) : '',
        status: source['status'] ? stringValue(source['status']) : 'detected',
        translation: source['translation']
            ? stringValue(source['translation'])
            : source['translatedText']
                ? stringValue(source['translatedText'])
                : '',
        translationState: null,
        policyReason: null,
        translationReceived: source['translationReceived'] ? stringValue(source['translationReceived']) : '',
        translationDrawn: source['translationDrawn'] ? stringValue(source['translationDrawn']) : '',
        firstSeenAt: falsyFallback(source['firstSeenAt'], falsyFallback(source['seenAt'], falsyFallback(source['lastSeenAt'], falsyFallback(source['timestamp'], null)))),
        seenAt: falsyFallback(source['lastSeenAt'], falsyFallback(source['seenAt'], falsyFallback(source['timestamp'], null))),
        updatedAt: falsyFallback(source['updatedAt'], falsyFallback(source['lastSeenAt'], falsyFallback(source['seenAt'], falsyFallback(source['timestamp'], null)))),
        windowType: source['windowType'] ? stringValue(source['windowType']) : '',
        ownerType: source['ownerType'] ? stringValue(source['ownerType']) : '',
        methodName: source['methodName'] ? stringValue(source['methodName']) : '',
        drawRun: normalizeDrawRunMetadata(source['drawRun']),
        x: source['x'],
        y: source['y'],
        bounds: isUnknownRecord(source['bounds']) ? copyGuiOwnDataRecord(source['bounds']) : null,
        onScreen: normalizeRuntimeVisibility(source['onScreen'], true),
        screenState: source['screenState'] ? stringValue(source['screenState']) : '',
        disappearedAt: falsyFallback(source['disappearedAt'], null),
        deactivatedAt: falsyFallback(source['deactivatedAt'], falsyFallback(source['disappearedAt'], null)),
        lifecycleState: source['lifecycleState'] ? stringValue(source['lifecycleState']) : '',
        priority: source['priority'],
        backgrounded: source['backgrounded'] === true,
        active: source['active'] === true,
        policy: normalizeTextRecordPolicy(source, history),
        metadata: copyGuiOwnDataRecord(source['metadata']),
        history,
    };
}
export function normalizeDrawRunMetadata(drawRun: unknown): GuiDrawRun | null {
    if (!isUnknownRecord(drawRun))
        return null;
    return {
        type: drawRun['type'] ? stringValue(drawRun['type']) : '',
        reason: drawRun['reason'] ? stringValue(drawRun['reason']) : '',
        confidence: drawRun['confidence'] ? stringValue(drawRun['confidence']) : '',
        runKey: drawRun['runKey'] ? stringValue(drawRun['runKey']) : '',
        unitCount: maximumRuntimeRecordNumber(0, floorRuntimeRecordNumber(applyRuntimeRecordFunction(runtimeRecordNumber, undefined, [drawRun['unitCount']]) || 0)),
    };
}
export function normalizeTextRecordPolicy(source: unknown, history: GuiHistoryEvent[] | null = null): GuiTextPolicy {
    const record = isUnknownRecord(source) ? source : createGuiOwnDataRecord();
    const policy = clonePolicyObject(record['policy']);
    const events = collectTextRecordPolicyEvents(isGuiArray(history) ? history : normalizeRecordHistory(record['history']));
    if (events.length) {
        policy.events = copyRuntimeRecordArrayFrom(events, maximumRuntimeRecordNumber(0, events.length - 8));
        const latest = events[events.length - 1];
        if (!policy.last && latest) {
            const latestPolicy = copyGuiOwnDataRecord(latest.policy);
            assignGuiOwnDataRecord(latestPolicy, { type: latest.type, message: latest.message });
            policy.last = latestPolicy;
        }
        for (let index = events.length - 1; index >= 0; index -= 1) {
            const event = events[index];
            if (!event)
                continue;
            const eventPolicy = event.policy;
            if (!policy.lifecycle && eventPolicy['kind']) {
                policy.lifecycle = {
                    kind: eventPolicy['kind'],
                    translationAction: falsyFallback(eventPolicy['translationAction'], ''),
                    priorityAction: falsyFallback(eventPolicy['priorityAction'], ''),
                    placementAction: falsyFallback(eventPolicy['placementAction'], ''),
                    slotAction: falsyFallback(eventPolicy['slotAction'], ''),
                    renderCommandAction: falsyFallback(eventPolicy['renderCommandAction'], ''),
                    priority: eventPolicy['priority'],
                    reason: falsyFallback(eventPolicy['reason'], event.message),
                };
            }
            if (!policy.priority && (eventPolicy['priorityAction'] || eventPolicy['priority'] !== undefined)) {
                policy.priority = {
                    action: falsyFallback(eventPolicy['priorityAction'], ''),
                    priority: eventPolicy['priority'],
                    reason: falsyFallback(eventPolicy['reason'], event.message),
                    source: falsyFallback(eventPolicy['source'], ''),
                };
            }
            if (policy.lifecycle && policy.priority)
                break;
        }
    }
    const policyKeys = applyRuntimeRecordFunction(listRuntimeRecordKeys, Object, [policy]);
    return policyKeys.length ? policy : createGuiOwnDataRecord();
}
export function getTextRecordRuntimePolicy(item: GuiTextRecord | null | undefined): GuiTextPolicy {
    return clonePolicyObject(item ? propertyValue(item, 'policy') : null);
}
export function clonePolicyObject(value: unknown): GuiTextPolicy {
    return copyGuiOwnDataRecord(value);
}
export function collectTextRecordPolicyEvents(history: unknown): GuiPolicyEvent[] {
    if (!isGuiArray(history))
        return [];
    const normalized: GuiPolicyEvent[] = [];
    let outputIndex = 0;
    for (let index = 0; index < history.length; index += 1) {
        const entry = history[index];
        const details = isUnknownRecord(entry) && isUnknownRecord(entry['details']) ? entry['details'] : createGuiOwnDataRecord();
        const policy = extractTextRecordEventPolicy(entry, details);
        const keys = applyRuntimeRecordFunction(listRuntimeRecordKeys, Object, [policy]);
        if (!keys.length)
            continue;
        defineGuiOwnDataProperty(normalized, outputIndex, {
            at: falsyFallback(propertyValue(entry, 'at'), null),
            seq: falsyFallback(propertyValue(entry, 'seq'), null),
            type: stringValue(falsyFallback(propertyValue(entry, 'type'), 'event')),
            message: stringValue(falsyFallback(propertyValue(entry, 'message'), '')),
            policy,
        });
        outputIndex += 1;
    }
    return normalized;
}
export function extractTextRecordEventPolicy(entry: unknown, details: UnknownRecord): UnknownRecord {
    if (isUnknownRecord(details['policy']))
        return copyGuiOwnDataRecord(details['policy']);
    if (isUnknownRecord(details['lifecyclePolicy']))
        return copyGuiOwnDataRecord(details['lifecyclePolicy']);
    if (isUnknownRecord(details['priorityPolicy']))
        return copyGuiOwnDataRecord(details['priorityPolicy']);
    const policy = createGuiOwnDataRecord();
    if (details['priority'] !== undefined &&
        stringValue(falsyFallback(propertyValue(entry, 'type'), '')) === 'item.priority_changed') {
        policy['priorityAction'] =
            applyRuntimeRecordFunction(runtimeRecordNumber, undefined, [details['priority']]) <= 100 ? 'demote' : 'set';
        policy['priority'] = details['priority'];
        policy['reason'] = falsyFallback(propertyValue(entry, 'message'), '');
    }
    return policy;
}
export function normalizeHistoryEvent(record: unknown): GuiHistoryEvent {
    const source = isUnknownRecord(record) ? record : createGuiOwnDataRecord();
    const nestedRecord = isUnknownRecord(source['record']) ? source['record'] : createGuiOwnDataRecord();
    return {
        at: falsyFallback(source['at'], falsyFallback(source['timestamp'], null)),
        seq: falsyFallback(source['seq'], null),
        id: source['id']
            ? stringValue(source['id'])
            : source['itemId']
                ? stringValue(source['itemId'])
                : nestedRecord['id']
                    ? stringValue(nestedRecord['id'])
                    : '',
        surfaceId: source['surfaceId'] ? stringValue(source['surfaceId']) : '',
        adapterId: source['adapterId'] ? stringValue(source['adapterId']) : '',
        type: source['type'] ? stringValue(source['type']) : 'event',
        status: source['status']
            ? stringValue(source['status'])
            : nestedRecord['status']
                ? stringValue(nestedRecord['status'])
                : '',
        message: source['message'] ? stringValue(source['message']) : '',
        details: copyGuiOwnDataRecord(source['details']),
        record: nestedRecord['id'] ? normalizeActiveTextRecord(nestedRecord) : null,
    };
}
export function normalizeRecordHistory(source: unknown): GuiHistoryEvent[] {
    if (!isGuiArray(source))
        return [];
    const seen = createGuiOwnDataRecord();
    const normalized: GuiHistoryEvent[] = [];
    let outputIndex = 0;
    for (let index = 0; index < source.length; index += 1) {
        const entry = normalizeHistoryEvent(source[index]);
        const seq = entry.seq ?? entry.details['seq'] ?? '';
        const key = `${stringValue(falsyFallback(entry.at, ''))}|${stringValue(falsyFallback(seq, ''))}|${entry.id}|${entry.type}|${entry.message}|${runtimeHistoryDetailKey(entry.details)}`;
        if (applyRuntimeRecordFunction(runtimeRecordObjectHasOwn, Object, [seen, key]))
            continue;
        defineGuiOwnDataProperty(seen, key, true);
        defineGuiOwnDataProperty(normalized, outputIndex, entry);
        outputIndex += 1;
    }
    applyRuntimeRecordFunction(sortRuntimeRecordArray, normalized, [compareRuntimeHistoryEvents]);
    return normalized;
}
function compareRuntimeHistoryEvents(a: GuiHistoryEvent, b: GuiHistoryEvent): number {
    return ((applyRuntimeRecordFunction(runtimeRecordNumber, undefined, [a.at]) || 0) -
        (applyRuntimeRecordFunction(runtimeRecordNumber, undefined, [b.at]) || 0));
}
