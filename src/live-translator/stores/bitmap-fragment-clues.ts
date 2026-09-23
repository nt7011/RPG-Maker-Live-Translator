import { bitmapSourceCorrespondence, type BitmapSourceCorrespondence } from './bitmap-source-correspondence.js';
import type { BitmapDrawRef, TextObservationRef } from '../semantic-adapters/contract.js';
import { textOrigin, type BitmapContent } from './bitmap-content.js';
import type { BitmapSemanticProvenance, BitmapSemanticSource } from './bitmap-semantic-clues.js';
import { onlyBitmapTextSeparators, type BitmapSourceCharacterIndex } from './bitmap-text-layout.js';
import { createStyledText, rebaseTextWhitespace, type StyledText, type TextTemplate } from './styled-text.js';
export interface BitmapCopiedClueReader {
    readonly read: (draw: BitmapDrawRef) => readonly BitmapSemanticProvenance[];
    readonly complete: (source: TextObservationRef) => BitmapSemanticSource | null;
    readonly characters: (source: TextObservationRef) => BitmapSourceCharacterIndex | null;
}
export interface BitmapCopiedEvidence {
    readonly source: BitmapSemanticSource;
    readonly spans: readonly {
        readonly start: number;
        readonly end: number;
    }[];
    readonly start: number;
    readonly end: number;
}
export interface BitmapCopiedClue {
    readonly sources: readonly BitmapSemanticSource[];
    readonly start: number;
    readonly end: number;
    readonly observed: StyledText;
    readonly template: TextTemplate;
    readonly complete: boolean;
    readonly positions: readonly number[];
    readonly index: BitmapSourceCharacterIndex;
}
export interface BitmapCopiedField {
    readonly start: number;
    readonly end: number;
    readonly clue: BitmapCopiedClue | null;
}
export function bitmapCopiedEvidence(contents: readonly BitmapContent[], reader: BitmapCopiedClueReader, verified?: readonly BitmapSourceCorrespondence[]): BitmapCopiedEvidence | null {
    const roots = contents.map(textOrigin);
    if (roots.some((root) => root.evidence === undefined ||
        root.evidence.length === 0 ||
        root.evidence.map((entry) => entry.text).join('') !== root.source.text))
        return null;
    const members = roots.flatMap((root) => root.evidence ?? []);
    const correspondence = verified ??
        bitmapSourceCorrespondence(members.map((entry) => ({
            text: entry.text,
            relations: entry.draw === undefined ? [] : reader.read(entry.draw),
        })), reader.characters);
    const candidates: BitmapCopiedEvidence[] = [];
    for (const evidence of correspondence) {
        if (evidence.verified.size !== members.length)
            continue;
        const spans: {
            start: number;
            end: number;
        }[] = [];
        let member = 0, cursor: number | null = null, valid = true;
        for (const root of roots) {
            let start: number | null = null;
            for (let entry = 0; entry < (root.evidence?.length ?? 0); entry++) {
                const range = evidence.verified.get(member++);
                if (range === undefined ||
                    (cursor !== null &&
                        (range.start < cursor ||
                            !onlyBitmapTextSeparators(evidence.source.text.slice(cursor, range.start))))) {
                    valid = false;
                    break;
                }
                start ??= range.start;
                cursor = range.end;
            }
            if (!valid || start === null || cursor === null) {
                valid = false;
                break;
            }
            spans.push({ start, end: cursor });
        }
        const start = spans[0]?.start, end = spans.at(-1)?.end;
        if (valid && start !== undefined && end !== undefined)
            candidates.push({ source: evidence.source, spans, start, end });
    }
    return candidates.length === 1 ? (candidates[0] ?? null) : null;
}
export function bitmapSourcePositionCount(ends: readonly number[], offset: number): number {
    let lo = 0, hi = ends.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if ((ends[mid] ?? Infinity) <= offset)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo;
}
export function bitmapCopiedClue(contents: readonly BitmapContent[], reader: BitmapCopiedClueReader): BitmapCopiedClue | null {
    const evidence = bitmapCopiedEvidence(contents, reader);
    if (evidence === null || !onlyBitmapTextSeparators(evidence.source.text.slice(0, evidence.start)))
        return null;
    const { source, spans } = evidence, index = reader.characters(source.observation);
    if (index === null ||
        spans.some((span) => [span.start, span.end].some((offset) => offset !== 0 && index.ends[bitmapSourcePositionCount(index.ends, offset) - 1] !== offset)))
        return null;
    let cursor = 0, positions = 0;
    const counts: number[] = [];
    const observed = createStyledText(contents.flatMap((content, member) => {
        const root = textOrigin(content), span = spans[member];
        if (span === undefined)
            throw new Error('Missing copied source span.');
        const gap = source.text.slice(cursor, span.start);
        cursor = span.end;
        const end = bitmapSourcePositionCount(index.drawableEnds, cursor);
        counts.push(end - positions);
        positions = end;
        const aligned = rebaseTextWhitespace(source.text.slice(span.start, span.end), root.source);
        if (aligned === null)
            throw new Error('Verified copied text lost its source correspondence.');
        return aligned.runs.map((run, style) => ({
            text: (style === 0 ? gap : '') + aligned.text.slice(aligned.runs[style - 1]?.end ?? 0, run.end),
            paint: run.paint,
        }));
    }));
    const full = reader.complete(source.observation) !== null;
    const complete = full && index.supported;
    const finished = evidence.end >= (index.drawableEnds.at(-1) ?? source.text.length);
    if ((!complete && !finished) || positions === 0)
        return null;
    return {
        sources: [source],
        start: evidence.start,
        end: evidence.end,
        observed,
        template: source.template,
        complete,
        positions: counts,
        index,
    };
}
