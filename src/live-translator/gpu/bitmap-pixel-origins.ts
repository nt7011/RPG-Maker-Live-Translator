import type { PixelCaptures } from './bitmap-pixel-captures.js';
import type { PixelProofOperations } from './bitmap-pixel-proofs.js';
import type { PixelResources } from './bitmap-pixel-resources.js';
import { PixelCapacityRefusal, type PixelDrawing, type PixelSnapshot, type PixelTextGroup, type Image, type FailureTrace, } from './bitmap-pixel-types.js';
export interface OriginPixels {
    readonly original: Image;
    readonly candidate: Image;
    readonly valid: Image;
    readonly trace?: FailureTrace;
}
export function createPixelOrigins(drawing: PixelDrawing, options: {
    readonly isDisposed: () => boolean;
    readonly proofDiagnostics?: boolean | undefined;
    readonly selectEffects: PixelCaptures['selectEffects'];
    readonly reverseEffects: PixelProofOperations['reverseEffects'];
    readonly assign: PixelResources['assign'];
}) {
    const { allocate, release, upload, copy, flag } = drawing;
    const { isDisposed, selectEffects, reverseEffects, assign } = options;
    const snapshots = new Map<PixelSnapshot, {
        source: WeakRef<HTMLCanvasElement>;
        groups: readonly PixelTextGroup[];
        freezing: boolean;
    } | {
        pixels: OriginPixels;
    }>();
    function describeSnapshot(source: HTMLCanvasElement, groups: readonly PixelTextGroup[]): PixelSnapshot {
        if (isDisposed())
            throw new Error('Bitmap pixel device is disposed.');
        const handle = Object.freeze({ kind: 'pixel-snapshot' } as const);
        snapshots.set(handle, { source: new WeakRef(source), groups, freezing: false });
        return handle;
    }
    function captureSnapshot(handle: PixelSnapshot): boolean {
        const snapshot = snapshots.get(handle);
        if (snapshot === undefined || isDisposed())
            return false;
        if ('pixels' in snapshot)
            return true;
        if (snapshot.freezing)
            return false;
        const source = snapshot.source.deref();
        if (source === undefined)
            return false;
        snapshot.freezing = true;
        let completed = false;
        const owned: Image[] = [];
        const own = (image: Image) => {
            owned.push(image);
            return image;
        };
        try {
            const valid = own(flag(1));
            const trace: FailureTrace | null = options.proofDiagnostics ? { image: own(flag(0)), checks: [] } : null;
            const selected = selectEffects(source, snapshot.groups);
            if (selected === null)
                return false;
            const original = own(allocate(source.width, source.height)), candidate = own(allocate(source.width, source.height));
            upload(original, source);
            copy(original, candidate);
            reverseEffects(selected, candidate, valid, trace, 0);
            for (const image of owned)
                if (!assign(image, 'origin'))
                    return false;
            if (isDisposed() || snapshots.get(handle) !== snapshot)
                return false;
            const pixels: {
                original: Image;
                candidate: Image;
                valid: Image;
                trace?: FailureTrace;
            } = {
                original,
                candidate,
                valid,
            };
            if (trace !== null)
                pixels.trace = trace;
            snapshots.set(handle, { pixels });
            completed = true;
            return true;
        }
        catch (error) {
            if (error instanceof PixelCapacityRefusal)
                return false;
            throw error;
        }
        finally {
            snapshot.freezing = false;
            if (!completed)
                for (const image of owned)
                    release(image);
        }
    }
    function releaseSnapshot(handle: PixelSnapshot): void {
        const snapshot = snapshots.get(handle);
        if (snapshot === undefined)
            return;
        snapshots.delete(handle);
        if ('pixels' in snapshot) {
            release(snapshot.pixels.original);
            release(snapshot.pixels.candidate);
            release(snapshot.pixels.valid);
            if (snapshot.pixels.trace !== undefined)
                release(snapshot.pixels.trace.image);
        }
    }
    return {
        describe: describeSnapshot,
        capture: captureSnapshot,
        release: releaseSnapshot,
        pixels: (handle: PixelSnapshot): OriginPixels | undefined => {
            const snapshot = snapshots.get(handle);
            return snapshot !== undefined && 'pixels' in snapshot ? snapshot.pixels : undefined;
        },
        count: () => snapshots.size,
        dispose: () => {
            for (const handle of snapshots.keys())
                releaseSnapshot(handle);
        },
    };
}
export type PixelOrigins = ReturnType<typeof createPixelOrigins>;
