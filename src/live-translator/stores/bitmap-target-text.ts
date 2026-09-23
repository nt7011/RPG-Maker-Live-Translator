import { bindTextTranslation, createStyledText, sameTextPaint, type StyledText, type TextPaint, type TextTemplate, type TextTranslation, } from './styled-text.js';
import { indexBitmapSourceCharacters, supportsBitmapCharacterText, type BitmapSourceCharacterIndex, } from './bitmap-text-layout.js';
import { createBitmapTextReveal, type BitmapTextReveal } from './bitmap-text-reveal.js';
export interface BitmapTargetText {
    readonly translation: TextTranslation;
    readonly text: StyledText;
    readonly targetCharacterLayout: boolean;
    readonly reveal: BitmapTextReveal | null;
    readonly bindingEnds: readonly number[];
    readonly bindingComplete: boolean;
    readonly paintEnds: readonly number[];
    readonly palette: readonly TextPaint[];
    readonly coverage: number | null;
    readonly correspondence: boolean;
}
export function prepareBitmapTargetText(source: StyledText, translation: TextTranslation, coverage: number | null, correspondence: {
    readonly template: TextTemplate;
    readonly index: BitmapSourceCharacterIndex;
} | null, previous: BitmapTargetText | null): BitmapTargetText {
    const sameResult = previous?.translation === translation && previous.correspondence === (correspondence !== null);
    if (sameResult &&
        previous.palette.length === source.runs.length &&
        (previous.bindingComplete || previous.coverage === coverage) &&
        previous.paintEnds.every((end, index) => index === previous.paintEnds.length - 1 || end === source.runs[index]?.end) &&
        previous.palette.every((paint, index) => {
            const run = source.runs[index];
            return run !== undefined && sameTextPaint(paint, run.paint);
        }))
        return previous;
    const bindingEnds = sameResult ? previous.bindingEnds : indexBitmapSourceCharacters(translation.text).drawableEnds;
    const text = bindTextTranslation(translation, source, correspondence === null
        ? undefined
        : {
            template: correspondence.template,
            sourceEnds: correspondence.index.drawableEnds,
            targetEnds: bindingEnds,
        });
    return {
        translation,
        text,
        bindingEnds,
        bindingComplete: text.text === translation.text,
        targetCharacterLayout: supportsBitmapCharacterText(text.text),
        reveal: sameResult
            ? previous.reveal
            : correspondence === null
                ? null
                : createBitmapTextReveal(correspondence.template, translation, correspondence.index),
        paintEnds: source.runs.map((run) => run.end),
        palette: source.runs.map((run) => run.paint),
        coverage,
        correspondence: correspondence !== null,
    };
}
export function bitmapTargetPrefix(source: StyledText, end: number): StyledText {
    if (end === source.text.length)
        return source;
    return createStyledText(source.runs.flatMap((run, index) => {
        const from = source.runs[index - 1]?.end ?? 0;
        return from >= end ? [] : [{ text: source.text.slice(from, Math.min(end, run.end)), paint: run.paint }];
    }));
}
