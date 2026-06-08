// Foresight primitive normalization helpers.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before Foresight parts.');
    }
    const parts = requireRuntimeModule('adapters.foresight.partsRegistry').getParts();

    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    
    function reasonFromLabel(label) {
            return String(label || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/gu, '-')
                .replace(/^-|-$/gu, '');
        }
    
    function positiveInteger(value, fallback) {
            const numeric = Number(value);
            return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
        }
    
    function finiteNumber(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : null;
        }
    
    function integerIndex(value) {
            const numeric = Number(value);
            return Number.isInteger(numeric) ? numeric : null;
        }
    
    function nullableFiniteNumber(value) {
            if (value === null || value === undefined || value === '') return null;
            return finiteNumber(value);
        }
    
    function nonEmptyString(value) {
            const string = typeof value === 'string' ? value.trim() : '';
            return string || '';
        }
    
    Object.assign(parts, { reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString });

})();
