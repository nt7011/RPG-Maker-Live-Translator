type NativeAccessor = (this: unknown, value?: unknown) => unknown;
export function installCanvasTextAlignmentGuard(prototype: object): boolean {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'textAlign');
    if (descriptor?.configurable !== true)
        return false;
    const getter: unknown = Reflect.get(descriptor, 'get');
    const setter: unknown = Reflect.get(descriptor, 'set');
    if (typeof getter !== 'function' || typeof setter !== 'function')
        return false;
    if (Function.prototype.toString.call(getter) !== 'function get textAlign() { [native code] }' ||
        Function.prototype.toString.call(setter) !== 'function set textAlign() { [native code] }')
        return false;
    const read = getter as NativeAccessor;
    const write = setter as NativeAccessor;
    const guarded = function (this: unknown, value: unknown): unknown {
        if (value === 'left' ||
            value === 'right' ||
            value === 'center' ||
            value === 'start' ||
            value === 'end' ||
            (typeof value === 'object' && value !== null) ||
            typeof value === 'function' ||
            typeof value === 'symbol')
            return Reflect.apply(write, this, [value]);
        Reflect.apply(read, this, []);
        return undefined;
    };
    Object.defineProperty(prototype, 'textAlign', { ...descriptor, set: guarded });
    return true;
}
