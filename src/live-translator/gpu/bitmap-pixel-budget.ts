import { BITMAP_LIMITS } from '../stores/bitmap-limits.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
import { PixelCapacityRefusal, type ImageOwner } from './bitmap-pixel-types.js';
type MemoryCategory = `${ImageOwner}Bytes` | 'canvasBytes' | 'transferBytes' | 'displayBytes' | 'exportBytes' | 'replayBytes';
export function createPixelBudget(maxTextureSize: number, resourceEvent?: RuntimeResourceObserver) {
    const categories = new Map<MemoryCategory, number>();
    let total = 0;
    let reclamation = false;
    function get(category: MemoryCategory): number {
        return categories.get(category) ?? 0;
    }
    function add(category: MemoryCategory, delta: number): void {
        categories.set(category, get(category) + delta);
        total += delta;
        if (delta !== 0)
            resourceEvent?.({ kind: 'memory', category, delta });
    }
    function set(category: MemoryCategory, value: number): void {
        add(category, value - get(category));
    }
    function move(from: MemoryCategory, to: MemoryCategory, bytes: number): void {
        if (from === to || bytes === 0)
            return;
        categories.set(from, get(from) - bytes);
        categories.set(to, get(to) + bytes);
        try {
            resourceEvent?.({ kind: 'memory', category: from, delta: -bytes });
        }
        finally {
            resourceEvent?.({ kind: 'memory', category: to, delta: bytes });
        }
    }
    function refuse(extra: number, dimensions = 0): never {
        const name = dimensions > 0 ? 'textureSize' : 'pixelBytes';
        resourceEvent?.({
            kind: 'usage',
            name,
            value: dimensions || total,
            limit: dimensions > 0 ? maxTextureSize : BITMAP_LIMITS.pixelBytes,
        });
        resourceEvent?.({ kind: 'refused', name, requested: dimensions || extra });
        reclamation = true;
        throw new PixelCapacityRefusal('Bitmap GPU capacity is unavailable.');
    }
    function check(extra: number): void {
        if (extra > BITMAP_LIMITS.pixelBytes - total)
            refuse(extra);
    }
    return {
        get,
        add,
        set,
        move,
        check,
        refuse,
        maxTextureSize,
        allocatedBytes: () => total,
        needsReclamation: () => reclamation,
        reclaimed: () => {
            reclamation = false;
        },
    };
}
export type PixelBudget = ReturnType<typeof createPixelBudget>;
