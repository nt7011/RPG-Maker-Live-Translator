import { windowAdapter } from '../../semantic-adapters/window.js';
import { gameMessageAdapter } from '../../semantic-adapters/game-message.js';
import type { SemanticAdapter } from '../../semantic-adapters/contract.js';
function own(value: unknown, key: string): unknown {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor ? (descriptor.value as unknown) : undefined;
}
export function createSemanticAdapters(settings: unknown): readonly SemanticAdapter[] {
    const flags = own(settings, 'adapters');
    const adapters: SemanticAdapter[] = [];
    if (own(flags, 'window') === true)
        adapters.push(windowAdapter());
    if (own(flags, 'gameMessage') === true)
        adapters.push(gameMessageAdapter());
    return Object.freeze(adapters);
}
