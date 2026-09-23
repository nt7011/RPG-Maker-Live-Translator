import type { BitmapSourceContradiction, BitmapSemanticProvenance, BitmapSemanticSource, } from './bitmap-semantic-clues.js';
import { intersectSemanticAreas, intersectBitmapAllocations } from './bitmap-semantic-clues.js';
import { anchorBitmapHorizontalRoom, bitmapLineFrame, orderedBitmapAdvances, sameBitmapRow, } from './bitmap-line-geometry.js';
import { supportsBitmapCommandOrder, type BitmapCommandAtom, type BitmapCommandRow, type BitmapTextBarriers, } from './bitmap-command-rows.js';
import { combineBitmapCandidates, type BitmapAssociationCandidate, type BitmapAssociationClue, } from './bitmap-text-associations.js';
import { createStyledText, joinStyledText } from './styled-text.js';
import { indexBitmapSourceCharacters, onlyBitmapTextSeparators, type BitmapSourceCharacterIndex, } from './bitmap-text-layout.js';
import type { BitmapDrawRef, BitmapSurfaceRef, TextObservationRef } from '../semantic-adapters/contract.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
import { bitmapSourceCorrespondence, composeBitmapSourceTemplates, type BitmapSourceCorrespondence, } from './bitmap-source-correspondence.js';
export interface BitmapRowCorrespondence {
    readonly members: readonly BitmapCommandAtom[];
    readonly sources: readonly BitmapSourceCorrespondence[];
}
export function bitmapRowCorrespondence(groups: readonly BitmapCommandRow[], surface: BitmapSurfaceRef, read: (draw: BitmapDrawRef) => readonly BitmapSemanticProvenance[], characters: (source: TextObservationRef) => BitmapSourceCharacterIndex | null): BitmapRowCorrespondence {
    const members = groups.flatMap((group) => group.reading);
    return {
        members,
        sources: bitmapSourceCorrespondence(members.map((atom) => ({
            text: atom.text,
            relations: atom.draw === undefined ? [] : read(atom.draw).filter((relation) => relation.surface === surface),
        })), characters),
    };
}
export function bitmapCommonSourceMembers(evidence: BitmapRowCorrespondence): readonly (readonly BitmapCommandAtom[])[] {
    return evidence.sources.map((source) => [...source.verified.keys()].map((index) => {
        const atom = evidence.members[index];
        if (atom === undefined)
            throw new Error('Missing verified source member.');
        return atom;
    }));
}
export function bitmapSemanticCandidates(groups: readonly BitmapCommandRow[], options: {
    readonly evidence: BitmapRowCorrespondence;
    readonly width: number;
    readonly height: number;
    readonly barriers?: BitmapTextBarriers;
    readonly complete: (source: TextObservationRef) => BitmapSemanticSource | null;
    readonly contradict: (source: TextObservationRef, reason: BitmapSourceContradiction) => void;
    readonly characters: (source: TextObservationRef) => BitmapSourceCharacterIndex | null;
    readonly rejected?: (atoms: readonly BitmapCommandAtom[], reason: string, source: BitmapSemanticSource, area?: PixelBounds | null) => void;
}): readonly BitmapAssociationCandidate[] {
    const conflicting = new Set<BitmapCommandAtom>();
    const spatial = groups
        .flatMap((group) => group.reading)
        .filter((atom) => atom.effect !== null || atom.text.trim().length > 0)
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
    const groupFor = new Map(groups.flatMap((group) => group.reading.map((atom) => [atom, group] as const)));
    const observations = options.evidence.sources.map((evidence) => {
        const members = new Map<BitmapCommandAtom, readonly BitmapSemanticProvenance[]>();
        const involved = new Set<BitmapCommandRow>();
        const ranges = new Map<BitmapCommandAtom, {
            readonly start: number;
            readonly end: number;
        }>();
        for (const [index, relations] of evidence.relations) {
            const atom = options.evidence.members[index], group = atom === undefined ? undefined : groupFor.get(atom);
            if (atom === undefined || group === undefined)
                continue;
            members.set(atom, relations);
            involved.add(group);
            const range = evidence.verified.get(index);
            if (range !== undefined)
                ranges.set(atom, range);
        }
        return { source: evidence.source, members, groups: involved, ranges };
    });
    const candidates: BitmapAssociationCandidate[] = [];
    const partials = new Map<BitmapCommandRow, BitmapAssociationCandidate[]>();
    for (const { source, members, groups: involved, ranges } of observations) {
        const token = source.observation;
        const participating = [...involved];
        const first = participating[0];
        if (first === undefined)
            continue;
        const complete = options.complete(token) !== null;
        const reject = options.rejected === undefined
            ? undefined
            : (reason: string, area?: PixelBounds | null) => options.rejected?.(participating.flatMap((group) => group.atoms), reason, source, area);
        const partial = participating.some((group) => group.atoms.some((atom) => !members.has(atom)));
        if (partial && participating.length !== 1) {
            reject?.('observation-covers-only-part-of-bitmap-group');
            continue;
        }
        if (!conflicting.isDisjointFrom(members)) {
            reject?.('conflicting-bitmap-source-advances');
            if (complete)
                options.contradict(token, 'conflicting-bitmap-source-advances');
            continue;
        }
        const entries = Array.from(members.keys(), (atom) => ({ atom, range: ranges.get(atom) ?? null }));
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
                options.contradict(token, 'source-order-contradicts-bitmap-order');
            continue;
        }
        const parts: {
            text: string;
            paint: BitmapCommandAtom['layout']['paint'];
        }[] = [];
        let cursor = 0, matched = ordered;
        let matchFailure: BitmapSourceContradiction = 'source-range-unavailable';
        for (const entry of entries) {
            const range = entry.range;
            if (range === null || range.start < cursor) {
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
            options.contradict(token, matchFailure);
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
        const offered = intersectSemanticAreas(members
            .values()
            .flatMap((relations) => relations.values().flatMap((relation) => (relation.area === null ? [] : [relation.area])))
            .toArray());
        const currentMembers = entries.flatMap((entry) => entry.range === null ? [] : [{ atom: entry.atom, ...entry.range }]);
        let proposedArea = offered?.kind === 'block' ? offered.rect : null;
        if (proposedArea !== null && source.family === 'sprite' && !hasCurrentSpriteRows(source, currentMembers)) {
            reject?.('sprite-block:incomplete-current-rows', proposedArea);
            proposedArea = null;
        }
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
                options.contradict(token, 'non-text-write-breaks-association');
            continue;
        }
        const atoms = reading.toSorted((a, b) => a.sequence - b.sequence);
        const frame = bitmapLineFrame(reading.flatMap((atom) => (atom.geometry === null ? [] : [atom.geometry])));
        const line = offered?.kind === 'line' &&
            !partial &&
            matched &&
            cursor === source.text.length &&
            reading.length === 1 &&
            offered.left >= 0 &&
            offered.right <= options.width
            ? anchorBitmapHorizontalRoom(frame, offered.left, offered.right)
            : null;
        const candidate: BitmapAssociationCandidate = {
            atoms,
            effects: [...new Set(atoms.flatMap((atom) => (atom.effect === null ? [] : [atom.effect])))],
            reading,
            source: styled,
            frame,
            ...(line === null ? {} : { horizontal: line }),
            clue: {
                sources: [source],
                allocation: partial ? proposedArea : area,
                rangeEnd: matched ? coveredEnd : null,
                complete: full,
                template: matched && (complete || cursor === source.text.length) ? source.template : null,
                index: matched ? options.characters(token) : null,
                members: currentMembers,
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
    const ordered: BitmapAssociationCandidate[] = [];
    for (const fragment of fragments.toSorted((a, b) => position(a) - position(b))) {
        const previous = ordered.at(-1);
        if (previous !== undefined && position(previous) === position(fragment)) {
            const combined = combineBitmapCandidates(previous, fragment);
            if (combined === null)
                return null;
            ordered[ordered.length - 1] = combined;
        }
        else
            ordered.push(fragment);
    }
    const first = ordered[0]?.clue;
    if (first === undefined)
        return null;
    const sources: [
        BitmapSemanticSource,
        ...BitmapSemanticSource[]
    ] = [first.sources[0]];
    const members: BitmapAssociationClue['members'][number][] = [];
    let cursor = 0, offset = 0;
    for (const [index, fragment] of ordered.entries()) {
        const clue = fragment.clue;
        if (clue?.template == null || clue.rangeEnd === null)
            return null;
        const source = clue.sources[0];
        if (source.family !== sources[0].family)
            return null;
        sources.push(...clue.sources.slice(index === 0 ? 1 : 0));
        for (const atom of fragment.reading)
            if (group.reading[cursor++] !== atom)
                return null;
        if (fragment.source.text !== clue.template.sourceText ||
            !onlyBitmapTextSeparators(source.text.slice(clue.rangeEnd)))
            return null;
        members.push(...clue.members.map((member) => ({ ...member, start: offset + member.start, end: offset + member.end })));
        offset += source.text.length;
    }
    if (cursor !== group.reading.length || sources.length < 2)
        return null;
    const source = joinStyledText(ordered.map((fragment) => fragment.source));
    const template = composeBitmapSourceTemplates(source, ordered.map((fragment) => {
        if (fragment.clue?.template == null)
            throw new Error('Missing composed source template.');
        return fragment.clue.template;
    }));
    return {
        ...group,
        source,
        clue: {
            sources,
            allocation: ordered.every((fragment) => fragment.clue?.allocation != null)
                ? intersectBitmapAllocations(ordered.flatMap((fragment) => fragment.clue?.allocation == null ? [] : [fragment.clue.allocation]))
                : null,
            rangeEnd: offset,
            complete: false,
            template,
            index: indexBitmapSourceCharacters(template.sourceText, (template.controls ?? [])
                .filter((control) => control.kind === 'pause')
                .map((control) => control.offset)),
            members,
        },
    };
}
export function hasCurrentSpriteRows(source: BitmapSemanticSource, entries: BitmapAssociationClue['members']): boolean {
    const text = source.nativeText;
    if (text !== source.text || entries.length < 2 || !/[\r\n\u2028\u2029]/u.test(text))
        return false;
    let cursor = 0;
    for (const [index, { atom, start, end }] of entries.entries()) {
        if (start < cursor ||
            end <= start ||
            text.slice(start, end) !== atom.text ||
            /[\r\n\u2028\u2029]/u.test(atom.text))
            return false;
        const gap = text.slice(cursor, start);
        if (index === 0 ? gap.length !== 0 : !/^(?:\r\n|[\r\n\u2028\u2029])+$/u.test(gap))
            return false;
        cursor = end;
    }
    return cursor === text.length;
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
