import { NATIVE_LIMITS, type ForesightNativeLimits } from '../configuration/foresight.js';
export interface ForesightCommand {
    readonly code: number;
    readonly indent: number;
    readonly text: string | null;
    readonly choices: readonly string[] | null;
    readonly branch: number | null;
    readonly routeLength: number | null;
}
export function own(value: unknown, key: PropertyKey): unknown {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}
export function integer(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function literal(text: string, messageUnits: number = NATIVE_LIMITS.messageUnits): boolean {
    if (text.length === 0 || text.length > messageUnits)
        return false;
    for (const character of text) {
        const code = character.charCodeAt(0);
        if (character === '\\' ||
            (code < 32 && !['\t', '\n', '\r'].includes(character)) ||
            (code >= 127 && code <= 159))
            return false;
    }
    return true;
}
export function readCommand(list: unknown, index: number, limits: ForesightNativeLimits = NATIVE_LIMITS): ForesightCommand | null {
    if (!Array.isArray(list))
        return null;
    const value = own(list, index);
    const code = integer(own(value, 'code'));
    const indent = integer(own(value, 'indent'));
    const parameters = own(value, 'parameters');
    if (code === null || indent === null || indent > limits.indent || !Array.isArray(parameters))
        return null;
    const first = own(parameters, 0);
    let choices: string[] | null = null;
    if (code === 102) {
        if (!Array.isArray(first) || first.length === 0 || first.length > limits.choices)
            return null;
        choices = [];
        let units = 0;
        for (let i = 0; i < first.length; i++) {
            const label = own(first, i);
            if (typeof label !== 'string' || (units += label.length) > limits.messageUnits)
                return null;
            choices.push(label);
        }
    }
    return {
        code,
        indent,
        text: code === 401 && typeof first === 'string' && first.length <= limits.messageUnits ? first : null,
        choices,
        routeLength: code === 205 && typeof first === 'number' && Number.isSafeInteger(first) && first >= -1
            ? moveRouteLength(own(parameters, 1))
            : null,
        branch: code === 402
            ? integer(first)
            : code === 102
                ? typeof own(parameters, 1) === 'number'
                    ? (own(parameters, 1) as number)
                    : null
                : null,
    };
}
function moveRouteLength(route: unknown): number | null {
    const list = own(route, 'list');
    const repeat = own(route, 'repeat'), wait = own(route, 'wait');
    return Array.isArray(list) &&
        list.length > 0 &&
        typeof repeat === 'boolean' &&
        typeof wait === 'boolean' &&
        typeof own(route, 'skippable') === 'boolean' &&
        !(repeat && wait)
        ? list.length
        : null;
}
export function readMoveRoute(list: unknown, index: number, offset: number, length: number): number | null {
    const command = own(list, index);
    if (own(command, 'code') !== 205)
        return null;
    const route = own(own(command, 'parameters'), 1);
    if (moveRouteLength(route) !== length)
        return null;
    const entry = own(own(route, 'list'), offset);
    const code = integer(own(entry, 'code'));
    const parameterless = code !== null && (code <= 13 || (code >= 16 && code <= 26) || (code >= 31 && code <= 40));
    return Array.isArray(own(entry, 'parameters')) ||
        (parameterless && Object.getOwnPropertyDescriptor(entry, 'parameters') === undefined)
        ? code
        : null;
}
export function sameCommand(left: ForesightCommand, right: ForesightCommand | null): boolean {
    return (right !== null &&
        left.code === right.code &&
        left.indent === right.indent &&
        left.text === right.text &&
        left.branch === right.branch &&
        left.routeLength === right.routeLength &&
        (left.choices === null
            ? right.choices === null
            : right.choices !== null &&
                left.choices.length === right.choices.length &&
                left.choices.every((text, i) => text === right.choices?.[i])));
}
