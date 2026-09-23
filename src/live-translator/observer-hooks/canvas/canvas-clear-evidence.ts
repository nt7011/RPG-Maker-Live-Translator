import { locateProperty } from '../owned-hook-installer.js';
interface CanvasState {
    blank: boolean;
    unclipped: boolean;
    readonly stack: boolean[];
}
export function isNativeCanvasOperation(method: unknown, name: string): boolean {
    return (typeof method === 'function' &&
        Function.prototype.toString.call(method) === `function ${name}() { [native code] }`);
}
export function createCanvasClearEvidence(canvasPrototype: object, contextPrototype: object) {
    const states = new WeakMap<HTMLCanvasElement, CanvasState>();
    const alpha = new WeakMap<CanvasRenderingContext2D, boolean>();
    const attributes: unknown = locateProperty(contextPrototype, 'getContextAttributes')?.descriptor.value;
    const width: unknown = Reflect.get(locateProperty(canvasPrototype, 'width')?.descriptor ?? {}, 'get');
    const height: unknown = Reflect.get(locateProperty(canvasPrototype, 'height')?.descriptor ?? {}, 'get');
    const transform: unknown = locateProperty(contextPrototype, 'getTransform')?.descriptor.value;
    const readersTrusted = isNativeCanvasOperation(width, 'get width') &&
        isNativeCanvasOperation(height, 'get height') &&
        isNativeCanvasOperation(transform, 'getTransform');
    function transparent(context: CanvasRenderingContext2D): boolean {
        let value = alpha.get(context);
        if (value === undefined) {
            value =
                isNativeCanvasOperation(attributes, 'getContextAttributes') &&
                    (Reflect.apply(attributes as (...args: unknown[]) => unknown, context, []) as CanvasRenderingContext2DSettings).alpha === true;
            alpha.set(context, value);
        }
        return value;
    }
    function state(source: HTMLCanvasElement): CanvasState {
        return states.getOrInsertComputed(source, () => ({ blank: false, unclipped: false, stack: [] }));
    }
    function forget(source: HTMLCanvasElement): void {
        const entry = state(source);
        entry.blank = false;
        entry.unclipped = false;
        entry.stack.length = 0;
    }
    function reset(source: HTMLCanvasElement, trusted: boolean): void {
        if (!trusted) {
            forget(source);
            return;
        }
        states.set(source, { blank: true, unclipped: true, stack: [] });
    }
    function admitsClear(source: HTMLCanvasElement, context: CanvasRenderingContext2D, name: string, args: readonly unknown[], trusted: boolean): boolean {
        if (!trusted)
            return false;
        if (name === 'reset')
            return true;
        if (name !== 'clearRect' || !readersTrusted || states.get(source)?.unclipped !== true)
            return false;
        const [x, y, w, h] = args;
        if (![x, y, w, h].every((value) => typeof value === 'number' && Number.isFinite(value)))
            return false;
        const matrix = Reflect.apply(transform as (...args: unknown[]) => unknown, context, []) as DOMMatrix;
        for (const [key, expected] of [
            ['a', 1],
            ['b', 0],
            ['c', 0],
            ['d', 1],
            ['e', 0],
            ['f', 0],
        ] as const) {
            const descriptor = locateProperty(matrix, key)?.descriptor;
            if (descriptor === undefined)
                return false;
            const getter: unknown = Reflect.get(descriptor, 'get');
            if ('value' in descriptor) {
                if (descriptor.value !== expected)
                    return false;
            }
            else if (!isNativeCanvasOperation(getter, `get ${key}`) ||
                Reflect.apply(getter as () => number, matrix, []) !== expected)
                return false;
        }
        const sourceWidth = Reflect.apply(width as () => number, source, []);
        const sourceHeight = Reflect.apply(height as () => number, source, []);
        return (Math.min(x as number, (x as number) + (w as number)) <= 0 &&
            Math.min(y as number, (y as number) + (h as number)) <= 0 &&
            Math.max(x as number, (x as number) + (w as number)) >= sourceWidth &&
            Math.max(y as number, (y as number) + (h as number)) >= sourceHeight);
    }
    function beginWrite(source: HTMLCanvasElement, context: CanvasRenderingContext2D, name: string, args: readonly unknown[], trusted: boolean): boolean {
        state(source).blank = false;
        if (!trusted)
            forget(source);
        return admitsClear(source, context, name, args, trusted);
    }
    function endWrite(source: HTMLCanvasElement, name: string, cleared: boolean): void {
        if (!cleared)
            return;
        if (name === 'reset')
            reset(source, true);
        else
            state(source).blank = true;
    }
    function clipState(source: HTMLCanvasElement, name: 'save' | 'restore' | 'clip', trusted: boolean): void {
        if (!trusted) {
            forget(source);
            return;
        }
        const entry = state(source);
        if (name === 'save')
            entry.stack.push(entry.unclipped);
        else if (name === 'restore')
            entry.unclipped = entry.stack.pop() ?? entry.unclipped;
        else
            entry.unclipped = false;
    }
    return {
        isUnclipped: (source: HTMLCanvasElement) => states.get(source)?.unclipped === true,
        isBlank: (source: HTMLCanvasElement, context: CanvasRenderingContext2D) => states.get(source)?.blank === true && transparent(context),
        forget,
        reset,
        admitsClear,
        beginWrite,
        endWrite,
        clipState,
    };
}
