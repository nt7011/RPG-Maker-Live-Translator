import { textOrigin, type BitmapContent } from './bitmap-content.js';
import type { BitmapDrawRef } from '../semantic-adapters/contract.js';
import { bitmapFieldDomains, acceptBitmapFieldCuts, type BitmapFieldMember, type BitmapFieldRange, } from './bitmap-field-partition.js';
import { bitmapFieldWitnesses, composeBitmapSourceTemplates, type BitmapSourceCorrespondence, } from './bitmap-source-correspondence.js';
import { indexBitmapSourceCharacters } from './bitmap-text-layout.js';
import { createStyledText, rebaseTextWhitespace, type StyledText, type TextPaint } from './styled-text.js';
import type { BitmapCopiedClueReader, BitmapCopiedField } from './bitmap-fragment-clues.js';
import { bitmapSourcePositionCount } from './bitmap-fragment-clues.js';
interface BitmapCopiedFieldMember extends BitmapFieldMember {
    readonly driver: number;
    readonly styled: StyledText;
    readonly draw: BitmapDrawRef | undefined;
}
export interface BitmapCopiedNativeFields {
    readonly members: readonly BitmapCopiedFieldMember[];
    readonly domains: readonly BitmapFieldRange[] | null;
}
export function prepareBitmapCopiedFields(contents: readonly BitmapContent[]): BitmapCopiedNativeFields | null {
    const members: BitmapCopiedFieldMember[] = [];
    for (const [driver, content] of contents.entries()) {
        const root = textOrigin(content);
        if (root.evidence?.length !== root.placements.length || root.placements.length === 0)
            return null;
        let cursor = 0, style = 0;
        for (const [index, placement] of root.placements.entries()) {
            const entry = root.evidence[index];
            if (entry === undefined ||
                placement.start !== cursor ||
                placement.end <= cursor ||
                entry.text !== root.source.text.slice(placement.start, placement.end))
                return null;
            cursor = placement.end;
            const parts: {
                text: string;
                paint: TextPaint;
            }[] = [];
            while ((root.source.runs[style]?.end ?? Infinity) <= placement.start)
                style++;
            let partStart = placement.start;
            while (partStart < placement.end) {
                const run = root.source.runs[style];
                if (run === undefined)
                    throw new Error('Missing retained copied paint.');
                const end = Math.min(placement.end, run.end);
                parts.push({ text: root.source.text.slice(partStart, end), paint: run.paint });
                partStart = end;
                if (end === run.end)
                    style++;
            }
            members.push({
                driver,
                text: entry.text,
                alignment: placement.alignment,
                units: [root],
                draw: entry.draw,
                styled: createStyledText(parts),
            });
        }
        if (cursor !== root.source.text.length)
            return null;
    }
    return { members, domains: bitmapFieldDomains(members) };
}
export function planBitmapCopiedFields(contents: readonly BitmapContent[], native: BitmapCopiedNativeFields | null, correspondence: readonly BitmapSourceCorrespondence[], reader?: BitmapCopiedClueReader): readonly BitmapCopiedField[] | null {
    if (native === null)
        return null;
    const { members, domains } = native;
    const partition = acceptBitmapFieldCuts(domains, correspondence.map((source) => source.verified.keys()));
    if (partition === null)
        return null;
    return partition.map((field) => {
        const start = members[field.start]?.driver, last = members[field.end - 1]?.driver;
        if (start === undefined || last === undefined)
            throw new Error('Missing copied field driver.');
        const witnesses = bitmapFieldWitnesses(field, correspondence);
        if (reader === undefined || witnesses.length === 0)
            return { start, end: last + 1, clue: null };
        const sources = witnesses.flatMap((witness) => witness.sources);
        const parts: {
            text: string;
            paint: TextPaint;
        }[] = [];
        const driverEnds = new Map<number, number>();
        let offset = 0;
        for (const witness of witnesses) {
            const source = witness.sources[0];
            if (source === undefined)
                throw new Error('Missing copied field witness.');
            let cursor = 0;
            for (const [index, span] of witness.spans.entries()) {
                const member = members[witness.start + index];
                if (member === undefined)
                    throw new Error('Missing copied field placement.');
                const end = index === witness.spans.length - 1 ? source.text.length : span.end;
                const gap = source.text.slice(cursor, span.start);
                const tail = source.text.slice(span.end, end);
                const aligned = rebaseTextWhitespace(source.text.slice(span.start, span.end), member.styled);
                if (aligned === null)
                    throw new Error('Verified copied field lost its source correspondence.');
                parts.push(...aligned.runs.map((run, index) => ({
                    text: (index === 0 ? gap : '') +
                        aligned.text.slice(aligned.runs[index - 1]?.end ?? 0, run.end) +
                        (index === aligned.runs.length - 1 ? tail : ''),
                    paint: run.paint,
                })));
                cursor = end;
                driverEnds.set(member.driver, offset + cursor);
            }
            offset += source.text.length;
        }
        const observed = createStyledText(parts);
        const template = witnesses.length === 1
            ? witnesses[0]?.sources[0]?.template
            : composeBitmapSourceTemplates(observed, witnesses.map((witness) => {
                const source = witness.sources[0];
                if (source === undefined)
                    throw new Error('Missing copied field source.');
                return source.template;
            }));
        const firstSource = sources[0];
        if (template === undefined || firstSource === undefined)
            throw new Error('Missing copied field template.');
        const index = witnesses.length === 1
            ? (reader.characters(firstSource.observation) ?? indexBitmapSourceCharacters(template.sourceText))
            : indexBitmapSourceCharacters(template.sourceText, (template.controls ?? []).filter((slot) => slot.kind === 'pause').map((slot) => slot.offset));
        let previous = 0;
        const positions = contents.slice(start, last + 1).map((_, indexInField) => {
            const end = bitmapSourcePositionCount(index.drawableEnds, driverEnds.get(start + indexInField) ?? 0);
            const positions = end - previous;
            previous = end;
            return positions;
        });
        return {
            start,
            end: last + 1,
            clue: {
                sources,
                start: 0,
                end: offset,
                observed,
                template,
                complete: witnesses.length === 1 && reader.complete(firstSource.observation) !== null && index.supported,
                positions,
                index,
            },
        };
    });
}
