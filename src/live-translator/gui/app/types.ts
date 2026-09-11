import type { GuiProjectionPolicy } from '../projection.js';
export type UnknownRecord = Record<PropertyKey, unknown>;
const applyGuiTypeFunction = Reflect.apply;
const createGuiTypeObject = Object.create;
const defineGuiTypeProperty = Object.defineProperty;
const describeGuiTypeProperty = Object.getOwnPropertyDescriptor;
const listGuiTypeObjectKeys = Object.keys;
const guiTypeObjectHasOwn = Object.hasOwn;
const guiTypeArrayIsArray = Array.isArray;
const GuiTypeString = String;
const GuiTypeError = TypeError;
export type GuiRuntimeFeedName = 'settings' | 'hooks' | 'textRecords' | 'translation' | 'drawCapture' | 'foresight';
export interface GuiRuntimeFeedHealth {
    status: 'current' | 'failed' | 'unavailable';
    observedGeneration: number;
    lastSuccessGeneration: number | null;
    reason: string;
}
export type GuiRuntimeFeedHealthMap = Record<GuiRuntimeFeedName, GuiRuntimeFeedHealth>;
export function isGuiArray(value: unknown): value is unknown[] {
    return guiTypeArrayIsArray(value);
}
export function isUnknownRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !guiTypeArrayIsArray(value);
}
export function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isUnknownRecord(value) ? value[key] : undefined;
}
export function stringValue(value: unknown): string {
    try {
        const converted: unknown = applyGuiTypeFunction(GuiTypeString, undefined, [value]);
        return typeof converted === 'string' ? converted : '';
    }
    catch {
        return '';
    }
}
export function createGuiOwnDataRecord(): UnknownRecord {
    const created: unknown = applyGuiTypeFunction(createGuiTypeObject, Object, [null]);
    if (typeof created !== 'object' || created === null)
        throw new GuiTypeError('Failed to create GUI-owned record.');
    return created as UnknownRecord;
}
export function defineGuiOwnDataProperty(target: object, key: PropertyKey, value: unknown): void {
    applyGuiTypeFunction(defineGuiTypeProperty, Object, [
        target,
        key,
        {
            configurable: true,
            enumerable: true,
            value,
            writable: true,
        },
    ]);
}
export function assignGuiOwnDataRecord(target: UnknownRecord, source: unknown): UnknownRecord {
    if (!isUnknownRecord(source))
        return target;
    const keys = applyGuiTypeFunction(listGuiTypeObjectKeys, Object, [source]);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined)
            continue;
        const descriptor = applyGuiTypeFunction(describeGuiTypeProperty, Object, [source, key]);
        if (descriptor?.enumerable !== true ||
            !applyGuiTypeFunction(guiTypeObjectHasOwn, Object, [descriptor, 'value'])) {
            continue;
        }
        defineGuiOwnDataProperty(target, key, descriptor.value);
    }
    return target;
}
export function copyGuiOwnDataRecord(source: unknown): UnknownRecord {
    return assignGuiOwnDataRecord(createGuiOwnDataRecord(), source);
}
export function falsyFallback<T, F>(value: T, fallback: F): Exclude<T, false | 0 | '' | null | undefined> | F;
export function falsyFallback(value: unknown, fallback: unknown): unknown {
    if (value)
        return value;
    return fallback;
}
export function isGuiHtmlElement(value: unknown): value is HTMLElement {
    return (isUnknownRecord(value) &&
        typeof value['id'] === 'string' &&
        typeof value['addEventListener'] === 'function' &&
        typeof value['appendChild'] === 'function');
}
export function isGuiInputElement(value: unknown): value is HTMLInputElement {
    return isGuiHtmlElement(value) && typeof propertyValue(value, 'checked') === 'boolean';
}
export function isGuiDetailsElement(value: unknown): value is HTMLDetailsElement {
    return isGuiHtmlElement(value) && typeof propertyValue(value, 'open') === 'boolean';
}
export function isGuiButtonElement(value: unknown): value is HTMLButtonElement {
    return isGuiHtmlElement(value) && typeof propertyValue(value, 'disabled') === 'boolean';
}
export interface GuiDrawRun {
    type: string;
    reason: string;
    confidence: string;
    runKey: string;
    unitCount: number;
}
export interface GuiHistoryEvent {
    at: unknown;
    seq: unknown;
    id: string;
    surfaceId: string;
    adapterId: string;
    type: string;
    status: string;
    message: string;
    details: UnknownRecord;
    record: GuiTextRecord | null;
}
export interface GuiTextPolicy extends UnknownRecord {
    events?: GuiPolicyEvent[];
    last?: UnknownRecord;
    lifecycle?: UnknownRecord;
    priority?: UnknownRecord;
}
export interface GuiPolicyEvent {
    at: unknown;
    seq: unknown;
    type: string;
    message: string;
    policy: UnknownRecord;
}
export type GuiSemanticTranslationState = 'observed' | 'translating' | 'available' | 'no-translation' | 'failed';
export interface GuiTextRecord {
    id: string;
    hook: string;
    hookKey: string;
    surfaceType: string;
    original: string;
    rawText: string;
    convertedText: string;
    visibleText: string;
    translationSource: string;
    normalizedSource: string;
    status: string;
    translation: string | null;
    translationState: GuiSemanticTranslationState | null;
    policyReason: string | null;
    translationReceived: string;
    translationDrawn: string;
    firstSeenAt: unknown;
    seenAt: unknown;
    updatedAt: unknown;
    windowType: string;
    ownerType: string;
    methodName: string;
    drawRun: GuiDrawRun | null;
    x: unknown;
    y: unknown;
    bounds: UnknownRecord | null;
    onScreen: boolean | null;
    screenState: string;
    disappearedAt: unknown;
    deactivatedAt: unknown;
    lifecycleState: string;
    priority: unknown;
    backgrounded: boolean;
    active: boolean;
    policy: GuiTextPolicy;
    metadata: UnknownRecord;
    history: GuiHistoryEvent[];
    historyRetention?: GuiTextHistoryRetention;
    sourceAdapter?: string;
}
export interface GuiTextHistoryRetention {
    status: 'current' | 'failed';
    complete: boolean;
    dropped: number;
    limit: number;
    newestSequence: number | null;
    oldestSequence: number | null;
    reason: string;
    retained: number;
    updatedAt: unknown;
}
export interface GuiTextHistoryCacheEntry {
    record?: GuiTextRecord;
    history: GuiHistoryEvent[];
    retention: GuiTextHistoryRetention;
}
export interface GuiHookResult {
    name: string;
    displayName: string;
    category: string;
    module: string;
    status: string;
    reason: string;
    timestamp: unknown;
}
export interface GuiHookSummary extends Record<string, number> {
    installed: number;
    skipped: number;
    failed: number;
    total: number;
}
export interface GuiTextSummary extends Record<string, number> {
    active: number;
    attached: number;
    detached: number;
    archived: number;
}
export interface GuiTranslationDiagnosticsEvent {
    id: string;
    at: unknown;
    type: string;
    hook: string;
    jobId: string;
    subscriberId: string;
    recordId: string;
    priority: unknown;
    effectivePriority: unknown;
    reason: string;
    error: string;
    textPreview: string;
    details: UnknownRecord;
}
export interface GuiTranslationDiagnosticsSubscriber {
    id: string;
    status: string;
    recordId: string;
    hook: string;
    source: string;
    priority: number;
    stream: boolean;
    createdAt: unknown;
    lastPriorityChangedAt: unknown;
    lastPriorityReason: string;
}
export interface GuiTranslationDiagnosticsJob {
    id: string;
    status: string;
    hook: string;
    source: string;
    textPreview: string;
    textLength: number;
    createdAt: unknown;
    queuedAt: unknown;
    startedAt: unknown;
    queuePosition: number | null;
    effectivePriority: number;
    priorityBucket: string;
    stream: boolean;
    timeoutMs: number;
    attempt: number;
    retryCount: number;
    lastRetryAt: unknown;
    nextRetryDelayMs: number;
    lastDeltaAt: unknown;
    deltaCount: number;
    lastPartialLength: number;
    lastError: string;
    subscribers: number;
    totalSubscribers: number;
    subscriberRecords: GuiTranslationDiagnosticsSubscriber[];
    terminalAt: unknown;
    terminalReason: string;
    history: GuiTranslationDiagnosticsEvent[];
}
export interface GuiTranslationProviderStatus {
    kind: string;
    apiResponding: boolean;
    modelCatalogAt: unknown;
    modelCatalogError: string;
    modelCount: number;
    loadedLlmInstanceCount: number;
    modelSelectionReady: boolean;
    modelSelectionError: string;
    statusUpdatedAt: unknown;
    modelKey: string;
    modelInstanceId: string;
    modelAuthor: string;
    modelName: string;
    quantization: string;
    selectedVariant: string;
    propsAt: unknown;
    capacityError: string;
    cacheOnly: boolean;
    capacity: number;
    capacityVerified: boolean;
    capacitySource: string;
    running: number;
    available: number;
    refreshingCapacity: boolean;
    capacityExpiresAt: unknown;
    capacityRefreshMs: number;
    lastCapacityRefreshAt: unknown;
    lastCapacityRefreshError: string;
}
export interface GuiTranslationStatusSnapshot {
    updatedAt: unknown;
    provider: GuiTranslationProviderStatus;
    summary: UnknownRecord;
    cache: UnknownRecord;
}
export interface GuiTranslationDiagnosticsSnapshot extends GuiTranslationStatusSnapshot {
    jobs: {
        running: GuiTranslationDiagnosticsJob[];
        queued: GuiTranslationDiagnosticsJob[];
        past: GuiTranslationDiagnosticsJob[];
    };
    priorityBuckets: UnknownRecord[];
    hooks: UnknownRecord[];
    counters: UnknownRecord;
    events: GuiTranslationDiagnosticsEvent[];
    diagnosticsSurface: boolean;
}
export interface GuiDrawCaptureEvent {
    seq: unknown;
    at: unknown;
    stage: string;
    adapter: string;
    methodName: string;
    rawText: string;
    visibleText: string;
    normalizedText: string;
    reason: string;
    category: string;
    status: string;
    windowType: string;
    ownerType: string;
    recordId: string;
    slotKey: string;
    x: unknown;
    y: unknown;
    maxWidth: unknown;
    lineHeight: unknown;
    align: string;
    bounds: UnknownRecord | null;
    details: UnknownRecord;
}
export interface GuiDrawCaptureTrace {
    updatedAt: unknown;
    enabled: boolean;
    limit: number;
    size: number;
    sequence: number;
    filters: UnknownRecord;
    summary: UnknownRecord;
    events: GuiDrawCaptureEvent[];
}
export type GuiForesightValue = string | number | boolean | null | undefined | GuiForesightValue[] | UnknownRecord;
export interface GuiForesightAction extends UnknownRecord {
    index: number | null;
    code: number | null;
    label: string;
    classification: string;
    native: boolean;
    category: string;
    scanBehavior: string;
    action: string;
    stalenessRisk: string;
    stopReason: string;
    stopReasonLabel: string;
    summary: string;
    priorityDistance: number | null;
    branchDepth: number;
    branchPath: number[];
    branches: GuiForesightValue[];
}
export interface GuiForesightScan extends UnknownRecord {
    at: unknown;
    interpreterId: string;
    status: string;
    matchedCurrentMessage: boolean;
    startIndex: number | null;
    stopIndex: number | null;
    stopReason: string;
    stopReasonLabel: string;
    barrierCode: number | null;
    barrierLabel: string;
    budget: UnknownRecord;
    scannedCommands: number;
    advancedCommands: number;
    staleRiskCommands: number;
    blocks: number;
    routeCommands: number;
    routeBarriers: number;
    routeBarrierCode: number | null;
    routeBarrierLabel: string;
    routeBarrierReason: string;
    pathStops: GuiForesightValue[];
    commandActionLimit: number;
    commandActionsTruncated: number;
    commandActions: GuiForesightAction[];
}
export interface GuiForesightSnapshot {
    updatedAt: unknown;
    summary: UnknownRecord | null;
    recent: GuiForesightScan[];
    diagnosticsSurface: boolean;
}
export interface GuiRuntimeContext extends UnknownRecord {
    supportPath?: string;
    gameRoot?: string;
    translationCacheFile?: string;
    closeWithGame?: boolean;
    gameRootReady?: boolean | null;
    supportPathReady?: boolean | null;
    ready?: boolean | null;
}
export interface GuiConfiguredPolicy {
    source: {
        settingsSource: string;
        settingsError: string;
    };
    lifecycle: {
        disableLiveTranslatorGui: boolean;
        supportPath: string;
        gameRoot: string;
        translationCacheFile: string;
        closeWithGame: boolean;
    };
    updates: {
        checkUpdates: boolean;
        versionCheckUrl: string;
        updatePageUrl: string;
        intervalMs: number;
        timeoutMs: number;
        maxBytes: number;
        maxRedirects: number;
    };
    diagnostics: {
        enabled: boolean;
        captureWhenGuiClosed: boolean;
        limits: GuiDiagnosticsLimits;
        guiProjection: GuiProjectionPolicy;
    };
    drawCaptureTrace: {
        enabled: boolean;
        recordOnlyCjk: boolean;
        recordAll: boolean;
        limit: number | null;
        targetTexts: string[];
    };
    foresight: {
        enabled: boolean;
        showSpoilers: boolean;
        actionDisplayLimit: number;
    };
    textRecords: {
        inactiveDisplayLimit: number;
    };
}
export interface GuiDiagnosticsLimits {
    foresightScans: number;
    foresightMessages: number;
    archivedItems: number;
    detachedItems: number;
    pastJobs: number;
}
export interface GuiRuntimeState {
    context: GuiRuntimeContext;
    versions: {
        installedVersion: string;
        latestVersion: string;
        updateCheckStatus: string;
        updateCheckMessage: string;
        updateCheckError: string;
        updateCheckInFlight: boolean;
    };
    hooks: {
        results: GuiHookResult[];
        summary: GuiHookSummary | null;
        diagnosticsSurface: boolean;
    };
    textRecords: {
        summary: GuiTextSummary | null;
        diagnosticsSurface: boolean;
    };
    translationDiagnostics: GuiTranslationDiagnosticsSnapshot | null;
    provider: GuiTranslationProviderStatus | null;
    drawCaptureTrace: GuiDrawCaptureTrace | null;
    foresight: GuiForesightSnapshot | null;
    providerLabel: string;
}
export interface GuiViewState {
    foresight: {
        messagesOnly: boolean;
    };
    textRecords: {
        selectedDetailKey: string;
    };
    logs: {
        count: number;
    };
}
export interface GuiEffectivePolicy {
    runtimeContext: GuiRuntimeContextPolicy;
    updates: {
        checkUpdates: boolean;
        status: string;
        inFlight: boolean;
        statusVisible: boolean;
    };
    diagnostics: {
        enabled: boolean;
        surfaceEnabled: boolean;
        detailsEnabled: boolean;
        snapshotRequest: {
            forceDiagnosticsSurface: true;
            activeJobLimit: number;
            eventLimit: number;
            jobHistoryLimit: number;
            pastJobLimit: number;
            subscriberRecordLimit: number;
        };
        limits: GuiDiagnosticsLimits;
    };
    hookInstallation: {
        panelVisible: boolean;
    };
    drawCaptureTrace: {
        enabled: boolean;
        panelVisible: boolean;
        copyEnabled: boolean;
        disabledReason: string;
        eventDisplayLimit: number;
    };
    foresight: {
        configuredEnabled: boolean;
        controlsEnabled: boolean;
        visible: boolean;
        messagesOnly: boolean;
        showSpoilers: boolean;
        actionDisplayLimit: number;
        disabledReason: string;
        messageFilterTitle: string;
    };
    textRecords: {
        detailsEnabled: boolean;
        historyVisible: boolean;
        inactiveDisplayLimit: number;
        showForesightSpoilers: boolean;
        selectedDetailKey: string;
    };
}
export interface GuiRuntimeContextPolicy {
    gameRootReady: boolean;
    supportPathReady: boolean;
    closeWithGame: boolean;
    ready: boolean;
    summaryTone: 'ok' | 'warn';
    summaryText: 'ready' | 'needs attention';
    gameRootTone: 'ok' | 'warn';
    gameRootText: 'ready' | 'unknown';
    supportPathTone: 'ok' | 'bad';
    supportPathText: 'ready' | 'missing';
    closeWithGameTone: 'ok' | 'warn';
    closeWithGameText: 'linked' | 'unlinked';
}
export interface GuiStatusSummaryModel {
    tone: 'bad' | 'warn' | 'ok';
    text: string;
    openDefault: boolean;
    defaultKey: string;
}
export interface GuiPolicySnapshot {
    configuredPolicy: GuiConfiguredPolicy;
    runtimeState: GuiRuntimeState;
    viewState: GuiViewState;
    effectivePolicy: GuiEffectivePolicy;
}
export interface GuiResourceSnapshot {
    probe: string | null;
    generation: number;
    active: boolean;
    consistent: boolean;
    allocatedBytes: number;
    peakBytes: number;
    memory: {
        name: string;
        label: string;
        bytes: number;
    }[];
    limits: {
        name: string;
        label: string;
        unit: 'bytes' | 'px' | 'count';
        value: number;
        limit: number | null;
        peak: number;
        refusals: number;
        lastRequested: number | null;
        lastRefusedAt: number | null;
    }[];
}
