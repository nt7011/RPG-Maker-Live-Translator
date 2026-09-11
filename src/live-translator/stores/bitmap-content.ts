import type { StyledText } from './styled-text.js';
import { BITMAP_LIMITS } from './bitmap-limits.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
import type { NativeLifetime } from '../runtime/native-lifetime.js';
import type { PixelSnapshot, PixelBounds } from '../gpu/bitmap-pixel-device.js';
import type { CanvasAppearanceOperation } from '../observer-hooks/canvas/canvas-appearance-operation.js';
import type { BitmapLineFrame, BitmapSourceGeometry } from './bitmap-line-geometry.js';
import type { BitmapCanvasWrite } from '../observer-hooks/bitmap/bitmap-command-observer.js';
import type { BitmapDrawRef } from '../semantic-adapters/contract.js';
import type { BitmapCopiedRows } from './bitmap-copied-rows.js';
interface Extent {
    readonly width: number;
    readonly height: number;
}
export interface BitmapTextContent extends Extent {
    readonly kind: 'text';
    readonly snapshot: PixelSnapshot;
    readonly source: StyledText;
    readonly frame: BitmapLineFrame;
    readonly placements: readonly (BitmapSourceGeometry & {
        readonly start: number;
        readonly end: number;
    })[];
    readonly sequence: number;
    readonly regions: readonly (PixelBounds & {
        readonly draw?: BitmapDrawRef;
    })[];
    readonly evidence?: readonly {
        readonly draw: BitmapDrawRef | undefined;
        readonly text: string;
    }[];
}
export interface BitmapAppearanceContent extends Extent {
    readonly kind: 'appearance';
    readonly origin: BitmapTextContent;
    readonly previous: BitmapContent | null;
    readonly image: BitmapContent | null;
    readonly operation: Omit<Extract<CanvasAppearanceOperation, {
        kind: 'image';
    }>, 'image'> | Exclude<CanvasAppearanceOperation, {
        kind: 'image';
    }>;
    readonly depth: number;
    readonly operations: number;
}
export type BitmapContent = BitmapTextContent | BitmapAppearanceContent;
export function textOrigin(content: BitmapContent): BitmapTextContent {
    return content.kind === 'text' ? content : content.origin;
}
function full(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
}, size: Extent): boolean {
    return rect.x === 0 && rect.y === 0 && rect.width === size.width && rect.height === size.height;
}
export function deriveBitmapContent(size: Extent, operation: CanvasAppearanceOperation | null, previous: BitmapContent | null, image: BitmapContent | null, wasBlank: boolean, resourceEvent?: RuntimeResourceObserver): BitmapContent | null {
    if (operation === null || !full(operation.destination, size))
        return null;
    if (!operation.state.transform.every((v, i) => v === [1, 0, 0, 1, 0, 0][i]))
        return null;
    if (operation.kind === 'clear')
        return null;
    if (operation.state.composite === 'copy')
        previous = null;
    else if (previous === null && !wasBlank)
        return null;
    if (operation.kind === 'image') {
        if (image === null || !full(operation.source, image))
            return null;
    }
    else
        image = null;
    const origin = image === null ? (previous === null ? null : textOrigin(previous)) : textOrigin(image);
    if (origin === null || (previous !== null && textOrigin(previous) !== origin))
        return null;
    const depth = 1 +
        Math.max(previous?.kind === 'appearance' ? previous.depth : 0, image?.kind === 'appearance' ? image.depth : 0);
    const operations = 1 +
        (previous?.kind === 'appearance' ? previous.operations : 0) +
        (image?.kind === 'appearance' ? image.operations : 0);
    resourceEvent?.({ kind: 'usage', name: 'expressionDepth', value: depth, limit: BITMAP_LIMITS.expressionDepth });
    resourceEvent?.({
        kind: 'usage',
        name: 'expressionOperations',
        value: operations,
        limit: BITMAP_LIMITS.expressionOperations,
    });
    if (depth > BITMAP_LIMITS.expressionDepth || operations > BITMAP_LIMITS.expressionOperations) {
        resourceEvent?.({
            kind: 'refused',
            name: depth > BITMAP_LIMITS.expressionDepth ? 'expressionDepth' : 'expressionOperations',
            requested: depth > BITMAP_LIMITS.expressionDepth ? depth : operations,
        });
        return null;
    }
    const recorded = operation.kind === 'image'
        ? {
            kind: operation.kind,
            state: operation.state,
            source: operation.source,
            destination: operation.destination,
        }
        : operation;
    return Object.freeze({
        kind: 'appearance',
        width: size.width,
        height: size.height,
        origin,
        previous,
        image,
        operation: recorded,
        depth,
        operations,
    });
}
export function replayBitmapContent(content: BitmapContent, origin: HTMLCanvasElement, createCanvas: (width: number, height: number) => HTMLCanvasElement): HTMLCanvasElement {
    const memo = new Map<BitmapContent, HTMLCanvasElement>();
    const root = textOrigin(content);
    function replay(node: BitmapContent): HTMLCanvasElement {
        if (node.kind === 'text')
            return origin;
        const cached = memo.get(node);
        if (cached !== undefined)
            return cached;
        const width = Math.ceil((node.width * origin.width) / root.width);
        const height = Math.ceil((node.height * origin.height) / root.height);
        const result = createCanvas(width, height);
        const context = result.getContext('2d');
        if (context === null)
            throw new Error('Canvas appearance replay is unavailable.');
        memo.set(node, result);
        if (node.previous !== null)
            context.drawImage(replay(node.previous), 0, 0, width, height);
        const { operation } = node;
        context.globalAlpha = operation.state.alpha;
        context.globalCompositeOperation = operation.state.composite;
        context.imageSmoothingEnabled = operation.state.smoothing;
        context.shadowColor = operation.state.shadowColor;
        if (operation.kind === 'image' && node.image !== null)
            context.drawImage(replay(node.image), 0, 0, width, height);
        else if (operation.kind === 'fill') {
            context.fillStyle = operation.color;
            context.fillRect(0, 0, width, height);
        }
        return result;
    }
    return replay(content);
}
export function createBitmapContentStore(options: {
    readonly lifetime: NativeLifetime;
    readonly resourceEvent?: RuntimeResourceObserver | undefined;
    readonly readRoot: (source: HTMLCanvasElement) => BitmapTextContent | null;
    readonly releaseRoot: (root: BitmapTextContent) => void;
    readonly captureRoot: (root: BitmapTextContent) => boolean;
    readonly rowCopies?: {
        readonly prepare: (receipt: BitmapCanvasWrite) => BitmapCopiedRows | null;
        readonly publish: (source: HTMLCanvasElement, rows: BitmapCopiedRows) => boolean;
        readonly rejected?: (reason: string, text: string) => void;
    };
}) {
    interface Binding {
        readonly source: WeakRef<HTMLCanvasElement>;
        readonly content: BitmapContent;
        readonly release: () => void;
    }
    const bindings = new WeakMap<HTMLCanvasElement, Binding>();
    const associations = new Set<Binding>();
    const roots = new Map<BitmapTextContent, number>();
    const epochs = new WeakMap<HTMLCanvasElement, number>();
    const pending = new Map<BitmapCanvasWrite, {
        epoch: number;
        release: () => void;
    } & ({
        kind: 'appearance';
        content: BitmapContent;
    } | {
        kind: 'rows';
        rows: BitmapCopiedRows;
    })>();
    let disposed = false;
    function isDisposed(): boolean {
        return disposed;
    }
    function retain(contents: readonly BitmapContent[]): (() => void) | null {
        if (isDisposed())
            return null;
        const selected = contents.map(textOrigin);
        if (selected.some((root) => !roots.has(root)))
            return null;
        for (const root of selected)
            roots.set(root, (roots.get(root) ?? 0) + 1);
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            for (const root of selected) {
                const count = roots.get(root);
                if (count === undefined)
                    continue;
                if (count > 1)
                    roots.set(root, count - 1);
                else {
                    roots.delete(root);
                    options.releaseRoot(root);
                }
            }
        };
    }
    function releaseBinding(binding: Binding): void {
        if (!associations.delete(binding))
            return;
        options.lifetime.forget(binding.source);
        const source = binding.source.deref();
        if (source !== undefined && bindings.get(source) === binding)
            bindings.delete(source);
        binding.release();
    }
    function reportResources(): void {
        options.resourceEvent?.({
            kind: 'usage',
            name: 'associations',
            value: associations.size,
            limit: BITMAP_LIMITS.associations,
        });
    }
    function refuseAssociation(): void {
        reportResources();
        options.resourceEvent?.({ kind: 'refused', name: 'associations', requested: 1 });
    }
    function bind(source: HTMLCanvasElement, content: BitmapContent, release: () => void): void {
        if (isDisposed() || associations.size >= BITMAP_LIMITS.associations) {
            if (!isDisposed())
                refuseAssociation();
            release();
            return;
        }
        const binding = { source: new WeakRef(source), content, release };
        bindings.set(source, binding);
        associations.add(binding);
        options.lifetime.watch(binding.source, binding, releaseBinding);
    }
    function capture(content: BitmapContent): boolean {
        return !isDisposed() && roots.has(textOrigin(content)) && options.captureRoot(textOrigin(content));
    }
    function get(source: HTMLCanvasElement): BitmapContent | null {
        if (isDisposed())
            return null;
        const current = bindings.get(source);
        if (current !== undefined)
            return current.content;
        if (associations.size >= BITMAP_LIMITS.associations) {
            refuseAssociation();
            return null;
        }
        const root = options.readRoot(source);
        if (root === null)
            return null;
        if (isDisposed()) {
            options.releaseRoot(root);
            return null;
        }
        if (!roots.has(root))
            roots.set(root, 0);
        const release = retain([root]);
        if (release === null)
            throw new Error('Missing copied origin ownership.');
        bind(source, root, release);
        return bindings.get(source)?.content ?? null;
    }
    function invalidate(source: HTMLCanvasElement): void {
        epochs.set(source, (epochs.get(source) ?? 0) + 1);
        const binding = bindings.get(source);
        if (binding !== undefined)
            releaseBinding(binding);
    }
    function beforeWrite(receipt: BitmapCanvasWrite): void {
        if (isDisposed())
            return;
        const { source, operation, command } = receipt;
        const epoch = epochs.get(source) ?? 0;
        const previous = bindings.get(source)?.content ?? null;
        const image = command === null && operation?.kind === 'image' ? get(operation.image) : null;
        const derived = command === null
            ? deriveBitmapContent(source, operation, previous, image, receipt.sourceIsBlank, options.resourceEvent)
            : null;
        const release = derived === null ? null : retain([derived]);
        let rows: BitmapCopiedRows | null = null;
        let captured = false;
        try {
            captured = derived !== null && release !== null && capture(derived);
            if (derived !== null && !captured)
                options.rowCopies?.rejected?.('copy-pixel-evidence-unavailable', textOrigin(derived).source.text);
            if (derived === null && command === null)
                rows = options.rowCopies?.prepare(receipt) ?? null;
        }
        finally {
            const current = (epochs.get(source) ?? 0) === epoch;
            invalidate(source);
            if (!captured || !current || isDisposed()) {
                release?.();
                captured = false;
            }
            if (!current || isDisposed()) {
                rows?.release();
                rows = null;
            }
        }
        if (captured && !isDisposed() && derived !== null && release !== null)
            pending.set(receipt, { epoch: epoch + 1, kind: 'appearance', content: derived, release });
        else if (rows !== null && !isDisposed())
            pending.set(receipt, { epoch: epoch + 1, kind: 'rows', rows, release: rows.release });
    }
    function afterWrite(receipt: BitmapCanvasWrite, returned: boolean): void {
        const saved = pending.get(receipt);
        pending.delete(receipt);
        if (saved === undefined)
            return;
        if (isDisposed() || !returned || saved.epoch !== epochs.get(receipt.source))
            saved.release();
        else if (saved.kind === 'appearance')
            bind(receipt.source, saved.content, saved.release);
        else {
            let transferred = false;
            try {
                transferred = options.rowCopies?.publish(receipt.source, saved.rows) === true;
            }
            finally {
                if (!transferred)
                    saved.release();
            }
        }
    }
    function dispose(): void {
        if (isDisposed())
            return;
        disposed = true;
        for (const binding of associations)
            releaseBinding(binding);
        for (const saved of pending.values())
            saved.release();
        pending.clear();
        for (const root of roots.keys()) {
            roots.delete(root);
            options.releaseRoot(root);
        }
    }
    return {
        reportResources,
        get,
        capture,
        retain,
        peek: (source: HTMLCanvasElement) => bindings.get(source)?.content ?? null,
        has: (source: HTMLCanvasElement) => bindings.has(source),
        invalidate,
        beforeWrite,
        afterWrite,
        dispose,
    };
}
