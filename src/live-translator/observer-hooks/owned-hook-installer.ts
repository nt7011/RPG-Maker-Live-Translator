type HookMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
type HookSetter = (this: unknown, value: unknown) => unknown;
type EnabledReader = () => boolean;
interface OwnedHookSpecBase {
    readonly target: object;
    readonly key: PropertyKey;
    readonly optional?: boolean;
}
export type OwnedHookSpec = (OwnedHookSpecBase & {
    readonly kind: 'method';
    readonly wrap: (nativeMethod: HookMethod, isEnabled: EnabledReader) => HookMethod;
}) | (OwnedHookSpecBase & {
    readonly kind: 'setter';
    readonly wrap: (nativeSetter: HookSetter, isEnabled: EnabledReader) => HookSetter;
});
export type OwnedHookDisposal = 'disposed' | 'already-disposed' | 'ownership-lost' | 'failed';
export interface OwnedHookLease {
    readonly dispose: () => OwnedHookDisposal;
}
interface InstallationToken {
    enabled: boolean;
}
export interface LocatedProperty {
    readonly descriptor: PropertyDescriptor;
    readonly owner: object;
}
interface InstalledHook {
    readonly target: object;
    readonly key: PropertyKey;
    readonly original: LocatedProperty;
    readonly originalOwnDescriptor: PropertyDescriptor | undefined;
    readonly installedDescriptor: PropertyDescriptor;
}
interface CleanupResult {
    readonly failed: boolean;
    readonly ownershipLost: boolean;
}
const targetInstallations = new WeakMap<object, InstallationToken>();
export function locateProperty(target: object, key: PropertyKey): LocatedProperty | null {
    let candidate: object | null = target;
    while (candidate !== null) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (descriptor !== undefined)
            return { descriptor, owner: candidate };
        candidate = Object.getPrototypeOf(candidate) as object | null;
    }
    return null;
}
function sameDescriptor(left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean {
    if (left === undefined || right === undefined)
        return left === right;
    if (left.configurable !== right.configurable || left.enumerable !== right.enumerable)
        return false;
    const leftIsData = 'value' in left || 'writable' in left;
    const rightIsData = 'value' in right || 'writable' in right;
    if (leftIsData !== rightIsData)
        return false;
    if (leftIsData)
        return left.value === right.value && left.writable === right.writable;
    return left.get === right.get && left.set === right.set;
}
function safeReport(reportFailure: (error: unknown) => void, error: unknown): void {
    try {
        reportFailure(error);
    }
    catch {
    }
}
function releaseTargets(targets: readonly object[], token: InstallationToken): void {
    for (const target of targets) {
        if (targetInstallations.get(target) === token)
            targetInstallations.delete(target);
    }
}
function restoreHook(hook: InstalledHook): void {
    if (hook.originalOwnDescriptor === undefined) {
        if (!Reflect.deleteProperty(hook.target, hook.key)) {
            throw new Error(`Could not remove inherited hook for ${String(hook.key)}.`);
        }
    }
    else {
        Object.defineProperty(hook.target, hook.key, hook.originalOwnDescriptor);
    }
    if (!sameDescriptor(Object.getOwnPropertyDescriptor(hook.target, hook.key), hook.originalOwnDescriptor)) {
        throw new Error(`Could not verify restoration of hook for ${String(hook.key)}.`);
    }
}
function originalPropertyIsPresent(hook: InstalledHook): boolean {
    const current = locateProperty(hook.target, hook.key);
    return (current !== null &&
        current.owner === hook.original.owner &&
        sameDescriptor(current.descriptor, hook.original.descriptor));
}
function cleanupHooks(hooks: readonly InstalledHook[], reportFailure: (error: unknown) => void): CleanupResult {
    let failed = false;
    let ownershipLost = false;
    for (let index = hooks.length - 1; index >= 0; index -= 1) {
        const hook = hooks[index];
        if (hook === undefined)
            continue;
        try {
            const current = Object.getOwnPropertyDescriptor(hook.target, hook.key);
            if (sameDescriptor(current, hook.installedDescriptor)) {
                restoreHook(hook);
                if (!originalPropertyIsPresent(hook))
                    ownershipLost = true;
            }
            else if (!originalPropertyIsPresent(hook)) {
                ownershipLost = true;
            }
        }
        catch (error) {
            safeReport(reportFailure, error);
            try {
                if (originalPropertyIsPresent(hook))
                    continue;
                if (!sameDescriptor(Object.getOwnPropertyDescriptor(hook.target, hook.key), hook.installedDescriptor)) {
                    ownershipLost = true;
                    continue;
                }
            }
            catch (verificationError) {
                safeReport(reportFailure, verificationError);
            }
            failed = true;
        }
    }
    return { failed, ownershipLost };
}
function installedDescriptor(spec: OwnedHookSpec, located: LocatedProperty, wrapper: HookMethod | HookSetter): PropertyDescriptor {
    const { descriptor } = located;
    if (spec.kind === 'method') {
        return {
            configurable: located.owner === spec.target ? (descriptor.configurable ?? false) : true,
            enumerable: descriptor.enumerable ?? false,
            value: wrapper,
            writable: descriptor.writable ?? false,
        };
    }
    const nativeGetter = Reflect.get(descriptor, 'get') as unknown;
    return {
        configurable: located.owner === spec.target ? (descriptor.configurable ?? false) : true,
        enumerable: descriptor.enumerable ?? false,
        ...(nativeGetter === undefined ? {} : { get: nativeGetter as () => unknown }),
        set: wrapper,
    };
}
function prepareHook(spec: OwnedHookSpec, isEnabled: EnabledReader): InstalledHook | null {
    const located = locateProperty(spec.target, spec.key);
    if (located === null) {
        if (spec.optional === true)
            return null;
        throw new TypeError(`Required ${spec.kind} ${String(spec.key)} was not found.`);
    }
    let wrapper: HookMethod | HookSetter;
    if (spec.kind === 'method') {
        if ('get' in located.descriptor || typeof located.descriptor.value !== 'function') {
            throw new TypeError(`${String(spec.key)} must be an ordinary data method.`);
        }
        wrapper = spec.wrap(located.descriptor.value as HookMethod, isEnabled);
    }
    else {
        const nativeSetter = Reflect.get(located.descriptor, 'set') as unknown;
        if ('value' in located.descriptor || typeof nativeSetter !== 'function') {
            throw new TypeError(`${String(spec.key)} must be an accessor with a setter.`);
        }
        wrapper = spec.wrap(nativeSetter as HookSetter, isEnabled);
    }
    if (typeof wrapper !== 'function') {
        throw new TypeError(`Hook wrapper for ${String(spec.key)} must be callable.`);
    }
    return {
        target: spec.target,
        key: spec.key,
        original: located,
        originalOwnDescriptor: located.owner === spec.target ? located.descriptor : undefined,
        installedDescriptor: installedDescriptor(spec, located, wrapper),
    };
}
export function installOwnedHooks(specs: readonly OwnedHookSpec[], reportFailure: (error: unknown) => void): OwnedHookLease {
    const targets: object[] = [];
    for (const spec of specs) {
        if (targets.includes(spec.target))
            continue;
        targets.push(spec.target);
    }
    for (const target of targets) {
        if (targetInstallations.has(target)) {
            throw new Error('Owned hooks are already installed on this target.');
        }
    }
    const token: InstallationToken = { enabled: false };
    for (const target of targets)
        targetInstallations.set(target, token);
    const isEnabled = (): boolean => token.enabled;
    let hooks: readonly InstalledHook[];
    try {
        const seen: {
            readonly target: object;
            readonly key: PropertyKey;
        }[] = [];
        const prepared: InstalledHook[] = [];
        for (const spec of specs) {
            if (seen.some(({ target, key }) => target === spec.target && key === spec.key)) {
                throw new TypeError(`Duplicate hook target for ${String(spec.key)}.`);
            }
            seen.push({ target: spec.target, key: spec.key });
            const hook = prepareHook(spec, isEnabled);
            if (hook !== null)
                prepared.push(hook);
        }
        hooks = prepared;
    }
    catch (error) {
        releaseTargets(targets, token);
        throw error;
    }
    const attemptedHooks: InstalledHook[] = [];
    try {
        for (const hook of hooks) {
            if (!originalPropertyIsPresent(hook)) {
                throw new Error(`Hook target changed before installation for ${String(hook.key)}.`);
            }
            attemptedHooks.push(hook);
            Object.defineProperty(hook.target, hook.key, hook.installedDescriptor);
            if (!sameDescriptor(Object.getOwnPropertyDescriptor(hook.target, hook.key), hook.installedDescriptor)) {
                throw new Error(`Could not verify installed hook for ${String(hook.key)}.`);
            }
        }
        for (const hook of attemptedHooks) {
            if (!sameDescriptor(Object.getOwnPropertyDescriptor(hook.target, hook.key), hook.installedDescriptor)) {
                throw new Error(`Hook target changed during installation for ${String(hook.key)}.`);
            }
        }
    }
    catch (error) {
        const rollback = cleanupHooks(attemptedHooks, reportFailure);
        if (!rollback.failed && !rollback.ownershipLost) {
            releaseTargets(targets, token);
        }
        else if (rollback.ownershipLost) {
            safeReport(reportFailure, new Error('Hook installation rollback lost descriptor ownership.'));
        }
        throw error;
    }
    token.enabled = true;
    let disposed = false;
    let disposalInProgress = false;
    return {
        dispose: (): OwnedHookDisposal => {
            if (disposed)
                return 'already-disposed';
            if (disposalInProgress)
                return 'failed';
            disposalInProgress = true;
            token.enabled = false;
            const cleanup = cleanupHooks(hooks, reportFailure);
            if (cleanup.failed) {
                disposalInProgress = false;
                return 'failed';
            }
            disposed = true;
            releaseTargets(targets, token);
            if (cleanup.ownershipLost) {
                safeReport(reportFailure, new Error('Hook installation no longer owns every installed descriptor.'));
                return 'ownership-lost';
            }
            return 'disposed';
        },
    };
}
