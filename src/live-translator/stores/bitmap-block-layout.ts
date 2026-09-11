import { bitmapAlignmentFactor, type BitmapLineFrame } from './bitmap-line-geometry.js';
import { characters, hasWholeGraphemeStyles, type StyledText, type TextPaint } from './styled-text.js';
import { bitmapTextBaseline, validTextMetrics, type BitmapTextDraw, type BitmapTextMeasure, type BitmapTextMetrics, } from './bitmap-text-layout.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
interface MeasuredRun {
    readonly text: string;
    readonly paint: TextPaint;
    readonly metrics: BitmapTextMetrics;
}
interface Line {
    readonly runs: readonly MeasuredRun[];
    readonly width: number;
    readonly left: number;
    readonly top: number;
    readonly bottom: number;
}
const glyphMargin = 1;
function hasInk(metrics: BitmapTextMetrics): boolean {
    return metrics.left + metrics.right > 0 && metrics.ascent + metrics.descent > 0;
}
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
    let measurements = 0, units = 0;
    function measureLine(start: number, end: number): Line | null {
        if (++measurements > 2048 || (units += end - start) > 262144) {
            rejected?.('block-measurement-budget-exceeded');
            return null;
        }
        const runs: MeasuredRun[] = [];
        let width = 0, left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (const [index, run] of source.runs.entries()) {
            const from = Math.max(start, source.runs[index - 1]?.end ?? 0), to = Math.min(end, run.end);
            if (from >= to)
                continue;
            const text = source.text.slice(from, to), metrics = measure(text, run.paint);
            if (!validTextMetrics(metrics)) {
                rejected?.('invalid-native-text-metrics');
                return null;
            }
            const baseline = bitmapTextBaseline({ x: 0, y: 0, maxWidth: area.width, lineHeight: advance }, run.paint);
            if (hasInk(metrics)) {
                left = Math.min(left, width - metrics.left - glyphMargin);
                right = Math.max(right, width + metrics.right + glyphMargin);
                top = Math.min(top, baseline - metrics.ascent - glyphMargin);
                bottom = Math.max(bottom, baseline + metrics.descent + glyphMargin);
            }
            width += metrics.width;
            runs.push({ text, paint: run.paint, metrics });
        }
        return left === Infinity
            ? { runs, width: 0, left: 0, top: 0, bottom: 0 }
            : { runs, width: right - left, left, top, bottom };
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
            line: Line;
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
            if (line.width <= area.width)
                chosen = { line, end };
        }
        if (chosen === null) {
            rejected?.('no-grapheme-fits-safe-area-width');
            return null;
        }
        const { line } = chosen;
        const y = frame.y + lineIndex * advance;
        if (line.width > 0 && (y + line.top < area.y || y + line.bottom > area.y + area.height)) {
            rejected?.('text-exceeds-safe-area-height');
            return null;
        }
        let x = area.x - line.left + (area.width - line.width) * bitmapAlignmentFactor(frame.alignment);
        for (const run of line.runs) {
            if (hasInk(run.metrics)) {
                const baseline = bitmapTextBaseline({ x, y, maxWidth: area.width, lineHeight: advance }, run.paint);
                regions.push({
                    x: x - run.metrics.left - glyphMargin,
                    y: baseline - run.metrics.ascent - glyphMargin,
                    width: run.metrics.left + run.metrics.right + 2 * glyphMargin,
                    height: run.metrics.ascent + run.metrics.descent + 2 * glyphMargin,
                });
            }
            output.push({
                text: run.text,
                layout: {
                    paint: run.paint,
                    alignment: 'left',
                    placement: { x, y, maxWidth: Math.max(1, run.metrics.width), lineHeight: advance },
                },
            });
            x += run.metrics.width;
        }
        from = chosen.end;
        if (isBreak(from))
            from++;
        lineIndex++;
    }
    return { draws: output, regions };
}
