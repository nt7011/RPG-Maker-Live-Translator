import type { GuiDrawCaptureEvent, GuiDrawCaptureTrace, GuiTranslationDiagnosticsEvent, GuiTranslationDiagnosticsJob, GuiTranslationProviderStatus, GuiTranslationDiagnosticsSnapshot, GuiTranslationDiagnosticsSubscriber, GuiTranslationStatusSnapshot, UnknownRecord, } from '../types.js';
import { copyGuiOwnDataRecord, createGuiOwnDataRecord, defineGuiOwnDataProperty, falsyFallback, isGuiArray, isUnknownRecord, stringValue, } from '../types.js';
const applyRuntimeDiagnosticFunction = Reflect.apply;
const runtimeDiagnosticNumber = Number;
const runtimeDiagnosticNumberIsFinite = Number.isFinite;
const runtimeDiagnosticNumberIsSafeInteger = Number.isSafeInteger;
const maximumRuntimeDiagnosticNumber = Math.max;
const minimumRuntimeDiagnosticNumber = Math.min;
const roundRuntimeDiagnosticNumber = Math.round;
const trimRuntimeDiagnosticString = String.prototype.trim;
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
