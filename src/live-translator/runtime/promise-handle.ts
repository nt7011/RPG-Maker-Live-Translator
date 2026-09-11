type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type ForwardingMethod = (...args: unknown[]) => unknown;
interface PromiseOperationsCandidate {
    readonly then?: unknown;
    readonly catch?: unknown;
    readonly finally?: unknown;
}
interface CapturedHandleField {
    readonly key: PropertyKey;
    readonly value: unknown;
    readonly enumerable: boolean;
}
export interface PromiseHandleCapabilities {
    readonly promise: object | RuntimeFunction;
    readonly then: RuntimeFunction;
    readonly catch: RuntimeFunction;
    readonly finally: RuntimeFunction;
}
export interface PromiseConvenienceMethods {
    readonly then: ForwardingMethod;
    readonly catch: ForwardingMethod;
    readonly finally: ForwardingMethod;
}
const publishedPromiseHandles = new WeakSet<object>();
const applyPromiseHandleFunction = Reflect.apply;
const freezePromiseHandleValue = Object.freeze;
const isFrozenPromiseHandleValue = Object.isFrozen;
function isObjectLike(value: unknown): value is object | RuntimeFunction {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
export function capturePromiseHandleCapabilities(promise: unknown, errorPrefix: string): Readonly<PromiseHandleCapabilities> {
    if (!isObjectLike(promise)) {
        throw new TypeError(`${errorPrefix} handle promise must be an object.`);
    }
    const candidate = promise as PromiseOperationsCandidate;
    const then = candidate.then;
    const catchMethod = candidate.catch;
    const finallyMethod = candidate.finally;
    if (typeof then !== 'function' || typeof catchMethod !== 'function' || typeof finallyMethod !== 'function') {
        throw new TypeError(`${errorPrefix} handle promise must expose then, catch, and finally functions.`);
    }
    return freezePromiseHandleValue({
        promise,
        then: then as RuntimeFunction,
        catch: catchMethod as RuntimeFunction,
        finally: finallyMethod as RuntimeFunction,
    });
}
export function publishPromiseHandleFacade<Carrier extends object>(carrier: Carrier, capabilities: Readonly<PromiseHandleCapabilities>, errorPrefix: string): Readonly<Carrier & PromiseConvenienceMethods> {
    if (publishedPromiseHandles.has(carrier)) {
        return carrier as Readonly<Carrier & PromiseConvenienceMethods>;
    }
    const fields = captureHandleFields(carrier, capabilities.promise);
    const facade = {} as Carrier & PromiseConvenienceMethods;
    for (const field of fields) {
        Object.defineProperty(facade, field.key, {
            value: field.value,
            writable: false,
            enumerable: field.enumerable,
            configurable: false,
        });
    }
    Object.defineProperties(facade, {
        then: {
            value: createPromiseForwarder(capabilities.then, capabilities.promise),
            writable: false,
            enumerable: true,
            configurable: false,
        },
        catch: {
            value: createPromiseForwarder(capabilities.catch, capabilities.promise),
            writable: false,
            enumerable: true,
            configurable: false,
        },
        finally: {
            value: createPromiseForwarder(capabilities.finally, capabilities.promise),
            writable: false,
            enumerable: true,
            configurable: false,
        },
    });
    const published = freezePromiseHandleValue(facade);
    if (published !== facade || !isFrozenPromiseHandleValue(facade)) {
        throw new Error(`${errorPrefix} failed to freeze handle facade.`);
    }
    publishedPromiseHandles.add(facade);
    return facade;
}
function createPromiseForwarder(capability: RuntimeFunction, promise: object | RuntimeFunction): ForwardingMethod {
    return (...args: unknown[]): unknown => applyPromiseHandleFunction(capability, promise, args);
}
function captureHandleFields(carrier: object, promise: object | RuntimeFunction): CapturedHandleField[] {
    const fields: CapturedHandleField[] = [];
    let capturedOwnPromise = false;
    for (const key of Reflect.ownKeys(carrier)) {
        const descriptor = Reflect.getOwnPropertyDescriptor(carrier, key);
        if (descriptor === undefined)
            continue;
        if (key === 'then' || key === 'catch' || key === 'finally')
            continue;
        if (key === 'promise') {
            capturedOwnPromise = true;
            fields.push(freezePromiseHandleValue({ key, value: promise, enumerable: descriptor.enumerable === true }));
            continue;
        }
        const value: unknown = 'value' in descriptor ? (descriptor.value as unknown) : (Reflect.get(carrier, key, carrier) as unknown);
        fields.push(freezePromiseHandleValue({ key, value, enumerable: descriptor.enumerable === true }));
    }
    if (!capturedOwnPromise) {
        fields.push(freezePromiseHandleValue({ key: 'promise', value: promise, enumerable: true }));
    }
    return fields;
}
