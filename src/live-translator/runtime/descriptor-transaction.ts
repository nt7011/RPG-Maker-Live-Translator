export interface DescriptorTransactionUpdate {
    readonly target: object;
    readonly key: PropertyKey;
    readonly expected: PropertyDescriptor | undefined;
    readonly prepared: PropertyDescriptor | undefined;
}
export interface InheritedDataDescriptorResolution {
    readonly value: unknown;
}
export interface DescriptorTransactionFailure {
    readonly phase: 'publish' | 'rollback' | 'forward-repair' | 'commit';
    readonly operation: 'define' | 'delete' | 'transition';
    readonly key: string;
    readonly error: unknown;
}
export interface DescriptorTransactionResult {
    readonly committed: boolean;
    readonly rollbackComplete: boolean;
    readonly failures: readonly DescriptorTransactionFailure[];
}
export interface DescriptorTransactionCompensationResult {
    readonly compensated: boolean;
    readonly failures: readonly DescriptorTransactionFailure[];
}
interface DescriptorSnapshot {
    readonly safe: boolean;
    readonly descriptor: PropertyDescriptor | undefined;
}
interface DescriptorField {
    readonly present: boolean;
    readonly value: unknown;
}
interface OwnedEpochInspection {
    readonly status: 'matches' | 'mismatch' | 'unreadable';
    readonly error?: unknown;
}
interface DescriptorUpdateAuthority {
    readonly capturedEpoch: Readonly<object>;
    readonly inheritedGuard: InheritedDataDescriptorGuard | null;
    readonly ownSlotShadow: boolean;
    phase: 'captured' | 'committing' | 'committed' | 'compensating' | 'compensated' | 'spent';
    preparedEpoch: Readonly<object> | null;
    restoredEpoch: Readonly<object> | null;
}
interface InheritedDataDescriptorGuard {
    readonly path: readonly object[];
    readonly ownerDescriptor: PropertyDescriptor;
}
interface InheritedDataDescriptorResolutionAuthority {
    readonly target: object;
    readonly key: PropertyKey;
    readonly capturedEpoch: Readonly<object>;
    readonly guard: InheritedDataDescriptorGuard;
}
const applyIntrinsic = Reflect.apply;
const deletePropertyIntrinsic = Reflect.deleteProperty;
const ownKeysIntrinsic = Reflect.ownKeys;
const definePropertyIntrinsic = Object.defineProperty;
const freezeIntrinsic = Object.freeze;
export const getOwnDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOfIntrinsic = Object.getPrototypeOf;
const isArrayIntrinsic = Array.isArray;
const isExtensibleIntrinsic = Object.isExtensible;
const isFrozenIntrinsic = Object.isFrozen;
const objectIsIntrinsic = Object.is;
const stringIntrinsic = String;
const MapIntrinsic = Map;
type CapturedIntrinsicMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
function captureIntrinsicMethod(target: object, key: PropertyKey): CapturedIntrinsicMethod {
    const descriptor = getOwnDescriptor(target, key);
    if (!descriptor || typeof descriptor.value !== 'function') {
        throw new TypeError(`Descriptor transaction requires intrinsic method ${stringIntrinsic(key)}.`);
    }
    return descriptor.value as CapturedIntrinsicMethod;
}
const hasOwnPropertyIntrinsic = captureIntrinsicMethod(Object.prototype, 'hasOwnProperty') as (this: object, key: PropertyKey) => boolean;
const weakSetAddIntrinsic = captureIntrinsicMethod(WeakSet.prototype, 'add') as (this: WeakSet<object>, value: object) => WeakSet<object>;
const weakSetHasIntrinsic = captureIntrinsicMethod(WeakSet.prototype, 'has') as (this: WeakSet<object>, value: object) => boolean;
const weakMapGetIntrinsic = captureIntrinsicMethod(WeakMap.prototype, 'get');
const weakMapSetIntrinsic = captureIntrinsicMethod(WeakMap.prototype, 'set');
const mapGetIntrinsic = captureIntrinsicMethod(Map.prototype, 'get');
const mapSetIntrinsic = captureIntrinsicMethod(Map.prototype, 'set');
const authoredUpdates = new WeakSet<object>();
const authoredInheritedDataDescriptorResolutions = new WeakSet<object>();
const authoredFailures = new WeakSet<object>();
const updateAuthorities = new WeakMap<object, DescriptorUpdateAuthority>();
const inheritedDataDescriptorResolutionAuthorities = new WeakMap<object, InheritedDataDescriptorResolutionAuthority>();
const propertyEpochs = new WeakMap<object, Map<PropertyKey, Readonly<object>>>();
const initialPropertyEpoch = freezeIntrinsic({});
const MAX_INHERITED_DESCRIPTOR_PATH_LENGTH = 256;
function callIntrinsic<Arguments extends readonly unknown[], Result>(callback: (...args: Arguments) => Result, receiver: unknown, args: Arguments): Result {
    return applyIntrinsic(callback, receiver, args as unknown as ArrayLike<unknown>) as Result;
}
function hasOwn(value: object, key: PropertyKey): boolean {
    return callIntrinsic(hasOwnPropertyIntrinsic, value, [key]);
}
function brand<Value extends object>(ledger: WeakSet<object>, value: Value): Value {
    callIntrinsic(weakSetAddIntrinsic, ledger, [value]);
    return value;
}
function isBranded(ledger: WeakSet<object>, value: object): boolean {
    return callIntrinsic(weakSetHasIntrinsic, ledger, [value]);
}
function weakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return callIntrinsic(weakMapGetIntrinsic, map, [key]) as Value | undefined;
}
function weakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    callIntrinsic(weakMapSetIntrinsic, map, [key, value]);
}
function mapGet<Key, Value>(map: Map<Key, Value>, key: Key): Value | undefined {
    return callIntrinsic(mapGetIntrinsic, map, [key]) as Value | undefined;
}
function mapSet<Key, Value>(map: Map<Key, Value>, key: Key, value: Value): void {
    callIntrinsic(mapSetIntrinsic, map, [key, value]);
}
function valueIsArray(value: unknown): boolean {
    return isArrayIntrinsic(value);
}
function freezeExact<Value extends object>(value: Value): Value {
    const returned = freezeIntrinsic(value);
    if (returned !== value || !isFrozenIntrinsic(value)) {
        throw new Error('Descriptor transaction could not freeze its exact authored record.');
    }
    return value;
}
function readPropertyEpoch(target: object, key: PropertyKey): Readonly<object> {
    const epochs = weakMapGet(propertyEpochs, target);
    return (epochs ? mapGet(epochs, key) : undefined) ?? initialPropertyEpoch;
}
function advancePropertyEpoch(target: object, key: PropertyKey): Readonly<object> {
    let epochs = weakMapGet(propertyEpochs, target);
    if (!epochs) {
        epochs = new MapIntrinsic<PropertyKey, Readonly<object>>();
        weakMapSet(propertyEpochs, target, epochs);
    }
    const epoch = freezeExact({});
    mapSet(epochs, key, epoch);
    return epoch;
}
function updateAuthority(update: unknown): DescriptorUpdateAuthority | null {
    if (!update || typeof update !== 'object' || !isFrozenIntrinsic(update) || !isBranded(authoredUpdates, update)) {
        return null;
    }
    return weakMapGet(updateAuthorities, update) ?? null;
}
function inheritedDataDescriptorResolutionAuthority(resolution: unknown): InheritedDataDescriptorResolutionAuthority | null {
    if (!resolution ||
        typeof resolution !== 'object' ||
        !isFrozenIntrinsic(resolution) ||
        !isBranded(authoredInheritedDataDescriptorResolutions, resolution)) {
        return null;
    }
    return weakMapGet(inheritedDataDescriptorResolutionAuthorities, resolution) ?? null;
}
function readDescriptorField(descriptor: object, key: PropertyKey): DescriptorField {
    const field = getOwnDescriptor(descriptor, key);
    if (!field)
        return { present: false, value: undefined };
    if (!hasOwn(field, 'value')) {
        throw new TypeError('Descriptor transaction descriptors must contain only own data fields.');
    }
    return { present: true, value: field.value };
}
function snapshotDescriptor(descriptor: PropertyDescriptor | undefined): PropertyDescriptor | undefined {
    if (descriptor === undefined)
        return undefined;
    const allowedKeys: readonly PropertyKey[] = ['configurable', 'enumerable', 'value', 'writable', 'get', 'set'];
    const ownKeys = ownKeysIntrinsic(descriptor);
    let index = 0;
    while (index < ownKeys.length) {
        const key = ownKeys[index] as PropertyKey;
        let allowed = false;
        let allowedIndex = 0;
        while (allowedIndex < allowedKeys.length) {
            if (key === allowedKeys[allowedIndex]) {
                allowed = true;
                break;
            }
            allowedIndex += 1;
        }
        if (!allowed)
            throw new TypeError('Descriptor transaction descriptor contains an unknown field.');
        readDescriptorField(descriptor, key);
        index += 1;
    }
    const configurable = readDescriptorField(descriptor, 'configurable');
    const enumerable = readDescriptorField(descriptor, 'enumerable');
    const value = readDescriptorField(descriptor, 'value');
    const writable = readDescriptorField(descriptor, 'writable');
    const getter = readDescriptorField(descriptor, 'get');
    const setter = readDescriptorField(descriptor, 'set');
    if ((configurable.present && typeof configurable.value !== 'boolean') ||
        (enumerable.present && typeof enumerable.value !== 'boolean') ||
        (writable.present && typeof writable.value !== 'boolean')) {
        throw new TypeError('Descriptor transaction descriptor flags must be booleans.');
    }
    const isData = value.present || writable.present;
    const isAccessor = getter.present || setter.present;
    if (isData === isAccessor) {
        throw new TypeError('Descriptor transaction descriptors must be complete data or accessor descriptors.');
    }
    if (isAccessor &&
        ((getter.present && getter.value !== undefined && typeof getter.value !== 'function') ||
            (setter.present && setter.value !== undefined && typeof setter.value !== 'function'))) {
        throw new TypeError('Descriptor transaction accessors must be functions or undefined.');
    }
    const snapshot: PropertyDescriptor = {
        configurable: configurable.value === true,
        enumerable: enumerable.value === true,
    };
    if (isData) {
        snapshot.value = value.value;
        snapshot.writable = writable.value === true;
    }
    else {
        definePropertyIntrinsic(snapshot, 'get', {
            configurable: true,
            enumerable: true,
            writable: true,
            value: getter.value,
        });
        definePropertyIntrinsic(snapshot, 'set', {
            configurable: true,
            enumerable: true,
            writable: true,
            value: setter.value,
        });
    }
    return freezeExact(snapshot);
}
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function pathContains(path: readonly object[], candidate: object): boolean {
    let index = 0;
    while (index < path.length) {
        if (path[index] === candidate)
            return true;
        index += 1;
    }
    return false;
}
function captureInheritedDataDescriptorGuard(target: object, key: PropertyKey): InheritedDataDescriptorGuard | null {
    if (getOwnDescriptor(target, key) !== undefined || !isExtensibleIntrinsic(target))
        return null;
    const path: object[] = [target];
    let cursor = target;
    while (path.length < MAX_INHERITED_DESCRIPTOR_PATH_LENGTH) {
        const prototype = getPrototypeOfIntrinsic(cursor) as unknown;
        if (!isObjectReference(prototype) || pathContains(path, prototype))
            return null;
        path[path.length] = prototype;
        const descriptor = getOwnDescriptor(prototype, key);
        if (descriptor !== undefined) {
            const ownerDescriptor = snapshotDescriptor(descriptor);
            if (!ownerDescriptor || !hasOwn(ownerDescriptor, 'value'))
                return null;
            return freezeExact({
                path: freezeExact(path),
                ownerDescriptor,
            });
        }
        cursor = prototype;
    }
    return null;
}
function inheritedDataDescriptorGuardMatches(target: object, key: PropertyKey, guard: InheritedDataDescriptorGuard, requireTargetAbsence: boolean): boolean {
    try {
        const path = guard.path;
        if (path.length < 2 ||
            path.length > MAX_INHERITED_DESCRIPTOR_PATH_LENGTH ||
            path[0] !== target ||
            (requireTargetAbsence && getOwnDescriptor(target, key) !== undefined)) {
            return false;
        }
        let index = 0;
        while (index + 1 < path.length) {
            const current = path[index];
            const prototype = path[index + 1];
            if (!current || !prototype || getPrototypeOfIntrinsic(current) !== prototype)
                return false;
            const descriptor = getOwnDescriptor(prototype, key);
            if (index + 1 === path.length - 1) {
                if (!descriptorsEqual(descriptor, guard.ownerDescriptor))
                    return false;
            }
            else if (descriptor !== undefined) {
                return false;
            }
            index += 1;
        }
        return !requireTargetAbsence || getOwnDescriptor(target, key) === undefined;
    }
    catch {
        return false;
    }
}
export function captureInheritedDataDescriptorResolution(target: object, key: PropertyKey): InheritedDataDescriptorResolution | null {
    try {
        if (!isObjectReference(target) || (typeof key !== 'string' && typeof key !== 'symbol'))
            return null;
        const capturedEpoch = readPropertyEpoch(target, key);
        const guard = captureInheritedDataDescriptorGuard(target, key);
        if (!guard ||
            readPropertyEpoch(target, key) !== capturedEpoch ||
            !isExtensibleIntrinsic(target) ||
            !inheritedDataDescriptorGuardMatches(target, key, guard, true) ||
            readPropertyEpoch(target, key) !== capturedEpoch) {
            return null;
        }
        const inheritedValue = readDescriptorField(guard.ownerDescriptor, 'value').value;
        const resolution = brand(authoredInheritedDataDescriptorResolutions, freezeExact({ value: inheritedValue }));
        weakMapSet(inheritedDataDescriptorResolutionAuthorities, resolution, {
            target,
            key,
            capturedEpoch,
            guard,
        });
        return resolution;
    }
    catch {
        return null;
    }
}
function prototypeOwnsProperty(target: object, key: PropertyKey): boolean | null {
    try {
        const path: object[] = [target];
        let prototype = getPrototypeOfIntrinsic(target) as object | null;
        while (prototype) {
            if (path.length >= MAX_INHERITED_DESCRIPTOR_PATH_LENGTH || pathContains(path, prototype))
                return null;
            path[path.length] = prototype;
            if (getOwnDescriptor(prototype, key))
                return true;
            prototype = getPrototypeOfIntrinsic(prototype) as object | null;
        }
        return false;
    }
    catch {
        return null;
    }
}
function authorDescriptorUpdate(target: object, key: PropertyKey, expected: PropertyDescriptor | undefined, prepared: PropertyDescriptor | undefined, capturedEpoch: Readonly<object>, inheritedGuard: InheritedDataDescriptorGuard | null, ownSlotShadow = false): DescriptorTransactionUpdate {
    const update = brand(authoredUpdates, freezeExact({
        target,
        key,
        expected,
        prepared,
    }));
    weakMapSet(updateAuthorities, update, {
        capturedEpoch,
        inheritedGuard,
        ownSlotShadow,
        phase: 'captured',
        preparedEpoch: null,
        restoredEpoch: null,
    });
    return update;
}
export function createDescriptorUpdateFromExpected(target: object, key: PropertyKey, expected: PropertyDescriptor | undefined, prepared: PropertyDescriptor | undefined): DescriptorTransactionUpdate | null {
    try {
        const expectedSnapshot = snapshotDescriptor(expected);
        const preparedSnapshot = snapshotDescriptor(prepared);
        if (!expectedSnapshot && !preparedSnapshot)
            return null;
        if ((!expectedSnapshot || !preparedSnapshot) && prototypeOwnsProperty(target, key) !== false) {
            return null;
        }
        if (!expectedSnapshot && !isExtensibleIntrinsic(target))
            return null;
        if (expectedSnapshot && !preparedSnapshot && expectedSnapshot.configurable !== true)
            return null;
        return authorDescriptorUpdate(target, key, expectedSnapshot, preparedSnapshot, readPropertyEpoch(target, key), null, false);
    }
    catch {
        return null;
    }
}
export function createInheritedDataDescriptorShadowUpdate(resolution: InheritedDataDescriptorResolution, value: unknown): DescriptorTransactionUpdate | null {
    try {
        const authority = inheritedDataDescriptorResolutionAuthority(resolution);
        if (!authority)
            return null;
        if (readPropertyEpoch(authority.target, authority.key) !== authority.capturedEpoch ||
            !isExtensibleIntrinsic(authority.target) ||
            !inheritedDataDescriptorGuardMatches(authority.target, authority.key, authority.guard, true) ||
            readPropertyEpoch(authority.target, authority.key) !== authority.capturedEpoch) {
            return null;
        }
        const prepared = snapshotDescriptor({
            configurable: true,
            enumerable: authority.guard.ownerDescriptor.enumerable === true,
            writable: authority.guard.ownerDescriptor.writable === true,
            value,
        });
        if (!prepared)
            return null;
        return authorDescriptorUpdate(authority.target, authority.key, undefined, prepared, authority.capturedEpoch, authority.guard, false);
    }
    catch {
        return null;
    }
}
export function createOwnDataDescriptorShadowUpdate(target: object, key: PropertyKey, value: unknown): DescriptorTransactionUpdate | null {
    try {
        if (!isObjectReference(target) || (typeof key !== 'string' && typeof key !== 'symbol'))
            return null;
        const capturedEpoch = readPropertyEpoch(target, key);
        const expected = snapshotDescriptor(getOwnDescriptor(target, key));
        if (readPropertyEpoch(target, key) !== capturedEpoch)
            return null;
        let prepared: PropertyDescriptor;
        if (!expected) {
            if (!isExtensibleIntrinsic(target))
                return null;
            prepared = {
                configurable: true,
                enumerable: true,
                writable: true,
                value,
            };
        }
        else if (hasOwn(expected, 'value')) {
            if (expected.configurable !== true &&
                expected.writable !== true &&
                !objectIsIntrinsic(expected.value, value)) {
                return null;
            }
            prepared = {
                configurable: expected.configurable === true,
                enumerable: expected.enumerable === true,
                writable: expected.writable === true,
                value,
            };
        }
        else {
            if (expected.configurable !== true)
                return null;
            prepared = {
                configurable: true,
                enumerable: expected.enumerable === true,
                writable: true,
                value,
            };
        }
        const preparedSnapshot = snapshotDescriptor(prepared);
        if (!preparedSnapshot)
            return null;
        if (readPropertyEpoch(target, key) !== capturedEpoch ||
            !descriptorsEqual(getOwnDescriptor(target, key), expected) ||
            readPropertyEpoch(target, key) !== capturedEpoch) {
            return null;
        }
        return authorDescriptorUpdate(target, key, expected, preparedSnapshot, capturedEpoch, null, true);
    }
    catch {
        return null;
    }
}
export function createDataDescriptorUpdate(target: object, key: PropertyKey, value: unknown): DescriptorTransactionUpdate | null {
    try {
        return createDataDescriptorUpdateFromExpected(target, key, getOwnDescriptor(target, key), value);
    }
    catch {
        return null;
    }
}
export function createDataDescriptorUpdateFromExpected(target: object, key: PropertyKey, expected: PropertyDescriptor | undefined, value: unknown): DescriptorTransactionUpdate | null {
    try {
        const expectedSnapshot = snapshotDescriptor(expected);
        if (expectedSnapshot && !hasOwn(expectedSnapshot, 'value'))
            return null;
        if (expectedSnapshot &&
            expectedSnapshot.writable !== true &&
            !objectIsIntrinsic(expectedSnapshot.value, value)) {
            return null;
        }
        const prepared: PropertyDescriptor = expectedSnapshot
            ? {
                configurable: expectedSnapshot.configurable === true,
                enumerable: expectedSnapshot.enumerable === true,
                writable: expectedSnapshot.writable === true,
                value,
            }
            : { configurable: true, enumerable: true, writable: true, value };
        return createDescriptorUpdateFromExpected(target, key, expectedSnapshot, prepared);
    }
    catch {
        return null;
    }
}
export function createDeleteDescriptorUpdate(target: object, key: PropertyKey): DescriptorTransactionUpdate | null {
    try {
        return createDeleteDescriptorUpdateFromExpected(target, key, getOwnDescriptor(target, key));
    }
    catch {
        return null;
    }
}
export function createDeleteDescriptorUpdateFromExpected(target: object, key: PropertyKey, expected: PropertyDescriptor | undefined): DescriptorTransactionUpdate | null {
    try {
        const expectedSnapshot = snapshotDescriptor(expected);
        if (expectedSnapshot?.configurable !== true)
            return null;
        return createDescriptorUpdateFromExpected(target, key, expectedSnapshot, undefined);
    }
    catch {
        return null;
    }
}
function snapshotPlan(updates: readonly DescriptorTransactionUpdate[]): readonly DescriptorTransactionUpdate[] {
    if (!valueIsArray(updates)) {
        throw new TypeError('Descriptor transaction plan must be an array.');
    }
    const plan: DescriptorTransactionUpdate[] = [];
    let index = 0;
    while (index < updates.length) {
        const update = updates[index];
        if (!update || !updateAuthority(update)) {
            throw new TypeError('Descriptor transaction plan contains an unauthored update.');
        }
        let previousIndex = 0;
        while (previousIndex < plan.length) {
            const previous = plan[previousIndex];
            if (previous?.target === update.target && previous.key === update.key) {
                throw new TypeError('Descriptor transaction plan updates one property more than once.');
            }
            previousIndex += 1;
        }
        plan[plan.length] = update;
        index += 1;
    }
    return freezeExact(plan);
}
function captureSnapshot(update: DescriptorTransactionUpdate, allowInheritedOwnSlot: boolean): DescriptorSnapshot {
    if (!allowInheritedOwnSlot &&
        (update.expected === undefined || update.prepared === undefined) &&
        prototypeOwnsProperty(update.target, update.key) !== false) {
        return { safe: false, descriptor: undefined };
    }
    return { safe: true, descriptor: getOwnDescriptor(update.target, update.key) };
}
function applyDescriptor(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) {
        definePropertyIntrinsic(target, key, descriptor);
        return;
    }
    if (!deletePropertyIntrinsic(target, key)) {
        throw new Error('Descriptor transaction property deletion failed.');
    }
}
function updateWasAttempted(attempted: readonly DescriptorTransactionUpdate[], update: DescriptorTransactionUpdate): boolean {
    let index = 0;
    while (index < attempted.length) {
        if (attempted[index] === update)
            return true;
        index += 1;
    }
    return false;
}
function updateMatchesEpoch(update: DescriptorTransactionUpdate, epoch: Readonly<object> | null, side: 'expected' | 'prepared', requireInheritedGuard = false): boolean {
    if (!epoch || readPropertyEpoch(update.target, update.key) !== epoch)
        return false;
    const authority = updateAuthority(update);
    const inheritedGuard = authority?.inheritedGuard ?? null;
    if (requireInheritedGuard &&
        (!inheritedGuard || !inheritedDataDescriptorGuardMatches(update.target, update.key, inheritedGuard, true))) {
        return false;
    }
    const snapshot = captureSnapshot(update, inheritedGuard !== null || authority?.ownSlotShadow === true);
    return (snapshot.safe &&
        descriptorsEqual(snapshot.descriptor, update[side]) &&
        (!requireInheritedGuard ||
            (inheritedGuard !== null &&
                inheritedDataDescriptorGuardMatches(update.target, update.key, inheritedGuard, true))) &&
        readPropertyEpoch(update.target, update.key) === epoch);
}
function updateInheritedGuardMatches(update: DescriptorTransactionUpdate, requireTargetAbsence: boolean): boolean {
    const guard = updateAuthority(update)?.inheritedGuard;
    return !guard || inheritedDataDescriptorGuardMatches(update.target, update.key, guard, requireTargetAbsence);
}
function updateMatchesPublicSide(update: DescriptorTransactionUpdate, side: 'expected' | 'prepared'): boolean {
    const authority = updateAuthority(update);
    if (!authority)
        return false;
    if (side === 'prepared') {
        return authority.phase === 'committed' && updateMatchesEpoch(update, authority.preparedEpoch, side);
    }
    if (authority.phase === 'captured') {
        return updateMatchesEpoch(update, authority.capturedEpoch, side, authority.inheritedGuard !== null);
    }
    return authority.phase === 'compensated' && updateMatchesEpoch(update, authority.restoredEpoch, side);
}
function planMatchesPublicSide(plan: readonly DescriptorTransactionUpdate[], side: 'expected' | 'prepared'): boolean {
    try {
        let index = 0;
        while (index < plan.length) {
            const update = plan[index];
            if (!update || !updateMatchesPublicSide(update, side))
                return false;
            index += 1;
        }
        return true;
    }
    catch {
        return false;
    }
}
function claimPlan(plan: readonly DescriptorTransactionUpdate[], expectedPhase: 'captured' | 'committed', claimedPhase: 'committing' | 'compensating'): boolean {
    let index = 0;
    while (index < plan.length) {
        const authority = updateAuthority(plan[index]);
        if (authority?.phase !== expectedPhase)
            return false;
        index += 1;
    }
    index = 0;
    while (index < plan.length) {
        const authority = updateAuthority(plan[index]);
        if (!authority)
            return false;
        authority.phase = claimedPhase;
        index += 1;
    }
    return true;
}
function terminalizePlan(plan: readonly DescriptorTransactionUpdate[], phase: 'committed' | 'compensated' | 'spent', epochs: Map<DescriptorTransactionUpdate, Readonly<object>> | null = null): void {
    let index = 0;
    while (index < plan.length) {
        const update = plan[index];
        const authority = updateAuthority(update);
        if (update && authority) {
            authority.phase = phase;
            if (phase === 'committed') {
                authority.preparedEpoch = epochs ? (mapGet(epochs, update) ?? null) : null;
                authority.restoredEpoch = null;
            }
            else if (phase === 'compensated') {
                authority.restoredEpoch = epochs ? (mapGet(epochs, update) ?? null) : null;
            }
        }
        index += 1;
    }
}
function captureClaimedEpochs(plan: readonly DescriptorTransactionUpdate[], phase: 'committing' | 'compensating'): Map<DescriptorTransactionUpdate, Readonly<object>> | null {
    const epochs = new MapIntrinsic<DescriptorTransactionUpdate, Readonly<object>>();
    let index = 0;
    while (index < plan.length) {
        const update = plan[index];
        const authority = updateAuthority(update);
        if (!update || authority?.phase !== phase)
            return null;
        const epoch = phase === 'committing' ? authority.capturedEpoch : authority.preparedEpoch;
        if (!epoch)
            return null;
        mapSet(epochs, update, epoch);
        index += 1;
    }
    return epochs;
}
function inspectPlanOwnedEpochs(plan: readonly DescriptorTransactionUpdate[], epochs: Map<DescriptorTransactionUpdate, Readonly<object>>, side: 'expected' | 'prepared', requireInheritedGuards = false): OwnedEpochInspection {
    try {
        let index = 0;
        while (index < plan.length) {
            const update = plan[index];
            const epoch = update ? mapGet(epochs, update) : undefined;
            if (!update ||
                !updateMatchesEpoch(update, epoch ?? null, side, requireInheritedGuards && updateAuthority(update)?.inheritedGuard !== null)) {
                return { status: 'mismatch' };
            }
            index += 1;
        }
        return { status: 'matches' };
    }
    catch (error) {
        return { status: 'unreadable', error };
    }
}
function planMatchesOwnedEpochs(plan: readonly DescriptorTransactionUpdate[], epochs: Map<DescriptorTransactionUpdate, Readonly<object>>, side: 'expected' | 'prepared', requireInheritedGuards = false): boolean {
    return inspectPlanOwnedEpochs(plan, epochs, side, requireInheritedGuards).status === 'matches';
}
function inspectUpdateOwnedEpoch(update: DescriptorTransactionUpdate, epochs: Map<DescriptorTransactionUpdate, Readonly<object>>, side: 'expected' | 'prepared'): OwnedEpochInspection {
    try {
        return updateMatchesEpoch(update, mapGet(epochs, update) ?? null, side)
            ? { status: 'matches' }
            : { status: 'mismatch' };
    }
    catch (error) {
        return { status: 'unreadable', error };
    }
}
function releaseUnwrittenPlanClaim(plan: readonly DescriptorTransactionUpdate[], epochs: Map<DescriptorTransactionUpdate, Readonly<object>>, claimedPhase: 'committing' | 'compensating'): boolean {
    try {
        let index = 0;
        while (index < plan.length) {
            const update = plan[index];
            const authority = updateAuthority(update);
            const epoch = update ? mapGet(epochs, update) : undefined;
            const retainedEpoch = claimedPhase === 'committing' ? authority?.capturedEpoch : authority?.preparedEpoch;
            if (!update ||
                authority?.phase !== claimedPhase ||
                !epoch ||
                retainedEpoch !== epoch ||
                readPropertyEpoch(update.target, update.key) !== epoch) {
                return false;
            }
            index += 1;
        }
        index = 0;
        while (index < plan.length) {
            const authority = updateAuthority(plan[index]);
            if (!authority)
                return false;
            authority.phase = claimedPhase === 'committing' ? 'captured' : 'committed';
            index += 1;
        }
        return true;
    }
    catch {
        return false;
    }
}
function allUpdatesAttempted(plan: readonly DescriptorTransactionUpdate[], attempted: readonly DescriptorTransactionUpdate[]): boolean {
    let index = 0;
    while (index < plan.length) {
        const update = plan[index];
        if (!update || !updateWasAttempted(attempted, update))
            return false;
        index += 1;
    }
    return true;
}
function createResult(committed: boolean, rollbackComplete: boolean, failures: readonly DescriptorTransactionFailure[]): DescriptorTransactionResult {
    return freezeExact({ committed, rollbackComplete, failures });
}
export function commitDescriptorTransaction(updates: readonly DescriptorTransactionUpdate[]): DescriptorTransactionResult {
    let plan: readonly DescriptorTransactionUpdate[];
    try {
        plan = snapshotPlan(updates);
    }
    catch (error) {
        return createResult(false, true, freezeDescriptorTransactionFailures([
            createDescriptorTransactionFailure('publish', '', 'transition', error),
        ]));
    }
    const emptyFailures = freezeDescriptorTransactionFailures([]);
    if (!claimPlan(plan, 'captured', 'committing'))
        return createResult(false, true, emptyFailures);
    const ownedEpochs = captureClaimedEpochs(plan, 'committing');
    if (!ownedEpochs) {
        terminalizePlan(plan, 'spent');
        return createResult(false, true, emptyFailures);
    }
    const preflight = inspectPlanOwnedEpochs(plan, ownedEpochs, 'expected', true);
    if (preflight.status !== 'matches') {
        if (preflight.status === 'unreadable' && releaseUnwrittenPlanClaim(plan, ownedEpochs, 'committing')) {
            return createResult(false, true, freezeDescriptorTransactionFailures([
                createDescriptorTransactionFailure('commit', '', 'transition', preflight.error),
            ]));
        }
        terminalizePlan(plan, 'spent');
        return createResult(false, true, emptyFailures);
    }
    const attempted: DescriptorTransactionUpdate[] = [];
    const invalidInheritedPublications: DescriptorTransactionUpdate[] = [];
    let publishing: DescriptorTransactionUpdate | undefined;
    try {
        let index = 0;
        while (index < plan.length) {
            const update = plan[index];
            if (!update) {
                index += 1;
                continue;
            }
            publishing = update;
            const expectedEpoch = mapGet(ownedEpochs, update) ?? null;
            let expectedMatches = false;
            try {
                expectedMatches = updateMatchesEpoch(update, expectedEpoch, 'expected', updateAuthority(update)?.inheritedGuard !== null);
            }
            catch (error) {
                if (attempted.length === 0) {
                    const released = releaseUnwrittenPlanClaim(plan, ownedEpochs, 'committing');
                    if (!released)
                        terminalizePlan(plan, 'spent');
                    return createResult(false, true, freezeDescriptorTransactionFailures([
                        createDescriptorTransactionFailure('publish', update.key, update.prepared ? 'define' : 'delete', error),
                    ]));
                }
                throw error;
            }
            if (!expectedMatches) {
                if (attempted.length === 0) {
                    terminalizePlan(plan, 'spent');
                    return createResult(false, true, emptyFailures);
                }
                throw new Error('Descriptor transaction destination drifted before publication.');
            }
            attempted[attempted.length] = update;
            const publishingEpoch = advancePropertyEpoch(update.target, update.key);
            mapSet(ownedEpochs, update, publishingEpoch);
            applyDescriptor(update.target, update.key, update.prepared);
            const inheritedGuardMatches = updateInheritedGuardMatches(update, false);
            if (!inheritedGuardMatches) {
                invalidInheritedPublications[invalidInheritedPublications.length] = update;
            }
            if (!updateMatchesEpoch(update, publishingEpoch, 'prepared') || !inheritedGuardMatches) {
                throw new Error('Descriptor transaction publication was not exact.');
            }
            index += 1;
        }
        terminalizePlan(plan, 'committed', ownedEpochs);
        if (!planMatchesPublicSide(plan, 'prepared')) {
            terminalizePlan(plan, 'spent');
            throw new Error('Descriptor transaction lost committed authority.');
        }
        return createResult(true, false, emptyFailures);
    }
    catch (publicationError) {
        const failures: DescriptorTransactionFailure[] = [
            createDescriptorTransactionFailure('publish', publishing?.key ?? '', publishing?.prepared ? 'define' : 'delete', publicationError),
        ];
        for (let index = attempted.length - 1; index >= 0; index -= 1) {
            const update = attempted[index];
            if (!update)
                continue;
            try {
                const ownedEpoch = mapGet(ownedEpochs, update) ?? null;
                if (!updateMatchesEpoch(update, ownedEpoch, 'prepared'))
                    continue;
                const rollbackEpoch = advancePropertyEpoch(update.target, update.key);
                mapSet(ownedEpochs, update, rollbackEpoch);
                applyDescriptor(update.target, update.key, update.expected);
                if (!updateMatchesEpoch(update, rollbackEpoch, 'expected')) {
                    throw new Error('Descriptor transaction rollback was not exact.', {
                        cause: publicationError,
                    });
                }
            }
            catch (rollbackError) {
                failures[failures.length] = createDescriptorTransactionFailure('rollback', update.key, update.expected ? 'define' : 'delete', rollbackError);
            }
        }
        if (planMatchesOwnedEpochs(plan, ownedEpochs, 'expected')) {
            terminalizePlan(plan, 'compensated', ownedEpochs);
            return createResult(false, planMatchesPublicSide(plan, 'expected'), freezeDescriptorTransactionFailures(failures));
        }
        let repairPlanSafe = true;
        let classificationIndex = 0;
        while (classificationIndex < plan.length) {
            const update = plan[classificationIndex];
            const ownedEpoch = update ? (mapGet(ownedEpochs, update) ?? null) : null;
            if (!update || !ownedEpoch || readPropertyEpoch(update.target, update.key) !== ownedEpoch) {
                repairPlanSafe = false;
                break;
            }
            try {
                const updateAuthorityValue = updateAuthority(update);
                if (!updateAuthorityValue) {
                    repairPlanSafe = false;
                    break;
                }
                const snapshot = captureSnapshot(update, updateAuthorityValue.inheritedGuard !== null || updateAuthorityValue.ownSlotShadow);
                const epochStillOwned = readPropertyEpoch(update.target, update.key) === ownedEpoch;
                const expected = snapshot.safe && descriptorsEqual(snapshot.descriptor, update.expected);
                const prepared = snapshot.safe && descriptorsEqual(snapshot.descriptor, update.prepared);
                if (!epochStillOwned ||
                    (prepared && updateWasAttempted(invalidInheritedPublications, update)) ||
                    (!expected && (!prepared || !updateWasAttempted(attempted, update)))) {
                    repairPlanSafe = false;
                    break;
                }
            }
            catch {
                repairPlanSafe = false;
                break;
            }
            classificationIndex += 1;
        }
        if (!repairPlanSafe) {
            terminalizePlan(plan, 'spent');
            return createResult(false, false, freezeDescriptorTransactionFailures(failures));
        }
        let repairAuthorityLost = false;
        let repairIndex = 0;
        while (repairIndex < plan.length) {
            const update = plan[repairIndex];
            if (!update) {
                repairAuthorityLost = true;
                break;
            }
            try {
                const ownedEpoch = mapGet(ownedEpochs, update) ?? null;
                if (!ownedEpoch || readPropertyEpoch(update.target, update.key) !== ownedEpoch) {
                    repairAuthorityLost = true;
                    break;
                }
                const updateAuthorityValue = updateAuthority(update);
                if (!updateAuthorityValue) {
                    repairAuthorityLost = true;
                    break;
                }
                const snapshot = captureSnapshot(update, updateAuthorityValue.inheritedGuard !== null || updateAuthorityValue.ownSlotShadow);
                if (!snapshot.safe || readPropertyEpoch(update.target, update.key) !== ownedEpoch) {
                    repairAuthorityLost = true;
                    break;
                }
                const prepared = descriptorsEqual(snapshot.descriptor, update.prepared);
                const expected = descriptorsEqual(snapshot.descriptor, update.expected);
                if (prepared) {
                    if (!updateWasAttempted(attempted, update)) {
                        repairAuthorityLost = true;
                        break;
                    }
                    repairIndex += 1;
                    continue;
                }
                if (!expected) {
                    repairAuthorityLost = true;
                    break;
                }
                if (!updateInheritedGuardMatches(update, true)) {
                    repairAuthorityLost = true;
                    break;
                }
                attempted[attempted.length] = update;
                const repairEpoch = advancePropertyEpoch(update.target, update.key);
                mapSet(ownedEpochs, update, repairEpoch);
                applyDescriptor(update.target, update.key, update.prepared);
                if (!updateMatchesEpoch(update, repairEpoch, 'prepared') ||
                    !updateInheritedGuardMatches(update, false)) {
                    throw new Error('Descriptor transaction forward repair was not exact.', {
                        cause: publicationError,
                    });
                }
            }
            catch (repairError) {
                failures[failures.length] = createDescriptorTransactionFailure('forward-repair', update.key, update.prepared ? 'define' : 'delete', repairError);
                break;
            }
            repairIndex += 1;
        }
        const committed = !repairAuthorityLost &&
            allUpdatesAttempted(plan, attempted) &&
            planMatchesOwnedEpochs(plan, ownedEpochs, 'prepared');
        terminalizePlan(plan, committed ? 'committed' : 'spent', committed ? ownedEpochs : null);
        return createResult(committed && planMatchesPublicSide(plan, 'prepared'), false, freezeDescriptorTransactionFailures(failures));
    }
}
export function compensateDescriptorTransaction(updates: readonly DescriptorTransactionUpdate[]): DescriptorTransactionCompensationResult {
    let plan: readonly DescriptorTransactionUpdate[];
    try {
        plan = snapshotPlan(updates);
    }
    catch (error) {
        const failures = freezeDescriptorTransactionFailures([
            createDescriptorTransactionFailure('rollback', '', 'transition', error),
        ]);
        return freezeExact({ compensated: false, failures });
    }
    const failures: DescriptorTransactionFailure[] = [];
    if (!claimPlan(plan, 'committed', 'compensating')) {
        return freezeExact({
            compensated: false,
            failures: freezeDescriptorTransactionFailures(failures),
        });
    }
    const ownedEpochs = captureClaimedEpochs(plan, 'compensating');
    if (!ownedEpochs) {
        terminalizePlan(plan, 'spent');
        return freezeExact({
            compensated: false,
            failures: freezeDescriptorTransactionFailures(failures),
        });
    }
    let hostWriteAttempted = false;
    for (let index = plan.length - 1; index >= 0; index -= 1) {
        const update = plan[index];
        if (!update)
            continue;
        const authority = updateAuthority(update);
        let rollbackEpoch: Readonly<object> | null = null;
        try {
            const ownedEpoch = mapGet(ownedEpochs, update) ?? null;
            if (!authority || !updateMatchesEpoch(update, ownedEpoch, 'prepared')) {
                if (authority)
                    authority.phase = 'spent';
                continue;
            }
            rollbackEpoch = advancePropertyEpoch(update.target, update.key);
            mapSet(ownedEpochs, update, rollbackEpoch);
            hostWriteAttempted = true;
            applyDescriptor(update.target, update.key, update.expected);
            if (!updateMatchesEpoch(update, rollbackEpoch, 'expected')) {
                throw new Error('Descriptor transaction compensation was not exact.');
            }
            authority.phase = 'compensated';
            authority.restoredEpoch = rollbackEpoch;
        }
        catch (error) {
            if (!hostWriteAttempted && releaseUnwrittenPlanClaim(plan, ownedEpochs, 'compensating')) {
                failures[failures.length] = createDescriptorTransactionFailure('rollback', update.key, update.expected ? 'define' : 'delete', error);
                return freezeExact({
                    compensated: false,
                    failures: freezeDescriptorTransactionFailures(failures),
                });
            }
            const restoredInspection = authority && rollbackEpoch
                ? inspectUpdateOwnedEpoch(update, ownedEpochs, 'expected')
                : { status: 'mismatch' as const };
            const preparedInspection = authority && rollbackEpoch && restoredInspection.status !== 'matches'
                ? inspectUpdateOwnedEpoch(update, ownedEpochs, 'prepared')
                : { status: 'mismatch' as const };
            if (authority && rollbackEpoch && restoredInspection.status === 'matches') {
                authority.phase = 'compensated';
                authority.restoredEpoch = rollbackEpoch;
            }
            else if (authority && rollbackEpoch && preparedInspection.status === 'matches') {
                authority.phase = 'spent';
                authority.preparedEpoch = null;
                authority.restoredEpoch = null;
            }
            else if (authority) {
                authority.phase = 'spent';
            }
            failures[failures.length] = createDescriptorTransactionFailure('rollback', update.key, update.expected ? 'define' : 'delete', error);
        }
    }
    const frozenFailures = freezeDescriptorTransactionFailures(failures);
    const compensated = planMatchesPublicSide(plan, 'expected');
    return freezeExact({
        compensated,
        failures: frozenFailures,
    });
}
export function descriptorTransactionMatches(updates: readonly DescriptorTransactionUpdate[], side: 'expected' | 'prepared'): boolean {
    try {
        return planMatchesPublicSide(snapshotPlan(updates), side);
    }
    catch {
        return false;
    }
}
export function descriptorsEqual(left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean {
    if (!left || !right)
        return left === right;
    const leftData = hasOwn(left, 'value');
    const rightData = hasOwn(right, 'value');
    if (leftData !== rightData)
        return false;
    return (left.configurable === right.configurable &&
        left.enumerable === right.enumerable &&
        (leftData
            ? left.writable === right.writable && objectIsIntrinsic(left.value, right.value)
            : left.get === right.get && left.set === right.set));
}
export function createDescriptorTransactionFailure(phase: DescriptorTransactionFailure['phase'], key: PropertyKey, operation: DescriptorTransactionFailure['operation'], error: unknown): DescriptorTransactionFailure {
    const keyLabel = typeof key === 'string' ? key : stringIntrinsic(key);
    return brand(authoredFailures, freezeExact({ phase, operation, key: keyLabel, error }));
}
export function isDescriptorTransactionFailure(value: unknown): value is DescriptorTransactionFailure {
    return Boolean(value && typeof value === 'object' && isFrozenIntrinsic(value) && isBranded(authoredFailures, value));
}
export function freezeDescriptorTransactionFailures(failures: readonly DescriptorTransactionFailure[]): readonly DescriptorTransactionFailure[] {
    if (!valueIsArray(failures)) {
        throw new TypeError('Descriptor transaction failures must be an array.');
    }
    const snapshot: DescriptorTransactionFailure[] = [];
    let index = 0;
    while (index < failures.length) {
        const failure = failures[index];
        if (!isDescriptorTransactionFailure(failure)) {
            throw new TypeError('Descriptor transaction failure list contains an unauthored record.');
        }
        snapshot[snapshot.length] = failure;
        index += 1;
    }
    return freezeExact(snapshot);
}
