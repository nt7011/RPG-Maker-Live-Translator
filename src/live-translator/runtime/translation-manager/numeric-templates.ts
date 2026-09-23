import { encodeNumericText, instantiateNumericTemplate, parseNumericTemplate, type NumericTemplate, type NumericText, } from '../numeric-text-codec.js';
import type { EncodedTranslationText } from '../translation-text-codec.js';
import type { TranslationRequestHandle } from './handles.js';
import type { TranslationManagerRequestHandoffResult } from './request-handoff.js';
import type { TranslatorExchange } from '../text-record-types.js';
import type { CancellationClassification } from '../cancellation.js';
export function numericConstructionPriority(priority: number): number {
    return Math.max(0, priority - 5);
}
export interface NumericObservation {
    readonly source: NumericText;
    readonly onConstruction: (handle: TranslationRequestHandle) => void;
}
const observations = new WeakSet<NumericObservation>();
export function createNumericObservation(encoded: EncodedTranslationText, onConstruction: NumericObservation['onConstruction']): NumericObservation | null {
    const source = encodeNumericText(encoded);
    if (source === null)
        return null;
    const observation = Object.freeze({ source, onConstruction });
    observations.add(observation);
    return observation;
}
export function readNumericObservation(value: unknown, normalized: unknown): NumericObservation | null {
    if (typeof value !== 'object' || value === null || !observations.has(value as NumericObservation))
        return null;
    const observation = value as NumericObservation;
    return observation.source.source === normalized ? observation : null;
}
export interface NumericTemplateOperation {
    readonly route: symbol;
    readonly markerCorrection: boolean;
    dispatch(): boolean;
    validate(output: string): boolean;
    complete(): void;
    fail(count: boolean, reason: string): void;
}
interface PendingConstruction {
    readonly operation: NumericTemplateOperation;
    readonly handles: Set<TranslationRequestHandle>;
    dispatched: boolean;
}
interface Family {
    readonly firstValues: string;
    qualified: boolean;
    failures: number;
    ready: NumericTemplate | null;
    pending: PendingConstruction | null;
}
interface NumericSession {
    readonly families: Map<string, Family>;
    releaseOwner: (() => void) | null;
}
const sessions = new WeakMap<object, NumericSession>();
interface NumericRequest {
    readonly normalized: unknown;
    readonly numericObservation?: unknown;
    readonly priority: unknown;
    readonly [name: string]: unknown;
}
interface NumericTemplateControllerOptions {
    readonly sessionScope: object;
    readonly enabled: boolean;
    readonly handoff: (request: unknown) => TranslationManagerRequestHandoffResult;
    readonly classifyCancellation: (error: unknown) => CancellationClassification;
    readonly report: (fields: Record<string, unknown>) => void;
}
export interface NumericTemplateController {
    observe(request: NumericRequest, pump: () => void): string | null;
    dispose(): void;
}
export function createNumericTemplateController(options: NumericTemplateControllerOptions): NumericTemplateController {
    const session = sessions.getOrInsertComputed(options.sessionScope, () => ({
        families: new Map(),
        releaseOwner: null,
    }));
    session.releaseOwner?.();
    const seen = new WeakSet<NumericObservation>();
    const owned = new Set<PendingConstruction>();
    let disposed = false;
    function report(source: NumericText, family: Family, fields: Record<string, unknown>): void {
        try {
            options.report({
                operation: 'numeric-template',
                template: source.template,
                failures: family.failures,
                blacklisted: family.failures >= 8,
                ...fields,
            });
        }
        catch {
        }
    }
    function construct(source: NumericText, family: Family): PendingConstruction {
        let accepted: NumericTemplate | null = null;
        const pending: PendingConstruction = {
            handles: new Set(),
            dispatched: false,
            operation: Object.freeze({
                route: Symbol('numeric-template'),
                markerCorrection: family.failures > 0,
                dispatch(): boolean {
                    if (disposed || family.pending !== pending || pending.dispatched)
                        return false;
                    pending.dispatched = true;
                    return true;
                },
                validate(output: string): boolean {
                    if (disposed || family.pending !== pending)
                        return false;
                    accepted = parseNumericTemplate(source, output);
                    report(source, family, { output, valid: accepted !== null });
                    return accepted !== null;
                },
                complete(): void {
                    if (disposed || family.pending !== pending || accepted === null)
                        return;
                    family.ready = accepted;
                    family.pending = null;
                    owned.delete(pending);
                    report(source, family, { state: 'ready' });
                },
                fail(count: boolean, reason: string): void {
                    if (disposed || family.pending !== pending)
                        return;
                    if (count && pending.dispatched)
                        family.failures++;
                    family.pending = null;
                    owned.delete(pending);
                    report(source, family, { state: family.failures >= 8 ? 'blacklisted' : 'eligible', reason });
                },
            }),
        };
        family.pending = pending;
        owned.add(pending);
        return pending;
    }
    function observe(request: NumericRequest, pump: () => void): string | null {
        if (disposed)
            return null;
        const observation = readNumericObservation(request.numericObservation, request.normalized);
        if (observation === null)
            return null;
        const source = observation.source;
        const values = JSON.stringify(source.values);
        const family = session.families.getOrInsertComputed(source.key, (): Family => ({
            firstValues: values,
            qualified: false,
            failures: 0,
            ready: null,
            pending: null,
        }));
        if (family.ready !== null)
            return instantiateNumericTemplate(source, family.ready);
        if (!options.enabled)
            return null;
        if (seen.has(observation))
            return null;
        seen.add(observation);
        if (values !== family.firstValues)
            family.qualified = true;
        if (!family.qualified || family.failures >= 8)
            return null;
        const pending = family.pending ?? construct(source, family);
        if (pending.dispatched &&
            !Array.from(pending.handles).some((handle) => {
                const status = handle.getStatus();
                return status === 'running' || status === 'queued';
            }))
            return null;
        const priority = numericConstructionPriority(Number(request.priority));
        try {
            const outcome = options.handoff({
                ...request,
                normalized: source.template,
                numericTemplate: pending.operation,
                dispatchGroup: undefined,
                priority,
                stream: false,
                streamRequested: false,
                onDelta: null,
                onTranslatorExchange: (exchange: TranslatorExchange) => {
                    report(source, family, { input: exchange.input, output: exchange.output });
                },
            });
            const handle = outcome.handle as TranslationRequestHandle;
            pending.handles.add(handle);
            void handle.promise.then(() => {
                pending.handles.delete(handle);
                if (pending.handles.size === 0 && !pending.dispatched)
                    pending.operation.fail(false, 'operation ended without publication');
            }, (error: unknown) => {
                pending.handles.delete(handle);
                if (pending.handles.size === 0 && !pending.dispatched) {
                    const classification = options.classifyCancellation(error);
                    pending.operation.fail(classification.kind !== 'cancellation', classification.message);
                }
            });
            try {
                observation.onConstruction(handle);
            }
            catch {
                handle.cancel('numeric origin could not acquire its control', { abortJob: true });
            }
            report(source, family, { state: 'pending', priority, jobId: (outcome.job as {
                    id: unknown;
                }).id });
            if (outcome.needsPump)
                pump();
        }
        catch {
            if (pending.handles.size === 0 && !pending.dispatched)
                pending.operation.fail(false, 'admission failed');
        }
        return null;
    }
    function dispose(): void {
        if (disposed)
            return;
        disposed = true;
        for (const family of session.families.values()) {
            if (family.pending !== null && owned.has(family.pending))
                family.pending = null;
        }
        for (const pending of owned)
            for (const handle of pending.handles) {
                try {
                    handle.cancel('numeric template owner released', { abortJob: true });
                }
                catch {
                }
            }
        owned.clear();
        if (session.releaseOwner === dispose)
            session.releaseOwner = null;
    }
    session.releaseOwner = dispose;
    return Object.freeze({ observe, dispose });
}
