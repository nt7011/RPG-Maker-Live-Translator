import { sameBitmapLineFrame, type BitmapLineFrame } from './bitmap-line-geometry.js';
import { bindTextTranslation, createStyledText, sameTextPaint, type StyledText, type TextPaint, type TextTranslation, } from './styled-text.js';
import { bitmapTextSpacing, indexBitmapSourceCharacters, layoutBitmapText, supportsBitmapCharacterText, type BitmapTextDraw, type BitmapTextMeasure, type BitmapTextMetrics, type BitmapSourceCharacterIndex, } from './bitmap-text-layout.js';
import { layoutBitmapBlock } from './bitmap-block-layout.js';
import { createBitmapTextReveal, bitmapTextRevealEnd, type BitmapTextReveal } from './bitmap-text-reveal.js';
import type { BitmapCommandAtom } from './bitmap-command-rows.js';
import type { BitmapTextAssociation, BitmapAssociationCandidate } from './bitmap-text-associations.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
export interface BitmapAssociationLayout {
    readonly translation: TextTranslation;
    readonly text: StyledText;
    readonly targetCharacterLayout: boolean;
    readonly reveal: BitmapTextReveal | null;
    readonly bindingEnds: readonly number[];
    readonly bindingComplete: boolean;
    readonly paintEnds: readonly number[];
    readonly palette: readonly TextPaint[];
    readonly singleRowSpacing: boolean;
    readonly reading: readonly BitmapCommandAtom[];
    readonly frame: BitmapLineFrame;
    readonly allocation: PixelBounds | null;
    readonly rangeEnd: number | null;
    readonly draws: readonly BitmapTextDraw[];
    readonly visibleText: string;
    readonly targetRegions: readonly PixelBounds[] | null;
    readonly measurement: {
        readonly text: string;
        readonly paint: TextPaint;
        readonly metrics: BitmapTextMetrics;
    } | null;
}
function sameArea(a: PixelBounds | null, b: PixelBounds | null): boolean {
    return (a === b ||
        (a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height));
}
function covered(ends: readonly number[], end: number): number {
    let lo = 0, hi = ends.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if ((ends[mid] ?? Infinity) <= end)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo;
}
function styledPrefix(source: StyledText, end: number): StyledText {
    if (end === source.text.length)
        return source;
    return createStyledText(source.runs.flatMap((run, index) => {
        const from = source.runs[index - 1]?.end ?? 0;
        return from >= end ? [] : [{ text: source.text.slice(from, Math.min(end, run.end)), paint: run.paint }];
    }));
}
export function supportsBitmapAssociation(candidate: BitmapAssociationCandidate, index: BitmapSourceCharacterIndex | null, rejected?: (reason: string) => void): boolean {
    const clue = candidate.clue;
    if (clue === undefined)
        return true;
    if (!candidate.atoms.some((atom) => atom.effect !== null)) {
        rejected?.('no-captured-text-effect');
        return false;
    }
    if (clue.allocation === null && new Set(candidate.reading.map((atom) => atom.layout.placement.y)).size > 1) {
        rejected?.('separate-bitmap-groups-require-usable-area');
        return false;
    }
    if (clue.complete) {
        if (clue.sources.length !== 1) {
            rejected?.('multiple-sources-cannot-authorize-reveal');
            return false;
        }
        if (index === null ||
            clue.members.some((member) => !boundary(index, member.start) || !boundary(index, member.end))) {
            rejected?.(index === null ? 'source-character-index-unavailable' : 'draw-range-splits-source-grapheme');
            return false;
        }
        if (clue.rangeEnd !== null && clue.rangeEnd < (index.drawableEnds.at(-1) ?? 0)) {
            if (!index.supported)
                rejected?.('source-shaping-unsupported-for-reveal');
            return index.supported;
        }
    }
    return true;
}
function boundary(index: BitmapSourceCharacterIndex, offset: number): boolean {
    return offset === 0 || index.ends[covered(index.ends, offset) - 1] === offset;
}
export function layoutBitmapAssociation(association: BitmapTextAssociation, translation: TextTranslation, measure: BitmapTextMeasure, previous: BitmapAssociationLayout | null, sourceIndex: BitmapSourceCharacterIndex | null, rejected?: (reason: string) => void): BitmapAssociationLayout | null {
    const clue = association.clue, area = clue?.allocation ?? null, rangeEnd = clue?.rangeEnd ?? null;
    if (clue !== undefined && area === null && association.groups.length !== 1) {
        rejected?.('separate-bitmap-groups-require-usable-area');
        return null;
    }
    const singleRowSpacing = clue !== undefined && area === null;
    const painted = previous !== null &&
        previous.translation === translation &&
        previous.singleRowSpacing === singleRowSpacing &&
        previous.palette.length === association.source.runs.length &&
        (previous.bindingComplete || previous.rangeEnd === rangeEnd) &&
        previous.paintEnds.every((end, index) => index === previous.paintEnds.length - 1 || end === association.source.runs[index]?.end) &&
        previous.palette.every((paint, index) => {
            const native = association.source.runs[index];
            return native !== undefined && sameTextPaint(paint, native.paint);
        });
    const bindingEnds = previous?.translation === translation
        ? previous.bindingEnds
        : indexBitmapSourceCharacters(translation.text).drawableEnds;
    const binding = clue?.template != null && sourceIndex !== null
        ? { template: clue.template, sourceEnds: sourceIndex.drawableEnds, targetEnds: bindingEnds }
        : undefined;
    const reveal = previous?.translation === translation
        ? previous.reveal
        : clue?.template != null && sourceIndex !== null
            ? createBitmapTextReveal(clue.template, translation, sourceIndex)
            : null;
    let text: StyledText;
    let bindingComplete: boolean;
    if (painted) {
        text = previous.text;
        bindingComplete = previous.bindingComplete;
    }
    else {
        const bound = bindTextTranslation(translation, association.source, binding);
        text = bound;
        bindingComplete = bound.text === translation.text;
    }
    const targetCharacterLayout = painted ? previous.targetCharacterLayout : supportsBitmapCharacterText(text.text);
    let end = text.text.length, finished = true;
    if (clue?.complete === true) {
        if (sourceIndex === null ||
            reveal === null ||
            rangeEnd === null ||
            sourceIndex.drawableEnds.length === 0 ||
            clue.members.some((member) => !boundary(sourceIndex, member.start) || !boundary(sourceIndex, member.end))) {
            rejected?.('reveal-source-coverage-unavailable-or-splits-grapheme');
            return null;
        }
        const count = covered(sourceIndex.drawableEnds, rangeEnd);
        finished = count === sourceIndex.drawableEnds.length;
        if (!finished) {
            if (!targetCharacterLayout) {
                rejected?.('target-shaping-unsupported-for-reveal');
                return null;
            }
        }
        end = Math.min(end, bitmapTextRevealEnd(reveal, rangeEnd));
    }
    else if (clue !== undefined)
        finished =
            rangeEnd !== null && rangeEnd >= (sourceIndex?.drawableEnds.at(-1) ?? association.source.text.length);
    if (previous !== null &&
        painted &&
        previous.rangeEnd === rangeEnd &&
        sameBitmapLineFrame(previous.frame, association.frame) &&
        sameArea(previous.allocation, area) &&
        previous.reading.length === association.reading.length &&
        previous.reading.every((atom, index) => atom === association.reading[index]))
        return previous;
    const prefix = styledPrefix(text, end);
    const visible = singleRowSpacing ? bitmapTextSpacing(prefix) : prefix;
    let measurement = painted ? previous.measurement : null;
    const currentMeasure: BitmapTextMeasure = (value, paint) => {
        if (measurement?.text === value && sameTextPaint(measurement.paint, paint))
            return measurement.metrics;
        const metrics = measure(value, paint);
        measurement = { text: value, paint, metrics };
        return metrics;
    };
    const block = area !== null;
    const retainedBlock = block &&
        painted &&
        previous.visibleText === visible.text &&
        sameArea(previous.allocation, area) &&
        previous.frame.y === association.frame.y &&
        previous.frame.alignment === association.frame.alignment &&
        previous.frame.lineHeight === association.frame.lineHeight;
    const measuredBlock = block && !retainedBlock ? layoutBitmapBlock(visible, association.frame, area, currentMeasure, rejected) : null;
    const draws = retainedBlock
        ? previous.draws
        : block
            ? (measuredBlock?.draws ?? null)
            : layoutBitmapText(visible, association.frame, currentMeasure);
    const targetRegions = retainedBlock ? previous.targetRegions : (measuredBlock?.regions ?? null);
    if (draws === null) {
        if (!block)
            rejected?.('single-row-layout-unavailable');
        return null;
    }
    if (block &&
        clue?.complete !== true &&
        !finished &&
        draws.some((draw) => draw.layout.placement.y !== draws[0]?.layout.placement.y)) {
        rejected?.('partial-source-cannot-authorize-multiline-layout');
        return null;
    }
    return {
        translation,
        text,
        targetCharacterLayout,
        reveal,
        bindingEnds,
        bindingComplete,
        paintEnds: association.source.runs.map((run) => run.end),
        palette: association.source.runs.map((run) => run.paint),
        singleRowSpacing,
        reading: association.reading,
        frame: association.frame,
        allocation: area,
        rangeEnd,
        draws,
        visibleText: visible.text,
        targetRegions,
        measurement,
    };
}
