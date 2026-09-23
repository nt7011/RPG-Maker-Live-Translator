import type { BitmapCommandAtom } from './bitmap-command-rows.js';
import type { BitmapNativeField } from './bitmap-native-fields.js';
import { matchesTextTemplate, textTemplate, type TextTemplate } from './styled-text.js';
import { intersectBitmapAllocations, type BitmapSemanticSource } from './bitmap-semantic-clues.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
import type { BitmapSourceCharacterIndex } from './bitmap-text-layout.js';
export interface BitmapAssociationClue {
    readonly sources: readonly [
        BitmapSemanticSource,
        ...BitmapSemanticSource[]
    ];
    readonly allocation: PixelBounds | null;
    readonly rangeEnd: number | null;
    readonly complete: boolean;
    readonly template: TextTemplate | null;
    readonly index: BitmapSourceCharacterIndex | null;
    readonly members: readonly {
        readonly atom: BitmapCommandAtom;
        readonly start: number;
        readonly end: number;
    }[];
}
export interface BitmapAssociationCandidate extends BitmapNativeField {
    readonly clue?: BitmapAssociationClue;
}
export interface BitmapTextAssociation extends BitmapNativeField {
    readonly groups: readonly BitmapNativeField[];
    readonly clue?: BitmapAssociationClue;
}
export function combineBitmapCandidates(a: BitmapAssociationCandidate, b: BitmapAssociationCandidate): BitmapAssociationCandidate | null {
    if (a.reading.length !== b.reading.length ||
        a.reading.some((atom, index) => atom !== b.reading[index]) ||
        !matchesTextTemplate(a.clue?.template ?? textTemplate(a.source), b.clue?.template ?? textTemplate(b.source)))
        return null;
    const left = a.clue, right = b.clue;
    if (left === undefined || right === undefined)
        return left === right ? a : null;
    if (left.sources[0].family !== right.sources[0].family ||
        left.rangeEnd !== right.rangeEnd ||
        left.members.length !== right.members.length ||
        left.members.some((member, index) => {
            const other = right.members[index];
            return member.atom !== other?.atom || member.start !== other.start || member.end !== other.end;
        }))
        return null;
    const sources: [
        BitmapSemanticSource,
        ...BitmapSemanticSource[]
    ] = [
        left.sources[0],
        ...new Set([...left.sources.slice(1), ...right.sources].filter((source) => source !== left.sources[0])),
    ];
    const complete = left.complete && right.complete;
    if (sources.length > 1 && complete && a.source.text !== left.template?.sourceText)
        return null;
    return {
        ...a,
        ...(a.horizontal === undefined && b.horizontal === undefined
            ? {}
            : {
                horizontal: {
                    left: Math.max(a.horizontal?.left ?? -Infinity, b.horizontal?.left ?? -Infinity),
                    right: Math.min(a.horizontal?.right ?? Infinity, b.horizontal?.right ?? Infinity),
                },
            }),
        clue: {
            ...left,
            sources,
            allocation: intersectBitmapAllocations([left.allocation, right.allocation].flatMap((area) => (area === null ? [] : [area]))),
            complete: complete && sources.length === 1,
        },
    };
}
export function assembleBitmapTextAssociations(groups: readonly BitmapNativeField[], candidates: readonly BitmapAssociationCandidate[] = [], rejected?: (candidate: BitmapAssociationCandidate, reason: string) => void): readonly BitmapTextAssociation[] {
    const membership = new Map<BitmapCommandAtom, BitmapNativeField[]>();
    const effectGroups = new Map<NonNullable<BitmapCommandAtom['effect']>, Set<BitmapNativeField>>();
    const groupOrder = new Map(groups.map((group, index) => [group, index]));
    for (const group of groups)
        for (const atom of group.atoms) {
            membership.getOrInsertComputed(atom, () => []).push(group);
            if (atom.effect !== null) {
                effectGroups.getOrInsertComputed(atom.effect, () => new Set()).add(group);
            }
        }
    interface Membership {
        readonly next: Map<BitmapCommandAtom, Membership>;
        candidate: BitmapTextAssociation | null;
        ambiguous: boolean;
    }
    const suggestions: Membership = { next: new Map(), candidate: null, ambiguous: false };
    const leaves: Membership[] = [];
    for (const candidate of candidates) {
        const members = new Set(candidate.atoms);
        if (members.size === 0 ||
            members.size !== candidate.atoms.length ||
            candidate.reading.length !== members.size ||
            new Set(candidate.reading).size !== members.size ||
            candidate.reading.some((atom) => !members.has(atom)) ||
            candidate.atoms.some((atom) => !membership.has(atom))) {
            rejected?.(candidate, 'invalid-physical-membership');
            continue;
        }
        const selected = new Set(candidate.atoms.flatMap((atom) => membership.get(atom) ?? []));
        const participating = [...selected].sort((a, b) => (groupOrder.get(a) ?? 0) - (groupOrder.get(b) ?? 0));
        const partitions = new Set<object>();
        if (participating.some((group) => {
            if (group.partition === undefined)
                return false;
            if (partitions.has(group.partition))
                return true;
            partitions.add(group.partition);
            return false;
        })) {
            rejected?.(candidate, 'candidate-crosses-native-field');
            continue;
        }
        const positions = new Map(candidate.reading.map((atom, index) => [atom, index]));
        if (participating.some((group) => {
            let position = -1;
            for (const atom of group.reading) {
                const next = positions.get(atom) ?? -1;
                if (next <= position)
                    return true;
                position = next;
            }
            return group.atoms.some((atom) => !members.has(atom));
        })) {
            rejected?.(candidate, 'candidate-splits-or-reorders-bitmap-group');
            continue;
        }
        const effects = new Set(candidate.atoms.flatMap((atom) => (atom.effect === null ? [] : [atom.effect])));
        if (effects.values().some((effect) => effectGroups.get(effect)?.isSubsetOf(selected) === false)) {
            rejected?.(candidate, 'candidate-divides-shared-effect');
            continue;
        }
        let suggestion = suggestions;
        for (const atom of candidate.reading) {
            suggestion = suggestion.next.getOrInsertComputed(atom, () => ({
                next: new Map(),
                candidate: null,
                ambiguous: false,
            }));
        }
        if (suggestion.ambiguous) {
            rejected?.(candidate, 'competing-physical-membership');
            continue;
        }
        if (suggestion.candidate === null) {
            const limits = [...participating, candidate].flatMap((group) => group.horizontal === undefined ? [] : [group.horizontal]);
            suggestion.candidate = {
                ...candidate,
                groups: participating,
                ...(limits.length === 0
                    ? {}
                    : {
                        horizontal: {
                            left: Math.max(...limits.map((limit) => limit.left)),
                            right: Math.min(...limits.map((limit) => limit.right)),
                        },
                    }),
            };
            leaves.push(suggestion);
        }
        else {
            const combined = combineBitmapCandidates(suggestion.candidate, candidate);
            if (combined === null) {
                rejected?.(suggestion.candidate, 'competing-physical-membership');
                rejected?.(candidate, 'competing-physical-membership');
                suggestion.candidate = null;
                suggestion.ambiguous = true;
            }
            else
                suggestion.candidate = { ...combined, groups: participating };
        }
    }
    const admitted = leaves.flatMap((leaf) => (leaf.candidate === null ? [] : [leaf.candidate]));
    const claims = new Map<BitmapNativeField, number>();
    for (const candidate of admitted)
        for (const group of candidate.groups)
            claims.set(group, (claims.get(group) ?? 0) + 1);
    const unambiguous = admitted.filter((candidate) => candidate.groups.every((group) => claims.get(group) === 1));
    const accepted = new Set(unambiguous);
    const claimed = new Set(unambiguous.flatMap((candidate) => candidate.groups));
    if (rejected !== undefined)
        for (const candidate of admitted)
            if (!accepted.has(candidate))
                rejected(candidate, 'competing-physical-membership');
    const associations = [
        ...unambiguous,
        ...groups.filter((group) => !claimed.has(group)).map((group) => ({ ...group, groups: [group] })),
    ];
    return associations
        .filter((row) => row.effects.length > 0 || row.source.text.trim().length > 0)
        .sort((a, b) => (a.atoms[0]?.sequence ?? 0) - (b.atoms[0]?.sequence ?? 0));
}
function uniqueBitmapOverlaps(opposite: readonly BitmapTextAssociation[], queried: readonly BitmapTextAssociation[]): readonly (number | null | undefined)[] {
    interface Interval {
        readonly owner: number;
        readonly left: number;
        readonly right: number;
    }
    const rows = new Map<number, Map<number, {
        opposite: Interval[];
        queried: Interval[];
    }>>();
    for (const [side, associations] of [
        ['opposite', opposite],
        ['queried', queried],
    ] as const)
        for (const [owner, association] of associations.entries())
            for (const { frame } of association.groups) {
                const heights = rows.getOrInsertComputed(frame.y, () => new Map());
                const row = heights.getOrInsertComputed(frame.lineHeight, () => ({ opposite: [], queried: [] }));
                row[side].push({ owner, left: frame.x, right: frame.x + frame.width });
            }
    const matches: (number | null | undefined)[] = Array.from({ length: queried.length });
    for (const heights of rows.values())
        for (const row of heights.values()) {
            row.opposite.sort((a, b) => a.left - b.left);
            row.queried.sort((a, b) => a.right - b.right);
            let cursor = 0;
            let first: Interval | undefined, second: Interval | undefined;
            for (const query of row.queried) {
                while (cursor < row.opposite.length) {
                    const entry = row.opposite[cursor];
                    if (entry === undefined || entry.left > query.right)
                        break;
                    cursor++;
                    if (first?.owner === entry.owner) {
                        if (entry.right > first.right)
                            first = entry;
                    }
                    else if (first === undefined || entry.right > first.right) {
                        second = first;
                        first = entry;
                    }
                    else if (second === undefined || entry.right > second.right)
                        second = entry;
                }
                if (first === undefined || first.right < query.left)
                    continue;
                const prior = matches[query.owner];
                matches[query.owner] =
                    (second !== undefined && second.right >= query.left) ||
                        (prior !== undefined && prior !== first.owner)
                        ? null
                        : first.owner;
            }
        }
    return matches;
}
export function bitmapAssociationPredecessors<Previous extends BitmapTextAssociation>(previous: readonly Previous[], next: readonly BitmapTextAssociation[]): readonly (Previous | null)[] {
    const firstOwners = new Map<BitmapCommandAtom, Previous | null>();
    for (const row of previous) {
        const first = row.reading[0];
        if (first !== undefined)
            firstOwners.set(first, firstOwners.has(first) ? null : row);
    }
    const exact = next.map((row) => {
        const first = row.reading[0], old = first === undefined ? null : firstOwners.get(first);
        return old?.reading.length === row.reading.length &&
            old.reading.every((atom, index) => atom === row.reading[index])
            ? old
            : null;
    });
    const claims = new Map<Previous, number>();
    for (const old of exact)
        if (old !== null)
            claims.set(old, (claims.get(old) ?? 0) + 1);
    for (const [index, old] of exact.entries())
        if (old !== null && claims.get(old) !== 1)
            exact[index] = null;
    const retained = new Set(exact);
    const remaining = previous.filter((row) => !retained.has(row));
    const unresolved = next.filter((_, index) => exact[index] === null);
    const predecessors = uniqueBitmapOverlaps(remaining, unresolved);
    const successors = uniqueBitmapOverlaps(unresolved, remaining);
    let cursor = 0;
    return exact.map((match) => {
        if (match !== null)
            return match;
        const index = cursor++, old = predecessors[index];
        return old != null && successors[old] === index ? (remaining[old] ?? null) : null;
    });
}
export function planBitmapAssociationPredecessors<Previous extends BitmapTextAssociation>(previous: readonly Previous[], next: readonly BitmapTextAssociation[]): readonly (Previous | null)[] {
    const geometric = bitmapAssociationPredecessors(previous, next);
    const completePredecessors = new Map<object, Previous[]>();
    for (const prior of previous) {
        if (prior.clue?.complete !== true)
            continue;
        const token = prior.clue.sources[0].observation;
        completePredecessors.getOrInsertComputed(token, () => []).push(prior);
    }
    const predecessors = next.map((row, index) => {
        const old = geometric[index];
        if (row.clue?.complete === true) {
            const token = row.clue.sources[0].observation;
            if (old?.clue?.complete === true && old.clue.sources[0].observation === token)
                return old;
            const members = new Set(row.reading);
            const extensions = (completePredecessors.get(token) ?? []).filter((prior) => prior.reading.every((atom) => members.has(atom)));
            if (extensions.length === 1)
                return extensions[0] ?? null;
            return null;
        }
        return old?.clue?.complete === true ? null : (old ?? null);
    });
    const claims = new Map<Previous, number>();
    for (const prior of predecessors)
        if (prior != null)
            claims.set(prior, (claims.get(prior) ?? 0) + 1);
    for (const [index, prior] of predecessors.entries())
        if (prior != null && claims.get(prior) !== 1)
            predecessors[index] = null;
    return predecessors;
}
