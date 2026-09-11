type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
interface RuntimeCollectionCandidate {
    readonly length: unknown;
    filter(callback: RuntimeFunction): RuntimeCollectionCandidate;
    includes(value: unknown): unknown;
    map(callback: RuntimeFunction): RuntimeCollectionCandidate;
    reduce(callback: RuntimeFunction, initialValue: unknown): unknown;
    slice(): unknown;
    some(callback: RuntimeFunction): unknown;
}
interface RuntimeArrayCandidate {
    from(value: unknown): RuntimeCollectionCandidate;
    isArray(value: unknown): unknown;
}
interface RuntimeMathCandidate {
    floor(value: unknown): unknown;
    max(...values: unknown[]): unknown;
    min(...values: unknown[]): unknown;
}
interface RuntimeNumberCandidate {
    (this: unknown, value?: unknown): unknown;
    isFinite(value: unknown): unknown;
}
interface TranslationManagerSchedulerPolicyRuntimeCandidate {
    readonly Array: RuntimeArrayCandidate;
    readonly Boolean: RuntimeFunction;
    readonly Math: RuntimeMathCandidate;
    readonly Number: RuntimeNumberCandidate;
    readonly String: RuntimeFunction;
}
interface TranslationManagerSchedulerConstantsCandidate {
    readonly DEFAULT_RESERVED_PRIORITY_LANES: unknown;
}
interface TranslationManagerSchedulerPolicyOptionsCandidate {
    readonly clampPriority: unknown;
    readonly settings: unknown;
    readonly getProviderCapacity: unknown;
    readonly getActiveCount: unknown;
    readonly getJobs: unknown;
    readonly getQueuedJobs: unknown;
    readonly getActiveSubscribers: unknown;
    readonly hasActiveSubscribers: unknown;
}
interface TranslationManagerSchedulerSettingsCandidate {
    readonly translation: unknown;
}
interface TranslationManagerSchedulerTranslationSettingsCandidate {
    readonly scheduler: unknown;
    readonly reservedPriorityLanes: unknown;
}
interface TranslationManagerSchedulerNestedSettingsCandidate {
    readonly reservedPriorityLanes: unknown;
}
interface TranslationManagerReservedLaneCandidate {
    readonly name: unknown;
    readonly enabledAtCapacity: unknown;
    readonly reservedSlots: unknown;
    readonly maxConcurrent: unknown;
    readonly priority: unknown;
    readonly hooks: RuntimeCollectionCandidate;
    readonly blocksNormalDispatch: unknown;
}
interface TranslationManagerSchedulerSubscriberContextCandidate {
    readonly hook: unknown;
}
interface TranslationManagerSchedulerSubscriberCandidate {
    readonly active: unknown;
    readonly priority: unknown;
    readonly hook: unknown;
    readonly context: unknown;
}
interface TranslationManagerSchedulerSubscriberProjection {
    readonly active: boolean;
    readonly priority: number;
    readonly hook: unknown;
}
interface TranslationManagerSchedulerJobProjection {
    readonly job: unknown;
    readonly status: unknown;
    readonly effectivePriority: number;
    readonly hook: unknown;
    readonly activeSubscribers: readonly TranslationManagerSchedulerSubscriberProjection[];
}
interface TranslationManagerSchedulerStateSnapshot {
    readonly capacity: number;
    readonly activeCount: number;
    readonly activeLanes: readonly TranslationManagerReservedLaneCandidate[];
    readonly jobs: readonly unknown[];
    readonly queuedJobs: readonly unknown[];
    readonly jobProjections: Map<unknown, TranslationManagerSchedulerJobProjection>;
    readonly laneMatches: Map<unknown, Map<unknown, boolean>>;
}
interface TranslationManagerSchedulerJobCandidate {
    readonly status: unknown;
    readonly hook: unknown;
    readonly effectivePriority: unknown;
    readonly subscribers: unknown;
}
interface TranslationManagerSchedulerSubscriberCollectionCandidate {
    readonly values: RuntimeFunction;
}
interface TrimmableCandidate {
    trim(): unknown;
}
export interface TranslationManagerSchedulerPolicy {
    readonly reservedPriorityLanePolicies: unknown;
    getEnabledReservedPriorityLanes(): unknown;
    subscriberMatchesReservedLane(subscriber: unknown, lane: unknown): unknown;
    jobMatchesReservedLane(job: unknown, lane: unknown): unknown;
    jobMatchesAnyReservedLane(job: unknown, enabledLanes: unknown): unknown;
    countReservedRunningJobs(enabledLanes: unknown): unknown;
    countLaneRunningJobs(lane: unknown): unknown;
    countLaneQueuedJobs(lane: unknown): unknown;
    countReservedSlots(enabledLanes: unknown): unknown;
    getNormalDispatchCapacity(enabledLanes: unknown): unknown;
    countNormalRunningJobs(enabledLanes: unknown): unknown;
    hasBlockingReservedLaneWork(enabledLanes: unknown): unknown;
    getReservedLaneDispatchState(lane: unknown): unknown;
    getNormalDispatchState(enabledLanes: unknown): unknown;
    getQueueDispatchState(enabledLanes: unknown): unknown;
    getReservedPriorityLaneSnapshot(): unknown;
}
export interface TranslationManagerSchedulerPolicyModule {
    createSchedulerPolicy(options?: unknown): TranslationManagerSchedulerPolicy;
    createReservedPriorityLanePolicies(settings?: unknown, clampPriority?: RuntimeFunction): unknown;
}
export function createTranslationManagerSchedulerPolicyModule(constants: unknown, runtimeScope: object): TranslationManagerSchedulerPolicyModule {
    const runtime = runtimeScope as TranslationManagerSchedulerPolicyRuntimeCandidate;
    const { DEFAULT_RESERVED_PRIORITY_LANES } = constants as TranslationManagerSchedulerConstantsCandidate;
    function isTruthy(value: unknown): boolean {
        return !!value;
    }
    function createSchedulerPolicy(options: unknown = {}): TranslationManagerSchedulerPolicy {
        const source = options as TranslationManagerSchedulerPolicyOptionsCandidate;
        const clampPriorityCandidate = source.clampPriority;
        const clampPriority = typeof clampPriorityCandidate === 'function'
            ? (clampPriorityCandidate as RuntimeFunction)
            : (value: unknown) => {
                const convertNumber = runtime.Number;
                const numeric = convertNumber(value);
                return isTruthy(numeric) ? numeric : 0;
            };
        const lanes = createReservedPriorityLanePolicies(source.settings, clampPriority) as RuntimeCollectionCandidate;
        const getProviderCapacityCandidate = source.getProviderCapacity;
        const getProviderCapacity = typeof getProviderCapacityCandidate === 'function'
            ? (getProviderCapacityCandidate as RuntimeFunction)
            : () => 1;
        const getActiveCountCandidate = source.getActiveCount;
        const getActiveCount = typeof getActiveCountCandidate === 'function' ? (getActiveCountCandidate as RuntimeFunction) : () => 0;
        const getJobsCandidate = source.getJobs;
        const getJobs = typeof getJobsCandidate === 'function' ? (getJobsCandidate as RuntimeFunction) : () => [];
        const getQueuedJobsCandidate = source.getQueuedJobs;
        const getQueuedJobs = typeof getQueuedJobsCandidate === 'function' ? (getQueuedJobsCandidate as RuntimeFunction) : () => [];
        const getActiveSubscribersCandidate = source.getActiveSubscribers;
        const getActiveSubscribers = typeof getActiveSubscribersCandidate === 'function'
            ? (getActiveSubscribersCandidate as RuntimeFunction)
            : defaultGetActiveSubscribers;
        const hasActiveSubscribersCandidate = source.hasActiveSubscribers;
        const hasActiveSubscribers = typeof hasActiveSubscribersCandidate === 'function'
            ? (hasActiveSubscribersCandidate as RuntimeFunction)
            : (job: unknown) => ((getActiveSubscribers(job) as RuntimeCollectionCandidate).length as number) > 0;
        function getEnabledReservedPriorityLanes(): unknown {
            const capacity = getSafeProviderCapacity(getProviderCapacity());
            return lanes.filter((lane: unknown) => (capacity as number) >=
                ((lane as TranslationManagerReservedLaneCandidate).enabledAtCapacity as number));
        }
        function subscriberMatchesReservedLane(subscriber: unknown, lane: unknown): unknown {
            const subscriberValue = subscriber as FalsySensitiveValue;
            const subscriberSource = subscriber as TranslationManagerSchedulerSubscriberCandidate;
            const laneValue = lane as FalsySensitiveValue;
            const laneSource = lane as TranslationManagerReservedLaneCandidate;
            if (!subscriberValue || !subscriberSource.active || !laneValue)
                return false;
            if ((clampPriority(subscriberSource.priority) as number) < (laneSource.priority as number))
                return false;
            if (!laneSource.hooks.length)
                return true;
            const convertString = runtime.String;
            const directHook = subscriberSource.hook;
            let hookInput = directHook;
            if (!isTruthy(directHook)) {
                const context = subscriberSource.context;
                hookInput = isTruthy(context)
                    ? (subscriberSource.context as TranslationManagerSchedulerSubscriberContextCandidate).hook
                    : '';
            }
            const hook = (convertString(isTruthy(hookInput) ? hookInput : '') as TrimmableCandidate).trim();
            return laneSource.hooks.includes(hook);
        }
        function jobMatchesReservedLane(job: unknown, lane: unknown): unknown {
            const jobValue = job as FalsySensitiveValue;
            const laneValue = lane as FalsySensitiveValue;
            if (!jobValue || !laneValue)
                return false;
            const jobSource = job as TranslationManagerSchedulerJobCandidate;
            const laneSource = lane as TranslationManagerReservedLaneCandidate;
            const activeSubscribers = getActiveSubscribers(job) as RuntimeCollectionCandidate;
            if (activeSubscribers.length) {
                return activeSubscribers.some((subscriber: unknown) => subscriberMatchesReservedLane(subscriber, lane));
            }
            const convertString = runtime.String;
            const jobHook = jobSource.hook;
            const hook = (convertString(isTruthy(jobHook) ? jobHook : '') as TrimmableCandidate).trim();
            return ((clampPriority(jobSource.effectivePriority) as number) >= (laneSource.priority as number) &&
                (!laneSource.hooks.length || laneSource.hooks.includes(hook)));
        }
        function jobMatchesAnyReservedLane(job: unknown, enabledLanes: unknown): unknown {
            const activeLanes = ((enabledLanes as boolean) ||
                getEnabledReservedPriorityLanes()) as RuntimeCollectionCandidate;
            return activeLanes.some((lane: unknown) => jobMatchesReservedLane(job, lane));
        }
        function countReservedRunningJobs(enabledLanes: unknown): unknown {
            const activeLanes = ((enabledLanes as boolean) ||
                getEnabledReservedPriorityLanes()) as RuntimeCollectionCandidate;
            return (getJobs() as RuntimeCollectionCandidate).filter((job: unknown) => {
                const jobValue = job as FalsySensitiveValue;
                return (jobValue &&
                    (job as TranslationManagerSchedulerJobCandidate).status === 'running' &&
                    jobMatchesAnyReservedLane(job, activeLanes));
            }).length;
        }
        function countLaneRunningJobs(lane: unknown): unknown {
            return (getJobs() as RuntimeCollectionCandidate).filter((job: unknown) => {
                const jobValue = job as FalsySensitiveValue;
                return (jobValue &&
                    (job as TranslationManagerSchedulerJobCandidate).status === 'running' &&
                    jobMatchesReservedLane(job, lane));
            }).length;
        }
        function countLaneQueuedJobs(lane: unknown): unknown {
            return runtime.Array.from(getQueuedJobs()).filter((job: unknown) => {
                const jobValue = job as FalsySensitiveValue;
                return (jobValue &&
                    (job as TranslationManagerSchedulerJobCandidate).status === 'queued' &&
                    hasActiveSubscribers(job) &&
                    jobMatchesReservedLane(job, lane));
            }).length;
        }
        function captureSchedulerSnapshot(enabledLanes: unknown, includeQueue = true): TranslationManagerSchedulerStateSnapshot {
            const capacity = getSafeProviderCapacity(getProviderCapacity()) as number;
            const activeCount = getSafeActiveCount(getActiveCount()) as number;
            const selectedLanes = isTruthy(enabledLanes)
                ? runtime.Array.from(enabledLanes)
                : lanes.filter((lane: unknown) => capacity >= ((lane as TranslationManagerReservedLaneCandidate).enabledAtCapacity as number));
            const activeLanes = Object.freeze(runtime.Array.from(selectedLanes) as unknown as TranslationManagerReservedLaneCandidate[]);
            const jobs = Object.freeze(runtime.Array.from(getJobs()) as unknown as unknown[]);
            const queuedJobs = Object.freeze(includeQueue || activeLanes.some((lane) => lane.blocksNormalDispatch === true)
                ? (runtime.Array.from(getQueuedJobs()) as unknown as unknown[])
                : []);
            return Object.freeze({
                capacity,
                activeCount,
                activeLanes,
                jobs,
                queuedJobs,
                jobProjections: new Map<unknown, TranslationManagerSchedulerJobProjection>(),
                laneMatches: new Map<unknown, Map<unknown, boolean>>(),
            });
        }
        function captureHook(value: unknown, context: unknown): unknown {
            let hookInput = value;
            if (!isTruthy(hookInput) && isTruthy(context)) {
                hookInput = (context as TranslationManagerSchedulerSubscriberContextCandidate).hook;
            }
            const convertString = runtime.String;
            return (convertString(isTruthy(hookInput) ? hookInput : '') as TrimmableCandidate).trim();
        }
        function getJobProjection(snapshot: TranslationManagerSchedulerStateSnapshot, job: unknown): TranslationManagerSchedulerJobProjection {
            const existing = snapshot.jobProjections.get(job);
            if (existing !== undefined)
                return existing;
            const jobValue = job as FalsySensitiveValue;
            const jobSource = job as TranslationManagerSchedulerJobCandidate;
            const subscriberValues = jobValue
                ? (runtime.Array.from(getActiveSubscribers(job)) as unknown as readonly unknown[])
                : [];
            const subscribers = subscriberValues.map((subscriber: unknown) => {
                const subscriberValue = subscriber as FalsySensitiveValue;
                const subscriberSource = subscriber as TranslationManagerSchedulerSubscriberCandidate;
                if (!subscriberValue)
                    return Object.freeze({ active: false, priority: 0, hook: '' });
                const active = !!subscriberSource.active;
                if (!active)
                    return Object.freeze({ active, priority: 0, hook: '' });
                return Object.freeze({
                    active,
                    priority: clampPriority(subscriberSource.priority) as number,
                    hook: captureHook(subscriberSource.hook, subscriberSource.context),
                });
            });
            let effectivePriority = 0;
            let hook: unknown = '';
            if (jobValue && subscriberValues.length === 0) {
                effectivePriority = clampPriority(jobSource.effectivePriority) as number;
                hook = captureHook(jobSource.hook, null);
            }
            const projection = Object.freeze({
                job,
                status: jobValue ? jobSource.status : undefined,
                effectivePriority,
                hook,
                activeSubscribers: Object.freeze(subscribers),
            });
            snapshot.jobProjections.set(job, projection);
            return projection;
        }
        function projectionMatchesLane(snapshot: TranslationManagerSchedulerStateSnapshot, job: unknown, lane: TranslationManagerReservedLaneCandidate): boolean {
            let matchesByJob = snapshot.laneMatches.get(lane);
            if (matchesByJob === undefined) {
                matchesByJob = new Map<unknown, boolean>();
                snapshot.laneMatches.set(lane, matchesByJob);
            }
            if (matchesByJob.has(job))
                return matchesByJob.get(job) === true;
            const projection = getJobProjection(snapshot, job);
            let matches = false;
            if (projection.job) {
                if (projection.activeSubscribers.length > 0) {
                    matches = projection.activeSubscribers.some((subscriber) => subscriber.active &&
                        subscriber.priority >= (lane.priority as number) &&
                        (!lane.hooks.length || !!lane.hooks.includes(subscriber.hook)));
                }
                else {
                    matches =
                        projection.effectivePriority >= (lane.priority as number) &&
                            (!lane.hooks.length || !!lane.hooks.includes(projection.hook));
                }
            }
            matchesByJob.set(job, matches);
            return matches;
        }
        function projectionMatchesAnyLane(snapshot: TranslationManagerSchedulerStateSnapshot, job: unknown): boolean {
            return snapshot.activeLanes.some((lane) => projectionMatchesLane(snapshot, job, lane));
        }
        function countLaneRunningFromSnapshot(snapshot: TranslationManagerSchedulerStateSnapshot, lane: TranslationManagerReservedLaneCandidate): number {
            return snapshot.jobs.filter((job) => getJobProjection(snapshot, job).status === 'running' && projectionMatchesLane(snapshot, job, lane)).length;
        }
        function countLaneQueuedFromSnapshot(snapshot: TranslationManagerSchedulerStateSnapshot, lane: TranslationManagerReservedLaneCandidate): number {
            return snapshot.queuedJobs.filter((job) => {
                const projection = getJobProjection(snapshot, job);
                return (projection.status === 'queued' &&
                    projection.activeSubscribers.some((subscriber) => subscriber.active) &&
                    projectionMatchesLane(snapshot, job, lane));
            }).length;
        }
        function countReservedRunningFromSnapshot(snapshot: TranslationManagerSchedulerStateSnapshot): number {
            return snapshot.jobs.filter((job) => getJobProjection(snapshot, job).status === 'running' && projectionMatchesAnyLane(snapshot, job)).length;
        }
        function getLaneConcurrencyLimit(snapshot: TranslationManagerSchedulerStateSnapshot, lane: TranslationManagerReservedLaneCandidate): number {
            const convertNumber = runtime.Number;
            const configured = convertNumber(lane.maxConcurrent);
            const candidate = runtime.Number.isFinite(configured) && (configured as number) > 0 ? configured : snapshot.capacity;
            return runtime.Math.min(snapshot.capacity, runtime.Math.floor(candidate)) as number;
        }
        function getProtectedSlotCount(snapshot: TranslationManagerSchedulerStateSnapshot): number {
            const protectedSlots = snapshot.activeLanes.reduce((total, lane) => total + (lane.reservedSlots as number), 0);
            return runtime.Math.min(snapshot.capacity, protectedSlots) as number;
        }
        function deriveNormalDispatchState(snapshot: TranslationManagerSchedulerStateSnapshot): unknown {
            const protectedSlots = getProtectedSlotCount(snapshot);
            const normalCapacity = runtime.Math.max(0, snapshot.capacity - protectedSlots) as number;
            const normalRunning = runtime.Math.max(0, snapshot.activeCount - countReservedRunningFromSnapshot(snapshot)) as number;
            const blocked = snapshot.activeLanes.some((lane) => {
                if (lane.blocksNormalDispatch !== true)
                    return false;
                const running = countLaneRunningFromSnapshot(snapshot, lane);
                const queued = countLaneQueuedFromSnapshot(snapshot, lane);
                return (running > 0 || queued > 0) && running < getLaneConcurrencyLimit(snapshot, lane);
            });
            return Object.freeze({
                capacity: snapshot.capacity,
                activeCount: snapshot.activeCount,
                normalCapacity,
                normalRunning,
                blocked,
                canDispatch: !blocked && snapshot.activeCount < snapshot.capacity && normalRunning < normalCapacity,
            });
        }
        function countReservedSlots(enabledLanes: unknown): unknown {
            const snapshot = captureSchedulerSnapshot(enabledLanes);
            const configured = snapshot.activeLanes.reduce((total, lane) => total + (lane.reservedSlots as number), 0);
            return runtime.Math.min(snapshot.capacity, configured);
        }
        function getNormalDispatchCapacity(enabledLanes: unknown): unknown {
            const snapshot = captureSchedulerSnapshot(enabledLanes);
            return runtime.Math.max(0, snapshot.capacity - getProtectedSlotCount(snapshot));
        }
        function countNormalRunningJobs(enabledLanes: unknown): unknown {
            const snapshot = captureSchedulerSnapshot(enabledLanes);
            return runtime.Math.max(0, snapshot.activeCount - countReservedRunningFromSnapshot(snapshot));
        }
        function hasBlockingReservedLaneWork(enabledLanes: unknown): unknown {
            const snapshot = captureSchedulerSnapshot(enabledLanes);
            return (deriveNormalDispatchState(snapshot) as {
                readonly blocked: unknown;
            }).blocked;
        }
        function getReservedLaneDispatchState(lane: unknown): unknown {
            const snapshot = captureSchedulerSnapshot(lane ? [lane] : [], false);
            const laneSource = lane as TranslationManagerReservedLaneCandidate;
            const running = lane ? countLaneRunningFromSnapshot(snapshot, laneSource) : 0;
            const maxConcurrent = lane ? getLaneConcurrencyLimit(snapshot, laneSource) : 0;
            return Object.freeze({
                lane,
                capacity: snapshot.capacity,
                activeCount: snapshot.activeCount,
                running,
                maxConcurrent,
                canDispatch: !!lane && snapshot.activeCount < snapshot.capacity && running < maxConcurrent,
            });
        }
        function getNormalDispatchState(enabledLanes: unknown): unknown {
            return deriveNormalDispatchState(captureSchedulerSnapshot(enabledLanes, false));
        }
        function getQueueDispatchState(enabledLanes: unknown): unknown {
            const snapshot = captureSchedulerSnapshot(enabledLanes);
            if (!snapshot.queuedJobs.length)
                return Object.freeze({ canDispatch: false, reason: 'queue-empty' });
            if (snapshot.activeCount >= snapshot.capacity) {
                return Object.freeze({ canDispatch: false, reason: 'provider-capacity-full' });
            }
            const hasDispatchableReserved = snapshot.activeLanes.some((lane) => {
                const queued = countLaneQueuedFromSnapshot(snapshot, lane);
                const running = countLaneRunningFromSnapshot(snapshot, lane);
                return queued > 0 && running < getLaneConcurrencyLimit(snapshot, lane);
            });
            if (hasDispatchableReserved) {
                return Object.freeze({ canDispatch: true, reason: 'reserved-lane-queued' });
            }
            const normalState = deriveNormalDispatchState(snapshot) as {
                readonly blocked: unknown;
                readonly canDispatch: unknown;
            };
            if (!normalState.canDispatch) {
                return Object.freeze({
                    canDispatch: false,
                    reason: normalState.blocked ? 'normal-dispatch-blocked' : 'normal-capacity-full',
                    normalState,
                });
            }
            const hasNormalQueued = snapshot.queuedJobs.some((job) => !projectionMatchesAnyLane(snapshot, job));
            return Object.freeze({
                canDispatch: hasNormalQueued,
                reason: hasNormalQueued ? 'normal-queued' : 'only-reserved-lane-work',
                normalState,
            });
        }
        function getReservedPriorityLaneSnapshot(): unknown {
            const snapshot = captureSchedulerSnapshot(lanes);
            return lanes.map((lane: unknown) => {
                const laneSource = lane as TranslationManagerReservedLaneCandidate;
                const enabled = snapshot.capacity >= (laneSource.enabledAtCapacity as number);
                const running = enabled ? countLaneRunningFromSnapshot(snapshot, laneSource) : 0;
                const queued = enabled ? countLaneQueuedFromSnapshot(snapshot, laneSource) : 0;
                const maxConcurrent = getLaneConcurrencyLimit(snapshot, laneSource);
                return Object.freeze({
                    name: laneSource.name,
                    enabled,
                    enabledAtCapacity: laneSource.enabledAtCapacity,
                    reservedSlots: laneSource.reservedSlots,
                    maxConcurrent: laneSource.maxConcurrent,
                    priority: laneSource.priority,
                    hooks: laneSource.hooks.slice(),
                    blocksNormalDispatch: laneSource.blocksNormalDispatch === true,
                    queued,
                    running,
                    available: enabled ? runtime.Math.max(0, maxConcurrent - running) : 0,
                    policy: Object.freeze({
                        type: 'reserved-priority-lane',
                        match: Object.freeze({
                            minimumPriority: laneSource.priority,
                            hooks: laneSource.hooks.slice(),
                        }),
                        capacity: Object.freeze({
                            providerCapacity: snapshot.capacity,
                            enabledAtCapacity: laneSource.enabledAtCapacity,
                            reservedSlots: laneSource.reservedSlots,
                            maxConcurrent: laneSource.maxConcurrent,
                        }),
                        normalDispatch: laneSource.blocksNormalDispatch === true
                            ? 'reserved-first-until-satisfied'
                            : 'capacity-only',
                    }),
                });
            });
        }
        return {
            reservedPriorityLanePolicies: lanes,
            getEnabledReservedPriorityLanes,
            subscriberMatchesReservedLane,
            jobMatchesReservedLane,
            jobMatchesAnyReservedLane,
            countReservedRunningJobs,
            countLaneRunningJobs,
            countLaneQueuedJobs,
            countReservedSlots,
            getNormalDispatchCapacity,
            countNormalRunningJobs,
            hasBlockingReservedLaneWork,
            getReservedLaneDispatchState,
            getNormalDispatchState,
            getQueueDispatchState,
            getReservedPriorityLaneSnapshot,
        };
    }
    function createReservedPriorityLanePolicies(settings: unknown = {}, clampPriority: RuntimeFunction = (value: unknown) => {
        const convertNumber = runtime.Number;
        const numeric = convertNumber(value);
        return isTruthy(numeric) ? numeric : 0;
    }): unknown {
        const configured = getConfiguredReservedPriorityLanes(settings) as RuntimeCollectionCandidate;
        return configured
            .map((lane: unknown) => normalizeReservedPriorityLane(lane, clampPriority))
            .filter((lane: unknown) => {
            const laneValue = lane as FalsySensitiveValue;
            return laneValue && ((lane as TranslationManagerReservedLaneCandidate).reservedSlots as number) > 0;
        });
    }
    function getConfiguredReservedPriorityLanes(settings: unknown = {}): unknown {
        const settingsValue = settings as FalsySensitiveValue;
        const settingsSource = settings as TranslationManagerSchedulerSettingsCandidate;
        const translation = settingsValue && (settingsSource.translation as boolean) && typeof settingsSource.translation === 'object'
            ? settingsSource.translation
            : {};
        const translationSource = translation as TranslationManagerSchedulerTranslationSettingsCandidate;
        const scheduler = (translationSource.scheduler as boolean) && typeof translationSource.scheduler === 'object'
            ? translationSource.scheduler
            : {};
        const schedulerSource = scheduler as TranslationManagerSchedulerNestedSettingsCandidate;
        if (runtime.Array.isArray(schedulerSource.reservedPriorityLanes))
            return schedulerSource.reservedPriorityLanes;
        if (runtime.Array.isArray(translationSource.reservedPriorityLanes))
            return translationSource.reservedPriorityLanes;
        if (schedulerSource.reservedPriorityLanes === false || translationSource.reservedPriorityLanes === false)
            return [];
        return DEFAULT_RESERVED_PRIORITY_LANES;
    }
    function normalizeReservedPriorityLane(lane: unknown, clampPriority: RuntimeFunction): unknown {
        const laneValue = lane as FalsySensitiveValue;
        if (!laneValue || typeof lane !== 'object')
            return null;
        const source = lane as TranslationManagerReservedLaneCandidate;
        const convertName = runtime.String;
        const laneName = source.name;
        const name = convertName(isTruthy(laneName) ? laneName : 'reserved');
        const enabledAtCapacity = runtime.Math.max(1, runtime.Math.floor((() => {
            const convertNumber = runtime.Number;
            const numeric = convertNumber(source.enabledAtCapacity);
            return isTruthy(numeric) ? numeric : 1;
        })()));
        const reservedSlots = runtime.Math.max(0, runtime.Math.floor((() => {
            const convertNumber = runtime.Number;
            const numeric = convertNumber(source.reservedSlots);
            return isTruthy(numeric) ? numeric : 0;
        })()));
        const maxConcurrent = runtime.Math.max(0, runtime.Math.floor((() => {
            const configuredMax = source.maxConcurrent;
            if (configuredMax === undefined || configuredMax === null)
                return reservedSlots;
            const convertNumber = runtime.Number;
            const numeric = convertNumber(configuredMax);
            return runtime.Number.isFinite(numeric) ? numeric : reservedSlots;
        })()));
        const priority = clampPriority(source.priority);
        let hooks: unknown;
        if (runtime.Array.isArray(source.hooks)) {
            const mappedHooks = source.hooks.map((hook: unknown) => {
                const convertString = runtime.String;
                return (convertString(isTruthy(hook) ? hook : '') as TrimmableCandidate).trim();
            });
            hooks = mappedHooks.filter(runtime.Boolean);
        }
        else {
            hooks = [];
        }
        const blocksNormalDispatch = source.blocksNormalDispatch === true;
        return {
            name,
            enabledAtCapacity,
            reservedSlots,
            maxConcurrent,
            priority,
            hooks,
            blocksNormalDispatch,
        };
    }
    function defaultGetActiveSubscribers(job: unknown): unknown {
        const jobValue = job as FalsySensitiveValue;
        const source = job as TranslationManagerSchedulerJobCandidate;
        if (!jobValue ||
            !source.subscribers ||
            typeof (source.subscribers as TranslationManagerSchedulerSubscriberCollectionCandidate).values !==
                'function')
            return [];
        return runtime.Array.from((source.subscribers as TranslationManagerSchedulerSubscriberCollectionCandidate).values()).filter((subscriber: unknown) => {
            const subscriberValue = subscriber as FalsySensitiveValue;
            return subscriberValue && (subscriber as TranslationManagerSchedulerSubscriberCandidate).active;
        });
    }
    function getSafeProviderCapacity(value: unknown): unknown {
        const convertNumber = runtime.Number;
        const numeric = convertNumber(value);
        if (!runtime.Number.isFinite(numeric) || (numeric as number) <= 0)
            return 1;
        const integer = runtime.Math.floor(numeric);
        return integer === numeric ? integer : 1;
    }
    function getSafeActiveCount(value: unknown): unknown {
        const convertNumber = runtime.Number;
        const numeric = convertNumber(value);
        return runtime.Number.isFinite(numeric) && (numeric as number) > 0 ? runtime.Math.floor(numeric) : 0;
    }
    return {
        createSchedulerPolicy,
        createReservedPriorityLanePolicies,
    };
}
