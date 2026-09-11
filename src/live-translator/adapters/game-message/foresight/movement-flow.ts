type UnknownFunction = (...args: unknown[]) => unknown;
type CollectionKind = 'event-list' | 'movement-list' | 'movement-command';
interface ForesightScanListFacts {
    readonly identity: Readonly<object>;
    readonly kind: CollectionKind;
    readonly length: number | null;
}
export interface ForesightMovementCommandFacts {
    readonly index: number;
    readonly command: Readonly<Record<PropertyKey, unknown>>;
    readonly metadata: Readonly<object>;
}
export interface ForesightMovementListGenerationFacade {
    readonly attachListGeneration: (session: unknown, generation: unknown) => ForesightScanListFacts | null;
    readonly readListFacts: (session: unknown, generation: unknown) => ForesightScanListFacts | null;
    readonly readCommand: (session: unknown, generation: unknown, index: unknown, adoptWindow: (window: Readonly<object>) => boolean) => boolean;
    readonly readCommandFacts: (session: unknown, window: unknown) => ForesightMovementCommandFacts | null;
    readonly attestScanSession: (session: unknown) => boolean;
}
interface ForesightRouteBarrier {
    readonly code: number | null;
    readonly reason: unknown;
    readonly label: unknown;
}
export type ForesightMovementRouteRead = {
    readonly transparent: false;
    readonly stopReason: 'movement-route-missing-list';
    readonly metadata: unknown;
} | {
    readonly transparent: false;
    readonly stopReason: 'movement-route-barrier';
    readonly routeBarrierCode: number | null;
    readonly routeBarrierReason: unknown;
    readonly routeBarrierLabel: unknown;
    readonly metadata: unknown;
} | {
    readonly transparent: true;
    readonly nextIndex: number;
    readonly kind: 'movement-route';
    readonly routeCommandCount: number;
    readonly metadata: unknown;
};
export interface ForesightControlFlowTarget {
    readonly kind: string;
    readonly sourceIndex: number | null;
    readonly targetIndex: number | null;
    readonly targetCode: unknown;
    readonly targetLabel: unknown;
    readonly targetName: string;
    readonly labelName: string;
    readonly direction: 'self' | 'backward' | 'forward';
    readonly viaIndex: number | null;
    readonly viaCode: number | null;
    readonly viaLabel: string;
}
export interface ForesightMovementFlowParts {
    readMovementRouteCommand(session: unknown, generation: unknown, currentFacts: unknown, expectedIndent: unknown): ForesightMovementRouteRead;
    resolveControlFlowTarget(session: unknown, generation: unknown, currentFacts: unknown): ForesightControlFlowTarget | null;
}
interface CapturedOwner {
    readonly receiver: object;
    readonly attachListGeneration: UnknownFunction;
    readonly readListFacts: UnknownFunction;
    readonly readCommand: UnknownFunction;
    readonly readCommandFacts: UnknownFunction;
    readonly attestScanSession: UnknownFunction;
}
interface CapturedControlFlowEntry {
    readonly index: number;
    readonly code: number | null;
    readonly indent: number;
    readonly labelIdentity: unknown;
    readonly targetCode: number | null;
    readonly targetLabel: string;
}
interface ControlFlowIndexState {
    readonly facts: ForesightScanListFacts;
    readonly entries: CapturedControlFlowEntry[];
    readonly firstLabels: Map<string, number>;
    readonly loopRepeats: Map<number, number>;
    readonly breakRepeats: Map<number, number>;
    readonly repeatLoops: Map<number, number>;
    readonly openLoops: number[];
    readonly pendingBreaks: Map<number, number[]>;
    nextIndex: number;
}
interface EmbeddedRouteRead {
    readonly commandCount: number;
    readonly barrier: ForesightRouteBarrier | null;
}
const IntrinsicObject = Object;
const IntrinsicArray = Array;
const IntrinsicMap = Map;
const IntrinsicWeakMap = WeakMap;
const IntrinsicTypeError = TypeError;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectIs = Object.is;
const numberFrom = Number;
const numberNaN = Number.NaN;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const reflectApply = Reflect.apply;
const stringFrom = String;
function captureMethod(target: object, key: PropertyKey): UnknownFunction {
    const descriptor = objectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value !== 'function') {
        throw new IntrinsicTypeError(`[Foresight] Missing movement-flow intrinsic ${stringFrom(key)}.`);
    }
    return value as UnknownFunction;
}
const arrayPop = captureMethod(IntrinsicArray.prototype, 'pop');
const mapDelete = captureMethod(IntrinsicMap.prototype, 'delete');
const mapGet = captureMethod(IntrinsicMap.prototype, 'get');
const mapHas = captureMethod(IntrinsicMap.prototype, 'has');
const mapSet = captureMethod(IntrinsicMap.prototype, 'set');
const weakMapDelete = captureMethod(IntrinsicWeakMap.prototype, 'delete');
const weakMapGet = captureMethod(IntrinsicWeakMap.prototype, 'get');
const weakMapSet = captureMethod(IntrinsicWeakMap.prototype, 'set');
const stringReplace = captureMethod(stringFrom.prototype, 'replace');
const stringToLowerCase = captureMethod(stringFrom.prototype, 'toLowerCase');
const stringTrim = captureMethod(stringFrom.prototype, 'trim');
function call<Result>(method: UnknownFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(method, receiver, args) as Result;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return call<Readonly<Value>>(objectFreeze, IntrinsicObject, [value]);
}
function ownData(source: unknown, key: PropertyKey): unknown {
    if (!source || typeof source !== 'object')
        return undefined;
    try {
        const descriptor = objectGetOwnPropertyDescriptor(source, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function ownCallable(source: object, key: PropertyKey): UnknownFunction {
    const value = ownData(source, key);
    if (typeof value !== 'function') {
        throw new IntrinsicTypeError(`[Foresight] Missing movement-flow owner method ${stringFrom(key)}.`);
    }
    return value as UnknownFunction;
}
function getMap<Key, Value>(map: Map<Key, Value>, key: Key): Value | undefined {
    return call<Value | undefined>(mapGet, map, [key]);
}
function hasMap<Key>(map: Map<Key, unknown>, key: Key): boolean {
    return call<boolean>(mapHas, map, [key]);
}
function setMap<Key, Value>(map: Map<Key, Value>, key: Key, value: Value): void {
    call(mapSet, map, [key, value]);
}
function deleteMap<Key>(map: Map<Key, unknown>, key: Key): void {
    call(mapDelete, map, [key]);
}
function getWeakMap<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return call<Value | undefined>(weakMapGet, map, [key]);
}
function setWeakMap<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    call(weakMapSet, map, [key, value]);
}
function deleteWeakMap<Key extends object>(map: WeakMap<Key, unknown>, key: Key): void {
    call(weakMapDelete, map, [key]);
}
function appendPrivate<Value>(values: Value[], value: Value): boolean {
    const index = values.length;
    try {
        call(objectDefineProperty as unknown as UnknownFunction, IntrinsicObject, [
            values,
            index,
            { value, writable: true, enumerable: true, configurable: true },
        ]);
        return values.length === index + 1 && ownData(values, index) === value;
    }
    catch {
        return false;
    }
}
function definePrivateIndex<Value>(values: Value[], index: number, value: Value): boolean {
    try {
        call(objectDefineProperty as unknown as UnknownFunction, IntrinsicObject, [
            values,
            index,
            { value, writable: true, enumerable: true, configurable: true },
        ]);
        return ownData(values, index) === value;
    }
    catch {
        return false;
    }
}
function privateIndex<Value>(values: Value[], index: number): Value | undefined {
    return ownData(values, index) as Value | undefined;
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
function exactIndex(value: unknown): number | null {
    return typeof value === 'number' && numberIsSafeInteger(value) && value >= 0 ? value : null;
}
function trimmedString(value: unknown): string {
    return typeof value === 'string' ? call<string>(stringTrim, value, []) : '';
}
function reasonFromLabel(value: unknown): string {
    if (typeof value !== 'string')
        return '';
    const trimmed = call<string>(stringTrim, value, []);
    const lower = call<string>(stringToLowerCase, trimmed, []);
    const separated = call<string>(stringReplace, lower, [/[^a-z0-9]+/gu, '-']);
    return call<string>(stringReplace, separated, [/^-|-$/gu, '']);
}
function selectBarrierReason(primary: unknown, labelReason: string, defaultReason: unknown): unknown {
    if (primary)
        return primary;
    if (labelReason)
        return labelReason;
    return defaultReason;
}
function validateListFacts(value: unknown, expectedKind: CollectionKind): ForesightScanListFacts | null {
    if (!value || typeof value !== 'object' || ownData(value, 'kind') !== expectedKind)
        return null;
    const length = ownData(value, 'length');
    if (expectedKind === 'movement-command') {
        if (length !== null)
            return null;
    }
    else if (typeof length !== 'number' || !numberIsSafeInteger(length) || length < 0) {
        return null;
    }
    return value as ForesightScanListFacts;
}
function validateCommandFacts(value: unknown, expectedIndex?: number): ForesightMovementCommandFacts | null {
    if (!value || typeof value !== 'object')
        return null;
    const index = ownData(value, 'index');
    const command = ownData(value, 'command');
    const metadata = ownData(value, 'metadata');
    if (exactIndex(index) === null ||
        (expectedIndex !== undefined && index !== expectedIndex) ||
        !command ||
        typeof command !== 'object' ||
        !metadata ||
        typeof metadata !== 'object') {
        return null;
    }
    return freezeExact({
        index: index as number,
        command: command as Readonly<Record<PropertyKey, unknown>>,
        metadata,
    });
}
function captureOwner(value: ForesightMovementListGenerationFacade): CapturedOwner {
    const receiver = value;
    return freezeExact({
        receiver,
        attachListGeneration: ownCallable(receiver, 'attachListGeneration'),
        readListFacts: ownCallable(receiver, 'readListFacts'),
        readCommand: ownCallable(receiver, 'readCommand'),
        readCommandFacts: ownCallable(receiver, 'readCommandFacts'),
        attestScanSession: ownCallable(receiver, 'attestScanSession'),
    });
}
function embeddedMovementGeneration(command: Readonly<Record<PropertyKey, unknown>>): unknown {
    const parameters = ownData(command, 'parameters');
    const route = ownData(parameters, '1');
    return ownData(route, 'list');
}
function continuationMovementGeneration(command: Readonly<Record<PropertyKey, unknown>>): unknown {
    return ownData(ownData(command, 'parameters'), '0');
}
function commandBarrier(facts: ForesightMovementCommandFacts): ForesightRouteBarrier | null {
    const code = primitiveNumber(ownData(facts.command, 'code'));
    if (code === null) {
        return freezeExact({ code: null, reason: 'unknown', label: 'Unknown movement-route command' });
    }
    const behavior = ownData(facts.metadata, 'scanBehavior');
    if (behavior === 'advance')
        return null;
    const rawReason = ownData(facts.metadata, 'reason');
    const label = ownData(facts.metadata, 'label');
    const classification = ownData(facts.metadata, 'classification');
    const labelReason = reasonFromLabel(label);
    const reason = selectBarrierReason(rawReason, labelReason, classification);
    return freezeExact({ code, reason, label });
}
export function createForesightMovementFlow(listGenerations: ForesightMovementListGenerationFacade): ForesightMovementFlowParts {
    const owner = captureOwner(listGenerations);
    const indexesBySession = new IntrinsicWeakMap<object, WeakMap<object, ControlFlowIndexState>>();
    function callOwner<Result>(method: UnknownFunction, args: readonly unknown[]): Result {
        return call<Result>(method, owner.receiver, args);
    }
    function scanCurrent(session: object): boolean {
        try {
            return callOwner<unknown>(owner.attestScanSession, [session]) === true;
        }
        catch {
            return false;
        }
    }
    function readOwnedCommand(session: object, generation: object, index: number): ForesightMovementCommandFacts | null {
        let window: Readonly<object> | null = null;
        let adoptionOpen = true;
        let sinkInFlight = false;
        const adoptWindow = (candidate: Readonly<object>): boolean => {
            if (!adoptionOpen || sinkInFlight || window || !candidate || typeof candidate !== 'object')
                return false;
            sinkInFlight = true;
            try {
                if (!adoptionOpen || window)
                    return false;
                window = candidate;
                return true;
            }
            finally {
                sinkInFlight = false;
            }
        };
        let accepted: boolean;
        try {
            accepted = callOwner<unknown>(owner.readCommand, [session, generation, index, adoptWindow]) === true;
        }
        catch {
            accepted = false;
        }
        finally {
            adoptionOpen = false;
        }
        if (!accepted || !window)
            return null;
        try {
            return validateCommandFacts(callOwner<unknown>(owner.readCommandFacts, [session, window]), index);
        }
        catch {
            return null;
        }
    }
    function readEventFacts(session: object, generation: object): ForesightScanListFacts | null {
        try {
            return validateListFacts(callOwner<unknown>(owner.readListFacts, [session, generation]), 'event-list');
        }
        catch {
            return null;
        }
    }
    function attachNestedFacts(session: object, generation: unknown, expectedKind: 'movement-list' | 'movement-command'): ForesightScanListFacts | null {
        if (!generation || typeof generation !== 'object')
            return null;
        try {
            return validateListFacts(callOwner<unknown>(owner.attachListGeneration, [session, generation]), expectedKind);
        }
        catch {
            return null;
        }
    }
    function missingRoute(metadata: unknown): ForesightMovementRouteRead {
        return freezeExact({
            transparent: false as const,
            stopReason: 'movement-route-missing-list' as const,
            metadata,
        });
    }
    function barrierRoute(metadata: unknown, barrier: ForesightRouteBarrier): ForesightMovementRouteRead {
        return freezeExact({
            transparent: false as const,
            stopReason: 'movement-route-barrier' as const,
            routeBarrierCode: barrier.code,
            routeBarrierReason: barrier.reason,
            routeBarrierLabel: barrier.label,
            metadata,
        });
    }
    function transparentRoute(metadata: unknown, nextIndex: number, commandCount: number): ForesightMovementRouteRead {
        return freezeExact({
            transparent: true as const,
            nextIndex,
            kind: 'movement-route' as const,
            routeCommandCount: commandCount,
            metadata,
        });
    }
    function readEmbeddedRoute(session: object, opener: ForesightMovementCommandFacts): EmbeddedRouteRead | null {
        const generation = embeddedMovementGeneration(opener.command);
        const facts = attachNestedFacts(session, generation, 'movement-list');
        const length = facts?.length;
        if (!facts || typeof length !== 'number' || length < 1 || !generation || typeof generation !== 'object') {
            return null;
        }
        let barrier: ForesightRouteBarrier | null = null;
        for (let index = 0; index < length; index += 1) {
            const command = readOwnedCommand(session, generation, index);
            if (!command)
                return null;
            barrier ??= commandBarrier(command);
        }
        return freezeExact({ commandCount: length, barrier });
    }
    function continuationBoundary(session: object, eventGeneration: object, startIndex: number, eventLength: number, expectedIndent: number): number {
        let cursor = startIndex + 1;
        while (cursor < eventLength) {
            const facts = readOwnedCommand(session, eventGeneration, cursor);
            if (!facts)
                break;
            const behavior = ownData(facts.metadata, 'scanBehavior');
            const indent = primitiveNumber(ownData(facts.command, 'indent')) ?? 0;
            if (behavior !== 'movement-route-line' || indent !== expectedIndent)
                break;
            cursor += 1;
        }
        return cursor;
    }
    function readContinuationRoute(session: object, eventGeneration: object, startIndex: number, eventLength: number, expectedIndent: number): Readonly<{
        nextIndex: number;
        commandCount: number;
        barrier: ForesightRouteBarrier | null;
    }> {
        let cursor = startIndex + 1;
        let commandCount = 0;
        let barrier: ForesightRouteBarrier | null = null;
        while (cursor < eventLength) {
            const eventFacts = readOwnedCommand(session, eventGeneration, cursor);
            if (!eventFacts)
                break;
            const behavior = ownData(eventFacts.metadata, 'scanBehavior');
            const indent = primitiveNumber(ownData(eventFacts.command, 'indent')) ?? 0;
            if (behavior !== 'movement-route-line' || indent !== expectedIndent)
                break;
            cursor += 1;
            const nestedGeneration = continuationMovementGeneration(eventFacts.command);
            if (!nestedGeneration || typeof nestedGeneration !== 'object')
                continue;
            const nestedFacts = attachNestedFacts(session, nestedGeneration, 'movement-command');
            if (!nestedFacts)
                continue;
            const routeCommand = readOwnedCommand(session, nestedGeneration, 0);
            if (!routeCommand)
                continue;
            commandCount += 1;
            barrier ??= commandBarrier(routeCommand);
        }
        return freezeExact({ nextIndex: cursor, commandCount, barrier });
    }
    function readMovementRouteCommand(session: unknown, generation: unknown, currentFacts: unknown, expectedIndent: unknown): ForesightMovementRouteRead {
        const opener = validateCommandFacts(currentFacts);
        const metadata = opener?.metadata ?? freezeExact({});
        if (!session || typeof session !== 'object' || !generation || typeof generation !== 'object' || !opener) {
            return missingRoute(metadata);
        }
        const eventFacts = readEventFacts(session, generation);
        const sourceIndex = exactIndex(opener.index);
        const eventLength = eventFacts?.length;
        if (!eventFacts || sourceIndex === null || typeof eventLength !== 'number' || sourceIndex >= eventLength) {
            return missingRoute(metadata);
        }
        const normalizedIndent = primitiveNumber(expectedIndent) ?? numberNaN;
        const embedded = readEmbeddedRoute(session, opener);
        if (embedded) {
            const nextIndex = continuationBoundary(session, generation, sourceIndex, eventLength, normalizedIndent);
            if (!scanCurrent(session))
                return missingRoute(metadata);
            return embedded.barrier
                ? barrierRoute(metadata, embedded.barrier)
                : transparentRoute(metadata, nextIndex, embedded.commandCount);
        }
        const continuation = readContinuationRoute(session, generation, sourceIndex, eventLength, normalizedIndent);
        if (!scanCurrent(session) || continuation.commandCount < 1)
            return missingRoute(metadata);
        return continuation.barrier
            ? barrierRoute(metadata, continuation.barrier)
            : transparentRoute(metadata, continuation.nextIndex, continuation.commandCount);
    }
    function captureControlFlowEntry(facts: ForesightMovementCommandFacts): CapturedControlFlowEntry | null {
        const index = exactIndex(facts.index);
        if (index === null)
            return null;
        const code = primitiveNumber(ownData(facts.metadata, 'code'));
        const indent = primitiveNumber(ownData(facts.command, 'indent')) ?? 0;
        const parameters = ownData(facts.command, 'parameters');
        const labelIdentity = code === 118 || code === 119 ? ownData(parameters, '0') : undefined;
        const targetLabelCandidate = ownData(facts.metadata, 'label');
        return freezeExact({
            index,
            code,
            indent,
            labelIdentity,
            targetCode: code,
            targetLabel: typeof targetLabelCandidate === 'string' ? targetLabelCandidate : 'End',
        });
    }
    function sameControlFlowEntry(left: CapturedControlFlowEntry, right: CapturedControlFlowEntry): boolean {
        return (left.index === right.index &&
            objectIs(left.code, right.code) &&
            objectIs(left.indent, right.indent) &&
            objectIs(left.labelIdentity, right.labelIdentity) &&
            objectIs(left.targetCode, right.targetCode) &&
            left.targetLabel === right.targetLabel);
    }
    function processControlFlowEntry(state: ControlFlowIndexState, entry: CapturedControlFlowEntry): boolean {
        if (entry.code === 118 &&
            typeof entry.labelIdentity === 'string' &&
            !hasMap(state.firstLabels, entry.labelIdentity)) {
            setMap(state.firstLabels, entry.labelIdentity, entry.index);
        }
        const depth = state.openLoops.length;
        if (entry.code === 113) {
            let pending = getMap(state.pendingBreaks, depth);
            if (!pending) {
                pending = [];
                setMap(state.pendingBreaks, depth, pending);
            }
            if (!appendPrivate(pending, entry.index))
                return false;
        }
        else if (entry.code === 112) {
            if (!appendPrivate(state.openLoops, entry.index))
                return false;
        }
        else if (entry.code === 413) {
            const pending = getMap(state.pendingBreaks, depth);
            if (pending) {
                for (let index = 0; index < pending.length; index += 1) {
                    const breakIndex = privateIndex(pending, index);
                    if (breakIndex !== undefined)
                        setMap(state.breakRepeats, breakIndex, entry.index);
                }
                deleteMap(state.pendingBreaks, depth);
            }
            const opening = call<number | undefined>(arrayPop, state.openLoops, []);
            if (opening !== undefined) {
                setMap(state.loopRepeats, opening, entry.index);
                setMap(state.repeatLoops, entry.index, opening);
            }
        }
        return true;
    }
    function sessionIndexes(session: object): WeakMap<object, ControlFlowIndexState> {
        let indexes = getWeakMap(indexesBySession, session);
        if (!indexes) {
            indexes = new IntrinsicWeakMap<object, ControlFlowIndexState>();
            setWeakMap(indexesBySession, session, indexes);
        }
        return indexes;
    }
    function controlFlowIndex(session: object, generation: object): {
        readonly indexes: WeakMap<object, ControlFlowIndexState>;
        readonly state: ControlFlowIndexState;
    } | null {
        const facts = readEventFacts(session, generation);
        if (!facts)
            return null;
        if (facts.length === null)
            return null;
        const indexes = sessionIndexes(session);
        let state = getWeakMap(indexes, facts);
        if (!state) {
            state = {
                facts,
                entries: new IntrinsicArray<CapturedControlFlowEntry>(facts.length),
                firstLabels: new IntrinsicMap<string, number>(),
                loopRepeats: new IntrinsicMap<number, number>(),
                breakRepeats: new IntrinsicMap<number, number>(),
                repeatLoops: new IntrinsicMap<number, number>(),
                openLoops: [],
                pendingBreaks: new IntrinsicMap<number, number[]>(),
                nextIndex: 0,
            };
            setWeakMap(indexes, facts, state);
        }
        return freezeExact({ indexes, state });
    }
    function ensureIndexedThrough(session: object, generation: object, state: ControlFlowIndexState, targetIndex: number, currentFacts: ForesightMovementCommandFacts): boolean {
        const currentIndex = currentFacts.index;
        if (targetIndex >= (state.facts.length ?? 0))
            return false;
        while (state.nextIndex <= targetIndex) {
            const facts = state.nextIndex === currentIndex
                ? currentFacts
                : readOwnedCommand(session, generation, state.nextIndex);
            if (!facts)
                return false;
            const entry = captureControlFlowEntry(facts);
            if (entry?.index !== state.nextIndex)
                return false;
            if (!definePrivateIndex(state.entries, state.nextIndex, entry))
                return false;
            if (!processControlFlowEntry(state, entry))
                return false;
            state.nextIndex += 1;
        }
        const suppliedEntry = captureControlFlowEntry(currentFacts);
        const indexedEntry = privateIndex(state.entries, currentIndex);
        return !indexedEntry || (!!suppliedEntry && sameControlFlowEntry(indexedEntry, suppliedEntry));
    }
    function createTarget(state: ControlFlowIndexState, sourceIndex: number, targetIndex: number, kind: string, targetName: unknown, labelName: unknown, viaIndex: number | null, viaCode: number | null, viaLabel: string): ForesightControlFlowTarget {
        const target = privateIndex(state.entries, targetIndex);
        const direction = targetIndex === sourceIndex ? 'self' : targetIndex < sourceIndex ? 'backward' : 'forward';
        return freezeExact({
            kind,
            sourceIndex,
            targetIndex,
            targetCode: target?.targetCode ?? null,
            targetLabel: target?.targetLabel ?? 'End',
            targetName: trimmedString(targetName),
            labelName: trimmedString(labelName),
            direction,
            viaIndex,
            viaCode,
            viaLabel,
        });
    }
    function resolveControlFlowTarget(session: unknown, generation: unknown, currentFacts: unknown): ForesightControlFlowTarget | null {
        if (!session || typeof session !== 'object' || !generation || typeof generation !== 'object')
            return null;
        const current = validateCommandFacts(currentFacts);
        if (!current)
            return null;
        const sourceIndex = current.index;
        const indexed = controlFlowIndex(session, generation);
        if (!indexed || sourceIndex >= (indexed.state.facts.length ?? 0))
            return null;
        const { indexes, state } = indexed;
        if (!ensureIndexedThrough(session, generation, state, sourceIndex, current))
            return null;
        const source = privateIndex(state.entries, sourceIndex);
        if (!source)
            return null;
        let target: ForesightControlFlowTarget | null = null;
        if (source.code === 119 && typeof source.labelIdentity === 'string') {
            while (!hasMap(state.firstLabels, source.labelIdentity) && state.nextIndex < (state.facts.length ?? 0)) {
                if (!ensureIndexedThrough(session, generation, state, state.nextIndex, current))
                    break;
            }
            const targetIndex = getMap(state.firstLabels, source.labelIdentity);
            if (targetIndex !== undefined) {
                target = createTarget(state, sourceIndex, targetIndex, 'jump-label', source.labelIdentity, source.labelIdentity, null, null, '');
            }
        }
        else if (source.code === 112) {
            while (!hasMap(state.loopRepeats, sourceIndex) && state.nextIndex < (state.facts.length ?? 0)) {
                if (!ensureIndexedThrough(session, generation, state, state.nextIndex, current))
                    break;
            }
            const repeatIndex = getMap(state.loopRepeats, sourceIndex);
            if (repeatIndex !== undefined) {
                target = createTarget(state, sourceIndex, repeatIndex, 'loop-repeat', '', '', repeatIndex, 413, 'Repeat Above');
            }
        }
        else if (source.code === 113) {
            while (!hasMap(state.breakRepeats, sourceIndex) && state.nextIndex < (state.facts.length ?? 0)) {
                if (!ensureIndexedThrough(session, generation, state, state.nextIndex, current))
                    break;
            }
            const repeatIndex = getMap(state.breakRepeats, sourceIndex);
            if (repeatIndex !== undefined) {
                const targetIndex = repeatIndex + 1;
                if (targetIndex === (state.facts.length ?? 0) ||
                    ensureIndexedThrough(session, generation, state, targetIndex, current)) {
                    target = createTarget(state, sourceIndex, targetIndex, 'break-loop', '', '', repeatIndex, 413, 'Repeat Above');
                }
            }
        }
        else if (source.code === 413) {
            const loopIndex = getMap(state.repeatLoops, sourceIndex);
            if (loopIndex !== undefined) {
                target = createTarget(state, sourceIndex, loopIndex, 'repeat-loop', '', '', loopIndex, 112, 'Loop');
            }
        }
        if (!scanCurrent(session)) {
            deleteWeakMap(indexes, state.facts);
            return null;
        }
        return target;
    }
    return freezeExact({ readMovementRouteCommand, resolveControlFlowTarget });
}
