import type { TextRecordRequest, TranslatorExchange, SemanticTranslationFailure, SemanticTextRecordSnapshot, } from '../runtime/text-record-types.js';
export type { SemanticTranslationFailure, SemanticTextRecordSnapshot } from '../runtime/text-record-types.js';
import { copyTextTemplate, copyTextTranslation, matchesTextTemplate, type TextTemplate, type TextTranslation, } from './styled-text.js';
export interface SemanticTextRevisionHandle extends TextTemplate {
    readonly textId: number;
    readonly semanticRevision: number;
}
export interface SemanticTranslationAttempt {
    readonly handle: SemanticTextRevisionHandle;
    readonly sequence: number;
    readonly recovery: boolean;
}
export type SemanticTranslationSnapshot = {
    readonly state: 'observed' | 'translating';
} | {
    readonly state: 'available';
    readonly translation: TextTranslation;
} | {
    readonly state: 'no-translation';
    readonly reason: string;
} | {
    readonly state: 'failed';
    readonly failure: SemanticTranslationFailure;
};
export interface SemanticTextSuccessorRequest {
    readonly predecessor: SemanticTextRevisionHandle | null;
    readonly template: TextTemplate;
}
export interface SemanticTextReconciliationRequest {
    readonly successors: readonly SemanticTextSuccessorRequest[];
    readonly retired: readonly SemanticTextRevisionHandle[];
}
export interface SemanticTextSuccessor {
    readonly request: SemanticTextSuccessorRequest;
    readonly handle: SemanticTextRevisionHandle;
}
export interface SemanticTextChangeSet {
    readonly successors: readonly SemanticTextSuccessor[];
    readonly issued: readonly SemanticTextRevisionHandle[];
    readonly revoked: readonly SemanticTextRevisionHandle[];
}
export interface PreparedSemanticTextReconciliation {
    readonly changes: SemanticTextChangeSet;
    readonly read: (handle: SemanticTextRevisionHandle) => SemanticTranslationSnapshot | null;
    readonly commit: () => void;
}
export type SemanticTranslationSettlement = {
    readonly kind: 'available';
    readonly translation: TextTranslation;
} | {
    readonly kind: 'no-translation';
    readonly reason: string;
} | {
    readonly kind: 'failed';
    readonly failure: SemanticTranslationFailure;
} | {
    readonly kind: 'canceled';
};
export type SemanticTranslationSettlementResult = {
    readonly kind: 'accepted';
    readonly snapshot: SemanticTranslationSnapshot;
} | {
    readonly kind: 'ignored';
    readonly reason: 'not-current' | 'not-translating' | 'invalid-settlement';
};
export interface SemanticTextStore {
    readonly setTranslatorExchange: (attempt: SemanticTranslationAttempt, exchange: TranslatorExchange) => void;
    readonly setRequest: (attempt: SemanticTranslationAttempt, request: TextRecordRequest) => void;
    readonly getSnapshot: () => readonly SemanticTextRecordSnapshot[];
    readonly observe: (changed: () => void) => Readonly<{
        detach(): void;
    }>;
    readonly size: () => number;
    readonly prepareReconciliation: (request: SemanticTextReconciliationRequest) => PreparedSemanticTextReconciliation;
    readonly isCurrent: (handle: SemanticTextRevisionHandle) => boolean;
    readonly read: (handle: SemanticTextRevisionHandle) => SemanticTranslationSnapshot | null;
    readonly currentAttempt: (handle: SemanticTextRevisionHandle) => SemanticTranslationAttempt | null;
    readonly beginTranslation: (handle: SemanticTextRevisionHandle, episode?: object) => SemanticTranslationAttempt | null;
    readonly settleTranslation: (attempt: SemanticTranslationAttempt, settlement: SemanticTranslationSettlement) => SemanticTranslationSettlementResult;
    readonly dispose: () => readonly SemanticTextRevisionHandle[];
}
interface SemanticTextRecord {
    readonly handle: SemanticTextRevisionHandle;
    readonly translation: SemanticTranslationSnapshot;
    readonly attempt: SemanticTranslationAttempt | null;
    readonly episode: object | null;
    readonly request: TextRecordRequest | null;
    readonly translator: TranslatorExchange | null;
}
const noHandles: readonly SemanticTextRevisionHandle[] = Object.freeze([]);
const noSuccessors: readonly SemanticTextSuccessor[] = Object.freeze([]);
const emptyChangeSet: SemanticTextChangeSet = Object.freeze({
    successors: noSuccessors,
    issued: noHandles,
    revoked: noHandles,
});
function nextSemanticRevision(semanticRevision: number): number {
    const next = semanticRevision + 1;
    if (!Number.isSafeInteger(next))
        throw new RangeError('Semantic text revision space is exhausted.');
    return next;
}
function freezeTranslationSnapshot(snapshot: SemanticTranslationSnapshot): SemanticTranslationSnapshot {
    return Object.freeze(snapshot);
}
function accepted(snapshot: SemanticTranslationSnapshot): SemanticTranslationSettlementResult {
    return Object.freeze({ kind: 'accepted', snapshot });
}
function ignored(reason: Extract<SemanticTranslationSettlementResult, {
    kind: 'ignored';
}>['reason']) {
    return Object.freeze({ kind: 'ignored', reason } as const);
}
function requireArray<Value>(value: readonly Value[], message: string): readonly Value[] {
    const candidate: unknown = value;
    if (!Array.isArray(candidate))
        throw new TypeError(message);
    return candidate as readonly Value[];
}
export function createSemanticTextStore(): SemanticTextStore {
    let records = new Map<SemanticTextRevisionHandle, SemanticTextRecord>();
    let nextTextId = 1;
    let disposed = false;
    let stateVersion = 0;
    const observers = new Set<() => void>();
    function notify(): void {
        for (const changed of observers) {
            try {
                changed();
            }
            catch {
            }
        }
    }
    function getSnapshot(): readonly SemanticTextRecordSnapshot[] {
        return Object.freeze(Array.from(records.values(), ({ handle, translation, attempt, request, translator }) => Object.freeze({
            request,
            translator,
            textId: handle.textId,
            semanticRevision: handle.semanticRevision,
            attempt: attempt?.sequence ?? null,
            sourceText: handle.sourceText,
            state: translation.state,
            translation: translation.state === 'available' ? translation.translation.text : null,
            reason: translation.state === 'no-translation' ? translation.reason : null,
            failure: translation.state === 'failed'
                ? Object.freeze({
                    stage: translation.failure.stage,
                    reason: translation.failure.reason,
                    code: translation.failure.code,
                    message: translation.failure.message,
                    truncated: translation.failure.truncated,
                    recovery: translation.failure.recovery,
                })
                : null,
        })));
    }
    function observe(changed: () => void): Readonly<{
        detach(): void;
    }> {
        const listener = (): void => {
            changed();
        };
        if (!disposed)
            observers.add(listener);
        return Object.freeze({
            detach: () => {
                observers.delete(listener);
            },
        });
    }
    function prepareReconciliation(request: SemanticTextReconciliationRequest): PreparedSemanticTextReconciliation {
        if (disposed) {
            return Object.freeze({
                changes: emptyChangeSet,
                read: (): null => null,
                commit: () => undefined,
            });
        }
        const successorRequests = requireArray(request.successors, 'Semantic text reconciliation requires a successor array.');
        const retiredHandles = requireArray(request.retired, 'Semantic text reconciliation requires a retired array.');
        const templates = successorRequests.map((request) => copyTextTemplate(request.template));
        const successorPredecessors = new Set<SemanticTextRevisionHandle>();
        for (const successor of successorRequests) {
            const successorValue: unknown = successor;
            if (typeof successorValue !== 'object' || successorValue === null || !('template' in successorValue)) {
                throw new TypeError('A semantic text successor request is invalid.');
            }
            const { predecessor } = successor;
            if (predecessor === null)
                continue;
            if (!records.has(predecessor))
                throw new Error('A semantic text predecessor is not current.');
            if (successorPredecessors.has(predecessor)) {
                throw new Error('A semantic text predecessor cannot prove multiple successors.');
            }
            successorPredecessors.add(predecessor);
        }
        const retired = new Set<SemanticTextRevisionHandle>();
        for (const handle of retiredHandles) {
            if (!records.has(handle))
                throw new Error('A retired semantic text revision is not current.');
            if (successorPredecessors.has(handle)) {
                throw new Error('A semantic text predecessor cannot also be retired independently.');
            }
            if (retired.has(handle))
                throw new Error('A semantic text revision cannot be retired twice.');
            retired.add(handle);
        }
        let proposedNextTextId = nextTextId;
        const proposedRecords = new Map<SemanticTextRevisionHandle, SemanticTextRecord | null>();
        const readProposedRecord = (handle: SemanticTextRevisionHandle): SemanticTextRecord | undefined => {
            if (proposedRecords.has(handle))
                return proposedRecords.get(handle) ?? undefined;
            return records.get(handle);
        };
        const writeProposedRecord = (record: SemanticTextRecord): void => {
            proposedRecords.set(record.handle, record);
        };
        const deleteProposedRecord = (handle: SemanticTextRevisionHandle): void => {
            proposedRecords.set(handle, null);
        };
        const successors: SemanticTextSuccessor[] = [];
        const issued: SemanticTextRevisionHandle[] = [];
        const revoked: SemanticTextRevisionHandle[] = [];
        for (const [index, requestEntry] of successorRequests.entries()) {
            const template = templates[index];
            if (template === undefined)
                throw new Error('Missing semantic template.');
            const predecessorRecord = requestEntry.predecessor === null ? undefined : readProposedRecord(requestEntry.predecessor);
            if (requestEntry.predecessor !== null && predecessorRecord === undefined) {
                throw new Error('A semantic text predecessor was consumed more than once.');
            }
            let handle: SemanticTextRevisionHandle;
            if (predecessorRecord !== undefined && matchesTextTemplate(predecessorRecord.handle, template)) {
                handle = predecessorRecord.handle;
            }
            else {
                const textId = predecessorRecord?.handle.textId ?? proposedNextTextId;
                if (predecessorRecord === undefined) {
                    if (!Number.isSafeInteger(proposedNextTextId)) {
                        throw new RangeError('Semantic text identifier space is exhausted.');
                    }
                    proposedNextTextId += 1;
                }
                const semanticRevision = predecessorRecord === undefined
                    ? 1
                    : nextSemanticRevision(predecessorRecord.handle.semanticRevision);
                handle = Object.freeze({
                    textId,
                    semanticRevision,
                    sourceText: template.sourceText,
                    styleEnds: template.styleEnds,
                    ...(template.controls === undefined ? {} : { controls: template.controls }),
                });
                writeProposedRecord(Object.freeze({
                    handle,
                    translation: freezeTranslationSnapshot({ state: 'observed' }),
                    attempt: null,
                    episode: null,
                    request: null,
                    translator: null,
                }));
                issued.push(handle);
            }
            if (predecessorRecord !== undefined && handle !== predecessorRecord.handle) {
                deleteProposedRecord(predecessorRecord.handle);
                revoked.push(predecessorRecord.handle);
            }
            successors.push(Object.freeze({ request: requestEntry, handle }));
        }
        for (const handle of retired) {
            deleteProposedRecord(handle);
            revoked.push(handle);
        }
        const changes: SemanticTextChangeSet = Object.freeze({
            successors: Object.freeze(successors),
            issued: Object.freeze(issued),
            revoked: Object.freeze(revoked),
        });
        const preparedVersion = stateVersion;
        let committed = false;
        const assertPreparedCurrent = (): void => {
            if (stateVersion !== preparedVersion)
                throw new Error('A prepared semantic reconciliation is stale.');
        };
        return Object.freeze({
            changes,
            read: (handle: SemanticTextRevisionHandle): SemanticTranslationSnapshot | null => {
                assertPreparedCurrent();
                return readProposedRecord(handle)?.translation ?? null;
            },
            commit: (): void => {
                if (committed)
                    throw new Error('A semantic text reconciliation cannot be committed twice.');
                assertPreparedCurrent();
                committed = true;
                for (const [handle, record] of proposedRecords) {
                    if (record === null)
                        records.delete(handle);
                    else
                        records.set(handle, record);
                }
                nextTextId = proposedNextTextId;
                stateVersion += 1;
                if (proposedRecords.size > 0)
                    notify();
            },
        });
    }
    function read(handle: SemanticTextRevisionHandle): SemanticTranslationSnapshot | null {
        return records.get(handle)?.translation ?? null;
    }
    function beginTranslation(handle: SemanticTextRevisionHandle, episode?: object): SemanticTranslationAttempt | null {
        const record = records.get(handle);
        if (record === undefined || (episode !== undefined && record.episode === episode))
            return null;
        const eligible = record.translation.state === 'observed' ||
            (episode !== undefined &&
                record.translation.state === 'failed' &&
                record.translation.failure.recovery === 'new-appearance');
        if (!eligible) {
            if (episode !== undefined) {
                records.set(handle, Object.freeze({ ...record, episode }));
                stateVersion += 1;
            }
            return null;
        }
        const sequence = nextSemanticRevision(record.attempt?.sequence ?? 0);
        const attempt = Object.freeze({ handle, sequence, recovery: record.attempt !== null });
        records.set(handle, Object.freeze({
            ...record,
            attempt,
            request: null,
            translator: null,
            episode: episode ?? null,
            translation: freezeTranslationSnapshot({ state: 'translating' }),
        }));
        stateVersion += 1;
        notify();
        return attempt;
    }
    function settleTranslation(attempt: SemanticTranslationAttempt, settlement: SemanticTranslationSettlement): SemanticTranslationSettlementResult {
        const { handle } = attempt;
        const candidate = settlement;
        let next: SemanticTranslationSnapshot;
        if (candidate.kind === 'available') {
            const translation = copyTextTranslation(candidate.translation, handle);
            if (translation === null)
                return ignored('invalid-settlement');
            next = freezeTranslationSnapshot({ state: 'available', translation });
        }
        else if (candidate.kind === 'no-translation') {
            next = freezeTranslationSnapshot({ state: 'no-translation', reason: candidate.reason });
        }
        else if (candidate.kind === 'failed') {
            next = freezeTranslationSnapshot({ state: 'failed', failure: Object.freeze({ ...candidate.failure }) });
        }
        else {
            return ignored('invalid-settlement');
        }
        const record = records.get(handle);
        if (record?.attempt !== attempt)
            return ignored('not-current');
        if (record.translation.state !== 'translating')
            return ignored('not-translating');
        records.set(handle, Object.freeze({ ...record, translation: next }));
        stateVersion += 1;
        notify();
        return accepted(next);
    }
    function dispose(): readonly SemanticTextRevisionHandle[] {
        if (disposed)
            return noHandles;
        disposed = true;
        const revoked = records.size === 0 ? noHandles : Object.freeze([...records.keys()]);
        records = new Map();
        stateVersion += 1;
        notify();
        observers.clear();
        return revoked;
    }
    return Object.freeze({
        setTranslatorExchange: (attempt: SemanticTranslationAttempt, exchange: TranslatorExchange): void => {
            const record = records.get(attempt.handle);
            if (record?.attempt !== attempt)
                return;
            records.set(attempt.handle, Object.freeze({ ...record, translator: Object.freeze({ ...exchange }) }));
            stateVersion += 1;
            notify();
        },
        setRequest: (attempt: SemanticTranslationAttempt, request: TextRecordRequest): void => {
            const record = records.get(attempt.handle);
            if (record?.attempt !== attempt)
                return;
            if (record.request?.priority === request.priority && record.request.stream === request.stream)
                return;
            records.set(attempt.handle, Object.freeze({ ...record, request: Object.freeze({ ...request }) }));
            stateVersion += 1;
            notify();
        },
        getSnapshot,
        observe,
        size: () => records.size,
        prepareReconciliation,
        isCurrent: (handle: SemanticTextRevisionHandle): boolean => records.has(handle),
        read,
        currentAttempt: (handle: SemanticTextRevisionHandle) => records.get(handle)?.attempt ?? null,
        beginTranslation,
        settleTranslation,
        dispose,
    });
}
