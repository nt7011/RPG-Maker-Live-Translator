import type { GuiDrawCaptureEvent, GuiDrawCaptureTrace, GuiForesightAction, GuiForesightScan, GuiForesightSnapshot, GuiForesightValue, GuiTranslationDiagnosticsEvent, GuiTranslationDiagnosticsJob, GuiTranslationProviderStatus, GuiTranslationDiagnosticsSnapshot, GuiTranslationDiagnosticsSubscriber, GuiTranslationStatusSnapshot, UnknownRecord, } from '../types.js';
import { copyGuiOwnDataRecord, createGuiOwnDataRecord, defineGuiOwnDataProperty, falsyFallback, isGuiArray, isUnknownRecord, stringValue, } from '../types.js';
const applyRuntimeDiagnosticFunction = Reflect.apply;
const listRuntimeDiagnosticKeys = Object.keys;
const runtimeDiagnosticNumber = Number;
const runtimeDiagnosticNumberIsFinite = Number.isFinite;
const runtimeDiagnosticNumberIsSafeInteger = Number.isSafeInteger;
const maximumRuntimeDiagnosticNumber = Math.max;
const minimumRuntimeDiagnosticNumber = Math.min;
const roundRuntimeDiagnosticNumber = Math.round;
const trimRuntimeDiagnosticString = String.prototype.trim;
const RUNTIME_FORESIGHT_VALUE_LIST_LIMIT = 32;
function mapRuntimeDiagnosticList<Output>(value: unknown, normalize: (entry: unknown) => Output, limit = Number.MAX_SAFE_INTEGER): Output[] {
    if (!isGuiArray(value))
        return [];
    const sourceLength = value.length;
    if (!runtimeDiagnosticNumberIsSafeInteger(sourceLength) || sourceLength < 0)
        return [];
    const length = minimumRuntimeDiagnosticNumber(sourceLength, limit);
    const normalized: Output[] = [];
    for (let index = 0; index < length; index += 1) {
        defineGuiOwnDataProperty(normalized, index, normalize(value[index]));
    }
    return normalized;
}
export function normalizeTranslationDiagnosticsSnapshot(snapshot: unknown): GuiTranslationDiagnosticsSnapshot | null {
    if (!isUnknownRecord(snapshot))
        return null;
    const source = snapshot;
    const jobs = isUnknownRecord(source['jobs']) ? source['jobs'] : createGuiOwnDataRecord();
    return {
        ...normalizeTranslationStatusSource(source),
        jobs: {
            running: mapRuntimeDiagnosticList(jobs['running'], normalizeTranslationDiagnosticsJob),
            queued: mapRuntimeDiagnosticList(jobs['queued'], normalizeTranslationDiagnosticsJob),
            past: mapRuntimeDiagnosticList(jobs['past'], normalizeTranslationDiagnosticsJob),
        },
        priorityBuckets: mapRuntimeDiagnosticList(source['priorityBuckets'], normalizeBreakdownRow),
        hooks: mapRuntimeDiagnosticList(source['hooks'], normalizeBreakdownRow),
        counters: copyGuiOwnDataRecord(source['counters']),
        events: mapRuntimeDiagnosticList(source['events'], normalizeTranslationDiagnosticsEvent),
        diagnosticsSurface: source['diagnosticsSurface'] === true,
    };
}
export function normalizeTranslationStatusSnapshot(snapshot: unknown): GuiTranslationStatusSnapshot | null {
    return isUnknownRecord(snapshot) ? normalizeTranslationStatusSource(snapshot) : null;
}
function normalizeTranslationStatusSource(source: UnknownRecord): GuiTranslationStatusSnapshot {
    return {
        updatedAt: falsyFallback(source['updatedAt'], null),
        provider: normalizeTranslationProviderStatus(source['provider']),
        summary: normalizeTranslationSummary(source['summary']),
        cache: normalizeTranslationCache(source['cache']),
    };
}
export function normalizeDrawCaptureTraceSnapshot(snapshot: unknown): GuiDrawCaptureTrace | null {
    if (!isUnknownRecord(snapshot))
        return null;
    return {
        updatedAt: falsyFallback(snapshot['updatedAt'], null),
        enabled: snapshot['enabled'] !== false,
        limit: normalizeInteger(snapshot['limit']),
        size: normalizeInteger(snapshot['size']),
        sequence: normalizeInteger(snapshot['sequence']),
        filters: copyGuiOwnDataRecord(snapshot['filters']),
        summary: copyGuiOwnDataRecord(snapshot['summary']),
        events: mapRuntimeDiagnosticList(snapshot['events'], normalizeDrawCaptureTraceEvent),
    };
}
export function normalizeDrawCaptureTraceEvent(event: unknown): GuiDrawCaptureEvent {
    const source = isUnknownRecord(event) ? event : createGuiOwnDataRecord();
    return {
        seq: falsyFallback(source['seq'], null),
        at: falsyFallback(source['at'], null),
        stage: source['stage'] ? stringValue(source['stage']) : 'draw',
        adapter: source['adapter'] ? stringValue(source['adapter']) : '',
        methodName: source['methodName'] ? stringValue(source['methodName']) : '',
        rawText: source['rawText'] ? stringValue(source['rawText']) : '',
        visibleText: source['visibleText'] ? stringValue(source['visibleText']) : '',
        normalizedText: source['normalizedText'] ? stringValue(source['normalizedText']) : '',
        reason: source['reason'] ? stringValue(source['reason']) : '',
        category: source['category'] ? stringValue(source['category']) : '',
        status: source['status'] ? stringValue(source['status']) : '',
        windowType: source['windowType'] ? stringValue(source['windowType']) : '',
        ownerType: source['ownerType'] ? stringValue(source['ownerType']) : '',
        recordId: source['recordId'] ? stringValue(source['recordId']) : '',
        slotKey: source['slotKey'] ? stringValue(source['slotKey']) : '',
        x: source['x'],
        y: source['y'],
        maxWidth: source['maxWidth'],
        lineHeight: source['lineHeight'],
        align: source['align'] ? stringValue(source['align']) : '',
        bounds: isUnknownRecord(source['bounds']) ? copyGuiOwnDataRecord(source['bounds']) : null,
        details: copyGuiOwnDataRecord(source),
    };
}
export function normalizeForesightSnapshot(snapshot: unknown): GuiForesightSnapshot | null {
    if (!isUnknownRecord(snapshot))
        return null;
    return {
        updatedAt: falsyFallback(snapshot['updatedAt'], null),
        summary: isUnknownRecord(snapshot['summary']) ? copyGuiOwnDataRecord(snapshot['summary']) : null,
        recent: mapRuntimeDiagnosticList(snapshot['recent'], normalizeForesightScan),
        diagnosticsSurface: snapshot['diagnosticsSurface'] === true,
    };
}
export function normalizeForesightScan(scan: unknown): GuiForesightScan {
    const source = isUnknownRecord(scan) ? scan : createGuiOwnDataRecord();
    return {
        at: falsyFallback(source['at'], null),
        interpreterId: source['interpreterId'] ? stringValue(source['interpreterId']) : '',
        status: source['status'] ? stringValue(source['status']) : 'scanned',
        matchedCurrentMessage: source['matchedCurrentMessage'] === true,
        startIndex: normalizeNullableInteger(source['startIndex']),
        stopIndex: normalizeNullableInteger(source['stopIndex']),
        stopReason: source['stopReason'] ? stringValue(source['stopReason']) : '',
        stopReasonLabel: source['stopReasonLabel'] ? stringValue(source['stopReasonLabel']) : '',
        barrierCode: normalizeNullableInteger(source['barrierCode']),
        barrierLabel: source['barrierLabel'] ? stringValue(source['barrierLabel']) : '',
        budget: clonePlainObject(source['budget']),
        scannedCommands: normalizeInteger(source['scannedCommands']),
        advancedCommands: normalizeInteger(source['advancedCommands']),
        staleRiskCommands: normalizeInteger(source['staleRiskCommands']),
        staleRiskCommandCounts: clonePlainObject(source['staleRiskCommandCounts']),
        staleRiskCommandLabels: clonePlainObject(source['staleRiskCommandLabels']),
        blocks: normalizeInteger(source['blocks']),
        routeCommands: normalizeInteger(source['routeCommands']),
        routeBarriers: normalizeInteger(source['routeBarriers']),
        routeBarrierCode: normalizeNullableInteger(source['routeBarrierCode']),
        routeBarrierLabel: source['routeBarrierLabel'] ? stringValue(source['routeBarrierLabel']) : '',
        routeBarrierReason: source['routeBarrierReason'] ? stringValue(source['routeBarrierReason']) : '',
        transparentCommands: clonePlainObject(source['transparentCommands']),
        transparentCommandLabels: clonePlainObject(source['transparentCommandLabels']),
        pathStops: cloneForesightList(source['pathStops']),
        commandActionLimit: normalizeInteger(source['commandActionLimit']),
        commandActionsTruncated: normalizeInteger(source['commandActionsTruncated']),
        commandActions: mapRuntimeDiagnosticList(source['commandActions'], normalizeForesightCommandAction),
    };
}
export function normalizeForesightCommandAction(action: unknown): GuiForesightAction {
    const source = isUnknownRecord(action) ? action : createGuiOwnDataRecord();
    return {
        index: normalizeNullableInteger(source['index']),
        code: normalizeNullableInteger(source['code']),
        label: source['label'] ? stringValue(source['label']) : '',
        classification: source['classification'] ? stringValue(source['classification']) : '',
        native: source['native'] === true,
        category: source['category'] ? stringValue(source['category']) : '',
        scanBehavior: source['scanBehavior'] ? stringValue(source['scanBehavior']) : '',
        action: source['action'] ? stringValue(source['action']) : '',
        stalenessRisk: source['stalenessRisk'] ? stringValue(source['stalenessRisk']) : '',
        stopReason: source['stopReason'] ? stringValue(source['stopReason']) : '',
        stopReasonLabel: source['stopReasonLabel'] ? stringValue(source['stopReasonLabel']) : '',
        summary: source['summary'] ? stringValue(source['summary']) : '',
        priorityDistance: normalizeNullableInteger(source['priorityDistance']),
        branchDepth: normalizeInteger(source['branchDepth']),
        branchPath: normalizeForesightBranchPath(source['branchPath']),
        listContext: cloneForesightValue(source['listContext'], 0),
        nestedList: cloneForesightValue(source['nestedList'], 0),
        budget: cloneForesightValue(source['budget'], 0),
        consumedCommands: cloneForesightList(source['consumedCommands']),
        routeCommandActions: cloneForesightList(source['routeCommandActions']),
        controlFlowTarget: cloneForesightValue(source['controlFlowTarget'], 0),
        branches: cloneForesightList(source['branches']),
    };
}
export function cloneForesightList(value: unknown): GuiForesightValue[] {
    return mapRuntimeDiagnosticList(value, (entry) => cloneForesightValue(entry, 0));
}
export function cloneForesightValue(value: unknown, depth: number): GuiForesightValue {
    if (value === null || value === undefined)
        return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (depth >= 4)
        return '[Object]';
    if (isGuiArray(value)) {
        return mapRuntimeDiagnosticList(value, (entry) => cloneForesightValue(entry, depth + 1), RUNTIME_FORESIGHT_VALUE_LIST_LIMIT);
    }
    if (!isUnknownRecord(value))
        return stringValue(value);
    const result = createGuiOwnDataRecord();
    const keys = applyRuntimeDiagnosticFunction(listRuntimeDiagnosticKeys, Object, [value]);
    const length = minimumRuntimeDiagnosticNumber(keys.length, RUNTIME_FORESIGHT_VALUE_LIST_LIMIT);
    for (let index = 0; index < length; index += 1) {
        const key = keys[index];
        if (key !== undefined)
            defineGuiOwnDataProperty(result, key, cloneForesightValue(value[key], depth + 1));
    }
    return result;
}
export function clonePlainObject(value: unknown): UnknownRecord {
    const result = createGuiOwnDataRecord();
    if (!isUnknownRecord(value))
        return result;
    const keys = applyRuntimeDiagnosticFunction(listRuntimeDiagnosticKeys, Object, [value]);
    const length = keys.length;
    for (let index = 0; index < length; index += 1) {
        const key = keys[index];
        if (key === undefined)
            continue;
        const entry = value[key];
        if (entry === null || entry === undefined)
            continue;
        defineGuiOwnDataProperty(result, key, typeof entry === 'object' ? cloneForesightValue(entry, 0) : entry);
    }
    return result;
}
export function normalizeNullableInteger(value: unknown): number | null {
    if (value === null ||
        value === undefined ||
        (typeof value === 'string' && applyRuntimeDiagnosticFunction(trimRuntimeDiagnosticString, value, []) === '')) {
        return null;
    }
    const numeric = applyRuntimeDiagnosticFunction(runtimeDiagnosticNumber, undefined, [value]);
    return runtimeDiagnosticNumberIsFinite(numeric) ? roundRuntimeDiagnosticNumber(numeric) : null;
}
export function normalizeTranslationProviderStatus(provider: unknown): GuiTranslationProviderStatus {
    const source = isUnknownRecord(provider) ? provider : createGuiOwnDataRecord();
    const compactConnection = source['connection'] ? stringValue(source['connection']) : '';
    const compactModel = source['model'] ? stringValue(source['model']) : '';
    const compactReady = compactConnection === 'connected' || compactConnection === 'ready';
    return {
        kind: source['kind'] ? stringValue(source['kind']) : '',
        apiResponding: source['apiResponding'] === true || compactReady,
        modelCatalogAt: falsyFallback(source['modelCatalogAt'], null),
        modelCatalogError: source['modelCatalogError'] ? stringValue(source['modelCatalogError']) : '',
        modelCount: normalizeInteger(source['modelCount']),
        loadedLlmInstanceCount: normalizeInteger(source['loadedLlmInstanceCount']),
        modelSelectionReady: source['modelSelectionReady'] === true || (compactReady && compactModel !== ''),
        modelSelectionError: source['modelSelectionError'] ? stringValue(source['modelSelectionError']) : '',
        statusUpdatedAt: falsyFallback(source['statusUpdatedAt'], null),
        modelKey: source['modelKey'] ? stringValue(source['modelKey']) : '',
        modelInstanceId: source['modelInstanceId'] ? stringValue(source['modelInstanceId']) : '',
        modelAuthor: source['modelAuthor'] ? stringValue(source['modelAuthor']) : '',
        modelName: source['modelName'] ? stringValue(source['modelName']) : compactModel,
        quantization: source['quantization'] ? stringValue(source['quantization']) : '',
        selectedVariant: source['selectedVariant'] ? stringValue(source['selectedVariant']) : '',
        propsAt: falsyFallback(source['propsAt'], null),
        capacityError: source['capacityError'] ? stringValue(source['capacityError']) : '',
        cacheOnly: source['cacheOnly'] === true,
        capacity: normalizeInteger(source['capacity']),
        capacityVerified: source['capacityVerified'] === true || compactReady,
        capacitySource: source['capacitySource'] ? stringValue(source['capacitySource']) : '',
        running: normalizeInteger(source['running']),
        available: normalizeInteger(source['available']),
        refreshingCapacity: source['refreshingCapacity'] === true,
        capacityExpiresAt: falsyFallback(source['capacityExpiresAt'], null),
        capacityRefreshMs: normalizeInteger(source['capacityRefreshMs']),
        lastCapacityRefreshAt: falsyFallback(source['lastCapacityRefreshAt'], null),
        lastCapacityRefreshError: source['lastCapacityRefreshError']
            ? stringValue(source['lastCapacityRefreshError'])
            : '',
    };
}
export function normalizeTranslationSummary(summary: unknown): UnknownRecord {
    const source = isUnknownRecord(summary) ? summary : createGuiOwnDataRecord();
    return {
        queued: normalizeInteger(source['queued']),
        running: normalizeInteger(source['running']),
        jobs: normalizeInteger(source['jobs']),
        pastJobs: normalizeInteger(source['pastJobs']),
        activeSubscribers: normalizeInteger(source['activeSubscribers']),
        subscribers: normalizeInteger(source['subscribers']),
        streamJobs: normalizeInteger(source['streamJobs']),
        streamRunning: normalizeInteger(source['streamRunning']),
        completedCacheEntries: normalizeInteger(source['completedCacheEntries']),
        pumpScheduled: source['pumpScheduled'] === true,
        pumpRunning: source['pumpRunning'] === true,
    };
}
export function normalizeTranslationCache(cache: unknown): UnknownRecord {
    const source = isUnknownRecord(cache) ? cache : createGuiOwnDataRecord();
    return {
        completed: normalizeInteger(source['completed']),
        diskEnabled: source['diskEnabled'] === true,
    };
}
export function normalizeTranslationDiagnosticsJob(job: unknown): GuiTranslationDiagnosticsJob {
    const source = isUnknownRecord(job) ? job : createGuiOwnDataRecord();
    return {
        id: source['id'] ? stringValue(source['id']) : '',
        status: source['status'] ? stringValue(source['status']) : '',
        hook: source['hook'] ? stringValue(source['hook']) : '',
        source: source['source'] ? stringValue(source['source']) : '',
        textPreview: source['textPreview'] ? stringValue(source['textPreview']) : '',
        textLength: normalizeInteger(source['textLength']),
        createdAt: falsyFallback(source['createdAt'], null),
        queuedAt: falsyFallback(source['queuedAt'], falsyFallback(source['createdAt'], null)),
        startedAt: falsyFallback(source['startedAt'], null),
        queuePosition: source['queuePosition'] === null || source['queuePosition'] === undefined
            ? null
            : normalizeInteger(source['queuePosition']),
        effectivePriority: normalizeInteger(source['effectivePriority']),
        priorityBucket: source['priorityBucket'] ? stringValue(source['priorityBucket']) : '',
        stream: source['stream'] === true,
        timeoutMs: normalizeInteger(source['timeoutMs']),
        attempt: normalizeInteger(source['attempt']),
        retryCount: normalizeInteger(source['retryCount']),
        lastRetryAt: falsyFallback(source['lastRetryAt'], null),
        nextRetryDelayMs: normalizeInteger(source['nextRetryDelayMs']),
        lastDeltaAt: falsyFallback(source['lastDeltaAt'], null),
        deltaCount: normalizeInteger(source['deltaCount']),
        lastPartialLength: normalizeInteger(source['lastPartialLength']),
        lastError: source['lastError'] ? stringValue(source['lastError']) : '',
        subscribers: normalizeInteger(source['subscribers']),
        totalSubscribers: normalizeInteger(source['totalSubscribers']),
        subscriberRecords: mapRuntimeDiagnosticList(source['subscriberRecords'], normalizeTranslationDiagnosticsSubscriberRecord),
        terminalAt: falsyFallback(source['terminalAt'], null),
        terminalReason: source['terminalReason'] ? stringValue(source['terminalReason']) : '',
        history: mapRuntimeDiagnosticList(source['history'], normalizeTranslationDiagnosticsEvent),
    };
}
export function normalizeTranslationDiagnosticsSubscriberRecord(record: unknown): GuiTranslationDiagnosticsSubscriber {
    const source = isUnknownRecord(record) ? record : createGuiOwnDataRecord();
    return {
        id: source['id'] ? stringValue(source['id']) : '',
        status: source['status'] ? stringValue(source['status']) : '',
        recordId: source['recordId'] ? stringValue(source['recordId']) : '',
        hook: source['hook'] ? stringValue(source['hook']) : '',
        source: source['source'] ? stringValue(source['source']) : '',
        priority: normalizeInteger(source['priority']),
        stream: source['stream'] === true,
        createdAt: falsyFallback(source['createdAt'], null),
        lastPriorityChangedAt: falsyFallback(source['lastPriorityChangedAt'], null),
        lastPriorityReason: source['lastPriorityReason'] ? stringValue(source['lastPriorityReason']) : '',
    };
}
export function normalizeBreakdownRow(row: unknown): UnknownRecord {
    const source = isUnknownRecord(row) ? row : createGuiOwnDataRecord();
    return {
        name: source['name'] ? stringValue(source['name']) : 'unknown',
        queued: normalizeInteger(source['queued']),
        running: normalizeInteger(source['running']),
        stream: normalizeInteger(source['stream']),
        subscribers: normalizeInteger(source['subscribers']),
    };
}
export function normalizeTranslationDiagnosticsEvent(event: unknown): GuiTranslationDiagnosticsEvent {
    const source = isUnknownRecord(event) ? event : createGuiOwnDataRecord();
    return {
        id: source['id'] ? stringValue(source['id']) : '',
        at: falsyFallback(source['at'], null),
        type: source['type'] ? stringValue(source['type']) : 'event',
        hook: source['hook'] ? stringValue(source['hook']) : '',
        jobId: source['jobId'] ? stringValue(source['jobId']) : '',
        subscriberId: source['subscriberId'] ? stringValue(source['subscriberId']) : '',
        recordId: source['recordId'] ? stringValue(source['recordId']) : '',
        priority: source['priority'],
        effectivePriority: source['effectivePriority'],
        reason: source['reason'] ? stringValue(source['reason']) : '',
        error: source['error'] ? stringValue(source['error']) : '',
        textPreview: source['textPreview'] ? stringValue(source['textPreview']) : '',
        details: copyGuiOwnDataRecord(source),
    };
}
export function normalizeInteger(value: unknown): number {
    const numeric = applyRuntimeDiagnosticFunction(runtimeDiagnosticNumber, undefined, [value]);
    return runtimeDiagnosticNumberIsFinite(numeric)
        ? maximumRuntimeDiagnosticNumber(0, roundRuntimeDiagnosticNumber(numeric))
        : 0;
}
function normalizeForesightBranchPath(value: unknown): number[] {
    const path = mapRuntimeDiagnosticList(value, normalizeNullableInteger);
    const normalized: number[] = [];
    let outputIndex = 0;
    for (let index = 0; index < path.length; index += 1) {
        const entry = path[index];
        if (entry === null || entry === undefined)
            continue;
        defineGuiOwnDataProperty(normalized, outputIndex, entry);
        outputIndex += 1;
    }
    return normalized;
}
