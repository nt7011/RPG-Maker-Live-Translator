const MAX_ARRAY_LENGTH = 4294967295;
const MAX_ARRAY_INDEX = MAX_ARRAY_LENGTH - 1;
type IntrinsicCallback = (...args: unknown[]) => unknown;
const intrinsicApply = Reflect.apply;
const intrinsicGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const intrinsicOwnKeys = Reflect.ownKeys;
const intrinsicFreeze = Object.freeze as IntrinsicCallback;
const intrinsicIsFrozen = Object.isFrozen as IntrinsicCallback;
const intrinsicHasOwn = Object.hasOwn as IntrinsicCallback;
const intrinsicDefineProperty = Object.defineProperty as IntrinsicCallback;
const intrinsicNumberIsInteger = Number.isInteger as IntrinsicCallback;
const intrinsicArrayIsArray = Array.isArray as IntrinsicCallback;
const intrinsicArraySort = Array.prototype.sort as IntrinsicCallback;
const IntrinsicArray = Array;
const IntrinsicString = String;
const IntrinsicTypeError = TypeError;
function applyIntrinsic(callback: IntrinsicCallback, receiver: unknown, args: readonly unknown[]): unknown {
    return intrinsicApply(callback, receiver, args);
}
function hasOwnValue(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & {
    value: unknown;
} {
    return !!descriptor && applyIntrinsic(intrinsicHasOwn, Object, [descriptor, 'value']) === true;
}
function exactArrayLength(values: readonly unknown[]): number {
    const descriptor = intrinsicGetOwnPropertyDescriptor(values, 'length');
    if (!hasOwnValue(descriptor) || typeof descriptor.value !== 'number') {
        throw new IntrinsicTypeError('Own-array snapshot lost its exact length.');
    }
    return descriptor.value;
}
function appendOwnData<Value>(values: Value[], value: Value): void {
    const index = exactArrayLength(values);
    const indexKey = applyIntrinsic(IntrinsicString, undefined, [index]) as string;
    const defined = applyIntrinsic(intrinsicDefineProperty, Object, [
        values,
        indexKey,
        {
            value,
            configurable: true,
            enumerable: true,
            writable: true,
        },
    ]);
    const descriptor = intrinsicGetOwnPropertyDescriptor(values, indexKey);
    if (defined !== values ||
        !hasOwnValue(descriptor) ||
        descriptor.value !== value ||
        descriptor.configurable !== true ||
        descriptor.enumerable !== true ||
        descriptor.writable !== true ||
        exactArrayLength(values) !== index + 1) {
        throw new IntrinsicTypeError('Own-array snapshot slot publication was intercepted.');
    }
}
export interface OwnArraySnapshot<T = unknown> {
    readonly sourceLength: number;
    readonly items: readonly T[];
    readonly complete: boolean;
    readonly dataOnly: boolean;
}
function ownArrayLength(value: unknown[]): number | null {
    try {
        const descriptor = intrinsicGetOwnPropertyDescriptor(value, 'length');
        if (!hasOwnValue(descriptor))
            return null;
        const length: unknown = descriptor.value;
        if (typeof length !== 'number' ||
            applyIntrinsic(intrinsicNumberIsInteger, Number, [length]) !== true ||
            length < 0 ||
            length > MAX_ARRAY_LENGTH) {
            return null;
        }
        return length;
    }
    catch {
        return null;
    }
}
function ownIndexedValue(value: unknown[], index: number): {
    captured: true;
    value: unknown;
} | null {
    try {
        const indexKey = applyIntrinsic(IntrinsicString, undefined, [index]) as string;
        const descriptor = intrinsicGetOwnPropertyDescriptor(value, indexKey);
        return hasOwnValue(descriptor) ? { captured: true, value: descriptor.value } : null;
    }
    catch {
        return null;
    }
}
function canonicalArrayIndex(key: PropertyKey): number | null {
    if (typeof key !== 'string' || key.length === 0)
        return null;
    const index = +key;
    if (applyIntrinsic(intrinsicNumberIsInteger, Number, [index]) !== true ||
        index < 0 ||
        index > MAX_ARRAY_INDEX ||
        applyIntrinsic(IntrinsicString, undefined, [index]) !== key) {
        return null;
    }
    return index;
}
function freezeSnapshot<T>(sourceLength: number, items: T[], complete: boolean, dataOnly: boolean): OwnArraySnapshot<T> {
    const frozenItems = applyIntrinsic(intrinsicFreeze, Object, [items]) as readonly T[];
    const snapshot = {
        sourceLength,
        items: frozenItems,
        complete,
        dataOnly,
    };
    applyIntrinsic(intrinsicFreeze, Object, [snapshot]);
    if (applyIntrinsic(intrinsicIsFrozen, Object, [items]) !== true ||
        applyIntrinsic(intrinsicIsFrozen, Object, [snapshot]) !== true) {
        return { sourceLength, items: [], complete: false, dataOnly: false };
    }
    return snapshot;
}
function captureOwnDataArray<T>(value: unknown): OwnArraySnapshot<T> | null {
    try {
        if (applyIntrinsic(intrinsicArrayIsArray, Array, [value]) !== true)
            return null;
    }
    catch {
        return null;
    }
    const source = value as unknown[];
    const length = ownArrayLength(source);
    if (length === null)
        return null;
    let keys: readonly PropertyKey[];
    try {
        keys = intrinsicOwnKeys(source);
    }
    catch {
        return freezeSnapshot(length, [], false, false);
    }
    const indices = new IntrinsicArray<number>();
    let invalidIndex = false;
    let keyIndex = 0;
    while (keyIndex < keys.length) {
        const key = keys[keyIndex];
        keyIndex += 1;
        if (key === undefined) {
            invalidIndex = true;
            continue;
        }
        const index = canonicalArrayIndex(key);
        if (index === null)
            continue;
        if (index >= length) {
            invalidIndex = true;
            continue;
        }
        appendOwnData(indices, index);
    }
    applyIntrinsic(intrinsicArraySort, indices, [(left: number, right: number) => left - right]);
    const items = new IntrinsicArray<T>();
    let complete = !invalidIndex && indices.length === length;
    let position = 0;
    while (position < indices.length) {
        const index = indices[position];
        position += 1;
        if (index === undefined) {
            complete = false;
            continue;
        }
        const captured = ownIndexedValue(source, index);
        if (!captured) {
            complete = false;
            continue;
        }
        appendOwnData(items, captured.value as T);
    }
    if (items.length !== length)
        complete = false;
    return freezeSnapshot(length, items, complete, complete);
}
export function snapshotOwnDataArray<T = unknown>(value: unknown): OwnArraySnapshot<T> | null {
    return captureOwnDataArray<T>(value);
}
