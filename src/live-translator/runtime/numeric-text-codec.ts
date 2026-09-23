import { decodeTranslationText, type EncodedTranslationText } from './translation-text-codec.js';
export type NumericTemplatePart = string | number;
export interface NumericText {
    readonly key: string;
    readonly source: string;
    readonly template: string;
    readonly values: readonly string[];
    readonly structure: string;
    readonly encoded: EncodedTranslationText;
}
export interface NumericTemplate {
    readonly output: string;
    readonly parts: readonly NumericTemplatePart[];
}
function controlStructure(text: string): string {
    return text.replace(/[^¤\n]/gu, '');
}
export function encodeNumericText(encoded: EncodedTranslationText): NumericText | null {
    if (!encoded.supported)
        return null;
    const source = encoded.text.trim();
    const values: string[] = [];
    const template = source.replace(/\p{Decimal_Number}+/gu, (digits) => {
        values.push(digits);
        return `¤${String(values.length)}¤`;
    });
    if (values.length === 0)
        return null;
    const numeric: NumericText = Object.freeze({
        key: JSON.stringify([template, encoded.slots, encoded.sectionsHaveText, encoded.sourceRuns]),
        source,
        template,
        values: Object.freeze(values),
        structure: controlStructure(source),
        encoded,
    });
    const parsed = parseNumericTemplate(numeric, template);
    return parsed !== null && instantiateNumericTemplate(numeric, parsed) === source ? numeric : null;
}
export function parseNumericTemplate(source: NumericText, output: string): NumericTemplate | null {
    if (!output.trim() || /[\r\u2028\u2029]/u.test(output))
        return null;
    const parts: NumericTemplatePart[] = [];
    const seen = new Set<number>();
    let cursor = 0;
    let structure = '';
    for (const match of output.matchAll(/¤([0-9]+)¤/gu)) {
        const literal = output.slice(cursor, match.index);
        if (/\p{Decimal_Number}/u.test(literal))
            return null;
        structure += controlStructure(literal);
        const id = Number(match[1]);
        if (!Number.isSafeInteger(id) || id < 1 || id > source.values.length || String(id) !== match[1] || seen.has(id))
            return null;
        seen.add(id);
        parts.push(literal, id - 1);
        cursor = match.index + match[0].length;
    }
    const tail = output.slice(cursor);
    if (/\p{Decimal_Number}/u.test(tail))
        return null;
    parts.push(tail);
    structure += controlStructure(tail);
    if (seen.size !== source.values.length || structure !== source.structure)
        return null;
    const result = Object.freeze({ output, parts: Object.freeze(parts) });
    return instantiateNumericTemplate(source, result) === null ? null : result;
}
export function instantiateNumericTemplate(source: NumericText, template: NumericTemplate): string | null {
    let output = '';
    for (const part of template.parts) {
        const value = typeof part === 'number' ? source.values[part] : part;
        if (value === undefined)
            return null;
        output += value;
    }
    return decodeTranslationText(source.encoded, output) === null ? null : output;
}
