type UnknownFunction = (...args: unknown[]) => unknown;
export type WindowTextScaleMethodRestorationStatus = 'restored' | 'released-to-successor' | 'failed';
export interface WindowTextScaleMethodRestorationSlot {
    readonly name: string;
    readonly status: WindowTextScaleMethodRestorationStatus;
}
export interface WindowTextScaleBitmapRestorationSlot {
    readonly bitmap: object;
    readonly status: 'restored' | 'failed';
}
export interface WindowTextScaleRestorationReceipt {
    readonly kind: 'window-text-scale-restoration';
    readonly schemaVersion: 1;
    readonly status: 'restored' | 'damaged';
    readonly windowMethods: {
        readonly status: 'restored' | 'damaged';
        readonly slots: readonly WindowTextScaleMethodRestorationSlot[];
    };
    readonly bitmapStates: {
        readonly status: 'restored' | 'damaged';
        readonly slots: readonly WindowTextScaleBitmapRestorationSlot[];
    };
}
export interface WindowTextScaleScope {
    restore(): WindowTextScaleRestorationReceipt;
}
export type WindowTextScaleCreationPhase = 'capture' | 'method-install' | 'initial-scale';
export type WindowTextScaleCreationResult = {
    readonly status: 'active';
    readonly scope: WindowTextScaleScope;
} | {
    readonly status: 'rejected';
    readonly phase: WindowTextScaleCreationPhase;
    readonly restoration: WindowTextScaleRestorationReceipt;
    readonly repair: WindowTextScaleScope | null;
};
interface WrappedWindowMethod {
    readonly installedDescriptor: PropertyDescriptor;
    readonly name: string;
    readonly previousDescriptor: PropertyDescriptor | undefined;
    settledStatus: WindowTextScaleMethodRestorationStatus | null;
}
interface TrackedBitmapDrawStateRestoration {
    readonly bitmap: object;
    readonly pendingRollbacks: RetryableBitmapDrawStateRollback[];
    readonly restoration: BitmapDrawStateRestoration;
    restored: boolean;
}
interface RetryableBitmapDrawStateRollback {
    readonly transaction: BitmapDrawStateTransaction;
    restored: boolean;
}
interface BitmapDrawStateApplicationResult {
    readonly applied: boolean;
    readonly failedRollback: BitmapDrawStateTransaction | null;
}
interface PropertyChainAuthority {
    readonly nodes: readonly object[];
}
interface BitmapDrawStateEntry {
    readonly key: PropertyKey;
    readonly value: unknown;
}
interface BitmapDrawStateBindingBase {
    readonly key: PropertyKey;
    readonly nextValue: unknown;
    readonly ownerIndex: number | null;
    readonly sourceDescriptor: PropertyDescriptor | null;
}
interface BitmapDrawStateDataBinding extends BitmapDrawStateBindingBase {
    readonly changes: boolean;
    readonly expectedOwnDescriptor: PropertyDescriptor | null;
    readonly kind: 'data';
}
interface BitmapDrawStateAccessorBinding extends BitmapDrawStateBindingBase {
    readonly changes: boolean;
    readonly getter: UnknownFunction;
    readonly kind: 'accessor';
    readonly previousValue: unknown;
    readonly setter: UnknownFunction | null;
}
type BitmapDrawStateBinding = BitmapDrawStateAccessorBinding | BitmapDrawStateDataBinding;
interface BitmapDrawStateTransaction {
    readonly bindings: readonly BitmapDrawStateBinding[];
    readonly chain: PropertyChainAuthority;
    readonly target: object;
}
interface BitmapDrawStateRestoration {
    readonly state: object;
    readonly transaction: BitmapDrawStateTransaction;
}
const DRAW_STATE_KEYS = [
    'fontFace',
    'fontSize',
    'fontBold',
    'fontItalic',
    'fontUnderline',
    'fontGradient',
    'textColor',
    'outlineColor',
    'outlineWidth',
    'paintOpacity',
    'gradientType',
    'gradientColor1',
    'gradientColor2',
] as const;
const MAX_PROPERTY_CHAIN_DEPTH = 64;
const reflectApplyIntrinsic = Reflect.apply;
const reflectDefinePropertyIntrinsic = Reflect.defineProperty;
const reflectDeletePropertyIntrinsic = Reflect.deleteProperty;
const reflectGetIntrinsic = Reflect.get;
const reflectGetOwnPropertyDescriptorIntrinsic = Reflect.getOwnPropertyDescriptor;
const reflectGetPrototypeOfIntrinsic = Reflect.getPrototypeOf;
const reflectIsExtensibleIntrinsic = Reflect.isExtensible;
const reflectSetIntrinsic = Reflect.set;
const objectCreateIntrinsic = Object.create;
const objectIsIntrinsic = Object.is;
const objectHasOwnPropertyIntrinsic = Object.prototype.hasOwnProperty;
const WeakMapConstructor = WeakMap;
const weakMapGetIntrinsic = WeakMap.prototype.get;
const weakMapHasIntrinsic = WeakMap.prototype.has;
const weakMapSetIntrinsic = WeakMap.prototype.set;
function isPropertySource(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function boxedPropertySource(value: unknown): object {
    if (value === null || value === undefined) {
        throw new TypeError('Cannot read properties of null or undefined.');
    }
    if (isPropertySource(value))
        return value;
    const boxed: unknown = reflectApplyIntrinsic(Object, undefined, [value]);
    if (!isPropertySource(boxed))
        throw new TypeError('Value is not property-readable.');
    return boxed;
}
function reflectedPropertyValue(target: object, key: PropertyKey): unknown {
    return reflectGetIntrinsic(target, key);
}
function propertyValue(value: unknown, key: unknown): unknown {
    return reflectApplyIntrinsic(reflectedPropertyValue, undefined, [boxedPropertySource(value), key]);
}
function setProperty(value: unknown, key: PropertyKey, nextValue: unknown): void {
    if (!isPropertySource(value) || !reflectSetIntrinsic(value, key, nextValue)) {
        throw new TypeError(`Unable to assign ${String(key)}.`);
    }
}
function reflectedHasOwn(target: object, key: PropertyKey): boolean {
    return reflectApplyIntrinsic(objectHasOwnPropertyIntrinsic, target, [key]);
}
function hasOwn(value: unknown, key: unknown): boolean {
    return reflectApplyIntrinsic(reflectedHasOwn, undefined, [value, key]) === true;
}
function numberValue(value: unknown): number {
    const converted: unknown = reflectApplyIntrinsic(Number, undefined, [value]);
    if (typeof converted !== 'number')
        throw new TypeError('Number conversion did not return a number.');
    return converted;
}
function stringValue(value: unknown): string {
    const converted: unknown = reflectApplyIntrinsic(String, undefined, [value]);
    if (typeof converted !== 'string')
        throw new TypeError('String conversion did not return text.');
    return converted;
}
function isCallable(value: unknown): value is UnknownFunction {
    return typeof value === 'function';
}
function truthyPropertyOr(value: unknown, key: PropertyKey, fallback: () => unknown): unknown {
    if (value && propertyValue(value, key))
        return propertyValue(value, key);
    return fallback();
}
function isPositiveFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function weakMapKey(value: unknown): object {
    if (!isPropertySource(value))
        throw new TypeError('Invalid value used as weak map key.');
    return value;
}
function weakMapHas<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): boolean {
    return reflectApplyIntrinsic(weakMapHasIntrinsic, map, [key]);
}
function weakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return reflectApplyIntrinsic(weakMapGetIntrinsic, map, [key]) as Value | undefined;
}
function weakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    reflectApplyIntrinsic(weakMapSetIntrinsic, map, [key, value]);
}
function descriptorHasDataValue(descriptor: PropertyDescriptor): boolean {
    return reflectApplyIntrinsic(objectHasOwnPropertyIntrinsic, descriptor, ['value']);
}
function descriptorProperty(descriptor: PropertyDescriptor, key: PropertyKey): unknown {
    return reflectGetIntrinsic(descriptor, key);
}
function clonePropertyDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
    const clone: PropertyDescriptor = {
        configurable: descriptor.configurable === true,
        enumerable: descriptor.enumerable === true,
    };
    if (descriptorHasDataValue(descriptor)) {
        clone.value = descriptorProperty(descriptor, 'value');
        clone.writable = descriptor.writable === true;
    }
    else {
        const getter = descriptorProperty(descriptor, 'get');
        const setter = descriptorProperty(descriptor, 'set');
        if (typeof getter === 'function')
            clone.get = getter as () => unknown;
        if (typeof setter === 'function')
            clone.set = setter as (value: unknown) => void;
    }
    return clone;
}
function propertyDescriptorsMatch(current: PropertyDescriptor | undefined, expected: PropertyDescriptor | null | undefined): boolean {
    if (!current || !expected)
        return current === undefined && (expected === undefined || expected === null);
    if (current.configurable !== expected.configurable ||
        current.enumerable !== expected.enumerable ||
        descriptorHasDataValue(current) !== descriptorHasDataValue(expected)) {
        return false;
    }
    if (descriptorHasDataValue(expected)) {
        return current.writable === expected.writable && objectIsIntrinsic(current.value, expected.value);
    }
    return current.get === expected.get && current.set === expected.set;
}
function propertyDescriptorStructuresMatch(current: PropertyDescriptor | undefined, expected: PropertyDescriptor): boolean {
    if (!current ||
        current.configurable !== expected.configurable ||
        current.enumerable !== expected.enumerable ||
        descriptorHasDataValue(current) !== descriptorHasDataValue(expected)) {
        return false;
    }
    if (descriptorHasDataValue(expected))
        return current.writable === expected.writable;
    return current.get === expected.get && current.set === expected.set;
}
function capturePropertyChain(target: object): PropertyChainAuthority {
    const nodes: object[] = [];
    let current: object | null = target;
    for (let depth = 0; depth < MAX_PROPERTY_CHAIN_DEPTH; depth += 1) {
        if (current === null)
            return { nodes };
        for (let index = 0; index < nodes.length; index += 1) {
            if (nodes[index] === current)
                throw new TypeError('Bitmap draw-state prototype chain is cyclic.');
        }
        nodes[nodes.length] = current;
        current = reflectGetPrototypeOfIntrinsic(current);
    }
    throw new TypeError('Bitmap draw-state prototype chain exceeds its safety bound.');
}
function propertyChainNode(chain: PropertyChainAuthority, index: number): object {
    const node = chain.nodes[index];
    if (!node)
        throw new TypeError('Bitmap draw-state property authority is incomplete.');
    return node;
}
function propertyChainMatches(chain: PropertyChainAuthority): boolean {
    for (let index = 0; index < chain.nodes.length; index += 1) {
        const expected = index + 1 < chain.nodes.length ? chain.nodes[index + 1] : null;
        if (reflectGetPrototypeOfIntrinsic(propertyChainNode(chain, index)) !== expected)
            return false;
    }
    return true;
}
function findResolvedDescriptor(chain: PropertyChainAuthority, key: PropertyKey): {
    readonly descriptor: PropertyDescriptor;
    readonly ownerIndex: number;
} | null {
    for (let index = 0; index < chain.nodes.length; index += 1) {
        const descriptor = reflectGetOwnPropertyDescriptorIntrinsic(propertyChainNode(chain, index), key);
        if (descriptor)
            return { descriptor, ownerIndex: index };
    }
    return null;
}
function captureBitmapDrawStateEntries(state: unknown): readonly BitmapDrawStateEntry[] {
    if (!isPropertySource(state))
        throw new TypeError('Bitmap draw state must be a record.');
    const entries: BitmapDrawStateEntry[] = [];
    for (let index = 0; index < DRAW_STATE_KEYS.length; index += 1) {
        const key = DRAW_STATE_KEYS[index];
        if (key === undefined)
            throw new TypeError('Bitmap draw-state key inventory is incomplete.');
        const descriptor = reflectGetOwnPropertyDescriptorIntrinsic(state, key);
        if (!descriptor)
            continue;
        if (!descriptorHasDataValue(descriptor)) {
            throw new TypeError(`Bitmap draw state property ${key} must be an own data property.`);
        }
        entries[entries.length] = { key, value: descriptorProperty(descriptor, 'value') };
    }
    return entries;
}
function createBitmapDrawStateSnapshot(entries: readonly BitmapDrawStateEntry[]): object {
    const snapshot = objectCreateIntrinsic(null) as object;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry)
            throw new TypeError('Bitmap draw-state entry inventory is incomplete.');
        if (!reflectDefinePropertyIntrinsic(snapshot, entry.key, {
            configurable: false,
            enumerable: true,
            value: entry.value,
            writable: false,
        })) {
            throw new TypeError(`Unable to capture bitmap draw state property ${String(entry.key)}.`);
        }
    }
    return snapshot;
}
function bindingSourceMatches(chain: PropertyChainAuthority, binding: BitmapDrawStateBinding): boolean {
    if (!propertyChainMatches(chain))
        return false;
    const ownerIndex = binding.ownerIndex;
    const stop = ownerIndex ?? chain.nodes.length;
    for (let index = 0; index < stop; index += 1) {
        if (reflectGetOwnPropertyDescriptorIntrinsic(propertyChainNode(chain, index), binding.key))
            return false;
    }
    if (ownerIndex === null)
        return true;
    return propertyDescriptorsMatch(reflectGetOwnPropertyDescriptorIntrinsic(propertyChainNode(chain, ownerIndex), binding.key), binding.sourceDescriptor);
}
function bindingTopologyMatches(chain: PropertyChainAuthority, binding: BitmapDrawStateBinding): boolean {
    if (!propertyChainMatches(chain))
        return false;
    const ownerIndex = binding.ownerIndex;
    const stop = ownerIndex ?? chain.nodes.length;
    for (let index = 0; index < stop; index += 1) {
        if (reflectGetOwnPropertyDescriptorIntrinsic(propertyChainNode(chain, index), binding.key))
            return false;
    }
    if (ownerIndex === null)
        return true;
    const expected = binding.sourceDescriptor;
    if (!expected)
        return false;
    const current = reflectGetOwnPropertyDescriptorIntrinsic(propertyChainNode(chain, ownerIndex), binding.key);
    return ownerIndex === 0 && descriptorHasDataValue(expected)
        ? propertyDescriptorStructuresMatch(current, expected)
        : propertyDescriptorsMatch(current, expected);
}
function underlyingDataSourceMatches(chain: PropertyChainAuthority, binding: BitmapDrawStateDataBinding): boolean {
    const ownerIndex = binding.ownerIndex;
    if (ownerIndex === 0)
        return true;
    const stop = ownerIndex ?? chain.nodes.length;
    for (let index = 1; index < stop; index += 1) {
        if (reflectGetOwnPropertyDescriptorIntrinsic(propertyChainNode(chain, index), binding.key))
            return false;
    }
    if (ownerIndex === null)
        return true;
    return propertyDescriptorsMatch(reflectGetOwnPropertyDescriptorIntrinsic(propertyChainNode(chain, ownerIndex), binding.key), binding.sourceDescriptor);
}
function readAccessorBindingValue(chain: PropertyChainAuthority, target: object, binding: BitmapDrawStateAccessorBinding): unknown {
    if (!bindingSourceMatches(chain, binding)) {
        throw new TypeError(`Bitmap draw-state accessor ${String(binding.key)} changed.`);
    }
    const value = reflectApplyIntrinsic(binding.getter, target, []);
    if (!bindingSourceMatches(chain, binding)) {
        throw new TypeError(`Bitmap draw-state accessor ${String(binding.key)} changed while being read.`);
    }
    return value;
}
function bindingAppliedMatches(transaction: BitmapDrawStateTransaction, binding: BitmapDrawStateBinding): boolean {
    const { chain, target } = transaction;
    if (!binding.changes) {
        if (!bindingSourceMatches(chain, binding))
            return false;
    }
    else if (binding.kind === 'data') {
        const expected = binding.expectedOwnDescriptor;
        if (!expected ||
            !propertyChainMatches(chain) ||
            !propertyDescriptorsMatch(reflectGetOwnPropertyDescriptorIntrinsic(target, binding.key), expected) ||
            !underlyingDataSourceMatches(chain, binding)) {
            return false;
        }
    }
    else if (!bindingSourceMatches(chain, binding)) {
        return false;
    }
    if (binding.kind === 'data') {
        const descriptor = reflectGetOwnPropertyDescriptorIntrinsic(target, binding.key);
        const value: unknown = descriptor && descriptorHasDataValue(descriptor)
            ? descriptorProperty(descriptor, 'value')
            : (reflectGetIntrinsic(target, binding.key) as unknown);
        return objectIsIntrinsic(value, binding.nextValue);
    }
    try {
        return objectIsIntrinsic(readAccessorBindingValue(chain, target, binding), binding.nextValue);
    }
    catch {
        return false;
    }
}
function captureBitmapDrawStateBinding(chain: PropertyChainAuthority, target: object, entry: BitmapDrawStateEntry): BitmapDrawStateBinding {
    const resolved = findResolvedDescriptor(chain, entry.key);
    if (!resolved) {
        if (!reflectIsExtensibleIntrinsic(target)) {
            throw new TypeError(`Bitmap draw state property ${String(entry.key)} cannot be created.`);
        }
        return {
            changes: true,
            expectedOwnDescriptor: {
                configurable: true,
                enumerable: true,
                value: entry.value,
                writable: true,
            },
            key: entry.key,
            kind: 'data',
            nextValue: entry.value,
            ownerIndex: null,
            sourceDescriptor: null,
        };
    }
    const sourceDescriptor = clonePropertyDescriptor(resolved.descriptor);
    if (descriptorHasDataValue(sourceDescriptor)) {
        const previousValue = descriptorProperty(sourceDescriptor, 'value');
        const changes = !objectIsIntrinsic(previousValue, entry.value);
        if (changes && sourceDescriptor.writable !== true) {
            throw new TypeError(`Bitmap draw state property ${String(entry.key)} is not writable.`);
        }
        if (changes && resolved.ownerIndex > 0 && !reflectIsExtensibleIntrinsic(target)) {
            throw new TypeError(`Bitmap draw state property ${String(entry.key)} cannot be shadowed.`);
        }
        return {
            changes,
            expectedOwnDescriptor: changes
                ? resolved.ownerIndex === 0
                    ? { ...sourceDescriptor, value: entry.value }
                    : {
                        configurable: true,
                        enumerable: true,
                        value: entry.value,
                        writable: true,
                    }
                : null,
            key: entry.key,
            kind: 'data',
            nextValue: entry.value,
            ownerIndex: resolved.ownerIndex,
            sourceDescriptor,
        };
    }
    const getter = descriptorProperty(sourceDescriptor, 'get');
    if (typeof getter !== 'function') {
        throw new TypeError(`Bitmap draw state property ${String(entry.key)} is not readable.`);
    }
    const setter = descriptorProperty(sourceDescriptor, 'set');
    const getterBinding: BitmapDrawStateAccessorBinding = {
        changes: false,
        getter: getter as UnknownFunction,
        key: entry.key,
        kind: 'accessor',
        nextValue: entry.value,
        ownerIndex: resolved.ownerIndex,
        previousValue: undefined,
        setter: typeof setter === 'function' ? (setter as UnknownFunction) : null,
        sourceDescriptor,
    };
    const previousValue = readAccessorBindingValue(chain, target, getterBinding);
    const changes = !objectIsIntrinsic(previousValue, entry.value);
    if (changes && getterBinding.setter === null) {
        throw new TypeError(`Bitmap draw state property ${String(entry.key)} is not writable.`);
    }
    return { ...getterBinding, changes, previousValue };
}
function prepareBitmapDrawStateTransaction(target: object, entries: readonly BitmapDrawStateEntry[]): BitmapDrawStateTransaction {
    const chain = capturePropertyChain(target);
    const bindings: BitmapDrawStateBinding[] = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry)
            throw new TypeError('Bitmap draw-state entry inventory is incomplete.');
        bindings[bindings.length] = captureBitmapDrawStateBinding(chain, target, entry);
    }
    const transaction = { bindings, chain, target };
    if (!propertyChainMatches(chain))
        throw new TypeError('Bitmap draw-state authority changed during preflight.');
    for (let index = 0; index < bindings.length; index += 1) {
        const binding = bindings[index];
        if (!binding || !bindingSourceMatches(chain, binding)) {
            throw new TypeError('Bitmap draw-state authority changed during preflight.');
        }
    }
    return transaction;
}
function applyBitmapDrawStateBinding(transaction: BitmapDrawStateTransaction, binding: BitmapDrawStateBinding): void {
    if (!bindingSourceMatches(transaction.chain, binding)) {
        throw new TypeError(`Bitmap draw state property ${String(binding.key)} changed before application.`);
    }
    if (!binding.changes)
        return;
    if (binding.kind === 'data') {
        const expected = binding.expectedOwnDescriptor;
        if (!expected || !reflectDefinePropertyIntrinsic(transaction.target, binding.key, expected)) {
            throw new TypeError(`Unable to apply bitmap draw state property ${String(binding.key)}.`);
        }
    }
    else {
        const setter = binding.setter;
        if (setter === null)
            throw new TypeError(`Bitmap draw state property ${String(binding.key)} is not writable.`);
        reflectApplyIntrinsic(setter, transaction.target, [binding.nextValue]);
    }
    if (!bindingAppliedMatches(transaction, binding)) {
        throw new TypeError(`Bitmap draw state property ${String(binding.key)} was not applied exactly.`);
    }
}
function rollbackBitmapDrawStateBinding(transaction: BitmapDrawStateTransaction, binding: BitmapDrawStateBinding): boolean {
    if (!binding.changes)
        return bindingAppliedMatches(transaction, binding);
    if (!bindingAppliedMatches(transaction, binding)) {
        if (!bindingSourceMatches(transaction.chain, binding))
            return false;
        if (binding.kind === 'data')
            return true;
        try {
            return objectIsIntrinsic(readAccessorBindingValue(transaction.chain, transaction.target, binding), binding.previousValue);
        }
        catch {
            return false;
        }
    }
    try {
        if (binding.kind === 'data') {
            const restored = binding.ownerIndex === 0 && binding.sourceDescriptor
                ? reflectDefinePropertyIntrinsic(transaction.target, binding.key, binding.sourceDescriptor)
                : reflectDeletePropertyIntrinsic(transaction.target, binding.key);
            return restored && bindingSourceMatches(transaction.chain, binding);
        }
        const setter = binding.setter;
        if (setter === null)
            return false;
        reflectApplyIntrinsic(setter, transaction.target, [binding.previousValue]);
        return (bindingSourceMatches(transaction.chain, binding) &&
            objectIsIntrinsic(readAccessorBindingValue(transaction.chain, transaction.target, binding), binding.previousValue));
    }
    catch {
        return false;
    }
}
function executeBitmapDrawStateTransaction(transaction: BitmapDrawStateTransaction): boolean {
    const applied: BitmapDrawStateBinding[] = [];
    try {
        for (let index = 0; index < transaction.bindings.length; index += 1) {
            const binding = transaction.bindings[index];
            if (!binding)
                throw new TypeError('Bitmap draw-state binding inventory is incomplete.');
            if (binding.changes)
                applied[applied.length] = binding;
            applyBitmapDrawStateBinding(transaction, binding);
        }
        for (let index = 0; index < transaction.bindings.length; index += 1) {
            const binding = transaction.bindings[index];
            if (!binding || !bindingAppliedMatches(transaction, binding)) {
                throw new TypeError('Bitmap draw state did not settle exactly.');
            }
        }
        return true;
    }
    catch {
        for (let index = applied.length - 1; index >= 0; index -= 1) {
            const binding = applied[index];
            if (binding)
                rollbackBitmapDrawStateBinding(transaction, binding);
        }
        return false;
    }
}
function rollbackBitmapDrawStateTransaction(transaction: BitmapDrawStateTransaction): boolean {
    let restored = true;
    for (let index = transaction.bindings.length - 1; index >= 0; index -= 1) {
        const binding = transaction.bindings[index];
        if (binding && !rollbackBitmapDrawStateBinding(transaction, binding))
            restored = false;
    }
    return restored;
}
function applyBitmapDrawStateWithReceipt(bitmap: object, state: unknown, applyState: UnknownFunction): BitmapDrawStateApplicationResult {
    let transaction: BitmapDrawStateTransaction;
    let stateSnapshot: object;
    try {
        const entries = captureBitmapDrawStateEntries(state);
        stateSnapshot = createBitmapDrawStateSnapshot(entries);
        transaction = prepareBitmapDrawStateTransaction(bitmap, entries);
    }
    catch {
        return { applied: false, failedRollback: null };
    }
    let accepted: boolean;
    try {
        accepted = reflectApplyIntrinsic(applyState, undefined, [bitmap, stateSnapshot]) === true;
    }
    catch {
        accepted = false;
    }
    if (accepted) {
        let attested = true;
        for (let index = 0; index < transaction.bindings.length; index += 1) {
            const binding = transaction.bindings[index];
            if (!binding || !bindingAppliedMatches(transaction, binding)) {
                attested = false;
                break;
            }
        }
        if (attested)
            return { applied: true, failedRollback: null };
    }
    return {
        applied: false,
        failedRollback: rollbackBitmapDrawStateTransaction(transaction) ? null : transaction,
    };
}
function captureBitmapDrawStateRestoration(bitmap: object, state: unknown): BitmapDrawStateRestoration | null {
    try {
        const entries = captureBitmapDrawStateEntries(state);
        const transaction = prepareBitmapDrawStateTransaction(bitmap, entries);
        for (let index = 0; index < transaction.bindings.length; index += 1) {
            const binding = transaction.bindings[index];
            if (!binding || binding.changes)
                return null;
        }
        return {
            state: createBitmapDrawStateSnapshot(entries),
            transaction,
        };
    }
    catch {
        return null;
    }
}
function bitmapDrawStateRestorationMatches(restoration: BitmapDrawStateRestoration, bitmap: object): boolean {
    if (restoration.transaction.target !== bitmap || !propertyChainMatches(restoration.transaction.chain))
        return false;
    for (let index = 0; index < restoration.transaction.bindings.length; index += 1) {
        const binding = restoration.transaction.bindings[index];
        if (!binding || !bindingTopologyMatches(restoration.transaction.chain, binding))
            return false;
    }
    return true;
}
function executeBitmapDrawStateRestoration(restoration: BitmapDrawStateRestoration, bitmap: object): boolean {
    try {
        if (!bitmapDrawStateRestorationMatches(restoration, bitmap))
            return false;
        const transaction = prepareBitmapDrawStateTransaction(bitmap, captureBitmapDrawStateEntries(restoration.state));
        if (!bitmapDrawStateRestorationMatches(restoration, bitmap))
            return false;
        return executeBitmapDrawStateTransaction(transaction) && bitmapDrawStateRestorationMatches(restoration, bitmap);
    }
    catch {
        return false;
    }
}
export function captureBitmapDrawState(bitmap: unknown): Record<string, unknown> | null {
    if (!bitmap)
        return null;
    const state = objectCreateIntrinsic(null) as Record<string, unknown>;
    let hasAny = false;
    for (let index = 0; index < DRAW_STATE_KEYS.length; index += 1) {
        const key = DRAW_STATE_KEYS[index];
        if (key === undefined)
            throw new TypeError('Bitmap draw-state key inventory is incomplete.');
        const value = propertyValue(bitmap, key);
        if (value !== undefined) {
            if (!reflectDefinePropertyIntrinsic(state, key, {
                configurable: true,
                enumerable: true,
                value,
                writable: true,
            })) {
                throw new TypeError(`Unable to capture bitmap draw state property ${key}.`);
            }
            hasAny = true;
        }
    }
    return hasAny ? state : null;
}
export function applyBitmapDrawState(bitmap: unknown, state: unknown): boolean {
    if (!isPropertySource(bitmap) || !isPropertySource(state))
        return false;
    try {
        const entries = captureBitmapDrawStateEntries(state);
        return executeBitmapDrawStateTransaction(prepareBitmapDrawStateTransaction(bitmap, entries));
    }
    catch {
        return false;
    }
}
export function normalizeTextScalePercent(raw: unknown): number;
export function normalizeTextScalePercent<Fallback>(raw: unknown, fallback: Fallback): number | Fallback;
export function normalizeTextScalePercent(raw: unknown, fallback: unknown = 100): unknown {
    if (raw === undefined || raw === null || raw === '')
        return fallback;
    const numeric = numberValue(raw);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100)
        return fallback;
    return numeric;
}
export function resolveTextScalePercent(settings: unknown, key: unknown): number;
export function resolveTextScalePercent<Fallback>(settings: unknown, key: unknown, fallback: Fallback): number | Fallback;
export function resolveTextScalePercent(settings: unknown, key: unknown, fallback: unknown = 100): unknown {
    if (typeof settings !== 'object' || settings === null || !key)
        return fallback;
    const display = propertyValue(settings, 'display');
    const resizeTexts = propertyValue(display, 'resizeTexts');
    if (typeof resizeTexts === 'object' && resizeTexts !== null && hasOwn(resizeTexts, key))
        return normalizeTextScalePercent(propertyValue(resizeTexts, key), fallback);
    return fallback;
}
function shouldScaleText(scalePercent: unknown): scalePercent is number {
    return Number.isInteger(scalePercent) && typeof scalePercent === 'number' && scalePercent > 0 && scalePercent < 100;
}
export function scaleFontSizeValue(value: unknown, scalePercent: unknown): unknown {
    if (!shouldScaleText(scalePercent))
        return value;
    const factor = scalePercent / 100;
    if (isPositiveFiniteNumber(value)) {
        return Math.max(1, Math.round(value * factor));
    }
    if (typeof value === 'string') {
        const match = /^(\s*)(\d+(?:\.\d+)?)(px|pt|em|rem)?(\s*)$/iu.exec(value);
        if (match) {
            const numericText = match[2];
            const numeric = numericText === undefined ? Number.NaN : numberValue(numericText);
            if (Number.isFinite(numeric) && numeric > 0) {
                const scaled = Math.max(1, Math.round(numeric * factor));
                return `${match[1] ?? ''}${stringValue(scaled)}${match[3] ?? ''}${match[4] ?? ''}`;
            }
        }
    }
    const numeric = numberValue(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return Math.max(1, Math.round(numeric * factor));
    }
    return value;
}
export function scaleBitmapDrawState(state: unknown, scalePercent: unknown): unknown {
    if (!state || !shouldScaleText(scalePercent))
        return state;
    const scaled: unknown = Reflect.apply(Object.assign, Object, [{}, state]);
    if (!isPropertySource(scaled)) {
        throw new TypeError('Scaled bitmap draw state is not property-readable.');
    }
    if (hasOwn(scaled, 'fontSize')) {
        setProperty(scaled, 'fontSize', scaleFontSizeValue(propertyValue(scaled, 'fontSize'), scalePercent));
    }
    return scaled;
}
function createWindowTextScaleRestorationReceipt(methodSlots: readonly WindowTextScaleMethodRestorationSlot[], bitmapSlots: readonly WindowTextScaleBitmapRestorationSlot[]): WindowTextScaleRestorationReceipt {
    let methodsDamaged = false;
    let bitmapsDamaged = false;
    for (const slot of methodSlots) {
        if (slot.status === 'failed')
            methodsDamaged = true;
    }
    for (const slot of bitmapSlots) {
        if (slot.status === 'failed')
            bitmapsDamaged = true;
    }
    return {
        kind: 'window-text-scale-restoration',
        schemaVersion: 1,
        status: methodsDamaged || bitmapsDamaged ? 'damaged' : 'restored',
        windowMethods: {
            status: methodsDamaged ? 'damaged' : 'restored',
            slots: methodSlots,
        },
        bitmapStates: {
            status: bitmapsDamaged ? 'damaged' : 'restored',
            slots: bitmapSlots,
        },
    };
}
function createCleanRejectedWindowTextScaleResult(phase: WindowTextScaleCreationPhase): WindowTextScaleCreationResult {
    return {
        status: 'rejected',
        phase,
        restoration: createWindowTextScaleRestorationReceipt([], []),
        repair: null,
    };
}
export function createWindowTextScaleScope(windowInstance: unknown, scalePercent: unknown, helpers: unknown = {}): WindowTextScaleCreationResult {
    if (!isPropertySource(windowInstance) || !shouldScaleText(scalePercent)) {
        return createCleanRejectedWindowTextScaleResult('capture');
    }
    const scaleWindow = windowInstance;
    let initialContents: unknown;
    let captureStateCandidate: unknown;
    let applyStateCandidate: unknown;
    try {
        initialContents = propertyValue(windowInstance, 'contents');
        captureStateCandidate = propertyValue(helpers, 'captureBitmapDrawState');
        applyStateCandidate = propertyValue(helpers, 'applyBitmapDrawState');
    }
    catch {
        return createCleanRejectedWindowTextScaleResult('capture');
    }
    if (!isPropertySource(initialContents))
        return createCleanRejectedWindowTextScaleResult('capture');
    const captureState = isCallable(captureStateCandidate) ? captureStateCandidate : captureBitmapDrawState;
    const applyState = isCallable(applyStateCandidate) ? applyStateCandidate : applyBitmapDrawState;
    const scaleFactor = scalePercent / 100;
    const wrappedMethods: WrappedWindowMethod[] = [];
    const originalStates = new WeakMapConstructor<object, TrackedBitmapDrawStateRestoration>();
    const bitmapRestorations: TrackedBitmapDrawStateRestoration[] = [];
    let trackedContents: unknown = null;
    let logicalFontSize: number | null = null;
    let leaseActive = true;
    let settledReceipt: WindowTextScaleRestorationReceipt | null = null;
    const rememberOriginalState = (contents: unknown): boolean => {
        if (!isPropertySource(contents))
            return false;
        const key = weakMapKey(contents);
        if (weakMapHas(originalStates, key))
            return true;
        try {
            const state = reflectApplyIntrinsic(captureState, undefined, [contents]);
            const restoration = captureBitmapDrawStateRestoration(contents, state);
            if (!restoration)
                return false;
            const tracked: TrackedBitmapDrawStateRestoration = {
                bitmap: contents,
                pendingRollbacks: [],
                restoration,
                restored: false,
            };
            weakMapSet(originalStates, key, tracked);
            bitmapRestorations[bitmapRestorations.length] = tracked;
            return true;
        }
        catch {
            return false;
        }
    };
    const syncTrackedContents = (contents: unknown): unknown => {
        if (!isPropertySource(contents)) {
            trackedContents = null;
            return null;
        }
        if (contents !== trackedContents) {
            if (!rememberOriginalState(contents))
                return null;
            trackedContents = contents;
            if (!isPositiveFiniteNumber(logicalFontSize)) {
                const initialFontSize = numberValue(propertyValue(contents, 'fontSize'));
                if (isPositiveFiniteNumber(initialFontSize))
                    logicalFontSize = initialFontSize;
            }
        }
        return contents;
    };
    const getTrackedContents = (): unknown => {
        const current = propertyValue(windowInstance, 'contents');
        if (!current)
            return syncTrackedContents(null);
        if (current !== trackedContents)
            return syncTrackedContents(current);
        return current;
    };
    const refreshLogicalFontSize = (contents: unknown = getTrackedContents()): boolean => {
        const activeContents = syncTrackedContents(contents);
        const current = activeContents ? numberValue(propertyValue(activeContents, 'fontSize')) : Number.NaN;
        if (isPositiveFiniteNumber(current)) {
            logicalFontSize = current;
            return true;
        }
        return false;
    };
    const applyStateExactly = (contents: unknown, state: unknown): boolean => {
        if (!isPropertySource(contents))
            return false;
        const application = applyBitmapDrawStateWithReceipt(contents, state, applyState);
        if (application.failedRollback) {
            const tracked = weakMapGet(originalStates, contents);
            if (tracked) {
                tracked.pendingRollbacks[tracked.pendingRollbacks.length] = {
                    transaction: application.failedRollback,
                    restored: false,
                };
            }
        }
        return application.applied;
    };
    const applyScaledFontSize = (contents: unknown = getTrackedContents()): boolean => {
        const activeContents = syncTrackedContents(contents);
        if (!activeContents || !isPositiveFiniteNumber(logicalFontSize))
            return false;
        return applyStateExactly(activeContents, {
            fontSize: Math.max(1, Math.round(logicalFontSize * scaleFactor)),
        });
    };
    const descriptorContainsInstalledMethod = (descriptor: PropertyDescriptor | undefined, wrapped: WrappedWindowMethod): boolean => !!descriptor &&
        descriptorHasDataValue(descriptor) &&
        objectIsIntrinsic(descriptorProperty(descriptor, 'value'), descriptorProperty(wrapped.installedDescriptor, 'value'));
    const restoreWrappedMethod = (wrapped: WrappedWindowMethod): WindowTextScaleMethodRestorationStatus => {
        if (wrapped.settledStatus !== null)
            return wrapped.settledStatus;
        let current: PropertyDescriptor | undefined;
        try {
            current = reflectGetOwnPropertyDescriptorIntrinsic(windowInstance, wrapped.name);
        }
        catch {
            return 'failed';
        }
        if (propertyDescriptorsMatch(current, wrapped.previousDescriptor)) {
            wrapped.settledStatus = 'restored';
            return wrapped.settledStatus;
        }
        if (!propertyDescriptorsMatch(current, wrapped.installedDescriptor)) {
            if (descriptorContainsInstalledMethod(current, wrapped))
                return 'failed';
            wrapped.settledStatus = 'released-to-successor';
            return wrapped.settledStatus;
        }
        try {
            if (wrapped.previousDescriptor) {
                reflectDefinePropertyIntrinsic(windowInstance, wrapped.name, wrapped.previousDescriptor);
            }
            else {
                reflectDeletePropertyIntrinsic(windowInstance, wrapped.name);
            }
        }
        catch {
        }
        try {
            current = reflectGetOwnPropertyDescriptorIntrinsic(windowInstance, wrapped.name);
        }
        catch {
            return 'failed';
        }
        if (propertyDescriptorsMatch(current, wrapped.previousDescriptor)) {
            wrapped.settledStatus = 'restored';
            return wrapped.settledStatus;
        }
        if (!descriptorContainsInstalledMethod(current, wrapped)) {
            wrapped.settledStatus = 'released-to-successor';
            return wrapped.settledStatus;
        }
        return 'failed';
    };
    function restoreScaleLease(): WindowTextScaleRestorationReceipt {
        if (settledReceipt)
            return settledReceipt;
        leaseActive = false;
        const methodSlots: WindowTextScaleMethodRestorationSlot[] = [];
        for (let index = wrappedMethods.length - 1; index >= 0; index -= 1) {
            const wrapped = wrappedMethods[index];
            methodSlots[index] = wrapped
                ? { name: wrapped.name, status: restoreWrappedMethod(wrapped) }
                : { name: '<missing>', status: 'failed' };
        }
        const bitmapSlots: WindowTextScaleBitmapRestorationSlot[] = [];
        for (let index = bitmapRestorations.length - 1; index >= 0; index -= 1) {
            const tracked = bitmapRestorations[index];
            if (!tracked) {
                bitmapSlots[index] = { bitmap: scaleWindow, status: 'failed' };
                continue;
            }
            for (let rollbackIndex = tracked.pendingRollbacks.length - 1; rollbackIndex >= 0; rollbackIndex -= 1) {
                const rollback = tracked.pendingRollbacks[rollbackIndex];
                if (rollback && !rollback.restored) {
                    rollback.restored = rollbackBitmapDrawStateTransaction(rollback.transaction);
                }
            }
            if (!tracked.restored) {
                tracked.restored = executeBitmapDrawStateRestoration(tracked.restoration, tracked.bitmap);
            }
            for (let rollbackIndex = tracked.pendingRollbacks.length - 1; rollbackIndex >= 0; rollbackIndex -= 1) {
                const rollback = tracked.pendingRollbacks[rollbackIndex];
                if (rollback && !rollback.restored) {
                    rollback.restored = rollbackBitmapDrawStateTransaction(rollback.transaction);
                }
            }
            let rollbacksRestored = true;
            for (const rollback of tracked.pendingRollbacks) {
                if (!rollback.restored)
                    rollbacksRestored = false;
            }
            bitmapSlots[index] = {
                bitmap: tracked.bitmap,
                status: tracked.restored && rollbacksRestored ? 'restored' : 'failed',
            };
        }
        const receipt = createWindowTextScaleRestorationReceipt(methodSlots, bitmapSlots);
        if (receipt.status === 'restored')
            settledReceipt = receipt;
        return receipt;
    }
    const scope: WindowTextScaleScope = { restore: restoreScaleLease };
    const rejectCreation = (phase: WindowTextScaleCreationPhase): WindowTextScaleCreationResult => {
        const restoration = restoreScaleLease();
        return {
            status: 'rejected',
            phase,
            restoration,
            repair: restoration.status === 'damaged' ? scope : null,
        };
    };
    const wrapMethod = (name: string, factory: (original: UnknownFunction) => UnknownFunction): boolean => {
        let chain: PropertyChainAuthority;
        let resolved: {
            readonly descriptor: PropertyDescriptor;
            readonly ownerIndex: number;
        } | null;
        try {
            chain = capturePropertyChain(windowInstance);
            resolved = findResolvedDescriptor(chain, name);
        }
        catch {
            return false;
        }
        if (!resolved || !descriptorHasDataValue(resolved.descriptor))
            return true;
        const resolvedValue = descriptorProperty(resolved.descriptor, 'value');
        if (!isCallable(resolvedValue))
            return true;
        if (resolved.descriptor.writable !== true)
            return false;
        if (resolved.ownerIndex > 0 && !reflectIsExtensibleIntrinsic(windowInstance))
            return false;
        let installed: UnknownFunction;
        let previousDescriptor: PropertyDescriptor | undefined;
        try {
            installed = factory(resolvedValue);
            previousDescriptor = reflectGetOwnPropertyDescriptorIntrinsic(windowInstance, name);
        }
        catch {
            return false;
        }
        const installedDescriptor: PropertyDescriptor = resolved.ownerIndex === 0
            ? { ...clonePropertyDescriptor(resolved.descriptor), value: installed }
            : {
                configurable: true,
                enumerable: true,
                value: installed,
                writable: true,
            };
        wrappedMethods[wrappedMethods.length] = {
            installedDescriptor: clonePropertyDescriptor(installedDescriptor),
            name,
            previousDescriptor: previousDescriptor ? clonePropertyDescriptor(previousDescriptor) : undefined,
            settledStatus: null,
        };
        try {
            return (propertyChainMatches(chain) &&
                propertyDescriptorsMatch(reflectGetOwnPropertyDescriptorIntrinsic(propertyChainNode(chain, resolved.ownerIndex), name), resolved.descriptor) &&
                reflectDefinePropertyIntrinsic(windowInstance, name, installedDescriptor) &&
                propertyDescriptorsMatch(reflectGetOwnPropertyDescriptorIntrinsic(windowInstance, name), installedDescriptor));
        }
        catch {
            return false;
        }
    };
    const invokeWithLogicalFontSize = (original: UnknownFunction, context: unknown, args: unknown[]): unknown => {
        const contents = syncTrackedContents(truthyPropertyOr(context, 'contents', getTrackedContents));
        if (contents && isPositiveFiniteNumber(logicalFontSize)) {
            if (!applyStateExactly(contents, { fontSize: logicalFontSize })) {
                throw new TypeError('Unable to publish logical Window font size exactly.');
            }
        }
        const result = reflectApplyIntrinsic(original, context, args);
        const currentContents = truthyPropertyOr(context, 'contents', getTrackedContents);
        if (!refreshLogicalFontSize(currentContents) || !applyScaledFontSize(currentContents)) {
            throw new TypeError('Unable to republish scaled Window font size exactly.');
        }
        return result;
    };
    const resetFactory = (original: UnknownFunction): UnknownFunction => function (this: unknown, ...args: unknown[]): unknown {
        if (!leaseActive)
            return reflectApplyIntrinsic(original, this, args);
        const result = reflectApplyIntrinsic(original, this, args);
        const contents = truthyPropertyOr(this, 'contents', getTrackedContents);
        if (!refreshLogicalFontSize(contents) || !applyScaledFontSize(contents)) {
            throw new TypeError('Unable to restore scaled Window font settings exactly.');
        }
        return result;
    };
    const sizeFactory = (original: UnknownFunction): UnknownFunction => function (this: unknown, ...args: unknown[]): unknown {
        if (!leaseActive)
            return reflectApplyIntrinsic(original, this, args);
        return invokeWithLogicalFontSize(original, this, args);
    };
    let phase: WindowTextScaleCreationPhase = 'capture';
    try {
        if (!syncTrackedContents(initialContents) || !isPositiveFiniteNumber(logicalFontSize)) {
            return rejectCreation(phase);
        }
        phase = 'method-install';
        if (!wrapMethod('resetFontSettings', resetFactory) ||
            !wrapMethod('createContents', resetFactory) ||
            !wrapMethod('makeFontBigger', sizeFactory) ||
            !wrapMethod('makeFontSmaller', sizeFactory)) {
            return rejectCreation(phase);
        }
        phase = 'initial-scale';
        if (!applyScaledFontSize(initialContents))
            return rejectCreation(phase);
    }
    catch {
        return rejectCreation(phase);
    }
    return { status: 'active', scope };
}
