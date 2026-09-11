import type { TranslationManagerApiController } from './api.js';
import type { TranslationManagerEligibilityController } from './eligibility.js';
import type { TranslationManagerJobsController } from './jobs.js';
import type { TranslationManagerLineagesController } from './lineages.js';
import type { TranslationManagerQueueController } from './queue.js';
import type { TranslationManagerRequestHandoffController } from './request-handoff.js';
import type { TranslationManagerRequestsController } from './requests.js';
import type { TranslationManagerRunnerController } from './runner.js';
import type { TranslationManagerSubscribersController } from './subscribers.js';
export interface TranslationManagerControllersByKey {
    readonly lineages: TranslationManagerLineagesController;
    readonly eligibility: TranslationManagerEligibilityController;
    readonly jobs: TranslationManagerJobsController;
    readonly subscribers: TranslationManagerSubscribersController;
    readonly handoff: TranslationManagerRequestHandoffController;
    readonly requests: TranslationManagerRequestsController;
    readonly queue: TranslationManagerQueueController;
    readonly runner: TranslationManagerRunnerController;
    readonly api: TranslationManagerApiController;
}
export type TranslationManagerControllerKey = keyof TranslationManagerControllersByKey;
type TranslationManagerControllerMethodNameFor<Controller extends TranslationManagerControllerKey> = Extract<keyof TranslationManagerControllersByKey[Controller], string>;
type TranslationManagerAnyControllerMethodName = {
    [Controller in TranslationManagerControllerKey]: TranslationManagerControllerMethodNameFor<Controller>;
}[TranslationManagerControllerKey];
type TranslationManagerControllerOwnersForMethod<Method extends TranslationManagerAnyControllerMethodName> = {
    [Controller in TranslationManagerControllerKey]: Method extends keyof TranslationManagerControllersByKey[Controller] ? Controller : never;
}[TranslationManagerControllerKey];
type TranslationManagerControllerRouteShape = Readonly<{
    [Method in TranslationManagerAnyControllerMethodName]?: TranslationManagerControllerOwnersForMethod<Method>;
}>;
interface TranslationManagerControllerFacadesContext {
    readonly callController?: TranslationManagerControllerDispatcher | null;
}
export const TRANSLATION_MANAGER_CONTROLLER_KEYS = Object.freeze([
    'lineages',
    'eligibility',
    'jobs',
    'subscribers',
    'handoff',
    'requests',
    'queue',
    'runner',
    'api',
] as const);
function createControllerRouteManifest<const Manifest extends TranslationManagerControllerRouteShape>(manifest: Manifest): Readonly<Manifest> {
    const created: unknown = Object.assign(Object.create(null), manifest);
    return Object.freeze(created as Manifest);
}
export const TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST = createControllerRouteManifest({
    registerJob: 'lineages',
    getRoutedJob: 'lineages',
    commitWithAuthority: 'lineages',
    relinquishJob: 'lineages',
    finishJob: 'lineages',
    forgetJob: 'lineages',
    getActiveJobs: 'lineages',
    describeIgnoreTranslationRegex: 'eligibility',
    describeOverrideTranslationRegex: 'eligibility',
    describeSkip: 'eligibility',
    describeEligibility: 'eligibility',
    shouldSkip: 'eligibility',
    shouldIgnoreTranslation: 'eligibility',
    lookupOverrideTranslationRegex: 'eligibility',
    logTranslationEvent: 'eligibility',
    normalizeRequest: 'eligibility',
    requestContext: 'eligibility',
    storeCompletedTranslation: 'eligibility',
    storeCompletedTranslations: 'eligibility',
    forgetCompletedTranslation: 'eligibility',
    lookupCompleted: 'eligibility',
    finalizeProviderSuccess: 'eligibility',
    prepareJobPolicy: 'jobs',
    commitJobPolicy: 'jobs',
    discardJobPolicy: 'jobs',
    publishJobPolicy: 'jobs',
    applyJobPolicy: 'jobs',
    recomputeJobPriority: 'jobs',
    removeQueuedJob: 'jobs',
    getActiveSubscribers: 'jobs',
    hasActiveSubscribers: 'jobs',
    compareQueuedJobsForDispatch: 'jobs',
    getEnabledReservedPriorityLanes: 'jobs',
    subscriberMatchesReservedLane: 'jobs',
    jobMatchesReservedLane: 'jobs',
    jobMatchesAnyReservedLane: 'jobs',
    countReservedRunningJobs: 'jobs',
    countLaneRunningJobs: 'jobs',
    countLaneQueuedJobs: 'jobs',
    countReservedSlots: 'jobs',
    getNormalDispatchCapacity: 'jobs',
    countNormalRunningJobs: 'jobs',
    hasBlockingReservedLaneWork: 'jobs',
    getReservedLaneDispatchState: 'jobs',
    getNormalDispatchState: 'jobs',
    getQueueDispatchState: 'jobs',
    getReservedPriorityLaneSnapshot: 'jobs',
    settleJobSubscribers: 'subscribers',
    markJobSubscribersRunning: 'subscribers',
    cancelSubscriber: 'subscribers',
    expireSubscriber: 'subscribers',
    setSubscriberPriority: 'subscribers',
    cancelByRecordId: 'subscribers',
    setPriorityByRecordId: 'subscribers',
    handoffProviderRequest: 'handoff',
    lookup: 'requests',
    request: 'requests',
    requestBatch: 'requests',
    refreshCapacityIfNeeded: 'queue',
    schedulePump: 'queue',
    pruneQueuedJobs: 'queue',
    takeNextQueuedJob: 'queue',
    dispatchReservedPriorityLaneJobs: 'queue',
    dispatchNormalJobs: 'queue',
    canDispatchQueuedWork: 'queue',
    pump: 'queue',
    createJobController: 'runner',
    notifyDelta: 'runner',
    startJob: 'runner',
    runProviderWithRetries: 'runner',
    shouldRetry: 'runner',
    computeRetryDelayMs: 'runner',
    waitForRetry: 'runner',
    getStats: 'api',
    createCompatibilityCache: 'api',
} as const satisfies TranslationManagerControllerRouteShape);
export type TranslationManagerControllerMethodName = keyof typeof TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST;
type TranslationManagerControllerForMethod<Method extends TranslationManagerControllerMethodName> = (typeof TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST)[Method];
export type TranslationManagerControllerMethod<Method extends TranslationManagerControllerMethodName> = TranslationManagerControllersByKey[TranslationManagerControllerForMethod<Method>][Method & keyof TranslationManagerControllersByKey[TranslationManagerControllerForMethod<Method>]];
export type TranslationManagerControllerMethodParameters<Method extends TranslationManagerControllerMethodName> = TranslationManagerControllerMethod<Method> extends (...args: infer Parameters) => unknown ? Parameters : never;
export type TranslationManagerControllerMethodReturn<Method extends TranslationManagerControllerMethodName> = TranslationManagerControllerMethod<Method> extends (...args: never[]) => infer Result ? Result : never;
export type TranslationManagerControllerDispatcher = <Method extends TranslationManagerControllerMethodName>(name: Method, ...args: TranslationManagerControllerMethodParameters<Method>) => TranslationManagerControllerMethodReturn<Method>;
export function getTranslationManagerControllerRoute<Method extends TranslationManagerControllerMethodName>(methodName: Method): TranslationManagerControllerForMethod<Method>;
export function getTranslationManagerControllerRoute(methodName: string): TranslationManagerControllerKey | null;
export function getTranslationManagerControllerRoute(methodName: string): TranslationManagerControllerKey | null {
    const routes = TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST as Readonly<Record<string, TranslationManagerControllerKey | undefined>>;
    return routes[methodName] ?? null;
}
type TranslationManagerControllerMethodsFor<Controller extends TranslationManagerControllerKey> = {
    [Method in TranslationManagerControllerMethodName]: (typeof TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST)[Method] extends Controller ? Method : never;
}[TranslationManagerControllerMethodName];
export type TranslationManagerControllerFacades = Readonly<{
    [Controller in TranslationManagerControllerKey]: Readonly<{
        [Method in TranslationManagerControllerMethodsFor<Controller>]: Method extends keyof TranslationManagerControllersByKey[Controller] ? TranslationManagerControllersByKey[Controller][Method] : never;
    }>;
}>;
type TranslationManagerControllerMethodLists = Record<TranslationManagerControllerKey, TranslationManagerControllerMethodName[]>;
function collectControllerMethodLists(): TranslationManagerControllerMethodLists {
    const created: unknown = Object.create(null);
    const methodLists = created as TranslationManagerControllerMethodLists;
    TRANSLATION_MANAGER_CONTROLLER_KEYS.forEach((controller) => {
        methodLists[controller] = [];
    });
    Object.keys(TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST).forEach((name) => {
        const methodName = name as TranslationManagerControllerMethodName;
        const controller = TRANSLATION_MANAGER_CONTROLLER_ROUTE_MANIFEST[methodName];
        methodLists[controller].push(methodName);
    });
    return methodLists;
}
const bindTranslationManagerControllerMethods = function bindControllerMethods<Controller extends TranslationManagerControllerKey>(callController: TranslationManagerControllerDispatcher, names: readonly TranslationManagerControllerMethodsFor<Controller>[]): TranslationManagerControllerFacades[Controller] {
    const created: unknown = Object.create(null);
    const facade = created as Record<PropertyKey, unknown>;
    names.forEach((name) => {
        facade[name] = (...args: TranslationManagerControllerMethodParameters<typeof name>) => callController(name, ...args);
    });
    return Object.freeze(facade) as TranslationManagerControllerFacades[Controller];
};
const createTranslationManagerControllerFacades = function createTranslationManagerControllerFacades(context: unknown = {}) {
    const source = context as TranslationManagerControllerFacadesContext;
    const callController = source.callController;
    if (typeof callController !== 'function') {
        throw new Error('[TranslationService] controller facades require a controller dispatcher.');
    }
    const methodLists = collectControllerMethodLists();
    const created: unknown = {};
    const facades = created as Record<PropertyKey, unknown>;
    TRANSLATION_MANAGER_CONTROLLER_KEYS.forEach((controller) => {
        facades[controller] = bindTranslationManagerControllerMethods<typeof controller>(callController, methodLists[controller]);
    });
    return Object.freeze(facades) as TranslationManagerControllerFacades;
};
export interface TranslationManagerControllerFacadesModule {
    create(context?: unknown): TranslationManagerControllerFacades;
}
export function createTranslationManagerControllerFacadesModule(): TranslationManagerControllerFacadesModule {
    return { create: createTranslationManagerControllerFacades };
}
