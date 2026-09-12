import { bitmapLineFrame, orderedBitmapAdvances, sameBitmapRow } from './bitmap-line-geometry.js';
import { supportsBitmapCommandOrder, type BitmapCommandAtom, type BitmapCommandRow, type BitmapTextBarriers, } from './bitmap-command-rows.js';
import { copyTextTemplate, createStyledText, sameTextIgnoringWhitespace, textTemplate, type TextTemplate, } from './styled-text.js';
import { intersectSemanticAreas, type BitmapSemanticProvenance, type BitmapSemanticSource, } from './bitmap-semantic-clues.js';
import type { BitmapDrawRef, BitmapSurfaceRef, TextObservationRef } from '../semantic-adapters/contract.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
import { onlyBitmapTextSeparators, type BitmapSourceCharacterIndex } from './bitmap-text-layout.js';
export interface BitmapAssociationClue {
    readonly sources: readonly [
        BitmapSemanticSource,
        ...BitmapSemanticSource[]
    ];
    readonly allocation: PixelBounds | null;
    readonly rangeEnd: number | null;
    readonly complete: boolean;
    readonly template: TextTemplate | null;
    readonly members: readonly {
        readonly atom: BitmapCommandAtom;
        readonly start: number;
        readonly end: number;
    }[];
}
export interface BitmapAssociationCandidate extends BitmapCommandRow {
    readonly clue?: BitmapAssociationClue;
}
export interface BitmapTextAssociation extends BitmapCommandRow {
    readonly groups: readonly BitmapCommandRow[];
    readonly clue?: BitmapAssociationClue;
}
export function assembleBitmapTextAssociations(groups: readonly BitmapCommandRow[], candidates: readonly BitmapAssociationCandidate[] = [], rejected?: (candidate: BitmapAssociationCandidate, reason: string) => void): readonly BitmapTextAssociation[] {
    const membership = new Map<BitmapCommandAtom, BitmapCommandRow[]>();
    const effectGroups = new Map<NonNullable<BitmapCommandAtom['effect']>, Set<BitmapCommandRow>>();
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
        used: boolean;
    }
    const suggestions: Membership = { next: new Map(), used: false };
    const admitted: BitmapTextAssociation[] = [];
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
            suggestion = suggestion.next.getOrInsertComputed(atom, () => ({ next: new Map(), used: false }));
        }
        if (!suggestion.used)
            admitted.push({ ...candidate, groups: participating });
        suggestion.used = true;
    }
    const claims = new Map<BitmapCommandRow, number>();
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
export function bitmapSemanticCandidates(groups: readonly BitmapCommandRow[], options: {
    readonly surface: BitmapSurfaceRef;
    readonly width: number;
    readonly height: number;
    readonly barriers?: BitmapTextBarriers;
    readonly read: (draw: BitmapDrawRef) => readonly BitmapSemanticProvenance[];
    readonly complete: (source: TextObservationRef) => BitmapSemanticSource | null;
    readonly contradict: (source: TextObservationRef) => void;
    readonly characters: (source: TextObservationRef) => BitmapSourceCharacterIndex | null;
    readonly rejected?: (atoms: readonly BitmapCommandAtom[], reason: string, source: BitmapSemanticSource, area?: PixelBounds | null) => void;
}): readonly BitmapAssociationCandidate[] {
    const conflicting = new Set<BitmapCommandAtom>();
    const spatial = groups
        .flatMap((group) => group.reading)
        .toSorted((a, b) => a.layout.placement.y - b.layout.placement.y ||
        a.layout.placement.lineHeight - b.layout.placement.lineHeight ||
        (a.geometry?.textLeft ?? 0) - (b.geometry?.textLeft ?? 0));
    let furthest: BitmapCommandAtom | undefined;
    for (const atom of spatial) {
        const geometry = atom.geometry, previous = furthest?.geometry;
        if (geometry === null)
            continue;
        if (previous != null && furthest !== undefined && sameBitmapRow(previous, geometry)) {
            if (!orderedBitmapAdvances(previous, geometry)) {
                conflicting.add(furthest);
                conflicting.add(atom);
            }
            if (previous.textRight > geometry.textRight)
                continue;
        }
        furthest = atom;
    }
    const observations = new Map<TextObservationRef, {
        source: BitmapSemanticSource;
        members: Map<BitmapCommandAtom, BitmapSemanticProvenance[]>;
        groups: Set<BitmapCommandRow>;
    }>();
    for (const group of groups)
        for (const atom of group.reading) {
            if (atom.draw === undefined)
                continue;
            for (const relation of options.read(atom.draw)) {
                if (relation.surface !== options.surface)
                    continue;
                const token = relation.source.observation;
                const candidate = observations.getOrInsertComputed(token, () => ({
                    source: relation.source,
                    members: new Map(),
                    groups: new Set(),
                }));
                candidate.members.getOrInsertComputed(atom, () => []).push(relation);
                candidate.groups.add(group);
            }
        }
    const candidates: BitmapAssociationCandidate[] = [];
    const partials = new Map<BitmapCommandRow, BitmapAssociationCandidate[]>();
    for (const [token, { source, members, groups: involved }] of observations) {
        const participating = [...involved];
        const first = participating[0];
        if (first === undefined)
            continue;
        const complete = options.complete(token) !== null;
        const reject = options.rejected === undefined
            ? undefined
            : (reason: string, area?: PixelBounds | null) => options.rejected?.(participating.flatMap((group) => group.atoms), reason, source, area);
        const partial = participating.some((group) => group.atoms.some((atom) => !members.has(atom)));
        if (partial && (complete || participating.length !== 1)) {
            reject?.('observation-covers-only-part-of-bitmap-group');
            if (complete)
                options.contradict(token);
            continue;
        }
        if (!conflicting.isDisjointFrom(members)) {
            reject?.('conflicting-bitmap-source-advances');
            if (complete)
                options.contradict(token);
            continue;
        }
        const entries = Array.from(members, ([atom, relations]) => ({
            atom,
            range: relations.find((relation) => relation.range !== null)?.range ?? null,
        }));
        const ordered = entries.every((entry) => entry.range !== null);
        if (ordered)
            entries.sort((a, b) => (a.range?.start ?? 0) - (b.range?.start ?? 0));
        const reading = ordered
            ? entries.map((entry) => entry.atom)
            : first.reading.filter((atom) => members.has(atom));
        if (!ordered && participating.length > 1) {
            reject?.('ordered-source-ranges-unavailable');
            continue;
        }
        const positions = new Map(reading.map((atom, index) => [atom, index]));
        if (participating.some((group) => {
            let index = -1;
            for (const atom of group.reading) {
                if (!members.has(atom))
                    continue;
                const next = positions.get(atom) ?? -1;
                if (next <= index)
                    return true;
                index = next;
            }
            return false;
        })) {
            reject?.('source-order-contradicts-bitmap-order');
            if (complete)
                options.contradict(token);
            continue;
        }
        const parts: {
            text: string;
            paint: BitmapCommandAtom['layout']['paint'];
        }[] = [];
        let cursor = 0, matched = ordered;
        let matchFailure = 'source-range-unavailable';
        for (const entry of entries) {
            const range = entry.range;
            if (range === null ||
                range.start < cursor ||
                !sameTextIgnoringWhitespace(source.text.slice(range.start, range.end), entry.atom.text)) {
                matched = false;
                matchFailure = range === null ? 'source-range-unavailable' : 'source-range-overlap-or-text-mismatch';
                break;
            }
            const gap = source.text.slice(cursor, range.start);
            if (!onlyBitmapTextSeparators(gap)) {
                matched = false;
                matchFailure = cursor === 0 ? 'unpainted-source-prefix' : 'unpainted-source-content-between-draws';
                break;
            }
            parts.push({ text: gap + source.text.slice(range.start, range.end), paint: entry.atom.layout.paint });
            cursor = range.end;
        }
        const coveredEnd = cursor;
        const last = parts.at(-1);
        const lastDrawable = options.characters(token)?.drawableEnds.at(-1) ?? source.text.length;
        if (matched && last !== undefined && cursor >= lastDrawable) {
            last.text += source.text.slice(cursor);
            cursor = source.text.length;
        }
        const styled = matched ? createStyledText(parts) : first.source;
        if (complete && !matched) {
            reject?.(matchFailure);
            options.contradict(token);
            continue;
        }
        const full = complete && matched;
        if (partial && (!matched || cursor !== source.text.length)) {
            reject?.('observation-covers-only-part-of-bitmap-group');
            continue;
        }
        if ((!matched || (!full && cursor < source.text.length)) && participating.length > 1) {
            reject?.(matched ? 'incomplete-source-without-complete-source-clue' : matchFailure);
            continue;
        }
        const proposedArea = intersectSemanticAreas(members
            .values()
            .flatMap((relations) => relations.values().flatMap((relation) => (relation.area === null ? [] : [relation.area])))
            .toArray());
        const area = partial
            ? null
            : bitmapAllocation(proposedArea, options.width, options.height, (reason) => reject?.(reason, proposedArea));
        if (participating.some((group) => group.frame.lineHeight !== first.frame.lineHeight)) {
            reject?.('incompatible-bitmap-line-height');
            continue;
        }
        if (!supportsBitmapCommandOrder(reading)) {
            reject?.('source-order-contradicts-bitmap-advances');
            continue;
        }
        if (!supportsBitmapCommandOrder(reading, options.barriers)) {
            reject?.('non-text-write-breaks-association');
            if (complete)
                options.contradict(token);
            continue;
        }
        const atoms = reading.toSorted((a, b) => a.sequence - b.sequence);
        const candidate: BitmapAssociationCandidate = {
            atoms,
            effects: [...new Set(atoms.flatMap((atom) => (atom.effect === null ? [] : [atom.effect])))],
            reading,
            source: styled,
            frame: bitmapLineFrame(reading.flatMap((atom) => (atom.geometry === null ? [] : [atom.geometry]))),
            clue: {
                sources: [source],
                allocation: partial ? proposedArea : area,
                rangeEnd: matched ? coveredEnd : null,
                complete: full,
                template: matched && (complete || cursor === source.text.length) ? source.template : null,
                members: entries.flatMap((entry) => entry.range === null ? [] : [{ atom: entry.atom, ...entry.range }]),
            },
        };
        if (partial) {
            partials.getOrInsertComputed(first, () => []).push(candidate);
        }
        else
            candidates.push(candidate);
    }
    for (const [group, fragments] of partials) {
        const joined = composeBitmapLineClues(group, fragments);
        if (joined?.clue === undefined) {
            for (const fragment of fragments)
                if (fragment.clue !== undefined)
                    options.rejected?.(group.atoms, 'observation-covers-only-part-of-bitmap-group', fragment.clue.sources[0]);
            continue;
        }
        const clue = joined.clue;
        const area = bitmapAllocation(clue.allocation, options.width, options.height, (reason) => options.rejected?.(group.atoms, reason, clue.sources[0], clue.allocation));
        candidates.push({ ...joined, clue: { ...clue, allocation: area } });
    }
    return candidates;
}
function composeBitmapLineClues(group: BitmapCommandRow, fragments: readonly BitmapAssociationCandidate[]): BitmapAssociationCandidate | null {
    const positions = new Map(group.reading.map((atom, index) => [atom, index]));
    const position = (fragment: BitmapAssociationCandidate): number => {
        const atom = fragment.reading[0];
        return atom === undefined ? -1 : (positions.get(atom) ?? -1);
    };
    const ordered = fragments.toSorted((a, b) => position(a) - position(b));
    const first = ordered[0]?.clue;
    if (first === undefined)
        return null;
    const sources: [
        BitmapSemanticSource,
        ...BitmapSemanticSource[]
    ] = [first.sources[0]];
    const members: BitmapAssociationClue['members'][number][] = [];
    const controls: NonNullable<TextTemplate['controls']>[number][] = [];
    let cursor = 0, offset = 0;
    for (const [index, fragment] of ordered.entries()) {
        const clue = fragment.clue;
        if (clue === undefined || clue.complete || clue.sources.length !== 1)
            return null;
        const source = clue.sources[0];
        if (source.family !== sources[0].family)
            return null;
        if (index > 0)
            sources.push(source);
        for (const atom of fragment.reading)
            if (group.reading[cursor++] !== atom)
                return null;
        if (source.text !== fragment.reading.map((atom) => atom.text).join(''))
            return null;
        members.push(...clue.members.map((member) => ({ ...member, start: offset + member.start, end: offset + member.end })));
        controls.push(...(clue.template?.controls ?? []).map((control) => ({ ...control, offset: offset + control.offset })));
        offset += source.text.length;
    }
    if (cursor !== group.reading.length || sources.length < 2)
        return null;
    return {
        ...group,
        clue: {
            sources,
            allocation: ordered.every((fragment) => fragment.clue?.allocation != null)
                ? intersectSemanticAreas(ordered.flatMap((fragment) => fragment.clue?.allocation == null ? [] : [fragment.clue.allocation]))
                : null,
            rangeEnd: offset,
            complete: false,
            template: copyTextTemplate({
                ...textTemplate(group.source),
                ...(controls.length === 0 ? {} : { controls }),
            }),
            members,
        },
    };
}
function bitmapAllocation(allocation: PixelBounds | null, width: number, height: number, rejected: (reason: string) => void): PixelBounds | null {
    if (allocation === null)
        return null;
    if (allocation.x < 0 ||
        allocation.y < 0 ||
        allocation.x + allocation.width > width ||
        allocation.y + allocation.height > height) {
        rejected('allocation-outside-bitmap');
        return null;
    }
    return allocation;
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
    const predecessors = uniqueBitmapOverlaps(previous, next);
    const successors = uniqueBitmapOverlaps(next, previous);
    return predecessors.map((old, index) => old != null && successors[old] === index ? (previous[old] ?? null) : null);
}
