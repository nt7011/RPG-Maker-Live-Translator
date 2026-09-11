import { hasWholeGraphemeStyles, type TextTemplate, type TextTranslation } from '../stores/styled-text.js';
export const TRANSLATION_MARKER = '¤';
export interface EncodedTranslationText {
    readonly text: string;
    readonly slots: readonly (number | null | {
        readonly sourceRun: number;
        readonly kind: 'pause';
    })[];
    readonly sectionsHaveText: readonly boolean[];
    readonly sourceRuns: readonly {
        readonly section: number;
        readonly hasText: boolean;
    }[];
    readonly supported: boolean;
}
export function countTranslationMarkers(text: string): number {
    let count = 0;
    for (const character of text)
        if (character === TRANSLATION_MARKER)
            count++;
    return count;
}
export function preservesTranslationMarkers(source: string, output: string): boolean {
    return countTranslationMarkers(source) === countTranslationMarkers(output);
}
export function encodeTranslationText(template: TextTemplate): EncodedTranslationText {
    let text = '', start = 0, sourceRun = 0, control = 0;
    const slots: (number | null | {
        readonly sourceRun: number;
        readonly kind: 'pause';
    })[] = [];
    const controls = template.controls ?? [];
    const boundaries = [...new Set([...template.styleEnds.slice(0, -1), ...controls.map(({ offset }) => offset)])].sort((a, b) => a - b);
    const pauseEnds = controls.filter(({ kind }) => kind === 'pause').map(({ offset }) => offset);
    const sectionsHaveText = [...pauseEnds, template.sourceText.length].map((end, index) => /[^\s\p{White_Space}]/u.test(template.sourceText.slice(pauseEnds[index - 1] ?? 0, end)));
    let section = 0;
    const sourceRuns = template.styleEnds.map((end, index) => {
        const start = template.styleEnds[index - 1] ?? 0;
        while ((pauseEnds[section] ?? Infinity) <= start)
            section++;
        return Object.freeze({ section, hasText: /[^\s\p{White_Space}]/u.test(template.sourceText.slice(start, end)) });
    });
    function append(end: number): void {
        text += template.sourceText.slice(start, end).replace(/\r\n|[\r\n\u2028\u2029¤]/gu, (separator) => {
            if (separator !== TRANSLATION_MARKER)
                return '\n';
            slots.push(null);
            return TRANSLATION_MARKER;
        });
        start = end;
    }
    for (const offset of boundaries) {
        append(offset);
        while (sourceRun + 1 < template.styleEnds.length && offset >= (template.styleEnds[sourceRun] ?? Infinity))
            sourceRun++;
        const before = control;
        while (controls[control]?.offset === offset) {
            text += TRANSLATION_MARKER;
            slots.push(controls[control]?.kind === 'pause' ? Object.freeze({ sourceRun, kind: 'pause' }) : sourceRun);
            control++;
        }
        if (before === control) {
            text += TRANSLATION_MARKER;
            slots.push(sourceRun);
        }
    }
    append(template.sourceText.length);
    return Object.freeze({
        text,
        slots: Object.freeze(slots),
        sectionsHaveText: Object.freeze(sectionsHaveText),
        sourceRuns: Object.freeze(sourceRuns),
        supported: hasWholeGraphemeStyles({
            text: template.sourceText,
            runs: [...new Set([...template.styleEnds, ...controls.map(({ offset }) => offset)])]
                .sort((a, b) => a - b)
                .map((end) => ({ end })),
        }),
    });
}
export function decodeTranslationText(encoded: EncodedTranslationText, output: string): TextTranslation | null {
    if (!encoded.supported)
        return null;
    const pauseEnds: number[] = [];
    const pauseCount = encoded.sectionsHaveText.length - 1;
    if (output === '')
        return Object.freeze({
            text: '',
            runs: Object.freeze([]),
            ...(pauseCount === 0 ? {} : { pauseEnds: Object.freeze(Array<number>(pauseCount).fill(0)) }),
        });
    if (encoded.sourceRuns.length === 0)
        return null;
    let text = '', cursor = 0, sourceRun = 0, slotIndex = 0;
    const runs: {
        readonly end: number;
        readonly sourceRun: number;
    }[] = [];
    function finishRun(): boolean {
        const from = runs.at(-1)?.end ?? 0;
        if (pauseCount > 0 && /[^\s\p{White_Space}]/u.test(text.slice(from))) {
            const source = encoded.sourceRuns[sourceRun];
            if (source?.section !== pauseEnds.length || !source.hasText)
                return false;
        }
        if (text.length > (runs.at(-1)?.end ?? 0))
            runs.push(Object.freeze({ end: text.length, sourceRun }));
        return true;
    }
    for (let index = output.indexOf(TRANSLATION_MARKER); index >= 0; index = output.indexOf(TRANSLATION_MARKER, cursor)) {
        text += output.slice(cursor, index);
        const slot = encoded.slots[slotIndex++];
        if (slot === null)
            text += TRANSLATION_MARKER;
        else if (slot !== undefined) {
            if (!finishRun())
                return null;
            if (typeof slot === 'object') {
                pauseEnds.push(text.length);
                sourceRun = slot.sourceRun;
            }
            else
                sourceRun = slot;
        }
        cursor = index + TRANSLATION_MARKER.length;
    }
    text += output.slice(cursor);
    if (!finishRun())
        return null;
    const restoredPauseCount = pauseEnds.length;
    while (pauseEnds.length < pauseCount)
        pauseEnds.push(text.length);
    if (pauseCount > 0 &&
        [...pauseEnds, text.length].some((end, index) => (index < restoredPauseCount || restoredPauseCount === pauseCount) &&
            /[^\s\p{White_Space}]/u.test(text.slice(pauseEnds[index - 1] ?? 0, end)) !==
                encoded.sectionsHaveText[index]))
        return null;
    return hasWholeGraphemeStyles({ text, runs: [...runs, ...pauseEnds.map((end) => ({ end }))] })
        ? Object.freeze({
            text,
            runs: Object.freeze(runs),
            ...(pauseCount === 0 ? {} : { pauseEnds: Object.freeze(pauseEnds) }),
        })
        : null;
}
