interface Entry {
    readonly job: unknown;
    readonly sequence: number;
    priority: number;
    index: number;
}
export interface PendingTranslationQueue extends Iterable<unknown> {
    readonly length: number;
    readonly version: number;
    has(job: unknown): boolean;
    add(job: unknown): void;
    delete(job: unknown): boolean;
    update(job: unknown, priority: number): void;
    peek(predicate?: (job: unknown) => boolean, minimumPriority?: number): unknown;
    snapshot(): unknown[];
}
export function createPendingTranslationQueue(): PendingTranslationQueue {
    const heap: Entry[] = [], entries = new Map<unknown, Entry>();
    let version = 0, sequence = 0;
    const before = (a: Entry, b: Entry) => a.priority > b.priority || (a.priority === b.priority && a.sequence < b.sequence);
    function at(index: number): Entry {
        const entry = heap[index];
        if (entry === undefined)
            throw new Error('Pending queue index is not owned.');
        return entry;
    }
    function swap(a: number, b: number): void {
        const left = at(a), right = at(b);
        heap[a] = right;
        right.index = a;
        heap[b] = left;
        left.index = b;
    }
    function repair(entry: Entry): void {
        while (entry.index > 0) {
            const parent = Math.floor((entry.index - 1) / 2);
            if (!before(entry, at(parent)))
                break;
            swap(entry.index, parent);
        }
        for (;;) {
            const left = entry.index * 2 + 1, right = left + 1;
            let best = entry.index;
            if (left < heap.length && before(at(left), at(best)))
                best = left;
            if (right < heap.length && before(at(right), at(best)))
                best = right;
            if (best === entry.index)
                return;
            swap(entry.index, best);
        }
    }
    function add(job: unknown): void {
        if (entries.has(job))
            return;
        const input = job as {
            effectivePriority?: number;
            queueSeq?: number;
        };
        const priority = input.effectivePriority ?? 0, seq = input.queueSeq ?? sequence + 1;
        if (!Number.isFinite(priority) || !Number.isSafeInteger(seq))
            throw new TypeError('Invalid pending job order.');
        const entry = { job, priority, sequence: seq, index: heap.length };
        sequence = Math.max(sequence, seq);
        entries.set(job, entry);
        heap.push(entry);
        repair(entry);
        version++;
    }
    function remove(job: unknown): boolean {
        const entry = entries.get(job);
        if (entry === undefined)
            return false;
        entries.delete(job);
        const last = heap.pop();
        if (last === undefined)
            throw new Error('Pending queue lost an owned entry.');
        if (last !== entry) {
            heap[entry.index] = last;
            last.index = entry.index;
            repair(last);
        }
        version++;
        return true;
    }
    function update(job: unknown, priority: number): void {
        const entry = entries.get(job);
        if (entry === undefined)
            return;
        if (entry.priority !== priority) {
            entry.priority = priority;
            repair(entry);
        }
        version++;
    }
    function peek(predicate: (job: unknown) => boolean = () => true, minimumPriority = -Infinity): unknown {
        let best: Entry | undefined;
        const visit = (index: number): void => {
            const entry = heap[index];
            if (entry === undefined || entry.priority < minimumPriority || (best !== undefined && !before(entry, best)))
                return;
            if (predicate(entry.job)) {
                best = entry;
                return;
            }
            visit(index * 2 + 1);
            visit(index * 2 + 2);
        };
        visit(0);
        return best?.job;
    }
    return Object.freeze({
        get length() {
            return heap.length;
        },
        get version() {
            return version;
        },
        has: (job: unknown) => entries.has(job),
        add,
        delete: remove,
        update,
        peek,
        snapshot: () => heap
            .slice()
            .sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0))
            .map((entry) => entry.job),
        *[Symbol.iterator]() {
            for (const entry of heap)
                yield entry.job;
        },
    });
}
