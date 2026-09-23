import { bitmapFieldDomains, acceptBitmapFieldCuts, type BitmapFieldRange } from './bitmap-field-partition.js';
import { bitmapCommandRow, type BitmapCommandAtom, type BitmapCommandRow } from './bitmap-command-rows.js';
import { anchorBitmapHorizontalRoom } from './bitmap-line-geometry.js';
export interface BitmapNativeField extends BitmapCommandRow {
    readonly partition?: object;
    readonly horizontal?: {
        readonly left: number;
        readonly right: number;
    };
}
export interface BitmapNativeRowPlan {
    readonly row: BitmapCommandRow;
    readonly positions: ReadonlyMap<BitmapCommandAtom, number>;
    readonly domains: readonly BitmapFieldRange[] | null;
    readonly refusal: string | null;
}
export function prepareBitmapNativeRows(groups: readonly BitmapCommandRow[]): readonly BitmapNativeRowPlan[] {
    return groups.map((row) => {
        let refusal: string | null = null;
        const domains = bitmapFieldDomains(row.reading.map((atom) => ({
            text: atom.text,
            alignment: atom.layout.alignment,
            units: atom.effect === null ? [] : [atom.effect],
        })), (reason) => {
            refusal = reason;
        });
        return { row, domains, refusal, positions: new Map(row.reading.map((atom, index) => [atom, index])) };
    });
}
export function partitionBitmapRows(groups: readonly BitmapNativeRowPlan[], commonSources: readonly (readonly BitmapCommandAtom[])[] = [], refused?: (row: BitmapCommandRow, reason: string) => void): readonly BitmapNativeField[] {
    const byMember = new Map<BitmapCommandAtom, (readonly BitmapCommandAtom[])[]>();
    for (const source of commonSources)
        for (const atom of source)
            byMember.getOrInsertComputed(atom, () => []).push(source);
    return groups.flatMap(({ row, domains, refusal, positions }) => {
        if (refusal !== null)
            refused?.(row, refusal);
        const sources = new Set(row.reading.flatMap((atom) => byMember.get(atom) ?? []));
        const fields = acceptBitmapFieldCuts(domains, [...sources].map((source) => source.flatMap((atom) => {
            const index = positions.get(atom);
            return index === undefined ? [] : [index];
        })), (reason) => refused?.(row, reason));
        if (fields === null)
            return [row];
        const partition = {};
        const children = fields.map((field) => bitmapCommandRow(row.reading.slice(field.start, field.end)));
        return children.map((child, index) => {
            let left = Infinity, right = -Infinity;
            for (const atom of child.reading) {
                if (atom.geometry === null)
                    throw new Error('Partition lost native geometry.');
                left = Math.min(left, atom.geometry.left);
                right = Math.max(right, atom.geometry.right);
            }
            const prior = children[index - 1]?.frame, next = children[index + 1]?.frame;
            if (prior !== undefined)
                left = Math.max(left, prior.x + prior.width);
            if (next !== undefined)
                right = Math.min(right, next.x);
            return { ...child, partition, horizontal: anchorBitmapHorizontalRoom(child.frame, left, right) };
        });
    });
}
