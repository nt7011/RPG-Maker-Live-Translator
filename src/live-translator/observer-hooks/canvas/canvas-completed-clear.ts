import { timed, type RuntimeTiming } from '../../runtime/diagnostic-timing.js';
import type { createCanvasClearEvidence } from './canvas-clear-evidence.js';
type Method = (this: unknown, ...args: unknown[]) => unknown;
export function wrapCompletedCanvasClear(native: Method, name: 'clearRect' | 'reset', ordinary: Method, options: {
    readonly timing?: RuntimeTiming | undefined;
    readonly enabled: () => boolean;
    readonly canvas: (this: unknown) => HTMLCanvasElement;
    readonly commandOwned: (source: HTMLCanvasElement) => boolean;
    readonly evidence: ReturnType<typeof createCanvasClearEvidence>;
    readonly completed: (source: HTMLCanvasElement) => void;
}): Method {
    return timed(options.timing, 'bitmap-native', function (this: unknown, ...args: unknown[]): unknown {
        let source: HTMLCanvasElement | null = null;
        if (options.enabled()) {
            try {
                const candidate = Reflect.apply(options.canvas, this, []);
                if (!options.commandOwned(candidate) &&
                    options.evidence.admitsClear(candidate, this as CanvasRenderingContext2D, name, args, true))
                    source = candidate;
            }
            catch {
            }
        }
        if (source === null)
            return Reflect.apply(ordinary, this, args);
        options.evidence.beginWrite(source, this as CanvasRenderingContext2D, name, args, true);
        const result = Reflect.apply(native, this, args);
        options.evidence.endWrite(source, name, true);
        options.completed(source);
        return result;
    });
}
