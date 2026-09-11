export interface AdapterLocalLookup<Value> {
    delete(key: unknown): unknown;
    get(key: unknown): Value | null | undefined;
    set(key: unknown, value: Value): unknown;
}
export function readObservedAdapterItemId(observed: unknown): string {
    if (!observed || typeof observed !== 'object') {
        throw new TypeError('Adapter observation requires a TextCore item.');
    }
    const id = Reflect.get(observed, 'id') as unknown;
    if (typeof id !== 'string' || !id) {
        throw new TypeError('Adapter observation requires a canonical item id.');
    }
    return id;
}
export function bindObservedAdapterItem<Value>(lookup: AdapterLocalLookup<Value>, previousId: unknown, observed: unknown, value: Value): string {
    const nextId = readObservedAdapterItemId(observed);
    if (previousId && previousId !== nextId && lookup.get(previousId) === value) {
        try {
            lookup.delete(previousId);
        }
        catch (error) {
            if (lookup.get(previousId) === value)
                throw error;
        }
    }
    if (lookup.get(nextId) !== value) {
        try {
            lookup.set(nextId, value);
        }
        catch (error) {
            if (lookup.get(nextId) !== value)
                throw error;
        }
    }
    if (lookup.get(nextId) !== value) {
        throw new Error('Adapter lookup rejected its canonical item binding.');
    }
    return nextId;
}
