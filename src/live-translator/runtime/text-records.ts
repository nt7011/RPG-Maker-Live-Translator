import type { SemanticTextStore } from '../stores/semantic-text-store.js';
import type { TextRecordsSnapshot } from './text-record-types.js';
import type { ForesightView } from '../foresight/view.js';
import { commitDescriptorTransaction, createOwnDataDescriptorShadowUpdate } from './descriptor-transaction.js';
import { createOwnedDescriptorLease, type OwnedDescriptorLease } from './owned-descriptor-lease.js';
interface Options {
    readonly scope: Record<PropertyKey, unknown>;
    readonly generation: number;
    readonly store: Pick<SemanticTextStore, 'getSnapshot' | 'observe'>;
    readonly onScreenGameMessages: () => ReadonlySet<number>;
    readonly foresight?: () => ForesightView | null;
}
export function createTextRecordsPublication({ scope, generation, store, onScreenGameMessages, foresight }: Options) {
    const listeners = new Set<(snapshot: TextRecordsSnapshot) => void>();
    let observation: Readonly<{
        detach(): void;
    }> | null = null;
    let release: OwnedDescriptorLease | null = null;
    let pending: {
        id: number | null;
    } | null = null;
    let sequence = 0;
    let disposed = false;
    function snapshot(): TextRecordsSnapshot {
        const pinned = disposed ? new Set<number>() : onScreenGameMessages();
        let future: ForesightView | null = null;
        try {
            if (!disposed)
                future = foresight?.() ?? null;
        }
        catch {
        }
        return Object.freeze({
            generation,
            sequence: ++sequence,
            active: !disposed,
            foresight: future,
            records: Object.freeze(disposed
                ? []
                : store.getSnapshot().map((record) => Object.freeze({
                    textId: record.textId,
                    semanticRevision: record.semanticRevision,
                    attempt: record.attempt,
                    sourceText: record.sourceText,
                    state: record.state,
                    translation: record.translation,
                    request: record.request,
                    semanticControl: record.semanticControl,
                    onScreenGameMessage: pinned.has(record.textId),
                }))),
        });
    }
    function deliver(listener: (snapshot: TextRecordsSnapshot) => void, value: TextRecordsSnapshot): void {
        try {
            listener(value);
        }
        catch {
        }
    }
    function cancelFrame(): void {
        const frame = pending;
        pending = null;
        if (frame?.id === null || frame === null)
            return;
        try {
            const cancel = scope['cancelAnimationFrame'];
            if (typeof cancel === 'function')
                Reflect.apply(cancel, scope, [frame.id]);
        }
        catch {
        }
    }
    function changed(): void {
        if (disposed || pending !== null || listeners.size === 0)
            return;
        const frame = { id: null as number | null };
        pending = frame;
        try {
            const request = scope['requestAnimationFrame'];
            if (typeof request !== 'function') {
                pending = null;
                return;
            }
            frame.id = Reflect.apply(request, scope, [
                () => {
                    if (pending !== frame || disposed)
                        return;
                    pending = null;
                    if (listeners.size === 0)
                        return;
                    const value = snapshot();
                    for (const listener of [...listeners]) {
                        if (listeners.has(listener))
                            deliver(listener, value);
                    }
                },
            ]) as number;
        }
        catch {
            pending = null;
        }
    }
    function subscribe(listener: (snapshot: TextRecordsSnapshot) => void): Readonly<{
        detach(): void;
    }> {
        if (typeof listener !== 'function')
            throw new TypeError('A text-record listener is required.');
        const receive = (value: TextRecordsSnapshot): void => {
            listener(value);
        };
        if (!disposed) {
            listeners.add(receive);
            observation ??= store.observe(changed);
        }
        deliver(receive, snapshot());
        return Object.freeze({
            detach(): void {
                listeners.delete(receive);
                if (listeners.size > 0)
                    return;
                observation?.detach();
                observation = null;
                cancelFrame();
            },
        });
    }
    const api = Object.freeze({ subscribe });
    return Object.freeze({
        changed,
        activate(): void {
            if (disposed || release !== null)
                return;
            try {
                const update = createOwnDataDescriptorShadowUpdate(scope, 'LiveTranslatorTextRecords', api);
                if (update === null)
                    return;
                release = createOwnedDescriptorLease([update]);
                if (!commitDescriptorTransaction([update]).committed)
                    release();
            }
            catch {
            }
        },
        dispose(): boolean {
            if (!disposed) {
                disposed = true;
                observation?.detach();
                observation = null;
                cancelFrame();
                const receivers = [...listeners];
                listeners.clear();
                if (receivers.length > 0) {
                    const value = snapshot();
                    for (const receive of receivers)
                        deliver(receive, value);
                }
            }
            try {
                return release?.() ?? true;
            }
            catch {
                return false;
            }
        },
    });
}
