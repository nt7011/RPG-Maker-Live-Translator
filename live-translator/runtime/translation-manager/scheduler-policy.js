// Translation manager support: scheduler policy.
// Owns queue lane policy, matching, capacity, and intel state.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.translationManager.schedulerPolicy',
        requires: {
            constants: 'runtime.translationManager.constants',
        },
        factory({ constants }) {
            const { DEFAULT_RESERVED_PRIORITY_LANES } = constants;

            function createSchedulerPolicy(options = {}) {
                const clampPriority = typeof options.clampPriority === 'function'
                    ? options.clampPriority
                    : (value) => Number(value) || 0;
                const lanes = createReservedPriorityLanePolicies(options.settings, clampPriority);
                const getProviderCapacity = typeof options.getProviderCapacity === 'function'
                    ? options.getProviderCapacity
                    : () => 1;
                const getActiveCount = typeof options.getActiveCount === 'function'
                    ? options.getActiveCount
                    : () => 0;
                const getJobs = typeof options.getJobs === 'function'
                    ? options.getJobs
                    : () => [];
                const getQueuedJobs = typeof options.getQueuedJobs === 'function'
                    ? options.getQueuedJobs
                    : () => [];
                const getActiveSubscribers = typeof options.getActiveSubscribers === 'function'
                    ? options.getActiveSubscribers
                    : defaultGetActiveSubscribers;
                const hasActiveSubscribers = typeof options.hasActiveSubscribers === 'function'
                    ? options.hasActiveSubscribers
                    : (job) => getActiveSubscribers(job).length > 0;

                function getEnabledReservedPriorityLanes() {
                    const capacity = getSafeProviderCapacity(getProviderCapacity());
                    return lanes.filter((lane) => capacity >= lane.enabledAtCapacity);
                }

                function subscriberMatchesReservedLane(subscriber, lane) {
                    if (!subscriber || !subscriber.active || !lane) return false;
                    if (clampPriority(subscriber.priority) < lane.priority) return false;
                    if (!lane.hooks.length) return true;
                    const hook = String(subscriber.hook || (subscriber.context && subscriber.context.hook) || '').trim();
                    return lane.hooks.includes(hook);
                }

                function jobMatchesReservedLane(job, lane) {
                    if (!job || !lane) return false;
                    const activeSubscribers = getActiveSubscribers(job);
                    if (activeSubscribers.length) {
                        return activeSubscribers.some((subscriber) => subscriberMatchesReservedLane(subscriber, lane));
                    }
                    const hook = String(job.hook || '').trim();
                    return clampPriority(job.effectivePriority) >= lane.priority
                        && (!lane.hooks.length || lane.hooks.includes(hook));
                }

                function jobMatchesAnyReservedLane(job, enabledLanes) {
                    return (enabledLanes || getEnabledReservedPriorityLanes()).some((lane) => jobMatchesReservedLane(job, lane));
                }

                function countReservedRunningJobs(enabledLanes) {
                    const activeLanes = enabledLanes || getEnabledReservedPriorityLanes();
                    return getJobs().filter((job) => {
                        return job && job.status === 'running' && jobMatchesAnyReservedLane(job, activeLanes);
                    }).length;
                }

                function countLaneRunningJobs(lane) {
                    return getJobs().filter((job) => {
                        return job && job.status === 'running' && jobMatchesReservedLane(job, lane);
                    }).length;
                }

                function countLaneQueuedJobs(lane) {
                    return getQueuedJobs().filter((job) => {
                        return job && job.status === 'queued' && hasActiveSubscribers(job) && jobMatchesReservedLane(job, lane);
                    }).length;
                }

                function countReservedSlots(enabledLanes) {
                    const capacity = getSafeProviderCapacity(getProviderCapacity());
                    const total = (enabledLanes || getEnabledReservedPriorityLanes()).reduce((sum, lane) => {
                        return sum + Math.max(0, Math.floor(Number(lane.reservedSlots) || 0));
                    }, 0);
                    return Math.min(capacity, total);
                }

                function getNormalDispatchCapacity(enabledLanes) {
                    const capacity = getSafeProviderCapacity(getProviderCapacity());
                    return Math.max(0, capacity - countReservedSlots(enabledLanes));
                }

                function countNormalRunningJobs(enabledLanes) {
                    return Math.max(0, getSafeActiveCount(getActiveCount()) - countReservedRunningJobs(enabledLanes));
                }

                function hasBlockingReservedLaneWork(enabledLanes) {
                    return (enabledLanes || getEnabledReservedPriorityLanes()).some((lane) => {
                        return lane.blocksNormalDispatch === true
                            && (countLaneRunningJobs(lane) > 0 || countLaneQueuedJobs(lane) > 0);
                    });
                }

                function getReservedLaneDispatchState(lane) {
                    const capacity = getSafeProviderCapacity(getProviderCapacity());
                    const activeCount = getSafeActiveCount(getActiveCount());
                    return {
                        lane,
                        capacity,
                        activeCount,
                        canDispatch: !!lane && activeCount < capacity,
                    };
                }

                function getNormalDispatchState(enabledLanes) {
                    const activeLanes = enabledLanes || getEnabledReservedPriorityLanes();
                    const capacity = getSafeProviderCapacity(getProviderCapacity());
                    const activeCount = getSafeActiveCount(getActiveCount());
                    const normalCapacity = getNormalDispatchCapacity(activeLanes);
                    const normalRunning = countNormalRunningJobs(activeLanes);
                    const blocked = hasBlockingReservedLaneWork(activeLanes);
                    return {
                        capacity,
                        activeCount,
                        normalCapacity,
                        normalRunning,
                        blocked,
                        canDispatch: !blocked && activeCount < capacity && normalRunning < normalCapacity,
                    };
                }

                function getQueueDispatchState(enabledLanes) {
                    const activeLanes = enabledLanes || getEnabledReservedPriorityLanes();
                    const queuedJobs = getQueuedJobs();
                    const capacity = getSafeProviderCapacity(getProviderCapacity());
                    const activeCount = getSafeActiveCount(getActiveCount());
                    if (!queuedJobs.length) return { canDispatch: false, reason: 'queue-empty' };
                    if (activeCount >= capacity) return { canDispatch: false, reason: 'provider-capacity-full' };
                    if (activeLanes.some((lane) => countLaneQueuedJobs(lane) > 0)) {
                        return { canDispatch: true, reason: 'reserved-lane-queued' };
                    }
                    const normalState = getNormalDispatchState(activeLanes);
                    if (!normalState.canDispatch) {
                        return {
                            canDispatch: false,
                            reason: normalState.blocked ? 'normal-dispatch-blocked' : 'normal-capacity-full',
                            normalState,
                        };
                    }
                    const hasNormalQueued = queuedJobs.some((job) => !jobMatchesAnyReservedLane(job, activeLanes));
                    return {
                        canDispatch: hasNormalQueued,
                        reason: hasNormalQueued ? 'normal-queued' : 'only-reserved-lane-work',
                        normalState,
                    };
                }

                function getReservedPriorityLaneSnapshot() {
                    return lanes.map((lane) => {
                        const capacity = getSafeProviderCapacity(getProviderCapacity());
                        const enabled = capacity >= lane.enabledAtCapacity;
                        const running = enabled ? countLaneRunningJobs(lane) : 0;
                        const queued = enabled ? countLaneQueuedJobs(lane) : 0;
                        return {
                            name: lane.name,
                            enabled,
                            enabledAtCapacity: lane.enabledAtCapacity,
                            reservedSlots: lane.reservedSlots,
                            priority: lane.priority,
                            hooks: lane.hooks.slice(),
                            blocksNormalDispatch: lane.blocksNormalDispatch === true,
                            queued,
                            running,
                            available: enabled ? Math.max(0, lane.reservedSlots - running) : 0,
                            policy: {
                                type: 'reserved-priority-lane',
                                match: {
                                    minimumPriority: lane.priority,
                                    hooks: lane.hooks.slice(),
                                },
                                capacity: {
                                    providerCapacity: capacity,
                                    enabledAtCapacity: lane.enabledAtCapacity,
                                    reservedSlots: lane.reservedSlots,
                                },
                                normalDispatch: lane.blocksNormalDispatch === true
                                    ? 'blocked-while-lane-active'
                                    : 'capacity-only',
                            },
                        };
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

            function createReservedPriorityLanePolicies(settings = {}, clampPriority = (value) => Number(value) || 0) {
                const configured = getConfiguredReservedPriorityLanes(settings);
                return configured.map((lane) => normalizeReservedPriorityLane(lane, clampPriority))
                    .filter((lane) => lane && lane.reservedSlots > 0);
            }

            function getConfiguredReservedPriorityLanes(settings = {}) {
                const translation = settings && settings.translation && typeof settings.translation === 'object'
                    ? settings.translation
                    : {};
                const scheduler = translation.scheduler && typeof translation.scheduler === 'object'
                    ? translation.scheduler
                    : {};
                if (Array.isArray(scheduler.reservedPriorityLanes)) return scheduler.reservedPriorityLanes;
                if (Array.isArray(translation.reservedPriorityLanes)) return translation.reservedPriorityLanes;
                if (scheduler.reservedPriorityLanes === false || translation.reservedPriorityLanes === false) return [];
                return DEFAULT_RESERVED_PRIORITY_LANES;
            }

            function normalizeReservedPriorityLane(lane, clampPriority) {
                if (!lane || typeof lane !== 'object') return null;
                return {
                    name: String(lane.name || 'reserved'),
                    enabledAtCapacity: Math.max(1, Math.floor(Number(lane.enabledAtCapacity) || 1)),
                    reservedSlots: Math.max(0, Math.floor(Number(lane.reservedSlots) || 0)),
                    priority: clampPriority(lane.priority),
                    hooks: Array.isArray(lane.hooks)
                        ? lane.hooks.map((hook) => String(hook || '').trim()).filter(Boolean)
                        : [],
                    blocksNormalDispatch: lane.blocksNormalDispatch === true,
                };
            }

            function defaultGetActiveSubscribers(job) {
                if (!job || !job.subscribers || typeof job.subscribers.values !== 'function') return [];
                return Array.from(job.subscribers.values()).filter((subscriber) => subscriber && subscriber.active);
            }

            function getSafeProviderCapacity(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 1;
            }

            function getSafeActiveCount(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
            }

            return {
                createSchedulerPolicy,
                createReservedPriorityLanePolicies,
            };
        },
    });
})();
