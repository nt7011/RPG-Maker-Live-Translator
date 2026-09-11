import type { RuntimeResourceObserver } from './diagnostics-ingress.js';
interface Registration {
    readonly target: WeakRef<object>;
    readonly release: () => void;
}
function cleanup<T>(value: T, release: (value: T) => void): () => void {
    return () => {
        release(value);
    };
}
export function createNativeLifetime(reportFailure: (error: unknown) => void, probeEvent?: RuntimeResourceObserver) {
    const registrations = new Map<WeakRef<object>, Registration>();
    const registry = new FinalizationRegistry<Registration>((entry) => {
        if (registrations.get(entry.target) !== entry)
            return;
        probe('finalized', 1);
        release(entry);
    });
    let disposed = false;
    function probe(name: string, value: number): void {
        try {
            probeEvent?.({ kind: 'probe-count', name: `lifetime.${name}`, value });
        }
        catch {
        }
    }
    function forget(target: WeakRef<object>): void {
        const entry = registrations.get(target);
        if (entry === undefined)
            return;
        registrations.delete(target);
        registry.unregister(entry);
        probe('forgotten', 1);
    }
    function release(entry: Registration): void {
        if (registrations.get(entry.target) !== entry)
            return;
        forget(entry.target);
        try {
            entry.release();
        }
        catch (error) {
            probe('cleanup-failed', 1);
            try {
                reportFailure(error);
            }
            catch {
            }
        }
    }
    function watch<V>(target: WeakRef<object>, value: V, onRelease: (value: V) => void): void {
        if (disposed)
            throw new Error('Native lifetime is disposed.');
        const native = target.deref();
        if (native === undefined) {
            onRelease(value);
            return;
        }
        if (registrations.has(target))
            throw new Error('Native lifetime reference is already registered.');
        const entry = { target, release: cleanup(value, onRelease) };
        registrations.set(target, entry);
        registry.register(native, entry, entry);
        probe('watched', 1);
    }
    function dispose(): void {
        disposed = true;
        for (const entry of registrations.values())
            release(entry);
    }
    return { watch, forget, dispose };
}
export type NativeLifetime = ReturnType<typeof createNativeLifetime>;
