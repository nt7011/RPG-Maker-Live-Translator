import type { BitmapDrawRef, TextObservationRef } from '../semantic-adapters/contract.js';
import { textOrigin, type BitmapContent } from './bitmap-content.js';
import type { BitmapSemanticProvenance, BitmapSemanticSource } from './bitmap-semantic-clues.js';
import { onlyBitmapTextSeparators, type BitmapSourceCharacterIndex } from './bitmap-text-layout.js';
import { createStyledText, sameTextIgnoringWhitespace, rebaseTextWhitespace, type StyledText, type TextTemplate, } from './styled-text.js';
export interface BitmapCopiedClueReader {
    readonly read: (draw: BitmapDrawRef) => readonly BitmapSemanticProvenance[];
    readonly complete: (source: TextObservationRef) => BitmapSemanticSource | null;
    readonly characters: (source: TextObservationRef) => BitmapSourceCharacterIndex | null;
    readonly contradict: (source: TextObservationRef) => void;
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
export interface BitmapCopiedClue extends BitmapCopiedEvidence {
    readonly observed: StyledText;
    readonly template: TextTemplate;
    readonly complete: boolean;
    readonly positions: readonly number[];
    readonly index: BitmapSourceCharacterIndex;
}
export function bitmapCopiedEvidence(contents: readonly BitmapContent[], reader: BitmapCopiedClueReader, properGroup = true): BitmapCopiedEvidence | null {
    const first = contents[0] === undefined ? undefined : textOrigin(contents[0]).evidence?.[0]?.draw;
    if (first === undefined)
        return null;
    const sources = new Map(reader.read(first).map((relation) => [relation.source.observation, relation.source]));
    const candidates: BitmapCopiedEvidence[] = [];
    for (const [token, source] of sources) {
        const spans: {
            start: number;
            end: number;
        }[] = [];
        let cursor: number | null = null, valid = true;
        for (const content of contents) {
            const root = textOrigin(content), evidence = root.evidence;
            if (evidence === undefined || evidence.length === 0) {
                valid = false;
                break;
            }
            let start: number | null = null, text = '';
            for (const entry of evidence) {
                const ranges = entry.draw === undefined
                    ? []
                    : reader
                        .read(entry.draw)
                        .flatMap((relation) => relation.source.observation === token && relation.range !== null
                        ? [relation.range]
                        : []);
                const range = ranges[0];
                if (range === undefined ||
                    ranges.some((other) => other.start !== range.start || other.end !== range.end) ||
                    !sameTextIgnoringWhitespace(source.text.slice(range.start, range.end), entry.text) ||
                    (cursor !== null &&
                        (range.start < cursor || !onlyBitmapTextSeparators(source.text.slice(cursor, range.start))))) {
                    valid = false;
                    break;
                }
                start ??= range.start;
                cursor = range.end;
                text += entry.text;
            }
            if (!valid ||
                start === null ||
                cursor === null ||
                text !== root.source.text ||
                !sameTextIgnoringWhitespace(source.text.slice(start, cursor), root.source.text)) {
                valid = false;
                break;
            }
            spans.push({ start, end: cursor });
        }
        const start = spans[0]?.start, end = spans.at(-1)?.end;
        if (valid && start !== undefined && end !== undefined)
            candidates.push({ source, spans, start, end });
        else if (properGroup && reader.complete(token) !== null)
            reader.contradict(token);
    }
    return candidates.length === 1 ? (candidates[0] ?? null) : null;
}
function count(ends: readonly number[], offset: number): number {
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
    const evidence = bitmapCopiedEvidence(contents, reader, false);
    if (evidence === null || !onlyBitmapTextSeparators(evidence.source.text.slice(0, evidence.start)))
        return null;
    const { source, spans } = evidence, index = reader.characters(source.observation);
    if (index === null ||
        spans.some((span) => [span.start, span.end].some((offset) => offset !== 0 && index.ends[count(index.ends, offset) - 1] !== offset)))
        return null;
    let cursor = 0, positions = 0;
    const counts: number[] = [];
    const observed = createStyledText(contents.flatMap((content, member) => {
        const root = textOrigin(content), span = spans[member];
        if (span === undefined)
            throw new Error('Missing copied source span.');
        const gap = source.text.slice(cursor, span.start);
        cursor = span.end;
        const end = count(index.drawableEnds, cursor);
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
    return { ...evidence, observed, template: source.template, complete, positions: counts, index };
}
