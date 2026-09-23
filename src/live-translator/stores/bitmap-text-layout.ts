import { bitmapLineTextX, type BitmapLineFrame } from './bitmap-line-geometry.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
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
export const bitmapGlyphMargin = 1;
export interface BitmapTextLayoutResult {
    readonly draws: readonly BitmapTextDraw[];
    readonly regions: readonly PixelBounds[];
}
export function validTextMetrics(metrics: BitmapTextMetrics): boolean {
    return ([metrics.width, metrics.left, metrics.right, metrics.ascent, metrics.descent].every(Number.isFinite) &&
        metrics.width >= 0);
}
export function bitmapSourceRepaintRegion(layout: BitmapTextLayout, metrics: BitmapTextMetrics): PixelBounds | null {
    const { placement, paint, alignment } = layout;
    if (!validTextMetrics(metrics) ||
        ![placement.x, placement.y, placement.maxWidth, placement.lineHeight].every(Number.isFinite) ||
        placement.maxWidth <= 0 ||
        metrics.ascent + metrics.descent <= 0)
        return null;
    const advance = Math.min(metrics.width, placement.maxWidth);
    const scale = metrics.width === 0 ? 1 : advance / metrics.width;
    const anchor = bitmapLineTextX({ x: placement.x, y: placement.y, width: placement.maxWidth, lineHeight: placement.lineHeight, alignment }, advance);
    const left = Math.min(anchor, anchor - metrics.left * scale) - bitmapGlyphMargin;
    const right = Math.max(anchor + advance, anchor + metrics.right * scale) + bitmapGlyphMargin;
    const baseline = bitmapTextBaseline(placement, paint);
    const top = Math.min(placement.y, placement.y + placement.lineHeight, baseline - metrics.ascent - bitmapGlyphMargin);
    const bottom = Math.max(placement.y, placement.y + placement.lineHeight, baseline + metrics.descent + bitmapGlyphMargin);
    return Object.freeze({ x: left, y: top, width: right - left, height: bottom - top });
}
export interface BitmapMeasuredLine {
    readonly runs: readonly {
        readonly text: string;
        readonly paint: TextPaint;
        readonly metrics: BitmapTextMetrics;
    }[];
    readonly advance: number;
    readonly ink: PixelBounds | null;
}
function glyphRegion(metrics: BitmapTextMetrics, placement: BitmapTextPlacement, paint: TextPaint, scale: number): PixelBounds | null {
    if (metrics.left + metrics.right <= 0 || metrics.ascent + metrics.descent <= 0)
        return null;
    const baseline = bitmapTextBaseline(placement, paint);
    return {
        x: placement.x - metrics.left * scale - bitmapGlyphMargin,
        y: baseline - metrics.ascent - bitmapGlyphMargin,
        width: (metrics.left + metrics.right) * scale + 2 * bitmapGlyphMargin,
        height: metrics.ascent + metrics.descent + 2 * bitmapGlyphMargin,
    };
}
export function measureBitmapLine(source: StyledText, start: number, end: number, lineHeight: number, measure: BitmapTextMeasure): BitmapMeasuredLine | null {
    const runs: {
        text: string;
        paint: TextPaint;
        metrics: BitmapTextMetrics;
    }[] = [];
    let advance = 0;
    let ink: PixelBounds | null = null;
    for (const [index, run] of source.runs.entries()) {
        const from = Math.max(start, source.runs[index - 1]?.end ?? 0), to = Math.min(end, run.end);
        if (from >= to)
            continue;
        const text = source.text.slice(from, to), metrics = measure(text, run.paint);
        if (!validTextMetrics(metrics))
            return null;
        const region = glyphRegion(metrics, { x: advance, y: 0, lineHeight, maxWidth: 1 }, run.paint, 1);
        if (region !== null) {
            if (ink === null)
                ink = region;
            else {
                const x = Math.min(ink.x, region.x), y = Math.min(ink.y, region.y);
                ink = {
                    x,
                    y,
                    width: Math.max(ink.x + ink.width, region.x + region.width) - x,
                    height: Math.max(ink.y + ink.height, region.y + region.height) - y,
                };
            }
        }
        advance += metrics.width;
        runs.push({ text, paint: run.paint, metrics });
    }
    return { runs, advance, ink };
}
export function placeBitmapLine(line: BitmapMeasuredLine, origin: BitmapTextPlacement, scale = 1): BitmapTextLayoutResult {
    const draws: BitmapTextDraw[] = [], regions: PixelBounds[] = [];
    let x = origin.x;
    for (const run of line.runs) {
        const placement = {
            ...origin,
            x,
            maxWidth: run.metrics.width === 0 ? origin.maxWidth : run.metrics.width * scale,
        };
        const region = glyphRegion(run.metrics, placement, run.paint, scale);
        if (region !== null)
            regions.push(region);
        draws.push({ text: run.text, layout: { paint: run.paint, alignment: 'left', placement } });
        x += run.metrics.width * scale;
    }
    return { draws, regions };
}
export function layoutBitmapText(source: StyledText, frame: BitmapLineFrame, measure: BitmapTextMeasure): BitmapTextLayoutResult | null {
    if (!hasWholeGraphemeStyles(source) ||
        ![frame.x, frame.y, frame.width, frame.lineHeight].every(Number.isFinite) ||
        frame.width < 0)
        return null;
    const line = measureBitmapLine(source, 0, source.text.length, frame.lineHeight, measure);
    if (line === null)
        return null;
    const left = Math.ceil(frame.x), right = Math.floor(frame.x + frame.width), width = right - left;
    if (line.ink !== null && width <= 0)
        return null;
    const inkLeft = Math.min(0, (line.ink?.x ?? 0) + bitmapGlyphMargin);
    const inkRight = Math.max(line.advance, line.ink === null ? 0 : line.ink.x + line.ink.width - bitmapGlyphMargin);
    const extent = inkRight - inkLeft;
    const scale = extent === 0 ? 1 : Math.min(1, Math.max(0, width) / extent);
    const placed = placeBitmapLine(line, {
        x: bitmapLineTextX({ ...frame, x: left, width }, extent * scale) - inkLeft * scale,
        y: frame.y,
        maxWidth: Math.max(0, width),
        lineHeight: frame.lineHeight,
    }, scale);
    return {
        draws: placed.draws,
        regions: placed.regions.flatMap((region) => {
            const x = Math.max(left, region.x);
            const end = Math.min(right, region.x + region.width);
            return end > x ? [{ ...region, x, width: end - x }] : [];
        }),
    };
}
