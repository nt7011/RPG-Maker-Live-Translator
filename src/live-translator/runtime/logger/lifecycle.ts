type PropertyBag = Record<PropertyKey, unknown>;
type ResetCallback = () => void;
type ScheduleReset = (callback: ResetCallback) => unknown;
type MonotonicNow = () => unknown;
type WallDateConstructor = new () => unknown;
interface ThrottleResetOwner {
    readonly callback: ResetCallback;
    phase: 'scheduling' | 'scheduled' | 'settled';
}
interface AvailableThrottleCadence {
    readonly kind: 'available';
    readonly schedule: ScheduleReset;
    owner: ThrottleResetOwner | null;
}
type ThrottleCadence = AvailableThrottleCadence | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'failed';
}>;
type MonotonicClock = Readonly<{
    kind: 'available';
    read: MonotonicNow;
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'failed';
}>;
type TimestampCache = Readonly<{
    kind: 'uninitialized';
}> | Readonly<{
    kind: 'initialized';
    refreshedAt: number | null;
    value: string;
}>;
export interface LoggerLifecycleInput {
    readonly maxLogsPerFrame: unknown;
    readonly monotonicNow: unknown;
    readonly scheduleThrottleReset: unknown;
}
export interface LoggerLifecycle {
    readonly admitOrdinaryLog: (bypassThrottle: boolean) => boolean;
    readonly getFastTimestamp: () => string;
}
const DEFAULT_MAX_LOGS_PER_FRAME = 1000;
function normalizeMaxLogsPerFrame(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value) && value >= 0
        ? value
        : DEFAULT_MAX_LOGS_PER_FRAME;
}
function captureThrottleCadence(candidate: unknown): ThrottleCadence {
    if (typeof candidate === 'function') {
        return {
            kind: 'available',
            owner: null,
            schedule: (callback: ResetCallback): unknown => Reflect.apply(candidate, undefined, [callback]),
        };
    }
    try {
        const animationFrame = globalThis.requestAnimationFrame;
        return typeof animationFrame === 'function'
            ? {
                kind: 'available',
                owner: null,
                schedule: (callback: ResetCallback): unknown => Reflect.apply(animationFrame, undefined, [callback]),
            }
            : { kind: 'unavailable' };
    }
    catch {
        return { kind: 'unavailable' };
    }
}
function captureMonotonicClock(candidate: unknown): MonotonicClock {
    if (typeof candidate === 'function') {
        return {
            kind: 'available',
            read: (): unknown => Reflect.apply(candidate, undefined, []),
        };
    }
    try {
        const performanceRef = globalThis.performance;
        const now: unknown = Reflect.get(performanceRef, 'now');
        return typeof now === 'function'
            ? {
                kind: 'available',
                read: (): unknown => Reflect.apply(now, performanceRef, []),
            }
            : { kind: 'unavailable' };
    }
    catch {
        return { kind: 'unavailable' };
    }
}
function captureWallDateConstructor(): WallDateConstructor | null {
    try {
        const candidate: unknown = globalThis.Date;
        return typeof candidate === 'function' ? (candidate as WallDateConstructor) : null;
    }
    catch {
        return null;
    }
}
export function createLoggerLifecycle(input: LoggerLifecycleInput): LoggerLifecycle {
    const maxLogsPerFrame = normalizeMaxLogsPerFrame(input.maxLogsPerFrame);
    let throttleCadence = captureThrottleCadence(input.scheduleThrottleReset);
    let logThrottle = 0;
    function settleThrottleReset(owner: ThrottleResetOwner): void {
        if (throttleCadence.kind !== 'available')
            return;
        if (throttleCadence.owner !== owner || owner.phase === 'settled')
            return;
        owner.phase = 'settled';
        throttleCadence.owner = null;
        logThrottle = 0;
    }
    function acquireThrottleResetOwnership(): void {
        if (throttleCadence.kind !== 'available' || throttleCadence.owner)
            return;
        const cadence = throttleCadence;
        const owner: ThrottleResetOwner = {
            callback: (): void => {
                settleThrottleReset(owner);
            },
            phase: 'scheduling',
        };
        cadence.owner = owner;
        try {
            Reflect.apply(cadence.schedule, undefined, [owner.callback]);
            if (throttleCadence === cadence && cadence.owner === owner && owner.phase === 'scheduling') {
                owner.phase = 'scheduled';
            }
        }
        catch {
            if (cadence.owner === owner) {
                owner.phase = 'settled';
                cadence.owner = null;
            }
            logThrottle = 0;
            throttleCadence = { kind: 'failed' };
        }
    }
    function admitOrdinaryLog(bypassThrottle: boolean): boolean {
        if (bypassThrottle)
            return true;
        if (maxLogsPerFrame === 0)
            return false;
        if (throttleCadence.kind !== 'available') {
            return true;
        }
        if (logThrottle >= maxLogsPerFrame)
            return false;
        logThrottle += 1;
        acquireThrottleResetOwnership();
        return true;
    }
    let monotonicClock = captureMonotonicClock(input.monotonicNow);
    const WallDateConstructor = captureWallDateConstructor();
    let timestampCache: TimestampCache = { kind: 'uninitialized' };
    function readMonotonicNow(): number | null {
        if (monotonicClock.kind !== 'available')
            return null;
        try {
            const sample = Reflect.apply(monotonicClock.read, undefined, []);
            if (typeof sample === 'number' && Number.isFinite(sample))
                return sample;
        }
        catch {
        }
        monotonicClock = { kind: 'failed' };
        return null;
    }
    function formatWallTimestamp(): string {
        if (!WallDateConstructor)
            return '00:00:00';
        try {
            const date: unknown = Reflect.construct(WallDateConstructor, []);
            const toISOString = (date as PropertyBag)['toISOString'];
            if (typeof toISOString !== 'function')
                return '00:00:00';
            const iso: unknown = Reflect.apply(toISOString, date, []);
            const split = (iso as PropertyBag)['split'];
            if (typeof split !== 'function')
                return '00:00:00';
            const parts: unknown = Reflect.apply(split, iso, ['T']);
            const timePart = (parts as PropertyBag)[1];
            const substring = (timePart as PropertyBag)['substring'];
            if (typeof substring !== 'function')
                return '00:00:00';
            const formatted: unknown = Reflect.apply(substring, timePart, [0, 8]);
            return typeof formatted === 'string' ? formatted : '00:00:00';
        }
        catch {
            return '00:00:00';
        }
    }
    function getFastTimestamp(): string {
        const now = readMonotonicNow();
        const refreshDue = timestampCache.kind === 'uninitialized' ||
            now === null ||
            timestampCache.refreshedAt === null ||
            now < timestampCache.refreshedAt ||
            now - timestampCache.refreshedAt >= 1000;
        if (refreshDue) {
            timestampCache = {
                kind: 'initialized',
                refreshedAt: now,
                value: formatWallTimestamp(),
            };
        }
        return timestampCache.kind === 'initialized' ? timestampCache.value : '00:00:00';
    }
    return {
        admitOrdinaryLog,
        getFastTimestamp,
    };
}
