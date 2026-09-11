function normalizeJsonc(source: string): string {
    const output = source.split('');
    let insideString = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (insideString) {
            if (escaped)
                escaped = false;
            else if (character === '\\')
                escaped = true;
            else if (character === '"')
                insideString = false;
            continue;
        }
        if (character === '"') {
            insideString = true;
            continue;
        }
        if (character !== '/')
            continue;
        const next = source[index + 1];
        if (next === '/') {
            output[index] = ' ';
            output[index + 1] = ' ';
            index += 2;
            while (index < source.length && source[index] !== '\r' && source[index] !== '\n') {
                output[index] = ' ';
                index += 1;
            }
            index -= 1;
            continue;
        }
        if (next !== '*')
            continue;
        const commentStart = index;
        output[index] = ' ';
        output[index + 1] = ' ';
        index += 2;
        let closed = false;
        while (index < source.length) {
            if (source[index] === '*' && source[index + 1] === '/') {
                output[index] = ' ';
                output[index + 1] = ' ';
                index += 1;
                closed = true;
                break;
            }
            if (source[index] !== '\r' && source[index] !== '\n')
                output[index] = ' ';
            index += 1;
        }
        if (!closed)
            throw new SyntaxError(`Unterminated block comment at position ${String(commentStart)}.`);
    }
    insideString = false;
    escaped = false;
    for (let index = 0; index < output.length; index += 1) {
        const character = output[index];
        if (insideString) {
            if (escaped)
                escaped = false;
            else if (character === '\\')
                escaped = true;
            else if (character === '"')
                insideString = false;
            continue;
        }
        if (character === '"') {
            insideString = true;
            continue;
        }
        if (character !== ',')
            continue;
        let nextIndex = index + 1;
        while (nextIndex < output.length && /\s/u.test(output[nextIndex] ?? ''))
            nextIndex += 1;
        if (output[nextIndex] !== '}' && output[nextIndex] !== ']')
            continue;
        let previousIndex = index - 1;
        while (previousIndex >= 0 && /\s/u.test(output[previousIndex] ?? ''))
            previousIndex -= 1;
        if (output[previousIndex] !== '[' && output[previousIndex] !== '{')
            output[index] = ' ';
    }
    return output.join('');
}
export function parseJsonc(source: string): unknown {
    const withoutBom = source.charCodeAt(0) === 0xfeff ? ` ${source.slice(1)}` : source;
    return JSON.parse(normalizeJsonc(withoutBom)) as unknown;
}
