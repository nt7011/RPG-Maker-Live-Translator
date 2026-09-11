import type { CanvasPixelDamageReader } from './canvas-pixel-damage.js';
export interface CanvasAppearanceState {
    readonly transform: readonly [
        number,
        number,
        number,
        number,
        number,
        number
    ];
    readonly alpha: number;
    readonly composite: GlobalCompositeOperation;
    readonly smoothing: boolean;
    readonly shadowColor: string;
}
export interface CanvasRectangle {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export type CanvasAppearanceOperation = {
    readonly state: CanvasAppearanceState;
    readonly destination: CanvasRectangle;
} & ({
    readonly kind: 'image';
    readonly image: HTMLCanvasElement;
    readonly source: CanvasRectangle;
} | {
    readonly kind: 'fill';
    readonly color: string;
} | {
    readonly kind: 'clear';
});
function rectangle(values: readonly unknown[]): CanvasRectangle | null {
    if (values.length !== 4 || !values.every((value) => typeof value === 'number' && Number.isFinite(value)))
        return null;
    const [x, y, width, height] = values as [
        number,
        number,
        number,
        number
    ];
    return { x, y, width, height };
}
export function captureCanvasAppearanceOperation(reader: CanvasPixelDamageReader, context: CanvasRenderingContext2D, name: string, args: readonly unknown[], unclipped: boolean, readCanvasSize: (value: unknown) => {
    width: number;
    height: number;
} | null): CanvasAppearanceOperation | null {
    if (!unclipped || !['drawImage', 'fillRect', 'clearRect'].includes(name))
        return null;
    const transform = reader.getTransform(context) as Partial<DOMMatrix> | null;
    if (transform === null || typeof transform !== 'object')
        return null;
    const matrix = [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f] as const;
    if (!matrix.every((value) => typeof value === 'number' && Number.isFinite(value)))
        return null;
    if (reader.readState(context, 'shadowBlur') !== 0 ||
        reader.readState(context, 'shadowOffsetX') !== 0 ||
        reader.readState(context, 'shadowOffsetY') !== 0 ||
        reader.readState(context, 'filter') !== 'none')
        return null;
    const alpha = reader.readState(context, 'globalAlpha'), composite = reader.readState(context, 'globalCompositeOperation'), smoothing = reader.readState(context, 'imageSmoothingEnabled'), shadowColor = reader.readState(context, 'shadowColor');
    if (typeof alpha !== 'number' ||
        !Number.isFinite(alpha) ||
        typeof composite !== 'string' ||
        typeof smoothing !== 'boolean' ||
        typeof shadowColor !== 'string')
        return null;
    const state: CanvasAppearanceState = {
        transform: matrix as CanvasAppearanceState['transform'],
        alpha,
        composite: composite as GlobalCompositeOperation,
        smoothing,
        shadowColor,
    };
    if (name === 'drawImage') {
        if (![3, 5, 9].includes(args.length))
            return null;
        const size = readCanvasSize(args[0]);
        if (size === null)
            return null;
        const source = args.length === 9 ? rectangle(args.slice(1, 5)) : { x: 0, y: 0, ...size };
        const destination = rectangle(args.length === 9
            ? args.slice(5)
            : args.length === 5
                ? args.slice(1)
                : [args[1], args[2], size.width, size.height]);
        return source && destination
            ? { kind: 'image', image: args[0] as HTMLCanvasElement, source, destination, state }
            : null;
    }
    const destination = rectangle(args);
    if (destination === null)
        return null;
    if (name === 'clearRect')
        return { kind: 'clear', destination, state };
    const color = reader.readState(context, 'fillStyle');
    return typeof color === 'string' ? { kind: 'fill', color, destination, state } : null;
}
