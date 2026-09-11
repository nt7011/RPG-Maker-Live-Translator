export interface AdmittedForesightArray {
    readonly values: readonly unknown[];
    readonly length: number;
}
export interface AdmittedForesightRecord {
    readonly receiver: object;
    readonly descriptors: Readonly<Record<PropertyKey, PropertyDescriptor>>;
}
export interface ForesightDataSnapshotOptions {
    readonly seen?: WeakMap<object, unknown>;
    readonly retainObject?: (value: object) => boolean;
    readonly onArraySnapshot?: (source: unknown[], snapshot: unknown[]) => void;
    readonly recoverReadError?: (error: unknown) => unknown;
}
function stringValue(value: unknown): string {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean')
        return `${value}`;
    return '';
}
function numericPrimitive(value: unknown): number {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint') {
        return Number(value);
    }
    return Number.NaN;
}
function descriptorMatches(left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean {
    if (!left || !right)
        return left === right;
    if (left.configurable !== right.configurable ||
        left.enumerable !== right.enumerable ||
        'value' in left !== 'value' in right) {
        return false;
    }
    return 'value' in left
        ? Object.is(left.value, right.value) && left.writable === right.writable
        : left.get === right.get && left.set === right.set;
}
export function captureStableForesightDescriptors(value: object): Readonly<Record<PropertyKey, PropertyDescriptor>> | null {
    const first = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const second = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const firstKeys = Reflect.ownKeys(first);
    const secondKeys = Reflect.ownKeys(second);
    if (firstKeys.length !== secondKeys.length ||
        firstKeys.some((key, index) => key !== secondKeys[index] || !descriptorMatches(first[key], second[key]))) {
        return null;
    }
    return first;
}
export function readForesightDescriptorValue(_receiver: object, descriptor: PropertyDescriptor | undefined): unknown {
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
export function snapshotForesightDataValue(value: unknown, options: ForesightDataSnapshotOptions = {}): unknown {
    const seen = options.seen ?? new WeakMap<object, unknown>();
    const retainObject = options.retainObject;
    const onArraySnapshot = options.onArraySnapshot;
    const recoverReadError = options.recoverReadError;
    function snapshotDescriptor(receiver: object, descriptor: PropertyDescriptor): unknown {
        if (!recoverReadError)
            return snapshot(readForesightDescriptorValue(receiver, descriptor));
        try {
            return snapshot(readForesightDescriptorValue(receiver, descriptor));
        }
        catch (error) {
            return recoverReadError(error);
        }
    }
    function snapshot(candidate: unknown): unknown {
        if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function'))
            return candidate;
        if (typeof candidate === 'function')
            return undefined;
        const source = candidate;
        if (retainObject?.(source))
            return source;
        const existing = seen.get(source);
        if (existing !== undefined)
            return existing;
        const descriptors = captureStableForesightDescriptors(source);
        if (!descriptors)
            throw new TypeError('[Foresight] Mutable descriptor generation cannot be admitted.');
        if (Array.isArray(source)) {
            const lengthDescriptor = descriptors['length'];
            if (!lengthDescriptor || !('value' in lengthDescriptor)) {
                throw new TypeError('[Foresight] Array length is unavailable.');
            }
            const length = Number(lengthDescriptor.value);
            if (!Number.isSafeInteger(length) || length < 0) {
                throw new TypeError('[Foresight] Array length is invalid.');
            }
            const target: unknown[] = new Array(length);
            seen.set(source, target);
            onArraySnapshot?.(source, target);
            for (let index = 0; index < length; index += 1) {
                const descriptor = descriptors[String(index)];
                if (descriptor)
                    target[index] = snapshotDescriptor(source, descriptor);
            }
            return Object.freeze(target);
        }
        const target = {} as Record<PropertyKey, unknown>;
        seen.set(source, target);
        for (const key of Reflect.ownKeys(descriptors)) {
            const descriptor = descriptors[key];
            if (!descriptor)
                continue;
            Object.defineProperty(target, key, {
                value: snapshotDescriptor(source, descriptor),
                writable: false,
                enumerable: descriptor.enumerable ?? false,
                configurable: false,
            });
        }
        return Object.freeze(target);
    }
    return snapshot(value);
}
export function admitForesightRecord(value: unknown): AdmittedForesightRecord | null {
    if (!value || typeof value !== 'object')
        return null;
    const receiver = value;
    const descriptors = captureStableForesightDescriptors(receiver);
    return descriptors ? Object.freeze({ receiver, descriptors }) : null;
}
export function admitForesightDenseArray(value: unknown): AdmittedForesightArray | null {
    if (!Array.isArray(value))
        return null;
    const descriptors = captureStableForesightDescriptors(value);
    if (!descriptors)
        return null;
    const lengthDescriptor = descriptors['length'];
    if (!lengthDescriptor || !('value' in lengthDescriptor))
        return null;
    const length = Number(lengthDescriptor.value);
    if (!Number.isSafeInteger(length) || length < 0)
        return null;
    const slotDescriptors: PropertyDescriptor[] = [];
    for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor))
            return null;
        slotDescriptors.push(descriptor);
    }
    const values = slotDescriptors.map((descriptor) => readForesightDescriptorValue(value, descriptor));
    return Object.freeze({ values: Object.freeze(values), length });
}
export function snapshotForesightCommandScalar(value: unknown): unknown {
    return value && (typeof value === 'object' || typeof value === 'function') ? undefined : value;
}
export function reasonFromLabel(label: unknown): string {
    let source: unknown = '';
    if (label)
        source = label;
    return stringValue(source)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
}
export function positiveInteger(value: unknown, defaultValue: number): number {
    const numeric = numericPrimitive(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : defaultValue;
}
export function finiteNumber(value: unknown): number | null {
    const numeric = numericPrimitive(value);
    return Number.isFinite(numeric) ? numeric : null;
}
export function integerIndex(value: unknown): number | null {
    const numeric = numericPrimitive(value);
    return Number.isInteger(numeric) ? numeric : null;
}
export function nullableFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '')
        return null;
    return finiteNumber(value);
}
export function nonEmptyString(value: unknown): string {
    const string = typeof value === 'string' ? value.trim() : '';
    return string || '';
}
