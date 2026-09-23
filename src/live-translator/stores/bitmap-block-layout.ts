import { bitmapAlignmentFactor, type BitmapLineFrame } from './bitmap-line-geometry.js';
import { characters, hasWholeGraphemeStyles, type StyledText, type TextPaint } from './styled-text.js';
import { measureBitmapLine, placeBitmapLine, type BitmapMeasuredLine, type BitmapTextDraw, type BitmapTextMeasure, type BitmapTextMetrics, } from './bitmap-text-layout.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
export interface BitmapBlockLayout {
    readonly draws: readonly BitmapTextDraw[];
    readonly regions: readonly PixelBounds[];
}
export function layoutBitmapBlock(source: StyledText, frame: BitmapLineFrame, area: PixelBounds, measure: BitmapTextMeasure, rejected?: (reason: string) => void): BitmapBlockLayout | null {
    const advance = frame.lineHeight;
    if (!hasWholeGraphemeStyles(source) ||
        ![area.x, area.y, area.width, area.height, frame.y, advance].every(Number.isFinite) ||
        area.width <= 0 ||
        area.height <= 0 ||
        advance <= 0) {
        rejected?.('invalid-block-geometry-or-grapheme-styles');
        return null;
    }
    const graphemes = characters(source.text);
    const isBreak = (index: number): boolean => /^(?:\r\n|[\r\n\u2028\u2029])$/u.test(graphemes[index] ?? '');
    const boundaries = [0];
    for (const character of graphemes)
        boundaries.push((boundaries.at(-1) ?? 0) + character.length);
    const measured = new Map<TextPaint, Map<string, BitmapTextMetrics>>();
    const measureRun: BitmapTextMeasure = (text, paint) => {
        const byText = measured.getOrInsertComputed(paint, () => new Map());
        const previous = byText.get(text);
        if (previous !== undefined)
            return previous;
        const result = measure(text, paint);
        const metrics = Object.freeze({
            width: result.width,
            left: result.left,
            right: result.right,
            ascent: result.ascent,
            descent: result.descent,
        });
        byText.set(text, metrics);
        return metrics;
    };
    let measurements = 0, units = 0;
    function measureLine(start: number, end: number): BitmapMeasuredLine | null {
        if (++measurements > 2048 || (units += end - start) > 262144) {
            rejected?.('block-measurement-budget-exceeded');
            return null;
        }
        const line = measureBitmapLine(source, start, end, advance, measureRun);
        if (line === null)
            rejected?.('invalid-native-text-metrics');
        return line;
    }
    const output: BitmapTextDraw[] = [];
    const regions: PixelBounds[] = [];
    let from = 0, lineIndex = 0;
    while (from < boundaries.length - 1) {
        if (isBreak(from)) {
            from++;
            lineIndex++;
            continue;
        }
        const start = boundaries[from];
        if (start === undefined)
            return null;
        let chosen: {
            line: BitmapMeasuredLine;
            end: number;
        } | null = null;
        for (let end = from + 1; end < boundaries.length; end++) {
            if (isBreak(end - 1))
                break;
            const offset = boundaries[end];
            if (offset === undefined)
                return null;
            const line = measureLine(start, offset);
            if (line === null)
                return null;
            if ((line.ink?.width ?? 0) <= area.width)
                chosen = { line, end };
        }
        if (chosen === null) {
            rejected?.('no-grapheme-fits-safe-area-width');
            return null;
        }
        const { line } = chosen;
        const y = frame.y + lineIndex * advance;
        const ink = line.ink;
        if (ink !== null && (y + ink.y < area.y || y + ink.y + ink.height > area.y + area.height)) {
            rejected?.('text-exceeds-safe-area-height');
            return null;
        }
        const x = area.x - (ink?.x ?? 0) + (area.width - (ink?.width ?? 0)) * bitmapAlignmentFactor(frame.alignment);
        const placed = placeBitmapLine(line, { x, y, maxWidth: 1, lineHeight: advance });
        output.push(...placed.draws);
        regions.push(...placed.regions);
        from = chosen.end;
        if (isBreak(from))
            from++;
        lineIndex++;
    }
    return { draws: output, regions };
}
