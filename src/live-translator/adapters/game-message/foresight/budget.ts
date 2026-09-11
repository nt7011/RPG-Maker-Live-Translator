import { BRANCH_BUDGET_STRATEGY, DEFAULT_BUDGET, MESSAGE_BUDGET_COST } from './constants.js';
import { nonEmptyString, positiveInteger } from './utils.js';
type PropertyBag = Record<PropertyKey, unknown>;
export interface BudgetState {
    initial: number;
    limit: number;
    messageLimit: number;
    spent: number;
    remaining: number;
    messageCost: number;
    branchStrategy: string;
}
export interface MutableBudget {
    spent?: unknown;
    remaining?: unknown;
}
export interface ActionBudgetSnapshot {
    before: BudgetState | null;
    after: BudgetState | null;
    cost: number;
}
export interface BranchBudgetSnapshot {
    initial: number;
    limit: number;
    spent: number;
    remaining: number;
    parentRemaining: number;
    branchIndex: unknown;
    branchCount: unknown;
    branchStrategy: 'even-split';
}
export interface ForesightBudgetParts {
    createBudgetState(value: unknown, maxMessages: unknown): BudgetState;
    hasBudgetRemaining(budget: unknown): boolean;
    spendBudget(budget: MutableBudget | null | undefined, amount: unknown): number;
    createBudgetSnapshot(budget: unknown): BudgetState | null;
    createActionBudgetSnapshot(before: unknown, after: unknown, cost: unknown): ActionBudgetSnapshot;
    createBranchBudgetSnapshot(parentBudget: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown): BranchBudgetSnapshot;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
export function createBudgetState(value: unknown, maxMessages: unknown): BudgetState {
    const numericValue = Number(value);
    const initial = Number.isInteger(numericValue) && numericValue >= 0 ? numericValue : DEFAULT_BUDGET;
    const numericMessageLimit = Number(maxMessages);
    const messageLimit = Number.isInteger(numericMessageLimit) && numericMessageLimit >= 0 ? numericMessageLimit : initial;
    const limit = initial;
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
export function hasBudgetRemaining(budget: unknown): boolean {
    return Boolean(budget && Number(propertyValue(budget, 'remaining')) > 0);
}
export function spendBudget(budget: MutableBudget | null | undefined, amount: unknown): number {
    if (!budget)
        return 0;
    const requested = positiveInteger(amount, MESSAGE_BUDGET_COST);
    const spent = Math.min(Number(budget.remaining) || 0, requested);
    budget.spent = (Number(budget.spent) || 0) + spent;
    budget.remaining = Math.max(0, (Number(budget.remaining) || 0) - spent);
    return spent;
}
export function createBudgetSnapshot(budget: unknown): BudgetState | null {
    if (!budget || typeof budget !== 'object')
        return null;
    return {
        initial: Math.max(0, Math.floor(Number(propertyValue(budget, 'initial')) || 0)),
        limit: Math.max(0, Math.floor(Number(propertyValue(budget, 'limit')) || 0)),
        messageLimit: Math.max(0, Math.floor(Number(propertyValue(budget, 'messageLimit')) || 0)),
        spent: Math.max(0, Math.floor(Number(propertyValue(budget, 'spent')) || 0)),
        remaining: Math.max(0, Math.floor(Number(propertyValue(budget, 'remaining')) || 0)),
        messageCost: Math.max(1, Math.floor(Number(propertyValue(budget, 'messageCost')) || MESSAGE_BUDGET_COST)),
        branchStrategy: nonEmptyString(propertyValue(budget, 'branchStrategy')) || BRANCH_BUDGET_STRATEGY,
    };
}
export function createActionBudgetSnapshot(before: unknown, after: unknown, cost: unknown): ActionBudgetSnapshot {
    return {
        before: createBudgetSnapshot(before),
        after: createBudgetSnapshot(after),
        cost: Math.max(0, Math.floor(Number(cost) || 0)),
    };
}
export function createBranchBudgetSnapshot(parentBudget: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown): BranchBudgetSnapshot {
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
export const foresightBudget: ForesightBudgetParts = Object.freeze({
    createBudgetState,
    hasBudgetRemaining,
    spendBudget,
    createBudgetSnapshot,
    createActionBudgetSnapshot,
    createBranchBudgetSnapshot,
});
