import { cloneBoundedValue, type BoundedValueCloneLimits } from './bounded-value-clone.js';
export type DiagnosticsPropertyBag = Record<PropertyKey, unknown>;
export type DiagnosticsCallback = (...args: unknown[]) => unknown;
const freezeDiagnosticsBinding = Object.freeze;
export interface OptionalDiagnosticsBinding {
    isAvailable(): boolean;
    invoke(methodName: PropertyKey, args?: readonly unknown[]): void;
    invokeLazy(methodName: PropertyKey, createArgs: () => readonly unknown[] | null): void;
    dispose(methodName?: PropertyKey): boolean;
}
export function captureOptionalDiagnosticsHooks(globalScope: unknown): DiagnosticsPropertyBag | null {
    const hooks = readDiagnosticsProperty(globalScope, 'LiveTranslatorDiagnosticsHooks');
    return isDiagnosticsPropertyBag(hooks) ? hooks : null;
}
export function isDiagnosticsPropertyBag(value: unknown): value is DiagnosticsPropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
export function readDiagnosticsProperty(value: unknown, key: PropertyKey): unknown {
    if (!isDiagnosticsPropertyBag(value))
        return undefined;
    try {
        return Reflect.get(value, key, value);
    }
    catch {
        return undefined;
    }
}
export function readDiagnosticsCallback(value: unknown, key: PropertyKey): DiagnosticsCallback | null {
    const candidate = readDiagnosticsProperty(value, key);
    return typeof candidate === 'function' ? (candidate as DiagnosticsCallback) : null;
}
export function cloneDiagnosticValue(value: unknown, limits: BoundedValueCloneLimits, fallback: unknown): unknown {
    try {
        return cloneBoundedValue(value, limits);
    }
    catch {
        return fallback;
    }
}
export function createOptionalDiagnosticsBindingFromHooks(hooks: unknown, factoryName: PropertyKey, factoryArgs: readonly unknown[] = []): OptionalDiagnosticsBinding {
    const pinnedHooks = isDiagnosticsPropertyBag(hooks) ? hooks : null;
    const pinnedArgs = Array.from(factoryArgs);
    let pinnedFactory = readDiagnosticsCallback(pinnedHooks, factoryName);
    let observer: DiagnosticsPropertyBag | null = null;
    let factoryClaimed = false;
    let disposed = false;
    let disposalMethod: PropertyKey = 'dispose';
    function isDisposed(): boolean {
        return disposed;
    }
    function releaseObserver(target: DiagnosticsPropertyBag): void {
        const method = readDiagnosticsCallback(target, disposalMethod);
        if (!method)
            return;
        try {
            Reflect.apply(method, target, []);
        }
        catch {
        }
    }
    function getObserver(): DiagnosticsPropertyBag | null {
        if (isDisposed() || observer)
            return observer;
        if (!pinnedHooks || factoryClaimed)
            return null;
        const factory = pinnedFactory ?? readDiagnosticsCallback(pinnedHooks, factoryName);
        if (isDisposed() || !factory)
            return null;
        pinnedFactory = factory;
        factoryClaimed = true;
        try {
            const candidate = Reflect.apply(factory, pinnedHooks, pinnedArgs);
            if (isDiagnosticsPropertyBag(candidate)) {
                if (isDisposed())
                    releaseObserver(candidate);
                else
                    observer = candidate;
            }
        }
        catch {
            observer = null;
        }
        return observer;
    }
    function invoke(methodName: PropertyKey, args: readonly unknown[] = []): void {
        const target = getObserver();
        const method = readDiagnosticsCallback(target, methodName);
        if (isDisposed() || !target || !method)
            return;
        try {
            const capturedArgs = Array.from(args);
            if (!isDisposed())
                Reflect.apply(method, target, capturedArgs);
        }
        catch {
        }
    }
    function isAvailable(): boolean {
        return getObserver() !== null;
    }
    function invokeLazy(methodName: PropertyKey, createArgs: () => readonly unknown[] | null): void {
        const target = getObserver();
        const method = readDiagnosticsCallback(target, methodName);
        if (isDisposed() || !target || !method)
            return;
        try {
            const args = Reflect.apply(createArgs, undefined, []);
            if (isDisposed() || !args)
                return;
            const capturedArgs = Array.from(args);
            if (!isDisposed())
                Reflect.apply(method, target, capturedArgs);
        }
        catch {
        }
    }
    function dispose(methodName: PropertyKey = 'dispose'): boolean {
        if (isDisposed())
            return true;
        disposalMethod = methodName;
        const target = getObserver();
        if (isDisposed())
            return true;
        disposed = true;
        observer = null;
        if (target)
            releaseObserver(target);
        return true;
    }
    return freezeDiagnosticsBinding({ isAvailable, invoke, invokeLazy, dispose });
}
