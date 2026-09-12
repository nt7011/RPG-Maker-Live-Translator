import { exactDataProperties, type ExactDataPropertyAuthority, type ExactDataPropertyOperation, } from '../../runtime/exact-data-property.js';
import type { ContentsPublicationHandle, ContentsPublicationExchangeReceipt, ExactContentsPublicationInspection, } from '../../runtime/surface-ownership.js';
import { createWindowContentsClaimJournal, type WindowContentsClaimJournal } from './contents-claim-journal.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
type WindowContentsPublicationRole = 'window-current-contents' | 'window-auxiliary-contents' | 'window-staging-contents';
export interface WindowRefreshContentsPreparation {
    readonly sessionId: number;
    readonly initialContents: unknown;
    readonly finalContents: unknown;
    readonly assignedContents: readonly unknown[];
    readonly replaced: boolean;
    readonly previousContentsRevision: number;
}
export interface WindowRefreshContentsTerminalSettlement extends WindowRefreshContentsPreparation {
    readonly status: 'settled';
    readonly terminal: true;
    readonly nextContentsRevision: number;
    readonly reason: string;
}
export interface WindowRefreshContentsSupersededSettlement {
    readonly status: 'superseded';
    readonly terminal: false;
    readonly reason: 'refresh-contents-superseded';
}
export type WindowRefreshContentsSettlement = WindowRefreshContentsTerminalSettlement | WindowRefreshContentsSupersededSettlement;
export interface WindowRefreshContentsPlan {
    readonly settle: () => WindowRefreshContentsSettlement;
    readonly fail: (cause: unknown) => WindowRefreshContentsSettlement;
}
export interface WindowRefreshRevocationReceipt {
    readonly status: 'revoking' | 'revoked';
    readonly terminal: boolean;
}
export interface WindowRefreshRevocationLease {
    readonly receipt: WindowRefreshRevocationReceipt;
}
export interface WindowContentsLifetimeCoordinator {
    readonly attach: (window: unknown, windowData: unknown, identityKey: string) => void;
    readonly recordAssigned: (window: unknown, windowData: unknown, surface: unknown, reason?: unknown, role?: unknown) => boolean;
    readonly publishSurface: (window: unknown, windowData: unknown, surface: unknown, role: unknown, reason: unknown) => boolean;
    readonly releaseSurface: (window: unknown, windowData: unknown, surface: unknown) => boolean;
    readonly settleCanonicalClaim: (window: unknown, windowData: unknown, target: unknown, reason: unknown) => boolean;
    readonly begin: (window: unknown, windowData: unknown, input: unknown) => WindowRefreshContentsPlan | null;
    readonly detach: (window: unknown, windowData: unknown) => void;
    readonly beginRevocation: (window: unknown, windowData: unknown, reason: unknown) => WindowRefreshRevocationLease;
    readonly completeRevocation: (window: unknown, windowData: unknown, lease: WindowRefreshRevocationLease, reason: unknown) => WindowRefreshRevocationReceipt;
}
export interface WindowContentsLifetimeCoordinatorContext {
    readonly adapterContract?: unknown;
    readonly contentsReplacedReason: string;
    readonly getWindowTextHelpers?: (() => unknown) | null;
    readonly surfaceOwnership: unknown;
}
interface WindowRefreshSettlementAuthority extends ExactDataPropertyAuthority {
    readonly generation: number;
}
interface AssignedSurfaceRecord {
    readonly surface: object;
    adapterSettled: boolean;
    assigned: boolean;
    slot: number;
    disposition: 'pending' | 'published' | 'released' | 'retained';
}
interface WindowRefreshFacts extends WindowRefreshContentsPreparation {
    readonly targetRevision: number;
}
interface WindowRefreshLazyFacts {
    assignedContents: readonly unknown[] | null;
    assignedCaptured: boolean;
    initialCaptured: boolean;
    initialContents: unknown;
    sessionCaptured: boolean;
    sessionId: number;
    finalCaptured: boolean;
    finalContents: unknown;
    revisionCaptured: boolean;
    previousContentsRevision: number;
}
interface WindowContentsSettlementActor {
    readonly identity: object;
    readonly lifetime: WindowContentsLifetime;
    readonly authority: WindowRefreshSettlementAuthority;
}
interface WindowRefreshPlanNode extends WindowContentsSettlementActor {
    readonly generation: number;
    readonly input: unknown;
    readonly lazyFacts: WindowRefreshLazyFacts;
    readonly properties: Map<string, ExactDataPropertyOperation>;
    facts: WindowRefreshFacts | null;
    cursor: number;
    surfaceIndex: number;
    ownershipIndex: number;
    settleRunning: boolean;
    terminal: WindowRefreshContentsTerminalSettlement | null;
}
interface WindowContentsLifetime {
    readonly identityKey: string;
    readonly window: PropertyBag;
    readonly windowData: PropertyBag;
    readonly surfaces: AssignedSurfaceRecord[];
    claimJournal: WindowContentsClaimJournal | null;
    readonly revokeAuthority: ExactDataPropertyAuthority;
    revokeProperties: Map<string, ExactDataPropertyOperation>;
    generation: number;
    nextSurfaceSlot: number;
    currentContentsIdentity: object | null;
    currentSurfaceIdentity: object | null;
    revokeLease: WindowRefreshRevocationLease | null;
    revokeRunning: boolean;
    phase: 'attached' | 'revoking' | 'revoked';
}
const IntrinsicMap = Map;
const IntrinsicWeakMap = WeakMap;
const IntrinsicError = Error;
const IntrinsicRangeError = RangeError;
const IntrinsicTypeError = TypeError;
const apply = Reflect.apply;
const arrayIsArray = Array.isArray;
const arrayPush = Array.prototype.push;
const arraySplice = Array.prototype.splice;
const assignObject = Object.assign;
const freezeObject = Object.freeze;
const isFrozenObject = Object.isFrozen;
const isFiniteNumber = Number.isFinite;
const isSafeInteger = Number.isSafeInteger;
const maxNumber = Math.max;
const NumberIntrinsic = Number;
const StringIntrinsic = String;
const mapGet = Map.prototype.get;
const mapSet = Map.prototype.set;
const weakMapDelete = WeakMap.prototype.delete;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const stringSlice = String.prototype.slice;
const stringStartsWith = String.prototype.startsWith;
function appendPrivate<Value>(values: Value[], value: Value): void {
    apply(arrayPush, values, [value]);
}
function privateMapGet<Key, Value>(map: Map<Key, Value>, key: Key): Value | undefined {
    return apply(mapGet, map, [key]) as Value | undefined;
}
function privateMapSet<Key, Value>(map: Map<Key, Value>, key: Key, value: Value): void {
    apply(mapSet, map, [key, value]);
}
function privateWeakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return apply(weakMapGet, map, [key]) as Value | undefined;
}
function privateWeakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    apply(weakMapSet, map, [key, value]);
}
const REVOKING: WindowRefreshRevocationReceipt = freezeObject({ status: 'revoking', terminal: false });
const REVOKED: WindowRefreshRevocationReceipt = freezeObject({ status: 'revoked', terminal: true });
const SUPERSEDED_ERROR = new IntrinsicError('Window refresh contents settlement was superseded.');
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRuntimeFunction(value: unknown): value is RuntimeFunction {
    return typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function invokeMethod(target: unknown, key: PropertyKey, argumentsList: readonly unknown[]): unknown {
    const method = propertyValue(target, key);
    if (!isRuntimeFunction(method)) {
        throw new IntrinsicTypeError(`Window refresh collaborator ${stringValue(key)} is unavailable.`);
    }
    return apply(method, target, argumentsList);
}
function numberValue(value: unknown): number {
    const converted = apply(NumberIntrinsic, undefined, [value]) as unknown;
    if (typeof converted !== 'number')
        throw new IntrinsicTypeError('Window refresh numeric conversion failed.');
    return converted;
}
function stringValue(value: unknown): string {
    const converted = apply(StringIntrinsic, undefined, [value]) as unknown;
    if (typeof converted !== 'string')
        throw new IntrinsicTypeError('Window refresh string conversion failed.');
    return converted;
}
function publicationRole(value: unknown): WindowContentsPublicationRole | null {
    return value === 'window-current-contents' ||
        value === 'window-auxiliary-contents' ||
        value === 'window-staging-contents'
        ? value
        : null;
}
function supersededReceipt(): WindowRefreshContentsSupersededSettlement {
    return freezeObject({ status: 'superseded', terminal: false, reason: 'refresh-contents-superseded' });
}
function appendUniqueSurface(lifetime: WindowContentsLifetime, surface: unknown, assigned = false): void {
    if (!isPropertyBag(surface))
        return;
    for (let index = 0; index < lifetime.surfaces.length; index += 1) {
        const retained = lifetime.surfaces[index];
        if (retained?.surface !== surface)
            continue;
        if (assigned) {
            retained.assigned = true;
            retained.adapterSettled = false;
        }
        if (retained.disposition === 'released') {
            retained.disposition = 'pending';
        }
        return;
    }
    appendPrivate(lifetime.surfaces, {
        surface,
        adapterSettled: !assigned,
        assigned,
        slot: 0,
        disposition: 'pending',
    });
}
function snapshotUnresolvedSurfaces(lifetime: WindowContentsLifetime): readonly unknown[] {
    const surfaces: unknown[] = [];
    for (let index = 0; index < lifetime.surfaces.length; index += 1) {
        const record = lifetime.surfaces[index];
        if (record?.assigned && !record.adapterSettled)
            appendPrivate(surfaces, record.surface);
    }
    return freezeObject(surfaces);
}
function findSurfaceRecord(lifetime: WindowContentsLifetime, surface: unknown): AssignedSurfaceRecord | null {
    for (let index = 0; index < lifetime.surfaces.length; index += 1) {
        const record = lifetime.surfaces[index];
        if (record?.surface === surface)
            return record ?? null;
    }
    return null;
}
function positiveSurfaceSlot(publication: ContentsPublicationHandle | null, lifetime: WindowContentsLifetime): number {
    const descriptor = propertyValue(publication, 'descriptor');
    const role = publicationRole(propertyValue(descriptor, 'role'));
    const surfaceId = propertyValue(descriptor, 'surfaceId');
    const auxiliarySurfaceId = propertyValue(descriptor, 'auxiliarySurfaceId');
    const slotId = propertyValue(descriptor, 'surfaceSlotId');
    if (propertyValue(publication, 'owner') !== lifetime.window ||
        propertyValue(descriptor, 'owner') !== lifetime.window ||
        propertyValue(descriptor, 'contentsGeneration') !== lifetime.windowData ||
        propertyValue(descriptor, 'adapterId') !== 'window' ||
        propertyValue(descriptor, 'surfaceType') !== 'window' ||
        propertyValue(descriptor, 'windowOwned') !== true ||
        !role ||
        typeof surfaceId !== 'string' ||
        typeof auxiliarySurfaceId !== 'string' ||
        typeof slotId !== 'string') {
        return 0;
    }
    const prefix = `window:${lifetime.identityKey}:contents:`;
    if (!apply(stringStartsWith, auxiliarySurfaceId, [prefix]) || !apply(stringStartsWith, slotId, ['contents-'])) {
        return 0;
    }
    const surfaceSuffix = apply(stringSlice, auxiliarySurfaceId, [prefix.length]);
    const namedSuffix = apply(stringSlice, slotId, ['contents-'.length]);
    const surfaceSlot = apply(NumberIntrinsic, undefined, [surfaceSuffix]);
    const namedSlot = apply(NumberIntrinsic, undefined, [namedSuffix]);
    const slotIsExact = isSafeInteger(surfaceSlot) &&
        surfaceSlot > 0 &&
        surfaceSlot === namedSlot &&
        surfaceSuffix === stringValue(surfaceSlot) &&
        namedSuffix === stringValue(namedSlot) &&
        auxiliarySurfaceId === `window:${lifetime.identityKey}:contents:${stringValue(surfaceSlot)}`;
    if (!slotIsExact)
        return 0;
    const expectedSurfaceId = role === 'window-current-contents'
        ? `window:${lifetime.identityKey}`
        : `window:${lifetime.identityKey}:contents:${stringValue(surfaceSlot)}`;
    return surfaceId === expectedSurfaceId ? surfaceSlot : 0;
}
function surfaceSlotIsReserved(lifetime: WindowContentsLifetime, slot: number, record: AssignedSurfaceRecord): boolean {
    for (let index = 0; index < lifetime.surfaces.length; index += 1) {
        const candidate = lifetime.surfaces[index];
        if (candidate && candidate !== record && candidate.slot === slot)
            return true;
    }
    return false;
}
function allocateSurfaceSlot(lifetime: WindowContentsLifetime, record: AssignedSurfaceRecord): number {
    do {
        lifetime.nextSurfaceSlot += 1;
        if (!isSafeInteger(lifetime.nextSurfaceSlot)) {
            throw new IntrinsicRangeError('Window contents auxiliary slot space is exhausted.');
        }
    } while (surfaceSlotIsReserved(lifetime, lifetime.nextSurfaceSlot, record));
    return lifetime.nextSurfaceSlot;
}
function compactReleasedSurfaces(lifetime: WindowContentsLifetime, revoking = false): void {
    for (let index = lifetime.surfaces.length - 1; index >= 0; index -= 1) {
        const record = lifetime.surfaces[index];
        if (record?.disposition === 'released' && (revoking || record.adapterSettled)) {
            apply(arraySplice, lifetime.surfaces, [index, 1]);
        }
    }
}
export function createWindowContentsLifetimeCoordinator(context: WindowContentsLifetimeCoordinatorContext): WindowContentsLifetimeCoordinator {
    if (!context.surfaceOwnership) {
        throw new IntrinsicTypeError('Window refresh settlement requires surface ownership authority.');
    }
    const surfaceOwnership = context.surfaceOwnership;
    const adapterContract = context.adapterContract ?? null;
    const getWindowTextHelpers = context.getWindowTextHelpers ?? null;
    const lifetimes = new IntrinsicWeakMap<PropertyBag, WindowContentsLifetime>();
    function attach(windowValue: unknown, windowDataValue: unknown, identityKey: string): void {
        if (!isPropertyBag(windowValue) || !isPropertyBag(windowDataValue) || !identityKey) {
            throw new IntrinsicTypeError('Window refresh lifetime requires exact registration identities.');
        }
        if (!exactDataProperties.isRecord(windowDataValue)) {
            throw new IntrinsicTypeError('Window refresh lifetime requires authored WindowData.');
        }
        const retained = privateWeakMapGet(lifetimes, windowValue);
        if (retained?.windowData === windowDataValue)
            return;
        if (retained && retained.phase !== 'revoked') {
            throw new Error('Window refresh lifetime cannot replace a live registration.');
        }
        const lifetime = {} as WindowContentsLifetime;
        const revokeIdentity = freezeObject({});
        assignObject(lifetime, {
            identityKey,
            window: windowValue,
            windowData: windowDataValue,
            surfaces: [],
            claimJournal: null,
            generation: 0,
            nextSurfaceSlot: 0,
            currentContentsIdentity: null,
            currentSurfaceIdentity: null,
            revokeLease: null,
            revokeRunning: false,
            phase: 'attached',
            revokeProperties: new IntrinsicMap<string, ExactDataPropertyOperation>(),
            revokeAuthority: exactDataProperties.issueAuthority(revokeIdentity, 0, () => lifetime.phase === 'revoking' && lifetime.revokeRunning),
        });
        if (adapterContract &&
            isRuntimeFunction(propertyValue(adapterContract, 'claimSurface')) &&
            isRuntimeFunction(propertyValue(adapterContract, 'releaseSurface'))) {
            lifetime.claimJournal = createWindowContentsClaimJournal({
                adapterContract,
                identityKey,
                isAttached: () => lifetime.phase !== 'revoked',
                window: windowValue,
                windowData: windowDataValue,
            });
        }
        privateWeakMapSet(lifetimes, windowValue, lifetime);
    }
    function requireLifetime(windowValue: unknown, windowDataValue: unknown): WindowContentsLifetime {
        if (!isPropertyBag(windowValue) || !isPropertyBag(windowDataValue)) {
            throw new IntrinsicTypeError('Window refresh settlement requires exact registration identities.');
        }
        const lifetime = privateWeakMapGet(lifetimes, windowValue);
        if (lifetime?.windowData !== windowDataValue) {
            throw new Error('Window refresh settlement has no attached registration lifetime.');
        }
        return lifetime;
    }
    function begin(windowValue: unknown, windowDataValue: unknown, input: unknown): WindowRefreshContentsPlan | null {
        if (!windowValue || !windowDataValue || !input)
            return null;
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase !== 'attached') {
            const settle = (): WindowRefreshContentsSettlement => supersededReceipt();
            return freezeObject({ settle, fail: settle });
        }
        lifetime.generation += 1;
        if (!isSafeInteger(lifetime.generation)) {
            throw new IntrinsicRangeError('Window refresh settlement generation space is exhausted.');
        }
        const node = {} as WindowRefreshPlanNode;
        const identity = freezeObject({});
        const authority = exactDataProperties.issueAuthority(identity, lifetime.generation, () => lifetime.phase === 'attached' && lifetime.currentContentsIdentity === identity);
        assignObject(node, {
            identity,
            generation: lifetime.generation,
            input,
            lifetime,
            authority,
            properties: new IntrinsicMap<string, ExactDataPropertyOperation>(),
            lazyFacts: {
                assignedContents: null,
                assignedCaptured: false,
                initialCaptured: false,
                initialContents: null,
                sessionCaptured: false,
                sessionId: 0,
                finalCaptured: false,
                finalContents: null,
                revisionCaptured: false,
                previousContentsRevision: 0,
            },
            facts: null,
            cursor: 0,
            surfaceIndex: 0,
            ownershipIndex: 0,
            settleRunning: false,
            terminal: null,
        });
        const settle = (): WindowRefreshContentsSettlement => settleNode(node);
        const plan = freezeObject({ settle, fail: settle });
        lifetime.currentContentsIdentity = identity;
        return plan;
    }
    function recordAssigned(windowValue: unknown, windowDataValue: unknown, surface: unknown, reason: unknown = 'refresh-contents-assigned', role: unknown = 'window-staging-contents'): boolean {
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase !== 'attached' || !isPropertyBag(surface))
            return false;
        appendUniqueSurface(lifetime, surface, true);
        const record = findSurfaceRecord(lifetime, surface);
        if (!record)
            return false;
        try {
            const current = inspectPublication(record.surface);
            adoptSurfaceSlotFromPublication(lifetime, record, current);
            if (publicationBelongsToLifetime(current, lifetime, record)) {
                record.disposition = 'published';
                return true;
            }
            return publishSurface(windowValue, windowDataValue, surface, role, reason);
        }
        catch {
            return false;
        }
    }
    function createSurfaceActor(lifetime: WindowContentsLifetime): WindowContentsSettlementActor {
        lifetime.generation += 1;
        if (!isSafeInteger(lifetime.generation)) {
            throw new IntrinsicRangeError('Window contents surface generation space is exhausted.');
        }
        const identity = freezeObject({});
        const actor = {} as WindowContentsSettlementActor;
        assignObject(actor, {
            identity,
            lifetime,
            authority: exactDataProperties.issueAuthority(identity, lifetime.generation, () => lifetime.phase === 'attached' && lifetime.currentSurfaceIdentity === identity),
        });
        lifetime.currentSurfaceIdentity = identity;
        return actor;
    }
    function publishSurface(windowValue: unknown, windowDataValue: unknown, surface: unknown, roleValue: unknown, reasonValue: unknown): boolean {
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase !== 'attached' || !isPropertyBag(surface))
            return false;
        const role = publicationRole(roleValue);
        if (!role)
            return false;
        const reason = stringValue(reasonValue);
        const record = findSurfaceRecord(lifetime, surface);
        if (!record) {
            appendUniqueSurface(lifetime, surface);
        }
        const retained = findSurfaceRecord(lifetime, surface);
        if (!retained)
            return false;
        const actor = createSurfaceActor(lifetime);
        try {
            ensureSurfacePublication(actor, retained, role, reason);
            assertCurrent(actor);
            return true;
        }
        catch (error) {
            if (error === SUPERSEDED_ERROR || !actor.authority.isCurrent())
                return false;
            throw error;
        }
        finally {
            if (lifetime.currentSurfaceIdentity === actor.identity)
                lifetime.currentSurfaceIdentity = null;
        }
    }
    function releaseSurface(windowValue: unknown, windowDataValue: unknown, surface: unknown): boolean {
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase !== 'attached' || !isPropertyBag(surface))
            return false;
        const record = findSurfaceRecord(lifetime, surface);
        if (!record)
            return false;
        const actor = createSurfaceActor(lifetime);
        try {
            if (surface === propertyValue(lifetime.windowData, 'contentsBitmap') ||
                surface === propertyValue(lifetime.windowData, 'selectedContentsBitmap')) {
                return false;
            }
            const helpers = resolveTextHelpers();
            assertCurrent(actor);
            const hasObligation = propertyValue(helpers, 'hasWindowContentsObligation');
            if (!isRuntimeFunction(hasObligation))
                return false;
            const obligated = apply(hasObligation, helpers, [surface, lifetime.window, lifetime.windowData]);
            assertCurrent(actor);
            if (obligated !== false)
                return false;
            if (surface === propertyValue(lifetime.windowData, 'contentsBitmap') ||
                surface === propertyValue(lifetime.windowData, 'selectedContentsBitmap')) {
                return false;
            }
            assertCurrent(actor);
            const released = releaseSurfacePublication(lifetime, record, actor.authority.isCurrent);
            assertCurrent(actor);
            compactReleasedSurfaces(lifetime);
            return released;
        }
        catch (error) {
            if (error === SUPERSEDED_ERROR || !actor.authority.isCurrent())
                return false;
            throw error;
        }
        finally {
            if (lifetime.currentSurfaceIdentity === actor.identity)
                lifetime.currentSurfaceIdentity = null;
        }
    }
    function assertCurrent(node: WindowContentsSettlementActor): void {
        if (!node.authority.isCurrent())
            throw SUPERSEDED_ERROR;
    }
    function captureFacts(node: WindowRefreshPlanNode): WindowRefreshFacts {
        if (node.facts)
            return node.facts;
        const lazy = node.lazyFacts;
        if (!lazy.assignedCaptured) {
            const assignedValue = propertyValue(node.input, 'assignedContents');
            assertCurrent(node);
            if (!arrayIsArray(assignedValue) || !isFrozenObject(assignedValue)) {
                throw new IntrinsicTypeError('Window refresh assigned contents must be a frozen array.');
            }
            lazy.assignedContents = assignedValue;
            lazy.assignedCaptured = true;
        }
        const assignedValue = lazy.assignedContents;
        if (!assignedValue)
            throw new Error('Window refresh assigned contents capture was lost.');
        for (let index = 0; index < assignedValue.length; index += 1) {
            const assignedSurface = assignedValue[index];
            assertCurrent(node);
            appendUniqueSurface(node.lifetime, assignedSurface, true);
        }
        if (!lazy.initialCaptured) {
            const initialContents = propertyValue(node.input, 'initialContents');
            assertCurrent(node);
            lazy.initialContents = initialContents;
            lazy.initialCaptured = true;
        }
        const initialContents = lazy.initialContents;
        appendUniqueSurface(node.lifetime, initialContents);
        if (!lazy.sessionCaptured) {
            const observedSessionId = numberValue(propertyValue(node.input, 'sessionId'));
            assertCurrent(node);
            lazy.sessionId = isFiniteNumber(observedSessionId) ? observedSessionId : 0;
            lazy.sessionCaptured = true;
        }
        if (!lazy.finalCaptured) {
            const observedFinalContents = propertyValue(node.lifetime.window, 'contents');
            assertCurrent(node);
            lazy.finalContents = observedFinalContents ?? initialContents;
            lazy.finalCaptured = true;
        }
        const finalContents = lazy.finalContents;
        appendUniqueSurface(node.lifetime, finalContents);
        if (!lazy.revisionCaptured) {
            const observedRevision = numberValue(propertyValue(node.lifetime.windowData, 'contentsRevision'));
            assertCurrent(node);
            lazy.previousContentsRevision = isFiniteNumber(observedRevision) ? observedRevision : 0;
            lazy.revisionCaptured = true;
        }
        const previousContentsRevision = lazy.previousContentsRevision;
        const replaced = finalContents !== initialContents;
        const facts: WindowRefreshFacts = freezeObject({
            sessionId: lazy.sessionId,
            initialContents,
            finalContents,
            assignedContents: snapshotUnresolvedSurfaces(node.lifetime),
            replaced,
            previousContentsRevision,
            targetRevision: replaced ? previousContentsRevision + 1 : previousContentsRevision,
        });
        node.facts = facts;
        return facts;
    }
    function propertyOperation(authority: ExactDataPropertyAuthority, operations: Map<string, ExactDataPropertyOperation>, label: string, target: unknown, key: PropertyKey, value: unknown): ExactDataPropertyOperation {
        let operation = privateMapGet(operations, label);
        if (!operation) {
            operation = exactDataProperties.prepare(authority, target, key, value);
            privateMapSet(operations, label, operation);
        }
        return operation;
    }
    function commitProperty(node: WindowRefreshPlanNode, label: string, key: PropertyKey, value: unknown): void {
        const status = propertyOperation(node.authority, node.properties, label, node.lifetime.windowData, key, value).commit();
        if (status === 'superseded')
            throw SUPERSEDED_ERROR;
        if (status !== 'committed')
            throw new Error(`Window refresh property ${stringValue(key)} was rejected.`);
    }
    function inspectPublication(surface: object): ContentsPublicationHandle | null {
        const receipt = invokeMethod(surfaceOwnership, 'inspectExactContentsPublication', [
            surface,
        ]) as ExactContentsPublicationInspection;
        if (propertyValue(receipt, 'status') !== 'observed') {
            const error = propertyValue(receipt, 'error');
            if (Error.isError(error))
                throw error;
            throw new Error('Window contents publication inspection failed.', { cause: error });
        }
        const publication = propertyValue(receipt, 'publication');
        return isPropertyBag(publication) ? (publication as unknown as ContentsPublicationHandle) : null;
    }
    function exchangePublication(surface: object, expected: ContentsPublicationHandle | null, owner: unknown = null, descriptor: unknown = null): ContentsPublicationHandle | null | 'conflict' {
        const receipt = invokeMethod(surfaceOwnership, 'compareExchangeContentsPublication', [
            surface,
            expected,
            owner,
            descriptor,
        ]) as ContentsPublicationExchangeReceipt;
        const status = propertyValue(receipt, 'status');
        if (status === 'conflict')
            return 'conflict';
        if (status !== 'exchanged' || propertyValue(receipt, 'terminal') !== true) {
            const error = propertyValue(receipt, 'error');
            if (Error.isError(error))
                throw error;
            throw new Error('Window contents publication exchange failed.', { cause: error });
        }
        const publication = propertyValue(receipt, 'publication');
        return isPropertyBag(publication) ? (publication as unknown as ContentsPublicationHandle) : null;
    }
    function adoptSurfaceSlotFromPublication(lifetime: WindowContentsLifetime, record: AssignedSurfaceRecord, publication: ContentsPublicationHandle | null): void {
        if (record.slot !== 0)
            return;
        const adoptedSlot = positiveSurfaceSlot(publication, lifetime);
        if (adoptedSlot <= 0 || surfaceSlotIsReserved(lifetime, adoptedSlot, record))
            return;
        record.slot = adoptedSlot;
        lifetime.nextSurfaceSlot = maxNumber(lifetime.nextSurfaceSlot, adoptedSlot);
    }
    function publicationBelongsToLifetime(publication: ContentsPublicationHandle | null, lifetime: WindowContentsLifetime, record: AssignedSurfaceRecord): boolean {
        const descriptor = propertyValue(publication, 'descriptor');
        const role = publicationRole(propertyValue(descriptor, 'role'));
        if (!role)
            return false;
        const surfaceId = role === 'window-current-contents'
            ? `window:${lifetime.identityKey}`
            : `window:${lifetime.identityKey}:contents:${stringValue(record.slot)}`;
        const auxiliarySurfaceId = propertyValue(descriptor, 'auxiliarySurfaceId');
        const surfaceSlotId = propertyValue(descriptor, 'surfaceSlotId');
        if (typeof auxiliarySurfaceId !== 'string' || typeof surfaceSlotId !== 'string')
            return false;
        const retainedSlotMatches = record.slot > 0 &&
            auxiliarySurfaceId === `window:${lifetime.identityKey}:contents:${stringValue(record.slot)}` &&
            surfaceSlotId === `contents-${stringValue(record.slot)}`;
        return (propertyValue(publication, 'owner') === lifetime.window &&
            propertyValue(descriptor, 'owner') === lifetime.window &&
            propertyValue(descriptor, 'contentsGeneration') === lifetime.windowData &&
            propertyValue(descriptor, 'adapterId') === 'window' &&
            propertyValue(descriptor, 'surfaceType') === 'window' &&
            propertyValue(descriptor, 'windowOwned') === true &&
            propertyValue(descriptor, 'role') === role &&
            propertyValue(descriptor, 'surfaceId') === surfaceId &&
            (role === 'window-current-contents'
                ? (auxiliarySurfaceId === '' && surfaceSlotId === '') || retainedSlotMatches
                : retainedSlotMatches));
    }
    function publicationMatches(publication: ContentsPublicationHandle | null, lifetime: WindowContentsLifetime, record: AssignedSurfaceRecord, role: WindowContentsPublicationRole): boolean {
        return (publicationBelongsToLifetime(publication, lifetime, record) &&
            propertyValue(propertyValue(publication, 'descriptor'), 'role') === role);
    }
    function ensureSurfacePublication(node: WindowContentsSettlementActor, record: AssignedSurfaceRecord, role: WindowContentsPublicationRole, reason: string): void {
        assertCurrent(node);
        const current = inspectPublication(record.surface);
        assertCurrent(node);
        adoptSurfaceSlotFromPublication(node.lifetime, record, current);
        if (role !== 'window-current-contents' && record.slot === 0) {
            record.slot = allocateSurfaceSlot(node.lifetime, record);
        }
        if (publicationMatches(current, node.lifetime, record, role)) {
            record.disposition = 'published';
            return;
        }
        const surfaceId = role === 'window-current-contents'
            ? `window:${node.lifetime.identityKey}`
            : `window:${node.lifetime.identityKey}:contents:${stringValue(record.slot)}`;
        const exchanged = exchangePublication(record.surface, current, node.lifetime.window, {
            adapterId: 'window',
            surfaceType: 'window',
            role,
            windowOwned: true,
            contentsGeneration: node.lifetime.windowData,
            surfaceId,
            auxiliarySurfaceId: record.slot > 0 ? `window:${node.lifetime.identityKey}:contents:${stringValue(record.slot)}` : '',
            surfaceSlotId: record.slot > 0 ? `contents-${stringValue(record.slot)}` : '',
            reason,
        });
        if (exchanged === 'conflict') {
            assertCurrent(node);
            throw new IntrinsicError('Window contents publication changed during exact exchange.');
        }
        assertCurrent(node);
        if (!publicationMatches(exchanged, node.lifetime, record, role)) {
            throw new IntrinsicError('Window contents publication exchange returned mismatched authority.');
        }
        record.disposition = 'published';
    }
    function releaseSurfacePublication(lifetime: WindowContentsLifetime, record: AssignedSurfaceRecord, isCurrent: () => boolean): boolean {
        const current = inspectPublication(record.surface);
        if (!isCurrent())
            throw SUPERSEDED_ERROR;
        adoptSurfaceSlotFromPublication(lifetime, record, current);
        if (!publicationBelongsToLifetime(current, lifetime, record)) {
            record.disposition = 'released';
            return false;
        }
        const exchanged = exchangePublication(record.surface, current);
        if (exchanged === 'conflict') {
            if (!isCurrent())
                throw SUPERSEDED_ERROR;
            throw new IntrinsicError('Window contents release changed during exact exchange.');
        }
        if (!isCurrent())
            throw SUPERSEDED_ERROR;
        if (exchanged !== null)
            throw new IntrinsicError('Window contents release returned a live publication.');
        record.disposition = 'released';
        return true;
    }
    function resolveTextHelpers(): unknown {
        if (!isRuntimeFunction(getWindowTextHelpers))
            return null;
        return apply(getWindowTextHelpers, undefined, []);
    }
    function invalidateInitialSurface(node: WindowRefreshPlanNode, surface: unknown): void {
        if (!surface)
            return;
        const helpers = resolveTextHelpers();
        assertCurrent(node);
        if (!helpers)
            return;
        if (!isRuntimeFunction(propertyValue(helpers, 'settleRefreshInlineReplacementSurface'))) {
            throw new Error('Window refresh inline-replacement settlement authority is unavailable.');
        }
        const receipt = invokeMethod(helpers, 'settleRefreshInlineReplacementSurface', [
            node.lifetime.windowData,
            surface,
            node.authority,
        ]);
        assertCurrent(node);
        if (!exactDataProperties.verifiesReceipt(node.authority, receipt) ||
            !isFrozenObject(receipt) ||
            propertyValue(receipt, 'status') !== 'settled' ||
            propertyValue(receipt, 'terminal') !== true ||
            propertyValue(receipt, 'windowData') !== node.lifetime.windowData ||
            propertyValue(receipt, 'surface') !== surface ||
            propertyValue(receipt, 'authority') !== node.authority ||
            propertyValue(receipt, 'pendingLeases') !== 0) {
            throw new Error('Window refresh inline-replacement settlement did not return exact terminal authority.');
        }
    }
    function settleCanonicalClaim(windowValue: unknown, windowDataValue: unknown, target: unknown, reason: unknown): boolean {
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase !== 'attached' || !lifetime.claimJournal)
            return false;
        return lifetime.claimJournal.settle(target, reason).status === 'settled';
    }
    function settleAdapterEntries(node: WindowRefreshPlanNode, settlement: WindowRefreshFacts): void {
        if (settlement.assignedContents.length === 0)
            return;
        const helpers = resolveTextHelpers();
        assertCurrent(node);
        const markSettled = (): void => {
            for (let index = 0; index < node.lifetime.surfaces.length; index += 1) {
                const record = node.lifetime.surfaces[index];
                if (!record?.assigned || record.adapterSettled)
                    continue;
                for (let assignedIndex = 0; assignedIndex < settlement.assignedContents.length; assignedIndex += 1) {
                    if (settlement.assignedContents[assignedIndex] === record.surface) {
                        record.adapterSettled = true;
                        break;
                    }
                }
            }
        };
        if (!helpers || !isRuntimeFunction(propertyValue(helpers, 'settleRefreshContentsAssignments'))) {
            markSettled();
            return;
        }
        const receipt = invokeMethod(helpers, 'settleRefreshContentsAssignments', [
            node.lifetime.window,
            node.lifetime.windowData,
            settlement,
            node.authority,
        ]);
        assertCurrent(node);
        const settledEntries = propertyValue(receipt, 'settledEntries');
        if (!exactDataProperties.verifiesReceipt(node.authority, receipt) ||
            !isFrozenObject(receipt) ||
            propertyValue(receipt, 'status') !== 'settled' ||
            propertyValue(receipt, 'terminal') !== true ||
            propertyValue(receipt, 'windowInstance') !== node.lifetime.window ||
            propertyValue(receipt, 'windowData') !== node.lifetime.windowData ||
            propertyValue(receipt, 'settlement') !== settlement ||
            typeof settledEntries !== 'number' ||
            !isSafeInteger(settledEntries) ||
            settledEntries < 0 ||
            propertyValue(receipt, 'pendingEntries') !== 0) {
            throw new Error('Window refresh entry settlement did not return exact terminal authority.');
        }
        markSettled();
    }
    function settleAssignedOwnership(node: WindowRefreshPlanNode, finalContents: unknown): void {
        while (node.ownershipIndex < node.lifetime.surfaces.length) {
            const record = node.lifetime.surfaces[node.ownershipIndex];
            if (!record || record.surface === finalContents || record.disposition === 'released') {
                node.ownershipIndex += 1;
                continue;
            }
            const helpers = resolveTextHelpers();
            assertCurrent(node);
            const hasObligation = propertyValue(helpers, 'hasWindowContentsObligation');
            if (!isRuntimeFunction(hasObligation)) {
                record.disposition = 'retained';
                node.ownershipIndex += 1;
                continue;
            }
            const obligated = apply(hasObligation, helpers, [
                record.surface,
                node.lifetime.window,
                node.lifetime.windowData,
            ]);
            assertCurrent(node);
            if (obligated !== false) {
                record.disposition = 'retained';
                node.ownershipIndex += 1;
                continue;
            }
            releaseSurfacePublication(node.lifetime, record, node.authority.isCurrent);
            node.ownershipIndex += 1;
        }
    }
    function settleNode(node: WindowRefreshPlanNode): WindowRefreshContentsSettlement {
        if (node.terminal)
            return node.terminal;
        if (node.settleRunning)
            throw new IntrinsicError('Window refresh contents settlement is already in progress.');
        node.settleRunning = true;
        try {
            if (!node.authority.isCurrent()) {
                return supersededReceipt();
            }
            const facts = captureFacts(node);
            for (;;) {
                assertCurrent(node);
                switch (node.cursor) {
                    case 0: {
                        while (node.surfaceIndex < node.lifetime.surfaces.length) {
                            const record = node.lifetime.surfaces[node.surfaceIndex];
                            if (record?.assigned &&
                                !record.adapterSettled &&
                                record.surface !== facts.finalContents &&
                                record.disposition !== 'released') {
                                ensureSurfacePublication(node, record, facts.replaced ? 'window-staging-contents' : 'window-auxiliary-contents', 'refresh-assigned-contents');
                            }
                            node.surfaceIndex += 1;
                        }
                        node.cursor += 1;
                        break;
                    }
                    case 1:
                        if (facts.replaced)
                            invalidateInitialSurface(node, facts.initialContents);
                        node.cursor += 1;
                        break;
                    case 2:
                        node.cursor += 1;
                        break;
                    case 3: {
                        if (facts.replaced && isPropertyBag(facts.initialContents)) {
                            const record = findSurfaceRecord(node.lifetime, facts.initialContents);
                            if (record)
                                releaseSurfacePublication(node.lifetime, record, node.authority.isCurrent);
                        }
                        node.cursor += 1;
                        break;
                    }
                    case 4:
                        if (facts.replaced) {
                            commitProperty(node, 'contents-revision', 'contentsRevision', facts.targetRevision);
                        }
                        node.cursor += 1;
                        break;
                    case 5:
                        commitProperty(node, 'contents-bitmap', 'contentsBitmap', facts.finalContents);
                        commitProperty(node, 'selected-contents-bitmap', 'selectedContentsBitmap', facts.finalContents);
                        node.cursor += 1;
                        break;
                    case 6: {
                        if (isPropertyBag(facts.finalContents)) {
                            const record = findSurfaceRecord(node.lifetime, facts.finalContents);
                            if (record) {
                                ensureSurfacePublication(node, record, 'window-current-contents', 'refresh-canonical-contents-committed');
                            }
                        }
                        node.cursor += 1;
                        break;
                    }
                    case 7: {
                        const claimSettlement = node.lifetime.claimJournal?.settle(facts.finalContents, context.contentsReplacedReason, node.authority);
                        assertCurrent(node);
                        if (claimSettlement?.status === 'superseded') {
                            throw new IntrinsicError('Window contents claim settlement was preempted.');
                        }
                        node.cursor += 1;
                        break;
                    }
                    case 8:
                        settleAdapterEntries(node, facts);
                        node.cursor += 1;
                        break;
                    case 9:
                        settleAssignedOwnership(node, facts.finalContents);
                        node.cursor += 1;
                        break;
                    default: {
                        const receipt: WindowRefreshContentsTerminalSettlement = freezeObject({
                            sessionId: facts.sessionId,
                            initialContents: facts.initialContents,
                            finalContents: facts.finalContents,
                            assignedContents: facts.assignedContents,
                            replaced: facts.replaced,
                            previousContentsRevision: facts.previousContentsRevision,
                            status: 'settled',
                            terminal: true,
                            nextContentsRevision: facts.targetRevision,
                            reason: context.contentsReplacedReason,
                        });
                        assertCurrent(node);
                        node.terminal = receipt;
                        compactReleasedSurfaces(node.lifetime);
                        if (node.lifetime.currentContentsIdentity === node.identity) {
                            node.lifetime.currentContentsIdentity = null;
                        }
                        return receipt;
                    }
                }
            }
        }
        catch (error) {
            if (error === SUPERSEDED_ERROR || !node.authority.isCurrent()) {
                return supersededReceipt();
            }
            throw error;
        }
        finally {
            node.settleRunning = false;
        }
    }
    function appendRevocationSurfaces(lifetime: WindowContentsLifetime): void {
        appendUniqueSurface(lifetime, propertyValue(lifetime.windowData, 'contentsBitmap'));
        appendUniqueSurface(lifetime, propertyValue(lifetime.windowData, 'selectedContentsBitmap'));
        appendUniqueSurface(lifetime, propertyValue(lifetime.window, 'contents'));
    }
    function settleRevocation(windowValue: unknown, windowDataValue: unknown, lease: WindowRefreshRevocationLease, reason: unknown, terminalBoundary: boolean): WindowRefreshRevocationReceipt {
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase === 'revoked')
            return REVOKED;
        if (lifetime.revokeLease !== lease) {
            throw new IntrinsicError('Window refresh revocation lease is not current.');
        }
        if (lifetime.phase === 'revoking' && lifetime.revokeRunning) {
            throw new Error('Window refresh revocation is already in progress.');
        }
        lifetime.phase = 'revoking';
        lifetime.revokeRunning = true;
        lifetime.currentContentsIdentity = null;
        lifetime.currentSurfaceIdentity = null;
        lifetime.revokeProperties = new IntrinsicMap<string, ExactDataPropertyOperation>();
        try {
            const claimRevocation = lifetime.claimJournal?.revoke(reason, lifetime.revokeAuthority);
            if (claimRevocation && claimRevocation.status !== 'settled')
                return REVOKING;
            appendRevocationSurfaces(lifetime);
            const surfaceCount = lifetime.surfaces.length;
            for (let index = 0; index < surfaceCount; index += 1) {
                const record = lifetime.surfaces[index];
                if (!record)
                    continue;
                releaseSurfacePublication(lifetime, record, lifetime.revokeAuthority.isCurrent);
            }
            if (lifetime.surfaces.length !== surfaceCount)
                return REVOKING;
            for (let index = 0; index < surfaceCount; index += 1) {
                const record = lifetime.surfaces[index];
                if (!record)
                    continue;
                const current = inspectPublication(record.surface);
                const descriptor = propertyValue(current, 'descriptor');
                if (propertyValue(current, 'owner') === lifetime.window &&
                    propertyValue(descriptor, 'contentsGeneration') === lifetime.windowData &&
                    propertyValue(descriptor, 'adapterId') === 'window') {
                    record.disposition = 'pending';
                    return REVOKING;
                }
            }
            compactReleasedSurfaces(lifetime, true);
            const tombstones = [
                freezeObject({ label: 'revoke-contents', key: 'contentsBitmap' }),
                freezeObject({ label: 'revoke-selected-contents', key: 'selectedContentsBitmap' }),
            ] as const;
            for (let index = 0; index < tombstones.length; index += 1) {
                const tombstone = tombstones[index];
                if (!tombstone)
                    throw new Error('Window refresh revocation lost a tombstone step.');
                const operation = propertyOperation(lifetime.revokeAuthority, lifetime.revokeProperties, tombstone.label, lifetime.windowData, tombstone.key, null);
                const status = operation.commit();
                if (status !== 'committed') {
                    throw new Error(`Window refresh revocation could not tombstone ${tombstone.key}.`);
                }
            }
            if (!terminalBoundary)
                return REVOKING;
            lifetime.phase = 'revoked';
            lifetime.revokeLease = null;
            return REVOKED;
        }
        finally {
            lifetime.revokeRunning = false;
        }
    }
    function beginRevocation(windowValue: unknown, windowDataValue: unknown, reason: unknown): WindowRefreshRevocationLease {
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase === 'revoked') {
            throw new IntrinsicError('Window refresh revocation is already terminal.');
        }
        if (lifetime.revokeLease) {
            if (lifetime.revokeRunning) {
                throw new IntrinsicError('Window refresh revocation is already in progress.');
            }
            return lifetime.revokeLease;
        }
        const lease = freezeObject({ receipt: REVOKING });
        lifetime.revokeLease = lease;
        const receipt = settleRevocation(windowValue, windowDataValue, lease, reason, false);
        if (receipt.terminal)
            throw new IntrinsicError('Window refresh revocation terminalized before callbacks.');
        return lease;
    }
    function completeRevocation(windowValue: unknown, windowDataValue: unknown, lease: WindowRefreshRevocationLease, reason: unknown): WindowRefreshRevocationReceipt {
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase !== 'revoking') {
            throw new IntrinsicError('Window refresh revocation has not crossed its pre-callback boundary.');
        }
        return settleRevocation(windowValue, windowDataValue, lease, reason, true);
    }
    function detach(windowValue: unknown, windowDataValue: unknown): void {
        const lifetime = requireLifetime(windowValue, windowDataValue);
        if (lifetime.phase !== 'revoked') {
            throw new Error('Window refresh lifetime cannot detach before terminal revocation.');
        }
        apply(weakMapDelete, lifetimes, [lifetime.window]);
    }
    return freezeObject({
        attach,
        recordAssigned,
        publishSurface,
        releaseSurface,
        settleCanonicalClaim,
        begin,
        detach,
        beginRevocation,
        completeRevocation,
    });
}
