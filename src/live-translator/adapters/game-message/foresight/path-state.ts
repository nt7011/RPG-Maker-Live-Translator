import { createForesightBranchPathCodec } from './branch-path-codec.js';
import { MAX_BRANCH_DEPTH, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND } from './constants.js';
import { createForesightPathHistoryOwner, type ForesightStopTransitionResult } from './path-history-owner.js';
import { createForesightPathSchedulingOwner, type ForesightScanPath } from './path-scheduling-owner.js';
import { createForesightScanFrameCodec } from './scan-frame-codec.js';
export type { ForesightMessageCommandBlock } from './message-block-parser.js';
export type { ForesightReturnStop, ForesightScanPath } from './path-scheduling-owner.js';
interface NestedListsFacade {
    readonly createScanFrame: (options?: unknown) => unknown;
}
interface BudgetFacade {
    readonly createBudgetState: (remaining: unknown, initial: unknown) => unknown;
}
export interface ForesightPathStateDependencies {
    readonly nestedLists: NestedListsFacade;
    readonly budget: BudgetFacade;
}
export interface ForesightPathStateParts {
    sortBlocksForPriority(blocks: unknown): void;
    attachPathContextToBlock(block: unknown, path: unknown, scan: unknown): unknown;
    createScanPath(options?: unknown): ForesightScanPath;
    createBranchScanPath(parentPath: unknown, parentFrame: unknown, target: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown, metadata: unknown): ForesightScanPath;
    cloneScanFrames(frames: unknown): unknown[];
    createScanFrameIdentity(frames: unknown, identifyListIdentity: (identity: unknown) => string): string | null;
    getPathIndex(path: unknown): number;
    isFrameExhausted(frame: unknown): boolean;
    hasVisitedPathPosition(path: unknown, frame: unknown, index: unknown): boolean;
    rememberPathPosition(path: unknown, frame: unknown, index: unknown): void;
    mergeVisitedPathPositions(target: unknown, source: unknown): void;
    stopScanPath(path: unknown, scan: unknown, stopReason: unknown, index: unknown): ForesightStopTransitionResult;
    appendScanStopReason(scan: unknown, stopReason: unknown): void;
    isBarrierStopReason(stopReason: unknown): boolean;
    compareNumbers(left: unknown, right: unknown): number;
    compareBranchPaths(left: unknown, right: unknown): number;
}
function positiveBoundary(value: unknown, defaultValue: number): number {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : defaultValue;
}
export function createForesightPathState(dependencies: ForesightPathStateDependencies): ForesightPathStateParts {
    const { createScanFrame } = dependencies.nestedLists;
    const { createBudgetState } = dependencies.budget;
    const nestedDepth = positiveBoundary(MAX_NESTED_LIST_DEPTH, 1);
    const nestedWidth = positiveBoundary(MAX_NESTED_LISTS_PER_COMMAND, 1);
    const branchDepth = positiveBoundary(MAX_BRANCH_DEPTH, 1);
    const frameDepthBudget = nestedDepth + branchDepth + 1;
    const frameWorkBudget = (frameDepthBudget + 1) * (nestedWidth + 1);
    const branchPaths = createForesightBranchPathCodec(branchDepth);
    const frameCodec = createForesightScanFrameCodec(createScanFrame, {
        maxDepth: frameDepthBudget,
        maxWork: frameWorkBudget,
    });
    const history = createForesightPathHistoryOwner({ branchPaths });
    const scheduling = createForesightPathSchedulingOwner({
        branchPaths,
        frames: frameCodec,
        createScanFrame,
        createBudgetState,
    });
    const { sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, getPathIndex, isFrameExhausted, compareNumbers, } = scheduling;
    const { hasVisitedPathPosition, rememberPathPosition, mergeVisitedPathPositions, stopScanPath, appendScanStopReason, isBarrierStopReason, } = history;
    const cloneScanFrames = frameCodec.cloneFrames;
    const createScanFrameIdentity = frameCodec.createIdentity;
    const compareBranchPaths = branchPaths.compare;
    return Object.freeze({
        sortBlocksForPriority,
        attachPathContextToBlock,
        createScanPath,
        createBranchScanPath,
        cloneScanFrames,
        createScanFrameIdentity,
        getPathIndex,
        isFrameExhausted,
        hasVisitedPathPosition,
        rememberPathPosition,
        mergeVisitedPathPositions,
        stopScanPath,
        appendScanStopReason,
        isBarrierStopReason,
        compareNumbers,
        compareBranchPaths,
    });
}
