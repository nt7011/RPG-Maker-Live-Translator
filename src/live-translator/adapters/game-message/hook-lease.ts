import { captureInheritedDataDescriptorResolution, commitDescriptorTransaction, createDescriptorUpdateFromExpected, createInheritedDataDescriptorShadowUpdate, descriptorTransactionMatches, getOwnDescriptor, type DescriptorTransactionFailure, type DescriptorTransactionUpdate, } from '../../runtime/descriptor-transaction.js';
import { createOwnedDescriptorLease } from '../../runtime/owned-descriptor-lease.js';
type RuntimeMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
export interface GameMessageHookMarker {
    readonly key: PropertyKey;
    readonly value: unknown;
}
export interface GameMessageHookLayerContext {
    readonly target: object;
    readonly key: PropertyKey;
    readonly layerIndex: number;
}
export interface GameMessageHookLayerRequest {
    readonly createWrapper: (this: unknown, next: RuntimeMethod, context: GameMessageHookLayerContext) => unknown;
    readonly markers?: readonly GameMessageHookMarker[];
}
export interface GameMessageHookMethodRequest {
    readonly target: object;
    readonly key: PropertyKey;
    readonly missingMethod?: RuntimeMethod;
    readonly layers: readonly GameMessageHookLayerRequest[];
}
export type GameMessageHookLeaseOperation = 'prepare' | 'publish' | 'activate' | 'deactivate' | 'commit' | 'rollback' | 'dispose';
export type GameMessageHookLeaseStatus = 'prepared' | 'published' | 'activated' | 'deactivated' | 'committed' | 'rolled-back' | 'disposed' | 'unchanged' | 'invalid' | 'failed' | 'in-progress' | 'retryable';
export type GameMessageHookLeaseFailurePhase = 'input' | 'capture' | 'compose' | 'metadata' | 'publish' | 'rollback' | 'dispose';
export interface GameMessageHookLeaseFailure {
    readonly phase: GameMessageHookLeaseFailurePhase;
    readonly reason: string;
    readonly target: object | null;
    readonly key: PropertyKey | null;
    readonly layerIndex: number | null;
    readonly error: unknown;
}
export interface GameMessageHookLayerOwnership {
    readonly wrapper: RuntimeMethod;
    readonly markers: readonly GameMessageHookMarker[];
}
export interface GameMessageHookWrapperOwnership {
    readonly target: object;
    readonly key: PropertyKey;
    readonly original: RuntimeMethod;
    readonly wrapper: RuntimeMethod;
    readonly layers: readonly GameMessageHookLayerOwnership[];
}
export interface GameMessageHookLeaseOutcome {
    readonly operation: Exclude<GameMessageHookLeaseOperation, 'prepare'>;
    readonly status: GameMessageHookLeaseStatus;
    readonly settled: boolean;
    readonly changed: boolean;
    readonly retryable: boolean;
    readonly reason: string;
    readonly failures: readonly GameMessageHookLeaseFailure[];
    readonly lease: GameMessageHookLease;
}
export interface GameMessageHookLeasePreparationOutcome {
    readonly operation: 'prepare';
    readonly status: 'prepared' | 'invalid' | 'failed';
    readonly settled: boolean;
    readonly changed: false;
    readonly retryable: boolean;
    readonly reason: string;
    readonly failures: readonly GameMessageHookLeaseFailure[];
    readonly lease: GameMessageHookLease | null;
}
export interface GameMessageHookLease {
    readonly wrappers: readonly GameMessageHookWrapperOwnership[];
    readonly publish: () => GameMessageHookLeaseOutcome;
    readonly activate: () => GameMessageHookLeaseOutcome;
    readonly deactivate: () => GameMessageHookLeaseOutcome;
    readonly commit: () => GameMessageHookLeaseOutcome;
    readonly rollback: () => GameMessageHookLeaseOutcome;
    readonly dispose: () => GameMessageHookLeaseOutcome;
    readonly ownsWrapper: (ownership: unknown) => ownership is GameMessageHookWrapperOwnership;
    readonly isWrapperPublished: (ownership: unknown) => boolean;
}
interface HookGate {
    active: boolean;
}
interface HookEntry {
    readonly gate: HookGate;
    readonly ownership: GameMessageHookWrapperOwnership;
    readonly update: DescriptorTransactionUpdate;
}
interface CapturedMethod {
    readonly original: RuntimeMethod;
    readonly updateFor: (wrapper: RuntimeMethod) => DescriptorTransactionUpdate | null;
}
class HookPreparationError extends Error {
    readonly status: 'invalid' | 'failed';
    readonly phase: GameMessageHookLeaseFailurePhase;
    readonly reason: string;
    readonly target: object | null;
    readonly key: PropertyKey | null;
    readonly layerIndex: number | null;
    readonly retryable: boolean;
    readonly causeValue: unknown;
    constructor(phase: GameMessageHookLeaseFailurePhase, reason: string, options: {
        readonly status?: 'invalid' | 'failed';
        readonly target?: object | null;
        readonly key?: PropertyKey | null;
        readonly layerIndex?: number | null;
        readonly retryable?: boolean;
        readonly error?: unknown;
    } = {}) {
        super(`GameMessage hook preparation failed: ${reason}.`);
        this.status = options.status ?? (phase === 'input' ? 'invalid' : 'failed');
        this.phase = phase;
        this.reason = reason;
        this.target = options.target ?? null;
        this.key = options.key ?? null;
        this.layerIndex = options.layerIndex ?? null;
        this.retryable = options.retryable === true;
        this.causeValue = options.error ?? this;
    }
}
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isPropertyKey(value: unknown): value is PropertyKey {
    return typeof value === 'string' || typeof value === 'symbol';
}
function propertyValue(source: object, key: PropertyKey): unknown {
    return Reflect.get(source, key) as unknown;
}
function freezeArray<Value>(values: readonly Value[]): readonly Value[] {
    return Object.freeze(values.slice());
}
function failure(phase: GameMessageHookLeaseFailurePhase, reason: string, options: {
    readonly target?: object | null;
    readonly key?: PropertyKey | null;
    readonly layerIndex?: number | null;
    readonly error?: unknown;
} = {}): GameMessageHookLeaseFailure {
    return Object.freeze({
        phase,
        reason,
        target: options.target ?? null,
        key: options.key ?? null,
        layerIndex: options.layerIndex ?? null,
        error: options.error ?? null,
    });
}
function preparationFailure(error: HookPreparationError): GameMessageHookLeasePreparationOutcome {
    return Object.freeze({
        operation: 'prepare',
        status: error.status,
        settled: true,
        changed: false,
        retryable: error.retryable,
        reason: error.reason,
        failures: freezeArray([
            failure(error.phase, error.reason, {
                target: error.target,
                key: error.key,
                layerIndex: error.layerIndex,
                error: error.causeValue,
            }),
        ]),
        lease: null,
    });
}
function captureRequests(value: unknown): readonly GameMessageHookMethodRequest[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new HookPreparationError('input', 'invalid-method-plan-list');
    }
    const requests: GameMessageHookMethodRequest[] = [];
    for (const candidate of value as unknown[]) {
        if (!isObjectReference(candidate))
            throw new HookPreparationError('input', 'invalid-method-plan');
        const target = propertyValue(candidate, 'target');
        const key = propertyValue(candidate, 'key');
        const layers = propertyValue(candidate, 'layers');
        const missingMethod = propertyValue(candidate, 'missingMethod');
        if (!isObjectReference(target) || !isPropertyKey(key)) {
            throw new HookPreparationError('input', 'invalid-method-target');
        }
        if (!Array.isArray(layers) || layers.length === 0) {
            throw new HookPreparationError('input', 'invalid-layer-list', { target, key });
        }
        if (missingMethod !== undefined && typeof missingMethod !== 'function') {
            throw new HookPreparationError('input', 'non-callable-missing-method', { target, key });
        }
        if (requests.some((request) => request.target === target && request.key === key)) {
            throw new HookPreparationError('input', 'duplicate-method-plan', { target, key });
        }
        const capturedLayers: GameMessageHookLayerRequest[] = [];
        for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
            const layer = layers[layerIndex] as unknown;
            if (!isObjectReference(layer)) {
                throw new HookPreparationError('input', 'invalid-layer', { target, key, layerIndex });
            }
            const createWrapper = propertyValue(layer, 'createWrapper');
            const markerValue = propertyValue(layer, 'markers');
            if (typeof createWrapper !== 'function') {
                throw new HookPreparationError('input', 'non-callable-wrapper-factory', {
                    target,
                    key,
                    layerIndex,
                });
            }
            if (markerValue !== undefined && !Array.isArray(markerValue)) {
                throw new HookPreparationError('input', 'invalid-marker-list', { target, key, layerIndex });
            }
            const markers: GameMessageHookMarker[] = [];
            for (const markerValueEntry of markerValue ?? []) {
                if (!isObjectReference(markerValueEntry)) {
                    throw new HookPreparationError('input', 'invalid-marker', { target, key, layerIndex });
                }
                const markerKey = propertyValue(markerValueEntry, 'key');
                if (!isPropertyKey(markerKey) || markerKey === '__trOriginal') {
                    throw new HookPreparationError('input', 'invalid-marker-key', { target, key, layerIndex });
                }
                if (markers.some((marker) => marker.key === markerKey)) {
                    throw new HookPreparationError('input', 'duplicate-marker-key', { target, key, layerIndex });
                }
                markers.push(Object.freeze({ key: markerKey, value: propertyValue(markerValueEntry, 'value') }));
            }
            capturedLayers.push(Object.freeze({
                createWrapper: createWrapper as GameMessageHookLayerRequest['createWrapper'],
                markers: freezeArray(markers),
            }));
        }
        requests.push(Object.freeze({
            target,
            key,
            ...(missingMethod === undefined ? {} : { missingMethod: missingMethod as RuntimeMethod }),
            layers: freezeArray(capturedLayers),
        }));
    }
    return freezeArray(requests);
}
function findInheritedDescriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined {
    const seen = new Set<object>();
    let cursor = Object.getPrototypeOf(target) as object | null;
    while (cursor) {
        if (seen.has(cursor)) {
            throw new HookPreparationError('capture', 'cyclic-prototype-chain', {
                status: 'invalid',
                target,
                key,
            });
        }
        seen.add(cursor);
        const descriptor = getOwnDescriptor(cursor, key);
        if (descriptor)
            return descriptor;
        cursor = Object.getPrototypeOf(cursor) as object | null;
    }
    return undefined;
}
function captureMethod(request: GameMessageHookMethodRequest): CapturedMethod {
    const { target, key, missingMethod } = request;
    let ownDescriptor: PropertyDescriptor | undefined;
    try {
        ownDescriptor = getOwnDescriptor(target, key);
    }
    catch (error) {
        throw new HookPreparationError('capture', 'own-descriptor-read-failed', {
            target,
            key,
            retryable: true,
            error,
        });
    }
    if (ownDescriptor) {
        if (!('value' in ownDescriptor)) {
            throw new HookPreparationError('capture', 'accessor-method-rejected', {
                status: 'invalid',
                target,
                key,
            });
        }
        if (typeof ownDescriptor.value !== 'function') {
            throw new HookPreparationError('capture', 'non-callable-method-rejected', {
                status: 'invalid',
                target,
                key,
            });
        }
        if (ownDescriptor.configurable !== true && ownDescriptor.writable !== true) {
            throw new HookPreparationError('capture', 'immutable-method-rejected', {
                status: 'invalid',
                target,
                key,
            });
        }
        return {
            original: ownDescriptor.value as RuntimeMethod,
            updateFor(wrapper) {
                return createDescriptorUpdateFromExpected(target, key, ownDescriptor, {
                    configurable: ownDescriptor.configurable === true,
                    enumerable: ownDescriptor.enumerable === true,
                    writable: ownDescriptor.writable === true,
                    value: wrapper,
                });
            },
        };
    }
    let inherited: ReturnType<typeof captureInheritedDataDescriptorResolution>;
    try {
        inherited = captureInheritedDataDescriptorResolution(target, key);
    }
    catch (error) {
        throw new HookPreparationError('capture', 'inherited-descriptor-read-failed', {
            target,
            key,
            retryable: true,
            error,
        });
    }
    if (inherited) {
        if (typeof inherited.value !== 'function') {
            throw new HookPreparationError('capture', 'non-callable-method-rejected', {
                status: 'invalid',
                target,
                key,
            });
        }
        return {
            original: inherited.value as RuntimeMethod,
            updateFor(wrapper) {
                return createInheritedDataDescriptorShadowUpdate(inherited, wrapper);
            },
        };
    }
    let inheritedDescriptor: PropertyDescriptor | undefined;
    try {
        inheritedDescriptor = findInheritedDescriptor(target, key);
    }
    catch (error) {
        if (error instanceof HookPreparationError)
            throw error;
        throw new HookPreparationError('capture', 'inherited-descriptor-read-failed', {
            target,
            key,
            retryable: true,
            error,
        });
    }
    if (inheritedDescriptor) {
        if (!('value' in inheritedDescriptor)) {
            throw new HookPreparationError('capture', 'accessor-method-rejected', {
                status: 'invalid',
                target,
                key,
            });
        }
        if (typeof inheritedDescriptor.value !== 'function') {
            throw new HookPreparationError('capture', 'non-callable-method-rejected', {
                status: 'invalid',
                target,
                key,
            });
        }
        if (!Object.isExtensible(target)) {
            throw new HookPreparationError('capture', 'non-extensible-inherited-shadow-rejected', {
                status: 'invalid',
                target,
                key,
            });
        }
        throw new HookPreparationError('capture', 'inherited-resolution-unavailable', {
            target,
            key,
            retryable: true,
        });
    }
    if (typeof missingMethod !== 'function') {
        throw new HookPreparationError('capture', 'missing-method-rejected', {
            status: 'invalid',
            target,
            key,
        });
    }
    if (!Object.isExtensible(target)) {
        throw new HookPreparationError('capture', 'non-extensible-missing-method-rejected', {
            status: 'invalid',
            target,
            key,
        });
    }
    return {
        original: missingMethod,
        updateFor(wrapper) {
            return createDescriptorUpdateFromExpected(target, key, undefined, {
                configurable: true,
                enumerable: false,
                writable: true,
                value: wrapper,
            });
        },
    };
}
function defineMetadata(target: RuntimeMethod, key: PropertyKey, value: unknown): void {
    Object.defineProperty(target, key, {
        configurable: false,
        enumerable: false,
        writable: false,
        value,
    });
}
function composeMethod(request: GameMessageHookMethodRequest, original: RuntimeMethod): {
    readonly gate: HookGate;
    readonly layers: readonly GameMessageHookLayerOwnership[];
    readonly wrapper: RuntimeMethod;
} {
    let next = original;
    const layerOwnerships: GameMessageHookLayerOwnership[] = [];
    for (let layerIndex = 0; layerIndex < request.layers.length; layerIndex += 1) {
        const layer = request.layers[layerIndex];
        if (!layer)
            continue;
        const context = Object.freeze({ target: request.target, key: request.key, layerIndex });
        let implementation: unknown;
        try {
            implementation = Reflect.apply(layer.createWrapper, layer, [next, context]);
        }
        catch (error) {
            throw new HookPreparationError('compose', 'wrapper-factory-threw', {
                target: request.target,
                key: request.key,
                layerIndex,
                error,
            });
        }
        if (typeof implementation !== 'function') {
            throw new HookPreparationError('compose', 'wrapper-factory-returned-non-callable', {
                status: 'invalid',
                target: request.target,
                key: request.key,
                layerIndex,
            });
        }
        const layerMethod = implementation as RuntimeMethod;
        const previous = next;
        const metadataShell: RuntimeMethod = function gameMessageHookLayer(this: unknown, ...arguments_: unknown[]): unknown {
            return Reflect.apply(layerMethod, this, arguments_);
        };
        try {
            defineMetadata(metadataShell, '__trOriginal', previous);
            for (const marker of layer.markers ?? [])
                defineMetadata(metadataShell, marker.key, marker.value);
        }
        catch (error) {
            throw new HookPreparationError('metadata', 'wrapper-metadata-publication-failed', {
                target: request.target,
                key: request.key,
                layerIndex,
                error,
            });
        }
        const markers = freezeArray((layer.markers ?? []).map((marker) => Object.freeze({ ...marker })));
        layerOwnerships.push(Object.freeze({ wrapper: metadataShell, markers }));
        next = metadataShell;
    }
    const activeMethod = next;
    const gate: HookGate = { active: false };
    const wrapper: RuntimeMethod = function gameMessageHookGate(this: unknown, ...arguments_: unknown[]): unknown {
        return Reflect.apply(gate.active ? activeMethod : original, this, arguments_);
    };
    try {
        defineMetadata(wrapper, '__trOriginal', activeMethod);
    }
    catch (error) {
        throw new HookPreparationError('metadata', 'gate-metadata-publication-failed', {
            target: request.target,
            key: request.key,
            error,
        });
    }
    return { gate, layers: freezeArray(layerOwnerships), wrapper };
}
function prototypeChainContains(target: object, ancestor: object): boolean {
    const seen = new Set<object>();
    let cursor = Object.getPrototypeOf(target) as object | null;
    while (cursor) {
        if (cursor === ancestor)
            return true;
        if (seen.has(cursor))
            return false;
        seen.add(cursor);
        cursor = Object.getPrototypeOf(cursor) as object | null;
    }
    return false;
}
function orderEntries(entries: readonly HookEntry[]): HookEntry[] {
    const outgoing = entries.map((): number[] => []);
    const incoming = entries.map(() => 0);
    for (let descendantIndex = 0; descendantIndex < entries.length; descendantIndex += 1) {
        const descendant = entries[descendantIndex];
        if (!descendant)
            continue;
        for (let ancestorIndex = 0; ancestorIndex < entries.length; ancestorIndex += 1) {
            if (descendantIndex === ancestorIndex)
                continue;
            const ancestor = entries[ancestorIndex];
            if (descendant.ownership.key !== ancestor?.ownership.key)
                continue;
            if (!prototypeChainContains(descendant.ownership.target, ancestor.ownership.target))
                continue;
            outgoing[descendantIndex]?.push(ancestorIndex);
            incoming[ancestorIndex] = (incoming[ancestorIndex] ?? 0) + 1;
        }
    }
    const emitted = entries.map(() => false);
    const ordered: HookEntry[] = [];
    while (ordered.length < entries.length) {
        let selectedIndex = -1;
        for (let index = 0; index < entries.length; index += 1) {
            if (emitted[index] !== true && incoming[index] === 0) {
                selectedIndex = index;
                break;
            }
        }
        if (selectedIndex < 0) {
            throw new HookPreparationError('capture', 'cyclic-method-publication-order', {
                retryable: true,
            });
        }
        emitted[selectedIndex] = true;
        const selected = entries[selectedIndex];
        if (selected)
            ordered.push(selected);
        for (const dependentIndex of outgoing[selectedIndex] ?? []) {
            incoming[dependentIndex] = (incoming[dependentIndex] ?? 0) - 1;
        }
    }
    return ordered;
}
function descriptorFailures(phase: 'publish' | 'rollback' | 'dispose', values: readonly DescriptorTransactionFailure[]): readonly GameMessageHookLeaseFailure[] {
    return freezeArray(values.map((value) => failure(phase, `descriptor-${value.phase}-${value.operation}`, {
        key: value.key,
        error: value.error,
    })));
}
export function prepareGameMessageHookLease(requests: unknown): GameMessageHookLeasePreparationOutcome {
    let capturedRequests: readonly GameMessageHookMethodRequest[];
    try {
        capturedRequests = captureRequests(requests);
    }
    catch (error) {
        return preparationFailure(error instanceof HookPreparationError
            ? error
            : new HookPreparationError('input', 'method-plan-capture-failed', { error }));
    }
    const entries: HookEntry[] = [];
    try {
        for (const request of capturedRequests) {
            const captured = captureMethod(request);
            const composed = composeMethod(request, captured.original);
            const update = captured.updateFor(composed.wrapper);
            if (!update) {
                throw new HookPreparationError('capture', 'descriptor-update-rejected', {
                    status: 'invalid',
                    target: request.target,
                    key: request.key,
                });
            }
            const ownership = Object.freeze({
                target: request.target,
                key: request.key,
                original: captured.original,
                wrapper: composed.wrapper,
                layers: composed.layers,
            });
            entries.push({ gate: composed.gate, ownership, update });
        }
    }
    catch (error) {
        return preparationFailure(error instanceof HookPreparationError
            ? error
            : new HookPreparationError('compose', 'method-plan-composition-failed', { error }));
    }
    let orderedEntries: HookEntry[];
    try {
        orderedEntries = orderEntries(entries);
    }
    catch (error) {
        return preparationFailure(error instanceof HookPreparationError
            ? error
            : new HookPreparationError('capture', 'method-publication-order-failed', {
                retryable: true,
                error,
            }));
    }
    const updates = freezeArray(orderedEntries.map((entry) => entry.update));
    if (!descriptorTransactionMatches(updates, 'expected')) {
        return preparationFailure(new HookPreparationError('capture', 'prepared-descriptor-set-drifted', { retryable: true }));
    }
    const releaseDescriptors = createOwnedDescriptorLease(updates.slice().reverse());
    const wrappers = freezeArray(entries.map((entry) => entry.ownership));
    let phase: 'prepared' | 'publishing' | 'published' | 'active' | 'releasing' | 'recovery' | 'released' = 'prepared';
    let releasedAs: 'rolled-back' | 'disposed' = 'rolled-back';
    function setGates(active: boolean): void {
        for (const entry of entries)
            entry.gate.active = active;
    }
    function outcome(operation: GameMessageHookLeaseOutcome['operation'], status: GameMessageHookLeaseStatus, reason: string, options: {
        readonly settled?: boolean;
        readonly changed?: boolean;
        readonly retryable?: boolean;
        readonly failures?: readonly GameMessageHookLeaseFailure[];
    } = {}): GameMessageHookLeaseOutcome {
        return Object.freeze({
            operation,
            status,
            settled: options.settled !== false,
            changed: options.changed === true,
            retryable: options.retryable === true,
            reason,
            failures: freezeArray(options.failures ?? []),
            lease,
        });
    }
    function settlePublicationFailure(operation: 'publish' | 'commit', failures: readonly GameMessageHookLeaseFailure[]): GameMessageHookLeaseOutcome {
        setGates(false);
        let settled = false;
        try {
            settled = releaseDescriptors();
        }
        catch (error) {
            failures = freezeArray([...failures, failure('rollback', 'descriptor-release-threw', { error })]);
        }
        if (settled) {
            phase = 'released';
            releasedAs = 'rolled-back';
            return outcome(operation, 'rolled-back', 'publication-failed-and-released', {
                changed: true,
                failures,
            });
        }
        phase = 'recovery';
        return outcome(operation, 'retryable', 'publication-release-pending', {
            settled: false,
            changed: true,
            retryable: true,
            failures,
        });
    }
    function publishFor(operation: 'publish' | 'commit'): GameMessageHookLeaseOutcome {
        if (phase === 'publishing' || phase === 'releasing') {
            return outcome(operation, 'in-progress', 'lease-transition-in-progress', {
                settled: false,
                retryable: true,
            });
        }
        if (phase === 'published')
            return outcome(operation, 'unchanged', 'lease-already-published');
        if (phase === 'active')
            return outcome(operation, 'unchanged', 'lease-already-active');
        if (phase === 'recovery') {
            return outcome(operation, 'retryable', 'lease-release-pending', {
                settled: false,
                retryable: true,
            });
        }
        if (phase === 'released')
            return outcome(operation, 'unchanged', 'lease-already-released');
        let result: ReturnType<typeof commitDescriptorTransaction>;
        phase = 'publishing';
        try {
            result = commitDescriptorTransaction(updates);
        }
        catch (error) {
            return settlePublicationFailure(operation, [failure('publish', 'descriptor-publication-threw', { error })]);
        }
        if (result.committed && descriptorTransactionMatches(updates, 'prepared')) {
            phase = 'published';
            return outcome(operation, 'published', 'descriptor-set-published-inert', {
                changed: true,
                failures: descriptorFailures('publish', result.failures),
            });
        }
        return settlePublicationFailure(operation, descriptorFailures('publish', result.failures));
    }
    function publish(): GameMessageHookLeaseOutcome {
        return publishFor('publish');
    }
    function activateFor(operation: 'activate' | 'commit'): GameMessageHookLeaseOutcome {
        if (phase === 'active')
            return outcome(operation, 'unchanged', 'lease-already-active');
        if (phase !== 'published') {
            return outcome(operation, phase === 'recovery' ? 'retryable' : 'unchanged', 'lease-not-published', {
                settled: phase !== 'recovery',
                retryable: phase === 'recovery',
            });
        }
        setGates(true);
        phase = 'active';
        return outcome(operation, operation === 'commit' ? 'committed' : 'activated', 'descriptor-set-activated', {
            changed: true,
        });
    }
    function activate(): GameMessageHookLeaseOutcome {
        return activateFor('activate');
    }
    function deactivate(): GameMessageHookLeaseOutcome {
        if (phase !== 'active')
            return outcome('deactivate', 'unchanged', 'lease-not-active');
        setGates(false);
        phase = 'published';
        return outcome('deactivate', 'deactivated', 'descriptor-set-deactivated', { changed: true });
    }
    function commit(): GameMessageHookLeaseOutcome {
        const publication = publishFor('commit');
        return phase === 'published' ? activateFor('commit') : publication;
    }
    function cleanup(operation: 'rollback' | 'dispose'): GameMessageHookLeaseOutcome {
        if (phase === 'publishing' || phase === 'releasing') {
            return outcome(operation, 'in-progress', 'lease-transition-in-progress', {
                settled: false,
                retryable: true,
            });
        }
        if (phase === 'released') {
            return outcome(operation, 'unchanged', `lease-already-${releasedAs}`);
        }
        setGates(false);
        if (phase === 'prepared') {
            phase = 'released';
            releasedAs = operation === 'dispose' ? 'disposed' : 'rolled-back';
            return outcome(operation, releasedAs, 'unpublished-lease-released');
        }
        const changed = updates.some((update) => descriptorTransactionMatches([update], 'prepared'));
        phase = 'releasing';
        try {
            if (!releaseDescriptors()) {
                phase = 'recovery';
                return outcome(operation, 'retryable', 'descriptor-release-pending', {
                    settled: false,
                    changed: true,
                    retryable: true,
                });
            }
        }
        catch (error) {
            phase = 'recovery';
            return outcome(operation, 'retryable', 'descriptor-release-threw', {
                settled: false,
                changed: true,
                retryable: true,
                failures: [failure(operation, 'descriptor-release-threw', { error })],
            });
        }
        phase = 'released';
        releasedAs = operation === 'dispose' ? 'disposed' : 'rolled-back';
        return outcome(operation, releasedAs, 'owned-descriptors-released', { changed });
    }
    function ownsWrapper(ownership: unknown): ownership is GameMessageHookWrapperOwnership {
        return entries.some((entry) => entry.ownership === ownership);
    }
    function isWrapperPublished(ownership: unknown): boolean {
        const entry = entries.find((candidate) => candidate.ownership === ownership);
        return !!entry && descriptorTransactionMatches([entry.update], 'prepared');
    }
    const lease: GameMessageHookLease = Object.freeze({
        wrappers,
        publish,
        activate,
        deactivate,
        commit,
        rollback: () => cleanup('rollback'),
        dispose: () => cleanup('dispose'),
        ownsWrapper,
        isWrapperPublished,
    });
    return Object.freeze({
        operation: 'prepare',
        status: 'prepared',
        settled: true,
        changed: false,
        retryable: false,
        reason: 'descriptor-set-prepared',
        failures: freezeArray([]),
        lease,
    });
}
