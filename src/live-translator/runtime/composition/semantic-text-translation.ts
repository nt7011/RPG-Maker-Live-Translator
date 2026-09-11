import type { TextRecordRequest, TranslatorExchange } from '../text-record-types.js';
import { copyErrorDescription } from '../cancellation.js';
import { encodeTranslationText, decodeTranslationText, type EncodedTranslationText, } from '../translation-text-codec.js';
import type { SemanticTextRevisionHandle, SemanticTranslationAttempt, SemanticTranslationFailure, SemanticTranslationSettlement, } from '../../stores/semantic-text-store.js';
import type { RuntimeDiagnosticsIngress } from '../diagnostics-ingress.js';
import type { TranslationRequestHandle } from '../translation-manager/handles.js';
import type { TranslationManagerService } from '../translation-manager/manager.js';
import type { TranslationRequestBatchAdmission } from '../translation-manager/requests.js';
export type SemanticTextTranslationRequest = SemanticTranslationAttempt;
export interface SemanticTextTranslationAdmission {
    readonly request: SemanticTextTranslationRequest;
    readonly immediateSettlement: SemanticTranslationSettlement | null;
    readonly completion: Promise<SemanticTranslationSettlement>;
}
export interface SemanticTextTranslationHandoff {
    readonly requestBatch: (requests: readonly SemanticTextTranslationRequest[]) => readonly SemanticTextTranslationAdmission[];
    readonly revokeBatch: (handles: readonly SemanticTextRevisionHandle[]) => void;
    readonly reconcileDemand: (handles: readonly SemanticTextRevisionHandle[]) => void;
    readonly dispose: () => void;
}
interface SemanticTextTranslationHandoffOptions {
    readonly requester: Pick<TranslationManagerService, 'requestBatch'>;
    readonly coreGeneration: number;
    readonly diagnostics: RuntimeDiagnosticsIngress;
    readonly exchangeChanged?: (attempt: SemanticTranslationAttempt, exchange: TranslatorExchange) => void;
    readonly requestChanged?: (attempt: SemanticTranslationAttempt, request: TextRecordRequest) => void;
    readonly readPriority: (handle: SemanticTextRevisionHandle) => number;
}
interface SettlementDelivery {
    complete: ((value: unknown, failed: boolean) => void) | null;
}
interface TranslationSettlementCell {
    readonly request: SemanticTextTranslationRequest;
    readonly encoded: EncodedTranslationText;
    readonly completion: Promise<SemanticTranslationSettlement>;
    readonly resolve: (settlement: SemanticTranslationSettlement) => void;
    admission: SemanticTextTranslationAdmission | null;
    correlation: TranslationCorrelation | null;
    translator: TranslatorExchange | null;
    managerHandle: TranslationRequestHandle | null;
    managerAccepted: boolean;
    terminal: boolean;
    controlSettled: boolean;
    expectedCancellation: boolean;
    delivery: SettlementDelivery | null;
}
interface TranslationCorrelation {
    readonly coreGeneration: number;
    readonly textId: number;
    readonly revision: number;
    readonly attempt: number;
    readonly requestPriority?: number;
    readonly requestStream?: boolean;
    readonly requestId?: string;
    readonly jobId?: string;
}
const canceled: SemanticTranslationSettlement = Object.freeze({ kind: 'canceled' });
const supersessionCancellationOptions = Object.freeze({ abortJob: true, onlyIfQueued: true });
function detachedId(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
function correlationFor(request: SemanticTextTranslationRequest, coreGeneration: number, handle: TranslationRequestHandle | null): TranslationCorrelation {
    const identity = handle as {
        readonly id?: unknown;
        readonly jobId?: unknown;
    } | null;
    const requestId = detachedId(identity?.id);
    const jobId = detachedId(identity?.jobId);
    return Object.freeze({
        coreGeneration,
        textId: request.handle.textId,
        revision: request.handle.semanticRevision,
        attempt: request.sequence,
        ...(requestId === null ? {} : { requestId }),
        ...(jobId === null ? {} : { jobId }),
    });
}
function reportRequested(accept: RuntimeDiagnosticsIngress['accept'], request: SemanticTextTranslationRequest, correlation: TranslationCorrelation | null): void {
    if (accept === undefined || correlation === null)
        return;
    accept({
        type: 'translation.requested',
        ...correlation,
        sourceText: request.handle.sourceText,
        ...(request.recovery
            ? { message: 'new-appearance', fields: [{ name: 'priorAttempt', value: request.sequence - 1 }] }
            : {}),
    });
}
function reportRejected(accept: RuntimeDiagnosticsIngress['accept'], correlation: TranslationCorrelation | null, reason: 'request-threw' | 'promise-rejected' | 'non-string' | 'invalid-formatting', stage: SemanticTranslationFailure['stage'], error: unknown, recovery: SemanticTranslationFailure['recovery'] = 'new-appearance'): SemanticTranslationSettlement {
    const failure = Object.freeze({ reason, stage, recovery, ...copyErrorDescription(error) });
    if (accept !== undefined && correlation !== null) {
        accept({
            type: 'translation.rejected',
            ...correlation,
            message: reason,
            fields: Object.entries(failure).map(([name, value]) => ({ name, value })),
        });
    }
    return Object.freeze({ kind: 'failed', failure });
}
function reportNoop(accept: RuntimeDiagnosticsIngress['accept'], correlation: TranslationCorrelation | null, reason: unknown): SemanticTranslationSettlement {
    if (accept !== undefined && correlation !== null) {
        accept({
            type: 'translation.noop',
            ...correlation,
            message: typeof reason === 'string' && reason.length > 0 ? reason : 'policy-noop',
        });
    }
    return Object.freeze({
        kind: 'no-translation',
        reason: typeof reason === 'string' && reason.length > 0 ? reason : 'policy-noop',
    });
}
function reportAvailable(accept: RuntimeDiagnosticsIngress['accept'], correlation: TranslationCorrelation | null, encoded: EncodedTranslationText, output: string, immediate = false): SemanticTranslationSettlement {
    const translation = decodeTranslationText(encoded, output);
    if (translation === null)
        return reportRejected(accept, correlation, 'invalid-formatting', 'decoding', new Error('Translation cannot restore source formatting.'), immediate ? 'input-change' : 'new-appearance');
    const settlement: SemanticTranslationSettlement = Object.freeze({ kind: 'available', translation });
    if (accept !== undefined && correlation !== null) {
        accept({ type: 'translation.available', ...correlation, translation: translation.text });
    }
    return settlement;
}
async function deliverSettlement(promise: Promise<unknown>, delivery: SettlementDelivery): Promise<void> {
    let value: unknown, failed = false;
    try {
        value = await promise;
    }
    catch (error) {
        value = error;
        failed = true;
    }
    const complete = delivery.complete;
    delivery.complete = null;
    complete?.(value, failed);
}
function createCell(request: SemanticTextTranslationRequest): TranslationSettlementCell {
    let resolveCompletion!: (settlement: SemanticTranslationSettlement) => void;
    const completion = new Promise<SemanticTranslationSettlement>((resolve) => {
        resolveCompletion = resolve;
    });
    return {
        request,
        encoded: encodeTranslationText(request.handle),
        completion,
        resolve: resolveCompletion,
        admission: null,
        correlation: null,
        translator: null,
        managerHandle: null,
        managerAccepted: false,
        terminal: false,
        controlSettled: false,
        expectedCancellation: false,
        delivery: null,
    };
}
function pendingAdmission(cell: TranslationSettlementCell): SemanticTextTranslationAdmission {
    return Object.freeze({ request: cell.request, immediateSettlement: null, completion: cell.completion });
}
export function createSemanticTextTranslationHandoff(options: SemanticTextTranslationHandoffOptions): SemanticTextTranslationHandoff {
    const { requester, coreGeneration, diagnostics, readPriority } = options;
    const acceptDiagnosticFact = diagnostics.accept;
    const settlements = new WeakMap<SemanticTextTranslationRequest, TranslationSettlementCell>();
    const cellsBySemanticHandle = new Map<SemanticTextRevisionHandle, TranslationSettlementCell>();
    const currentByTextId = new Map<number, TranslationSettlementCell>();
    const activeByTextId = new Map<number, Set<TranslationSettlementCell>>();
    let disposed = false;
    function handoffIsDisposed(): boolean {
        return disposed;
    }
    function addActive(cell: TranslationSettlementCell): void {
        const textId = cell.request.handle.textId;
        const active = activeByTextId.get(textId);
        if (active === undefined)
            activeByTextId.set(textId, new Set([cell]));
        else
            active.add(cell);
    }
    function finishCell(cell: TranslationSettlementCell, settlement: SemanticTranslationSettlement): void {
        if (cell.terminal)
            return;
        cell.terminal = true;
        if (cell.delivery !== null)
            cell.delivery.complete = null;
        cell.delivery = null;
        cell.managerHandle = null;
        const textId = cell.request.handle.textId;
        const active = activeByTextId.get(textId);
        active?.delete(cell);
        if (active?.size === 0)
            activeByTextId.delete(textId);
        cell.resolve(settlement);
    }
    function reportSuperseded(cell: TranslationSettlementCell, outcome: 'queued-subscriber-canceled' | 'running-subscriber-demoted' | 'terminal-noop', successor: SemanticTextRevisionHandle | null, previousPriority?: number): void {
        if (acceptDiagnosticFact === undefined)
            return;
        const correlation = cell.correlation ?? correlationFor(cell.request, coreGeneration, cell.managerHandle);
        acceptDiagnosticFact({
            type: 'translation.superseded',
            ...correlation,
            message: outcome,
            fields: [
                ...(successor === null
                    ? []
                    : [{ name: 'successorRevision', value: successor.semanticRevision } as const]),
                ...(previousPriority === undefined
                    ? []
                    : [{ name: 'previousPriority', value: previousPriority } as const]),
                { name: 'targetPriority', value: readPriority(cell.request.handle) },
            ],
        });
    }
    function supersedeCell(cell: TranslationSettlementCell, successor: SemanticTextRevisionHandle | null): void {
        if (cell.controlSettled)
            return;
        cell.controlSettled = true;
        const handle = cell.managerHandle;
        if (!cell.managerAccepted && handle === null && !cell.terminal)
            return;
        if (!cell.managerAccepted || handle === null || cell.terminal) {
            reportSuperseded(cell, 'terminal-noop', successor);
            return;
        }
        let canceled = false;
        try {
            canceled = handle.cancel('semantic revision superseded', supersessionCancellationOptions);
        }
        catch {
        }
        if (canceled) {
            cell.expectedCancellation = true;
            reportSuperseded(cell, 'queued-subscriber-canceled', successor);
            return;
        }
        let previousPriority: number | undefined;
        try {
            const value = handle.getPriority();
            if (typeof value === 'number' && Number.isFinite(value))
                previousPriority = value;
        }
        catch {
        }
        const demoted = projectDemand(cell);
        reportSuperseded(cell, demoted ? 'running-subscriber-demoted' : 'terminal-noop', successor, previousPriority);
    }
    function reportExchange(cell: TranslationSettlementCell): void {
        if (!acceptDiagnosticFact || !cell.correlation || !cell.translator)
            return;
        acceptDiagnosticFact({
            type: 'translation.exchange',
            ...cell.correlation,
            fields: [
                { name: 'input', value: cell.translator.input },
                { name: 'output', value: cell.translator.output },
                { name: 'markerMismatch', value: cell.translator.markerMismatch },
            ],
        });
    }
    function projectDemand(cell: TranslationSettlementCell): boolean {
        if (cell.terminal || cell.managerHandle === null || !cell.managerAccepted)
            return false;
        const priority = readPriority(cell.request.handle);
        try {
            if (cell.managerHandle.getPriority() === priority)
                return false;
            const changed = cell.managerHandle.setPriority(priority, 'derived bitmap demand') === true;
            if (changed) {
                options.requestChanged?.(cell.request, { priority, stream: cell.managerHandle.stream });
                if (cell.correlation)
                    cell.correlation = Object.freeze({ ...cell.correlation, requestPriority: priority });
            }
            return changed;
        }
        catch {
            return false;
        }
    }
    function reconcileDemand(handles: readonly SemanticTextRevisionHandle[]): void {
        if (disposed)
            return;
        for (const handle of handles) {
            const cell = cellsBySemanticHandle.get(handle);
            if (cell !== undefined && !cell.controlSettled)
                projectDemand(cell);
        }
    }
    function releaseCell(cell: TranslationSettlementCell): void {
        const handle = cell.managerHandle;
        cell.managerHandle = null;
        cell.expectedCancellation = true;
        finishCell(cell, canceled);
        if (handle === null)
            return;
        try {
            handle.cancel('semantic owner released', { abortJob: true });
        }
        catch {
        }
    }
    function requestBatch(requests: readonly SemanticTextTranslationRequest[]): readonly SemanticTextTranslationAdmission[] {
        if (handoffIsDisposed())
            throw new Error('Semantic translation handoff is disposed.');
        const runtimeRequests: unknown = requests;
        if (!Array.isArray(runtimeRequests)) {
            throw new TypeError('Semantic translation requests must be an array.');
        }
        const cells: TranslationSettlementCell[] = [];
        const newCells: TranslationSettlementCell[] = [];
        for (const request of requests) {
            const requestValue: unknown = request;
            if ((typeof requestValue !== 'object' || requestValue === null) && typeof requestValue !== 'function') {
                throw new TypeError('A semantic translation request must be an object.');
            }
            let cell = settlements.get(request);
            if (cell === undefined) {
                cell = createCell(request);
                settlements.set(request, cell);
                cellsBySemanticHandle.set(request.handle, cell);
                currentByTextId.set(request.handle.textId, cell);
                newCells.push(cell);
            }
            cells.push(cell);
        }
        const supportedCells = newCells.filter((cell) => cell.encoded.supported);
        const requestedPriorities = new Map<TranslationSettlementCell, number>();
        let managerAdmissions: readonly TranslationRequestBatchAdmission[];
        if (supportedCells.length === 0) {
            managerAdmissions = Object.freeze([]);
        }
        else {
            try {
                managerAdmissions = requester.requestBatch(supportedCells.map((cell) => {
                    const { request, encoded } = cell;
                    const priority = readPriority(request.handle);
                    requestedPriorities.set(cell, priority);
                    return {
                        input: encoded.text,
                        options: {
                            onTranslatorExchange: (exchange: TranslatorExchange) => {
                                if (cell.terminal || handoffIsDisposed())
                                    return;
                                cell.translator = exchange;
                                options.exchangeChanged?.(cell.request, exchange);
                                reportExchange(cell);
                            },
                            hook: 'bitmap',
                            priority,
                            recordId: `${String(coreGeneration)}:${String(request.handle.textId)}`,
                        },
                    };
                }));
            }
            catch (error) {
                managerAdmissions = Object.freeze(supportedCells.map<TranslationRequestBatchAdmission>(() => Object.freeze({ kind: 'rejected' as const, reason: error })));
            }
        }
        let managerIndex = 0;
        for (const cell of newCells) {
            const managerAdmission = cell.encoded.supported ? managerAdmissions[managerIndex++] : undefined;
            const managerHandle = managerAdmission?.kind === 'accepted' || managerAdmission?.kind === 'no-translation'
                ? managerAdmission.handle
                : null;
            const priority = requestedPriorities.get(cell);
            const correlation = acceptDiagnosticFact === undefined
                ? null
                : Object.freeze({
                    ...correlationFor(cell.request, coreGeneration, managerHandle),
                    ...(priority !== undefined
                        ? {
                            requestPriority: priority,
                            requestStream: managerHandle?.stream === true,
                        }
                        : {}),
                });
            cell.correlation = correlation;
            cell.managerHandle = managerHandle;
            cell.managerAccepted = managerAdmission?.kind === 'accepted';
            if (priority !== undefined)
                options.requestChanged?.(cell.request, { priority, stream: managerHandle?.stream === true });
            reportRequested(acceptDiagnosticFact, cell.request, correlation);
            reportExchange(cell);
            let immediateSettlement: SemanticTranslationSettlement | null = null;
            if (handoffIsDisposed() || cell.terminal) {
                releaseCell(cell);
                immediateSettlement = canceled;
            }
            else if (!cell.encoded.supported) {
                immediateSettlement = reportRejected(acceptDiagnosticFact, correlation, 'invalid-formatting', 'encoding', new Error('Source formatting cannot be encoded.'), 'input-change');
            }
            else if (managerAdmission?.kind === 'no-translation') {
                immediateSettlement = reportNoop(acceptDiagnosticFact, correlation, managerAdmission.reason);
            }
            else if (managerHandle === null) {
                immediateSettlement = reportRejected(acceptDiagnosticFact, correlation, 'request-threw', 'admission', managerAdmission?.kind === 'rejected' ? managerAdmission.reason : undefined);
            }
            else if (managerAdmission?.kind === 'accepted' &&
                'immediateValue' in managerAdmission &&
                typeof managerAdmission.immediateValue === 'string') {
                immediateSettlement = reportAvailable(acceptDiagnosticFact, correlation, cell.encoded, managerAdmission.immediateValue, true);
            }
            const admission = Object.freeze({
                request: cell.request,
                immediateSettlement,
                completion: cell.completion,
            });
            cell.admission = admission;
            if (immediateSettlement !== null) {
                finishCell(cell, immediateSettlement);
            }
            else if (managerHandle === null) {
                finishCell(cell, canceled);
            }
            else {
                if (cell.controlSettled) {
                    cell.controlSettled = false;
                    const current = currentByTextId.get(cell.request.handle.textId);
                    if (current !== undefined && current !== cell)
                        supersedeCell(cell, current.request.handle);
                    else
                        releaseCell(cell);
                }
                if (cell.terminal)
                    continue;
                addActive(cell);
                if (readPriority(cell.request.handle) !== requestedPriorities.get(cell))
                    projectDemand(cell);
                const delivery: SettlementDelivery = {
                    complete: (value, failed) => {
                        const settlement = failed
                            ? cell.expectedCancellation
                                ? canceled
                                : reportRejected(acceptDiagnosticFact, cell.correlation, 'promise-rejected', 'provider', value)
                            : typeof value === 'string'
                                ? reportAvailable(acceptDiagnosticFact, cell.correlation, cell.encoded, value)
                                : reportRejected(acceptDiagnosticFact, cell.correlation, 'non-string', 'provider', new Error('Translator returned non-string output.'));
                        finishCell(cell, settlement);
                    },
                };
                cell.delivery = delivery;
                void deliverSettlement(managerHandle.promise, delivery);
            }
        }
        return Object.freeze(cells.map((cell) => cell.admission ?? pendingAdmission(cell)));
    }
    function revokeBatch(handles: readonly SemanticTextRevisionHandle[]): void {
        const runtimeHandles: unknown = handles;
        if (!Array.isArray(runtimeHandles))
            throw new TypeError('Semantic translation revocations must be an array.');
        for (const semanticHandle of handles) {
            const cell = cellsBySemanticHandle.get(semanticHandle);
            const current = currentByTextId.get(semanticHandle.textId);
            if (current !== undefined && current.request.handle !== semanticHandle) {
                if (cell !== undefined)
                    supersedeCell(cell, current.request.handle);
            }
            else {
                currentByTextId.delete(semanticHandle.textId);
                if (cell !== undefined)
                    releaseCell(cell);
                for (const active of activeByTextId.get(semanticHandle.textId) ?? []) {
                    if (active !== cell)
                        releaseCell(active);
                }
            }
            cellsBySemanticHandle.delete(semanticHandle);
        }
    }
    function dispose(): void {
        if (disposed)
            return;
        disposed = true;
        for (const cell of cellsBySemanticHandle.values())
            releaseCell(cell);
        for (const active of activeByTextId.values())
            for (const cell of active)
                releaseCell(cell);
        activeByTextId.clear();
        cellsBySemanticHandle.clear();
        currentByTextId.clear();
    }
    return Object.freeze({ requestBatch, revokeBatch, reconcileDemand, dispose });
}
