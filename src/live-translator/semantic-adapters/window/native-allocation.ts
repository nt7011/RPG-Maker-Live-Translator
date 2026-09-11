import type { NativeCapture, NativeCaptureHost } from '../contract.js';
import { contents, own, nativePrototypes, rectangle } from '../shared/native.js';
export function captureWindowAllocation(host: NativeCaptureHost): NativeCapture {
    interface Item {
        readonly receiver: object;
        readonly index: unknown;
        readonly bitmap: object | null;
        rect: unknown;
        depth: number;
        ambiguous: boolean;
        used: boolean;
    }
    const frames: Item[] = [];
    const targets = nativePrototypes(host.scope, 'Window_Selectable');
    for (const target of targets) {
        if (typeof own(target, 'drawItem') === 'function')
            host.method(target, 'drawItem', (native) => function (this: unknown, ...args: unknown[]) {
                if (typeof this !== 'object' || this === null)
                    return Reflect.apply(native, this, args);
                let bitmap: object | null = null;
                host.safely(() => {
                    bitmap = contents(this);
                });
                const frame: Item = {
                    receiver: this,
                    index: args[0],
                    bitmap,
                    rect: null,
                    depth: 0,
                    ambiguous: false,
                    used: false,
                };
                frames.push(frame);
                try {
                    return Reflect.apply(native, this, args);
                }
                finally {
                    frames.pop();
                }
            });
        for (const key of ['itemRectForText', 'itemLineRect', 'itemRectWithPadding']) {
            if (typeof own(target, key) !== 'function')
                continue;
            host.method(target, key, (native) => function (this: unknown, ...args: unknown[]) {
                const frame = frames.at(-1);
                if (frame === undefined || frame.receiver !== this || frame.index !== args[0])
                    return Reflect.apply(native, this, args);
                frame.depth++;
                try {
                    const result = Reflect.apply(native, this, args);
                    if (frame.depth === 1) {
                        if (frame.rect !== null && !frame.used && frame.rect !== result)
                            frame.ambiguous = true;
                        frame.rect = result;
                        frame.used = false;
                    }
                    return result;
                }
                finally {
                    frame.depth--;
                }
            });
        }
    }
    return {
        allocation(context, rejected) {
            const refuse = (reason: string): null => {
                rejected?.(`window-item:${reason}`);
                return null;
            };
            const frame = frames.at(-1);
            if (frame === undefined)
                return refuse('no-active-drawItem');
            if (frame.receiver !== context.receiver)
                return refuse('receiver-mismatch');
            if (frame.bitmap !== context.bitmap || contents(context.receiver) !== context.bitmap)
                return refuse('contents-bitmap-mismatch');
            if (frame.ambiguous)
                return refuse('ambiguous-rectangles');
            const rect = rectangle(frame.rect);
            if (rect === null)
                return refuse('missing-or-invalid-rectangle');
            if (context.x === null || context.y === null)
                return refuse('text-origin-unavailable');
            frame.used = true;
            const x = context.x, y = context.y;
            const right = Math.min(rect.x + rect.width, context.maxWidth === null ? Infinity : x + context.maxWidth);
            const bottom = rect.y + rect.height;
            if (x < rect.x || y < rect.y || right <= x || bottom <= y)
                return refuse('text-outside-rectangle');
            return { x, y, width: right - x, height: bottom - y };
        },
    };
}
