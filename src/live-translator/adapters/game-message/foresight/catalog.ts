import { COMMAND_CATALOG_ASSET } from './constants.js';
import { createForesightProjectionAuthority, type ForesightCollectionAdmissionOutcome, type ForesightCollectionGeneration, type ForesightCollectionGenerationFacts, type ForesightCollectionWindowReceipt, type ForesightProjectionOutcome, type ForesightProjectionPathSpec, type ForesightProjectionPlanToken, type ForesightProjectionReceipt, type ForesightProjectionValueKind, } from './projection.js';
type PropertyBag = Record<PropertyKey, unknown>;
type ForesightCommandKind = 'event' | 'movement-route';
const CATALOG_SCHEMA_VERSION = 5;
const COMMAND_ROW_LENGTH = 11;
const INPUT_PATH_ROW_LENGTH = 2;
const NESTED_LIST_ROW_LENGTH = 4;
const MAX_COMMAND_TABLE_ROWS = 512;
const MAX_INPUT_PATHS = 64;
const MAX_NESTED_LIST_SPECS = 64;
const IntrinsicObject = Object;
const IntrinsicArray = Array;
const IntrinsicMap = Map;
const IntrinsicSet = Set;
const IntrinsicWeakMap = WeakMap;
const IntrinsicWeakSet = WeakSet;
const IntrinsicTypeError = TypeError;
const objectFreeze = Object.freeze;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectIs = Object.is;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const numberNaN = Number.NaN;
const numberFrom = Number;
const arrayIsArray = Array.isArray;
const reflectApply = Reflect.apply;
const stringFrom = String;
type UnknownFunction = (...args: unknown[]) => unknown;
function captureMethod(target: object, key: PropertyKey): UnknownFunction {
    const descriptor = objectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? descriptorDataValue(descriptor) : undefined;
    if (typeof value !== 'function')
        throw new IntrinsicTypeError(`[Foresight] Missing intrinsic ${stringFrom(key)}.`);
    return value as UnknownFunction;
}
const arraySort = captureMethod(IntrinsicArray.prototype, 'sort');
const mapGet = captureMethod(IntrinsicMap.prototype, 'get');
const mapHas = captureMethod(IntrinsicMap.prototype, 'has');
const mapSet = captureMethod(IntrinsicMap.prototype, 'set');
const setAdd = captureMethod(IntrinsicSet.prototype, 'add');
const setHas = captureMethod(IntrinsicSet.prototype, 'has');
const weakMapGet = captureMethod(IntrinsicWeakMap.prototype, 'get');
const weakMapSet = captureMethod(IntrinsicWeakMap.prototype, 'set');
const weakMapDelete = captureMethod(IntrinsicWeakMap.prototype, 'delete');
const weakSetAdd = captureMethod(IntrinsicWeakSet.prototype, 'add');
const weakSetHas = captureMethod(IntrinsicWeakSet.prototype, 'has');
const stringToLowerCase = captureMethod(stringFrom.prototype, 'toLowerCase');
const stringTrim = captureMethod(stringFrom.prototype, 'trim');
function call<Result>(method: UnknownFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(method, receiver, args) as Result;
}
function push<Value>(values: Value[], value: Value): void {
    const index = values.length;
    if (!numberIsSafeInteger(index) || index < 0) {
        throw new IntrinsicTypeError('[Foresight] Invalid private catalog roster length.');
    }
    call(objectDefineProperty as unknown as UnknownFunction, IntrinsicObject, [
        values,
        index,
        {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
        },
    ]);
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    if (values.length !== index + 1 ||
        !descriptor ||
        !('value' in descriptor) ||
        !objectIs(descriptor.value, value) ||
        descriptor.writable !== true ||
        descriptor.enumerable !== true ||
        descriptor.configurable !== true) {
        throw new IntrinsicTypeError('[Foresight] Private catalog roster publication failed.');
    }
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return call<Readonly<Value>>(objectFreeze, IntrinsicObject, [value]);
}
function createNullRecord(): Record<PropertyKey, unknown> {
    return call<Record<PropertyKey, unknown>>(objectCreate as unknown as UnknownFunction, IntrinsicObject, [null]);
}
const COMMAND_ROW = freezeExact({
    code: 0,
    label: 1,
    classification: 2,
    native: 3,
    category: 4,
    scanBehavior: 5,
    stalenessRisk: 6,
    summary: 7,
    reason: 8,
    inputPaths: 9,
    nestedLists: 10,
} as const);
const EVENT_STRUCTURAL_PATHS: readonly ForesightProjectionPathSpec[] = freezeExact([
    freezeExact({ path: 'code', valueKind: 'scalar', required: true }),
    freezeExact({ path: 'indent', valueKind: 'scalar', required: true }),
]);
const MOVEMENT_STRUCTURAL_PATHS: readonly ForesightProjectionPathSpec[] = freezeExact([
    freezeExact({ path: 'code', valueKind: 'scalar', required: true }),
]);
type ForesightCommandClassification = 'linear' | 'continuation' | 'nesting' | 'branching' | 'terminal' | 'external';
type ForesightScanBehavior = 'message' | 'message-line' | 'advance' | 'movement-route' | 'movement-route-line' | 'nested-list' | 'frame-end' | 'barrier';
type ForesightStalenessRisk = 'state' | 'context' | 'external' | '';
export type ForesightCatalogGlobalScope = PropertyBag & {
    readonly LiveTranslatorAssets?: unknown;
    readonly LiveTranslatorForesightCommands?: unknown;
};
export interface ForesightNestedListSpec {
    readonly path: string;
    readonly name: string;
    readonly runtimeOrder: number;
    readonly optional: boolean;
}
export interface ForesightCommandMetadata {
    readonly code: number;
    readonly label: string;
    readonly classification: ForesightCommandClassification;
    readonly native: boolean;
    readonly category: string;
    readonly scanBehavior: ForesightScanBehavior;
    readonly stalenessRisk: ForesightStalenessRisk;
    readonly nestedLists: readonly ForesightNestedListSpec[];
    readonly summary: string;
    readonly reason: string;
}
type ForesightCommandProjectionOutcome = {
    readonly accepted: true;
    readonly command: Readonly<Record<PropertyKey, unknown>>;
    readonly metadata: ForesightCommandMetadata;
    readonly receipt: ForesightProjectionReceipt;
} | {
    readonly accepted: false;
    readonly reason: string;
    readonly stopReason: string;
};
export interface ForesightProjectedCommandRow {
    readonly index: number;
    readonly command: Readonly<Record<PropertyKey, unknown>>;
    readonly metadata: ForesightCommandMetadata;
}
export interface ForesightCommandProjectionWindow {
    readonly kind: 'event-list' | 'movement-list' | 'movement-command';
    readonly startIndex: number;
    readonly nextIndex: number;
    readonly complete: boolean;
    readonly commands: readonly ForesightProjectedCommandRow[];
}
export type ForesightCommandProjectionWindowReceipt = Readonly<object>;
export type ForesightCommandListGenerationAdopter = (generation: ForesightCollectionGeneration, facts: ForesightCollectionGenerationFacts) => boolean;
export type ForesightCommandProjectionWindowAdopter = (window: ForesightCommandProjectionWindow, receipt: ForesightCommandProjectionWindowReceipt) => boolean;
export interface ForesightCatalogParts {
    getEventCommandMetadata(code: unknown): ForesightCommandMetadata;
    getMovementRouteCommandMetadata(code: unknown): ForesightCommandMetadata;
    admitEventCommandList(list: unknown, adoptGeneration: ForesightCommandListGenerationAdopter): boolean;
    retainCommandListGeneration(generation: unknown, adoptGeneration: ForesightCommandListGenerationAdopter): boolean;
    readCommandListGeneration(generation: unknown): ForesightCollectionGenerationFacts | null;
    attestCommandListGeneration(generation: unknown): boolean;
    retireCommandListGeneration(generation: unknown): boolean;
    attestEventCommandListBinding(generation: unknown, observedSource: unknown): boolean;
    captureEventCommandProjectionWindow(generation: unknown, startIndex: unknown, maximumCount: unknown, adoptWindow: ForesightCommandProjectionWindowAdopter): boolean;
    captureMovementCommandProjectionWindow(generation: unknown, startIndex: unknown, maximumCount: unknown, adoptWindow: ForesightCommandProjectionWindowAdopter): boolean;
    attestCommandProjectionWindow(receipt: unknown): boolean;
    retireCommandProjectionWindow(receipt: unknown): boolean;
    hasStalenessRisk(metadata: unknown): boolean;
}
interface ForesightCommandCatalog {
    readonly eventCommands: ReadonlyMap<number, ForesightCommandMetadata>;
    readonly movementRouteCommands: ReadonlyMap<number, ForesightCommandMetadata>;
}
interface CommandProjectionWindowReceiptState {
    readonly collectionReceipt: ForesightCollectionWindowReceipt;
    readonly projectionReceipts: readonly ForesightProjectionReceipt[];
    phase: 'active' | 'attesting' | 'retired';
}
interface NestedListSortSpec extends ForesightNestedListSpec {
    readonly index: number;
}
function readOwnDataDescriptor(source: unknown, key: PropertyKey): PropertyDescriptor | null {
    if (!source || (typeof source !== 'object' && typeof source !== 'function'))
        return null;
    try {
        const descriptor = objectGetOwnPropertyDescriptor(source, key);
        return descriptor && 'value' in descriptor ? descriptor : null;
    }
    catch {
        return null;
    }
}
function readOwnData(source: unknown, key: PropertyKey): unknown {
    const descriptor = readOwnDataDescriptor(source, key);
    return descriptor ? descriptorDataValue(descriptor) : undefined;
}
function descriptorDataValue(descriptor: PropertyDescriptor): unknown {
    return (descriptor as {
        readonly value: unknown;
    }).value;
}
function captureDenseArray(value: unknown, maximumLength: number, exactLength: number | null = null): readonly unknown[] | null {
    try {
        if (!arrayIsArray(value))
            return null;
    }
    catch {
        return null;
    }
    let lengthDescriptor: PropertyDescriptor | undefined;
    try {
        lengthDescriptor = objectGetOwnPropertyDescriptor(value, 'length');
    }
    catch {
        return null;
    }
    if (!lengthDescriptor || !('value' in lengthDescriptor))
        return null;
    const length = descriptorDataValue(lengthDescriptor);
    if (typeof length !== 'number' ||
        !numberIsSafeInteger(length) ||
        length < 0 ||
        length > maximumLength ||
        (exactLength !== null && length !== exactLength)) {
        return null;
    }
    const descriptors: PropertyDescriptor[] = [];
    for (let index = 0; index < length; index += 1) {
        let descriptor: PropertyDescriptor | undefined;
        try {
            descriptor = objectGetOwnPropertyDescriptor(value, stringFrom(index));
        }
        catch {
            return null;
        }
        if (!descriptor || !('value' in descriptor))
            return null;
        push(descriptors, descriptor);
    }
    try {
        const currentLength = objectGetOwnPropertyDescriptor(value, 'length');
        if (!currentLength || !descriptorsEqual(lengthDescriptor, currentLength))
            return null;
        for (let index = 0; index < descriptors.length; index += 1) {
            const current = objectGetOwnPropertyDescriptor(value, stringFrom(index));
            const expected = descriptors[index];
            if (!current || !expected || !descriptorsEqual(expected, current))
                return null;
        }
    }
    catch {
        return null;
    }
    const values: unknown[] = [];
    for (let index = 0; index < descriptors.length; index += 1) {
        const descriptor = descriptors[index];
        if (!descriptor)
            return null;
        push(values, descriptorDataValue(descriptor));
    }
    return freezeExact(values);
}
function descriptorsEqual(left: PropertyDescriptor, right: PropertyDescriptor): boolean {
    if (left.configurable !== right.configurable || left.enumerable !== right.enumerable)
        return false;
    const leftData = 'value' in left;
    const rightData = 'value' in right;
    if (leftData !== rightData)
        return false;
    if (leftData && rightData)
        return left.writable === right.writable && objectIs(left.value, right.value);
    return left.get === right.get && left.set === right.set;
}
function primitiveCode(value: unknown): number {
    if (typeof value !== 'number' &&
        typeof value !== 'string' &&
        typeof value !== 'boolean' &&
        typeof value !== 'bigint') {
        return numberNaN;
    }
    try {
        const code = numberFrom(value);
        return numberIsFinite(code) ? code : numberNaN;
    }
    catch {
        return numberNaN;
    }
}
function safeFiniteNumber(value: unknown): number | null {
    if (typeof value !== 'number' &&
        typeof value !== 'string' &&
        typeof value !== 'boolean' &&
        typeof value !== 'bigint') {
        return null;
    }
    try {
        const numeric = numberFrom(value);
        return numberIsFinite(numeric) ? numeric : null;
    }
    catch {
        return null;
    }
}
function safeString(value: unknown): string {
    return typeof value === 'string' ? call<string>(stringTrim, value, []) : '';
}
function normalizeClassification(value: unknown): ForesightCommandClassification {
    const source = safeString(value);
    const classification = call<string>(stringToLowerCase, source, []);
    if (classification === 'linear' ||
        classification === 'continuation' ||
        classification === 'nesting' ||
        classification === 'branching' ||
        classification === 'terminal' ||
        classification === 'external') {
        return classification;
    }
    return 'external';
}
function normalizeScanBehavior(value: unknown, classification: ForesightCommandClassification): ForesightScanBehavior {
    const source = safeString(value);
    const behavior = call<string>(stringToLowerCase, source, []);
    if (behavior === 'message' ||
        behavior === 'message-line' ||
        behavior === 'advance' ||
        behavior === 'movement-route' ||
        behavior === 'movement-route-line' ||
        behavior === 'nested-list' ||
        behavior === 'frame-end' ||
        behavior === 'barrier') {
        return behavior;
    }
    return classification === 'linear' || classification === 'continuation' ? 'advance' : 'barrier';
}
function normalizeStalenessRisk(value: unknown, classification: ForesightCommandClassification): ForesightStalenessRisk {
    const source = safeString(value);
    const risk = call<string>(stringToLowerCase, source, []);
    if (risk === 'state' || risk === 'context' || risk === 'external')
        return risk;
    return classification === 'external' ? 'external' : '';
}
function normalizeValueKind(value: unknown): ForesightProjectionValueKind | null {
    return value === 'scalar' ||
        value === 'string' ||
        value === 'number' ||
        value === 'boolean' ||
        value === 'event-list' ||
        value === 'movement-list' ||
        value === 'movement-command'
        ? value
        : null;
}
export function createForesightCatalog(globalScope: ForesightCatalogGlobalScope): ForesightCatalogParts {
    const projection = createForesightProjectionAuthority();
    const eventStructuralPlan = projection.compile(EVENT_STRUCTURAL_PATHS);
    const movementStructuralPlan = projection.compile(MOVEMENT_STRUCTURAL_PATHS);
    const metadataAuthorities = new IntrinsicWeakSet<object>();
    const metadataPlans = new IntrinsicWeakMap<object, ForesightProjectionPlanToken>();
    const commandWindowReceipts = new IntrinsicWeakMap<object, CommandProjectionWindowReceiptState>();
    const catalog = loadCatalog();
    function selectCatalogJson(): unknown {
        const assets = readOwnData(globalScope, 'LiveTranslatorAssets');
        const primary = readOwnData(readOwnData(assets, COMMAND_CATALOG_ASSET), 'json');
        if (primary && typeof primary === 'object')
            return primary;
        const alias = readOwnData(readOwnData(assets, 'commands.json'), 'json');
        if (alias && typeof alias === 'object')
            return alias;
        const direct = readOwnData(globalScope, 'LiveTranslatorForesightCommands');
        return direct && typeof direct === 'object' ? direct : null;
    }
    function normalizeInputPaths(value: unknown): readonly ForesightProjectionPathSpec[] | null {
        const rows = captureDenseArray(value, MAX_INPUT_PATHS);
        if (!rows)
            return null;
        const specs: ForesightProjectionPathSpec[] = [];
        const seen = new IntrinsicSet<string>();
        for (let index = 0; index < rows.length; index += 1) {
            const candidate = rows[index];
            const row = captureDenseArray(candidate, INPUT_PATH_ROW_LENGTH, INPUT_PATH_ROW_LENGTH);
            if (!row)
                return null;
            const path = safeString(row[0]);
            const valueKind = normalizeValueKind(row[1]);
            if (!path || !valueKind || call<boolean>(setHas, seen, [path]))
                return null;
            call(setAdd, seen, [path]);
            push(specs, freezeExact({ path, valueKind, required: false }));
        }
        return freezeExact(specs);
    }
    function normalizeNestedLists(value: unknown): readonly ForesightNestedListSpec[] | null {
        const rows = captureDenseArray(value, MAX_NESTED_LIST_SPECS);
        if (!rows)
            return null;
        const specs: NestedListSortSpec[] = [];
        const seen = new IntrinsicSet<string>();
        for (let index = 0; index < rows.length; index += 1) {
            const row = captureDenseArray(rows[index], NESTED_LIST_ROW_LENGTH, NESTED_LIST_ROW_LENGTH);
            if (!row)
                return null;
            const path = safeString(row[0]);
            const name = safeString(row[1]);
            const runtimeOrder = safeFiniteNumber(row[2]);
            const optional = row[3] === true;
            if (!path || runtimeOrder === null || call<boolean>(setHas, seen, [path]))
                return null;
            call(setAdd, seen, [path]);
            push(specs, { path, name, runtimeOrder, optional, index });
        }
        call(arraySort, specs, [
            (left: NestedListSortSpec, right: NestedListSortSpec) => left.runtimeOrder - right.runtimeOrder || left.index - right.index,
        ]);
        const normalized: ForesightNestedListSpec[] = [];
        for (let index = 0; index < specs.length; index += 1) {
            const spec = specs[index];
            if (!spec)
                return null;
            push(normalized, freezeExact({
                path: spec.path,
                name: spec.name,
                runtimeOrder: spec.runtimeOrder,
                optional: spec.optional,
            }));
        }
        return freezeExact(normalized);
    }
    function normalizeCommandRow(rowValue: unknown, kind: ForesightCommandKind): ForesightCommandMetadata | null {
        const row = captureDenseArray(rowValue, COMMAND_ROW_LENGTH, COMMAND_ROW_LENGTH);
        if (!row)
            return null;
        const code = primitiveCode(row[COMMAND_ROW.code]);
        if (!numberIsFinite(code))
            return null;
        const classification = normalizeClassification(row[COMMAND_ROW.classification]);
        const inputPaths = normalizeInputPaths(row[COMMAND_ROW.inputPaths]);
        const nestedLists = normalizeNestedLists(row[COMMAND_ROW.nestedLists]);
        if (!inputPaths || !nestedLists)
            return null;
        const authoredPaths: ForesightProjectionPathSpec[] = [];
        const structural = kind === 'event' ? EVENT_STRUCTURAL_PATHS : MOVEMENT_STRUCTURAL_PATHS;
        for (let index = 0; index < structural.length; index += 1) {
            const spec = structural[index];
            if (spec)
                push(authoredPaths, spec);
        }
        for (let index = 0; index < inputPaths.length; index += 1) {
            const spec = inputPaths[index];
            if (spec)
                push(authoredPaths, spec);
        }
        for (let index = 0; index < nestedLists.length; index += 1) {
            const spec = nestedLists[index];
            if (spec)
                push(authoredPaths, freezeExact({ path: spec.path, valueKind: 'event-list' as const, required: false }));
        }
        const inputPlan = projection.compile(freezeExact(authoredPaths));
        if (!inputPlan)
            return null;
        const metadata: ForesightCommandMetadata = freezeExact({
            code,
            label: safeString(row[COMMAND_ROW.label]) || `Unknown ${kind} command ${stringFrom(code)}`,
            classification,
            native: row[COMMAND_ROW.native] === true,
            category: safeString(row[COMMAND_ROW.category]) || kind,
            scanBehavior: normalizeScanBehavior(row[COMMAND_ROW.scanBehavior], classification),
            stalenessRisk: normalizeStalenessRisk(row[COMMAND_ROW.stalenessRisk], classification),
            nestedLists,
            summary: safeString(row[COMMAND_ROW.summary]),
            reason: safeString(row[COMMAND_ROW.reason]),
        });
        call(weakSetAdd, metadataAuthorities, [metadata]);
        call(weakMapSet, metadataPlans, [metadata, inputPlan]);
        return metadata;
    }
    function normalizeCommandTable(value: unknown, kind: ForesightCommandKind): ReadonlyMap<number, ForesightCommandMetadata> {
        const rows = captureDenseArray(value, MAX_COMMAND_TABLE_ROWS);
        if (!rows)
            return new IntrinsicMap<number, ForesightCommandMetadata>();
        const table = new IntrinsicMap<number, ForesightCommandMetadata>();
        for (let index = 0; index < rows.length; index += 1) {
            const metadata = normalizeCommandRow(rows[index], kind);
            if (metadata && !call<boolean>(mapHas, table, [metadata.code]))
                call(mapSet, table, [metadata.code, metadata]);
        }
        return table;
    }
    function loadCatalog(): ForesightCommandCatalog {
        try {
            const json = selectCatalogJson();
            if (readOwnData(json, 'schemaVersion') !== CATALOG_SCHEMA_VERSION) {
                return freezeExact({
                    eventCommands: new IntrinsicMap<number, ForesightCommandMetadata>(),
                    movementRouteCommands: new IntrinsicMap<number, ForesightCommandMetadata>(),
                });
            }
            return freezeExact({
                eventCommands: normalizeCommandTable(readOwnData(json, 'eventCommands'), 'event'),
                movementRouteCommands: normalizeCommandTable(readOwnData(json, 'movementRouteCommands'), 'movement-route'),
            });
        }
        catch {
            return freezeExact({
                eventCommands: new IntrinsicMap<number, ForesightCommandMetadata>(),
                movementRouteCommands: new IntrinsicMap<number, ForesightCommandMetadata>(),
            });
        }
    }
    function defaultCommandMetadata(code: number, kind: ForesightCommandKind): ForesightCommandMetadata {
        const inputPlan = kind === 'event' ? eventStructuralPlan : movementStructuralPlan;
        if (!inputPlan)
            throw new IntrinsicTypeError('[Foresight] Structural command projection plan is unavailable.');
        const metadata: ForesightCommandMetadata = freezeExact({
            code,
            label: `Unknown ${kind} command ${stringFrom(code)}`,
            classification: 'external',
            native: false,
            category: kind,
            scanBehavior: 'barrier',
            stalenessRisk: 'external',
            nestedLists: freezeExact([]),
            summary: '',
            reason: '',
        });
        call(weakSetAdd, metadataAuthorities, [metadata]);
        call(weakMapSet, metadataPlans, [metadata, inputPlan]);
        return metadata;
    }
    function getCommandMetadata(code: unknown, kind: ForesightCommandKind): ForesightCommandMetadata {
        const normalizedCode = primitiveCode(code);
        const table = kind === 'event' ? catalog.eventCommands : catalog.movementRouteCommands;
        return (call<ForesightCommandMetadata | undefined>(mapGet, table, [normalizedCode]) ??
            defaultCommandMetadata(normalizedCode, kind));
    }
    function getEventCommandMetadata(code: unknown): ForesightCommandMetadata {
        return getCommandMetadata(code, 'event');
    }
    function getMovementRouteCommandMetadata(code: unknown): ForesightCommandMetadata {
        return getCommandMetadata(code, 'movement-route');
    }
    function rejected(outcome: Exclude<ForesightProjectionOutcome, {
        readonly accepted: true;
    }>): ForesightCommandProjectionOutcome {
        return freezeExact({ accepted: false, reason: outcome.reason, stopReason: outcome.stopReason });
    }
    function projectCommand(command: unknown, kind: ForesightCommandKind): ForesightCommandProjectionOutcome {
        const codeDescriptor = readOwnDataDescriptor(command, 'code');
        if (!codeDescriptor) {
            return freezeExact({
                accepted: false,
                reason: 'missing-required',
                stopReason: 'foresight-projection-missing-required',
            });
        }
        const metadata = getCommandMetadata(descriptorDataValue(codeDescriptor), kind);
        const plan = call<ForesightProjectionPlanToken | undefined>(weakMapGet, metadataPlans, [metadata]);
        if (!plan) {
            return freezeExact({
                accepted: false,
                reason: 'plan-invalid',
                stopReason: 'foresight-projection-plan-invalid',
            });
        }
        const outcome = projection.project(command, plan);
        if (!outcome.accepted)
            return rejected(outcome);
        const projected = outcome.value;
        if (!projected || typeof projected !== 'object') {
            projection.retireProjection(outcome.receipt);
            return freezeExact({ accepted: false, reason: 'type', stopReason: 'foresight-projection-type' });
        }
        const projectedCode = primitiveCode(readOwnData(projected, 'code'));
        if (!objectIs(projectedCode, metadata.code)) {
            projection.retireProjection(outcome.receipt);
            return freezeExact({
                accepted: false,
                reason: 'descriptor-drift',
                stopReason: 'foresight-projection-descriptor-drift',
            });
        }
        return freezeExact({
            accepted: true,
            command: projected as Readonly<Record<PropertyKey, unknown>>,
            metadata,
            receipt: outcome.receipt,
        });
    }
    function projectEventWindowRow(command: unknown): ForesightCommandProjectionOutcome {
        return projectCommand(command, 'event');
    }
    function projectMovementWindowRow(command: unknown): ForesightCommandProjectionOutcome {
        return projectCommand(command, 'movement-route');
    }
    function hardAdoptGeneration(outcome: ForesightCollectionAdmissionOutcome, adoptGeneration: ForesightCommandListGenerationAdopter): boolean {
        if (!outcome.accepted)
            return false;
        const generation = outcome.token;
        try {
            if (typeof adoptGeneration !== 'function') {
                projection.retireCollectionGeneration(generation);
                return false;
            }
            const facts = projection.readCollectionGeneration(generation);
            if (!facts) {
                projection.retireCollectionGeneration(generation);
                return false;
            }
            const adopted = call<unknown>(adoptGeneration as unknown as UnknownFunction, undefined, [
                generation,
                facts,
            ]);
            if (adopted !== true ||
                !projection.attestCollectionGeneration(generation) ||
                projection.readCollectionGeneration(generation) !== facts) {
                projection.retireCollectionGeneration(generation);
                return false;
            }
            return true;
        }
        catch {
            projection.retireCollectionGeneration(generation);
            return false;
        }
    }
    function admitEventCommandList(list: unknown, adoptGeneration: ForesightCommandListGenerationAdopter): boolean {
        return hardAdoptGeneration(projection.admitCollection(list, 'event-list'), adoptGeneration);
    }
    function retainCommandListGeneration(generation: unknown, adoptGeneration: ForesightCommandListGenerationAdopter): boolean {
        return hardAdoptGeneration(projection.retainCollectionGeneration(generation), adoptGeneration);
    }
    function readCommandListGeneration(generation: unknown): ForesightCollectionGenerationFacts | null {
        return projection.readCollectionGeneration(generation);
    }
    function attestCommandListGeneration(generation: unknown): boolean {
        return projection.attestCollectionGeneration(generation);
    }
    function retireCommandListGeneration(generation: unknown): boolean {
        return projection.retireCollectionGeneration(generation);
    }
    function attestEventCommandListBinding(generation: unknown, observedSource: unknown): boolean {
        const facts = projection.readCollectionGeneration(generation);
        return facts?.kind === 'event-list' && projection.attestCollection(generation, observedSource);
    }
    function retireCommandProjectionWindowState(receipt: object, state: CommandProjectionWindowReceiptState): boolean {
        if (call<CommandProjectionWindowReceiptState | undefined>(weakMapGet, commandWindowReceipts, [receipt]) !==
            state) {
            return false;
        }
        call(weakMapDelete, commandWindowReceipts, [receipt]);
        state.phase = 'retired';
        for (let index = 0; index < state.projectionReceipts.length; index += 1) {
            const projectionReceipt = state.projectionReceipts[index];
            if (projectionReceipt)
                projection.retireProjection(projectionReceipt);
        }
        projection.retireCollectionWindow(state.collectionReceipt);
        return true;
    }
    function retireCommandProjectionWindow(receipt: unknown): boolean {
        try {
            if (!receipt || typeof receipt !== 'object')
                return false;
            const state = call<CommandProjectionWindowReceiptState | undefined>(weakMapGet, commandWindowReceipts, [
                receipt,
            ]);
            return !!state && retireCommandProjectionWindowState(receipt, state);
        }
        catch {
            return false;
        }
    }
    function commandProjectionWindowStateIsCurrent(receipt: object, state: CommandProjectionWindowReceiptState, phase: CommandProjectionWindowReceiptState['phase']): boolean {
        return (state.phase === phase &&
            call<CommandProjectionWindowReceiptState | undefined>(weakMapGet, commandWindowReceipts, [receipt]) ===
                state);
    }
    function attestCommandProjectionWindow(receipt: unknown): boolean {
        try {
            if (!receipt || typeof receipt !== 'object')
                return false;
            const state = call<CommandProjectionWindowReceiptState | undefined>(weakMapGet, commandWindowReceipts, [
                receipt,
            ]);
            if (state?.phase !== 'active')
                return false;
            state.phase = 'attesting';
            let valid = projection.attestCollectionWindow(state.collectionReceipt);
            for (let index = 0; valid && index < state.projectionReceipts.length; index += 1) {
                const projectionReceipt = state.projectionReceipts[index];
                valid =
                    !!projectionReceipt &&
                        projection.attestProjection(projectionReceipt) &&
                        commandProjectionWindowStateIsCurrent(receipt, state, 'attesting');
            }
            if (!valid || !commandProjectionWindowStateIsCurrent(receipt, state, 'attesting')) {
                retireCommandProjectionWindowState(receipt, state);
                return false;
            }
            state.phase = 'active';
            return true;
        }
        catch {
            retireCommandProjectionWindow(receipt);
            return false;
        }
    }
    function captureCommandProjectionWindow(generation: unknown, startIndex: unknown, maximumCount: unknown, expectedKind: 'event-list' | 'movement', projectOne: (command: unknown) => ForesightCommandProjectionOutcome, adoptWindow: ForesightCommandProjectionWindowAdopter): boolean {
        let aggregateReceipt: ForesightCommandProjectionWindowReceipt | null = null;
        let collectionReceipt: ForesightCollectionWindowReceipt | null = null;
        const issuedProjectionReceipts: ForesightProjectionReceipt[] = [];
        try {
            if (typeof adoptWindow !== 'function')
                return false;
            const captured = projection.captureCollectionWindow(generation, startIndex, maximumCount);
            if (!captured.accepted)
                return false;
            collectionReceipt = captured.receipt;
            if ((expectedKind === 'event-list' && captured.kind !== 'event-list') ||
                (expectedKind === 'movement' &&
                    captured.kind !== 'movement-list' &&
                    captured.kind !== 'movement-command')) {
                projection.retireCollectionWindow(captured.receipt);
                return false;
            }
            const commands: ForesightProjectedCommandRow[] = [];
            for (let offset = 0; offset < captured.values.length; offset += 1) {
                const outcome = projectOne(captured.values[offset]);
                if (!outcome.accepted) {
                    for (let index = 0; index < issuedProjectionReceipts.length; index += 1) {
                        const receipt = issuedProjectionReceipts[index];
                        if (receipt)
                            projection.retireProjection(receipt);
                    }
                    projection.retireCollectionWindow(captured.receipt);
                    return false;
                }
                push(issuedProjectionReceipts, outcome.receipt);
                push(commands, freezeExact({
                    index: captured.startIndex + offset,
                    command: outcome.command,
                    metadata: outcome.metadata,
                }));
            }
            let childrenCurrent = projection.attestCollectionWindow(captured.receipt);
            for (let index = 0; childrenCurrent && index < issuedProjectionReceipts.length; index += 1) {
                const receipt = issuedProjectionReceipts[index];
                childrenCurrent = !!receipt && projection.attestProjection(receipt);
            }
            if (!childrenCurrent) {
                for (let index = 0; index < issuedProjectionReceipts.length; index += 1) {
                    const receipt = issuedProjectionReceipts[index];
                    if (receipt)
                        projection.retireProjection(receipt);
                }
                projection.retireCollectionWindow(captured.receipt);
                return false;
            }
            const window: ForesightCommandProjectionWindow = freezeExact({
                kind: captured.kind,
                startIndex: captured.startIndex,
                nextIndex: captured.nextIndex,
                complete: captured.complete,
                commands: freezeExact(commands),
            });
            aggregateReceipt = freezeExact(createNullRecord());
            const aggregateState: CommandProjectionWindowReceiptState = {
                collectionReceipt: captured.receipt,
                projectionReceipts: freezeExact(issuedProjectionReceipts),
                phase: 'active',
            };
            call(weakMapSet, commandWindowReceipts, [aggregateReceipt, aggregateState]);
            const adopted = call<unknown>(adoptWindow as unknown as UnknownFunction, undefined, [
                window,
                aggregateReceipt,
            ]);
            if (adopted !== true ||
                !attestCommandProjectionWindow(aggregateReceipt) ||
                aggregateState.phase !== 'active' ||
                call<CommandProjectionWindowReceiptState | undefined>(weakMapGet, commandWindowReceipts, [
                    aggregateReceipt,
                ]) !== aggregateState) {
                retireCommandProjectionWindow(aggregateReceipt);
                return false;
            }
            return true;
        }
        catch {
            if (aggregateReceipt)
                retireCommandProjectionWindow(aggregateReceipt);
            else {
                for (let index = 0; index < issuedProjectionReceipts.length; index += 1) {
                    const receipt = issuedProjectionReceipts[index];
                    if (receipt)
                        projection.retireProjection(receipt);
                }
                if (collectionReceipt)
                    projection.retireCollectionWindow(collectionReceipt);
            }
            return false;
        }
    }
    function captureEventCommandProjectionWindow(generation: unknown, startIndex: unknown, maximumCount: unknown, adoptWindow: ForesightCommandProjectionWindowAdopter): boolean {
        return captureCommandProjectionWindow(generation, startIndex, maximumCount, 'event-list', projectEventWindowRow, adoptWindow);
    }
    function captureMovementCommandProjectionWindow(generation: unknown, startIndex: unknown, maximumCount: unknown, adoptWindow: ForesightCommandProjectionWindowAdopter): boolean {
        return captureCommandProjectionWindow(generation, startIndex, maximumCount, 'movement', projectMovementWindowRow, adoptWindow);
    }
    function hasStalenessRisk(metadata: unknown): boolean {
        return (!!metadata &&
            typeof metadata === 'object' &&
            call<boolean>(weakSetHas, metadataAuthorities, [metadata]) &&
            !!readOwnData(metadata, 'stalenessRisk'));
    }
    return freezeExact({
        getEventCommandMetadata,
        getMovementRouteCommandMetadata,
        admitEventCommandList,
        retainCommandListGeneration,
        readCommandListGeneration,
        attestCommandListGeneration,
        retireCommandListGeneration,
        attestEventCommandListBinding,
        captureEventCommandProjectionWindow,
        captureMovementCommandProjectionWindow,
        attestCommandProjectionWindow,
        retireCommandProjectionWindow,
        hasStalenessRisk,
    });
}
