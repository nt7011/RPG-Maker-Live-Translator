import type { LogRedactor } from './log-redaction-port.js';
function ownValue(source: unknown, key: string): unknown {
    if (typeof source !== 'object' || source === null)
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
export function createLogRedactor(settings: unknown): LogRedactor | undefined {
    if (ownValue(ownValue(settings, 'logging'), 'redactText') !== true)
        return undefined;
    const target = /[\p{Alphabetic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Surrogate}]/u;
    const replacements = new Map<string, string>();
    function text(source: string): string {
        let output = '';
        for (const character of source) {
            if (!target.test(character)) {
                output += character;
                continue;
            }
            let replacement = replacements.get(character);
            if (replacement === undefined) {
                replacement = `⟦${String(replacements.size + 1)}⟧`;
                replacements.set(character, replacement);
            }
            output += replacement;
        }
        return output;
    }
    function project(source: unknown, schema: boolean, protocol: readonly string[]): unknown {
        const seen = new WeakMap<object, object>();
        let entries = 0;
        function copy(value: unknown, path: string, depth: number): unknown {
            if (typeof value === 'string')
                return protocol.includes(path) ? value : text(value);
            if (value == null || typeof value === 'number' || typeof value === 'boolean')
                return value;
            if (typeof value !== 'object')
                return null;
            const previous = seen.get(value);
            if (previous !== undefined)
                return previous;
            if (depth > 16)
                throw new Error('Log redaction depth exceeded.');
            const array = Array.isArray(value);
            const result: object = array ? [] : {};
            seen.set(value, result);
            for (const key of Reflect.ownKeys(value)) {
                if (typeof key !== 'string' || (array && key === 'length'))
                    continue;
                if (++entries > 4096)
                    throw new Error('Log redaction field limit exceeded.');
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor || !('value' in descriptor))
                    continue;
                const part = array ? '*' : key;
                const nextPath = path ? `${path}.${part}` : part;
                Object.defineProperty(result, schema ? key : text(key), {
                    enumerable: true,
                    value: copy(descriptor.value, nextPath, depth + 1),
                });
            }
            return Object.freeze(result);
        }
        return copy(source, '', 0);
    }
    return Object.freeze({
        text,
        value: (source: unknown): unknown => project(source, false, []),
        record: <T>(source: T, protocol: readonly string[] = []): T => project(source, true, protocol) as T,
    });
}
