type WeakKey = object;
export interface WindowRefreshLease {
    readonly sessionId: number;
    readonly depth: number;
    readonly outermost: boolean;
}
export interface WindowRefreshParticipantRegistration {
    readonly name: string;
}
export interface WindowRefreshSurfaceJournalRecord {
    readonly kind: 'surface-journal';
    readonly surface: WeakKey;
    readonly value: unknown;
}
export type WindowRefreshOrderedRecord = WindowRefreshSurfaceJournalRecord;
export interface WindowRefreshSessionSnapshot {
    readonly id: number;
    readonly window: WeakKey;
    readonly conservative: boolean;
    readonly records: readonly WindowRefreshOrderedRecord[];
}
export interface WindowRefreshParticipant<Prepared = unknown> {
    readonly name: string;
    readonly prepare: (session: WindowRefreshSessionSnapshot) => Prepared;
    readonly settle: (prepared: Prepared) => void;
    readonly fail: (prepared: Prepared, cause: unknown) => void;
    readonly discard: (prepared: Prepared, cause: unknown) => void;
}
export interface WindowRefreshSettlementReceipt {
    readonly status: 'joined' | 'settled' | 'settled-conservatively' | 'participant-failed' | 'superseded';
    readonly outermost: boolean;
}
export interface WindowRefreshActiveState {
    readonly active: boolean;
    readonly sessionId: number;
    readonly depth: number;
    readonly conservative: boolean;
}
export interface WindowRefreshSessionAuthority {
    readonly begin: (window: unknown) => WindowRefreshLease;
    readonly getActiveLease: (window: unknown) => WindowRefreshLease | null;
    readonly getActiveState: (window: unknown) => WindowRefreshActiveState;
    readonly appendSurfaceJournal: (lease: WindowRefreshLease, surface: unknown, value: unknown) => WindowRefreshSurfaceJournalRecord;
    readonly settleReturned: (lease: WindowRefreshLease, value: unknown) => WindowRefreshSettlementReceipt;
    readonly settleThrew: (lease: WindowRefreshLease, error: unknown) => WindowRefreshSettlementReceipt;
    readonly registerParticipant: <Prepared>(participant: WindowRefreshParticipant<Prepared>) => WindowRefreshParticipantRegistration;
    readonly releaseParticipant: (registration: WindowRefreshParticipantRegistration) => boolean;
}
interface ParticipantAuthority {
    readonly prepare: (session: WindowRefreshSessionSnapshot) => unknown;
    readonly settle: (prepared: unknown) => void;
    readonly fail: (prepared: unknown, cause: unknown) => void;
    readonly discard: (prepared: unknown, cause: unknown) => void;
}
interface SessionAuthority {
    readonly id: number;
    readonly window: WeakKey;
    readonly stack: LeaseAuthority[];
    readonly records: WindowRefreshOrderedRecord[];
    readonly participants: readonly ParticipantAuthority[];
    activeState: WindowRefreshActiveState;
    conservative: boolean;
}
interface LeaseAuthority {
    readonly lease: WindowRefreshLease;
    readonly session: SessionAuthority;
    settled: boolean;
}
const IntrinsicWeakMap = WeakMap;
const IntrinsicRangeError = RangeError;
const IntrinsicTypeError = TypeError;
const apply = Reflect.apply;
const reflectGet = Reflect.get;
const freezeObject = Object.freeze;
const maxSafeInteger = Number.MAX_SAFE_INTEGER;
const functionBind = Function.prototype.bind;
const arrayIndexOf = Array.prototype.indexOf;
const arrayPop = Array.prototype.pop;
const arrayPush = Array.prototype.push;
const arraySlice = Array.prototype.slice;
const arraySplice = Array.prototype.splice;
const weakMapDelete = WeakMap.prototype.delete;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const stringTrim = String.prototype.trim;
function appendPrivate<Value>(values: Value[], value: Value): void {
    apply(arrayPush, values, [value]);
}
function privateGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return apply(weakMapGet, map, [key]) as Value | undefined;
}
function privateSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    apply(weakMapSet, map, [key, value]);
}
function isWeakKey(value: unknown): value is WeakKey {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function propertyValue(value: object, key: PropertyKey): unknown {
    return reflectGet(value, key) as unknown;
}
function bindParticipantMethod<Args extends unknown[], Result>(method: (...args: Args) => Result, receiver: WeakKey): (...args: Args) => Result {
    return apply(functionBind, method, [receiver]) as (...args: Args) => Result;
}
const INACTIVE_STATE: WindowRefreshActiveState = freezeObject({
    active: false,
    sessionId: 0,
    depth: 0,
    conservative: false,
});
const JOINED_RECEIPT: WindowRefreshSettlementReceipt = freezeObject({
    status: 'joined',
    outermost: false,
});
const SETTLED_RECEIPT: WindowRefreshSettlementReceipt = freezeObject({ status: 'settled', outermost: true });
const CONSERVATIVE_RECEIPT: WindowRefreshSettlementReceipt = freezeObject({
    status: 'settled-conservatively',
    outermost: true,
});
const PARTICIPANT_FAILED_RECEIPT: WindowRefreshSettlementReceipt = freezeObject({
    status: 'participant-failed',
    outermost: true,
});
const SUPERSEDED_RECEIPT: WindowRefreshSettlementReceipt = freezeObject({
    status: 'superseded',
    outermost: true,
});
const PREPARE_FAILED = Symbol('window-refresh-prepare-failed');
const SUPERSEDED_CAUSE = freezeObject({ status: 'superseded', reason: 'newer-window-refresh-session' });
export function createWindowRefreshSessionAuthority(): WindowRefreshSessionAuthority {
    const sessions = new IntrinsicWeakMap<WeakKey, SessionAuthority>();
    const settlementFrontiers = new IntrinsicWeakMap<WeakKey, SessionAuthority>();
    const leases = new IntrinsicWeakMap<WindowRefreshLease, LeaseAuthority>();
    const registrations = new IntrinsicWeakMap<WindowRefreshParticipantRegistration, ParticipantAuthority>();
    const participantOrder: ParticipantAuthority[] = [];
    let participantSnapshot: readonly ParticipantAuthority[] = freezeObject([]);
    let nextSessionId = 0;
    function requireWeakKey(value: unknown, description: string): WeakKey {
        if (!isWeakKey(value))
            throw new IntrinsicTypeError(`${description} requires an object or function.`);
        return value;
    }
    function allocateSessionId(): number {
        if (nextSessionId >= maxSafeInteger) {
            throw new IntrinsicRangeError('Window refresh session identifiers exhausted their safe integer range.');
        }
        nextSessionId += 1;
        return nextSessionId;
    }
    function requireLease(lease: WindowRefreshLease): LeaseAuthority {
        if (!isWeakKey(lease))
            throw new IntrinsicTypeError('Window refresh lease is invalid.');
        const authority = privateGet(leases, lease);
        if (!authority)
            throw new IntrinsicTypeError('Window refresh lease was not issued by this authority.');
        if (authority.settled)
            throw new IntrinsicTypeError('Window refresh lease has already settled.');
        return authority;
    }
    function requireCurrentLease(lease: WindowRefreshLease): LeaseAuthority {
        const authority = requireLease(lease);
        const session = privateGet(sessions, authority.session.window);
        if (session !== authority.session || session.stack[session.stack.length - 1] !== authority) {
            authority.session.conservative = true;
            updateActiveState(authority.session);
            throw new IntrinsicRangeError('Window refresh leases must settle in LIFO order.');
        }
        return authority;
    }
    function updateActiveState(session: SessionAuthority): void {
        session.activeState = freezeObject({
            active: true,
            sessionId: session.id,
            depth: session.stack.length,
            conservative: session.conservative,
        });
    }
    function begin(windowValue: unknown): WindowRefreshLease {
        const window = requireWeakKey(windowValue, 'Window refresh sessions');
        let session = privateGet(sessions, window);
        if (!session) {
            session = {
                id: allocateSessionId(),
                window,
                stack: [],
                records: [],
                participants: participantSnapshot,
                activeState: INACTIVE_STATE,
                conservative: false,
            };
            privateSet(sessions, window, session);
            privateSet(settlementFrontiers, window, session);
        }
        const depth = session.stack.length + 1;
        const lease = freezeObject({ sessionId: session.id, depth, outermost: depth === 1 });
        const authority: LeaseAuthority = { lease, session, settled: false };
        appendPrivate(session.stack, authority);
        privateSet(leases, lease, authority);
        updateActiveState(session);
        return lease;
    }
    function getActiveLease(window: unknown): WindowRefreshLease | null {
        if (!isWeakKey(window))
            return null;
        const stack = privateGet(sessions, window)?.stack;
        return stack?.[stack.length - 1]?.lease ?? null;
    }
    function getActiveState(window: unknown): WindowRefreshActiveState {
        return isWeakKey(window) ? (privateGet(sessions, window)?.activeState ?? INACTIVE_STATE) : INACTIVE_STATE;
    }
    function appendSurfaceJournal(lease: WindowRefreshLease, surfaceValue: unknown, value: unknown): WindowRefreshSurfaceJournalRecord {
        const session = requireCurrentLease(lease).session;
        const surface = requireWeakKey(surfaceValue, 'Window refresh journals');
        const record = freezeObject({ kind: 'surface-journal' as const, surface, value });
        appendPrivate(session.records, record);
        return record;
    }
    function snapshot(session: SessionAuthority): WindowRefreshSessionSnapshot {
        return freezeObject({
            id: session.id,
            window: session.window,
            conservative: session.conservative,
            records: freezeObject(session.records),
        });
    }
    function failPrepared(participants: readonly ParticipantAuthority[], prepared: readonly unknown[], cause: unknown): void {
        for (let index = prepared.length - 1; index >= 0; index -= 1) {
            const value = prepared[index];
            if (value === PREPARE_FAILED)
                continue;
            try {
                participants[index]?.fail(value, cause);
            }
            catch {
            }
        }
    }
    function discardPrepared(participants: readonly ParticipantAuthority[], prepared: readonly unknown[], cause: unknown, highestIndex = prepared.length - 1, lowestIndex = 0): void {
        for (let index = highestIndex; index >= lowestIndex; index -= 1) {
            const value = prepared[index];
            if (value === PREPARE_FAILED)
                continue;
            try {
                participants[index]?.discard(value, cause);
            }
            catch {
            }
        }
    }
    function settleParticipants(session: SessionAuthority, sessionSnapshot: WindowRefreshSessionSnapshot): 'settled' | 'failed' | 'superseded' {
        const participants = session.participants;
        const prepared: unknown[] = [];
        let prepareFailure: unknown;
        let prepareFailed = false;
        for (let index = 0; index < participants.length; index += 1) {
            if (privateGet(settlementFrontiers, session.window) !== session) {
                discardPrepared(participants, prepared, SUPERSEDED_CAUSE);
                return 'superseded';
            }
            const participant = participants[index];
            try {
                prepared[index] = participant?.prepare(sessionSnapshot);
            }
            catch (cause) {
                prepared[index] = PREPARE_FAILED;
                if (privateGet(settlementFrontiers, session.window) !== session) {
                    discardPrepared(participants, prepared, SUPERSEDED_CAUSE);
                    return 'superseded';
                }
                if (!prepareFailed)
                    prepareFailure = cause;
                prepareFailed = true;
            }
            if (privateGet(settlementFrontiers, session.window) !== session) {
                discardPrepared(participants, prepared, SUPERSEDED_CAUSE);
                return 'superseded';
            }
        }
        if (prepareFailed) {
            failPrepared(participants, prepared, prepareFailure);
            return 'failed';
        }
        for (let index = 0; index < prepared.length; index += 1) {
            if (privateGet(settlementFrontiers, session.window) !== session) {
                discardPrepared(participants, prepared, SUPERSEDED_CAUSE, prepared.length - 1, index);
                return 'superseded';
            }
            try {
                participants[index]?.settle(prepared[index]);
            }
            catch (cause) {
                if (privateGet(settlementFrontiers, session.window) !== session) {
                    discardPrepared(participants, prepared, SUPERSEDED_CAUSE, prepared.length - 1, index);
                    return 'superseded';
                }
                failPrepared(participants, prepared, cause);
                return 'failed';
            }
            if (privateGet(settlementFrontiers, session.window) !== session) {
                discardPrepared(participants, prepared, SUPERSEDED_CAUSE, prepared.length - 1, index + 1);
                return 'superseded';
            }
        }
        return 'settled';
    }
    function settle(lease: WindowRefreshLease, threw: boolean): WindowRefreshSettlementReceipt {
        const authority = requireCurrentLease(lease);
        const session = authority.session;
        authority.settled = true;
        apply(arrayPop, session.stack, []);
        if (threw)
            session.conservative = true;
        if (session.stack.length > 0) {
            updateActiveState(session);
            return JOINED_RECEIPT;
        }
        apply(weakMapDelete, sessions, [session.window]);
        const sessionSnapshot = snapshot(session);
        const participantSettlement = settleParticipants(session, sessionSnapshot);
        if (participantSettlement === 'superseded')
            return SUPERSEDED_RECEIPT;
        if (participantSettlement === 'failed')
            return PARTICIPANT_FAILED_RECEIPT;
        return sessionSnapshot.conservative ? CONSERVATIVE_RECEIPT : SETTLED_RECEIPT;
    }
    function registerParticipant(participantValue: unknown): WindowRefreshParticipantRegistration {
        if (!isWeakKey(participantValue))
            throw new IntrinsicTypeError('Window refresh participant must be an object.');
        const nameValue = propertyValue(participantValue, 'name');
        const prepare = propertyValue(participantValue, 'prepare');
        const settle = propertyValue(participantValue, 'settle');
        const fail = propertyValue(participantValue, 'fail');
        const discard = propertyValue(participantValue, 'discard');
        const name = typeof nameValue === 'string' ? apply(stringTrim, nameValue, []) : '';
        if (!name ||
            typeof prepare !== 'function' ||
            typeof settle !== 'function' ||
            typeof fail !== 'function' ||
            typeof discard !== 'function') {
            throw new IntrinsicTypeError('Window refresh participant requires a non-empty name and static callbacks.');
        }
        const participant: ParticipantAuthority = {
            prepare: bindParticipantMethod(prepare as ParticipantAuthority['prepare'], participantValue),
            settle: bindParticipantMethod(settle as ParticipantAuthority['settle'], participantValue),
            fail: bindParticipantMethod(fail as ParticipantAuthority['fail'], participantValue),
            discard: bindParticipantMethod(discard as ParticipantAuthority['discard'], participantValue),
        };
        const registration = freezeObject({ name });
        appendPrivate(participantOrder, participant);
        participantSnapshot = freezeObject(apply(arraySlice, participantOrder, []) as ParticipantAuthority[]);
        privateSet(registrations, registration, participant);
        return registration;
    }
    function releaseParticipant(registration: WindowRefreshParticipantRegistration): boolean {
        if (!isWeakKey(registration))
            return false;
        const participant = privateGet(registrations, registration);
        if (!participant || !apply(weakMapDelete, registrations, [registration]))
            return false;
        const index = apply(arrayIndexOf, participantOrder, [participant]);
        if (index >= 0)
            apply(arraySplice, participantOrder, [index, 1]);
        participantSnapshot = freezeObject(apply(arraySlice, participantOrder, []) as ParticipantAuthority[]);
        return true;
    }
    return freezeObject({
        begin,
        getActiveLease,
        getActiveState,
        appendSurfaceJournal,
        settleReturned: (lease: WindowRefreshLease) => settle(lease, false),
        settleThrew: (lease: WindowRefreshLease) => settle(lease, true),
        registerParticipant,
        releaseParticipant,
    });
}
