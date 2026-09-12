export type CanvasPixelDamage = {
    readonly kind: 'full';
} | {
    readonly kind: 'rect';
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};
type ExactGpuMutationDamage = CanvasPixelDamage;
import { locateProperty } from '../owned-hook-installer.js';
type CanvasMutationMethod = 'clearRect' | 'fillRect' | 'strokeRect' | 'fill' | 'stroke' | 'fillText' | 'strokeText' | 'drawImage' | 'putImageData' | 'reset' | 'drawFocusIfNeeded';
const fullDamage: ExactGpuMutationDamage = Object.freeze({ kind: 'full' });
type CapturedMethod = (receiver: unknown, arguments_: readonly unknown[]) => unknown;
type CapturedGetter = (receiver: unknown) => unknown;
type CanvasPaintStateKey = 'globalAlpha' | 'fillStyle' | 'imageSmoothingEnabled' | 'shadowColor' | 'globalCompositeOperation' | 'shadowBlur' | 'shadowOffsetX' | 'shadowOffsetY' | 'filter' | 'lineWidth' | 'lineJoin' | 'miterLimit';
export interface CanvasPixelDamageReader {
    readonly getTransform: (context: CanvasRenderingContext2D) => unknown;
    readonly measureText: (context: CanvasRenderingContext2D, text: string) => unknown;
    readonly readState: (context: CanvasRenderingContext2D, key: CanvasPaintStateKey) => unknown;
}
function captureMethod(prototype: object, key: PropertyKey): CapturedMethod | null {
    try {
        const located = locateProperty(prototype, key);
        if (located === null || 'get' in located.descriptor) {
            return null;
        }
        const nativeMethod = Reflect.get(located.descriptor, 'value') as unknown;
        if (typeof nativeMethod !== 'function')
            return null;
        return (receiver, arguments_) => Reflect.apply(nativeMethod, receiver, arguments_) as unknown;
    }
    catch {
        return null;
    }
}
function captureGetter(prototype: object, key: PropertyKey): CapturedGetter | null {
    try {
        const located = locateProperty(prototype, key);
        if (located === null || 'value' in located.descriptor) {
            return null;
        }
        const nativeGetter = Reflect.get(located.descriptor, 'get') as unknown;
        if (typeof nativeGetter !== 'function')
            return null;
        return (receiver) => Reflect.apply(nativeGetter, receiver, []) as unknown;
    }
    catch {
        return null;
    }
}
export function createCanvasPixelDamageReader(contextPrototype: object): CanvasPixelDamageReader {
    const getTransform = captureMethod(contextPrototype, 'getTransform');
    const measureText = captureMethod(contextPrototype, 'measureText');
    const getters = new Map<CanvasPaintStateKey, CapturedGetter | null>();
    for (const key of [
        'globalAlpha',
        'fillStyle',
        'imageSmoothingEnabled',
        'shadowColor',
        'globalCompositeOperation',
        'shadowBlur',
        'shadowOffsetX',
        'shadowOffsetY',
        'lineWidth',
        'lineJoin',
        'miterLimit',
    ] as const) {
        getters.set(key, captureGetter(contextPrototype, key));
    }
    let filterGetter: CapturedGetter | null = null;
    let filterAbsent = false;
    try {
        const located = locateProperty(contextPrototype, 'filter');
        filterAbsent = located === null;
        if (located !== null && !('value' in located.descriptor)) {
            const nativeGetter = Reflect.get(located.descriptor, 'get') as unknown;
            if (typeof nativeGetter === 'function') {
                filterGetter = (receiver) => Reflect.apply(nativeGetter, receiver, []) as unknown;
            }
        }
    }
    catch {
    }
    getters.set('filter', filterGetter);
    return Object.freeze({
        getTransform: (context: CanvasRenderingContext2D): unknown => getTransform === null ? null : getTransform(context, []),
        measureText: (context: CanvasRenderingContext2D, text: string): unknown => measureText === null ? null : measureText(context, [text]),
        readState: (context: CanvasRenderingContext2D, key: CanvasPaintStateKey): unknown => {
            if (key === 'filter' && filterAbsent)
                return 'none';
            const getter = getters.get(key);
            return getter === null || getter === undefined ? null : getter(context);
        },
    });
}
function finiteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}
function identityTransform(reader: CanvasPixelDamageReader, context: CanvasRenderingContext2D): boolean {
    const transform = reader.getTransform(context);
    if (typeof transform !== 'object' || transform === null)
        return false;
    const matrix = transform as Partial<Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f', unknown>>;
    return matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
}
function boundedPaintState(reader: CanvasPixelDamageReader, context: CanvasRenderingContext2D): boolean {
    return (identityTransform(reader, context) &&
        reader.readState(context, 'globalCompositeOperation') === 'source-over' &&
        reader.readState(context, 'shadowBlur') === 0 &&
        reader.readState(context, 'shadowOffsetX') === 0 &&
        reader.readState(context, 'shadowOffsetY') === 0 &&
        reader.readState(context, 'filter') === 'none');
}
function rectangle(x: unknown, y: unknown, width: unknown, height: unknown, margin = 0): ExactGpuMutationDamage {
    if (!finiteNumber(x) || !finiteNumber(y) || !finiteNumber(width) || !finiteNumber(height))
        return fullDamage;
    const left = Math.min(x, x + width) - margin;
    const top = Math.min(y, y + height) - margin;
    const right = Math.max(x, x + width) + margin;
    const bottom = Math.max(y, y + height) + margin;
    if (![left, top, right, bottom].every(Number.isFinite))
        return fullDamage;
    return { kind: 'rect', x: left, y: top, width: right - left, height: bottom - top };
}
function strokeMargin(reader: CanvasPixelDamageReader, context: CanvasRenderingContext2D): number | null {
    const lineWidth = reader.readState(context, 'lineWidth');
    const lineJoin = reader.readState(context, 'lineJoin');
    if (!finiteNumber(lineWidth) || lineWidth < 0)
        return null;
    if (lineJoin === 'round' || lineJoin === 'bevel')
        return lineWidth / 2 + 1;
    if (lineJoin !== 'miter')
        return null;
    const miterLimit = reader.readState(context, 'miterLimit');
    if (!finiteNumber(miterLimit) || miterLimit < 0)
        return null;
    return (lineWidth / 2) * Math.max(1, miterLimit) + 1;
}
function textDamage(reader: CanvasPixelDamageReader, context: CanvasRenderingContext2D, arguments_: readonly unknown[], stroked: boolean): ExactGpuMutationDamage {
    const [textValue, x, y, maximumWidth] = arguments_;
    const text = textValue === null ||
        typeof textValue === 'string' ||
        typeof textValue === 'number' ||
        typeof textValue === 'bigint' ||
        typeof textValue === 'boolean' ||
        typeof textValue === 'undefined'
        ? String(textValue)
        : null;
    if (text === null ||
        !finiteNumber(x) ||
        !finiteNumber(y) ||
        (maximumWidth !== undefined && (!finiteNumber(maximumWidth) || maximumWidth <= 0)) ||
        !boundedPaintState(reader, context)) {
        return fullDamage;
    }
    const metrics = reader.measureText(context, text);
    if (typeof metrics !== 'object' || metrics === null)
        return fullDamage;
    const { width: measuredWidth, actualBoundingBoxLeft, actualBoundingBoxRight, actualBoundingBoxAscent, actualBoundingBoxDescent, } = metrics as Partial<Record<'width' | 'actualBoundingBoxLeft' | 'actualBoundingBoxRight' | 'actualBoundingBoxAscent' | 'actualBoundingBoxDescent', unknown>>;
    if (!finiteNumber(measuredWidth) ||
        measuredWidth < 0 ||
        !finiteNumber(actualBoundingBoxLeft) ||
        !finiteNumber(actualBoundingBoxRight) ||
        !finiteNumber(actualBoundingBoxAscent) ||
        !finiteNumber(actualBoundingBoxDescent)) {
        return fullDamage;
    }
    if (maximumWidth !== undefined && measuredWidth > maximumWidth)
        return fullDamage;
    const margin = stroked ? strokeMargin(reader, context) : 1;
    if (margin === null)
        return fullDamage;
    const left = Math.min(x - actualBoundingBoxLeft, x + actualBoundingBoxRight) - margin;
    const top = y - actualBoundingBoxAscent - margin;
    const right = Math.max(x - actualBoundingBoxLeft, x + actualBoundingBoxRight) + margin;
    const bottom = y + actualBoundingBoxDescent + margin;
    if (![left, top, right, bottom].every(Number.isFinite))
        return fullDamage;
    return { kind: 'rect', x: left, y: top, width: right - left, height: bottom - top };
}
function drawImageDamage(reader: CanvasPixelDamageReader, context: CanvasRenderingContext2D, arguments_: readonly unknown[]): ExactGpuMutationDamage {
    if (arguments_.length !== 5 && arguments_.length !== 9)
        return fullDamage;
    if (!boundedPaintState(reader, context))
        return fullDamage;
    if (arguments_.length === 5)
        return rectangle(arguments_[1], arguments_[2], arguments_[3], arguments_[4], 1);
    return rectangle(arguments_[5], arguments_[6], arguments_[7], arguments_[8], 1);
}
function putImageDataDamage(arguments_: readonly unknown[]): ExactGpuMutationDamage {
    const [, destinationX, destinationY, dirtyX, dirtyY, dirtyWidth, dirtyHeight] = arguments_;
    if (arguments_.length === 3)
        return fullDamage;
    if (arguments_.length !== 7 ||
        !finiteNumber(destinationX) ||
        !finiteNumber(destinationY) ||
        !finiteNumber(dirtyX) ||
        !finiteNumber(dirtyY) ||
        !finiteNumber(dirtyWidth) ||
        !finiteNumber(dirtyHeight)) {
        return fullDamage;
    }
    const dx = Math.trunc(destinationX), dy = Math.trunc(destinationY), sx = Math.trunc(dirtyX), sy = Math.trunc(dirtyY), sw = Math.trunc(dirtyWidth), sh = Math.trunc(dirtyHeight);
    if ([dx, dy, sx, sy, sw, sh].some((value) => value < -2147483648 || value > 2147483647))
        return fullDamage;
    const sourceLeft = Math.min(sx, sx + sw);
    const sourceTop = Math.min(sy, sy + sh);
    const sourceRight = Math.max(sx, sx + sw);
    const sourceBottom = Math.max(sy, sy + sh);
    return rectangle(dx + sourceLeft, dy + sourceTop, Math.max(0, sourceRight - sourceLeft), Math.max(0, sourceBottom - sourceTop));
}
export function resolveCanvasPixelDamage(reader: CanvasPixelDamageReader, context: CanvasRenderingContext2D, method: CanvasMutationMethod, arguments_: readonly unknown[]): ExactGpuMutationDamage {
    try {
        switch (method) {
            case 'clearRect':
                if (!identityTransform(reader, context))
                    return fullDamage;
                return rectangle(arguments_[0], arguments_[1], arguments_[2], arguments_[3], 1);
            case 'fillRect':
                if (!boundedPaintState(reader, context))
                    return fullDamage;
                return rectangle(arguments_[0], arguments_[1], arguments_[2], arguments_[3], 1);
            case 'strokeRect': {
                if (!boundedPaintState(reader, context))
                    return fullDamage;
                const margin = strokeMargin(reader, context);
                return margin === null
                    ? fullDamage
                    : rectangle(arguments_[0], arguments_[1], arguments_[2], arguments_[3], margin);
            }
            case 'fillText':
                return textDamage(reader, context, arguments_, false);
            case 'strokeText':
                return textDamage(reader, context, arguments_, true);
            case 'drawImage':
                return drawImageDamage(reader, context, arguments_);
            case 'putImageData':
                return putImageDataDamage(arguments_);
            case 'fill':
            case 'stroke':
            case 'reset':
            case 'drawFocusIfNeeded':
                return fullDamage;
        }
    }
    catch {
        return fullDamage;
    }
}
export function completeSurfacePixelDamage(): ExactGpuMutationDamage {
    return fullDamage;
}
