import { exactDataProperties, type ExactDataPropertyAuthority, type ExactDataPropertyOperation, } from '../../runtime/exact-data-property.js';
type RuntimeFunction = (...args: unknown[]) => unknown;
export type WindowContentsClaimSettlement = {
    readonly status: 'settled';
    readonly terminal: true;
} | {
    readonly status: 'superseded';
    readonly terminal: false;
};
export type WindowContentsClaimRevocation = {
    readonly status: 'pending' | 'superseded';
    readonly terminal: false;
} | {
    readonly status: 'settled';
    readonly terminal: true;
};
export interface WindowContentsClaimJournal {
    readonly settle: (target: unknown, reason: unknown, parentAuthority?: ExactDataPropertyAuthority | null) => WindowContentsClaimSettlement;
    readonly revoke: (reason: unknown, parentAuthority?: ExactDataPropertyAuthority | null) => WindowContentsClaimRevocation;
}
export interface WindowContentsClaimJournalContext {
    readonly adapterContract: unknown;
    readonly identityKey: string;
    readonly isAttached: () => boolean;
    readonly window: unknown;
    readonly windowData: unknown;
}
interface ClaimActor {
    readonly authority: ExactDataPropertyAuthority;
    readonly identity: object;
}
interface ClaimRecord {
    acknowledgement: unknown;
    callbackIdentity: object | null;
    canonicalRetired: boolean;
    gatewayReleased: boolean;
    open: boolean;
    published: boolean;
    returnIdentity: object | null;
    state: 'prepared' | 'acknowledged' | 'active' | 'releasing' | 'retiring' | 'released';
    target: unknown;
    targetPublication: ExactDataPropertyOperation | null;
    token: unknown;
    tokenPublication: ExactDataPropertyOperation | null;
}
const IntrinsicError = Error;
const IntrinsicRangeError = RangeError;
const IntrinsicTypeError = TypeError;
const apply = Reflect.apply;
const get = Reflect.get;
const freeze = Object.freeze;
const objectIs = Object.is;
const isSafeInteger = Number.isSafeInteger;
const arrayPush = Array.prototype.push;
const arraySplice = Array.prototype.splice;
const SETTLED = freeze({ status: 'settled', terminal: true }) as WindowContentsClaimSettlement;
const SUPERSEDED = freeze({ status: 'superseded', terminal: false }) as WindowContentsClaimSettlement;
const REVOKED = freeze({ status: 'settled', terminal: true }) as WindowContentsClaimRevocation;
const REVOKE_PENDING = freeze({ status: 'pending', terminal: false }) as WindowContentsClaimRevocation;
const REVOKE_SUPERSEDED = freeze({ status: 'superseded', terminal: false }) as WindowContentsClaimRevocation;
const SUPERSEDED_SIGNAL = new IntrinsicError('Window contents claim actor was superseded.');
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isObjectReference(value) ? get(value, key) : undefined;
}
function methodValue(value: unknown, key: PropertyKey): RuntimeFunction | null {
    const candidate = propertyValue(value, key);
    return typeof candidate === 'function' ? (candidate as RuntimeFunction) : null;
}
function appendPrivate<Value>(values: Value[], value: Value): void {
    apply(arrayPush, values, [value]);
}
export function createWindowContentsClaimJournal(context: WindowContentsClaimJournalContext): WindowContentsClaimJournal {
    const window = context.window;
    const windowData = context.windowData;
    const adapterContract = context.adapterContract;
    const claimSurface = methodValue(adapterContract, 'claimSurface');
    const releaseSurface = methodValue(adapterContract, 'releaseSurface');
    const isAttached = context.isAttached;
    if (!isObjectReference(window) || !exactDataProperties.isRecord(windowData)) {
        throw new IntrinsicTypeError('Window contents claim journal requires exact registration records.');
    }
    if (typeof context.identityKey !== 'string' || context.identityKey.length === 0) {
        throw new IntrinsicTypeError('Window contents claim journal requires an exact registration key.');
    }
    if (!claimSurface || !releaseSurface || typeof isAttached !== 'function') {
        throw new IntrinsicTypeError('Window contents claim journal requires trusted ownership collaborators.');
    }
    const claimSurfaceMethod = claimSurface;
    const releaseSurfaceMethod = releaseSurface;
    const identityKey = context.identityKey;
    const claims: ClaimRecord[] = [];
    let generation = 0;
    let currentClaimIdentity: object | null = null;
    function parentAuthority(value: ExactDataPropertyAuthority | null | undefined): ExactDataPropertyAuthority | null {
        if (value === null || value === undefined)
            return null;
        if (!exactDataProperties.isAuthority(value)) {
            throw new IntrinsicTypeError('Window contents claim parent authority is not exact.');
        }
        return value;
    }
    function actorIsCurrent(identity: object, parent: ExactDataPropertyAuthority | null): boolean {
        if (currentClaimIdentity !== identity || !apply(isAttached, undefined, []))
            return false;
        return !parent || apply(parent.isCurrent, parent, []);
    }
    function createActor(parentValue: ExactDataPropertyAuthority | null | undefined): ClaimActor {
        const parent = parentAuthority(parentValue);
        generation += 1;
        if (!isSafeInteger(generation)) {
            throw new IntrinsicRangeError('Window contents claim generation space is exhausted.');
        }
        const identity = freeze({});
        currentClaimIdentity = identity;
        const authority = exactDataProperties.issueAuthority(identity, generation, () => actorIsCurrent(identity, parent));
        return freeze({ authority, identity });
    }
    function current(actor: ClaimActor): boolean {
        return apply(actor.authority.isCurrent, actor.authority, []);
    }
    function assertCurrent(actor: ClaimActor): void {
        if (!current(actor))
            throw SUPERSEDED_SIGNAL;
    }
    function invalidate(actor: ClaimActor): void {
        if (currentClaimIdentity === actor.identity)
            currentClaimIdentity = null;
    }
    function exactClaimReceipt(receipt: unknown, token: unknown, surfaceId: string): boolean {
        return (propertyValue(receipt, 'status') === 'claimed' &&
            isObjectReference(token) &&
            objectIs(propertyValue(receipt, 'ownershipToken'), token) &&
            propertyValue(receipt, 'adapterId') === 'window' &&
            propertyValue(receipt, 'surfaceId') === surfaceId &&
            propertyValue(receipt, 'surfaceType') === 'window');
    }
    function exactReleaseReceipt(receipt: unknown, token: unknown): boolean {
        const status = propertyValue(receipt, 'status');
        return (propertyValue(receipt, 'terminal') === true &&
            (status === 'released' || status === 'missing-claim' || status === 'stale-claim') &&
            objectIs(propertyValue(receipt, 'token'), token) &&
            objectIs(propertyValue(receipt, 'ownershipToken'), token) &&
            propertyValue(receipt, 'kind') === 'surface' &&
            propertyValue(receipt, 'adapterId') === 'window');
    }
    function finalizeRecord(record: ClaimRecord): void {
        if (record.open || !record.gatewayReleased || !record.canonicalRetired)
            return;
        record.acknowledgement = null;
        record.callbackIdentity = null;
        record.returnIdentity = null;
        record.state = 'released';
        record.target = null;
        record.targetPublication = null;
        record.token = null;
        record.tokenPublication = null;
    }
    function compactReleased(): void {
        for (let index = claims.length - 1; index >= 0; index -= 1) {
            if (claims[index]?.state === 'released')
                apply(arraySplice, claims, [index, 1]);
        }
    }
    function releaseGateway(record: ClaimRecord, reason: unknown): void {
        if (record.gatewayReleased || !record.token)
            return;
        const token = record.token;
        record.state = 'releasing';
        let receipt: unknown;
        try {
            receipt = apply(releaseSurfaceMethod, adapterContract, [token, reason]);
        }
        catch (error) {
            if (objectIs(record.token, token))
                record.state = 'acknowledged';
            throw error;
        }
        if (!exactReleaseReceipt(receipt, token)) {
            if (objectIs(record.token, token))
                record.state = 'acknowledged';
            throw new IntrinsicError('Window contents claim release did not return exact terminal authority.');
        }
        if (objectIs(record.token, token)) {
            record.gatewayReleased = true;
            record.state = 'retiring';
        }
    }
    function retireUnpublished(record: ClaimRecord, reason: unknown): void {
        if (record.published)
            return;
        releaseGateway(record, reason);
        record.canonicalRetired = true;
        finalizeRecord(record);
    }
    function retainedClaim(target: object): ClaimRecord | null {
        for (let index = 0; index < claims.length; index += 1) {
            const record = claims[index];
            if (record?.state === 'active' &&
                !record.gatewayReleased &&
                record.target === target &&
                record.callbackIdentity !== null &&
                record.callbackIdentity === record.returnIdentity &&
                record.tokenPublication?.matches() === true &&
                record.targetPublication?.matches() === true) {
                return record;
            }
        }
        return null;
    }
    function retireObsolete(actor: ClaimActor, retained: ClaimRecord | null, reason: unknown): number {
        const count = claims.length;
        for (let index = 0; index < count; index += 1) {
            const record = claims[index];
            if (!record ||
                record === retained ||
                !record.token ||
                record.gatewayReleased ||
                record.open ||
                record.state === 'releasing') {
                continue;
            }
            releaseGateway(record, reason);
            assertCurrent(actor);
        }
        return count;
    }
    function hasUnresolvedClaims(): boolean {
        for (let index = 0; index < claims.length; index += 1) {
            const record = claims[index];
            if (record && record.state !== 'released' && (!record.gatewayReleased || !record.canonicalRetired)) {
                return true;
            }
        }
        return false;
    }
    function preparePair(actor: ClaimActor, token: unknown, target: unknown): readonly [
        ExactDataPropertyOperation,
        ExactDataPropertyOperation
    ] {
        const tokenOperation = exactDataProperties.prepare(actor.authority, windowData, 'contentsSurfaceClaim', token);
        assertCurrent(actor);
        const targetOperation = exactDataProperties.prepare(actor.authority, windowData, 'contentsSurfaceClaimTarget', target);
        assertCurrent(actor);
        return freeze([tokenOperation, targetOperation]);
    }
    function commitOperation(operation: ExactDataPropertyOperation, rejectedMessage: string): void {
        const status = operation.commit();
        if (status === 'superseded')
            throw SUPERSEDED_SIGNAL;
        if (status !== 'committed')
            throw new IntrinsicError(rejectedMessage);
    }
    function publishClaim(actor: ClaimActor, record: ClaimRecord, target: object): void {
        const operations = preparePair(actor, record.token, target);
        record.tokenPublication = operations[0];
        record.targetPublication = operations[1];
        commitOperation(operations[0], 'Window contents claim-token publication was rejected.');
        record.published = true;
        commitOperation(operations[1], 'Window contents claim-target publication was rejected.');
        assertCurrent(actor);
    }
    function clearOwnedCanonicalSlot(actor: ClaimActor, key: 'contentsSurfaceClaim' | 'contentsSurfaceClaimTarget', publication: ExactDataPropertyOperation | null): void {
        if (!publication?.matches())
            return;
        const retirement = exactDataProperties.prepare(actor.authority, windowData, key, null);
        assertCurrent(actor);
        commitOperation(retirement, `Window contents ${key} retirement was rejected.`);
        assertCurrent(actor);
    }
    function retireCanonical(actor: ClaimActor, retained: ClaimRecord | null, count: number): void {
        if (!retained) {
            for (let index = 0; index < count; index += 1) {
                const record = claims[index];
                if (!record)
                    continue;
                clearOwnedCanonicalSlot(actor, 'contentsSurfaceClaim', record.tokenPublication);
                clearOwnedCanonicalSlot(actor, 'contentsSurfaceClaimTarget', record.targetPublication);
            }
        }
        assertCurrent(actor);
        for (let index = 0; index < count; index += 1) {
            const record = claims[index];
            if (!record || record === retained)
                continue;
            record.canonicalRetired = true;
            finalizeRecord(record);
        }
        compactReleased();
    }
    function appendClaim(target: object): ClaimRecord {
        const record: ClaimRecord = {
            acknowledgement: null,
            callbackIdentity: null,
            canonicalRetired: false,
            gatewayReleased: false,
            open: true,
            published: false,
            returnIdentity: null,
            state: 'prepared',
            target,
            targetPublication: null,
            token: null,
            tokenPublication: null,
        };
        appendPrivate(claims, record);
        return record;
    }
    function acquireClaim(actor: ClaimActor, target: object): void {
        const record = appendClaim(target);
        const invocationIdentity = freeze({});
        const surfaceId = `window:${identityKey}:contents`;
        const acknowledgeClaim = (receipt: unknown): void => {
            const token = propertyValue(receipt, 'token');
            if (!exactClaimReceipt(receipt, token, surfaceId)) {
                throw new IntrinsicError('Window contents claim acknowledgement is invalid.');
            }
            if (record.callbackIdentity !== null || record.token) {
                record.callbackIdentity = null;
                if (objectIs(record.token, token)) {
                    throw new IntrinsicError('Window contents claim acknowledgement was already consumed.');
                }
                const duplicate = appendClaim(target);
                duplicate.open = false;
                duplicate.acknowledgement = receipt;
                duplicate.callbackIdentity = invocationIdentity;
                duplicate.state = 'acknowledged';
                duplicate.token = token;
                retireUnpublished(duplicate, 'window-refresh-duplicate-claim-acknowledgement');
                compactReleased();
                throw new IntrinsicError('Window contents claim acknowledgement was already consumed.');
            }
            record.acknowledgement = receipt;
            record.callbackIdentity = invocationIdentity;
            record.state = 'acknowledged';
            record.token = token;
            if (!current(actor)) {
                retireUnpublished(record, 'window-refresh-claim-superseded');
                compactReleased();
            }
        };
        let returned: unknown;
        try {
            try {
                returned = apply(claimSurfaceMethod, adapterContract, [
                    freeze({
                        acknowledgeClaim,
                        adapterId: 'window',
                        owner: window,
                        role: 'window-contents',
                        surfaceId,
                        surfaceType: 'window',
                        target,
                    }),
                ]);
            }
            finally {
                record.open = false;
            }
            const acknowledgementTransferred = record.token !== null;
            const returnMatchesAcknowledgement = record.callbackIdentity === invocationIdentity && objectIs(returned, record.acknowledgement);
            if (returnMatchesAcknowledgement) {
                record.returnIdentity = invocationIdentity;
            }
            else if (acknowledgementTransferred) {
                retireUnpublished(record, 'window-refresh-claim-contradictory-return');
            }
            if (!current(actor))
                throw SUPERSEDED_SIGNAL;
            if (!acknowledgementTransferred) {
                throw new IntrinsicError('Window contents claim was not acknowledged at commit.');
            }
            if (!returnMatchesAcknowledgement) {
                throw new IntrinsicError('Window contents claim return did not match its exact acknowledgement.');
            }
            if (record.gatewayReleased) {
                throw new IntrinsicError('Window contents claim was not acknowledged at commit.');
            }
            publishClaim(actor, record, target);
            record.state = 'active';
        }
        catch (error) {
            if (!record.published && record.token && !record.gatewayReleased && record.state !== 'releasing') {
                retireUnpublished(record, 'window-refresh-claim-interrupted');
            }
            throw error;
        }
        finally {
            finalizeRecord(record);
            compactReleased();
        }
    }
    function settle(targetValue: unknown, reason: unknown, parentValue?: ExactDataPropertyAuthority | null): WindowContentsClaimSettlement {
        if (targetValue !== null && targetValue !== undefined && !isObjectReference(targetValue)) {
            throw new IntrinsicTypeError('Window contents claim target must be an object or null.');
        }
        const actor = createActor(parentValue);
        try {
            assertCurrent(actor);
            const target = targetValue;
            const retained = isObjectReference(target) ? retainedClaim(target) : null;
            const count = retireObsolete(actor, retained, reason);
            retireCanonical(actor, retained, count);
            if (!retained && isObjectReference(target))
                acquireClaim(actor, target);
            assertCurrent(actor);
            invalidate(actor);
            return SETTLED;
        }
        catch (error) {
            if (error === SUPERSEDED_SIGNAL || !current(actor)) {
                invalidate(actor);
                return SUPERSEDED;
            }
            invalidate(actor);
            throw error;
        }
    }
    function revoke(reason: unknown, parentValue?: ExactDataPropertyAuthority | null): WindowContentsClaimRevocation {
        const actor = createActor(parentValue);
        try {
            assertCurrent(actor);
            const firstCount = retireObsolete(actor, null, reason);
            retireCanonical(actor, null, firstCount);
            assertCurrent(actor);
            const secondCount = retireObsolete(actor, null, reason);
            retireCanonical(actor, null, secondCount);
            if (claims.length !== secondCount || hasUnresolvedClaims()) {
                invalidate(actor);
                return REVOKE_PENDING;
            }
            assertCurrent(actor);
            invalidate(actor);
            return REVOKED;
        }
        catch (error) {
            if (error === SUPERSEDED_SIGNAL || !current(actor)) {
                invalidate(actor);
                return REVOKE_SUPERSEDED;
            }
            invalidate(actor);
            throw error;
        }
    }
    return freeze({ revoke, settle });
}
