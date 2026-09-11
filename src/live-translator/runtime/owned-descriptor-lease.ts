import { compensateDescriptorTransaction, descriptorTransactionMatches, descriptorsEqual, getOwnDescriptor, type DescriptorTransactionUpdate, } from './descriptor-transaction.js';
export type OwnedReleaseLease = () => boolean;
export type OwnedDescriptorLease = OwnedReleaseLease;
export type OwnedInstallEffectReceipt = OwnedReleaseLease;
type OpaqueOwnedRelease = () => unknown;
export const BITMAP_RASTER_MUTATION_HOOK_EFFECT = 'bitmap-raster-mutation-hooks';
interface OwnedInstallEffectAuthority {
    readonly kind: string;
    readonly owner: object;
    readonly receipt: OwnedInstallEffectReceipt;
}
interface PendingDescriptorRelease {
    readonly update: DescriptorTransactionUpdate;
    readonly target: object;
    readonly key: PropertyKey;
    readonly expected: PropertyDescriptor | undefined;
    readonly prepared: PropertyDescriptor | undefined;
}
const ownedInstallEffectAuthorities = new WeakMap<object, OwnedInstallEffectAuthority>();
export function issueOwnedInstallEffectReceipt(owner: object, kind: string, release: OpaqueOwnedRelease): OwnedInstallEffectReceipt {
    let active = true;
    const receipt = (): boolean => {
        if (!active)
            return true;
        if (release() === false)
            return false;
        active = false;
        ownedInstallEffectAuthorities.delete(receipt);
        return true;
    };
    ownedInstallEffectAuthorities.set(receipt, { kind, owner, receipt });
    return receipt;
}
export function admitOwnedInstallEffectReceipt(value: unknown, owner: object, kind: string): OwnedInstallEffectReceipt | null {
    if (typeof value !== 'function')
        return null;
    const authority = ownedInstallEffectAuthorities.get(value);
    if (authority?.receipt !== value || authority.owner !== owner || authority.kind !== kind) {
        return null;
    }
    return value as OwnedInstallEffectReceipt;
}
export function createOwnedDescriptorLease(updates: readonly DescriptorTransactionUpdate[]): OwnedDescriptorLease {
    const originalUpdates = updates.slice();
    let pending: PendingDescriptorRelease[] = originalUpdates.map((update) => ({
        update,
        target: update.target,
        key: update.key,
        expected: update.expected,
        prepared: update.prepared,
    }));
    return function releaseOwnedDescriptors(): boolean {
        if (pending.length === 0)
            return true;
        compensatePendingDescriptorReleases(pending);
        pending = classifyPendingDescriptorReleases(pending);
        return pending.length === 0;
    };
}
export function composeOwnedReleaseLeases(owned: readonly OwnedReleaseLease[]): OwnedReleaseLease {
    const pending: (OwnedReleaseLease | null)[] = owned.slice();
    return (): boolean => {
        let releaseFailed = false;
        for (let index = pending.length - 1; index >= 0; index -= 1) {
            const release = pending[index];
            if (!release)
                continue;
            try {
                if (release())
                    pending[index] = null;
            }
            catch {
                releaseFailed = true;
            }
        }
        return !releaseFailed && pending.every((release) => release === null);
    };
}
function compensatePendingDescriptorReleases(entries: readonly PendingDescriptorRelease[]): void {
    for (const entry of entries) {
        if (!descriptorTransactionMatches([entry.update], 'prepared'))
            continue;
        compensateDescriptorTransaction([entry.update]);
    }
}
function classifyPendingDescriptorReleases(entries: readonly PendingDescriptorRelease[]): PendingDescriptorRelease[] {
    const remaining: PendingDescriptorRelease[] = [];
    for (const entry of entries) {
        const current = safelyReadOwnDescriptor(entry.target, entry.key);
        if (!current.safe) {
            remaining.push(entry);
            continue;
        }
        if (descriptorsEqual(current.descriptor, entry.expected))
            continue;
        if (!descriptorsEqual(current.descriptor, entry.prepared))
            continue;
        if (descriptorTransactionMatches([entry.update], 'prepared'))
            remaining.push(entry);
    }
    return remaining;
}
function safelyReadOwnDescriptor(target: object, key: PropertyKey): {
    readonly safe: true;
    readonly descriptor: PropertyDescriptor | undefined;
} | {
    readonly safe: false;
} {
    try {
        return { safe: true, descriptor: getOwnDescriptor(target, key) };
    }
    catch {
        return { safe: false };
    }
}
