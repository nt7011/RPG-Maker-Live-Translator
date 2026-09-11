type PropertySource = Record<PropertyKey, unknown>;
export type PixiTextSourceKind = 'canvas-text' | 'bitmap-text';
export type PixiTextReadResult = Readonly<{
    readonly ok: true;
    readonly text: string;
}> | Readonly<{
    readonly ok: false;
    readonly reason: string;
}>;
export interface PixiTextRuntimeCapabilities {
    readonly available: boolean;
    readonly bitmapTextAvailable: boolean;
    readonly reason: string;
    classifyDisplayObject(value: unknown): PixiTextSourceKind | null;
    readText(value: unknown): PixiTextReadResult;
}
export interface PixiTextRuntimeCapabilitiesModule {
    inspect(scope?: unknown): PixiTextRuntimeCapabilities;
}
const capabilityFreeze = Object.freeze;
const capabilityGetPrototypeOf = Object.getPrototypeOf;
const capabilityReflectGet = Reflect.get;
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readProperty(value: unknown, key: PropertyKey): unknown {
    return isPropertySource(value) ? capabilityReflectGet(value, key, value) : undefined;
}
function constructorPrototype(value: unknown): object | null {
    if (typeof value !== 'function')
        return null;
    try {
        const prototype = readProperty(value, 'prototype');
        return isPropertySource(prototype) ? prototype : null;
    }
    catch {
        return null;
    }
}
function pushUniquePrototype(target: object[], prototype: object | null): void {
    if (!prototype)
        return;
    for (const current of target)
        if (current === prototype)
            return;
    target[target.length] = prototype;
}
function prototypeChainContains(value: unknown, expected: readonly object[]): boolean {
    if (!isPropertySource(value) || expected.length === 0)
        return false;
    let cursor: object | null;
    try {
        const prototype: unknown = capabilityGetPrototypeOf(value);
        cursor = isPropertySource(prototype) ? prototype : null;
    }
    catch {
        return false;
    }
    for (let depth = 0; cursor && depth < 128; depth += 1) {
        for (const prototype of expected)
            if (cursor === prototype)
                return true;
        try {
            const parent: unknown = capabilityGetPrototypeOf(cursor);
            cursor = isPropertySource(parent) ? parent : null;
        }
        catch {
            return false;
        }
    }
    return false;
}
function freezeReadResult<Result extends PixiTextReadResult>(result: Result): Result {
    capabilityFreeze(result);
    return result;
}
export function createPixiTextRuntimeCapabilitiesModule(): PixiTextRuntimeCapabilitiesModule {
    function inspect(scope: unknown = globalThis): PixiTextRuntimeCapabilities {
        let pixi: unknown;
        try {
            pixi = readProperty(scope, 'PIXI');
        }
        catch {
            pixi = null;
        }
        const canvasTextPrototypes: object[] = [];
        const bitmapTextPrototypes: object[] = [];
        if (isPropertySource(pixi)) {
            try {
                pushUniquePrototype(canvasTextPrototypes, constructorPrototype(readProperty(pixi, 'Text')));
            }
            catch {
            }
            try {
                pushUniquePrototype(bitmapTextPrototypes, constructorPrototype(readProperty(pixi, 'BitmapText')));
            }
            catch {
            }
            try {
                const extras = readProperty(pixi, 'extras');
                pushUniquePrototype(bitmapTextPrototypes, constructorPrototype(readProperty(extras, 'BitmapText')));
            }
            catch {
            }
        }
        const available = canvasTextPrototypes.length > 0 || bitmapTextPrototypes.length > 0;
        const reason = available ? '' : 'pixi-text-constructors-unavailable';
        const capabilities: PixiTextRuntimeCapabilities = {
            available,
            bitmapTextAvailable: bitmapTextPrototypes.length > 0,
            reason,
            classifyDisplayObject(value: unknown): PixiTextSourceKind | null {
                if (prototypeChainContains(value, bitmapTextPrototypes))
                    return 'bitmap-text';
                if (prototypeChainContains(value, canvasTextPrototypes))
                    return 'canvas-text';
                return null;
            },
            readText(value: unknown): PixiTextReadResult {
                if (!isPropertySource(value)) {
                    return freezeReadResult({ ok: false, reason: 'pixi-text-source-unavailable' });
                }
                try {
                    const text = readProperty(value, 'text');
                    return typeof text === 'string'
                        ? freezeReadResult({ ok: true, text })
                        : freezeReadResult({ ok: false, reason: 'pixi-text-source-not-string' });
                }
                catch {
                    return freezeReadResult({ ok: false, reason: 'pixi-text-source-read-failed' });
                }
            },
        };
        capabilityFreeze(capabilities);
        return capabilities;
    }
    return capabilityFreeze({ inspect });
}
