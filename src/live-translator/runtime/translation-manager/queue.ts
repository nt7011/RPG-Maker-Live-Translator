import type { PendingTranslationQueue } from './pending-queue.js';
import type { TranslationManagerControllerFacades } from './controller-facades.js';
import { captureTranslationProviderRuntimeStatus } from '../translation-providers/runtime-status.js';
type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
const intrinsicReflectApply = Reflect.apply;
interface RuntimePromiseCandidate {
    then(onFulfilled?: RuntimeFunction, onRejected?: RuntimeFunction): RuntimePromiseCandidate;
    catch(onRejected?: RuntimeFunction): RuntimePromiseCandidate;
    finally(onFinally?: RuntimeFunction): RuntimePromiseCandidate;
}
interface RuntimePromiseConstructorCandidate {
    resolve(value?: unknown): RuntimePromiseCandidate;
}
interface RuntimeDateCandidate {
    now(): unknown;
}
interface RuntimeMathCandidate {
    min(...values: unknown[]): unknown;
}
interface RuntimeNumberCandidate {
    (this: unknown, value?: unknown): unknown;
    readonly MAX_SAFE_INTEGER: unknown;
    isInteger(value: unknown): unknown;
}
interface RuntimeHasOwnPropertyCandidate {
    call(thisArgument: unknown, key: unknown): unknown;
}
interface RuntimeObjectCandidate {
    readonly prototype: {
        readonly hasOwnProperty: RuntimeHasOwnPropertyCandidate;
    };
}
type RuntimeErrorConstructorCandidate = new (message?: unknown) => Error;
interface TranslationManagerQueueRuntimeScopeCandidate {
    readonly Date: RuntimeDateCandidate;
    readonly Promise: RuntimePromiseConstructorCandidate;
    readonly Math: RuntimeMathCandidate;
    readonly Number: RuntimeNumberCandidate;
    readonly Object: RuntimeObjectCandidate;
    readonly Error: RuntimeErrorConstructorCandidate;
}
interface TranslationManagerQueueLoggerCandidate {
    warn(message: unknown, error: unknown): unknown;
    error(message: unknown, error: unknown): unknown;
}
interface TranslationManagerQueueProviderCandidate {
    readonly getCapacity: RuntimeFunction;
    readonly getRuntimeStatus: RuntimeFunction;
}
interface TranslationManagerQueueProviderCapabilitiesCandidate {
    readonly requiresVerifiedCapacity: unknown;
    readonly tracksAvailability?: unknown;
}
interface TranslationManagerQueueJobCandidate {
    readonly status: unknown;
}
interface TranslationManagerQueuePruneJournal {
    readonly job: unknown;
    lineageForgotten: boolean;
    queueRemoved: boolean;
}
interface TranslationManagerQueueDispatchLease {
    readonly job: unknown;
    queueRemoved: boolean;
    rollbackPending: boolean;
}
interface TranslationManagerQueueDispatchStateCandidate {
    readonly canDispatch: unknown;
}
interface TranslationManagerQueueDiagnosticsCandidate {
    recordLazy(type: unknown, detailsFactory: () => unknown): unknown;
}
interface TranslationManagerQueueScopeCandidate {
    readonly logger: TranslationManagerQueueLoggerCandidate;
    readonly provider: unknown;
    readonly capacityRefreshMs: unknown;
    readonly requestTimeoutMs: unknown;
    readonly formatError: RuntimeFunction;
    readonly queuedJobs: PendingTranslationQueue;
    readonly controllerFacades: Pick<TranslationManagerControllerFacades, 'jobs' | 'lineages' | 'runner'>;
    readonly providerCapabilities: unknown;
    providerCapacity: unknown;
    providerCapacityVerified: unknown;
    capacityExpiresAt: unknown;
    lastCapacityRefreshAt: unknown;
    lastCapacityRefreshError: unknown;
    capacityPromise: unknown;
    pumpScheduled: unknown;
    pumpRunning: unknown;
    readonly activeCount: unknown;
    readonly translationDiagnostics: TranslationManagerQueueDiagnosticsCandidate;
    readonly recordProviderAvailability: RuntimeFunction;
    readonly isDisposed?: () => boolean;
    readonly publishStatus?: () => void;
    lastCapacitySuccessAt?: number;
}
export interface TranslationManagerQueueController {
    refreshCapacityIfNeeded(force?: unknown): Promise<unknown>;
    schedulePump(): void;
    pruneQueuedJobs(): void;
    takeNextQueuedJob(predicate?: unknown): unknown;
    dispatchReservedPriorityLaneJobs(lanes: unknown): void;
    dispatchNormalJobs(lanes: unknown): void;
    canDispatchQueuedWork(): boolean;
    pump(): Promise<void>;
}
type TranslationManagerQueueControllerFactory = (scope?: unknown) => TranslationManagerQueueController;
export interface TranslationManagerQueueModule {
    create: TranslationManagerQueueControllerFactory;
}
const queueControllerFactories = new WeakMap<object, TranslationManagerQueueControllerFactory>();
function createRealmQueueControllerFactory(runtimeScope: object): TranslationManagerQueueControllerFactory {
    const runtime = runtimeScope as TranslationManagerQueueRuntimeScopeCandidate;
    function createController(scope: unknown = {}): TranslationManagerQueueController {
        const source = scope as TranslationManagerQueueScopeCandidate;
        const { logger, provider, capacityRefreshMs, requestTimeoutMs, queuedJobs } = source;
        const { forgetJob } = source.controllerFacades.lineages;
        const { getEnabledReservedPriorityLanes, jobMatchesReservedLane, jobMatchesAnyReservedLane, getReservedLaneDispatchState, getNormalDispatchState, getQueueDispatchState, } = source.controllerFacades.jobs;
        const { startJob } = source.controllerFacades.runner;
        const pendingPrunes = new Set<TranslationManagerQueuePruneJournal>();
        const pendingDispatches = new Set<TranslationManagerQueueDispatchLease>();
        let capacityRefreshOwner: RuntimePromiseCandidate | null = null;
        let pumpScheduledOwner = false;
        let pumpRunningOwner = false;
        let pumpRerunRequested = false;
        let journalGeneration: object = {};
        let journalRecoveryScheduled = false;
        let journalRecoveryRunning = false;
        let suppressImmediateReschedule = false;
        function isImmediateRescheduleSuppressed(): boolean {
            return suppressImmediateReschedule;
        }
        function reportQueueFailure(message: string, error: unknown): void {
            try {
                logger.error(message, error);
            }
            catch {
            }
        }
        function observeQueue(operation: () => unknown): void {
            try {
                operation();
            }
            catch {
            }
        }
        function projectPumpScheduled(): void {
            observeQueue(() => {
                source.pumpScheduled = pumpScheduledOwner;
            });
        }
        function projectPumpRunning(): void {
            observeQueue(() => source.publishStatus?.());
            observeQueue(() => {
                source.pumpRunning = pumpRunningOwner;
            });
        }
        function requiresVerifiedCapacity(): boolean {
            const capabilities = source.providerCapabilities as FalsySensitiveValue;
            return !!(capabilities &&
                (source.providerCapabilities as TranslationManagerQueueProviderCapabilitiesCandidate)
                    .requiresVerifiedCapacity === true);
        }
        function canDispatchWithCurrentCapacity(): boolean {
            if (source.isDisposed?.())
                return false;
            const capabilities = source.providerCapabilities as TranslationManagerQueueProviderCapabilitiesCandidate;
            if (capabilities.tracksAvailability === true) {
                try {
                    const status = captureTranslationProviderRuntimeStatus(intrinsicReflectApply((provider as TranslationManagerQueueProviderCandidate).getRuntimeStatus, provider, []));
                    if (status?.state !== 'available')
                        return false;
                }
                catch {
                    return false;
                }
            }
            return !requiresVerifiedCapacity() || source.providerCapacityVerified === true;
        }
        function isCapacityVerifiedByProvider(verificationRequired: boolean, capacity: number): boolean {
            const providerCandidate = provider as TranslationManagerQueueProviderCandidate | null;
            const tracked = (source.providerCapabilities as TranslationManagerQueueProviderCapabilitiesCandidate)
                .tracksAvailability === true;
            let status = null;
            try {
                const getRuntimeStatus = providerCandidate?.getRuntimeStatus;
                if (typeof getRuntimeStatus === 'function') {
                    status = captureTranslationProviderRuntimeStatus(intrinsicReflectApply(getRuntimeStatus, provider, []));
                }
            }
            catch {
                if (!tracked)
                    return false;
            }
            if (tracked && (status?.state !== 'available' || status.capacity !== capacity)) {
                throw new runtime.Error('Translation provider is not ready with the reported capacity.');
            }
            return status
                ? status.state === 'available' && status.capacity === capacity && status.capacityVerified
                : !verificationRequired;
        }
        async function refreshCapacityIfNeeded(force: unknown = false): Promise<unknown> {
            if (source.isDisposed?.())
                return 0;
            const now = runtime.Date.now();
            if (!force && (now as number) < (source.capacityExpiresAt as number))
                return source.providerCapacity;
            if (capacityRefreshOwner !== null)
                return capacityRefreshOwner;
            const providerValue = provider as FalsySensitiveValue;
            const providerCandidate = provider as TranslationManagerQueueProviderCandidate;
            if (!providerValue || typeof providerCandidate.getCapacity !== 'function') {
                source.providerCapacity = 1;
                source.providerCapacityVerified = false;
                source.capacityExpiresAt = (now as number) + (capacityRefreshMs as number);
                return source.providerCapacity;
            }
            let refreshTask: RuntimePromiseCandidate;
            try {
                refreshTask = runtime.Promise.resolve()
                    .then(() => providerCandidate.getCapacity({
                    force: true,
                    timeoutMs: runtime.Math.min(requestTimeoutMs, 10000),
                }))
                    .then((capacity: unknown) => {
                    if (source.isDisposed?.())
                        return 0;
                    const numeric = capacity;
                    const validCapacity = typeof capacity === 'number' && Number.isSafeInteger(capacity) && capacity > 0;
                    const verificationRequired = requiresVerifiedCapacity();
                    const tracked = (source.providerCapabilities as TranslationManagerQueueProviderCapabilitiesCandidate)
                        .tracksAvailability === true;
                    if (tracked && !validCapacity) {
                        throw new runtime.Error('Translation provider returned an invalid capacity.');
                    }
                    source.providerCapacity = validCapacity
                        ? runtime.Math.min(numeric, runtime.Number.MAX_SAFE_INTEGER)
                        : 1;
                    source.providerCapacityVerified =
                        validCapacity && isCapacityVerifiedByProvider(verificationRequired, numeric as number);
                    if ((verificationRequired || (tracked && validCapacity && (numeric as number) > 1)) &&
                        !source.providerCapacityVerified) {
                        throw new runtime.Error('Translation provider did not return a verified positive capacity.');
                    }
                    source.capacityExpiresAt = (runtime.Date.now() as number) + (capacityRefreshMs as number);
                    source.lastCapacityRefreshAt = runtime.Date.now();
                    source.lastCapacityRefreshError = '';
                    source.lastCapacitySuccessAt = source.lastCapacityRefreshAt as number;
                    const refreshedCapacity = source.providerCapacity;
                    observeQueue(() => source.translationDiagnostics.recordLazy('capacity.refreshed', () => ({
                        capacity: refreshedCapacity,
                    })));
                    observeQueue(() => source.recordProviderAvailability('capacity-refreshed'));
                    if (queuedJobs.length)
                        schedulePump();
                    return source.providerCapacity;
                })
                    .catch((error: unknown) => {
                    if (source.isDisposed?.())
                        return 0;
                    const unavailable = (source.providerCapabilities as TranslationManagerQueueProviderCapabilitiesCandidate)
                        .tracksAvailability === true;
                    const failurePolicy = requiresVerifiedCapacity() || unavailable
                        ? 'dispatch paused until capacity is verified.'
                        : 'using 1.';
                    observeQueue(() => logger.warn(`[TranslationService] Failed to refresh provider capacity; ${failurePolicy}`, error));
                    observeQueue(() => {
                        source.providerCapacity = unavailable ? 0 : 1;
                    });
                    observeQueue(() => {
                        source.providerCapacityVerified = false;
                    });
                    observeQueue(() => {
                        source.capacityExpiresAt = (runtime.Date.now() as number) + (capacityRefreshMs as number);
                    });
                    observeQueue(() => {
                        source.lastCapacityRefreshAt = runtime.Date.now();
                    });
                    let capacityRefreshError: unknown = '';
                    try {
                        capacityRefreshError = source.formatError(error);
                    }
                    catch {
                    }
                    observeQueue(() => {
                        source.lastCapacityRefreshError = capacityRefreshError;
                    });
                    const failedCapacity = source.providerCapacity;
                    observeQueue(() => source.translationDiagnostics.recordLazy('capacity.failed', () => ({
                        capacity: failedCapacity,
                        error: capacityRefreshError,
                    })));
                    observeQueue(() => source.recordProviderAvailability('capacity-failed', error));
                    return source.providerCapacity;
                })
                    .finally(() => {
                    capacityRefreshOwner = null;
                    observeQueue(() => {
                        source.capacityPromise = null;
                    });
                    observeQueue(() => source.publishStatus?.());
                });
            }
            catch (error) {
                capacityRefreshOwner = null;
                observeQueue(() => {
                    source.capacityPromise = null;
                });
                reportQueueFailure('[TranslationService] capacity refresh setup failed', error);
                return source.providerCapacity;
            }
            capacityRefreshOwner = refreshTask;
            observeQueue(() => {
                source.capacityPromise = refreshTask;
            });
            observeQueue(() => source.publishStatus?.());
            return refreshTask;
        }
        function schedulePump(): void {
            if (source.isDisposed?.())
                return;
            observeQueue(() => source.publishStatus?.());
            if (pumpScheduledOwner)
                return;
            pumpScheduledOwner = true;
            projectPumpScheduled();
            let pumpCallbackOwned = false;
            try {
                const pumpTask = runtime.Promise.resolve().then(pump);
                pumpCallbackOwned = true;
                pumpTask.catch((error: unknown) => {
                    reportQueueFailure('[TranslationService] queue pump failed', error);
                });
            }
            catch (error) {
                if (!pumpCallbackOwned) {
                    pumpScheduledOwner = false;
                    projectPumpScheduled();
                }
                reportQueueFailure('[TranslationService] queue pump setup failed', error);
            }
        }
        function settlePruneJournal(journal: TranslationManagerQueuePruneJournal): void {
            if (!journal.queueRemoved) {
                try {
                    if (!queuedJobs.has(journal.job)) {
                        journal.queueRemoved = true;
                    }
                    else {
                        try {
                            queuedJobs.delete(journal.job);
                        }
                        finally {
                            journal.queueRemoved = !queuedJobs.has(journal.job);
                        }
                    }
                }
                catch (error) {
                    reportQueueFailure('[TranslationService] queued-job removal settlement failed', error);
                }
            }
            if (journal.queueRemoved && !journal.lineageForgotten) {
                try {
                    forgetJob(journal.job);
                    journal.lineageForgotten = true;
                }
                catch (error) {
                    reportQueueFailure('[TranslationService] queued-job lineage settlement failed', error);
                }
            }
            if (journal.queueRemoved && journal.lineageForgotten)
                pendingPrunes.delete(journal);
        }
        function settlePendingPrunes(): void {
            for (const journal of Array.from(pendingPrunes))
                settlePruneJournal(journal);
        }
        function settleDispatchLease(lease: TranslationManagerQueueDispatchLease): boolean {
            if (!lease.rollbackPending)
                return false;
            if (!lease.queueRemoved) {
                try {
                    if (queuedJobs.has(lease.job)) {
                        pendingDispatches.delete(lease);
                        return false;
                    }
                    lease.queueRemoved = true;
                }
                catch (error) {
                    reportQueueFailure('[TranslationService] queue dispatch rollback attestation failed', error);
                    return false;
                }
            }
            try {
                const status = (lease.job as TranslationManagerQueueJobCandidate).status;
                if (status !== 'queued') {
                    pendingDispatches.delete(lease);
                    return false;
                }
                if (queuedJobs.has(lease.job)) {
                    lease.queueRemoved = false;
                    pendingDispatches.delete(lease);
                    return true;
                }
                try {
                    queuedJobs.add(lease.job);
                }
                finally {
                    if (queuedJobs.has(lease.job)) {
                        lease.queueRemoved = false;
                        pendingDispatches.delete(lease);
                    }
                }
            }
            catch (error) {
                reportQueueFailure('[TranslationService] queue dispatch rollback failed', error);
            }
            return !lease.queueRemoved;
        }
        function settlePendingDispatches(): boolean {
            let restoredQueuedWork = false;
            for (const lease of Array.from(pendingDispatches)) {
                if (settleDispatchLease(lease))
                    restoredQueuedWork = true;
            }
            return restoredQueuedWork;
        }
        function hasPendingQueueJournals(): boolean {
            return pendingPrunes.size > 0 || Array.from(pendingDispatches).some((lease) => lease.rollbackPending);
        }
        function runQueueJournalRecovery(): void {
            journalRecoveryScheduled = false;
            if (journalRecoveryRunning)
                return;
            journalRecoveryRunning = true;
            const recoveryGeneration = journalGeneration;
            let restoredQueuedWork = false;
            try {
                settlePendingPrunes();
                restoredQueuedWork = settlePendingDispatches();
            }
            catch (error) {
                reportQueueFailure('[TranslationService] queue journal recovery failed', error);
            }
            finally {
                journalRecoveryRunning = false;
            }
            if (restoredQueuedWork)
                schedulePump();
            if (hasPendingQueueJournals() && journalGeneration !== recoveryGeneration) {
                requestQueueJournalRecovery();
            }
        }
        function requestQueueJournalRecovery(): void {
            if (journalRecoveryScheduled || journalRecoveryRunning || !hasPendingQueueJournals())
                return;
            journalRecoveryScheduled = true;
            let recoveryCallbackOwned = false;
            try {
                runtime.Promise.resolve().then(runQueueJournalRecovery);
                recoveryCallbackOwned = true;
            }
            catch (error) {
                if (!recoveryCallbackOwned)
                    journalRecoveryScheduled = false;
                reportQueueFailure('[TranslationService] queue journal recovery setup failed', error);
            }
        }
        function pruneQueuedJobs(): void {
            settlePendingPrunes();
            const restoredQueuedWork = settlePendingDispatches();
            for (const job of [...queuedJobs]) {
                let queued: boolean;
                try {
                    queued = !!job && (job as TranslationManagerQueueJobCandidate).status === 'queued';
                }
                catch (error) {
                    reportQueueFailure('[TranslationService] queued-job inspection failed', error);
                    continue;
                }
                if (queued)
                    continue;
                const alreadyOwned = Array.from(pendingPrunes).some((journal) => journal.job === job && !journal.queueRemoved);
                if (alreadyOwned)
                    continue;
                const journal: TranslationManagerQueuePruneJournal = {
                    job,
                    lineageForgotten: false,
                    queueRemoved: false,
                };
                pendingPrunes.add(journal);
                journalGeneration = {};
                settlePruneJournal(journal);
            }
            if (restoredQueuedWork)
                schedulePump();
            requestQueueJournalRecovery();
        }
        function claimNextPreparedJob(predicate: unknown, minimumPriority = -Infinity): TranslationManagerQueueDispatchLease | null {
            let job: unknown;
            try {
                let version: number;
                do {
                    version = queuedJobs.version;
                    job = queuedJobs.peek(typeof predicate === 'function' ? (predicate as (job: unknown) => boolean) : undefined, minimumPriority);
                } while (version !== queuedJobs.version);
            }
            catch (error) {
                reportQueueFailure('[TranslationService] queue predicate failed', error);
                return null;
            }
            if (job === undefined)
                return null;
            const lease: TranslationManagerQueueDispatchLease = { job, queueRemoved: false, rollbackPending: false };
            pendingDispatches.add(lease);
            journalGeneration = {};
            try {
                queuedJobs.delete(job);
            }
            catch (error) {
                reportQueueFailure('[TranslationService] queue dispatch removal failed', error);
            }
            lease.queueRemoved = !queuedJobs.has(job);
            if (!lease.queueRemoved) {
                pendingDispatches.delete(lease);
                return null;
            }
            return lease;
        }
        function takeNextQueuedJob(predicate: unknown = null): unknown {
            pruneQueuedJobs();
            const lease = claimNextPreparedJob(predicate);
            if (lease === null)
                return null;
            pendingDispatches.delete(lease);
            return lease.job;
        }
        function startClaimedJob(lease: TranslationManagerQueueDispatchLease): boolean {
            try {
                const started: unknown = startJob(lease.job);
                if (started === false) {
                    suppressImmediateReschedule = true;
                    lease.rollbackPending = true;
                    settleDispatchLease(lease);
                    requestQueueJournalRecovery();
                    return false;
                }
                pendingDispatches.delete(lease);
                return true;
            }
            catch (error) {
                suppressImmediateReschedule = true;
                lease.rollbackPending = true;
                settleDispatchLease(lease);
                requestQueueJournalRecovery();
                reportQueueFailure('[TranslationService] queue startup handoff failed', error);
                return false;
            }
        }
        function dispatchReservedPriorityLaneJobs(lanes: unknown): void {
            pruneQueuedJobs();
            dispatchPreparedReservedPriorityLaneJobs(lanes);
        }
        function dispatchPreparedReservedPriorityLaneJobs(lanes: unknown): void {
            if (!pumpRunningOwner)
                suppressImmediateReschedule = false;
            for (const lane of lanes as Iterable<unknown>) {
                if (isImmediateRescheduleSuppressed())
                    return;
                while ((getReservedLaneDispatchState(lane) as TranslationManagerQueueDispatchStateCandidate).canDispatch) {
                    const lease = claimNextPreparedJob((candidate: unknown) => jobMatchesReservedLane(candidate, lane), (lane as {
                        priority: number;
                    }).priority);
                    if (lease === null)
                        break;
                    if (!startClaimedJob(lease))
                        break;
                }
            }
        }
        function dispatchNormalJobs(lanes: unknown): void {
            pruneQueuedJobs();
            dispatchPreparedNormalJobs(lanes);
        }
        function dispatchPreparedNormalJobs(lanes: unknown): void {
            if (!pumpRunningOwner)
                suppressImmediateReschedule = false;
            let state = getNormalDispatchState(lanes) as TranslationManagerQueueDispatchStateCandidate;
            while (state.canDispatch) {
                const lease = claimNextPreparedJob((candidate: unknown) => !jobMatchesAnyReservedLane(candidate, lanes));
                if (lease === null)
                    break;
                if (!startClaimedJob(lease))
                    break;
                state = getNormalDispatchState(lanes) as TranslationManagerQueueDispatchStateCandidate;
            }
        }
        function canDispatchQueuedWork(): boolean {
            pruneQueuedJobs();
            if (!queuedJobs.length ||
                !canDispatchWithCurrentCapacity() ||
                (source.activeCount as number) >= (source.providerCapacity as number))
                return false;
            const lanes = getEnabledReservedPriorityLanes();
            return (getQueueDispatchState(lanes) as TranslationManagerQueueDispatchStateCandidate).canDispatch === true;
        }
        async function pump(): Promise<void> {
            if (source.isDisposed?.())
                return;
            pumpScheduledOwner = false;
            projectPumpScheduled();
            if (pumpRunningOwner) {
                pumpRerunRequested = true;
                return;
            }
            pumpRunningOwner = true;
            projectPumpRunning();
            suppressImmediateReschedule = false;
            try {
                await refreshCapacityIfNeeded(false);
                if (!canDispatchWithCurrentCapacity())
                    return;
                pruneQueuedJobs();
                while (!isImmediateRescheduleSuppressed() && canDispatchWithCurrentCapacity()) {
                    const lanes = getEnabledReservedPriorityLanes();
                    let lease: TranslationManagerQueueDispatchLease | null = null;
                    for (const lane of lanes as Iterable<{
                        priority: number;
                    }>) {
                        if (!(getReservedLaneDispatchState(lane) as TranslationManagerQueueDispatchStateCandidate)
                            .canDispatch)
                            continue;
                        lease = claimNextPreparedJob((job: unknown) => jobMatchesReservedLane(job, lane), lane.priority);
                        if (lease !== null)
                            break;
                    }
                    if (lease === null &&
                        (getNormalDispatchState(lanes) as TranslationManagerQueueDispatchStateCandidate).canDispatch)
                        lease = claimNextPreparedJob((job: unknown) => !jobMatchesAnyReservedLane(job, lanes));
                    if (lease === null || !startClaimedJob(lease))
                        break;
                }
            }
            catch (error) {
                reportQueueFailure('[TranslationService] queue pump body failed', error);
            }
            finally {
                pumpRunningOwner = false;
                projectPumpRunning();
                const rerunRequested = pumpRerunRequested;
                pumpRerunRequested = false;
                if (!isImmediateRescheduleSuppressed()) {
                    if (rerunRequested) {
                        schedulePump();
                    }
                    else {
                        try {
                            if (canDispatchQueuedWork())
                                schedulePump();
                        }
                        catch (error) {
                            reportQueueFailure('[TranslationService] queue pump reschedule failed', error);
                        }
                    }
                }
            }
        }
        return {
            refreshCapacityIfNeeded,
            schedulePump,
            pruneQueuedJobs,
            takeNextQueuedJob,
            dispatchReservedPriorityLaneJobs,
            dispatchNormalJobs,
            canDispatchQueuedWork,
            pump,
        };
    }
    return createController;
}
export function createTranslationManagerQueueModule(runtimeScope: object): TranslationManagerQueueModule {
    let createController = queueControllerFactories.get(runtimeScope);
    if (createController === undefined) {
        createController = createRealmQueueControllerFactory(runtimeScope);
        queueControllerFactories.set(runtimeScope, createController);
    }
    return { create: createController };
}
