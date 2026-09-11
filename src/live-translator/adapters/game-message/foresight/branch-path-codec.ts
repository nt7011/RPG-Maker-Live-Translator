export type ForesightBranchPathValue = null | undefined | boolean | number | bigint | string;
type CanonicalBranchPathAtom = {
    readonly kind: 'hole';
} | {
    readonly kind: 'undefined';
} | {
    readonly kind: 'null';
} | {
    readonly kind: 'boolean';
    readonly value: boolean;
} | {
    readonly kind: 'number';
    readonly value: number;
} | {
    readonly kind: 'bigint';
    readonly value: bigint;
} | {
    readonly kind: 'string';
    readonly value: string;
};
export type CanonicalBranchPath = readonly CanonicalBranchPathAtom[];
export interface ForesightBranchPathCodec {
    readonly snapshot: (branchPath: unknown) => CanonicalBranchPath;
    readonly copy: (branchPath: unknown) => ForesightBranchPathValue[];
    readonly append: (branchPath: unknown, value: unknown) => ForesightBranchPathValue[];
    readonly normalizeIndex: (value: unknown) => number;
    readonly equals: (left: unknown, right: unknown) => boolean;
    readonly compare: (left: unknown, right: unknown) => number;
    readonly serialize: (branchPath: unknown) => string;
}
const BRANCH_PATH_TYPE_ORDER = Object.freeze({
    hole: 0,
    undefined: 1,
    null: 2,
    boolean: 3,
    number: 4,
    bigint: 5,
    string: 6,
});
function readDescriptorValue(receiver: object, descriptor: PropertyDescriptor): unknown {
    if ('value' in descriptor)
        return descriptor.value;
    const getter = descriptor.get as ((this: object) => unknown) | undefined;
    return getter ? Reflect.apply(getter, receiver, []) : undefined;
}
function captureAtom(value: unknown): CanonicalBranchPathAtom {
    if (value === undefined)
        return Object.freeze({ kind: 'undefined' });
    if (value === null)
        return Object.freeze({ kind: 'null' });
    if (typeof value === 'boolean')
        return Object.freeze({ kind: 'boolean', value });
    if (typeof value === 'number')
        return Object.freeze({ kind: 'number', value });
    if (typeof value === 'bigint')
        return Object.freeze({ kind: 'bigint', value });
    if (typeof value === 'string')
        return Object.freeze({ kind: 'string', value });
    throw new TypeError(`[Foresight] Unsupported branch-path value type: ${typeof value}`);
}
function copyAtom(atom: CanonicalBranchPathAtom): ForesightBranchPathValue {
    switch (atom.kind) {
        case 'hole':
        case 'undefined':
            return undefined;
        case 'null':
            return null;
        case 'boolean':
        case 'number':
        case 'bigint':
        case 'string':
            return atom.value;
    }
}
function comparePrimitive<T extends bigint | string>(left: T, right: T): number {
    return left === right ? 0 : left < right ? -1 : 1;
}
function compareNumbers(left: number, right: number): number {
    if (Object.is(left, right))
        return 0;
    if (Number.isNaN(left))
        return 1;
    if (Number.isNaN(right))
        return -1;
    if (Object.is(left, -0) && right === 0)
        return -1;
    if (left === 0 && Object.is(right, -0))
        return 1;
    return left < right ? -1 : 1;
}
function compareAtoms(left: CanonicalBranchPathAtom, right: CanonicalBranchPathAtom): number {
    const typeDifference = BRANCH_PATH_TYPE_ORDER[left.kind] - BRANCH_PATH_TYPE_ORDER[right.kind];
    if (typeDifference !== 0)
        return typeDifference < 0 ? -1 : 1;
    if (left.kind !== right.kind) {
        throw new TypeError('[Foresight] Branch-path atom ranks are inconsistent.');
    }
    switch (left.kind) {
        case 'hole':
        case 'undefined':
        case 'null':
            return 0;
        case 'boolean':
            return left.value === (right as typeof left).value ? 0 : left.value ? 1 : -1;
        case 'number':
            return compareNumbers(left.value, (right as typeof left).value);
        case 'bigint':
        case 'string':
            return comparePrimitive(left.value, (right as typeof left).value);
    }
}
function serializeNumber(value: number): string {
    if (Number.isNaN(value))
        return 'nan';
    if (value === Number.POSITIVE_INFINITY)
        return '+inf';
    if (value === Number.NEGATIVE_INFINITY)
        return '-inf';
    if (Object.is(value, -0))
        return '-0';
    return String(value);
}
function serializeAtom(atom: CanonicalBranchPathAtom): string {
    switch (atom.kind) {
        case 'hole':
            return 'h;';
        case 'undefined':
            return 'u;';
        case 'null':
            return 'z;';
        case 'boolean':
            return atom.value ? 'b1;' : 'b0;';
        case 'number': {
            const value = serializeNumber(atom.value);
            return `n${String(value.length)}:${value};`;
        }
        case 'bigint': {
            const value = String(atom.value);
            return `i${String(value.length)}:${value};`;
        }
        case 'string':
            return `s${String(atom.value.length)}:${atom.value};`;
    }
}
export function createForesightBranchPathCodec(maxLength: number): ForesightBranchPathCodec {
    if (!Number.isSafeInteger(maxLength) || maxLength < 0) {
        throw new TypeError('[Foresight] Branch-path length budget must be a non-negative safe integer.');
    }
    function snapshot(branchPath: unknown): CanonicalBranchPath {
        if (!Array.isArray(branchPath))
            return Object.freeze([]);
        const descriptors = Object.getOwnPropertyDescriptors(branchPath) as unknown as Record<PropertyKey, PropertyDescriptor>;
        const lengthDescriptor = descriptors['length'];
        if (!lengthDescriptor || !('value' in lengthDescriptor)) {
            throw new TypeError('[Foresight] Branch-path length is unavailable.');
        }
        const length = Number(lengthDescriptor.value);
        if (!Number.isSafeInteger(length) || length < 0 || length > maxLength) {
            throw new RangeError(`[Foresight] Branch path exceeds its ${String(maxLength)}-value budget.`);
        }
        const atoms: CanonicalBranchPathAtom[] = [];
        for (let index = 0; index < length; index += 1) {
            const descriptor = descriptors[String(index)];
            atoms.push(descriptor ? captureAtom(readDescriptorValue(branchPath, descriptor)) : Object.freeze({ kind: 'hole' }));
        }
        return Object.freeze(atoms);
    }
    function copy(branchPath: unknown): ForesightBranchPathValue[] {
        const captured = snapshot(branchPath);
        const result = new Array<ForesightBranchPathValue>(captured.length);
        for (let index = 0; index < captured.length; index += 1) {
            const atom = captured[index];
            if (atom && atom.kind !== 'hole')
                result[index] = copyAtom(atom);
        }
        return result;
    }
    function append(branchPath: unknown, value: unknown): ForesightBranchPathValue[] {
        const result = copy(branchPath);
        if (result.length >= maxLength) {
            throw new RangeError(`[Foresight] Branch path exceeds its ${String(maxLength)}-value budget.`);
        }
        result.push(copyAtom(captureAtom(value)));
        return result;
    }
    function normalizeIndex(value: unknown): number {
        const numeric = Number(value);
        const integer = Number.isFinite(numeric) ? Math.floor(numeric) : 0;
        return Number.isSafeInteger(integer) && integer > 0 ? integer : 0;
    }
    function compare(left: unknown, right: unknown): number {
        const a = snapshot(left);
        const b = left === right ? a : snapshot(right);
        const sharedLength = Math.min(a.length, b.length);
        for (let index = 0; index < sharedLength; index += 1) {
            const leftAtom = a[index];
            const rightAtom = b[index];
            if (!leftAtom || !rightAtom) {
                throw new TypeError('[Foresight] Branch-path snapshot is incomplete.');
            }
            const difference = compareAtoms(leftAtom, rightAtom);
            if (difference !== 0)
                return difference;
        }
        return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
    }
    function equals(left: unknown, right: unknown): boolean {
        return compare(left, right) === 0;
    }
    function serialize(branchPath: unknown): string {
        const captured = snapshot(branchPath);
        return `p${String(captured.length)}|${captured.map(serializeAtom).join('')}`;
    }
    return Object.freeze({ snapshot, copy, append, normalizeIndex, equals, compare, serialize });
}
