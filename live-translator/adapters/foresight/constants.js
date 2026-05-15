// Foresight scanner constants.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const DEFAULT_BUDGET = 30;
    const DEFAULT_MAX_SCAN_COMMANDS = 150;
    const MESSAGE_BUDGET_COST = 1;
    const BRANCH_BUDGET_STRATEGY = 'even-split';
    const MAX_NESTED_LIST_DEPTH = 8;
    const MAX_NESTED_LISTS_PER_COMMAND = 8;
    const MAX_BRANCH_DEPTH = 8;
    const DIAGNOSTIC_ACTION_LIMIT = 150;
    const RECENT_SCAN_LIMIT = 40;
    const COMMAND_CATALOG_ASSET = 'adapters/foresight-commands.json';
    const BRANCH_MARKER_CODES = new Set([402, 403, 404, 411, 412, 601, 602, 603, 604]);
    const RESOLVABLE_CONTROL_FLOW_CODES = new Set([112, 113, 119, 413]);
    
    Object.assign(parts, {
        DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY,
        MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND,
        MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET,
        BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES,
    });

})();
