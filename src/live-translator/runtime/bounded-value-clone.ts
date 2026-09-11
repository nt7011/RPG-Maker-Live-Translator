export interface BoundedValueCloneLimits {
    readonly arrayEntries: number;
    readonly depth: number;
    readonly nestedObjectKeys: number;
    readonly rootObjectKeys: number;
    readonly totalEntries: number;
}
const defineCloneProperty = Object.defineProperty;
const describeCloneProperty = Object.getOwnPropertyDescriptor;
const listCloneKeys = Reflect.ownKeys;
const applyCloneFunction = Reflect.apply;
const getCloneValue = Reflect.get;
const stringifyCloneValue = String;
const isCloneArray = Array.isArray;
function defineCloneDataProperty(target: object, key: PropertyKey, value: unknown): void {
    applyCloneFunction(defineCloneProperty, Object, [
        target,
        key,
        {
            configurable: true,
            enumerable: true,
            value,
            writable: true,
        },
    ]);
}
interface CloneBudget {
    remainingEntries: number;
}
function listOwnKeys(value: object): PropertyKey[] {
    return applyCloneFunction(listCloneKeys, Reflect, [value]);
}
function stringifyValue(value: unknown): string {
    return applyCloneFunction(stringifyCloneValue, undefined, [value]);
}
export function cloneBoundedValue(value: unknown, limits: BoundedValueCloneLimits): unknown {
    return cloneValueAtDepth(value, limits.depth, limits.depth, limits, {
        remainingEntries: limits.totalEntries,
    });
}
function cloneValueAtDepth(value: unknown, depth: number, rootDepth: number, limits: BoundedValueCloneLimits, budget: CloneBudget): unknown {
    if (value === undefined)
        return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (depth <= 0)
        return stringifyValue(value);
    if (isCloneArray(value)) {
        const source = value as unknown[];
        const length = Math.min(source.length, limits.arrayEntries);
        const output: unknown[] = [];
        let projectedLength = 0;
        for (let index = 0; index < length; index += 1) {
            projectedLength = index + 1;
            if (!(index in source))
                continue;
            if (budget.remainingEntries <= 0) {
                projectedLength = index;
                break;
            }
            budget.remainingEntries -= 1;
            defineCloneDataProperty(output, index, cloneValueAtDepth(source[index], depth - 1, rootDepth, limits, budget));
        }
        defineCloneProperty(output, 'length', {
            configurable: false,
            enumerable: false,
            value: projectedLength,
            writable: true,
        });
        return output;
    }
    if (typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        const keyLimit = depth === rootDepth ? limits.rootObjectKeys : limits.nestedObjectKeys;
        let admittedKeys = 0;
        for (const key of listOwnKeys(source)) {
            const descriptor = applyCloneFunction(describeCloneProperty, Object, [source, key]);
            if (descriptor?.enumerable !== true)
                continue;
            if (admittedKeys >= keyLimit || budget.remainingEntries <= 0)
                break;
            admittedKeys += 1;
            budget.remainingEntries -= 1;
            const sourceValue = applyCloneFunction(getCloneValue, Reflect, [source, key]) as unknown;
            const cloned = cloneValueAtDepth(sourceValue, depth - 1, rootDepth, limits, budget);
            if (cloned !== undefined)
                defineCloneDataProperty(output, key, cloned);
        }
        return output;
    }
    return stringifyValue(value);
}
