import { encodeStableIdentity } from '../../runtime/identity-codec.js';
const MESSAGE_ORIGIN_IDENTITY_DOMAIN = 'game-message.origin';
const MESSAGE_SOURCE_IDENTITY_DOMAIN = 'game-message.foresight-source';
export interface GameMessageOriginIdentityFacts {
    readonly interpreterId?: unknown;
    readonly listId?: unknown;
    readonly startIndex?: unknown;
    readonly nextIndex?: unknown;
}
function nonemptyString(value: unknown): string {
    return typeof value === 'string' && value ? value : '';
}
function integer(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : null;
}
export function createGameMessageOriginIdentity(facts: unknown): string {
    if (!facts || typeof facts !== 'object')
        return '';
    const source = facts as GameMessageOriginIdentityFacts;
    const interpreterId = nonemptyString(source.interpreterId);
    const listId = nonemptyString(source.listId);
    const startIndex = integer(source.startIndex);
    const nextIndex = integer(source.nextIndex);
    if (!interpreterId || !listId || startIndex === null || nextIndex === null)
        return '';
    if (startIndex < 0 || nextIndex <= startIndex)
        return '';
    return encodeStableIdentity(MESSAGE_ORIGIN_IDENTITY_DOMAIN, [
        interpreterId,
        listId,
        String(startIndex),
        String(nextIndex),
    ]);
}
export function createGameMessageForesightSourceIdentity(sourceKey: unknown): string {
    const source = nonemptyString(sourceKey).trim();
    return source ? encodeStableIdentity(MESSAGE_SOURCE_IDENTITY_DOMAIN, [source]) : '';
}
