export {};
declare global {
    interface IteratorConstructor {
        concat<T>(...iterables: Iterable<T>[]): IteratorObject<T, undefined>;
    }
}
