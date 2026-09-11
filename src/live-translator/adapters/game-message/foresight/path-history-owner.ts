import type { ForesightBranchPathCodec } from './branch-path-codec.js';
import { finiteNumber, nonEmptyString } from './utils.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
type BranchVisitIndex = Map<string, Set<unknown>>;
type PathVisitIndex = Map<unknown, BranchVisitIndex>;
interface ReturnStopCandidate {
    readonly guardId?: unknown;
}
export interface ForesightStopTransitionResult {
    readonly requeue: false;
    readonly index: number | null;
}
export interface ForesightPathHistoryDependencies {
    readonly branchPaths: ForesightBranchPathCodec;
    readonly performance?: unknown;
}
export interface ForesightPathHistoryOwner {
    readonly hasVisitedPathPosition: (path: unknown, frame: unknown, index: unknown) => boolean;
    readonly rememberPathPosition: (path: unknown, frame: unknown, index: unknown) => void;
    readonly mergeVisitedPathPositions: (target: unknown, source: unknown) => void;
    readonly stopScanPath: (path: unknown, scan: unknown, stopReason: unknown, index: unknown) => ForesightStopTransitionResult;
    readonly appendScanStopReason: (scan: unknown, stopReason: unknown) => void;
    readonly isBarrierStopReason: (stopReason: unknown) => boolean;
}
function isObjectRecord(value: unknown): value is object & PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
const IntrinsicMap = Map;
const IntrinsicObject = Object;
const IntrinsicSet = Set;
const IntrinsicWeakMap = WeakMap;
const objectFreezeIntrinsic = Object.freeze;
const objectGetOwnPropertyDescriptorIntrinsic = Object.getOwnPropertyDescriptor;
const reflectApplyIntrinsic = Reflect.apply;
const reflectGetIntrinsic = Reflect.get;
function captureMethod(target: object, key: PropertyKey): RuntimeFunction {
    const descriptor = objectGetOwnPropertyDescriptorIntrinsic(target, key);
    const method: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof method !== 'function')
        throw new TypeError(`[Foresight] Missing path-history intrinsic ${String(key)}.`);
    return method as RuntimeFunction;
}
const mapForEachIntrinsic = captureMethod(IntrinsicMap.prototype, 'forEach');
const mapGetIntrinsic = captureMethod(IntrinsicMap.prototype, 'get');
const mapSetIntrinsic = captureMethod(IntrinsicMap.prototype, 'set');
const setAddIntrinsic = captureMethod(IntrinsicSet.prototype, 'add');
const setForEachIntrinsic = captureMethod(IntrinsicSet.prototype, 'forEach');
const setHasIntrinsic = captureMethod(IntrinsicSet.prototype, 'has');
const weakMapGetIntrinsic = captureMethod(IntrinsicWeakMap.prototype, 'get');
const weakMapSetIntrinsic = captureMethod(IntrinsicWeakMap.prototype, 'set');
function callIntrinsic<Result>(method: RuntimeFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApplyIntrinsic(method, receiver, args) as Result;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return callIntrinsic<Readonly<Value>>(objectFreezeIntrinsic, IntrinsicObject, [value]);
}
function mapGet<Key, Value>(map: Map<Key, Value>, key: Key): Value | undefined {
    return callIntrinsic<Value | undefined>(mapGetIntrinsic, map, [key]);
}
function mapSet<Key, Value>(map: Map<Key, Value>, key: Key, value: Value): void {
    callIntrinsic(mapSetIntrinsic, map, [key, value]);
}
function mapForEach<Key, Value>(map: Map<Key, Value>, callback: (value: Value, key: Key) => void): void {
    callIntrinsic(mapForEachIntrinsic, map, [callback]);
}
function setAdd<Value>(set: Set<Value>, value: Value): void {
    callIntrinsic(setAddIntrinsic, set, [value]);
}
function setForEach<Value>(set: Set<Value>, callback: (value: Value) => void): void {
    callIntrinsic(setForEachIntrinsic, set, [callback]);
}
function setHas<Value>(set: Set<Value>, value: Value): boolean {
    return callIntrinsic<boolean>(setHasIntrinsic, set, [value]);
}
function weakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return callIntrinsic<Value | undefined>(weakMapGetIntrinsic, map, [key]);
}
function weakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    callIntrinsic(weakMapSetIntrinsic, map, [key, value]);
}
function requireRecord(value: unknown, name: string): object & PropertyBag {
    if (!isObjectRecord(value))
        throw new TypeError(`[Foresight] ${name} must be an object.`);
    return value;
}
function field(value: unknown, key: PropertyKey): unknown {
    return isObjectRecord(value) ? reflectGetIntrinsic(value, key) : undefined;
}
function arraySnapshot(value: unknown): unknown[] {
    return Array.isArray(value) ? value.slice() : [];
}
function stopReasonSnapshot(value: unknown): readonly string[] {
    return freezeExact(arraySnapshot(value).map((reason) => nonEmptyString(reason) || 'barrier-command'));
}
function blockedGuardSnapshot(value: unknown): Readonly<Record<string, string>> {
    const snapshot: Record<string, string> = {};
    if (!isObjectRecord(value))
        return freezeExact(snapshot);
    for (const key of Object.keys(value)) {
        const reason = field(value, key);
        if (typeof reason === 'string' && reason)
            snapshot[key] = reason;
    }
    return freezeExact(snapshot);
}
function capturePerformanceCounter(performance: unknown): ((name: string, amount: number) => void) | null {
    if (!isObjectRecord(performance))
        return null;
    let candidate: unknown;
    try {
        candidate = reflectGetIntrinsic(performance, 'count');
    }
    catch {
        return null;
    }
    if (typeof candidate !== 'function')
        return null;
    return (name: string, amount: number): void => {
        try {
            callIntrinsic(candidate as RuntimeFunction, performance, [name, amount]);
        }
        catch {
        }
    };
}
function normalizedNonNegativeInteger(value: unknown): number {
    return Math.max(0, Math.floor(Number(value) || 0));
}
function isBarrierReason(reason: string): boolean {
    return (reason !== '' &&
        reason !== 'event-end' &&
        reason !== 'budget-limit' &&
        reason !== 'message-limit' &&
        reason !== 'scan-limit');
}
export function createForesightPathHistoryOwner(dependencies: ForesightPathHistoryDependencies): ForesightPathHistoryOwner {
    const { branchPaths } = dependencies;
    const indexesByPath = new IntrinsicWeakMap<object, PathVisitIndex>();
    const countPerformance = capturePerformanceCounter(dependencies.performance);
    function readPathIndex(path: unknown): PathVisitIndex | null {
        return isObjectRecord(path) ? (weakMapGet(indexesByPath, path) ?? null) : null;
    }
    function ensurePathIndex(path: object): PathVisitIndex {
        const existing = weakMapGet(indexesByPath, path);
        if (existing)
            return existing;
        const created = new IntrinsicMap<unknown, BranchVisitIndex>();
        weakMapSet(indexesByPath, path, created);
        return created;
    }
    function readIndexSet(history: PathVisitIndex, listIdentity: unknown, branchKey: string): Set<unknown> | null {
        const branches = mapGet(history, listIdentity);
        return branches ? (mapGet(branches, branchKey) ?? null) : null;
    }
    function ensureIndexSet(history: PathVisitIndex, listIdentity: unknown, branchKey: string): Set<unknown> {
        let branches = mapGet(history, listIdentity);
        if (!branches) {
            branches = new IntrinsicMap<string, Set<unknown>>();
            mapSet(history, listIdentity, branches);
        }
        let indexes = mapGet(branches, branchKey);
        if (!indexes) {
            indexes = new IntrinsicSet<unknown>();
            mapSet(branches, branchKey, indexes);
        }
        return indexes;
    }
    function countMerge(name: string, amount: number): void {
        if (countPerformance)
            countPerformance(`foresight.pathHistory.merge.${name}`, amount);
    }
    function hasVisitedPathPosition(path: unknown, frame: unknown, index: unknown): boolean {
        const listIdentity = field(frame, 'listIdentity');
        const branchKey = branchPaths.serialize(field(path, 'branchPath'));
        const history = readPathIndex(path);
        if (!history)
            return false;
        const indexes = readIndexSet(history, listIdentity, branchKey);
        return indexes ? setHas(indexes, index) : false;
    }
    function rememberPathPosition(path: unknown, frame: unknown, index: unknown): void {
        const target = requireRecord(path, 'Scan path');
        const listIdentity = field(frame, 'listIdentity');
        const branchKey = branchPaths.serialize(field(target, 'branchPath'));
        setAdd(ensureIndexSet(ensurePathIndex(target), listIdentity, branchKey), index);
    }
    function mergeVisitedPathPositions(target: unknown, source: unknown): void {
        const targetPath = requireRecord(target, 'Target scan path');
        const sourcePath = requireRecord(source, 'Source scan path');
        const sourceHistory = readPathIndex(sourcePath);
        let targetHistory = readPathIndex(targetPath);
        let sourceListBucketsVisited = 0;
        let sourceBranchBucketsVisited = 0;
        let sourceIndexesVisited = 0;
        let membershipChecks = 0;
        let indexesAdded = 0;
        if (sourceHistory) {
            mapForEach(sourceHistory, (sourceBranches, listIdentity) => {
                sourceListBucketsVisited += 1;
                mapForEach(sourceBranches, (sourceIndexes, branchKey) => {
                    sourceBranchBucketsVisited += 1;
                    let targetIndexes = targetHistory ? readIndexSet(targetHistory, listIdentity, branchKey) : null;
                    setForEach(sourceIndexes, (index) => {
                        sourceIndexesVisited += 1;
                        membershipChecks += 1;
                        if (targetIndexes && setHas(targetIndexes, index))
                            return;
                        targetHistory ??= ensurePathIndex(targetPath);
                        targetIndexes ??= ensureIndexSet(targetHistory, listIdentity, branchKey);
                        setAdd(targetIndexes, index);
                        indexesAdded += 1;
                    });
                });
            });
        }
        countMerge('calls', 1);
        countMerge('sourceListBucketsVisited', sourceListBucketsVisited);
        countMerge('sourceBranchBucketsVisited', sourceBranchBucketsVisited);
        countMerge('sourceIndexesVisited', sourceIndexesVisited);
        countMerge('membershipChecks', membershipChecks);
        countMerge('indexesAdded', indexesAdded);
    }
    function addBlockedReturnGuards(base: Readonly<Record<string, string>>, returnStops: unknown, reason: string): Readonly<Record<string, string>> {
        if (!isBarrierReason(reason))
            return base;
        const next: Record<string, string> = { ...base };
        for (const stop of arraySnapshot(returnStops)) {
            const guardId = normalizedNonNegativeInteger((stop as ReturnStopCandidate | null | undefined)?.guardId);
            if (guardId > 0)
                next[String(guardId)] = reason;
        }
        return freezeExact(next);
    }
    function stopScanPath(path: unknown, scan: unknown, stopReason: unknown, index: unknown): ForesightStopTransitionResult {
        const pathState = requireRecord(path, 'Scan path');
        const scanState = requireRecord(scan, 'Scan state');
        if (pathState['done'] === true)
            throw new Error('[Foresight] Scan path is already terminal.');
        const reason = nonEmptyString(stopReason) || 'barrier-command';
        const reasons = freezeExact([...stopReasonSnapshot(scanState['stopReasons']), reason]);
        const guards = addBlockedReturnGuards(blockedGuardSnapshot(scanState['blockedReturnGuards']), pathState['returnStops'], reason);
        const canonicalIndex = index === null ? null : finiteNumber(index);
        scanState['stopReasons'] = reasons;
        scanState['blockedReturnGuards'] = guards;
        pathState['done'] = true;
        return freezeExact({ requeue: false as const, index: canonicalIndex });
    }
    function appendScanStopReason(scan: unknown, stopReason: unknown): void {
        const scanState = requireRecord(scan, 'Scan state');
        const reason = nonEmptyString(stopReason) || 'barrier-command';
        scanState['stopReasons'] = freezeExact([...stopReasonSnapshot(scanState['stopReasons']), reason]);
    }
    function isBarrierStopReason(stopReason: unknown): boolean {
        return isBarrierReason(nonEmptyString(stopReason));
    }
    return freezeExact({
        hasVisitedPathPosition,
        rememberPathPosition,
        mergeVisitedPathPositions,
        stopScanPath,
        appendScanStopReason,
        isBarrierStopReason,
    });
}
