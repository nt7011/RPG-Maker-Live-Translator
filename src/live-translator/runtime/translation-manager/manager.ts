import { createPendingTranslationQueue, type PendingTranslationQueue } from './pending-queue.js';
import type { CancellationClassification, CancellationModule } from '../cancellation.js';
import { captureTranslationProviderAvailabilityFailure, captureTranslationProviderRuntimeStatus, type TranslationProviderRuntimeStatus, } from '../translation-providers/runtime-status.js';
import { createTranslationManagerApiModule, type TranslationManagerApiModule, type TranslationManagerCompatibilityCache, } from './api.js';
import { createTranslationManagerCacheModule, type CompletedTranslationMap, type ReadonlyCompletedTranslationMap, type ReadonlyTranslationMap, type TranslationManagerCacheModule, } from './cache.js';
import { createTranslationManagerCommonModule, type BoundTranslationLogger, type TranslationManagerCommonModule, } from './common.js';
import { createTranslationManagerConstantsModule, type TranslationManagerConstantsModule } from './constants.js';
import { createTranslationManagerControllerFacadesModule, getTranslationManagerControllerRoute, TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST, type TranslationManagerControllerFacades, type TranslationManagerControllerFacadesModule, type TranslationManagerControllerKey, type TranslationManagerControllerMethod, type TranslationManagerControllerMethodName, type TranslationManagerControllerMethodParameters, type TranslationManagerControllerMethodReturn, type TranslationManagerControllersByKey, } from './controller-facades.js';
import { createTranslationManagerEligibilityModule, type TranslationManagerEligibilityModule } from './eligibility.js';
import { createTranslationManagerHandlesModule, type TranslationManagerHandlesModule } from './handles.js';
import { createTranslationManagerJobsModule, type TranslationManagerJobsModule } from './jobs.js';
import { createTranslationManagerLineagesModule, type TranslationManagerLineagesModule } from './lineages.js';
import { createTranslationManagerQueueModule, type TranslationManagerQueueModule } from './queue.js';
import { createTranslationManagerRegexRulesModule, type TranslationManagerRegexRulesModule } from './regex-rules.js';
import { createTranslationManagerRequestHandoffModule, type TranslationManagerRequestHandoffModule, } from './request-handoff.js';
import { createTranslationManagerRequestsModule, type TranslationManagerRequestsController, type TranslationManagerRequestsModule, } from './requests.js';
import { createTranslationManagerRunnerModule, type TranslationManagerRunnerModule } from './runner.js';
import { createTranslationManagerSchedulerPolicyModule, type TranslationManagerSchedulerPolicy, type TranslationManagerSchedulerPolicyModule, } from './scheduler-policy.js';
import { createSubscriberOwnershipRegistry, type SubscriberOwnershipRegistry } from './subscriber-ownership.js';
import { createTranslationManagerSubscribersModule, type TranslationManagerSubscribersModule } from './subscribers.js';
import { createTranslationDiagnosticsPortModule, type TranslationDiagnosticsPort, type TranslationDiagnosticsPortModule, } from '../translation-diagnostics-port.js';
import { createTranslationIntelModule, type TranslationIntelModule } from '../translation-intel.js';
import { createTranslationStatusModule, type TranslationStatusLifecycleOwner, type TranslationStatusModule, } from '../translation-status.js';
type RuntimeFunction = (...args: unknown[]) => unknown;
type RuntimeBindableFunction = (this: unknown, ...args: unknown[]) => unknown;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
type PropertyBag = Record<string, unknown>;
const IntrinsicPromise = Promise;
const intrinsicReflectApply = Reflect.apply;
const intrinsicPromiseThen = Promise.prototype.then;
function truthyOr<Value, Fallback>(value: Value, fallback: () => Fallback): Value | Fallback {
    if (value)
        return value;
    return fallback();
}
interface RuntimeObjectCandidate {
    assign(target: unknown, ...sources: unknown[]): unknown;
    keys(value: unknown): string[];
}
interface RuntimeMathCandidate {
    floor(value: unknown): number;
    max(...values: unknown[]): number;
}
interface RuntimeDateCandidate {
    now(): number;
}
interface RuntimeNumberCandidate {
    (this: unknown, value?: unknown): number;
    isFinite(value: unknown): boolean;
}
type RuntimeStringCandidate = (this: unknown, value?: unknown) => string;
interface RuntimeArrayCandidate {
    from<T>(value: Iterable<T> | ArrayLike<T>): T[];
    isArray(value: unknown): value is unknown[];
}
interface RuntimePromiseCandidate {
    then(onFulfilled?: RuntimeFunction, onRejected?: RuntimeFunction): RuntimePromiseCandidate;
    catch(onRejected?: RuntimeFunction): RuntimePromiseCandidate;
    finally(onFinally?: RuntimeFunction): RuntimePromiseCandidate;
}
interface RuntimePromiseConstructorCandidate {
    resolve(value?: unknown): RuntimePromiseCandidate;
}
type RuntimeSetConstructorCandidate = new <T = unknown>() => Set<T>;
type RuntimeMapConstructorCandidate = new <K = unknown, V = unknown>() => Map<K, V>;
type RuntimeErrorConstructorCandidate = new (message?: unknown) => Error;
interface TranslationManagerRuntimeScopeCandidate {
    readonly Object: RuntimeObjectCandidate;
    readonly Math: RuntimeMathCandidate;
    readonly Date: RuntimeDateCandidate;
    readonly Number: RuntimeNumberCandidate;
    readonly String: RuntimeStringCandidate;
    readonly Array: RuntimeArrayCandidate;
    readonly Promise: RuntimePromiseConstructorCandidate;
    readonly Set: RuntimeSetConstructorCandidate;
    readonly Map: RuntimeMapConstructorCandidate;
    readonly RegExp: RegExpConstructor;
    readonly Error: RuntimeErrorConstructorCandidate;
    readonly setTimeout: unknown;
    readonly clearTimeout: unknown;
}
interface TranslationManagerModuleDependencies {
    readonly constants: TranslationManagerConstantsModule;
    readonly common: TranslationManagerCommonModule;
    readonly cache: TranslationManagerCacheModule;
    readonly regexRules: TranslationManagerRegexRulesModule;
    readonly handles: TranslationManagerHandlesModule;
    readonly controllerFacadesModule: TranslationManagerControllerFacadesModule;
    readonly schedulerPolicyModule: TranslationManagerSchedulerPolicyModule;
    readonly lineagesController: TranslationManagerLineagesModule;
    readonly eligibilityController: TranslationManagerEligibilityModule;
    readonly jobsController: TranslationManagerJobsModule;
    readonly subscribersController: TranslationManagerSubscribersModule;
    readonly requestHandoffController: TranslationManagerRequestHandoffModule;
    readonly requestsController: TranslationManagerRequestsModule;
    readonly queueController: TranslationManagerQueueModule;
    readonly runnerController: TranslationManagerRunnerModule;
    readonly apiController: TranslationManagerApiModule;
    readonly diagnostics: TranslationDiagnosticsPortModule;
    readonly intel: TranslationIntelModule;
    readonly status: TranslationStatusModule;
}
interface TranslationManagerSharedModule extends TranslationManagerConstantsModule {
    readonly noop: RuntimeFunction;
    readonly defaultPreview: RuntimeFunction;
    readonly bindLogger: (logger?: unknown) => BoundTranslationLogger;
    readonly formatError: (error: unknown) => string;
    readonly ensureTelemetry: (telemetry: unknown) => unknown;
    readonly clampPriority: RuntimeFunction;
    readonly getPositiveSetting: RuntimeFunction;
    readonly normalizeProviderCapabilities: (provider: unknown) => TranslationProviderCapabilitiesCandidate;
    readonly createTextProcessorProvider: RuntimeFunction;
    readonly createNoneProvider: () => unknown;
    readonly compileIgnoreTranslationRegexRules: TranslationManagerRegexRulesModule['compileIgnoreTranslationRegexRules'];
    readonly compileOverrideTranslationRegexRules: TranslationManagerRegexRulesModule['compileOverrideTranslationRegexRules'];
    readonly compileSubstitutePlaintextBeforeTranslationRules: TranslationManagerCacheModule['compileSubstitutePlaintextBeforeTranslationRules'];
    readonly deriveCacheKeyAliases: TranslationManagerCacheModule['deriveCacheKeyAliases'];
    readonly normalizeCacheKey: TranslationManagerCacheModule['normalizeCacheKey'];
    readonly findIgnoredTranslationRegexMatch: TranslationManagerRegexRulesModule['findIgnoredTranslationRegexMatch'];
    readonly findOverrideTranslationRegexMatch: TranslationManagerRegexRulesModule['findOverrideTranslationRegexMatch'];
    readonly createReadonlyTranslationMap: TranslationManagerCacheModule['createReadonlyTranslationMap'];
    readonly createCompletedTranslationMap: TranslationManagerCacheModule['createCompletedTranslationMap'];
    readonly classifyCancellation: CancellationModule['classifyCancellation'];
    readonly createAbortError: TranslationManagerHandlesModule['createAbortError'];
    readonly createSubscriberHandleLease: TranslationManagerHandlesModule['createSubscriberHandleLease'];
    readonly settleSubscriberHandleLease: TranslationManagerHandlesModule['settleSubscriberHandleLease'];
}
type RuntimeOptionFunction = RuntimeFunction | FalsySensitiveValue;
interface TranslationManagerOptionsCandidate {
    readonly logger: unknown;
    readonly telemetry: unknown;
    readonly diskCache: FalsySensitiveValue;
    readonly settings: FalsySensitiveValue;
    readonly preview: RuntimeOptionFunction;
    readonly provider: unknown;
    readonly isCacheOnlyProvider: unknown;
    readonly getCacheEntryLimit: RuntimeOptionFunction;
    readonly pruneMapToLimit: RuntimeOptionFunction;
    readonly textProcessor: unknown;
    readonly isLocalProvider: unknown;
}
interface TranslationProviderCandidate {
    readonly kind: unknown;
    readonly getRuntimeStatus: RuntimeFunction;
}
interface TranslationProviderCapabilitiesCandidate {
    readonly streaming: unknown;
    readonly tracksAvailability: unknown;
    readonly requiresVerifiedCapacity: unknown;
}
interface TranslationAvailabilityErrorCandidate {
    providerAvailability?: unknown;
    providerAvailabilityReason?: unknown;
    providerAvailabilityMessage?: unknown;
    retryOnProviderRestored?: unknown;
}
interface ProviderAvailabilityEvaluation {
    tracked: unknown;
    state: unknown;
    available: unknown;
    reason: unknown;
    message: unknown;
    status: unknown;
    retryOnProviderRestored: unknown;
}
interface ProviderAvailabilityStatusSample {
    tracked: boolean;
    status: Readonly<TranslationProviderRuntimeStatus> | null;
}
interface ProviderAvailabilityState {
    state: unknown;
    unavailableObserved: unknown;
    changedAt: unknown;
    lastReason: unknown;
    lastMessage: unknown;
    sequence: number;
}
interface ProviderAvailabilityProbe {
    timerId: unknown;
    promise: unknown;
    startedAt: unknown;
    running: unknown;
    attempts: unknown;
    lastDelayMs: unknown;
}
type ProviderAvailabilityTimerPhase = 'preparing' | 'committed' | 'cleanup-pending' | 'settled';
interface ProviderAvailabilityTimerJournal {
    readonly attempts: number;
    readonly delayMs: number;
    readonly reason: unknown;
    readonly startedAt: unknown;
    fired: boolean;
    handle: unknown;
    phase: ProviderAvailabilityTimerPhase;
}
type ProviderAvailabilityRunPhase = 'preparing' | 'committed' | 'settled';
type ProviderAvailabilityPromiseStage = 'catch' | 'finally' | 'then';
interface ProviderAvailabilityRunJournal {
    readonly timer: ProviderAvailabilityTimerJournal;
    readonly terminal: Promise<unknown>;
    readonly rejectTerminal: (reason?: unknown) => void;
    readonly resolveTerminal: (value: unknown) => void;
    callbacksEnabled: boolean;
    completionRequested: boolean;
    innerTerminal: unknown;
    phase: ProviderAvailabilityRunPhase;
    setupFailed: boolean;
}
interface TimerHandleCandidate {
    unref: RuntimeFunction;
}
interface ProviderAvailabilityEvent {
    type: unknown;
    at: number;
    seq: number;
    providerKind: string;
    state: unknown;
    available: unknown;
    reason: unknown;
    message: unknown;
}
interface TranslationDiagnosticsCandidate {
    readonly recordLazy: RuntimeFunction;
    readonly dispose: RuntimeFunction;
}
interface OngoingTranslationJobCandidate {
    readonly id: unknown;
    readonly status: unknown;
    readonly createdAt: unknown;
    readonly queuedAt: unknown;
    readonly queueSeq: unknown;
    readonly effectivePriority: unknown;
    readonly stream: unknown;
    readonly hook: unknown;
    readonly source: unknown;
    readonly lineageId: unknown;
    readonly lineageSequence: unknown;
}
export type TranslationServiceDisposalSettlement = 'in-progress' | 'settled';
export interface TranslationServiceDisposalReceipt {
    readonly settlement: TranslationServiceDisposalSettlement;
    readonly probe: TranslationServiceDisposalSettlement;
    readonly diagnostics: TranslationServiceDisposalSettlement;
    readonly statusPublication: TranslationServiceDisposalSettlement;
}
interface TranslationServiceLifetimeOwner {
    dispose(): TranslationServiceDisposalReceipt;
}
interface TranslationManagerServiceScope extends TranslationManagerSharedModule {
    [key: string]: unknown;
    globalScope: TranslationManagerRuntimeScopeCandidate;
    logger: BoundTranslationLogger;
    telemetry: unknown;
    disk: object;
    settings: object;
    preview: RuntimeFunction;
    provider: unknown;
    providerCapabilities: TranslationProviderCapabilitiesCandidate;
    isCacheOnlyProvider: boolean;
    getCacheEntryLimit: RuntimeFunction;
    pruneMapToLimit: RuntimeFunction;
    ignoreTranslationRegexRules: unknown;
    overrideTranslationRegexRules: unknown;
    rejectCounterLike: boolean;
    substitutePlaintextBeforeTranslationRules: unknown;
    maxRetries: number;
    retryBaseMs: number;
    retryMaxMs: number;
    capacityRefreshMs: number;
    requestTimeoutMs: number;
    controllerFacades: TranslationManagerControllerFacades | null;
    schedulerPolicy: TranslationManagerSchedulerPolicy | null;
    requestSequence: number;
    subscriberSequence: number;
    queueSequence: number;
    lineageSequence: number;
    activeCount: number;
    providerCapacity: number;
    providerCapacityVerified: unknown;
    lastCapacitySuccessAt: number;
    publishStatus: () => void;
    isDisposed: () => boolean;
    capacityExpiresAt: number;
    lastCapacityRefreshAt: number;
    lastCapacityRefreshError: string;
    capacityPromise: unknown;
    pumpScheduled: unknown;
    pumpRunning: unknown;
    providerAvailability: unknown;
    providerAvailabilityListeners: Set<unknown>;
    providerAvailabilityProbe: ProviderAvailabilityProbe;
    jobsByKey: Map<unknown, unknown>;
    lineagesByKey: Map<unknown, unknown>;
    activeJobs: Set<unknown>;
    queuedJobs: PendingTranslationQueue;
    subscriberOwnership: SubscriberOwnershipRegistry;
    completed: CompletedTranslationMap;
    completedView: ReadonlyCompletedTranslationMap;
    jobsView: ReadonlyTranslationMap;
    translationDiagnostics: unknown;
    intel: unknown;
    status: unknown;
    registerJob: RuntimeFunction;
    getActiveJobs: RuntimeFunction;
    getActiveSubscribers: RuntimeFunction;
    hasActiveSubscribers: RuntimeFunction;
    getReservedPriorityLaneSnapshot: RuntimeFunction;
    refreshCapacityIfNeeded: RuntimeFunction;
    getEnabledReservedPriorityLanes: RuntimeFunction;
    request: RuntimeFunction;
    requestBatch: RuntimeFunction;
    lookup: RuntimeFunction;
    cancelByRecordId: RuntimeFunction;
    setPriorityByRecordId: RuntimeFunction;
    storeCompletedTranslation: RuntimeFunction;
    storeCompletedTranslations: RuntimeFunction;
    forgetCompletedTranslation: RuntimeFunction;
    shouldSkip: RuntimeFunction;
    describeSkip: RuntimeFunction;
    describeEligibility: RuntimeFunction;
    shouldIgnoreTranslation: RuntimeFunction;
    describeIgnoreTranslationRegex: RuntimeFunction;
    describeOverrideTranslationRegex: RuntimeFunction;
    getStats: RuntimeFunction;
    createCompatibilityCache: RuntimeFunction;
    getProviderAvailabilitySnapshot: RuntimeFunction;
    recordProviderAvailability: RuntimeFunction;
    subscribeProviderAvailability: RuntimeFunction;
}
export interface TranslationManagerService {
    request: TranslationManagerRequestsController['request'];
    requestBatch: TranslationManagerRequestsController['requestBatch'];
    lookup: RuntimeFunction;
    cancelByRecordId: RuntimeFunction;
    setPriorityByRecordId: RuntimeFunction;
    storeCompletedTranslation: RuntimeFunction;
    storeCompletedTranslations: RuntimeFunction;
    forgetCompletedTranslation: RuntimeFunction;
    shouldSkip: RuntimeFunction;
    describeSkip: RuntimeFunction;
    describeEligibility: RuntimeFunction;
    shouldIgnoreTranslation: RuntimeFunction;
    describeIgnoreTranslationRegex: RuntimeFunction;
    describeOverrideTranslationRegex: RuntimeFunction;
    completed: ReadonlyCompletedTranslationMap;
    jobs: ReadonlyTranslationMap;
    isCacheOnlyProvider: boolean;
    providerKind: string;
    providerCapabilities: TranslationProviderCapabilitiesCandidate;
    getStats: RuntimeFunction;
    createCompatibilityCache: RuntimeFunction;
    refreshCapacity: RuntimeFunction;
    getProviderAvailabilitySnapshot: RuntimeFunction;
    subscribeProviderAvailability: RuntimeFunction;
    dispose(): TranslationServiceDisposalReceipt;
}
export interface TranslationManager {
    translationService: TranslationManagerService;
    translationCache: TranslationManagerCompatibilityCache;
}
export interface TranslationManagerModule {
    createTranslationManager(options?: unknown): TranslationManager;
    createTranslationService(options?: unknown): TranslationManagerService;
    compileSubstitutePlaintextBeforeTranslationRules: TranslationManagerCacheModule['compileSubstitutePlaintextBeforeTranslationRules'];
    deriveCacheKeyAliases: TranslationManagerCacheModule['deriveCacheKeyAliases'];
    normalizeCacheKey: TranslationManagerCacheModule['normalizeCacheKey'];
}
interface TranslationManagerControllerModule<Controller> {
    create(scope?: unknown): Controller;
}
type TranslationManagerControllerModules = {
    readonly [Controller in TranslationManagerControllerKey]: TranslationManagerControllerModule<TranslationManagerControllersByKey[Controller]>;
};
export function createTranslationManagerModuleFromDependencies(dependencies: unknown, runtimeScope: object): TranslationManagerModule {
    const { constants, common, cache, regexRules, handles, controllerFacadesModule, schedulerPolicyModule, lineagesController, eligibilityController, jobsController, subscribersController, requestHandoffController, requestsController, queueController, runnerController, apiController, diagnostics, intel, status, } = dependencies as TranslationManagerModuleDependencies;
    const runtime = runtimeScope as TranslationManagerRuntimeScopeCandidate;
    const globalScope = runtime;
    const controllers: TranslationManagerControllerModules = {
        lineages: lineagesController,
        eligibility: eligibilityController,
        jobs: jobsController,
        subscribers: subscribersController,
        handoff: requestHandoffController,
        requests: requestsController,
        queue: queueController,
        runner: runnerController,
        api: apiController,
    };
    const shared = runtime.Object.assign({}, constants, common, cache, regexRules, handles) as TranslationManagerSharedModule;
    const serviceConstructionOwners = new WeakMap<object, TranslationServiceLifetimeOwner>();
    const unsettledServiceConstructionOwners = new Set<TranslationServiceLifetimeOwner>();
    function isServiceDisposalSettled(receipt: TranslationServiceDisposalReceipt): boolean {
        return receipt.settlement === 'settled';
    }
    function retryServiceConstructionRollbacks(): void {
        for (const owner of Array.from(unsettledServiceConstructionOwners)) {
            if (!isServiceDisposalSettled(owner.dispose()))
                continue;
            unsettledServiceConstructionOwners.delete(owner);
        }
    }
    function settleOrRetainServiceConstructionOwner(owner: TranslationServiceLifetimeOwner): void {
        if (isServiceDisposalSettled(owner.dispose()))
            unsettledServiceConstructionOwners.delete(owner);
        else
            unsettledServiceConstructionOwners.add(owner);
    }
    function createTranslationService(options: unknown = {}): TranslationManagerService {
        retryServiceConstructionRollbacks();
        const source = options as TranslationManagerOptionsCandidate;
        const logger = shared.bindLogger(source.logger);
        const telemetry = shared.ensureTelemetry(source.telemetry);
        const disk = source.diskCache && typeof source.diskCache === 'object' ? source.diskCache : { enabled: false };
        const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
        const manipulationCandidate = (settings as PropertyBag)['manipulation'];
        const manipulation = manipulationCandidate && typeof manipulationCandidate === 'object' ? manipulationCandidate : {};
        const targetsCandidate = (settings as PropertyBag)['targets'];
        const targets = targetsCandidate && typeof targetsCandidate === 'object' ? targetsCandidate : {};
        const rejectCounterLike = (targets as PropertyBag)['rejectCounterLike'] === true;
        const preview = typeof source.preview === 'function' ? source.preview : shared.defaultPreview;
        const configuredProvider = source.provider as FalsySensitiveValue;
        const provider = truthyOr(configuredProvider, () => shared.createNoneProvider());
        const providerCapabilities = shared.normalizeProviderCapabilities(provider);
        const isCacheOnlyProvider = source.isCacheOnlyProvider === true || (provider as TranslationProviderCandidate).kind === 'none';
        const getCacheEntryLimit = typeof source.getCacheEntryLimit === 'function' ? source.getCacheEntryLimit : () => 0;
        const pruneMapToLimit = typeof source.pruneMapToLimit === 'function' ? source.pruneMapToLimit : shared.noop;
        const ignoreTranslationRegexRules = shared.compileIgnoreTranslationRegexRules(manipulation, logger);
        const overrideTranslationRegexRules = shared.compileOverrideTranslationRegexRules(manipulation, logger);
        const substitutePlaintextBeforeTranslationRules = shared.compileSubstitutePlaintextBeforeTranslationRules(manipulation, logger);
        const deadlineClockOwner = runtime.Date;
        const deadlineNow = Reflect.get(deadlineClockOwner, 'now') as unknown;
        const deadlineScheduler = runtime.setTimeout;
        const deadlineCanceler = runtime.clearTimeout;
        if (typeof deadlineNow !== 'function' ||
            typeof deadlineScheduler !== 'function' ||
            typeof deadlineCanceler !== 'function') {
            throw new runtime.Error('[TranslationService] Subscriber deadline scheduler is unavailable.');
        }
        const subscriberOwnership = createSubscriberOwnershipRegistry({
            createSubscriberHandleLease: shared.createSubscriberHandleLease,
            settleSubscriberHandleLease: shared.settleSubscriberHandleLease,
            createAbortError: shared.createAbortError,
            normalizeRecordKey(value: unknown): string {
                const convertString = runtime.String;
                return convertString((value as FalsySensitiveValue) ? value : '');
            },
            now(): unknown {
                return Reflect.apply(deadlineNow, deadlineClockOwner, []);
            },
            scheduleDeadline(operation: () => void, delayMs: number): unknown {
                return Reflect.apply(deadlineScheduler, globalScope, [operation, delayMs]);
            },
            cancelDeadline(handle: unknown): unknown {
                return Reflect.apply(deadlineCanceler, globalScope, [handle]);
            },
            reportSecondaryError(error: unknown, context: string): void {
                try {
                    logger.warn(`[TranslationService] ${context}`, error);
                }
                catch {
                }
            },
        });
        const jobsByKey = new runtime.Map();
        const completed = shared.createCompletedTranslationMap((key: unknown) => {
            const normalized = shared.normalizeCacheKey(key);
            const outcome = shared.findIgnoredTranslationRegexMatch(normalized, ignoreTranslationRegexRules);
            if (outcome.status === 'failed') {
                if (outcome.cause instanceof Error)
                    throw outcome.cause;
                throw new Error(`Translation regex matching failed: ${outcome.reason}`);
            }
            return outcome.status === 'matched';
        });
        const completedView = completed.readonlyView;
        const jobsView = shared.createReadonlyTranslationMap(jobsByKey, (job: unknown, routeKey: unknown): object => {
            if (!job || (typeof job !== 'object' && typeof job !== 'function')) {
                throw new TypeError('[TranslationService] An ongoing translation route must own a job object.');
            }
            const candidate = job as OngoingTranslationJobCandidate;
            return Object.freeze({
                id: candidate.id,
                key: routeKey,
                status: candidate.status,
                createdAt: candidate.createdAt,
                queuedAt: candidate.queuedAt,
                queueSeq: candidate.queueSeq,
                effectivePriority: candidate.effectivePriority,
                stream: candidate.stream === true,
                hook: candidate.hook,
                source: candidate.source,
                lineageId: candidate.lineageId,
                lineageSequence: candidate.lineageSequence,
            });
        });
        const scope = runtime.Object.assign({}, shared, {
            globalScope,
            logger,
            telemetry,
            disk,
            settings,
            preview,
            provider,
            providerCapabilities,
            isCacheOnlyProvider,
            getCacheEntryLimit,
            pruneMapToLimit,
            ignoreTranslationRegexRules,
            overrideTranslationRegexRules,
            rejectCounterLike,
            substitutePlaintextBeforeTranslationRules,
            maxRetries: runtime.Math.max(0, runtime.Math.floor(shared.getPositiveSetting(settings, ['maxRetries', 'max_retries'], constants.DEFAULT_MAX_RETRIES))),
            retryBaseMs: runtime.Math.floor(shared.getPositiveSetting(settings, ['retryBaseMs', 'retry_base_ms'], constants.DEFAULT_RETRY_BASE_MS)),
            retryMaxMs: runtime.Math.floor(shared.getPositiveSetting(settings, ['retryMaxMs', 'retry_max_ms'], constants.DEFAULT_RETRY_MAX_MS)),
            capacityRefreshMs: runtime.Math.floor(shared.getPositiveSetting(settings, ['capacityRefreshMs', 'capacity_refresh_ms'], constants.DEFAULT_CAPACITY_REFRESH_MS)),
            requestTimeoutMs: runtime.Math.floor(shared.getPositiveSetting(settings, ['requestTimeoutMs', 'request_timeout_ms'], constants.DEFAULT_REQUEST_TIMEOUT_MS)),
            controllerFacades: null,
            schedulerPolicy: null,
            requestSequence: 0,
            subscriberSequence: 0,
            queueSequence: 0,
            lineageSequence: 0,
            activeCount: 0,
            providerCapacity: 1,
            providerCapacityVerified: false,
            lastCapacitySuccessAt: 0,
            publishStatus: () => undefined,
            isDisposed: () => serviceDisposed,
            capacityExpiresAt: 0,
            lastCapacityRefreshAt: 0,
            lastCapacityRefreshError: '',
            capacityPromise: null,
            pumpScheduled: false,
            pumpRunning: false,
            providerAvailability: {
                state: 'unknown',
                unavailableObserved: false,
                changedAt: 0,
                lastReason: '',
                lastMessage: '',
                sequence: 0,
            },
            providerAvailabilityListeners: new runtime.Set(),
            providerAvailabilityProbe: {
                timerId: null,
                promise: null,
                startedAt: null,
                running: false,
                attempts: 0,
                lastDelayMs: 0,
            },
            jobsByKey,
            jobsView,
            lineagesByKey: new runtime.Map(),
            activeJobs: new runtime.Set(),
            queuedJobs: createPendingTranslationQueue(),
            subscriberOwnership,
            completed,
            completedView,
            translationDiagnostics: null,
            status: null,
        }) as TranslationManagerServiceScope;
        const instances: Partial<TranslationManagerControllersByKey> = {};
        function getController<Controller extends TranslationManagerControllerKey>(key: Controller): TranslationManagerControllersByKey[Controller] {
            const existing = instances[key];
            if (!existing) {
                const created = controllers[key].create(scope);
                instances[key] = created;
                return created;
            }
            return existing;
        }
        function callController<Method extends TranslationManagerControllerMethodName>(methodName: Method, ...args: TranslationManagerControllerMethodParameters<Method>): TranslationManagerControllerMethodReturn<Method> {
            const routedMethodName: string = methodName;
            const key = getTranslationManagerControllerRoute(routedMethodName);
            if (!key) {
                throw new runtime.Error('[TranslationService] Missing controller method: ' + methodName);
            }
            const controller = getController(key);
            const method = (controller as unknown as Record<Method, TranslationManagerControllerMethod<Method>>)[methodName];
            if (typeof method !== 'function') {
                throw new runtime.Error('[TranslationService] Missing controller method: ' + methodName);
            }
            return Reflect.apply(method, undefined, args) as TranslationManagerControllerMethodReturn<Method>;
        }
        scope.controllerFacades = controllerFacadesModule.create({ callController });
        runtime.Object.keys(TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST).forEach((methodName) => {
            const routedMethod = methodName as TranslationManagerControllerMethodName;
            scope[routedMethod] = (...args: TranslationManagerControllerMethodParameters<typeof routedMethod>) => callController(routedMethod, ...args);
        });
        scope.schedulerPolicy = schedulerPolicyModule.createSchedulerPolicy({
            settings,
            clampPriority: shared.clampPriority,
            getProviderCapacity: () => (scope.providerCapacityVerified === true ? scope.providerCapacity : 1),
            getActiveCount: () => scope.activeCount,
            getJobs: () => getController('runner').getRunningJobs(),
            getQueuedJobs: () => scope.queuedJobs,
            getActiveSubscribers: (job: unknown) => scope.getActiveSubscribers(job),
            hasActiveSubscribers: (job: unknown) => scope.hasActiveSubscribers(job),
        });
        scope.getProviderAvailabilitySnapshot = getProviderAvailabilitySnapshot;
        scope.recordProviderAvailability = recordProviderAvailability;
        scope.subscribeProviderAvailability = subscribeProviderAvailability;
        const statusPublicationLifecycle: {
            owner: TranslationStatusLifecycleOwner | null;
        } = { owner: null };
        const claimTranslationStatusLifecycleOwner = (owner: unknown): void => {
            if (statusPublicationLifecycle.owner !== null) {
                throw new runtime.Error('[TranslationService] Translation Status lifecycle owner was claimed twice.');
            }
            if (!owner || typeof owner !== 'object') {
                throw new runtime.Error('[TranslationService] Translation Status lifecycle owner is unavailable.');
            }
            const candidate = owner as TranslationStatusLifecycleOwner;
            const activate = candidate.activate;
            const deactivate = candidate.deactivate;
            if (typeof activate !== 'function' || typeof deactivate !== 'function') {
                throw new runtime.Error('[TranslationService] Translation Status lifecycle owner is incomplete.');
            }
            statusPublicationLifecycle.owner = {
                activate: () => Reflect.apply(activate, owner, []),
                deactivate: () => Reflect.apply(deactivate, owner, []),
            };
        };
        scope.translationDiagnostics = diagnostics.createTranslationDiagnostics();
        const installedTranslationDiagnostics = scope.translationDiagnostics as TranslationDiagnosticsPort;
        scope.intel = intel.createTranslationIntel({
            getActiveSubscribers: (job: unknown) => scope.getActiveSubscribers(job),
            getState: () => ({
                providerCapacity: scope.providerCapacity,
                jobs: scope.getActiveJobs(),
                queuedJobs: scope.queuedJobs.snapshot(),
                completedSize: scope.completed.size,
            }),
        });
        scope.status = status.createTranslationStatus({
            globalScope,
            provider,
            isCacheOnlyProvider,
            deferPublication: true,
            claimLifecycleOwner: claimTranslationStatusLifecycleOwner,
            claimPublisher: (publish: () => void) => {
                scope.publishStatus = publish;
            },
            getState: () => ({
                activeCount: scope.activeCount,
                providerCapacity: scope.providerCapacity,
                queued: scope.queuedJobs.length,
                refreshing: !!scope.capacityPromise,
                checkedAt: scope.lastCapacityRefreshAt,
                lastSuccessAt: scope.lastCapacitySuccessAt,
                expiresAt: scope.capacityExpiresAt,
                unavailable: (scope.providerAvailability as ProviderAvailabilityState).state === 'unavailable',
                availabilityMessage: (scope.providerAvailability as ProviderAvailabilityState).lastMessage,
                availabilityReason: (scope.providerAvailability as ProviderAvailabilityState).lastReason,
                priorityLane: scope.providerCapacityVerified === true &&
                    (scope.getEnabledReservedPriorityLanes() as {
                        name: string;
                    }[]).some((lane) => lane.name === 'priority-1000'),
            }),
            getActivityState: (recordIdsValue: unknown) => {
                const recordIds = new runtime.Set<string>();
                if (runtime.Array.isArray(recordIdsValue)) {
                    for (const value of recordIdsValue) {
                        if (typeof value === 'string' && value)
                            recordIds.add(value);
                    }
                }
                let queued = 0;
                let running = 0;
                const activeJobs = scope.getActiveJobs() as unknown[];
                for (const job of activeJobs) {
                    const candidate = job && typeof job === 'object' ? (job as PropertyBag) : null;
                    const status = candidate?.['status'];
                    if (status !== 'queued' && status !== 'running')
                        continue;
                    if (recordIds.size > 0) {
                        const subscribers = scope.getActiveSubscribers(job) as readonly unknown[];
                        let relevant = false;
                        for (const subscriber of subscribers) {
                            const source = subscriber && typeof subscriber === 'object' ? (subscriber as PropertyBag) : null;
                            const recordId = source?.['recordId'];
                            if (typeof recordId !== 'string' || !recordIds.has(recordId))
                                continue;
                            relevant = true;
                            break;
                        }
                        if (!relevant)
                            continue;
                    }
                    if (status === 'queued')
                        queued += 1;
                    else
                        running += 1;
                }
                return {
                    pumpRunning: queued > 0 && scope.pumpRunning === true,
                    pumpScheduled: queued > 0 && scope.pumpScheduled === true,
                    queued,
                    revision: scope.queueSequence,
                    running,
                };
            },
            getDiagnosticsState: () => ({
                providerCapacityVerified: scope.providerCapacityVerified === true,
                capacityExpiresAt: scope.capacityExpiresAt,
                capacityRefreshMs: scope.capacityRefreshMs,
                lastCapacityRefreshAt: scope.lastCapacityRefreshAt,
                lastCapacityRefreshError: scope.lastCapacityRefreshError,
                capacityRefreshing: !!scope.capacityPromise,
                pumpScheduled: scope.pumpScheduled,
                pumpRunning: scope.pumpRunning,
                completedSize: scope.completed.size,
            }),
            observeDiagnostics: (factsFactory: () => unknown) => {
                installedTranslationDiagnostics.observeStatusLazy(factsFactory);
            },
        });
        const ownedTranslationStatusLifecycleCandidate = statusPublicationLifecycle.owner;
        if (ownedTranslationStatusLifecycleCandidate === null) {
            throw new runtime.Error('[TranslationService] Translation Status did not claim its publication owner.');
        }
        const ownedTranslationStatusLifecycle: TranslationStatusLifecycleOwner = ownedTranslationStatusLifecycleCandidate;
        let preparingProbeTimer: ProviderAvailabilityTimerJournal | null = null;
        let activeProbeTimer: ProviderAvailabilityTimerJournal | null = null;
        let activeProbeRun: ProviderAvailabilityRunJournal | null = null;
        const cleanupPendingProbeTimers = new Set<ProviderAvailabilityTimerJournal>();
        let serviceDisposed = false;
        let disposalInProgress = false;
        let diagnosticsDisposalSettled = false;
        let statusPublicationDisposalSettled = false;
        let settledDisposalReceipt: TranslationServiceDisposalReceipt | null = null;
        function isProviderAvailabilityConfigured(): boolean {
            if (!provider)
                return false;
            if (providerCapabilities.tracksAvailability !== true)
                return false;
            return !isCacheOnlyProvider;
        }
        function isProviderAvailabilityTracked(): boolean {
            if (!isProviderAvailabilityConfigured())
                return false;
            try {
                return typeof (provider as TranslationProviderCandidate).getRuntimeStatus === 'function';
            }
            catch {
                return true;
            }
        }
        function monitorsIdleProvider(): boolean {
            return ((provider as TranslationProviderCandidate).kind === 'llamacpp' ||
                (provider as TranslationProviderCandidate).kind === 'lmstudio');
        }
        function initializeProviderAvailabilityProbe(): boolean {
            if (!isProviderAvailabilityConfigured())
                return false;
            const evaluation = recordProviderAvailability('startup-status');
            if (evaluation?.tracked !== true)
                return false;
            if (evaluation.state === 'available')
                return monitorsIdleProvider() && startProviderAvailabilityProbe('startup');
            if (evaluation.state === 'unknown') {
                const started = startProviderAvailabilityProbe('startup');
                if (started)
                    flushDeferredProbeTimer();
                return started;
            }
            return activeProbeTimer !== null || activeProbeRun !== null;
        }
        function getProviderStatusForAvailability(): ProviderAvailabilityStatusSample {
            const providerCandidate = provider as TranslationProviderCandidate;
            if (!isProviderAvailabilityConfigured())
                return { tracked: false, status: null };
            try {
                const getRuntimeStatus = providerCandidate.getRuntimeStatus;
                if (typeof getRuntimeStatus !== 'function')
                    return { tracked: false, status: null };
                const status = captureTranslationProviderRuntimeStatus(intrinsicReflectApply(getRuntimeStatus, provider, []));
                return {
                    tracked: true,
                    status,
                };
            }
            catch {
                return { tracked: true, status: null };
            }
        }
        function evaluateProviderAvailability(reason: unknown, classification: CancellationClassification): ProviderAvailabilityEvaluation {
            const convertReason = runtime.String;
            const statusSample = getProviderStatusForAvailability();
            const tracked = statusSample.tracked;
            const status = statusSample.status;
            if (!tracked) {
                return {
                    tracked: false,
                    state: 'ignored',
                    available: true,
                    reason: convertReason(truthyOr(reason, () => '')),
                    message: '',
                    status,
                    retryOnProviderRestored: false,
                };
            }
            const errorMessage = formatProviderAvailabilityError(classification);
            const availabilityFailure = captureTranslationProviderAvailabilityFailure(classification.error);
            if (availabilityFailure) {
                return {
                    tracked: true,
                    state: 'unavailable',
                    available: false,
                    reason: convertReason(truthyOr(reason, () => availabilityFailure.code)),
                    message: availabilityFailure.message || 'Translation provider is unavailable.',
                    status,
                    retryOnProviderRestored: true,
                };
            }
            if (status?.state === 'available' && providerStatusHasRequiredCapacity(status)) {
                return {
                    tracked: true,
                    state: 'available',
                    available: true,
                    reason: convertReason(truthyOr(reason, () => 'provider-ready')),
                    message: '',
                    status,
                    retryOnProviderRestored: false,
                };
            }
            if (status?.state === 'unavailable') {
                return {
                    tracked: true,
                    state: 'unavailable',
                    available: false,
                    reason: convertReason(truthyOr(reason, () => 'provider-unavailable')),
                    message: status.message || 'Translation provider is unavailable.',
                    status,
                    retryOnProviderRestored: true,
                };
            }
            return {
                tracked: true,
                state: 'unknown',
                available: false,
                reason: convertReason(truthyOr(reason, () => '')),
                message: errorMessage,
                status,
                retryOnProviderRestored: false,
            };
        }
        function providerStatusHasRequiredCapacity(status: Readonly<TranslationProviderRuntimeStatus>): boolean {
            const statusCapacity = status.capacity;
            const hasCapacity = statusCapacity > 0;
            const capacityReady = providerCapabilities.requiresVerifiedCapacity !== true ||
                (scope.providerCapacityVerified === true && status.capacityVerified);
            return hasCapacity && capacityReady;
        }
        function formatProviderAvailabilityError(classification: CancellationClassification): string {
            return classification.message;
        }
        function annotateProviderAvailabilityError(error: unknown, evaluation: ProviderAvailabilityEvaluation | null): unknown {
            if (!error)
                return error;
            if (typeof error !== 'object')
                return error;
            if (!evaluation)
                return error;
            if (evaluation.retryOnProviderRestored !== true)
                return error;
            const errorCandidate = error as TranslationAvailabilityErrorCandidate;
            try {
                errorCandidate.providerAvailability = 'unavailable';
            }
            catch {
            }
            try {
                errorCandidate.providerAvailabilityReason = truthyOr(evaluation.reason, () => '');
            }
            catch {
            }
            try {
                errorCandidate.providerAvailabilityMessage = truthyOr(evaluation.message, () => '');
            }
            catch {
            }
            try {
                errorCandidate.retryOnProviderRestored = true;
            }
            catch {
            }
            return error;
        }
        function recordProviderAvailability(reason: unknown = '', error: unknown = null, suppliedClassification: unknown = null): ProviderAvailabilityEvaluation | null {
            const canonicalClassification = shared.classifyCancellation(error);
            const classification = suppliedClassification === canonicalClassification
                ? (suppliedClassification as CancellationClassification)
                : canonicalClassification;
            const evaluation = evaluateProviderAvailability(reason, classification);
            if (!evaluation.tracked || evaluation.state === 'unknown')
                return evaluation;
            const current = scope.providerAvailability as ProviderAvailabilityState;
            const previousState = current.state;
            const changed = previousState !== evaluation.state;
            const preparedChangedAt = changed ? runtime.Date.now() : current.changedAt;
            const eventType = evaluation.state === 'unavailable' && changed
                ? 'provider.availability_lost'
                : evaluation.state === 'available' &&
                    changed &&
                    previousState === 'unavailable' &&
                    current.unavailableObserved === true
                    ? 'provider.availability_restored'
                    : null;
            const preparedEvent = eventType === null
                ? null
                : prepareProviderAvailabilityEvent(eventType, evaluation, current.sequence + 1);
            if (evaluation.state === 'unavailable') {
                if (!startProviderAvailabilityProbe(truthyOr(evaluation.reason, () => reason), true)) {
                    return evaluation;
                }
            }
            else if (evaluation.state === 'available' &&
                !monitorsIdleProvider() &&
                !stopProviderAvailabilityProbe()) {
                return evaluation;
            }
            current.state = evaluation.state;
            current.changedAt = preparedChangedAt;
            current.lastReason = truthyOr(evaluation.reason, () => '');
            current.lastMessage = truthyOr(evaluation.message, () => '');
            if (evaluation.state === 'unavailable') {
                scope.capacityExpiresAt = 0;
                scope.providerCapacityVerified = false;
            }
            try {
                scope.publishStatus();
            }
            catch {
            }
            if (preparedEvent !== null)
                current.sequence = preparedEvent.seq;
            annotateProviderAvailabilityError(classification.error, evaluation);
            if (evaluation.state === 'unavailable') {
                if (changed) {
                    current.unavailableObserved = true;
                }
                flushDeferredProbeTimer();
                if (preparedEvent !== null)
                    publishProviderAvailabilityEvent(preparedEvent);
                return evaluation;
            }
            if (preparedEvent !== null)
                publishProviderAvailabilityEvent(preparedEvent);
            return evaluation;
        }
        function startProviderAvailabilityProbe(reason: unknown = '', allowAvailablePredecessor = false): boolean {
            if (serviceDisposed)
                return false;
            if (!isProviderAvailabilityTracked())
                return false;
            const availability = scope.providerAvailability as FalsySensitiveValue;
            const current = truthyOr(availability, () => ({})) as ProviderAvailabilityState;
            if (current.state === 'available' && !allowAvailablePredecessor && !monitorsIdleProvider())
                return false;
            const probe = scope.providerAvailabilityProbe;
            if (activeProbeTimer !== null || activeProbeRun !== null)
                return true;
            if (preparingProbeTimer !== null || cleanupPendingProbeTimers.size > 0)
                return false;
            const starting = probe.startedAt === null || probe.startedAt === undefined;
            const startedAt = starting ? runtime.Date.now() : probe.startedAt;
            const attempts = starting ? 0 : (probe.attempts as number);
            return scheduleProviderAvailabilityProbe({
                allowAvailablePredecessor,
                announceStart: starting,
                attempts,
                reason,
                startedAt,
            });
        }
        function stopProviderAvailabilityProbe(): boolean {
            const probe = scope.providerAvailabilityProbe;
            if (preparingProbeTimer !== null)
                return false;
            const timer = activeProbeTimer;
            if (timer !== null) {
                try {
                    Reflect.apply(deadlineCanceler as RuntimeBindableFunction, globalScope, [timer.handle]);
                }
                catch {
                    return false;
                }
                timer.phase = 'settled';
                activeProbeTimer = null;
                probe.timerId = null;
            }
            if (activeProbeRun !== null)
                return true;
            probe.startedAt = null;
            probe.running = false;
            probe.attempts = 0;
            probe.lastDelayMs = 0;
            return true;
        }
        function scheduleProviderAvailabilityProbe(options: {
            readonly allowAvailablePredecessor: boolean;
            readonly announceStart: boolean;
            readonly attempts: number;
            readonly reason: unknown;
            readonly startedAt: unknown;
        } = {
            allowAvailablePredecessor: false,
            announceStart: false,
            attempts: scope.providerAvailabilityProbe.attempts as number,
            reason: '',
            startedAt: scope.providerAvailabilityProbe.startedAt,
        }): boolean {
            const probe = scope.providerAvailabilityProbe;
            if (serviceDisposed ||
                activeProbeTimer !== null ||
                activeProbeRun !== null ||
                preparingProbeTimer !== null ||
                cleanupPendingProbeTimers.size > 0 ||
                !isProviderAvailabilityTracked()) {
                return false;
            }
            const availability = scope.providerAvailability as FalsySensitiveValue;
            if (availability &&
                (scope.providerAvailability as ProviderAvailabilityState).state === 'available' &&
                !options.allowAvailablePredecessor &&
                !monitorsIdleProvider()) {
                return false;
            }
            let delayMs: number;
            try {
                delayMs =
                    monitorsIdleProvider() &&
                        (scope.providerAvailability as ProviderAvailabilityState).state === 'available'
                        ? scope.capacityRefreshMs
                        : getProviderAvailabilityProbeDelayMs(options.startedAt);
            }
            catch (error) {
                reportProviderAvailabilityOwnershipFailure('probe delay setup failed.', error);
                return false;
            }
            const journal: ProviderAvailabilityTimerJournal = {
                attempts: options.attempts,
                delayMs,
                fired: false,
                handle: null,
                phase: 'preparing',
                reason: options.reason,
                startedAt: options.startedAt,
            };
            preparingProbeTimer = journal;
            try {
                journal.handle = Reflect.apply(deadlineScheduler as RuntimeBindableFunction, globalScope, [
                    () => {
                        handleProviderAvailabilityTimer(journal);
                    },
                    delayMs,
                ]);
            }
            catch (error) {
                journal.phase = 'settled';
                preparingProbeTimer = null;
                reportProviderAvailabilityOwnershipFailure('probe timer setup failed.', error);
                return false;
            }
            try {
                const handle = journal.handle as TimerHandleCandidate;
                const unref = (journal.handle as FalsySensitiveValue) && handle.unref;
                if (typeof unref === 'function')
                    Reflect.apply(unref, journal.handle, []);
            }
            catch {
            }
            if (options.announceStart) {
                try {
                    installedTranslationDiagnostics.recordLazy('provider.availability_probe.started', () => {
                        const convertReason = runtime.String;
                        return {
                            reason: convertReason(truthyOr(options.reason, () => '')),
                        };
                    });
                }
                catch (error) {
                    reportProviderAvailabilityOwnershipFailure('probe diagnostics observer failed.', error);
                }
            }
            if (journal.phase !== 'preparing' || preparingProbeTimer !== journal)
                return false;
            preparingProbeTimer = null;
            activeProbeTimer = journal;
            journal.phase = 'committed';
            probe.timerId = journal.handle;
            probe.startedAt = journal.startedAt;
            probe.attempts = journal.attempts;
            probe.lastDelayMs = journal.delayMs;
            return true;
        }
        function handleProviderAvailabilityTimer(journal: ProviderAvailabilityTimerJournal): void {
            journal.fired = true;
            if (journal.phase === 'preparing')
                return;
            if (journal.phase === 'cleanup-pending') {
                journal.phase = 'settled';
                cleanupPendingProbeTimers.delete(journal);
                return;
            }
            if (journal.phase !== 'committed' || activeProbeTimer !== journal)
                return;
            if (serviceDisposed) {
                journal.phase = 'settled';
                activeProbeTimer = null;
                const probe = scope.providerAvailabilityProbe;
                probe.timerId = null;
                probe.startedAt = null;
                probe.attempts = 0;
                probe.lastDelayMs = 0;
                return;
            }
            runProviderAvailabilityProbe(journal);
        }
        function flushDeferredProbeTimer(): void {
            const timer = activeProbeTimer;
            if (timer !== null && timer.fired && timer.phase === 'committed') {
                runProviderAvailabilityProbe(timer);
            }
        }
        function getProviderAvailabilityProbeDelayMs(candidateStartedAt: unknown): number {
            const convertStartedAt = runtime.Number;
            const numericStartedAt = convertStartedAt(candidateStartedAt);
            const startedAt = runtime.Number.isFinite(numericStartedAt) ? numericStartedAt : runtime.Date.now();
            const elapsedMs = runtime.Math.max(0, runtime.Date.now() - startedAt);
            if (elapsedMs >= 10 * 60 * 1000)
                return 10000;
            if (elapsedMs >= 60 * 1000)
                return 5000;
            return 2000;
        }
        function runProviderAvailabilityProbe(timer: ProviderAvailabilityTimerJournal): void {
            const probe = scope.providerAvailabilityProbe;
            if (activeProbeTimer !== timer || timer.phase !== 'committed')
                return;
            if (!isProviderAvailabilityTracked()) {
                timer.phase = 'settled';
                activeProbeTimer = null;
                probe.timerId = null;
                stopProviderAvailabilityProbe();
                return;
            }
            const availability = scope.providerAvailability as FalsySensitiveValue;
            if (availability &&
                (scope.providerAvailability as ProviderAvailabilityState).state === 'available' &&
                !monitorsIdleProvider()) {
                timer.phase = 'settled';
                activeProbeTimer = null;
                probe.timerId = null;
                stopProviderAvailabilityProbe();
                return;
            }
            let resolveTerminal: (value: unknown) => void = () => {
            };
            let rejectTerminal: (reason?: unknown) => void = () => {
            };
            const terminal = new IntrinsicPromise<unknown>((resolve, reject) => {
                resolveTerminal = resolve;
                rejectTerminal = reject;
            });
            const run: ProviderAvailabilityRunJournal = {
                callbacksEnabled: false,
                completionRequested: false,
                innerTerminal: null,
                phase: 'preparing',
                rejectTerminal,
                resolveTerminal,
                setupFailed: false,
                terminal,
                timer,
            };
            Reflect.apply(intrinsicPromiseThen as RuntimeBindableFunction, terminal, [
                () => {
                    settleProviderAvailabilityRun(run);
                },
                (error: unknown) => {
                    if (!run.setupFailed) {
                        reportProviderAvailabilityOwnershipFailure('probe promise terminal failed.', error);
                    }
                    settleProviderAvailabilityRun(run);
                },
            ]);
            timer.phase = 'settled';
            activeProbeTimer = null;
            activeProbeRun = run;
            run.phase = 'committed';
            probe.timerId = null;
            probe.promise = terminal;
            probe.running = true;
            probe.attempts = timer.attempts + 1;
            const refresh = () => {
                if (!run.callbacksEnabled || run.phase !== 'committed' || serviceDisposed)
                    return undefined;
                return scope.refreshCapacityIfNeeded(true);
            };
            const reject = (error: unknown) => {
                if (!run.callbacksEnabled || run.phase !== 'committed' || serviceDisposed)
                    return undefined;
                return recordProviderAvailability('availability-probe-failed', error);
            };
            const finalize = () => {
                if (run.setupFailed || run.phase !== 'committed')
                    return;
                if (!run.callbacksEnabled) {
                    run.completionRequested = true;
                    return;
                }
                run.resolveTerminal(undefined);
            };
            try {
                const promiseOwner = runtime.Promise;
                const resolve = Reflect.get(promiseOwner, 'resolve') as unknown;
                if (typeof resolve !== 'function') {
                    throw new runtime.Error('[TranslationService] Provider availability Promise.resolve is unavailable.');
                }
                let claim: unknown = Reflect.apply(resolve, promiseOwner, []);
                claim = invokeProviderAvailabilityPromiseMethod(claim, 'then', refresh);
                claim = invokeProviderAvailabilityPromiseMethod(claim, 'catch', reject);
                claim = invokeProviderAvailabilityPromiseMethod(claim, 'finally', finalize);
                const innerTerminal = new IntrinsicPromise<unknown>((resolveInner) => {
                    resolveInner(claim);
                });
                run.innerTerminal = innerTerminal;
                run.callbacksEnabled = true;
                Reflect.apply(intrinsicPromiseThen as RuntimeBindableFunction, innerTerminal, [
                    () => {
                        run.resolveTerminal(undefined);
                    },
                    (error: unknown) => {
                        run.rejectTerminal(error);
                    },
                ]);
                if (run.completionRequested)
                    run.resolveTerminal(undefined);
            }
            catch (error) {
                run.callbacksEnabled = false;
                run.innerTerminal = null;
                run.setupFailed = true;
                reportProviderAvailabilityOwnershipFailure('probe promise setup failed.', error);
                run.rejectTerminal(error);
            }
        }
        function invokeProviderAvailabilityPromiseMethod(owner: unknown, methodName: ProviderAvailabilityPromiseStage, callback: RuntimeFunction): unknown {
            if ((!owner || typeof owner !== 'object') && typeof owner !== 'function') {
                throw new runtime.Error(`[TranslationService] Provider availability Promise.${methodName} owner is unavailable.`);
            }
            const method = (owner as Record<string, unknown>)[methodName];
            if (typeof method !== 'function') {
                throw new runtime.Error(`[TranslationService] Provider availability Promise.${methodName} is unavailable.`);
            }
            return Reflect.apply(method, owner, [callback]);
        }
        function settleProviderAvailabilityRun(run: ProviderAvailabilityRunJournal): void {
            if (run.phase !== 'committed' ||
                activeProbeRun !== run ||
                scope.providerAvailabilityProbe.promise !== run.terminal) {
                return;
            }
            run.callbacksEnabled = false;
            run.innerTerminal = null;
            run.phase = 'settled';
            activeProbeRun = null;
            const probe = scope.providerAvailabilityProbe;
            probe.promise = null;
            probe.running = false;
            if ((scope.providerAvailability as ProviderAvailabilityState).state === 'available') {
                probe.startedAt = null;
                probe.attempts = 0;
                probe.lastDelayMs = 0;
                if (!monitorsIdleProvider() || serviceDisposed)
                    return;
            }
            if (serviceDisposed) {
                probe.startedAt = null;
                probe.attempts = 0;
                probe.lastDelayMs = 0;
                return;
            }
            if (scheduleProviderAvailabilityProbe())
                flushDeferredProbeTimer();
        }
        function reportProviderAvailabilityOwnershipFailure(context: string, error: unknown): void {
            try {
                logger.warn(`[TranslationService] ${context}`, error);
            }
            catch {
            }
        }
        function getProviderKind(): string {
            const providerCandidate = provider as TranslationProviderCandidate;
            if ((provider as FalsySensitiveValue) && providerCandidate.kind) {
                const convertKind = runtime.String;
                return convertKind(providerCandidate.kind);
            }
            return '';
        }
        function prepareProviderAvailabilityEvent(type: unknown, evaluation: ProviderAvailabilityEvaluation, sequence: number): ProviderAvailabilityEvent {
            return Object.freeze({
                type,
                at: runtime.Date.now(),
                seq: sequence,
                providerKind: getProviderKind(),
                state: evaluation.state,
                available: evaluation.available === true,
                reason: truthyOr(evaluation.reason, () => ''),
                message: truthyOr(evaluation.message, () => ''),
            });
        }
        function publishProviderAvailabilityEvent(event: ProviderAvailabilityEvent): ProviderAvailabilityEvent {
            const type = event.type;
            try {
                if ((scope.translationDiagnostics as FalsySensitiveValue) &&
                    typeof (scope.translationDiagnostics as TranslationDiagnosticsCandidate).recordLazy === 'function') {
                    (scope.translationDiagnostics as TranslationDiagnosticsCandidate).recordLazy(type, () => Object.freeze(runtime.Object.assign({}, event)));
                }
            }
            catch (error) {
                try {
                    logger.warn('[TranslationService] provider availability diagnostics observer failed.', error);
                }
                catch {
                }
            }
            runtime.Array.from(scope.providerAvailabilityListeners).forEach((listener: unknown) => {
                try {
                    const listenerFunction = listener as RuntimeFunction;
                    listenerFunction(Object.freeze(runtime.Object.assign({}, event)));
                }
                catch (listenerError) {
                    try {
                        logger.warn('[TranslationService] provider availability listener failed.', listenerError);
                    }
                    catch {
                    }
                }
            });
            return event;
        }
        function getProviderAvailabilitySnapshot(): unknown {
            const availability = scope.providerAvailability as FalsySensitiveValue;
            const current = truthyOr(availability, () => ({})) as ProviderAvailabilityState;
            return {
                state: truthyOr(current.state, () => 'unknown'),
                unavailableObserved: current.unavailableObserved === true,
                changedAt: truthyOr(current.changedAt, () => 0),
                lastReason: truthyOr(current.lastReason, () => ''),
                lastMessage: truthyOr(current.lastMessage, () => ''),
                sequence: truthyOr(current.sequence, () => 0),
                tracked: isProviderAvailabilityTracked(),
                probeRunning: activeProbeRun?.phase === 'committed',
                probeAttempts: truthyOr(scope.providerAvailabilityProbe.attempts, () => 0),
                probeStartedAt: truthyOr(scope.providerAvailabilityProbe.startedAt, () => 0),
                probeLastDelayMs: truthyOr(scope.providerAvailabilityProbe.lastDelayMs, () => 0),
                probeScheduled: activeProbeTimer?.phase === 'committed',
            };
        }
        function subscribeProviderAvailability(listener: unknown): RuntimeFunction {
            if (typeof listener !== 'function') {
                return () => {
                };
            }
            scope.providerAvailabilityListeners.add(listener);
            return () => {
                try {
                    scope.providerAvailabilityListeners.delete(listener);
                }
                catch {
                }
            };
        }
        function getProbeDisposalSettlement(): TranslationServiceDisposalSettlement {
            return preparingProbeTimer === null &&
                activeProbeTimer === null &&
                activeProbeRun === null &&
                cleanupPendingProbeTimers.size === 0
                ? 'settled'
                : 'in-progress';
        }
        function createServiceDisposalReceipt(): TranslationServiceDisposalReceipt {
            const probeSettlement = getProbeDisposalSettlement();
            const diagnosticsSettlement = diagnosticsDisposalSettled ? 'settled' : 'in-progress';
            const statusPublicationSettlement = statusPublicationDisposalSettled ? 'settled' : 'in-progress';
            const settlement = probeSettlement === 'settled' &&
                diagnosticsSettlement === 'settled' &&
                statusPublicationSettlement === 'settled'
                ? 'settled'
                : 'in-progress';
            return Object.freeze({
                settlement,
                probe: probeSettlement,
                diagnostics: diagnosticsSettlement,
                statusPublication: statusPublicationSettlement,
            });
        }
        function disposeTranslationService(): TranslationServiceDisposalReceipt {
            if (settledDisposalReceipt !== null)
                return settledDisposalReceipt;
            serviceDisposed = true;
            if (disposalInProgress)
                return createServiceDisposalReceipt();
            disposalInProgress = true;
            try {
                stopProviderAvailabilityProbe();
                if (!diagnosticsDisposalSettled) {
                    try {
                        const disposalResult: unknown = installedTranslationDiagnostics.dispose();
                        diagnosticsDisposalSettled = disposalResult === true;
                    }
                    catch {
                    }
                }
                if (!statusPublicationDisposalSettled) {
                    try {
                        const disposalResult: unknown = ownedTranslationStatusLifecycle.deactivate();
                        statusPublicationDisposalSettled = disposalResult === true;
                    }
                    catch {
                    }
                }
            }
            finally {
                disposalInProgress = false;
            }
            const receipt = createServiceDisposalReceipt();
            if (receipt.settlement === 'settled')
                settledDisposalReceipt = receipt;
            return receipt;
        }
        const lifetimeOwner: TranslationServiceLifetimeOwner = {
            dispose: disposeTranslationService,
        };
        const service: TranslationManagerService = {
            request: scope.request as TranslationManagerRequestsController['request'],
            requestBatch: scope.requestBatch as TranslationManagerRequestsController['requestBatch'],
            lookup: scope.lookup,
            cancelByRecordId: scope.cancelByRecordId,
            setPriorityByRecordId: scope.setPriorityByRecordId,
            storeCompletedTranslation: scope.storeCompletedTranslation,
            storeCompletedTranslations: scope.storeCompletedTranslations,
            forgetCompletedTranslation: scope.forgetCompletedTranslation,
            shouldSkip: scope.shouldSkip,
            describeSkip: scope.describeSkip,
            describeEligibility: scope.describeEligibility,
            shouldIgnoreTranslation: scope.shouldIgnoreTranslation,
            describeIgnoreTranslationRegex: scope.describeIgnoreTranslationRegex,
            describeOverrideTranslationRegex: scope.describeOverrideTranslationRegex,
            completed: scope.completedView,
            jobs: scope.jobsView,
            isCacheOnlyProvider,
            providerKind: getProviderKind(),
            providerCapabilities,
            getStats: scope.getStats,
            createCompatibilityCache: scope.createCompatibilityCache,
            refreshCapacity: () => scope.refreshCapacityIfNeeded(true),
            getProviderAvailabilitySnapshot: scope.getProviderAvailabilitySnapshot,
            subscribeProviderAvailability: scope.subscribeProviderAvailability,
            dispose: disposeTranslationService,
        };
        serviceConstructionOwners.set(service, lifetimeOwner);
        try {
            ownedTranslationStatusLifecycle.activate();
            initializeProviderAvailabilityProbe();
            return service;
        }
        catch (error) {
            settleOrRetainServiceConstructionOwner(lifetimeOwner);
            serviceConstructionOwners.delete(service);
            throw error;
        }
    }
    function createTranslationManager(options: unknown = {}): TranslationManager {
        const source = options as TranslationManagerOptionsCandidate;
        const configuredProvider = source.provider as FalsySensitiveValue;
        const provider = truthyOr(configuredProvider, () => {
            const textProcessor = source.textProcessor as FalsySensitiveValue;
            return textProcessor
                ? shared.createTextProcessorProvider(source.textProcessor, source.isLocalProvider === true)
                : shared.createNoneProvider();
        });
        const translationService = createTranslationService(runtime.Object.assign({}, options, {
            provider,
            isCacheOnlyProvider: source.isCacheOnlyProvider === true || (provider as TranslationProviderCandidate).kind === 'none',
        }));
        let translationCache: TranslationManagerCompatibilityCache;
        try {
            translationCache = translationService.createCompatibilityCache() as TranslationManagerCompatibilityCache;
        }
        catch (error) {
            const constructionOwner = serviceConstructionOwners.get(translationService);
            if (constructionOwner)
                settleOrRetainServiceConstructionOwner(constructionOwner);
            serviceConstructionOwners.delete(translationService);
            throw error;
        }
        return {
            translationService,
            translationCache,
        };
    }
    return {
        createTranslationManager,
        createTranslationService,
        compileSubstitutePlaintextBeforeTranslationRules: shared.compileSubstitutePlaintextBeforeTranslationRules,
        deriveCacheKeyAliases: shared.deriveCacheKeyAliases,
        normalizeCacheKey: shared.normalizeCacheKey,
    };
}
export function createTranslationManagerModule(cancellation: CancellationModule, runtimeScope: object): TranslationManagerModule {
    const apiController = createTranslationManagerApiModule();
    const constants = createTranslationManagerConstantsModule();
    const controllerFacadesModule = createTranslationManagerControllerFacadesModule();
    const eligibilityController = createTranslationManagerEligibilityModule();
    const diagnostics = createTranslationDiagnosticsPortModule(runtimeScope as Record<PropertyKey, unknown>);
    const intel = createTranslationIntelModule();
    const status: TranslationStatusModule = createTranslationStatusModule();
    const common = createTranslationManagerCommonModule(constants);
    const cache = createTranslationManagerCacheModule(common, constants);
    const regexRules = createTranslationManagerRegexRulesModule(common, constants, runtimeScope);
    const handles = createTranslationManagerHandlesModule(common, cancellation);
    const jobsController = createTranslationManagerJobsModule();
    const lineagesController = createTranslationManagerLineagesModule();
    const queueController = createTranslationManagerQueueModule(runtimeScope);
    const requestHandoffController = createTranslationManagerRequestHandoffModule(runtimeScope);
    const requestsController = createTranslationManagerRequestsModule(runtimeScope);
    const runnerController = createTranslationManagerRunnerModule(runtimeScope);
    const schedulerPolicyModule = createTranslationManagerSchedulerPolicyModule(constants, runtimeScope);
    const subscribersController = createTranslationManagerSubscribersModule(runtimeScope);
    return createTranslationManagerModuleFromDependencies({
        constants,
        common,
        cache,
        regexRules,
        handles,
        controllerFacadesModule,
        schedulerPolicyModule,
        lineagesController,
        eligibilityController,
        jobsController,
        subscribersController,
        requestHandoffController,
        requestsController,
        queueController,
        runnerController,
        apiController,
        diagnostics,
        intel,
        status,
    }, runtimeScope);
}
