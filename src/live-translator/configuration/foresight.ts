export const FORESIGHT_LIMITS = Object.freeze({
    targetMessages: 10,
    messages: 20,
    reads: 2048,
    nodes: 256,
    candidates: 64,
    frontiers: 64,
    depth: 16,
    units: 131072,
    inspectedUnits: 262144,
    slice: 128,
    sliceUnits: 16384,
    drain: 8,
});
export const PROJECTION_LIMITS = Object.freeze({ slice: 256, work: 4096 });
export const FORESIGHT_VIEW_LIMITS = Object.freeze({
    nodes: 192,
    edges: 512,
    texts: 256,
    snippet: 320,
    pathDepth: 128,
});
export const NATIVE_LIMITS = Object.freeze({
    messageUnits: 16384,
    choices: 16384,
    indent: 128,
    captureReads: 4096,
    commandFrames: 128,
    windowFrames: 128,
});
type Numbers<Value> = {
    readonly [Key in keyof Value]: number;
};
export type ForesightLimits = Numbers<typeof FORESIGHT_LIMITS>;
export type ForesightViewLimits = Numbers<typeof FORESIGHT_VIEW_LIMITS>;
export type ForesightNativeLimits = Numbers<typeof NATIVE_LIMITS>;
export const FORESIGHT_DEFAULT_LIMITS = Object.freeze({
    scan: FORESIGHT_LIMITS,
    projection: PROJECTION_LIMITS,
    view: FORESIGHT_VIEW_LIMITS,
    native: NATIVE_LIMITS,
});
export type ForesightBudgets = {
    readonly [Group in keyof typeof FORESIGHT_DEFAULT_LIMITS]: Numbers<(typeof FORESIGHT_DEFAULT_LIMITS)[Group]>;
};
export const FORESIGHT_NEARLY_UNBOUNDED_LIMITS: ForesightBudgets = Object.freeze({
    scan: Object.freeze({
        targetMessages: Number.MAX_SAFE_INTEGER,
        messages: Number.MAX_SAFE_INTEGER,
        reads: 1000000,
        nodes: 100000,
        candidates: 50000,
        frontiers: 16384,
        depth: 128,
        units: 33554432,
        inspectedUnits: Number.MAX_SAFE_INTEGER,
        slice: 4096,
        sliceUnits: 262144,
        drain: 128,
    }),
    projection: Object.freeze({ slice: 4096, work: 1000000 }),
    view: FORESIGHT_VIEW_LIMITS,
    native: NATIVE_LIMITS,
});
export interface ForesightSettings {
    readonly showSpoilers: boolean;
    readonly nearlyUnbounded: boolean;
    readonly prioritizedMessages: number;
    readonly limits: ForesightBudgets;
}
export const DEFAULT_FORESIGHT_SETTINGS: ForesightSettings = Object.freeze({
    showSpoilers: false,
    nearlyUnbounded: false,
    prioritizedMessages: 2,
    limits: FORESIGHT_DEFAULT_LIMITS,
});
function own(value: unknown, key: string): unknown {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}
export function normalizeForesightSettings(value: unknown, warn?: (message: string) => void): ForesightSettings {
    function boolean(key: string): boolean {
        const option = own(value, key);
        if (option !== undefined && typeof option !== 'boolean')
            warn?.(`[LiveTranslator][Config] settings.jsonc "foresight.${key}" should be a boolean. Falling back to false.`);
        return option === true;
    }
    const showSpoilers = boolean('showSpoilers'), nearlyUnbounded = boolean('nearlyUnbounded');
    const count = own(value, 'prioritizedMessages');
    const validCount = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= 999;
    if (count !== undefined && !validCount)
        warn?.('[LiveTranslator][Config] settings.jsonc "foresight.prioritizedMessages" should be an integer from 0 to 999. Falling back to 2.');
    const prioritizedMessages = validCount ? count : DEFAULT_FORESIGHT_SETTINGS.prioritizedMessages;
    if (nearlyUnbounded)
        return Object.freeze({
            showSpoilers,
            nearlyUnbounded,
            prioritizedMessages,
            limits: FORESIGHT_NEARLY_UNBOUNDED_LIMITS,
        });
    const input = own(value, 'limits');
    const limits = Object.fromEntries(Object.entries(FORESIGHT_DEFAULT_LIMITS).map(([group, defaults]) => {
        const source = own(input, group);
        return [
            group,
            Object.freeze(Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
                const option = own(source, key);
                if (typeof option === 'number' && Number.isSafeInteger(option) && option > 0)
                    return [key, option];
                if (option !== undefined)
                    warn?.(`[LiveTranslator][Config] settings.jsonc "foresight.limits.${group}.${key}" should be a positive safe integer. Falling back to ${String(fallback)}.`);
                return [key, fallback];
            }))),
        ];
    })) as ForesightBudgets;
    return Object.freeze({ showSpoilers, nearlyUnbounded, prioritizedMessages, limits: Object.freeze(limits) });
}
export function readForesightViewLimits(value: unknown): ForesightViewLimits | null {
    const result: Record<string, number> = {};
    for (const key of Object.keys(FORESIGHT_VIEW_LIMITS)) {
        const limit = own(value, key);
        if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit <= 0)
            return null;
        result[key] = limit;
    }
    return Object.freeze(result) as ForesightViewLimits;
}
