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
        let entry = states.get(source);
        if (entry === undefined) {
            entry = { blank: false, unclipped: false, stack: [] };
            states.set(source, entry);
        }
        return entry;
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
    function beginWrite(source: HTMLCanvasElement, context: CanvasRenderingContext2D, name: string, args: readonly unknown[], trusted: boolean): boolean {
        const entry = state(source);
        entry.blank = false;
        if (!trusted) {
            forget(source);
            return false;
        }
        if (name === 'reset')
            return true;
        if (name !== 'clearRect' || !readersTrusted || !entry.unclipped)
            return false;
        const [x, y, w, h] = args;
        if (![x, y, w, h].every((value) => typeof value === 'number' && Number.isFinite(value)))
            return false;
        const matrix = Reflect.apply(transform as (...args: unknown[]) => unknown, context, []) as DOMMatrix;
        if (matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1 || matrix.e !== 0 || matrix.f !== 0)
            return false;
        const sourceWidth = Reflect.apply(width as () => number, source, []);
        const sourceHeight = Reflect.apply(height as () => number, source, []);
        return (Math.min(x as number, (x as number) + (w as number)) <= 0 &&
            Math.min(y as number, (y as number) + (h as number)) <= 0 &&
            Math.max(x as number, (x as number) + (w as number)) >= sourceWidth &&
            Math.max(y as number, (y as number) + (h as number)) >= sourceHeight);
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
        beginWrite,
        endWrite,
        clipState,
    };
}
