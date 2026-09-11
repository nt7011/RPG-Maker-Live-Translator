import type { RuntimeDiagnosticsIngress } from './diagnostics-ingress.js';
export type TimingEdge = 'enter' | 'leave' | 'dispose' | 'suspend' | 'resume' | 'unavailable';
export type RuntimeTiming = (phase: string, edge: TimingEdge, units?: number, pixels?: number) => void;
export function captureRuntimeTiming(ingress: RuntimeDiagnosticsIngress, generation: number): RuntimeTiming | undefined {
    const accept = ingress.acceptTimingEvent;
    if (accept === undefined)
        return undefined;
    return (phase, edge, units, pixels) => {
        try {
            accept(generation, phase, edge, units, pixels);
        }
        catch {
        }
    };
}
export function timed<F extends (this: never, ...args: never[]) => unknown>(timing: RuntimeTiming | undefined, phase: string, run: F, work?: (args: Parameters<F>) => readonly [
    number,
    number
]): F {
    if (timing === undefined)
        return run;
    return function (this: unknown, ...args: Parameters<F>): unknown {
        let units = 0, pixels = 0;
        try {
            [units, pixels] = work?.(args) ?? [0, 0];
        }
        catch {
        }
        timing(phase, 'enter', units, pixels);
        try {
            return Reflect.apply(run, this, args);
        }
        finally {
            timing(phase, 'leave');
        }
    } as unknown as F;
}
