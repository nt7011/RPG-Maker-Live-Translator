import type { CancellationClassification } from '../cancellation.js';
import type { TranslatorExchange } from '../text-record-types.js';
import { countTranslationMarkers, preservesTranslationMarkers } from '../translation-text-codec.js';
import type { PromptContext } from '../translation-providers/prompt-template.js';
import type { TranslationManagerControllerFacades } from './controller-facades.js';
type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
interface RuntimeAbortControllerCandidate {
    readonly signal: unknown;
}
type RuntimeAbortControllerConstructorCandidate = new () => RuntimeAbortControllerCandidate;
interface RuntimeDateCandidate {
    now(): unknown;
}
interface RuntimeMathCandidate {
    max(...values: unknown[]): unknown;
    min(...values: unknown[]): unknown;
    floor(value: unknown): unknown;
    pow(base: unknown, exponent: unknown): unknown;
    random(): unknown;
}
interface RuntimeNumberCandidate {
    (this: unknown, value?: unknown): unknown;
    isFinite(value: unknown): unknown;
}
interface RuntimeErrorCandidate extends Error {
    code: unknown;
    retryable: unknown;
}
type RuntimeErrorConstructorCandidate = new (message?: unknown) => RuntimeErrorCandidate;
interface RuntimePromiseCandidate {
    then(onFulfilled?: RuntimeFunction, onRejected?: RuntimeFunction): RuntimePromiseCandidate;
    catch(onRejected?: RuntimeFunction): RuntimePromiseCandidate;
    finally(onFinally?: RuntimeFunction): RuntimePromiseCandidate;
}
type RuntimePromiseConstructorCandidate = new (executor: (resolve: RuntimeFunction, reject: RuntimeFunction) => unknown) => RuntimePromiseCandidate;
interface TranslationManagerRunnerRuntimeScopeCandidate {
    readonly AbortController: unknown;
    readonly Date: RuntimeDateCandidate;
    readonly String: RuntimeFunction;
    readonly Error: RuntimeErrorConstructorCandidate;
    readonly Math: RuntimeMathCandidate;
    readonly Number: RuntimeNumberCandidate;
    readonly Promise: RuntimePromiseConstructorCandidate;
    readonly setTimeout: RuntimeFunction;
    readonly clearTimeout: RuntimeFunction;
}
interface TranslationManagerRunnerLoggerCandidate {
    debug(message: unknown): unknown;
    warn(message: unknown, error: unknown): unknown;
}
interface TranslationManagerRunnerProviderCandidate {
    translate(request: unknown): unknown;
}
interface TranslationManagerRunnerDiagnosticsCandidate {
    increment(name: unknown): unknown;
    recordLazy(type: unknown, detailsFactory: () => unknown): unknown;
    flush(): unknown;
    rememberJob(job: unknown, status: unknown, details?: unknown): unknown;
}
interface TranslationManagerRunnerScopeCandidate {
    readonly createAbortError: RuntimeFunction;
    readonly classifyCancellation: RuntimeFunction;
    readonly logger: TranslationManagerRunnerLoggerCandidate;
    readonly preview: RuntimeFunction;
    readonly provider: TranslationManagerRunnerProviderCandidate;
    readonly maxRetries: unknown;
    readonly retryBaseMs: unknown;
    readonly retryMaxMs: unknown;
    readonly requestTimeoutMs: unknown;
    readonly controllerFacades: Pick<TranslationManagerControllerFacades, 'eligibility' | 'jobs' | 'lineages' | 'queue' | 'subscribers'>;
    readonly translationDiagnostics: TranslationManagerRunnerDiagnosticsCandidate;
    readonly recordProviderAvailability: RuntimeFunction;
    activeCount: unknown;
    readonly providerCapacity: unknown;
}
interface TranslationManagerRunnerSubscriberCandidate {
    readonly active: unknown;
    readonly id: unknown;
    readonly onDelta: unknown;
    readonly onTranslatorExchange?: unknown;
    readonly recordId: unknown;
    readonly hook: unknown;
    readonly source: unknown;
    readonly priority: unknown;
    readonly stream: unknown;
    readonly createdAt: unknown;
    readonly lastPriorityChangedAt: unknown;
    readonly lastPriorityReason: unknown;
    readonly context: unknown;
}
interface TranslationManagerRunnerJobCandidate {
    controller: unknown;
    deltaCount: unknown;
    lastDeltaAt: unknown;
    lastPartialLength: unknown;
    lastDeltaEventAt: unknown;
    status: unknown;
    startedAt: unknown;
    readonly id: unknown;
    readonly hook: unknown;
    readonly source: unknown;
    readonly effectivePriority: unknown;
    readonly stream: unknown;
    readonly key: unknown;
    readonly text: unknown;
    readonly timeoutMs: unknown;
    readonly metadata: unknown;
    readonly createdAt: unknown;
    readonly queuedAt: unknown;
    readonly queueSeq: unknown;
    readonly lineageId: unknown;
    readonly lineageSequence: unknown;
    readonly predecessorJobId: unknown;
    attempt: unknown;
    nextRetryDelayMs: unknown;
    lastError: unknown;
    retryCount: unknown;
    lastRetryAt: unknown;
}
interface TranslationManagerRunnerErrorDetailsCandidate {
    readonly retryable: unknown;
    readonly status: unknown;
    readonly retryAfter: unknown;
}
interface TranslationManagerRunnerRetryMetadataSnapshot {
    readonly classification: CancellationClassification;
    readonly retryable: boolean | null;
    readonly retryAfterSeconds: number | null;
    readonly status: number | null;
}
interface TranslationManagerRunnerTerminalSubscriberRecord {
    readonly id: unknown;
    readonly status: unknown;
    readonly recordId: unknown;
    readonly hook: unknown;
    readonly source: unknown;
    readonly priority: unknown;
    readonly stream: boolean;
    readonly createdAt: unknown;
    readonly lastPriorityChangedAt: unknown;
    readonly lastPriorityReason: unknown;
}
interface TranslationManagerRunnerTerminalSubscriberSnapshot {
    readonly hook: unknown;
    readonly records: readonly TranslationManagerRunnerTerminalSubscriberRecord[];
}
interface TranslationManagerRunnerRunLease {
    readonly job: unknown;
    readonly previousActiveCount: unknown;
    readonly previousController: unknown;
    readonly previousStartedAt: unknown;
    readonly previousStatus: unknown;
    capacityOwned: boolean;
    capacityReleasePrepared: boolean;
    capacityReleaseTarget: unknown;
    cleanupScheduled: boolean;
    controllerPublished: boolean;
    startedAtPublished: boolean;
    statusPublished: boolean;
}
interface TranslationManagerRunnerTerminalPublication {
    action: 'resolve' | 'reject';
    classification: CancellationClassification | null;
    readonly job: unknown;
    status: 'canceled' | 'completed' | 'failed';
    subscribers: TranslationManagerRunnerTerminalSubscriberSnapshot;
    value: unknown;
    diagnosticsRecorded: boolean;
    jobFinished: boolean;
    settling: boolean;
    subscribersSettled: boolean;
    successFinalizationAttempted: boolean;
}
export interface TranslationManagerRunnerController {
    getRunningJobs(): unknown[];
    createJobController(job: unknown): unknown;
    notifyDelta(job: unknown, partial: unknown): void;
    startJob(job: unknown): boolean;
    runProviderWithRetries(job: unknown, signal: unknown): Promise<string>;
    shouldRetry(error: unknown, attempt: unknown): boolean;
    computeRetryDelayMs(error: unknown, attempt: unknown): unknown;
    waitForRetry(ms: unknown, signal: unknown): RuntimePromiseCandidate;
}
type TranslationManagerRunnerControllerFactory = (scope?: unknown) => TranslationManagerRunnerController;
export interface TranslationManagerRunnerModule {
    create: TranslationManagerRunnerControllerFactory;
}
const runnerControllerFactories = new WeakMap<object, TranslationManagerRunnerControllerFactory>();
function createRealmRunnerControllerFactory(runtimeScope: object): TranslationManagerRunnerControllerFactory {
    const runtime = runtimeScope as TranslationManagerRunnerRuntimeScopeCandidate;
    function createController(scope: unknown = {}): TranslationManagerRunnerController {
        const source = scope as TranslationManagerRunnerScopeCandidate;
        const { createAbortError, classifyCancellation, logger, preview, provider, maxRetries, retryBaseMs, retryMaxMs, requestTimeoutMs, } = source;
        const { finalizeProviderSuccess } = source.controllerFacades.eligibility;
        const { commitWithAuthority, finishJob } = source.controllerFacades.lineages;
        const { getActiveSubscribers } = source.controllerFacades.jobs;
        const { settleJobSubscribers, markJobSubscribersRunning } = source.controllerFacades.subscribers;
        const { schedulePump } = source.controllerFacades.queue;
        const activeRunLeases = new Map<unknown, TranslationManagerRunnerRunLease>();
        const pendingRunRollbacks = new Set<TranslationManagerRunnerRunLease>();
        const pendingRunCleanups = new Set<TranslationManagerRunnerRunLease>();
        const pendingTerminalPublications = new Set<TranslationManagerRunnerTerminalPublication>();
        let runCleanupInProgress = false;
        let runTransitionInProgress = false;
        function isTruthy(value: unknown): boolean {
            return !!value;
        }
        function observe(operation: () => unknown): void {
            try {
                operation();
            }
            catch {
            }
        }
        function publishTranslatorExchange(job: unknown, exchange: TranslatorExchange): void {
            const snapshot = Object.freeze({ ...exchange });
            observe(() => {
                (job as {
                    translatorExchange?: TranslatorExchange;
                }).translatorExchange = snapshot;
            });
            observe(() => {
                for (const subscriber of getActiveSubscribers(job)) {
                    observe(() => {
                        const candidate = subscriber as TranslationManagerRunnerSubscriberCandidate;
                        if (!candidate.active || typeof candidate.onTranslatorExchange !== 'function')
                            return;
                        Reflect.apply(candidate.onTranslatorExchange, undefined, [snapshot]);
                    });
                }
            });
        }
        function captureTerminalSubscriberSnapshot(job: unknown, terminalStatus: unknown): TranslationManagerRunnerTerminalSubscriberSnapshot {
            const subscribers = getActiveSubscribers(job);
            const records: TranslationManagerRunnerTerminalSubscriberRecord[] = [];
            let highest: TranslationManagerRunnerTerminalSubscriberRecord | null = null;
            let highestPriority = -Infinity;
            for (const subscriber of subscribers) {
                const candidate = subscriber as TranslationManagerRunnerSubscriberCandidate;
                let hook = candidate.hook;
                if (!hook) {
                    try {
                        const context = candidate.context;
                        if (context && (typeof context === 'object' || typeof context === 'function')) {
                            hook = (context as {
                                readonly hook?: unknown;
                            }).hook;
                        }
                    }
                    catch {
                    }
                }
                const record = Object.freeze({
                    id: candidate.id,
                    status: terminalStatus,
                    recordId: candidate.recordId,
                    hook: (hook as FalsySensitiveValue) ? hook : '',
                    source: candidate.source,
                    priority: candidate.priority,
                    stream: candidate.stream === true,
                    createdAt: candidate.createdAt,
                    lastPriorityChangedAt: candidate.lastPriorityChangedAt,
                    lastPriorityReason: candidate.lastPriorityReason,
                });
                records.push(record);
                const priorityValue = record.priority;
                const priority = typeof priorityValue === 'number' && priorityValue === priorityValue ? priorityValue : 0;
                if (highest === null || priority > highestPriority) {
                    highest = record;
                    highestPriority = priority;
                }
            }
            const jobHook = (job as {
                readonly hook?: unknown;
            }).hook;
            const highestHook = highest?.hook;
            const hook = (highestHook as FalsySensitiveValue)
                ? highestHook
                : (jobHook as FalsySensitiveValue)
                    ? jobHook
                    : '';
            return Object.freeze({ hook, records: Object.freeze(records) });
        }
        function constructJobController(): RuntimeAbortControllerCandidate | null {
            const AbortControllerConstructor = runtime.AbortController;
            if (typeof AbortControllerConstructor !== 'function')
                return null;
            return new (AbortControllerConstructor as RuntimeAbortControllerConstructorCandidate)();
        }
        function createJobController(job: unknown): unknown {
            const controller = constructJobController();
            if (controller === null)
                return null;
            (job as TranslationManagerRunnerJobCandidate).controller = controller;
            return controller;
        }
        function notifyDelta(job: unknown, partial: unknown): void {
            const jobCandidate = job as TranslationManagerRunnerJobCandidate;
            observe(() => {
                const exchange = (job as {
                    translatorExchange?: TranslatorExchange;
                }).translatorExchange;
                if (exchange && typeof partial === 'string')
                    publishTranslatorExchange(job, { ...exchange, output: partial });
            });
            observe(() => {
                jobCandidate.deltaCount = ((jobCandidate.deltaCount as number) || 0) + 1;
                jobCandidate.lastDeltaAt = runtime.Date.now();
                const convertString = runtime.String;
                jobCandidate.lastPartialLength = (convertString(isTruthy(partial) ? partial : '') as {
                    readonly length: unknown;
                }).length;
            });
            observe(() => source.translationDiagnostics.increment('streamDeltas'));
            observe(() => {
                if (!jobCandidate.lastDeltaEventAt ||
                    (jobCandidate.lastDeltaAt as number) - (jobCandidate.lastDeltaEventAt as number) >= 1000) {
                    jobCandidate.lastDeltaEventAt = jobCandidate.lastDeltaAt;
                    source.translationDiagnostics.recordLazy('stream.delta', () => ({
                        jobId: jobCandidate.id,
                        hook: jobCandidate.hook,
                        partialLength: jobCandidate.lastPartialLength,
                        deltaCount: jobCandidate.deltaCount,
                    }));
                }
                else {
                    source.translationDiagnostics.flush();
                }
            });
            observe(() => {
                const subscribers = getActiveSubscribers(job);
                subscribers.forEach((subscriber: unknown) => {
                    const subscriberCandidate = subscriber as TranslationManagerRunnerSubscriberCandidate;
                    try {
                        if (!subscriberCandidate.active)
                            return;
                        const onDelta = subscriberCandidate.onDelta;
                        if (typeof onDelta !== 'function')
                            return;
                        Reflect.apply(onDelta, subscriber, [partial]);
                    }
                    catch (error) {
                        observe(() => logger.warn(`[TranslationService] onDelta failed for ${subscriberCandidate.id as string}`, error));
                    }
                });
            });
        }
        function captureTerminalSubscriberSnapshotNoThrow(job: unknown, terminalStatus: unknown): TranslationManagerRunnerTerminalSubscriberSnapshot {
            try {
                return captureTerminalSubscriberSnapshot(job, terminalStatus);
            }
            catch {
                return Object.freeze({ hook: '', records: Object.freeze([]) });
            }
        }
        function classifyFailure(error: unknown): CancellationClassification {
            let candidate: unknown;
            try {
                candidate = classifyCancellation(error);
            }
            catch {
                return Object.freeze({ code: '', error, kind: 'other', message: '' });
            }
            const candidateValue = candidate as FalsySensitiveValue;
            if (!candidateValue || (typeof candidate !== 'object' && typeof candidate !== 'function')) {
                return Object.freeze({ code: '', error, kind: 'other', message: '' });
            }
            const classification = candidate as Partial<CancellationClassification>;
            let code = '';
            let operationalError = error;
            let kind: 'cancellation' | 'other' = 'other';
            let message = '';
            try {
                const observedCode = classification.code;
                if (typeof observedCode === 'string')
                    code = observedCode;
            }
            catch {
            }
            try {
                operationalError = classification.error;
            }
            catch {
            }
            try {
                if (classification.kind === 'cancellation')
                    kind = 'cancellation';
            }
            catch {
            }
            try {
                const observedMessage = classification.message;
                if (typeof observedMessage === 'string')
                    message = observedMessage;
            }
            catch {
            }
            return Object.freeze({ code, error: operationalError, kind, message });
        }
        function recordTerminalDiagnostics(job: unknown, terminalStatus: unknown, terminalSubscribers: TranslationManagerRunnerTerminalSubscriberSnapshot, message: unknown = ''): void {
            const jobCandidate = job as TranslationManagerRunnerJobCandidate;
            if (terminalStatus === 'completed')
                observe(() => source.translationDiagnostics.increment('completed'));
            if (terminalStatus === 'failed')
                observe(() => source.translationDiagnostics.increment('failed'));
            observe(() => source.translationDiagnostics.recordLazy(`job.${terminalStatus as string}`, () => ({
                jobId: jobCandidate.id,
                hook: terminalSubscribers.hook,
                priority: jobCandidate.effectivePriority,
                stream: jobCandidate.stream,
                subscribers: terminalSubscribers.records.length,
                elapsedMs: (runtime.Date.now() as number) -
                    (((jobCandidate.startedAt as boolean) || runtime.Date.now()) as number),
                ...(terminalStatus === 'completed' ? {} : { error: message }),
                textPreview: preview(jobCandidate.key, 72),
            })));
            observe(() => source.translationDiagnostics.rememberJob({
                id: jobCandidate.id,
                status: terminalStatus,
                hook: terminalSubscribers.hook,
                source: jobCandidate.source,
                textPreview: preview(jobCandidate.key, 72),
                textLength: (runtime.String(jobCandidate.key ?? '') as {
                    readonly length: unknown;
                }).length,
                createdAt: jobCandidate.createdAt,
                queuedAt: jobCandidate.queuedAt,
                startedAt: jobCandidate.startedAt,
                queueSeq: jobCandidate.queueSeq,
                effectivePriority: jobCandidate.effectivePriority,
                stream: jobCandidate.stream === true,
                timeoutMs: jobCandidate.timeoutMs,
                attempt: jobCandidate.attempt,
                retryCount: jobCandidate.retryCount,
                lastRetryAt: jobCandidate.lastRetryAt,
                nextRetryDelayMs: jobCandidate.nextRetryDelayMs,
                lastDeltaAt: jobCandidate.lastDeltaAt,
                deltaCount: jobCandidate.deltaCount,
                lastPartialLength: jobCandidate.lastPartialLength,
                lastError: terminalStatus === 'completed' ? '' : message,
                lineageId: jobCandidate.lineageId,
                lineageSequence: jobCandidate.lineageSequence,
                predecessorJobId: jobCandidate.predecessorJobId,
            }, terminalStatus, {
                ...(terminalStatus === 'completed' ? {} : { error: message }),
                terminalSubscribers: terminalSubscribers.records,
            }));
        }
        function settleTerminalPublication(publication: TranslationManagerRunnerTerminalPublication): void {
            if (publication.settling)
                return;
            publication.settling = true;
            try {
                if (publication.action === 'resolve' && !publication.successFinalizationAttempted) {
                    publication.successFinalizationAttempted = true;
                    try {
                        commitWithAuthority(publication.job, (authority: unknown) => {
                            finalizeProviderSuccess(authority, publication.value);
                        });
                    }
                    catch (error) {
                        const classification = classifyFailure(error);
                        publication.action = 'reject';
                        publication.classification = classification;
                        publication.status = 'failed';
                        publication.value = classification.error;
                        publication.subscribers = captureTerminalSubscriberSnapshotNoThrow(publication.job, 'failed');
                        observe(() => {
                            (publication.job as TranslationManagerRunnerJobCandidate).lastError = classification.error;
                        });
                    }
                }
                if (!publication.subscribersSettled) {
                    try {
                        settleJobSubscribers(publication.job, publication.action, publication.value, publication.classification);
                        publication.subscribersSettled = true;
                    }
                    catch (error) {
                        observe(() => logger.warn('[TranslationService] terminal subscriber publication failed', error));
                    }
                }
                if (!publication.jobFinished) {
                    try {
                        finishJob(publication.job, publication.status);
                        publication.jobFinished = true;
                    }
                    catch (error) {
                        observe(() => logger.warn('[TranslationService] terminal job publication failed', error));
                    }
                }
                if (!publication.diagnosticsRecorded) {
                    publication.diagnosticsRecorded = true;
                    recordTerminalDiagnostics(publication.job, publication.status, publication.subscribers, publication.classification?.message);
                }
            }
            finally {
                publication.settling = false;
            }
            if (publication.jobFinished && publication.subscribersSettled) {
                pendingTerminalPublications.delete(publication);
            }
        }
        function settlePendingTerminalPublications(): void {
            for (const publication of Array.from(pendingTerminalPublications)) {
                settleTerminalPublication(publication);
            }
        }
        function publishProviderFailure(job: unknown, error: unknown): void {
            const classification = classifyFailure(error);
            const operationalError = classification.error;
            observe(() => source.recordProviderAvailability('provider-failed', operationalError, classification));
            const status = classification.kind === 'cancellation' ? 'canceled' : 'failed';
            const publication: TranslationManagerRunnerTerminalPublication = {
                action: 'reject',
                classification,
                job,
                status,
                subscribers: captureTerminalSubscriberSnapshotNoThrow(job, status),
                value: operationalError,
                diagnosticsRecorded: false,
                jobFinished: false,
                settling: false,
                subscribersSettled: false,
                successFinalizationAttempted: true,
            };
            observe(() => {
                (job as TranslationManagerRunnerJobCandidate).lastError = operationalError;
            });
            pendingTerminalPublications.add(publication);
            settleTerminalPublication(publication);
        }
        function publishProviderSuccess(job: unknown, completion: string): void {
            observe(() => source.recordProviderAvailability('provider-success'));
            const publication: TranslationManagerRunnerTerminalPublication = {
                action: 'resolve',
                classification: null,
                job,
                status: 'completed',
                subscribers: captureTerminalSubscriberSnapshotNoThrow(job, 'completed'),
                value: completion,
                diagnosticsRecorded: false,
                jobFinished: false,
                settling: false,
                subscribersSettled: false,
                successFinalizationAttempted: false,
            };
            pendingTerminalPublications.add(publication);
            settleTerminalPublication(publication);
        }
        function activeCountMatches(expected: unknown): boolean {
            try {
                return source.activeCount === expected;
            }
            catch {
                return false;
            }
        }
        function settleRunCleanupLease(lease: TranslationManagerRunnerRunLease): void {
            if (lease.capacityOwned) {
                if (!lease.capacityReleasePrepared) {
                    try {
                        lease.capacityReleaseTarget = runtime.Math.max(0, (source.activeCount as number) - 1);
                        lease.capacityReleasePrepared = true;
                    }
                    catch {
                        return;
                    }
                }
                if (!activeCountMatches(lease.capacityReleaseTarget)) {
                    try {
                        source.activeCount = lease.capacityReleaseTarget;
                    }
                    catch {
                    }
                }
                if (activeCountMatches(lease.capacityReleaseTarget))
                    lease.capacityOwned = false;
            }
            if (lease.capacityOwned)
                return;
            if (activeRunLeases.get(lease.job) === lease)
                activeRunLeases.delete(lease.job);
            if (!lease.cleanupScheduled) {
                lease.cleanupScheduled = true;
                pendingRunCleanups.delete(lease);
                observe(() => source.translationDiagnostics.flush());
                observe(() => {
                    schedulePump();
                });
            }
            pendingRunCleanups.delete(lease);
        }
        function settlePendingRunCleanups(): void {
            if (runCleanupInProgress)
                return;
            runCleanupInProgress = true;
            try {
                for (const lease of Array.from(pendingRunCleanups)) {
                    settleRunCleanupLease(lease);
                    if (lease.capacityOwned)
                        return;
                }
            }
            finally {
                runCleanupInProgress = false;
            }
        }
        function settleRunCleanup(lease: TranslationManagerRunnerRunLease): void {
            pendingRunCleanups.add(lease);
            settlePendingTerminalPublications();
            settlePendingRunCleanups();
        }
        function restoreProjection(write: () => void, attest: () => boolean): boolean {
            try {
                write();
            }
            catch {
            }
            try {
                return attest();
            }
            catch {
                return false;
            }
        }
        function rollbackRunStartup(lease: TranslationManagerRunnerRunLease): boolean {
            pendingRunRollbacks.add(lease);
            const jobCandidate = lease.job as TranslationManagerRunnerJobCandidate;
            if (lease.statusPublished &&
                restoreProjection(() => {
                    jobCandidate.status = lease.previousStatus;
                }, () => jobCandidate.status === lease.previousStatus)) {
                lease.statusPublished = false;
            }
            if (lease.startedAtPublished &&
                restoreProjection(() => {
                    jobCandidate.startedAt = lease.previousStartedAt;
                }, () => jobCandidate.startedAt === lease.previousStartedAt)) {
                lease.startedAtPublished = false;
            }
            if (lease.controllerPublished &&
                restoreProjection(() => {
                    jobCandidate.controller = lease.previousController;
                }, () => jobCandidate.controller === lease.previousController)) {
                lease.controllerPublished = false;
            }
            if (lease.capacityOwned &&
                restoreProjection(() => {
                    source.activeCount = lease.previousActiveCount;
                }, () => source.activeCount === lease.previousActiveCount)) {
                lease.capacityOwned = false;
            }
            if (lease.statusPublished || lease.startedAtPublished || lease.controllerPublished || lease.capacityOwned) {
                return false;
            }
            if (activeRunLeases.get(lease.job) === lease)
                activeRunLeases.delete(lease.job);
            pendingRunRollbacks.delete(lease);
            return true;
        }
        function settlePendingRunRollbacks(): void {
            for (const lease of Array.from(pendingRunRollbacks))
                rollbackRunStartup(lease);
        }
        function prepareOwnedRunTask(job: unknown, signal: unknown, lease: TranslationManagerRunnerRunLease): RuntimeFunction {
            const PromiseConstructor = runtime.Promise;
            const activationOwner: {
                activate: RuntimeFunction | null;
            } = { activate: null };
            const gate = new PromiseConstructor((resolve) => {
                activationOwner.activate = resolve;
            });
            const activate = requireActivationOwner(activationOwner);
            const providerTask = gate.then(() => runProviderWithRetries(job, signal));
            const terminalTask = providerTask.then((completion: unknown) => {
                publishProviderSuccess(job, completion as string);
            }, (error: unknown) => {
                publishProviderFailure(job, error);
            });
            terminalTask
                .finally(() => {
                settleRunCleanup(lease);
            })
                .then(() => {
                settlePendingTerminalPublications();
                settlePendingRunCleanups();
            })
                .catch((error: unknown) => {
                observe(() => logger.warn('[TranslationService] terminal runner task failed', error));
            });
            return activate;
        }
        function requireActivationOwner(owner: {
            readonly activate: RuntimeFunction | null;
        }): RuntimeFunction {
            const activate = owner.activate;
            if (activate === null)
                throw new runtime.Error('Runner activation gate did not publish its owner.');
            return activate;
        }
        function startJob(job: unknown): boolean {
            if (runTransitionInProgress)
                return false;
            runTransitionInProgress = true;
            try {
                settlePendingTerminalPublications();
                settlePendingRunRollbacks();
                settlePendingRunCleanups();
                if (pendingRunRollbacks.size > 0 || pendingRunCleanups.size > 0)
                    return false;
                return startJobWithLease(job);
            }
            finally {
                runTransitionInProgress = false;
            }
        }
        function startJobWithLease(job: unknown): boolean {
            const jobValue = job as FalsySensitiveValue;
            const jobCandidate = job as TranslationManagerRunnerJobCandidate;
            if (!jobValue || jobCandidate.status !== 'queued' || activeRunLeases.has(job))
                return false;
            let controller: RuntimeAbortControllerCandidate | null;
            let signal: unknown;
            let startedAt: unknown;
            let lease: TranslationManagerRunnerRunLease;
            let activate: RuntimeFunction;
            try {
                controller = constructJobController();
                signal = controller === null ? undefined : controller.signal;
                startedAt = runtime.Date.now();
                lease = {
                    job,
                    previousActiveCount: source.activeCount,
                    previousController: jobCandidate.controller,
                    previousStartedAt: jobCandidate.startedAt,
                    previousStatus: jobCandidate.status,
                    capacityOwned: false,
                    capacityReleasePrepared: false,
                    capacityReleaseTarget: undefined,
                    cleanupScheduled: false,
                    controllerPublished: false,
                    startedAtPublished: false,
                    statusPublished: false,
                };
                activate = prepareOwnedRunTask(job, signal, lease);
            }
            catch (startupError) {
                observe(() => logger.warn('[TranslationService] runner startup preparation failed', startupError));
                return false;
            }
            activeRunLeases.set(job, lease);
            try {
                lease.capacityOwned = true;
                source.activeCount = (lease.previousActiveCount as number) + 1;
                lease.controllerPublished = true;
                jobCandidate.controller = controller;
                lease.startedAtPublished = true;
                jobCandidate.startedAt = startedAt;
                lease.statusPublished = true;
                jobCandidate.status = 'running';
            }
            catch (startupError) {
                rollbackRunStartup(lease);
                observe(() => logger.warn('[TranslationService] runner startup commit failed', startupError));
                return false;
            }
            observe(() => markJobSubscribersRunning(job));
            observe(() => source.translationDiagnostics.increment('dispatched'));
            observe(() => source.translationDiagnostics.recordLazy('job.dispatched', () => {
                const subscribers = captureTerminalSubscriberSnapshot(job, 'running');
                return {
                    jobId: jobCandidate.id,
                    hook: subscribers.hook,
                    priority: jobCandidate.effectivePriority,
                    stream: jobCandidate.stream,
                    subscribers: subscribers.records.length,
                    capacity: source.providerCapacity,
                    running: source.activeCount,
                    textPreview: preview(jobCandidate.key, 72),
                };
            }));
            try {
                activate();
            }
            catch (activationError) {
                observe(() => logger.warn('[TranslationService] runner activation failed', activationError));
            }
            return true;
        }
        async function runProviderWithRetries(job: unknown, signal: unknown): Promise<string> {
            const jobCandidate = job as TranslationManagerRunnerJobCandidate;
            let attempt = 0;
            let markerRetries = 0;
            for (;;) {
                let markerFailure: unknown = null;
                attempt += 1;
                observe(() => {
                    jobCandidate.attempt = attempt;
                });
                observe(() => {
                    jobCandidate.nextRetryDelayMs = 0;
                });
                observe(() => source.translationDiagnostics.flush());
                try {
                    const providerText = jobCandidate.text;
                    const providerKey = jobCandidate.key;
                    if (markerRetries > 0 && signal && (signal as {
                        readonly aborted?: unknown;
                    }).aborted) {
                        throw createAbortError((signal as {
                            readonly reason?: unknown;
                        }).reason);
                    }
                    publishTranslatorExchange(job, {
                        input: providerText as string,
                        output: null,
                        markerMismatch: markerRetries > 0,
                    });
                    const translated = await provider.translate({
                        text: providerText,
                        key: providerKey,
                        stream: jobCandidate.stream,
                        signal,
                        timeoutMs: (jobCandidate.timeoutMs as boolean) || requestTimeoutMs,
                        priority: jobCandidate.effectivePriority,
                        metadata: jobCandidate.metadata,
                        promptContext: Object.freeze({
                            hasControlCodes: countTranslationMarkers(providerKey as string) > 0,
                            markerCorrection: markerRetries > 0,
                        } satisfies PromptContext),
                        onDelta: (partial: unknown) => {
                            notifyDelta(job, partial);
                        },
                    });
                    publishTranslatorExchange(job, {
                        input: providerText as string,
                        output: typeof translated === 'string' ? translated : null,
                        markerMismatch: typeof translated === 'string' &&
                            !preservesTranslationMarkers(providerKey as string, translated),
                    });
                    if (typeof translated !== 'string' || !translated.trim()) {
                        const ErrorConstructor = runtime.Error;
                        const emptyError = new ErrorConstructor('Translator returned no usable text.');
                        try {
                            emptyError.code = 'EMPTY_TRANSLATION_OUTPUT';
                        }
                        catch {
                        }
                        try {
                            emptyError.retryable = true;
                        }
                        catch {
                        }
                        throw emptyError;
                    }
                    if (!preservesTranslationMarkers(providerKey as string, translated) && markerRetries < 3) {
                        const markerError = new runtime.Error('Translator changed the formatting marker count.');
                        markerError.code = 'TRANSLATION_MARKER_MISMATCH';
                        markerError.retryable = true;
                        markerFailure = markerError;
                        throw markerError;
                    }
                    observe(() => logger.debug(`[TranslationService] ${jobCandidate.id as string} completed "${preview(jobCandidate.key) as string}"`));
                    return translated;
                }
                catch (error) {
                    const classification = classifyFailure(error);
                    const operationalError = classification.error;
                    if (classification.kind === 'cancellation')
                        throw operationalError;
                    observe(() => {
                        jobCandidate.lastError = operationalError;
                    });
                    const markerMismatch = markerFailure !== null && operationalError === markerFailure;
                    const providerAttempt = attempt - markerRetries;
                    let waitMs: unknown = 0;
                    if (markerMismatch)
                        markerRetries += 1;
                    else {
                        const retryMetadata = createRetryDecision(operationalError, providerAttempt, classification);
                        if (!retryMetadata)
                            throw operationalError;
                        waitMs = computeRetryDelayFromSnapshot(retryMetadata.retryAfterSeconds, providerAttempt);
                    }
                    observe(() => {
                        jobCandidate.retryCount = ((jobCandidate.retryCount as number) || 0) + 1;
                    });
                    observe(() => {
                        jobCandidate.lastRetryAt = runtime.Date.now();
                    });
                    observe(() => {
                        jobCandidate.nextRetryDelayMs = waitMs;
                    });
                    observe(() => source.translationDiagnostics.increment('retries'));
                    observe(() => source.translationDiagnostics.recordLazy('job.retry', () => ({
                        jobId: jobCandidate.id,
                        hook: jobCandidate.hook,
                        attempt,
                        retryInMs: waitMs,
                        error: classification.message,
                    })));
                    observe(() => logger.warn(`[TranslationService] ${jobCandidate.id as string} attempt ${attempt as unknown as string} failed; retrying in ${waitMs as string}ms.`, operationalError));
                    if (!markerMismatch)
                        await waitForRetry(waitMs, signal);
                }
            }
        }
        function shouldRetry(error: unknown, attempt: unknown, ...classificationArguments: unknown[]): boolean {
            if ((attempt as number) > (maxRetries as number))
                return false;
            if (!(error as FalsySensitiveValue) && classificationArguments.length === 0)
                return false;
            const canonicalClassification = classifyFailure(error);
            const classification = classificationArguments[0] === canonicalClassification
                ? (classificationArguments[0] as CancellationClassification)
                : canonicalClassification;
            return createRetryDecision(error, attempt, classification) !== null;
        }
        function createRetryDecision(error: unknown, attempt: unknown, classification: CancellationClassification): TranslationManagerRunnerRetryMetadataSnapshot | null {
            if ((attempt as number) > (maxRetries as number))
                return null;
            if (classification.kind === 'cancellation')
                return null;
            const operationalError = classification.error;
            const errorValue = operationalError as FalsySensitiveValue;
            if (!errorValue || operationalError !== error)
                return null;
            const metadata = captureRetryMetadata(classification);
            if (metadata.retryable === false)
                return null;
            if (metadata.retryable === true)
                return metadata;
            const status = metadata.status;
            if (status === 429 || (status !== null && status >= 500 && status <= 599))
                return metadata;
            if (classification.code === 'ETIMEDOUT' ||
                classification.code === 'EMPTY_TRANSLATION_OUTPUT' ||
                classification.code === 'EMPTY_STREAM_OUTPUT') {
                return metadata;
            }
            return null;
        }
        function captureRetryMetadata(classification: CancellationClassification): TranslationManagerRunnerRetryMetadataSnapshot {
            const operationalError = classification.error;
            const errorCandidate = operationalError as TranslationManagerRunnerErrorDetailsCandidate;
            let retryable: boolean | null = null;
            try {
                const observedRetryable = errorCandidate.retryable;
                if (typeof observedRetryable === 'boolean')
                    retryable = observedRetryable;
            }
            catch {
            }
            let status: number | null = null;
            try {
                const convertNumber = runtime.Number;
                const observedStatus = convertNumber(errorCandidate.status);
                if (typeof observedStatus === 'number')
                    status = observedStatus;
            }
            catch {
            }
            return Object.freeze({
                classification,
                retryable,
                retryAfterSeconds: captureRetryAfterSeconds(operationalError),
                status,
            });
        }
        function computeRetryDelayMs(error: unknown, attempt: unknown): unknown {
            return computeRetryDelayFromSnapshot(captureRetryAfterSeconds(error), attempt);
        }
        function captureRetryAfterSeconds(error: unknown): number | null {
            const errorValue = error as FalsySensitiveValue;
            const errorCandidate = error as TranslationManagerRunnerErrorDetailsCandidate;
            try {
                const convertNumber = runtime.Number;
                const retryAfter = convertNumber(errorValue && errorCandidate.retryAfter);
                if (typeof retryAfter === 'number' && runtime.Number.isFinite(retryAfter) && retryAfter > 0) {
                    return retryAfter;
                }
            }
            catch {
            }
            return null;
        }
        function computeRetryDelayFromSnapshot(retryAfterSeconds: number | null, attempt: unknown): unknown {
            if (retryAfterSeconds !== null) {
                return runtime.Math.min(retryMaxMs, runtime.Math.floor(retryAfterSeconds * 1000));
            }
            const exponential = (retryBaseMs as number) * (runtime.Math.pow(2, runtime.Math.max(0, (attempt as number) - 1)) as number);
            const jitter = runtime.Math.floor((runtime.Math.random() as number) * (runtime.Math.min(250, retryBaseMs) as number));
            return runtime.Math.min(retryMaxMs, runtime.Math.floor(exponential + (jitter as number)));
        }
        function waitForRetry(ms: unknown, signal: unknown): RuntimePromiseCandidate {
            const PromiseConstructor = runtime.Promise;
            return new PromiseConstructor((resolve, reject) => {
                const signalValue = signal as FalsySensitiveValue;
                const signalCandidate = signal as {
                    readonly aborted: unknown;
                    readonly reason: unknown;
                    readonly removeEventListener: RuntimeFunction;
                    readonly addEventListener: RuntimeFunction;
                };
                let timeoutId: unknown;
                let timerOwned = false;
                let listenerOwned = false;
                let settled = false;
                let cancelTimeout: RuntimeFunction | null = null;
                let addAbortListener: RuntimeFunction | null = null;
                let removeAbortListener: RuntimeFunction | null = null;
                function isSettled(): boolean {
                    return settled;
                }
                const release = () => {
                    if (timerOwned) {
                        timerOwned = false;
                        try {
                            const cancel = cancelTimeout;
                            if (cancel !== null)
                                Reflect.apply(cancel, undefined, [timeoutId]);
                        }
                        catch {
                        }
                    }
                    if (listenerOwned) {
                        listenerOwned = false;
                        try {
                            const remove = removeAbortListener;
                            if (remove !== null)
                                Reflect.apply(remove, signal, ['abort', onAbort]);
                        }
                        catch {
                        }
                    }
                };
                const rejectOnce = (error: unknown) => {
                    if (settled)
                        return;
                    settled = true;
                    release();
                    reject(error);
                };
                const resolveOnce = () => {
                    if (settled)
                        return;
                    settled = true;
                    release();
                    resolve();
                };
                const onAbort = () => {
                    if (settled)
                        return;
                    settled = true;
                    release();
                    try {
                        const reason = signalCandidate.reason;
                        reject(createAbortError(reason));
                    }
                    catch (error) {
                        reject(error);
                    }
                };
                try {
                    cancelTimeout = runtime.clearTimeout;
                    const scheduleTimeout = runtime.setTimeout;
                    if (signalValue) {
                        const addCandidate = signalCandidate.addEventListener;
                        const removeCandidate = signalCandidate.removeEventListener;
                        if (typeof addCandidate === 'function' && typeof removeCandidate === 'function') {
                            addAbortListener = addCandidate;
                            removeAbortListener = removeCandidate;
                        }
                        if (signalCandidate.aborted) {
                            onAbort();
                            return;
                        }
                    }
                    timeoutId = Reflect.apply(scheduleTimeout, undefined, [resolveOnce, runtime.Math.max(0, ms)]);
                    if (isSettled()) {
                        try {
                            Reflect.apply(cancelTimeout, undefined, [timeoutId]);
                        }
                        catch {
                        }
                        return;
                    }
                    timerOwned = true;
                    if (addAbortListener !== null) {
                        listenerOwned = true;
                        try {
                            Reflect.apply(addAbortListener, signal, ['abort', onAbort, { once: true }]);
                        }
                        catch (error) {
                            rejectOnce(error);
                            return;
                        }
                        if (isSettled()) {
                            try {
                                const remove = removeAbortListener;
                                if (remove !== null)
                                    Reflect.apply(remove, signal, ['abort', onAbort]);
                            }
                            catch {
                            }
                            return;
                        }
                        if (signalCandidate.aborted)
                            onAbort();
                    }
                }
                catch (error) {
                    rejectOnce(error);
                }
            });
        }
        function getRunningJobs(): unknown[] {
            return [...activeRunLeases.keys()].filter((job) => (job as TranslationManagerRunnerJobCandidate).status === 'running');
        }
        return {
            getRunningJobs,
            createJobController,
            notifyDelta,
            startJob,
            runProviderWithRetries,
            shouldRetry,
            computeRetryDelayMs,
            waitForRetry,
        };
    }
    return createController;
}
export function createTranslationManagerRunnerModule(runtimeScope: object): TranslationManagerRunnerModule {
    let createController = runnerControllerFactories.get(runtimeScope);
    if (createController === undefined) {
        createController = createRealmRunnerControllerFactory(runtimeScope);
        runnerControllerFactories.set(runtimeScope, createController);
    }
    return { create: createController };
}
