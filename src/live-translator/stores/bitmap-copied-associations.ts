import type { BitmapContent } from './bitmap-content.js';
import type { BitmapFragmentGroup, BitmapPhysicalMember, VisibleBitmapFragmentGroup, } from './bitmap-fragment-groups.js';
import { supportsBitmapFragmentOrder } from './bitmap-fragment-geometry.js';
import { bitmapCopiedClue, type BitmapCopiedClue, type BitmapCopiedField, type BitmapCopiedEvidence, type BitmapCopiedClueReader, } from './bitmap-fragment-clues.js';
import type { TextObservationRef } from '../semantic-adapters/contract.js';
export interface BitmapCopiedAssociation {
    readonly groups: readonly BitmapFragmentGroup[];
    readonly contents: readonly BitmapContent[];
    readonly members: readonly BitmapPhysicalMember[];
    readonly fields: readonly BitmapCopiedField[];
}
export interface BitmapCopiedCandidate {
    readonly visible: readonly VisibleBitmapFragmentGroup[];
    readonly fields: readonly BitmapCopiedField[];
}
function singleClue(owner: {
    readonly fields: readonly BitmapCopiedField[];
}): BitmapCopiedClue | null {
    return owner.fields.length === 1 ? (owner.fields[0]?.clue ?? null) : null;
}
export function completeSource(clue: BitmapCopiedClue | null): TextObservationRef | null {
    return clue?.complete === true ? (clue.sources[0]?.observation ?? null) : null;
}
export function sameClue(a: BitmapCopiedClue | null, b: BitmapCopiedClue | null): boolean {
    return (a === b ||
        (a !== null &&
            b !== null &&
            a.complete === b.complete &&
            a.end === b.end &&
            a.sources.length === b.sources.length &&
            a.sources.every((source, index) => source === b.sources[index])));
}
function sameGroups(occurrence: BitmapCopiedAssociation, candidate: BitmapCopiedCandidate): boolean {
    return (occurrence.groups.length === candidate.visible.length &&
        occurrence.groups.every((group, index) => group === candidate.visible[index]?.group));
}
export function sameContents(a: readonly BitmapContent[], b: readonly BitmapContent[]): boolean {
    return a.length === b.length && a.every((content, index) => content === b[index]);
}
export function bitmapCopiedCandidates(visible: readonly VisibleBitmapFragmentGroup[], evidence: ReadonlyMap<BitmapFragmentGroup, {
    readonly value: BitmapCopiedEvidence | null;
    readonly partition: readonly BitmapCopiedField[] | null;
}>, associations: Pick<WeakMap<BitmapFragmentGroup, BitmapCopiedAssociation>, 'get'>, reader?: BitmapCopiedClueReader): readonly BitmapCopiedCandidate[] {
    const proposals: BitmapCopiedCandidate[] = [];
    const sources = new Map<TextObservationRef, {
        item: VisibleBitmapFragmentGroup;
        value: BitmapCopiedEvidence;
    }[]>();
    for (const item of visible) {
        const entry = evidence.get(item.group);
        if (entry?.partition != null) {
            proposals.push({ visible: [item], fields: entry.partition });
            continue;
        }
        const value = entry?.value;
        if (value == null)
            continue;
        sources.getOrInsertComputed(value.source.observation, () => []).push({ item, value });
    }
    if (reader !== undefined)
        for (const entries of sources.values()) {
            entries.sort((a, b) => a.value.start - b.value.start);
            const selected = entries.map((entry) => entry.item);
            if (selected.length === 1 &&
                selected[0]?.group.members.length === 1 &&
                selected[0].group.contents[0]?.kind === 'text')
                continue;
            const clue = bitmapCopiedClue(selected.flatMap((item) => item.group.contents), reader);
            if (clue === null)
                continue;
            const candidate = {
                visible: selected,
                fields: [{ start: 0, end: selected.reduce((n, item) => n + item.group.contents.length, 0), clue }],
            };
            const old = selected[0] === undefined ? undefined : associations.get(selected[0].group);
            const unchanged = old !== undefined &&
                sameGroups(old, candidate) &&
                sameContents(old.contents, selected.flatMap((item) => item.group.contents));
            if (!unchanged && !supportsBitmapFragmentOrder(selected.flatMap((item) => item.fragments)))
                continue;
            proposals.push(candidate);
        }
    const claimed = new Set(proposals.flatMap((candidate) => candidate.visible.map((item) => item.group)));
    return [
        ...proposals,
        ...visible
            .filter((item) => item.group.baseline && !claimed.has(item.group))
            .map((item) => ({
            visible: [item],
            fields: [{ start: 0, end: item.group.contents.length, clue: null }],
        })),
    ];
}
export function bitmapCopiedPredecessors<Previous extends BitmapCopiedAssociation>(next: readonly BitmapCopiedCandidate[], occurrences: Iterable<Previous>, associations: Pick<WeakMap<BitmapFragmentGroup, Previous>, 'get'>): readonly (Previous | null)[] {
    const completePredecessors = new Map<WeakRef<object>, Previous[]>();
    if (next.some((candidate) => singleClue(candidate)?.complete === true))
        for (const old of occurrences) {
            const owner = old.members[0]?.owner;
            if (owner !== undefined && singleClue(old)?.complete === true)
                completePredecessors.getOrInsertComputed(owner, () => []).push(old);
        }
    const predecessors = next.map((candidate) => {
        const members = candidate.visible.flatMap((item) => item.group.members);
        const first = candidate.visible[0]?.group;
        const exact = first === undefined ? undefined : associations.get(first);
        const possible = new Set(exact === undefined ? [] : [exact]);
        if (singleClue(candidate)?.complete === true)
            for (const member of members)
                for (const old of completePredecessors.get(member.owner) ?? [])
                    possible.add(old);
        const matches = [...possible].filter((old) => {
            const prior = singleClue(old), clue = singleClue(candidate);
            if (sameGroups(old, candidate)) {
                return ((prior?.complete !== true && clue?.complete !== true) ||
                    (prior?.complete === true &&
                        clue?.complete === true &&
                        prior.end <= clue.end &&
                        completeSource(prior) === completeSource(clue)));
            }
            return (prior?.complete === true &&
                clue?.complete === true &&
                prior.end <= clue.end &&
                completeSource(prior) === completeSource(clue) &&
                old.members.every((member) => members.some((next) => next.owner === member.owner)));
        });
        return matches.length === 1 ? (matches[0] ?? null) : null;
    });
    const predecessorCounts = new Map<Previous, number>();
    for (const old of predecessors)
        if (old !== null)
            predecessorCounts.set(old, (predecessorCounts.get(old) ?? 0) + 1);
    for (const [index, old] of predecessors.entries())
        if (old !== null && predecessorCounts.get(old) !== 1)
            predecessors[index] = null;
    return predecessors;
}
export function bitmapCopiedFieldPredecessors<Previous extends BitmapCopiedField>(oldFields: readonly Previous[], oldMembers: readonly BitmapPhysicalMember[], fields: readonly BitmapCopiedField[], members: readonly BitmapPhysicalMember[]): readonly (Previous | null)[] {
    const firstOwners = new Map<WeakRef<object>, Previous | null>();
    for (const field of oldFields) {
        const owner = oldMembers[field.start]?.owner;
        if (owner !== undefined)
            firstOwners.set(owner, firstOwners.has(owner) ? null : field);
    }
    const predecessors = fields.map((field) => {
        const owner = members[field.start]?.owner;
        const old = owner === undefined ? null : firstOwners.get(owner);
        if (old == null)
            return null;
        const prior = oldMembers.slice(old.start, old.end);
        const growth = old.clue?.complete === true &&
            field.clue?.complete === true &&
            completeSource(old.clue) === completeSource(field.clue) &&
            old.clue.end <= field.clue.end;
        return (growth || (old.clue?.complete !== true && field.clue?.complete !== true)) &&
            (growth || prior.length === field.end - field.start) &&
            prior.every((member, index) => member.owner === members[field.start + index]?.owner)
            ? old
            : null;
    });
    const counts = new Map<Previous, number>();
    for (const prior of predecessors)
        if (prior !== null)
            counts.set(prior, (counts.get(prior) ?? 0) + 1);
    for (const [index, prior] of predecessors.entries())
        if (prior !== null && counts.get(prior) !== 1)
            predecessors[index] = null;
    return predecessors;
}
