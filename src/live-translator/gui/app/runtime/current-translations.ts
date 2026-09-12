import { renderTextRecordSections } from '../text-records/lists.js';
import { state } from '../state.js';
import type { TextRecordsSnapshot, RuntimeTextRecordSnapshot, SemanticTranslationFailure, TranslatorExchange, } from '../../../runtime/text-record-types.js';
function own(value: unknown, key: PropertyKey): unknown {
    if (value === null || typeof value !== 'object')
        return undefined;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function positive(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function failure(value: unknown): SemanticTranslationFailure | null {
    const stage = own(value, 'stage'), reason = own(value, 'reason'), code = own(value, 'code');
    const message = own(value, 'message'), truncated = own(value, 'truncated'), recovery = own(value, 'recovery');
    if ((stage !== 'admission' && stage !== 'provider' && stage !== 'encoding' && stage !== 'decoding') ||
        typeof reason !== 'string' ||
        (code !== null && typeof code !== 'string') ||
        (message !== null && typeof message !== 'string') ||
        typeof truncated !== 'boolean' ||
        (recovery !== 'new-appearance' && recovery !== 'input-change'))
        return null;
    return { stage, reason, code, message, truncated, recovery };
}
function readTranslatorExchange(value: unknown): TranslatorExchange | null {
    const input = own(value, 'input'), output = own(value, 'output'), markerMismatch = own(value, 'markerMismatch');
    if (typeof input !== 'string' ||
        (output !== null && typeof output !== 'string') ||
        typeof markerMismatch !== 'boolean')
        return null;
    return { input, output, markerMismatch };
}
function readSnapshot(value: unknown): TextRecordsSnapshot | null {
    const generation = own(value, 'generation'), sequence = own(value, 'sequence'), active = own(value, 'active');
    const input = own(value, 'records'), length = own(input, 'length');
    if (!positive(generation) ||
        !positive(sequence) ||
        typeof active !== 'boolean' ||
        !Array.isArray(input) ||
        typeof length !== 'number' ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > 65536 ||
        (!active && length !== 0))
        return null;
    const records: RuntimeTextRecordSnapshot[] = [];
    const ids = new Set<number>();
    for (let index = 0; index < length; index++) {
        const row = own(input, index);
        const textId = own(row, 'textId'), semanticRevision = own(row, 'semanticRevision'), attempt = own(row, 'attempt');
        const sourceText = own(row, 'sourceText'), state = own(row, 'state'), translation = own(row, 'translation');
        const reason = own(row, 'reason'), rawFailure = own(row, 'failure');
        const copiedFailure = rawFailure === null ? null : failure(rawFailure);
        const onScreenGameMessage = own(row, 'onScreenGameMessage');
        const rawTranslator = own(row, 'translator');
        const translator = rawTranslator === null ? null : readTranslatorExchange(rawTranslator);
        if (rawTranslator !== null && translator === null)
            return null;
        const request = own(row, 'request');
        const priority = own(request, 'priority');
        const stream = own(request, 'stream');
        if ((request !== null &&
            (typeof priority !== 'number' ||
                !Number.isFinite(priority) ||
                priority < 0 ||
                typeof stream !== 'boolean')) ||
            typeof onScreenGameMessage !== 'boolean' ||
            !positive(textId) ||
            ids.has(textId) ||
            !positive(semanticRevision) ||
            (attempt !== null && !positive(attempt)) ||
            typeof sourceText !== 'string' ||
            (translation !== null && typeof translation !== 'string') ||
            (reason !== null && typeof reason !== 'string') ||
            (state !== 'observed' &&
                state !== 'translating' &&
                state !== 'available' &&
                state !== 'no-translation' &&
                state !== 'failed') ||
            (state === 'available' ? typeof translation !== 'string' : translation !== null) ||
            (state === 'no-translation' ? typeof reason !== 'string' : reason !== null) ||
            (state === 'failed' ? copiedFailure === null : rawFailure !== null) ||
            (state === 'observed' ? attempt !== null : attempt === null))
            return null;
        ids.add(textId);
        records.push({
            textId,
            translator,
            semanticRevision,
            attempt,
            sourceText,
            state,
            translation,
            reason,
            failure: copiedFailure,
            onScreenGameMessage,
            request: request === null ? null : { priority: priority as number, stream: stream as boolean },
        });
    }
    return { generation, sequence, active, records };
}
export function createGuiTextRecordsReceiver(repaint: (snapshot: TextRecordsSnapshot) => void) {
    let latest: TextRecordsSnapshot | null = null;
    let repaintPending = false;
    return Object.freeze({
        accept(value: unknown): void {
            let next: TextRecordsSnapshot | null;
            try {
                next = readSnapshot(value);
            }
            catch {
                return;
            }
            if (next === null ||
                (latest !== null &&
                    (next.generation < latest.generation ||
                        (next.generation === latest.generation && next.sequence <= latest.sequence))))
                return;
            latest = next;
            if (repaintPending)
                return;
            repaintPending = true;
            try {
                requestAnimationFrame(() => {
                    repaintPending = false;
                    try {
                        if (latest !== null)
                            repaint(latest);
                    }
                    catch {
                    }
                });
            }
            catch {
                repaintPending = false;
            }
        },
    });
}
export function publishGuiTextRecordsSink(scope: object = globalThis) {
    const sink = createGuiTextRecordsReceiver((snapshot) => {
        state.runtimeTextRecords = snapshot;
        renderTextRecordSections();
    });
    Object.defineProperty(scope, 'LiveTranslatorGuiTextRecordsSink', { configurable: true, value: sink });
    return sink;
}
