import type { SubscriberHandleSettlementLease, SubscriberTranslationHandle, TranslationManagerHandlesModule, } from './handles.js';
type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type SubscriberPhase = 'prepared' | 'active' | 'settling' | 'terminal';
type SubscriberTerminalStatus = 'completed' | 'canceled' | 'failed';
const MAX_DEADLINE_TIMER_DELAY_MS = 2147483647;
const NativeMap = Map;
const NativeSet = Set;
const NativeWeakMap = WeakMap;
const mapGetIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'get')?.value as RuntimeFunction;
const mapSetIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'set')?.value as RuntimeFunction;
const mapDeleteIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'delete')?.value as RuntimeFunction;
const mapForEachIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'forEach')?.value as RuntimeFunction;
const mapSizeIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'size')?.get as RuntimeFunction;
const setAddIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'add')?.value as RuntimeFunction;
const setDeleteIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'delete')?.value as RuntimeFunction;
const setForEachIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'forEach')?.value as RuntimeFunction;
const setSizeIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'size')?.get as RuntimeFunction;
const weakMapGetIntrinsic = Reflect.getOwnPropertyDescriptor(WeakMap.prototype, 'get')?.value as RuntimeFunction;
const weakMapSetIntrinsic = Reflect.getOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value as RuntimeFunction;
const weakMapHasIntrinsic = Reflect.getOwnPropertyDescriptor(WeakMap.prototype, 'has')?.value as RuntimeFunction;
interface SubscriberOwnershipOptions {
    readonly createSubscriberHandleLease: TranslationManagerHandlesModule['createSubscriberHandleLease'];
    readonly settleSubscriberHandleLease: TranslationManagerHandlesModule['settleSubscriberHandleLease'];
    readonly createAbortError: TranslationManagerHandlesModule['createAbortError'];
    readonly normalizeRecordKey: (value: unknown) => string;
    readonly now: () => unknown;
    readonly scheduleDeadline: (operation: () => void, delayMs: number) => unknown;
    readonly cancelDeadline: (handle: unknown) => unknown;
    readonly reportSecondaryError?: (error: unknown, context: string) => unknown;
}
interface SubscriberJobCandidate {
    readonly id: unknown;
    readonly key: unknown;
}
interface SubscriberSignalCandidate {
    readonly aborted: unknown;
    readonly reason: unknown;
    readonly addEventListener: unknown;
    readonly removeEventListener: unknown;
}
export interface SubscriberPreparationInput {
    readonly id: string;
    readonly job: object;
    readonly priority: unknown;
    readonly stream: boolean;
    readonly timeoutMs: unknown;
    readonly onDelta: unknown;
    readonly onTranslatorExchange?: unknown;
    readonly recordId: unknown;
    readonly hook: unknown;
    readonly source: unknown;
    readonly sourceHint: unknown;
    readonly metadata: unknown;
    readonly createdAt: unknown;
    readonly context: unknown;
    readonly signal: unknown;
    readonly initialStatus: unknown;
    readonly cancelActive: RuntimeFunction;
    readonly expireActive: RuntimeFunction;
    readonly setPriorityActive: RuntimeFunction;
}
export interface SubscriberView {
    readonly id: string;
    readonly job: object;
    readonly jobId: string;
    readonly key: string;
    readonly active: boolean;
    readonly phase: SubscriberPhase;
    readonly status: unknown;
    readonly priority: unknown;
    readonly stream: boolean;
    readonly timeoutMs: unknown;
    readonly onDelta: unknown;
    readonly onTranslatorExchange?: unknown;
    readonly recordId: string;
    readonly hook: unknown;
    readonly source: unknown;
    readonly metadata: unknown;
    readonly createdAt: unknown;
    readonly lastPriorityChangedAt: unknown;
    readonly lastPriorityReason: unknown;
    readonly context: unknown;
}
export interface JobSubscriberProjection {
    readonly size: number;
    get(id: unknown): SubscriberView | undefined;
    has(id: unknown): boolean;
    values(): IterableIterator<SubscriberView>;
    keys(): IterableIterator<string>;
    entries(): IterableIterator<[
        string,
        SubscriberView
    ]>;
    forEach(callback: (subscriber: SubscriberView, id: string, projection: JobSubscriberProjection) => void): void;
    [Symbol.iterator](): IterableIterator<[
        string,
        SubscriberView
    ]>;
}
export interface SubscriberAdmissionToken {
    readonly subscriberAdmissionToken: true;
}
export interface PreparedSubscriberAdmission {
    readonly kind: 'prepared';
    readonly token: SubscriberAdmissionToken;
    readonly handle: SubscriberTranslationHandle;
    readonly subscriber: SubscriberView;
}
export interface CanceledSubscriberAdmission {
    readonly kind: 'canceled';
    readonly handle: SubscriberTranslationHandle;
    readonly subscriber: SubscriberView;
}
export type SubscriberPreparationOutcome = PreparedSubscriberAdmission | CanceledSubscriberAdmission;
export interface SubscriberSignalAbortSnapshot {
    readonly kind: 'signal';
    readonly reason: unknown;
}
export interface SubscriberDeadlineAbortSnapshot {
    readonly kind: 'deadline';
    readonly reason: unknown;
    readonly error: unknown;
}
export type SubscriberAbortSnapshot = SubscriberSignalAbortSnapshot | SubscriberDeadlineAbortSnapshot;
export interface SubscriberSettlementSnapshot {
    readonly subscriber: SubscriberView;
    readonly job: object;
    readonly id: string;
    readonly jobId: string;
    readonly key: string;
    readonly recordId: string;
    readonly hook: unknown;
    readonly context: unknown;
    readonly status: SubscriberTerminalStatus;
}
export interface SubscriberPriorityTransition {
    readonly subscriberPriorityTransition: true;
}
export interface SubscriberPriorityChange {
    readonly changed: boolean;
    readonly subscriber: SubscriberView | null;
    readonly job: object | null;
    readonly previousPriority: unknown;
    readonly priority: unknown;
    readonly transition: SubscriberPriorityTransition | null;
}
export interface SubscriberPolicySnapshot {
    readonly priority: unknown;
    readonly stream: boolean;
    readonly timeoutMs: unknown;
}
interface SignalLease {
    readonly owner: object;
    readonly add: RuntimeFunction;
    readonly remove: RuntimeFunction;
    readonly handler: RuntimeFunction;
    readonly gate: SignalDispatchGate;
    acquisition: 'none' | 'attempted' | 'owned' | 'released';
    pendingAbort: SubscriberAbortSnapshot | null;
}
interface SignalDispatchGate {
    dispatch: RuntimeFunction | null;
}
interface DeadlineDispatchGate {
    dispatch: RuntimeFunction | null;
}
interface DeadlineLease {
    readonly deadlineAt: number;
    readonly abort: SubscriberDeadlineAbortSnapshot;
    readonly gate: DeadlineDispatchGate;
    acquisition: 'none' | 'attempted' | 'owned' | 'fired' | 'failed' | 'cleanup-pending' | 'released';
    generation: number;
    handle: unknown;
    pendingAbort: SubscriberDeadlineAbortSnapshot | null;
    acquisitionDispatch: 'none' | 'early' | 'failed';
    failure: unknown;
    releaseRequested: boolean;
}
interface SubscriberCell {
    readonly id: string;
    readonly job: object;
    readonly jobId: string;
    readonly key: string;
    readonly recordKey: string;
    readonly stream: boolean;
    readonly timeoutMs: unknown;
    readonly onDelta: unknown;
    readonly onTranslatorExchange?: unknown;
    readonly hook: unknown;
    readonly source: unknown;
    readonly sourceHint: unknown;
    readonly metadata: unknown;
    readonly createdAt: unknown;
    readonly context: unknown;
    readonly cancelActive: RuntimeFunction;
    readonly expireActive: RuntimeFunction;
    readonly setPriorityActive: RuntimeFunction;
    readonly view: SubscriberView;
    lease: SubscriberHandleSettlementLease | null;
    signal: SignalLease | null;
    deadline: DeadlineLease;
    phase: SubscriberPhase;
    status: unknown;
    priority: unknown;
    lastPriorityChangedAt: unknown;
    lastPriorityReason: unknown;
    priorityVersion: number;
    openPriorityTransition: PriorityTransitionCell | null;
    staged: boolean;
}
interface PriorityTransitionCell {
    readonly subscriber: SubscriberCell;
    readonly nextPriority: unknown;
    readonly nextChangedAt: unknown;
    readonly nextReason: unknown;
    readonly previousPriority: unknown;
    readonly expectedVersion: number;
    open: boolean;
}
interface SubscriberTerminalizationReceiptCell {
    readonly subscriber: SubscriberCell;
    open: boolean;
}
interface PreparedSubscriberTerminalization {
    readonly subscriber: SubscriberCell;
    readonly lease: SubscriberHandleSettlementLease;
    readonly previousPhase: 'prepared' | 'active';
    readonly previousStatus: unknown;
    readonly receipt: SubscriberTerminalizationReceipt;
    readonly receiptCell: SubscriberTerminalizationReceiptCell;
    delivered: boolean;
}
export interface SubscriberTerminalizationReceipt {
    readonly subscriberTerminalizationReceipt: true;
    readonly snapshot: SubscriberSettlementSnapshot;
}
export interface SubscriberTerminalizationFailure {
    readonly subscriber: SubscriberView;
    readonly error: unknown;
}
export interface SubscriberTerminalizationBatch {
    readonly receipts: readonly SubscriberTerminalizationReceipt[];
    readonly failures: readonly SubscriberTerminalizationFailure[];
}
export interface SubscriberOwnershipRegistry {
    createJobProjection(job: object): JobSubscriberProjection;
    prepareSubscriber(input: SubscriberPreparationInput): SubscriberPreparationOutcome;
    stageAdmission(token: unknown): SubscriberView;
    prepareActivation(token: unknown): SubscriberView;
    activateAdmission(token: unknown, status?: unknown): SubscriberView;
    rollbackAdmission(token: unknown, error: unknown, status: 'canceled' | 'failed'): boolean;
    terminalizeAdmission(token: unknown, error: unknown, status: 'canceled' | 'failed'): SubscriberTerminalizationReceipt | null;
    getPendingAbort(token: unknown): SubscriberAbortSnapshot | null;
    getPolicySubscribers(job: unknown, token?: unknown, priorityTransition?: unknown): readonly SubscriberPolicySnapshot[];
    getActiveSubscribers(job: unknown): readonly SubscriberView[];
    getRecordSubscribers(recordId: unknown): readonly SubscriberView[];
    getSubscriberJob(subscriber: unknown): object | null;
    settleSubscriber(subscriber: unknown, kind: 'resolve' | 'reject', value: unknown, status: SubscriberTerminalStatus): SubscriberSettlementSnapshot | null;
    terminalizeJobSubscribers(job: unknown, kind: 'resolve' | 'reject', value: unknown, status: SubscriberTerminalStatus): SubscriberTerminalizationBatch;
    releaseTerminalization(receipt: unknown): boolean;
    markJobRunning(job: unknown): number;
    preparePriorityChange(subscriber: unknown, priority: unknown, changedAt: unknown, reason: unknown): SubscriberPriorityChange;
    commitPriorityChange(transition: unknown): boolean;
    discardPriorityChange(transition: unknown): boolean;
}
function mapGet<Key, Value>(store: Map<Key, Value>, key: Key): Value | undefined {
    return Reflect.apply(mapGetIntrinsic, store, [key]) as Value | undefined;
}
function mapSet<Key, Value>(store: Map<Key, Value>, key: Key, value: Value): void {
    Reflect.apply(mapSetIntrinsic, store, [key, value]);
}
function mapDelete<Key, Value>(store: Map<Key, Value>, key: Key): boolean {
    return Reflect.apply(mapDeleteIntrinsic, store, [key]) as boolean;
}
function mapForEach<Key, Value>(store: Map<Key, Value>, callback: (value: Value, key: Key) => void): void {
    Reflect.apply(mapForEachIntrinsic, store, [callback]);
}
function mapSize(store: Map<unknown, unknown>): number {
    return Reflect.apply(mapSizeIntrinsic, store, []) as number;
}
function setAdd<Value>(store: Set<Value>, value: Value): void {
    Reflect.apply(setAddIntrinsic, store, [value]);
}
function setDelete<Value>(store: Set<Value>, value: Value): boolean {
    return Reflect.apply(setDeleteIntrinsic, store, [value]) as boolean;
}
function setForEach<Value>(store: Set<Value>, callback: (value: Value) => void): void {
    Reflect.apply(setForEachIntrinsic, store, [callback]);
}
function setSize(store: Set<unknown>): number {
    return Reflect.apply(setSizeIntrinsic, store, []) as number;
}
function weakMapGet<Key extends object, Value>(store: WeakMap<Key, Value>, key: Key): Value | undefined {
    return Reflect.apply(weakMapGetIntrinsic, store, [key]) as Value | undefined;
}
function weakMapSet<Key extends object, Value>(store: WeakMap<Key, Value>, key: Key, value: Value): void {
    Reflect.apply(weakMapSetIntrinsic, store, [key, value]);
}
function weakMapHas<Key extends object>(store: WeakMap<Key, unknown>, key: Key): boolean {
    return Reflect.apply(weakMapHasIntrinsic, store, [key]) as boolean;
}
function isObjectLike(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readSignalReason(signal: SubscriberSignalCandidate): unknown {
    try {
        return signal.reason;
    }
    catch (error) {
        return error;
    }
}
function isActiveCell(cell: SubscriberCell): boolean {
    return cell.phase === 'active';
}
function canRetainFailedDeadline(deadline: DeadlineLease): boolean {
    return deadline.acquisition !== 'released' && deadline.acquisition !== 'cleanup-pending';
}
function getDeadlineAcquisitionDispatch(deadline: DeadlineLease): DeadlineLease['acquisitionDispatch'] {
    return deadline.acquisitionDispatch;
}
function ownsPreparedDeadlineAcquisition(cell: SubscriberCell, deadline: DeadlineLease, acquisition: 'none' | 'attempted'): boolean {
    return (cell.phase === 'prepared' &&
        cell.staged &&
        deadline.acquisition === acquisition &&
        !deadline.releaseRequested &&
        deadline.gate.dispatch !== null);
}
export function createSubscriberOwnershipRegistry(options: SubscriberOwnershipOptions): SubscriberOwnershipRegistry {
    const { createSubscriberHandleLease, settleSubscriberHandleLease, createAbortError, normalizeRecordKey, now, scheduleDeadline, cancelDeadline, reportSecondaryError, } = options;
    const jobs = new NativeMap<object, Map<string, SubscriberCell>>();
    const records = new NativeMap<string, Set<SubscriberCell>>();
    const views = new NativeWeakMap<object, SubscriberCell>();
    const projections = new NativeWeakMap<object, JobSubscriberProjection>();
    const admissionCells = new NativeWeakMap<object, SubscriberCell>();
    const priorityTransitionCells = new NativeWeakMap<object, PriorityTransitionCell>();
    const terminalizationReceiptCells = new NativeWeakMap<object, SubscriberTerminalizationReceiptCell>();
    const deadlineCleanupPending = new NativeSet<DeadlineLease>();
    let deadlineCleanupRunning = false;
    function report(error: unknown, context: string): void {
        if (typeof reportSecondaryError !== 'function')
            return;
        try {
            reportSecondaryError(error, context);
        }
        catch {
        }
    }
    function normalizeSubscriberRecordKey(value: unknown): string {
        const key = normalizeRecordKey(value);
        if (typeof key !== 'string') {
            throw new TypeError('[TranslationService] Normalized subscriber record identity must be a string.');
        }
        return key;
    }
    function requireDeadlineNumber(value: unknown, label: string): number {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            throw new TypeError(`[TranslationService] Subscriber ${label} must be a finite nonnegative number.`);
        }
        return value;
    }
    function requireAdmission(token: unknown): SubscriberCell {
        const cell = isObjectLike(token) ? weakMapGet(admissionCells, token) : undefined;
        if (cell === undefined || !weakMapHas(views, cell.view)) {
            throw new Error('[TranslationService] Invalid subscriber admission token.');
        }
        return cell;
    }
    function getCell(subscriber: unknown): SubscriberCell | undefined {
        return isObjectLike(subscriber) ? weakMapGet(views, subscriber) : undefined;
    }
    function getJobBucket(job: object): Map<string, SubscriberCell> | undefined {
        return mapGet(jobs, job);
    }
    function activeCells(job: unknown): SubscriberCell[] {
        if (!isObjectLike(job))
            return [];
        const bucket = getJobBucket(job);
        if (bucket === undefined)
            return [];
        const result: SubscriberCell[] = [];
        mapForEach(bucket, (cell) => {
            if (cell.phase === 'active')
                result.push(cell);
        });
        return result;
    }
    function makeView(cell: SubscriberCell): SubscriberView {
        return Object.freeze({
            id: cell.id,
            job: cell.job,
            jobId: cell.jobId,
            key: cell.key,
            get active() {
                return cell.phase === 'active';
            },
            get phase() {
                return cell.phase;
            },
            get status() {
                return cell.status;
            },
            get priority() {
                return cell.priority;
            },
            stream: cell.stream,
            timeoutMs: cell.timeoutMs,
            onDelta: cell.onDelta,
            onTranslatorExchange: cell.onTranslatorExchange,
            recordId: cell.recordKey,
            hook: cell.hook,
            source: cell.source,
            metadata: cell.metadata,
            createdAt: cell.createdAt,
            get lastPriorityChangedAt() {
                return cell.lastPriorityChangedAt;
            },
            get lastPriorityReason() {
                return cell.lastPriorityReason;
            },
            context: cell.context,
        });
    }
    function createJobProjection(job: object): JobSubscriberProjection {
        const existing = weakMapGet(projections, job);
        if (existing !== undefined)
            return existing;
        function snapshot(): SubscriberView[] {
            return activeCells(job).map((cell) => cell.view);
        }
        function getActiveView(id: unknown): SubscriberView | undefined {
            if (typeof id !== 'string')
                return undefined;
            const bucket = getJobBucket(job);
            if (bucket === undefined)
                return undefined;
            const cell = mapGet(bucket, id);
            return cell?.phase === 'active' ? cell.view : undefined;
        }
        function entries(): IterableIterator<[
            string,
            SubscriberView
        ]> {
            const result = snapshot().map((subscriber): [
                string,
                SubscriberView
            ] => [subscriber.id, subscriber]);
            return result[Symbol.iterator]();
        }
        const projection: JobSubscriberProjection = Object.freeze({
            get size() {
                return activeCells(job).length;
            },
            get(id: unknown) {
                return getActiveView(id);
            },
            has(id: unknown) {
                return getActiveView(id) !== undefined;
            },
            values() {
                return snapshot()[Symbol.iterator]();
            },
            keys() {
                const result = snapshot().map((subscriber) => subscriber.id);
                return result[Symbol.iterator]();
            },
            entries() {
                return entries();
            },
            forEach(callback: (subscriber: SubscriberView, id: string, owner: JobSubscriberProjection) => void) {
                for (const subscriber of snapshot())
                    callback(subscriber, subscriber.id, projection);
            },
            [Symbol.iterator]() {
                return entries();
            },
        });
        weakMapSet(projections, job, projection);
        return projection;
    }
    function neutralizeSignal(cell: SubscriberCell): void {
        const signal = cell.signal;
        if (signal !== null)
            signal.gate.dispatch = null;
    }
    function neutralizeDeadline(cell: SubscriberCell): void {
        cell.deadline.gate.dispatch = null;
    }
    function releaseSignal(cell: SubscriberCell): void {
        const signal = cell.signal;
        if (signal === null)
            return;
        cell.signal = null;
        signal.gate.dispatch = null;
        if (signal.acquisition === 'none' || signal.acquisition === 'released')
            return;
        signal.acquisition = 'released';
        try {
            Reflect.apply(signal.remove, signal.owner, ['abort', signal.handler]);
        }
        catch (error) {
            report(error, 'subscriber-signal-release');
        }
    }
    function attemptDeadlineCleanup(deadline: DeadlineLease): boolean {
        if (deadline.acquisition !== 'cleanup-pending')
            return deadline.acquisition === 'released';
        try {
            cancelDeadline(deadline.handle);
            deadline.acquisition = 'released';
            deadline.releaseRequested = false;
            setDelete(deadlineCleanupPending, deadline);
            return true;
        }
        catch (error) {
            deadline.failure = error;
            setAdd(deadlineCleanupPending, deadline);
            report(error, 'subscriber-deadline-release');
            return false;
        }
    }
    function runDeadlineCleanup(deadline: DeadlineLease): boolean {
        if (deadlineCleanupRunning) {
            setAdd(deadlineCleanupPending, deadline);
            return false;
        }
        deadlineCleanupRunning = true;
        try {
            return attemptDeadlineCleanup(deadline);
        }
        finally {
            deadlineCleanupRunning = false;
        }
    }
    function retryDeadlineCleanup(): void {
        if (deadlineCleanupRunning)
            return;
        deadlineCleanupRunning = true;
        const pending: DeadlineLease[] = [];
        try {
            setForEach(deadlineCleanupPending, (deadline) => {
                pending.push(deadline);
            });
            for (const deadline of pending)
                attemptDeadlineCleanup(deadline);
        }
        finally {
            deadlineCleanupRunning = false;
        }
    }
    function releaseDeadline(cell: SubscriberCell): void {
        const deadline = cell.deadline;
        if (deadline.acquisition === 'released')
            return;
        deadline.gate.dispatch = null;
        deadline.releaseRequested = true;
        if (deadline.acquisition === 'none') {
            deadline.acquisition = 'released';
            deadline.releaseRequested = false;
            return;
        }
        if (deadline.acquisition === 'attempted') {
            return;
        }
        deadline.acquisition = 'cleanup-pending';
        runDeadlineCleanup(deadline);
    }
    function getDeadlineTimerDelay(deadline: DeadlineLease, clock: number): number {
        const remaining = deadline.deadlineAt - clock;
        if (remaining <= 0)
            return 0;
        return remaining > MAX_DEADLINE_TIMER_DELAY_MS ? MAX_DEADLINE_TIMER_DELAY_MS : remaining;
    }
    function ownsDeadlineAcquisition(cell: SubscriberCell, deadline: DeadlineLease, generation: number, phase: 'prepared' | 'active'): boolean {
        return (cell.phase === phase &&
            cell.staged &&
            deadline.generation === generation &&
            deadline.acquisition === 'attempted' &&
            !deadline.releaseRequested &&
            deadline.gate.dispatch !== null);
    }
    function cleanupReturnedDeadlineHandle(deadline: DeadlineLease, handle: unknown): void {
        deadline.handle = handle;
        deadline.acquisition = 'cleanup-pending';
        runDeadlineCleanup(deadline);
    }
    function acquireDeadlineTimer(cell: SubscriberCell, deadline: DeadlineLease, phase: 'prepared' | 'active', clock: number): void {
        const generation = deadline.generation + 1;
        deadline.generation = generation;
        deadline.acquisition = 'attempted';
        deadline.acquisitionDispatch = 'none';
        const handler = (): void => {
            const operation = deadline.gate.dispatch;
            if (operation !== null)
                Reflect.apply(operation, undefined, [generation]);
        };
        let handle: unknown;
        try {
            handle = scheduleDeadline(handler, getDeadlineTimerDelay(deadline, clock));
        }
        catch (error) {
            if (deadline.generation === generation) {
                deadline.gate.dispatch = null;
                deadline.failure = error;
                deadline.acquisitionDispatch = 'failed';
                deadline.acquisition = cell.phase === 'active' && !deadline.releaseRequested ? 'failed' : 'released';
                deadline.releaseRequested = false;
            }
            report(error, 'subscriber-deadline-acquisition');
            throw error;
        }
        if (deadline.generation !== generation) {
            cleanupReturnedDeadlineHandle(deadline, handle);
            throw new Error('[TranslationService] Subscriber deadline generation changed during acquisition.');
        }
        if (getDeadlineAcquisitionDispatch(deadline) !== 'none') {
            const failure = deadline.failure ??
                new Error('[TranslationService] Subscriber deadline scheduler fired before its deadline.');
            deadline.failure = failure;
            deadline.gate.dispatch = null;
            cleanupReturnedDeadlineHandle(deadline, handle);
            throw failure;
        }
        if (!ownsDeadlineAcquisition(cell, deadline, generation, phase)) {
            cleanupReturnedDeadlineHandle(deadline, handle);
            throw new Error('[TranslationService] Subscriber admission ended during deadline acquisition.');
        }
        deadline.handle = handle;
        deadline.acquisition = 'owned';
    }
    function failDeadlineDispatch(cell: SubscriberCell, deadline: DeadlineLease, acquisition: 'attempted' | 'owned', error: unknown, context: string): void {
        deadline.failure = error;
        if (acquisition === 'attempted') {
            deadline.acquisitionDispatch = 'failed';
        }
        else if (isActiveCell(cell)) {
            deadline.acquisition = 'failed';
        }
        report(error, context);
    }
    function dispatchDeadline(cell: SubscriberCell, deadline: DeadlineLease, generationValue: unknown): void {
        if (typeof generationValue !== 'number' || generationValue !== deadline.generation)
            return;
        const acquisition = deadline.acquisition;
        if (acquisition !== 'attempted' && acquisition !== 'owned')
            return;
        let clock: number;
        try {
            clock = requireDeadlineNumber(now(), 'expiration clock');
        }
        catch (error) {
            failDeadlineDispatch(cell, deadline, acquisition, error, 'subscriber-deadline-clock');
            return;
        }
        if (deadline.generation !== generationValue ||
            deadline.acquisition !== acquisition ||
            deadline.gate.dispatch === null ||
            (cell.phase !== 'prepared' && cell.phase !== 'active')) {
            return;
        }
        if (clock < deadline.deadlineAt) {
            if (acquisition === 'attempted') {
                deadline.failure = new Error('[TranslationService] Subscriber deadline scheduler fired before its deadline.');
                deadline.acquisitionDispatch = 'early';
                return;
            }
            if (!isActiveCell(cell)) {
                failDeadlineDispatch(cell, deadline, acquisition, new Error('[TranslationService] Prepared subscriber deadline fired before its deadline.'), 'subscriber-deadline-clock');
                return;
            }
            deadline.acquisition = 'fired';
            try {
                acquireDeadlineTimer(cell, deadline, 'active', clock);
            }
            catch (error) {
                if (isActiveCell(cell) && canRetainFailedDeadline(deadline)) {
                    deadline.acquisition = 'failed';
                    deadline.failure = error;
                }
                report(error, 'subscriber-deadline-reschedule');
            }
            return;
        }
        if (cell.phase === 'prepared') {
            deadline.pendingAbort = deadline.abort;
            if (acquisition === 'owned')
                deadline.acquisition = 'fired';
            return;
        }
        if (acquisition === 'owned')
            deadline.acquisition = 'fired';
        try {
            const expired = Reflect.apply(cell.expireActive, undefined, [cell.view, deadline.abort.error]);
            if (expired === true || !isActiveCell(cell))
                return;
            throw new Error('[TranslationService] Subscriber deadline did not terminalize its subscriber.');
        }
        catch (error) {
            failDeadlineDispatch(cell, deadline, acquisition, error, 'subscriber-deadline-cancel');
        }
    }
    function removeMembership(cell: SubscriberCell): void {
        if (!cell.staged)
            return;
        const jobBucket = getJobBucket(cell.job);
        if (jobBucket !== undefined && mapGet(jobBucket, cell.id) === cell) {
            mapDelete(jobBucket, cell.id);
            if (mapSize(jobBucket) === 0 && getJobBucket(cell.job) === jobBucket)
                mapDelete(jobs, cell.job);
        }
        if (cell.recordKey) {
            const recordBucket = mapGet(records, cell.recordKey);
            if (recordBucket !== undefined) {
                setDelete(recordBucket, cell);
                if (setSize(recordBucket) === 0 && mapGet(records, cell.recordKey) === recordBucket) {
                    mapDelete(records, cell.recordKey);
                }
            }
        }
        cell.staged = false;
    }
    function createSettlementSnapshot(cell: SubscriberCell, status: SubscriberTerminalStatus): SubscriberSettlementSnapshot {
        return Object.freeze({
            subscriber: cell.view,
            job: cell.job,
            id: cell.id,
            jobId: cell.jobId,
            key: cell.key,
            recordId: cell.recordKey,
            hook: cell.hook,
            context: cell.context,
            status,
        });
    }
    function terminalizeCells(cells: readonly SubscriberCell[], kind: 'resolve' | 'reject', value: unknown, status: SubscriberTerminalStatus): SubscriberTerminalizationBatch {
        const prepared: PreparedSubscriberTerminalization[] = [];
        const receipts: SubscriberTerminalizationReceipt[] = [];
        const failures: SubscriberTerminalizationFailure[] = [];
        for (const cell of cells) {
            if (cell.phase !== 'active' && cell.phase !== 'prepared')
                continue;
            const lease = cell.lease;
            if (lease === null) {
                failures.push(Object.freeze({
                    subscriber: cell.view,
                    error: new Error('[TranslationService] Subscriber handle lease is unavailable.'),
                }));
                continue;
            }
            const snapshot = createSettlementSnapshot(cell, status);
            const receipt = Object.freeze({
                subscriberTerminalizationReceipt: true as const,
                snapshot,
            });
            const receiptCell: SubscriberTerminalizationReceiptCell = { subscriber: cell, open: false };
            weakMapSet(terminalizationReceiptCells, receipt, receiptCell);
            prepared.push({
                subscriber: cell,
                lease,
                previousPhase: cell.phase,
                previousStatus: cell.status,
                receipt,
                receiptCell,
                delivered: false,
            });
        }
        for (const plan of prepared) {
            plan.subscriber.phase = 'settling';
            plan.subscriber.status = status;
        }
        for (const plan of prepared) {
            try {
                if (!settleSubscriberHandleLease(plan.lease, kind, value)) {
                    throw new Error('[TranslationService] Subscriber handle lease was already settled.');
                }
                plan.delivered = true;
            }
            catch (error) {
                failures.push(Object.freeze({ subscriber: plan.subscriber.view, error }));
            }
        }
        for (const plan of prepared) {
            const cell = plan.subscriber;
            if (!plan.delivered) {
                cell.status = plan.previousStatus;
                cell.phase = plan.previousPhase;
                continue;
            }
            cell.lease = null;
            cell.phase = 'terminal';
            if (cell.openPriorityTransition !== null) {
                cell.openPriorityTransition.open = false;
                cell.openPriorityTransition = null;
            }
            neutralizeSignal(cell);
            neutralizeDeadline(cell);
            removeMembership(cell);
            plan.receiptCell.open = true;
            receipts.push(plan.receipt);
        }
        return Object.freeze({
            receipts: Object.freeze(receipts),
            failures: Object.freeze(failures),
        });
    }
    function releaseTerminalization(receipt: unknown): boolean {
        const receiptCell = isObjectLike(receipt) ? weakMapGet(terminalizationReceiptCells, receipt) : undefined;
        if (!receiptCell?.open)
            return false;
        receiptCell.open = false;
        retryDeadlineCleanup();
        releaseDeadline(receiptCell.subscriber);
        releaseSignal(receiptCell.subscriber);
        return true;
    }
    function settleCell(cell: SubscriberCell, kind: 'resolve' | 'reject', value: unknown, status: SubscriberTerminalStatus): SubscriberSettlementSnapshot | null {
        if (cell.phase !== 'active' && cell.phase !== 'prepared')
            return null;
        const batch = terminalizeCells([cell], kind, value, status);
        const receipt = batch.receipts[0];
        if (receipt === undefined) {
            const failure = batch.failures[0]?.error;
            if (failure instanceof Error)
                throw failure;
            throw new Error('[TranslationService] Subscriber terminal delivery failed.');
        }
        releaseTerminalization(receipt);
        return receipt.snapshot;
    }
    function prepareSubscriber(input: SubscriberPreparationInput): SubscriberPreparationOutcome {
        retryDeadlineCleanup();
        if (!isObjectLike(input) || !isObjectLike(input.job)) {
            throw new TypeError('[TranslationService] Subscriber preparation requires a job and input object.');
        }
        if (typeof input.id !== 'string' || input.id.length === 0) {
            throw new TypeError('[TranslationService] Subscriber identity must be a nonempty string.');
        }
        if (typeof input.cancelActive !== 'function' ||
            typeof input.expireActive !== 'function' ||
            typeof input.setPriorityActive !== 'function') {
            throw new TypeError('[TranslationService] Subscriber controls must be functions.');
        }
        const jobCandidate = input.job as SubscriberJobCandidate;
        const jobId = jobCandidate.id;
        if (typeof jobId !== 'string' || jobId.length === 0) {
            throw new TypeError('[TranslationService] Subscriber job identity must be a nonempty string.');
        }
        const key = jobCandidate.key;
        if (typeof key !== 'string' || key.length === 0) {
            throw new TypeError('[TranslationService] Subscriber job key must be a nonempty string.');
        }
        const recordKey = normalizeSubscriberRecordKey(input.recordId);
        const createdAt = requireDeadlineNumber(input.createdAt, 'creation time');
        const timeoutMs = requireDeadlineNumber(input.timeoutMs, 'timeout');
        const deadlineStartedAt = requireDeadlineNumber(now(), 'deadline clock');
        const deadlineAt = deadlineStartedAt + timeoutMs;
        if (!Number.isFinite(deadlineAt)) {
            throw new TypeError('[TranslationService] Subscriber deadline exceeds the finite clock range.');
        }
        const deadlineReason = 'subscriber deadline exceeded';
        const deadlineError = createAbortError(deadlineReason);
        const deadlineAbort: SubscriberDeadlineAbortSnapshot = Object.freeze({
            kind: 'deadline',
            reason: deadlineReason,
            error: deadlineError,
        });
        let signalOwner: object | null = null;
        let signalAdd: RuntimeFunction | null = null;
        let signalRemove: RuntimeFunction | null = null;
        let signalAborted = false;
        let signalReason: unknown;
        const signalInput = input.signal;
        if (signalInput !== null && signalInput !== undefined) {
            if (!isObjectLike(signalInput)) {
                throw new TypeError('[TranslationService] An abort signal must be an object.');
            }
            const signal = signalInput as SubscriberSignalCandidate;
            const add = signal.addEventListener;
            const remove = signal.removeEventListener;
            if (typeof add !== 'function' || typeof remove !== 'function') {
                throw new TypeError('[TranslationService] An abort signal must expose add and remove functions.');
            }
            signalOwner = signalInput;
            signalAdd = add as RuntimeFunction;
            signalRemove = remove as RuntimeFunction;
            signalAborted = !!signal.aborted;
            if (signalAborted)
                signalReason = readSignalReason(signal);
        }
        let cell = null as unknown as SubscriberCell;
        const deadlineGate: DeadlineDispatchGate = { dispatch: null };
        const deadline: DeadlineLease = {
            deadlineAt,
            abort: deadlineAbort,
            gate: deadlineGate,
            acquisition: 'none',
            generation: 0,
            handle: undefined,
            pendingAbort: null,
            acquisitionDispatch: 'none',
            failure: undefined,
            releaseRequested: false,
        };
        const viewPlaceholder = {} as SubscriberView;
        cell = {
            id: input.id,
            job: input.job,
            jobId,
            key,
            recordKey,
            stream: input.stream,
            timeoutMs,
            onDelta: input.onDelta,
            onTranslatorExchange: input.onTranslatorExchange,
            hook: input.hook,
            source: input.source,
            sourceHint: input.sourceHint,
            metadata: input.metadata,
            createdAt,
            context: input.context,
            cancelActive: input.cancelActive,
            expireActive: input.expireActive,
            setPriorityActive: input.setPriorityActive,
            view: viewPlaceholder,
            lease: null,
            signal: null,
            deadline,
            phase: 'prepared',
            status: input.initialStatus,
            priority: input.priority,
            lastPriorityChangedAt: null,
            lastPriorityReason: '',
            priorityVersion: 0,
            openPriorityTransition: null,
            staged: false,
        };
        deadlineGate.dispatch = (generation: unknown): void => {
            dispatchDeadline(cell, deadline, generation);
        };
        const view = makeView(cell);
        Object.defineProperty(cell, 'view', { value: view, writable: false, configurable: false });
        weakMapSet(views, view, cell);
        const controls = Object.freeze({
            cancel: (reason?: unknown, controlOptions?: unknown): unknown => {
                if (cell.phase !== 'active')
                    return false;
                return Reflect.apply(cell.cancelActive, undefined, [cell.view, reason, controlOptions]);
            },
            setPriority: (priority?: unknown, reason?: unknown): unknown => {
                if (cell.phase !== 'active')
                    return false;
                return Reflect.apply(cell.setPriorityActive, undefined, [cell.view, priority, reason]);
            },
            getPriority: (): unknown => cell.priority,
            getStatus: (): unknown => cell.status,
            getSourceHint: (): unknown => cell.sourceHint,
        });
        const lease = createSubscriberHandleLease(Object.freeze({
            id: cell.id,
            jobId: cell.jobId,
            key: cell.key,
            sourceHint: cell.sourceHint,
            stream: cell.stream,
        }), controls);
        cell.lease = lease;
        if (signalOwner !== null && signalAdd !== null && signalRemove !== null) {
            const owner = signalOwner;
            const signal = owner as SubscriberSignalCandidate;
            const gate: SignalDispatchGate = { dispatch: null };
            const dispatch = (): void => {
                const reason = readSignalReason(signal);
                if (cell.phase === 'prepared') {
                    const signalLease = cell.signal;
                    if (signalLease !== null)
                        signalLease.pendingAbort ??= Object.freeze({ kind: 'signal', reason });
                    return;
                }
                if (cell.phase === 'active') {
                    try {
                        Reflect.apply(cell.cancelActive, undefined, [cell.view, reason, { abortJob: true }]);
                        if (isActiveCell(cell)) {
                            throw new Error('[TranslationService] Active signal cancellation did not terminalize its subscriber.');
                        }
                    }
                    catch (primary) {
                        if (isActiveCell(cell)) {
                            try {
                                settleCell(cell, 'reject', primary, 'failed');
                            }
                            catch (secondary) {
                                report(secondary, 'subscriber-signal-cancel-settlement');
                            }
                        }
                        report(primary, 'subscriber-signal-cancel');
                    }
                }
            };
            gate.dispatch = dispatch;
            const handler = (): void => {
                const operation = gate.dispatch;
                if (operation !== null)
                    Reflect.apply(operation, undefined, []);
            };
            cell.signal = {
                owner,
                add: signalAdd,
                remove: signalRemove,
                handler,
                gate,
                acquisition: 'none',
                pendingAbort: signalAborted ? Object.freeze({ kind: 'signal', reason: signalReason }) : null,
            };
        }
        if (signalAborted) {
            let error: unknown;
            try {
                error = createAbortError(signalReason);
            }
            catch (creationError) {
                settleCell(cell, 'reject', creationError, 'failed');
                throw creationError;
            }
            settleCell(cell, 'reject', error, 'canceled');
            return Object.freeze({ kind: 'canceled', handle: lease.handle, subscriber: cell.view });
        }
        const signalLease = cell.signal;
        if (signalLease !== null) {
            signalLease.acquisition = 'attempted';
            try {
                Reflect.apply(signalLease.add, signalLease.owner, ['abort', signalLease.handler, { once: true }]);
                signalLease.acquisition = 'owned';
                if (!signalLease.pendingAbort && (signalLease.owner as SubscriberSignalCandidate).aborted) {
                    signalLease.pendingAbort = Object.freeze({
                        kind: 'signal',
                        reason: readSignalReason(signalLease.owner as SubscriberSignalCandidate),
                    });
                }
            }
            catch (primary) {
                try {
                    settleCell(cell, 'reject', primary, 'failed');
                }
                catch (secondary) {
                    report(secondary, 'subscriber-signal-acquisition-settlement');
                }
                throw primary;
            }
            if (signalLease.pendingAbort !== null) {
                let error: unknown;
                try {
                    error = createAbortError(signalLease.pendingAbort.reason);
                }
                catch (creationError) {
                    settleCell(cell, 'reject', creationError, 'failed');
                    throw creationError;
                }
                settleCell(cell, 'reject', error, 'canceled');
                return Object.freeze({ kind: 'canceled', handle: lease.handle, subscriber: cell.view });
            }
        }
        const token = Object.freeze({ subscriberAdmissionToken: true as const });
        weakMapSet(admissionCells, token, cell);
        return Object.freeze({ kind: 'prepared', token, handle: lease.handle, subscriber: cell.view });
    }
    function stageAdmission(token: unknown): SubscriberView {
        const cell = requireAdmission(token);
        if (cell.phase !== 'prepared' || cell.staged) {
            throw new Error('[TranslationService] Subscriber admission is not ready to stage.');
        }
        if (cell.signal?.pendingAbort) {
            throw new Error('[TranslationService] Subscriber admission was aborted before staging.');
        }
        let jobBucket = getJobBucket(cell.job);
        if (jobBucket === undefined) {
            jobBucket = new NativeMap<string, SubscriberCell>();
            mapSet(jobs, cell.job, jobBucket);
        }
        if (mapGet(jobBucket, cell.id) !== undefined) {
            throw new Error('[TranslationService] Subscriber identity is already active for this job.');
        }
        mapSet(jobBucket, cell.id, cell);
        if (cell.recordKey) {
            let recordBucket = mapGet(records, cell.recordKey);
            if (recordBucket === undefined) {
                recordBucket = new NativeSet<SubscriberCell>();
                mapSet(records, cell.recordKey, recordBucket);
            }
            setAdd(recordBucket, cell);
        }
        cell.staged = true;
        return cell.view;
    }
    function prepareActivation(token: unknown): SubscriberView {
        const cell = requireAdmission(token);
        if (cell.phase !== 'prepared' || !cell.staged) {
            throw new Error('[TranslationService] Subscriber admission is not ready for activation.');
        }
        if (cell.signal?.pendingAbort || cell.deadline.pendingAbort) {
            throw new Error('[TranslationService] Subscriber admission ended before deadline acquisition.');
        }
        const deadline = cell.deadline;
        if (deadline.acquisition !== 'none') {
            throw new Error('[TranslationService] Subscriber deadline has already been acquired.');
        }
        const clock = requireDeadlineNumber(now(), 'activation clock');
        if (!ownsPreparedDeadlineAcquisition(cell, deadline, 'none')) {
            throw new Error('[TranslationService] Subscriber admission ended during deadline clock acquisition.');
        }
        acquireDeadlineTimer(cell, deadline, 'prepared', clock);
        return cell.view;
    }
    function activateAdmission(token: unknown, status?: unknown): SubscriberView {
        const cell = requireAdmission(token);
        if (cell.phase !== 'prepared' ||
            !cell.staged ||
            cell.deadline.acquisition !== 'owned' ||
            cell.deadline.pendingAbort !== null ||
            cell.signal?.pendingAbort) {
            throw new Error('[TranslationService] Subscriber admission cannot become active.');
        }
        if (arguments.length >= 2)
            cell.status = status;
        cell.phase = 'active';
        return cell.view;
    }
    function terminalizeAdmission(token: unknown, error: unknown, status: 'canceled' | 'failed'): SubscriberTerminalizationReceipt | null {
        const cell = requireAdmission(token);
        if (cell.phase !== 'prepared' && cell.phase !== 'active')
            return null;
        const batch = terminalizeCells([cell], 'reject', error, status);
        const receipt = batch.receipts[0];
        if (receipt === undefined) {
            const failure = batch.failures[0]?.error;
            if (failure instanceof Error)
                throw failure;
            throw new Error('[TranslationService] Subscriber admission terminal delivery failed.');
        }
        return receipt;
    }
    function rollbackAdmission(token: unknown, error: unknown, status: 'canceled' | 'failed'): boolean {
        const receipt = terminalizeAdmission(token, error, status);
        if (receipt === null)
            return false;
        releaseTerminalization(receipt);
        return true;
    }
    function getPendingAbort(token: unknown): SubscriberAbortSnapshot | null {
        const cell = requireAdmission(token);
        const signalAbort = cell.signal?.pendingAbort;
        if (signalAbort !== null && signalAbort !== undefined)
            return signalAbort;
        return cell.deadline.pendingAbort;
    }
    function getOpenPriorityTransition(value: unknown): PriorityTransitionCell | undefined {
        const transition = isObjectLike(value) ? weakMapGet(priorityTransitionCells, value) : undefined;
        if (transition === undefined ||
            !transition.open ||
            transition.subscriber.phase !== 'active' ||
            transition.subscriber.openPriorityTransition !== transition ||
            transition.subscriber.priorityVersion !== transition.expectedVersion) {
            return undefined;
        }
        return transition;
    }
    function createPolicySnapshot(cell: SubscriberCell, priority: unknown): SubscriberPolicySnapshot {
        return Object.freeze({
            priority,
            stream: cell.stream,
            timeoutMs: cell.timeoutMs,
        });
    }
    function getPolicySubscribers(job: unknown, token?: unknown, priorityTransition?: unknown): readonly SubscriberPolicySnapshot[] {
        const transition = priorityTransition === undefined ? undefined : getOpenPriorityTransition(priorityTransition);
        if (priorityTransition !== undefined && transition === undefined) {
            throw new Error('[TranslationService] Subscriber priority transition is not open.');
        }
        if (transition !== undefined && transition.subscriber.job !== job) {
            throw new Error('[TranslationService] Subscriber priority transition belongs to another job.');
        }
        const result = activeCells(job).map((cell) => createPolicySnapshot(cell, cell === transition?.subscriber ? transition.nextPriority : cell.priority));
        if (token !== undefined) {
            const cell = requireAdmission(token);
            if (cell.job !== job || cell.phase !== 'prepared' || !cell.staged) {
                throw new Error('[TranslationService] Subscriber admission does not belong to this policy job.');
            }
            result.push(createPolicySnapshot(cell, cell.priority));
        }
        return Object.freeze(result);
    }
    function getActiveSubscribers(job: unknown): readonly SubscriberView[] {
        return Object.freeze(activeCells(job).map((cell) => cell.view));
    }
    function getRecordSubscribers(recordId: unknown): readonly SubscriberView[] {
        const key = normalizeSubscriberRecordKey(recordId);
        if (!key)
            return Object.freeze([]);
        const bucket = mapGet(records, key);
        if (bucket === undefined)
            return Object.freeze([]);
        const result: SubscriberView[] = [];
        setForEach(bucket, (cell) => {
            if (cell.phase === 'active')
                result.push(cell.view);
        });
        return Object.freeze(result);
    }
    function getSubscriberJob(subscriber: unknown): object | null {
        return getCell(subscriber)?.job ?? null;
    }
    function settleSubscriber(subscriber: unknown, kind: 'resolve' | 'reject', value: unknown, status: SubscriberTerminalStatus): SubscriberSettlementSnapshot | null {
        const cell = getCell(subscriber);
        if (cell?.phase !== 'active')
            return null;
        return settleCell(cell, kind, value, status);
    }
    function terminalizeJobSubscribers(job: unknown, kind: 'resolve' | 'reject', value: unknown, status: SubscriberTerminalStatus): SubscriberTerminalizationBatch {
        return terminalizeCells(activeCells(job), kind, value, status);
    }
    function markJobRunning(job: unknown): number {
        const cells = activeCells(job);
        for (const cell of cells)
            cell.status = 'running';
        return cells.length;
    }
    function preparePriorityChange(subscriber: unknown, priority: unknown, changedAt: unknown, reason: unknown): SubscriberPriorityChange {
        const cell = getCell(subscriber);
        if (cell?.phase !== 'active' || cell.priority === priority) {
            return Object.freeze({
                changed: false,
                subscriber: cell?.view ?? null,
                job: cell?.job ?? null,
                previousPriority: cell?.priority,
                priority: cell?.priority,
                transition: null,
            });
        }
        if (cell.openPriorityTransition !== null) {
            throw new Error('[TranslationService] Subscriber priority already has a prepared transition.');
        }
        const previousPriority = cell.priority;
        const transition = Object.freeze({ subscriberPriorityTransition: true as const });
        const transitionCell: PriorityTransitionCell = {
            subscriber: cell,
            nextPriority: priority,
            nextChangedAt: changedAt,
            nextReason: reason,
            previousPriority,
            expectedVersion: cell.priorityVersion,
            open: true,
        };
        weakMapSet(priorityTransitionCells, transition, transitionCell);
        cell.openPriorityTransition = transitionCell;
        return Object.freeze({
            changed: true,
            subscriber: cell.view,
            job: cell.job,
            previousPriority,
            priority,
            transition,
        });
    }
    function commitPriorityChange(transition: unknown): boolean {
        const transitionCell = getOpenPriorityTransition(transition);
        if (transitionCell === undefined)
            return false;
        const cell = transitionCell.subscriber;
        cell.priority = transitionCell.nextPriority;
        cell.lastPriorityChangedAt = transitionCell.nextChangedAt;
        cell.lastPriorityReason = transitionCell.nextReason;
        cell.priorityVersion += 1;
        cell.openPriorityTransition = null;
        transitionCell.open = false;
        return true;
    }
    function discardPriorityChange(transition: unknown): boolean {
        const transitionCell = getOpenPriorityTransition(transition);
        if (transitionCell === undefined)
            return false;
        transitionCell.open = false;
        const cell = transitionCell.subscriber;
        cell.openPriorityTransition = null;
        return true;
    }
    return Object.freeze({
        createJobProjection,
        prepareSubscriber,
        stageAdmission,
        prepareActivation,
        activateAdmission,
        rollbackAdmission,
        terminalizeAdmission,
        getPendingAbort,
        getPolicySubscribers,
        getActiveSubscribers,
        getRecordSubscribers,
        getSubscriberJob,
        settleSubscriber,
        terminalizeJobSubscribers,
        releaseTerminalization,
        markJobRunning,
        preparePriorityChange,
        commitPriorityChange,
        discardPriorityChange,
    });
}
