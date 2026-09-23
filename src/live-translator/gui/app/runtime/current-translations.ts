import { isSemanticControl } from '../text-records/presentation.js';
import { renderTextRecordSections } from '../text-records/lists.js';
import { state } from '../state.js';
import { readForesightView } from '../../foresight-tree/model.js';
import { renderForesightPanel } from './foresight-panel.js';
import type { TextRecordsSnapshot, RuntimeTextRecordSnapshot } from '../../../runtime/text-record-types.js';
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
        const semanticControl = own(row, 'semanticControl');
        const onScreenGameMessage = own(row, 'onScreenGameMessage');
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
            !isSemanticControl(semanticControl) ||
            (state !== 'observed' &&
                state !== 'translating' &&
                state !== 'available' &&
                state !== 'no-translation' &&
                state !== 'failed') ||
            (state === 'available' ? typeof translation !== 'string' : translation !== null) ||
            (state === 'observed' ? attempt !== null : attempt === null))
            return null;
        ids.add(textId);
        records.push({
            textId,
            semanticControl,
            semanticRevision,
            attempt,
            sourceText,
            state,
            translation,
            onScreenGameMessage,
            request: request === null ? null : { priority: priority as number, stream: stream as boolean },
        });
    }
    return {
        generation,
        sequence,
        active,
        records,
        foresight: active ? readForesightView(own(value, 'foresight')) : null,
    };
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
        renderForesightPanel();
    });
    Object.defineProperty(scope, 'LiveTranslatorGuiTextRecordsSink', { configurable: true, value: sink });
    return sink;
}
