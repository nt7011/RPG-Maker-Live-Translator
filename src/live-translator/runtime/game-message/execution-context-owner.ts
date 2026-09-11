type PropertySource = Record<PropertyKey, unknown>;
interface ExecutionFrame {
    readonly context: PropertySource;
    readonly interpreter: unknown;
    newer: ExecutionFrame | null;
    older: ExecutionFrame | null;
    active: boolean;
}
export type InterpreterExecutionContextRelease = () => boolean;
export interface InterpreterExecutionContextOwner {
    readonly enter: (context?: unknown, interpreter?: unknown) => InterpreterExecutionContextRelease | null;
    readonly peek: (interpreter?: unknown) => PropertySource | null;
}
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
export function createInterpreterExecutionContextOwner(): InterpreterExecutionContextOwner {
    let newestFrame: ExecutionFrame | null = null;
    function enter(context: unknown, interpreter: unknown = null): InterpreterExecutionContextRelease | null {
        if (!isPropertySource(context))
            return null;
        const frame: ExecutionFrame = {
            active: true,
            context,
            interpreter,
            newer: null,
            older: newestFrame,
        };
        if (newestFrame)
            newestFrame.newer = frame;
        newestFrame = frame;
        return function releaseInterpreterExecutionContext(): boolean {
            if (!frame.active)
                return true;
            frame.active = false;
            if (frame.newer) {
                frame.newer.older = frame.older;
            }
            else if (newestFrame === frame) {
                newestFrame = frame.older;
            }
            if (frame.older)
                frame.older.newer = frame.newer;
            frame.newer = null;
            frame.older = null;
            return true;
        };
    }
    function peek(interpreter: unknown = null): PropertySource | null {
        let frame = newestFrame;
        while (frame) {
            if (frame.active && (interpreter === null || frame.interpreter === interpreter)) {
                return frame.context;
            }
            frame = frame.older;
        }
        return null;
    }
    return Object.freeze({ enter, peek });
}
