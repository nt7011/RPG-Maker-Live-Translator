import type { PendingTranslationQueue } from './pending-queue.js';
import { createTranslationLineageJob, type TranslationLineageJobProjection } from './lineage-ownership.js';
import type { TranslationManagerControllerFacades } from './controller-facades.js';
import type { PreparedSubscriberAdmission, SubscriberAbortSnapshot, SubscriberOwnershipRegistry, SubscriberPreparationOutcome, SubscriberTerminalizationReceipt, } from './subscriber-ownership.js';
type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
type JobSequenceTemplateCandidate = string & {
    readonly translationManagerJobSequence?: true;
};
type SubscriberSequenceTemplateCandidate = string & {
    readonly translationManagerSubscriberSequence?: true;
};
type HandoffKind = 'new' | 'join' | 'stream-upgrade';
type HandoffObservationKind = HandoffKind | 'canceled-before-publication';
interface RuntimeDateCandidate {
    now(): number;
}
interface TranslationManagerRequestHandoffRuntimeScopeCandidate {
    readonly Date: RuntimeDateCandidate;
}
interface TranslationManagerRequestCandidate {
    readonly normalized: unknown;
    readonly priority: unknown;
    readonly streamRequested: unknown;
    readonly stream: unknown;
    readonly timeoutMs: unknown;
    readonly onDelta: unknown;
    readonly onTranslatorExchange?: unknown;
    readonly recordId: unknown;
    readonly hook: unknown;
    readonly source: unknown;
    readonly metadata: unknown;
    readonly signal: unknown;
}
interface TranslationManagerRequestSnapshot extends Omit<TranslationManagerRequestCandidate, 'stream'> {
    readonly stream: boolean;
}
interface TranslationManagerRequestHandoffDiagnosticsCandidate {
    recordLazy(type: unknown, detailsFactory: () => unknown): unknown;
}
interface TranslationManagerRequestHandoffScopeCandidate {
    readonly applySubstitutePlaintextBeforeTranslationRules: RuntimeFunction;
    readonly substitutePlaintextBeforeTranslationRules: unknown;
    readonly requestTimeoutMs: unknown;
    readonly createAbortError: RuntimeFunction;
    readonly queuedJobs: PendingTranslationQueue;
    readonly subscriberOwnership: SubscriberOwnershipRegistry;
    readonly controllerFacades: Pick<TranslationManagerControllerFacades, 'jobs' | 'lineages' | 'subscribers'>;
    readonly translationDiagnostics: TranslationManagerRequestHandoffDiagnosticsCandidate;
    requestSequence: number;
    subscriberSequence: number;
    queueSequence: number;
}
interface TranslationManagerPreparedJob extends TranslationLineageJobProjection {
    readonly id: string;
    readonly key: unknown;
    readonly sourceKey: unknown;
    readonly cacheable: boolean;
    text: unknown;
    providerInputChanged: boolean;
    status: unknown;
    createdAt: number;
    queuedAt: number;
    queueSeq: number;
    effectivePriority: unknown;
    readonly subscribers: unknown;
    controller: unknown;
    abortError: unknown;
    stream: unknown;
    timeoutMs: unknown;
    hook: unknown;
    source: unknown;
    sourceHint: unknown;
    metadata: unknown;
    attempt: number;
    retryCount: number;
    lastRetryAt: unknown;
    nextRetryDelayMs: number;
    lastDeltaAt: unknown;
    deltaCount: number;
    lastPartialLength: number;
    lastDeltaEventAt: number;
    lastError: unknown;
}
type TranslationManagerPreparedJobDraft = Omit<TranslationManagerPreparedJob, keyof TranslationLineageJobProjection>;
interface TranslationManagerJobCandidate {
    readonly id: unknown;
    readonly key: unknown;
    readonly sourceHint: unknown;
    readonly status: unknown;
    readonly effectivePriority: unknown;
    readonly stream: unknown;
    readonly timeoutMs: unknown;
}
export interface TranslationManagerRequestHandoffObservation {
    readonly kind: HandoffObservationKind;
    readonly key: unknown;
    readonly jobId: unknown;
    readonly subscriberId: unknown;
    readonly upgradedFromJobId: unknown;
}
export interface TranslationManagerRequestHandoffResult {
    readonly handle: unknown;
    readonly job: unknown;
    readonly observation: TranslationManagerRequestHandoffObservation;
    readonly needsPump: boolean;
}
interface QueueAdmission {
    readonly queue: PendingTranslationQueue;
    readonly job: TranslationManagerJobCandidate;
    phase: 'prepared' | 'publishing' | 'published' | 'committed' | 'terminal';
}
interface HandoffTransaction {
    readonly kind: HandoffKind;
    readonly request: TranslationManagerRequestSnapshot;
    readonly job: TranslationManagerJobCandidate;
    readonly upgradedFromJob: TranslationManagerJobCandidate | null;
    readonly admission: PreparedSubscriberAdmission;
    readonly queueAdmission: QueueAdmission | null;
    readonly successResult: TranslationManagerRequestHandoffResult;
    readonly canceledResult: TranslationManagerRequestHandoffResult;
    policyPlan: unknown;
    lineageAttempted: boolean;
    committed: boolean;
}
export interface TranslationManagerRequestHandoffController {
    handoffProviderRequest(request: unknown, context?: unknown): TranslationManagerRequestHandoffResult;
}
type TranslationManagerRequestHandoffControllerFactory = (scope?: unknown) => TranslationManagerRequestHandoffController;
export interface TranslationManagerRequestHandoffModule {
    create: TranslationManagerRequestHandoffControllerFactory;
}
const handoffControllerFactories = new WeakMap<object, TranslationManagerRequestHandoffControllerFactory>();
function isObjectLike(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function createRealmHandoffControllerFactory(runtimeScope: object): TranslationManagerRequestHandoffControllerFactory {
    const runtime = runtimeScope as TranslationManagerRequestHandoffRuntimeScopeCandidate;
    function createController(scope: unknown = {}): TranslationManagerRequestHandoffController {
        const source = scope as TranslationManagerRequestHandoffScopeCandidate;
        const { applySubstitutePlaintextBeforeTranslationRules, substitutePlaintextBeforeTranslationRules, requestTimeoutMs, createAbortError, queuedJobs, subscriberOwnership, } = source;
        const { getRoutedJob, registerJob, forgetJob } = source.controllerFacades.lineages;
        const { prepareJobPolicy, commitJobPolicy, discardJobPolicy } = source.controllerFacades.jobs;
        const { cancelSubscriber, expireSubscriber, setSubscriberPriority } = source.controllerFacades.subscribers;
        function captureRequest(request: unknown): TranslationManagerRequestSnapshot {
            if (!isObjectLike(request)) {
                throw new TypeError('[TranslationService] A normalized provider request must be an object.');
            }
            const candidate = request as TranslationManagerRequestCandidate;
            return Object.freeze({
                normalized: candidate.normalized,
                priority: candidate.priority,
                streamRequested: candidate.streamRequested,
                stream: candidate.stream === true,
                timeoutMs: candidate.timeoutMs,
                onDelta: candidate.onDelta,
                onTranslatorExchange: candidate.onTranslatorExchange,
                recordId: candidate.recordId,
                hook: candidate.hook,
                source: candidate.source,
                metadata: candidate.metadata,
                signal: candidate.signal,
            });
        }
        function isStreamUpgrade(job: unknown, request: TranslationManagerRequestSnapshot): boolean {
            if (!isObjectLike(job))
                return false;
            const candidate = job as TranslationManagerJobCandidate;
            return candidate.status === 'running' && candidate.stream !== true && request.stream;
        }
        function requestRouteKey(request: TranslationManagerRequestSnapshot): string {
            if (typeof request.normalized !== 'string') {
                throw new TypeError('[TranslationService] A normalized request key must be a string.');
            }
            return request.normalized;
        }
        function isRouteStillValid(transaction: HandoffTransaction, afterRegistration = false): boolean {
            const routed = getRoutedJob(requestRouteKey(transaction.request));
            if (afterRegistration && transaction.kind !== 'join') {
                if (routed !== transaction.job)
                    return false;
                const status = transaction.job.status;
                return status === 'queued' || status === 'running';
            }
            if (transaction.kind === 'new')
                return !(routed as FalsySensitiveValue);
            const expected = transaction.kind === 'join' ? transaction.job : transaction.upgradedFromJob;
            if (routed !== expected || expected === null)
                return false;
            if (transaction.kind === 'stream-upgrade')
                return isStreamUpgrade(expected, transaction.request);
            const status = expected.status;
            return (status === 'queued' || status === 'running') && !isStreamUpgrade(expected, transaction.request);
        }
        function createJob(request: TranslationManagerRequestSnapshot): TranslationManagerPreparedJob {
            const providerText = applySubstitutePlaintextBeforeTranslationRules(request.normalized, substitutePlaintextBeforeTranslationRules);
            const providerInputChanged = providerText !== request.normalized;
            const routeKey = requestRouteKey(request);
            let requestValue: unknown;
            const job = createTranslationLineageJob<TranslationManagerPreparedJobDraft>({
                id: `job:${++source.requestSequence as unknown as JobSequenceTemplateCandidate}`,
                key: routeKey,
                sourceKey: request.normalized,
                cacheable: true,
                text: providerText,
                providerInputChanged,
                status: 'queued',
                createdAt: runtime.Date.now(),
                queuedAt: runtime.Date.now(),
                queueSeq: ++source.queueSequence,
                effectivePriority: request.priority,
                subscribers: null,
                controller: null,
                abortError: null,
                stream: request.stream,
                timeoutMs: ((requestValue = request.timeoutMs) as boolean) ? requestValue : requestTimeoutMs,
                hook: ((requestValue = request.hook) as boolean) ? requestValue : '',
                source: ((requestValue = request.source) as boolean) ? requestValue : '',
                sourceHint: 'provider',
                metadata: ((requestValue = request.metadata) as boolean) ? requestValue : {},
                attempt: 0,
                retryCount: 0,
                lastRetryAt: null,
                nextRetryDelayMs: 0,
                lastDeltaAt: null,
                deltaCount: 0,
                lastPartialLength: 0,
                lastDeltaEventAt: 0,
                lastError: null,
            });
            Object.defineProperty(job, 'subscribers', {
                configurable: false,
                enumerable: true,
                value: subscriberOwnership.createJobProjection(job),
                writable: false,
            });
            return job;
        }
        function createObservation(kind: HandoffObservationKind, request: TranslationManagerRequestSnapshot, job: TranslationManagerJobCandidate, subscriberId: unknown, upgradedFromJob: TranslationManagerJobCandidate | null): TranslationManagerRequestHandoffObservation {
            return Object.freeze({
                kind,
                key: request.normalized,
                jobId: job.id,
                subscriberId,
                upgradedFromJobId: upgradedFromJob?.id ?? '',
            });
        }
        function createResult(handle: unknown, job: TranslationManagerJobCandidate, observation: TranslationManagerRequestHandoffObservation, needsPump: boolean): TranslationManagerRequestHandoffResult {
            return Object.freeze({ handle, job, observation, needsPump });
        }
        function prepareSubscriber(job: TranslationManagerJobCandidate, request: TranslationManagerRequestSnapshot, context: unknown, initialStatus: unknown): SubscriberPreparationOutcome {
            let requestValue: unknown;
            const sourceHintValue = job.sourceHint;
            return subscriberOwnership.prepareSubscriber({
                id: `sub:${++source.subscriberSequence as unknown as SubscriberSequenceTemplateCandidate}`,
                job,
                priority: request.priority,
                stream: request.stream,
                timeoutMs: ((requestValue = request.timeoutMs) as boolean) ? requestValue : requestTimeoutMs,
                onDelta: request.onDelta,
                onTranslatorExchange: request.onTranslatorExchange,
                recordId: request.recordId,
                hook: ((requestValue = request.hook) as boolean) ? requestValue : '',
                source: ((requestValue = request.source) as boolean) ? requestValue : '',
                sourceHint: (sourceHintValue as FalsySensitiveValue) ? sourceHintValue : 'provider',
                metadata: ((requestValue = request.metadata) as boolean) ? requestValue : {},
                createdAt: runtime.Date.now(),
                context,
                signal: request.signal,
                initialStatus,
                cancelActive: cancelSubscriber,
                expireActive: expireSubscriber,
                setPriorityActive: setSubscriberPriority,
            });
        }
        function reportRollbackFailure(primary: unknown, secondary: unknown): void {
            try {
                source.translationDiagnostics.recordLazy('request.handoff_rollback_error', () => ({
                    primary,
                    secondary,
                }));
            }
            catch {
            }
        }
        function attemptRollback<Result>(primary: unknown, operation: () => Result): Result | undefined {
            try {
                return operation();
            }
            catch (secondary) {
                reportRollbackFailure(primary, secondary);
                return undefined;
            }
        }
        function createQueueAdmission(job: TranslationManagerJobCandidate): QueueAdmission {
            return { queue: queuedJobs, job, phase: 'prepared' };
        }
        function publishQueueAdmission(admission: QueueAdmission): void {
            if (admission.phase !== 'prepared')
                throw new Error('[TranslationService] Queue admission is not prepared.');
            admission.phase = 'publishing';
            admission.queue.add(admission.job);
            if (!admission.queue.has(admission.job))
                throw new Error('[TranslationService] Queue admission lost its job.');
            admission.phase = 'published';
        }
        function rollbackQueueAdmission(admission: QueueAdmission): boolean {
            if (admission.phase === 'committed' || admission.phase === 'terminal')
                return false;
            admission.queue.delete(admission.job);
            if (admission.queue.has(admission.job))
                throw new Error('[TranslationService] Queue rollback retained its job.');
            admission.phase = 'terminal';
            return true;
        }
        function rollback(transaction: HandoffTransaction, primary: unknown, status: 'canceled' | 'failed'): void {
            if (transaction.committed)
                return;
            const terminalization: SubscriberTerminalizationReceipt | null = attemptRollback(primary, () => subscriberOwnership.terminalizeAdmission(transaction.admission.token, primary, status)) ?? null;
            const queueAdmission = transaction.queueAdmission;
            if (queueAdmission !== null) {
                attemptRollback(primary, () => {
                    rollbackQueueAdmission(queueAdmission);
                });
            }
            if (transaction.policyPlan !== null) {
                attemptRollback(primary, () => {
                    discardJobPolicy(transaction.policyPlan);
                });
                transaction.policyPlan = null;
            }
            if (transaction.lineageAttempted) {
                attemptRollback(primary, () => {
                    forgetJob(transaction.job);
                });
            }
            if (terminalization !== null) {
                attemptRollback(primary, () => {
                    subscriberOwnership.releaseTerminalization(terminalization);
                });
            }
        }
        function commit(transaction: HandoffTransaction): SubscriberAbortSnapshot | null {
            if (!isRouteStillValid(transaction)) {
                throw new Error('[TranslationService] Provider-request route changed during handoff.');
            }
            if (transaction.kind !== 'join') {
                transaction.lineageAttempted = true;
                registerJob(transaction.job);
            }
            subscriberOwnership.stageAdmission(transaction.admission.token);
            subscriberOwnership.prepareActivation(transaction.admission.token);
            if (!isRouteStillValid(transaction, transaction.kind !== 'join')) {
                throw new Error('[TranslationService] Provider-request route changed during deadline acquisition.');
            }
            transaction.policyPlan = prepareJobPolicy(transaction.job, transaction.admission.token);
            if (transaction.kind !== 'join') {
                if (transaction.queueAdmission === null) {
                    throw new Error('[TranslationService] Queue admission is unavailable.');
                }
                publishQueueAdmission(transaction.queueAdmission);
            }
            const pendingAbort = subscriberOwnership.getPendingAbort(transaction.admission.token);
            if (pendingAbort !== null)
                return pendingAbort;
            const activeStatus = transaction.job.status === 'running' ? 'running' : 'queued';
            subscriberOwnership.activateAdmission(transaction.admission.token, activeStatus);
            if (!commitJobPolicy(transaction.policyPlan)) {
                throw new Error('[TranslationService] Prepared admission policy could not be committed.');
            }
            transaction.policyPlan = null;
            if (transaction.queueAdmission !== null)
                transaction.queueAdmission.phase = 'committed';
            transaction.committed = true;
            return null;
        }
        function handoffProviderRequest(request: unknown, context: unknown = {}): TranslationManagerRequestHandoffResult {
            const snapshot = captureRequest(request);
            const routedValue = getRoutedJob(requestRouteKey(snapshot));
            const routed = (routedValue as FalsySensitiveValue)
                ? (routedValue as TranslationManagerJobCandidate)
                : null;
            const streamUpgrade = routed !== null && isStreamUpgrade(routed, snapshot);
            const kind: HandoffKind = routed === null ? 'new' : streamUpgrade ? 'stream-upgrade' : 'join';
            let job: TranslationManagerJobCandidate;
            if (kind === 'join') {
                if (routed === null)
                    throw new Error('[TranslationService] Provider-request join lost its route.');
                job = routed;
            }
            else {
                job = createJob(snapshot);
            }
            const upgradedFromJob = kind === 'stream-upgrade' ? routed : null;
            const initialStatus = job.status === 'running' ? 'running' : 'queued';
            const prepared = prepareSubscriber(job, snapshot, context, initialStatus);
            const subscriberId = prepared.subscriber.id;
            if (prepared.kind === 'canceled') {
                return createResult(prepared.handle, job, createObservation('canceled-before-publication', snapshot, job, subscriberId, upgradedFromJob), false);
            }
            let transaction: HandoffTransaction;
            try {
                const successObservation = createObservation(kind, snapshot, job, subscriberId, upgradedFromJob);
                const canceledObservation = createObservation('canceled-before-publication', snapshot, job, subscriberId, upgradedFromJob);
                transaction = {
                    kind,
                    request: snapshot,
                    job,
                    upgradedFromJob,
                    admission: prepared,
                    queueAdmission: kind === 'join' ? null : createQueueAdmission(job),
                    successResult: createResult(prepared.handle, job, successObservation, kind !== 'join' || initialStatus === 'queued'),
                    canceledResult: createResult(prepared.handle, job, canceledObservation, false),
                    policyPlan: null,
                    lineageAttempted: false,
                    committed: false,
                };
            }
            catch (error) {
                attemptRollback(error, () => {
                    subscriberOwnership.rollbackAdmission(prepared.token, error, 'failed');
                });
                throw error;
            }
            try {
                const pendingAbort = commit(transaction);
                if (pendingAbort !== null) {
                    const abortError = pendingAbort.kind === 'deadline' ? pendingAbort.error : createAbortError(pendingAbort.reason);
                    rollback(transaction, abortError, 'canceled');
                    return transaction.canceledResult;
                }
                return transaction.successResult;
            }
            catch (error) {
                rollback(transaction, error, 'failed');
                throw error;
            }
        }
        return { handoffProviderRequest };
    }
    return createController;
}
export function createTranslationManagerRequestHandoffModule(runtimeScope: object): TranslationManagerRequestHandoffModule {
    const createController = handoffControllerFactories.getOrInsertComputed(runtimeScope, createRealmHandoffControllerFactory);
    return { create: createController };
}
