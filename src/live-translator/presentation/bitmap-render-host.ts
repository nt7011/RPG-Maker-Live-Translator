import { installOwnedHooks, locateProperty, type OwnedHookSpec, type OwnedHookDisposal, type OwnedHookLease, } from '../observer-hooks/owned-hook-installer.js';
import { timed, type RuntimeTiming } from '../runtime/diagnostic-timing.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
export interface BitmapRenderUse {
    readonly owner: object;
    readonly source: HTMLCanvasElement;
    readonly frame: PixelBounds;
    readonly vertices: readonly number[];
    readonly alpha: number;
    readonly tint: number;
    readonly blendMode: number;
    readonly sampling: Readonly<Record<string, number | boolean>>;
}
export interface BitmapDemandUse {
    readonly owner: object;
    readonly source: HTMLCanvasElement;
    readonly supported: boolean;
    readonly occurrence: object;
    readonly samples: readonly (BitmapScreenSample | null)[];
}
export interface BitmapScreenSample {
    readonly frame: PixelBounds;
    readonly vertices: readonly number[];
    readonly alpha: number;
    readonly clip: PixelBounds;
}
export interface BitmapRenderBacking {
    readonly kind: 'bitmap-render-backing';
}
export interface BitmapRenderReplacement {
    readonly use: BitmapRenderUse;
    readonly backing: BitmapRenderBacking;
    readonly region: PixelBounds;
    readonly vertices: readonly number[];
}
export interface BitmapRenderPlan {
    readonly replacements: readonly BitmapRenderReplacement[];
    readonly isCurrent: () => boolean;
    readonly submitted: () => void;
}
interface NativeTexture {
    readonly baseTexture: NativeRecord;
    readonly frame: PixelBounds;
    readonly rotate?: number;
    readonly _uvs: NativeRecord;
    readonly destroy: (base?: boolean) => void;
}
type NativeRecord = Record<string, unknown>;
interface Backing {
    readonly handle: BitmapRenderBacking;
    readonly base: NativeRecord;
    readonly width: number;
    readonly height: number;
    readonly sampling: Readonly<Record<string, number | boolean>>;
    readonly releaseSurface: () => void;
    nativeReleased: boolean;
    destroying: boolean;
    released: boolean;
    pins: number;
}
interface QueuedUse {
    readonly use: BitmapRenderUse;
    readonly slot: number;
    readonly element: NativeRecord;
    readonly texture: NativeTexture;
}
interface NativeQueue {
    readonly elements: unknown[];
    readonly textures: unknown[] | null;
    readonly size: number;
    readonly current: () => boolean;
    readonly immediate: boolean;
    readonly hold?: (cleanup: () => void) => void;
}
function record(value: unknown): NativeRecord | null {
    return typeof value === 'object' && value !== null ? (value as NativeRecord) : null;
}
function vertices(value: unknown): number[] | null {
    if (!Array.isArray(value) && !(value instanceof Float32Array))
        return null;
    const result = Array.from(value as ArrayLike<unknown>);
    return result.length === 8 && result.every((v) => typeof v === 'number' && Number.isFinite(v))
        ? (result as number[])
        : null;
}
function bounds(value: unknown): PixelBounds | null {
    const r = record(value);
    if (r === null)
        return null;
    const { x, y, width, height } = r;
    return [x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
        (width as number) > 0 &&
        (height as number) > 0
        ? ({ x, y, width, height } as PixelBounds)
        : null;
}
function sameSampling(a: BitmapRenderUse['sampling'], b: BitmapRenderUse['sampling']): boolean {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
export function createBitmapRenderHost(options: {
    readonly timing?: RuntimeTiming | undefined;
    readonly pixi: object;
    readonly observe?: (source: HTMLCanvasElement, reason: string | null) => void;
    readonly acceptsSource: (source: HTMLCanvasElement) => boolean;
    readonly prepare: (uses: readonly BitmapRenderUse[]) => BitmapRenderPlan | null;
    readonly reportFailure: (error: unknown) => void;
    readonly demand?: (output: number, uses: readonly BitmapDemandUse[], complete: boolean) => void;
    readonly releaseOutput?: (output: number) => void;
}) {
    const pixi = options.pixi as NativeRecord;
    const backings = new Map<BitmapRenderBacking, Backing>();
    const leases = new Map<object, OwnedHookLease>();
    const retained = new Map<object, (() => void)[]>();
    let outputSequence = 0;
    const outputs = new WeakMap<object, number>();
    const occurrenceTokens = new WeakMap<object, object>();
    interface Pass {
        renderer: NativeRecord;
        standardProjection: boolean;
        output: number;
        screen: boolean | null;
        started: boolean;
        ended: boolean;
        complete: boolean;
        uses: Map<object, BitmapDemandUse>;
    }
    let pass: Pass | null = null;
    let renderDepth = 0;
    let sceneOutput: number | null = null;
    let sceneRendered = false;
    function releasePending(target: object): void {
        const cleanups = retained.get(target) ?? [];
        retained.delete(target);
        for (const cleanup of cleanups)
            cleanup();
    }
    let nativeDepth = 0;
    let busy = false, disposed = false;
    function isDisposed(): boolean {
        return disposed;
    }
    const Texture = pixi['Texture'] as new (base: NativeRecord, frame: object) => NativeTexture;
    const Rectangle = pixi['Rectangle'] as new (x: number, y: number, width: number, height: number) => object;
    function report(error: unknown): void {
        if (pass !== null)
            pass.complete = false;
        try {
            options.reportFailure(error);
        }
        catch {
        }
    }
    function queue(target: NativeRecord): NativeQueue | null {
        const candidates = ([
            ['sprites', 'currentIndex'],
            ['_bufferedElements', '_bufferSize'],
        ] as const).filter(([elements, size]) => Array.isArray(target[elements]) && typeof target[size] === 'number');
        const candidate = candidates[0];
        if (candidates.length !== 1 || candidate === undefined)
            return null;
        const [elementKey, sizeKey] = candidate;
        const elements = target[elementKey] as unknown[];
        const size = target[sizeKey] as number;
        const textures = elementKey === '_bufferedElements' ? target['_bufferedTextures'] : null;
        if (!Number.isSafeInteger(size) ||
            size < 0 ||
            size > elements.length ||
            (textures !== null && (!Array.isArray(textures) || textures.length < size)))
            return null;
        return {
            elements,
            size,
            textures: textures as unknown[] | null,
            current: () => target[elementKey] === elements &&
                target[sizeKey] === size &&
                (textures === null || target['_bufferedTextures'] === textures),
            immediate: false,
        };
    }
    function source(texture: NativeTexture): HTMLCanvasElement | null {
        const base = texture.baseTexture;
        const value = 'resource' in base ? record(base['resource'])?.['source'] : base['source'];
        return value !== null && typeof value === 'object' && options.acceptsSource(value as HTMLCanvasElement)
            ? (value as HTMLCanvasElement)
            : null;
    }
    function read(element: NativeRecord, slot: number): QueuedUse | null {
        const texture = record(element['_texture']) as NativeTexture | null;
        if (!texture || !record(texture.baseTexture) || (texture.rotate ?? 0) !== 0)
            return null;
        const canvas = source(texture);
        if (canvas === null)
            return null;
        const textureFrame = bounds(texture.frame), points = vertices(element['vertexData']);
        const resolution = texture.baseTexture['resolution'] ?? 1;
        if (typeof resolution !== 'number' || !Number.isFinite(resolution) || resolution <= 0)
            return null;
        const frame = textureFrame === null
            ? null
            : {
                x: textureFrame.x * resolution,
                y: textureFrame.y * resolution,
                width: textureFrame.width * resolution,
                height: textureFrame.height * resolution,
            };
        const alpha = element['worldAlpha'], tint = element['_tintRGB'], blendMode = element['blendMode'];
        const sampling: Record<string, number | boolean> = {};
        for (const key of ['scaleMode', 'mipmap', 'wrapMode', 'premultipliedAlpha', 'alphaMode']) {
            const value = texture.baseTexture[key];
            if (value !== undefined && typeof value !== 'number' && typeof value !== 'boolean')
                return null;
            if (value !== undefined)
                sampling[key] = value;
        }
        if (!frame ||
            frame.x < 0 ||
            frame.y < 0 ||
            frame.x + frame.width > canvas.width ||
            frame.y + frame.height > canvas.height ||
            !points ||
            ![alpha, tint, blendMode].every((v) => typeof v === 'number' && Number.isFinite(v)))
            return null;
        if (element['indices'] !== undefined || element['uvs'] !== undefined) {
            const indices = element['indices'];
            if (!(indices instanceof Uint16Array) && !Array.isArray(indices))
                return null;
            if (indices.length !== 6 || ![0, 1, 2, 0, 2, 3].every((value, index) => indices[index] === value))
                return null;
            const nativeUvs = vertices(record(texture._uvs)?.['uvsFloat32']), usedUvs = vertices(element['uvs']);
            if (!nativeUvs || !usedUvs || !nativeUvs.every((value, index) => usedUvs[index] === value))
                return null;
        }
        return {
            slot,
            element,
            texture,
            use: {
                owner: element,
                source: canvas,
                frame,
                vertices: points,
                alpha: alpha as number,
                tint: tint as number,
                blendMode: blendMode as number,
                sampling,
            },
        };
    }
    function current(queued: QueuedUse): boolean {
        const now = read(queued.element, queued.slot), before = queued.use;
        return (now !== null &&
            now.texture === queued.texture &&
            now.use.source === before.source &&
            sameSampling(now.use.sampling, before.sampling) &&
            now.use.alpha === before.alpha &&
            now.use.tint === before.tint &&
            now.use.blendMode === before.blendMode &&
            now.use.vertices.every((v, i) => v === before.vertices[i]) &&
            Object.keys(before.frame).every((key) => Reflect.get(now.use.frame, key) === Reflect.get(before.frame, key)));
    }
    function releaseSubmission(preparedSprites: readonly NativeRecord[], preparedTextures: readonly NativeTexture[], pinned: ReadonlySet<Backing>): void {
        for (const view of preparedSprites) {
            try {
                const destroy = view['destroy'];
                if (typeof destroy === 'function')
                    Reflect.apply(destroy, view, [{ texture: false, baseTexture: false }]);
            }
            catch (error) {
                report(error);
            }
        }
        for (const texture of preparedTextures) {
            try {
                texture.destroy(false);
            }
            catch (error) {
                report(error);
            }
        }
        for (const backing of pinned) {
            backing.pins--;
            if (backing.released) {
                try {
                    destroyBacking(backing);
                }
                catch (error) {
                    report(error);
                }
            }
        }
    }
    function substitute(native: (...args: unknown[]) => unknown, receiver: unknown, args: unknown[], enabled: () => boolean, submission: NativeQueue): unknown {
        const { elements, size, textures } = submission;
        if (!enabled() || disposed || busy || size < 1)
            return Reflect.apply(native, receiver, args);
        const uses: QueuedUse[] = [];
        try {
            let clip: PixelBounds | null | undefined;
            for (let slot = 0; slot < size; slot++) {
                const element = record(elements[slot]);
                const queued = element && read(element, slot);
                if (queued && clip === undefined)
                    clip = screenClip();
                if (element)
                    observe(element, queued ? null : 'unsupported-render-geometry', queued && clip != null
                        ? {
                            frame: queued.use.frame,
                            vertices: [...queued.use.vertices],
                            alpha: queued.use.alpha,
                            clip,
                        }
                        : null);
                if (queued && (!Array.isArray(textures) || textures[slot] === queued.texture.baseTexture))
                    uses.push(queued);
            }
        }
        catch (error) {
            report(error);
            return Reflect.apply(native, receiver, args);
        }
        const byUse = new Map(uses.map((item) => [item.use, item]));
        if (uses.length === 0)
            return Reflect.apply(native, receiver, args);
        const changed: {
            queued: QueuedUse;
            replacement: NativeRecord;
            previousTexture: unknown;
        }[] = [];
        const preparedTextures: NativeTexture[] = [];
        const preparedSprites: NativeRecord[] = [];
        const pinned = new Set<Backing>();
        let committed: BitmapRenderPlan | null = null;
        busy = true;
        try {
            const plan = options.prepare(uses.map((item) => item.use));
            if (plan !== null) {
                const staged: typeof changed = [];
                const used = new Set<BitmapRenderUse>();
                for (const replacement of plan.replacements) {
                    const queued = byUse.get(replacement.use);
                    const backing = backings.get(replacement.backing), points = vertices(replacement.vertices);
                    const region = bounds(replacement.region);
                    if (!queued ||
                        !backing ||
                        backing.released ||
                        !sameSampling(backing.sampling, queued.use.sampling) ||
                        !region ||
                        !points ||
                        used.has(queued.use) ||
                        region.x < 0 ||
                        region.y < 0 ||
                        region.x + region.width > backing.width ||
                        region.y + region.height > backing.height)
                        throw new Error('Invalid Bitmap render plan.');
                    if (!pinned.has(backing)) {
                        backing.pins++;
                        pinned.add(backing);
                    }
                    const texture = new Texture(backing.base, new Rectangle(region.x, region.y, region.width, region.height));
                    preparedTextures.push(texture);
                    used.add(queued.use);
                    let descriptor: NativeRecord = {
                        _texture: texture,
                        vertexData: new Float32Array(points),
                        worldAlpha: queued.use.alpha,
                        _tintRGB: queued.use.tint,
                        blendMode: queued.use.blendMode,
                        uvs: texture._uvs['uvsFloat32'],
                        indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
                    };
                    if (submission.immediate) {
                        const view = sprite(texture, descriptor);
                        if (view === null) {
                            observe(queued.element, 'unsupported-native-sprite');
                            continue;
                        }
                        descriptor = view;
                        preparedSprites.push(view);
                    }
                    staged.push({
                        queued,
                        replacement: descriptor,
                        previousTexture: Array.isArray(textures) ? textures[queued.slot] : null,
                    });
                }
                if (plan.isCurrent() &&
                    enabled() &&
                    !isDisposed() &&
                    submission.current() &&
                    pinned.values().every((backing) => !backing.released) &&
                    uses.every((item) => elements[item.slot] === item.element &&
                        (!Array.isArray(textures) || textures[item.slot] === item.texture.baseTexture) &&
                        current(item))) {
                    if (staged.length > 0)
                        committed = plan;
                    for (const item of staged) {
                        elements[item.queued.slot] = item.replacement;
                        if (Array.isArray(textures))
                            textures[item.queued.slot] = (item.replacement['_texture'] as NativeTexture).baseTexture;
                        changed.push(item);
                    }
                }
            }
        }
        catch (error) {
            report(error);
        }
        let consumed = false;
        const retainedCall = submission.immediate && changed.length > 0;
        if (retainedCall)
            nativeDepth++;
        try {
            const result = Reflect.apply(native, receiver, args);
            consumed = true;
            if (committed !== null && !isDisposed()) {
                try {
                    committed.submitted();
                }
                catch (error) {
                    report(error);
                }
            }
            return result;
        }
        finally {
            if (retainedCall)
                nativeDepth--;
            busy = false;
            for (const item of changed) {
                if (elements[item.queued.slot] === item.replacement) {
                    elements[item.queued.slot] = item.queued.element;
                    if (Array.isArray(textures) &&
                        textures[item.queued.slot] === (item.replacement['_texture'] as NativeTexture).baseTexture)
                        textures[item.queued.slot] = item.previousTexture;
                }
            }
            const cleanup = releaseSubmission.bind(null, preparedSprites, preparedTextures, pinned);
            if (!consumed && changed.length > 0 && submission.hold !== undefined)
                submission.hold(cleanup);
            else
                cleanup();
        }
    }
    function sprite(texture: NativeTexture, descriptor: NativeRecord): NativeRecord | null {
        const Sprite = pixi['Sprite'] as new (texture: NativeTexture) => NativeRecord;
        if (typeof Sprite !== 'function')
            return null;
        const points = descriptor['vertexData'] as Float32Array;
        const [x, y, rightX, rightY, bottomRightX, bottomRightY, bottomX, bottomY] = Array.from(points) as [
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number
        ];
        if (Math.abs(bottomRightX - (rightX + bottomX - x)) > 0.001 ||
            Math.abs(bottomRightY - (rightY + bottomY - y)) > 0.001)
            return null;
        const view = new Sprite(texture);
        const transform = record(view['worldTransform']);
        if (transform === null) {
            const destroy = view['destroy'];
            if (typeof destroy === 'function')
                Reflect.apply(destroy, view, [{ texture: false, baseTexture: false }]);
            return null;
        }
        Object.assign(transform, {
            a: (rightX - x) / texture.frame.width,
            b: (rightY - y) / texture.frame.width,
            c: (bottomX - x) / texture.frame.height,
            d: (bottomY - y) / texture.frame.height,
            tx: x,
            ty: y,
        });
        Object.assign(view, descriptor);
        return view;
    }
    function screenClip(): PixelBounds | null {
        const renderer = pass?.renderer;
        if (renderer === undefined)
            return null;
        const screen = bounds(renderer['screen']);
        const gl = renderer['gl'] as WebGLRenderingContext | undefined;
        if (pass?.standardProjection !== true ||
            screen === null ||
            gl === undefined ||
            typeof gl.getParameter !== 'function' ||
            typeof gl.isEnabled !== 'function' ||
            record(renderer['projection'])?.['transform'] != null ||
            gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null ||
            gl.isEnabled(gl.STENCIL_TEST))
            return null;
        const viewport = Array.from(gl.getParameter(gl.VIEWPORT) as ArrayLike<number>);
        if (viewport.length !== 4 || !viewport.every(Number.isFinite))
            return null;
        const [vx, vy, vw, vh] = viewport as [
            number,
            number,
            number,
            number
        ];
        if (vw <= 0 || vh <= 0)
            return null;
        let clip = screen;
        if (gl.isEnabled(gl.SCISSOR_TEST)) {
            const box = Array.from(gl.getParameter(gl.SCISSOR_BOX) as ArrayLike<number>);
            if (box.length !== 4 || !box.every(Number.isFinite))
                return null;
            const [bx, by, bw, bh] = box as [
                number,
                number,
                number,
                number
            ];
            const x = Math.max(vx, bx), y = Math.max(vy, by);
            const right = Math.min(vx + vw, bx + bw);
            const top = Math.min(vy + vh, by + bh);
            clip = {
                x: screen.x + ((x - vx) * screen.width) / vw,
                y: screen.y + ((vy + vh - top) * screen.height) / vh,
                width: (Math.max(0, right - x) * screen.width) / vw,
                height: (Math.max(0, top - y) * screen.height) / vh,
            };
        }
        return clip;
    }
    function observe(element: NativeRecord, reason: string | null = null, sample?: BitmapScreenSample | null): void {
        const texture = record(element['_texture']) as NativeTexture | null;
        const canvas = texture && record(texture.baseTexture) && source(texture);
        if (!canvas)
            return;
        if (pass?.screen === true && pass.started && !pass.ended) {
            const prior = pass.uses.get(element);
            const occurrence = occurrenceTokens.getOrInsertComputed(element, () => Object.freeze({}));
            pass.uses.set(element, {
                owner: element,
                source: canvas,
                supported: reason === null || prior?.supported === true,
                occurrence,
                samples: sample === undefined ? (prior?.samples ?? []) : [...(prior?.samples ?? []), sample],
            });
        }
        options.observe?.(canvas, reason);
    }
    function connect(renderer: object): void {
        if (disposed)
            return;
        const plugins = record((renderer as NativeRecord)['plugins']);
        const targets = new Set(Object.values(plugins ?? {}).filter((value) => record(value) !== null) as NativeRecord[]);
        const nativeRenderer = renderer as NativeRecord;
        if (options.demand !== undefined &&
            typeof nativeRenderer['render'] === 'function' &&
            typeof nativeRenderer['emit'] === 'function')
            targets.add(nativeRenderer);
        for (const [target, lease] of leases) {
            if (targets.has(target as NativeRecord) || retained.has(target))
                continue;
            if (lease.dispose() === 'failed')
                throw new Error('Bitmap renderer hook cleanup failed.');
            leases.delete(target);
            const output = outputs.get(target);
            if (output !== undefined)
                options.releaseOutput?.(output);
        }
        for (const target of targets) {
            if (isDisposed())
                break;
            if (leases.has(target))
                continue;
            if (target === nativeRenderer) {
                const outputId = outputs.getOrInsertComputed(renderer, () => ++outputSequence);
                sceneOutput = outputId;
                const hooks: OwnedHookSpec[] = [
                    {
                        kind: 'method',
                        target,
                        key: 'render',
                        wrap: (native, enabled) => function (...args) {
                            if (!enabled() || disposed)
                                return Reflect.apply(native, this, args);
                            const outer = pass;
                            if (outer !== null)
                                outer.complete = false;
                            const current: Pass | null = renderDepth === 0
                                ? {
                                    renderer: nativeRenderer,
                                    standardProjection: args[3] == null,
                                    output: outputId,
                                    screen: null,
                                    started: false,
                                    ended: false,
                                    complete: true,
                                    uses: new Map(),
                                }
                                : null;
                            pass = current;
                            renderDepth++;
                            let returned = false;
                            try {
                                const result = Reflect.apply(native, this, args);
                                returned = true;
                                return result;
                            }
                            finally {
                                renderDepth--;
                                pass = outer;
                                if (current !== null && current.screen !== false && !isDisposed()) {
                                    sceneRendered = true;
                                    try {
                                        options.demand?.(current.output, [...current.uses.values()], returned &&
                                            current.screen === true &&
                                            current.started &&
                                            current.ended &&
                                            current.complete);
                                    }
                                    catch (error) {
                                        report(error);
                                    }
                                }
                            }
                        },
                    },
                    {
                        kind: 'method',
                        target,
                        key: 'emit',
                        wrap: (native, enabled) => function (...args) {
                            if (enabled() && pass?.output === outputId) {
                                if (args[0] === 'prerender') {
                                    if (pass.started)
                                        pass.complete = false;
                                    else {
                                        pass.started = true;
                                        pass.screen =
                                            typeof target['renderingToScreen'] === 'boolean'
                                                ? target['renderingToScreen']
                                                : null;
                                    }
                                }
                                else if (args[0] === 'postrender') {
                                    if (!pass.started || pass.ended)
                                        pass.complete = false;
                                    const current = pass;
                                    const result = Reflect.apply(native, this, args);
                                    current.ended = true;
                                    return result;
                                }
                            }
                            return Reflect.apply(native, this, args);
                        },
                    },
                ];
                leases.set(target, installOwnedHooks(hooks, options.reportFailure));
                continue;
            }
            const flush = locateProperty(target, 'flush')?.descriptor.value as unknown;
            const render = locateProperty(target, 'render')?.descriptor.value as unknown;
            const hooks: OwnedHookSpec[] = [];
            if (typeof flush === 'function')
                hooks.push({
                    kind: 'method',
                    target,
                    key: 'flush',
                    wrap: (native, enabled) => {
                        const submit = timed(options.timing, 'native-submission', native);
                        return function (...args) {
                            const pending = queue(target);
                            if (pending === null && pass !== null)
                                pass.complete = false;
                            const result = pending === null
                                ? Reflect.apply(submit, this, args)
                                : substitute(submit, this, args, enabled, pending);
                            releasePending(target);
                            return result;
                        };
                    },
                });
            if (typeof render === 'function')
                hooks.push({
                    kind: 'method',
                    target,
                    key: 'render',
                    wrap: (native, enabled) => function (...args) {
                        if (!enabled() || disposed || busy)
                            return Reflect.apply(native, this, args);
                        if (pass !== null && queue(target) === null)
                            pass.complete = false;
                        const element = record(args[0]);
                        if (element === null)
                            return Reflect.apply(native, this, args);
                        let use: QueuedUse | null = null;
                        try {
                            use = read(element, 0);
                            observe(element, use === null
                                ? 'unsupported-render-geometry'
                                : typeof flush !== 'function'
                                    ? 'missing-submission-boundary'
                                    : null);
                        }
                        catch (error) {
                            report(error);
                        }
                        if (use === null ||
                            !enabled() ||
                            isDisposed() ||
                            queue(target) !== null ||
                            typeof flush !== 'function')
                            return Reflect.apply(native, this, args);
                        Reflect.apply(flush, this, []);
                        releasePending(target);
                        const elements = [args[0]];
                        const submit = () => {
                            const result = Reflect.apply(native, this, [elements[0], ...args.slice(1)]);
                            Reflect.apply(flush, this, []);
                            return result;
                        };
                        return substitute(submit, this, [], enabled, {
                            elements,
                            size: 1,
                            textures: null,
                            current: () => args[0] === element,
                            immediate: true,
                            hold: (cleanup) => {
                                retained.getOrInsertComputed(target, () => []).push(cleanup);
                            },
                        });
                    },
                });
            if (typeof locateProperty(target, 'destroy')?.descriptor.value === 'function')
                hooks.push({
                    kind: 'method',
                    target,
                    key: 'destroy',
                    wrap: (native) => function (...args) {
                        const result = Reflect.apply(native, this, args);
                        releasePending(target);
                        return result;
                    },
                });
            if (hooks.length > 0)
                leases.set(target, installOwnedHooks(hooks, options.reportFailure));
        }
    }
    function destroyBacking(backing: Backing): void {
        if (backing.pins !== 0 || backing.destroying)
            return;
        backing.destroying = true;
        try {
            if (!backing.nativeReleased) {
                const destroy = backing.base['destroy'];
                if (typeof destroy === 'function')
                    Reflect.apply(destroy, backing.base, []);
                backing.nativeReleased = true;
            }
            backing.releaseSurface();
            backings.delete(backing.handle);
        }
        finally {
            backing.destroying = false;
        }
    }
    function release(handle: BitmapRenderBacking): void {
        const backing = backings.get(handle);
        if (!backing)
            return;
        backing.released = true;
        destroyBacking(backing);
    }
    function createBacking(surface: HTMLCanvasElement, use: BitmapRenderUse, releaseSurface: () => void): BitmapRenderBacking {
        if (disposed)
            throw new Error('Bitmap render host is disposed.');
        const BaseTexture = pixi['BaseTexture'] as new (source: HTMLCanvasElement) => NativeRecord;
        const base = new BaseTexture(surface);
        const handle = Object.freeze({ kind: 'bitmap-render-backing' } as const);
        const backing: Backing = {
            handle,
            base,
            width: surface.width,
            height: surface.height,
            sampling: use.sampling,
            releaseSurface,
            nativeReleased: false,
            destroying: false,
            released: false,
            pins: 0,
        };
        backings.set(handle, backing);
        try {
            if (isDisposed())
                throw new Error('Bitmap render host ended during backing creation.');
            for (const [key, value] of Object.entries(use.sampling)) {
                base[key] = value;
                if (isDisposed() || backing.released)
                    throw new Error('Bitmap render host ended during backing configuration.');
            }
            return handle;
        }
        catch (error) {
            try {
                release(handle);
            }
            catch (cleanupError) {
                report(cleanupError);
            }
            throw error;
        }
    }
    function dispose(): OwnedHookDisposal {
        if (disposed && backings.size === 0 && leases.size === 0)
            return 'already-disposed';
        if (nativeDepth > 0 || retained.size > 0) {
            disposed = true;
            return 'failed';
        }
        let result: OwnedHookDisposal = 'disposed';
        for (const [target, lease] of leases) {
            const outcome = lease.dispose();
            if (outcome === 'failed')
                return outcome;
            if (outcome === 'ownership-lost')
                result = outcome;
            leases.delete(target);
        }
        disposed = true;
        for (const handle of backings.keys()) {
            try {
                release(handle);
            }
            catch (error) {
                report(error);
            }
        }
        return backings.size > 0 ? 'failed' : result;
    }
    return {
        connect,
        beginScene: () => {
            sceneRendered = false;
        },
        endScene: () => {
            if (!sceneRendered && sceneOutput !== null && !disposed)
                options.demand?.(sceneOutput, [], false);
        },
        createBacking,
        release,
        dispose,
        accepts: (handle: BitmapRenderBacking, use: BitmapRenderUse) => {
            const backing = backings.get(handle);
            return backing !== undefined && !backing.released && sameSampling(backing.sampling, use.sampling);
        },
    };
}
