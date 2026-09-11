type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
interface TranslationIntelJobCandidate extends PropertyBag {
    readonly status?: unknown;
    readonly stream?: unknown;
}
interface TranslationIntelStateCandidate extends PropertyBag {
    readonly completedSize?: unknown;
    readonly jobs?: unknown;
    readonly providerCapacity?: unknown;
    readonly queuedJobs?: unknown;
}
interface TranslationIntelOptionsCandidate extends PropertyBag {
    readonly getActiveSubscribers?: unknown;
    readonly getState?: unknown;
}
export interface TranslationIntelSnapshot {
    readonly cache: Readonly<{
        readonly completed: number;
    }>;
    readonly provider: Readonly<{
        readonly capacity: number;
    }>;
    readonly summary: Readonly<{
        readonly activeSubscribers: number;
        readonly jobs: number;
        readonly queued: number;
        readonly running: number;
        readonly streamJobs: number;
    }>;
}
export interface TranslationIntelApi {
    getSnapshot(): TranslationIntelSnapshot;
}
export interface TranslationIntelModule {
    createTranslationIntel(options?: unknown): TranslationIntelApi;
}
function intelNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}
function activeSubscribers(job: unknown, reader: unknown): unknown[] {
    if (typeof reader !== 'function')
        return [];
    const value = Reflect.apply(reader as RuntimeFunction, undefined, [job]);
    return Array.isArray(value) ? value : [];
}
export function createTranslationIntelModule(): TranslationIntelModule {
    function createTranslationIntel(options: unknown = {}): TranslationIntelApi {
        const source = options as TranslationIntelOptionsCandidate;
        const getState = typeof source.getState === 'function' ? (source.getState as RuntimeFunction) : (): PropertyBag => ({});
        const getActiveSubscribers = source.getActiveSubscribers;
        function getSnapshot(): TranslationIntelSnapshot {
            const stateValue = Reflect.apply(getState, undefined, []);
            const state = (stateValue && typeof stateValue === 'object' ? stateValue : {}) as TranslationIntelStateCandidate;
            const jobs = (Array.isArray(state.jobs) ? state.jobs : []) as TranslationIntelJobCandidate[];
            const queuedJobs = (Array.isArray(state.queuedJobs) ? state.queuedJobs : []).filter((job) => job &&
                (job as TranslationIntelJobCandidate).status === 'queued' &&
                activeSubscribers(job, getActiveSubscribers).length > 0);
            const runningJobs = jobs.filter((job) => job.status === 'running');
            const streamJobs = jobs.filter((job) => job.stream === true && (job.status === 'queued' || job.status === 'running'));
            return {
                summary: {
                    queued: queuedJobs.length,
                    running: runningJobs.length,
                    jobs: jobs.length,
                    activeSubscribers: jobs.reduce((count, job) => count + activeSubscribers(job, getActiveSubscribers).length, 0),
                    streamJobs: streamJobs.length,
                },
                provider: {
                    capacity: intelNumber(state.providerCapacity),
                },
                cache: {
                    completed: intelNumber(state.completedSize),
                },
            };
        }
        return Object.freeze({ getSnapshot });
    }
    return { createTranslationIntel };
}
