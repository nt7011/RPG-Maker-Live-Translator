import { createGuiOwnDataRecord, defineGuiOwnDataProperty, type GuiRuntimeFeedHealth, type GuiRuntimeFeedHealthMap, type GuiRuntimeFeedName, type UnknownRecord, } from '../types.js';
const applyRuntimeFeedHealthFunction = Reflect.apply;
const freezeRuntimeFeedHealthValue = Object.freeze;
export const RUNTIME_FEED_NAMES: readonly GuiRuntimeFeedName[] = applyRuntimeFeedHealthFunction(freezeRuntimeFeedHealthValue, Object, [['settings', 'hooks', 'textRecords', 'translation', 'drawCapture', 'foresight']]) as readonly GuiRuntimeFeedName[];
export const RUNTIME_FEED_LABELS: Readonly<Record<GuiRuntimeFeedName, string>> = {
    settings: 'Runtime settings',
    hooks: 'Hooks',
    textRecords: 'Text records',
    translation: 'Translation',
    drawCapture: 'Draw capture',
    foresight: 'Foresight',
};
export function createInitialRuntimeFeedHealth(): GuiRuntimeFeedHealthMap {
    const health = createGuiOwnDataRecord();
    defineGuiOwnDataProperty(health, 'settings', createUnavailableRuntimeFeedHealth(0, null, 'not observed'));
    defineGuiOwnDataProperty(health, 'hooks', createUnavailableRuntimeFeedHealth(0, null, 'not observed'));
    defineGuiOwnDataProperty(health, 'textRecords', createUnavailableRuntimeFeedHealth(0, null, 'not observed'));
    defineGuiOwnDataProperty(health, 'translation', createUnavailableRuntimeFeedHealth(0, null, 'not observed'));
    defineGuiOwnDataProperty(health, 'drawCapture', createUnavailableRuntimeFeedHealth(0, null, 'not observed'));
    defineGuiOwnDataProperty(health, 'foresight', createUnavailableRuntimeFeedHealth(0, null, 'not observed'));
    return health as unknown as GuiRuntimeFeedHealthMap;
}
export function createCurrentRuntimeFeedHealth(generation: number): GuiRuntimeFeedHealth {
    return createRuntimeFeedHealth('current', generation, generation, '');
}
export function createFailedRuntimeFeedHealth(generation: number, previous: GuiRuntimeFeedHealth, reason: string): GuiRuntimeFeedHealth {
    return createRuntimeFeedHealth('failed', generation, previous.lastSuccessGeneration, reason);
}
export function createUnavailableRuntimeFeedHealth(generation: number, previousSuccess: number | null, reason: string): GuiRuntimeFeedHealth {
    return createRuntimeFeedHealth('unavailable', generation, previousSuccess, reason);
}
function createRuntimeFeedHealth(status: GuiRuntimeFeedHealth['status'], observedGeneration: number, lastSuccessGeneration: number | null, reason: string): GuiRuntimeFeedHealth {
    const health = createGuiOwnDataRecord();
    defineGuiOwnDataProperty(health, 'status', status);
    defineGuiOwnDataProperty(health, 'observedGeneration', observedGeneration);
    defineGuiOwnDataProperty(health, 'lastSuccessGeneration', lastSuccessGeneration);
    defineGuiOwnDataProperty(health, 'reason', reason);
    return health as unknown as GuiRuntimeFeedHealth;
}
export function createRuntimeFeedHealthRenderKey(health: GuiRuntimeFeedHealthMap, names: readonly GuiRuntimeFeedName[] = RUNTIME_FEED_NAMES): unknown[] {
    const key: unknown[] = [];
    const length = names.length;
    for (let index = 0; index < length; index += 1) {
        const name = names[index];
        if (name === undefined)
            continue;
        const feed = health[name];
        defineGuiOwnDataProperty(key, index, feed.status === 'current'
            ? [name, 'current']
            : [name, feed.status, feed.reason, feed.lastSuccessGeneration]);
    }
    return key;
}
export function copyRuntimeFeedHealth(health: GuiRuntimeFeedHealthMap, names: readonly GuiRuntimeFeedName[]): UnknownRecord {
    const copied = createGuiOwnDataRecord();
    const length = names.length;
    for (let index = 0; index < length; index += 1) {
        const name = names[index];
        if (name === undefined)
            continue;
        const feed = health[name];
        const feedCopy = createRuntimeFeedHealth(feed.status, feed.observedGeneration, feed.lastSuccessGeneration, feed.reason);
        defineGuiOwnDataProperty(copied, name, feedCopy);
    }
    return copied;
}
