import { createStyledText, type StyledText } from './styled-text.js';
import type { BitmapDrawRef } from '../semantic-adapters/contract.js';
import type { PixelBounds, PixelEffect } from '../gpu/bitmap-pixel-device.js';
import type { BitmapTextLayout } from './bitmap-text-layout.js';
import { bitmapLineFrame, orderedBitmapAdvances, sameBitmapRow, type BitmapLineFrame, type BitmapSourceGeometry, } from './bitmap-line-geometry.js';
export interface BitmapCommandAtom {
    readonly text: string;
    readonly layout: BitmapTextLayout;
    readonly geometry: BitmapSourceGeometry | null;
    readonly effect: PixelEffect | null;
    readonly bounds: PixelBounds;
    readonly sequence: number;
    readonly draw?: BitmapDrawRef;
}
export interface BitmapCommandRow {
    readonly atoms: readonly BitmapCommandAtom[];
    readonly reading: readonly BitmapCommandAtom[];
    readonly effects: readonly PixelEffect[];
    readonly source: StyledText;
    readonly frame: BitmapLineFrame;
}
export type BitmapTextBarriers = readonly PixelBounds[] | null;
export function boundsIntersect(a: PixelBounds, b: PixelBounds): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
export function supportsBitmapCommandOrder(reading: readonly BitmapCommandAtom[], barriers: BitmapTextBarriers = []): boolean {
    const effect = reading[0]?.effect;
    if (barriers === null && reading.length > 1 && (effect == null || reading.some((atom) => atom.effect !== effect)))
        return false;
    const rows = new Map<number, Map<number, BitmapSourceGeometry>>();
    for (const atom of reading) {
        const geometry = atom.geometry;
        if (geometry === null)
            return false;
        const heights = rows.getOrInsertComputed(geometry.y, () => new Map());
        const previous = heights.get(geometry.lineHeight);
        if (previous !== undefined) {
            if (!orderedBitmapAdvances(previous, geometry))
                return false;
            if (barriers?.some((area) => area.x >= previous.textRight &&
                area.x + area.width <= geometry.textLeft &&
                area.width > 0 &&
                area.height > 0 &&
                area.y < Math.max(geometry.y, geometry.y + geometry.lineHeight) &&
                area.y + area.height > Math.min(geometry.y, geometry.y + geometry.lineHeight)))
                return false;
        }
        heights.set(geometry.lineHeight, geometry);
    }
    return true;
}
export function assembleBitmapCommandRows(atoms: readonly BitmapCommandAtom[], barriers: BitmapTextBarriers = []): readonly BitmapCommandRow[] {
    const captures = new Map<PixelEffect | BitmapCommandAtom, BitmapCommandAtom[]>();
    for (const atom of atoms) {
        const key = atom.effect ?? atom;
        captures.getOrInsertComputed(key, () => []).push(atom);
    }
    const result: BitmapCommandRow[] = [];
    function emit(members: readonly BitmapCommandAtom[]): boolean {
        const reading = members.toSorted((a, b) => (a.geometry?.textLeft ?? 0) - (b.geometry?.textLeft ?? 0));
        const first = reading[0];
        if (first?.geometry == null || !supportsBitmapCommandOrder(reading, barriers))
            return false;
        let direction = 0;
        const effects = new Map<PixelEffect, number>();
        for (const [index, atom] of reading.entries()) {
            if (atom.geometry === null || !sameBitmapRow(first.geometry, atom.geometry))
                return false;
            const previous = reading[index - 1];
            if (previous !== undefined) {
                const step = Math.sign(atom.sequence - previous.sequence);
                if (step === 0 || (direction !== 0 && step !== direction))
                    return false;
                direction = step;
            }
            if (atom.effect !== null)
                effects.set(atom.effect, (effects.get(atom.effect) ?? 0) + 1);
        }
        if (effects.entries().some(([effect, count]) => captures.get(effect)?.length !== count))
            return false;
        if (effects.size === 0 && members.some((atom) => atom.text.trim().length !== 0))
            return false;
        const chronological = members.toSorted((a, b) => a.sequence - b.sequence);
        result.push({
            atoms: chronological,
            reading,
            effects: [...new Set(chronological.flatMap((atom) => (atom.effect === null ? [] : [atom.effect])))],
            source: createStyledText(reading.map((atom) => ({ text: atom.text, paint: atom.layout.paint }))),
            frame: bitmapLineFrame(reading.flatMap((atom) => (atom.geometry === null ? [] : [atom.geometry]))),
        });
        return true;
    }
    const spatial = atoms.toSorted((a, b) => a.layout.placement.y - b.layout.placement.y ||
        a.layout.placement.lineHeight - b.layout.placement.lineHeight ||
        a.layout.placement.x - b.layout.placement.x ||
        a.sequence - b.sequence);
    let component: BitmapCommandAtom[] = [], right = -Infinity;
    function finish(): void {
        if (component.length === 0 || emit(component))
            return;
        const units = new Set(component.map((atom) => atom.effect ?? atom));
        for (const unit of units) {
            const members = captures.get(unit);
            if (members !== undefined && members.length < component.length)
                emit(members);
        }
    }
    for (const atom of spatial) {
        const first = component[0];
        const p = atom.layout.placement;
        if (first !== undefined && (!sameBitmapRow(first.layout.placement, p) || p.x > right)) {
            finish();
            component = [];
            right = -Infinity;
        }
        component.push(atom);
        right = Math.max(right, p.x + p.maxWidth);
    }
    finish();
    return result.sort((a, b) => (a.atoms[0]?.sequence ?? 0) - (b.atoms[0]?.sequence ?? 0));
}
