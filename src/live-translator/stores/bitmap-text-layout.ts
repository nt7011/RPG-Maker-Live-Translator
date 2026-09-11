import { bitmapLineTextX, type BitmapLineFrame } from './bitmap-line-geometry.js';
import { characters, createStyledText, hasWholeGraphemeStyles, type StyledText, type TextPaint, } from './styled-text.js';
export interface BitmapSourceCharacterIndex {
    readonly ends: readonly number[];
    readonly drawableEnds: readonly number[];
    readonly supported: boolean;
}
export function onlyBitmapTextSeparators(text: string): boolean {
    return /^[\s\p{White_Space}\p{Cf}]*$/u.test(text);
}
export function indexBitmapSourceCharacters(text: string, pauseEnds: readonly number[] = []): BitmapSourceCharacterIndex {
    let offset = 0;
    const ends: number[] = [], drawable: number[] = [];
    for (const character of characters(text)) {
        offset += character.length;
        ends.push(offset);
        if (character === '\t' || !/^[\p{Cc}\p{Cf}\u2028\u2029]+$/u.test(character))
            drawable.push(offset);
    }
    let sectionStart = 0;
    const spacing: {
        start: number;
        end: number;
    }[] = [];
    for (const end of [...pauseEnds, text.length]) {
        const start = sectionStart + text.slice(sectionStart, end).replace(/[\s\p{White_Space}]+$/u, '').length;
        if (start < end)
            spacing.push({ start, end });
        sectionStart = end;
    }
    let section = 0;
    const visible = drawable.filter((end) => {
        while (end > (spacing[section]?.end ?? Infinity))
            section++;
        return end <= (spacing[section]?.start ?? Infinity);
    });
    return Object.freeze({
        ends: Object.freeze(ends),
        drawableEnds: visible.length === ends.length ? ends : Object.freeze(visible),
        supported: supportsBitmapCharacterText(text),
    });
}
export function supportsBitmapCharacterText(text: string): boolean {
    return /^([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Common}\p{Script=Inherited}])*$/u.test(text);
}
export function bitmapTextSpacing(source: StyledText): StyledText {
    return createStyledText(source.runs.map((run, index) => ({
        text: source.text
            .slice(source.runs[index - 1]?.end ?? 0, run.end)
            .replace(/\r\n|[\r\n\u2028\u2029]/gu, ' '),
        paint: run.paint,
    })));
}
export type BitmapTextAlignment = 'left' | 'center' | 'right';
export interface BitmapTextPlacement {
    readonly x: number;
    readonly y: number;
    readonly maxWidth: number;
    readonly lineHeight: number;
}
export interface BitmapTextLayout {
    readonly placement: BitmapTextPlacement;
    readonly alignment: BitmapTextAlignment;
    readonly paint: TextPaint;
}
export function copyBitmapTextLayout(layout: BitmapTextLayout): BitmapTextLayout {
    return Object.freeze({
        placement: Object.freeze({ ...layout.placement }),
        alignment: layout.alignment,
        paint: Object.freeze({ ...layout.paint }),
    });
}
export function bitmapTextBaseline(placement: BitmapTextPlacement, paint: TextPaint): number {
    return placement.y + placement.lineHeight / 2 + paint.fontSize * 0.35 + (paint.baselineOffset ?? 0);
}
export interface BitmapTextDraw {
    readonly text: string;
    readonly layout: BitmapTextLayout;
}
export interface BitmapTextMetrics {
    readonly width: number;
    readonly left: number;
    readonly right: number;
    readonly ascent: number;
    readonly descent: number;
}
export type BitmapTextMeasure = (text: string, paint: TextPaint) => BitmapTextMetrics;
export function validTextMetrics(metrics: BitmapTextMetrics): boolean {
    return ([metrics.width, metrics.left, metrics.right, metrics.ascent, metrics.descent].every(Number.isFinite) &&
        metrics.width >= 0);
}
export function layoutBitmapText(source: StyledText, frame: BitmapLineFrame, measure: BitmapTextMeasure): readonly BitmapTextDraw[] | null {
    if (!hasWholeGraphemeStyles(source))
        return null;
    const measured = source.runs.map((run, index) => {
        const text = source.text.slice(source.runs[index - 1]?.end ?? 0, run.end);
        return { text, paint: run.paint, metrics: measure(text, run.paint) };
    });
    if (measured.some((run) => !validTextMetrics(run.metrics)))
        return null;
    const width = measured.reduce((sum, run) => sum + run.metrics.width, 0);
    const scale = width === 0 ? 1 : Math.min(1, frame.width / width);
    let x = bitmapLineTextX(frame, width * scale);
    return measured.map((run) => {
        const layout: BitmapTextLayout = {
            paint: run.paint,
            alignment: 'left',
            placement: {
                x,
                y: frame.y,
                lineHeight: frame.lineHeight,
                maxWidth: run.metrics.width === 0 ? frame.width : run.metrics.width * scale,
            },
        };
        x += run.metrics.width * scale;
        return { text: run.text, layout };
    });
}
