import { DEFAULT_MAX_SCAN_COMMANDS, MAX_NESTED_LIST_DEPTH } from './constants.js';
import type { ForesightMessageBlockParser, ForesightMessageCommandBlock } from './message-block-parser.js';
import type { ForesightScanCommandFacts, ForesightScanCommandWindow, ForesightScanListGenerationOwner, ForesightScanListSession, } from './scan-list-generation-owner.js';
type PropertyBag = Record<PropertyKey, unknown>;
type UnknownFunction = (...args: unknown[]) => unknown;
type DescriptorCapture = PropertyDescriptor | null | 'fault';
interface ForesightListGenerationFacts {
    readonly identity: Readonly<object>;
    readonly kind: 'event-list' | 'movement-list' | 'movement-command';
    readonly length: number | null;
}
type AdoptListGeneration = (generation: Readonly<object>, facts: ForesightListGenerationFacts, release: () => boolean, attest: () => boolean) => boolean;
export type ForesightProvenanceListGenerationFacade = Pick<ForesightScanListGenerationOwner, 'admitEventListGeneration' | 'attestEventListBinding' | 'beginScan' | 'readCommand' | 'readCommandFacts' | 'attestScan'> & {
    readonly admitEventListGeneration: (source: unknown, adoptGeneration: AdoptListGeneration) => boolean;
};
export interface ForesightProvenanceDependencies {
    readonly listGenerations: ForesightProvenanceListGenerationFacade;
    readonly parser: ForesightMessageBlockParser;
    readonly globalScope: unknown;
}
export interface ForesightExecutionView {
    readonly commandCode: number;
    readonly commonEventId: number | null;
    readonly indent: number;
    readonly interpreterId: string;
    readonly listId: string;
    readonly maxCommands: number;
    readonly startIndex: number;
}
export interface ForesightResolvedMessageOrigin {
    readonly listGeneration: Readonly<object>;
    readonly scanSession: ForesightScanListSession;
    readonly startIndex: number;
    readonly nextIndex: number;
    readonly indent: number;
    readonly interpreterId: string;
    readonly listId: string;
    readonly frames: readonly unknown[];
}
export interface ForesightProvenanceAuthority {
    readonly prepareExecution: (options?: unknown) => Readonly<object> | null;
    readonly readExecution: (token: unknown) => ForesightExecutionView | null;
    readonly releaseExecution: (token: unknown) => boolean;
    readonly createChildContext: (executionToken: unknown, parent: unknown, child: unknown, identity?: unknown) => boolean;
    readonly prepareMessage: (executionToken: unknown, gameMessage: unknown, beforeMessageState: unknown, maxCommands: unknown) => Readonly<object> | null;
    readonly settleMessage: (pendingToken: unknown, afterMessageState: unknown) => Readonly<object> | null;
    readonly verifyMessageOrigin: (originToken: unknown, gameMessage: unknown) => boolean;
    readonly resolveMessageOrigin: (originToken: unknown) => ForesightResolvedMessageOrigin | null;
    readonly readMessageOriginText: (gameMessage: unknown) => string;
    readonly clear: (gameMessage: unknown) => boolean;
    readonly retire: (token: unknown) => boolean;
}
interface IdentityFacts {
    readonly interpreterId: string;
    readonly listId: string;
    readonly commonEventId: number | null;
    readonly commonEventName: string;
    readonly parentInterpreterId: string;
    readonly parentListId: string;
    readonly parentCommandIndex: number | null;
    readonly parentCommandCode: number | null;
}
interface ProvenanceFrame extends IdentityFacts {
    readonly listLease: InterpreterListLease;
    readonly index: number;
    readonly expectedIndent: number;
}
interface ListBindingFacts {
    readonly configurable: boolean;
    readonly enumerable: boolean;
    readonly writable: boolean;
}
interface ObservedListBinding {
    readonly source: unknown[];
    readonly facts: ListBindingFacts;
}
interface InterpreterListAuthority {
    readonly interpreter: object;
    readonly generation: Readonly<object>;
    readonly facts: ForesightListGenerationFacts;
    readonly binding: ListBindingFacts;
    readonly releaseLower: () => boolean;
    readonly attestLower: () => boolean;
    phase: 'active' | 'retiring' | 'retired';
    references: number;
    releaseInFlight: boolean;
    releaseRequested: boolean;
    slotReserved: boolean;
}
interface InterpreterListLease {
    readonly authority: InterpreterListAuthority;
    phase: 'active' | 'settling' | 'released';
}
interface ScanSessionAuthority {
    readonly session: ForesightScanListSession;
    readonly releaseLower: () => boolean;
    readonly attestLower: () => boolean;
    phase: 'active' | 'retiring' | 'retired';
    references: number;
    releaseInFlight: boolean;
    slotReserved: boolean;
}
interface ScanSessionLease {
    readonly authority: ScanSessionAuthority;
    phase: 'active' | 'settling' | 'released';
}
interface ExecutionRecord {
    phase: 'active' | 'preparing-message' | 'creating-child' | 'releasing' | 'released';
    releaseInFlight: boolean;
    readonly token: object;
    readonly interpreter: object;
    readonly listLease: InterpreterListLease;
    readonly sessionLease: ScanSessionLease;
    readonly startIndex: number;
    readonly commandCode: number;
    readonly indent: number;
    readonly commonEventId: number | null;
    readonly identity: IdentityFacts;
    readonly inheritedFrames: readonly ProvenanceFrame[];
    readonly maxCommands: number;
    parserBorrows: number;
    slotReserved: boolean;
}
interface ChildContextRecord {
    phase: 'active' | 'retiring' | 'retired';
    releaseInFlight: boolean;
    readonly child: object;
    readonly publishedDescriptor: PropertyDescriptor;
    readonly identity: IdentityFacts;
    readonly frames: readonly ProvenanceFrame[];
    slotReserved: boolean;
}
interface MessageState {
    readonly text: string;
    readonly hasOwnData: boolean;
    readonly lineCount: number;
    readonly storageKey: string;
    readonly storageIdentity: unknown;
}
interface PendingMessageRecord {
    phase: 'active' | 'settling' | 'retiring' | 'retired';
    releaseInFlight: boolean;
    readonly execution: ExecutionRecord;
    readonly gameMessage: object;
    readonly before: MessageState;
    readonly previousOrigin: unknown;
    readonly previousOriginDescriptor: PropertyDescriptor | null;
    readonly originRevision: object;
    readonly parserReceipt: object;
    parserReceiptRetired: boolean;
    borrowReleased: boolean;
    readonly block: ForesightMessageCommandBlock;
    slotReserved: boolean;
}
interface OriginRecord {
    phase: 'active' | 'retiring' | 'retired';
    releaseInFlight: boolean;
    readonly token: object;
    readonly gameMessage: object;
    readonly publishedDescriptor: PropertyDescriptor;
    readonly listLease: InterpreterListLease;
    readonly sessionLease: ScanSessionLease;
    readonly startIndex: number;
    readonly nextIndex: number;
    readonly indent: number;
    readonly rawText: string;
    readonly identity: IdentityFacts;
    readonly frames: readonly ProvenanceFrame[];
    readonly parserReceipt: object;
    parserReceiptRetired: boolean;
    slotReserved: boolean;
}
interface PublicationClaim {
    phase: 'active' | 'committed' | 'failed';
    readonly predecessor: PropertyDescriptor | null;
    readonly prepared: PropertyDescriptor;
    readonly previous: PublicationClaim | null;
}
interface PublicationSlot {
    latest: PublicationClaim | null;
    revision: object;
}
type CommandCapture = {
    readonly status: 'accepted';
    readonly facts: ForesightScanCommandFacts;
} | {
    readonly status: 'boundary';
} | {
    readonly status: 'fault';
};
const MAX_EXECUTION_SCAN_COMMANDS = DEFAULT_MAX_SCAN_COMMANDS;
const MAX_SCAN_LOOKAHEAD = 1;
const MAX_MESSAGE_LINES = 256;
const MAX_MESSAGE_TEXT_UNITS = 16 * 1024;
const MAX_ORIGIN_FRAMES = MAX_NESTED_LIST_DEPTH + 1;
const MAX_IDENTITY_UNITS = 256;
const MAX_PROVENANCE_AUTHORITIES = 1024;
const MESSAGE_COMMAND_CODE = 101;
const COMMON_EVENT_COMMAND_CODE = 117;
const CONTINUATION_CODES = Object.freeze({
    105: 405,
    108: 408,
    205: 505,
    355: 655,
    357: 657,
} as Readonly<Record<number, number>>);
const IntrinsicObject = Object;
const IntrinsicMap = Map;
const IntrinsicWeakMap = WeakMap;
const IntrinsicTypeError = TypeError;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectIs = Object.is;
const arrayIsArray = Array.isArray;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const mathFloor = Math.floor;
const mathMax = Math.max;
const mathMin = Math.min;
const reflectApply = Reflect.apply;
const reflectDefineProperty = Reflect.defineProperty;
const reflectDeleteProperty = Reflect.deleteProperty;
const stringFrom = String;
function captureMethod(target: object, key: PropertyKey): UnknownFunction {
    const descriptor = objectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value !== 'function')
        throw new IntrinsicTypeError(`[Foresight] Missing provenance intrinsic ${stringFrom(key)}.`);
    return value as UnknownFunction;
}
const mapDelete = captureMethod(IntrinsicMap.prototype, 'delete');
const mapForEach = captureMethod(IntrinsicMap.prototype, 'forEach');
const mapHas = captureMethod(IntrinsicMap.prototype, 'has');
const mapSet = captureMethod(IntrinsicMap.prototype, 'set');
const stringTrim = captureMethod(stringFrom.prototype, 'trim');
const weakMapDelete = captureMethod(IntrinsicWeakMap.prototype, 'delete');
const weakMapGet = captureMethod(IntrinsicWeakMap.prototype, 'get');
const weakMapSet = captureMethod(IntrinsicWeakMap.prototype, 'set');
function call<Result>(method: UnknownFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(method, receiver, args) as Result;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return call<Readonly<Value>>(objectFreeze, IntrinsicObject, [value]);
}
function createNullRecord(): PropertyBag {
    return call<PropertyBag>(objectCreate as unknown as UnknownFunction, IntrinsicObject, [null]);
}
function defineExactData(target: object, key: PropertyKey, value: unknown): void {
    call(objectDefineProperty as unknown as UnknownFunction, IntrinsicObject, [
        target,
        key,
        { configurable: false, enumerable: true, value, writable: false },
    ]);
}
function appendOwnedValue<Value>(target: Value[], value: Value, maximum: number): boolean {
    const index = target.length;
    if (!numberIsSafeInteger(index) || index < 0 || index >= maximum)
        return false;
    const descriptor = { configurable: true, enumerable: true, value, writable: true };
    try {
        reflectDefineProperty(target, String(index), descriptor);
    }
    catch {
    }
    const observed = safeOwnDescriptor(target, String(index));
    return (target.length === index + 1 &&
        !!observed &&
        'value' in observed &&
        objectIs(observed.value, value) &&
        observed.configurable === true &&
        observed.enumerable === true &&
        observed.writable === true);
}
function frozenRecord(fields: readonly (readonly [
    PropertyKey,
    unknown
])[]): Readonly<PropertyBag> {
    const target = createNullRecord();
    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        if (field)
            defineExactData(target, field[0], field[1]);
    }
    return freezeExact(target);
}
function createOpaqueToken(): Readonly<object> {
    return freezeExact(createNullRecord());
}
function isObject(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isExactTrue(value: unknown): value is true {
    return value === true;
}
function safeOwnDescriptor(source: object, key: PropertyKey): PropertyDescriptor | null {
    try {
        return objectGetOwnPropertyDescriptor(source, key) ?? null;
    }
    catch {
        return null;
    }
}
function captureOwnDescriptor(source: object, key: PropertyKey): DescriptorCapture {
    try {
        return objectGetOwnPropertyDescriptor(source, key) ?? null;
    }
    catch {
        return 'fault';
    }
}
function ownData(source: unknown, key: PropertyKey): unknown {
    if (!isObject(source))
        return undefined;
    const descriptor = safeOwnDescriptor(source, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function captureInterpreterListBinding(interpreter: object): ObservedListBinding | null {
    const descriptor = safeOwnDescriptor(interpreter, '_list');
    if (!descriptor || !('value' in descriptor) || !arrayIsArray(descriptor.value))
        return null;
    return {
        source: descriptor.value,
        facts: freezeExact({
            configurable: descriptor.configurable === true,
            enumerable: descriptor.enumerable === true,
            writable: descriptor.writable === true,
        }),
    };
}
function sameListBindingFacts(left: ListBindingFacts, right: ListBindingFacts): boolean {
    return (left.configurable === right.configurable &&
        left.enumerable === right.enumerable &&
        left.writable === right.writable);
}
function safeString(value: unknown, defaultValue = ''): string {
    return typeof value === 'string' && value.length <= MAX_IDENTITY_UNITS ? value : defaultValue;
}
function positiveSafeInteger(value: unknown): number | null {
    return typeof value === 'number' && numberIsSafeInteger(value) && value > 0 ? value : null;
}
function safeIndex(value: unknown): number | null {
    return typeof value === 'number' && numberIsSafeInteger(value) && value >= 0 ? value : null;
}
function safeFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && numberIsFinite(value) ? value : null;
}
function normalizedMaxCommands(value: unknown): number {
    const numeric = safeFiniteNumber(value);
    return numeric === null
        ? MAX_EXECUTION_SCAN_COMMANDS
        : mathMax(1, mathMin(MAX_EXECUTION_SCAN_COMMANDS, mathFloor(numeric)));
}
function captureIdentity(source: unknown, defaultIdentity = 'attached'): IdentityFacts {
    const defaultId = safeString(defaultIdentity, 'attached') || 'attached';
    const interpreterId = safeString(ownData(source, 'interpreterId'), defaultId) || defaultId;
    const listId = safeString(ownData(source, 'listId'), interpreterId) || interpreterId;
    const commonEventId = positiveSafeInteger(ownData(source, 'commonEventId'));
    return freezeExact({
        interpreterId,
        listId,
        commonEventId,
        commonEventName: safeString(ownData(source, 'commonEventName')),
        parentInterpreterId: safeString(ownData(source, 'parentInterpreterId')),
        parentListId: safeString(ownData(source, 'parentListId')),
        parentCommandIndex: safeIndex(ownData(source, 'parentCommandIndex')),
        parentCommandCode: safeFiniteNumber(ownData(source, 'parentCommandCode')),
    });
}
function messageState(source: unknown): MessageState | null {
    if (!isObject(source))
        return null;
    const text = ownData(source, 'text');
    const hasOwnData = ownData(source, 'hasOwnData');
    const lineCount = ownData(source, 'lineCount');
    const storageKey = ownData(source, 'storageKey');
    if (typeof text !== 'string' ||
        text.length > MAX_MESSAGE_TEXT_UNITS ||
        typeof hasOwnData !== 'boolean' ||
        typeof lineCount !== 'number' ||
        !numberIsSafeInteger(lineCount) ||
        lineCount < 0 ||
        lineCount > MAX_MESSAGE_LINES ||
        typeof storageKey !== 'string' ||
        storageKey.length > MAX_IDENTITY_UNITS) {
        return null;
    }
    return freezeExact({
        text,
        hasOwnData,
        lineCount,
        storageKey,
        storageIdentity: ownData(source, 'storageIdentity'),
    });
}
function messageStateChanged(before: MessageState, after: MessageState): boolean {
    return (before.hasOwnData !== after.hasOwnData ||
        before.text !== after.text ||
        before.lineCount !== after.lineCount ||
        before.storageKey !== after.storageKey ||
        !objectIs(before.storageIdentity, after.storageIdentity));
}
function createTranslatorDescriptor(current: PropertyDescriptor | null, value: unknown): PropertyDescriptor | null {
    if (!current)
        return { configurable: true, enumerable: false, value, writable: true };
    if ('value' in current) {
        if (current.configurable !== true && current.writable !== true)
            return null;
        return {
            configurable: current.configurable === true,
            enumerable: current.enumerable === true,
            value,
            writable: current.writable === true,
        };
    }
    return current.configurable === true
        ? { configurable: true, enumerable: current.enumerable === true, value, writable: true }
        : null;
}
function descriptorMatchesExpected(actual: PropertyDescriptor | null, expected: PropertyDescriptor): boolean {
    return (!!actual &&
        'value' in actual &&
        objectIs(actual.value, expected.value) &&
        actual.configurable === expected.configurable &&
        actual.enumerable === expected.enumerable &&
        actual.writable === expected.writable);
}
function descriptorMatchesExact(actual: PropertyDescriptor | null, expected: PropertyDescriptor | null): boolean {
    if (!actual || !expected)
        return actual === expected;
    if (actual.configurable !== expected.configurable ||
        actual.enumerable !== expected.enumerable ||
        'value' in actual !== 'value' in expected) {
        return false;
    }
    if ('value' in actual && 'value' in expected) {
        return actual.writable === expected.writable && objectIs(actual.value, expected.value);
    }
    if ('value' in actual || 'value' in expected)
        return false;
    const actualGet: unknown = actual.get;
    const expectedGet: unknown = expected.get;
    const actualSet: unknown = actual.set;
    const expectedSet: unknown = expected.set;
    return objectIs(actualGet, expectedGet) && objectIs(actualSet, expectedSet);
}
export function createForesightProvenance(dependencies: ForesightProvenanceDependencies): ForesightProvenanceAuthority {
    const { listGenerations, parser, globalScope } = dependencies;
    const admitEventListGeneration = listGenerations.admitEventListGeneration;
    const attestEventListBinding = listGenerations.attestEventListBinding;
    const beginScan = listGenerations.beginScan;
    const readCommand = listGenerations.readCommand;
    const readCommandFacts = listGenerations.readCommandFacts;
    const attestScan = listGenerations.attestScan;
    const prepareAdmittedMessageCommandBlock = parser.prepareAdmittedMessageCommandBlock;
    const readMessageCommandBlock = parser.readMessageCommandBlock;
    const attestMessageCommandBlock = parser.attestMessageCommandBlock;
    const retireMessageCommandBlock = parser.retireMessageCommandBlock;
    const executions = new IntrinsicWeakMap<object, ExecutionRecord>();
    const listLeases = new IntrinsicWeakMap<object, InterpreterListAuthority>();
    const listLeaseAcquisitions = new IntrinsicWeakMap<object, Readonly<object>>();
    const pendingListAuthoritySettlements = new IntrinsicMap<InterpreterListAuthority, true>();
    const pendingSessionAuthoritySettlements = new IntrinsicMap<ScanSessionAuthority, true>();
    const pendingParserReceiptSettlements = new IntrinsicMap<object, true>();
    const parserReceiptReservations = new IntrinsicWeakMap<object, true>();
    const pendingRecordRetirements = new IntrinsicMap<object, true>();
    const childContexts = new IntrinsicWeakMap<object, ChildContextRecord>();
    const pendingMessages = new IntrinsicWeakMap<object, PendingMessageRecord>();
    const origins = new IntrinsicWeakMap<object, OriginRecord>();
    const retiredTokens = new IntrinsicWeakMap<object, true>();
    const childPublicationSlots = new IntrinsicWeakMap<object, PublicationSlot>();
    const originPublicationSlots = new IntrinsicWeakMap<object, PublicationSlot>();
    let reservedListAuthoritySlots = 0;
    let reservedSessionAuthoritySlots = 0;
    let reservedParserReceiptSlots = 0;
    let reservedRecordSlots = 0;
    let recordRetirementDrainInFlight = false;
    function markRetired(token: object): void {
        call(weakMapSet, retiredTokens, [token, true]);
    }
    function isRetiredToken(token: unknown): boolean {
        return isObject(token) && call<true | undefined>(weakMapGet, retiredTokens, [token]) === true;
    }
    function reserveRecordSlot(): boolean {
        if (reservedRecordSlots >= MAX_PROVENANCE_AUTHORITIES)
            return false;
        reservedRecordSlots += 1;
        return true;
    }
    function releaseRecordSlot(record: {
        slotReserved: boolean;
    }): void {
        if (!record.slotReserved)
            return;
        record.slotReserved = false;
        reservedRecordSlots -= 1;
    }
    function publicationSlot(target: object, key: '_trForesightOriginContext' | '_trMessageOrigin'): PublicationSlot {
        const owner = key === '_trMessageOrigin' ? originPublicationSlots : childPublicationSlots;
        const existing = call<PublicationSlot | undefined>(weakMapGet, owner, [target]);
        if (existing)
            return existing;
        const created: PublicationSlot = { latest: null, revision: createOpaqueToken() };
        call(weakMapSet, owner, [target, created]);
        return created;
    }
    function applyExactDescriptor(target: object, key: PropertyKey, descriptor: PropertyDescriptor | null): boolean {
        try {
            if (descriptor)
                reflectDefineProperty(target, key, descriptor);
            else
                reflectDeleteProperty(target, key);
        }
        catch {
        }
        const observed = captureOwnDescriptor(target, key);
        return observed !== 'fault' && descriptorMatchesExact(observed, descriptor);
    }
    function reconcileLatestPublication(slot: PublicationSlot, target: object, key: PropertyKey, predecessor: PropertyDescriptor | null, failedPrepared: PropertyDescriptor | null = null): boolean {
        for (let attempt = 0; attempt < MAX_ORIGIN_FRAMES; attempt += 1) {
            const winner = slot.latest;
            const observed = captureOwnDescriptor(target, key);
            if (observed === 'fault')
                return false;
            let desired: PropertyDescriptor | null;
            if (winner?.phase === 'committed')
                desired = winner.prepared;
            else if (descriptorMatchesExact(observed, predecessor) ||
                (failedPrepared && descriptorMatchesExact(observed, failedPrepared))) {
                desired = predecessor;
            }
            else
                return true;
            if (applyExactDescriptor(target, key, desired) && slot.latest === winner)
                return true;
        }
        return false;
    }
    function publishTranslatorData(target: object, key: '_trForesightOriginContext' | '_trMessageOrigin', predecessor: PropertyDescriptor | null, value: unknown, expectedRevision: object, isCurrent: () => boolean): boolean {
        const slot = publicationSlot(target, key);
        const observed = captureOwnDescriptor(target, key);
        if (slot.revision !== expectedRevision ||
            observed === 'fault' ||
            !descriptorMatchesExact(observed, predecessor)) {
            return false;
        }
        const prepared = createTranslatorDescriptor(predecessor, value);
        if (!prepared || !isCurrent() || slot.revision !== expectedRevision)
            return false;
        if (slot.latest?.phase === 'committed' && !descriptorMatchesExact(predecessor, slot.latest.prepared)) {
            slot.latest = null;
        }
        const claim: PublicationClaim = {
            phase: 'active',
            predecessor,
            prepared: freezeExact(prepared),
            previous: slot.latest,
        };
        slot.latest = claim;
        slot.revision = createOpaqueToken();
        const before = captureOwnDescriptor(target, key);
        if (before === 'fault' || !descriptorMatchesExact(before, predecessor) || !isCurrent()) {
            claim.phase = 'failed';
            if (slot.latest === claim)
                slot.latest = claim.previous;
            reconcileLatestPublication(slot, target, key, predecessor);
            return false;
        }
        try {
            reflectDefineProperty(target, key, claim.prepared);
        }
        catch {
        }
        if (slot.latest !== claim) {
            reconcileLatestPublication(slot, target, key, predecessor);
            claim.phase = 'failed';
            return false;
        }
        const after = captureOwnDescriptor(target, key);
        if (after === 'fault' || !descriptorMatchesExpected(after, claim.prepared) || !isCurrent()) {
            claim.phase = 'failed';
            if (slot.latest === claim)
                slot.latest = claim.previous;
            reconcileLatestPublication(slot, target, key, predecessor, claim.prepared);
            return false;
        }
        claim.phase = 'committed';
        return true;
    }
    function settleScanSessionAuthority(authority: ScanSessionAuthority): boolean {
        if (authority.phase === 'retired')
            return true;
        if (authority.references !== 0)
            return false;
        if (authority.releaseInFlight)
            return false;
        authority.phase = 'retiring';
        authority.releaseInFlight = true;
        let released: boolean;
        try {
            try {
                released = isExactTrue(authority.releaseLower());
            }
            catch {
                released = false;
            }
            if (!released) {
                try {
                    released = !isExactTrue(authority.attestLower());
                }
                catch {
                    released = false;
                }
            }
        }
        finally {
            authority.releaseInFlight = false;
        }
        if (!released) {
            call(mapSet, pendingSessionAuthoritySettlements, [authority, true]);
            return false;
        }
        authority.phase = 'retired';
        call(mapDelete, pendingSessionAuthoritySettlements, [authority]);
        if (authority.slotReserved) {
            authority.slotReserved = false;
            reservedSessionAuthoritySlots -= 1;
        }
        return true;
    }
    function drainPendingSessionAuthoritySettlements(): void {
        const snapshot: ScanSessionAuthority[] = [];
        call(mapForEach, pendingSessionAuthoritySettlements, [
            (_value: true, authority: ScanSessionAuthority) => {
                appendOwnedValue(snapshot, authority, MAX_PROVENANCE_AUTHORITIES);
            },
        ]);
        for (let index = 0; index < snapshot.length; index += 1) {
            const authority = snapshot[index];
            if (authority)
                settleScanSessionAuthority(authority);
        }
    }
    function retainScanSessionAuthority(authority: ScanSessionAuthority): ScanSessionLease | null {
        if (authority.phase !== 'active' || !numberIsSafeInteger(authority.references) || authority.references < 0) {
            return null;
        }
        const next = authority.references + 1;
        if (!numberIsSafeInteger(next))
            return null;
        authority.references = next;
        return { authority, phase: 'active' };
    }
    function releaseScanSessionLease(lease: ScanSessionLease): boolean {
        if (lease.phase === 'released')
            return true;
        const authority = lease.authority;
        if (lease.phase === 'active') {
            if (!numberIsSafeInteger(authority.references) || authority.references <= 0)
                return false;
            lease.phase = 'settling';
            authority.references -= 1;
            if (authority.references > 0) {
                lease.phase = 'released';
                return true;
            }
        }
        if (authority.references !== 0 || !settleScanSessionAuthority(authority))
            return false;
        lease.phase = 'released';
        return true;
    }
    function scanSessionLeaseIsCurrent(lease: ScanSessionLease): boolean {
        const authority = lease.authority;
        try {
            return (lease.phase === 'active' &&
                authority.phase === 'active' &&
                isExactTrue(authority.attestLower()) &&
                lease.phase === 'active' &&
                authority.phase === 'active');
        }
        catch {
            return false;
        }
    }
    function attestScanSessionLease(lease: ScanSessionLease): boolean {
        const authority = lease.authority;
        try {
            return (scanSessionLeaseIsCurrent(lease) &&
                isExactTrue(attestScan(authority.session)) &&
                scanSessionLeaseIsCurrent(lease));
        }
        catch {
            return false;
        }
    }
    function openScanSession(generation: Readonly<object>): ScanSessionLease | null {
        drainPendingSessionAuthoritySettlements();
        if (reservedSessionAuthoritySlots >= MAX_PROVENANCE_AUTHORITIES)
            return null;
        reservedSessionAuthoritySlots += 1;
        const reservation = { held: true };
        const candidateOwner: {
            authority: ScanSessionAuthority | null;
        } = { authority: null };
        let adoptionOpen = true;
        try {
            const admitted = beginScan(freezeExact([generation]), (session, release, attest): boolean => {
                if (!adoptionOpen ||
                    candidateOwner.authority ||
                    !isObject(session) ||
                    typeof release !== 'function' ||
                    typeof attest !== 'function') {
                    return false;
                }
                candidateOwner.authority = {
                    session,
                    releaseLower: release,
                    attestLower: attest,
                    phase: 'active',
                    references: 0,
                    releaseInFlight: false,
                    slotReserved: true,
                };
                reservation.held = false;
                return true;
            });
            adoptionOpen = false;
            const authority = candidateOwner.authority;
            if (!admitted || !authority) {
                if (authority)
                    settleScanSessionAuthority(authority);
                return null;
            }
            const lease = retainScanSessionAuthority(authority);
            if (!lease || !scanSessionLeaseIsCurrent(lease)) {
                if (lease)
                    releaseScanSessionLease(lease);
                else
                    settleScanSessionAuthority(authority);
                return null;
            }
            return lease;
        }
        catch {
            adoptionOpen = false;
            const authority = candidateOwner.authority;
            if (authority)
                settleScanSessionAuthority(authority);
            return null;
        }
        finally {
            adoptionOpen = false;
            if (reservation.held)
                reservedSessionAuthoritySlots -= 1;
        }
    }
    function captureCommandAt(sessionLease: ScanSessionLease, listAuthority: InterpreterListAuthority, index: number): CommandCapture {
        if (index >= (listAuthority.facts.length ?? 0))
            return freezeExact({ status: 'boundary' });
        if (!scanSessionLeaseIsCurrent(sessionLease))
            return freezeExact({ status: 'fault' });
        const adoption: {
            open: boolean;
            inFlight: boolean;
            window: ForesightScanCommandWindow | null;
        } = { open: true, inFlight: false, window: null };
        let accepted: boolean;
        try {
            accepted = readCommand(sessionLease.authority.session, listAuthority.generation, index, (candidate): boolean => {
                if (!adoption.open || adoption.inFlight || adoption.window || !isObject(candidate))
                    return false;
                adoption.inFlight = true;
                try {
                    if (!adoption.open || adoption.window)
                        return false;
                    adoption.window = candidate;
                    return true;
                }
                finally {
                    adoption.inFlight = false;
                }
            });
        }
        catch {
            accepted = false;
        }
        finally {
            adoption.open = false;
        }
        const adoptedWindow = adoption.window;
        if (!accepted || !adoptedWindow || !scanSessionLeaseIsCurrent(sessionLease)) {
            return freezeExact({ status: 'fault' });
        }
        let facts: ForesightScanCommandFacts | null;
        try {
            facts = readCommandFacts(sessionLease.authority.session, adoptedWindow);
        }
        catch {
            facts = null;
        }
        if (facts?.index !== index || !scanSessionLeaseIsCurrent(sessionLease)) {
            return freezeExact({ status: 'fault' });
        }
        return freezeExact({ status: 'accepted', facts });
    }
    function prepareParserReceipt(session: unknown, generation: unknown, startIndex: unknown, interpreterId: unknown, commandAllowance: unknown): object | null {
        drainPendingParserReceiptSettlements();
        if (reservedParserReceiptSlots >= MAX_PROVENANCE_AUTHORITIES)
            return null;
        reservedParserReceiptSlots += 1;
        const adoption: {
            open: boolean;
            inFlight: boolean;
            receipt: object | null;
            ownsReservation: boolean;
        } = { open: true, inFlight: false, receipt: null, ownsReservation: false };
        let ownershipTransferred = false;
        try {
            const admitted = prepareAdmittedMessageCommandBlock(session, generation, startIndex, interpreterId, commandAllowance, (candidate): boolean => {
                if (!adoption.open ||
                    adoption.inFlight ||
                    adoption.receipt ||
                    !isObject(candidate) ||
                    call<true | undefined>(weakMapGet, parserReceiptReservations, [candidate])) {
                    return false;
                }
                adoption.inFlight = true;
                try {
                    if (!adoption.open || adoption.receipt)
                        return false;
                    adoption.receipt = candidate;
                    call(weakMapSet, parserReceiptReservations, [candidate, true]);
                    adoption.ownsReservation = true;
                    return true;
                }
                finally {
                    adoption.inFlight = false;
                }
            });
            adoption.open = false;
            if (!admitted || !adoption.receipt || !adoption.ownsReservation)
                return null;
            ownershipTransferred = true;
            return adoption.receipt;
        }
        catch {
            return null;
        }
        finally {
            adoption.open = false;
            if (!ownershipTransferred) {
                if (adoption.receipt && adoption.ownsReservation)
                    settleParserReceipt(adoption.receipt);
                else
                    reservedParserReceiptSlots -= 1;
            }
        }
    }
    function releaseParserReceiptReservation(receipt: object): void {
        if (call<true | undefined>(weakMapGet, parserReceiptReservations, [receipt]) !== true)
            return;
        call(weakMapDelete, parserReceiptReservations, [receipt]);
        reservedParserReceiptSlots -= 1;
    }
    function settleParserReceipt(receipt: object): boolean {
        let released: boolean;
        try {
            released = isExactTrue(retireMessageCommandBlock(receipt));
        }
        catch {
            released = false;
        }
        if (!released) {
            try {
                released = !isExactTrue(attestMessageCommandBlock(receipt));
            }
            catch {
                released = false;
            }
        }
        if (released) {
            call(mapDelete, pendingParserReceiptSettlements, [receipt]);
            releaseParserReceiptReservation(receipt);
            return true;
        }
        call(mapSet, pendingParserReceiptSettlements, [receipt, true]);
        return false;
    }
    function drainPendingParserReceiptSettlements(): void {
        const snapshot: object[] = [];
        call(mapForEach, pendingParserReceiptSettlements, [
            (_value: true, receipt: object) => {
                appendOwnedValue(snapshot, receipt, MAX_PROVENANCE_AUTHORITIES);
            },
        ]);
        for (let index = 0; index < snapshot.length; index += 1) {
            const receipt = snapshot[index];
            if (receipt)
                settleParserReceipt(receipt);
        }
    }
    function attestFrames(frames: readonly ProvenanceFrame[], isCurrent: () => boolean = () => true): boolean {
        for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
            const frame = frames[frameIndex];
            if (!isCurrent() || !frame || !attestInterpreterListLease(frame.listLease) || !isCurrent())
                return false;
            if (!attestInterpreterListLease(frame.listLease) || !isCurrent())
                return false;
        }
        return isCurrent();
    }
    function activeChildContext(token: unknown, interpreter: object): ChildContextRecord | null {
        if (!isObject(token))
            return null;
        const record = call<ChildContextRecord | undefined>(weakMapGet, childContexts, [token]);
        if (!record)
            return null;
        if (!childContextIsCurrent(token, record, interpreter))
            return null;
        if (!attestFrames(record.frames, () => childContextIsCurrent(token, record, interpreter)))
            return null;
        return childContextIsCurrent(token, record, interpreter) ? record : null;
    }
    function childContextIsCurrent(token: object, record: ChildContextRecord, interpreter: object): boolean {
        const descriptor = safeOwnDescriptor(interpreter, '_trForesightOriginContext');
        return (descriptorMatchesExact(descriptor, record.publishedDescriptor) &&
            record.phase === 'active' &&
            record.child === interpreter &&
            call<ChildContextRecord | undefined>(weakMapGet, childContexts, [token]) === record);
    }
    function retireExactChildPredecessor(candidate: unknown, target: object, predecessor: PropertyDescriptor | null): void {
        if (!isObject(candidate))
            return;
        const record = call<ChildContextRecord | undefined>(weakMapGet, childContexts, [candidate]);
        if (record?.phase !== 'active' || record.child !== target)
            return;
        const observed = safeOwnDescriptor(target, '_trForesightOriginContext');
        if (!observed ||
            !('value' in observed) ||
            !objectIs(observed.value, candidate) ||
            !descriptorMatchesExact(observed, predecessor) ||
            !descriptorMatchesExact(observed, record.publishedDescriptor) ||
            record.phase !== 'active' ||
            record.child !== target ||
            call<ChildContextRecord | undefined>(weakMapGet, childContexts, [candidate]) !== record) {
            return;
        }
        retireOwnedToken(candidate);
    }
    function retireExactOriginPredecessor(candidate: unknown, target: object, predecessor: PropertyDescriptor | null): void {
        if (!isObject(candidate))
            return;
        const record = call<OriginRecord | undefined>(weakMapGet, origins, [candidate]);
        if (record?.phase !== 'active' || record.gameMessage !== target)
            return;
        const observed = safeOwnDescriptor(target, '_trMessageOrigin');
        if (!observed ||
            !('value' in observed) ||
            !objectIs(observed.value, candidate) ||
            !descriptorMatchesExact(observed, predecessor) ||
            !descriptorMatchesExact(observed, record.publishedDescriptor) ||
            record.phase !== 'active' ||
            record.gameMessage !== target ||
            call<OriginRecord | undefined>(weakMapGet, origins, [candidate]) !== record) {
            return;
        }
        retireOwnedToken(candidate);
    }
    function childPublicationAuthorityIsCurrent(executionToken: object, execution: ExecutionRecord, token: object, childRecord: ChildContextRecord, parent: object, child: object): boolean {
        const localIsCurrent = (): boolean => {
            const observedChild = ownData(parent, '_childInterpreter');
            return (objectIs(observedChild, child) &&
                executionMatchesPhase(executionToken, execution, 'creating-child') &&
                childRecord.phase === 'active' &&
                childRecord.child === child &&
                call<ChildContextRecord | undefined>(weakMapGet, childContexts, [token]) === childRecord);
        };
        if (!localIsCurrent())
            return false;
        if (!attestExecutionForPhase(executionToken, execution, 'creating-child', true) || !localIsCurrent()) {
            return false;
        }
        if (!attestScanSessionLease(execution.sessionLease) || !localIsCurrent())
            return false;
        if (!attestExecutionForPhase(executionToken, execution, 'creating-child', true) || !localIsCurrent()) {
            return false;
        }
        return attestFrames(childRecord.frames, localIsCurrent) && localIsCurrent();
    }
    function attestInterpreterListAuthority(authority: InterpreterListAuthority): boolean {
        try {
            if (authority.phase !== 'active' || authority.references < 0)
                return false;
            const before = captureInterpreterListBinding(authority.interpreter);
            if (!before || !sameListBindingFacts(before.facts, authority.binding))
                return false;
            if (!authority.attestLower() ||
                authority.phase !== 'active' ||
                !attestEventListBinding(authority.generation, before.source)) {
                return false;
            }
            const after = captureInterpreterListBinding(authority.interpreter);
            if (!after ||
                !objectIs(after.source, before.source) ||
                !sameListBindingFacts(after.facts, authority.binding)) {
                return false;
            }
            if (!authority.attestLower() ||
                authority.phase !== 'active' ||
                !attestEventListBinding(authority.generation, after.source)) {
                return false;
            }
            const settled = captureInterpreterListBinding(authority.interpreter);
            return (!!settled &&
                objectIs(settled.source, after.source) &&
                sameListBindingFacts(settled.facts, authority.binding) &&
                authority.phase === 'active');
        }
        catch {
            return false;
        }
    }
    function attestInterpreterListLease(lease: InterpreterListLease): boolean {
        return lease.phase === 'active' && attestInterpreterListAuthority(lease.authority);
    }
    function settleInterpreterListAuthority(authority: InterpreterListAuthority): boolean {
        if (authority.phase === 'retired')
            return true;
        if (authority.references !== 0)
            return false;
        if (authority.releaseInFlight) {
            authority.releaseRequested = true;
            return false;
        }
        authority.phase = 'retiring';
        authority.releaseInFlight = true;
        let released: boolean;
        try {
            try {
                released = isExactTrue(authority.releaseLower());
            }
            catch {
                released = false;
            }
            if (!released) {
                try {
                    released = !isExactTrue(authority.attestLower());
                }
                catch {
                    released = false;
                }
            }
        }
        finally {
            authority.releaseInFlight = false;
        }
        if (!released) {
            if (!call<boolean>(mapHas, pendingListAuthoritySettlements, [authority])) {
                call(mapSet, pendingListAuthoritySettlements, [authority, true]);
            }
            return false;
        }
        authority.phase = 'retired';
        authority.releaseRequested = false;
        call(mapDelete, pendingListAuthoritySettlements, [authority]);
        if (authority.slotReserved) {
            authority.slotReserved = false;
            reservedListAuthoritySlots -= 1;
        }
        const cached = call<InterpreterListAuthority | undefined>(weakMapGet, listLeases, [authority.interpreter]);
        if (cached === authority)
            call(weakMapDelete, listLeases, [authority.interpreter]);
        return true;
    }
    function drainPendingListAuthoritySettlements(): void {
        const snapshot: InterpreterListAuthority[] = [];
        call(mapForEach, pendingListAuthoritySettlements, [
            (_value: true, authority: InterpreterListAuthority) => {
                appendOwnedValue(snapshot, authority, MAX_PROVENANCE_AUTHORITIES);
            },
        ]);
        for (let index = 0; index < snapshot.length; index += 1) {
            const authority = snapshot[index];
            if (authority)
                settleInterpreterListAuthority(authority);
        }
    }
    function retainInterpreterListAuthority(authority: InterpreterListAuthority): InterpreterListLease | null {
        if (authority.phase !== 'active' || !numberIsSafeInteger(authority.references) || authority.references < 0) {
            return null;
        }
        const next = authority.references + 1;
        if (!numberIsSafeInteger(next))
            return null;
        authority.references = next;
        return { authority, phase: 'active' };
    }
    function releaseInterpreterListLease(lease: InterpreterListLease): boolean {
        if (lease.phase === 'released')
            return true;
        const authority = lease.authority;
        if (lease.phase === 'active') {
            if (!numberIsSafeInteger(authority.references) || authority.references <= 0)
                return false;
            lease.phase = 'settling';
            authority.references -= 1;
            if (authority.references > 0) {
                lease.phase = 'released';
                return true;
            }
        }
        if (authority.references !== 0)
            return false;
        if (!settleInterpreterListAuthority(authority))
            return false;
        lease.phase = 'released';
        return true;
    }
    function retainProvenanceFrame(frame: ProvenanceFrame): ProvenanceFrame | null {
        const listLease = retainInterpreterListAuthority(frame.listLease.authority);
        if (!listLease)
            return null;
        return freezeExact({
            listLease,
            index: frame.index,
            expectedIndent: frame.expectedIndent,
            interpreterId: frame.interpreterId,
            listId: frame.listId,
            commonEventId: frame.commonEventId,
            commonEventName: frame.commonEventName,
            parentInterpreterId: frame.parentInterpreterId,
            parentListId: frame.parentListId,
            parentCommandIndex: frame.parentCommandIndex,
            parentCommandCode: frame.parentCommandCode,
        });
    }
    function retainProvenanceFrames(frames: readonly ProvenanceFrame[]): readonly ProvenanceFrame[] | null {
        const retained: ProvenanceFrame[] = [];
        for (let index = 0; index < frames.length; index += 1) {
            const source = frames[index];
            const frame = source ? retainProvenanceFrame(source) : null;
            if (!frame) {
                releaseProvenanceFrames(retained);
                return null;
            }
            if (!appendOwnedValue(retained, frame, MAX_ORIGIN_FRAMES)) {
                releaseInterpreterListLease(frame.listLease);
                releaseProvenanceFrames(retained);
                return null;
            }
        }
        return freezeExact(retained);
    }
    function releaseProvenanceFrames(frames: readonly ProvenanceFrame[]): boolean {
        let complete = true;
        for (let index = 0; index < frames.length; index += 1) {
            const frame = frames[index];
            if (frame && !releaseInterpreterListLease(frame.listLease))
                complete = false;
        }
        return complete;
    }
    function validEventListFacts(value: unknown): value is ForesightListGenerationFacts {
        if (!isObject(value))
            return false;
        const identity = ownData(value, 'identity');
        const kind = ownData(value, 'kind');
        const length = ownData(value, 'length');
        return (isObject(identity) &&
            kind === 'event-list' &&
            typeof length === 'number' &&
            numberIsSafeInteger(length) &&
            length >= 0);
    }
    function acquireInterpreterListLease(interpreter: object): InterpreterListLease | null {
        drainPendingListAuthoritySettlements();
        if (call<Readonly<object> | undefined>(weakMapGet, listLeaseAcquisitions, [interpreter]))
            return null;
        const acquisition = createOpaqueToken();
        call(weakMapSet, listLeaseAcquisitions, [interpreter, acquisition]);
        const candidateOwner: {
            authority: InterpreterListAuthority | null;
        } = { authority: null };
        let adoptionOpen = true;
        let authoritySlotReserved = false;
        try {
            const observed = captureInterpreterListBinding(interpreter);
            if (!observed)
                return null;
            const existing = call<InterpreterListAuthority | undefined>(weakMapGet, listLeases, [interpreter]);
            if (existing?.phase === 'retiring') {
                if (!settleInterpreterListAuthority(existing))
                    return null;
            }
            else if (existing?.interpreter === interpreter) {
                if (attestInterpreterListAuthority(existing))
                    return retainInterpreterListAuthority(existing);
                if (existing.references !== 0 || !settleInterpreterListAuthority(existing))
                    return null;
            }
            if (reservedListAuthoritySlots >= MAX_PROVENANCE_AUTHORITIES)
                return null;
            reservedListAuthoritySlots += 1;
            authoritySlotReserved = true;
            const adopted = admitEventListGeneration(observed.source, (generation, facts, release, attest): boolean => {
                if (!adoptionOpen ||
                    candidateOwner.authority ||
                    !isObject(generation) ||
                    !validEventListFacts(facts) ||
                    typeof release !== 'function' ||
                    typeof attest !== 'function') {
                    return false;
                }
                candidateOwner.authority = {
                    interpreter,
                    generation,
                    facts,
                    binding: observed.facts,
                    releaseLower: release,
                    attestLower: attest,
                    phase: 'active',
                    references: 0,
                    releaseInFlight: false,
                    releaseRequested: false,
                    slotReserved: true,
                };
                authoritySlotReserved = false;
                return true;
            });
            adoptionOpen = false;
            const candidate = candidateOwner.authority;
            if (!adopted || !candidate || !attestInterpreterListAuthority(candidate)) {
                if (candidate)
                    settleInterpreterListAuthority(candidate);
                return null;
            }
            if (call<Readonly<object> | undefined>(weakMapGet, listLeaseAcquisitions, [interpreter]) !== acquisition) {
                settleInterpreterListAuthority(candidate);
                return null;
            }
            call(weakMapSet, listLeases, [interpreter, candidate]);
            const lease = retainInterpreterListAuthority(candidate);
            if (!lease) {
                settleInterpreterListAuthority(candidate);
                return null;
            }
            return lease;
        }
        catch {
            adoptionOpen = false;
            const candidate = candidateOwner.authority;
            if (candidate?.references === 0)
                settleInterpreterListAuthority(candidate);
            return null;
        }
        finally {
            adoptionOpen = false;
            if (authoritySlotReserved)
                reservedListAuthoritySlots -= 1;
            if (call<Readonly<object> | undefined>(weakMapGet, listLeaseAcquisitions, [interpreter]) === acquisition) {
                call(weakMapDelete, listLeaseAcquisitions, [interpreter]);
            }
        }
    }
    function prepareExecution(options: unknown = {}): Readonly<object> | null {
        drainProvenanceCleanup();
        let lease: InterpreterListLease | null = null;
        let sessionLease: ScanSessionLease | null = null;
        let inheritedFrames: readonly ProvenanceFrame[] = freezeExact([] as ProvenanceFrame[]);
        let transferred = false;
        let recordSlotReserved = false;
        try {
            const interpreter = ownData(options, 'interpreter');
            if (!isObject(interpreter))
                return null;
            lease = acquireInterpreterListLease(interpreter);
            if (!lease)
                return null;
            const startIndex = safeIndex(ownData(interpreter, '_index'));
            if (startIndex === null)
                return null;
            sessionLease = openScanSession(lease.authority.generation);
            if (!sessionLease)
                return null;
            const captured = captureCommandAt(sessionLease, lease.authority, startIndex);
            if (captured.status !== 'accepted')
                return null;
            const commandCode = safeFiniteNumber(ownData(captured.facts.command, 'code'));
            const indent = safeFiniteNumber(ownData(captured.facts.command, 'indent')) ?? 0;
            if (commandCode === null)
                return null;
            const parameters = ownData(captured.facts.command, 'parameters');
            const commonEventId = commandCode === COMMON_EVENT_COMMAND_CODE && arrayIsArray(parameters)
                ? positiveSafeInteger(ownData(parameters, '0'))
                : null;
            const inheritedToken = ownData(options, 'inheritedContext');
            const inherited = activeChildContext(inheritedToken, interpreter);
            if (isObject(inheritedToken) && !inherited)
                return null;
            const identity = inherited ? inherited.identity : captureIdentity(ownData(options, 'identity'), 'attached');
            const retainedFrames = inherited ? retainProvenanceFrames(inherited.frames) : inheritedFrames;
            if (!retainedFrames)
                return null;
            inheritedFrames = retainedFrames;
            if (!reserveRecordSlot())
                return null;
            recordSlotReserved = true;
            const token = createOpaqueToken();
            const record: ExecutionRecord = {
                phase: 'active',
                releaseInFlight: false,
                token,
                interpreter,
                listLease: lease,
                sessionLease,
                startIndex,
                commandCode,
                indent,
                commonEventId,
                identity,
                inheritedFrames,
                maxCommands: normalizedMaxCommands(ownData(options, 'maxCommands')),
                parserBorrows: 0,
                slotReserved: true,
            };
            call(weakMapSet, executions, [token, record]);
            if (!attestExecutionForPhase(token, record, 'active', true) ||
                !attestScanSessionLease(record.sessionLease) ||
                !attestExecutionForPhase(token, record, 'active', true)) {
                call(weakMapDelete, executions, [token]);
                record.phase = 'releasing';
                markRetired(token);
                return null;
            }
            transferred = true;
            recordSlotReserved = false;
            return token;
        }
        catch {
            return null;
        }
        finally {
            if (!transferred) {
                if (recordSlotReserved)
                    reservedRecordSlots -= 1;
                if (sessionLease)
                    releaseScanSessionLease(sessionLease);
                if (lease)
                    releaseInterpreterListLease(lease);
                releaseProvenanceFrames(inheritedFrames);
            }
        }
    }
    function attestExecutionList(record: ExecutionRecord): boolean {
        return (record.listLease.authority.interpreter === record.interpreter &&
            attestInterpreterListLease(record.listLease));
    }
    function executionMatchesPhase(token: object, record: ExecutionRecord, phase: ExecutionRecord['phase']): boolean {
        return record.phase === phase && call<ExecutionRecord | undefined>(weakMapGet, executions, [token]) === record;
    }
    function pendingMatchesPhase(token: object, record: PendingMessageRecord, phase: PendingMessageRecord['phase']): boolean {
        return (record.phase === phase &&
            call<PendingMessageRecord | undefined>(weakMapGet, pendingMessages, [token]) === record);
    }
    function releasePendingParserBorrow(pending: PendingMessageRecord): boolean {
        if (pending.borrowReleased)
            return true;
        const execution = pending.execution;
        if (!numberIsSafeInteger(execution.parserBorrows) || execution.parserBorrows <= 0)
            return false;
        execution.parserBorrows -= 1;
        pending.borrowReleased = true;
        return true;
    }
    function attestExecutionForPhase(token: object, record: ExecutionRecord, phase: ExecutionRecord['phase'], requireCurrentIndex: boolean): boolean {
        if (!executionMatchesPhase(token, record, phase))
            return false;
        if (!attestExecutionList(record) || !executionMatchesPhase(token, record, phase))
            return false;
        if (requireCurrentIndex &&
            (!objectIs(ownData(record.interpreter, '_index'), record.startIndex) ||
                !executionMatchesPhase(token, record, phase))) {
            return false;
        }
        if (!scanSessionLeaseIsCurrent(record.sessionLease) || !executionMatchesPhase(token, record, phase))
            return false;
        return attestFrames(record.inheritedFrames) && executionMatchesPhase(token, record, phase);
    }
    function activeExecution(token: unknown): ExecutionRecord | null {
        if (!isObject(token))
            return null;
        const record = call<ExecutionRecord | undefined>(weakMapGet, executions, [token]);
        return record && attestExecutionForPhase(token, record, 'active', true) ? record : null;
    }
    function readExecution(token: unknown): ForesightExecutionView | null {
        const record = activeExecution(token);
        if (!record)
            return null;
        return frozenRecord([
            ['commandCode', record.commandCode],
            ['commonEventId', record.commonEventId],
            ['indent', record.indent],
            ['interpreterId', record.identity.interpreterId],
            ['listId', record.identity.listId],
            ['maxCommands', record.maxCommands],
            ['startIndex', record.startIndex],
        ]) as unknown as ForesightExecutionView;
    }
    function releaseExecution(token: unknown): boolean {
        if (!isObject(token))
            return false;
        const record = call<ExecutionRecord | undefined>(weakMapGet, executions, [token]);
        if (!record)
            return isRetiredToken(token);
        if (record.phase === 'released')
            return true;
        if (record.releaseInFlight)
            return false;
        if (record.parserBorrows !== 0) {
            journalRecordRetirement(token);
            return false;
        }
        record.phase = 'releasing';
        record.releaseInFlight = true;
        let complete: boolean;
        try {
            const sessionReleased = releaseScanSessionLease(record.sessionLease);
            const listReleased = releaseInterpreterListLease(record.listLease);
            const framesReleased = releaseProvenanceFrames(record.inheritedFrames);
            complete = sessionReleased && listReleased && framesReleased;
        }
        finally {
            record.releaseInFlight = false;
        }
        if (!complete) {
            journalRecordRetirement(token);
            return false;
        }
        record.phase = 'released';
        call(weakMapDelete, executions, [token]);
        call(mapDelete, pendingRecordRetirements, [token]);
        releaseRecordSlot(record);
        markRetired(token);
        return true;
    }
    function captureContinuationEvidence(record: ExecutionRecord): {
        readonly nextIndex: number;
    } | null {
        const continuationCode = ownData(CONTINUATION_CODES, String(record.commandCode));
        if (typeof continuationCode !== 'number') {
            return freezeExact({ nextIndex: record.startIndex + 1 });
        }
        let nextIndex = record.startIndex + 1;
        const endIndex = record.startIndex + record.maxCommands + MAX_SCAN_LOOKAHEAD;
        while (nextIndex < endIndex) {
            const captured = captureCommandAt(record.sessionLease, record.listLease.authority, nextIndex);
            if (captured.status === 'fault')
                return null;
            if (captured.status === 'boundary')
                break;
            const code = safeFiniteNumber(ownData(captured.facts.command, 'code'));
            const indent = safeFiniteNumber(ownData(captured.facts.command, 'indent')) ?? 0;
            if (code === null)
                return null;
            if (code !== continuationCode || indent !== record.indent)
                break;
            nextIndex += 1;
        }
        return freezeExact({ nextIndex });
    }
    function commonEventName(commonEventId: number | null): string {
        if (commonEventId === null || !isObject(globalScope))
            return '';
        const table = ownData(globalScope, '$dataCommonEvents');
        if (!isObject(table))
            return '';
        const event = ownData(table, String(commonEventId));
        return safeString(ownData(event, 'name'));
    }
    function childIdentity(record: ExecutionRecord, supplied: unknown): IdentityFacts {
        const parent = record.identity;
        const commonEventId = record.commonEventId;
        const suffix = commonEventId === null ? `child:${stringFrom(record.startIndex)}` : `common:${stringFrom(commonEventId)}`;
        const derivedInterpreterId = `${parent.interpreterId}:${suffix}`;
        const derivedListId = commonEventId === null ? `${parent.listId}:${suffix}` : `common:${stringFrom(commonEventId)}`;
        const suppliedInterpreterId = safeString(ownData(supplied, 'interpreterId'));
        const suppliedListId = safeString(ownData(supplied, 'listId'));
        const suppliedCommonEventName = safeString(ownData(supplied, 'commonEventName'));
        return freezeExact({
            interpreterId: suppliedInterpreterId || derivedInterpreterId,
            listId: suppliedListId || derivedListId,
            commonEventId,
            commonEventName: suppliedCommonEventName || commonEventName(commonEventId),
            parentInterpreterId: parent.interpreterId,
            parentListId: parent.listId,
            parentCommandIndex: record.startIndex,
            parentCommandCode: record.commandCode,
        });
    }
    function frameFromExecution(record: ExecutionRecord, index: number): ProvenanceFrame | null {
        const listLease = retainInterpreterListAuthority(record.listLease.authority);
        if (!listLease)
            return null;
        return freezeExact({
            listLease,
            index,
            expectedIndent: record.indent,
            ...record.identity,
        });
    }
    function createChildContext(executionToken: unknown, parent: unknown, child: unknown, identity: unknown = null): boolean {
        drainProvenanceCleanup();
        let record: ExecutionRecord | null = null;
        let token: object | null = null;
        let childRecord: ChildContextRecord | null = null;
        let ownedFrames: readonly ProvenanceFrame[] = freezeExact([] as ProvenanceFrame[]);
        let framesTransferred = false;
        let recordSlotReserved = false;
        try {
            record = activeExecution(executionToken);
            if (!record || record.interpreter !== parent || !isObject(child) || child === parent)
                return false;
            if (!objectIs(ownData(parent, '_childInterpreter'), child))
                return false;
            if (record.inheritedFrames.length >= MAX_ORIGIN_FRAMES)
                return false;
            const childSlot = publicationSlot(child, '_trForesightOriginContext');
            const childRevision = childSlot.revision;
            const previousDescriptor = captureOwnDescriptor(child, '_trForesightOriginContext');
            if (previousDescriptor === 'fault')
                return false;
            const previous: unknown = previousDescriptor && 'value' in previousDescriptor ? previousDescriptor.value : undefined;
            record.phase = 'creating-child';
            const continuation = captureContinuationEvidence(record);
            if (!executionMatchesPhase(executionToken as object, record, 'creating-child'))
                return false;
            if (!continuation)
                return false;
            const inheritedFrames = retainProvenanceFrames(record.inheritedFrames);
            if (!inheritedFrames)
                return false;
            const frames: ProvenanceFrame[] = [];
            for (let index = 0; index < inheritedFrames.length; index += 1) {
                const frame = inheritedFrames[index];
                if (!frame || !appendOwnedValue(frames, frame, MAX_ORIGIN_FRAMES)) {
                    releaseProvenanceFrames(inheritedFrames);
                    return false;
                }
            }
            const currentFrame = frameFromExecution(record, continuation.nextIndex);
            if (!currentFrame) {
                releaseProvenanceFrames(inheritedFrames);
                return false;
            }
            if (!appendOwnedValue(frames, currentFrame, MAX_ORIGIN_FRAMES)) {
                releaseInterpreterListLease(currentFrame.listLease);
                releaseProvenanceFrames(inheritedFrames);
                return false;
            }
            ownedFrames = freezeExact(frames);
            if (ownedFrames.length > MAX_ORIGIN_FRAMES)
                return false;
            if (!reserveRecordSlot())
                return false;
            recordSlotReserved = true;
            token = createOpaqueToken();
            const publishedDescriptor = createTranslatorDescriptor(previousDescriptor, token);
            if (!publishedDescriptor)
                return false;
            childRecord = {
                phase: 'active',
                releaseInFlight: false,
                child,
                publishedDescriptor: freezeExact(publishedDescriptor),
                identity: childIdentity(record, identity),
                frames: ownedFrames,
                slotReserved: true,
            };
            recordSlotReserved = false;
            call(weakMapSet, childContexts, [token, childRecord]);
            retireExactChildPredecessor(previous, child, previousDescriptor);
            if (!objectIs(ownData(parent, '_childInterpreter'), child) ||
                !publishTranslatorData(child, '_trForesightOriginContext', previousDescriptor, token, childRevision, () => !!record &&
                    !!token &&
                    !!childRecord &&
                    childPublicationAuthorityIsCurrent(executionToken as object, record, token, childRecord, parent, child))) {
                childRecord.phase = 'retiring';
                call(weakMapDelete, childContexts, [token]);
                markRetired(token);
                return false;
            }
            framesTransferred = true;
            return true;
        }
        catch {
            return false;
        }
        finally {
            if (record?.phase === 'creating-child')
                record.phase = 'active';
            if (!framesTransferred) {
                if (token && childRecord) {
                    if (call<ChildContextRecord | undefined>(weakMapGet, childContexts, [token]) === childRecord) {
                        call(weakMapDelete, childContexts, [token]);
                        markRetired(token);
                    }
                    releaseRecordSlot(childRecord);
                }
                else if (recordSlotReserved) {
                    reservedRecordSlots -= 1;
                }
                releaseProvenanceFrames(ownedFrames);
            }
        }
    }
    function prepareMessage(executionToken: unknown, gameMessage: unknown, beforeMessageState: unknown, maxCommands: unknown): Readonly<object> | null {
        drainProvenanceCleanup();
        let execution: ExecutionRecord | null = null;
        let parserReceipt: object | null = null;
        let pendingToken: object | null = null;
        let pending: PendingMessageRecord | null = null;
        let recordSlotReserved = false;
        let parserBorrowIncremented = false;
        let ownershipTransferred = false;
        try {
            execution = activeExecution(executionToken);
            const before = messageState(beforeMessageState);
            if (!execution)
                return null;
            if (execution.commandCode !== MESSAGE_COMMAND_CODE || !isObject(gameMessage) || !before) {
                return null;
            }
            const originSlot = publicationSlot(gameMessage, '_trMessageOrigin');
            const originRevision = originSlot.revision;
            const previousOriginDescriptor = captureOwnDescriptor(gameMessage, '_trMessageOrigin');
            if (previousOriginDescriptor === 'fault')
                return null;
            const previousOrigin: unknown = previousOriginDescriptor && 'value' in previousOriginDescriptor
                ? previousOriginDescriptor.value
                : undefined;
            execution.phase = 'preparing-message';
            const commandAllowance = mathMin(execution.maxCommands, normalizedMaxCommands(maxCommands), MAX_EXECUTION_SCAN_COMMANDS);
            parserReceipt = prepareParserReceipt(execution.sessionLease.authority.session, execution.listLease.authority.generation, execution.startIndex, execution.identity.interpreterId, commandAllowance);
            if (!isObject(parserReceipt))
                return null;
            const block = readMessageCommandBlock(parserReceipt);
            if (!block ||
                block.rejected === true ||
                !block.complete ||
                block.startIndex !== execution.startIndex ||
                block.indent !== execution.indent ||
                block.rawText.length > MAX_MESSAGE_TEXT_UNITS) {
                return null;
            }
            const originDescriptorAfterParse = captureOwnDescriptor(gameMessage, '_trMessageOrigin');
            if (originDescriptorAfterParse === 'fault' ||
                originSlot.revision !== originRevision ||
                !attestExecutionForPhase(executionToken as object, execution, 'preparing-message', true) ||
                !descriptorMatchesExact(originDescriptorAfterParse, previousOriginDescriptor)) {
                return null;
            }
            if (!reserveRecordSlot())
                return null;
            recordSlotReserved = true;
            pendingToken = createOpaqueToken();
            pending = {
                phase: 'active',
                releaseInFlight: false,
                execution,
                gameMessage,
                before,
                previousOrigin,
                previousOriginDescriptor,
                originRevision,
                parserReceipt,
                parserReceiptRetired: false,
                borrowReleased: false,
                block,
                slotReserved: true,
            };
            recordSlotReserved = false;
            call(weakMapSet, pendingMessages, [pendingToken, pending]);
            execution.parserBorrows += 1;
            parserBorrowIncremented = true;
            if (!executionMatchesPhase(executionToken as object, execution, 'preparing-message')) {
                return null;
            }
            execution.phase = 'active';
            ownershipTransferred = true;
            return pendingToken;
        }
        catch {
            return null;
        }
        finally {
            if (!ownershipTransferred) {
                if (pendingToken &&
                    pending &&
                    call<PendingMessageRecord | undefined>(weakMapGet, pendingMessages, [pendingToken]) === pending) {
                    call(weakMapDelete, pendingMessages, [pendingToken]);
                }
                if (parserBorrowIncremented && execution && execution.parserBorrows > 0) {
                    execution.parserBorrows -= 1;
                }
                if (parserReceipt)
                    settleParserReceipt(parserReceipt);
                if (pending)
                    releaseRecordSlot(pending);
                else if (recordSlotReserved)
                    reservedRecordSlots -= 1;
            }
            if (execution?.phase === 'preparing-message')
                execution.phase = 'active';
        }
    }
    function settleMessage(pendingToken: unknown, afterMessageState: unknown): Readonly<object> | null {
        drainProvenanceCleanup();
        if (!isObject(pendingToken))
            return null;
        const pending = call<PendingMessageRecord | undefined>(weakMapGet, pendingMessages, [pendingToken]);
        if (!pending)
            return null;
        if (pending.phase !== 'active')
            return null;
        pending.phase = 'settling';
        let transferred = false;
        let ownedListLease: InterpreterListLease | null = null;
        let ownedSessionLease: ScanSessionLease | null = null;
        let ownedFrames: readonly ProvenanceFrame[] = freezeExact([] as ProvenanceFrame[]);
        let originRecord: OriginRecord | null = null;
        let originSlotReserved = false;
        try {
            const after = messageState(afterMessageState);
            const execution = pending.execution;
            if (!after?.hasOwnData ||
                !messageStateChanged(pending.before, after) ||
                !attestPendingExecution(pendingToken, pending, execution) ||
                !attestMessageCommandBlock(pending.parserReceipt) ||
                !pendingMatchesPhase(pendingToken, pending, 'settling') ||
                !call<string>(stringTrim, pending.block.rawText, [])) {
                return null;
            }
            const currentOriginDescriptor = captureOwnDescriptor(pending.gameMessage, '_trMessageOrigin');
            if (currentOriginDescriptor === 'fault' ||
                !pendingMatchesPhase(pendingToken, pending, 'settling') ||
                !descriptorMatchesExact(currentOriginDescriptor, pending.previousOriginDescriptor)) {
                return null;
            }
            if (execution.inheritedFrames.length >= MAX_ORIGIN_FRAMES)
                return null;
            const inheritedFrames = retainProvenanceFrames(execution.inheritedFrames);
            if (!inheritedFrames)
                return null;
            const frames: ProvenanceFrame[] = [];
            for (let index = 0; index < inheritedFrames.length; index += 1) {
                const frame = inheritedFrames[index];
                if (!frame || !appendOwnedValue(frames, frame, MAX_ORIGIN_FRAMES)) {
                    releaseProvenanceFrames(inheritedFrames);
                    return null;
                }
            }
            const currentFrame = frameFromExecution(execution, pending.block.nextIndex);
            if (!currentFrame) {
                releaseProvenanceFrames(inheritedFrames);
                return null;
            }
            if (!appendOwnedValue(frames, currentFrame, MAX_ORIGIN_FRAMES)) {
                releaseInterpreterListLease(currentFrame.listLease);
                releaseProvenanceFrames(inheritedFrames);
                return null;
            }
            ownedFrames = freezeExact(frames);
            if (ownedFrames.length > MAX_ORIGIN_FRAMES)
                return null;
            ownedListLease = retainInterpreterListAuthority(execution.listLease.authority);
            if (!ownedListLease)
                return null;
            ownedSessionLease = retainScanSessionAuthority(execution.sessionLease.authority);
            if (!ownedSessionLease)
                return null;
            if (!attestPendingExecution(pendingToken, pending, execution))
                return null;
            if (!reserveRecordSlot())
                return null;
            originSlotReserved = true;
            const originToken = createOpaqueToken();
            const publishedDescriptor = createTranslatorDescriptor(pending.previousOriginDescriptor, originToken);
            if (!publishedDescriptor)
                return null;
            const origin: OriginRecord = {
                phase: 'active',
                releaseInFlight: false,
                token: originToken,
                gameMessage: pending.gameMessage,
                publishedDescriptor: freezeExact(publishedDescriptor),
                listLease: ownedListLease,
                sessionLease: ownedSessionLease,
                startIndex: pending.block.startIndex,
                nextIndex: pending.block.nextIndex,
                indent: pending.block.indent,
                rawText: pending.block.rawText,
                identity: execution.identity,
                frames: ownedFrames,
                parserReceipt: pending.parserReceipt,
                parserReceiptRetired: false,
                slotReserved: true,
            };
            originRecord = origin;
            originSlotReserved = false;
            call(weakMapSet, origins, [originToken, origin]);
            if (pending.previousOrigin !== originToken) {
                retireExactOriginPredecessor(pending.previousOrigin, pending.gameMessage, pending.previousOriginDescriptor);
            }
            if (!publishTranslatorData(pending.gameMessage, '_trMessageOrigin', pending.previousOriginDescriptor, originToken, pending.originRevision, () => originPublicationAuthorityIsCurrent(pendingToken, pending, execution, originToken, origin))) {
                origin.phase = 'retiring';
                call(weakMapDelete, origins, [originToken]);
                markRetired(originToken);
                return null;
            }
            transferred = true;
            releaseScanSessionLease(execution.sessionLease);
            return originToken;
        }
        catch {
            return null;
        }
        finally {
            if (transferred) {
                releasePendingParserBorrow(pending);
                pending.phase = 'retired';
                call(weakMapDelete, pendingMessages, [pendingToken]);
                call(mapDelete, pendingRecordRetirements, [pendingToken]);
                releaseRecordSlot(pending);
                markRetired(pendingToken);
            }
            else {
                pending.phase = 'retiring';
                pending.parserReceiptRetired = settleParserReceipt(pending.parserReceipt);
                if (pending.parserReceiptRetired && releasePendingParserBorrow(pending)) {
                    pending.phase = 'retired';
                    call(weakMapDelete, pendingMessages, [pendingToken]);
                    call(mapDelete, pendingRecordRetirements, [pendingToken]);
                    releaseRecordSlot(pending);
                    markRetired(pendingToken);
                }
                else {
                    journalRecordRetirement(pendingToken);
                }
                if (ownedSessionLease)
                    releaseScanSessionLease(ownedSessionLease);
                if (ownedListLease)
                    releaseInterpreterListLease(ownedListLease);
                releaseProvenanceFrames(ownedFrames);
                if (originRecord)
                    releaseRecordSlot(originRecord);
                else if (originSlotReserved)
                    reservedRecordSlots -= 1;
            }
        }
    }
    function attestPendingExecution(pendingToken: object, pending: PendingMessageRecord, execution: ExecutionRecord): boolean {
        return (pendingMatchesPhase(pendingToken, pending, 'settling') &&
            execution.phase === 'active' &&
            execution.parserBorrows > 0 &&
            attestExecutionList(execution) &&
            pendingMatchesPhase(pendingToken, pending, 'settling') &&
            scanSessionLeaseIsCurrent(execution.sessionLease) &&
            pendingMatchesPhase(pendingToken, pending, 'settling') &&
            attestFrames(execution.inheritedFrames) &&
            pendingMatchesPhase(pendingToken, pending, 'settling'));
    }
    function originPublicationAuthorityIsCurrent(pendingToken: object, pending: PendingMessageRecord, execution: ExecutionRecord, originToken: object, origin: OriginRecord): boolean {
        const localIsCurrent = (): boolean => pendingMatchesPhase(pendingToken, pending, 'settling') &&
            origin.phase === 'active' &&
            call<OriginRecord | undefined>(weakMapGet, origins, [originToken]) === origin;
        if (!localIsCurrent() || !attestPendingExecution(pendingToken, pending, execution) || !localIsCurrent()) {
            return false;
        }
        if (!attestInterpreterListLease(origin.listLease) || !localIsCurrent())
            return false;
        if (!attestScanSessionLease(origin.sessionLease) || !localIsCurrent())
            return false;
        if (!attestMessageCommandBlock(origin.parserReceipt) || !localIsCurrent())
            return false;
        return attestFrames(origin.frames, localIsCurrent) && localIsCurrent();
    }
    function verifyMessageOrigin(originToken: unknown, gameMessage: unknown): boolean {
        try {
            if (!isObject(originToken) || !isObject(gameMessage))
                return false;
            const origin = call<OriginRecord | undefined>(weakMapGet, origins, [originToken]);
            if (!origin)
                return false;
            if (!originIsCurrent(originToken, origin, gameMessage))
                return false;
            if (!attestInterpreterListLease(origin.listLease))
                return false;
            if (!originIsCurrent(originToken, origin, gameMessage))
                return false;
            if (!attestScanSessionLease(origin.sessionLease))
                return false;
            if (!originIsCurrent(originToken, origin, gameMessage))
                return false;
            if (!attestMessageCommandBlock(origin.parserReceipt))
                return false;
            if (!originIsCurrent(originToken, origin, gameMessage))
                return false;
            if (!attestFrames(origin.frames, () => originIsCurrent(originToken, origin, gameMessage)))
                return false;
            return originIsCurrent(originToken, origin, gameMessage);
        }
        catch {
            return false;
        }
    }
    function originIsCurrent(originToken: object, origin: OriginRecord, gameMessage: object): boolean {
        const descriptor = safeOwnDescriptor(gameMessage, '_trMessageOrigin');
        return (descriptorMatchesExact(descriptor, origin.publishedDescriptor) &&
            origin.phase === 'active' &&
            origin.gameMessage === gameMessage &&
            call<OriginRecord | undefined>(weakMapGet, origins, [originToken]) === origin);
    }
    function resolveMessageOrigin(originToken: unknown): ForesightResolvedMessageOrigin | null {
        if (!isObject(originToken))
            return null;
        const origin = call<OriginRecord | undefined>(weakMapGet, origins, [originToken]);
        if (!origin || !verifyMessageOrigin(originToken, origin.gameMessage))
            return null;
        const frames: unknown[] = [];
        for (let index = 0; index < origin.frames.length; index += 1) {
            const frame = origin.frames[index];
            if (!frame)
                return null;
            const resolvedFrame = freezeExact({
                listGeneration: frame.listLease.authority.generation,
                index: frame.index,
                expectedIndent: frame.expectedIndent,
                interpreterId: frame.interpreterId,
                listId: frame.listId,
                commonEventId: frame.commonEventId,
                commonEventName: frame.commonEventName,
                parentInterpreterId: frame.parentInterpreterId,
                parentListId: frame.parentListId,
                parentCommandIndex: frame.parentCommandIndex,
                parentCommandCode: frame.parentCommandCode,
            });
            if (!appendOwnedValue(frames, resolvedFrame, MAX_ORIGIN_FRAMES))
                return null;
        }
        return freezeExact({
            listGeneration: origin.listLease.authority.generation,
            scanSession: origin.sessionLease.authority.session,
            startIndex: origin.startIndex,
            nextIndex: origin.nextIndex,
            indent: origin.indent,
            interpreterId: origin.identity.interpreterId,
            listId: origin.identity.listId,
            frames: freezeExact(frames),
        });
    }
    function readMessageOriginText(gameMessage: unknown): string {
        if (!isObject(gameMessage))
            return '';
        const token = ownData(gameMessage, '_trMessageOrigin');
        if (!isObject(token) || !verifyMessageOrigin(token, gameMessage))
            return '';
        const origin = call<OriginRecord | undefined>(weakMapGet, origins, [token]);
        return origin?.rawText ?? '';
    }
    function journalRecordRetirement(token: object): void {
        call(mapSet, pendingRecordRetirements, [token, true]);
    }
    function retireOwnedToken(token: object): boolean {
        const pending = call<PendingMessageRecord | undefined>(weakMapGet, pendingMessages, [token]);
        if (pending) {
            if (pending.phase === 'retired')
                return true;
            if (pending.phase === 'settling') {
                pending.phase = 'retiring';
                journalRecordRetirement(token);
                return false;
            }
            if (pending.releaseInFlight) {
                journalRecordRetirement(token);
                return false;
            }
            pending.phase = 'retiring';
            pending.releaseInFlight = true;
            try {
                pending.parserReceiptRetired =
                    pending.parserReceiptRetired || settleParserReceipt(pending.parserReceipt);
            }
            finally {
                pending.releaseInFlight = false;
            }
            if (!pending.parserReceiptRetired || !releasePendingParserBorrow(pending)) {
                journalRecordRetirement(token);
                return false;
            }
            pending.phase = 'retired';
            call(weakMapDelete, pendingMessages, [token]);
            call(mapDelete, pendingRecordRetirements, [token]);
            releaseRecordSlot(pending);
            markRetired(token);
            return true;
        }
        const origin = call<OriginRecord | undefined>(weakMapGet, origins, [token]);
        if (origin) {
            if (origin.phase === 'retired')
                return true;
            if (origin.releaseInFlight) {
                journalRecordRetirement(token);
                return false;
            }
            origin.phase = 'retiring';
            origin.releaseInFlight = true;
            let sessionReleased = false;
            let listReleased: boolean;
            let framesReleased: boolean;
            try {
                origin.parserReceiptRetired = origin.parserReceiptRetired || settleParserReceipt(origin.parserReceipt);
                if (origin.parserReceiptRetired)
                    sessionReleased = releaseScanSessionLease(origin.sessionLease);
                listReleased = releaseInterpreterListLease(origin.listLease);
                framesReleased = releaseProvenanceFrames(origin.frames);
            }
            finally {
                origin.releaseInFlight = false;
            }
            if (!origin.parserReceiptRetired || !sessionReleased || !listReleased || !framesReleased) {
                journalRecordRetirement(token);
                return false;
            }
            origin.phase = 'retired';
            call(weakMapDelete, origins, [token]);
            call(mapDelete, pendingRecordRetirements, [token]);
            releaseRecordSlot(origin);
            markRetired(token);
            return true;
        }
        const child = call<ChildContextRecord | undefined>(weakMapGet, childContexts, [token]);
        if (child) {
            if (child.phase === 'retired')
                return true;
            if (child.releaseInFlight) {
                journalRecordRetirement(token);
                return false;
            }
            child.phase = 'retiring';
            child.releaseInFlight = true;
            let framesReleased: boolean;
            try {
                framesReleased = releaseProvenanceFrames(child.frames);
            }
            finally {
                child.releaseInFlight = false;
            }
            if (!framesReleased) {
                journalRecordRetirement(token);
                return false;
            }
            child.phase = 'retired';
            call(weakMapDelete, childContexts, [token]);
            call(mapDelete, pendingRecordRetirements, [token]);
            releaseRecordSlot(child);
            markRetired(token);
            return true;
        }
        return isRetiredToken(token) || releaseExecution(token);
    }
    function drainPendingRecordRetirements(): void {
        if (recordRetirementDrainInFlight)
            return;
        recordRetirementDrainInFlight = true;
        try {
            const snapshot: object[] = [];
            call(mapForEach, pendingRecordRetirements, [
                (_value: true, token: object) => {
                    appendOwnedValue(snapshot, token, MAX_PROVENANCE_AUTHORITIES);
                },
            ]);
            for (let index = 0; index < snapshot.length; index += 1) {
                const token = snapshot[index];
                if (token)
                    retireOwnedToken(token);
            }
        }
        finally {
            recordRetirementDrainInFlight = false;
        }
    }
    function drainProvenanceCleanup(): void {
        drainPendingParserReceiptSettlements();
        drainPendingRecordRetirements();
        drainPendingSessionAuthoritySettlements();
        drainPendingListAuthoritySettlements();
    }
    function clear(gameMessage: unknown): boolean {
        drainProvenanceCleanup();
        if (!isObject(gameMessage))
            return false;
        const slot = publicationSlot(gameMessage, '_trMessageOrigin');
        const revision = slot.revision;
        const predecessor = captureOwnDescriptor(gameMessage, '_trMessageOrigin');
        if (predecessor === 'fault')
            return false;
        const token: unknown = predecessor && 'value' in predecessor ? predecessor.value : undefined;
        let ownedOriginToken: object | null = null;
        if (isObject(token)) {
            const origin = call<OriginRecord | undefined>(weakMapGet, origins, [token]);
            if (origin?.gameMessage === gameMessage && originIsCurrent(token, origin, gameMessage)) {
                ownedOriginToken = token;
            }
        }
        if (!publishTranslatorData(gameMessage, '_trMessageOrigin', predecessor, null, revision, () => true))
            return false;
        if (ownedOriginToken) {
            retireOwnedToken(ownedOriginToken);
            if (call<boolean>(mapHas, pendingRecordRetirements, [ownedOriginToken]))
                return false;
        }
        return true;
    }
    function retire(token: unknown): boolean {
        drainProvenanceCleanup();
        return isObject(token) && retireOwnedToken(token);
    }
    return freezeExact({
        prepareExecution,
        readExecution,
        releaseExecution,
        createChildContext,
        prepareMessage,
        settleMessage,
        verifyMessageOrigin,
        resolveMessageOrigin,
        readMessageOriginText,
        clear,
        retire,
    });
}
