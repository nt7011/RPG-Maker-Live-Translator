import { hasCurrentSpriteRows } from './bitmap-semantic-candidates.js';
import { anchorBitmapHorizontalRoom, sameBitmapLineFrame, sameBitmapRow, type BitmapLineFrame, } from './bitmap-line-geometry.js';
import { sameTextPaint, type StyledText, type TextPaint, type TextTranslation } from './styled-text.js';
import { bitmapTextSpacing, layoutBitmapText, type BitmapTextDraw, type BitmapTextMeasure, type BitmapTextMetrics, type BitmapTextLayoutResult, type BitmapSourceCharacterIndex, } from './bitmap-text-layout.js';
import { layoutBitmapBlock } from './bitmap-block-layout.js';
import { bitmapTextRevealEnd } from './bitmap-text-reveal.js';
import { prepareBitmapTargetText, bitmapTargetPrefix, type BitmapTargetText } from './bitmap-target-text.js';
import type { BitmapCommandAtom } from './bitmap-command-rows.js';
import { type BitmapTextAssociation, type BitmapAssociationCandidate } from './bitmap-text-associations.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
export interface BitmapAssociationLayout {
    readonly target: BitmapTargetText;
    readonly text: StyledText;
    readonly singleRowSpacing: boolean;
    readonly reading: readonly BitmapCommandAtom[];
    readonly frame: BitmapLineFrame;
    readonly horizontal: BitmapTextAssociation['horizontal'] | null;
    readonly allocation: PixelBounds | null;
    readonly rangeEnd: number | null;
    readonly block: boolean;
    readonly multiline: boolean;
    readonly draws: readonly BitmapTextDraw[];
    readonly fallback: BitmapTextLayoutResult | null;
    readonly visibleText: string;
    readonly targetRegions: readonly PixelBounds[];
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
export function supportsBitmapAssociationLayout(candidate: BitmapAssociationCandidate, index: BitmapSourceCharacterIndex | null, rejected?: (reason: string) => void): boolean {
    const clue = candidate.clue;
    if (clue === undefined)
        return true;
    if (clue.allocation !== null &&
        clue.sources.some((source) => source.family === 'sprite' && !hasCurrentSpriteRows(source, clue.members))) {
        rejected?.('sprite-block:incomplete-current-rows');
        return false;
    }
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
    if (!supportsBitmapAssociationLayout(association, sourceIndex, rejected))
        return null;
    const clue = association.clue, horizontal = association.horizontal ?? null, rangeEnd = clue?.rangeEnd ?? null;
    if (horizontal !== null &&
        (!Number.isFinite(horizontal.left) || !Number.isFinite(horizontal.right) || horizontal.right <= horizontal.left)) {
        rejected?.('horizontal-room-unavailable');
        return null;
    }
    let area = clue?.allocation ?? null;
    if (area !== null && horizontal !== null) {
        const x = Math.max(area.x, horizontal.left);
        area = { ...area, x, width: Math.min(area.x + area.width, horizontal.right) - x };
    }
    if (clue !== undefined && area === null && association.groups.length !== 1) {
        rejected?.('separate-bitmap-groups-require-usable-area');
        return null;
    }
    const singleRowSpacing = clue !== undefined && area === null;
    const target = prepareBitmapTargetText(association.source, translation, rangeEnd, clue?.template != null && sourceIndex !== null ? { template: clue.template, index: sourceIndex } : null, previous?.target ?? null);
    const painted = previous !== null && previous.target === target && previous.singleRowSpacing === singleRowSpacing;
    const { text, reveal, targetCharacterLayout } = target;
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
    const multiline = clue?.complete === true || finished;
    if (previous !== null &&
        painted &&
        previous.rangeEnd === rangeEnd &&
        previous.multiline === multiline &&
        sameBitmapLineFrame(previous.frame, association.frame) &&
        previous.horizontal?.left === horizontal?.left &&
        previous.horizontal?.right === horizontal?.right &&
        sameArea(previous.allocation, area) &&
        previous.reading.length === association.reading.length &&
        previous.reading.every((atom, index) => atom === association.reading[index]))
        return previous;
    const prefix = bitmapTargetPrefix(text, end);
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
        previous.block &&
        previous.multiline === multiline &&
        previous.visibleText === visible.text &&
        sameArea(previous.allocation, area) &&
        previous.frame.y === association.frame.y &&
        previous.frame.alignment === association.frame.alignment &&
        previous.frame.lineHeight === association.frame.lineHeight;
    const measuredBlock = area !== null && !retainedBlock
        ? layoutBitmapBlock(visible, association.frame, area, currentMeasure, rejected)
        : null;
    const line = block
        ? null
        : layoutBitmapText(visible, horizontal === null
            ? association.frame
            : {
                ...association.frame,
                x: horizontal.left,
                width: horizontal.right - horizontal.left,
            }, currentMeasure);
    const nativeRow = association.reading.length > 0 &&
        association.reading.every((atom) => sameBitmapRow(atom.layout.placement, association.frame));
    const left = Math.max(association.frame.x, area?.x ?? horizontal?.left ?? -Infinity);
    const right = Math.min(association.frame.x + association.frame.width, area === null ? (horizontal?.right ?? Infinity) : area.x + area.width);
    const room = anchorBitmapHorizontalRoom(association.frame, left, right);
    const fitted = nativeRow && (block || horizontal !== null) && room.right > room.left
        ? layoutBitmapText(bitmapTextSpacing(prefix), { ...association.frame, x: room.left, width: room.right - room.left }, currentMeasure)
        : null;
    const usableFit = fitted !== null &&
        (area === null ||
            fitted.regions.every((region) => Math.max(0, region.y) >= area.y && region.y + region.height <= area.y + area.height))
        ? fitted
        : null;
    let preferred = retainedBlock
        ? { draws: previous.draws, regions: previous.targetRegions }
        : block
            ? measuredBlock
            : line;
    if (block &&
        !multiline &&
        preferred?.draws.some((draw) => draw.layout.placement.y !== preferred?.draws[0]?.layout.placement.y)) {
        rejected?.('partial-source-cannot-authorize-multiline-layout');
        preferred = null;
    }
    const draws = preferred?.draws ?? usableFit?.draws ?? null;
    const targetRegions = preferred?.regions ?? usableFit?.regions ?? [];
    const fallback = preferred === null ? null : usableFit;
    if (draws === null) {
        if (!block)
            rejected?.('single-row-layout-unavailable');
        return null;
    }
    return {
        target,
        text,
        singleRowSpacing,
        reading: association.reading,
        frame: association.frame,
        horizontal,
        allocation: area,
        rangeEnd,
        block: block && preferred !== null,
        multiline,
        draws,
        fallback,
        visibleText: visible.text,
        targetRegions,
        measurement,
    };
}
