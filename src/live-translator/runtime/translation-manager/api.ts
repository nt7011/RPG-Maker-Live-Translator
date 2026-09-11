import type { ReadonlyCompletedTranslationMap, ReadonlyTranslationMap } from './cache.js';
import type { TranslationManagerControllerFacades } from './controller-facades.js';
import type { TranslationRequestHandle } from './handles.js';
type RuntimeCallback = (...args: unknown[]) => unknown;
type TranslationRequest = (text: unknown, context?: unknown) => TranslationRequestHandle;
interface SkipDescriptionCandidate {
    readonly reason: unknown;
}
type DescribeSkip = (text: unknown) => SkipDescriptionCandidate;
interface TranslationIntelSummaryCandidate {
    readonly queued: unknown;
    readonly running: unknown;
    readonly jobs: unknown;
    readonly activeSubscribers: unknown;
    readonly streamJobs: unknown;
}
interface TranslationIntelProviderCandidate {
    readonly capacity: unknown;
}
interface TranslationIntelCacheCandidate {
    readonly completed: unknown;
}
interface TranslationIntelSnapshotCandidate {
    readonly summary: TranslationIntelSummaryCandidate;
    readonly provider: TranslationIntelProviderCandidate;
    readonly cache: TranslationIntelCacheCandidate;
}
interface TranslationIntelCandidate {
    readonly getSnapshot: () => TranslationIntelSnapshotCandidate;
}
function requireIntelSnapshotObject(value: unknown, label: string): object {
    if (!value || typeof value !== 'object') {
        throw new TypeError(`[TranslationService] Translation Intel ${label} must be an object.`);
    }
    return value;
}
interface TranslationManagerApiScopeCandidate {
    readonly DEFAULT_PRIORITY: unknown;
    readonly completedView: ReadonlyCompletedTranslationMap;
    readonly controllerFacades: Pick<TranslationManagerControllerFacades, 'eligibility' | 'requests' | 'subscribers'>;
    readonly intel: TranslationIntelCandidate;
    readonly jobsView: ReadonlyTranslationMap;
}
export interface TranslationManagerStats {
    readonly queued: unknown;
    readonly running: unknown;
    readonly capacity: unknown;
    readonly jobs: unknown;
    readonly completed: unknown;
    readonly subscribers: unknown;
    readonly streamJobs: unknown;
}
export interface TranslationManagerCompatibilityCache {
    readonly completed: ReadonlyCompletedTranslationMap;
    readonly ongoing: ReadonlyTranslationMap;
    readonly request: TranslationRequest;
    readonly lookup: RuntimeCallback;
    requestTranslation(text: unknown, context?: unknown): TranslationRequestHandle;
    requestTranslationHandle(text: unknown, context?: unknown): TranslationRequestHandle;
    requestTranslationStream(text: unknown, context?: unknown): TranslationRequestHandle;
    readonly cancelByRecordId: RuntimeCallback;
    readonly setPriorityByRecordId: RuntimeCallback;
    readonly shouldSkip: RuntimeCallback;
    readonly describeSkip: DescribeSkip;
    readonly describeEligibility: RuntimeCallback;
    getSkipReason(text: unknown): unknown;
    readonly shouldIgnoreTranslation: RuntimeCallback;
    readonly describeIgnoreTranslationRegex: RuntimeCallback;
    readonly describeOverrideTranslationRegex: RuntimeCallback;
    readonly storeCompletedTranslation: RuntimeCallback;
    readonly forgetCompletedTranslation: RuntimeCallback;
    performTranslation(text: unknown): TranslationRequestHandle;
    performTranslationStream(text: unknown, context?: unknown): TranslationRequestHandle;
    getStats(): TranslationManagerStats;
}
export interface TranslationManagerApiController {
    getStats(): TranslationManagerStats;
    createCompatibilityCache(): TranslationManagerCompatibilityCache;
}
export interface TranslationManagerApiModule {
    create(scope?: unknown): TranslationManagerApiController;
}
const createTranslationManagerController = function createController(scope: unknown = {}): TranslationManagerApiController {
    const source = scope as TranslationManagerApiScopeCandidate;
    const { DEFAULT_PRIORITY, completedView, controllerFacades, jobsView } = source;
    const { describeIgnoreTranslationRegex, describeOverrideTranslationRegex, describeSkip, describeEligibility, shouldSkip, shouldIgnoreTranslation, storeCompletedTranslation, forgetCompletedTranslation, } = controllerFacades.eligibility;
    const { cancelByRecordId, setPriorityByRecordId } = controllerFacades.subscribers;
    const { lookup, request } = controllerFacades.requests;
    function getStats(): TranslationManagerStats {
        const intelOwner = source.intel;
        const intel = requireIntelSnapshotObject(Reflect.apply(intelOwner.getSnapshot, intelOwner, []), 'snapshot') as TranslationIntelSnapshotCandidate;
        const summary = requireIntelSnapshotObject(intel.summary, 'summary') as TranslationIntelSummaryCandidate;
        const provider = requireIntelSnapshotObject(intel.provider, 'provider') as TranslationIntelProviderCandidate;
        const cache = requireIntelSnapshotObject(intel.cache, 'cache') as TranslationIntelCacheCandidate;
        return {
            queued: summary.queued,
            running: summary.running,
            capacity: provider.capacity,
            jobs: summary.jobs,
            completed: cache.completed,
            subscribers: summary.activeSubscribers,
            streamJobs: summary.streamJobs,
        };
    }
    function createCompatibilityCache(): TranslationManagerCompatibilityCache {
        return {
            completed: completedView,
            ongoing: jobsView,
            request,
            lookup,
            requestTranslation(text: unknown, context: unknown = {}): TranslationRequestHandle {
                return request(text, context);
            },
            requestTranslationHandle(text: unknown, context: unknown = {}): TranslationRequestHandle {
                return request(text, context);
            },
            requestTranslationStream(text: unknown, context: unknown = {}): TranslationRequestHandle {
                return request(text, Object.assign(Object.create(null), context, { stream: true }));
            },
            cancelByRecordId,
            setPriorityByRecordId,
            shouldSkip,
            describeSkip,
            describeEligibility,
            getSkipReason: (text: unknown): unknown => describeSkip(text).reason,
            shouldIgnoreTranslation,
            describeIgnoreTranslationRegex,
            describeOverrideTranslationRegex,
            storeCompletedTranslation,
            forgetCompletedTranslation,
            performTranslation(text: unknown): TranslationRequestHandle {
                return request(text, { priority: DEFAULT_PRIORITY });
            },
            performTranslationStream(text: unknown, context: unknown = {}): TranslationRequestHandle {
                return request(text, Object.assign(Object.create(null), context, { stream: true }));
            },
            getStats,
        };
    }
    return {
        getStats,
        createCompatibilityCache,
    };
};
export function createTranslationManagerApiModule(): TranslationManagerApiModule {
    return { create: createTranslationManagerController };
}
