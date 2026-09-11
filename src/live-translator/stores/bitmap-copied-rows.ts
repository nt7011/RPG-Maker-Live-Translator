import type { BitmapCanvasWrite } from '../observer-hooks/bitmap/bitmap-command-observer.js';
import type { CanvasRectangle } from '../observer-hooks/canvas/canvas-appearance-operation.js';
import type { BitmapCommandAtom, BitmapTextBarriers } from './bitmap-command-rows.js';
import { boundsIntersect } from './bitmap-command-rows.js';
import { resolveBitmapSourceGeometry } from './bitmap-line-geometry.js';
import type { BitmapPixelDevice, PixelEffect } from '../gpu/bitmap-pixel-device.js';
import { BITMAP_LIMITS } from './bitmap-limits.js';
export interface BitmapCopiedRows {
    readonly atoms: readonly BitmapCommandAtom[];
    readonly barriers: BitmapTextBarriers;
    readonly width: number;
    readonly height: number;
    readonly release: () => void;
}
function contains(outer: CanvasRectangle, inner: CanvasRectangle): boolean {
    return (inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height);
}
function rowBounds(atom: BitmapCommandAtom): CanvasRectangle {
    const geometry = atom.geometry;
    return atom.effect === null && geometry !== null
        ? {
            x: geometry.textLeft,
            y: Math.min(geometry.y, geometry.y + geometry.lineHeight),
            width: geometry.textRight - geometry.textLeft,
            height: Math.abs(geometry.lineHeight),
        }
        : atom.bounds;
}
export function prepareBitmapCopiedRows(options: {
    readonly receipt: BitmapCanvasWrite;
    readonly atoms: readonly BitmapCommandAtom[];
    readonly barriers: BitmapTextBarriers;
    readonly device: Pick<BitmapPixelDevice, 'copyEffect' | 'releaseEffect' | 'measure'>;
    readonly admit: (count: number) => boolean;
    readonly reject: (reason: string, atoms: readonly BitmapCommandAtom[]) => void;
}): BitmapCopiedRows | null {
    const { receipt, atoms, device } = options;
    const operation = receipt.operation;
    if (atoms.length === 0)
        return null;
    const refuse = (reason: string) => {
        options.reject(reason, atoms);
        return null;
    };
    if (receipt.command !== null || operation?.kind !== 'image')
        return refuse('copy-operation-unavailable');
    if (!receipt.sourceIsBlank)
        return refuse('copy-destination-not-blank');
    if (operation.image === receipt.source)
        return refuse('copy-self-domain-unsupported');
    if (operation.state.alpha !== 1 ||
        operation.state.composite !== 'source-over' ||
        !operation.state.transform.every((value, index) => value === [1, 0, 0, 1, 0, 0][index]))
        return refuse('copy-paint-or-transform-unsupported');
    const from = operation.source, to = operation.destination;
    if (![from.x, from.y, from.width, from.height].every(Number.isInteger) ||
        from.width <= 0 ||
        from.height <= 0 ||
        !contains({ x: 0, y: 0, width: operation.image.width, height: operation.image.height }, from) ||
        to.x !== 0 ||
        to.y !== 0 ||
        to.width !== receipt.source.width ||
        to.height !== receipt.source.height ||
        from.width !== to.width ||
        from.height !== to.height)
        return refuse('copy-crop-or-scale-unsupported');
    const selected: BitmapCommandAtom[] = [], partial: BitmapCommandAtom[] = [];
    for (const atom of atoms) {
        if (atom.effect === null) {
            const geometry = atom.geometry;
            if (geometry !== null && atom.text.trim().length === 0 && contains(from, rowBounds(atom)))
                selected.push(atom);
            continue;
        }
        if (!boundsIntersect(from, atom.bounds))
            continue;
        if (contains(from, atom.bounds))
            selected.push(atom);
        else
            partial.push(atom);
    }
    if (partial.length > 0)
        options.reject('copy-crop-splits-text-effect', partial);
    if (selected.length === 0)
        return null;
    if (!options.admit(selected.length))
        return refuse('copy-evidence-capacity');
    const effects = new Map<PixelEffect, PixelEffect>();
    let transferred = false;
    try {
        const copies: BitmapCommandAtom[] = [];
        for (const atom of selected) {
            let effect = atom.effect === null ? null : effects.get(atom.effect);
            if (effect === undefined && atom.effect !== null) {
                const copied = device.copyEffect(atom.effect, operation.image, receipt.source, -from.x, -from.y);
                if (copied === null)
                    return refuse('copy-pixel-evidence-unavailable');
                effects.set(atom.effect, (effect = copied));
            }
            if (effect === undefined)
                throw new Error('Missing copied text effect.');
            const layout = Object.freeze({
                ...atom.layout,
                placement: Object.freeze({
                    ...atom.layout.placement,
                    x: atom.layout.placement.x - from.x,
                    y: atom.layout.placement.y - from.y,
                }),
            });
            const bounds = rowBounds(atom);
            copies.push(Object.freeze({
                ...atom,
                effect,
                layout,
                bounds: Object.freeze({ ...bounds, x: bounds.x - from.x, y: bounds.y - from.y }),
                geometry: resolveBitmapSourceGeometry(layout, device.measure(atom.text, layout.paint).width),
            }));
        }
        const barriers = options.barriers === null
            ? null
            : Object.freeze([...options.barriers, ...new Map(partial.map((atom) => [atom.effect, atom.bounds])).values()]
                .filter((area) => boundsIntersect(area, from))
                .map((area) => {
                const x = Math.max(area.x, from.x), y = Math.max(area.y, from.y);
                return Object.freeze({
                    x: x - from.x,
                    y: y - from.y,
                    width: Math.min(area.x + area.width, from.x + from.width) - x,
                    height: Math.min(area.y + area.height, from.y + from.height) - y,
                });
            }));
        const handles = [...effects.values()];
        const release = releaseCopiedEffects(device, handles);
        transferred = true;
        return Object.freeze({
            atoms: Object.freeze(copies),
            barriers: barriers !== null && barriers.length > BITMAP_LIMITS.textBarriers ? null : barriers,
            width: receipt.source.width,
            height: receipt.source.height,
            release,
        });
    }
    finally {
        if (!transferred)
            for (const effect of effects.values())
                device.releaseEffect(effect);
    }
}
function releaseCopiedEffects(device: Pick<BitmapPixelDevice, 'releaseEffect'>, effects: readonly PixelEffect[]) {
    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        for (const effect of effects)
            device.releaseEffect(effect);
    };
}
