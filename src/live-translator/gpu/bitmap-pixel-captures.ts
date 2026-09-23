import type { CanvasPixelDamage } from '../observer-hooks/canvas/canvas-pixel-damage.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
import { PixelCapacityRefusal, type Capture, type Effect, type Image, type PixelBounds, type PixelCapture, type PixelDrawing, type PixelEffect, type PixelTextGroup, type SelectedEffect, } from './bitmap-pixel-types.js';
import { intersection } from './bitmap-pixel-geometry.js';
export function createPixelCaptures(drawing: PixelDrawing, options: {
    readonly isDisposed: () => boolean;
    readonly probeEvent?: RuntimeResourceObserver | undefined;
}) {
    const { gl, allocate, release, target, upload } = drawing;
    const { isDisposed } = options;
    const captures = new Map<PixelCapture, Capture>();
    const effects = new Map<PixelEffect, Effect>();
    const sourceIds = new WeakMap<HTMLCanvasElement, object>();
    function sourceId(source: HTMLCanvasElement): object {
        return sourceIds.getOrInsertComputed(source, () => ({}));
    }
    let nextSequence = 0;
    function begin(source: HTMLCanvasElement): PixelCapture {
        if (isDisposed())
            throw new Error('Bitmap pixel device is disposed.');
        const handle = Object.freeze({ kind: 'pixel-capture' } as const);
        const capture: Capture = {
            source: new WeakRef(source),
            width: source.width,
            height: source.height,
            damage: null,
            before: null,
            blank: false,
        };
        captures.set(handle, capture);
        return handle;
    }
    function prepareWrite(handle: PixelCapture, damage: CanvasPixelDamage, sourceIsBlank = false): boolean {
        const capture = captures.get(handle);
        if (capture === undefined)
            throw new Error('Unknown GPU capture.');
        const source = capture.source.deref();
        if (capture.width !== source?.width || capture.height !== source.height)
            throw new Error('Source resized during text command.');
        const x = damage.kind === 'full' ? 0 : Math.max(0, Math.floor(damage.x)), y = damage.kind === 'full' ? 0 : Math.max(0, Math.floor(damage.y));
        const right = damage.kind === 'full' ? capture.width : Math.min(capture.width, Math.ceil(damage.x + damage.width));
        const bottom = damage.kind === 'full' ? capture.height : Math.min(capture.height, Math.ceil(damage.y + damage.height));
        if (right <= x || bottom <= y)
            return true;
        const old = capture.damage;
        const bounds = { x: Math.min(x, old?.x ?? x), y: Math.min(y, old?.y ?? y), width: 0, height: 0 };
        bounds.width = Math.max(right, old === null ? right : old.x + old.width) - bounds.x;
        bounds.height = Math.max(bottom, old === null ? bottom : old.y + old.height) - bounds.y;
        if (capture.before === null && !capture.blank && sourceIsBlank)
            capture.blank = true;
        try {
            if (capture.before === null && !capture.blank) {
                capture.before = allocate(capture.width, capture.height, 'capture');
                upload(capture.before, source);
            }
            capture.damage = bounds;
            return true;
        }
        catch (error) {
            abort(handle);
            if (error instanceof PixelCapacityRefusal)
                return false;
            throw error;
        }
    }
    function abort(handle: PixelCapture): void {
        const capture = captures.get(handle);
        captures.delete(handle);
        if (capture?.before)
            release(capture.before);
    }
    function finish(handle: PixelCapture, repaint: readonly PixelBounds[] = []): PixelEffect | null {
        const capture = captures.get(handle);
        if (capture === undefined)
            throw new Error('Unknown GPU capture.');
        if (capture.damage === null || (capture.before === null && !capture.blank)) {
            abort(handle);
            return null;
        }
        const source = capture.source.deref();
        if (source?.width !== capture.width || source.height !== capture.height) {
            abort(handle);
            return null;
        }
        let evidence = capture.damage;
        const surface = { x: 0, y: 0, width: capture.width, height: capture.height };
        for (const region of repaint) {
            const clipped = intersection(region, surface);
            if (clipped === null)
                continue;
            const x = Math.min(evidence.x, clipped.x), y = Math.min(evidence.y, clipped.y);
            evidence = {
                x,
                y,
                width: Math.max(evidence.x + evidence.width, clipped.x + clipped.width) - x,
                height: Math.max(evidence.y + evidence.height, clipped.y + clipped.height) - y,
            };
        }
        let before: Image | null = null, after: Image | null = null;
        try {
            before = allocate(evidence.width, evidence.height, 'effect');
            if (capture.blank) {
                target(before);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            else if (capture.before !== null) {
                target(capture.before);
                gl.bindTexture(gl.TEXTURE_2D, before.texture);
                gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, evidence.x, evidence.y, before.width, before.height);
            }
            after = allocate(evidence.width, evidence.height, 'effect');
            upload(after, source, evidence.x, evidence.y);
            const effect: Effect = {
                sequence: ++nextSequence,
                source: sourceId(source),
                width: capture.width,
                height: capture.height,
                damage: capture.damage,
                evidence,
                before,
                after,
            };
            captures.delete(handle);
            if (capture.before !== null)
                release(capture.before);
            const token = Object.freeze({ kind: 'pixel-effect' } as const);
            effects.set(token, effect);
            options.probeEvent?.({ kind: 'probe-count', name: 'effects.created', value: 1 });
            return token;
        }
        catch (error) {
            if (before !== null)
                release(before);
            if (after !== null)
                release(after);
            abort(handle);
            if (error instanceof PixelCapacityRefusal)
                return null;
            throw error;
        }
    }
    function releaseEffect(handle: PixelEffect): void {
        const effect = effects.get(handle);
        if (effect === undefined)
            return;
        effects.delete(handle);
        options.probeEvent?.({ kind: 'probe-count', name: 'effects.released', value: 1 });
        release(effect.before);
        release(effect.after);
    }
    function copyEffect(handle: PixelEffect, source: HTMLCanvasElement, destination: HTMLCanvasElement, dx: number, dy: number): PixelEffect | null {
        const original = effects.get(handle);
        if (isDisposed() ||
            original?.source !== sourceId(source) ||
            original.width !== source.width ||
            original.height !== source.height ||
            !Number.isInteger(dx) ||
            !Number.isInteger(dy))
            return null;
        const bounds = { ...original.damage, x: original.damage.x + dx, y: original.damage.y + dy };
        if (bounds.x < 0 ||
            bounds.y < 0 ||
            bounds.x + bounds.width > destination.width ||
            bounds.y + bounds.height > destination.height)
            return null;
        const evidence = intersection({ ...original.evidence, x: original.evidence.x + dx, y: original.evidence.y + dy }, { x: 0, y: 0, width: destination.width, height: destination.height });
        if (evidence === null)
            return null;
        const copied: Image[] = [];
        try {
            for (const plate of [original.before, original.after]) {
                const clone = allocate(evidence.width, evidence.height, 'effect');
                copied.push(clone);
                target(plate);
                gl.bindTexture(gl.TEXTURE_2D, clone.texture);
                gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, evidence.x - dx - original.evidence.x, evidence.y - dy - original.evidence.y, evidence.width, evidence.height);
            }
            const [before, after] = copied;
            if (before === undefined || after === undefined)
                throw new Error('Incomplete copied effect.');
            const token = Object.freeze({ kind: 'pixel-effect' } as const);
            effects.set(token, {
                sequence: ++nextSequence,
                source: sourceId(destination),
                width: destination.width,
                height: destination.height,
                damage: bounds,
                evidence,
                before,
                after,
            });
            options.probeEvent?.({ kind: 'probe-count', name: 'effects.created', value: 1 });
            return token;
        }
        catch (error) {
            for (const plate of copied)
                release(plate);
            if (error instanceof PixelCapacityRefusal)
                return null;
            throw error;
        }
    }
    function damageBounds(handle: PixelEffect): PixelBounds | null {
        return effects.get(handle)?.damage ?? null;
    }
    function selectEffects(source: HTMLCanvasElement, groups: readonly PixelTextGroup[]) {
        const selected: SelectedEffect[] = [];
        const owners = new Map<Effect, PixelTextGroup>();
        for (const [groupIndex, group] of groups.entries()) {
            if (group.effects.length === 0 && group.draws.some((draw) => draw.text.trim().length > 0))
                return null;
            const handles = new Set(group.effects);
            const regions = new Map<PixelEffect, PixelBounds[]>();
            const incomplete = new Set<PixelEffect>();
            const surface = { x: 0, y: 0, width: source.width, height: source.height };
            for (const region of group.sourceRegions) {
                if (region.effect === null)
                    continue;
                if (!handles.has(region.effect))
                    return null;
                const effect = effects.get(region.effect);
                if (effect === undefined)
                    return null;
                const area = intersection(region.bounds, surface);
                if (area === null || (group.targetRegions.length === 0 && !group.fallback?.targetRegions.length))
                    continue;
                const evidence = effect.evidence;
                if (area.x < evidence.x ||
                    area.y < evidence.y ||
                    area.x + area.width > evidence.x + evidence.width ||
                    area.y + area.height > evidence.y + evidence.height)
                    incomplete.add(region.effect);
                else
                    regions.getOrInsertComputed(region.effect, () => []).push(area);
            }
            for (const handle of group.effects) {
                const effect = effects.get(handle);
                if (effect?.source !== sourceId(source) ||
                    effect.width !== source.width ||
                    effect.height !== source.height)
                    return null;
                const owner = owners.get(effect);
                if (owner !== undefined && owner !== group)
                    return null;
                if (owner === undefined)
                    selected.push({
                        effect,
                        groupIndex,
                        regions: regions.get(handle) ?? [],
                        complete: !incomplete.has(handle),
                    });
                owners.set(effect, group);
            }
        }
        return selected.sort((a, b) => a.effect.sequence - b.effect.sequence);
    }
    function dispose(): void {
        const pending = [...captures.values()];
        const retained = [...effects.values()];
        captures.clear();
        effects.clear();
        options.probeEvent?.({ kind: 'probe-count', name: 'effects.released', value: retained.length });
        for (const capture of pending)
            if (capture.before !== null)
                release(capture.before);
        for (const effect of retained) {
            release(effect.before);
            release(effect.after);
        }
    }
    return {
        begin,
        prepareWrite,
        abort,
        finish,
        releaseEffect,
        copyEffect,
        damageBounds,
        selectEffects,
        sourceId,
        dispose,
        getEffect: (handle: PixelEffect): Readonly<Effect> | undefined => effects.get(handle),
        effectBytes: (handle: PixelEffect) => {
            const effect = effects.get(handle);
            return effect === undefined ? 0 : effect.before.bytes + effect.after.bytes;
        },
        captureCount: () => captures.size,
        effectCount: () => effects.size,
    };
}
export type PixelCaptures = ReturnType<typeof createPixelCaptures>;
