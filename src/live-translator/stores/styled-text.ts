export interface TextPaint {
    readonly font: string;
    readonly fontSize: number;
    readonly textColor: string;
    readonly outlineColor: string;
    readonly outlineWidth: number;
    readonly bodyAlpha: number;
    readonly baselineOffset?: number;
}
export function isTextPaint(value: unknown): value is TextPaint {
    if (typeof value !== 'object' || value === null)
        return false;
    const { font, fontSize, textColor, outlineColor, outlineWidth, bodyAlpha, baselineOffset } = value as Partial<Record<keyof TextPaint, unknown>>;
    return (typeof font === 'string' &&
        font.length > 0 &&
        typeof fontSize === 'number' &&
        Number.isFinite(fontSize) &&
        fontSize > 0 &&
        typeof textColor === 'string' &&
        textColor.length > 0 &&
        typeof outlineColor === 'string' &&
        outlineColor.length > 0 &&
        typeof outlineWidth === 'number' &&
        Number.isFinite(outlineWidth) &&
        outlineWidth > 0 &&
        typeof bodyAlpha === 'number' &&
        Number.isFinite(bodyAlpha) &&
        bodyAlpha >= 0 &&
        bodyAlpha <= 1 &&
        (baselineOffset === undefined || (typeof baselineOffset === 'number' && Number.isFinite(baselineOffset))));
}
export interface StyledTextRun {
    readonly end: number;
    readonly paint: TextPaint;
}
export interface StyledText {
    readonly text: string;
    readonly runs: readonly StyledTextRun[];
}
export function sameTextIgnoringWhitespace(a: string, b: string): boolean {
    return a === b || a.replace(/[\s\p{White_Space}]+/gu, '') === b.replace(/[\s\p{White_Space}]+/gu, '');
}
export function rebaseTextWhitespace(source: string, observed: StyledText): StyledText | null {
    if (source === observed.text)
        return observed;
    if (!sameTextIgnoringWhitespace(source, observed.text))
        return null;
    let cursor = 0;
    return createStyledText(observed.runs.map((run, index) => {
        const start = cursor;
        const text = observed.text.slice(observed.runs[index - 1]?.end ?? 0, run.end);
        let remaining = text.replace(/[\s\p{White_Space}]+/gu, '').length;
        while (cursor < source.length && remaining > 0) {
            if (!/[\s\p{White_Space}]/u.test(source[cursor] ?? ''))
                remaining--;
            cursor++;
        }
        if (index === observed.runs.length - 1)
            cursor = source.length;
        return { text: source.slice(start, cursor), paint: run.paint };
    }));
}
export interface TextTemplate {
    readonly sourceText: string;
    readonly styleEnds: readonly number[];
    readonly controls?: readonly {
        readonly offset: number;
        readonly kind: 'control' | 'pause';
    }[];
}
export interface TextTranslation {
    readonly text: string;
    readonly runs: readonly {
        readonly end: number;
        readonly sourceRun: number;
    }[];
    readonly pauseEnds?: readonly number[];
}
export function copyTextTemplate(template: TextTemplate): TextTemplate {
    if (typeof template.sourceText !== 'string' || !Array.isArray(template.styleEnds))
        throw new TypeError('Invalid text template.');
    let previous = 0;
    const styleEnds: number[] = [];
    for (const end of template.styleEnds) {
        if (typeof end !== 'number' ||
            !Number.isSafeInteger(end) ||
            end <= previous ||
            end > template.sourceText.length)
            throw new TypeError('Invalid text template boundary.');
        previous = end;
        styleEnds.push(end);
    }
    if (previous !== template.sourceText.length)
        throw new TypeError('Incomplete text template boundaries.');
    const controls: {
        readonly offset: number;
        readonly kind: 'control' | 'pause';
    }[] = [];
    if (template.controls !== undefined) {
        if (!Array.isArray(template.controls))
            throw new TypeError('Invalid text template controls.');
        const values: readonly unknown[] = template.controls;
        for (const value of values) {
            if (typeof value !== 'object' || value === null)
                throw new TypeError('Invalid text template control.');
            const control = value as Partial<NonNullable<TextTemplate['controls']>[number]>;
            if (typeof control.offset !== 'number' ||
                !Number.isSafeInteger(control.offset) ||
                control.offset < (controls.at(-1)?.offset ?? 0) ||
                control.offset > template.sourceText.length ||
                (control.kind !== 'control' && control.kind !== 'pause') ||
                (control.kind === 'pause' && control.offset !== 0 && !styleEnds.includes(control.offset)))
                throw new TypeError('Invalid text template control position.');
            controls.push(Object.freeze({ offset: control.offset, kind: control.kind }));
        }
    }
    return Object.freeze({
        sourceText: template.sourceText,
        styleEnds: Object.freeze(styleEnds),
        ...(controls.length === 0 ? {} : { controls: Object.freeze(controls) }),
    });
}
export function textTemplate(source: StyledText): TextTemplate {
    return copyTextTemplate({ sourceText: source.text, styleEnds: source.runs.map((run) => run.end) });
}
export function matchesTextTemplate(template: TextTemplate, source: TextTemplate): boolean {
    return (template.sourceText === source.sourceText &&
        template.styleEnds.length === source.styleEnds.length &&
        template.styleEnds.every((end, index) => end === source.styleEnds[index]) &&
        (template.controls?.length ?? 0) === (source.controls?.length ?? 0) &&
        (template.controls ?? []).every((control, index) => {
            const other = source.controls?.[index];
            return control.offset === other?.offset && control.kind === other.kind;
        }));
}
export function copyTextTranslation(value: unknown, template: TextTemplate): TextTranslation | null {
    if (typeof value !== 'object' || value === null)
        return null;
    const candidate = value as TextTranslation;
    if (typeof candidate.text !== 'string' || !Array.isArray((value as TextTranslation).runs))
        return null;
    let start = 0;
    const runs: {
        readonly end: number;
        readonly sourceRun: number;
    }[] = [];
    for (const run of candidate.runs) {
        const runValue: unknown = run;
        if (typeof runValue !== 'object' ||
            runValue === null ||
            !Number.isSafeInteger(run.end) ||
            run.end <= start ||
            run.end > candidate.text.length ||
            !Number.isSafeInteger(run.sourceRun) ||
            run.sourceRun < 0 ||
            run.sourceRun >= template.styleEnds.length)
            return null;
        runs.push(Object.freeze({ end: run.end, sourceRun: run.sourceRun }));
        start = run.end;
    }
    if (start !== candidate.text.length)
        return null;
    const pauses = template.controls?.filter((control) => control.kind === 'pause') ?? [];
    const proposedPauses: unknown = candidate.pauseEnds ?? [];
    if (!Array.isArray(proposedPauses) || proposedPauses.length !== pauses.length)
        return null;
    const values: readonly unknown[] = proposedPauses;
    const pauseEnds: number[] = [];
    let previous = 0;
    const boundaries = new Set([0, ...runs.map((run) => run.end)]);
    for (const end of values) {
        if (typeof end !== 'number' ||
            !Number.isSafeInteger(end) ||
            end < previous ||
            end > candidate.text.length ||
            !boundaries.has(end))
            return null;
        pauseEnds.push(end);
        previous = end;
    }
    if (!hasWholeGraphemeStyles({
        text: candidate.text,
        runs: [...pauseEnds, candidate.text.length].map((end) => ({ end })),
    }))
        return null;
    return Object.freeze({
        text: candidate.text,
        runs: Object.freeze(runs),
        ...(pauseEnds.length === 0 ? {} : { pauseEnds: Object.freeze(pauseEnds) }),
    });
}
export function bindTextTranslation(translation: TextTranslation, source: StyledText, binding?: {
    readonly template: TextTemplate;
    readonly sourceEnds: readonly number[];
    readonly targetEnds: readonly number[];
}): StyledText {
    const template = binding?.template ?? textTemplate(source);
    const parts: {
        text: string;
        paint: TextPaint;
    }[] = [];
    let targetStart = 0;
    for (const run of translation.runs) {
        const start = template.styleEnds[run.sourceRun - 1] ?? 0;
        const end = template.styleEnds[run.sourceRun];
        if (end === undefined)
            throw new Error('Translation references a missing source span.');
        const paints = source.runs.filter((paint, index) => paint.end > start && (source.runs[index - 1]?.end ?? 0) < end);
        const first = paints[0];
        if (first === undefined)
            break;
        if (paints.length === 1 && source.text.length >= end) {
            parts.push({ text: translation.text.slice(targetStart, run.end), paint: first.paint });
        }
        else {
            if (binding === undefined)
                throw new Error('Partial source paint requires character correspondence.');
            const sourceStart = coveredTextPositions(binding.sourceEnds, start);
            const sourceCount = coveredTextPositions(binding.sourceEnds, end) - sourceStart;
            const targetFrom = coveredTextPositions(binding.targetEnds, targetStart);
            const targetTo = coveredTextPositions(binding.targetEnds, run.end);
            let cursor = targetStart;
            let paint = first.paint;
            for (let index = targetFrom; index < targetTo; index++) {
                const position = binding.sourceEnds[sourceStart + Math.min(index - targetFrom, sourceCount - 1)];
                const observed = position === undefined ? first : paints.find((run) => run.end >= position);
                if (observed === undefined)
                    return createStyledText(parts);
                paint = observed.paint;
                const next = binding.targetEnds[index];
                if (next === undefined)
                    throw new Error('Missing target character position.');
                parts.push({ text: translation.text.slice(cursor, next), paint });
                cursor = next;
            }
            parts.push({ text: translation.text.slice(cursor, run.end), paint });
        }
        targetStart = run.end;
    }
    return createStyledText(parts);
}
function coveredTextPositions(ends: readonly number[], offset: number): number {
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
export function sameTextPaint(a: TextPaint, b: TextPaint): boolean {
    return (a.font === b.font &&
        a.fontSize === b.fontSize &&
        a.textColor === b.textColor &&
        a.outlineColor === b.outlineColor &&
        a.outlineWidth === b.outlineWidth &&
        a.bodyAlpha === b.bodyAlpha &&
        (a.baselineOffset ?? 0) === (b.baselineOffset ?? 0));
}
export function createStyledText(parts: readonly {
    readonly text: string;
    readonly paint: TextPaint;
}[]): StyledText {
    let text = '';
    const runs: StyledTextRun[] = [];
    for (const part of parts) {
        if (typeof part.text !== 'string' || !isTextPaint(part.paint))
            throw new TypeError('Invalid styled text part.');
        if (part.text.length === 0)
            continue;
        text += part.text;
        const previous = runs.at(-1);
        const paint = previous !== undefined && sameTextPaint(previous.paint, part.paint)
            ? previous.paint
            : Object.freeze({
                font: part.paint.font,
                fontSize: part.paint.fontSize,
                textColor: part.paint.textColor,
                outlineColor: part.paint.outlineColor,
                outlineWidth: part.paint.outlineWidth,
                bodyAlpha: part.paint.bodyAlpha,
                ...(part.paint.baselineOffset ? { baselineOffset: part.paint.baselineOffset } : {}),
            });
        if (previous?.paint === paint)
            runs.pop();
        runs.push(Object.freeze({ end: text.length, paint }));
    }
    return Object.freeze({ text, runs: Object.freeze(runs) });
}
export function copyStyledText(source: StyledText): StyledText {
    const candidate: unknown = source;
    if (candidate === null ||
        typeof candidate !== 'object' ||
        typeof source.text !== 'string' ||
        !Array.isArray((candidate as StyledText).runs))
        throw new TypeError('Invalid styled text.');
    let start = 0;
    const parts = source.runs.map((run) => {
        if (!Number.isSafeInteger(run.end) || run.end <= start || run.end > source.text.length)
            throw new TypeError('Invalid styled text range.');
        const part = { text: source.text.slice(start, run.end), paint: run.paint };
        start = run.end;
        return part;
    });
    if (start !== source.text.length)
        throw new TypeError('Incomplete styled text ranges.');
    return createStyledText(parts);
}
export function joinStyledText(sources: readonly StyledText[]): StyledText {
    return createStyledText(sources.flatMap((source) => source.runs.map((run, index) => ({
        text: source.text.slice(source.runs[index - 1]?.end ?? 0, run.end),
        paint: run.paint,
    }))));
}
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function characters(text: string): string[] {
    return Array.from(segmenter.segment(text), (item) => item.segment);
}
export function hasWholeGraphemeStyles(source: {
    readonly text: string;
    readonly runs: readonly {
        readonly end: number;
    }[];
}): boolean {
    if (source.runs.length < 2)
        return true;
    const boundaries = new Set(Array.from(segmenter.segment(source.text), (item) => item.index));
    boundaries.add(source.text.length);
    return source.runs.every((run) => boundaries.has(run.end));
}
