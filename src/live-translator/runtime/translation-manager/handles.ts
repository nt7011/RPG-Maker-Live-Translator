import type { CancellationModule } from '../cancellation.js';
import { capturePromiseHandleCapabilities, publishPromiseHandleFacade, type PromiseConvenienceMethods, } from '../promise-handle.js';
export type { PromiseConvenienceMethods } from '../promise-handle.js';
type StringCoercionCandidate = string | number | boolean | bigint | symbol | null | undefined;
type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
interface TranslationManagerHandlesCommonCandidate {
    readonly clampPriority: RuntimeFunction;
}
interface ImmediateHandleOptionsCandidate {
    readonly error?: unknown;
    readonly sourceHint?: StringCoercionCandidate;
    readonly id?: unknown;
    readonly key?: unknown;
    readonly priority?: unknown;
    readonly status?: unknown;
}
interface SubscriberHandleIdentityCandidate {
    readonly stream: unknown;
    readonly id: unknown;
    readonly jobId: unknown;
    readonly key: unknown;
    readonly sourceHint: unknown;
}
interface SubscriberHandleControlsCandidate {
    readonly cancel: unknown;
    readonly setPriority: unknown;
    readonly getPriority: unknown;
    readonly getStatus: unknown;
    readonly getSourceHint: unknown;
}
interface ImmediateResolutionPlan {
    readonly kind: 'resolve';
    readonly value: unknown;
    readonly handleStatus: 'completed' | 'skipped';
}
interface ImmediateRejectionPlan {
    readonly kind: 'reject';
    readonly reason: unknown;
}
type ImmediateSettlementPlan = ImmediateResolutionPlan | ImmediateRejectionPlan;
type DeferredResolve<T> = (value: T | PromiseLike<T>) => void;
type DeferredReject = (reason?: unknown) => void;
export interface TranslationRequestCancelOptions {
    readonly abortJob?: boolean;
    readonly onlyIfQueued?: boolean;
}
export interface ImmediateTranslationHandleBase {
    readonly stream: boolean;
    readonly id: unknown;
    readonly key: unknown;
    readonly sourceHint: string;
    readonly promise: Promise<unknown>;
    readonly cancel: (reason?: unknown, options?: TranslationRequestCancelOptions) => false;
    readonly setPriority: (priority?: unknown, reason?: unknown) => false;
    readonly getPriority: () => unknown;
    readonly getStatus: () => unknown;
    readonly getSourceHint: () => string;
}
export type ImmediateTranslationHandle = Readonly<ImmediateTranslationHandleBase & PromiseConvenienceMethods>;
export interface SubscriberTranslationHandleBase {
    readonly stream: boolean;
    readonly id: string;
    readonly jobId: string;
    readonly key: string;
    readonly sourceHint: unknown;
    readonly promise: Promise<unknown>;
    readonly cancel: (reason?: unknown, options?: TranslationRequestCancelOptions) => boolean;
    readonly setPriority: (priority?: unknown, reason?: unknown) => unknown;
    readonly getPriority: () => unknown;
    readonly getStatus: () => unknown;
    readonly getSourceHint: () => unknown;
}
export type SubscriberTranslationHandle = Readonly<SubscriberTranslationHandleBase & PromiseConvenienceMethods>;
export type TranslationRequestHandle = ImmediateTranslationHandle | SubscriberTranslationHandle;
export interface SubscriberHandleSettlementLease {
    readonly handle: SubscriberTranslationHandle;
}
interface SubscriberHandleSettlementCell {
    readonly resolve: DeferredResolve<unknown>;
    readonly reject: DeferredReject;
    settled: boolean;
}
export interface TranslationManagerHandlesModule {
    readonly createAbortError: CancellationModule['createAbortError'];
    readonly classifyCancellation: CancellationModule['classifyCancellation'];
    createSubscriberHandleLease(identity: unknown, controls: unknown): SubscriberHandleSettlementLease;
    settleSubscriberHandleLease(lease: unknown, kind: unknown, value: unknown): boolean;
    createImmediateHandle(result: unknown, options?: unknown): ImmediateTranslationHandle;
}
const applyRuntimeFunction = Reflect.apply;
function isObjectLike(value: unknown): value is object | RuntimeFunction {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function callPromiseCapability(capability: RuntimeFunction, promise: object | RuntimeFunction, args: readonly unknown[]): unknown {
    return applyRuntimeFunction(capability, promise, args);
}
function truthyOr<Value, Fallback>(value: Value, fallback: Fallback): Value | Fallback {
    if (value)
        return value;
    return fallback;
}
function normalizeImmediateResolutionStatus(status: unknown): 'completed' | 'skipped' {
    if (status == null || status === 'completed')
        return 'completed';
    if (status === 'skipped')
        return 'skipped';
    throw new TypeError('[TranslationService] resolved immediate handle status must be completed or skipped.');
}
export function createTranslationManagerHandlesModule(common: unknown, cancellation: CancellationModule): TranslationManagerHandlesModule {
    const { clampPriority } = common as TranslationManagerHandlesCommonCandidate;
    const { createAbortError, classifyCancellation } = cancellation;
    const subscriberHandleSettlementCells = new WeakMap<object, SubscriberHandleSettlementCell>();
    function createSubscriberHandleLease(identity: unknown, controls: unknown): SubscriberHandleSettlementLease {
        if (!isObjectLike(identity) || !isObjectLike(controls)) {
            throw new TypeError('[TranslationService] Subscriber handle identity and controls must be objects.');
        }
        const identityCandidate = identity as SubscriberHandleIdentityCandidate;
        const controlsCandidate = controls as SubscriberHandleControlsCandidate;
        const id = identityCandidate.id;
        const jobId = identityCandidate.jobId;
        const key = identityCandidate.key;
        const sourceHint = identityCandidate.sourceHint;
        const cancel = controlsCandidate.cancel;
        const setPriority = controlsCandidate.setPriority;
        const getPriority = controlsCandidate.getPriority;
        const getStatus = controlsCandidate.getStatus;
        const getSourceHint = controlsCandidate.getSourceHint;
        if (typeof id !== 'string' ||
            id.length === 0 ||
            typeof jobId !== 'string' ||
            jobId.length === 0 ||
            typeof key !== 'string' ||
            key.length === 0) {
            throw new TypeError('[TranslationService] Subscriber handle identities and key must be nonempty strings.');
        }
        if (typeof cancel !== 'function' ||
            typeof setPriority !== 'function' ||
            typeof getPriority !== 'function' ||
            typeof getStatus !== 'function' ||
            typeof getSourceHint !== 'function') {
            throw new TypeError('[TranslationService] Subscriber handle controls must be complete functions.');
        }
        let resolve: DeferredResolve<unknown> | undefined;
        let reject: DeferredReject | undefined;
        const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        });
        if (resolve === undefined || reject === undefined) {
            throw new Error('[TranslationService] Subscriber handle promise capabilities were not initialized.');
        }
        promise.catch(() => undefined);
        try {
            const capabilities = capturePromiseHandleCapabilities(promise, '[TranslationService]');
            const carrier: SubscriberTranslationHandleBase = {
                stream: identityCandidate.stream === true,
                id,
                jobId,
                key,
                sourceHint,
                promise,
                cancel: cancel as SubscriberTranslationHandleBase['cancel'],
                setPriority: setPriority as SubscriberTranslationHandleBase['setPriority'],
                getPriority: getPriority as SubscriberTranslationHandleBase['getPriority'],
                getStatus: getStatus as SubscriberTranslationHandleBase['getStatus'],
                getSourceHint: getSourceHint as SubscriberTranslationHandleBase['getSourceHint'],
            };
            const handle = publishPromiseHandleFacade(carrier, capabilities, '[TranslationService]');
            const lease = Object.freeze({ handle });
            subscriberHandleSettlementCells.set(lease, {
                resolve,
                reject,
                settled: false,
            });
            return lease;
        }
        catch (error) {
            reject(error);
            throw error;
        }
    }
    function settleSubscriberHandleLease(lease: unknown, kind: unknown, value: unknown): boolean {
        if (kind !== 'resolve' && kind !== 'reject') {
            throw new TypeError('[TranslationService] Subscriber handle settlement kind must be resolve or reject.');
        }
        const cell = isObjectLike(lease) ? subscriberHandleSettlementCells.get(lease) : undefined;
        if (cell === undefined || cell.settled)
            return false;
        cell.settled = true;
        if (kind === 'resolve')
            cell.resolve(value);
        else
            cell.reject(value);
        return true;
    }
    function createImmediateHandle(result: unknown, options: unknown = {}): ImmediateTranslationHandle {
        const candidate = options as ImmediateHandleOptionsCandidate;
        const error = candidate.error;
        const sourceHintInput = candidate.sourceHint;
        const idInput = candidate.id;
        const keyInput = candidate.key;
        const priorityInput = candidate.priority;
        const statusInput = candidate.status;
        let sourceHint = '';
        if (sourceHintInput)
            sourceHint = String(sourceHintInput);
        const id = truthyOr(idInput, '');
        const key = truthyOr(keyInput, '');
        const priority = clampPriority(priorityInput);
        const settlement: ImmediateSettlementPlan = error
            ? Object.freeze({ kind: 'reject', reason: error })
            : Object.freeze({
                kind: 'resolve',
                value: result,
                handleStatus: normalizeImmediateResolutionStatus(truthyOr(statusInput, 'completed')),
            });
        const promise = new Promise<unknown>((resolve, reject) => {
            if (settlement.kind === 'resolve')
                resolve(settlement.value);
            else
                reject(settlement.reason);
        });
        const capabilities = capturePromiseHandleCapabilities(promise, '[TranslationService]');
        let status: unknown = 'pending';
        callPromiseCapability(capabilities.then, capabilities.promise, [
            () => {
                if (settlement.kind === 'resolve')
                    status = settlement.handleStatus;
            },
            () => {
                status = 'failed';
            },
        ]);
        const carrier: ImmediateTranslationHandleBase = {
            stream: false,
            id,
            key,
            sourceHint,
            promise,
            cancel: () => false,
            setPriority: () => false,
            getPriority: () => priority,
            getStatus: () => status,
            getSourceHint: () => sourceHint,
        };
        return publishPromiseHandleFacade(carrier, capabilities, '[TranslationService]');
    }
    return {
        createAbortError,
        classifyCancellation,
        createSubscriberHandleLease,
        settleSubscriberHandleLease,
        createImmediateHandle,
    };
}
