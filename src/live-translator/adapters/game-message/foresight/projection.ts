export type ForesightProjectionValueKind = 'scalar' | 'string' | 'number' | 'boolean' | 'event-list' | 'movement-list' | 'movement-command';
export interface ForesightProjectionPathSpec {
    readonly path: string;
    readonly valueKind: ForesightProjectionValueKind;
    readonly required: boolean;
}
export interface ForesightProjectionLimits {
    readonly maxDepth: number;
    readonly maxNodes: number;
    readonly maxFields: number;
    readonly maxArrayLength: number;
    readonly maxStringUnits: number;
    readonly maxPathCount: number;
    readonly maxPathLength: number;
}
export type ForesightProjectionFailureReason = 'accessor' | 'array-limit' | 'cycle' | 'depth-limit' | 'descriptor-drift' | 'field-limit' | 'missing-required' | 'node-limit' | 'path-limit' | 'plan-invalid' | 'string-limit' | 'type';
export type ForesightProjectionOutcome = {
    readonly accepted: true;
    readonly value: unknown;
    readonly receipt: ForesightProjectionReceipt;
} | {
    readonly accepted: false;
    readonly reason: ForesightProjectionFailureReason;
    readonly stopReason: string;
};
export type ForesightProjectionReceipt = Readonly<object>;
export interface ForesightProjectionPlanToken {
    readonly pathCount: number;
    readonly maximumPathDepth: number;
    readonly valueKinds: readonly ForesightProjectionValueKind[];
}
export type ForesightCollectionKind = 'event-list' | 'movement-list' | 'movement-command';
export type ForesightCollectionGeneration = Readonly<object>;
export type ForesightCollectionIdentity = Readonly<object>;
export interface ForesightCollectionGenerationFacts {
    readonly identity: ForesightCollectionIdentity;
    readonly kind: ForesightCollectionKind;
    readonly length: number | null;
}
export type ForesightCollectionWindowReceipt = Readonly<object>;
export type ForesightCollectionWindowOutcome = {
    readonly accepted: true;
    readonly kind: ForesightCollectionKind;
    readonly startIndex: number;
    readonly nextIndex: number;
    readonly complete: boolean;
    readonly values: readonly unknown[];
    readonly receipt: ForesightCollectionWindowReceipt;
} | {
    readonly accepted: false;
    readonly reason: ForesightProjectionFailureReason;
    readonly stopReason: string;
};
export type ForesightCollectionAdmissionOutcome = {
    readonly accepted: true;
    readonly token: ForesightCollectionGeneration;
} | {
    readonly accepted: false;
    readonly reason: ForesightProjectionFailureReason;
    readonly stopReason: string;
};
export interface ForesightProjectionAuthority {
    readonly compile: (specs: readonly ForesightProjectionPathSpec[]) => ForesightProjectionPlanToken | null;
    readonly project: (source: unknown, token: unknown) => ForesightProjectionOutcome;
    readonly attestProjection: (receipt: unknown) => boolean;
    readonly admitCollection: (source: unknown, kind: ForesightCollectionKind) => ForesightCollectionAdmissionOutcome;
    readonly readCollectionGeneration: (token: unknown) => ForesightCollectionGenerationFacts | null;
    readonly attestCollectionGeneration: (token: unknown) => boolean;
    readonly retainCollectionGeneration: (token: unknown) => ForesightCollectionAdmissionOutcome;
    readonly retireCollectionGeneration: (token: unknown) => boolean;
    readonly attestCollection: (token: unknown, source: unknown) => boolean;
    readonly captureCollectionWindow: (token: unknown, startIndex: unknown, maximumCount: unknown) => ForesightCollectionWindowOutcome;
    readonly attestCollectionWindow: (receipt: unknown) => boolean;
    readonly retireCollectionWindow: (receipt: unknown) => boolean;
    readonly retireProjection: (receipt: unknown) => boolean;
}
const IntrinsicObject = Object;
const IntrinsicArray = Array;
const IntrinsicMap = Map;
const IntrinsicSet = Set;
const IntrinsicWeakMap = WeakMap;
const IntrinsicWeakSet = WeakSet;
const IntrinsicTypeError = TypeError;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectIs = Object.is;
const arrayIsArray = Array.isArray;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const mathMax = Math.max;
const mathMin = Math.min;
const stringFrom = String;
const reflectApply = Reflect.apply;
type UnknownFunction = (...args: unknown[]) => unknown;
function captureMethod(target: object, key: PropertyKey): UnknownFunction {
    const descriptor = objectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? (descriptor as {
        readonly value: unknown;
    }).value : undefined;
    if (typeof value !== 'function')
        throw new IntrinsicTypeError(`[Foresight] Missing intrinsic ${stringFrom(key)}.`);
    return value as UnknownFunction;
}
const mapGet = captureMethod(IntrinsicMap.prototype, 'get');
const mapHas = captureMethod(IntrinsicMap.prototype, 'has');
const mapSet = captureMethod(IntrinsicMap.prototype, 'set');
const mapSizeDescriptor = objectGetOwnPropertyDescriptor(IntrinsicMap.prototype, 'size');
const mapSizeGetterCandidate: unknown = mapSizeDescriptor
    ? (mapSizeDescriptor as {
        readonly get?: unknown;
    }).get
    : undefined;
if (typeof mapSizeGetterCandidate !== 'function')
    throw new IntrinsicTypeError('[Foresight] Missing intrinsic Map.size.');
