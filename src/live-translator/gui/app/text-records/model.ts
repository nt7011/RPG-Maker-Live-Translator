import type { TextRecordRequest, SemanticTextRecordSnapshot, TranslatorExchange, } from '../../../runtime/text-record-types.js';
import type { GuiTextRecord, GuiSemanticTranslationState, UnknownRecord } from '../types.js';
import { isUnknownRecord } from '../types.js';
import { state } from '../state.js';
import { getForesightTextRecords, getTextRecordKey, getTextRecordOccurrenceKey } from './identity.js';
export interface RecordView {
    translator: TranslatorExchange | null;
    key: string;
    request: TextRecordRequest | null;
    sourceText: string;
    state: GuiSemanticTranslationState | null;
    translation: string | null;
    revision: number | null;
    attempt: number | null;
    reason: string | null;
    failure: readonly UnknownRecord[];
    diagnostics: GuiTextRecord | null;
}
export function hasFailedPresentation(input: Pick<RecordView, 'state' | 'diagnostics'>): boolean {
    if (input.state === 'failed')
        return false;
    if (input.diagnostics?.status === 'failed')
        return true;
    const failure = input.diagnostics?.metadata['failure'];
    return (Array.isArray(failure) &&
        failure.some((field: unknown) => isUnknownRecord(field) && field['name'] === 'stage' && field['value'] === 'presentation'));
}
export function hasFailedSemanticAssociation(input: Pick<RecordView, 'diagnostics'>): boolean {
    const fields = input.diagnostics?.metadata['semanticContext'];
    if (!Array.isArray(fields))
        return false;
    return (fields.some((field: unknown) => isUnknownRecord(field) && field['name'] === 'associationExpected' && field['value'] === true) &&
        fields.some((field: unknown) => isUnknownRecord(field) && field['name'] === 'status' && field['value'] === 'rejected'));
}
export function runtimeRecordView(generation: number, record: SemanticTextRecordSnapshot): RecordView {
    return {
        key: `${String(generation)}:${String(record.textId)}`,
        sourceText: record.sourceText,
        translator: record.translator,
        request: record.request,
        state: record.state,
        translation: record.translation,
        revision: record.semanticRevision,
        attempt: record.attempt,
        reason: record.reason,
        failure: record.failure === null
            ? []
            : (Object.entries(record.failure) as [
                string,
                string | boolean | null
            ][]).map(([name, value]) => ({
                name,
                value,
            })),
        diagnostics: null,
    };
}
export function diagnosticRecordView(record: GuiTextRecord, key = getTextRecordKey(record)): RecordView {
    const revision = record.metadata['revision'];
    const attempt = record.metadata['attempt'];
    const failure = record.metadata['failure'];
    return {
        key,
        translator: diagnosticTranslatorExchange(record),
        request: typeof record.priority === 'number'
            ? { priority: record.priority, stream: record.metadata['stream'] === true }
            : null,
        sourceText: record.rawText || record.original || record.visibleText || '',
        state: record.translationState,
        translation: record.translation,
        revision: typeof revision === 'number' ? revision : null,
        attempt: typeof attempt === 'number' ? attempt : null,
        reason: record.policyReason,
        failure: Array.isArray(failure) ? (failure as UnknownRecord[]) : [],
        diagnostics: record,
    };
}
export function diagnosticTranslatorExchange(record: GuiTextRecord): TranslatorExchange | null {
    const fields = record.metadata['translator'];
    if (!Array.isArray(fields))
        return null;
    const value = (name: string): unknown => {
        for (const field of fields as unknown[])
            if (isUnknownRecord(field) && field['name'] === name)
                return field['value'];
        return undefined;
    };
    const input = value('input'), output = value('output'), markerMismatch = value('markerMismatch');
    return typeof input === 'string' &&
        (output === null || typeof output === 'string') &&
        typeof markerMismatch === 'boolean'
        ? { input, output, markerMismatch }
        : null;
}
export function getRecordViews(): RecordView[] {
    const diagnostics = new Map<string, RecordView>();
    const duplicates = new Map<string, number>();
    for (const record of getForesightTextRecords()) {
        if (record.metadata['kind'] === 'runtime')
            continue;
        const base = getTextRecordKey(record);
        const occurrence = duplicates.get(base) ?? 0;
        duplicates.set(base, occurrence + 1);
        const key = getTextRecordOccurrenceKey('text-records', record, occurrence);
        diagnostics.set(key, diagnosticRecordView(record, key));
    }
    const result: {
        view: RecordView;
        generation: number;
        textId: number;
        pinned: boolean;
    }[] = [];
    const snapshot = state.runtimeTextRecords;
    if (snapshot)
        for (const record of snapshot.records) {
            const view = runtimeRecordView(snapshot.generation, record);
            const retained = diagnostics.get(view.key);
            if (retained?.revision === view.revision && retained.attempt === view.attempt)
                view.diagnostics = retained.diagnostics;
            diagnostics.delete(view.key);
            result.push({
                view,
                generation: snapshot.generation,
                textId: record.textId,
                pinned: record.onScreenGameMessage,
            });
        }
    for (const view of diagnostics.values()) {
        const metadata = view.diagnostics?.metadata;
        result.push({
            view,
            generation: Number(metadata?.['coreGeneration']) || 0,
            textId: Number(metadata?.['textId']) || 0,
            pinned: false,
        });
    }
    result.sort((left, right) => Number(right.pinned) - Number(left.pinned) ||
        right.generation - left.generation ||
        right.textId - left.textId);
    return result.map(({ view }) => view);
}
