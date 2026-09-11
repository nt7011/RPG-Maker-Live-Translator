import type { SemanticTextRevisionHandle } from '../../stores/semantic-text-store.js';
import type { PixelBounds } from '../../gpu/bitmap-pixel-device.js';
import type { BitmapScreenSample } from '../../presentation/bitmap-render-host.js';
import type { BitmapSemanticProvenance } from '../../stores/bitmap-semantic-clues.js';
export type BitmapSemanticContext = 'window' | 'game-message' | null;
export function bitmapDemandContext(provenance: readonly BitmapSemanticProvenance[]): BitmapSemanticContext {
    return provenance.some((item) => item.source.family === 'game-message')
        ? 'game-message'
        : provenance.some((item) => item.source.family === 'window')
            ? 'window'
            : null;
}
export interface BitmapTranslationDemand {
    readonly handle: SemanticTextRevisionHandle;
    readonly occurrence: object;
    readonly context: BitmapSemanticContext;
    readonly visible: boolean | null;
}
export function bitmapDemandPriority(visible: boolean, context: BitmapSemanticContext): number {
    return !visible ? 100 : context === 'game-message' ? 1000 : context === 'window' ? 600 : 500;
}
type Point = readonly [
    number,
    number
];
function intersects(points: Point[], clip: PixelBounds): boolean {
    for (const [axis, edge, direction] of [
        [0, clip.x, 1],
        [0, clip.x + clip.width, -1],
        [1, clip.y, 1],
        [1, clip.y + clip.height, -1],
    ] as const) {
        const result: Point[] = [];
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            if (a === undefined || b === undefined)
                return false;
            const insideA = direction * (a[axis] - edge) >= 0;
            const insideB = direction * (b[axis] - edge) >= 0;
            if (insideA)
                result.push(a);
            if (insideA !== insideB) {
                const t = (edge - a[axis]) / (b[axis] - a[axis]);
                result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
            }
        }
        points = result;
    }
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (a === undefined || b === undefined)
            return false;
        area += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(area) > 0;
}
export function bitmapRegionsVisible(regions: readonly PixelBounds[], samples: readonly (BitmapScreenSample | null)[]): boolean | null {
    let unknown = samples.length === 0;
    for (const sample of samples) {
        if (sample === null) {
            unknown = true;
            continue;
        }
        const { frame, vertices: v, alpha, clip } = sample;
        if (alpha <= 0 || clip.width <= 0 || clip.height <= 0)
            continue;
        const [x0, y0, x1, y1, x2, y2, x3, y3] = v as readonly [
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number
        ];
        if (Math.abs(x2 - x1 - x3 + x0) > 1e-3 || Math.abs(y2 - y1 - y3 + y0) > 1e-3) {
            unknown = true;
            continue;
        }
        const point = (x: number, y: number): Point => [
            x0 + ((x - frame.x) / frame.width) * (x1 - x0) + ((y - frame.y) / frame.height) * (x3 - x0),
            y0 + ((x - frame.x) / frame.width) * (y1 - y0) + ((y - frame.y) / frame.height) * (y3 - y0),
        ];
        for (const region of regions) {
            const x = Math.max(region.x, frame.x), y = Math.max(region.y, frame.y);
            const right = Math.min(region.x + region.width, frame.x + frame.width);
            const bottom = Math.min(region.y + region.height, frame.y + frame.height);
            if (right > x &&
                bottom > y &&
                intersects([point(x, y), point(right, y), point(right, bottom), point(x, bottom)], clip))
                return true;
        }
    }
    return unknown ? null : false;
}
export function createBitmapTranslationDemand(options: {
    readonly isCurrent: (handle: SemanticTextRevisionHandle) => boolean;
    readonly changed: (handles: readonly SemanticTextRevisionHandle[]) => void;
    readonly presentationChanged?: () => void;
}) {
    interface State {
        readonly visible: boolean;
        readonly context: BitmapSemanticContext;
        readonly onScreen: boolean;
    }
    type Rows = Map<SemanticTextRevisionHandle, Map<object, State>>;
    const outputs = new Map<number, Rows>();
    let disposed = false;
    function onScreenGameMessage(handle: SemanticTextRevisionHandle): boolean {
        if (disposed || !options.isCurrent(handle))
            return false;
        for (const rows of outputs.values())
            for (const state of rows.get(handle)?.values() ?? [])
                if (state.onScreen && state.context === 'game-message')
                    return true;
        return false;
    }
    function priority(handle: SemanticTextRevisionHandle): number {
        if (disposed || !options.isCurrent(handle))
            return 100;
        let value = 100;
        for (const rows of outputs.values())
            for (const state of rows.get(handle)?.values() ?? [])
                value = Math.max(value, bitmapDemandPriority(state.visible, state.context));
        return value;
    }
    function reconcile(output: number, observations: readonly BitmapTranslationDemand[], complete: boolean): void {
        if (disposed)
            return;
        const previous = outputs.get(output) ?? new Map<SemanticTextRevisionHandle, Map<object, State>>();
        const next: Rows = complete
            ? new Map<SemanticTextRevisionHandle, Map<object, State>>()
            : new Map([...previous].map(([handle, uses]) => [
                handle,
                new Map([...uses].map(([occurrence, state]) => [occurrence, { ...state, onScreen: false }])),
            ]));
        for (const { handle, occurrence, context, visible } of observations) {
            if (!options.isCurrent(handle))
                continue;
            const old = previous.get(handle)?.get(occurrence);
            if (!complete && old === undefined)
                continue;
            let uses = next.get(handle);
            if (uses === undefined) {
                uses = new Map();
                next.set(handle, uses);
            }
            uses.set(occurrence, {
                context,
                visible: complete && visible !== null ? visible : (old?.visible ?? false),
                onScreen: complete && visible === true,
            });
        }
        const handles = [...new Set([...previous.keys(), ...next.keys()])];
        const before = handles.map(priority);
        const pinnedBefore = handles.map(onScreenGameMessage);
        outputs.set(output, next);
        if (handles.some((handle, index) => onScreenGameMessage(handle) !== pinnedBefore[index]))
            options.presentationChanged?.();
        const changed = handles.filter((handle, index) => priority(handle) !== before[index]);
        if (changed.length > 0)
            options.changed(changed);
    }
    function releaseOutput(output: number): void {
        const handles = [...(outputs.get(output)?.keys() ?? [])];
        const before = handles.map(priority);
        const pinnedBefore = handles.map(onScreenGameMessage);
        outputs.delete(output);
        if (handles.some((handle, index) => onScreenGameMessage(handle) !== pinnedBefore[index]))
            options.presentationChanged?.();
        const changed = handles.filter((handle, index) => priority(handle) !== before[index]);
        if (changed.length > 0)
            options.changed(changed);
    }
    function release(handles: readonly SemanticTextRevisionHandle[]): void {
        const changed = handles.some(onScreenGameMessage);
        for (const rows of outputs.values())
            for (const handle of handles)
                rows.delete(handle);
        if (changed)
            options.presentationChanged?.();
    }
    return Object.freeze({
        priority,
        onScreenGameMessages: (): ReadonlySet<number> => {
            const ids = new Set<number>();
            for (const rows of outputs.values())
                for (const [handle, uses] of rows)
                    if (options.isCurrent(handle))
                        for (const state of uses.values())
                            if (state.onScreen && state.context === 'game-message')
                                ids.add(handle.textId);
            return ids;
        },
        reconcile,
        releaseOutput,
        release,
        dispose: () => {
            disposed = true;
            outputs.clear();
        },
    });
}
