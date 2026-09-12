import { captureCanvasAppearanceOperation, type CanvasAppearanceOperation, } from '../canvas/canvas-appearance-operation.js';
import { timed, type RuntimeTiming } from '../../runtime/diagnostic-timing.js';
import { createCanvasClearEvidence, isNativeCanvasOperation } from '../canvas/canvas-clear-evidence.js';
import { installOwnedHooks, locateProperty, type OwnedHookSpec } from '../owned-hook-installer.js';
import { createCanvasPixelDamageReader, resolveCanvasPixelDamage } from '../canvas/canvas-pixel-damage.js';
import { captureDrawTextPaint, normalizedDrawTextSource } from './text-command.js';
import { isTextPaint } from '../../stores/styled-text.js';
import type { BitmapTextLayout } from '../../stores/bitmap-text-layout.js';
import type { CanvasPixelDamage as ExactGpuMutationDamage } from '../canvas/canvas-pixel-damage.js';
export interface BitmapTextCommand {
    readonly bitmap: object;
    readonly source: HTMLCanvasElement;
    readonly text: string;
    readonly layout: BitmapTextLayout;
}
export interface BitmapCanvasWrite {
    readonly source: HTMLCanvasElement;
    readonly image?: unknown;
    readonly damage: ExactGpuMutationDamage;
    readonly command: BitmapTextCommand | null;
    readonly erases: boolean;
    readonly sourceIsBlank: boolean;
    readonly operation: CanvasAppearanceOperation | null;
}
export function createBitmapSourceReader(bitmapPrototype: object, canvasPrototype: object) {
    const getter: unknown = Reflect.get(locateProperty(bitmapPrototype, 'canvas')?.descriptor ?? {}, 'get');
    if (typeof getter !== 'function')
        throw new TypeError('Bitmap.canvas must be an accessor getter.');
    return (bitmap: object): HTMLCanvasElement | null => {
        const source: unknown = Reflect.apply(getter, bitmap, []);
        if (source === null)
            return null;
        if (typeof source !== 'object' || !Object.prototype.isPrototypeOf.call(canvasPrototype, source))
            throw new TypeError('Bitmap.canvas must inherit HTMLCanvasElement.prototype.');
        return source as HTMLCanvasElement;
    };
}
export function installBitmapCommandObserver(options: {
    readonly timing?: RuntimeTiming | undefined;
    readonly visibilityDocument?: Document | undefined;
    readonly bitmapPrototype: object;
    readonly canvasPrototype: object;
    readonly contextPrototype: object;
    readonly sceneManager: object;
    readonly renderBoundary: {
        readonly target: object;
        readonly key: string;
        readonly accepts: (receiver: unknown) => boolean;
    };
    readonly additionalHooks?: readonly OwnedHookSpec[];
    readonly resolveSource: (bitmap: object) => HTMLCanvasElement | null;
    readonly begin: (command: BitmapTextCommand) => void;
    readonly observesAppearance: (source: HTMLCanvasElement, image: unknown) => boolean;
    readonly write: (receipt: BitmapCanvasWrite) => void;
    readonly afterWrite: (receipt: BitmapCanvasWrite, returned: boolean) => void;
    readonly finish: (command: BitmapTextCommand, returned: boolean) => void;
    readonly reset: (source: HTMLCanvasElement) => void;
    readonly destroy: (bitmap: object) => void;
    readonly beforeRender: () => void;
    readonly afterRender?: () => void;
    readonly reject?: (reason: string, sourceText: string) => void;
    readonly reportFailure: (error: unknown) => void;
}) {
    const invokeNative = timed(options.timing, 'bitmap-native', Reflect.apply);
    const cleared = createCanvasClearEvidence(options.canvasPrototype, options.contextPrototype);
    const reader = createCanvasPixelDamageReader(options.contextPrototype);
    const canvasGetter: unknown = Reflect.get(locateProperty(options.contextPrototype, 'canvas')?.descriptor ?? {}, 'get');
    const getContext = locateProperty(options.canvasPrototype, 'getContext')?.descriptor.value as unknown;
    if (typeof canvasGetter !== 'function' || typeof getContext !== 'function')
        throw new Error('Native Canvas observation is unavailable.');
    const dimensions = ['width', 'height'].map((key) => Reflect.get(locateProperty(options.canvasPrototype, key)?.descriptor ?? {}, 'get') as unknown);
    const dimensionsTrusted = dimensions.every((getter, index) => isNativeCanvasOperation(getter, index === 0 ? 'get width' : 'get height'));
    function readCanvasSize(value: unknown): {
        width: number;
        height: number;
    } | null {
        if (!dimensionsTrusted)
            return null;
        try {
            const width: unknown = Reflect.apply(dimensions[0] as (...args: unknown[]) => unknown, value, []);
            const height: unknown = Reflect.apply(dimensions[1] as (...args: unknown[]) => unknown, value, []);
            return typeof width === 'number' && typeof height === 'number' ? { width, height } : null;
        }
        catch {
            return null;
        }
    }
    type NativeCommand = Omit<BitmapTextCommand, 'layout'> & {
        layout: BitmapTextLayout;
        valid: boolean;
    };
    const commands: NativeCommand[] = [];
    function safe(action: () => void): void {
        try {
            action();
        }
        catch (error) {
            try {
                options.reportFailure(error);
            }
            catch {
            }
        }
    }
    function command(bitmap: object, source: HTMLCanvasElement, args: readonly unknown[]): NativeCommand | null {
        const [value, x, y, width, lineHeight, align] = args;
        const maxWidth = width || 0xffffffff;
        const text = normalizedDrawTextSource(value);
        if (text === null || text.length === 0)
            return null;
        if (![x, y, maxWidth, lineHeight].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
            (maxWidth as number) <= 0) {
            options.reject?.('unsupported-native-placement', text);
            return null;
        }
        const context = Reflect.apply(getContext as (...args: unknown[]) => unknown, source, [
            '2d',
        ]) as CanvasRenderingContext2D | null;
        if (context === null)
            return null;
        const failures: {
            stage: 'capture-paint';
            error: unknown;
        }[] = [];
        const paint = captureDrawTextPaint(bitmap, context, failures);
        if (failures.length)
            throw failures[0]?.error;
        if (paint === null) {
            options.reject?.('unsupported-native-paint', text);
            return null;
        }
        return {
            bitmap,
            source,
            text,
            valid: true,
            layout: {
                placement: {
                    x: x as number,
                    y: y as number,
                    maxWidth: maxWidth as number,
                    lineHeight: lineHeight as number,
                },
                alignment: align === 'center' || align === 'right' ? align : 'left',
                paint,
            },
        };
    }
    const hooks: OwnedHookSpec[] = [
        ...(options.additionalHooks ?? []),
        {
            kind: 'method',
            target: options.bitmapPrototype,
            key: 'drawText',
            wrap: (native, enabled) => function (this: unknown, ...args: unknown[]) {
                if (!enabled())
                    return invokeNative(native, this, args);
                const frame: {
                    owner: NativeCommand | null;
                } = { owner: null };
                if (typeof this === 'object' && this !== null)
                    safe(() => {
                        const source = options.resolveSource(this);
                        if (source === null || commands.some((item) => item.source === source))
                            return;
                        frame.owner = command(this, source, args);
                        if (frame.owner !== null) {
                            commands.push(frame.owner);
                            options.begin(frame.owner);
                        }
                    });
                let returned = false;
                try {
                    const result = invokeNative(native, this, args);
                    returned = true;
                    return result;
                }
                finally {
                    if (frame.owner !== null) {
                        commands.pop();
                        const completed = frame.owner;
                        safe(() => {
                            options.finish(completed, returned && completed.valid);
                        });
                    }
                }
            },
        },
    ];
    for (const key of [
        'clearRect',
        'fillRect',
        'strokeRect',
        'fill',
        'stroke',
        'fillText',
        'strokeText',
        'drawImage',
        'putImageData',
        'reset',
        'drawFocusIfNeeded',
    ] as const)
        hooks.push({
            kind: 'method',
            target: options.contextPrototype,
            key,
            optional: true,
            wrap: (native, enabled) => {
                const trusted = isNativeCanvasOperation(native, key);
                return function (this: unknown, ...args: unknown[]) {
                    const [text, x, y, maxWidth] = args;
                    if (trusted &&
                        (key === 'fillText' || key === 'strokeText') &&
                        typeof text === 'string' &&
                        typeof x === 'number' &&
                        typeof y === 'number' &&
                        (args.length === 3 || (args.length === 4 && typeof maxWidth === 'number')) &&
                        (!Number.isFinite(x) ||
                            !Number.isFinite(y) ||
                            (args.length === 4 && !Number.isFinite(maxWidth))))
                        return invokeNative(native, this, args);
                    const write: {
                        receipt: BitmapCanvasWrite | null;
                        cleared: boolean;
                    } = {
                        receipt: null,
                        cleared: false,
                    };
                    if (enabled())
                        safe(() => {
                            const source = Reflect.apply(canvasGetter, this, []) as HTMLCanvasElement;
                            const context = this as CanvasRenderingContext2D;
                            const command = commands.findLast((item) => item.source === source) ?? null;
                            if (command !== null && (key === 'fillText' || key === 'strokeText')) {
                                const layout = command.layout;
                                const baseline = args[2];
                                const paint = key === 'fillText'
                                    ? {
                                        ...layout.paint,
                                        font: context.font,
                                        textColor: context.fillStyle,
                                        bodyAlpha: context.globalAlpha,
                                        baselineOffset: typeof baseline === 'number'
                                            ? baseline -
                                                (layout.placement.y +
                                                    layout.placement.lineHeight / 2 +
                                                    layout.paint.fontSize * 0.35)
                                            : NaN,
                                    }
                                    : {
                                        ...layout.paint,
                                        outlineColor: context.strokeStyle,
                                        outlineWidth: context.lineWidth,
                                    };
                                if (isTextPaint(paint))
                                    command.layout = { ...layout, paint };
                                else {
                                    command.valid = false;
                                    options.reject?.('unsupported-native-text-operation', command.text);
                                }
                            }
                            const receipt: BitmapCanvasWrite = {
                                source,
                                image: key === 'drawImage' ? args[0] : null,
                                damage: resolveCanvasPixelDamage(reader, context, key, args),
                                command,
                                erases: key === 'clearRect' || key === 'reset',
                                sourceIsBlank: cleared.isBlank(source, context),
                                operation: trusted && options.observesAppearance(source, key === 'drawImage' ? args[0] : null)
                                    ? captureCanvasAppearanceOperation(reader, context, key, args, cleared.isUnclipped(source), readCanvasSize)
                                    : null,
                            };
                            write.receipt = receipt;
                            options.write(receipt);
                            write.cleared = cleared.beginWrite(source, context, key, args, trusted);
                        });
                    let returned = false;
                    try {
                        const result = invokeNative(native, this, args);
                        returned = true;
                        return result;
                    }
                    finally {
                        const receipt = write.receipt;
                        if (receipt !== null)
                            safe(() => {
                                if (returned)
                                    cleared.endWrite(receipt.source, key, write.cleared);
                                options.afterWrite(receipt, returned);
                            });
                    }
                };
            },
        });
    for (const key of ['save', 'restore', 'clip'] as const)
        hooks.push({
            kind: 'method',
            target: options.contextPrototype,
            key,
            optional: true,
            wrap: (native, enabled) => {
                const trusted = isNativeCanvasOperation(native, key);
                return function (this: unknown, ...args: unknown[]) {
                    try {
                        return invokeNative(native, this, args);
                    }
                    finally {
                        if (enabled())
                            safe(() => {
                                cleared.clipState(Reflect.apply(canvasGetter, this, []) as HTMLCanvasElement, key, trusted);
                            });
                    }
                };
            },
        });
    for (const key of ['width', 'height'])
        hooks.push({
            kind: 'setter',
            target: options.canvasPrototype,
            key,
            wrap: (native, enabled) => {
                const trusted = isNativeCanvasOperation(native, `set ${key}`);
                return function (this: unknown, value: unknown) {
                    if (enabled())
                        safe(() => {
                            cleared.forget(this as HTMLCanvasElement);
                            options.reset(this as HTMLCanvasElement);
                        });
                    const result = invokeNative(native, this, [value]);
                    if (enabled())
                        safe(() => {
                            cleared.reset(this as HTMLCanvasElement, trusted);
                        });
                    return result;
                };
            },
        });
    hooks.push({
        kind: 'method',
        target: options.bitmapPrototype,
        key: 'destroy',
        optional: true,
        wrap: (native, enabled) => function (this: unknown, ...args: unknown[]) {
            if (enabled() && typeof this === 'object' && this !== null)
                safe(() => {
                    options.destroy(this);
                });
            return invokeNative(native, this, args);
        },
    });
    hooks.push({
        kind: 'method',
        target: options.renderBoundary.target,
        key: options.renderBoundary.key,
        wrap: (native, enabled) => function (this: unknown, ...args: unknown[]) {
            if (!enabled() || !options.renderBoundary.accepts(this))
                return invokeNative(native, this, args);
            if (enabled())
                safe(options.beforeRender);
            try {
                return invokeNative(native, this, args);
            }
            finally {
                if (enabled() && options.afterRender !== undefined)
                    safe(options.afterRender);
            }
        },
    });
    const timing = options.timing;
    if (timing !== undefined) {
        for (let i = 0; i < hooks.length; i++) {
            const hook = hooks[i];
            if (hook === undefined)
                continue;
            const phase = hook.target === options.renderBoundary.target ? 'render' : 'bitmap-observer';
            if (hook.kind === 'method') {
                const wrap: typeof hook.wrap = (native, enabled) => timed(timing, phase, hook.wrap(native, enabled));
                hooks[i] = { ...hook, wrap };
            }
            else {
                const wrap: typeof hook.wrap = (native, enabled) => timed(timing, phase, hook.wrap(native, enabled));
                hooks[i] = { ...hook, wrap };
            }
        }
        const method = ['updateMain', 'update'].find((name) => typeof locateProperty(options.sceneManager, name)?.descriptor.value === 'function');
        if (method === undefined)
            timing('frame', 'unavailable');
        else
            hooks.push({
                kind: 'method',
                target: options.sceneManager,
                key: method,
                wrap: (native) => timed(timing, `frame:${method}`, native),
            });
    }
    const lease = installOwnedHooks(hooks, options.reportFailure);
    if (timing === undefined)
        return lease;
    const document = options.visibilityDocument;
    const visibility = () => {
        if (document?.visibilityState === 'hidden')
            timing('frame', 'suspend');
        else if (document?.visibilityState === 'visible')
            timing('frame', 'resume');
    };
    try {
        document?.addEventListener('visibilitychange', visibility);
        visibility();
    }
    catch {
    }
    return {
        dispose: () => {
            try {
                document?.removeEventListener('visibilitychange', visibility);
            }
            catch {
            }
            timing('frame', 'dispose');
            return lease.dispose();
        },
    };
}
