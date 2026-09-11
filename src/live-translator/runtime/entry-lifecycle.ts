import { commitDescriptorTransaction, compensateDescriptorTransaction, createDataDescriptorUpdateFromExpected, createDeleteDescriptorUpdateFromExpected, descriptorTransactionMatches, descriptorsEqual, getOwnDescriptor, type DescriptorTransactionCompensationResult, type DescriptorTransactionResult, type DescriptorTransactionUpdate, } from './descriptor-transaction.js';
type PropertyBag = Record<PropertyKey, unknown>;
type CapturedMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
export interface EntryLifecycleState extends PropertyBag {
    readonly stale: boolean;
    readonly staleReason: string;
    readonly staleAt: number;
    readonly canceledReason: string;
    readonly canceledAt: number;
    readonly pendingInvalidation: EntryPendingInvalidation | null;
    readonly detached: EntryDetachedState | null;
    readonly surfaceVisible: boolean | null;
    readonly screenState: string;
    readonly visibilityReason: string;
    readonly visibilityAt: number;
}
export interface EntryPendingInvalidation extends PropertyBag {
    readonly reason: string;
    readonly sourceReason: string;
    readonly at: number;
    readonly contentsRevision: number;
}
export interface EntryDetachedDetails extends PropertyBag {
    readonly key: string;
    readonly windowType: string;
    readonly allowDetachedReattach: boolean;
}
export interface EntryDetachedState extends PropertyBag {
    readonly at: number;
    readonly reason: string;
    readonly details: EntryDetachedDetails | null;
}
export interface EntryLifecycleMutationOptions extends PropertyBag {
    readonly at?: unknown;
    readonly surfaceVisible?: unknown;
    readonly screenState?: unknown;
    readonly sourceReason?: unknown;
    readonly contentsRevision?: unknown;
}
export interface EntrySurfaceVisibilityDetails extends PropertyBag {
    readonly at?: unknown;
    readonly reason?: unknown;
    readonly screenState?: unknown;
}
export interface EntryLifecycleInvalidationDetached extends PropertyBag {
    readonly reason: string;
    readonly details: EntryDetachedDetails | null;
}
export type EntryLifecycleTransitionRequest = Readonly<{
    kind: 'ensure';
}> | Readonly<{
    kind: 'stale';
    reason: string;
    at: number;
    surfaceVisible?: boolean;
    screenState?: string;
}> | Readonly<{
    kind: 'pending-invalidation';
    reason: string;
    sourceReason: string;
    at: number;
    contentsRevision: number;
}> | Readonly<{
    kind: 'invalidation';
    reason: string;
    at: number;
    surfaceVisible: boolean;
    screenState: string;
    detached: EntryLifecycleInvalidationDetached | null;
}> | Readonly<{
    kind: 'clear-pending-invalidation';
}> | Readonly<{
    kind: 'detached';
    reason: string;
    at: number;
    details: EntryDetachedDetails | null;
}> | Readonly<{
    kind: 'reattached';
}> | Readonly<{
    kind: 'surface-visibility';
    visible: boolean;
    reason: string;
    screenState: string;
    at: number;
}>;
export interface PreparedEntryLifecycleTransition {
    readonly kind: EntryLifecycleTransitionRequest['kind'];
    readonly entry: PropertyBag;
    readonly previousState: EntryLifecycleState;
    readonly state: EntryLifecycleState;
    readonly changed: boolean;
}
export interface EntryLifecycleCommitDescriptors {
    readonly proof: DescriptorTransactionResult | null;
    readonly lifecycle: DescriptorTransactionResult | null;
    readonly proofRollback: DescriptorTransactionCompensationResult | null;
}
export interface EntryLifecycleCompensationDescriptors {
    readonly lifecycle: DescriptorTransactionCompensationResult | null;
    readonly proof: DescriptorTransactionCompensationResult | null;
}
export interface EntryLifecycleTransitionResult {
    readonly status: 'committed' | 'conflict' | 'rolled-back' | 'quarantined';
    readonly committed: boolean;
    readonly state: EntryLifecycleState | null;
    readonly descriptor: EntryLifecycleCommitDescriptors | null;
}
export interface EntryLifecycleCompensationResult {
    readonly status: 'compensated' | 'conflict' | 'quarantined';
    readonly compensated: boolean;
    readonly state: EntryLifecycleState | null;
    readonly descriptor: EntryLifecycleCompensationDescriptors | null;
}
export interface EntryLifecycleModule {
    readonly prepare: (entry: unknown, request: EntryLifecycleTransitionRequest) => PreparedEntryLifecycleTransition | null;
    readonly commit: (plan: PreparedEntryLifecycleTransition) => EntryLifecycleTransitionResult;
    readonly compensate: (plan: PreparedEntryLifecycleTransition) => EntryLifecycleCompensationResult;
    readonly matches: (plan: PreparedEntryLifecycleTransition, side: 'expected' | 'prepared') => boolean;
    readonly ensure: (entry: unknown) => EntryLifecycleState | null;
    readonly isStale: (entry: unknown) => boolean;
    readonly markStale: (entry: unknown, reason?: unknown, options?: EntryLifecycleMutationOptions) => EntryLifecycleState | null;
    readonly markPendingInvalidation: (entry: unknown, reason?: unknown, options?: EntryLifecycleMutationOptions) => EntryPendingInvalidation | null;
    readonly getPendingInvalidation: (entry: unknown) => PropertyBag | null;
    readonly clearPendingInvalidation: (entry: unknown) => boolean;
    readonly markDetached: (entry: unknown, reason?: unknown, details?: unknown, options?: EntryLifecycleMutationOptions) => EntryDetachedState | null;
    readonly getDetached: (entry: unknown) => PropertyBag | null;
    readonly getDetachedReason: (entry: unknown) => string;
    readonly getDetachedDetails: (entry: unknown) => PropertyBag | null;
    readonly markReattached: (entry: unknown) => EntryLifecycleState | null;
    readonly setSurfaceVisible: (entry: unknown, visible: unknown, details?: EntrySurfaceVisibilityDetails) => EntryLifecycleState | null;
    readonly getSurfaceVisible: (entry: unknown) => boolean | null;
    readonly getCanceledReason: (entry: unknown) => string;
    readonly getCanceledAt: (entry: unknown) => number;
}
interface DataField {
    readonly valid: boolean;
    readonly present: boolean;
    readonly value: unknown;
}
interface TransitionAuthority {
    phase: 'prepared' | 'committing' | 'committed' | 'compensating' | 'compensated' | 'spent';
    expectedEpoch: number;
    committedEpoch: number | null;
    readonly lifecycleUpdates: readonly DescriptorTransactionUpdate[];
    readonly proofUpdates: readonly DescriptorTransactionUpdate[];
    readonly proofGuarded: boolean;
}
const applyIntrinsic = Reflect.apply;
const freezeIntrinsic = Object.freeze;
const isFiniteIntrinsic = Number.isFinite;
const isIntegerIntrinsic = Number.isInteger;
const isFrozenIntrinsic = Object.isFrozen;
const stringIntrinsic = String;
const numberIntrinsic = Number;
const dateIntrinsic = Date;
const dateNowIntrinsic = Date.now;
const weakMapGetIntrinsic = captureMethod(WeakMap.prototype, 'get');
const weakMapSetIntrinsic = captureMethod(WeakMap.prototype, 'set');
const weakMapDeleteIntrinsic = captureMethod(WeakMap.prototype, 'delete');
const weakSetAddIntrinsic = captureMethod(WeakSet.prototype, 'add');
const weakSetHasIntrinsic = captureMethod(WeakSet.prototype, 'has');
function captureMethod(target: object, key: PropertyKey): CapturedMethod {
    const descriptor = getOwnDescriptor(target, key);
    if (!descriptor || typeof descriptor.value !== 'function') {
        throw new TypeError('Entry lifecycle requires an unavailable intrinsic method.');
    }
    return descriptor.value as CapturedMethod;
}
const hasOwnPropertyIntrinsic = captureMethod(Object.prototype, 'hasOwnProperty') as (this: object, key: PropertyKey) => boolean;
const authoredStates = new WeakSet<object>();
const authoredPlans = new WeakSet<object>();
const planAuthorities = new WeakMap<object, TransitionAuthority>();
const entryEpochs = new WeakMap<object, number>();
const entryTransactions = new WeakMap<object, TransitionAuthority>();
function callIntrinsic<Arguments extends readonly unknown[], Result>(callback: (...arguments_: Arguments) => Result, receiver: unknown, arguments_: Arguments): Result {
    return applyIntrinsic(callback, receiver, arguments_ as unknown as ArrayLike<unknown>) as Result;
}
function freezeExact<Value extends object>(value: Value): Value {
    const returned = freezeIntrinsic(value);
    if (returned !== value || !isFrozenIntrinsic(value)) {
        throw new Error('Entry lifecycle could not freeze its exact authored state.');
    }
    return value;
}
function brand<Value extends object>(ledger: WeakSet<object>, value: Value): Value {
    callIntrinsic(weakSetAddIntrinsic, ledger, [value]);
    return value;
}
function isBranded(ledger: WeakSet<object>, value: object): boolean {
    return callIntrinsic(weakSetHasIntrinsic, ledger, [value]) as boolean;
}
function weakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return callIntrinsic(weakMapGetIntrinsic, map, [key]) as Value | undefined;
}
function weakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    callIntrinsic(weakMapSetIntrinsic, map, [key, value]);
}
function weakMapDelete<Key extends object>(map: WeakMap<Key, unknown>, key: Key): void {
    callIntrinsic(weakMapDeleteIntrinsic, map, [key]);
}
function entryEpoch(entry: object): number {
    return weakMapGet(entryEpochs, entry) ?? 0;
}
function advanceEntryEpoch(entry: object): number {
    const next = entryEpoch(entry) + 1;
    if (!isFiniteIntrinsic(next)) {
        throw new Error('Entry lifecycle transaction epoch was exhausted.');
    }
    weakMapSet(entryEpochs, entry, next);
    return next;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return typeof value === 'object' && value !== null;
}
function hasOwn(value: object, key: PropertyKey): boolean {
    return callIntrinsic(hasOwnPropertyIntrinsic, value, [key]);
}
function readDataField(value: unknown, key: PropertyKey): DataField {
    if (!isPropertyBag(value))
        return { valid: false, present: false, value: undefined };
    const descriptor = getOwnDescriptor(value, key);
    if (!descriptor)
        return { valid: true, present: false, value: undefined };
    if (!hasOwn(descriptor, 'value'))
        return { valid: false, present: true, value: undefined };
    return { valid: true, present: true, value: descriptor.value };
}
function readStringField(value: unknown, key: PropertyKey, fallback = ''): string | null {
    const field = readDataField(value, key);
    if (!field.valid)
        return null;
    if (!field.present)
        return fallback;
    return typeof field.value === 'string' ? field.value : null;
}
function readNumberField(value: unknown, key: PropertyKey, fallback = 0): number | null {
    const field = readDataField(value, key);
    if (!field.valid)
        return null;
    if (!field.present)
        return fallback;
    return typeof field.value === 'number' && isFiniteIntrinsic(field.value) ? field.value : null;
}
function readBooleanField(value: unknown, key: PropertyKey, fallback: boolean): boolean | null {
    const field = readDataField(value, key);
    if (!field.valid)
        return null;
    if (!field.present)
        return fallback;
    return typeof field.value === 'boolean' ? field.value : null;
}
function readNullableBooleanField(value: unknown, key: PropertyKey): boolean | null | undefined {
    const field = readDataField(value, key);
    if (!field.valid)
        return undefined;
    if (!field.present || field.value === null)
        return null;
    return typeof field.value === 'boolean' ? field.value : undefined;
}
function readPositiveTimestamp(value: unknown): number | null {
    return typeof value === 'number' && isFiniteIntrinsic(value) && value > 0 ? value : null;
}
function createPendingInvalidation(value: unknown): EntryPendingInvalidation | null | undefined {
    if (value === null)
        return null;
    if (value === undefined)
        return undefined;
    if (!isPropertyBag(value))
        return undefined;
    const reason = readStringField(value, 'reason');
    const sourceReason = readStringField(value, 'sourceReason');
    const at = readNumberField(value, 'at');
    const contentsRevision = readNumberField(value, 'contentsRevision');
    if (reason === null ||
        reason === '' ||
        sourceReason === null ||
        sourceReason === '' ||
        at === null ||
        at <= 0 ||
        contentsRevision === null ||
        !isIntegerIntrinsic(contentsRevision) ||
        contentsRevision < 0) {
        return undefined;
    }
    return freezeExact({ reason, sourceReason, at, contentsRevision });
}
function createDetachedDetails(value: unknown): EntryDetachedDetails | null | undefined {
    if (value === null)
        return null;
    if (value === undefined)
        return undefined;
    if (!isPropertyBag(value))
        return undefined;
    const key = readStringField(value, 'key');
    const windowType = readStringField(value, 'windowType');
    const allowDetachedReattach = readBooleanField(value, 'allowDetachedReattach', false);
    if (key === null || windowType === null || allowDetachedReattach === null)
        return undefined;
    return freezeExact({ key, windowType, allowDetachedReattach });
}
function createDetachedState(value: unknown): EntryDetachedState | null | undefined {
    if (value === null)
        return null;
    if (value === undefined)
        return undefined;
    if (!isPropertyBag(value))
        return undefined;
    const at = readNumberField(value, 'at');
    const reason = readStringField(value, 'reason');
    const detailsField = readDataField(value, 'details');
    if (at === null || at <= 0 || reason === null || reason === '' || !detailsField.valid) {
        return undefined;
    }
    const details = createDetachedDetails(detailsField.present ? detailsField.value : null);
    if (details === undefined)
        return undefined;
    return freezeExact({ at, reason, details });
}
function stateIsCoherent(state: EntryLifecycleState): boolean {
    if (state.stale) {
        if (state.staleReason === '' ||
            state.staleAt <= 0 ||
            state.canceledReason !== state.staleReason ||
            state.canceledAt !== state.staleAt ||
            state.pendingInvalidation !== null) {
            return false;
        }
    }
    else {
        if (state.staleReason !== '' || state.staleAt !== 0)
            return false;
        if (state.pendingInvalidation) {
            if (state.canceledReason !== state.pendingInvalidation.sourceReason ||
                state.canceledAt !== state.pendingInvalidation.at) {
                return false;
            }
        }
        else if (state.canceledReason !== '' || state.canceledAt !== 0) {
            return false;
        }
    }
    if (state.surfaceVisible === null) {
        return state.screenState === '' && state.visibilityReason === '' && state.visibilityAt === 0;
    }
    return state.screenState !== '' && state.visibilityReason !== '' && state.visibilityAt > 0;
}
function createState(fields: {
    stale?: boolean;
    staleReason?: string;
    staleAt?: number;
    canceledReason?: string;
    canceledAt?: number;
    pendingInvalidation?: EntryPendingInvalidation | null;
    detached?: EntryDetachedState | null;
    surfaceVisible?: boolean | null;
    screenState?: string;
    visibilityReason?: string;
    visibilityAt?: number;
} = {}): EntryLifecycleState {
    return brand(authoredStates, freezeExact({
        stale: fields.stale === true,
        staleReason: fields.staleReason ?? '',
        staleAt: fields.staleAt ?? 0,
        canceledReason: fields.canceledReason ?? '',
        canceledAt: fields.canceledAt ?? 0,
        pendingInvalidation: fields.pendingInvalidation ?? null,
        detached: fields.detached ?? null,
        surfaceVisible: fields.surfaceVisible ?? null,
        screenState: fields.screenState ?? '',
        visibilityReason: fields.visibilityReason ?? '',
        visibilityAt: fields.visibilityAt ?? 0,
    }));
}
function snapshotState(value: unknown): EntryLifecycleState | null {
    if (!isPropertyBag(value))
        return createState();
    if (isFrozenIntrinsic(value) && isBranded(authoredStates, value))
        return value as EntryLifecycleState;
    try {
        const stale = readBooleanField(value, 'stale', false);
        const staleReason = readStringField(value, 'staleReason');
        const staleAt = readNumberField(value, 'staleAt');
        const canceledReason = readStringField(value, 'canceledReason');
        const canceledAt = readNumberField(value, 'canceledAt');
        const pendingField = readDataField(value, 'pendingInvalidation');
        const detachedField = readDataField(value, 'detached');
        const surfaceVisible = readNullableBooleanField(value, 'surfaceVisible');
        const screenState = readStringField(value, 'screenState');
        const visibilityReason = readStringField(value, 'visibilityReason');
        const visibilityAt = readNumberField(value, 'visibilityAt');
        if (stale === null ||
            staleReason === null ||
            staleAt === null ||
            canceledReason === null ||
            canceledAt === null ||
            !pendingField.valid ||
            !detachedField.valid ||
            surfaceVisible === undefined ||
            screenState === null ||
            visibilityReason === null ||
            visibilityAt === null) {
            return null;
        }
        const pendingInvalidation = createPendingInvalidation(pendingField.present ? pendingField.value : null);
        const detached = createDetachedState(detachedField.present ? detachedField.value : null);
        if (pendingInvalidation === undefined || detached === undefined)
            return null;
        const state = createState({
            stale,
            staleReason,
            staleAt,
            canceledReason,
            canceledAt,
            pendingInvalidation,
            detached,
            surfaceVisible,
            screenState,
            visibilityReason,
            visibilityAt,
        });
        return stateIsCoherent(state) ? state : null;
    }
    catch {
        return null;
    }
}
function captureEntryState(entry: PropertyBag): {
    readonly descriptor: PropertyDescriptor | undefined;
    readonly state: EntryLifecycleState;
} | null {
    try {
        const descriptor = getOwnDescriptor(entry, 'lifecycle');
        if (descriptor && !hasOwn(descriptor, 'value'))
            return null;
        const state = snapshotState(descriptor ? descriptor.value : null);
        return state ? freezeExact({ descriptor, state }) : null;
    }
    catch {
        return null;
    }
}
function snapshotRequest(request: EntryLifecycleTransitionRequest): EntryLifecycleTransitionRequest | null {
    try {
        const kindField = readDataField(request, 'kind');
        if (!kindField.valid || typeof kindField.value !== 'string')
            return null;
        switch (kindField.value) {
            case 'ensure':
            case 'clear-pending-invalidation':
            case 'reattached':
                return freezeExact({ kind: kindField.value });
            case 'stale': {
                const reason = readStringField(request, 'reason');
                const atField = readDataField(request, 'at');
                const surfaceField = readDataField(request, 'surfaceVisible');
                const screenField = readDataField(request, 'screenState');
                const at = readPositiveTimestamp(atField.value);
                if (reason === null ||
                    !reason ||
                    !atField.valid ||
                    at === null ||
                    !surfaceField.valid ||
                    !screenField.valid ||
                    (surfaceField.present && typeof surfaceField.value !== 'boolean') ||
                    (screenField.present && (typeof screenField.value !== 'string' || screenField.value === '')) ||
                    (screenField.present && !surfaceField.present)) {
                    return null;
                }
                const result: {
                    kind: 'stale';
                    reason: string;
                    at: number;
                    surfaceVisible?: boolean;
                    screenState?: string;
                } = { kind: 'stale', reason, at };
                if (surfaceField.present) {
                    result.surfaceVisible = surfaceField.value as boolean;
                    if (screenField.present)
                        result.screenState = screenField.value as string;
                }
                return freezeExact(result);
            }
            case 'pending-invalidation': {
                const reason = readStringField(request, 'reason');
                const sourceReason = readStringField(request, 'sourceReason');
                const atField = readDataField(request, 'at');
                const revision = readNumberField(request, 'contentsRevision');
                const at = readPositiveTimestamp(atField.value);
                if (reason === null ||
                    !reason ||
                    sourceReason === null ||
                    !sourceReason ||
                    !atField.valid ||
                    at === null ||
                    revision === null ||
                    !isIntegerIntrinsic(revision) ||
                    revision < 0) {
                    return null;
                }
                const snapshot: EntryLifecycleTransitionRequest = freezeExact({
                    kind: 'pending-invalidation',
                    reason,
                    sourceReason,
                    at,
                    contentsRevision: revision,
                });
                return snapshot;
            }
            case 'invalidation': {
                const reason = readStringField(request, 'reason');
                const atField = readDataField(request, 'at');
                const surfaceVisible = readBooleanField(request, 'surfaceVisible', false);
                const screenState = readStringField(request, 'screenState');
                const detachedField = readDataField(request, 'detached');
                const at = readPositiveTimestamp(atField.value);
                if (reason === null ||
                    !reason ||
                    !atField.valid ||
                    at === null ||
                    surfaceVisible === null ||
                    screenState === null ||
                    !screenState ||
                    !detachedField.valid ||
                    !detachedField.present) {
                    return null;
                }
                let detached: EntryLifecycleInvalidationDetached | null = null;
                if (detachedField.value !== null) {
                    if (!isPropertyBag(detachedField.value))
                        return null;
                    const detachedReason = readStringField(detachedField.value, 'reason');
                    const detailsField = readDataField(detachedField.value, 'details');
                    if (detachedReason === null || !detachedReason || !detailsField.valid || !detailsField.present) {
                        return null;
                    }
                    const details = createDetachedDetails(detailsField.value);
                    if (details === undefined)
                        return null;
                    detached = freezeExact({ reason: detachedReason, details });
                }
                const snapshot: EntryLifecycleTransitionRequest = freezeExact({
                    kind: 'invalidation',
                    reason,
                    at,
                    surfaceVisible,
                    screenState,
                    detached,
                });
                return snapshot;
            }
            case 'detached': {
                const reason = readStringField(request, 'reason');
                const atField = readDataField(request, 'at');
                const detailsField = readDataField(request, 'details');
                const at = readPositiveTimestamp(atField.value);
                if (reason === null || !reason || !atField.valid || at === null || !detailsField.valid) {
                    return null;
                }
                const details = createDetachedDetails(detailsField.present ? detailsField.value : null);
                if (details === undefined)
                    return null;
                const snapshot: EntryLifecycleTransitionRequest = freezeExact({
                    kind: 'detached',
                    reason,
                    at,
                    details,
                });
                return snapshot;
            }
            case 'surface-visibility': {
                const visible = readBooleanField(request, 'visible', false);
                const reason = readStringField(request, 'reason');
                const screenState = readStringField(request, 'screenState');
                const atField = readDataField(request, 'at');
                const at = readPositiveTimestamp(atField.value);
                if (visible === null ||
                    reason === null ||
                    !reason ||
                    screenState === null ||
                    !screenState ||
                    !atField.valid ||
                    at === null) {
                    return null;
                }
                const snapshot: EntryLifecycleTransitionRequest = freezeExact({
                    kind: 'surface-visibility',
                    visible,
                    reason,
                    screenState,
                    at,
                });
                return snapshot;
            }
            default:
                return null;
        }
    }
    catch {
        return null;
    }
}
function projectState(previous: EntryLifecycleState, request: EntryLifecycleTransitionRequest): {
    readonly state: EntryLifecycleState;
    readonly changed: boolean;
    readonly clearsProof: boolean;
} | null {
    switch (request.kind) {
        case 'ensure':
            return freezeExact({ state: previous, changed: false, clearsProof: false });
        case 'stale': {
            const hasVisibility = hasOwn(request, 'surfaceVisible');
            const visible = hasVisibility ? request.surfaceVisible === true : previous.surfaceVisible;
            return freezeExact({
                state: createState({
                    ...previous,
                    stale: true,
                    staleReason: request.reason,
                    staleAt: request.at,
                    canceledReason: request.reason,
                    canceledAt: request.at,
                    pendingInvalidation: null,
                    surfaceVisible: visible,
                    screenState: hasVisibility
                        ? (request.screenState ?? (visible ? 'visible' : 'hidden'))
                        : previous.screenState,
                    visibilityReason: hasVisibility ? request.reason : previous.visibilityReason,
                    visibilityAt: hasVisibility ? request.at : previous.visibilityAt,
                }),
                changed: true,
                clearsProof: true,
            });
        }
        case 'pending-invalidation': {
            if (previous.stale)
                return null;
            const pendingInvalidation = freezeExact({
                reason: request.reason,
                sourceReason: request.sourceReason,
                at: request.at,
                contentsRevision: request.contentsRevision,
            });
            return freezeExact({
                state: createState({
                    ...previous,
                    pendingInvalidation,
                    canceledReason: request.sourceReason,
                    canceledAt: request.at,
                }),
                changed: true,
                clearsProof: true,
            });
        }
        case 'invalidation':
            return freezeExact({
                state: createState({
                    ...previous,
                    stale: true,
                    staleReason: request.reason,
                    staleAt: request.at,
                    canceledReason: request.reason,
                    canceledAt: request.at,
                    pendingInvalidation: null,
                    detached: request.detached === null
                        ? null
                        : freezeExact({
                            at: request.at,
                            reason: request.detached.reason,
                            details: request.detached.details,
                        }),
                    surfaceVisible: request.surfaceVisible,
                    screenState: request.screenState,
                    visibilityReason: request.reason,
                    visibilityAt: request.at,
                }),
                changed: true,
                clearsProof: true,
            });
        case 'clear-pending-invalidation': {
            const changed = previous.pendingInvalidation !== null || previous.canceledReason !== '' || previous.canceledAt !== 0;
            if (!changed) {
                return freezeExact({ state: previous, changed: false, clearsProof: false });
            }
            return freezeExact({
                state: createState({
                    ...previous,
                    pendingInvalidation: null,
                    canceledReason: previous.stale ? previous.canceledReason : '',
                    canceledAt: previous.stale ? previous.canceledAt : 0,
                }),
                changed,
                clearsProof: false,
            });
        }
        case 'detached':
            return freezeExact({
                state: createState({
                    ...previous,
                    detached: freezeExact({
                        at: request.at,
                        reason: request.reason,
                        details: request.details,
                    }),
                }),
                changed: true,
                clearsProof: false,
            });
        case 'reattached': {
            const changed = previous.stale ||
                previous.staleReason !== '' ||
                previous.staleAt !== 0 ||
                previous.canceledReason !== '' ||
                previous.canceledAt !== 0 ||
                previous.pendingInvalidation !== null ||
                previous.detached !== null;
            return freezeExact({
                state: changed
                    ? createState({
                        ...previous,
                        stale: false,
                        staleReason: '',
                        staleAt: 0,
                        canceledReason: '',
                        canceledAt: 0,
                        pendingInvalidation: null,
                        detached: null,
                    })
                    : previous,
                changed,
                clearsProof: true,
            });
        }
        case 'surface-visibility':
            return freezeExact({
                state: createState({
                    ...previous,
                    surfaceVisible: request.visible,
                    screenState: request.screenState,
                    visibilityReason: request.reason,
                    visibilityAt: request.at,
                }),
                changed: true,
                clearsProof: false,
            });
    }
}
function planAuthority(plan: unknown): TransitionAuthority | null {
    try {
        if (!plan || typeof plan !== 'object' || !isFrozenIntrinsic(plan) || !isBranded(authoredPlans, plan)) {
            return null;
        }
        return weakMapGet(planAuthorities, plan) ?? null;
    }
    catch {
        return null;
    }
}
function singletonUpdatePlan(update: DescriptorTransactionUpdate | null): readonly DescriptorTransactionUpdate[] {
    return freezeExact(update ? [update] : []);
}
function proofDescriptorMatches(entry: PropertyBag, expected: PropertyDescriptor | undefined): boolean {
    try {
        return descriptorsEqual(getOwnDescriptor(entry, 'renderCommitProof'), expected);
    }
    catch {
        return false;
    }
}
function proofMatches(plan: PreparedEntryLifecycleTransition, authority: TransitionAuthority, side: 'expected' | 'prepared'): boolean {
    if (!authority.proofGuarded)
        return true;
    if (authority.proofUpdates.length > 0) {
        return descriptorTransactionMatches(authority.proofUpdates, side);
    }
    return proofDescriptorMatches(plan.entry, undefined);
}
function lifecycleMatches(authority: TransitionAuthority, side: 'expected' | 'prepared'): boolean {
    return authority.lifecycleUpdates.length === 0 || descriptorTransactionMatches(authority.lifecycleUpdates, side);
}
function transitionComponentsMatch(plan: PreparedEntryLifecycleTransition, authority: TransitionAuthority, side: 'expected' | 'prepared'): boolean {
    return lifecycleMatches(authority, side) && proofMatches(plan, authority, side);
}
function prepareTransition(entry: unknown, request: EntryLifecycleTransitionRequest): PreparedEntryLifecycleTransition | null {
    if (!isPropertyBag(entry))
        return null;
    const captured = captureEntryState(entry);
    const requestSnapshot = snapshotRequest(request);
    if (!captured || !requestSnapshot)
        return null;
    const projection = projectState(captured.state, requestSnapshot);
    if (!projection || !stateIsCoherent(projection.state))
        return null;
    const lifecycleAlreadyExact = captured.descriptor?.value === projection.state && isBranded(authoredStates, projection.state);
    const lifecycleUpdate = lifecycleAlreadyExact
        ? null
        : createDataDescriptorUpdateFromExpected(entry, 'lifecycle', captured.descriptor, projection.state);
    if (!lifecycleAlreadyExact && !lifecycleUpdate)
        return null;
    let proofUpdate: DescriptorTransactionUpdate | null = null;
    if (projection.clearsProof) {
        let proofDescriptor: PropertyDescriptor | undefined;
        try {
            proofDescriptor = getOwnDescriptor(entry, 'renderCommitProof');
        }
        catch {
            return null;
        }
        if (proofDescriptor) {
            proofUpdate = createDeleteDescriptorUpdateFromExpected(entry, 'renderCommitProof', proofDescriptor);
            if (!proofUpdate)
                return null;
        }
    }
    const lifecycleUpdates = singletonUpdatePlan(lifecycleUpdate);
    const proofUpdates = singletonUpdatePlan(proofUpdate);
    const plan = brand(authoredPlans, freezeExact({
        kind: requestSnapshot.kind,
        entry,
        previousState: captured.state,
        state: projection.state,
        changed: projection.changed,
    }));
    weakMapSet(planAuthorities, plan, {
        phase: 'prepared',
        expectedEpoch: entryEpoch(entry),
        committedEpoch: null,
        lifecycleUpdates,
        proofUpdates,
        proofGuarded: projection.clearsProof,
    });
    return plan;
}
function createTransitionResult(status: EntryLifecycleTransitionResult['status'], plan: PreparedEntryLifecycleTransition, descriptor: EntryLifecycleCommitDescriptors | null): EntryLifecycleTransitionResult {
    return freezeExact({
        status,
        committed: status === 'committed',
        state: status === 'committed' ? plan.state : null,
        descriptor,
    });
}
function createCommitDescriptors(proof: DescriptorTransactionResult | null = null, lifecycle: DescriptorTransactionResult | null = null, proofRollback: DescriptorTransactionCompensationResult | null = null): EntryLifecycleCommitDescriptors {
    return freezeExact({ proof, lifecycle, proofRollback });
}
function createCompensationDescriptors(lifecycle: DescriptorTransactionCompensationResult | null = null, proof: DescriptorTransactionCompensationResult | null = null): EntryLifecycleCompensationDescriptors {
    return freezeExact({ lifecycle, proof });
}
function descriptorFailureStatus(result: DescriptorTransactionResult): 'conflict' | 'rolled-back' | 'quarantined' {
    if (!result.rollbackComplete)
        return 'quarantined';
    return result.failures.length > 0 ? 'rolled-back' : 'conflict';
}
function rerevokeRestoredProof(authority: TransitionAuthority): void {
    const original = authority.proofUpdates[0];
    if (!original?.expected)
        return;
    try {
        if (!descriptorsEqual(getOwnDescriptor(original.target, original.key), original.expected))
            return;
        const rerevocation = createDeleteDescriptorUpdateFromExpected(original.target, original.key, original.expected);
        if (rerevocation)
            commitDescriptorTransaction(singletonUpdatePlan(rerevocation));
    }
    catch {
    }
}
function commitPreparedTransition(plan: PreparedEntryLifecycleTransition, authority: TransitionAuthority): EntryLifecycleTransitionResult {
    const emptyDescriptors = createCommitDescriptors();
    if (!transitionComponentsMatch(plan, authority, 'expected')) {
        authority.phase = 'spent';
        return createTransitionResult('conflict', plan, emptyDescriptors);
    }
    const hasWrites = authority.proofUpdates.length > 0 || authority.lifecycleUpdates.length > 0;
    const transactionEpoch = hasWrites ? advanceEntryEpoch(plan.entry) : authority.expectedEpoch;
    let proofCommit: DescriptorTransactionResult | null = null;
    if (authority.proofUpdates.length > 0) {
        proofCommit = commitDescriptorTransaction(authority.proofUpdates);
        if (!proofCommit.committed) {
            authority.phase = 'spent';
            if (!proofCommit.rollbackComplete || !transitionComponentsMatch(plan, authority, 'expected')) {
                rerevokeRestoredProof(authority);
                return createTransitionResult('quarantined', plan, createCommitDescriptors(proofCommit));
            }
            const status = descriptorFailureStatus(proofCommit);
            return createTransitionResult(status, plan, createCommitDescriptors(proofCommit));
        }
    }
    let lifecycleCommit: DescriptorTransactionResult | null = null;
    if (authority.lifecycleUpdates.length > 0) {
        lifecycleCommit = commitDescriptorTransaction(authority.lifecycleUpdates);
        if (!lifecycleCommit.committed) {
            let proofRollback: DescriptorTransactionCompensationResult | null = null;
            if (lifecycleCommit.rollbackComplete && lifecycleMatches(authority, 'expected') && proofCommit?.committed) {
                proofRollback = compensateDescriptorTransaction(authority.proofUpdates);
            }
            const restored = lifecycleCommit.rollbackComplete &&
                (!proofCommit || proofRollback?.compensated === true) &&
                transitionComponentsMatch(plan, authority, 'expected');
            if (!restored) {
                rerevokeRestoredProof(authority);
                authority.phase = 'spent';
                return createTransitionResult('quarantined', plan, createCommitDescriptors(proofCommit, lifecycleCommit, proofRollback));
            }
            authority.phase = 'spent';
            const status = proofCommit || lifecycleCommit.failures.length > 0 ? 'rolled-back' : 'conflict';
            return createTransitionResult(status, plan, createCommitDescriptors(proofCommit, lifecycleCommit, proofRollback));
        }
    }
    if (!transitionComponentsMatch(plan, authority, 'prepared')) {
        rerevokeRestoredProof(authority);
        authority.phase = 'spent';
        return createTransitionResult('quarantined', plan, createCommitDescriptors(proofCommit, lifecycleCommit));
    }
    authority.phase = 'committed';
    authority.committedEpoch = transactionEpoch;
    return createTransitionResult('committed', plan, createCommitDescriptors(proofCommit, lifecycleCommit));
}
function commitTransition(plan: PreparedEntryLifecycleTransition): EntryLifecycleTransitionResult {
    const authority = planAuthority(plan);
    if (authority?.phase !== 'prepared') {
        return createTransitionResult('conflict', plan, null);
    }
    if (entryEpoch(plan.entry) !== authority.expectedEpoch) {
        authority.phase = 'spent';
        return createTransitionResult('conflict', plan, null);
    }
    if (weakMapGet(entryTransactions, plan.entry)) {
        authority.phase = 'spent';
        return createTransitionResult('conflict', plan, null);
    }
    authority.phase = 'committing';
    weakMapSet(entryTransactions, plan.entry, authority);
    try {
        return commitPreparedTransition(plan, authority);
    }
    catch {
        authority.phase = 'spent';
        return createTransitionResult('quarantined', plan, null);
    }
    finally {
        weakMapDelete(entryTransactions, plan.entry);
    }
}
function createCompensationResult(status: EntryLifecycleCompensationResult['status'], plan: PreparedEntryLifecycleTransition, descriptor: EntryLifecycleCompensationDescriptors | null): EntryLifecycleCompensationResult {
    return freezeExact({
        status,
        compensated: status === 'compensated',
        state: status === 'compensated' ? plan.previousState : null,
        descriptor,
    });
}
function compensateCommittedTransition(plan: PreparedEntryLifecycleTransition, authority: TransitionAuthority): EntryLifecycleCompensationResult {
    const emptyDescriptors = createCompensationDescriptors();
    if (!transitionComponentsMatch(plan, authority, 'prepared')) {
        authority.phase = 'spent';
        return createCompensationResult('conflict', plan, emptyDescriptors);
    }
    const hasWrites = authority.lifecycleUpdates.length > 0 || authority.proofUpdates.length > 0;
    const compensationEpoch = hasWrites
        ? advanceEntryEpoch(plan.entry)
        : (authority.committedEpoch ?? authority.expectedEpoch);
    let lifecycleCompensation: DescriptorTransactionCompensationResult | null = null;
    if (authority.lifecycleUpdates.length > 0) {
        lifecycleCompensation = compensateDescriptorTransaction(authority.lifecycleUpdates);
        if (!lifecycleCompensation.compensated) {
            rerevokeRestoredProof(authority);
            authority.phase = 'spent';
            return createCompensationResult(lifecycleCompensation.failures.length > 0 ? 'quarantined' : 'conflict', plan, createCompensationDescriptors(lifecycleCompensation));
        }
    }
    let proofCompensation: DescriptorTransactionCompensationResult | null = null;
    if (authority.proofUpdates.length > 0) {
        proofCompensation = compensateDescriptorTransaction(authority.proofUpdates);
        if (!proofCompensation.compensated) {
            rerevokeRestoredProof(authority);
            authority.phase = 'spent';
            return createCompensationResult('quarantined', plan, createCompensationDescriptors(lifecycleCompensation, proofCompensation));
        }
    }
    if (!transitionComponentsMatch(plan, authority, 'expected')) {
        rerevokeRestoredProof(authority);
        authority.phase = 'spent';
        return createCompensationResult('quarantined', plan, createCompensationDescriptors(lifecycleCompensation, proofCompensation));
    }
    authority.phase = 'compensated';
    authority.expectedEpoch = compensationEpoch;
    return createCompensationResult('compensated', plan, createCompensationDescriptors(lifecycleCompensation, proofCompensation));
}
function compensateTransition(plan: PreparedEntryLifecycleTransition): EntryLifecycleCompensationResult {
    const authority = planAuthority(plan);
    if (authority?.phase !== 'committed' ||
        authority.committedEpoch === null ||
        entryEpoch(plan.entry) !== authority.committedEpoch) {
        if (authority?.phase === 'committed')
            authority.phase = 'spent';
        return createCompensationResult('conflict', plan, null);
    }
    if (weakMapGet(entryTransactions, plan.entry)) {
        authority.phase = 'spent';
        return createCompensationResult('conflict', plan, null);
    }
    authority.phase = 'compensating';
    weakMapSet(entryTransactions, plan.entry, authority);
    try {
        return compensateCommittedTransition(plan, authority);
    }
    catch {
        authority.phase = 'spent';
        return createCompensationResult('quarantined', plan, null);
    }
    finally {
        weakMapDelete(entryTransactions, plan.entry);
    }
}
function transitionMatches(plan: PreparedEntryLifecycleTransition, side: 'expected' | 'prepared'): boolean {
    const authority = planAuthority(plan);
    if (!authority)
        return false;
    if (side === 'expected') {
        if (authority.phase !== 'prepared' && authority.phase !== 'compensated')
            return false;
        if (entryEpoch(plan.entry) !== authority.expectedEpoch)
            return false;
    }
    else if (authority.phase !== 'committed') {
        return false;
    }
    else if (authority.committedEpoch === null || entryEpoch(plan.entry) !== authority.committedEpoch) {
        return false;
    }
    return transitionComponentsMatch(plan, authority, side);
}
function legacyString(value: unknown, fallback: string): string {
    const selected = truthyValue(value, fallback);
    const converted = callIntrinsic(stringIntrinsic, undefined, [selected]);
    if (typeof converted !== 'string')
        throw new TypeError('String conversion did not return text.');
    return converted;
}
function truthyValue<Value>(value: Value, fallback: Value): Value {
    if (value)
        return value;
    return fallback;
}
function legacyNumber(value: unknown): number {
    const converted = callIntrinsic(numberIntrinsic, undefined, [value]);
    if (typeof converted !== 'number')
        throw new TypeError('Number conversion did not return a number.');
    return converted;
}
function legacyTimestamp(value: unknown): number {
    const numeric = legacyNumber(value);
    if (isFiniteIntrinsic(numeric) && numeric > 0)
        return numeric;
    const now = callIntrinsic(dateNowIntrinsic, dateIntrinsic, []);
    if (typeof now !== 'number' || !isFiniteIntrinsic(now) || now <= 0) {
        throw new Error('Entry lifecycle clock returned an invalid timestamp.');
    }
    return now;
}
function optionValue(options: unknown, key: PropertyKey): unknown {
    const field = readDataField(options, key);
    if (!field.valid) {
        throw new TypeError('Entry lifecycle options must contain only own data fields.');
    }
    return field.present ? field.value : undefined;
}
function createEntryLifecycleController(): EntryLifecycleModule {
    function run(entry: unknown, request: EntryLifecycleTransitionRequest): EntryLifecycleTransitionResult | null {
        const plan = prepareTransition(entry, request);
        return plan ? commitTransition(plan) : null;
    }
    function ensure(entry: unknown): EntryLifecycleState | null {
        if (!isPropertyBag(entry))
            return null;
        const captured = captureEntryState(entry);
        if (!captured)
            return null;
        if (captured.descriptor?.value === captured.state && isBranded(authoredStates, captured.state)) {
            return captured.state;
        }
        return run(entry, freezeExact({ kind: 'ensure' }))?.state ?? null;
    }
    function readCurrentState(entry: unknown): EntryLifecycleState | null {
        if (!isPropertyBag(entry))
            return null;
        return captureEntryState(entry)?.state ?? null;
    }
    function isStale(entry: unknown): boolean {
        if (!isPropertyBag(entry))
            return false;
        try {
            const descriptor = getOwnDescriptor(entry, 'lifecycle');
            if (!descriptor)
                return false;
            if (!hasOwn(descriptor, 'value'))
                return true;
            if (!isPropertyBag(descriptor.value))
                return false;
            const state = snapshotState(descriptor.value);
            return state ? state.stale : true;
        }
        catch {
            return true;
        }
    }
    function markStale(entry: unknown, reason: unknown = 'entry-stale', options: EntryLifecycleMutationOptions = {}): EntryLifecycleState | null {
        try {
            const at = legacyTimestamp(optionValue(options, 'at'));
            const surfaceField = readDataField(options, 'surfaceVisible');
            if (!surfaceField.valid) {
                throw new TypeError('Entry lifecycle options must contain only own data fields.');
            }
            const request: {
                kind: 'stale';
                reason: string;
                at: number;
                surfaceVisible?: boolean;
                screenState?: string;
            } = { kind: 'stale', reason: legacyString(reason, 'entry-stale'), at };
            if (surfaceField.present) {
                request.surfaceVisible = surfaceField.value === true;
                request.screenState = legacyString(optionValue(options, 'screenState'), request.surfaceVisible ? 'visible' : 'hidden');
            }
            return run(entry, request)?.state ?? null;
        }
        catch {
            return null;
        }
    }
    function markPendingInvalidation(entry: unknown, reason: unknown = 'window-entry-stale', options: EntryLifecycleMutationOptions = {}): EntryPendingInvalidation | null {
        try {
            const reasonText = legacyString(reason, 'window-entry-stale');
            const sourceReason = legacyString(optionValue(options, 'sourceReason'), reasonText);
            const revisionCandidate = legacyNumber(optionValue(options, 'contentsRevision'));
            const contentsRevision = isFiniteIntrinsic(revisionCandidate) ? revisionCandidate : 0;
            const result = run(entry, {
                kind: 'pending-invalidation',
                reason: reasonText,
                sourceReason,
                at: legacyTimestamp(optionValue(options, 'at')),
                contentsRevision,
            });
            return result?.state?.pendingInvalidation ?? null;
        }
        catch {
            return null;
        }
    }
    function getPendingInvalidation(entry: unknown): PropertyBag | null {
        return readCurrentState(entry)?.pendingInvalidation ?? null;
    }
    function clearPendingInvalidation(entry: unknown): boolean {
        const plan = prepareTransition(entry, freezeExact({ kind: 'clear-pending-invalidation' }));
        if (!plan)
            return false;
        return commitTransition(plan).committed && plan.changed;
    }
    function markDetached(entry: unknown, reason: unknown = 'entry-detached', details: unknown = null, options: EntryLifecycleMutationOptions = {}): EntryDetachedState | null {
        try {
            const detailsSnapshot = createDetachedDetails(details);
            if (detailsSnapshot === undefined)
                return null;
            const result = run(entry, {
                kind: 'detached',
                reason: legacyString(reason, 'entry-detached'),
                at: legacyTimestamp(optionValue(options, 'at')),
                details: detailsSnapshot,
            });
            return result?.state?.detached ?? null;
        }
        catch {
            return null;
        }
    }
    function getDetached(entry: unknown): PropertyBag | null {
        return readCurrentState(entry)?.detached ?? null;
    }
    function getDetachedReason(entry: unknown): string {
        return readCurrentState(entry)?.detached?.reason ?? '';
    }
    function getDetachedDetails(entry: unknown): PropertyBag | null {
        return readCurrentState(entry)?.detached?.details ?? null;
    }
    function markReattached(entry: unknown): EntryLifecycleState | null {
        return run(entry, freezeExact({ kind: 'reattached' }))?.state ?? null;
    }
    function setSurfaceVisible(entry: unknown, visible: unknown, details: EntrySurfaceVisibilityDetails = {}): EntryLifecycleState | null {
        try {
            const isVisible = visible === true;
            const screenState = legacyString(optionValue(details, 'screenState'), isVisible ? 'visible' : 'hidden');
            const current = readCurrentState(entry);
            if (current?.surfaceVisible === isVisible && current.screenState === screenState)
                return current;
            return (run(entry, {
                kind: 'surface-visibility',
                visible: isVisible,
                reason: legacyString(optionValue(details, 'reason'), isVisible ? 'visible' : 'hidden'),
                screenState,
                at: legacyTimestamp(optionValue(details, 'at')),
            })?.state ?? null);
        }
        catch {
            return null;
        }
    }
    function getSurfaceVisible(entry: unknown): boolean | null {
        return readCurrentState(entry)?.surfaceVisible ?? null;
    }
    function getCanceledReason(entry: unknown): string {
        return readCurrentState(entry)?.canceledReason ?? '';
    }
    function getCanceledAt(entry: unknown): number {
        return readCurrentState(entry)?.canceledAt ?? 0;
    }
    return freezeExact({
        prepare: prepareTransition,
        commit: commitTransition,
        compensate: compensateTransition,
        matches: transitionMatches,
        ensure,
        isStale,
        markStale,
        markPendingInvalidation,
        getPendingInvalidation,
        clearPendingInvalidation,
        markDetached,
        getDetached,
        getDetachedReason,
        getDetachedDetails,
        markReattached,
        setSurfaceVisible,
        getSurfaceVisible,
        getCanceledReason,
        getCanceledAt,
    });
}
export function createEntryLifecycleModule(): EntryLifecycleModule {
    return createEntryLifecycleController();
}
