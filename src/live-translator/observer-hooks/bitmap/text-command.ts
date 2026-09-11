import { isTextPaint, type TextPaint } from '../../stores/styled-text.js';
export interface BitmapPaintFailure {
    readonly stage: 'capture-paint';
    readonly error: unknown;
}
const ineligibleBitmapPaintProperty = Symbol('ineligible-bitmap-paint-property');
type BitmapPaintProperty = 'fontFace' | 'fontSize' | 'fontItalic' | 'textColor' | 'outlineColor' | 'outlineWidth';
interface BitmapPaintSource {
    readonly fontFace: unknown;
    readonly fontSize: unknown;
    readonly fontItalic: unknown;
    readonly textColor: unknown;
    readonly outlineColor: unknown;
    readonly outlineWidth: unknown;
}
function readBitmapDataProperty(bitmap: object, key: BitmapPaintProperty): unknown {
    let owner: object | null = bitmap;
    while (owner !== null) {
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (descriptor !== undefined) {
            return Object.hasOwn(descriptor, 'value') ? (descriptor.value as unknown) : ineligibleBitmapPaintProperty;
        }
        owner = Object.getPrototypeOf(owner) as object | null;
    }
    return undefined;
}
function isSideEffectFreePrimitive(value: unknown): boolean {
    return (value === null ||
        value === undefined ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint');
}
function primitiveString(value: unknown): string | null {
    return isSideEffectFreePrimitive(value) ? String(value) : null;
}
function layoutFontSize(value: unknown): number | null {
    if (!isSideEffectFreePrimitive(value) || typeof value === 'bigint')
        return null;
    const result = Number(value);
    return Number.isFinite(result) && result > 0 ? result : null;
}
export function captureDrawTextPaint(bitmap: object, context: CanvasRenderingContext2D | null, failures: {
    push: (failure: BitmapPaintFailure) => unknown;
}): TextPaint | null {
    if (context === null)
        return null;
    let source: BitmapPaintSource;
    try {
        source = {
            fontFace: readBitmapDataProperty(bitmap, 'fontFace'),
            fontSize: readBitmapDataProperty(bitmap, 'fontSize'),
            fontItalic: readBitmapDataProperty(bitmap, 'fontItalic'),
            textColor: readBitmapDataProperty(bitmap, 'textColor'),
            outlineColor: readBitmapDataProperty(bitmap, 'outlineColor'),
            outlineWidth: readBitmapDataProperty(bitmap, 'outlineWidth'),
        };
    }
    catch {
        return null;
    }
    const values = Object.values(source);
    if (values.some((value) => !isSideEffectFreePrimitive(value)))
        return null;
    const fontSize = layoutFontSize(source.fontSize);
    const fontSizeText = primitiveString(source.fontSize);
    const fontFace = primitiveString(source.fontFace);
    if (fontSize === null || fontSizeText === null || fontFace === null)
        return null;
    let saved = false;
    try {
        try {
            const bodyAlpha = context.globalAlpha;
            context.save();
            saved = true;
            const italic = source.fontItalic ? 'Italic ' : '';
            if (!Reflect.set(context, 'font', `${italic}${fontSizeText}px ${fontFace}`) ||
                !Reflect.set(context, 'strokeStyle', source.outlineColor) ||
                !Reflect.set(context, 'lineWidth', source.outlineWidth) ||
                !Reflect.set(context, 'fillStyle', source.textColor)) {
                return null;
            }
            const paint = {
                font: context.font,
                fontSize,
                textColor: context.fillStyle,
                outlineColor: context.strokeStyle,
                outlineWidth: context.lineWidth,
                bodyAlpha,
            };
            return isTextPaint(paint) ? paint : null;
        }
        catch {
            return null;
        }
        finally {
            if (saved)
                context.restore();
        }
    }
    catch (error) {
        failures.push({ stage: 'capture-paint', error });
        return null;
    }
}
export function normalizedDrawTextSource(value: unknown): string | null {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'bigint')
        return String(value);
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (value === null)
        return 'null';
    return null;
}
