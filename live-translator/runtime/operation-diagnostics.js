// Shared diagnostics for optional runtime capability boundaries.
//
// Adapters often call into optional facets owned by another subsystem. The
// caller should keep its fallback behavior when a facet fails, but the failure
// still needs to be visible in logs and counters. This helper records every
// failure in telemetry and emits one warning per operation so a hot loop cannot
// flood the console.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/operation-diagnostics.js.');
    }

    function createOperationErrorReporter(options = {}) {
        const source = options && typeof options === 'object' ? options : {};
        const component = stringify(source.component || 'LiveTranslator') || 'LiveTranslator';
        const operationLabel = stringify(source.operationLabel || 'operation') || 'operation';
        const metricBase = stringify(source.metricBase || 'operation.error') || 'operation.error';
        const domain = stringify(source.domain || 'translator') || 'translator';
        const logger = source.logger;
        const perf = source.perf;
        const warnedOperations = new Set();

        return function reportOperationError(operation, error) {
            const name = stringify(operation || 'unknown') || 'unknown';
            recordFailureMetrics(perf, metricBase, domain, name);
            if (warnedOperations.has(name)) return;
            warnedOperations.add(name);
            warn(logger, `[${component}] ${operationLabel} ${name} failed.`, error);
        };
    }

    function recordFailureMetrics(perf, metricBase, domain, operation) {
        if (!perf || typeof perf !== 'object') return;
        const metricOptions = { domain };
        try {
            if (typeof perf.count === 'function') perf.count(`${metricBase}.count`, 1, metricOptions);
            if (typeof perf.top === 'function') perf.top(`${metricBase}.operation`, operation, 1, metricOptions);
        } catch (_) {}
    }

    function warn(logger, message, error) {
        if (!logger || typeof logger.warn !== 'function') return;
        try { logger.warn(message, error); } catch (_) {}
    }

    function stringify(value) {
        try { return String(value ?? ''); } catch (_) { return ''; }
    }

    defineRuntimeModule('runtime.operationDiagnostics', {
        createOperationErrorReporter,
    });
})();
