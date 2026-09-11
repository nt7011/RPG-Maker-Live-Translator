import type { CancellationClassification } from '../cancellation.js';
import type { TranslationManagerControllerFacades } from './controller-facades.js';
import type { TranslationManagerJobPolicyPlan } from './jobs.js';
import type { SubscriberOwnershipRegistry, SubscriberSettlementSnapshot } from './subscriber-ownership.js';
type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
interface RuntimeDateCandidate {
    now(): unknown;
}
interface TranslationManagerSubscribersRuntimeScopeCandidate {
    readonly Date: RuntimeDateCandidate;
    readonly String: RuntimeFunction;
}
interface TranslationManagerSubscribersDiagnosticsCandidate {
    increment(name: unknown): unknown;
    recordLazy(type: unknown, detailsFactory: () => unknown): unknown;
    rememberJob(job: unknown, status: unknown, details?: unknown): unknown;
    flush(): unknown;
}
interface TranslationManagerSubscribersScopeCandidate {
    readonly clampPriority: RuntimeFunction;
    readonly createAbortError: RuntimeFunction;
    readonly classifyCancellation: RuntimeFunction;
    readonly formatError: RuntimeFunction;
    readonly subscriberOwnership: SubscriberOwnershipRegistry;
    readonly controllerFacades: Pick<TranslationManagerControllerFacades, 'eligibility' | 'jobs' | 'lineages' | 'queue'>;
    readonly translationDiagnostics: TranslationManagerSubscribersDiagnosticsCandidate;
}
interface TranslationManagerAbortControllerCandidate {
    readonly abort: RuntimeFunction;
}
interface TranslationManagerCancellationOptionsCandidate {
    readonly abortJob?: unknown;
    readonly onlyIfQueued?: unknown;
}
interface TranslationManagerCancellationOptionsSnapshot {
    readonly abortJob: boolean;
    readonly onlyIfQueued: boolean;
}
interface TranslationManagerSubscriberJobCandidate {
    readonly id: unknown;
    readonly key: unknown;
    status: unknown;
    readonly hook: unknown;
    abortError: unknown;
    readonly controller: unknown;
    detached: unknown;
}
interface SubscriberSettlementPlan {
    readonly kind: 'resolve' | 'reject';
    readonly value: unknown;
    readonly status: 'completed' | 'canceled' | 'failed';
    readonly classification: CancellationClassification | null;
}
export interface TranslationManagerSubscribersController {
    settleSubscriber(subscriber: unknown, kind: unknown, value: unknown, classification?: CancellationClassification | null): boolean;
    settleJobSubscribers(job: unknown, kind: unknown, value: unknown, classification?: CancellationClassification | null): number;
    markJobSubscribersRunning(job: unknown): number;
    cancelSubscriber(subscriber: unknown, reason?: unknown, options?: unknown): boolean;
    expireSubscriber(subscriber: unknown, error: unknown): boolean;
    setSubscriberPriority(subscriber: unknown, priority: unknown, reason?: unknown): boolean;
    cancelByRecordId(recordId: unknown, reason?: unknown, options?: unknown): number;
    setPriorityByRecordId(recordId: unknown, priority: unknown, reason?: unknown): number;
}
type TranslationManagerSubscribersControllerFactory = (scope?: unknown) => TranslationManagerSubscribersController;
export interface TranslationManagerSubscribersModule {
    create: TranslationManagerSubscribersControllerFactory;
}
const subscribersControllerFactories = new WeakMap<object, TranslationManagerSubscribersControllerFactory>();
function createRealmSubscribersControllerFactory(runtimeScope: object): TranslationManagerSubscribersControllerFactory {
    const runtime = runtimeScope as TranslationManagerSubscribersRuntimeScopeCandidate;
    function createController(scope: unknown = {}): TranslationManagerSubscribersController {
        const source = scope as TranslationManagerSubscribersScopeCandidate;
        const { clampPriority, createAbortError, classifyCancellation, subscriberOwnership } = source;
        const { logTranslationEvent } = source.controllerFacades.eligibility;
        const { finishJob, relinquishJob } = source.controllerFacades.lineages;
        const { prepareJobPolicy, commitJobPolicy, discardJobPolicy, publishJobPolicy, recomputeJobPriority, removeQueuedJob, } = source.controllerFacades.jobs;
        const { schedulePump } = source.controllerFacades.queue;
        const deadlineCancellationOptions = Object.freeze({ abortJob: true });
        function observe(operation: () => unknown): void {
            try {
                operation();
            }
            catch {
            }
        }
        function captureCancellationOptions(options: unknown): TranslationManagerCancellationOptionsSnapshot {
            if (!(options as FalsySensitiveValue) || typeof options !== 'object') {
                return { abortJob: false, onlyIfQueued: false };
            }
            const candidate = options as TranslationManagerCancellationOptionsCandidate;
            const abortJob = candidate.abortJob === true;
            const onlyIfQueued = candidate.onlyIfQueued === true;
            return { abortJob, onlyIfQueued };
        }
        function authenticateClassification(value: unknown, supplied: unknown): CancellationClassification {
            const canonical = classifyCancellation(value) as CancellationClassification;
            return supplied === canonical ? (supplied as CancellationClassification) : canonical;
        }
        function emitSettlementDiagnostics(settlement: SubscriberSettlementSnapshot, kind: 'resolve' | 'reject', value: unknown, classification: CancellationClassification | null): void {
            observe(() => source.translationDiagnostics.recordLazy(`subscriber.${settlement.status}`, () => ({
                jobId: settlement.jobId,
                subscriberId: settlement.id,
                recordId: settlement.recordId || '',
                hook: (settlement.hook as FalsySensitiveValue) ? settlement.hook : '',
                message: kind === 'resolve' ? '' : classification?.message,
            })));
            if (kind === 'resolve') {
                observe(() => {
                    logTranslationEvent('completed', settlement.key, value, settlement.context);
                });
            }
            else {
                observe(() => {
                    logTranslationEvent(classification?.kind === 'cancellation' ? 'aborted' : 'error', settlement.key, classification?.message ?? '', settlement.context);
                });
            }
        }
        function createSettlementPlan(kind: unknown, value: unknown, suppliedClassification: unknown): SubscriberSettlementPlan {
            if (kind === 'resolve') {
                return Object.freeze({
                    kind: 'resolve',
                    value,
                    status: 'completed',
                    classification: null,
                });
            }
            const classification = authenticateClassification(value, suppliedClassification);
            return Object.freeze({
                kind: 'reject',
                value: classification.error,
                status: classification.kind === 'cancellation' ? 'canceled' : 'failed',
                classification,
            });
        }
        function settleSubscriber(subscriber: unknown, kind: unknown, value: unknown, ...classificationArguments: unknown[]): boolean {
            const plan = createSettlementPlan(kind, value, classificationArguments[0]);
            const settlement = subscriberOwnership.settleSubscriber(subscriber, plan.kind, plan.value, plan.status);
            if (settlement === null)
                return false;
            emitSettlementDiagnostics(settlement, plan.kind, value, plan.classification);
            return true;
        }
        function settleJobSubscribers(job: unknown, kind: unknown, value: unknown, ...classificationArguments: unknown[]): number {
            const plan = createSettlementPlan(kind, value, classificationArguments[0]);
            const terminalization = subscriberOwnership.terminalizeJobSubscribers(job, plan.kind, plan.value, plan.status);
            for (const receipt of terminalization.receipts) {
                subscriberOwnership.releaseTerminalization(receipt);
            }
            for (const receipt of terminalization.receipts) {
                emitSettlementDiagnostics(receipt.snapshot, plan.kind, value, plan.classification);
            }
            for (const failure of terminalization.failures) {
                observe(() => source.translationDiagnostics.recordLazy('subscriber.settlement_error', () => ({
                    jobId: (job as TranslationManagerSubscriberJobCandidate).id,
                    subscriberId: failure.subscriber.id,
                    error: source.formatError(failure.error),
                })));
            }
            return terminalization.receipts.length;
        }
        function markJobSubscribersRunning(job: unknown): number {
            return subscriberOwnership.markJobRunning(job);
        }
        function cancelSubscriberWithError(subscriber: unknown, error: unknown, options: unknown): boolean {
            const jobValue = subscriberOwnership.getSubscriberJob(subscriber);
            if (jobValue === null)
                return false;
            const job = jobValue as TranslationManagerSubscriberJobCandidate;
            const { abortJob, onlyIfQueued } = captureCancellationOptions(options);
            const jobStatus = job.status;
            if (onlyIfQueued && jobStatus !== 'queued')
                return false;
            let abortOwner: object | null = null;
            let abortJobOperation: RuntimeFunction | null = null;
            if (jobStatus === 'running') {
                const controller = job.controller as FalsySensitiveValue;
                if (controller && (typeof controller === 'object' || typeof controller === 'function')) {
                    const abort = (controller as TranslationManagerAbortControllerCandidate).abort;
                    if (typeof abort === 'function') {
                        abortOwner = controller;
                        abortJobOperation = abort;
                    }
                }
            }
            if (!settleSubscriber(subscriber, 'reject', error))
                return false;
            observe(() => source.translationDiagnostics.increment('canceled'));
            let stillActive = subscriberOwnership.getActiveSubscribers(job).length > 0;
            try {
                stillActive = recomputeJobPriority(job);
            }
            catch (policyError) {
                observe(() => source.translationDiagnostics.recordLazy('subscriber.policy_error', () => ({
                    jobId: job.id,
                    error: source.formatError(policyError),
                })));
            }
            if (!stillActive && abortJob) {
                observe(() => {
                    job.abortError = error;
                });
                if (jobStatus === 'queued') {
                    observe(() => {
                        removeQueuedJob(job);
                    });
                    let finished = false;
                    try {
                        finished = finishJob(job, 'canceled');
                    }
                    catch {
                        observe(() => relinquishJob(job));
                    }
                    if (!finished)
                        observe(() => relinquishJob(job));
                    observe(() => source.translationDiagnostics.recordLazy('job.canceled', () => ({
                        jobId: job.id,
                        hook: (job.hook as FalsySensitiveValue) ? job.hook : '',
                        reason: source.formatError(error),
                        status: 'queued',
                    })));
                    observe(() => source.translationDiagnostics.rememberJob(job, 'canceled', {
                        reason: source.formatError(error),
                    }));
                }
                else if (jobStatus === 'running') {
                    observe(() => relinquishJob(job));
                    if (abortOwner !== null && abortJobOperation !== null) {
                        observe(() => Reflect.apply(abortJobOperation, abortOwner, [error]));
                    }
                    observe(() => source.translationDiagnostics.recordLazy('job.abort_requested', () => ({
                        jobId: job.id,
                        hook: (job.hook as FalsySensitiveValue) ? job.hook : '',
                        reason: source.formatError(error),
                    })));
                }
            }
            else if (!stillActive) {
                observe(() => {
                    job.detached = true;
                });
                observe(() => source.translationDiagnostics.recordLazy('job.detached', () => ({
                    jobId: job.id,
                    hook: (job.hook as FalsySensitiveValue) ? job.hook : '',
                    reason: source.formatError(error),
                    status: (jobStatus as FalsySensitiveValue) ? jobStatus : '',
                })));
                if (jobStatus === 'queued')
                    observe(() => {
                        schedulePump();
                    });
            }
            else if (jobStatus === 'queued') {
                observe(() => {
                    schedulePump();
                });
            }
            observe(() => source.translationDiagnostics.flush());
            return true;
        }
        function cancelSubscriber(subscriber: unknown, reason: unknown = undefined, options: unknown = {}): boolean {
            if (subscriberOwnership.getSubscriberJob(subscriber) === null)
                return false;
            const error = createAbortError(reason);
            return cancelSubscriberWithError(subscriber, error, options);
        }
        function expireSubscriber(subscriber: unknown, error: unknown): boolean {
            return cancelSubscriberWithError(subscriber, error, deadlineCancellationOptions);
        }
        function setSubscriberPriority(subscriber: unknown, priority: unknown, reason: unknown = ''): boolean {
            const nextPriority = clampPriority(priority);
            const convertString = runtime.String;
            const normalizedReason = convertString((reason as FalsySensitiveValue) ? reason : '');
            const changedAt = runtime.Date.now();
            const change = subscriberOwnership.preparePriorityChange(subscriber, nextPriority, changedAt, normalizedReason);
            if (!change.changed || change.subscriber === null || change.job === null || change.transition === null) {
                return false;
            }
            let policyPlan: TranslationManagerJobPolicyPlan;
            try {
                policyPlan = prepareJobPolicy(change.job, undefined, change.transition);
            }
            catch (error) {
                subscriberOwnership.discardPriorityChange(change.transition);
                throw error;
            }
            let publication: Readonly<Record<string, unknown>>;
            try {
                const publicationCandidate = {
                    jobId: change.subscriber.jobId,
                    subscriberId: change.subscriber.id,
                    recordId: change.subscriber.recordId,
                    hook: change.subscriber.hook,
                    previousPriority: change.previousPriority,
                    priority: change.priority,
                    effectivePriority: policyPlan.effectivePriority,
                    reason: normalizedReason,
                };
                Object.freeze(publicationCandidate);
                publication = publicationCandidate;
            }
            catch (error) {
                discardJobPolicy(policyPlan);
                throw error;
            }
            let committed: boolean;
            try {
                committed = commitJobPolicy(policyPlan);
            }
            catch (error) {
                discardJobPolicy(policyPlan);
                throw error;
            }
            if (!committed) {
                discardJobPolicy(policyPlan);
                throw new Error('[TranslationService] Prepared subscriber priority could not be committed.');
            }
            observe(() => {
                publishJobPolicy();
            });
            observe(() => source.translationDiagnostics.increment('priorityChanges'));
            observe(() => source.translationDiagnostics.recordLazy('priority.changed', () => publication));
            observe(() => {
                schedulePump();
            });
            return true;
        }
        function cancelByRecordId(recordId: unknown, reason: unknown = 'record canceled', options: unknown = {}): number {
            const subscribers = subscriberOwnership.getRecordSubscribers(recordId);
            let count = 0;
            for (const subscriber of subscribers) {
                try {
                    if (cancelSubscriber(subscriber, reason, options))
                        count += 1;
                }
                catch (error) {
                    observe(() => source.translationDiagnostics.recordLazy('subscriber.record_cancel_error', () => ({
                        subscriberId: subscriber.id,
                        recordId: subscriber.recordId,
                        error: source.formatError(error),
                    })));
                }
            }
            return count;
        }
        function setPriorityByRecordId(recordId: unknown, priority: unknown, reason: unknown = ''): number {
            const subscribers = subscriberOwnership.getRecordSubscribers(recordId);
            let count = 0;
            for (const subscriber of subscribers) {
                try {
                    if (setSubscriberPriority(subscriber, priority, reason))
                        count += 1;
                }
                catch (error) {
                    observe(() => source.translationDiagnostics.recordLazy('subscriber.record_priority_error', () => ({
                        subscriberId: subscriber.id,
                        recordId: subscriber.recordId,
                        error: source.formatError(error),
                    })));
                }
            }
            return count;
        }
        return {
            settleSubscriber,
            settleJobSubscribers,
            markJobSubscribersRunning,
            cancelSubscriber,
            expireSubscriber,
            setSubscriberPriority,
            cancelByRecordId,
            setPriorityByRecordId,
        };
    }
    return createController;
}
export function createTranslationManagerSubscribersModule(runtimeScope: object): TranslationManagerSubscribersModule {
    let createController = subscribersControllerFactories.get(runtimeScope);
    if (createController === undefined) {
        createController = createRealmSubscribersControllerFactory(runtimeScope);
        subscribersControllerFactories.set(runtimeScope, createController);
    }
    return { create: createController };
}
