import type { BoundedValueCloneLimits } from './bounded-value-clone.js';
import { captureLogRedactor } from './log-redaction-port.js';
import { captureOptionalDiagnosticsHooks, cloneDiagnosticValue, createOptionalDiagnosticsBindingFromHooks, isDiagnosticsPropertyBag, readDiagnosticsProperty, type DiagnosticsPropertyBag, } from './diagnostics-interop.js';
type PropertyBag = DiagnosticsPropertyBag;
export interface TranslationDiagnosticsPort {
    dispose(): boolean;
    flush(): void;
    increment(name: unknown, amount?: unknown): void;
    observeStatusLazy(factsFactory: () => unknown): void;
    recordLazy(type: unknown, detailsFactory: () => unknown): void;
    rememberJob(job: unknown, terminalStatus: unknown, details?: unknown): void;
}
export interface TranslationDiagnosticsPortModule {
    createTranslationDiagnostics(): TranslationDiagnosticsPort;
}
const OBSERVATION_LIMITS: BoundedValueCloneLimits = Object.freeze({
    arrayEntries: 32,
    depth: 5,
    nestedObjectKeys: 48,
    rootObjectKeys: 72,
    totalEntries: 1536,
});
const JOB_LIMITS: BoundedValueCloneLimits = Object.freeze({
    arrayEntries: 24,
    depth: 4,
    nestedObjectKeys: 48,
    rootObjectKeys: 80,
    totalEntries: 1536,
});
function project(value: unknown, limits: BoundedValueCloneLimits, fallback: unknown): unknown {
    return cloneDiagnosticValue(value, limits, fallback);
}
export function createTranslationDiagnosticsPortModule(globalScope: PropertyBag): TranslationDiagnosticsPortModule {
    const hooks = captureOptionalDiagnosticsHooks(globalScope);
    const redactor = captureLogRedactor(globalScope);
    const copy = redactor === undefined
        ? project
        : (value: unknown, limits: BoundedValueCloneLimits, fallback: unknown): unknown => redactor.record(project(value, limits, fallback));
    function createTranslationDiagnostics(): TranslationDiagnosticsPort {
        const binding = createOptionalDiagnosticsBindingFromHooks(hooks, 'createTranslationDiagnostics');
        function flush(): void {
            binding.invoke('flush');
        }
        function increment(name: unknown, amount: unknown = 1): void {
            binding.invokeLazy('increment', () => [
                project(name, OBSERVATION_LIMITS, ''),
                project(amount, OBSERVATION_LIMITS, 1),
            ]);
        }
        function observeStatusLazy(factsFactory: () => unknown): void {
            binding.invokeLazy('observeStatus', () => {
                let facts: unknown;
                try {
                    facts = Reflect.apply(factsFactory, undefined, []);
                }
                catch (error) {
                    facts = { observationError: formatTranslationObservationError(error) };
                }
                return [copy(facts, OBSERVATION_LIMITS, {})];
            });
        }
        function recordLazy(type: unknown, detailsFactory: () => unknown): void {
            binding.invokeLazy('record', () => {
                let details: unknown;
                try {
                    details = Reflect.apply(detailsFactory, undefined, []);
                }
                catch (error) {
                    details = { observationError: formatTranslationObservationError(error) };
                }
                return [project(type, OBSERVATION_LIMITS, ''), copy(details, OBSERVATION_LIMITS, {})];
            });
        }
        function rememberJob(job: unknown, terminalStatus: unknown, details: unknown = {}): void {
            binding.invokeLazy('rememberJob', () => [
                copy(job, JOB_LIMITS, {}),
                project(terminalStatus, OBSERVATION_LIMITS, ''),
                copy(details, OBSERVATION_LIMITS, {}),
            ]);
        }
        function dispose(): boolean {
            return binding.dispose();
        }
        return Object.freeze({ dispose, flush, increment, observeStatusLazy, recordLazy, rememberJob });
    }
    return { createTranslationDiagnostics };
}
export function formatTranslationObservationError(error: unknown): string {
    try {
        if (isDiagnosticsPropertyBag(error)) {
            const stack = readDiagnosticsProperty(error, 'stack');
            if (typeof stack === 'string' && stack.length > 0)
                return stack;
            const message = readDiagnosticsProperty(error, 'message');
            if (typeof message === 'string' && message.length > 0)
                return message;
        }
        return String(error ?? '');
    }
    catch {
        return '';
    }
}
