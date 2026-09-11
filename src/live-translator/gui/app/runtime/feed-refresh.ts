import { addLog, getGameWindow } from '../core.js';
import { getConfiguredGuiProjectionLimits, getGuiDiagnosticsSnapshotRequest, readGuiProjectionPolicyFromSettings, refreshGuiPolicySnapshot, } from '../policy.js';
import { state } from '../state.js';
import type { GuiHookResult, GuiHookSummary, GuiRuntimeFeedName, GuiTextRecord, GuiTextSummary, UnknownRecord, } from '../types.js';
import { createGuiOwnDataRecord, defineGuiOwnDataProperty } from '../types.js';
import { GUI_PROJECTION_LIMITS, resolveGuiProjectionLimits, serializeGuiValueOutcome, type GuiProjectionLimits, } from '../../projection.js';
import { normalizeDrawCaptureTraceSnapshot, normalizeForesightSnapshot, normalizeTranslationDiagnosticsSnapshot, } from './diagnostics.js';
import { createCurrentRuntimeFeedHealth, createFailedRuntimeFeedHealth, createUnavailableRuntimeFeedHealth, RUNTIME_FEED_LABELS, RUNTIME_FEED_NAMES, } from './feed-health.js';
import { normalizeHookFeedResult, normalizeTextCoreStatus, summarizeHookResults } from './records.js';
const applyRuntimeFeedFunction = Reflect.apply;
const getRuntimeFeedProperty = Reflect.get;
const getRuntimeFeedOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const setRuntimeFeedPrototype = Object.setPrototypeOf;
const runtimeFeedArrayIsArray = Array.isArray;
const parseRuntimeFeedJson = JSON.parse;
const runtimeFeedSafeInteger = Number.isSafeInteger;
const runtimeFeedNumber = Number;
const runtimeFeedString = String;
const sliceRuntimeFeedString = String.prototype.slice;
const RUNTIME_FEED_REASON_LIMIT = 240;
const RUNTIME_HOOK_RESULT_LIMIT = 256;
const RUNTIME_FEED_UNAVAILABLE = Symbol('runtime-feed-unavailable');
const RuntimeFeedError = Error;
let nextRuntimeFeedGeneration = 0;
const TEXT_INVENTORY_PROJECTION_LIMITS: GuiProjectionLimits = Object.freeze({
    ...GUI_PROJECTION_LIMITS,
    maxArrayEntries: 1024,
    maxDescriptorReads: 131072,
    maxNodes: 65536,
    maxSerializedBytes: 8 * 1024 * 1024,
    maxStringCodeUnits: 1024 * 1024,
    maxTotalStringCodeUnits: 8 * 1024 * 1024,
});
const TEXT_HISTORY_PROJECTION_LIMITS: GuiProjectionLimits = Object.freeze({
    ...GUI_PROJECTION_LIMITS,
    maxDescriptorReads: 262144,
    maxNodes: 131072,
    maxSerializedBytes: 16 * 1024 * 1024,
    maxStringCodeUnits: 1024 * 1024,
    maxTotalStringCodeUnits: 16 * 1024 * 1024,
});
interface StagedSettingsFeed {
    readonly settings: UnknownRecord;
    readonly foldKey: string;
}
interface AdmittedRuntimeFeedSnapshot {
    readonly snapshot: UnknownRecord;
    readonly foldKey: string;
}
interface StagedHookFeed {
    readonly diagnosticsSurface: boolean;
    readonly results: GuiHookResult[];
    readonly summary: GuiHookSummary;
}
interface StagedTextFeed {
    readonly diagnosticsSurface: boolean;
    readonly active: GuiTextRecord[];
    readonly attached: GuiTextRecord[];
    readonly detached: GuiTextRecord[];
    readonly archived: GuiTextRecord[];
    readonly summary: GuiTextSummary | null;
}
export function refreshRuntimeFeed(gameWindow?: unknown): boolean {
    const generation = ++nextRuntimeFeedGeneration;
    const projectionPolicy = readGuiProjectionPolicyFromSettings();
    const projectionLimits = resolveGuiProjectionLimits(projectionPolicy);
    const textInventoryProjectionLimits = resolveGuiProjectionLimits(projectionPolicy, TEXT_INVENTORY_PROJECTION_LIMITS);
    const runtimeWindow = gameWindow === undefined ? getGameWindow() : gameWindow;
    if (!runtimeWindow) {
        const feedCount = RUNTIME_FEED_NAMES.length;
        for (let index = 0; index < feedCount; index += 1) {
            const name = RUNTIME_FEED_NAMES[index];
            if (name === undefined)
                continue;
            publishRuntimeFeedUnavailable(name, generation, 'runtime disconnected');
        }
        refreshGuiPolicySnapshot();
        return false;
    }
    refreshRuntimeSurface('settings', generation, () => {
        const source = readRuntimeFeedProperty(runtimeWindow, 'LiveTranslatorSettings');
        if (!isRuntimeFeedRecord(source))
            return RUNTIME_FEED_UNAVAILABLE;
        const admitted = admitRuntimeFeedSnapshot(source, 'runtime settings', projectionLimits);
        return { settings: admitted.snapshot, foldKey: admitted.foldKey };
    }, (staged: StagedSettingsFeed) => {
        if (state.settingsFoldKey && state.settingsFoldKey !== staged.foldKey)
            state.panelDefaultKeys = {};
        state.settingsFoldKey = staged.foldKey;
        state.settings = staged.settings;
        state.settingsSource = 'runtime settings';
        state.settingsError = '';
    });
    refreshRuntimeSurface('hooks', generation, () => stageHookFeed(runtimeWindow, projectionLimits), (staged: StagedHookFeed) => {
        state.hookDiagnosticsSurface = staged.diagnosticsSurface;
        state.hookResults = staged.results;
        state.hookSummary = staged.summary;
    });
    const hasTextFeed = refreshRuntimeSurface('textRecords', generation, () => stageTextFeed(runtimeWindow, textInventoryProjectionLimits), (staged: StagedTextFeed) => {
        state.textDiagnosticsSurface = staged.diagnosticsSurface;
        state.diagnosticRecords = [...staged.active, ...staged.attached, ...staged.detached, ...staged.archived];
        state.textSummary = staged.summary;
        syncTextHistoryCache(staged.active, staged.attached, staged.detached, staged.archived);
    });
    const hasTranslationFeed = refreshRuntimeSurface('translation', generation, () => {
        const snapshotOptions = getGuiDiagnosticsSnapshotRequest(refreshGuiPolicySnapshot());
        const diagnostics = readTranslationDiagnosticsSnapshot(runtimeWindow, snapshotOptions);
        const snapshot = diagnostics ?? readTranslationStatusSnapshot(runtimeWindow);
        if (!isRuntimeFeedRecord(snapshot))
            return RUNTIME_FEED_UNAVAILABLE;
        const admitted = admitRuntimeFeedSnapshot(snapshot, 'translation diagnostics', projectionLimits);
        return normalizeTranslationDiagnosticsSnapshot(admitted.snapshot) ?? RUNTIME_FEED_UNAVAILABLE;
    }, (staged) => {
        state.translationDiagnostics = staged;
    });
    const hasDrawCaptureFeed = refreshRuntimeSurface('drawCapture', generation, () => {
        const snapshot = readRuntimeFeedProperty(runtimeWindow, 'LiveTranslatorDrawCaptureTraceSnapshot');
        if (!isRuntimeFeedRecord(snapshot))
            return RUNTIME_FEED_UNAVAILABLE;
        const admitted = admitRuntimeFeedSnapshot(snapshot, 'draw capture', projectionLimits);
        return normalizeDrawCaptureTraceSnapshot(admitted.snapshot) ?? RUNTIME_FEED_UNAVAILABLE;
    }, (staged) => {
        state.drawCaptureTrace = staged;
    });
    const hasForesightFeed = refreshRuntimeSurface('foresight', generation, () => {
        const snapshot = readForesightDiagnosticsSnapshot(runtimeWindow);
        if (!isRuntimeFeedRecord(snapshot))
            return RUNTIME_FEED_UNAVAILABLE;
        const admitted = admitRuntimeFeedSnapshot(snapshot, 'foresight diagnostics', projectionLimits);
        return normalizeForesightSnapshot(admitted.snapshot) ?? RUNTIME_FEED_UNAVAILABLE;
    }, (staged) => {
        state.foresight = staged;
    });
    refreshGuiPolicySnapshot();
    return ((state.runtimeFeedHealth.hooks.status === 'current' && state.hookResults.length > 0) ||
        hasTextFeed ||
        hasTranslationFeed ||
        hasDrawCaptureFeed ||
        hasForesightFeed);
}
function refreshRuntimeSurface<Result>(name: GuiRuntimeFeedName, generation: number, stage: () => Result | typeof RUNTIME_FEED_UNAVAILABLE, commit: (staged: Result) => void): boolean {
    let staged: Result | typeof RUNTIME_FEED_UNAVAILABLE;
    try {
        staged = applyRuntimeFeedFunction(stage, undefined, []);
    }
    catch (error: unknown) {
        const reason = describeRuntimeFeedFailure(error);
        if (publishRuntimeFeedFailure(name, generation, reason)) {
            try {
                addLog('warn', `${RUNTIME_FEED_LABELS[name]} read failed: ${reason}`);
            }
            catch {
            }
        }
        return false;
    }
    if (staged === RUNTIME_FEED_UNAVAILABLE) {
        publishRuntimeFeedUnavailable(name, generation, 'surface unavailable');
        return false;
    }
    if (!canPublishRuntimeFeed(name, generation))
        return false;
    commit(staged);
    state.runtimeFeedHealth[name] = createCurrentRuntimeFeedHealth(generation);
    return true;
}
function canPublishRuntimeFeed(name: GuiRuntimeFeedName, generation: number): boolean {
    return state.runtimeFeedHealth[name].observedGeneration <= generation;
}
function publishRuntimeFeedFailure(name: GuiRuntimeFeedName, generation: number, reason: string): boolean {
    if (!canPublishRuntimeFeed(name, generation))
        return false;
    const previous = state.runtimeFeedHealth[name];
    state.runtimeFeedHealth[name] = createFailedRuntimeFeedHealth(generation, previous, reason);
    return previous.status !== 'failed' || previous.reason !== reason;
}
function publishRuntimeFeedUnavailable(name: GuiRuntimeFeedName, generation: number, reason: string): boolean {
    if (!canPublishRuntimeFeed(name, generation))
        return false;
    const previous = state.runtimeFeedHealth[name];
    state.runtimeFeedHealth[name] = createUnavailableRuntimeFeedHealth(generation, previous.lastSuccessGeneration, reason);
    return true;
}
function describeRuntimeFeedFailure(error: unknown): string {
    const primitive = describeRuntimeFeedReasonPrimitive(error);
    if (primitive)
        return primitive;
    if ((typeof error !== 'object' || error === null) && typeof error !== 'function')
        return 'unknown failure';
    try {
        const descriptor = getRuntimeFeedOwnPropertyDescriptor(error, 'message');
        if (!descriptor)
            return 'unknown failure';
        const valueDescriptor = getRuntimeFeedOwnPropertyDescriptor(descriptor, 'value');
        return valueDescriptor
            ? describeRuntimeFeedReasonPrimitive(valueDescriptor.value) || 'unknown failure'
            : 'unknown failure';
    }
    catch {
        return 'unknown failure';
    }
}
function describeRuntimeFeedReasonPrimitive(value: unknown): string {
    let reason = '';
    if (value === null)
        reason = 'null';
    else if (value === undefined)
        reason = 'undefined';
    else if (typeof value === 'string')
        reason = value;
    else if (typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint' ||
        typeof value === 'symbol') {
        reason = applyRuntimeFeedFunction(runtimeFeedString, undefined, [value]);
    }
    if (!reason)
        return '';
    return applyRuntimeFeedFunction(sliceRuntimeFeedString, reason, [0, RUNTIME_FEED_REASON_LIMIT]);
}
function readRuntimeFeedProperty(value: unknown, key: PropertyKey): unknown {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        return undefined;
    return applyRuntimeFeedFunction(getRuntimeFeedProperty, Reflect, [value, key, value]);
}
function isRuntimeFeedRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !runtimeFeedArrayIsArray(value);
}
function admitRuntimeFeedSnapshot(value: UnknownRecord, description: string, limits: GuiProjectionLimits = GUI_PROJECTION_LIMITS): AdmittedRuntimeFeedSnapshot {
    const serialized = serializeGuiValueOutcome(value, limits);
    if (!serialized.complete) {
        throw new RuntimeFeedError(`${description} snapshot was not plain bounded data`);
    }
    const parsed: unknown = applyRuntimeFeedFunction(parseRuntimeFeedJson, JSON, [
        serialized.text,
        detachParsedRuntimeFeedRecord,
    ]);
    if (!isRuntimeFeedRecord(parsed)) {
        throw new RuntimeFeedError(`${description} snapshot was not an object`);
    }
    return { snapshot: parsed, foldKey: serialized.text };
}
function detachParsedRuntimeFeedRecord(_key: string, value: unknown): unknown {
    if (isRuntimeFeedRecord(value)) {
        applyRuntimeFeedFunction(setRuntimeFeedPrototype, Object, [value, null]);
    }
    return value;
}
function readRuntimeSnapshotApi(gameWindow: unknown, apiName: string, legacySnapshotName: string): unknown {
    const api = readRuntimeFeedProperty(gameWindow, apiName);
    const getSnapshot = readRuntimeFeedProperty(api, 'getSnapshot');
    if (typeof getSnapshot === 'function')
        return applyRuntimeFeedFunction(getSnapshot, api, []);
    return readRuntimeFeedProperty(gameWindow, legacySnapshotName);
}
function readTextDiagnosticsApi(gameWindow: unknown): unknown {
    return readRuntimeFeedProperty(gameWindow, 'LiveTranslatorTextCoreDiagnostics');
}
function readTextInventorySnapshot(gameWindow: unknown): unknown {
    const api = readTextDiagnosticsApi(gameWindow);
    const getInventorySnapshot = readRuntimeFeedProperty(api, 'getInventorySnapshot');
    if (typeof getInventorySnapshot === 'function') {
        return applyRuntimeFeedFunction(getInventorySnapshot, api, []);
    }
    return readRuntimeSnapshotApi(gameWindow, 'LiveTranslatorTextCoreDiagnostics', 'LiveTranslatorTextCoreDiagnosticsSnapshot');
}
function readTextStatusSnapshot(gameWindow: unknown): unknown {
    return callSnapshotMethod(readRuntimeFeedProperty(gameWindow, 'LiveTranslatorTextCoreStatus'), 'getSnapshot', []);
}
function readTranslationStatusSnapshot(gameWindow: unknown): unknown {
    return callSnapshotMethod(readRuntimeFeedProperty(gameWindow, 'LiveTranslatorTranslationStatus'), 'getSnapshot', []);
}
function stageHookFeed(gameWindow: unknown, projectionLimits: GuiProjectionLimits): StagedHookFeed | typeof RUNTIME_FEED_UNAVAILABLE {
    const snapshot = readRuntimeFeedProperty(gameWindow, 'LiveTranslatorHookInstallSnapshot');
    if (!isRuntimeFeedRecord(snapshot))
        return RUNTIME_FEED_UNAVAILABLE;
    const hookFeed = admitRuntimeFeedSnapshot(snapshot, 'hook diagnostics', projectionLimits).snapshot;
    const sourceResults = readRuntimeFeedProperty(hookFeed, 'results');
    const results: GuiHookResult[] = [];
    if (runtimeFeedArrayIsArray(sourceResults)) {
        const resultCount = sourceResults.length;
        if (!runtimeFeedSafeInteger(resultCount) || resultCount > RUNTIME_HOOK_RESULT_LIMIT) {
            const limit = applyRuntimeFeedFunction(runtimeFeedString, undefined, [RUNTIME_HOOK_RESULT_LIMIT]);
            throw new RuntimeFeedError(`hook diagnostics exceeded ${limit} results`);
        }
        for (let index = 0; index < resultCount; index += 1) {
            defineGuiOwnDataProperty(results, index, normalizeHookFeedResult(sourceResults[index]));
        }
    }
    return {
        diagnosticsSurface: true,
        results,
        summary: normalizeRuntimeHookSummary(readRuntimeFeedProperty(hookFeed, 'summary'), summarizeHookResults(results)),
    };
}
function stageTextFeed(gameWindow: unknown, projectionLimits: GuiProjectionLimits): StagedTextFeed | typeof RUNTIME_FEED_UNAVAILABLE {
    let diagnostics: unknown;
    let diagnosticsFailure: unknown = null;
    try {
        diagnostics = readTextInventorySnapshot(gameWindow);
        if (isRuntimeFeedRecord(diagnostics)) {
            const admitted = admitRuntimeFeedSnapshot(diagnostics, 'text records inventory', projectionLimits).snapshot;
            const normalized = normalizeTextCoreStatus(admitted);
            return {
                diagnosticsSurface: admitted['diagnosticsSurface'] === true,
                active: normalized.active,
                attached: normalized.attached,
                detached: normalized.detached,
                archived: normalized.archived,
                summary: normalized.summary,
            };
        }
    }
    catch (error: unknown) {
        diagnosticsFailure = error;
    }
    const status = readTextStatusSnapshot(gameWindow);
    if (!isRuntimeFeedRecord(status)) {
        if (diagnosticsFailure !== null)
            throw new RuntimeFeedError(describeRuntimeFeedFailure(diagnosticsFailure));
        return RUNTIME_FEED_UNAVAILABLE;
    }
    const admitted = admitRuntimeFeedSnapshot(status, 'text records status', projectionLimits).snapshot;
    const normalized = normalizeTextCoreStatus(admitted);
    return {
        diagnosticsSurface: false,
        active: normalized.active,
        attached: normalized.attached,
        detached: normalized.detached,
        archived: normalized.archived,
        summary: normalized.summary,
    };
}
function syncTextHistoryCache(...lists: GuiTextRecord[][]): void {
    const retainedIds = new Set<string>();
    for (const list of lists) {
        for (const item of list) {
            if (!item.id)
                continue;
            retainedIds.add(item.id);
            const cached = state.textHistoryById.get(item.id);
            if (!cached)
                continue;
            item.history = cached.history;
            item.historyRetention = cached.retention;
        }
    }
    for (const itemId of state.textHistoryById.keys()) {
        if (!retainedIds.has(itemId))
            state.textHistoryById.delete(itemId);
    }
}
export function readTextRecordHistorySnapshot(gameWindow: unknown, itemId: string): UnknownRecord | null {
    const api = readTextDiagnosticsApi(gameWindow);
    const getRecordHistory = readRuntimeFeedProperty(api, 'getRecordHistory');
    if (typeof getRecordHistory !== 'function')
        return null;
    const snapshot: unknown = applyRuntimeFeedFunction(getRecordHistory, api, [itemId]);
    if (!isRuntimeFeedRecord(snapshot))
        return null;
    return admitRuntimeFeedSnapshot(snapshot, 'text record history', getConfiguredGuiProjectionLimits(TEXT_HISTORY_PROJECTION_LIMITS)).snapshot;
}
export function readTextEventLogSnapshot(gameWindow: unknown): unknown {
    const api = readTextDiagnosticsApi(gameWindow);
    const getEventLog = readRuntimeFeedProperty(api, 'getEventLog');
    return typeof getEventLog === 'function' ? applyRuntimeFeedFunction(getEventLog, api, []) : null;
}
function normalizeRuntimeHookSummary(value: unknown, fallback: GuiHookSummary): GuiHookSummary {
    if (!isRuntimeFeedRecord(value))
        return fallback;
    return {
        installed: applyRuntimeFeedFunction(runtimeFeedNumber, undefined, [readRuntimeFeedProperty(value, 'installed')]) || 0,
        skipped: applyRuntimeFeedFunction(runtimeFeedNumber, undefined, [readRuntimeFeedProperty(value, 'skipped')]) || 0,
        failed: applyRuntimeFeedFunction(runtimeFeedNumber, undefined, [readRuntimeFeedProperty(value, 'failed')]) || 0,
        total: applyRuntimeFeedFunction(runtimeFeedNumber, undefined, [readRuntimeFeedProperty(value, 'total')]) || 0,
    };
}
function callSnapshotMethod(api: unknown, methodName: string, args: readonly unknown[]): unknown {
    const method = readRuntimeFeedProperty(api, methodName);
    return typeof method === 'function' ? applyRuntimeFeedFunction(method, api, args) : undefined;
}
export function readTranslationDiagnosticsSnapshot(gameWindow: unknown, options: unknown = createGuiOwnDataRecord()): unknown {
    const api = readRuntimeFeedProperty(gameWindow, 'LiveTranslatorTranslationDiagnostics');
    const current = callSnapshotMethod(api, 'getSnapshot', [options]);
    if (current !== undefined)
        return current;
    return readRuntimeFeedProperty(gameWindow, 'LiveTranslatorTranslationDiagnosticsSnapshot');
}
export function readForesightDiagnosticsSnapshot(gameWindow: unknown): unknown {
    return readRuntimeSnapshotApi(gameWindow, 'LiveTranslatorForesightDiagnostics', 'LiveTranslatorForesightDiagnosticsSnapshot');
}