const mapSizeGetter = mapSizeGetterCandidate as UnknownFunction;
const setAdd = captureMethod(IntrinsicSet.prototype, 'add');
const setHas = captureMethod(IntrinsicSet.prototype, 'has');
const weakMapGet = captureMethod(IntrinsicWeakMap.prototype, 'get');
const weakMapSet = captureMethod(IntrinsicWeakMap.prototype, 'set');
const weakMapDelete = captureMethod(IntrinsicWeakMap.prototype, 'delete');
const weakSetAdd = captureMethod(IntrinsicWeakSet.prototype, 'add');
const weakSetDelete = captureMethod(IntrinsicWeakSet.prototype, 'delete');
const weakSetHas = captureMethod(IntrinsicWeakSet.prototype, 'has');
const stringStartsWith = captureMethod(stringFrom.prototype, 'startsWith');
const stringSlice = captureMethod(stringFrom.prototype, 'slice');
const stringIndexOf = captureMethod(stringFrom.prototype, 'indexOf');
const stringCharCodeAt = captureMethod(stringFrom.prototype, 'charCodeAt');
function call<Result>(method: UnknownFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(method, receiver, args) as Result;
}
function push<Value>(values: Value[], value: Value): void {
    const index = values.length;
    if (!numberIsSafeInteger(index) || index < 0) {
        throw new IntrinsicTypeError('[Foresight] Invalid private projection roster length.');
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
        throw new IntrinsicTypeError('[Foresight] Private projection roster publication failed.');
    }
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return call<Readonly<Value>>(objectFreeze, IntrinsicObject, [value]);
}
function defineOwnData(target: object, key: PropertyKey, value: unknown): void {
    call(objectDefineProperty as unknown as UnknownFunction, IntrinsicObject, [
        target,
        key,
        {
            value,
            writable: false,
            enumerable: true,
            configurable: false,
        },
    ]);
}
export const FORESIGHT_PROJECTION_LIMITS: ForesightProjectionLimits = freezeExact({
    maxDepth: 16,
    maxNodes: 512,
    maxFields: 256,
    maxArrayLength: 256,
    maxStringUnits: 16 * 1024,
    maxPathCount: 64,
    maxPathLength: 256,
});
interface MutableTrieEdge {
    readonly key: string | number;
    readonly child: MutableTrieNode;
}
interface MutableTrieNode {
    readonly edges: Map<string, MutableTrieEdge>;
    terminal: ForesightProjectionValueKind | null;
    required: boolean;
}
interface FrozenTrieEdge {
    readonly key: string | number;
    readonly child: FrozenTrieNode;
}
interface FrozenTrieNode {
    readonly edges: readonly FrozenTrieEdge[];
    readonly terminal: ForesightProjectionValueKind | null;
    readonly required: boolean;
    readonly arrayNode: boolean;
    readonly signature: string;
}
interface ProjectionPlanState {
    readonly root: FrozenTrieNode;
}
type CollectionPhase = 'capturing' | 'active' | 'attesting' | 'windowing' | 'retired';
interface CollectionSourceOwner {
    readonly identity: ForesightCollectionIdentity;
    eventList: CollectionState | null;
    movementList: CollectionState | null;
    movementCommand: CollectionState | null;
}
interface CollectionState {
    readonly source: object;
    readonly owner: CollectionSourceOwner;
    readonly identity: ForesightCollectionIdentity;
    readonly kind: ForesightCollectionKind;
    leaseHead: CollectionLeaseNode | null;
    windowHead: CollectionWindowReceiptState | null;
    liveLeases: number;
    liveWindows: number;
    lengthDescriptor: PropertyDescriptor | null;
    prototype: object | null;
    facts: ForesightCollectionGenerationFacts | null;
    phase: CollectionPhase;
}
interface CollectionLeaseNode {
    readonly lease: ForesightCollectionGeneration;
    readonly collection: CollectionState;
    previous: CollectionLeaseNode | null;
    next: CollectionLeaseNode | null;
}
interface ProjectionReceiptState {
    readonly frames: readonly ProjectionFrame[];
    readonly collectionLeases: readonly ForesightCollectionGeneration[];
    phase: 'active' | 'attesting' | 'retired';
}
interface CollectionWindowReceiptState {
    readonly receipt: ForesightCollectionWindowReceipt;
    readonly collection: CollectionState;
    readonly generation: ForesightCollectionGeneration;
    readonly startIndex: number;
    readonly nextIndex: number;
    readonly complete: boolean;
    readonly checks: readonly DescriptorCheck[];
    previous: CollectionWindowReceiptState | null;
    next: CollectionWindowReceiptState | null;
    phase: 'active' | 'attesting' | 'retired';
}
interface DescriptorCheck {
    readonly key: string | number;
    readonly descriptor: PropertyDescriptor;
}
interface ProjectionBudget {
    nodes: number;
    fields: number;
    stringUnits: number;
}
interface ProjectionFrame {
    readonly source: object;
    readonly target: Record<PropertyKey, unknown> | unknown[];
    readonly checks: readonly DescriptorCheck[];
    readonly prototype: object | null;
    readonly lengthDescriptor: PropertyDescriptor | null;
}
type AssignValue = (value: unknown) => void;
type ProjectionTask = {
    readonly kind: 'enter';
    readonly source: unknown;
    readonly node: FrozenTrieNode;
    readonly assign: AssignValue;
    readonly depth: number;
} | {
    readonly kind: 'exit';
    readonly frame: ProjectionFrame;
};
function createNullRecord(): Record<PropertyKey, unknown> {
    return call<Record<PropertyKey, unknown>>(objectCreate as unknown as UnknownFunction, IntrinsicObject, [null]);
}
function frozenRecord(fields: readonly (readonly [
    string,
    unknown
])[]): Readonly<Record<string, unknown>> {
    const target = createNullRecord();
    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        if (field)
            defineOwnData(target, field[0], field[1]);
    }
    return freezeExact(target);
}
function failure(reason: ForesightProjectionFailureReason): ForesightProjectionOutcome {
    return frozenRecord([
        ['accepted', false],
        ['reason', reason],
        ['stopReason', `foresight-projection-${reason}`],
    ]) as unknown as ForesightProjectionOutcome;
}
function collectionFailure(reason: ForesightProjectionFailureReason): ForesightCollectionWindowOutcome {
    return failure(reason) as ForesightCollectionWindowOutcome;
}
function safeOwnDescriptor(source: object, key: PropertyKey): PropertyDescriptor | null | 'fault' {
    try {
        return objectGetOwnPropertyDescriptor(source, key) ?? null;
    }
    catch {
        return 'fault';
    }
}
function safePrototype(source: object): object | null | 'fault' {
    try {
        return objectGetPrototypeOf(source) as object | null;
    }
    catch {
        return 'fault';
    }
}
function descriptorValue(descriptor: PropertyDescriptor): unknown {
    return (descriptor as {
        readonly value: unknown;
    }).value;
}
function descriptorMatches(left: PropertyDescriptor, right: PropertyDescriptor | null | 'fault'): boolean {
    if (!right || right === 'fault')
        return false;
    const leftData = 'value' in left;
    const rightData = 'value' in right;
    if (leftData !== rightData || left.configurable !== right.configurable || left.enumerable !== right.enumerable)
        return false;
    return leftData && rightData
        ? left.writable === right.writable && objectIs(left.value, right.value)
        : left.get === right.get && left.set === right.set;
}
function ownDataDescriptor(source: object, key: string | number): PropertyDescriptor | null | 'accessor' | 'fault' {
    const descriptor = safeOwnDescriptor(source, key);
    if (!descriptor || descriptor === 'fault')
        return descriptor;
    return 'value' in descriptor ? descriptor : 'accessor';
}
function isIdentifierStart(code: number): boolean {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
}
function isIdentifierContinue(code: number): boolean {
    return isIdentifierStart(code) || (code >= 48 && code <= 57);
}
function edgeIdentity(key: string | number): string {
    return typeof key === 'number' ? `#${stringFrom(key)}` : `.${key}`;
}
function parseAuthoredPath(path: string, limits: ForesightProjectionLimits): readonly (string | number)[] | null {
    const source = call<boolean>(stringStartsWith, path, ['command.']) ? call<string>(stringSlice, path, [8]) : path;
    if (!source || source.length > limits.maxPathLength)
        return null;
    const segments: (string | number)[] = [];
    let cursor = 0;
    while (cursor < source.length) {
        if (cursor > 0 && call<number>(stringCharCodeAt, source, [cursor]) === 46)
            cursor += 1;
        if (cursor >= source.length)
            return null;
        const currentCode = call<number>(stringCharCodeAt, source, [cursor]);
        if (currentCode === 91) {
            const end = call<number>(stringIndexOf, source, [']', cursor + 1]);
            if (end < 0)
                return null;
            const indexText = call<string>(stringSlice, source, [cursor + 1, end]);
            if (!indexText)
                return null;
            let numericIndex = 0;
            for (let index = 0; index < indexText.length; index += 1) {
                const digit = call<number>(stringCharCodeAt, indexText, [index]);
                if (digit < 48 || digit > 57)
                    return null;
                numericIndex = numericIndex * 10 + digit - 48;
            }
            if (!numberIsSafeInteger(numericIndex) || numericIndex >= limits.maxArrayLength)
                return null;
            push(segments, numericIndex);
            cursor = end + 1;
        }
        else {
            if (!isIdentifierStart(currentCode))
                return null;
            let end = cursor + 1;
            while (end < source.length && isIdentifierContinue(call<number>(stringCharCodeAt, source, [end])))
                end += 1;
            push(segments, call<string>(stringSlice, source, [cursor, end]));
            cursor = end;
        }
        if (segments.length > limits.maxDepth)
            return null;
        if (cursor < source.length) {
            const separator = call<number>(stringCharCodeAt, source, [cursor]);
            if (separator !== 46 && separator !== 91)
                return null;
        }
    }
    return freezeExact(segments);
}
function createMutableTrieNode(): MutableTrieNode {
    return { edges: new IntrinsicMap<string, MutableTrieEdge>(), terminal: null, required: false };
}
function signatureFor(node: MutableTrieNode, edges: readonly FrozenTrieEdge[], arrayNode: boolean): string {
    let signature = `${node.terminal ?? ''}:${node.required ? '1' : '0'}:${arrayNode ? '1' : '0'}`;
    for (let index = 0; index < edges.length; index += 1) {
        const edge = edges[index];
        if (edge)
            signature += `|${edgeIdentity(edge.key)}=${edge.child.signature}`;
    }
    return signature;
}
function compileTrie(specs: readonly ForesightProjectionPathSpec[], limits: ForesightProjectionLimits): FrozenTrieNode | null {
    if (specs.length < 1 || specs.length > limits.maxPathCount)
        return null;
    const root = createMutableTrieNode();
    const nodes: MutableTrieNode[] = [root];
    for (let specIndex = 0; specIndex < specs.length; specIndex += 1) {
        const spec = specs[specIndex];
        if (!spec)
            return null;
        const segments = parseAuthoredPath(spec.path, limits);
        if (!segments?.length)
            return null;
        let current = root;
        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
            const segment = segments[segmentIndex];
            if (segment === undefined || current.terminal)
                return null;
            const identity = edgeIdentity(segment);
            let edge = call<MutableTrieEdge | undefined>(mapGet, current.edges, [identity]);
            if (!edge) {
                const child = createMutableTrieNode();
                edge = { key: segment, child };
                call(mapSet, current.edges, [identity, edge]);
                push(nodes, child);
            }
            current = edge.child;
        }
        if (call<number>(mapSizeGetter, current.edges, []) > 0 ||
            (current.terminal && current.terminal !== spec.valueKind))
            return null;
        current.terminal = spec.valueKind;
        current.required ||= spec.required;
    }
    const frozenNodes = new IntrinsicMap<MutableTrieNode, FrozenTrieNode>();
    for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex -= 1) {
        const source = nodes[nodeIndex];
        if (!source)
            return null;
        const frozenEdges: FrozenTrieEdge[] = [];
        let hasNumbers = false;
        let hasStrings = false;
        for (let specIndex = 0; specIndex < specs.length; specIndex += 1) {
            const spec = specs[specIndex];
            const path = spec ? parseAuthoredPath(spec.path, limits) : null;
            if (!path)
                return null;
            for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
                const key = path[pathIndex];
                if (key === undefined)
                    return null;
                const edge = call<MutableTrieEdge | undefined>(mapGet, source.edges, [edgeIdentity(key)]);
                if (!edge || !call<boolean>(mapHas, frozenNodes, [edge.child]))
                    continue;
                let alreadyAdded = false;
                for (let edgeIndex = 0; edgeIndex < frozenEdges.length; edgeIndex += 1) {
                    if (frozenEdges[edgeIndex]?.key === key) {
                        alreadyAdded = true;
                        break;
                    }
                }
                if (alreadyAdded)
                    continue;
                const child = call<FrozenTrieNode | undefined>(mapGet, frozenNodes, [edge.child]);
                if (!child)
                    return null;
                if (typeof key === 'number')
                    hasNumbers = true;
                else
                    hasStrings = true;
                push(frozenEdges, freezeExact({ key, child }));
            }
        }
        if (hasNumbers && hasStrings)
            return null;
        const frozenEdgeList = freezeExact(frozenEdges);
        call(mapSet, frozenNodes, [
            source,
            freezeExact({
                edges: frozenEdgeList,
                terminal: source.terminal,
                required: source.required,
                arrayNode: hasNumbers,
                signature: signatureFor(source, frozenEdgeList, hasNumbers),
            }),
        ]);
    }
    return call<FrozenTrieNode | undefined>(mapGet, frozenNodes, [root]) ?? null;
}
function isPrimitiveScalar(value: unknown): boolean {
    return (value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint' ||
        (typeof value === 'number' && numberIsFinite(value)));
}
export function createForesightProjectionAuthority(): ForesightProjectionAuthority {
    const limits = FORESIGHT_PROJECTION_LIMITS;
    const planStates = new IntrinsicWeakMap<object, ProjectionPlanState>();
    const collectionOwners = new IntrinsicWeakMap<object, CollectionSourceOwner>();
    const collectionStates = new IntrinsicWeakMap<object, CollectionState>();
    const collectionLeaseNodes = new IntrinsicWeakMap<object, CollectionLeaseNode>();
    const projectionReceipts = new IntrinsicWeakMap<object, ProjectionReceiptState>();
    const collectionWindowReceipts = new IntrinsicWeakMap<object, CollectionWindowReceiptState>();
    function compile(specs: readonly ForesightProjectionPathSpec[]): ForesightProjectionPlanToken | null {
        try {
            const root = compileTrie(specs, limits);
            if (!root)
                return null;
            const valueKinds: ForesightProjectionValueKind[] = [];
            let maximumPathDepth = 0;
            const seenKinds = new IntrinsicSet<ForesightProjectionValueKind>();
            for (let index = 0; index < specs.length; index += 1) {
                const spec = specs[index];
                if (!spec)
                    return null;
                const path = parseAuthoredPath(spec.path, limits);
                if (!path)
                    return null;
                maximumPathDepth = mathMax(maximumPathDepth, path.length);
                call(setAdd, seenKinds, [spec.valueKind]);
            }
            const canonicalKinds: readonly ForesightProjectionValueKind[] = [
                'boolean',
                'event-list',
                'movement-command',
                'movement-list',
                'number',
                'scalar',
                'string',
            ];
            for (let index = 0; index < canonicalKinds.length; index += 1) {
                const kind = canonicalKinds[index];
                if (kind && call<boolean>(setHas, seenKinds, [kind]))
                    push(valueKinds, kind);
            }
            const token = frozenRecord([
                ['pathCount', specs.length],
                ['maximumPathDepth', maximumPathDepth],
                ['valueKinds', freezeExact(valueKinds)],
            ]) as unknown as ForesightProjectionPlanToken;
            call(weakMapSet, planStates, [token, { root }]);
            return token;
        }
        catch {
            return null;
        }
    }
    function collectionSlot(owner: CollectionSourceOwner, kind: ForesightCollectionKind): CollectionState | null {
        if (kind === 'event-list')
            return owner.eventList;
        return kind === 'movement-list' ? owner.movementList : owner.movementCommand;
    }
    function setCollectionSlot(owner: CollectionSourceOwner, kind: ForesightCollectionKind, state: CollectionState | null): void {
        if (kind === 'event-list')
            owner.eventList = state;
        else if (kind === 'movement-list')
            owner.movementList = state;
        else
            owner.movementCommand = state;
    }
    function collectionStateIsCurrent(state: CollectionState, phase: CollectionPhase): boolean {
        return state.phase === phase && collectionSlot(state.owner, state.kind) === state;
    }
    function abandonCollectionState(state: CollectionState): void {
        if (collectionSlot(state.owner, state.kind) === state)
            setCollectionSlot(state.owner, state.kind, null);
        state.phase = 'retired';
        let leaseNode = state.leaseHead;
        state.leaseHead = null;
        state.liveLeases = 0;
        while (leaseNode) {
            const next = leaseNode.next;
            call(weakMapDelete, collectionStates, [leaseNode.lease]);
            call(weakMapDelete, collectionLeaseNodes, [leaseNode.lease]);
            leaseNode.previous = null;
            leaseNode.next = null;
            leaseNode = next;
        }
        let window = state.windowHead;
        state.windowHead = null;
        state.liveWindows = 0;
        while (window) {
            const next = window.next;
            call(weakMapDelete, collectionWindowReceipts, [window.receipt]);
            window.previous = null;
            window.next = null;
            window.phase = 'retired';
            window = next;
        }
    }
    function beginCollectionOperation(state: CollectionState, phase: 'attesting' | 'windowing'): boolean {
        if (!collectionStateIsCurrent(state, 'active'))
            return false;
        state.phase = phase;
        return collectionStateIsCurrent(state, phase);
    }
    function restoreCollectionOperation(state: CollectionState, phase: 'attesting' | 'windowing'): boolean {
        if (!collectionStateIsCurrent(state, phase)) {
            abandonCollectionState(state);
            return false;
        }
        state.phase = 'active';
        return collectionStateIsCurrent(state, 'active');
    }
    function ownerFor(source: object): CollectionSourceOwner {
        const known = call<CollectionSourceOwner | undefined>(weakMapGet, collectionOwners, [source]);
        if (known)
            return known;
        const owner: CollectionSourceOwner = {
            identity: freezeExact(createNullRecord()),
            eventList: null,
            movementList: null,
            movementCommand: null,
        };
        call(weakMapSet, collectionOwners, [source, owner]);
        return owner;
    }
    function acceptedCollection(token: ForesightCollectionGeneration): ForesightCollectionAdmissionOutcome {
        return frozenRecord([
            ['accepted', true],
            ['token', token],
        ]) as unknown as ForesightCollectionAdmissionOutcome;
    }
    function mintCollectionLease(state: CollectionState): ForesightCollectionGeneration | null {
        if (state.liveLeases >= limits.maxArrayLength)
            return null;
        const lease = freezeExact(createNullRecord()) as ForesightCollectionGeneration;
        const node: CollectionLeaseNode = {
            lease,
            collection: state,
            previous: null,
            next: state.leaseHead,
        };
        if (state.leaseHead)
            state.leaseHead.previous = node;
        state.leaseHead = node;
        state.liveLeases += 1;
        call(weakMapSet, collectionStates, [lease, state]);
        call(weakMapSet, collectionLeaseNodes, [lease, node]);
        return lease;
    }
    function mintCollectionOutcome(state: CollectionState): ForesightCollectionAdmissionOutcome {
        const lease = mintCollectionLease(state);
        return lease ? acceptedCollection(lease) : (failure('node-limit') as ForesightCollectionAdmissionOutcome);
    }
    function attestCollectionState(state: CollectionState): boolean {
        if (!beginCollectionOperation(state, 'attesting'))
            return false;
        let valid: boolean;
        try {
            valid = safePrototype(state.source) === state.prototype;
            if (valid && state.kind !== 'movement-command') {
                valid =
                    !!state.lengthDescriptor &&
                        descriptorMatches(state.lengthDescriptor, safeOwnDescriptor(state.source, 'length')) &&
                        safePrototype(state.source) === state.prototype &&
                        descriptorMatches(state.lengthDescriptor, safeOwnDescriptor(state.source, 'length'));
            }
            else if (valid)
                valid = state.lengthDescriptor === null && safePrototype(state.source) === state.prototype;
        }
        catch {
            valid = false;
        }
        if (!valid) {
            abandonCollectionState(state);
            return false;
        }
        return restoreCollectionOperation(state, 'attesting');
    }
    function createCollectionToken(source: unknown, kind: ForesightCollectionKind): ForesightCollectionAdmissionOutcome {
        let candidate: CollectionState | null = null;
        try {
            if (!source || typeof source !== 'object') {
                return failure('type') as ForesightCollectionAdmissionOutcome;
            }
            const sourceIsArray = arrayIsArray(source);
            if ((kind === 'movement-command' && sourceIsArray) || (kind !== 'movement-command' && !sourceIsArray)) {
                return failure('type') as ForesightCollectionAdmissionOutcome;
            }
            const owner = ownerFor(source);
            const current = collectionSlot(owner, kind);
            if (current?.liveLeases === limits.maxArrayLength)
                return failure('node-limit') as ForesightCollectionAdmissionOutcome;
            if (current && attestCollectionState(current))
                return mintCollectionOutcome(current);
            const successor = collectionSlot(owner, kind);
            if (successor?.liveLeases === limits.maxArrayLength)
                return failure('node-limit') as ForesightCollectionAdmissionOutcome;
            if (successor && collectionStateIsCurrent(successor, 'active'))
                return mintCollectionOutcome(successor);
            const state: CollectionState = {
                source,
                owner,
                identity: owner.identity,
                kind,
                leaseHead: null,
                windowHead: null,
                liveLeases: 0,
                liveWindows: 0,
                lengthDescriptor: null,
                prototype: null,
                facts: null,
                phase: 'capturing',
            };
            candidate = state;
            setCollectionSlot(owner, kind, state);
            const prototype = safePrototype(source);
            if (prototype === 'fault') {
                abandonCollectionState(state);
                return failure('descriptor-drift') as ForesightCollectionAdmissionOutcome;
            }
            state.prototype = prototype;
            let length: number | null = null;
            if (kind !== 'movement-command') {
                const lengthDescriptor = ownDataDescriptor(source, 'length');
                if (lengthDescriptor === 'fault') {
                    abandonCollectionState(state);
                    return failure('descriptor-drift') as ForesightCollectionAdmissionOutcome;
                }
                if (!lengthDescriptor || lengthDescriptor === 'accessor') {
                    abandonCollectionState(state);
                    return failure(lengthDescriptor === 'accessor' ? 'accessor' : 'type') as ForesightCollectionAdmissionOutcome;
                }
                const capturedLength = descriptorValue(lengthDescriptor);
                if (typeof capturedLength !== 'number' || !numberIsSafeInteger(capturedLength) || capturedLength < 0) {
                    abandonCollectionState(state);
                    return failure('type') as ForesightCollectionAdmissionOutcome;
                }
                state.lengthDescriptor = lengthDescriptor;
                length = capturedLength;
            }
            if (!collectionStateIsCurrent(state, 'capturing') ||
                safePrototype(source) !== prototype ||
                (state.lengthDescriptor &&
                    !descriptorMatches(state.lengthDescriptor, safeOwnDescriptor(source, 'length'))) ||
                !collectionStateIsCurrent(state, 'capturing')) {
                abandonCollectionState(state);
                return failure('descriptor-drift') as ForesightCollectionAdmissionOutcome;
            }
            state.facts = frozenRecord([
                ['identity', state.identity],
                ['kind', kind],
                ['length', length],
            ]) as unknown as ForesightCollectionGenerationFacts;
            state.phase = 'active';
            if (!collectionStateIsCurrent(state, 'active')) {
                abandonCollectionState(state);
                return failure('descriptor-drift') as ForesightCollectionAdmissionOutcome;
            }
            return mintCollectionOutcome(state);
        }
        catch {
            if (candidate)
                abandonCollectionState(candidate);
            return failure('descriptor-drift') as ForesightCollectionAdmissionOutcome;
        }
    }
    function admitCollection(source: unknown, kind: ForesightCollectionKind): ForesightCollectionAdmissionOutcome {
        return createCollectionToken(source, kind);
    }
    function attestCollectionGeneration(token: unknown): boolean {
        try {
            if (!token || typeof token !== 'object')
                return false;
            const state = call<CollectionState | undefined>(weakMapGet, collectionStates, [token]);
            return (!!state &&
                attestCollectionState(state) &&
                call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) === state);
        }
        catch {
            return false;
        }
    }
    function readCollectionGeneration(token: unknown): ForesightCollectionGenerationFacts | null {
        try {
            if (!token || typeof token !== 'object')
                return null;
            const state = call<CollectionState | undefined>(weakMapGet, collectionStates, [token]);
            if (!state ||
                state.liveLeases >= limits.maxArrayLength ||
                !attestCollectionState(state) ||
                call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state) {
                return null;
            }
            return state.facts;
        }
        catch {
            return null;
        }
    }
    function attestCollection(token: unknown, source: unknown): boolean {
        try {
            if (!token || typeof token !== 'object' || !source || typeof source !== 'object')
                return false;
            const state = call<CollectionState | undefined>(weakMapGet, collectionStates, [token]);
            return (!!state &&
                state.source === source &&
                attestCollectionState(state) &&
                call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) === state);
        }
        catch {
            return false;
        }
    }
    function retainCollectionGeneration(token: unknown): ForesightCollectionAdmissionOutcome {
        try {
            if (!token || typeof token !== 'object')
                return failure('type') as ForesightCollectionAdmissionOutcome;
            const state = call<CollectionState | undefined>(weakMapGet, collectionStates, [token]);
            if (!state ||
                !attestCollectionState(state) ||
                call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state) {
                return failure('descriptor-drift') as ForesightCollectionAdmissionOutcome;
            }
            return mintCollectionOutcome(state);
        }
        catch {
            return failure('descriptor-drift') as ForesightCollectionAdmissionOutcome;
        }
    }
    function retireCollectionGeneration(token: unknown): boolean {
        try {
            if (!token || typeof token !== 'object')
                return false;
            const node = call<CollectionLeaseNode | undefined>(weakMapGet, collectionLeaseNodes, [token]);
            if (!node)
                return false;
            const state = node.collection;
            call(weakMapDelete, collectionStates, [token]);
            call(weakMapDelete, collectionLeaseNodes, [token]);
            if (node.previous)
                node.previous.next = node.next;
            else
                state.leaseHead = node.next;
            if (node.next)
                node.next.previous = node.previous;
            node.previous = null;
            node.next = null;
            state.liveLeases -= 1;
            if (state.liveLeases <= 0)
                abandonCollectionState(state);
            return true;
        }
        catch {
            return false;
        }
    }
    function project(source: unknown, token: unknown): ForesightProjectionOutcome {
        const issuedCollectionLeases: ForesightCollectionGeneration[] = [];
        let issuedReceipt: ForesightProjectionReceipt | null = null;
        try {
            if (!token || typeof token !== 'object')
                return failure('plan-invalid');
            const plan = call<ProjectionPlanState | undefined>(weakMapGet, planStates, [token]);
            if (!plan)
                return failure('plan-invalid');
            const budget: ProjectionBudget = { nodes: 0, fields: 0, stringUnits: 0 };
            const active = new IntrinsicWeakSet<object>();
            const aliases = new IntrinsicWeakMap<object, {
                readonly node: FrozenTrieNode;
                readonly target: unknown;
            }[]>();
            let rootValue: unknown;
            let rejected: ForesightProjectionOutcome | null = null;
            const completedFrames: ProjectionFrame[] = [];
            const tasks: ProjectionTask[] = [
                {
                    kind: 'enter',
                    source,
                    node: plan.root,
                    depth: 0,
                    assign(value) {
                        rootValue = value;
                    },
                },
            ];
            while (tasks.length > 0) {
                const task = tasks[tasks.length - 1];
                tasks.length -= 1;
                if (!task)
                    break;
                if (task.kind === 'exit') {
                    const frame = task.frame;
                    if (safePrototype(frame.source) !== frame.prototype ||
                        (frame.lengthDescriptor &&
                            !descriptorMatches(frame.lengthDescriptor, safeOwnDescriptor(frame.source, 'length')))) {
                        rejected = failure('descriptor-drift');
                        break;
                    }
                    for (let index = 0; index < frame.checks.length; index += 1) {
                        const check = frame.checks[index];
                        if (!check ||
                            !descriptorMatches(check.descriptor, safeOwnDescriptor(frame.source, check.key))) {
                            rejected = failure('descriptor-drift');
                            break;
                        }
                    }
                    if (rejected)
                        break;
                    if (safePrototype(frame.source) !== frame.prototype ||
                        (frame.lengthDescriptor &&
                            !descriptorMatches(frame.lengthDescriptor, safeOwnDescriptor(frame.source, 'length')))) {
                        rejected = failure('descriptor-drift');
                        break;
                    }
                    freezeExact(frame.target);
                    push(completedFrames, frame);
                    call(weakSetDelete, active, [frame.source]);
                    continue;
                }
                if (!task.source || typeof task.source !== 'object') {
                    rejected = failure('type');
                    break;
                }
                if (task.depth > limits.maxDepth) {
                    rejected = failure('depth-limit');
                    break;
                }
                if (call<boolean>(weakSetHas, active, [task.source])) {
                    rejected = failure('cycle');
                    break;
                }
                const knownAliases = call<{
                    readonly node: FrozenTrieNode;
                    readonly target: unknown;
                }[] | undefined>(weakMapGet, aliases, [task.source]);
                let existing: {
                    readonly node: FrozenTrieNode;
                    readonly target: unknown;
                } | null = null;
                if (knownAliases) {
                    for (let index = 0; index < knownAliases.length; index += 1) {
                        const candidate = knownAliases[index];
                        if (candidate &&
                            (candidate.node === task.node || candidate.node.signature === task.node.signature)) {
                            existing = candidate;
                            break;
                        }
                    }
                }
                if (existing) {
                    task.assign(existing.target);
                    continue;
                }
                budget.nodes += 1;
                if (budget.nodes > limits.maxNodes) {
                    rejected = failure('node-limit');
                    break;
                }
                const prototype = safePrototype(task.source);
                if (prototype === 'fault') {
                    rejected = failure('descriptor-drift');
                    break;
                }
                let lengthDescriptor: PropertyDescriptor | null = null;
                let target: Record<PropertyKey, unknown> | unknown[];
                if (task.node.arrayNode) {
                    if (!arrayIsArray(task.source)) {
                        rejected = failure('type');
                        break;
                    }
                    const capturedLength = ownDataDescriptor(task.source, 'length');
                    if (capturedLength === 'fault') {
                        rejected = failure('descriptor-drift');
                        break;
                    }
                    if (!capturedLength || capturedLength === 'accessor') {
                        rejected = failure(capturedLength === 'accessor' ? 'accessor' : 'type');
                        break;
                    }
                    const length = descriptorValue(capturedLength);
                    if (typeof length !== 'number' ||
                        !numberIsSafeInteger(length) ||
                        length < 0 ||
                        length > limits.maxArrayLength) {
                        rejected = failure('array-limit');
                        break;
                    }
                    lengthDescriptor = capturedLength;
                    let maximumSelectedIndex = -1;
                    for (let index = 0; index < task.node.edges.length; index += 1) {
                        const key = task.node.edges[index]?.key;
                        if (typeof key === 'number')
                            maximumSelectedIndex = mathMax(maximumSelectedIndex, key);
                    }
                    target = new IntrinsicArray<unknown>(mathMax(0, mathMax(-1, maximumSelectedIndex) + 1));
                }
                else
                    target = createNullRecord();
                task.assign(target);
                const aliasesForSource = knownAliases ?? [];
                push(aliasesForSource, { node: task.node, target });
                call(weakMapSet, aliases, [task.source, aliasesForSource]);
                call(weakSetAdd, active, [task.source]);
                const checks: DescriptorCheck[] = [];
                const childTasks: ProjectionTask[] = [];
                for (let edgeIndex = 0; edgeIndex < task.node.edges.length; edgeIndex += 1) {
                    const edge = task.node.edges[edgeIndex];
                    if (!edge)
                        continue;
                    budget.fields += 1;
                    if (budget.fields > limits.maxFields) {
                        rejected = failure('field-limit');
                        break;
                    }
                    const descriptor = ownDataDescriptor(task.source, edge.key);
                    if (descriptor === 'fault') {
                        rejected = failure('descriptor-drift');
                        break;
                    }
                    if (descriptor === 'accessor') {
                        rejected = failure('accessor');
                        break;
                    }
                    if (!descriptor) {
                        if (edge.child.required)
                            rejected = failure('missing-required');
                        continue;
                    }
                    push(checks, { key: edge.key, descriptor });
                    const value = descriptorValue(descriptor);
                    const assign: AssignValue = (projected) => {
                        defineOwnData(target, edge.key, projected);
                    };
                    if (edge.child.terminal) {
                        const kind = edge.child.terminal;
                        let projected: unknown;
                        if (kind === 'scalar') {
                            if (!isPrimitiveScalar(value)) {
                                rejected = failure('type');
                                break;
                            }
                            projected = value;
                        }
                        else if (kind === 'string') {
                            if (typeof value !== 'string') {
                                rejected = failure('type');
                                break;
                            }
                            budget.stringUnits += value.length;
                            if (budget.stringUnits > limits.maxStringUnits) {
                                rejected = failure('string-limit');
                                break;
                            }
                            projected = value;
                        }
                        else if (kind === 'number') {
                            if (typeof value !== 'number' || !numberIsFinite(value)) {
                                rejected = failure('type');
                                break;
                            }
                            projected = value;
                        }
                        else if (kind === 'boolean') {
                            if (typeof value !== 'boolean') {
                                rejected = failure('type');
                                break;
                            }
                            projected = value;
                        }
                        else {
                            const admission = createCollectionToken(value, kind);
                            if (!admission.accepted) {
                                rejected = failure(admission.reason);
                                break;
                            }
                            projected = admission.token;
                            push(issuedCollectionLeases, admission.token);
                        }
                        budget.nodes += 1;
                        if (budget.nodes > limits.maxNodes) {
                            rejected = failure('node-limit');
                            break;
                        }
                        assign(projected);
                    }
                    else
                        push(childTasks, {
                            kind: 'enter',
                            source: value,
                            node: edge.child,
                            assign,
                            depth: task.depth + 1,
                        });
                }
                if (rejected)
                    break;
                push(tasks, {
                    kind: 'exit',
                    frame: { source: task.source, target, checks, prototype, lengthDescriptor },
                });
                for (let index = childTasks.length - 1; index >= 0; index -= 1) {
                    const child = childTasks[index];
                    if (child)
                        push(tasks, child);
                }
            }
            if (rejected) {
                for (let index = 0; index < issuedCollectionLeases.length; index += 1) {
                    const lease = issuedCollectionLeases[index];
                    if (lease)
                        retireCollectionGeneration(lease);
                }
                return rejected;
            }
            const receipt = freezeExact(createNullRecord()) as ForesightProjectionReceipt;
            issuedReceipt = receipt;
            call(weakMapSet, projectionReceipts, [
                receipt,
                {
                    frames: freezeExact(completedFrames),
                    collectionLeases: freezeExact(issuedCollectionLeases),
                    phase: 'active',
                },
            ]);
            return frozenRecord([
                ['accepted', true],
                ['value', rootValue],
                ['receipt', receipt],
            ]) as unknown as ForesightProjectionOutcome;
        }
        catch {
            if (issuedReceipt)
                retireProjection(issuedReceipt);
            else
                for (let index = 0; index < issuedCollectionLeases.length; index += 1) {
                    const lease = issuedCollectionLeases[index];
                    if (lease)
                        retireCollectionGeneration(lease);
                }
            return failure('descriptor-drift');
        }
    }
    function retireProjectionState(receipt: object, state: ProjectionReceiptState): boolean {
        if (call<ProjectionReceiptState | undefined>(weakMapGet, projectionReceipts, [receipt]) !== state)
            return false;
        call(weakMapDelete, projectionReceipts, [receipt]);
        state.phase = 'retired';
        for (let index = 0; index < state.collectionLeases.length; index += 1) {
            const lease = state.collectionLeases[index];
            if (lease)
                retireCollectionGeneration(lease);
        }
        return true;
    }
    function projectionReceiptStateIsCurrent(receipt: object, state: ProjectionReceiptState, phase: ProjectionReceiptState['phase']): boolean {
        return (state.phase === phase &&
            call<ProjectionReceiptState | undefined>(weakMapGet, projectionReceipts, [receipt]) === state);
    }
    function attestProjection(receipt: unknown): boolean {
        let receiptState: ProjectionReceiptState | null = null;
        try {
            if (!receipt || typeof receipt !== 'object')
                return false;
            const state = call<ProjectionReceiptState | undefined>(weakMapGet, projectionReceipts, [receipt]);
            if (state?.phase !== 'active')
                return false;
            receiptState = state;
            state.phase = 'attesting';
            let valid = true;
            for (let frameIndex = 0; frameIndex < state.frames.length; frameIndex += 1) {
                const frame = state.frames[frameIndex];
                if (!frame) {
                    valid = false;
                    break;
                }
                if (safePrototype(frame.source) !== frame.prototype ||
                    (frame.lengthDescriptor &&
                        !descriptorMatches(frame.lengthDescriptor, safeOwnDescriptor(frame.source, 'length')))) {
                    valid = false;
                    break;
                }
                for (let checkIndex = 0; checkIndex < frame.checks.length; checkIndex += 1) {
                    const check = frame.checks[checkIndex];
                    if (!check || !descriptorMatches(check.descriptor, safeOwnDescriptor(frame.source, check.key))) {
                        valid = false;
                        break;
                    }
                }
                if (!valid)
                    break;
                if (safePrototype(frame.source) !== frame.prototype ||
                    (frame.lengthDescriptor &&
                        !descriptorMatches(frame.lengthDescriptor, safeOwnDescriptor(frame.source, 'length')))) {
                    valid = false;
                    break;
                }
            }
            const stillOwned = projectionReceiptStateIsCurrent(receipt, state, 'attesting');
            if (!valid || !stillOwned) {
                retireProjectionState(receipt, state);
                return false;
            }
            state.phase = 'active';
            return true;
        }
        catch {
            if (receiptState && receipt && typeof receipt === 'object')
                retireProjectionState(receipt, receiptState);
            return false;
        }
    }
    function retireProjection(receipt: unknown): boolean {
        try {
            if (!receipt || typeof receipt !== 'object')
                return false;
            const state = call<ProjectionReceiptState | undefined>(weakMapGet, projectionReceipts, [receipt]);
            if (!state || state.phase === 'retired')
                return false;
            return retireProjectionState(receipt, state);
        }
        catch {
            return false;
        }
    }
    function createCollectionWindowReceipt(collection: CollectionState, generation: ForesightCollectionGeneration, startIndex: number, nextIndex: number, complete: boolean, checks: readonly DescriptorCheck[]): ForesightCollectionWindowReceipt | null {
        if (collection.liveWindows >= limits.maxArrayLength)
            return null;
        const receipt = freezeExact(createNullRecord());
        const state: CollectionWindowReceiptState = {
            receipt,
            collection,
            generation,
            startIndex,
            nextIndex,
            complete,
            checks,
            previous: null,
            next: collection.windowHead,
            phase: 'active',
        };
        if (collection.windowHead)
            collection.windowHead.previous = state;
        collection.windowHead = state;
        collection.liveWindows += 1;
        call(weakMapSet, collectionWindowReceipts, [receipt, state]);
        return receipt;
    }
    function retireCollectionWindowState(state: CollectionWindowReceiptState): boolean {
        if (call<CollectionWindowReceiptState | undefined>(weakMapGet, collectionWindowReceipts, [state.receipt]) !==
            state) {
            return false;
        }
        call(weakMapDelete, collectionWindowReceipts, [state.receipt]);
        if (state.previous)
            state.previous.next = state.next;
        else
            state.collection.windowHead = state.next;
        if (state.next)
            state.next.previous = state.previous;
        state.previous = null;
        state.next = null;
        state.collection.liveWindows -= 1;
        state.phase = 'retired';
        return true;
    }
    function captureCollectionWindow(token: unknown, startIndex: unknown, maximumCount: unknown): ForesightCollectionWindowOutcome {
        let claimedState: CollectionState | null = null;
        let issuedReceipt: ForesightCollectionWindowReceipt | null = null;
        try {
            if (!token || typeof token !== 'object')
                return collectionFailure('type');
            const state = call<CollectionState | undefined>(weakMapGet, collectionStates, [token]);
            if (!state)
                return collectionFailure('type');
            const start = typeof startIndex === 'number' && numberIsSafeInteger(startIndex) ? startIndex : -1;
            const count = typeof maximumCount === 'number' && numberIsSafeInteger(maximumCount) ? maximumCount : -1;
            if (start < 0 || count < 1 || count > limits.maxArrayLength)
                return collectionFailure('array-limit');
            if (state.liveWindows >= limits.maxArrayLength)
                return collectionFailure('node-limit');
            if (state.kind === 'movement-command') {
                if (start !== 0)
                    return collectionFailure('type');
                if (!beginCollectionOperation(state, 'windowing'))
                    return collectionFailure('descriptor-drift');
                claimedState = state;
                if (safePrototype(state.source) !== state.prototype ||
                    !collectionStateIsCurrent(state, 'windowing') ||
                    call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state ||
                    safePrototype(state.source) !== state.prototype ||
                    !collectionStateIsCurrent(state, 'windowing') ||
                    call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state) {
                    abandonCollectionState(state);
                    return collectionFailure('descriptor-drift');
                }
                const receipt = createCollectionWindowReceipt(state, token, 0, 1, true, freezeExact([]));
                if (!receipt) {
                    restoreCollectionOperation(state, 'windowing');
                    return collectionFailure('node-limit');
                }
                issuedReceipt = receipt;
                if (!restoreCollectionOperation(state, 'windowing')) {
                    const receiptState = call<CollectionWindowReceiptState | undefined>(weakMapGet, collectionWindowReceipts, [receipt]);
                    if (receiptState)
                        retireCollectionWindowState(receiptState);
                    return collectionFailure('descriptor-drift');
                }
                return frozenRecord([
                    ['accepted', true],
                    ['kind', state.kind],
                    ['startIndex', 0],
                    ['nextIndex', 1],
                    ['complete', true],
                    ['values', freezeExact([state.source])],
                    ['receipt', receipt],
                ]) as unknown as ForesightCollectionWindowOutcome;
            }
            if (!state.lengthDescriptor)
                return collectionFailure('type');
            if (!beginCollectionOperation(state, 'windowing'))
                return collectionFailure('descriptor-drift');
            claimedState = state;
            if (safePrototype(state.source) !== state.prototype ||
                !descriptorMatches(state.lengthDescriptor, safeOwnDescriptor(state.source, 'length')) ||
                !collectionStateIsCurrent(state, 'windowing') ||
                call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state) {
                abandonCollectionState(state);
                return collectionFailure('descriptor-drift');
            }
            const length = descriptorValue(state.lengthDescriptor);
            if (typeof length !== 'number' || start > length) {
                if (!restoreCollectionOperation(state, 'windowing'))
                    return collectionFailure('descriptor-drift');
                return collectionFailure('type');
            }
            const boundedEnd = mathMin(length, start + count);
            const values: unknown[] = [];
            const checks: DescriptorCheck[] = [];
            for (let index = start; index < boundedEnd; index += 1) {
                const descriptor = ownDataDescriptor(state.source, index);
                if (!collectionStateIsCurrent(state, 'windowing') ||
                    call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state) {
                    abandonCollectionState(state);
                    return collectionFailure('descriptor-drift');
                }
                if (descriptor === 'fault') {
                    abandonCollectionState(state);
                    return collectionFailure('descriptor-drift');
                }
                if (descriptor === 'accessor' || !descriptor) {
                    if (!restoreCollectionOperation(state, 'windowing'))
                        return collectionFailure('descriptor-drift');
                    return collectionFailure(descriptor === 'accessor' ? 'accessor' : 'missing-required');
                }
                push(checks, { key: index, descriptor });
                push(values, descriptorValue(descriptor));
            }
            if (!descriptorMatches(state.lengthDescriptor, safeOwnDescriptor(state.source, 'length')) ||
                safePrototype(state.source) !== state.prototype ||
                !collectionStateIsCurrent(state, 'windowing') ||
                call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state) {
                abandonCollectionState(state);
                return collectionFailure('descriptor-drift');
            }
            for (let index = 0; index < checks.length; index += 1) {
                const check = checks[index];
                if (!check ||
                    !descriptorMatches(check.descriptor, safeOwnDescriptor(state.source, check.key)) ||
                    !collectionStateIsCurrent(state, 'windowing') ||
                    call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state) {
                    abandonCollectionState(state);
                    return collectionFailure('descriptor-drift');
                }
            }
            if (!descriptorMatches(state.lengthDescriptor, safeOwnDescriptor(state.source, 'length')) ||
                safePrototype(state.source) !== state.prototype ||
                !collectionStateIsCurrent(state, 'windowing') ||
                call<CollectionState | undefined>(weakMapGet, collectionStates, [token]) !== state) {
                abandonCollectionState(state);
                return collectionFailure('descriptor-drift');
            }
            const complete = boundedEnd === length;
            const receipt = createCollectionWindowReceipt(state, token, start, boundedEnd, complete, freezeExact(checks));
            if (!receipt) {
                restoreCollectionOperation(state, 'windowing');
                return collectionFailure('node-limit');
            }
            issuedReceipt = receipt;
            if (!restoreCollectionOperation(state, 'windowing')) {
                const receiptState = call<CollectionWindowReceiptState | undefined>(weakMapGet, collectionWindowReceipts, [receipt]);
                if (receiptState)
                    retireCollectionWindowState(receiptState);
                return collectionFailure('descriptor-drift');
            }
            return frozenRecord([
                ['accepted', true],
                ['kind', state.kind],
                ['startIndex', start],
                ['nextIndex', boundedEnd],
                ['complete', complete],
                ['values', freezeExact(values)],
                ['receipt', receipt],
            ]) as unknown as ForesightCollectionWindowOutcome;
        }
        catch {
            if (issuedReceipt) {
                const receiptState = call<CollectionWindowReceiptState | undefined>(weakMapGet, collectionWindowReceipts, [issuedReceipt]);
                if (receiptState)
                    retireCollectionWindowState(receiptState);
            }
            if (claimedState?.phase === 'windowing')
                abandonCollectionState(claimedState);
            return collectionFailure('descriptor-drift');
        }
    }
    function attestCollectionWindow(receipt: unknown): boolean {
        let receiptState: CollectionWindowReceiptState | null = null;
        try {
            if (!receipt || typeof receipt !== 'object')
                return false;
            const state = call<CollectionWindowReceiptState | undefined>(weakMapGet, collectionWindowReceipts, [
                receipt,
            ]);
            if (state?.phase !== 'active')
                return false;
            receiptState = state;
            if (call<CollectionState | undefined>(weakMapGet, collectionStates, [state.generation]) !== state.collection) {
                retireCollectionWindowState(state);
                return false;
            }
            state.phase = 'attesting';
            if (!beginCollectionOperation(state.collection, 'windowing')) {
                retireCollectionWindowState(state);
                return false;
            }
            if (state.collection.kind === 'movement-command') {
                const collectionValid = state.collection.lengthDescriptor === null &&
                    state.startIndex === 0 &&
                    state.nextIndex === 1 &&
                    state.complete &&
                    state.checks.length === 0 &&
                    safePrototype(state.collection.source) === state.collection.prototype &&
                    collectionStateIsCurrent(state.collection, 'windowing') &&
                    call<CollectionState | undefined>(weakMapGet, collectionStates, [state.generation]) ===
                        state.collection &&
                    safePrototype(state.collection.source) === state.collection.prototype &&
                    collectionStateIsCurrent(state.collection, 'windowing') &&
                    call<CollectionState | undefined>(weakMapGet, collectionStates, [state.generation]) ===
                        state.collection;
                const receiptCurrent = collectionWindowReceiptStateIsCurrent(receipt, state, 'attesting');
                let collectionCurrent = false;
                if (collectionValid)
                    collectionCurrent = restoreCollectionOperation(state.collection, 'windowing');
                else
                    abandonCollectionState(state.collection);
                if (!receiptCurrent || !collectionCurrent) {
                    retireCollectionWindowState(state);
                    return false;
                }
                state.phase = 'active';
                return true;
            }
            const lengthDescriptor = state.collection.lengthDescriptor;
            const collectionInvalid = !lengthDescriptor ||
                safePrototype(state.collection.source) !== state.collection.prototype ||
                !descriptorMatches(lengthDescriptor, safeOwnDescriptor(state.collection.source, 'length')) ||
                !collectionStateIsCurrent(state.collection, 'windowing') ||
                call<CollectionState | undefined>(weakMapGet, collectionStates, [state.generation]) !==
                    state.collection;
            if (collectionInvalid) {
                abandonCollectionState(state.collection);
                retireCollectionWindowState(state);
                return false;
            }
            const length = descriptorValue(lengthDescriptor);
            let valid = true;
            if (typeof length !== 'number' ||
                mathMin(length, state.startIndex + state.checks.length) !== state.nextIndex ||
                (state.nextIndex === length) !== state.complete) {
                valid = false;
            }
            for (let index = 0; valid && index < state.checks.length; index += 1) {
                const check = state.checks[index];
                if (!check ||
                    !descriptorMatches(check.descriptor, safeOwnDescriptor(state.collection.source, check.key)) ||
                    !collectionStateIsCurrent(state.collection, 'windowing') ||
                    call<CollectionState | undefined>(weakMapGet, collectionStates, [state.generation]) !==
                        state.collection) {
                    valid = false;
                }
            }
            if (valid &&
                (!descriptorMatches(lengthDescriptor, safeOwnDescriptor(state.collection.source, 'length')) ||
                    safePrototype(state.collection.source) !== state.collection.prototype ||
                    !collectionStateIsCurrent(state.collection, 'windowing') ||
                    call<CollectionState | undefined>(weakMapGet, collectionStates, [state.generation]) !==
                        state.collection)) {
                valid = false;
            }
            const receiptCurrent = collectionWindowReceiptStateIsCurrent(receipt, state, 'attesting');
            const collectionCurrent = restoreCollectionOperation(state.collection, 'windowing');
            if (!valid || !receiptCurrent || !collectionCurrent) {
                retireCollectionWindowState(state);
                return false;
            }
            state.phase = 'active';
            return true;
        }
        catch {
            if (receiptState) {
                if (receiptState.collection.phase === 'windowing')
                    abandonCollectionState(receiptState.collection);
                retireCollectionWindowState(receiptState);
            }
            return false;
        }
    }
    function collectionWindowReceiptStateIsCurrent(receipt: object, state: CollectionWindowReceiptState, phase: CollectionWindowReceiptState['phase']): boolean {
        return (state.phase === phase &&
            call<CollectionWindowReceiptState | undefined>(weakMapGet, collectionWindowReceipts, [receipt]) === state);
    }
    function retireCollectionWindow(receipt: unknown): boolean {
        try {
            if (!receipt || typeof receipt !== 'object')
                return false;
            const state = call<CollectionWindowReceiptState | undefined>(weakMapGet, collectionWindowReceipts, [
                receipt,
            ]);
            return !!state && state.phase !== 'retired' && retireCollectionWindowState(state);
        }
        catch {
            return false;
        }
    }
    return freezeExact({
        compile,
        project,
        attestProjection,
        retireProjection,
        admitCollection,
        readCollectionGeneration,
        attestCollectionGeneration,
        retainCollectionGeneration,
        retireCollectionGeneration,
        attestCollection,
        captureCollectionWindow,
        attestCollectionWindow,
        retireCollectionWindow,
    });
}
