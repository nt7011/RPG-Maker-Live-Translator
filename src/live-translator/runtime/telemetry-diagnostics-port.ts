import type { BoundedValueCloneLimits } from './bounded-value-clone.js';
import { captureOptionalDiagnosticsHooks, cloneDiagnosticValue, createOptionalDiagnosticsBindingFromHooks, readDiagnosticsCallback, readDiagnosticsProperty, type DiagnosticsPropertyBag, } from './diagnostics-interop.js';
import { captureLogRedactor } from './log-redaction-port.js';
type PropertyBag = DiagnosticsPropertyBag;
export interface TelemetryChannel {
    logTextDetected(source: unknown, text: unknown, x: unknown, y: unknown, extraInfo?: unknown): void;
    logTranslation(event: unknown, text: unknown, result?: unknown, timing?: unknown): void;
    logDraw(event: unknown, text: unknown, x: unknown, y: unknown, extraInfo?: unknown): void;
    logGameMessageRecovery(reason: unknown, text: unknown): void;
    logGameMessageState(state: unknown): void;
    showStats(): void;
}
export interface TelemetryDiagnosticsPortModule {
    createTelemetryDiagnostics(options?: unknown): TelemetryChannel;
}
const FACT_LIMITS: BoundedValueCloneLimits = Object.freeze({
    arrayEntries: 64,
    depth: 6,
    nestedObjectKeys: 64,
    rootObjectKeys: 24,
    totalEntries: 2048,
});
function project(value: unknown, limits: BoundedValueCloneLimits, fallback: unknown): unknown {
    return cloneDiagnosticValue(value, limits, fallback);
}
export function createTelemetryDiagnosticsPortModule(globalScope: PropertyBag): TelemetryDiagnosticsPortModule {
    const hooks = captureOptionalDiagnosticsHooks(globalScope);
    const redactor = captureLogRedactor(globalScope);
    const copy = redactor === undefined
        ? project
        : (value: unknown, limits: BoundedValueCloneLimits, fallback: unknown): unknown => redactor.record(project(value, limits, fallback));
    function createTelemetryDiagnostics(options: unknown = {}): TelemetryChannel {
        const logger = readDiagnosticsProperty(options, 'logger');
        const binding = createOptionalDiagnosticsBindingFromHooks(hooks, 'createTelemetryDiagnostics');
        function shouldLog(level: string): boolean {
            const method = readDiagnosticsCallback(logger, 'shouldLog');
            if (!method)
                return false;
            try {
                return Reflect.apply(method, logger, [level]) === true;
            }
            catch {
                return false;
            }
        }
        function observe(methodName: PropertyKey, fact: PropertyBag): void {
            binding.invokeLazy(methodName, () => {
                const detached = copy({
                    ...fact,
                    levels: {
                        debug: shouldLog('debug'),
                        trace: shouldLog('trace'),
                        warn: shouldLog('warn'),
                    },
                }, FACT_LIMITS, null);
                return detached === null ? null : [detached];
            });
        }
        function logTextDetected(source: unknown, text: unknown, x: unknown, y: unknown, extraInfo: unknown = {}): void {
            observe('logTextDetected', { source, text, x, y, extraInfo });
        }
        function logTranslation(event: unknown, text: unknown, result: unknown = null, timing: unknown = null): void {
            observe('logTranslation', { event, text, result, timing });
        }
        function logDraw(event: unknown, text: unknown, x: unknown, y: unknown, extraInfo: unknown = {}): void {
            observe('logDraw', { event, text, x, y, extraInfo });
        }
        function logGameMessageState(state: unknown): void {
            observe('logGameMessageState', { state });
        }
        function logGameMessageRecovery(reason: unknown, text: unknown): void {
            observe('logGameMessageRecovery', { reason, text });
        }
        function showStats(): void {
            observe('showStats', {});
        }
        return Object.freeze({
            logTextDetected,
            logTranslation,
            logDraw,
            logGameMessageRecovery,
            logGameMessageState,
            showStats,
        });
    }
    return { createTelemetryDiagnostics };
}
