import { renderLagIncidentsPanel } from './lag-incidents-panel.js';
import { renderResourcePanel } from './resource-panel.js';
import { readLagIncidents } from './lag-incidents-feed.js';
import { createTextRecordRowRenderKey, renderTextRecordSections } from '../text-records/lists.js';
import { getTextRecordKey } from '../text-records/identity.js';
import { getSelectedTextRecordKey } from '../text-records/view-model.js';
import { refreshGuiPolicySnapshot } from '../policy.js';
import { renderDrawCaptureTracePanel } from './rejected-bitmap-text-panel.js';
import { state } from '../state.js';
import type { GuiResourceSnapshot, GuiDrawCaptureEvent, GuiDrawCaptureTrace, GuiHistoryEvent, GuiTextHistoryCacheEntry, GuiTextHistoryRetention, GuiTextRecord, GuiSemanticTranslationState, UnknownRecord, } from '../types.js';
import { createGuiOwnDataRecord, isGuiArray } from '../types.js';
export const GUI_DIAGNOSTICS_SINK_PROPERTY = 'LiveTranslatorGuiDiagnosticsSink';
export interface GuiDiagnosticsPushSink {
    readonly accept: (message: unknown) => void;
}
function renderDiagnosticsFeed(): void {
    const policy = refreshGuiPolicySnapshot();
    renderTextRecordSections(policy);
    renderDrawCaptureTracePanel(policy);
    renderResourcePanel();
    renderLagIncidentsPanel();
}
type ItemKind = 'bitmap-text' | 'runtime';
type ItemStatus = 'observed' | 'translating' | 'translated' | 'noop' | 'drawn' | 'invalidated' | 'released' | 'failed';
type EventLevel = 'info' | 'warn' | 'error';
type DiagnosticScalar = string | number | boolean | null;
interface CurrentItem {
    readonly id: string;
    readonly kind: ItemKind;
    readonly coreGeneration: number | null;
    readonly textId: number | null;
    readonly revision: number | null;
    readonly attempt: number | null;
    readonly failure: readonly UnknownRecord[];
    readonly semanticContext: readonly UnknownRecord[];
    readonly translator: readonly UnknownRecord[];
    readonly physicalTextId: number | null;
    readonly physicalRevision: number | null;
    readonly bitmapId: number | null;
    readonly surfaceId: number | null;
    readonly bitmapMutationSequence: number | null;
    readonly surfaceMutationSequence: number | null;
    readonly requestPriority: number | null;
    readonly requestStream: boolean | null;
    readonly requestId: string;
    readonly jobId: string;
    readonly sourceText: string;
    readonly translation: string | null;
    readonly translationState: GuiSemanticTranslationState | null;
    readonly policyReason: string | null;
    readonly status: ItemStatus;
    readonly latestMessage: string;
    readonly firstObservedAt: number;
    readonly updatedAt: number;
}
interface Retention {
    readonly complete: boolean;
    readonly dropped: number;
    readonly limit: number;
}
const ITEM_INPUT_LIMIT = 256;
const EVENT_INPUT_LIMIT = 80;
const BITMAP_TEXT_REJECTION_INPUT_LIMIT = 4096;
const BITMAP_TEXT_REJECTION_SUMMARY_INPUT_LIMIT = 32;
const FIELD_INPUT_LIMIT = 32;
const ID_LIMIT = 256;
const describePushProperty = Object.getOwnPropertyDescriptor;
const pushObjectHasOwn = Object.hasOwn;
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function ownDataValue(value: unknown, key: PropertyKey): unknown {
    if (!isObjectReference(value))
        return undefined;
    try {
        const descriptor = describePushProperty(value, key);
        return descriptor && pushObjectHasOwn(descriptor, 'value') ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function nonNegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function positiveSafeInteger(value: unknown): value is number {
    return nonNegativeSafeInteger(value) && value > 0;
}
function nullablePositiveSafeInteger(value: unknown): value is number | null {
    return value === null || positiveSafeInteger(value);
}
function finiteTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function boundedArrayLength(value: unknown, limit: number): number | null {
    if (!isGuiArray(value))
        return null;
    const length = ownDataValue(value, 'length');
    return nonNegativeSafeInteger(length) && length <= limit ? length : null;
}
function isItemStatus(value: unknown): value is ItemStatus {
    return (value === 'observed' ||
        value === 'translating' ||
        value === 'translated' ||
        value === 'noop' ||
        value === 'drawn' ||
        value === 'invalidated' ||
        value === 'released' ||
        value === 'failed');
}
function isEventLevel(value: unknown): value is EventLevel {
    return value === 'info' || value === 'warn' || value === 'error';
}
function isEventType(value: unknown): value is string {
    return (value === 'record.observed' ||
        value === 'record.changed' ||
        value === 'semantic.context' ||
        value === 'lifecycle.ignored' ||
        value === 'translation.requested' ||
        value === 'translation.available' ||
        value === 'translation.exchange' ||
        value === 'translation.noop' ||
        value === 'translation.rejected' ||
        value === 'translation.superseded' ||
        value === 'presentation.drawn' ||
        value === 'presentation.rejected' ||
        value === 'presentation.invalidated' ||
        value === 'record.released' ||
        value === 'failure' ||
        value === 'runtime.event');
}
function isDiagnosticScalar(value: unknown): value is DiagnosticScalar {
    return (value === null ||
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        typeof value === 'boolean');
}
function readFields(fields: unknown): UnknownRecord[] | null {
    const fieldCount = boundedArrayLength(fields, FIELD_INPUT_LIMIT);
    if (fieldCount === null)
        return null;
    const copiedFields: UnknownRecord[] = [];
    for (let index = 0; index < fieldCount; index += 1) {
        const field = ownDataValue(fields, index);
        const name = ownDataValue(field, 'name');
        const scalar = ownDataValue(field, 'value');
        if (typeof name !== 'string' || name.length === 0 || name.length > ID_LIMIT || !isDiagnosticScalar(scalar)) {
            return null;
        }
        const copiedField = createGuiOwnDataRecord();
        copiedField['name'] = name;
        copiedField['value'] = scalar;
        copiedFields.push(copiedField);
    }
    return copiedFields;
}
function readCurrent(value: unknown): CurrentItem | null {
    const id = ownDataValue(value, 'id');
    const kind = ownDataValue(value, 'kind');
    const coreGeneration = ownDataValue(value, 'coreGeneration');
    const textId = ownDataValue(value, 'textId');
    const itemRevision = ownDataValue(value, 'revision');
    const attempt = ownDataValue(value, 'attempt');
    const failure = readFields(ownDataValue(value, 'failure'));
    const semanticContext = readFields(ownDataValue(value, 'semanticContext'));
    const translator = readFields(ownDataValue(value, 'translator'));
    const physicalTextId = ownDataValue(value, 'physicalTextId');
    const physicalRevision = ownDataValue(value, 'physicalRevision');
    const bitmapId = ownDataValue(value, 'bitmapId');
    const surfaceId = ownDataValue(value, 'surfaceId');
    const bitmapMutationSequence = ownDataValue(value, 'bitmapMutationSequence');
    const surfaceMutationSequence = ownDataValue(value, 'surfaceMutationSequence');
    const requestPriority = ownDataValue(value, 'requestPriority');
    const requestStream = ownDataValue(value, 'requestStream');
    const requestId = ownDataValue(value, 'requestId');
    const jobId = ownDataValue(value, 'jobId');
    const sourceText = ownDataValue(value, 'sourceText');
    const translation = ownDataValue(value, 'translation');
    const translationState = ownDataValue(value, 'translationState');
    const policyReason = ownDataValue(value, 'policyReason');
    const status = ownDataValue(value, 'status');
    const latestMessage = ownDataValue(value, 'latestMessage');
    const firstObservedAt = ownDataValue(value, 'firstObservedAt');
    const updatedAt = ownDataValue(value, 'updatedAt');
    if (typeof id !== 'string' ||
        id.length === 0 ||
        id.length > ID_LIMIT ||
        (kind !== 'bitmap-text' && kind !== 'runtime') ||
        !nullablePositiveSafeInteger(coreGeneration) ||
        !nullablePositiveSafeInteger(textId) ||
        !nullablePositiveSafeInteger(itemRevision) ||
        !nullablePositiveSafeInteger(attempt) ||
        failure === null ||
        semanticContext === null ||
        translator === null ||
        !nullablePositiveSafeInteger(physicalTextId) ||
        !nullablePositiveSafeInteger(physicalRevision) ||
        !nullablePositiveSafeInteger(bitmapId) ||
        !nullablePositiveSafeInteger(surfaceId) ||
        !nullablePositiveSafeInteger(bitmapMutationSequence) ||
        !nullablePositiveSafeInteger(surfaceMutationSequence) ||
        (requestPriority !== null &&
            (typeof requestPriority !== 'number' || !Number.isFinite(requestPriority) || requestPriority < 0)) ||
        (requestStream !== null && typeof requestStream !== 'boolean') ||
        typeof requestId !== 'string' ||
        typeof jobId !== 'string' ||
        typeof sourceText !== 'string' ||
        (translation !== null && typeof translation !== 'string') ||
        (translationState !== null &&
            translationState !== 'observed' &&
            translationState !== 'translating' &&
            translationState !== 'available' &&
            translationState !== 'no-translation' &&
            translationState !== 'failed') ||
        (policyReason !== null && typeof policyReason !== 'string') ||
        !isItemStatus(status) ||
        typeof latestMessage !== 'string' ||
        !finiteTimestamp(firstObservedAt) ||
        !finiteTimestamp(updatedAt) ||
        updatedAt < firstObservedAt) {
        return null;
    }
    if ((kind === 'runtime' &&
        (id !== 'runtime' ||
            coreGeneration !== null ||
            textId !== null ||
            itemRevision !== null ||
            attempt !== null ||
            physicalTextId !== null ||
            physicalRevision !== null)) ||
        (kind === 'bitmap-text' &&
            (!positiveSafeInteger(coreGeneration) ||
                !positiveSafeInteger(textId) ||
                id !== `${String(coreGeneration)}:${String(textId)}` ||
                !positiveSafeInteger(itemRevision) ||
                (physicalTextId === null) !== (physicalRevision === null)))) {
        return null;
    }
    return {
        id,
        kind,
        coreGeneration,
        textId,
        revision: itemRevision,
        attempt,
        failure,
        semanticContext,
        translator,
        physicalTextId,
        physicalRevision,
        bitmapId,
        surfaceId,
        bitmapMutationSequence,
        surfaceMutationSequence,
        requestPriority,
        requestStream,
        requestId,
        jobId,
        sourceText,
        translation,
        translationState,
        policyReason,
        status,
        latestMessage,
        firstObservedAt,
        updatedAt,
    };
}
function createGuiTextRecord(current: CurrentItem): GuiTextRecord {
    const target = createGuiOwnDataRecord() as unknown as GuiTextRecord;
    const bitmapText = current.kind === 'bitmap-text';
    target.id = current.id;
    target.hook = bitmapText ? 'Bitmap' : 'Runtime';
    target.hookKey = bitmapText ? 'bitmap' : 'runtime';
    target.surfaceType = bitmapText ? 'Bitmap' : 'Runtime';
    target.firstSeenAt = current.firstObservedAt;
    target.windowType = '';
    target.ownerType = '';
    target.methodName = '';
    target.drawRun = null;
    target.x = null;
    target.y = null;
    target.bounds = null;
    target.onScreen = null;
    target.screenState = 'unverified';
    target.disappearedAt = null;
    target.deactivatedAt = null;
    target.priority = null;
    target.backgrounded = false;
    target.policy = createGuiOwnDataRecord();
    target.metadata = createGuiOwnDataRecord();
    target.metadata['kind'] = current.kind;
    target.metadata['coreGeneration'] = current.coreGeneration;
    target.metadata['textId'] = current.textId;
    target.history = [];
    return target;
}
function updateCurrent(record: GuiTextRecord | null, current: CurrentItem): GuiTextRecord {
    const target = record ?? createGuiTextRecord(current);
    const metadata = target.metadata;
    metadata['revision'] = current.revision;
    metadata['attempt'] = current.attempt;
    metadata['failure'] = current.failure;
    metadata['semanticContext'] = current.semanticContext;
    metadata['translator'] = current.translator;
    target.windowType = '';
    target.methodName = '';
    for (const field of current.semanticContext) {
        if (typeof field['value'] !== 'string')
            continue;
        if (field['name'] === 'nativeOwner')
            target.windowType = field['value'];
        if (field['name'] === 'textOperation')
            target.methodName = field['value'];
    }
    metadata['physicalTextId'] = current.physicalTextId;
    metadata['physicalRevision'] = current.physicalRevision;
    metadata['bitmapId'] = current.bitmapId;
    metadata['surfaceId'] = current.surfaceId;
    metadata['bitmapMutationSequence'] = current.bitmapMutationSequence;
    metadata['surfaceMutationSequence'] = current.surfaceMutationSequence;
    metadata['requestId'] = current.requestId;
    target.priority = current.requestPriority;
    metadata['stream'] = current.requestStream;
    metadata['jobId'] = current.jobId;
    metadata['latestMessage'] = current.latestMessage;
    const source = current.sourceText;
    const translation = current.translation;
    const status = current.status;
    target.original = current.kind === 'runtime' ? current.latestMessage : source;
    target.rawText = source;
    target.convertedText = source;
    target.visibleText = source;
    target.translationSource = source;
    target.normalizedSource = source;
    target.status = status;
    target.translation = translation;
    target.translationState = current.translationState;
    target.policyReason = current.policyReason;
    target.translationReceived = translation ?? '';
    target.translationDrawn = status === 'drawn' ? (translation ?? '') : '';
    target.seenAt = current.updatedAt;
    target.updatedAt = current.updatedAt;
    target.active = status !== 'released';
    return target;
}
function readEvent(value: unknown, current: CurrentItem): GuiHistoryEvent | null {
    const sequence = ownDataValue(value, 'sequence');
    const itemId = ownDataValue(value, 'itemId');
    const eventRevision = ownDataValue(value, 'revision');
    const attempt = ownDataValue(value, 'attempt');
    const physicalTextId = ownDataValue(value, 'physicalTextId');
    const physicalRevision = ownDataValue(value, 'physicalRevision');
    const at = ownDataValue(value, 'at');
    const type = ownDataValue(value, 'type');
    const level = ownDataValue(value, 'level');
    const message = ownDataValue(value, 'message');
    const fields = ownDataValue(value, 'fields');
    const omittedFieldCount = ownDataValue(value, 'omittedFieldCount');
    if (!positiveSafeInteger(sequence) ||
        itemId !== current.id ||
        !nullablePositiveSafeInteger(eventRevision) ||
        !nullablePositiveSafeInteger(attempt) ||
        (current.kind === 'runtime' && attempt !== null) ||
        !nullablePositiveSafeInteger(physicalTextId) ||
        !nullablePositiveSafeInteger(physicalRevision) ||
        (physicalTextId === null) !== (physicalRevision === null) ||
        !finiteTimestamp(at) ||
        !isEventType(type) ||
        !isEventLevel(level) ||
        typeof message !== 'string' ||
        !nonNegativeSafeInteger(omittedFieldCount)) {
        return null;
    }
    const copiedFields = readFields(fields);
    if (copiedFields === null)
        return null;
    const details = createGuiOwnDataRecord();
    details['level'] = level;
    details['revision'] = eventRevision;
    details['attempt'] = attempt;
    details['physicalTextId'] = physicalTextId;
    details['physicalRevision'] = physicalRevision;
    details['fields'] = copiedFields;
    details['omittedFieldCount'] = omittedFieldCount;
    return {
        at,
        seq: sequence,
        id: current.id,
        surfaceId: current.surfaceId === null ? '' : String(current.surfaceId),
        adapterId: current.kind === 'bitmap-text' ? 'bitmap' : 'runtime',
        type,
        status: level,
        message,
        details,
        record: null,
    };
}
function readRetention(value: unknown): Retention | null {
    const complete = ownDataValue(value, 'complete');
    const dropped = ownDataValue(value, 'dropped');
    const limit = ownDataValue(value, 'limit');
    if (typeof complete !== 'boolean' ||
        !nonNegativeSafeInteger(dropped) ||
        !positiveSafeInteger(limit) ||
        limit > EVENT_INPUT_LIMIT ||
        (complete && dropped !== 0)) {
        return null;
    }
    return { complete, dropped, limit };
}
function readBitmapTextRejectionRetention(value: unknown): Retention | null {
    const complete = ownDataValue(value, 'complete');
    const dropped = ownDataValue(value, 'dropped');
    const limit = ownDataValue(value, 'limit');
    if (typeof complete !== 'boolean' ||
        !nonNegativeSafeInteger(dropped) ||
        !positiveSafeInteger(limit) ||
        limit > BITMAP_TEXT_REJECTION_INPUT_LIMIT ||
        (complete && dropped !== 0)) {
        return null;
    }
    return { complete, dropped, limit };
}
function readBitmapTextRejectionEvent(value: unknown): GuiDrawCaptureEvent | null {
    const sequence = ownDataValue(value, 'sequence');
    const at = ownDataValue(value, 'at');
    const stage = ownDataValue(value, 'stage');
    const reason = ownDataValue(value, 'reason');
    const sourceText = ownDataValue(value, 'sourceText');
    const sourceTruncated = ownDataValue(value, 'sourceTruncated');
    const fields = ownDataValue(value, 'fields');
    const omittedFieldCount = ownDataValue(value, 'omittedFieldCount');
    const fieldCount = boundedArrayLength(fields, FIELD_INPUT_LIMIT);
    if (!positiveSafeInteger(sequence) ||
        !finiteTimestamp(at) ||
        (stage !== 'observer' && stage !== 'physical') ||
        typeof reason !== 'string' ||
        reason.length === 0 ||
        reason.length > 128 ||
        (sourceText !== null && (typeof sourceText !== 'string' || sourceText.length > 256)) ||
        typeof sourceTruncated !== 'boolean' ||
        fieldCount === null ||
        !nonNegativeSafeInteger(omittedFieldCount)) {
        return null;
    }
    const details = createGuiOwnDataRecord();
    for (let index = 0; index < fieldCount; index += 1) {
        const field = ownDataValue(fields, index);
        const name = ownDataValue(field, 'name');
        const scalar = ownDataValue(field, 'value');
        if (typeof name !== 'string' || name.length === 0 || name.length > ID_LIMIT || !isDiagnosticScalar(scalar)) {
            return null;
        }
        details[name] = scalar;
    }
    details['sourceTruncated'] = sourceTruncated;
    details['omittedFieldCount'] = omittedFieldCount;
    const text = sourceText ?? '';
    return {
        seq: sequence,
        at,
        stage,
        adapter: 'Bitmap',
        methodName: stage === 'observer' ? 'drawText' : 'physical-ingestion',
        rawText: text,
        visibleText: text,
        normalizedText: text,
        reason,
        category: 'rejected',
        status: 'rejected',
        windowType: '',
        ownerType: '',
        recordId: '',
        slotKey: '',
        x: details['x'] ?? null,
        y: details['y'] ?? null,
        maxWidth: details['maxWidth'] ?? null,
        lineHeight: details['lineHeight'] ?? null,
        align: typeof details['align'] === 'string' ? details['align'] : '',
        bounds: null,
        details,
    };
}
function readBitmapTextRejectionSummary(value: unknown): UnknownRecord | null {
    const accepted = ownDataValue(value, 'accepted');
    const omitted = ownDataValue(value, 'omitted');
    const unclassified = ownDataValue(value, 'unclassified');
    const reasons = ownDataValue(value, 'reasons');
    const reasonCount = boundedArrayLength(reasons, BITMAP_TEXT_REJECTION_SUMMARY_INPUT_LIMIT);
    if (!nonNegativeSafeInteger(accepted) ||
        !nonNegativeSafeInteger(omitted) ||
        !nonNegativeSafeInteger(unclassified) ||
        reasonCount === null) {
        return null;
    }
    const summary = createGuiOwnDataRecord();
    summary['accepted'] = accepted;
    summary['omitted'] = omitted;
    summary['unclassified'] = unclassified;
    let classified = 0;
    for (let index = 0; index < reasonCount; index += 1) {
        const entry = ownDataValue(reasons, index);
        const stage = ownDataValue(entry, 'stage');
        const reason = ownDataValue(entry, 'reason');
        const count = ownDataValue(entry, 'count');
        if ((stage !== 'observer' && stage !== 'physical') ||
            typeof reason !== 'string' ||
            reason.length === 0 ||
            reason.length > 128 ||
            !positiveSafeInteger(count)) {
            return null;
        }
        const key = `${stage}:${reason}`;
        if (ownDataValue(summary, key) !== undefined)
            return null;
        summary[key] = count;
        classified += count;
    }
    return classified + unclassified === accepted ? summary : null;
}
function readBitmapTextRejectionTrace(value: unknown): GuiDrawCaptureTrace | null {
    const updatedAt = ownDataValue(value, 'updatedAt');
    const sequence = ownDataValue(value, 'sequence');
    const events = ownDataValue(value, 'events');
    const retention = readBitmapTextRejectionRetention(ownDataValue(value, 'retention'));
    const rejectionSummary = readBitmapTextRejectionSummary(ownDataValue(value, 'summary'));
    const eventCount = retention === null ? null : boundedArrayLength(events, retention.limit);
    if (!finiteTimestamp(updatedAt) ||
        !nonNegativeSafeInteger(sequence) ||
        retention === null ||
        rejectionSummary === null ||
        eventCount === null) {
        return null;
    }
    const copiedEvents: GuiDrawCaptureEvent[] = [];
    let previousSequence = 0;
    for (let index = 0; index < eventCount; index += 1) {
        const event = readBitmapTextRejectionEvent(ownDataValue(events, index));
        const eventSequence = event?.seq;
        if (event === null ||
            !positiveSafeInteger(eventSequence) ||
            eventSequence <= previousSequence ||
            eventSequence > sequence) {
            return null;
        }
        copiedEvents.push(event);
        previousSequence = eventSequence;
    }
    const summary = createGuiOwnDataRecord();
    summary['complete'] = retention.complete;
    summary['dropped'] = retention.dropped;
    for (const key of Object.keys(rejectionSummary))
        summary[key] = rejectionSummary[key];
    return {
        updatedAt,
        enabled: true,
        limit: retention.limit,
        size: copiedEvents.length,
        sequence,
        filters: createGuiOwnDataRecord(),
        summary,
        events: copiedEvents,
    };
}
function updateRetention(record: GuiTextRecord, retained: Retention, cache: GuiTextHistoryCacheEntry | null): GuiTextHistoryCacheEntry {
    const history = record.history;
    const retention = cache?.retention ?? (createGuiOwnDataRecord() as unknown as GuiTextHistoryRetention);
    retention.status = 'current';
    retention.complete = retained.complete;
    retention.dropped = retained.dropped;
    retention.limit = retained.limit;
    retention.newestSequence = (history[history.length - 1]?.seq as number | undefined) ?? null;
    retention.oldestSequence = (history[0]?.seq as number | undefined) ?? null;
    retention.reason = '';
    retention.retained = history.length;
    retention.updatedAt = record.updatedAt;
    record.historyRetention = retention;
    if (cache !== null) {
        cache.record = record;
        cache.history = history;
        cache.retention = retention;
        return cache;
    }
    return { record, history, retention };
}
function readSnapshot(value: unknown): {
    record: GuiTextRecord;
    cache: GuiTextHistoryCacheEntry;
} | null {
    const current = readCurrent(value);
    const retained = readRetention(ownDataValue(value, 'retention'));
    const events = ownDataValue(value, 'history');
    const eventCount = boundedArrayLength(events, EVENT_INPUT_LIMIT);
    if (current === null || retained === null || eventCount === null || eventCount > retained.limit)
        return null;
    const record = updateCurrent(null, current);
    let previousSequence = 0;
    for (let index = 0; index < eventCount; index += 1) {
        const event = readEvent(ownDataValue(events, index), current);
        if (event === null || (event.seq as number) <= previousSequence)
            return null;
        record.history.push(event);
        previousSequence = event.seq as number;
    }
    return { record, cache: updateRetention(record, retained, null) };
}
function readResources(value: unknown): GuiResourceSnapshot | null | undefined {
    if (value === null)
        return null;
    const generation = ownDataValue(value, 'generation'), active = ownDataValue(value, 'active'), consistent = ownDataValue(value, 'consistent');
    const allocatedBytes = ownDataValue(value, 'allocatedBytes'), peakBytes = ownDataValue(value, 'peakBytes');
    const rawMemory = ownDataValue(value, 'memory'), rawLimits = ownDataValue(value, 'limits');
    const probe = ownDataValue(value, 'probe');
    if (probe != null && (typeof probe !== 'string' || probe.length > 8 * 1024 * 1024))
        return undefined;
    const memoryCount = boundedArrayLength(rawMemory, 16), limitCount = boundedArrayLength(rawLimits, 16);
    if (!positiveSafeInteger(generation) ||
        typeof active !== 'boolean' ||
        typeof consistent !== 'boolean' ||
        !nonNegativeSafeInteger(allocatedBytes) ||
        !nonNegativeSafeInteger(peakBytes) ||
        peakBytes < allocatedBytes ||
        memoryCount === null ||
        limitCount === null)
        return undefined;
    const memory: GuiResourceSnapshot['memory'] = [], limits: GuiResourceSnapshot['limits'] = [];
    const names = new Set<string>();
    for (let i = 0; i < memoryCount; i++) {
        const row = ownDataValue(rawMemory, i), name = ownDataValue(row, 'name'), label = ownDataValue(row, 'label'), bytes = ownDataValue(row, 'bytes');
        if (typeof name !== 'string' ||
            name.length > 64 ||
            names.has(name) ||
            typeof label !== 'string' ||
            label.length > 128 ||
            !nonNegativeSafeInteger(bytes))
            return undefined;
        names.add(name);
        memory.push({ name, label, bytes });
    }
    if (memory.reduce((sum, row) => sum + row.bytes, 0) !== allocatedBytes)
        return undefined;
    names.clear();
    for (let i = 0; i < limitCount; i++) {
        const row = ownDataValue(rawLimits, i), name = ownDataValue(row, 'name'), label = ownDataValue(row, 'label'), unit = ownDataValue(row, 'unit');
        const current = ownDataValue(row, 'value'), limit = ownDataValue(row, 'limit'), peak = ownDataValue(row, 'peak'), refusals = ownDataValue(row, 'refusals');
        const lastRequested = ownDataValue(row, 'lastRequested'), lastRefusedAt = ownDataValue(row, 'lastRefusedAt');
        if (typeof name !== 'string' ||
            name.length > 64 ||
            names.has(name) ||
            typeof label !== 'string' ||
            label.length > 128 ||
            (unit !== 'bytes' && unit !== 'px' && unit !== 'count') ||
            !nonNegativeSafeInteger(current) ||
            (limit !== null && !nonNegativeSafeInteger(limit)) ||
            !nonNegativeSafeInteger(peak) ||
            peak < current ||
            !nonNegativeSafeInteger(refusals) ||
            (lastRequested !== null && !nonNegativeSafeInteger(lastRequested)) ||
            (lastRefusedAt !== null && !nonNegativeSafeInteger(lastRefusedAt)))
            return undefined;
        names.add(name);
        limits.push({ name, label, unit, value: current, limit, peak, refusals, lastRequested, lastRefusedAt });
    }
    return {
        generation,
        active,
        consistent,
        allocatedBytes,
        peakBytes,
        memory,
        limits,
        probe: typeof probe === 'string' ? probe : null,
    };
}
export function createGuiDiagnosticsPushReceiver(repaint: () => void): GuiDiagnosticsPushSink {
    if (typeof repaint !== 'function')
        throw new TypeError('GUI diagnostics repaint must be callable.');
    let repaintPending = false;
    function repaintLater(): void {
        if (repaintPending)
            return;
        repaintPending = true;
        try {
            requestAnimationFrame(() => {
                repaintPending = false;
                try {
                    repaint();
                }
                catch {
                }
            });
        }
        catch {
            repaintPending = false;
        }
    }
    function replace(message: unknown, nextRevision: number): boolean {
        const items = ownDataValue(message, 'items');
        const itemCount = boundedArrayLength(items, ITEM_INPUT_LIMIT);
        const trace = readBitmapTextRejectionTrace(ownDataValue(message, 'bitmapTextRejections'));
        const resources = readResources(ownDataValue(message, 'resources'));
        const lagIncidents = readLagIncidents(ownDataValue(message, 'lagIncidents'));
        if (itemCount === null || trace === null || resources === undefined || lagIncidents === undefined)
            return false;
        const records: GuiTextRecord[] = [];
        const histories = new Map<string, GuiTextHistoryCacheEntry>();
        for (let index = 0; index < itemCount; index += 1) {
            const item = readSnapshot(ownDataValue(items, index));
            if (item === null || histories.has(item.record.id))
                return false;
            records.push(item.record);
            histories.set(item.record.id, item.cache);
        }
        state.diagnosticRecords = records;
        state.textHistoryById = histories;
        state.drawCaptureTrace = trace;
        state.resources = resources;
        state.lagIncidents = lagIncidents;
        state.textDiagnosticsSurface = true;
        state.diagnosticsFeedRevision = nextRevision;
        return true;
    }
    function appendBitmapTextRejection(message: unknown, nextRevision: number): boolean {
        const trace = state.drawCaptureTrace;
        const event = readBitmapTextRejectionEvent(ownDataValue(message, 'event'));
        const retained = readBitmapTextRejectionRetention(ownDataValue(message, 'retention'));
        const summary = readBitmapTextRejectionSummary(ownDataValue(message, 'summary'));
        if (trace === null || event === null || retained === null || summary === null)
            return false;
        if (!positiveSafeInteger(event.seq) || event.seq !== trace.sequence + 1)
            return false;
        trace.events.push(event);
        if (trace.events.length > retained.limit)
            trace.events.splice(0, trace.events.length - retained.limit);
        trace.updatedAt = event.at;
        trace.size = trace.events.length;
        trace.sequence = event.seq;
        summary['complete'] = retained.complete;
        summary['dropped'] = retained.dropped;
        trace.summary = summary;
        state.diagnosticsFeedRevision = nextRevision;
        return true;
    }
    function clearBitmapTextRejections(message: unknown, nextRevision: number): boolean {
        const trace = readBitmapTextRejectionTrace(ownDataValue(message, 'trace'));
        if (trace === null)
            return false;
        state.drawCaptureTrace = trace;
        state.diagnosticsFeedRevision = nextRevision;
        return true;
    }
    function upsert(message: unknown, nextRevision: number): boolean {
        const current = readCurrent(ownDataValue(message, 'item'));
        const retained = readRetention(ownDataValue(message, 'retention'));
        if (current === null || retained === null)
            return false;
        const event = readEvent(ownDataValue(message, 'event'), current);
        if (event === null)
            return false;
        const cache = state.textHistoryById.get(current.id) ?? null;
        if (cache !== null && cache.record === undefined)
            return false;
        if (cache === null && state.diagnosticRecords.length >= ITEM_INPUT_LIMIT)
            return false;
        const previousSequence = cache?.retention.newestSequence;
        if (previousSequence !== null && previousSequence !== undefined && (event.seq as number) <= previousSequence) {
            return false;
        }
        const previousRow = cache?.record ? createTextRecordRowRenderKey(cache.record) : null;
        const record = updateCurrent(cache?.record ?? null, current);
        record.history.push(event);
        if (record.history.length > retained.limit)
            record.history.splice(0, record.history.length - retained.limit);
        const nextCache = updateRetention(record, retained, cache);
        if (cache === null)
            state.diagnosticRecords.push(record);
        state.textHistoryById.set(record.id, nextCache);
        state.diagnosticsFeedRevision = nextRevision;
        const nextRow = createTextRecordRowRenderKey(record);
        if (previousRow === null ||
            !previousRow.complete ||
            !nextRow.complete ||
            previousRow.key !== nextRow.key ||
            getSelectedTextRecordKey() === getTextRecordKey(record))
            repaintLater();
        return true;
    }
    function updateProgress(message: unknown, nextRevision: number): void {
        const current = readCurrent(ownDataValue(message, 'item'));
        if (current === null)
            return;
        const cache = state.textHistoryById.get(current.id);
        const record = cache?.record;
        if (current.revision !== record?.metadata['revision'] ||
            current.attempt !== record.metadata['attempt'] ||
            current.kind !== record.metadata['kind'] ||
            current.coreGeneration !== record.metadata['coreGeneration'] ||
            current.textId !== record.metadata['textId'] ||
            current.sourceText !== record.rawText ||
            current.translation !== record.translation ||
            current.translationState !== record.translationState ||
            current.status !== record.status ||
            current.policyReason !== record.policyReason)
            return;
        updateCurrent(record, current);
        state.diagnosticsFeedRevision = nextRevision;
        if (getSelectedTextRecordKey() === getTextRecordKey(record))
            repaintLater();
    }
    function remove(message: unknown, nextRevision: number): boolean {
        const id = ownDataValue(message, 'id');
        if (typeof id !== 'string' ||
            id.length === 0 ||
            id.length > ID_LIMIT ||
            ownDataValue(message, 'reason') !== 'evicted') {
            return false;
        }
        const index = state.diagnosticRecords.findIndex((item) => item.id === id);
        if (index < 0)
            return false;
        state.diagnosticRecords.splice(index, 1);
        state.textHistoryById.delete(id);
        state.diagnosticsFeedRevision = nextRevision;
        return true;
    }
    function accept(message: unknown): void {
        try {
            const nextRevision = ownDataValue(message, 'revision');
            if (!nonNegativeSafeInteger(nextRevision))
                return;
            const previous = state.diagnosticsFeedRevision;
            const kind = ownDataValue(message, 'kind');
            if (kind === 'replace') {
                if ((previous === null || nextRevision > previous) && replace(message, nextRevision))
                    repaintLater();
                return;
            }
            if (previous === null || previous === Number.MAX_SAFE_INTEGER || nextRevision !== previous + 1)
                return;
            if (kind === 'lag-incidents') {
                const next = readLagIncidents(ownDataValue(message, 'lagIncidents'), state.lagIncidents, true);
                if (next == null)
                    return;
                state.lagIncidents = next;
                state.diagnosticsFeedRevision = nextRevision;
                repaintLater();
                return;
            }
            if (kind === 'resources') {
                const resources = readResources(ownDataValue(message, 'resources'));
                if (resources == null)
                    return;
                state.resources = resources;
                state.diagnosticsFeedRevision = nextRevision;
                repaintLater();
                return;
            }
            if (kind === 'upsert') {
                upsert(message, nextRevision);
                return;
            }
            if (kind === 'current') {
                updateProgress(message, nextRevision);
                return;
            }
            if ((kind === 'remove' && remove(message, nextRevision)) ||
                (kind === 'bitmap-text-rejected' && appendBitmapTextRejection(message, nextRevision)) ||
                (kind === 'bitmap-text-rejections-cleared' && clearBitmapTextRejections(message, nextRevision))) {
                repaintLater();
            }
        }
        catch {
        }
    }
    const sink = createGuiOwnDataRecord() as unknown as GuiDiagnosticsPushSink;
    Object.defineProperty(sink, 'accept', { enumerable: true, value: accept });
    return Object.freeze(sink);
}
export function publishGuiDiagnosticsSink(scope: object = globalThis, repaint: () => void = renderDiagnosticsFeed): GuiDiagnosticsPushSink {
    const sink = createGuiDiagnosticsPushReceiver(repaint);
    Object.defineProperty(scope, GUI_DIAGNOSTICS_SINK_PROPERTY, {
        configurable: true,
        value: sink,
    });
    return sink;
}
