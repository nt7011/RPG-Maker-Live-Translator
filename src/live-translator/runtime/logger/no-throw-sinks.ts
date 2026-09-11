import type { LogRedactor } from '../log-redaction-port.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
type ConsoleCandidate = PropertyBag;
interface WindowAlertCandidate {
    alert?: unknown;
}
export interface NoThrowLoggerSinks {
    readonly error: (arguments_: readonly unknown[]) => void;
    readonly log: (arguments_: readonly unknown[]) => void;
    readonly warn: (arguments_: readonly unknown[]) => void;
}
function bindConsoleMethod(consoleRef: unknown, method: PropertyKey, fallback: RuntimeMethod): RuntimeMethod {
    if (!consoleRef)
        return fallback;
    try {
        const candidate = (consoleRef as ConsoleCandidate)[method];
        if (typeof candidate !== 'function')
            return fallback;
        return (...arguments_: unknown[]) => Reflect.apply(candidate as RuntimeMethod, consoleRef, arguments_);
    }
    catch {
        return fallback;
    }
}
export function createNoThrowLoggerSinks(redactor?: LogRedactor): NoThrowLoggerSinks {
    let consoleRef: unknown;
    try {
        consoleRef = globalThis.console;
    }
    catch {
    }
    const consoleLog = bindConsoleMethod(consoleRef, 'log', () => {
    });
    const consoleWarn = bindConsoleMethod(consoleRef, 'warn', consoleLog);
    const consoleError = bindConsoleMethod(consoleRef, 'error', consoleWarn);
    function emit(sink: RuntimeMethod, arguments_: readonly unknown[]): void {
        try {
            Reflect.apply(sink, undefined, arguments_);
            return;
        }
        catch {
        }
        try {
            const windowRef: unknown = globalThis.window;
            if (!windowRef)
                return;
            const alert = (windowRef as WindowAlertCandidate).alert;
            if (typeof alert === 'function') {
                Reflect.apply(alert, windowRef, [arguments_.join(' ')]);
            }
        }
        catch {
        }
    }
    const sinks: NoThrowLoggerSinks = {
        error: (arguments_: readonly unknown[]): void => {
            emit(consoleError, arguments_);
        },
        log: (arguments_: readonly unknown[]): void => {
            emit(consoleLog, arguments_);
        },
        warn: (arguments_: readonly unknown[]): void => {
            emit(consoleWarn, arguments_);
        },
    };
    if (redactor === undefined)
        return sinks;
    const project = redactor.value;
    function redact(sink: (arguments_: readonly unknown[]) => void) {
        return (arguments_: readonly unknown[]): void => {
            try {
                sink(project(arguments_) as readonly unknown[]);
            }
            catch {
            }
        };
    }
    return { error: redact(sinks.error), warn: redact(sinks.warn), log: redact(sinks.log) };
}
