export interface ForesightPathQueueDependencies {
    readonly createKey: (path: unknown) => string | null;
    readonly merge: (target: unknown, source: unknown) => boolean;
    readonly isStronger: (candidate: unknown, processed: unknown) => boolean;
    readonly isUsablePath: (path: unknown) => boolean;
    readonly maxProcessedPaths: number;
}
type QueueState = 'pending' | 'active' | 'processed' | 'tombstone';
interface QueueEntry {
    key: string;
    path: unknown;
    state: QueueState;
    reopens: number;
    continuationAvailable: boolean;
}
export interface ForesightPathQueueOwner {
    readonly enqueue: (path: unknown) => boolean;
    readonly takeNext: (select?: (paths: readonly unknown[]) => number) => unknown;
    readonly complete: (path: unknown) => void;
    readonly hasPending: () => boolean;
    readonly pendingPaths: () => readonly unknown[];
}
const MAX_REOPENS_PER_KEY = 1;
export function createForesightPathQueueOwner(dependencies: ForesightPathQueueDependencies): ForesightPathQueueOwner {
    const { createKey, merge, isStronger, isUsablePath } = dependencies;
    const entries: QueueEntry[] = [];
    const requestedLimit = Math.floor(dependencies.maxProcessedPaths);
    const maxKeyedEntries = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 1;
    function findByKey(key: string): QueueEntry | null {
        return entries.find((entry) => entry.key === key) ?? null;
    }
    function findActivePath(path: unknown): QueueEntry | null {
        return entries.find((entry) => entry.state === 'active' && entry.path === path) ?? null;
    }
    function removeEntry(entry: QueueEntry): void {
        const index = entries.indexOf(entry);
        if (index >= 0)
            entries.splice(index, 1);
    }
    function retireActive(entry: QueueEntry | null): void {
        if (!entry)
            return;
        if (!entry.key) {
            removeEntry(entry);
            return;
        }
        entry.state = 'tombstone';
        entry.continuationAvailable = false;
    }
    function canAdmitKey(key: string): boolean {
        if (findByKey(key))
            return true;
        let count = 0;
        for (const entry of entries)
            if (entry.key)
                count += 1;
        return count < maxKeyedEntries;
    }
    function publishPending(path: unknown, key: string): void {
        entries.push({
            key,
            path,
            state: 'pending',
            reopens: 0,
            continuationAvailable: false,
        });
    }
    function enqueue(path: unknown): boolean {
        if (!isUsablePath(path))
            return false;
        const key = createKey(path);
        const exactActive = findActivePath(path);
        if (key === null) {
            retireActive(exactActive);
            return false;
        }
        if (!key) {
            retireActive(exactActive);
            publishPending(path, '');
            return true;
        }
        const entry = findByKey(key);
        if (entry?.state === 'active') {
            return false;
        }
        if (entry?.state === 'pending') {
            merge(entry.path, path);
            if (exactActive !== entry)
                retireActive(exactActive);
            return false;
        }
        if (entry?.state === 'tombstone') {
            retireActive(exactActive);
            return false;
        }
        if (entry?.state === 'processed') {
            if (entry.path === path && entry.continuationAvailable) {
                removeEntry(entry);
                entry.state = 'pending';
                entry.continuationAvailable = false;
                entries.push(entry);
                retireActive(exactActive === entry ? null : exactActive);
                return true;
            }
            if (entry.reopens >= MAX_REOPENS_PER_KEY || !isStronger(path, entry.path)) {
                retireActive(exactActive);
                return false;
            }
            removeEntry(entry);
            entry.path = path;
            entry.state = 'pending';
            entry.reopens += 1;
            entry.continuationAvailable = false;
            entries.push(entry);
            retireActive(exactActive === entry ? null : exactActive);
            return true;
        }
        if (!canAdmitKey(key)) {
            retireActive(exactActive);
            return false;
        }
        retireActive(exactActive);
        publishPending(path, key);
        return true;
    }
    function takeNext(select?: (paths: readonly unknown[]) => number): unknown {
        const pending = entries.filter((entry) => entry.state === 'pending');
        if (pending.length === 0)
            return null;
        const selection = select ? select(pending.map((entry) => entry.path)) : 0;
        const index = Number.isInteger(selection) && selection >= 0 && selection < pending.length ? selection : 0;
        const entry = pending[index];
        if (!entry)
            return null;
        entry.state = 'active';
        return entry.path;
    }
    function complete(path: unknown): void {
        const active = findActivePath(path);
        if (!active)
            return;
        const key = createKey(path);
        if (key === null || !key) {
            retireActive(active);
            return;
        }
        if (key === active.key) {
            active.state = 'processed';
            active.continuationAvailable = false;
            return;
        }
        const successor = findByKey(key);
        if (successor?.state === 'pending')
            merge(successor.path, path);
        retireActive(active);
        if (successor || !canAdmitKey(key))
            return;
        entries.push({
            key,
            path,
            state: 'processed',
            reopens: 0,
            continuationAvailable: true,
        });
    }
    function pendingPaths(): readonly unknown[] {
        return Object.freeze(entries.filter((entry) => entry.state === 'pending').map((entry) => entry.path));
    }
    return Object.freeze({
        enqueue,
        takeNext,
        complete,
        hasPending: () => entries.some((entry) => entry.state === 'pending'),
        pendingPaths,
    });
}
