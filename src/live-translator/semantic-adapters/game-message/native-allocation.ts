import type { NativeCapture, NativeCaptureHost } from '../contract.js';
import { contents, number, object, own, prototype } from '../shared/native.js';
export function captureMessageAllocation(host: NativeCaptureHost): NativeCapture {
    const pages = new WeakMap<object, {
        receiver: object;
        bitmap: object;
        x: number;
        y: number;
    }>();
    host.method(prototype(host.scope, 'Window_Message'), 'newPage', (native) => function (this: unknown, ...args: unknown[]) {
        const state = object(args[0]);
        if (state !== null)
            pages.delete(state);
        const result = Reflect.apply(native, this, args);
        host.safely(() => {
            const receiver = object(this);
            if (receiver === null || state === null || own(state, 'rtl') === true)
                return;
            const bitmap = contents(receiver), x = number(own(state, 'x')), y = number(own(state, 'y'));
            if (bitmap !== null && x !== null && y !== null)
                pages.set(state, { receiver, bitmap, x, y });
        });
        return result;
    });
    return {
        allocation(context, rejected) {
            const refuse = (reason: string): null => {
                rejected?.(`message-page:${reason}`);
                return null;
            };
            const page = context.textState === null ? undefined : pages.get(context.textState);
            if (page === undefined)
                return refuse('no-observed-page-for-state');
            if (page.receiver !== context.receiver)
                return refuse('receiver-mismatch');
            if (page.bitmap !== context.bitmap || contents(context.receiver) !== context.bitmap)
                return refuse('contents-bitmap-mismatch');
            if (own(context.receiver, '_textState') !== context.textState)
                return refuse('not-current-message-state');
            const width = context.width - page.x, height = context.height - page.y;
            return width > 0 && height > 0 ? { x: page.x, y: page.y, width, height } : refuse('page-outside-bitmap');
        },
    };
}
