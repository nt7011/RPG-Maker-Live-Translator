import type { PendingTranslationQueue } from './pending-queue.js';
import type { SubscriberOwnershipRegistry, SubscriberPolicySnapshot, SubscriberPriorityTransition, } from './subscriber-ownership.js';
type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
const arrayForEachIntrinsic = Reflect.getOwnPropertyDescriptor(Array.prototype, 'forEach')?.value as RuntimeFunction;
const NativeWeakMap = WeakMap;
const weakMapGetIntrinsic = Reflect.getOwnPropertyDescriptor(WeakMap.prototype, 'get')?.value as RuntimeFunction;
const weakMapSetIntrinsic = Reflect.getOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value as RuntimeFunction;
interface TranslationManagerJobPolicyCandidate {
    readonly effectivePriority: unknown;
    readonly status: unknown;
    readonly stream: unknown;
    readonly timeoutMs: unknown;
    readonly queueSeq: unknown;
}
interface JobPolicyState {
    effectivePriority: unknown;
    stream: unknown;
    timeoutMs: unknown;
    version: number;
    openPlan: JobPolicyPlanCell | null;
}
interface JobPolicyPlanCell {
    readonly job: unknown;
    readonly state: JobPolicyState;
    readonly expectedVersion: number;
    readonly hasSubscriber: boolean;
    readonly effectivePriority: unknown;
    readonly stream: unknown;
    readonly timeoutMs: unknown;
    readonly priorityTransition: SubscriberPriorityTransition | null;
    open: boolean;
}
interface TranslationManagerDiagnosticsCandidate {
    flush(): unknown;
}
interface TranslationManagerSchedulerPolicyCandidate {
    getEnabledReservedPriorityLanes(): unknown;
    subscriberMatchesReservedLane(subscriber: unknown, lane: unknown): unknown;
    jobMatchesReservedLane(job: unknown, lane: unknown): unknown;
    jobMatchesAnyReservedLane(job: unknown, lanes: unknown): unknown;
    countReservedRunningJobs(lanes: unknown): unknown;
    countLaneRunningJobs(lane: unknown): unknown;
    countLaneQueuedJobs(lane: unknown): unknown;
    countReservedSlots(lanes: unknown): unknown;
    getNormalDispatchCapacity(lanes: unknown): unknown;
    countNormalRunningJobs(lanes: unknown): unknown;
    hasBlockingReservedLaneWork(lanes: unknown): unknown;
    getReservedLaneDispatchState(lane: unknown): unknown;
    getNormalDispatchState(lanes: unknown): unknown;
    getQueueDispatchState(lanes: unknown): unknown;
    getReservedPriorityLaneSnapshot(): unknown;
}
interface TranslationManagerJobsScopeCandidate {
    readonly MIN_PRIORITY: unknown;
    readonly requestTimeoutMs: unknown;
    readonly queuedJobs: PendingTranslationQueue;
    readonly subscriberOwnership: SubscriberOwnershipRegistry;
    readonly translationDiagnostics: TranslationManagerDiagnosticsCandidate;
    readonly schedulerPolicy?: TranslationManagerSchedulerPolicyCandidate | null;
}
interface QueuedJobOrderingCandidate {
    readonly effectivePriority: unknown;
    readonly queueSeq: unknown;
}
export interface TranslationManagerJobPolicyPlan {
    readonly translationManagerJobPolicyPlan: true;
    readonly hasSubscriber: boolean;
    readonly effectivePriority: unknown;
    readonly stream: unknown;
    readonly timeoutMs: unknown;
}
export interface TranslationManagerJobsController {
    prepareJobPolicy(job: unknown, admissionToken?: unknown, priorityTransition?: SubscriberPriorityTransition): TranslationManagerJobPolicyPlan;
    commitJobPolicy(plan: unknown): boolean;
    discardJobPolicy(plan: unknown): boolean;
    publishJobPolicy(): void;
    applyJobPolicy(job: unknown, admissionToken?: unknown): boolean;
    recomputeJobPriority(job: unknown): boolean;
    removeQueuedJob(job: unknown): void;
    getActiveSubscribers(job: unknown): readonly unknown[];
    hasActiveSubscribers(job: unknown): boolean;
    compareQueuedJobsForDispatch(a: unknown, b: unknown): number;
    getEnabledReservedPriorityLanes(): unknown;
    subscriberMatchesReservedLane(subscriber: unknown, lane: unknown): unknown;
    jobMatchesReservedLane(job: unknown, lane: unknown): unknown;
    jobMatchesAnyReservedLane(job: unknown, lanes: unknown): unknown;
    countReservedRunningJobs(lanes: unknown): unknown;
    countLaneRunningJobs(lane: unknown): unknown;
    countLaneQueuedJobs(lane: unknown): unknown;
    countReservedSlots(lanes: unknown): unknown;
    getNormalDispatchCapacity(lanes: unknown): unknown;
    countNormalRunningJobs(lanes: unknown): unknown;
    hasBlockingReservedLaneWork(lanes: unknown): unknown;
    getReservedLaneDispatchState(lane: unknown): unknown;
    getNormalDispatchState(lanes: unknown): unknown;
    getQueueDispatchState(lanes: unknown): unknown;
    getReservedPriorityLaneSnapshot(): unknown;
}
export interface TranslationManagerJobsModule {
    create(scope?: unknown): TranslationManagerJobsController;
}
function weakMapGet<Key extends object, Value>(store: WeakMap<Key, Value>, key: Key): Value | undefined {
    return Reflect.apply(weakMapGetIntrinsic, store, [key]) as Value | undefined;
}
function weakMapSet<Key extends object, Value>(store: WeakMap<Key, Value>, key: Key, value: Value): void {
    Reflect.apply(weakMapSetIntrinsic, store, [key, value]);
}
function isObjectLike(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readMutablePolicyField(job: object, field: 'effectivePriority' | 'stream' | 'timeoutMs'): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(job, field);
    if (descriptor === undefined ||
        !('value' in descriptor) ||
        descriptor.configurable !== true ||
        descriptor.writable !== true) {
        throw new Error(`[TranslationService] Manager job policy field ${field} must be mutable own data.`);
    }
    return descriptor.value;
}
const createTranslationManagerJobsController = function createController(scope: unknown = {}): TranslationManagerJobsController {
    const source = scope as TranslationManagerJobsScopeCandidate;
    const { MIN_PRIORITY, requestTimeoutMs, queuedJobs, subscriberOwnership } = source;
    const policyStates = new NativeWeakMap<object, JobPolicyState>();
    const policyPlans = new NativeWeakMap<object, JobPolicyPlanCell>();
    function getOrCreatePolicyState(job: unknown): JobPolicyState {
        if (!isObjectLike(job)) {
            throw new TypeError('[TranslationService] Job policy requires a manager job object.');
        }
        const existing = weakMapGet(policyStates, job);
        if (existing !== undefined)
            return existing;
        const effectivePriority = readMutablePolicyField(job, 'effectivePriority');
        const stream = readMutablePolicyField(job, 'stream');
        const timeoutMs = readMutablePolicyField(job, 'timeoutMs');
        const state: JobPolicyState = {
            effectivePriority,
            stream,
            timeoutMs,
            version: 0,
            openPlan: null,
        };
        Object.defineProperties(job, {
            effectivePriority: {
                configurable: false,
                enumerable: true,
                get() {
                    return state.effectivePriority;
                },
            },
            stream: {
                configurable: false,
                enumerable: true,
                get() {
                    return state.stream;
                },
            },
            timeoutMs: {
                configurable: false,
                enumerable: true,
                get() {
                    return state.timeoutMs;
                },
            },
        });
        weakMapSet(policyStates, job, state);
        return state;
    }
    function getOpenPlan(value: unknown): JobPolicyPlanCell | undefined {
        const plan = isObjectLike(value) ? weakMapGet(policyPlans, value) : undefined;
        if (plan === undefined ||
            !plan.open ||
            plan.state.openPlan !== plan ||
            plan.state.version !== plan.expectedVersion) {
            return undefined;
        }
        return plan;
    }
    function prepareJobPolicy(job: unknown, admissionToken: unknown = undefined, priorityTransition: SubscriberPriorityTransition | undefined = undefined): TranslationManagerJobPolicyPlan {
        const state = getOrCreatePolicyState(job);
        if (state.openPlan !== null) {
            throw new Error('[TranslationService] A job policy transition is already prepared.');
        }
        const candidate = job as TranslationManagerJobPolicyCandidate;
        const status = candidate.status;
        let nextPriority = MIN_PRIORITY;
        let hasSubscriber = false;
        let wantsStream = false;
        let timeoutMs = requestTimeoutMs;
        const subscribers = subscriberOwnership.getPolicySubscribers(job, admissionToken, priorityTransition);
        Reflect.apply(arrayForEachIntrinsic, subscribers, [
            (subscriberCandidate: SubscriberPolicySnapshot) => {
                hasSubscriber = true;
                nextPriority = Math.max(nextPriority as number, subscriberCandidate.priority as number);
                wantsStream = wantsStream || subscriberCandidate.stream;
                timeoutMs = Math.max(timeoutMs as number, subscriberCandidate.timeoutMs as number);
            },
        ]);
        const preparedEffectivePriority = (hasSubscriber as boolean) ? nextPriority : MIN_PRIORITY;
        const preparedStream = status === 'queued' ? wantsStream : state.stream;
        const preparedTimeoutMs = status === 'queued' ? timeoutMs : state.timeoutMs;
        const token: TranslationManagerJobPolicyPlan = {
            translationManagerJobPolicyPlan: true as const,
            hasSubscriber,
            effectivePriority: preparedEffectivePriority,
            stream: preparedStream,
            timeoutMs: preparedTimeoutMs,
        };
        Object.freeze(token);
        const plan: JobPolicyPlanCell = {
            job,
            state,
            expectedVersion: state.version,
            hasSubscriber,
            effectivePriority: preparedEffectivePriority,
            stream: preparedStream,
            timeoutMs: preparedTimeoutMs,
            priorityTransition: priorityTransition ?? null,
            open: true,
        };
        state.openPlan = plan;
        weakMapSet(policyPlans, token, plan);
        return token;
    }
    function commitJobPolicy(plan: unknown): boolean {
        const cell = getOpenPlan(plan);
        if (cell === undefined)
            return false;
        if (cell.priorityTransition !== null && !subscriberOwnership.commitPriorityChange(cell.priorityTransition)) {
            return false;
        }
        queuedJobs.update(cell.job, cell.effectivePriority as number);
        cell.state.effectivePriority = cell.effectivePriority;
        cell.state.stream = cell.stream;
        cell.state.timeoutMs = cell.timeoutMs;
        cell.state.version += 1;
        cell.state.openPlan = null;
        cell.open = false;
        return true;
    }
    function discardJobPolicy(plan: unknown): boolean {
        const cell = getOpenPlan(plan);
        if (cell === undefined)
            return false;
        if (cell.priorityTransition !== null) {
            subscriberOwnership.discardPriorityChange(cell.priorityTransition);
        }
        cell.state.openPlan = null;
        cell.open = false;
        return true;
    }
    function publishJobPolicy(): void {
        try {
            source.translationDiagnostics.flush();
        }
        catch {
        }
    }
    function applyJobPolicy(job: unknown, admissionToken: unknown = undefined): boolean {
        const plan = prepareJobPolicy(job, admissionToken);
        const hasSubscriber = getOpenPlan(plan)?.hasSubscriber === true;
        if (!commitJobPolicy(plan)) {
            discardJobPolicy(plan);
            throw new Error('[TranslationService] Prepared job policy could not be committed.');
        }
        return hasSubscriber;
    }
    function recomputeJobPriority(job: unknown): boolean {
        const hasSubscriber = applyJobPolicy(job);
        publishJobPolicy();
        return hasSubscriber;
    }
    function removeQueuedJob(job: unknown): void {
        queuedJobs.delete(job);
    }
    function getActiveSubscribers(job: unknown): readonly unknown[] {
        if (!(job as FalsySensitiveValue))
            return Object.freeze([]);
        return subscriberOwnership.getActiveSubscribers(job);
    }
    function hasActiveSubscribers(job: unknown): boolean {
        return getActiveSubscribers(job).length > 0;
    }
    function compareQueuedJobsForDispatch(a: unknown, b: unknown): number {
        const first = a as QueuedJobOrderingCandidate;
        const second = b as QueuedJobOrderingCandidate;
        const secondPriority = second.effectivePriority;
        const firstPriority = first.effectivePriority;
        if (secondPriority !== firstPriority)
            return (secondPriority as number) - (firstPriority as number);
        return (first.queueSeq as number) - (second.queueSeq as number);
    }
    function getSchedulerPolicy(): TranslationManagerSchedulerPolicyCandidate {
        const schedulerPolicy = source.schedulerPolicy;
        if (!schedulerPolicy) {
            throw new Error('[TranslationService] Scheduler policy is unavailable.');
        }
        return schedulerPolicy;
    }
    function getEnabledReservedPriorityLanes(): unknown {
        return getSchedulerPolicy().getEnabledReservedPriorityLanes();
    }
    function subscriberMatchesReservedLane(subscriber: unknown, lane: unknown): unknown {
        return getSchedulerPolicy().subscriberMatchesReservedLane(subscriber, lane);
    }
    function jobMatchesReservedLane(job: unknown, lane: unknown): unknown {
        return getSchedulerPolicy().jobMatchesReservedLane(job, lane);
    }
    function jobMatchesAnyReservedLane(job: unknown, lanes: unknown): unknown {
        return getSchedulerPolicy().jobMatchesAnyReservedLane(job, lanes);
    }
    function countReservedRunningJobs(lanes: unknown): unknown {
        return getSchedulerPolicy().countReservedRunningJobs(lanes);
    }
    function countLaneRunningJobs(lane: unknown): unknown {
        return getSchedulerPolicy().countLaneRunningJobs(lane);
    }
    function countLaneQueuedJobs(lane: unknown): unknown {
        return getSchedulerPolicy().countLaneQueuedJobs(lane);
    }
    function countReservedSlots(lanes: unknown): unknown {
        return getSchedulerPolicy().countReservedSlots(lanes);
    }
    function getNormalDispatchCapacity(lanes: unknown): unknown {
        return getSchedulerPolicy().getNormalDispatchCapacity(lanes);
    }
    function countNormalRunningJobs(lanes: unknown): unknown {
        return getSchedulerPolicy().countNormalRunningJobs(lanes);
    }
    function hasBlockingReservedLaneWork(lanes: unknown): unknown {
        return getSchedulerPolicy().hasBlockingReservedLaneWork(lanes);
    }
    function getReservedLaneDispatchState(lane: unknown): unknown {
        return getSchedulerPolicy().getReservedLaneDispatchState(lane);
    }
    function getNormalDispatchState(lanes: unknown): unknown {
        return getSchedulerPolicy().getNormalDispatchState(lanes);
    }
    function getQueueDispatchState(lanes: unknown): unknown {
        return getSchedulerPolicy().getQueueDispatchState(lanes);
    }
    function getReservedPriorityLaneSnapshot(): unknown {
        return getSchedulerPolicy().getReservedPriorityLaneSnapshot();
    }
    return {
        prepareJobPolicy,
        commitJobPolicy,
        discardJobPolicy,
        publishJobPolicy,
        applyJobPolicy,
        recomputeJobPriority,
        removeQueuedJob,
        getActiveSubscribers,
        hasActiveSubscribers,
        compareQueuedJobsForDispatch,
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
};
export function createTranslationManagerJobsModule(): TranslationManagerJobsModule {
    return { create: createTranslationManagerJobsController };
}
