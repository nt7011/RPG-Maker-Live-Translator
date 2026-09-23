import type { BitmapSemanticProvenance, BitmapSemanticSource } from './bitmap-semantic-clues.js';
import type { TextObservationRef } from '../semantic-adapters/contract.js';
import { characters, matchesTextTemplate, sameTextIgnoringWhitespace, copyTextTemplate, type StyledText, type TextTemplate, } from './styled-text.js';
import { onlyBitmapTextSeparators, type BitmapSourceCharacterIndex } from './bitmap-text-layout.js';
import type { BitmapFieldRange } from './bitmap-field-partition.js';
export interface BitmapSourceRange {
    readonly start: number;
    readonly end: number;
}
export interface BitmapSourceMember {
    readonly text: string;
    readonly relations: readonly BitmapSemanticProvenance[];
}
export interface BitmapSourceWitness extends BitmapFieldRange {
    readonly sources: readonly BitmapSemanticSource[];
    readonly spans: readonly BitmapSourceRange[];
}
export interface BitmapSourceCorrespondence {
    readonly source: BitmapSemanticSource;
    readonly relations: ReadonlyMap<number, readonly BitmapSemanticProvenance[]>;
    readonly verified: ReadonlyMap<number, BitmapSourceRange>;
    readonly witness: BitmapSourceWitness | null;
}
export function bitmapSourceCorrespondence(members: readonly BitmapSourceMember[], index?: (source: TextObservationRef) => BitmapSourceCharacterIndex | null): readonly BitmapSourceCorrespondence[] {
    const observations = new Map<TextObservationRef, {
        source: BitmapSemanticSource;
        entries: Map<number, BitmapSemanticProvenance[]>;
    }>();
    for (const [index, member] of members.entries())
        for (const relation of member.relations) {
            const observation = observations.getOrInsertComputed(relation.source.observation, () => ({
                source: relation.source,
                entries: new Map(),
            }));
            observation.entries.getOrInsertComputed(index, () => []).push(relation);
        }
    const result: BitmapSourceCorrespondence[] = [];
    for (const { source, entries } of observations.values()) {
        let first = -1, last = -1, cursor = 0, valid = true;
        const verified = new Map<number, BitmapSourceRange>();
        const sourceBoundaries = new Set([0, ...(index?.(source.observation)?.ends ?? [])]);
        let sourceOffset = 0;
        if (sourceBoundaries.size === 1)
            for (const character of characters(source.text))
                sourceBoundaries.add((sourceOffset += character.length));
        const spans: {
            start: number;
            end: number;
        }[] = [];
        for (const [index, relations] of entries) {
            const member = members[index];
            const ranges = relations.flatMap((relation) => (relation.range === null ? [] : [relation.range]));
            const range = ranges[0];
            if (member === undefined ||
                range === undefined ||
                ranges.some((other) => other.start !== range.start || other.end !== range.end) ||
                !sameTextIgnoringWhitespace(source.text.slice(range.start, range.end), member.text) ||
                !sourceBoundaries.has(range.start) ||
                !sourceBoundaries.has(range.end)) {
                valid = false;
                continue;
            }
            verified.set(index, range);
            if (range.start < cursor || !onlyBitmapTextSeparators(source.text.slice(cursor, range.start)))
                valid = false;
            if (last !== -1 && index !== last + 1)
                valid = false;
            if (first === -1)
                first = index;
            last = index;
            cursor = range.end;
            spans.push(range);
        }
        if (source.template.styleEnds.some((end) => !sourceBoundaries.has(end)) ||
            source.template.controls?.some((slot) => !sourceBoundaries.has(slot.offset)))
            valid = false;
        result.push({
            source,
            relations: entries,
            verified,
            witness: valid && first !== -1 && onlyBitmapTextSeparators(source.text.slice(cursor))
                ? { start: first, end: last + 1, sources: [source], spans }
                : null,
        });
    }
    return result;
}
export function bitmapFieldWitnesses(field: BitmapFieldRange, correspondence: readonly BitmapSourceCorrespondence[]): readonly BitmapSourceWitness[] {
    const witnesses = correspondence
        .flatMap(({ witness }) => witness !== null && witness.start >= field.start && witness.end <= field.end ? [witness] : [])
        .sort((a, b) => a.start - b.start || a.end - b.end);
    const accepted: BitmapSourceWitness[] = [];
    let cursor = field.start;
    for (const witness of witnesses) {
        const previous = accepted.at(-1), source = witness.sources[0], prior = previous?.sources[0];
        if (source === undefined)
            throw new Error('Missing source witness.');
        if (previous?.start === witness.start && previous.end === witness.end && prior !== undefined) {
            if (prior.family !== source.family ||
                !matchesTextTemplate(prior.template, source.template) ||
                previous.spans.some((span, index) => span.start !== witness.spans[index]?.start || span.end !== witness.spans[index].end))
                return [];
            accepted[accepted.length - 1] = { ...previous, sources: [...previous.sources, ...witness.sources] };
            continue;
        }
        if (witness.start !== cursor || (accepted[0]?.sources[0]?.family ?? source.family) !== source.family)
            return [];
        accepted.push(witness);
        cursor = witness.end;
    }
    return cursor === field.end ? accepted : [];
}
export function composeBitmapSourceTemplates(observed: StyledText, templates: readonly TextTemplate[]): TextTemplate {
    const controls: NonNullable<TextTemplate['controls']>[number][] = [];
    const styleEnds: number[] = [];
    let offset = 0;
    for (const template of templates) {
        controls.push(...(template.controls ?? []).map((slot) => ({ ...slot, offset: offset + slot.offset })));
        styleEnds.push(...template.styleEnds.slice(0, -1).map((end) => offset + end));
        offset += template.sourceText.length;
    }
    return copyTextTemplate({
        sourceText: observed.text,
        styleEnds: [
            ...new Set([
                ...styleEnds,
                ...observed.runs.map((run) => run.end),
                ...controls.flatMap((slot) => (slot.offset > 0 ? [slot.offset] : [])),
            ]),
        ].sort((a, b) => a - b),
        ...(controls.length === 0 ? {} : { controls }),
    });
}
