import type { TranslationStatusProvider, TranslationStatusSnapshot } from './translation-status-types.js';
export type { TranslationStatusProvider, TranslationStatusSnapshot } from './translation-status-types.js';
import { captureTranslationProviderRuntimeStatus, type TranslationProviderRuntimeStatus, } from './translation-providers/runtime-status.js';
import { commitDescriptorTransaction, compensateDescriptorTransaction, createOwnDataDescriptorShadowUpdate, type DescriptorTransactionUpdate, } from './descriptor-transaction.js';
type RuntimeFunction = (...args: unknown[]) => unknown;
type PropertyBag = Record<PropertyKey, unknown>;
const intrinsicReflectApply = Reflect.apply;
const intrinsicReflectGet = Reflect.get;
const intrinsicObjectFreeze = Object.freeze;
const intrinsicDateNow = Date.now;
const intrinsicMathMax = Math.max;
const intrinsicNumber = Number;
const intrinsicNumberIsFinite = Number.isFinite;
const intrinsicNumberIsSafeInteger = Number.isSafeInteger;
const intrinsicStringTrim = String.prototype.trim;
interface TranslationStatusStateCandidate extends PropertyBag {
    readonly activeCount?: unknown;
    readonly pumpRunning?: unknown;
    readonly pumpScheduled?: unknown;
    readonly providerCapacity?: unknown;
    readonly queued?: unknown;
    readonly revision?: unknown;
    readonly running?: unknown;
}
interface TranslationStatusOptionsCandidate extends PropertyBag {
    readonly claimLifecycleOwner?: unknown;
    readonly claimPublisher?: unknown;
    readonly deferPublication?: unknown;
    readonly getDiagnosticsState?: unknown;
    readonly getActivityState?: unknown;
    readonly getState?: unknown;
    readonly globalScope?: unknown;
    readonly isCacheOnlyProvider?: unknown;
    readonly observeDiagnostics?: unknown;
    readonly provider?: unknown;
}
interface TranslationStatusGlobalCandidate extends PropertyBag {
    LiveTranslatorTranslationStatus?: unknown;
}
export interface TranslationStatusActivity {
    readonly pumpRunning: boolean;
    readonly pumpScheduled: boolean;
    readonly queued: number;
    readonly revision: number;
    readonly running: number;
}
export interface TranslationStatusApi {
    subscribe(listener: (snapshot: TranslationStatusSnapshot) => void): Readonly<{
        detach(): void;
    }>;
    getActivitySnapshot(recordIds?: unknown): Readonly<TranslationStatusActivity>;
    getSnapshot(): TranslationStatusSnapshot;
}
export interface TranslationStatusLifecycleOwner {
    readonly activate: () => unknown;
    readonly deactivate: () => boolean;
}
export interface TranslationStatusModule {
    createTranslationStatus(options?: unknown): TranslationStatusApi;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readableProperty(value: unknown, key: PropertyKey): unknown {
    if (!isPropertyBag(value))
        return undefined;
    try {
        return intrinsicReflectGet(value, key, value);
    }
    catch {
        return undefined;
    }
}
function statusNumber(value: unknown): number {
    const numeric = intrinsicReflectApply(intrinsicNumber, undefined, [value]);
    return intrinsicNumberIsFinite(numeric) ? numeric : 0;
}
function statusString(value: unknown): string {
    if (typeof value !== 'string')
        return '';
    const trimmed = intrinsicReflectApply(intrinsicStringTrim, value, []);
    return typeof trimmed === 'string' && trimmed ? trimmed : '';
}
function statusRevision(value: unknown): number {
    return typeof value === 'number' && intrinsicNumberIsSafeInteger(value) && value >= 0 ? value : 0;
}
function readProviderStatus(provider: unknown): PropertyBag {
    if (!isPropertyBag(provider))
        return {};
    const getStatus = readableProperty(provider, 'getStatus');
    if (typeof getStatus !== 'function')
        return {};
    try {
        const status = intrinsicReflectApply(getStatus as RuntimeFunction, provider, []);
        return isPropertyBag(status) ? status : {};
    }
    catch {
        return {};
    }
}
function readProviderRuntimeStatus(provider: unknown): Readonly<TranslationProviderRuntimeStatus> | null {
    if (!isPropertyBag(provider))
        return null;
    const getRuntimeStatus = readableProperty(provider, 'getRuntimeStatus');
    if (typeof getRuntimeStatus !== 'function')
        return null;
    try {
        return captureTranslationProviderRuntimeStatus(intrinsicReflectApply(getRuntimeStatus as RuntimeFunction, provider, []));
    }
    catch {
        return null;
    }
}
function readProviderKind(provider: unknown): string {
    return statusString(readableProperty(provider, 'kind')) || 'unknown';
}
function createProviderStatus(providerKind: string, runtimeStatus: Readonly<TranslationProviderRuntimeStatus> | null, state: TranslationStatusStateCandidate, isCacheOnlyProvider: boolean): TranslationStatusProvider {
    const capacity = runtimeStatus?.capacity ?? intrinsicMathMax(0, statusNumber(state.providerCapacity));
    const running = intrinsicMathMax(0, statusNumber(state.activeCount));
    const dispatchLimit = intrinsicMathMax(0, statusNumber(state.providerCapacity));
    const unavailable = state['unavailable'] === true;
    const connection = isCacheOnlyProvider
        ? 'ready'
        : unavailable
            ? 'error'
            : runtimeStatus?.state === 'available'
                ? 'connected'
                : runtimeStatus?.state === 'unavailable'
                    ? 'error'
                    : 'pending';
    return intrinsicObjectFreeze({
        kind: providerKind,
        state: unavailable ? 'unavailable' : (runtimeStatus?.state ?? 'pending'),
        code: unavailable && runtimeStatus?.state === 'available'
            ? statusString(state['availabilityReason']).slice(0, 128)
            : (runtimeStatus?.code ?? 'initializing'),
        message: unavailable
            ? statusString(state['availabilityMessage']).slice(0, 1024) || (runtimeStatus?.message ?? '')
            : (runtimeStatus?.message ?? ''),
        observation: runtimeStatus?.observation ?? null,
        capacityVerified: !unavailable && runtimeStatus?.capacityVerified === true,
        dispatchLimit,
        queued: intrinsicMathMax(0, statusNumber(state.queued)),
        refreshing: state['refreshing'] === true,
        checkedAt: statusRevision(state['checkedAt']),
        lastSuccessAt: statusRevision(state['lastSuccessAt']),
        expiresAt: statusRevision(state['expiresAt']),
        priorityLane: state['priorityLane'] === true,
        connection,
        model: runtimeStatus?.model ?? '',
        capacity,
        running,
        available: intrinsicMathMax(0, dispatchLimit - running),
    });
}
function createActivityStatus(state: TranslationStatusStateCandidate): TranslationStatusActivity {
    return intrinsicObjectFreeze({
        pumpRunning: state.pumpRunning === true,
        pumpScheduled: state.pumpScheduled === true,
        queued: intrinsicMathMax(0, statusNumber(state.queued)),
        revision: statusRevision(state.revision),
        running: intrinsicMathMax(0, statusNumber(state.running)),
    });
}
export function createTranslationStatusModule(): TranslationStatusModule {
    let nextGeneration = 0;
    function createTranslationStatus(options: unknown = {}): TranslationStatusApi {
        const source = options as TranslationStatusOptionsCandidate;
        const globalScope = (source.globalScope && typeof source.globalScope === 'object' ? source.globalScope : {}) as TranslationStatusGlobalCandidate;
        const provider = source.provider ?? null;
        const getState = typeof source.getState === 'function' ? (source.getState as RuntimeFunction) : (): PropertyBag => ({});
        const getDiagnosticsState = typeof source.getDiagnosticsState === 'function'
            ? (source.getDiagnosticsState as RuntimeFunction)
            : (): PropertyBag => ({});
        const getActivityState = typeof source.getActivityState === 'function'
            ? (source.getActivityState as RuntimeFunction)
            : (): PropertyBag => ({});
        const observeDiagnostics = typeof source.observeDiagnostics === 'function' ? (source.observeDiagnostics as RuntimeFunction) : null;
        const isCacheOnlyProvider = source.isCacheOnlyProvider === true;
        let publication: DescriptorTransactionUpdate | null = null;
        let publicationRunning = false;
        const generation = ++nextGeneration;
        let sequence = 0;
        let active = true;
        const listeners = new Set<(snapshot: TranslationStatusSnapshot) => void>();
        let notifying = false;
        let notifyAgain = false;
        function getSnapshot(): TranslationStatusSnapshot {
            const stateValue = intrinsicReflectApply(getState, undefined, []);
            const state = (isPropertyBag(stateValue) ? stateValue : {}) as TranslationStatusStateCandidate;
            const providerKind = readProviderKind(provider);
            const runtimeStatus = readProviderRuntimeStatus(provider);
            const snapshot = intrinsicObjectFreeze({
                generation,
                sequence,
                active,
                updatedAt: intrinsicReflectApply(intrinsicDateNow, Date, []),
                provider: createProviderStatus(providerKind, runtimeStatus, state, isCacheOnlyProvider),
            });
            if (observeDiagnostics) {
                try {
                    intrinsicReflectApply(observeDiagnostics, undefined, [
                        () => ({
                            providerKind,
                            providerStatus: readProviderStatus(provider),
                            isCacheOnlyProvider,
                            runtime: intrinsicReflectApply(getDiagnosticsState, undefined, []),
                        }),
                    ]);
                }
                catch {
                }
            }
            return snapshot;
        }
        function getActivitySnapshot(recordIds: unknown = []): Readonly<TranslationStatusActivity> {
            const stateValue = intrinsicReflectApply(getActivityState, undefined, [recordIds]);
            const state = (isPropertyBag(stateValue) ? stateValue : {}) as TranslationStatusStateCandidate;
            return createActivityStatus(state);
        }
        function deliver(listener: (snapshot: TranslationStatusSnapshot) => void, snapshot: TranslationStatusSnapshot): void {
            try {
                intrinsicReflectApply(listener, undefined, [snapshot]);
            }
            catch {
            }
        }
        function publish(): void {
            if (!active && listeners.size === 0)
                return;
            if (listeners.size === 0) {
                sequence += 1;
                return;
            }
            if (notifying) {
                notifyAgain = true;
                return;
            }
            notifying = true;
            try {
                do {
                    notifyAgain = false;
                    sequence += 1;
                    const snapshot = getSnapshot();
                    for (const listener of Array.from(listeners)) {
                        if (listeners.has(listener))
                            deliver(listener, snapshot);
                    }
                } while (notifyAgain);
            }
            finally {
                notifying = false;
            }
        }
        function subscribe(listener: (snapshot: TranslationStatusSnapshot) => void): Readonly<{
            detach(): void;
        }> {
            if (typeof listener !== 'function')
                throw new TypeError('Status listener must be callable.');
            if (active && listeners.size >= 16 && !listeners.has(listener))
                throw new RangeError('Translation status observer limit reached.');
            if (active)
                listeners.add(listener);
            deliver(listener, getSnapshot());
            return intrinsicObjectFreeze({
                detach() {
                    listeners.delete(listener);
                },
            });
        }
        const claimPublisher = source.claimPublisher;
        if (typeof claimPublisher === 'function')
            intrinsicReflectApply(claimPublisher, undefined, [publish]);
        const api: TranslationStatusApi = intrinsicObjectFreeze({ subscribe, getActivitySnapshot, getSnapshot });
        function settlePublication(): boolean {
            const retained = publication;
            if (!retained)
                return true;
            const result = compensateDescriptorTransaction([retained]);
            if (!result.compensated)
                return false;
            publication = null;
            return true;
        }
        function activate(): void {
            if (publication || publicationRunning)
                return;
            publicationRunning = true;
            try {
                const update = createOwnDataDescriptorShadowUpdate(globalScope, 'LiveTranslatorTranslationStatus', api);
                if (!update) {
                    throw new Error('The host cannot admit an exact Translation Status publication.');
                }
                publication = update;
                const result = commitDescriptorTransaction([update]);
                if (!result.committed) {
                    if (result.rollbackComplete)
                        publication = null;
                    throw new Error('The host rejected the exact Translation Status publication.');
                }
            }
            finally {
                publicationRunning = false;
            }
        }
        function deactivate(): boolean {
            if (active) {
                active = false;
                publish();
                listeners.clear();
            }
            if (publicationRunning)
                return false;
            publicationRunning = true;
            try {
                return settlePublication();
            }
            finally {
                publicationRunning = false;
            }
        }
        const lifecycleOwner: TranslationStatusLifecycleOwner = intrinsicObjectFreeze({ activate, deactivate });
        const claimLifecycleOwner = source.claimLifecycleOwner;
        if (source.deferPublication === true && typeof claimLifecycleOwner === 'function') {
            intrinsicReflectApply(claimLifecycleOwner as RuntimeFunction, undefined, [lifecycleOwner]);
        }
        else {
            activate();
        }
        return api;
    }
    return { createTranslationStatus };
}
