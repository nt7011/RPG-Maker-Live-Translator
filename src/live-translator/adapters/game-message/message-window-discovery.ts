type RuntimeFunction = (this: unknown, ...arguments_: unknown[]) => unknown;
export type MessageWindowDiscoveryMode = 'hook-candidates' | 'known-windows';
export type MessageWindowDiscoverySource = 'core-constructor' | 'global-constructor' | 'registered-window' | 'scene-property' | 'scene-array-item';
export type MessageWindowDiscoveryPhase = 'source-read' | 'source-enumeration' | 'descriptor-read' | 'candidate-classification' | 'constructor-read' | 'subclass-check';
export type MessageWindowDiscoveryReason = 'required-constructor-unavailable' | 'source-read-failed' | 'source-enumeration-failed' | 'descriptor-read-failed' | 'descriptor-disappeared' | 'candidate-classification-failed' | 'constructor-read-failed' | 'subclass-check-failed';
export interface MessageWindowDiscoveryFailure {
    readonly source: MessageWindowDiscoverySource;
    readonly phase: MessageWindowDiscoveryPhase;
    readonly reason: MessageWindowDiscoveryReason;
    readonly key: string | null;
    readonly index: number | null;
    readonly member: string | null;
}
export interface MessageWindowConstructorTarget {
    readonly constructor: RuntimeFunction;
    readonly prototype: object;
    readonly forceStartHook: boolean;
    readonly source: MessageWindowDiscoverySource;
    readonly key: string | null;
    readonly index: number | null;
}
export interface MessageWindowCandidateSnapshot {
    readonly window: object;
    readonly source: MessageWindowDiscoverySource;
    readonly key: string | null;
    readonly index: number | null;
}
export interface MessageWindowDiscoveryDeduplication {
    readonly constructors: number;
    readonly prototypes: number;
    readonly windows: number;
}
export interface MessageWindowDiscoverySnapshot {
    readonly mode: MessageWindowDiscoveryMode;
    readonly constructors: readonly MessageWindowConstructorTarget[];
    readonly windows: readonly MessageWindowCandidateSnapshot[];
    readonly failures: readonly MessageWindowDiscoveryFailure[];
    readonly deduplicated: MessageWindowDiscoveryDeduplication;
    readonly complete: boolean;
}
export interface MessageWindowDiscoveryService {
    readonly captureHookCandidates: () => MessageWindowDiscoverySnapshot;
    readonly captureKnownWindows: () => MessageWindowDiscoverySnapshot;
}
export interface MessageWindowDiscoveryOptions {
    readonly runtimeGlobal: object;
    readonly registeredWindows?: ReadonlySet<unknown> | null;
}
interface CandidateLocation {
    readonly source: MessageWindowDiscoverySource;
    readonly key: string | null;
    readonly index: number | null;
}
interface CapturedValueSlot extends CandidateLocation {
    readonly dataValue: unknown;
}
interface CapturedArrayGroup {
    readonly slots: readonly CapturedValueSlot[];
}
interface RawWindowCandidate extends CandidateLocation {
    readonly value: unknown;
}
interface ConstructorRecord extends CandidateLocation {
    readonly constructor: RuntimeFunction;
    readonly prototype: object;
    forceStartHook: boolean;
}
interface ConstructorResolution {
    readonly prototype: object | null;
    subclassAdmission: 'unknown' | 'accepted' | 'rejected' | 'failed';
}
interface WindowRecord extends CandidateLocation {
    readonly window: object;
}
interface OperationContext {
    readonly mode: MessageWindowDiscoveryMode;
    readonly failures: MessageWindowDiscoveryFailure[];
    readonly constructorRecords: ConstructorRecord[];
    readonly windowRecords: WindowRecord[];
    readonly constructorResolutionsByIdentity: WeakMap<object, ConstructorResolution>;
    readonly constructorRecordsByIdentity: WeakMap<object, ConstructorRecord>;
    readonly constructorRecordsByPrototype: WeakMap<object, ConstructorRecord>;
    readonly observedWindows: WeakSet<object>;
    duplicateConstructors: number;
    duplicatePrototypes: number;
    duplicateWindows: number;
}
interface MemberReadSuccess {
    readonly status: 'read';
    readonly value: unknown;
}
interface MemberReadFailure {
    readonly status: 'failed';
}
type MemberReadResult = MemberReadSuccess | MemberReadFailure;
interface OwnDataMemberReadSuccess extends MemberReadSuccess {
    readonly found: boolean;
}
type OwnDataMemberReadResult = OwnDataMemberReadSuccess | MemberReadFailure;
const applyIntrinsic = Reflect.apply;
const getIntrinsic = Reflect.get;
const ownKeysIntrinsic = Reflect.ownKeys;
const getOwnDescriptorIntrinsic = Object.getOwnPropertyDescriptor;
const getPrototypeOfIntrinsic: (value: object) => object | null = Object.getPrototypeOf;
const freezeIntrinsic = Object.freeze;
const isFrozenIntrinsic = Object.isFrozen;
const isArrayIntrinsic = Array.isArray;
const numberIntrinsic = Number;
const numberIsIntegerIntrinsic = Number.isInteger;
const stringIntrinsic = String;
const WeakMapIntrinsic = WeakMap;
const WeakSetIntrinsic = WeakSet;
const MAX_ARRAY_INDEX = 4294967294;
type CapturedIntrinsicMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
function captureIntrinsicMethod(target: object, key: PropertyKey): CapturedIntrinsicMethod {
    const descriptor = getOwnDescriptorIntrinsic(target, key);
    if (!descriptor || typeof descriptor.value !== 'function') {
        throw new TypeError(`Message-window discovery requires intrinsic ${stringIntrinsic(key)}.`);
    }
    return descriptor.value as CapturedIntrinsicMethod;
}
const hasOwnPropertyIntrinsic = captureIntrinsicMethod(Object.prototype, 'hasOwnProperty');
const isPrototypeOfIntrinsic = captureIntrinsicMethod(Object.prototype, 'isPrototypeOf');
const weakMapGetIntrinsic = captureIntrinsicMethod(WeakMap.prototype, 'get');
const weakMapSetIntrinsic = captureIntrinsicMethod(WeakMap.prototype, 'set');
const weakSetAddIntrinsic = captureIntrinsicMethod(WeakSet.prototype, 'add');
const weakSetHasIntrinsic = captureIntrinsicMethod(WeakSet.prototype, 'has');
const setForEachIntrinsic = captureIntrinsicMethod(Set.prototype, 'forEach');
function callIntrinsic(callback: CapturedIntrinsicMethod, receiver: unknown, argumentsList: readonly unknown[]): unknown {
    return applyIntrinsic(callback, receiver, argumentsList);
}
function hasOwn(value: object, key: PropertyKey): boolean {
    return callIntrinsic(hasOwnPropertyIntrinsic, value, [key]) === true;
}
function capturedDescriptorGetter(descriptor: PropertyDescriptor): RuntimeFunction | null {
    const field = getOwnDescriptorIntrinsic(descriptor, 'get');
    if (!field || !hasOwn(field, 'value'))
        return null;
    const candidate: unknown = (field as Readonly<{
        value: unknown;
    }>).value;
    return typeof candidate === 'function' ? (candidate as RuntimeFunction) : null;
}
function privateWeakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return callIntrinsic(weakMapGetIntrinsic, map, [key]) as Value | undefined;
}
function privateWeakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    const returned = callIntrinsic(weakMapSetIntrinsic, map, [key, value]);
    if (returned !== map)
        throw new TypeError('Message-window discovery lost private map publication.');
}
function privateWeakSetHas<Value extends object>(set: WeakSet<Value>, value: Value): boolean {
    return callIntrinsic(weakSetHasIntrinsic, set, [value]) === true;
}
function privateWeakSetAdd<Value extends object>(set: WeakSet<Value>, value: Value): void {
    const returned = callIntrinsic(weakSetAddIntrinsic, set, [value]);
    if (returned !== set)
        throw new TypeError('Message-window discovery lost private set publication.');
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    const returned = applyIntrinsic(freezeIntrinsic, Object, [value]);
    const frozen = applyIntrinsic(isFrozenIntrinsic, Object, [value]);
    if (returned !== value || !frozen) {
        throw new TypeError('Message-window discovery could not freeze its exact snapshot.');
    }
    return value;
}
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isExcludedGlobalKey(key: string): boolean {
    return key === 'Window_Message' || key === 'SceneManager';
}
function createOperationContext(mode: MessageWindowDiscoveryMode): OperationContext {
    return {
        mode,
        failures: [],
        constructorRecords: [],
        windowRecords: [],
        constructorResolutionsByIdentity: new WeakMapIntrinsic<object, ConstructorResolution>(),
        constructorRecordsByIdentity: new WeakMapIntrinsic<object, ConstructorRecord>(),
        constructorRecordsByPrototype: new WeakMapIntrinsic<object, ConstructorRecord>(),
        observedWindows: new WeakSetIntrinsic<object>(),
        duplicateConstructors: 0,
        duplicatePrototypes: 0,
        duplicateWindows: 0,
    };
}
function addFailure(context: OperationContext, location: CandidateLocation, phase: MessageWindowDiscoveryPhase, reason: MessageWindowDiscoveryReason, member: string | null = null): void {
    context.failures[context.failures.length] = freezeExact({
        source: location.source,
        phase,
        reason,
        key: location.key,
        index: location.index,
        member,
    });
}
function readExactMember(context: OperationContext, source: object, key: PropertyKey, location: CandidateLocation, phase: MessageWindowDiscoveryPhase, reason: MessageWindowDiscoveryReason): MemberReadResult {
    let descriptor: PropertyDescriptor | undefined;
    try {
        descriptor = getOwnDescriptorIntrinsic(source, key);
    }
    catch {
        addFailure(context, location, 'descriptor-read', 'descriptor-read-failed', stringIntrinsic(key));
        return { status: 'failed' };
    }
    if (descriptor && hasOwn(descriptor, 'value')) {
        return { status: 'read', value: descriptor.value };
    }
    try {
        if (descriptor) {
            const getter = capturedDescriptorGetter(descriptor);
            return {
                status: 'read',
                value: getter ? applyIntrinsic(getter, source, []) : undefined,
            };
        }
        return { status: 'read', value: getIntrinsic(source, key, source) };
    }
    catch {
        addFailure(context, location, phase, reason, stringIntrinsic(key));
        return { status: 'failed' };
    }
}
function readOwnDataMember(context: OperationContext, source: object, key: PropertyKey, location: CandidateLocation): OwnDataMemberReadResult {
    let descriptor: PropertyDescriptor | undefined;
    try {
        descriptor = getOwnDescriptorIntrinsic(source, key);
    }
    catch {
        addFailure(context, location, 'descriptor-read', 'descriptor-read-failed', stringIntrinsic(key));
        return { status: 'failed' };
    }
    if (descriptor && hasOwn(descriptor, 'value')) {
        return { status: 'read', found: true, value: descriptor.value };
    }
    return { status: 'read', found: false, value: undefined };
}
function captureEnumerableSlots(context: OperationContext, source: object, location: CandidateLocation, excludeNamedGlobals: boolean): CapturedValueSlot[] {
    let keys: readonly PropertyKey[];
    try {
        keys = ownKeysIntrinsic(source);
    }
    catch {
        addFailure(context, location, 'source-enumeration', 'source-enumeration-failed');
        return [];
    }
    const slots: CapturedValueSlot[] = [];
    let index = 0;
    while (index < keys.length) {
        const key = keys[index];
        index += 1;
        if (typeof key !== 'string' || (excludeNamedGlobals && isExcludedGlobalKey(key)))
            continue;
        let descriptor: PropertyDescriptor | undefined;
        try {
            descriptor = getOwnDescriptorIntrinsic(source, key);
        }
        catch {
            addFailure(context, { source: location.source, key, index: null }, 'descriptor-read', 'descriptor-read-failed', key);
            continue;
        }
        if (!descriptor) {
            addFailure(context, { source: location.source, key, index: null }, 'descriptor-read', 'descriptor-disappeared', key);
            continue;
        }
        if (descriptor.enumerable !== true)
            continue;
        if (!hasOwn(descriptor, 'value'))
            continue;
        slots[slots.length] = {
            source: location.source,
            key,
            index: null,
            dataValue: descriptor.value,
        };
    }
    return slots;
}
function resolveSlots(slots: readonly CapturedValueSlot[]): RawWindowCandidate[] {
    const values: RawWindowCandidate[] = [];
    let index = 0;
    while (index < slots.length) {
        const slot = slots[index];
        index += 1;
        if (!slot)
            continue;
        values[values.length] = {
            source: slot.source,
            key: slot.key,
            index: slot.index,
            value: slot.dataValue,
        };
    }
    return values;
}
function canonicalArrayIndex(key: PropertyKey): number | null {
    if (typeof key !== 'string' || key.length === 0)
        return null;
    const numeric = numberIntrinsic(key);
    if (!numberIsIntegerIntrinsic(numeric) ||
        numeric < 0 ||
        numeric > MAX_ARRAY_INDEX ||
        stringIntrinsic(numeric) !== key) {
        return null;
    }
    return numeric;
}
function captureArrayGroup(context: OperationContext, array: unknown[], parent: CandidateLocation): CapturedArrayGroup {
    let keys: readonly PropertyKey[];
    try {
        keys = ownKeysIntrinsic(array);
    }
    catch {
        addFailure(context, parent, 'source-enumeration', 'source-enumeration-failed');
        return { slots: [] };
    }
    const slots: CapturedValueSlot[] = [];
    let keyIndex = 0;
    while (keyIndex < keys.length) {
        const key = keys[keyIndex];
        keyIndex += 1;
        if (key === undefined)
            continue;
        const index = canonicalArrayIndex(key);
        if (index === null)
            continue;
        let descriptor: PropertyDescriptor | undefined;
        try {
            descriptor = getOwnDescriptorIntrinsic(array, key);
        }
        catch {
            addFailure(context, { source: 'scene-array-item', key: parent.key, index }, 'descriptor-read', 'descriptor-read-failed', key as string);
            continue;
        }
        if (!descriptor) {
            addFailure(context, { source: 'scene-array-item', key: parent.key, index }, 'descriptor-read', 'descriptor-disappeared', key as string);
            continue;
        }
        if (descriptor.enumerable !== true)
            continue;
        if (!hasOwn(descriptor, 'value'))
            continue;
        slots[slots.length] = {
            source: 'scene-array-item',
            key: parent.key,
            index,
            dataValue: descriptor.value,
        };
    }
    return { slots };
}
function resolveArrayGroups(groups: readonly CapturedArrayGroup[]): RawWindowCandidate[] {
    const candidates: RawWindowCandidate[] = [];
    let groupIndex = 0;
    while (groupIndex < groups.length) {
        const group = groups[groupIndex];
        groupIndex += 1;
        if (!group)
            continue;
        const values = resolveSlots(group.slots);
        let valueIndex = 0;
        while (valueIndex < values.length) {
            const value = values[valueIndex];
            valueIndex += 1;
            if (value)
                candidates[candidates.length] = value;
        }
    }
    return candidates;
}
function appendRawCandidates(target: RawWindowCandidate[], source: readonly RawWindowCandidate[]): void {
    let index = 0;
    while (index < source.length) {
        const candidate = source[index];
        index += 1;
        if (candidate)
            target[target.length] = candidate;
    }
}
function constructorLocation(location: CandidateLocation): CandidateLocation {
    return {
        source: location.source,
        key: location.key,
        index: location.index,
    };
}
function observeConstructor(context: OperationContext, candidate: unknown, location: CandidateLocation, forceStartHook: boolean, requiredBasePrototype: object | null, requireSubclass: boolean): ConstructorRecord | null {
    if (typeof candidate !== 'function')
        return null;
    const constructorCandidate = candidate as RuntimeFunction;
    const existing = privateWeakMapGet(context.constructorRecordsByIdentity, constructorCandidate);
    let resolution = privateWeakMapGet(context.constructorResolutionsByIdentity, constructorCandidate);
    if (resolution) {
        context.duplicateConstructors += 1;
        if (existing && forceStartHook)
            existing.forceStartHook = true;
        if (existing)
            return existing;
    }
    else {
        const prototypeRead = readOwnDataMember(context, constructorCandidate, 'prototype', location);
        resolution = {
            prototype: prototypeRead.status === 'read' && isObjectReference(prototypeRead.value) ? prototypeRead.value : null,
            subclassAdmission: 'unknown',
        };
        privateWeakMapSet(context.constructorResolutionsByIdentity, constructorCandidate, resolution);
    }
    if (!resolution.prototype)
        return null;
    const prototype = resolution.prototype;
    if (requireSubclass) {
        if (!requiredBasePrototype)
            return null;
        if (resolution.subclassAdmission === 'unknown') {
            try {
                resolution.subclassAdmission =
                    applyIntrinsic(isPrototypeOfIntrinsic, requiredBasePrototype, [prototype]) === true
                        ? 'accepted'
                        : 'rejected';
            }
            catch {
                resolution.subclassAdmission = 'failed';
                addFailure(context, location, 'subclass-check', 'subclass-check-failed', 'prototype');
            }
        }
        if (resolution.subclassAdmission !== 'accepted')
            return null;
    }
    const prototypeRecord = privateWeakMapGet(context.constructorRecordsByPrototype, prototype);
    if (prototypeRecord) {
        context.duplicatePrototypes += 1;
        if (forceStartHook)
            prototypeRecord.forceStartHook = true;
        privateWeakMapSet(context.constructorRecordsByIdentity, constructorCandidate, prototypeRecord);
        return prototypeRecord;
    }
    const record: ConstructorRecord = {
        ...constructorLocation(location),
        constructor: constructorCandidate,
        prototype,
        forceStartHook,
    };
    context.constructorRecords[context.constructorRecords.length] = record;
    privateWeakMapSet(context.constructorRecordsByIdentity, constructorCandidate, record);
    privateWeakMapSet(context.constructorRecordsByPrototype, prototype, record);
    return record;
}
function classifyWindows(context: OperationContext, candidates: readonly RawWindowCandidate[], basePrototype: object | null): void {
    let index = 0;
    while (index < candidates.length) {
        const candidate = candidates[index];
        index += 1;
        if (!candidate || !isObjectReference(candidate.value))
            continue;
        const windowInstance = candidate.value;
        if (privateWeakSetHas(context.observedWindows, windowInstance)) {
            context.duplicateWindows += 1;
            continue;
        }
        privateWeakSetAdd(context.observedWindows, windowInstance);
        let accepted = false;
        if (basePrototype) {
            try {
                accepted = applyIntrinsic(isPrototypeOfIntrinsic, basePrototype, [windowInstance]) === true;
            }
            catch {
                addFailure(context, candidate, 'candidate-classification', 'candidate-classification-failed', 'prototype');
                continue;
            }
        }
        if (!accepted)
            continue;
        context.windowRecords[context.windowRecords.length] = {
            source: candidate.source,
            key: candidate.key,
            index: candidate.index,
            window: windowInstance,
        };
        const constructorRead = readCandidateConstructor(context, windowInstance, candidate);
        if (constructorRead.status === 'read') {
            observeConstructor(context, constructorRead.value, candidate, false, null, false);
        }
    }
}
function readCandidateConstructor(context: OperationContext, windowInstance: object, location: CandidateLocation): OwnDataMemberReadResult {
    const ownConstructor = readOwnDataMember(context, windowInstance, 'constructor', location);
    if (ownConstructor.status === 'failed' || ownConstructor.found)
        return ownConstructor;
    let prototype: object | null;
    try {
        prototype = getPrototypeOfIntrinsic(windowInstance);
    }
    catch {
        addFailure(context, location, 'constructor-read', 'constructor-read-failed', 'prototype');
        return { status: 'failed' };
    }
    if (!prototype)
        return { status: 'read', found: false, value: undefined };
    return readOwnDataMember(context, prototype, 'constructor', location);
}
function captureRegistryCandidates(context: OperationContext, registeredWindows: ReadonlySet<unknown> | null | undefined): RawWindowCandidate[] {
    if (!isObjectReference(registeredWindows))
        return [];
    const location: CandidateLocation = {
        source: 'registered-window',
        key: null,
        index: null,
    };
    const candidates: RawWindowCandidate[] = [];
    let active = true;
    let nextIndex = 0;
    const collect = (value: unknown): void => {
        if (!active)
            return;
        const index = nextIndex;
        nextIndex += 1;
        candidates[candidates.length] = {
            source: 'registered-window',
            key: null,
            index,
            value,
        };
    };
    try {
        applyIntrinsic(setForEachIntrinsic, registeredWindows, [collect]);
    }
    catch {
        addFailure(context, location, 'source-enumeration', 'source-enumeration-failed', 'forEach');
    }
    finally {
        active = false;
    }
    return candidates;
}
function captureSceneCandidates(context: OperationContext, runtimeGlobal: object): RawWindowCandidate[] {
    const managerLocation: CandidateLocation = {
        source: 'scene-property',
        key: 'SceneManager',
        index: null,
    };
    const managerRead = readExactMember(context, runtimeGlobal, 'SceneManager', managerLocation, 'source-read', 'source-read-failed');
    if (managerRead.status === 'failed' || !isObjectReference(managerRead.value))
        return [];
    const sceneRead = readExactMember(context, managerRead.value, '_scene', managerLocation, 'source-read', 'source-read-failed');
    if (sceneRead.status === 'failed' || !isObjectReference(sceneRead.value))
        return [];
    const scene = sceneRead.value;
    const slots = captureEnumerableSlots(context, scene, { source: 'scene-property', key: null, index: null }, false);
    const values = resolveSlots(slots);
    const direct: RawWindowCandidate[] = [];
    const arrayGroups: CapturedArrayGroup[] = [];
    let index = 0;
    while (index < values.length) {
        const candidate = values[index];
        index += 1;
        if (!candidate)
            continue;
        let isArray: boolean;
        try {
            isArray = isArrayIntrinsic(candidate.value);
        }
        catch {
            addFailure(context, candidate, 'candidate-classification', 'candidate-classification-failed', 'array');
            continue;
        }
        if (isArray) {
            arrayGroups[arrayGroups.length] = captureArrayGroup(context, candidate.value as unknown[], candidate);
        }
        else {
            direct[direct.length] = candidate;
        }
    }
    appendRawCandidates(direct, resolveArrayGroups(arrayGroups));
    return direct;
}
function finalizeSnapshot(context: OperationContext): MessageWindowDiscoverySnapshot {
    const constructors: MessageWindowConstructorTarget[] = [];
    let constructorIndex = 0;
    while (constructorIndex < context.constructorRecords.length) {
        const record = context.constructorRecords[constructorIndex];
        constructorIndex += 1;
        if (!record)
            continue;
        constructors[constructors.length] = freezeExact({
            constructor: record.constructor,
            prototype: record.prototype,
            forceStartHook: record.forceStartHook,
            source: record.source,
            key: record.key,
            index: record.index,
        });
    }
    const windows: MessageWindowCandidateSnapshot[] = [];
    let windowIndex = 0;
    while (windowIndex < context.windowRecords.length) {
        const record = context.windowRecords[windowIndex];
        windowIndex += 1;
        if (!record)
            continue;
        windows[windows.length] = freezeExact({
            window: record.window,
            source: record.source,
            key: record.key,
            index: record.index,
        });
    }
    const frozenConstructors = freezeExact(constructors);
    const frozenWindows = freezeExact(windows);
    const frozenFailures = freezeExact(context.failures);
    const deduplicated = freezeExact({
        constructors: context.duplicateConstructors,
        prototypes: context.duplicatePrototypes,
        windows: context.duplicateWindows,
    });
    return freezeExact({
        mode: context.mode,
        constructors: frozenConstructors,
        windows: frozenWindows,
        failures: frozenFailures,
        deduplicated,
        complete: frozenFailures.length === 0,
    });
}
export function createMessageWindowDiscoveryService(options: MessageWindowDiscoveryOptions): MessageWindowDiscoveryService {
    if (!isObjectReference(options) || !isObjectReference(options.runtimeGlobal)) {
        throw new TypeError('Message-window discovery requires one runtime global object.');
    }
    const runtimeGlobal = options.runtimeGlobal;
    const registeredWindows = options.registeredWindows;
    function capture(mode: MessageWindowDiscoveryMode): MessageWindowDiscoverySnapshot {
        const context = createOperationContext(mode);
        const coreLocation: CandidateLocation = {
            source: 'core-constructor',
            key: 'Window_Message',
            index: null,
        };
        const coreRead = readExactMember(context, runtimeGlobal, 'Window_Message', coreLocation, 'source-read', 'source-read-failed');
        const coreRecord = coreRead.status === 'read'
            ? observeConstructor(context, coreRead.value, coreLocation, true, null, false)
            : null;
        if (!coreRecord) {
            addFailure(context, coreLocation, 'source-read', 'required-constructor-unavailable', 'Window_Message');
        }
        const basePrototype = coreRecord?.prototype ?? null;
        if (mode === 'hook-candidates') {
            const globalSlots = captureEnumerableSlots(context, runtimeGlobal, { source: 'global-constructor', key: null, index: null }, true);
            const globalValues = resolveSlots(globalSlots);
            let globalIndex = 0;
            while (globalIndex < globalValues.length) {
                const candidate = globalValues[globalIndex];
                globalIndex += 1;
                if (candidate) {
                    observeConstructor(context, candidate.value, candidate, false, basePrototype, true);
                }
            }
        }
        const rawWindows: RawWindowCandidate[] = [];
        if (mode === 'known-windows') {
            appendRawCandidates(rawWindows, captureRegistryCandidates(context, registeredWindows));
        }
        appendRawCandidates(rawWindows, captureSceneCandidates(context, runtimeGlobal));
        classifyWindows(context, rawWindows, basePrototype);
        return finalizeSnapshot(context);
    }
    return freezeExact({
        captureHookCandidates: (): MessageWindowDiscoverySnapshot => capture('hook-candidates'),
        captureKnownWindows: (): MessageWindowDiscoverySnapshot => capture('known-windows'),
    });
}
