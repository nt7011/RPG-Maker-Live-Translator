type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
type HookMarkerProbe = (candidate: unknown, property: PropertyKey, token: unknown) => unknown;
export type OwnedMethodWrapperState = 'prepared' | 'active' | 'committed' | 'quarantined';
export type OwnedMethodWrapperChainDisposition = 'clear' | 'owned' | 'quarantined' | 'blocked';
export interface OwnedMethodWrapperBinding {
    readonly key: PropertyKey;
    readonly marker: PropertyKey;
    readonly target: object;
    readonly token: unknown;
}
export interface OwnedMethodWrapperAuthority extends OwnedMethodWrapperBinding {
    readonly owner: object;
    readonly wrapper: RuntimeFunction;
    state: OwnedMethodWrapperState;
}
interface OwnedMethodWrapperRegistration extends OwnedMethodWrapperAuthority {
    readonly original: RuntimeFunction;
}
interface WrapperChainVisitResult {
    readonly complete: boolean;
    readonly stopped: boolean;
}
type MethodWrapperPreparation = {
    readonly kind: 'already-installed';
} | {
    readonly kind: 'prepared';
    readonly current: RuntimeFunction;
    readonly methodKey: PropertyKey;
    readonly target: PropertyBag;
    readonly wrapped: RuntimeFunction;
};
export interface HookWrapperModule {
    hasHookInChain(candidate: unknown, property: PropertyKey, token: unknown): boolean;
    acquireMethodWrapper(target: unknown, methodName: unknown, options?: unknown): MethodWrapperLease | null;
    installMethodWrapper(target: unknown, methodName: unknown, options?: unknown): boolean;
    markWrappedFunction(wrapped: unknown, original: unknown, property: PropertyKey, token: unknown): unknown;
}
export interface MethodWrapperLease {
    readonly dispose: (this: MethodWrapperLease) => boolean;
}
const ownedMethodWrapperAuthorities = new WeakMap<RuntimeFunction, OwnedMethodWrapperAuthority>();
const ownedMethodWrapperOriginals = new WeakMap<OwnedMethodWrapperAuthority, RuntimeFunction>();
const getOwnDescriptor = Object.getOwnPropertyDescriptor;
const MAX_OWNED_WRAPPER_CHAIN_DEPTH = 64;
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRuntimeFunction(value: unknown): value is RuntimeFunction {
    return typeof value === 'function';
}
function ownedMethodWrapperStateIsAdmitted(states: readonly OwnedMethodWrapperState[], state: OwnedMethodWrapperState): boolean {
    for (const candidate of states)
        if (candidate === state)
            return true;
    return false;
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function stringValue(value: unknown): string {
    const converted: unknown = Reflect.apply(String, undefined, [value]);
    if (typeof converted !== 'string')
        throw new TypeError('String conversion did not return text.');
    return converted;
}
function firstTruthy(...values: unknown[]): unknown {
    for (const value of values) {
        if (value)
            return value;
    }
    return undefined;
}
function visitWrapperChain(candidate: unknown, visit: (wrapper: RuntimeFunction) => boolean): WrapperChainVisitResult {
    const seen = new Set<RuntimeFunction>();
    let current: RuntimeFunction | null = isRuntimeFunction(candidate) ? candidate : null;
    let depth = 0;
    while (current && depth < MAX_OWNED_WRAPPER_CHAIN_DEPTH) {
        if (seen.has(current))
            return { complete: false, stopped: false };
        seen.add(current);
        if (!visit(current))
            return { complete: false, stopped: true };
        const original = getOwnDescriptor(current, '__trOriginal');
        current = original && 'value' in original && isRuntimeFunction(original.value) ? original.value : null;
        depth += 1;
    }
    return { complete: current === null, stopped: false };
}
function authorityMatchesBinding(authority: OwnedMethodWrapperAuthority | null, wrapper: RuntimeFunction, binding: OwnedMethodWrapperBinding): authority is OwnedMethodWrapperAuthority {
    return (authority?.wrapper === wrapper &&
        authority.target === binding.target &&
        authority.key === binding.key &&
        authority.marker === binding.marker &&
        authority.token === binding.token);
}
function hasOwnWrapperMarker(wrapper: RuntimeFunction, binding: OwnedMethodWrapperBinding): boolean {
    const marker = getOwnDescriptor(wrapper, binding.marker);
    return !!marker && 'value' in marker && marker.value === binding.token;
}
export function registerOwnedMethodWrapper({ key, marker, original, owner, state, target, token, wrapper, }: OwnedMethodWrapperRegistration): OwnedMethodWrapperAuthority {
    const marked = wrapper as RuntimeFunction & PropertyBag;
    marked[marker] = token;
    marked['__trOriginal'] = original;
    const authority: OwnedMethodWrapperAuthority = {
        key,
        marker,
        owner,
        state,
        target,
        token,
        wrapper,
    };
    ownedMethodWrapperAuthorities.set(wrapper, authority);
    ownedMethodWrapperOriginals.set(authority, original);
    return authority;
}
export function getOwnedMethodWrapperAuthority(value: unknown): OwnedMethodWrapperAuthority | null {
    if (!isRuntimeFunction(value))
        return null;
    const authority = ownedMethodWrapperAuthorities.get(value);
    return authority?.wrapper === value ? authority : null;
}
function resolveOwnedMethodWrapperChainTerminal(value: unknown, target: object, key: PropertyKey, states: readonly OwnedMethodWrapperState[]): RuntimeFunction | null {
    if (!isRuntimeFunction(value) || states.length === 0)
        return null;
    const seen = new Set<RuntimeFunction>();
    let current = value;
    let depth = 0;
    while (depth < MAX_OWNED_WRAPPER_CHAIN_DEPTH) {
        if (seen.has(current))
            return null;
        seen.add(current);
        const authority = ownedMethodWrapperAuthorities.get(current);
        if (!authority)
            return current;
        if (authority.wrapper !== current ||
            authority.target !== target ||
            authority.key !== key ||
            !ownedMethodWrapperStateIsAdmitted(states, authority.state)) {
            return null;
        }
        const original = ownedMethodWrapperOriginals.get(authority);
        if (!original)
            return null;
        current = original;
        depth += 1;
    }
    return null;
}
export function ownedMethodWrapperChainResolvesTo(value: unknown, terminal: unknown, target: object, key: PropertyKey, states: readonly OwnedMethodWrapperState[]): boolean {
    if (!isRuntimeFunction(value) || !isRuntimeFunction(terminal))
        return false;
    return value === terminal || resolveOwnedMethodWrapperChainTerminal(value, target, key, states) === terminal;
}
export function unregisterOwnedMethodWrapper(authority: OwnedMethodWrapperAuthority): boolean {
    if (getOwnedMethodWrapperAuthority(authority.wrapper) !== authority)
        return false;
    ownedMethodWrapperOriginals.delete(authority);
    return ownedMethodWrapperAuthorities.delete(authority.wrapper);
}
export function findOwnedMethodWrapper(value: unknown, binding: OwnedMethodWrapperBinding, owner: object, states: readonly OwnedMethodWrapperState[]): RuntimeFunction | null {
    let found: RuntimeFunction | null = null;
    visitWrapperChain(value, (wrapper) => {
        const authority = getOwnedMethodWrapperAuthority(wrapper);
        if (authorityMatchesBinding(authority, wrapper, binding) &&
            authority.owner === owner &&
            states.includes(authority.state)) {
            found = wrapper;
            return false;
        }
        return true;
    });
    return found;
}
export function hasOnlyQuarantinedOwnedMethodMarkers(value: unknown, binding: OwnedMethodWrapperBinding): boolean {
    const observation = { found: false };
    const chain = visitWrapperChain(value, (wrapper) => {
        if (!hasOwnWrapperMarker(wrapper, binding))
            return true;
        const authority = getOwnedMethodWrapperAuthority(wrapper);
        if (!authorityMatchesBinding(authority, wrapper, binding) || authority.state !== 'quarantined') {
            return false;
        }
        observation.found = true;
        return true;
    });
    return !chain.stopped && chain.complete && observation.found;
}
export function classifyOwnedMethodWrapperChain(value: unknown, binding: OwnedMethodWrapperBinding, owner: object, publicMarkerProbe: HookMarkerProbe = hasHookInChain): OwnedMethodWrapperChainDisposition {
    const publicMarkerObserved = Boolean(Reflect.apply(publicMarkerProbe, undefined, [value, binding.marker, binding.token]));
    const observation = {
        foundOwned: false,
        foundPrivateMarker: false,
        foundQuarantined: false,
    };
    const chain = visitWrapperChain(value, (wrapper) => {
        const authority = getOwnedMethodWrapperAuthority(wrapper);
        if (hasOwnWrapperMarker(wrapper, binding)) {
            observation.foundPrivateMarker = true;
            if (!authorityMatchesBinding(authority, wrapper, binding)) {
                return false;
            }
            if (authority.state === 'quarantined')
                observation.foundQuarantined = true;
            else if (authority.owner === owner)
                observation.foundOwned = true;
            else
                return false;
        }
        else if (authorityMatchesBinding(authority, wrapper, binding) && authority.state !== 'quarantined') {
            if (authority.owner === owner)
                observation.foundOwned = true;
            else
                return false;
        }
        return true;
    });
    if (chain.stopped || !chain.complete)
        return 'blocked';
    if (publicMarkerObserved && !observation.foundPrivateMarker)
        return 'blocked';
    if (observation.foundOwned)
        return 'owned';
    if (observation.foundQuarantined)
        return 'quarantined';
    return observation.foundPrivateMarker || publicMarkerObserved ? 'blocked' : 'clear';
}
export function ownedMethodWrapperChainContains(value: unknown, expected: RuntimeFunction): boolean {
    let found = false;
    visitWrapperChain(value, (wrapper) => {
        if (wrapper !== expected)
            return true;
        found = true;
        return false;
    });
    return found;
}
export function hasHookInChain(candidate: unknown, property: PropertyKey, token: unknown): boolean {
    const seen = new Set<RuntimeFunction>();
    let current: RuntimeFunction | null = isRuntimeFunction(candidate) ? candidate : null;
    while (current && !seen.has(current)) {
        if (propertyValue(current, property) === token)
            return true;
        seen.add(current);
        const original = propertyValue(current, '__trOriginal');
        current = isRuntimeFunction(original) ? original : null;
    }
    return false;
}
export function markWrappedFunction(wrapped: unknown, original: unknown, property: PropertyKey, token: unknown): unknown {
    if (typeof wrapped !== 'function' || !isPropertyBag(wrapped))
        return wrapped;
    try {
        wrapped['__trOriginal'] = original;
    }
    catch {
    }
    if (property) {
        try {
            wrapped[property] = token;
        }
        catch {
        }
    }
    return wrapped;
}
function prepareMethodWrapper(target: unknown, methodName: unknown, options: unknown): MethodWrapperPreparation | null {
    if (!isPropertyBag(target) || !methodName)
        return null;
    const methodKey = typeof methodName === 'symbol' ? methodName : stringValue(methodName);
    const current = target[methodKey];
    if (!isRuntimeFunction(current))
        return null;
    const normalizedOptions = isPropertyBag(options) ? options : {};
    const property = stringValue(firstTruthy(normalizedOptions['property'], normalizedOptions['marker'], ''));
    const token = Object.prototype.hasOwnProperty.call(normalizedOptions, 'token') ? normalizedOptions['token'] : true;
    if (property && hasHookInChain(current, property, token))
        return { kind: 'already-installed' };
    const createWrapper = normalizedOptions['createWrapper'];
    if (!isRuntimeFunction(createWrapper))
        return null;
    const wrapped: unknown = Reflect.apply(createWrapper, normalizedOptions, [
        current,
        {
            target,
            methodName,
            property,
            token,
        },
    ]);
    if (typeof wrapped !== 'function')
        return null;
    const marked = markWrappedFunction(wrapped, current, property, token);
    if (!isRuntimeFunction(marked))
        return null;
    return { kind: 'prepared', current, methodKey, target, wrapped: marked };
}
export function installMethodWrapper(target: unknown, methodName: unknown, options: unknown = {}): boolean {
    const prepared = prepareMethodWrapper(target, methodName, options);
    if (!prepared)
        return false;
    if (prepared.kind === 'already-installed')
        return true;
    prepared.target[prepared.methodKey] = prepared.wrapped;
    return true;
}
export function acquireMethodWrapper(target: unknown, methodName: unknown, options: unknown = {}): MethodWrapperLease | null {
    const prepared = prepareMethodWrapper(target, methodName, options);
    if (prepared?.kind !== 'prepared')
        return null;
    const { current, methodKey, target: preparedTarget, wrapped } = prepared;
    const priorDescriptor = getOwnDescriptor(preparedTarget, methodKey);
    if (priorDescriptor && !('value' in priorDescriptor))
        return null;
    const published = Reflect.defineProperty(preparedTarget, methodKey, priorDescriptor
        ? { ...priorDescriptor, value: wrapped }
        : { configurable: true, enumerable: true, value: wrapped, writable: true });
    if (!published || preparedTarget[methodKey] !== wrapped)
        return null;
    let state: 'active' | 'released' = 'active';
    const lease: MethodWrapperLease = Object.freeze({
        dispose(this: MethodWrapperLease): boolean {
            if (this !== lease)
                return false;
            if (state === 'released')
                return true;
            if (preparedTarget[methodKey] !== wrapped)
                return false;
            const restored = priorDescriptor
                ? Reflect.defineProperty(preparedTarget, methodKey, priorDescriptor)
                : Reflect.deleteProperty(preparedTarget, methodKey);
            if (!restored || preparedTarget[methodKey] !== current)
                return false;
            state = 'released';
            return true;
        },
    });
    return lease;
}
export function createHookWrapperModule(): HookWrapperModule {
    return {
        hasHookInChain,
        acquireMethodWrapper,
        installMethodWrapper,
        markWrappedFunction,
    };
}
