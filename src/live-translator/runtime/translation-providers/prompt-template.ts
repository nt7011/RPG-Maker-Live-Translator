import { countTranslationMarkers } from '../translation-text-codec.js';
export interface PromptContext {
    readonly hasControlCodes: boolean;
    readonly markerCorrection: boolean;
}
type PromptCondition = 'always' | 'cc' | 'fail';
export type CompiledPrompt = readonly Readonly<{
    condition: PromptCondition;
    text: string;
}>[];
export interface PromptRequest {
    readonly key?: unknown;
    readonly promptContext?: PromptContext;
}
export function compilePromptTemplate(template = '', setting = 'system_prompt'): CompiledPrompt {
    const segments: {
        condition: PromptCondition;
        text: string;
    }[] = [];
    let condition: PromptCondition = 'always';
    let sectionStart = 0;
    let text = '';
    function flush(): void {
        if (text)
            segments.push(Object.freeze({ condition, text }));
        text = '';
    }
    function invalid(offset: number, reason: string): never {
        throw new TypeError(`${setting}: invalid prompt at character offset ${String(offset)}: ${reason}`);
    }
    for (let offset = 0; offset < template.length;) {
        const character = template.charAt(offset);
        if (character !== '[') {
            text += character;
            offset++;
            continue;
        }
        const next = template[offset + 1] ?? '';
        if (next === '[') {
            text += '[';
            offset += 2;
            continue;
        }
        if (!/[A-Za-z/]/u.test(next)) {
            text += '[';
            offset++;
            continue;
        }
        const end = template.indexOf(']', offset + 1);
        if (end < 0)
            invalid(offset, 'unfinished directive');
        const directive = template.slice(offset + 1, end);
        const closing = directive.startsWith('/');
        const name = closing ? directive.slice(1) : directive;
        if (name !== 'cc' && name !== 'fail')
            invalid(offset, `unknown directive [${directive}]`);
        flush();
        if (closing) {
            if (condition !== name)
                invalid(offset, `unmatched closing directive [${directive}]`);
            condition = 'always';
        }
        else {
            if (condition !== 'always')
                invalid(offset, 'nested sections are not supported');
            condition = name;
            sectionStart = offset;
        }
        offset = end + 1;
    }
    if (condition !== 'always')
        invalid(sectionStart, `unclosed section [${condition}]`);
    flush();
    return Object.freeze(segments);
}
export function assemblePrompt(template: CompiledPrompt, request: PromptRequest, sourceText: string): string {
    const context = request.promptContext;
    const key = context ? undefined : request.key;
    const hasControlCodes = context
        ? context.hasControlCodes
        : countTranslationMarkers(typeof key === 'string' ? key : sourceText) > 0;
    const markerCorrection = context?.markerCorrection ?? false;
    return template
        .filter(({ condition }) => condition === 'always' || (condition === 'cc' ? hasControlCodes : markerCorrection))
        .map(({ text }) => text)
        .join('');
}
