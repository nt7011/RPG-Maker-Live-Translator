import type { ForesightProvenanceAuthority } from './foresight/provenance.js';
type PropertySource = Record<PropertyKey, unknown>;
type UnknownFunction = (...args: unknown[]) => unknown;
export interface MessageTextData {
    readonly text: string;
    readonly hasOwnData: boolean;
    readonly lineCount: number;
    readonly storageKey: string;
    readonly storageIdentity: unknown;
}
export interface GameMessageForesightContextController {
    readonly clearMessageOrigin: (gameMessage?: unknown) => void;
    readonly readMessageOriginText: (gameMessage?: unknown) => string;
    readonly readMessageTextData: (gameMessage?: unknown) => MessageTextData;
    readonly getInterpreterOriginId: (interpreter?: unknown) => string;
}
export interface GameMessageForesightContextModule {
    create(scope?: unknown): GameMessageForesightContextController;
}
interface ForesightContextScope {
    readonly foresightProvenance?: unknown;
    readonly globalScope?: unknown;
}
const MAX_MESSAGE_LINES = 256;
const MAX_MESSAGE_TEXT_UNITS = 16 * 1024;
const IntrinsicObject = Object;
const IntrinsicArray = Array;
const IntrinsicTypeError = TypeError;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const reflectApply = Reflect.apply;
const stringFrom = String;
function captureMethod(target: object, key: PropertyKey): UnknownFunction {
    const descriptor = objectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value !== 'function') {
        throw new IntrinsicTypeError(`Game message foresight context requires intrinsic ${stringFrom(key)}.`);
    }
    return value as UnknownFunction;
}
const arrayPush = captureMethod(IntrinsicArray.prototype, 'push');
const arrayJoin = captureMethod(IntrinsicArray.prototype, 'join');
const stringCharCodeAt = captureMethod(stringFrom.prototype, 'charCodeAt');
function call<Result>(method: UnknownFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(method, receiver, args) as Result;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return call<Readonly<Value>>(objectFreeze, IntrinsicObject, [value]);
}
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function ownData(value: unknown, key: PropertyKey): unknown {
    if (!isPropertySource(value))
        return undefined;
    try {
        const descriptor = objectGetOwnPropertyDescriptor(value, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function primitiveText(value: unknown): string {
    if (value === null || value === undefined)
        return '';
    return typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
        ? stringFrom(value)
        : '';
}
function createMessageTextData(text: string, hasOwnData: boolean, lineCount: number, storageKey: string, storageIdentity: unknown): MessageTextData {
    return freezeExact({ text, hasOwnData, lineCount, storageKey, storageIdentity });
}
function countBoundedTextLines(text: string): number | null {
    if (text.length > MAX_MESSAGE_TEXT_UNITS)
        return null;
    if (!text.length)
        return 0;
    let lineCount = 1;
    for (let index = 0; index < text.length; index += 1) {
        const code = call<number>(stringCharCodeAt, text, [index]);
        if (code !== 10 && code !== 13)
            continue;
        lineCount += 1;
        if (lineCount > MAX_MESSAGE_LINES)
            return null;
        if (code === 13 && index + 1 < text.length) {
            const nextCode = call<number>(stringCharCodeAt, text, [index + 1]);
            if (nextCode === 10)
                index += 1;
        }
    }
    return lineCount;
}
function requireProvenance(value: unknown): ForesightProvenanceAuthority {
    if (!isPropertySource(value)) {
        throw new IntrinsicTypeError('Game message foresight context requires the private provenance authority.');
    }
    const readMessageOriginText = ownData(value, 'readMessageOriginText');
    const clear = ownData(value, 'clear');
    if (typeof readMessageOriginText !== 'function' || typeof clear !== 'function') {
        throw new IntrinsicTypeError('Game message foresight context requires provenance read/clear capabilities.');
    }
    return value as unknown as ForesightProvenanceAuthority;
}
function createGameMessageForesightContextController(scope: unknown = {}): GameMessageForesightContextController {
    const source = isPropertySource(scope) ? (scope as ForesightContextScope) : {};
    const provenance = requireProvenance(source.foresightProvenance);
    const provenanceReadOriginText = provenance.readMessageOriginText;
    const provenanceClear = provenance.clear;
    const globalScope = source.globalScope;
    function clearMessageOrigin(gameMessage: unknown): void {
        try {
            reflectApply(provenanceClear, provenance, [gameMessage]);
        }
        catch {
        }
    }
    function readMessageOriginText(gameMessage: unknown): string {
        try {
            const text = reflectApply(provenanceReadOriginText, provenance, [gameMessage]);
            const originToken = ownData(gameMessage, '_trMessageOrigin');
            if (typeof text === 'string' &&
                text.length > 0 &&
                text.length <= MAX_MESSAGE_TEXT_UNITS &&
                isPropertySource(originToken)) {
                return text;
            }
        }
        catch {
        }
        const current = readMessageTextData(gameMessage, false);
        return current.hasOwnData ? current.text : '';
    }
    function readMessageTextData(gameMessage: unknown, includeOrigin = true): MessageTextData {
        if (!isPropertySource(gameMessage))
            return createMessageTextData('', false, 0, '', null);
        const texts = ownData(gameMessage, '_texts');
        if (arrayIsArray(texts)) {
            const lengthDescriptor = objectGetOwnPropertyDescriptor(texts, 'length');
            const length: unknown = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1;
            if (typeof length === 'number' &&
                numberIsSafeInteger(length) &&
                length >= 0 &&
                length <= MAX_MESSAGE_LINES) {
                const lines: string[] = [];
                let textUnits = 0;
                let accepted = true;
                for (let index = 0; index < length; index += 1) {
                    const descriptor = objectGetOwnPropertyDescriptor(texts, String(index));
                    if (!descriptor || !('value' in descriptor)) {
                        accepted = false;
                        break;
                    }
                    const line = primitiveText(descriptor.value);
                    textUnits += line.length + (index > 0 ? 1 : 0);
                    if (textUnits > MAX_MESSAGE_TEXT_UNITS) {
                        accepted = false;
                        break;
                    }
                    call(arrayPush, lines, [line]);
                }
                const currentLength = objectGetOwnPropertyDescriptor(texts, 'length');
                if (accepted && currentLength && 'value' in currentLength && currentLength.value === length) {
                    return createMessageTextData(call<string>(arrayJoin, lines, ['\n']), true, length, '_texts', texts);
                }
            }
        }
        if (includeOrigin) {
            try {
                const originText = reflectApply(provenanceReadOriginText, provenance, [gameMessage]);
                const originToken = ownData(gameMessage, '_trMessageOrigin');
                if (typeof originText === 'string' && originText.length > 0 && isPropertySource(originToken)) {
                    const lineCount = countBoundedTextLines(originText);
                    if (lineCount !== null) {
                        return createMessageTextData(originText, true, lineCount, '_trMessageOrigin', ownData(gameMessage, '_trMessageOrigin'));
                    }
                }
            }
            catch {
            }
        }
        const legacyText = ownData(gameMessage, '_text');
        if (typeof legacyText === 'string') {
            const lineCount = countBoundedTextLines(legacyText);
            if (lineCount !== null)
                return createMessageTextData(legacyText, true, lineCount, '_text', legacyText);
        }
        const currentText = ownData(gameMessage, 'text');
        if (typeof currentText === 'string') {
            const lineCount = countBoundedTextLines(currentText);
            if (lineCount !== null)
                return createMessageTextData(currentText, true, lineCount, 'text', currentText);
        }
        return createMessageTextData('', false, 0, '', null);
    }
    function getInterpreterOriginId(interpreter: unknown): string {
        if (!isPropertySource(globalScope))
            return 'attached';
        const gameMap = ownData(globalScope, '$gameMap');
        if (isPropertySource(gameMap) && ownData(gameMap, '_interpreter') === interpreter)
            return 'map';
        const gameTroop = ownData(globalScope, '$gameTroop');
        if (isPropertySource(gameTroop) && ownData(gameTroop, '_interpreter') === interpreter)
            return 'troop';
        return 'attached';
    }
    return freezeExact({ clearMessageOrigin, readMessageOriginText, readMessageTextData, getInterpreterOriginId });
}
export function createGameMessageForesightContextModule(): GameMessageForesightContextModule {
    function createController(scope: unknown = {}): GameMessageForesightContextController {
        return createGameMessageForesightContextController(scope);
    }
    return freezeExact({ create: createController });
}
