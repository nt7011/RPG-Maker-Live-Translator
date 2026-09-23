import type { RuntimeTextRecordSnapshot, TextRecordRequest } from '../../../runtime/text-record-types.js';
import type { GuiTextRecord, GuiSemanticTranslationState } from '../types.js';
import { state } from '../state.js';
import { getDiagnosticTextRecords, getTextRecordKey, getTextRecordOccurrenceKey } from './identity.js';
import { basicPresentation, type RecordPresentation } from './presentation.js';
export interface RecordView {
    key: string;
    request: TextRecordRequest | null;
    sourceText: string;
    state: GuiSemanticTranslationState | null;
    translation: string | null;
    revision: number | null;
    attempt: number | null;
    presentation: RecordPresentation;
    diagnostics: GuiTextRecord | null;
}
export function runtimeRecordView(generation: number, record: RuntimeTextRecordSnapshot): RecordView {
    return {
        key: `${String(generation)}:${String(record.textId)}`,
        sourceText: record.sourceText,
        request: record.request,
        state: record.state,
        translation: record.translation,
        revision: record.semanticRevision,
        attempt: record.attempt,
        presentation: basicPresentation(record.state, record.semanticControl),
        diagnostics: null,
    };
}
export function diagnosticRecordView(record: GuiTextRecord, key = getTextRecordKey(record)): RecordView {
    const revision = record.metadata['revision'], attempt = record.metadata['attempt'];
    return {
        key,
        sourceText: record.rawText || record.original || record.visibleText || '',
        request: typeof record.priority === 'number'
            ? { priority: record.priority, stream: record.metadata['stream'] === true }
            : null,
        state: record.translationState,
        translation: record.translation,
        revision: typeof revision === 'number' ? revision : null,
        attempt: typeof attempt === 'number' ? attempt : null,
        presentation: record.presentation ?? basicPresentation(record.translationState, null),
        diagnostics: record,
    };
}
export function getRecordViews(): RecordView[] {
    const diagnostics = new Map<string, RecordView>();
    const duplicates = new Map<string, number>();
    for (const record of getDiagnosticTextRecords()) {
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
            if (retained?.revision === view.revision && retained.attempt === view.attempt) {
                view.diagnostics = retained.diagnostics;
                view.presentation = { ...retained.presentation, semanticControl: record.semanticControl };
            }
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
