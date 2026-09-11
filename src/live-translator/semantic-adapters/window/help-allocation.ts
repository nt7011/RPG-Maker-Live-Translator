import type { NativeCapture, NativeCaptureHost } from '../contract.js';
import { contents, nativePrototypes, object, own, prototype, rectangle } from '../shared/native.js';
export function captureHelpAllocation(host: NativeCaptureHost): NativeCapture {
    const help = prototype(host.scope, 'Window_Help');
    if (help === null)
        return {};
    interface Body {
        readonly receiver: object;
        readonly bitmap: object | null;
        rect: unknown;
        observedRect: boolean;
        depth: number;
    }
    const frames: Body[] = [];
    for (const target of nativePrototypes(host.scope, 'Window_Help')) {
        if (typeof own(target, 'refresh') === 'function')
            host.method(target, 'refresh', (native) => function (this: unknown, ...args: unknown[]) {
                const receiver = object(this);
                if (receiver === null)
                    return Reflect.apply(native, this, args);
                let bitmap: object | null = null;
                host.safely(() => {
                    bitmap = contents(receiver);
                });
                frames.push({ receiver, bitmap, rect: undefined, observedRect: false, depth: 0 });
                try {
                    return Reflect.apply(native, this, args);
                }
                finally {
                    frames.pop();
                }
            });
        if (target !== help && typeof own(target, 'baseTextRect') !== 'function')
            continue;
        host.method(target, 'baseTextRect', (native) => function (this: unknown, ...args: unknown[]) {
            const frame = frames.at(-1);
            if (frame === undefined || frame.receiver !== this)
                return Reflect.apply(native, this, args);
            frame.depth++;
            if (frame.depth === 1) {
                frame.rect = undefined;
                frame.observedRect = true;
            }
            try {
                const result = Reflect.apply(native, this, args);
                if (frame.depth === 1)
                    frame.rect = result;
                return result;
            }
            finally {
                frame.depth--;
            }
        });
    }
    return {
        allocation(context, rejected) {
            const refuse = (reason: string): null => {
                rejected?.(`help-body:${reason}`);
                return null;
            };
            const frame = frames.at(-1);
            if (frame === undefined)
                return refuse('no-active-refresh');
            if (frame.receiver !== context.receiver)
                return refuse('receiver-mismatch');
            if (frame.bitmap !== context.bitmap || contents(context.receiver) !== context.bitmap)
                return refuse('contents-bitmap-mismatch');
            if (frame.depth > 0)
                return refuse('unfinished-text-rectangle');
            const rect = !frame.observedRect
                ? { x: 0, y: 0, width: context.width, height: context.height }
                : rectangle(frame.rect);
            if (rect === null)
                return refuse('invalid-text-rectangle');
            const { x, y } = context;
            if (x === null || y === null)
                return refuse('text-origin-unavailable');
            const right = Math.min(context.width, rect.x + rect.width, context.maxWidth === null ? Infinity : x + context.maxWidth);
            const bottom = Math.min(context.height, rect.y + rect.height);
            if (x < rect.x || y < rect.y || x < 0 || y < 0 || right <= x || bottom <= y)
                return refuse('text-outside-body');
            return { x, y, width: right - x, height: bottom - y };
        },
    };
}
