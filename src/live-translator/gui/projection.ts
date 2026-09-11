export interface GuiProjectionLimits {
    readonly maxArrayEntries: number;
    readonly maxDepth: number;
    readonly maxDescriptorReads: number;
    readonly maxKeyCodeUnits: number;
    readonly maxNodes: number;
    readonly maxObjectKeys: number;
    readonly maxSerializedBytes: number;
    readonly maxStringCodeUnits: number;
    readonly maxTotalStringCodeUnits: number;
}
export interface GuiProjectionPolicy {
    readonly enabled: boolean;
    readonly overrides: Readonly<Partial<GuiProjectionLimits>>;
}
export type GuiProjectedValue = null | undefined | string | number | boolean | readonly GuiProjectedValue[] | GuiProjectedRecord;
export interface GuiProjectedRecord {
    readonly [key: string]: GuiProjectedValue;
}
export interface GuiProjectionOutcome {
    readonly complete: boolean;
    readonly nodes: number;
    readonly value: unknown;
}
export interface GuiSerializationOutcome {
    readonly complete: boolean;
    readonly text: string;
}
export const GUI_PROJECTION_MARKER_PROPERTY = '$rmltProjection';
export const GUI_PROJECTION_LIMITS: GuiProjectionLimits = Object.freeze({
    maxArrayEntries: 256,
    maxDepth: 12,
    maxDescriptorReads: 4096,
    maxKeyCodeUnits: 256,
    maxNodes: 2048,
    maxObjectKeys: 128,
    maxSerializedBytes: 128 * 1024,
    maxStringCodeUnits: 16 * 1024,
    maxTotalStringCodeUnits: 128 * 1024,
});
const unboundedProjectionLimit = Number.MAX_SAFE_INTEGER;
export const GUI_UNBOUNDED_PROJECTION_LIMITS: GuiProjectionLimits = Object.freeze({
    maxArrayEntries: unboundedProjectionLimit,
    maxDepth: unboundedProjectionLimit,
    maxDescriptorReads: unboundedProjectionLimit,
    maxKeyCodeUnits: unboundedProjectionLimit,
    maxNodes: unboundedProjectionLimit,
    maxObjectKeys: unboundedProjectionLimit,
    maxSerializedBytes: unboundedProjectionLimit,
    maxStringCodeUnits: unboundedProjectionLimit,
    maxTotalStringCodeUnits: unboundedProjectionLimit,
});
const GUI_PROJECTION_LIMIT_NAMES = Object.freeze([
    'maxArrayEntries',
    'maxDepth',
    'maxDescriptorReads',
    'maxKeyCodeUnits',
    'maxNodes',
    'maxObjectKeys',
    'maxSerializedBytes',
    'maxStringCodeUnits',
    'maxTotalStringCodeUnits',
] as const);
const createProjectionObject = Object.create;
const defineProjectionProperty = Object.defineProperty;
const describeProjectionProperty = Object.getOwnPropertyDescriptor;
const projectionObjectHasOwn = Object.hasOwn;
const listProjectionObjectKeys = Object.keys;
const listProjectionKeys = Reflect.ownKeys;
const applyProjectionFunction = Reflect.apply;
const isProjectionArray = Array.isArray;
const stringifyProjectionJson = JSON.stringify;
const minimumProjectionNumber = Math.min;
const isFiniteProjectionNumber = Number.isFinite;
const isSafeProjectionInteger = Number.isSafeInteger;
const setProjectionPrototype = Object.setPrototypeOf;
const projectionStringFrom = String;
const projectionTextEncoder = new TextEncoder();
const projectionTextEncode = TextEncoder.prototype.encode;
const ProjectionSet = Set;
const projectionSetAdd = Set.prototype.add;
const projectionSetDelete = Set.prototype.delete;
const projectionSetHas = Set.prototype.has;
const ProjectionRangeError = RangeError;
const ProjectionTypeError = TypeError;
function ownProjectionSetting(value: unknown, key: PropertyKey): unknown {
    if (typeof value !== 'object' || value === null)
        return undefined;
    try {
        const descriptor = applyProjectionFunction(describeProjectionProperty, Object, [value, key]);
        return descriptor && descriptorHasOwnValue(descriptor) ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
export function readGuiProjectionPolicy(value: unknown): GuiProjectionPolicy {
    const overrides: Partial<Record<keyof GuiProjectionLimits, number>> = {};
    for (let index = 0; index < GUI_PROJECTION_LIMIT_NAMES.length; index += 1) {
        const name = GUI_PROJECTION_LIMIT_NAMES[index];
        if (name === undefined)
            continue;
        const candidate = ownProjectionSetting(value, name);
        if (typeof candidate === 'number' && isSafeProjectionInteger(candidate) && candidate >= 0) {
            overrides[name] = candidate;
        }
    }
    return Object.freeze({
        enabled: ownProjectionSetting(value, 'enabled') !== false,
        overrides: Object.freeze(overrides),
    });
}
export function resolveGuiProjectionLimits(policy: GuiProjectionPolicy, defaults: GuiProjectionLimits = GUI_PROJECTION_LIMITS): GuiProjectionLimits {
    if (!policy.enabled)
        return GUI_UNBOUNDED_PROJECTION_LIMITS;
    const resolved = {} as Record<keyof GuiProjectionLimits, number>;
    for (let index = 0; index < GUI_PROJECTION_LIMIT_NAMES.length; index += 1) {
        const name = GUI_PROJECTION_LIMIT_NAMES[index];
        if (name === undefined)
            continue;
        resolved[name] = policy.overrides[name] ?? defaults[name];
    }
    return Object.freeze(resolved);
}
type ProjectionMarkerKind = 'cycle' | 'truncated' | 'unreadable' | 'unsupported';
interface ProjectionBudget {
    complete: boolean;
    remainingDescriptorReads: number;
    remainingNodes: number;
    remainingStringCodeUnits: number;
}
const DESCRIPTOR_LIMIT = Symbol('gui-projection-descriptor-limit');
const DESCRIPTOR_UNREADABLE = Symbol('gui-projection-descriptor-unreadable');
type DescriptorResult = PropertyDescriptor | undefined | typeof DESCRIPTOR_LIMIT | typeof DESCRIPTOR_UNREADABLE;
function defineDataProperty(target: object, key: PropertyKey, value: unknown): void {
    applyProjectionFunction(defineProjectionProperty, Object, [
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
function createProjectionRecord(): Record<string, unknown> {
    const output: unknown = applyProjectionFunction(createProjectionObject, Object, [null]);
    if (typeof output !== 'object' || output === null) {
        throw new ProjectionTypeError('Failed to create GUI projection record.');
    }
    return output as Record<string, unknown>;
}
function createProjectionArray(): unknown[] {
    const output: unknown[] = [];
    applyProjectionFunction(setProjectionPrototype, Object, [output, null]);
    return output;
}
function marker(kind: ProjectionMarkerKind, reason: string, details?: Readonly<Record<string, unknown>>): unknown {
    const output = createProjectionRecord();
    defineDataProperty(output, GUI_PROJECTION_MARKER_PROPERTY, kind);
    defineDataProperty(output, 'reason', reason);
    if (details) {
        const keys = applyProjectionFunction(listProjectionObjectKeys, Object, [details]);
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (key !== undefined)
                defineDataProperty(output, key, details[key]);
        }
    }
    return output;
}
function truncated(reason: string, limit: number, value?: unknown): unknown {
    const details = createProjectionRecord();
    defineDataProperty(details, 'limit', limit);
    if (value !== undefined)
        defineDataProperty(details, 'value', value);
    return marker('truncated', reason, details);
}
function unreadable(reason: string): unknown {
    return marker('unreadable', reason);
}
function unsupported(reason: string): unknown {
    return marker('unsupported', reason);
}
function stringPrefix(value: string, limit: number): string {
    let retained = '';
    for (const character of value) {
        if (retained.length + character.length > limit)
            break;
        retained += character;
    }
    return retained;
}
function projectString(value: string, limits: GuiProjectionLimits, budget: ProjectionBudget): unknown {
    const retainedLimit = minimumProjectionNumber(value.length, limits.maxStringCodeUnits, budget.remainingStringCodeUnits);
    const retained = stringPrefix(value, retainedLimit);
    budget.remainingStringCodeUnits -= retained.length;
    if (retained.length === value.length)
        return value;
    const details = createProjectionRecord();
    const totalLimitReached = limits.maxStringCodeUnits >= value.length;
    defineDataProperty(details, 'limit', totalLimitReached ? limits.maxTotalStringCodeUnits : limits.maxStringCodeUnits);
    defineDataProperty(details, 'originalCodeUnits', value.length);
    defineDataProperty(details, 'value', retained);
    markProjectionIncomplete(budget);
    return marker('truncated', totalLimitReached ? 'total-string-limit' : 'string-limit', details);
}
function ownKeys(value: object): PropertyKey[] {
    return applyProjectionFunction(listProjectionKeys, Reflect, [value]);
}
function ownDescriptor(value: object, key: PropertyKey, budget: ProjectionBudget): DescriptorResult {
    if (budget.remainingDescriptorReads <= 0)
        return DESCRIPTOR_LIMIT;
    budget.remainingDescriptorReads -= 1;
    try {
        return applyProjectionFunction(describeProjectionProperty, Object, [value, key]);
    }
    catch {
        return DESCRIPTOR_UNREADABLE;
    }
}
function descriptorHasOwnValue(descriptor: PropertyDescriptor): boolean {
    return applyProjectionFunction(projectionObjectHasOwn, Object, [descriptor, 'value']);
}
function reserveProjectedNode(budget: ProjectionBudget): boolean {
    if (budget.remainingNodes <= 0)
        return false;
    budget.remainingNodes -= 1;
    return true;
}
function markProjectionIncomplete(budget: ProjectionBudget): void {
    budget.complete = false;
}
function incompleteProjection(budget: ProjectionBudget, value: unknown): unknown {
    markProjectionIncomplete(budget);
    return value;
}
function activeHas(active: Set<object>, value: object): boolean {
    return applyProjectionFunction(projectionSetHas, active, [value]);
}
function activeAdd(active: Set<object>, value: object): void {
    applyProjectionFunction(projectionSetAdd, active, [value]);
}
function activeDelete(active: Set<object>, value: object): void {
    applyProjectionFunction(projectionSetDelete, active, [value]);
}
function validateProjectionLimits(limits: GuiProjectionLimits): void {
    const values = [
        limits.maxArrayEntries,
        limits.maxDepth,
        limits.maxDescriptorReads,
        limits.maxKeyCodeUnits,
        limits.maxNodes,
        limits.maxObjectKeys,
        limits.maxSerializedBytes,
        limits.maxStringCodeUnits,
        limits.maxTotalStringCodeUnits,
    ];
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (typeof value !== 'number' || !isSafeProjectionInteger(value) || value < 0) {
            throw new ProjectionRangeError('GUI projection limits must be non-negative safe integers.');
        }
    }
}
function projectArray(source: unknown[], depth: number, limits: GuiProjectionLimits, budget: ProjectionBudget, active: Set<object>): unknown {
    const lengthDescriptor = ownDescriptor(source, 'length', budget);
    if (lengthDescriptor === DESCRIPTOR_LIMIT) {
        return incompleteProjection(budget, truncated('descriptor-read-limit', limits.maxDescriptorReads));
    }
    if (lengthDescriptor === DESCRIPTOR_UNREADABLE ||
        !lengthDescriptor ||
        !descriptorHasOwnValue(lengthDescriptor) ||
        typeof lengthDescriptor.value !== 'number' ||
        !isSafeProjectionInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0) {
        return incompleteProjection(budget, unreadable('array-length'));
    }
    const length = lengthDescriptor.value;
    const entryLimit = minimumProjectionNumber(length, limits.maxArrayEntries);
    const output = createProjectionArray();
    let index = 0;
    for (; index < entryLimit; index += 1) {
        if (budget.remainingNodes <= 0) {
            return incompleteProjection(budget, truncated('node-limit', limits.maxNodes, output));
        }
        const descriptor = ownDescriptor(source, applyProjectionFunction(projectionStringFrom, undefined, [index]), budget);
        if (descriptor === DESCRIPTOR_LIMIT) {
            return incompleteProjection(budget, truncated('descriptor-read-limit', limits.maxDescriptorReads, output));
        }
        if (descriptor === DESCRIPTOR_UNREADABLE) {
            reserveProjectedNode(budget);
            markProjectionIncomplete(budget);
            defineDataProperty(output, index, unreadable('property-descriptor'));
            continue;
        }
        if (!descriptor) {
            reserveProjectedNode(budget);
            markProjectionIncomplete(budget);
            defineDataProperty(output, index, unsupported('array-hole'));
            continue;
        }
        if (!descriptorHasOwnValue(descriptor)) {
            reserveProjectedNode(budget);
            markProjectionIncomplete(budget);
            defineDataProperty(output, index, unreadable('accessor'));
            continue;
        }
        defineDataProperty(output, index, projectValue(descriptor.value, depth + 1, limits, budget, active));
    }
    if (length > index) {
        return incompleteProjection(budget, truncated('array-entry-limit', limits.maxArrayEntries, output));
    }
    return output;
}
function projectObject(source: object, depth: number, limits: GuiProjectionLimits, budget: ProjectionBudget, active: Set<object>): unknown {
    let keys: PropertyKey[];
    try {
        keys = ownKeys(source);
    }
    catch {
        return incompleteProjection(budget, unreadable('own-keys'));
    }
    const output = createProjectionRecord();
    const inspectedLimit = minimumProjectionNumber(keys.length, limits.maxObjectKeys);
    let inspected = 0;
    for (; inspected < inspectedLimit; inspected += 1) {
        const key = keys[inspected];
        if (typeof key !== 'string')
            continue;
        if (budget.remainingNodes <= 0) {
            return incompleteProjection(budget, truncated('node-limit', limits.maxNodes, output));
        }
        if (key === GUI_PROJECTION_MARKER_PROPERTY) {
            return incompleteProjection(budget, unsupported('reserved-marker-property'));
        }
        if (key.length > limits.maxKeyCodeUnits) {
            return incompleteProjection(budget, truncated('object-key-string-limit', limits.maxKeyCodeUnits, output));
        }
        const descriptor = ownDescriptor(source, key, budget);
        if (descriptor === DESCRIPTOR_LIMIT) {
            return incompleteProjection(budget, truncated('descriptor-read-limit', limits.maxDescriptorReads, output));
        }
        if (descriptor === DESCRIPTOR_UNREADABLE) {
            if (key.length > budget.remainingStringCodeUnits) {
                return incompleteProjection(budget, truncated('total-string-limit', limits.maxTotalStringCodeUnits, output));
            }
            budget.remainingStringCodeUnits -= key.length;
            reserveProjectedNode(budget);
            markProjectionIncomplete(budget);
            defineDataProperty(output, key, unreadable('property-descriptor'));
            continue;
        }
        if (descriptor?.enumerable !== true)
            continue;
        if (key.length > budget.remainingStringCodeUnits) {
            return incompleteProjection(budget, truncated('total-string-limit', limits.maxTotalStringCodeUnits, output));
        }
        budget.remainingStringCodeUnits -= key.length;
        if (!descriptorHasOwnValue(descriptor)) {
            reserveProjectedNode(budget);
            markProjectionIncomplete(budget);
            defineDataProperty(output, key, unreadable('accessor'));
            continue;
        }
        defineDataProperty(output, key, projectValue(descriptor.value, depth + 1, limits, budget, active));
    }
    if (keys.length > inspected) {
        return incompleteProjection(budget, truncated('object-key-limit', limits.maxObjectKeys, output));
    }
    return output;
}
function projectValue(value: unknown, depth: number, limits: GuiProjectionLimits, budget: ProjectionBudget, active: Set<object>): unknown {
    if (!reserveProjectedNode(budget)) {
        return incompleteProjection(budget, truncated('node-limit', limits.maxNodes));
    }
    if (value === null || typeof value === 'boolean')
        return value;
    if (typeof value === 'string')
        return projectString(value, limits, budget);
    if (typeof value === 'number') {
        return isFiniteProjectionNumber(value) ? value : incompleteProjection(budget, unsupported('non-finite-number'));
    }
    if (typeof value === 'undefined')
        return incompleteProjection(budget, unsupported('undefined'));
    if (typeof value === 'bigint')
        return incompleteProjection(budget, unsupported('bigint'));
    if (typeof value === 'symbol')
        return incompleteProjection(budget, unsupported('symbol'));
    if (typeof value === 'function')
        return incompleteProjection(budget, unsupported('function'));
    if (depth >= limits.maxDepth) {
        return incompleteProjection(budget, truncated('depth-limit', limits.maxDepth));
    }
    const identity = value;
    if (activeHas(active, identity)) {
        return incompleteProjection(budget, marker('cycle', 'active-reference'));
    }
    activeAdd(active, identity);
    try {
        let array = false;
        try {
            array = isProjectionArray(identity);
        }
        catch {
            return incompleteProjection(budget, unreadable('array-identity'));
        }
        return array
            ? projectArray(identity as unknown[], depth, limits, budget, active)
            : projectObject(identity, depth, limits, budget, active);
    }
    finally {
        activeDelete(active, identity);
    }
}
export function projectGuiValueOutcome(value: unknown, limits: GuiProjectionLimits = GUI_PROJECTION_LIMITS): GuiProjectionOutcome {
    validateProjectionLimits(limits);
    const budget: ProjectionBudget = {
        complete: true,
        remainingDescriptorReads: limits.maxDescriptorReads,
        remainingNodes: limits.maxNodes,
        remainingStringCodeUnits: limits.maxTotalStringCodeUnits,
    };
    const projected = projectValue(value, 0, limits, budget, new ProjectionSet<object>());
    return { complete: budget.complete, nodes: limits.maxNodes - budget.remainingNodes, value: projected };
}
export function projectGuiValue(value: unknown, limits: GuiProjectionLimits = GUI_PROJECTION_LIMITS): unknown {
    return projectGuiValueOutcome(value, limits).value;
}
function utf8ByteLengthAbove(value: string, limit: number): number {
    const encoded = applyProjectionFunction(projectionTextEncode, projectionTextEncoder, [value]) as Uint8Array;
    return encoded.byteLength > limit ? limit + 1 : encoded.byteLength;
}
export function serializeGuiValueOutcome(value: unknown, limits: GuiProjectionLimits = GUI_PROJECTION_LIMITS): GuiSerializationOutcome {
    const projected = projectGuiValueOutcome(value, limits);
    const serialized = applyProjectionFunction(stringifyProjectionJson, JSON, [projected.value, null, 2]);
    if (utf8ByteLengthAbove(serialized, limits.maxSerializedBytes) <= limits.maxSerializedBytes) {
        return { complete: projected.complete, text: serialized };
    }
    const terminal = applyProjectionFunction(stringifyProjectionJson, JSON, [
        truncated('serialized-byte-limit', limits.maxSerializedBytes),
    ]);
    if (utf8ByteLengthAbove(terminal, limits.maxSerializedBytes) <= limits.maxSerializedBytes) {
        return { complete: false, text: terminal };
    }
    throw new ProjectionRangeError('The GUI projection byte limit cannot contain its truncation marker.');
}
export function serializeGuiValue(value: unknown, limits: GuiProjectionLimits = GUI_PROJECTION_LIMITS): string {
    return serializeGuiValueOutcome(value, limits).text;
}
