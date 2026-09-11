import { DEFAULT_MAX_SCAN_COMMANDS, MAX_BRANCH_DEPTH, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, } from './constants.js';
type UnknownFunction = (...args: unknown[]) => unknown;
type ObjectReference = object | UnknownFunction;
type PropertyBag = Record<PropertyKey, unknown>;
export type ForesightNestedListGlobalScope = PropertyBag & {
    readonly $dataCommonEvents?: unknown;
};
export interface ForesightNestedScanListFacts {
    readonly identity: Readonly<object>;
    readonly kind: 'event-list' | 'movement-list' | 'movement-command';
    readonly length: number | null;
}
export interface ForesightNestedScanCommandFacts {
    readonly index: number;
    readonly command: Readonly<Record<PropertyKey, unknown>>;
    readonly metadata: Readonly<object>;
}
type AdoptGeneration = (generation: Readonly<object>, facts: ForesightNestedScanListFacts, release: () => boolean, attest: () => boolean) => boolean;
export interface ForesightNestedListGenerationFacade {
    readonly admitEventListGeneration: (source: unknown, adoptGeneration: AdoptGeneration) => boolean;
    readonly attachListGeneration: (session: unknown, generation: unknown) => ForesightNestedScanListFacts | null;
    readonly attestScanSession: (session: unknown) => boolean;
}
interface MovementFlowFacade {
    readonly readMovementRouteCommand: (session: unknown, generation: unknown, current: ForesightNestedScanCommandFacts, expectedIndent: unknown) => unknown;
}
export interface ForesightNestedListDependencies {
    readonly listGenerations: ForesightNestedListGenerationFacade;
    readonly movementFlow: MovementFlowFacade;
}
interface ScanFrameOptionsCandidate {
    readonly listGeneration?: unknown;
    readonly listIdentity?: unknown;
    readonly listLength?: unknown;
    readonly index?: unknown;
    readonly endIndex?: unknown;
    readonly expectedIndent?: unknown;
    readonly interpreterId?: unknown;
    readonly listId?: unknown;
    readonly commonEventId?: unknown;
    readonly commonEventName?: unknown;
    readonly parentInterpreterId?: unknown;
    readonly parentListId?: unknown;
    readonly parentCommandIndex?: unknown;
    readonly parentCommandCode?: unknown;
    readonly nestedListType?: unknown;
    readonly nestedListName?: unknown;
    readonly nestedListPath?: unknown;
    readonly nestedListIndex?: unknown;
    readonly branchLabel?: unknown;
    readonly branchIndex?: unknown;
    readonly branchCount?: unknown;
    readonly resumeBranchDepth?: unknown;
    readonly resumeBranchPath?: unknown;
    readonly pendingNestedFrames?: unknown;
}
export interface ForesightScanFrame {
    readonly listGeneration: Readonly<object>;
    readonly listIdentity: Readonly<object>;
    readonly listLength: number;
    index: number;
    readonly endIndex: number | null;
    expectedIndent: number | null;
    readonly interpreterId: string;
    readonly listId: string;
    readonly commonEventId: number | null;
    readonly commonEventName: string;
    readonly parentInterpreterId: string;
    readonly parentListId: string;
    readonly parentCommandIndex: number | null;
    readonly parentCommandCode: number | null;
    readonly nestedListType: string;
    readonly nestedListName: string;
    readonly nestedListPath: string;
    readonly nestedListIndex: number | null;
    readonly branchLabel: string;
    readonly branchIndex: number | null;
    readonly branchCount: number | null;
    readonly resumeBranchDepth: number | null;
    readonly resumeBranchPath: readonly unknown[] | null;
    readonly pendingNestedFrames: readonly unknown[];
}
export interface ForesightNestedListParts {
    readNestedListCommand(session: unknown, generation: unknown, current: ForesightNestedScanCommandFacts, frames: unknown): unknown;
    createScanFrame(options?: unknown): ForesightScanFrame;
    createFrameListContext(frame: unknown): PropertyBag;
    attachFrameContextToBlock(block: unknown, frame: unknown): unknown;
    finishCurrentFrame(frames: unknown): boolean;
    pushNestedFrames(frames: unknown, nestedFrames: unknown, parentFrame: unknown): boolean;
    readTransparentCommand(session: unknown, generation: unknown, current: ForesightNestedScanCommandFacts, expectedIndent: unknown, frames: unknown): unknown;
}
interface DenseCapture {
    readonly source: unknown[];
    readonly descriptors: readonly PropertyDescriptor[];
    readonly values: readonly unknown[];
    readonly lengthDescriptor: PropertyDescriptor;
}
interface FrameInspection {
    readonly valid: boolean;
    readonly frames: readonly unknown[];
    readonly listIdentities: readonly object[];
    readonly commonEventIds: readonly unknown[];
    readonly depth: number;
    readonly currentInterpreterId: string;
    readonly currentListId: string;
}
interface CapturedNestedListSpec {
    readonly path: string;
    readonly name: string;
    readonly optional: boolean;
    readonly catalogIndex: number;
}
interface AttachedNestedList {
    readonly generation: Readonly<object> | null;
    readonly facts: ForesightNestedScanListFacts | null;
    readonly path: string;
    readonly name: string;
    readonly catalogIndex: number;
    readonly resolution: 'found' | 'missing' | 'fault';
    readonly fault: unknown;
}
interface CommonEventAdmission {
    readonly id: number;
    readonly name: string;
    readonly generation: Readonly<object>;
    readonly facts: ForesightNestedScanListFacts;
}
type CommonEventLookup = {
    readonly kind: 'found';
    readonly event: CommonEventAdmission;
} | {
    readonly kind: 'missing';
    readonly id: number | null;
    readonly name: string;
    readonly reason: 'invalid-id' | 'table-unavailable' | 'entry-unavailable' | 'invalid-list';
} | {
    readonly kind: 'fault';
    readonly id: number | null;
    readonly phase: 'table' | 'entry' | 'event' | 'admission';
    readonly error: unknown;
};
const FRAME_FIELDS = Object.freeze([
    'listGeneration',
    'listIdentity',
    'listLength',
    'index',
    'endIndex',
    'expectedIndent',
    'interpreterId',
    'listId',
    'commonEventId',
    'commonEventName',
    'parentInterpreterId',
    'parentListId',
    'parentCommandIndex',
    'parentCommandCode',
    'nestedListType',
    'nestedListName',
    'nestedListPath',
    'nestedListIndex',
    'branchLabel',
    'branchIndex',
    'branchCount',
    'resumeBranchDepth',
    'resumeBranchPath',
    'pendingNestedFrames',
] as const satisfies readonly (keyof ScanFrameOptionsCandidate)[]);
const IntrinsicObject = Object;
const IntrinsicArray = Array;
const IntrinsicTypeError = TypeError;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectIs = Object.is;
const arrayIsArray = Array.isArray;
const numberFrom = Number;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const mathFloor = Math.floor;
const mathMax = Math.max;
const reflectApply = Reflect.apply;
const reflectDeleteProperty = Reflect.deleteProperty;
const stringFrom = String;
function captureMethod(target: object, key: PropertyKey): UnknownFunction {
    const descriptor = objectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value !== 'function')
        throw new IntrinsicTypeError(`[Foresight] Missing nested-list intrinsic ${String(key)}.`);
    return value as UnknownFunction;
}
const stringSlice = captureMethod(String.prototype, 'slice');
const stringTrim = captureMethod(String.prototype, 'trim');
function call<Result>(method: UnknownFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(method, receiver, args) as Result;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return call<Readonly<Value>>(objectFreeze, IntrinsicObject, [value]);
}
function isObjectReference(value: unknown): value is ObjectReference {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function append<Value>(values: Value[], value: Value): void {
    const index = values.length;
    objectDefineProperty(values, index, { value, writable: true, enumerable: true, configurable: true });
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    if (!descriptor || !('value' in descriptor) || !objectIs(descriptor.value, value)) {
        throw new IntrinsicTypeError('[Foresight] Nested-list roster publication failed.');
    }
}
function ownDescriptor(source: unknown, key: PropertyKey): PropertyDescriptor | null {
    if (!isObjectReference(source))
        return null;
    const descriptor = objectGetOwnPropertyDescriptor(source, key);
    return descriptor ?? null;
}
function ownData(source: unknown, key: PropertyKey): unknown {
    try {
        const descriptor = ownDescriptor(source, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function descriptorMatches(expected: PropertyDescriptor, observed: PropertyDescriptor | null): boolean {
    if (!observed)
        return false;
    const expectedData = 'value' in expected;
    const observedData = 'value' in observed;
    if (expectedData !== observedData)
        return false;
    if (expected.configurable !== observed.configurable ||
        expected.enumerable !== observed.enumerable ||
        expected.writable !== observed.writable ||
        !objectIs(expected.value, observed.value) ||
        !objectIs(expected.get, observed.get) ||
        !objectIs(expected.set, observed.set)) {
        return false;
    }
    return true;
}
function nullableDescriptorMatches(expected: PropertyDescriptor | null, observed: PropertyDescriptor | null): boolean {
    return expected ? descriptorMatches(expected, observed) : observed === null;
}
function primitiveNumber(value: unknown): number | null {
    if (typeof value !== 'number' &&
        typeof value !== 'string' &&
        typeof value !== 'boolean' &&
        typeof value !== 'bigint') {
        return null;
    }
    const numeric = numberFrom(value);
    return numberIsFinite(numeric) ? numeric : null;
}
function safeInteger(value: unknown): number | null {
    const numeric = primitiveNumber(value);
    return numeric !== null && numberIsSafeInteger(numeric) ? numeric : null;
}
function nullableInteger(value: unknown): number | null {
    if (value === null || value === undefined || value === '')
        return null;
    const numeric = primitiveNumber(value);
    return numeric === null ? null : mathFloor(numeric);
}
function stringValue(value: unknown): string {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
        return stringFrom(value);
    return '';
}
function nonEmptyString(value: unknown): string {
    return typeof value === 'string' ? call<string>(stringTrim, value, []) : '';
}
function captureDense(value: unknown, maximumLength: number): DenseCapture | null {
    try {
        if (!arrayIsArray(value))
            return null;
        const lengthDescriptor = objectGetOwnPropertyDescriptor(value, 'length');
        const length: unknown = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : null;
        if (!lengthDescriptor || typeof length !== 'number' || !numberIsSafeInteger(length) || length < 0)
            return null;
        if (length > maximumLength)
            return null;
        const descriptors: PropertyDescriptor[] = new IntrinsicArray<PropertyDescriptor>();
        const values: unknown[] = new IntrinsicArray<unknown>();
        for (let index = 0; index < length; index += 1) {
            const descriptor = objectGetOwnPropertyDescriptor(value, stringFrom(index));
            if (!descriptor || !('value' in descriptor))
                return null;
            append(descriptors, descriptor);
            append(values, descriptor.value);
        }
        if (!descriptorMatches(lengthDescriptor, objectGetOwnPropertyDescriptor(value, 'length') ?? null))
            return null;
        for (let index = 0; index < descriptors.length; index += 1) {
            const descriptor = descriptors[index];
            if (!descriptor ||
                !descriptorMatches(descriptor, objectGetOwnPropertyDescriptor(value, stringFrom(index)) ?? null)) {
                return null;
            }
        }
        return freezeExact({
            source: value,
            descriptors: freezeExact(descriptors),
            values: freezeExact(values),
            lengthDescriptor,
        });
    }
    catch {
        return null;
    }
}
function attestDense(capture: DenseCapture): boolean {
    try {
        if (!descriptorMatches(capture.lengthDescriptor, objectGetOwnPropertyDescriptor(capture.source, 'length') ?? null)) {
            return false;
        }
        for (let index = 0; index < capture.descriptors.length; index += 1) {
            const descriptor = capture.descriptors[index];
            if (!descriptor ||
                !descriptorMatches(descriptor, objectGetOwnPropertyDescriptor(capture.source, stringFrom(index)) ?? null)) {
                return false;
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
function sameIdentity(left: unknown, right: unknown): boolean {
    return isObjectReference(left) && left === right;
}
function normalizeFacts(value: unknown): ForesightNestedScanListFacts | null {
    const identity = ownData(value, 'identity');
    const kind = ownData(value, 'kind');
    const length = ownData(value, 'length');
    if (!isObjectReference(identity) ||
        kind !== 'event-list' ||
        typeof length !== 'number' ||
        !numberIsSafeInteger(length) ||
        length < 0) {
        return null;
    }
    return value as ForesightNestedScanListFacts;
}
function nestedListNameFromPath(path: string): string {
    let start = 0;
    for (let index = 0; index < path.length; index += 1) {
        const character = path[index];
        if (character === '.' || character === '[')
            start = index + 1;
    }
    let end = path.length;
    if (end > start && path[end - 1] === ']')
        end -= 1;
    return call<string>(stringSlice, path, [start, end]);
}
function parseNestedPath(path: string): readonly (string | number)[] | null {
    const prefix = 'command.';
    let cursor = 0;
    let matched = path.length >= prefix.length;
    for (let index = 0; matched && index < prefix.length; index += 1)
        matched = path[index] === prefix[index];
    if (matched)
        cursor = prefix.length;
    const segments: (string | number)[] = new IntrinsicArray<string | number>();
    while (cursor < path.length) {
        if (path[cursor] === '.')
            cursor += 1;
        if (cursor >= path.length)
            return null;
        if (path[cursor] === '[') {
            cursor += 1;
            const numberStart = cursor;
            while (cursor < path.length && path[cursor] !== ']') {
                const character = path.charCodeAt(cursor);
                if (character < 48 || character > 57)
                    return null;
                cursor += 1;
            }
            if (cursor === numberStart || path[cursor] !== ']')
                return null;
            const numeric = numberFrom(call<string>(stringSlice, path, [numberStart, cursor]));
            if (!numberIsSafeInteger(numeric) || numeric < 0)
                return null;
            append(segments, numeric);
            cursor += 1;
            continue;
        }
        const start = cursor;
        while (cursor < path.length && path[cursor] !== '.' && path[cursor] !== '[')
            cursor += 1;
        if (cursor === start)
            return null;
        append(segments, call<string>(stringSlice, path, [start, cursor]));
    }
    return segments.length === 0 ? null : freezeExact(segments);
}
function resolveExactPath(root: unknown, segments: readonly (string | number)[]): unknown {
    let value = root;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (segment === undefined || !isObjectReference(value))
            return undefined;
        const descriptor = ownDescriptor(value, segment);
        if (!descriptor || !('value' in descriptor))
            return undefined;
        value = descriptor.value;
    }
    return value;
}
function captureNestedSpecs(metadata: unknown): {
    readonly specs: readonly CapturedNestedListSpec[];
    readonly total: number;
} {
    const raw = ownData(metadata, 'nestedLists');
    if (!arrayIsArray(raw))
        return freezeExact({ specs: freezeExact([]), total: 0 });
    let total = 0;
    try {
        const lengthDescriptor = objectGetOwnPropertyDescriptor(raw, 'length');
        const length: unknown = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : null;
        if (typeof length !== 'number' || !numberIsSafeInteger(length) || length < 0) {
            return freezeExact({ specs: freezeExact([]), total: 0 });
        }
        total = length;
    }
    catch {
        return freezeExact({ specs: freezeExact([]), total: 0 });
    }
    const count = total > MAX_NESTED_LISTS_PER_COMMAND ? MAX_NESTED_LISTS_PER_COMMAND : total;
    const captured = captureDensePrefix(raw, count, total);
    if (!captured)
        return freezeExact({ specs: freezeExact([]), total: 0 });
    const specs: CapturedNestedListSpec[] = new IntrinsicArray<CapturedNestedListSpec>();
    for (let index = 0; index < captured.length; index += 1) {
        const candidate = captured[index];
        const path = nonEmptyString(ownData(candidate, 'path'));
        if (!path)
            continue;
        const name = nonEmptyString(ownData(candidate, 'name')) || nestedListNameFromPath(path);
        append(specs, freezeExact({ path, name, optional: ownData(candidate, 'optional') === true, catalogIndex: index }));
    }
    return freezeExact({ specs: freezeExact(specs), total });
}
function captureDensePrefix(source: unknown[], count: number, exactLength: number): readonly unknown[] | null {
    try {
        const lengthDescriptor = objectGetOwnPropertyDescriptor(source, 'length');
        if (!lengthDescriptor || !('value' in lengthDescriptor) || lengthDescriptor.value !== exactLength)
            return null;
        const descriptors: PropertyDescriptor[] = new IntrinsicArray<PropertyDescriptor>();
        const values: unknown[] = new IntrinsicArray<unknown>();
        for (let index = 0; index < count; index += 1) {
            const descriptor = objectGetOwnPropertyDescriptor(source, stringFrom(index));
            if (!descriptor || !('value' in descriptor))
                return null;
            append(descriptors, descriptor);
            append(values, descriptor.value);
        }
        if (!descriptorMatches(lengthDescriptor, objectGetOwnPropertyDescriptor(source, 'length') ?? null))
            return null;
        for (let index = 0; index < descriptors.length; index += 1) {
            const descriptor = descriptors[index];
            if (!descriptor ||
                !descriptorMatches(descriptor, objectGetOwnPropertyDescriptor(source, stringFrom(index)) ?? null)) {
                return null;
            }
        }
        return freezeExact(values);
    }
    catch {
        return null;
    }
}
export function createForesightNestedLists(globalScope: ForesightNestedListGlobalScope, dependencies: ForesightNestedListDependencies): ForesightNestedListParts {
    const listGenerations = dependencies.listGenerations;
    const movementFlow = dependencies.movementFlow;
    const admitEventListGeneration = listGenerations.admitEventListGeneration as unknown as UnknownFunction;
    const attachListGeneration = listGenerations.attachListGeneration as unknown as UnknownFunction;
    const attestScanSession = listGenerations.attestScanSession as unknown as UnknownFunction;
    const readMovementRouteCommand = movementFlow.readMovementRouteCommand as unknown as UnknownFunction;
    function ownerCall<Result>(method: UnknownFunction, args: readonly unknown[]): Result {
        return call<Result>(method, listGenerations, args);
    }
    function scanIsCurrent(session: unknown): boolean {
        try {
            return ownerCall<unknown>(attestScanSession, [session]) === true;
        }
        catch {
            return false;
        }
    }
    function attachEventGeneration(session: unknown, generation: unknown): ForesightNestedScanListFacts | null {
        if (!isObjectReference(generation))
            return null;
        try {
            return normalizeFacts(ownerCall<ForesightNestedScanListFacts | null>(attachListGeneration, [session, generation]));
        }
        catch {
            return null;
        }
    }
    function captureFrameOptions(source: unknown): Record<string, unknown> {
        const values: Record<string, unknown> = {};
        for (let index = 0; index < FRAME_FIELDS.length; index += 1) {
            const field = FRAME_FIELDS[index];
            if (field)
                objectDefineProperty(values, field, {
                    value: ownData(source, field),
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
        }
        return values;
    }
    function createScanFrame(options: unknown = {}): ForesightScanFrame {
        const captured = captureFrameOptions(options);
        const listGeneration = captured['listGeneration'];
        const listIdentity = captured['listIdentity'];
        const listLength = safeInteger(captured['listLength']);
        if (!isObjectReference(listGeneration) ||
            !isObjectReference(listIdentity) ||
            listLength === null ||
            listLength < 0) {
            throw new IntrinsicTypeError('[Foresight] A scan frame requires authenticated list-generation facts.');
        }
        const rawIndex = safeInteger(captured['index']);
        const rawEndIndex = nullableInteger(captured['endIndex']);
        const rawExpectedIndent = primitiveNumber(captured['expectedIndent']);
        const rawResumeDepth = nullableInteger(captured['resumeBranchDepth']);
        const resumeCapture = captureDense(captured['resumeBranchPath'], MAX_BRANCH_DEPTH);
        const pendingCapture = captureDense(captured['pendingNestedFrames'], DEFAULT_MAX_SCAN_COMMANDS);
        const interpreterId = stringValue(captured['interpreterId']);
        const listId = stringValue(captured['listId']) || interpreterId || 'event';
        return {
            listGeneration,
            listIdentity,
            listLength,
            index: rawIndex === null ? 0 : mathMax(0, rawIndex),
            endIndex: rawEndIndex === null ? null : mathMax(0, rawEndIndex),
            expectedIndent: rawExpectedIndent,
            interpreterId,
            listId,
            commonEventId: nullableInteger(captured['commonEventId']),
            commonEventName: nonEmptyString(captured['commonEventName']),
            parentInterpreterId: stringValue(captured['parentInterpreterId']),
            parentListId: stringValue(captured['parentListId']),
            parentCommandIndex: nullableInteger(captured['parentCommandIndex']),
            parentCommandCode: nullableInteger(captured['parentCommandCode']),
            nestedListType: nonEmptyString(captured['nestedListType']),
            nestedListName: nonEmptyString(captured['nestedListName']),
            nestedListPath: nonEmptyString(captured['nestedListPath']),
            nestedListIndex: nullableInteger(captured['nestedListIndex']),
            branchLabel: nonEmptyString(captured['branchLabel']),
            branchIndex: nullableInteger(captured['branchIndex']),
            branchCount: nullableInteger(captured['branchCount']),
            resumeBranchDepth: rawResumeDepth === null ? null : mathMax(0, rawResumeDepth),
            resumeBranchPath: resumeCapture ? freezeExact(copyValues(resumeCapture.values)) : null,
            pendingNestedFrames: pendingCapture ? freezeExact(copyValues(pendingCapture.values)) : freezeExact([]),
        };
    }
    function copyValues(values: readonly unknown[]): unknown[] {
        const copy: unknown[] = new IntrinsicArray<unknown>();
        for (let index = 0; index < values.length; index += 1)
            append(copy, values[index]);
        return copy;
    }
    function inspectFrames(frames: unknown): FrameInspection {
        const captured = captureDense(frames, MAX_NESTED_LIST_DEPTH);
        if (!captured) {
            return freezeExact({
                valid: false,
                frames: freezeExact([]),
                listIdentities: freezeExact([]),
                commonEventIds: freezeExact([]),
                depth: 0,
                currentInterpreterId: 'event',
                currentListId: 'event',
            });
        }
        const identities: object[] = new IntrinsicArray<object>();
        const commonIds: unknown[] = new IntrinsicArray<unknown>();
        let valid = true;
        let currentInterpreterId = 'event';
        let currentListId = 'event';
        for (let index = 0; index < captured.values.length; index += 1) {
            const frame = captured.values[index];
            const generation = ownData(frame, 'listGeneration');
            const identity = ownData(frame, 'listIdentity');
            const length = ownData(frame, 'listLength');
            if (!isObjectReference(generation) || !isObjectReference(identity) || safeInteger(length) === null)
                valid = false;
            else
                append(identities, identity);
            append(commonIds, ownData(frame, 'commonEventId'));
            if (index === captured.values.length - 1) {
                currentInterpreterId = stringValue(ownData(frame, 'interpreterId')) || 'event';
                currentListId = stringValue(ownData(frame, 'listId')) || currentInterpreterId;
            }
        }
        return freezeExact({
            valid: valid && attestDense(captured),
            frames: captured.values,
            listIdentities: freezeExact(identities),
            commonEventIds: freezeExact(commonIds),
            depth: captured.values.length,
            currentInterpreterId,
            currentListId,
        });
    }
    function containsIdentity(inspection: FrameInspection, identity: unknown): boolean {
        for (let index = 0; index < inspection.listIdentities.length; index += 1) {
            if (sameIdentity(inspection.listIdentities[index], identity))
                return true;
        }
        return false;
    }
    function containsCommonEvent(inspection: FrameInspection, id: number): boolean {
        for (let index = 0; index < inspection.commonEventIds.length; index += 1) {
            if (primitiveNumber(inspection.commonEventIds[index]) === id)
                return true;
        }
        return false;
    }
    function cloneFrameWithPending(frame: unknown, pending: readonly unknown[]): ForesightScanFrame {
        const fields = captureFrameOptions(frame);
        fields['pendingNestedFrames'] = pending;
        return createScanFrame(fields);
    }
    function commitFrameSequence(frames: unknown, before: DenseCapture, after: readonly unknown[]): void {
        if (!arrayIsArray(frames) || frames !== before.source || !attestDense(before)) {
            throw new IntrinsicTypeError('[Foresight] Frame stack changed during nested scheduling.');
        }
        const oldLength = before.values.length;
        for (let index = 0; index < after.length; index += 1) {
            objectDefineProperty(frames, stringFrom(index), {
                value: after[index],
                writable: true,
                enumerable: true,
                configurable: true,
            });
        }
        for (let index = after.length; index < oldLength; index += 1)
            reflectDeleteProperty(frames, stringFrom(index));
        objectDefineProperty(frames, 'length', { value: after.length });
        const published = captureDense(frames, DEFAULT_MAX_SCAN_COMMANDS);
        if (published?.values.length !== after.length) {
            throw new IntrinsicTypeError('[Foresight] Frame stack publication failed.');
        }
        for (let index = 0; index < after.length; index += 1) {
            if (!objectIs(published.values[index], after[index])) {
                throw new IntrinsicTypeError('[Foresight] Frame stack publication changed a frame identity.');
            }
        }
    }
    function snapshotPending(frame: unknown): readonly unknown[] {
        const captured = captureDense(ownData(frame, 'pendingNestedFrames'), DEFAULT_MAX_SCAN_COMMANDS);
        return captured ? freezeExact(copyValues(captured.values)) : freezeExact([]);
    }
    function pushNestedFrames(frames: unknown, nestedFrames: unknown, parentFrame: unknown): boolean {
        const before = captureDense(frames, DEFAULT_MAX_SCAN_COMMANDS);
        if (!before || before.values.length === 0 || before.values[before.values.length - 1] !== parentFrame)
            return false;
        const requested = arrayIsArray(nestedFrames)
            ? (captureDense(nestedFrames, MAX_NESTED_LISTS_PER_COMMAND)?.values ?? null)
            : isObjectReference(nestedFrames)
                ? freezeExact([nestedFrames])
                : null;
        if (!requested || requested.length === 0)
            return false;
        const pending: unknown[] = new IntrinsicArray<unknown>();
        for (let index = 1; index < requested.length; index += 1)
            append(pending, requested[index]);
        const existing = snapshotPending(parentFrame);
        for (let index = 0; index < existing.length; index += 1)
            append(pending, existing[index]);
        const after: unknown[] = new IntrinsicArray<unknown>();
        for (let index = 0; index < before.values.length - 1; index += 1)
            append(after, before.values[index]);
        append(after, cloneFrameWithPending(parentFrame, freezeExact(pending)));
        append(after, requested[0]);
        commitFrameSequence(frames, before, after);
        return true;
    }
    function finishCurrentFrame(frames: unknown): boolean {
        const before = captureDense(frames, DEFAULT_MAX_SCAN_COMMANDS);
        if (!before || before.values.length <= 1)
            return false;
        const parent = before.values[before.values.length - 2];
        const pending = snapshotPending(parent);
        const after: unknown[] = new IntrinsicArray<unknown>();
        for (let index = 0; index < before.values.length - 2; index += 1)
            append(after, before.values[index]);
        if (pending.length > 0) {
            const remaining: unknown[] = new IntrinsicArray<unknown>();
            for (let index = 1; index < pending.length; index += 1)
                append(remaining, pending[index]);
            append(after, cloneFrameWithPending(parent, freezeExact(remaining)));
            append(after, pending[0]);
        }
        else
            append(after, parent);
        commitFrameSequence(frames, before, after);
        return true;
    }
    function commonEventInfo(id: number | null, name: string, depth: number, length: number): Readonly<PropertyBag> {
        return freezeExact({ type: 'common-event', id, name, depth, length });
    }
    function lookupCommonEvent(session: unknown, idValue: unknown): CommonEventLookup {
        const numeric = primitiveNumber(idValue);
        const id = numeric !== null && numberIsSafeInteger(numeric) && numeric > 0 ? numeric : null;
        if (id === null)
            return freezeExact({ kind: 'missing', id: null, name: '', reason: 'invalid-id' as const });
        let tableDescriptor: PropertyDescriptor | null;
        let table: unknown;
        try {
            tableDescriptor = ownDescriptor(globalScope, '$dataCommonEvents');
            table = tableDescriptor && 'value' in tableDescriptor ? tableDescriptor.value : undefined;
        }
        catch (error) {
            return freezeExact({ kind: 'fault', id, phase: 'table' as const, error });
        }
        if (!tableDescriptor || !('value' in tableDescriptor) || !isObjectReference(table)) {
            return freezeExact({ kind: 'missing', id, name: '', reason: 'table-unavailable' as const });
        }
        let entryDescriptor: PropertyDescriptor | null;
        let event: unknown;
        try {
            entryDescriptor = ownDescriptor(table, stringFrom(id));
            event = entryDescriptor && 'value' in entryDescriptor ? entryDescriptor.value : undefined;
        }
        catch (error) {
            return freezeExact({ kind: 'fault', id, phase: 'entry' as const, error });
        }
        if (!entryDescriptor || !('value' in entryDescriptor) || !isObjectReference(event)) {
            return freezeExact({ kind: 'missing', id, name: '', reason: 'entry-unavailable' as const });
        }
        let nameDescriptor: PropertyDescriptor | null;
        let listDescriptor: PropertyDescriptor | null;
        let name = '';
        let source: unknown;
        try {
            nameDescriptor = ownDescriptor(event, 'name');
            listDescriptor = ownDescriptor(event, 'list');
            name = nonEmptyString(nameDescriptor && 'value' in nameDescriptor ? nameDescriptor.value : undefined);
            source = listDescriptor && 'value' in listDescriptor ? listDescriptor.value : undefined;
        }
        catch (error) {
            return freezeExact({ kind: 'fault', id, phase: 'event' as const, error });
        }
        if (!listDescriptor || !('value' in listDescriptor) || !arrayIsArray(source)) {
            return freezeExact({ kind: 'missing', id, name, reason: 'invalid-list' as const });
        }
        let admission: CommonEventAdmission | null = null;
        let releaseLease: (() => boolean) | null = null;
        let sinkOpen = true;
        const adopter: AdoptGeneration = (generation, facts, release, attest): boolean => {
            if (!sinkOpen ||
                admission ||
                releaseLease ||
                typeof release !== 'function' ||
                typeof attest !== 'function') {
                return false;
            }
            const normalized = normalizeFacts(facts);
            if (!normalized)
                return false;
            let attached: ForesightNestedScanListFacts | null = null;
            try {
                attached = attachEventGeneration(session, generation);
            }
            catch {
                attached = null;
            }
            if (!attached ||
                !sameIdentity(attached.identity, normalized.identity) ||
                attached.length !== normalized.length ||
                call<unknown>(attest, undefined, []) !== true) {
                return false;
            }
            admission = freezeExact({ id, name, generation, facts: attached });
            releaseLease = release;
            return sinkOpen;
        };
        let accepted = false;
        let admissionError: unknown = null;
        try {
            try {
                accepted = ownerCall<unknown>(admitEventListGeneration, [source, adopter]) === true;
            }
            catch (error) {
                admissionError = error;
            }
            finally {
                sinkOpen = false;
            }
        }
        catch (error) {
            admissionError = error;
        }
        finally {
            sinkOpen = false;
            if (releaseLease) {
                try {
                    call<unknown>(releaseLease, undefined, []);
                }
                catch {
                }
            }
        }
        if (admissionError !== null) {
            return freezeExact({ kind: 'fault', id, phase: 'admission' as const, error: admissionError });
        }
        if (!accepted || !admission || !releaseLease) {
            return freezeExact({ kind: 'missing', id, name, reason: 'invalid-list' as const });
        }
        let current = false;
        try {
            current =
                descriptorMatches(tableDescriptor, ownDescriptor(globalScope, '$dataCommonEvents')) &&
                    descriptorMatches(entryDescriptor, ownDescriptor(table, stringFrom(id))) &&
                    nullableDescriptorMatches(nameDescriptor, ownDescriptor(event, 'name')) &&
                    descriptorMatches(listDescriptor, ownDescriptor(event, 'list')) &&
                    scanIsCurrent(session);
        }
        catch (error) {
            return freezeExact({ kind: 'fault', id, phase: 'admission' as const, error });
        }
        return current
            ? freezeExact({ kind: 'found', event: admission })
            : freezeExact({ kind: 'missing', id, name, reason: 'invalid-list' as const });
    }
    function resolveEmbedded(session: unknown, command: unknown, specs: readonly CapturedNestedListSpec[]): readonly AttachedNestedList[] {
        const resolved: AttachedNestedList[] = new IntrinsicArray<AttachedNestedList>();
        for (let index = 0; index < specs.length; index += 1) {
            const spec = specs[index];
            if (!spec)
                continue;
            try {
                const segments = parseNestedPath(spec.path);
                const generation = segments ? resolveExactPath(command, segments) : undefined;
                const facts = attachEventGeneration(session, generation);
                append(resolved, freezeExact({
                    generation: facts && isObjectReference(generation) ? generation : null,
                    facts,
                    path: spec.path,
                    name: spec.name,
                    catalogIndex: spec.catalogIndex,
                    resolution: facts ? ('found' as const) : ('missing' as const),
                    fault: null,
                }));
            }
            catch (error) {
                append(resolved, freezeExact({
                    generation: null,
                    facts: null,
                    path: spec.path,
                    name: spec.name,
                    catalogIndex: spec.catalogIndex,
                    resolution: 'fault' as const,
                    fault: error,
                }));
            }
        }
        return freezeExact(resolved);
    }
    function embeddedInfo(entry: AttachedNestedList, inspection: FrameInspection, parentIndex: number, parentCode: number): Readonly<PropertyBag> {
        const base = {
            type: 'embedded-event-list',
            id: null,
            name: entry.name,
            path: entry.path,
            index: entry.catalogIndex,
            parentCode,
            depth: inspection.depth,
            length: entry.facts?.length ?? 0,
            parentCommandIndex: parentIndex,
        };
        return entry.resolution === 'fault'
            ? freezeExact({ ...base, resolution: 'fault' as const, fault: entry.fault })
            : freezeExact(base);
    }
    function embeddedFrame(entry: AttachedNestedList, inspection: FrameInspection, parentIndex: number, parentCode: number): ForesightScanFrame {
        if (!entry.generation || entry.facts?.length == null) {
            throw new IntrinsicTypeError('[Foresight] Embedded frame requires attached event-list facts.');
        }
        const suffix = `nested:${stringFrom(parentIndex)}:${stringFrom(entry.catalogIndex)}`;
        return createScanFrame({
            listGeneration: entry.generation,
            listIdentity: entry.facts.identity,
            listLength: entry.facts.length,
            index: 0,
            expectedIndent: null,
            interpreterId: `${inspection.currentInterpreterId}:${suffix}`,
            listId: `${inspection.currentListId}:${suffix}`,
            parentCommandIndex: parentIndex,
            parentCommandCode: parentCode,
            nestedListType: 'embedded-event-list',
            nestedListName: entry.name,
            nestedListPath: entry.path,
            nestedListIndex: entry.catalogIndex,
        });
    }
    function readEmbedded(session: unknown, current: ForesightNestedScanCommandFacts, frames: unknown): unknown {
        const metadata = ownData(current, 'metadata');
        const command = ownData(current, 'command');
        const parentIndex = safeInteger(ownData(current, 'index'));
        const parentCode = primitiveNumber(ownData(metadata, 'code'));
        if (parentIndex === null || parentIndex < 0 || parentCode === null)
            return null;
        const captured = captureNestedSpecs(metadata);
        if (captured.total === 0)
            return null;
        const inspection = inspectFrames(frames);
        if (!inspection.valid)
            return freezeExact({ transparent: false, stopReason: 'nested-list-unavailable', metadata });
        const resolved = resolveEmbedded(session, command, captured.specs);
        const infos: Readonly<PropertyBag>[] = new IntrinsicArray<Readonly<PropertyBag>>();
        for (let index = 0; index < resolved.length; index += 1) {
            const entry = resolved[index];
            if (entry)
                append(infos, embeddedInfo(entry, inspection, parentIndex, parentCode));
        }
        if (captured.total > MAX_NESTED_LISTS_PER_COMMAND) {
            return freezeExact({
                transparent: false,
                stopReason: 'nested-list-limit',
                metadata,
                nestedLists: freezeExact(infos),
            });
        }
        for (let index = 0; index < resolved.length; index += 1) {
            const entry = resolved[index];
            const spec = captured.specs[index];
            if (!entry || !spec || entry.resolution === 'found' || (entry.resolution === 'missing' && spec.optional))
                continue;
            return freezeExact({
                transparent: false,
                stopReason: entry.resolution === 'fault' ? 'nested-list-resolution-fault' : 'nested-list-unavailable',
                metadata,
                nestedList: infos[index] ?? null,
                nestedLists: freezeExact(infos),
            });
        }
        const available: AttachedNestedList[] = new IntrinsicArray<AttachedNestedList>();
        const availableInfos: Readonly<PropertyBag>[] = new IntrinsicArray<Readonly<PropertyBag>>();
        for (let index = 0; index < resolved.length; index += 1) {
            const entry = resolved[index];
            if (entry?.resolution === 'found') {
                append(available, entry);
                append(availableInfos, embeddedInfo(entry, inspection, parentIndex, parentCode));
            }
        }
        if (available.length === 0)
            return null;
        if (inspection.depth >= MAX_NESTED_LIST_DEPTH) {
            return freezeExact({
                transparent: false,
                stopReason: 'nested-list-depth-limit',
                metadata,
                nestedLists: freezeExact(availableInfos),
            });
        }
        for (let index = 0; index < available.length; index += 1) {
            const entry = available[index];
            if (entry?.facts && containsIdentity(inspection, entry.facts.identity)) {
                return freezeExact({
                    transparent: false,
                    stopReason: 'nested-list-cycle',
                    metadata,
                    nestedList: availableInfos[index] ?? null,
                    nestedLists: freezeExact(availableInfos),
                });
            }
        }
        if (!scanIsCurrent(session))
            return freezeExact({ transparent: false, stopReason: 'nested-list-unavailable', metadata });
        const nestedFrames: ForesightScanFrame[] = new IntrinsicArray<ForesightScanFrame>();
        for (let index = 0; index < available.length; index += 1) {
            const entry = available[index];
            if (entry)
                append(nestedFrames, embeddedFrame(entry, inspection, parentIndex, parentCode));
        }
        return freezeExact({
            transparent: true,
            nextIndex: parentIndex + 1,
            kind: 'nested-list',
            metadata,
            nestedList: availableInfos[0] ?? null,
            nestedLists: freezeExact(availableInfos),
            frames: freezeExact(nestedFrames),
        });
    }
    function readNestedListCommand(session: unknown, generation: unknown, current: ForesightNestedScanCommandFacts, frames: unknown): unknown {
        const metadata = ownData(current, 'metadata');
        const parentCode = primitiveNumber(ownData(metadata, 'code'));
        const parentIndex = safeInteger(ownData(current, 'index'));
        if (!isObjectReference(session) || !isObjectReference(generation) || parentIndex === null || parentIndex < 0) {
            return freezeExact({ transparent: false, stopReason: 'nested-list-unavailable', metadata });
        }
        if (parentCode !== 117) {
            const embedded = readEmbedded(session, current, frames);
            return embedded ?? freezeExact({ transparent: false, stopReason: 'nested-list-unavailable', metadata });
        }
        const command = ownData(current, 'command');
        const parameters = ownData(command, 'parameters');
        const id = ownData(parameters, '0');
        const inspection = inspectFrames(frames);
        if (!inspection.valid)
            return freezeExact({ transparent: false, stopReason: 'nested-list-unavailable', metadata });
        const lookup = lookupCommonEvent(session, id);
        if (lookup.kind === 'fault') {
            return freezeExact({
                transparent: false,
                stopReason: 'common-event-lookup-fault',
                nestedList: commonEventInfo(lookup.id, '', inspection.depth, 0),
                lookupFault: freezeExact({ phase: lookup.phase, error: lookup.error }),
                metadata,
            });
        }
        if (lookup.kind === 'missing') {
            return freezeExact({
                transparent: false,
                stopReason: lookup.reason === 'invalid-id' ? 'common-event-missing-id' : 'common-event-missing-list',
                nestedList: commonEventInfo(lookup.id, lookup.name, inspection.depth, 0),
                metadata,
            });
        }
        const event = lookup.event;
        const nestedList = commonEventInfo(event.id, event.name, inspection.depth, event.facts.length ?? 0);
        if (containsCommonEvent(inspection, event.id) || containsIdentity(inspection, event.facts.identity)) {
            return freezeExact({ transparent: false, stopReason: 'common-event-cycle', nestedList, metadata });
        }
        if (inspection.depth >= MAX_NESTED_LIST_DEPTH) {
            return freezeExact({ transparent: false, stopReason: 'common-event-depth-limit', nestedList, metadata });
        }
        if (event.facts.length === null || !scanIsCurrent(session)) {
            return freezeExact({ transparent: false, stopReason: 'common-event-missing-list', nestedList, metadata });
        }
        const frame = createScanFrame({
            listGeneration: event.generation,
            listIdentity: event.facts.identity,
            listLength: event.facts.length,
            index: 0,
            expectedIndent: 0,
            interpreterId: `${inspection.currentInterpreterId}:common:${stringFrom(event.id)}`,
            listId: `common:${stringFrom(event.id)}`,
            commonEventId: event.id,
            commonEventName: event.name,
            parentCommandIndex: parentIndex,
            parentCommandCode: 117,
        });
        return freezeExact({
            transparent: true,
            nextIndex: parentIndex + 1,
            kind: 'nested-list',
            nestedList,
            nestedLists: freezeExact([nestedList]),
            frame,
            metadata,
        });
    }
    function captureFrameContext(frame: unknown): PropertyBag {
        return freezeExact({
            listId: stringValue(ownData(frame, 'listId')),
            interpreterId: stringValue(ownData(frame, 'interpreterId')),
            commonEventId: nullableInteger(ownData(frame, 'commonEventId')),
            commonEventName: nonEmptyString(ownData(frame, 'commonEventName')),
            parentInterpreterId: stringValue(ownData(frame, 'parentInterpreterId')),
            parentListId: stringValue(ownData(frame, 'parentListId')),
            parentCommandIndex: nullableInteger(ownData(frame, 'parentCommandIndex')),
            parentCommandCode: nullableInteger(ownData(frame, 'parentCommandCode')),
            nestedListType: nonEmptyString(ownData(frame, 'nestedListType')),
            nestedListName: nonEmptyString(ownData(frame, 'nestedListName')),
            nestedListPath: nonEmptyString(ownData(frame, 'nestedListPath')),
            nestedListIndex: nullableInteger(ownData(frame, 'nestedListIndex')),
            branchLabel: nonEmptyString(ownData(frame, 'branchLabel')),
            branchIndex: nullableInteger(ownData(frame, 'branchIndex')),
            branchCount: nullableInteger(ownData(frame, 'branchCount')),
        });
    }
    function createFrameListContext(frame: unknown): PropertyBag {
        return captureFrameContext(frame);
    }
    function attachFrameContextToBlock(block: unknown, frame: unknown): unknown {
        if (!isObjectReference(block) || !isObjectReference(frame))
            return block;
        const values = captureFrameContext(frame);
        const target: PropertyBag = {
            complete: ownData(block, 'complete'),
            startIndex: ownData(block, 'startIndex'),
            nextIndex: ownData(block, 'nextIndex'),
            indent: ownData(block, 'indent'),
            rawText: ownData(block, 'rawText'),
            interpreterId: ownData(block, 'interpreterId'),
            rejected: ownData(block, 'rejected'),
            stopReason: ownData(block, 'stopReason'),
        };
        const fields = [
            'listId',
            'commonEventId',
            'commonEventName',
            'parentInterpreterId',
            'parentListId',
            'parentCommandIndex',
            'parentCommandCode',
            'nestedListType',
            'nestedListName',
            'nestedListPath',
            'nestedListIndex',
            'branchLabel',
            'branchIndex',
            'branchCount',
        ] as const;
        for (let index = 0; index < fields.length; index += 1) {
            const field = fields[index];
            if (!field)
                continue;
            objectDefineProperty(target, field, {
                value: values[field],
                writable: true,
                enumerable: true,
                configurable: true,
            });
        }
        return target;
    }
    function readTransparentCommand(session: unknown, generation: unknown, current: ForesightNestedScanCommandFacts, expectedIndent: unknown, frames: unknown): unknown {
        const metadata = ownData(current, 'metadata');
        const behavior = ownData(metadata, 'scanBehavior');
        const index = safeInteger(ownData(current, 'index'));
        if (index === null || index < 0)
            return freezeExact({ transparent: false, stopReason: 'barrier-command', metadata });
        if (behavior === 'movement-route') {
            try {
                return call<unknown>(readMovementRouteCommand, movementFlow, [
                    session,
                    generation,
                    current,
                    expectedIndent,
                ]);
            }
            catch {
                return freezeExact({ transparent: false, stopReason: 'movement-route-unavailable', metadata });
            }
        }
        if (behavior === 'advance') {
            const embedded = readEmbedded(session, current, frames);
            return embedded ?? freezeExact({ transparent: true, nextIndex: index + 1, kind: 'command', metadata });
        }
        return freezeExact({
            transparent: false,
            stopReason: behavior === 'message-line' || behavior === 'movement-route-line'
                ? 'orphan-continuation'
                : 'barrier-command',
            metadata,
        });
    }
    return freezeExact({
        readNestedListCommand,
        createScanFrame,
        createFrameListContext,
        attachFrameContextToBlock,
        finishCurrentFrame,
        pushNestedFrames,
        readTransparentCommand,
    });
}
