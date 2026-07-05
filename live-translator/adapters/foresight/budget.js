// Foresight budget state and snapshots.
(() => {
    'use strict';

    LiveTranslatorRun({
        name: 'adapters.foresight.budget',
        requires: {
            partsRegistry: 'adapters.foresight.partsRegistry',
        },
        loadAfter: ['adapters.foresight.partsRegistry'],
        scriptAfter: ['adapters/foresight/constants.js', 'adapters/foresight/part-facades.js', 'adapters/foresight/catalog.js'],
        loadBefore: ['adapters.foresight'],
        run({ partsRegistry }) {
            const parts = partsRegistry.getParts();
            const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, INTEL_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
            const { positiveInteger, nonEmptyString } = parts.facades.utils;

            function createBudgetState(value, maxMessages) {
                    const initial = positiveInteger(value, DEFAULT_BUDGET);
                    const messageLimit = positiveInteger(maxMessages, initial);
                    const limit = Math.max(1, initial);
                    return {
                        initial,
                        limit,
                        messageLimit,
                        spent: 0,
                        remaining: limit,
                        messageCost: MESSAGE_BUDGET_COST,
                        branchStrategy: BRANCH_BUDGET_STRATEGY,
                    };
                }

            function createInitialBudgetSnapshot(value, maxMessages) {
                    return createBudgetSnapshot(createBudgetState(value, maxMessages));
                }

            function hasBudgetRemaining(budget) {
                    return Boolean(budget && Number(budget.remaining) > 0);
                }

            function spendBudget(budget, amount) {
                    if (!budget) return 0;
                    const requested = positiveInteger(amount, MESSAGE_BUDGET_COST);
                    const spent = Math.min(Number(budget.remaining) || 0, requested);
                    budget.spent = (Number(budget.spent) || 0) + spent;
                    budget.remaining = Math.max(0, (Number(budget.remaining) || 0) - spent);
                    return spent;
                }

            function createBudgetSnapshot(budget) {
                    if (!budget || typeof budget !== 'object') return null;
                    return {
                        initial: Math.max(0, Math.floor(Number(budget.initial) || 0)),
                        limit: Math.max(0, Math.floor(Number(budget.limit) || 0)),
                        messageLimit: Math.max(0, Math.floor(Number(budget.messageLimit) || 0)),
                        spent: Math.max(0, Math.floor(Number(budget.spent) || 0)),
                        remaining: Math.max(0, Math.floor(Number(budget.remaining) || 0)),
                        messageCost: Math.max(1, Math.floor(Number(budget.messageCost) || MESSAGE_BUDGET_COST)),
                        branchStrategy: nonEmptyString(budget.branchStrategy) || BRANCH_BUDGET_STRATEGY,
                    };
                }

            function cloneBudgetSnapshot(budget) {
                    return createBudgetSnapshot(budget);
                }

            function createActionBudgetSnapshot(before, after, cost) {
                    return {
                        before: cloneBudgetSnapshot(before),
                        after: cloneBudgetSnapshot(after),
                        cost: Math.max(0, Math.floor(Number(cost) || 0)),
                    };
                }

            function createBranchBudgetSnapshot(parentBudget, allocation, branchIndex, branchCount) {
                    const parent = createBudgetSnapshot(parentBudget);
                    const limit = Math.max(0, Math.floor(Number(allocation) || 0));
                    return {
                        initial: limit,
                        limit,
                        spent: 0,
                        remaining: limit,
                        parentRemaining: parent ? parent.remaining : 0,
                        branchIndex,
                        branchCount,
                        branchStrategy: BRANCH_BUDGET_STRATEGY,
                    };
                }

            Object.assign(parts, { createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot });
        },
    });
})();
