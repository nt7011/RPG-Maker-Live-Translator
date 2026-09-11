import type { BitmapTextAlignment, BitmapTextLayout, BitmapTextPlacement } from './bitmap-text-layout.js';
export interface BitmapSourceGeometry {
    readonly left: number;
    readonly right: number;
    readonly textLeft: number;
    readonly textRight: number;
    readonly y: number;
    readonly lineHeight: number;
    readonly alignment: BitmapTextAlignment;
}
export interface BitmapLineFrame {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly lineHeight: number;
    readonly alignment: BitmapTextAlignment;
}
export function bitmapAlignmentFactor(alignment: BitmapTextAlignment): number {
    return alignment === 'left' ? 0 : alignment === 'center' ? 0.5 : 1;
}
export function joinBitmapAlignment(a: BitmapTextAlignment, b: BitmapTextAlignment): BitmapTextAlignment {
    return a === 'left' || b === 'left' ? 'left' : a === 'right' || b === 'right' ? 'right' : 'center';
}
export function sameBitmapRow(a: Pick<BitmapTextPlacement, 'y' | 'lineHeight'>, b: Pick<BitmapTextPlacement, 'y' | 'lineHeight'>): boolean {
    return a.y === b.y && a.lineHeight === b.lineHeight;
}
export function resolveBitmapSourceGeometry(layout: BitmapTextLayout, measuredWidth: number): BitmapSourceGeometry | null {
    const { x, y, maxWidth, lineHeight } = layout.placement;
    if (![x, y, maxWidth, lineHeight, measuredWidth, x + maxWidth].every(Number.isFinite) ||
        maxWidth <= 0 ||
        measuredWidth < 0)
        return null;
    const advance = Math.min(measuredWidth, maxWidth);
    const textLeft = x + (maxWidth - advance) * bitmapAlignmentFactor(layout.alignment);
    return Object.freeze({
        left: x,
        right: x + maxWidth,
        textLeft,
        textRight: textLeft + advance,
        y,
        lineHeight,
        alignment: layout.alignment,
    });
}
export function bitmapLineFrame(members: readonly BitmapSourceGeometry[]): BitmapLineFrame {
    const first = members[0];
    if (first === undefined)
        throw new Error('A bitmap line requires source placement.');
    let left = first.textLeft, right = first.textRight, y = first.y, alignment: BitmapTextAlignment = 'center';
    for (const member of members) {
        left = Math.min(left, member.textLeft);
        right = Math.max(right, member.textRight);
        y = Math.min(y, member.y);
        alignment = joinBitmapAlignment(alignment, member.alignment);
    }
    return Object.freeze({ x: left, y, width: right - left, lineHeight: first.lineHeight, alignment });
}
export function sameBitmapLineFrame(a: BitmapLineFrame, b: BitmapLineFrame): boolean {
    return (a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.lineHeight === b.lineHeight &&
        a.alignment === b.alignment);
}
export function bitmapLineTextX(frame: BitmapLineFrame, advance: number): number {
    return frame.x + (frame.width - advance) * bitmapAlignmentFactor(frame.alignment);
}
export function orderedBitmapAdvances(a: BitmapSourceGeometry, b: BitmapSourceGeometry, tolerance = 0): boolean {
    return b.textLeft > a.textLeft && b.textLeft >= a.textRight - tolerance;
}
