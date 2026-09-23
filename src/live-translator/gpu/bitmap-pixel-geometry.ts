import type { PixelBounds } from './bitmap-pixel-types.js';
export function intersection(area: PixelBounds, bounds: PixelBounds): PixelBounds | null {
    const x = Math.max(Math.floor(area.x), bounds.x), y = Math.max(Math.floor(area.y), bounds.y);
    const right = Math.min(Math.ceil(area.x + area.width), bounds.x + bounds.width);
    const bottom = Math.min(Math.ceil(area.y + area.height), bounds.y + bounds.height);
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
export function compactRegionStrips(regions: PixelBounds[]): void {
    if (regions.length < 2)
        return;
    const compare = (a: PixelBounds, b: PixelBounds) => a.y - b.y || a.height - b.height || a.x - b.x;
    let previous = regions[0];
    for (const region of regions) {
        if (previous !== undefined && compare(previous, region) > 0) {
            regions.sort(compare);
            break;
        }
        previous = region;
    }
    let written = 0;
    for (let read = 0; read < regions.length;) {
        const first = regions[read++];
        if (first === undefined)
            continue;
        let right = first.x + first.width;
        while (read < regions.length) {
            const next = regions[read];
            if (next?.y !== first.y || next.height !== first.height || next.x > right)
                break;
            right = Math.max(right, next.x + next.width);
            read++;
        }
        regions[written++] = right === first.x + first.width ? first : { ...first, width: right - first.x };
    }
    regions.length = written;
}
export function repaintCoversTargets(targets: readonly PixelBounds[], regions: readonly PixelBounds[]): boolean {
    let remaining = targets.length + regions.length;
    for (const area of targets) {
        const right = area.x + area.width, bottom = area.y + area.height;
        let covered = false;
        for (const region of regions) {
            if (remaining === 0)
                return false;
            remaining--;
            if (region.x <= area.x &&
                region.y <= area.y &&
                region.x + region.width >= right &&
                region.y + region.height >= bottom) {
                covered = true;
                break;
            }
        }
        if (!covered)
            return false;
    }
    return true;
}
