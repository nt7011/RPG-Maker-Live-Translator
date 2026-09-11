type PropertySource = Record<PropertyKey, unknown>;
export type ConversionSnapshotTargetRole = string;
export interface ConversionSnapshotFailureDetail {
    readonly target: unknown;
    readonly role: ConversionSnapshotTargetRole;
    readonly key: PropertyKey | null;
    readonly operation: 'capture' | 'define' | 'delete' | 'set-prototype' | 'attest' | 'transition';
    readonly error: unknown;
}
export interface ConversionSnapshotRestoreAttempt {
    readonly complete: boolean;
    readonly failures: readonly ConversionSnapshotFailureDetail[];
    readonly unrecoveredTargets: readonly object[];
}
export interface ConversionSnapshotJournal {
    capture(target: object, role: ConversionSnapshotTargetRole, additionalKeys?: readonly PropertyKey[]): boolean;
    restore(): ConversionSnapshotRestoreAttempt;
}
interface TargetSnapshot {
    readonly target: PropertySource;
    readonly role: ConversionSnapshotTargetRole;
    readonly prototype: object | null;
    readonly extensible: boolean;
    readonly ownKeys: readonly PropertyKey[];
    readonly ownKeySet: Set<PropertyKey>;
    readonly descriptors: readonly TargetDescriptorSnapshot[];
}
interface TargetDescriptorSnapshot {
    readonly key: PropertyKey;
    readonly descriptor: PropertyDescriptor | undefined;
    readonly arraySnapshot: ArraySnapshot | null;
}
interface ArraySnapshot {
    readonly target: PropertySource;
    readonly prototype: object | null;
    readonly extensible: boolean;
    readonly ownKeys: readonly PropertyKey[];
    readonly ownKeySet: Set<PropertyKey>;
    readonly descriptors: readonly ArrayDescriptorSnapshot[];
}
interface ArrayDescriptorSnapshot {
    readonly key: PropertyKey;
    readonly descriptor: PropertyDescriptor;
}
const reflectApplyIntrinsic = Reflect.apply;
const reflectDefinePropertyIntrinsic = Reflect.defineProperty;
const reflectDeletePropertyIntrinsic = Reflect.deleteProperty;
const reflectGetOwnPropertyDescriptorIntrinsic = Reflect.getOwnPropertyDescriptor;
const reflectGetPrototypeOfIntrinsic = Reflect.getPrototypeOf;
const reflectIsExtensibleIntrinsic = Reflect.isExtensible;
const reflectOwnKeysIntrinsic = Reflect.ownKeys;
const reflectSetPrototypeOfIntrinsic = Reflect.setPrototypeOf;
const arrayIsArrayIntrinsic = Array.isArray;
const objectFreezeIntrinsic = Object.freeze;
const objectHasOwnIntrinsic = Object.prototype.hasOwnProperty;
const objectIsFrozenIntrinsic = Object.isFrozen;
const objectIsIntrinsic = Object.is;
const weakMapGetIntrinsic = WeakMap.prototype.get;
const weakMapHasIntrinsic = WeakMap.prototype.has;
const weakMapSetIntrinsic = WeakMap.prototype.set;
const weakSetAddIntrinsic = WeakSet.prototype.add;
const weakSetHasIntrinsic = WeakSet.prototype.has;
const setAddIntrinsic = Set.prototype.add;
const setHasIntrinsic = Set.prototype.has;
const ErrorIntrinsic = Error;
const StringIntrinsic: (value?: unknown) => string = String;
const SetIntrinsic = Set;
function callIntrinsic<Arguments extends readonly unknown[], Result>(callback: (...args: Arguments) => Result, receiver: unknown, args: Arguments): Result {
    return reflectApplyIntrinsic(callback, receiver, args as unknown as ArrayLike<unknown>) as Result;
}
function weakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return callIntrinsic(weakMapGetIntrinsic, map, [key]) as Value | undefined;
}
function weakMapHas<Key extends object>(map: WeakMap<Key, unknown>, key: Key): boolean {
    return callIntrinsic(weakMapHasIntrinsic, map, [key]) === true;
}
function weakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    const returned = callIntrinsic(weakMapSetIntrinsic, map, [key, value]);
    if (returned !== map)
        throw new TypeError('Conversion snapshot WeakMap storage lost exact identity.');
}
function weakSetAdd<Value extends object>(set: WeakSet<Value>, value: Value): void {
    const returned = callIntrinsic(weakSetAddIntrinsic, set, [value]);
    if (returned !== set)
        throw new TypeError('Conversion snapshot WeakSet storage lost exact identity.');
}
function weakSetHas<Value extends object>(set: WeakSet<Value>, value: Value): boolean {
    return callIntrinsic(weakSetHasIntrinsic, set, [value]) === true;
}
function setAdd<Value>(set: Set<Value>, value: Value): void {
    const returned = callIntrinsic(setAddIntrinsic, set, [value]);
    if (returned !== set)
        throw new TypeError('Conversion snapshot Set storage lost exact identity.');
}
function setHas<Value>(set: Set<Value>, value: Value): boolean {
    return callIntrinsic(setHasIntrinsic, set, [value]) === true;
}
function hasOwn(target: object, key: PropertyKey): boolean {
    return callIntrinsic(objectHasOwnIntrinsic, target, [key]) === true;
}
function ownDataValue(descriptor: PropertyDescriptor): unknown {
    return (descriptor as unknown as Record<PropertyKey, unknown>)['value'];
}
function ownDescriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined {
    return callIntrinsic(reflectGetOwnPropertyDescriptorIntrinsic, Reflect, [target, key]);
}
function ownKeys(target: object): PropertyKey[] {
    return callIntrinsic(reflectOwnKeysIntrinsic, Reflect, [target]);
}
function getPrototype(target: object): object | null {
    return callIntrinsic(reflectGetPrototypeOfIntrinsic, Reflect, [target]);
}
function isExtensible(target: object): boolean {
    return callIntrinsic(reflectIsExtensibleIntrinsic, Reflect, [target]) === true;
}
function setPrototype(target: object, prototype: object | null): boolean {
    return callIntrinsic(reflectSetPrototypeOfIntrinsic, Reflect, [target, prototype]) === true;
}
function defineExact(target: object, key: PropertyKey, descriptor: PropertyDescriptor): boolean {
    return callIntrinsic(reflectDefinePropertyIntrinsic, Reflect, [target, key, descriptor]) === true;
}
function deleteExact(target: object, key: PropertyKey): boolean {
    return callIntrinsic(reflectDeletePropertyIntrinsic, Reflect, [target, key]) === true;
}
function freezeExact<Value extends object>(value: Value): Value {
    const returned = callIntrinsic(objectFreezeIntrinsic, Object, [value]);
    if (returned !== value || callIntrinsic(objectIsFrozenIntrinsic, Object, [value]) !== true) {
        throw new TypeError('Conversion snapshot could not freeze its authored record exactly.');
    }
    return value;
}
function stringify(value: unknown): string {
    const converted = callIntrinsic(StringIntrinsic, undefined, [value ?? '']);
    return typeof converted === 'string' ? converted : '';
}
function createFailureDetail(target: unknown, role: ConversionSnapshotTargetRole, key: PropertyKey | null, operation: ConversionSnapshotFailureDetail['operation'], error: unknown): ConversionSnapshotFailureDetail {
    return freezeExact({ target, role, key, operation, error });
}
export function createConversionSnapshotJournal(assertTargetAvailable: (target: object) => void): ConversionSnapshotJournal {
    const targetSnapshots = new WeakMap<object, TargetSnapshot>();
    const snapshots: TargetSnapshot[] = [];
    const arraySnapshots = new WeakMap<object, ArraySnapshot>();
    function capture(target: object, role: ConversionSnapshotTargetRole, additionalKeys: readonly PropertyKey[] = []): boolean {
        assertTargetAvailable(target);
        if (weakMapHas(targetSnapshots, target))
            return false;
        const snapshot = captureTargetSnapshot(target as PropertySource, role, additionalKeys);
        weakMapSet(targetSnapshots, target, snapshot);
        snapshots[snapshots.length] = snapshot;
        return true;
    }
    function captureTargetSnapshot(target: PropertySource, role: ConversionSnapshotTargetRole, additionalKeys: readonly PropertyKey[]): TargetSnapshot {
        const prototype = getPrototype(target);
        const extensible = isExtensible(target);
        const capturedOwnKeys = ownKeys(target);
        const ownKeySet = createKeySet(capturedOwnKeys);
        const keys: PropertyKey[] = [];
        const capturedKeySet = new SetIntrinsic<PropertyKey>();
        appendUniqueKeys(keys, capturedKeySet, capturedOwnKeys);
        appendUniqueKeys(keys, capturedKeySet, additionalKeys);
        const descriptors: TargetDescriptorSnapshot[] = [];
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (key === undefined)
                throw new TypeError('Conversion snapshot key inventory is incomplete.');
            const descriptor = ownDescriptor(target, key);
            if (!descriptor && setHas(ownKeySet, key)) {
                throw new TypeError(`Conversion snapshot descriptor ${stringify(key)} disappeared during capture.`);
            }
            const capturedDescriptor = descriptor ? cloneDescriptor(descriptor) : undefined;
            const descriptorValue: unknown = descriptor && hasOwn(descriptor, 'value') ? ownDataValue(descriptor) : undefined;
            const arraySnapshot = arrayIsArrayIntrinsic(descriptorValue)
                ? captureArraySnapshot(descriptorValue as unknown as PropertySource)
                : null;
            descriptors[descriptors.length] = freezeExact({
                key,
                descriptor: capturedDescriptor,
                arraySnapshot,
            });
        }
        freezeExact(capturedOwnKeys);
        freezeExact(descriptors);
        return freezeExact({
            target,
            role,
            prototype,
            extensible,
            ownKeys: capturedOwnKeys,
            ownKeySet,
            descriptors,
        });
    }
    function captureArraySnapshot(target: PropertySource): ArraySnapshot {
        assertTargetAvailable(target);
        const existing = weakMapGet(arraySnapshots, target);
        if (existing)
            return existing;
        const prototype = getPrototype(target);
        const extensible = isExtensible(target);
        const capturedOwnKeys = ownKeys(target);
        const ownKeySet = createKeySet(capturedOwnKeys);
        const descriptors: ArrayDescriptorSnapshot[] = [];
        for (let index = 0; index < capturedOwnKeys.length; index += 1) {
            const key = capturedOwnKeys[index];
            if (key === undefined)
                throw new TypeError('Conversion array snapshot key inventory is incomplete.');
            const descriptor = ownDescriptor(target, key);
            if (!descriptor) {
                throw new TypeError(`Conversion array descriptor ${stringify(key)} disappeared during capture.`);
            }
            descriptors[descriptors.length] = freezeExact({ key, descriptor: cloneDescriptor(descriptor) });
        }
        freezeExact(capturedOwnKeys);
        freezeExact(descriptors);
        const snapshot = freezeExact({
            target,
            prototype,
            extensible,
            ownKeys: capturedOwnKeys,
            ownKeySet,
            descriptors,
        });
        weakMapSet(arraySnapshots, target, snapshot);
        return snapshot;
    }
    function restore(): ConversionSnapshotRestoreAttempt {
        const failures: ConversionSnapshotFailureDetail[] = [];
        const unrecoveredTargets: object[] = [];
        const restoredArrays = new WeakSet<object>();
        for (let index = snapshots.length - 1; index >= 0; index -= 1) {
            const snapshot = snapshots[index];
            if (snapshot)
                restoreSnapshot(snapshot, restoredArrays, failures);
        }
        const retainedUnrecovered = new WeakSet<object>();
        const attestedArrays = new WeakSet<object>();
        for (let index = snapshots.length - 1; index >= 0; index -= 1) {
            const snapshot = snapshots[index];
            if (!snapshot)
                continue;
            if (!targetSnapshotMatches(snapshot)) {
                failures[failures.length] = createFailureDetail(snapshot.target, snapshot.role, null, 'attest', new ErrorIntrinsic('Conversion target state does not match its admitted snapshot.'));
                appendUnrecoveredTarget(unrecoveredTargets, retainedUnrecovered, snapshot.target);
            }
            for (let descriptorIndex = 0; descriptorIndex < snapshot.descriptors.length; descriptorIndex += 1) {
                const arraySnapshot = snapshot.descriptors[descriptorIndex]?.arraySnapshot ?? null;
                if (!arraySnapshot || weakSetHas(attestedArrays, arraySnapshot.target))
                    continue;
                weakSetAdd(attestedArrays, arraySnapshot.target);
                if (arraySnapshotMatches(arraySnapshot))
                    continue;
                failures[failures.length] = createFailureDetail(arraySnapshot.target, snapshot.role, null, 'attest', new ErrorIntrinsic('Conversion array state does not match its admitted snapshot.'));
                appendUnrecoveredTarget(unrecoveredTargets, retainedUnrecovered, arraySnapshot.target);
            }
        }
        return {
            complete: unrecoveredTargets.length === 0,
            failures,
            unrecoveredTargets,
        };
    }
    function appendUnrecoveredTarget(targets: object[], retained: WeakSet<object>, target: object): void {
        if (weakSetHas(retained, target))
            return;
        weakSetAdd(retained, target);
        targets[targets.length] = target;
    }
    function restoreSnapshot(snapshot: TargetSnapshot, restoredArrays: WeakSet<object>, failures: ConversionSnapshotFailureDetail[]): void {
        restoreOwnDescriptors(snapshot.target, snapshot.role, snapshot.ownKeySet, snapshot.descriptors, failures);
        restorePrototype(snapshot.target, snapshot.prototype, snapshot.role, failures);
        for (let index = 0; index < snapshot.descriptors.length; index += 1) {
            const arraySnapshot = snapshot.descriptors[index]?.arraySnapshot ?? null;
            if (!arraySnapshot || weakSetHas(restoredArrays, arraySnapshot.target))
                continue;
            weakSetAdd(restoredArrays, arraySnapshot.target);
            restoreArraySnapshot(arraySnapshot, snapshot.role, failures);
        }
    }
    function restoreOwnDescriptors(target: PropertySource, role: ConversionSnapshotTargetRole, expectedOwnKeys: Set<PropertyKey>, descriptors: readonly TargetDescriptorSnapshot[], failures: ConversionSnapshotFailureDetail[]): void {
        let currentKeys: readonly PropertyKey[] = [];
        try {
            currentKeys = ownKeys(target);
        }
        catch (error) {
            failures[failures.length] = createFailureDetail(target, role, null, 'attest', error);
        }
        for (let index = 0; index < currentKeys.length; index += 1) {
            const key = currentKeys[index];
            if (key === undefined || setHas(expectedOwnKeys, key))
                continue;
            try {
                if (!deleteExact(target, key)) {
                    throw new ErrorIntrinsic(`Conversion property ${stringify(key)} could not be deleted.`);
                }
            }
            catch (error) {
                failures[failures.length] = createFailureDetail(target, role, key, 'delete', error);
            }
        }
        for (let index = 0; index < descriptors.length; index += 1) {
            const record = descriptors[index];
            if (!record)
                continue;
            try {
                const current = ownDescriptor(target, record.key);
                if (!record.descriptor) {
                    if (current && !deleteExact(target, record.key)) {
                        throw new ErrorIntrinsic(`Conversion property ${stringify(record.key)} could not be deleted.`);
                    }
                }
                else if (!descriptorsEqual(current, record.descriptor) &&
                    !defineExact(target, record.key, record.descriptor)) {
                    throw new ErrorIntrinsic(`Conversion property ${stringify(record.key)} could not be defined.`);
                }
            }
            catch (error) {
                failures[failures.length] = createFailureDetail(target, role, record.key, record.descriptor ? 'define' : 'delete', error);
            }
        }
    }
    function restoreArraySnapshot(snapshot: ArraySnapshot, role: ConversionSnapshotTargetRole, failures: ConversionSnapshotFailureDetail[]): void {
        let currentKeys: readonly PropertyKey[] = [];
        try {
            currentKeys = ownKeys(snapshot.target);
        }
        catch (error) {
            failures[failures.length] = createFailureDetail(snapshot.target, role, null, 'attest', error);
        }
        for (let index = 0; index < currentKeys.length; index += 1) {
            const key = currentKeys[index];
            if (key === undefined || setHas(snapshot.ownKeySet, key))
                continue;
            try {
                if (!deleteExact(snapshot.target, key)) {
                    throw new ErrorIntrinsic(`Conversion array property ${stringify(key)} could not be deleted.`);
                }
            }
            catch (error) {
                failures[failures.length] = createFailureDetail(snapshot.target, role, key, 'delete', error);
            }
        }
        restoreArrayDescriptorGroup(snapshot, role, failures, false);
        restoreArrayDescriptorGroup(snapshot, role, failures, true);
        restorePrototype(snapshot.target, snapshot.prototype, role, failures);
    }
    function restoreArrayDescriptorGroup(snapshot: ArraySnapshot, role: ConversionSnapshotTargetRole, failures: ConversionSnapshotFailureDetail[], restoreLength: boolean): void {
        for (let index = 0; index < snapshot.descriptors.length; index += 1) {
            const record = snapshot.descriptors[index];
            if (!record || (record.key === 'length') !== restoreLength)
                continue;
            try {
                const current = ownDescriptor(snapshot.target, record.key);
                if (!descriptorsEqual(current, record.descriptor) &&
                    !defineExact(snapshot.target, record.key, record.descriptor)) {
                    throw new ErrorIntrinsic(`Conversion array property ${stringify(record.key)} could not be defined.`);
                }
            }
            catch (error) {
                failures[failures.length] = createFailureDetail(snapshot.target, role, record.key, 'define', error);
            }
        }
    }
    function restorePrototype(target: PropertySource, expected: object | null, role: ConversionSnapshotTargetRole, failures: ConversionSnapshotFailureDetail[]): void {
        try {
            if (getPrototype(target) !== expected && !setPrototype(target, expected)) {
                throw new ErrorIntrinsic('Conversion target prototype could not be restored.');
            }
        }
        catch (error) {
            failures[failures.length] = createFailureDetail(target, role, null, 'set-prototype', error);
        }
    }
    function targetSnapshotMatches(snapshot: TargetSnapshot): boolean {
        return ownStateMatches(snapshot.target, snapshot.prototype, snapshot.extensible, snapshot.ownKeys, snapshot.descriptors);
    }
    function ownStateMatches(target: PropertySource, expectedPrototype: object | null, expectedExtensible: boolean, expectedOwnKeys: readonly PropertyKey[], descriptors: readonly TargetDescriptorSnapshot[]): boolean {
        try {
            if (getPrototype(target) !== expectedPrototype || isExtensible(target) !== expectedExtensible)
                return false;
            if (!keyListsEqual(ownKeys(target), expectedOwnKeys))
                return false;
            for (let index = 0; index < descriptors.length; index += 1) {
                const record = descriptors[index];
                if (!record || !descriptorsEqual(ownDescriptor(target, record.key), record.descriptor))
                    return false;
            }
            return true;
        }
        catch {
            return false;
        }
    }
    function arraySnapshotMatches(snapshot: ArraySnapshot): boolean {
        try {
            if (getPrototype(snapshot.target) !== snapshot.prototype ||
                isExtensible(snapshot.target) !== snapshot.extensible) {
                return false;
            }
            if (!keyListsEqual(ownKeys(snapshot.target), snapshot.ownKeys))
                return false;
            for (let index = 0; index < snapshot.descriptors.length; index += 1) {
                const record = snapshot.descriptors[index];
                if (!record || !descriptorsEqual(ownDescriptor(snapshot.target, record.key), record.descriptor)) {
                    return false;
                }
            }
            return true;
        }
        catch {
            return false;
        }
    }
    function createKeySet(values: readonly PropertyKey[]): Set<PropertyKey> {
        const keys = new SetIntrinsic<PropertyKey>();
        for (let index = 0; index < values.length; index += 1) {
            const key = values[index];
            if (key !== undefined)
                setAdd(keys, key);
        }
        return keys;
    }
    function appendUniqueKeys(target: PropertyKey[], retained: Set<PropertyKey>, values: readonly PropertyKey[]): void {
        for (let index = 0; index < values.length; index += 1) {
            const key = values[index];
            if (key === undefined || setHas(retained, key))
                continue;
            setAdd(retained, key);
            target[target.length] = key;
        }
    }
    function keyListsEqual(left: readonly PropertyKey[], right: readonly PropertyKey[]): boolean {
        if (left.length !== right.length)
            return false;
        for (let index = 0; index < left.length; index += 1) {
            if (callIntrinsic(objectIsIntrinsic, Object, [left[index], right[index]]) !== true)
                return false;
        }
        return true;
    }
    function cloneDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
        const clone: PropertyDescriptor = {
            configurable: descriptor.configurable === true,
            enumerable: descriptor.enumerable === true,
        };
        if (hasOwn(descriptor, 'value')) {
            clone.value = ownDataValue(descriptor);
            clone.writable = descriptor.writable === true;
        }
        else {
            if (typeof descriptor.get === 'function')
                clone.get = descriptor.get;
            if (typeof descriptor.set === 'function')
                clone.set = descriptor.set;
        }
        return freezeExact(clone);
    }
    function descriptorsEqual(left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean {
        if (!left || !right)
            return left === right;
        const leftData = hasOwn(left, 'value');
        const rightData = hasOwn(right, 'value');
        if (leftData !== rightData)
            return false;
        if (left.configurable !== right.configurable || left.enumerable !== right.enumerable)
            return false;
        if (leftData) {
            return (left.writable === right.writable && callIntrinsic(objectIsIntrinsic, Object, [left.value, right.value]));
        }
        return left.get === right.get && left.set === right.set;
    }
    return freezeExact({ capture, restore });
}
