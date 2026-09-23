import { bitmapTextBaseline, type BitmapTextLayout } from '../stores/bitmap-text-layout.js';
import type { PixelTextCandidate } from './bitmap-pixel-types.js';
export function drawText(context: CanvasRenderingContext2D, text: string, layout: BitmapTextLayout, dx = 0, dy = 0): void {
    const { placement, paint, alignment } = layout;
    let x = placement.x + dx;
    if (alignment === 'center')
        x += placement.maxWidth / 2;
    if (alignment === 'right')
        x += placement.maxWidth;
    const y = bitmapTextBaseline(placement, paint) + dy;
    context.font = paint.font;
    context.textAlign = alignment;
    context.textBaseline = 'alphabetic';
    context.lineJoin = 'round';
    context.lineWidth = paint.outlineWidth;
    context.strokeStyle = paint.outlineColor;
    context.fillStyle = paint.textColor;
    context.globalAlpha = 1;
    context.strokeText(text, x, y, placement.maxWidth);
    context.globalAlpha = paint.bodyAlpha;
    context.fillText(text, x, y, placement.maxWidth);
}
export function drawTextGroup(context: CanvasRenderingContext2D, group: PixelTextCandidate, dx = 0, dy = 0): void {
    context.save();
    try {
        context.beginPath();
        for (const area of group.targetRegions)
            context.rect(area.x + dx, area.y + dy, area.width, area.height);
        context.clip();
        for (const draw of group.draws)
            drawText(context, draw.text, draw.layout, dx, dy);
    }
    finally {
        context.restore();
    }
}
