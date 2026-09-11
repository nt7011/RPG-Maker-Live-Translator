import type { NativeSourceSpan } from '../contract.js';
export function nativeSourceSpans(text: string): readonly NativeSourceSpan[] | null {
    const spans: NativeSourceSpan[] = [];
    let start = 0;
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        if (code !== 27) {
            if ((code < 32 || (code >= 127 && code <= 159)) && !/[\s\p{White_Space}]/u.test(text[index] ?? ''))
                return null;
            continue;
        }
        const command = /^(?:[A-Z]+|[$.|^!><{}])/iu.exec(text.slice(index + 1))?.[0];
        if (command === undefined)
            return null;
        let end = index + 1 + command.length;
        if (/^(?:C|I|FS|PX|PY)$/iu.test(command)) {
            const parameter = /^\[\d+\]/u.exec(text.slice(end))?.[0];
            if (parameter === undefined)
                return null;
            end += parameter.length;
        }
        else if (!/^[$.|^!><{}]$/u.test(command))
            return null;
        if (start < index)
            spans.push({ kind: 'text', start, end: index });
        spans.push({ kind: /^[!.|]$/u.test(command) ? 'pause' : 'control', start: index, end });
        start = end;
        index = end - 1;
    }
    if (start < text.length)
        spans.push({ kind: 'text', start, end: text.length });
    return spans;
}
