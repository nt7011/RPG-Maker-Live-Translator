import { DEFAULT_MAX_SCAN_COMMANDS, MAX_BRANCH_DEPTH, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, } from './constants.js';
type RuntimeCallback = (...args: unknown[]) => unknown;
type ObjectReference = object | RuntimeCallback;
type CollectionKind = 'event-list' | 'movement-list' | 'movement-command';
type SessionPhase = 'preparing' | 'publishing' | 'active' | 'retiring' | 'retired';
type WindowPhase = 'active' | 'retiring' | 'retired';
type LeasePhase = 'publishing' | 'active' | 'retiring' | 'retired';
declare const foresightScanListSessionBrand: unique symbol;
declare const foresightScanCommandWindowBrand: unique symbol;
export interface ForesightScanListSession {
    readonly [foresightScanListSessionBrand]: true;
}
export interface ForesightScanCommandWindow {
    readonly [foresightScanCommandWindowBrand]: true;
}
export type ForesightScanListGeneration = Readonly<object>;
export interface ForesightScanListFacts {
    readonly identity: Readonly<object>;
    readonly kind: CollectionKind;
    readonly length: number | null;
}
export interface ForesightScanCommandFacts {
    readonly index: number;
    readonly command: Readonly<Record<PropertyKey, unknown>>;
    readonly metadata: Readonly<object>;
}
export interface ForesightScanCommandPreview {
    readonly index: number;
    readonly code: number;
    readonly indent: number | null;
    readonly label: string;
    readonly classification: string;
}
export interface ForesightDiagnosticCommandPreview {
    readonly index: number;
    readonly code: number;
    readonly indent: number | null;
}
export interface ForesightScanListStructuralCounters {
    readonly generationAdmissions: number;
    readonly generationRetains: number;
    readonly generationReleases: number;
    readonly liveGenerations: number;
    readonly commandReadRequests: number;
    readonly uniqueIndexReads: number;
    readonly commandProjections: number;
    readonly cacheHits: number;
    readonly receiptsIssued: number;
    readonly receiptsRetired: number;
    readonly liveReceipts: number;
    readonly shallowSessionAttestations: number;
    readonly deepSessionAttestations: number;
    readonly deepGenerationVisits: number;
    readonly deepReceiptVisits: number;
}
type AdoptCatalogGeneration = (generation: unknown, facts: unknown) => boolean;
type AdoptCatalogWindow = (window: unknown, receipt: unknown) => boolean;
type AdoptGeneration = (generation: ForesightScanListGeneration, facts: ForesightScanListFacts, release: () => boolean, attest: () => boolean) => boolean;
type AdoptSession = (session: ForesightScanListSession, release: () => boolean, attest: () => boolean) => boolean;
type AdoptWindow = (window: ForesightScanCommandWindow) => boolean;
export interface ForesightScanListGenerationCatalog {
    readonly admitEventCommandList: (source: unknown, adoptGeneration: AdoptCatalogGeneration) => boolean;
    readonly retainCommandListGeneration: (generation: unknown, adoptGeneration: AdoptCatalogGeneration) => boolean;
    readonly readCommandListGeneration: (generation: unknown) => ForesightScanListFacts | null;
    readonly attestCommandListGeneration: (generation: unknown) => boolean;
    readonly retireCommandListGeneration: (generation: unknown) => boolean;
    readonly attestEventCommandListBinding: (generation: unknown, observedSource: unknown) => boolean;
    readonly captureEventCommandProjectionWindow: (generation: unknown, startIndex: unknown, maximumCount: unknown, adoptWindow: AdoptCatalogWindow) => boolean;
    readonly captureMovementCommandProjectionWindow: (generation: unknown, startIndex: unknown, maximumCount: unknown, adoptWindow: AdoptCatalogWindow) => boolean;
    readonly attestCommandProjectionWindow: (receipt: unknown) => boolean;
    readonly retireCommandProjectionWindow: (receipt: unknown) => boolean;
}
export interface ForesightScanListGenerationOwnerDependencies {
    readonly catalog: ForesightScanListGenerationCatalog;
    readonly recordStructuralCounters?: (counters: ForesightScanListStructuralCounters) => unknown;
}
export interface ForesightScanListGenerationOwner {
    admitEventListGeneration(source: unknown, adoptGeneration: AdoptGeneration): boolean;
    retainListGeneration(generation: unknown, adoptGeneration: AdoptGeneration): boolean;
    attestEventListBinding(generation: unknown, observedSource: unknown): boolean;
    beginScan(generations: unknown, adoptSession: AdoptSession): boolean;
    attachListGeneration(session: unknown, generation: unknown): ForesightScanListFacts | null;
    readListFacts(session: unknown, generation: unknown): ForesightScanListFacts | null;
    readCommand(session: unknown, generation: unknown, index: unknown, adoptWindow: AdoptWindow): boolean;
    readCommandFacts(session: unknown, window: unknown): ForesightScanCommandFacts | null;
    readCommandPreview(session: unknown, window: unknown): ForesightScanCommandPreview | null;
    captureDiagnosticConsumedCommands(session: unknown, generation: unknown, startIndex: unknown, endIndexExclusive: unknown, adoptPreview: (preview: readonly ForesightDiagnosticCommandPreview[]) => boolean): boolean;
    attestScanSession(session: unknown): boolean;
    attestScan(session: unknown): boolean;
}
interface CapturedCatalog {
    readonly receiver: object;
    readonly admitEventCommandList: RuntimeCallback;
    readonly retainCommandListGeneration: RuntimeCallback;
    readonly readCommandListGeneration: RuntimeCallback;
    readonly attestCommandListGeneration: RuntimeCallback;
    readonly retireCommandListGeneration: RuntimeCallback;
    readonly attestEventCommandListBinding: RuntimeCallback;
    readonly captureEventCommandProjectionWindow: RuntimeCallback;
    readonly captureMovementCommandProjectionWindow: RuntimeCallback;
    readonly attestCommandProjectionWindow: RuntimeCallback;
    readonly retireCommandProjectionWindow: RuntimeCallback;
}
interface MutableCounters {
    generationAdmissions: number;
    generationRetains: number;
    generationReleases: number;
    liveGenerations: number;
    commandReadRequests: number;
    uniqueIndexReads: number;
    commandProjections: number;
    cacheHits: number;
    receiptsIssued: number;
    receiptsRetired: number;
    liveReceipts: number;
    shallowSessionAttestations: number;
    deepSessionAttestations: number;
    deepGenerationVisits: number;
    deepReceiptVisits: number;
}
interface ExternalGenerationLease {
    readonly generation: object;
    readonly facts: ForesightScanListFacts;
    phase: LeasePhase;
    releaseRequested: boolean;
    releaseInFlight: boolean;
    cleanupSlotReserved: boolean;
}
interface SessionGenerationLease {
    readonly sourceGeneration: object;
    readonly generation: object;
    readonly facts: ForesightScanListFacts;
    readonly revision: ListRevision;
    retired: boolean;
}
interface ListRevision {
    readonly facts: ForesightScanListFacts;
    readonly commands: Map<number, WindowRecord>;
}
interface ReceiptRecord {
    readonly receipt: object;
    retired: boolean;
}
interface WindowRecord {
    readonly handle: ForesightScanCommandWindow;
    readonly session: SessionRecord;
    readonly revision: ListRevision;
    readonly index: number;
    readonly facts: ForesightScanCommandFacts;
    readonly preview: ForesightScanCommandPreview;
    readonly receipt: ReceiptRecord;
    phase: WindowPhase;
}
interface SessionOperation {
    readonly token: object;
    readonly kind: 'attach' | 'facts' | 'read' | 'window-facts' | 'window-preview' | 'diagnostic' | 'attest';
}
interface SessionRecord {
    readonly handle: ForesightScanListSession;
    readonly generationsBySource: Map<object, SessionGenerationLease>;
    readonly generationLeases: Map<object, SessionGenerationLease>;
    readonly revisions: Map<object, ListRevision>;
    readonly receipts: Map<object, ReceiptRecord>;
    readonly counters: MutableCounters;
    phase: SessionPhase;
    operation: SessionOperation | null;
    releaseRequested: boolean;
    releaseInFlight: boolean;
    reservedGenerations: number;
    reservedWindows: number;
    reservedReceipts: number;
    liveWindows: number;
    countersPublished: boolean;
    cleanupSlotReserved: boolean;
}
interface CatalogWindowRow {
    readonly index: number;
    readonly command: Readonly<Record<PropertyKey, unknown>>;
    readonly metadata: Readonly<object>;
}
interface CatalogWindowCapture {
    readonly kind: CollectionKind;
    readonly startIndex: number;
    readonly nextIndex: number;
    readonly complete: boolean;
    readonly commands: readonly CatalogWindowRow[];
}
interface PendingCatalogGeneration {
    generation: object | null;
    facts: ForesightScanListFacts | null;
    adopted: boolean;
    open: boolean;
    sinkInFlight: boolean;
}
interface PendingCatalogWindow {
    window: CatalogWindowCapture | null;
    receipt: object | null;
    adopted: boolean;
    open: boolean;
    sinkInFlight: boolean;
}
const MAX_SESSION_WINDOWS = DEFAULT_MAX_SCAN_COMMANDS;
const MAX_SESSION_RECEIPTS = MAX_SESSION_WINDOWS;
const MAX_DIAGNOSTIC_PREVIEW_COMMANDS = 256;
const MAX_SESSION_GENERATIONS = DEFAULT_MAX_SCAN_COMMANDS * MAX_NESTED_LISTS_PER_COMMAND + MAX_NESTED_LIST_DEPTH + MAX_BRANCH_DEPTH + 1;
const MAX_PENDING_EXTERNAL_RETIREMENTS = MAX_SESSION_GENERATIONS;
const MAX_PENDING_SESSION_RETIREMENTS = MAX_SESSION_GENERATIONS;
const IntrinsicObject = Object;
const IntrinsicArray = Array;
const IntrinsicMap = Map;
const IntrinsicWeakMap = WeakMap;
const IntrinsicTypeError = TypeError;
const IntrinsicRangeError = RangeError;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectIsFrozen = Object.isFrozen;
const arrayIsArray = Array.isArray;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const numberIsSafeInteger = Number.isSafeInteger;
const stringFrom = String;
const mapGet = Map.prototype.get;
const mapSet = Map.prototype.set;
const mapDelete = Map.prototype.delete;
const mapForEach = Map.prototype.forEach as RuntimeCallback;
const mapSizeGetter = objectGetOwnPropertyDescriptor(Map.prototype, 'size')?.get;
const weakMapGet = WeakMap.prototype.get as RuntimeCallback;
const weakMapSet = WeakMap.prototype.set as RuntimeCallback;
function call<Result>(callback: RuntimeCallback, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(callback, receiver, args) as Result;
}
function isObjectReference(value: unknown): value is ObjectReference {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function ownData(value: unknown, key: PropertyKey): unknown {
    if (!isObjectReference(value))
        return undefined;
    try {
        const descriptor = objectGetOwnPropertyDescriptor(value, key);
        return descriptor && 'value' in descriptor ? (descriptor as {
            readonly value: unknown;
        }).value : undefined;
    }
    catch {
        return undefined;
    }
}
function ownCallable(value: unknown, key: PropertyKey): RuntimeCallback {
    const candidate = ownData(value, key);
    if (typeof candidate !== 'function') {
        throw new IntrinsicTypeError(`[Foresight] Missing scan-list catalog method ${stringFrom(key)}.`);
    }
    return candidate as RuntimeCallback;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    const frozen = call<unknown>(objectFreeze, IntrinsicObject, [value]);
    if (frozen !== value || !call<boolean>(objectIsFrozen, IntrinsicObject, [value])) {
        throw new IntrinsicTypeError('[Foresight] Could not freeze scan-list authority value.');
    }
    return value;
}
function createOpaqueHandle<Value extends object>(): Value {
    const handle = call<object>(objectCreate as RuntimeCallback, IntrinsicObject, [null]);
    return freezeExact(handle) as Value;
}
function isOpaqueHandle(value: unknown): value is object {
    if (!value || typeof value !== 'object')
        return false;
    try {
        const keys = reflectOwnKeys(value);
        return (keys.length === 0 &&
            call<object | null>(objectGetPrototypeOf, IntrinsicObject, [value]) === null &&
            call<boolean>(objectIsFrozen, IntrinsicObject, [value]));
    }
    catch {
        return false;
    }
}
function exactMapSize(map: Map<unknown, unknown>): number {
    if (typeof mapSizeGetter !== 'function') {
        throw new IntrinsicTypeError('[Foresight] Missing intrinsic Map size getter.');
    }
    const size = call<unknown>(mapSizeGetter as RuntimeCallback, map, []);
    if (typeof size !== 'number' || !numberIsSafeInteger(size) || size < 0) {
        throw new IntrinsicRangeError('[Foresight] Invalid private scan-list Map size.');
    }
    return size;
}
function getMap<Key, Value>(map: Map<Key, Value>, key: Key): Value | undefined {
    return call<Value | undefined>(mapGet, map, [key]);
}
function setMap<Key, Value>(map: Map<Key, Value>, key: Key, value: Value): void {
    call(mapSet, map, [key, value]);
}
function deleteMap<Key, Value>(map: Map<Key, Value>, key: Key): boolean {
    return call<boolean>(mapDelete, map, [key]);
}
function snapshotMapValues<Value>(map: Map<unknown, Value>, maximumCount: number): readonly Value[] | null {
    try {
        const size = exactMapSize(map);
        if (size > maximumCount)
            return null;
        const values = new IntrinsicArray<Value>(size);
        let index = 0;
        call(mapForEach, map, [
            (value: Value) => {
                if (index >= size)
                    throw new IntrinsicRangeError('[Foresight] Scan-list Map changed during snapshot.');
                call(objectDefineProperty as RuntimeCallback, IntrinsicObject, [
                    values,
                    index,
                    {
                        value,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    },
                ]);
                index += 1;
            },
        ]);
        if (index !== size || exactMapSize(map) !== size)
            return null;
        return freezeExact(values);
    }
    catch {
        return null;
    }
}
function getWeakMap<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return call<Value | undefined>(weakMapGet, map, [key]);
}
function setWeakMap<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    call(weakMapSet, map, [key, value]);
}
function captureCatalog(dependencies: unknown): CapturedCatalog {
    const catalog = ownData(dependencies, 'catalog');
    if (!catalog || typeof catalog !== 'object') {
        throw new IntrinsicTypeError('[Foresight] Scan-list generation owner requires a catalog.');
    }
    return freezeExact({
        receiver: catalog,
        admitEventCommandList: ownCallable(catalog, 'admitEventCommandList'),
        retainCommandListGeneration: ownCallable(catalog, 'retainCommandListGeneration'),
        readCommandListGeneration: ownCallable(catalog, 'readCommandListGeneration'),
        attestCommandListGeneration: ownCallable(catalog, 'attestCommandListGeneration'),
        retireCommandListGeneration: ownCallable(catalog, 'retireCommandListGeneration'),
        attestEventCommandListBinding: ownCallable(catalog, 'attestEventCommandListBinding'),
        captureEventCommandProjectionWindow: ownCallable(catalog, 'captureEventCommandProjectionWindow'),
        captureMovementCommandProjectionWindow: ownCallable(catalog, 'captureMovementCommandProjectionWindow'),
        attestCommandProjectionWindow: ownCallable(catalog, 'attestCommandProjectionWindow'),
        retireCommandProjectionWindow: ownCallable(catalog, 'retireCommandProjectionWindow'),
    });
}
function validateGenerationFacts(value: unknown): ForesightScanListFacts | null {
    if (!value || typeof value !== 'object')
        return null;
    try {
        if (!call<boolean>(objectIsFrozen, IntrinsicObject, [value]))
            return null;
        const identity = ownData(value, 'identity');
        const kind = ownData(value, 'kind');
        const length = ownData(value, 'length');
        if (!isOpaqueHandle(identity))
            return null;
        if (kind !== 'event-list' && kind !== 'movement-list' && kind !== 'movement-command')
            return null;
        if (kind === 'movement-command') {
            if (length !== null)
                return null;
        }
        else if (typeof length !== 'number' || !numberIsSafeInteger(length) || length < 0) {
            return null;
        }
        return value as ForesightScanListFacts;
    }
    catch {
        return null;
    }
}
function sameGenerationFacts(left: ForesightScanListFacts, right: ForesightScanListFacts | null): boolean {
    return left === right;
}
function captureGenerationArray(value: unknown): readonly object[] | null {
    try {
        if (!arrayIsArray(value))
            return null;
        const length = ownData(value, 'length');
        if (typeof length !== 'number' ||
            !numberIsSafeInteger(length) ||
            length < 1 ||
            length > MAX_SESSION_GENERATIONS) {
            return null;
        }
        const captured = new IntrinsicArray<object>(length);
        for (let index = 0; index < length; index += 1) {
            const generation = ownData(value, index);
            if (!isOpaqueHandle(generation))
                return null;
            const descriptor = objectGetOwnPropertyDescriptor(captured, index);
            if (descriptor)
                return null;
            call(objectDefineProperty as RuntimeCallback, IntrinsicObject, [
                captured,
                index,
                {
                    value: generation,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                },
            ]);
        }
        return freezeExact(captured);
    }
    catch {
        return null;
    }
}
function createCounters(): MutableCounters {
    return {
        generationAdmissions: 0,
        generationRetains: 0,
        generationReleases: 0,
        liveGenerations: 0,
        commandReadRequests: 0,
        uniqueIndexReads: 0,
        commandProjections: 0,
        cacheHits: 0,
        receiptsIssued: 0,
        receiptsRetired: 0,
        liveReceipts: 0,
        shallowSessionAttestations: 0,
        deepSessionAttestations: 0,
        deepGenerationVisits: 0,
        deepReceiptVisits: 0,
    };
}
function increment(counter: MutableCounters, key: keyof MutableCounters): void {
    const next = counter[key] + 1;
    if (!numberIsSafeInteger(next))
        throw new IntrinsicRangeError('[Foresight] Scan-list counter overflow.');
    counter[key] = next;
}
function captureCounterRecord(counters: MutableCounters): ForesightScanListStructuralCounters {
    return freezeExact({
        generationAdmissions: counters.generationAdmissions,
        generationRetains: counters.generationRetains,
        generationReleases: counters.generationReleases,
        liveGenerations: counters.liveGenerations,
        commandReadRequests: counters.commandReadRequests,
        uniqueIndexReads: counters.uniqueIndexReads,
        commandProjections: counters.commandProjections,
        cacheHits: counters.cacheHits,
        receiptsIssued: counters.receiptsIssued,
        receiptsRetired: counters.receiptsRetired,
        liveReceipts: counters.liveReceipts,
        shallowSessionAttestations: counters.shallowSessionAttestations,
        deepSessionAttestations: counters.deepSessionAttestations,
        deepGenerationVisits: counters.deepGenerationVisits,
        deepReceiptVisits: counters.deepReceiptVisits,
    });
}
function captureCatalogWindow(value: unknown, expectedKind: CollectionKind, expectedIndex: number): CatalogWindowCapture | null {
    if (!value || typeof value !== 'object')
        return null;
    try {
        if (!call<boolean>(objectIsFrozen, IntrinsicObject, [value]))
            return null;
        const kind = ownData(value, 'kind');
        const startIndex = ownData(value, 'startIndex');
        const nextIndex = ownData(value, 'nextIndex');
        const complete = ownData(value, 'complete');
        const commands = ownData(value, 'commands');
        if (kind !== expectedKind ||
            startIndex !== expectedIndex ||
            nextIndex !== expectedIndex + 1 ||
            typeof complete !== 'boolean' ||
            !arrayIsArray(commands) ||
            ownData(commands, 'length') !== 1 ||
            !call<boolean>(objectIsFrozen, IntrinsicObject, [commands])) {
            return null;
        }
        const row = ownData(commands, 0);
        if (!row || typeof row !== 'object' || !call<boolean>(objectIsFrozen, IntrinsicObject, [row]))
            return null;
        const index = ownData(row, 'index');
        const command = ownData(row, 'command');
        const metadata = ownData(row, 'metadata');
        if (index !== expectedIndex ||
            !command ||
            typeof command !== 'object' ||
            !metadata ||
            typeof metadata !== 'object' ||
            !call<boolean>(objectIsFrozen, IntrinsicObject, [command]) ||
            !call<boolean>(objectIsFrozen, IntrinsicObject, [metadata])) {
            return null;
        }
        return value as CatalogWindowCapture;
    }
    catch {
        return null;
    }
}
function logicalGenerationLength(facts: ForesightScanListFacts): number {
    return facts.kind === 'movement-command' ? 1 : (facts.length ?? 0);
}
function createCommandPreview(row: CatalogWindowRow): ForesightScanCommandPreview | null {
    const code = ownData(row.command, 'code');
    const indentCandidate = ownData(row.command, 'indent');
    const label = ownData(row.metadata, 'label');
    const classification = ownData(row.metadata, 'classification');
    if (typeof code !== 'number' ||
        !numberIsSafeInteger(code) ||
        (indentCandidate !== undefined &&
            (typeof indentCandidate !== 'number' || !numberIsSafeInteger(indentCandidate))) ||
        typeof label !== 'string' ||
        typeof classification !== 'string') {
        return null;
    }
    return freezeExact({
        index: row.index,
        code,
        indent: typeof indentCandidate === 'number' ? indentCandidate : null,
        label,
        classification,
    });
}
export function createForesightScanListGenerationOwner(dependencies: ForesightScanListGenerationOwnerDependencies): ForesightScanListGenerationOwner {
    const catalog = captureCatalog(dependencies);
    const counterPortCandidate = ownData(dependencies, 'recordStructuralCounters');
    const recordStructuralCounters = typeof counterPortCandidate === 'function' ? (counterPortCandidate as RuntimeCallback) : null;
    const externalLeases = new IntrinsicWeakMap<object, ExternalGenerationLease>();
    const pendingExternalRetirements = new IntrinsicMap<object, ExternalGenerationLease>();
    const pendingSessionRetirements = new IntrinsicMap<object, SessionRecord>();
    const sessions = new IntrinsicWeakMap<object, SessionRecord>();
    const windows = new IntrinsicWeakMap<object, WindowRecord>();
    let reservedPendingExternalRetirements = 0;
    let reservedPendingSessionRetirements = 0;
    function catalogCall<Result>(callback: RuntimeCallback, args: readonly unknown[]): Result {
        return call<Result>(callback, catalog.receiver, args);
    }
    function readCatalogFacts(generation: object): ForesightScanListFacts | null {
        try {
            const facts = catalogCall<unknown>(catalog.readCommandListGeneration, [generation]);
            return validateGenerationFacts(facts);
        }
        catch {
            return null;
        }
    }
    function attestCatalogGeneration(generation: object, facts: ForesightScanListFacts): boolean {
        try {
            const current = readCatalogFacts(generation);
            if (!sameGenerationFacts(facts, current))
                return false;
            return catalogCall<unknown>(catalog.attestCommandListGeneration, [generation]) === true;
        }
        catch {
            return false;
        }
    }
    function settleCatalogGeneration(generation: object): boolean {
        try {
            if (catalogCall<unknown>(catalog.retireCommandListGeneration, [generation]) === true)
                return true;
        }
        catch {
        }
        try {
            return catalogCall<unknown>(catalog.attestCommandListGeneration, [generation]) !== true;
        }
        catch {
            return false;
        }
    }
    function settleCatalogReceipt(receipt: object): boolean {
        try {
            if (catalogCall<unknown>(catalog.retireCommandProjectionWindow, [receipt]) === true)
                return true;
        }
        catch {
        }
        try {
            return catalogCall<unknown>(catalog.attestCommandProjectionWindow, [receipt]) !== true;
        }
        catch {
            return false;
        }
    }
    function releaseExternalCleanupSlot(record: ExternalGenerationLease): void {
        deleteMap(pendingExternalRetirements, record.generation);
        if (!record.cleanupSlotReserved)
            return;
        record.cleanupSlotReserved = false;
        reservedPendingExternalRetirements -= 1;
    }
    function retainPendingExternalRetirement(record: ExternalGenerationLease): void {
        if (!record.cleanupSlotReserved)
            return;
        setMap(pendingExternalRetirements, record.generation, record);
    }
    function drainPendingExternalRetirements(): void {
        try {
            const snapshot = snapshotMapValues(pendingExternalRetirements, MAX_SESSION_GENERATIONS);
            if (!snapshot)
                return;
            for (let index = 0; index < snapshot.length; index += 1) {
                const record = ownData(snapshot, index) as ExternalGenerationLease | undefined;
                if (!record)
                    continue;
                if (record.phase === 'retired' || settleCatalogGeneration(record.generation)) {
                    record.phase = 'retired';
                    releaseExternalCleanupSlot(record);
                }
            }
        }
        catch {
        }
    }
    function continueExternalRelease(record: ExternalGenerationLease): boolean {
        if (record.phase === 'retired')
            return false;
        if (record.releaseInFlight) {
            record.releaseRequested = true;
            return false;
        }
        if (record.phase === 'publishing') {
            record.releaseRequested = true;
            return false;
        }
        record.phase = 'retiring';
        record.releaseInFlight = true;
        let settled: boolean;
        try {
            settled = settleCatalogGeneration(record.generation);
        }
        finally {
            record.releaseInFlight = false;
        }
        if (!settled) {
            retainPendingExternalRetirement(record);
            return false;
        }
        record.phase = 'retired';
        record.releaseRequested = false;
        releaseExternalCleanupSlot(record);
        return true;
    }
    function externalLeaseIsCurrent(record: ExternalGenerationLease, allowPublishing = false): boolean {
        return ((record.phase === 'active' || (allowPublishing && record.phase === 'publishing')) &&
            !record.releaseRequested &&
            getWeakMap(externalLeases, record.generation) === record);
    }
    function attestExternalLease(record: ExternalGenerationLease): boolean {
        if (!externalLeaseIsCurrent(record, true))
            return false;
        return attestCatalogGeneration(record.generation, record.facts) && externalLeaseIsCurrent(record, true);
    }
    function acquireExternalGeneration(method: RuntimeCallback, source: unknown, adoptGeneration: unknown): boolean {
        drainPendingExternalRetirements();
        drainPendingSessionRetirements();
        if (typeof adoptGeneration !== 'function')
            return false;
        if (reservedPendingExternalRetirements >= MAX_PENDING_EXTERNAL_RETIREMENTS)
            return false;
        reservedPendingExternalRetirements += 1;
        let reservationOwned = true;
        try {
            const pending: PendingCatalogGeneration = {
                generation: null,
                facts: null,
                adopted: false,
                open: true,
                sinkInFlight: false,
            };
            const lowerAdopter: AdoptCatalogGeneration = (generation, facts) => {
                if (!pending.open || pending.sinkInFlight || pending.adopted || !isOpaqueHandle(generation)) {
                    return false;
                }
                pending.sinkInFlight = true;
                try {
                    const normalizedFacts = validateGenerationFacts(facts);
                    if (!normalizedFacts || !pending.open || pending.adopted)
                        return false;
                    pending.generation = generation;
                    pending.facts = normalizedFacts;
                    pending.adopted = true;
                    return pending.open;
                }
                finally {
                    pending.sinkInFlight = false;
                }
            };
            let lowerAccepted: boolean;
            try {
                lowerAccepted = catalogCall<unknown>(method, [source, lowerAdopter]) === true;
            }
            catch {
                lowerAccepted = false;
            }
            finally {
                pending.open = false;
            }
            const generation = pending.generation;
            const facts = pending.facts;
            if (!lowerAccepted || !pending.adopted || !generation || !facts) {
                if (generation) {
                    const orphan: ExternalGenerationLease = {
                        generation,
                        facts: facts ??
                            freezeExact({
                                identity: createOpaqueHandle(),
                                kind: 'event-list',
                                length: 0,
                            }),
                        phase: 'retiring',
                        releaseRequested: true,
                        releaseInFlight: false,
                        cleanupSlotReserved: true,
                    };
                    reservationOwned = false;
                    setWeakMap(externalLeases, generation, orphan);
                    if (!settleCatalogGeneration(generation))
                        retainPendingExternalRetirement(orphan);
                    else {
                        orphan.phase = 'retired';
                        releaseExternalCleanupSlot(orphan);
                    }
                }
                return false;
            }
            if (!attestCatalogGeneration(generation, facts)) {
                const stale: ExternalGenerationLease = {
                    generation,
                    facts,
                    phase: 'retiring',
                    releaseRequested: true,
                    releaseInFlight: false,
                    cleanupSlotReserved: true,
                };
                reservationOwned = false;
                setWeakMap(externalLeases, generation, stale);
                if (!settleCatalogGeneration(generation))
                    retainPendingExternalRetirement(stale);
                else {
                    stale.phase = 'retired';
                    releaseExternalCleanupSlot(stale);
                }
                return false;
            }
            const record: ExternalGenerationLease = {
                generation,
                facts,
                phase: 'publishing',
                releaseRequested: false,
                releaseInFlight: false,
                cleanupSlotReserved: true,
            };
            reservationOwned = false;
            setWeakMap(externalLeases, generation, record);
            const release = () => continueExternalRelease(record);
            const attest = () => attestExternalLease(record);
            let adopted: boolean;
            try {
                adopted =
                    call<unknown>(adoptGeneration as RuntimeCallback, undefined, [
                        generation,
                        facts,
                        release,
                        attest,
                    ]) === true;
            }
            catch {
                adopted = false;
            }
            const catalogCurrent = adopted && attestCatalogGeneration(generation, facts);
            if (!catalogCurrent || !externalLeaseIsCurrent(record, true)) {
                record.phase = 'retiring';
                continueExternalRelease(record);
                return false;
            }
            record.phase = 'active';
            return true;
        }
        finally {
            if (reservationOwned)
                reservedPendingExternalRetirements -= 1;
        }
    }
    function admitEventListGeneration(source: unknown, adoptGeneration: AdoptGeneration): boolean {
        return acquireExternalGeneration(catalog.admitEventCommandList, source, adoptGeneration);
    }
    function retainListGeneration(generation: unknown, adoptGeneration: AdoptGeneration): boolean {
        if (!isOpaqueHandle(generation))
            return false;
        return acquireExternalGeneration(catalog.retainCommandListGeneration, generation, adoptGeneration);
    }
    function attestEventListBinding(generation: unknown, observedSource: unknown): boolean {
        drainPendingExternalRetirements();
        drainPendingSessionRetirements();
        if (!isOpaqueHandle(generation))
            return false;
        const record = getWeakMap(externalLeases, generation);
        if (record?.phase !== 'active' || record.releaseRequested)
            return false;
        let bound: boolean;
        try {
            bound = catalogCall<unknown>(catalog.attestEventCommandListBinding, [generation, observedSource]) === true;
        }
        catch {
            bound = false;
        }
        return bound && record.phase === 'active' && !record.releaseRequested && attestExternalLease(record);
    }
    function createSessionRecord(): SessionRecord {
        const handle = createOpaqueHandle<ForesightScanListSession>();
        const record: SessionRecord = {
            handle,
            generationsBySource: new IntrinsicMap<object, SessionGenerationLease>(),
            generationLeases: new IntrinsicMap<object, SessionGenerationLease>(),
            revisions: new IntrinsicMap<object, ListRevision>(),
            receipts: new IntrinsicMap<object, ReceiptRecord>(),
            counters: createCounters(),
            phase: 'preparing',
            operation: null,
            releaseRequested: false,
            releaseInFlight: false,
            reservedGenerations: 0,
            reservedWindows: 0,
            reservedReceipts: 0,
            liveWindows: 0,
            countersPublished: false,
            cleanupSlotReserved: true,
        };
        setWeakMap(sessions, handle, record);
        return record;
    }
    function isSessionCurrent(record: SessionRecord): boolean {
        return ((record.phase === 'preparing' || record.phase === 'publishing' || record.phase === 'active') &&
            !record.releaseRequested);
    }
    function isSessionAuthorityCurrent(record: SessionRecord, allowPublishing = false): boolean {
        return ((record.phase === 'active' || (allowPublishing && record.phase === 'publishing')) &&
            !record.releaseRequested &&
            getWeakMap(sessions, record.handle) === record);
    }
    function attestSessionCurrent(record: SessionRecord, allowPublishing = false): boolean {
        increment(record.counters, 'shallowSessionAttestations');
        return ((record.phase === 'active' || (allowPublishing && record.phase === 'publishing')) &&
            !record.releaseRequested &&
            !record.operation &&
            getWeakMap(sessions, record.handle) === record);
    }
    function acquireSessionGeneration(record: SessionRecord, sourceGeneration: object): SessionGenerationLease | null {
        const existing = getMap(record.generationsBySource, sourceGeneration);
        if (existing && !existing.retired)
            return existing;
        if (record.counters.liveGenerations + record.reservedGenerations >= MAX_SESSION_GENERATIONS ||
            !isSessionCurrent(record)) {
            return null;
        }
        record.reservedGenerations += 1;
        const pending: PendingCatalogGeneration = {
            generation: null,
            facts: null,
            adopted: false,
            open: true,
            sinkInFlight: false,
        };
        const adopter: AdoptCatalogGeneration = (generation, facts) => {
            if (!pending.open ||
                pending.sinkInFlight ||
                pending.adopted ||
                !isSessionCurrent(record) ||
                !isOpaqueHandle(generation)) {
                return false;
            }
            pending.sinkInFlight = true;
            try {
                const normalizedFacts = validateGenerationFacts(facts);
                if (!normalizedFacts || !pending.open || pending.adopted || !isSessionCurrent(record))
                    return false;
                pending.generation = generation;
                pending.facts = normalizedFacts;
                pending.adopted = true;
                return pending.open && isSessionCurrent(record);
            }
            finally {
                pending.sinkInFlight = false;
            }
        };
        let lowerAccepted: boolean;
        try {
            lowerAccepted =
                catalogCall<unknown>(catalog.retainCommandListGeneration, [sourceGeneration, adopter]) === true;
        }
        catch {
            lowerAccepted = false;
        }
        finally {
            pending.open = false;
        }
        record.reservedGenerations -= 1;
        const generation = pending.generation;
        const facts = pending.facts;
        if (!lowerAccepted ||
            !pending.adopted ||
            !generation ||
            !facts ||
            !isSessionCurrent(record) ||
            !attestCatalogGeneration(generation, facts)) {
            if (generation) {
                const revision = facts
                    ? (getMap(record.revisions, facts) ?? { facts, commands: new IntrinsicMap<number, WindowRecord>() })
                    : {
                        facts: freezeExact({
                            identity: createOpaqueHandle(),
                            kind: 'event-list',
                            length: 0,
                        }) as ForesightScanListFacts,
                        commands: new IntrinsicMap<number, WindowRecord>(),
                    };
                const retained: SessionGenerationLease = {
                    sourceGeneration,
                    generation,
                    facts: revision.facts,
                    revision,
                    retired: false,
                };
                setMap(record.generationLeases, generation, retained);
                increment(record.counters, 'generationRetains');
                increment(record.counters, 'liveGenerations');
            }
            record.releaseRequested = true;
            return null;
        }
        let revision = getMap(record.revisions, facts);
        if (!revision) {
            revision = { facts, commands: new IntrinsicMap<number, WindowRecord>() };
            setMap(record.revisions, facts, revision);
            increment(record.counters, 'generationAdmissions');
        }
        const lease: SessionGenerationLease = {
            sourceGeneration,
            generation,
            facts,
            revision,
            retired: false,
        };
        setMap(record.generationsBySource, sourceGeneration, lease);
        setMap(record.generationLeases, generation, lease);
        increment(record.counters, 'generationRetains');
        increment(record.counters, 'liveGenerations');
        return lease;
    }
    function publishCounters(record: SessionRecord): void {
        if (record.countersPublished)
            return;
        record.countersPublished = true;
        if (!recordStructuralCounters)
            return;
        try {
            call(recordStructuralCounters, undefined, [captureCounterRecord(record.counters)]);
        }
        catch {
        }
    }
    function retireReceipt(record: SessionRecord, receipt: ReceiptRecord): boolean {
        if (receipt.retired)
            return true;
        if (!settleCatalogReceipt(receipt.receipt))
            return false;
        receipt.retired = true;
        deleteMap(record.receipts, receipt.receipt);
        increment(record.counters, 'receiptsRetired');
        record.counters.liveReceipts -= 1;
        return true;
    }
    function releaseSessionCleanupSlot(record: SessionRecord): void {
        deleteMap(pendingSessionRetirements, record.handle);
        if (!record.cleanupSlotReserved)
            return;
        record.cleanupSlotReserved = false;
        reservedPendingSessionRetirements -= 1;
    }
    function retainPendingSessionRetirement(record: SessionRecord): void {
        if (!record.cleanupSlotReserved)
            return;
        setMap(pendingSessionRetirements, record.handle, record);
    }
    function drainPendingSessionRetirements(): void {
        const snapshot = snapshotMapValues(pendingSessionRetirements, MAX_PENDING_SESSION_RETIREMENTS);
        if (!snapshot)
            return;
        for (let index = 0; index < snapshot.length; index += 1) {
            const record = ownData(snapshot, index) as SessionRecord | undefined;
            if (record)
                continueSessionRelease(record);
        }
    }
    function continueSessionRelease(record: SessionRecord): boolean {
        if (record.phase === 'retired')
            return false;
        if (record.operation) {
            record.releaseRequested = true;
            return false;
        }
        if (record.releaseInFlight) {
            record.releaseRequested = true;
            return false;
        }
        if (record.phase === 'publishing') {
            record.releaseRequested = true;
            return false;
        }
        record.phase = 'retiring';
        record.releaseRequested = true;
        record.releaseInFlight = true;
        let complete = true;
        try {
            const receipts = snapshotMapValues(record.receipts, MAX_SESSION_RECEIPTS);
            if (!receipts)
                complete = false;
            else {
                for (let index = 0; index < receipts.length; index += 1) {
                    const receipt = ownData(receipts, index) as ReceiptRecord | undefined;
                    if (receipt && !retireReceipt(record, receipt))
                        complete = false;
                }
            }
            if (exactMapSize(record.receipts) !== 0)
                complete = false;
            if (complete) {
                const leases = snapshotMapValues(record.generationLeases, MAX_SESSION_GENERATIONS);
                if (!leases)
                    complete = false;
                else {
                    for (let index = 0; index < leases.length; index += 1) {
                        const lease = ownData(leases, index) as SessionGenerationLease | undefined;
                        if (!lease || lease.retired)
                            continue;
                        if (!settleCatalogGeneration(lease.generation)) {
                            complete = false;
                            continue;
                        }
                        lease.retired = true;
                        deleteMap(record.generationLeases, lease.generation);
                        increment(record.counters, 'generationReleases');
                        record.counters.liveGenerations -= 1;
                    }
                }
            }
            if (exactMapSize(record.generationLeases) !== 0)
                complete = false;
        }
        catch {
            complete = false;
        }
        finally {
            record.releaseInFlight = false;
        }
        if (!complete) {
            retainPendingSessionRetirement(record);
            return false;
        }
        call(mapForEach, record.revisions, [
            (revision: ListRevision) => {
                call(mapForEach, revision.commands, [
                    (window: WindowRecord) => {
                        window.phase = 'retired';
                    },
                ]);
            },
        ]);
        record.liveWindows = 0;
        record.phase = 'retired';
        record.releaseRequested = false;
        releaseSessionCleanupSlot(record);
        publishCounters(record);
        return true;
    }
    function abandonSessionPublication(record: SessionRecord): boolean {
        if (record.phase === 'preparing' || record.phase === 'publishing')
            record.phase = 'retiring';
        record.releaseRequested = true;
        return continueSessionRelease(record);
    }
    function beginOperation(record: SessionRecord, kind: SessionOperation['kind']): SessionOperation | null {
        if (record.phase !== 'active' || record.releaseRequested || record.operation)
            return null;
        const operation: SessionOperation = { token: createOpaqueHandle(), kind };
        record.operation = operation;
        return operation;
    }
    function operationCurrent(record: SessionRecord, operation: SessionOperation): boolean {
        return record.operation === operation && record.phase === 'active' && !record.releaseRequested;
    }
    function finishOperation(record: SessionRecord, operation: SessionOperation): void {
        if (record.operation === operation)
            record.operation = null;
        if (record.releaseRequested)
            continueSessionRelease(record);
    }
    function attestSessionContents(record: SessionRecord, allowPublishing = false): boolean {
        increment(record.counters, 'deepSessionAttestations');
        if (!isSessionAuthorityCurrent(record, allowPublishing))
            return false;
        let valid = true;
        try {
            const leases = snapshotMapValues(record.generationLeases, MAX_SESSION_GENERATIONS);
            const receipts = snapshotMapValues(record.receipts, MAX_SESSION_RECEIPTS);
            if (!leases || !receipts)
                return false;
            for (let index = 0; index < leases.length; index += 1) {
                const lease = ownData(leases, index) as SessionGenerationLease | undefined;
                increment(record.counters, 'deepGenerationVisits');
                if (!lease ||
                    lease.retired ||
                    !attestCatalogGeneration(lease.generation, lease.facts) ||
                    !isSessionAuthorityCurrent(record, allowPublishing)) {
                    valid = false;
                }
            }
            for (let index = 0; index < receipts.length; index += 1) {
                const receipt = ownData(receipts, index) as ReceiptRecord | undefined;
                increment(record.counters, 'deepReceiptVisits');
                if (!receipt ||
                    receipt.retired ||
                    catalogCall<unknown>(catalog.attestCommandProjectionWindow, [receipt.receipt]) !== true ||
                    !isSessionAuthorityCurrent(record, allowPublishing)) {
                    valid = false;
                }
            }
        }
        catch {
            valid = false;
        }
        return valid && isSessionAuthorityCurrent(record, allowPublishing);
    }
    function beginScan(generations: unknown, adoptSession: AdoptSession): boolean {
        drainPendingExternalRetirements();
        drainPendingSessionRetirements();
        if (typeof adoptSession !== 'function')
            return false;
        if (reservedPendingSessionRetirements >= MAX_PENDING_SESSION_RETIREMENTS)
            return false;
        reservedPendingSessionRetirements += 1;
        let reservationOwned = true;
        let record: SessionRecord | null = null;
        try {
            const captured = captureGenerationArray(generations);
            if (!captured)
                return false;
            record = createSessionRecord();
            const sessionRecord = record;
            reservationOwned = false;
            for (let index = 0; index < captured.length; index += 1) {
                const generation = ownData(captured, index);
                if (!isOpaqueHandle(generation) || !acquireSessionGeneration(record, generation)) {
                    abandonSessionPublication(record);
                    return false;
                }
            }
            record.phase = 'publishing';
            const release = () => continueSessionRelease(sessionRecord);
            const attest = () => attestSessionCurrent(sessionRecord, true);
            let adopted: boolean;
            try {
                adopted =
                    call<unknown>(adoptSession as RuntimeCallback, undefined, [record.handle, release, attest]) ===
                        true;
            }
            catch {
                adopted = false;
            }
            const contentsCurrent = adopted && attestSessionContents(record, true);
            if (!contentsCurrent || !isSessionAuthorityCurrent(record, true)) {
                abandonSessionPublication(record);
                return false;
            }
            record.phase = 'active';
            return true;
        }
        catch {
            if (record)
                abandonSessionPublication(record);
            return false;
        }
        finally {
            if (reservationOwned)
                reservedPendingSessionRetirements -= 1;
        }
    }
    function findSession(value: unknown): SessionRecord | null {
        if (!value || typeof value !== 'object')
            return null;
        return getWeakMap(sessions, value) ?? null;
    }
    function attachListGeneration(session: unknown, generation: unknown): ForesightScanListFacts | null {
        drainPendingSessionRetirements();
        const record = findSession(session);
        if (!record || !isOpaqueHandle(generation))
            return null;
        const operation = beginOperation(record, 'attach');
        if (!operation)
            return null;
        let facts: ForesightScanListFacts | null = null;
        try {
            const lease = acquireSessionGeneration(record, generation);
            if (lease &&
                operationCurrent(record, operation) &&
                attestCatalogGeneration(lease.generation, lease.facts)) {
                facts = lease.facts;
            }
        }
        finally {
            finishOperation(record, operation);
        }
        return facts;
    }
    function readListFacts(session: unknown, generation: unknown): ForesightScanListFacts | null {
        drainPendingSessionRetirements();
        const record = findSession(session);
        if (!record || !isOpaqueHandle(generation))
            return null;
        const operation = beginOperation(record, 'facts');
        if (!operation)
            return null;
        let facts: ForesightScanListFacts | null = null;
        try {
            const lease = getMap(record.generationsBySource, generation);
            if (lease &&
                !lease.retired &&
                attestCatalogGeneration(lease.generation, lease.facts) &&
                operationCurrent(record, operation)) {
                facts = lease.facts;
            }
        }
        finally {
            finishOperation(record, operation);
        }
        return facts;
    }
    function catalogWindowMethod(kind: CollectionKind): RuntimeCallback | null {
        if (kind === 'event-list')
            return catalog.captureEventCommandProjectionWindow;
        return catalog.captureMovementCommandProjectionWindow;
    }
    function publishWindow(record: SessionRecord, operation: SessionOperation, window: WindowRecord, adoptWindow: AdoptWindow, newlyCaptured: boolean): boolean {
        let adopted: boolean;
        try {
            adopted = call<unknown>(adoptWindow as RuntimeCallback, undefined, [window.handle]) === true;
        }
        catch {
            adopted = false;
        }
        let attested: boolean;
        try {
            attested = catalogCall<unknown>(catalog.attestCommandProjectionWindow, [window.receipt.receipt]) === true;
        }
        catch {
            attested = false;
        }
        if (adopted && attested && operationCurrent(record, operation) && window.phase === 'active')
            return true;
        if (newlyCaptured) {
            window.phase = 'retiring';
            if (getMap(window.revision.commands, window.index) === window) {
                deleteMap(window.revision.commands, window.index);
                record.liveWindows -= 1;
            }
            if (!retireReceipt(record, window.receipt))
                record.releaseRequested = true;
            window.phase = 'retired';
        }
        return false;
    }
    function readCommand(session: unknown, generation: unknown, index: unknown, adoptWindow: AdoptWindow): boolean {
        drainPendingSessionRetirements();
        const record = findSession(session);
        if (!record ||
            !isOpaqueHandle(generation) ||
            typeof index !== 'number' ||
            !numberIsSafeInteger(index) ||
            index < 0 ||
            typeof adoptWindow !== 'function') {
            return false;
        }
        const operation = beginOperation(record, 'read');
        if (!operation)
            return false;
        increment(record.counters, 'commandReadRequests');
        try {
            const lease = getMap(record.generationsBySource, generation);
            if (!lease || lease.retired || index >= logicalGenerationLength(lease.facts))
                return false;
            const existing = getMap(lease.revision.commands, index);
            if (existing?.phase === 'active') {
                increment(record.counters, 'cacheHits');
                return publishWindow(record, operation, existing, adoptWindow, false);
            }
            if (record.liveWindows + record.reservedWindows >= MAX_SESSION_WINDOWS ||
                record.counters.liveReceipts + record.reservedReceipts >= MAX_SESSION_RECEIPTS) {
                return false;
            }
            const method = catalogWindowMethod(lease.facts.kind);
            if (!method)
                return false;
            record.reservedWindows += 1;
            record.reservedReceipts += 1;
            const pending: PendingCatalogWindow = {
                window: null,
                receipt: null,
                adopted: false,
                open: true,
                sinkInFlight: false,
            };
            const lowerAdopter: AdoptCatalogWindow = (catalogWindow, receipt) => {
                if (!pending.open ||
                    pending.sinkInFlight ||
                    pending.adopted ||
                    !operationCurrent(record, operation) ||
                    !isOpaqueHandle(receipt)) {
                    return false;
                }
                pending.sinkInFlight = true;
                try {
                    const normalized = captureCatalogWindow(catalogWindow, lease.facts.kind, index);
                    if (!normalized || !pending.open || pending.adopted || !operationCurrent(record, operation)) {
                        return false;
                    }
                    pending.window = normalized;
                    pending.receipt = receipt;
                    pending.adopted = true;
                    return pending.open && operationCurrent(record, operation);
                }
                finally {
                    pending.sinkInFlight = false;
                }
            };
            let lowerAccepted = false;
            try {
                lowerAccepted = catalogCall<unknown>(method, [lease.generation, index, 1, lowerAdopter]) === true;
            }
            catch {
                lowerAccepted = false;
            }
            finally {
                pending.open = false;
            }
            record.reservedWindows -= 1;
            record.reservedReceipts -= 1;
            const captured = pending.window;
            const receipt = pending.receipt;
            if (!lowerAccepted ||
                !pending.adopted ||
                !captured ||
                !receipt ||
                !operationCurrent(record, operation) ||
                !attestCatalogGeneration(lease.generation, lease.facts)) {
                if (receipt) {
                    const retained: ReceiptRecord = { receipt, retired: false };
                    setMap(record.receipts, receipt, retained);
                    increment(record.counters, 'receiptsIssued');
                    increment(record.counters, 'liveReceipts');
                    if (!retireReceipt(record, retained))
                        record.releaseRequested = true;
                }
                return false;
            }
            let receiptCurrent = false;
            try {
                receiptCurrent = catalogCall<unknown>(catalog.attestCommandProjectionWindow, [receipt]) === true;
            }
            catch {
                receiptCurrent = false;
            }
            if (!receiptCurrent || !operationCurrent(record, operation)) {
                const retained: ReceiptRecord = { receipt, retired: false };
                setMap(record.receipts, receipt, retained);
                increment(record.counters, 'receiptsIssued');
                increment(record.counters, 'liveReceipts');
                if (!retireReceipt(record, retained))
                    record.releaseRequested = true;
                return false;
            }
            const row = ownData(captured.commands, 0) as CatalogWindowRow;
            const preview = createCommandPreview(row);
            if (!preview) {
                const retained: ReceiptRecord = { receipt, retired: false };
                setMap(record.receipts, receipt, retained);
                increment(record.counters, 'receiptsIssued');
                increment(record.counters, 'liveReceipts');
                if (!retireReceipt(record, retained))
                    record.releaseRequested = true;
                return false;
            }
            const facts = freezeExact({ index: row.index, command: row.command, metadata: row.metadata });
            const receiptRecord: ReceiptRecord = { receipt, retired: false };
            const handle = createOpaqueHandle<ForesightScanCommandWindow>();
            const window: WindowRecord = {
                handle,
                session: record,
                revision: lease.revision,
                index,
                facts,
                preview,
                receipt: receiptRecord,
                phase: 'active',
            };
            setMap(record.receipts, receipt, receiptRecord);
            setMap(lease.revision.commands, index, window);
            setWeakMap(windows, handle, window);
            record.liveWindows += 1;
            increment(record.counters, 'uniqueIndexReads');
            increment(record.counters, 'commandProjections');
            increment(record.counters, 'receiptsIssued');
            increment(record.counters, 'liveReceipts');
            return publishWindow(record, operation, window, adoptWindow, true);
        }
        finally {
            finishOperation(record, operation);
        }
    }
    function findWindow(session: unknown, window: unknown): WindowRecord | null {
        const record = findSession(session);
        if (!record || !window || typeof window !== 'object')
            return null;
        const found = getWeakMap(windows, window);
        return found?.session === record && found.phase === 'active' ? found : null;
    }
    function readCommandFacts(session: unknown, window: unknown): ForesightScanCommandFacts | null {
        drainPendingSessionRetirements();
        const record = findSession(session);
        if (!record)
            return null;
        const operation = beginOperation(record, 'window-facts');
        if (!operation)
            return null;
        let facts: ForesightScanCommandFacts | null = null;
        try {
            const found = findWindow(session, window);
            if (found &&
                catalogCall<unknown>(catalog.attestCommandProjectionWindow, [found.receipt.receipt]) === true &&
                operationCurrent(record, operation)) {
                facts = found.facts;
            }
        }
        catch {
            facts = null;
        }
        finally {
            finishOperation(record, operation);
        }
        return facts;
    }
    function readCommandPreview(session: unknown, window: unknown): ForesightScanCommandPreview | null {
        drainPendingSessionRetirements();
        const record = findSession(session);
        if (!record)
            return null;
        const operation = beginOperation(record, 'window-preview');
        if (!operation)
            return null;
        let preview: ForesightScanCommandPreview | null = null;
        try {
            const found = findWindow(session, window);
            if (found &&
                catalogCall<unknown>(catalog.attestCommandProjectionWindow, [found.receipt.receipt]) === true &&
                operationCurrent(record, operation)) {
                preview = found.preview;
            }
        }
        catch {
            preview = null;
        }
        finally {
            finishOperation(record, operation);
        }
        return preview;
    }
    function captureDiagnosticConsumedCommands(session: unknown, generation: unknown, startIndex: unknown, endIndexExclusive: unknown, adoptPreview: (preview: readonly ForesightDiagnosticCommandPreview[]) => boolean): boolean {
        drainPendingSessionRetirements();
        const record = findSession(session);
        if (!record ||
            !isOpaqueHandle(generation) ||
            typeof startIndex !== 'number' ||
            !numberIsSafeInteger(startIndex) ||
            startIndex < 0 ||
            typeof endIndexExclusive !== 'number' ||
            !numberIsSafeInteger(endIndexExclusive) ||
            endIndexExclusive < startIndex ||
            endIndexExclusive - startIndex > MAX_DIAGNOSTIC_PREVIEW_COMMANDS ||
            typeof adoptPreview !== 'function') {
            return false;
        }
        const operation = beginOperation(record, 'diagnostic');
        if (!operation)
            return false;
        try {
            const lease = getMap(record.generationsBySource, generation);
            if (!lease ||
                lease.retired ||
                endIndexExclusive > logicalGenerationLength(lease.facts) ||
                !attestCatalogGeneration(lease.generation, lease.facts) ||
                !operationCurrent(record, operation)) {
                return false;
            }
            const count = endIndexExclusive - startIndex;
            const preview = new IntrinsicArray<ForesightDiagnosticCommandPreview>(count);
            const capturedWindows = new IntrinsicArray<WindowRecord>(count);
            for (let offset = 0; offset < count; offset += 1) {
                const commandIndex = startIndex + offset;
                const window = getMap(lease.revision.commands, commandIndex);
                if (window?.phase !== 'active')
                    return false;
                let receiptCurrent: boolean;
                try {
                    receiptCurrent =
                        catalogCall<unknown>(catalog.attestCommandProjectionWindow, [window.receipt.receipt]) === true;
                }
                catch {
                    receiptCurrent = false;
                }
                if (!receiptCurrent || !operationCurrent(record, operation))
                    return false;
                const row = freezeExact({
                    index: window.preview.index,
                    code: window.preview.code,
                    indent: window.preview.indent,
                });
                call(objectDefineProperty as RuntimeCallback, IntrinsicObject, [
                    preview,
                    offset,
                    {
                        value: row,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    },
                ]);
                call(objectDefineProperty as RuntimeCallback, IntrinsicObject, [
                    capturedWindows,
                    offset,
                    {
                        value: window,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    },
                ]);
            }
            freezeExact(preview);
            freezeExact(capturedWindows);
            let adopted: boolean;
            try {
                adopted = call<unknown>(adoptPreview as RuntimeCallback, undefined, [preview]) === true;
            }
            catch {
                adopted = false;
            }
            if (!adopted || !operationCurrent(record, operation))
                return false;
            for (let offset = 0; offset < count; offset += 1) {
                const window = ownData(capturedWindows, offset) as WindowRecord | undefined;
                if (window?.phase !== 'active')
                    return false;
                try {
                    if (catalogCall<unknown>(catalog.attestCommandProjectionWindow, [window.receipt.receipt]) !==
                        true ||
                        !operationCurrent(record, operation)) {
                        return false;
                    }
                }
                catch {
                    return false;
                }
            }
            return attestCatalogGeneration(lease.generation, lease.facts) && operationCurrent(record, operation);
        }
        finally {
            finishOperation(record, operation);
        }
    }
    function attestScanSession(session: unknown): boolean {
        const record = findSession(session);
        return !!record && attestSessionCurrent(record);
    }
    function attestScan(session: unknown): boolean {
        drainPendingSessionRetirements();
        const record = findSession(session);
        if (!record)
            return false;
        const operation = beginOperation(record, 'attest');
        if (!operation)
            return false;
        let valid: boolean;
        try {
            valid = attestSessionContents(record) && operationCurrent(record, operation);
            if (!valid && operationCurrent(record, operation))
                record.releaseRequested = true;
        }
        finally {
            finishOperation(record, operation);
        }
        return valid;
    }
    return freezeExact({
        admitEventListGeneration,
        retainListGeneration,
        attestEventListBinding,
        beginScan,
        attachListGeneration,
        readListFacts,
        readCommand,
        readCommandFacts,
        readCommandPreview,
        captureDiagnosticConsumedCommands,
        attestScanSession,
        attestScan,
    });
}
