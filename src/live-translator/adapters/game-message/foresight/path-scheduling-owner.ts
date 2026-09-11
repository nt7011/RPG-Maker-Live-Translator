import type { ForesightBranchPathCodec, ForesightBranchPathValue } from './branch-path-codec.js';
import type { ForesightScanFrameCodec } from './scan-frame-codec.js';
interface PriorityBlockCandidate {
    readonly returnPriority?: unknown;
    readonly priorityDistance?: unknown;
    readonly branchDepth?: unknown;
    readonly branchPath?: unknown;
    readonly scanSequence?: unknown;
}
interface SortableBlocksCandidate {
    sort(compareFunction: (left: PriorityBlockCandidate, right: PriorityBlockCandidate) => number): unknown;
}
interface MutablePathBlock {
    priorityDistance: unknown;
    branchDepth: unknown;
    branchPath: unknown;
    returnPriority: unknown;
    scanSequence: unknown;
}
interface ScanPathOptionsCandidate {
    readonly frames?: unknown;
    readonly budget?: unknown;
    readonly messageDistance?: unknown;
    readonly returnPriority?: unknown;
    readonly branchDepth?: unknown;
    readonly branchPath?: unknown;
    readonly returnStops?: unknown;
    readonly returnGuards?: unknown;
}
interface MutableScanPathCandidate extends ScanPathOptionsCandidate {
    done?: unknown;
}
interface ScanFrameCandidate {
    readonly listGeneration?: unknown;
    readonly listIdentity?: unknown;
    readonly listLength?: unknown;
    index?: unknown;
    readonly endIndex?: unknown;
    readonly interpreterId?: unknown;
    readonly listId?: unknown;
}
interface BranchTargetCandidate {
    readonly joinIndex?: unknown;
    readonly ownerIndex?: unknown;
    readonly startIndex?: unknown;
    readonly endIndex?: unknown;
    readonly bodyIndent?: unknown;
    readonly label?: unknown;
}
interface MetadataCandidate {
    readonly code?: unknown;
}
interface ScanStateCandidate {
    blockSequence?: unknown;
}
interface ReturnStopCandidate {
    readonly depth?: unknown;
    readonly guardId?: unknown;
}
export interface ForesightReturnStop {
    readonly depth: number;
    readonly guardId: number;
}
export interface ForesightScanPath {
    frames: unknown[];
    budget: unknown;
    messageDistance: number;
    returnPriority: number;
    branchDepth: number;
    branchPath: ForesightBranchPathValue[];
    returnStops: ForesightReturnStop[];
    returnGuards: number[];
    done: boolean;
}
export interface ForesightPathSchedulingOwner {
    readonly sortBlocksForPriority: (blocks: unknown) => void;
    readonly attachPathContextToBlock: (block: unknown, path: unknown, scan: unknown) => unknown;
    readonly createScanPath: (options?: unknown) => ForesightScanPath;
    readonly createBranchScanPath: (parentPath: unknown, parentFrame: unknown, target: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown, metadata: unknown) => ForesightScanPath;
    readonly getPathIndex: (path: unknown) => number;
    readonly isFrameExhausted: (frame: unknown) => boolean;
    readonly compareNumbers: (left: unknown, right: unknown) => number;
}
export interface ForesightPathSchedulingDependencies {
    readonly branchPaths: ForesightBranchPathCodec;
    readonly frames: ForesightScanFrameCodec;
    readonly createScanFrame: (options?: unknown) => unknown;
    readonly createBudgetState: (remaining: unknown, initial: unknown) => unknown;
}
function normalizedNonNegativeInteger(value: unknown): number {
    return Math.max(0, Math.floor(Number(value) || 0));
}
function identifierText(value: unknown): string {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean')
        return String(value);
    return '';
}
function cloneReturnStops(stops: unknown): ForesightReturnStop[] {
    if (!Array.isArray(stops))
        return [];
    return stops
        .map((stop: unknown) => {
        const source = stop as ReturnStopCandidate | null | undefined;
        return {
            depth: normalizedNonNegativeInteger(source ? source.depth : source),
            guardId: normalizedNonNegativeInteger(source ? source.guardId : source),
        };
    })
        .filter((stop) => stop.depth > 0 && stop.guardId > 0);
}
function cloneIntegerList(values: unknown): number[] {
    if (!Array.isArray(values))
        return [];
    return values.map(normalizedNonNegativeInteger).filter((value) => value > 0);
}
function attachHiddenArray(target: unknown, propertyName: PropertyKey, values: unknown): void {
    if (!target || !Array.isArray(values) || values.length === 0)
        return;
    const copy = cloneIntegerList(values);
    if (copy.length === 0)
        return;
    Object.defineProperty(target, propertyName, {
        value: copy,
        enumerable: false,
        configurable: true,
    });
}
export function createForesightPathSchedulingOwner(dependencies: ForesightPathSchedulingDependencies): ForesightPathSchedulingOwner {
    const { branchPaths, frames, createScanFrame, createBudgetState } = dependencies;
    function compareNumbers(left: unknown, right: unknown): number {
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        const a = Number.isFinite(leftNumber) ? leftNumber : 0;
        const b = Number.isFinite(rightNumber) ? rightNumber : 0;
        return a === b ? 0 : a < b ? -1 : 1;
    }
    function sortBlocksForPriority(blocks: unknown): void {
        (blocks as SortableBlocksCandidate).sort((left, right) => {
            const returnPriority = compareNumbers(left.returnPriority, right.returnPriority);
            if (returnPriority !== 0)
                return returnPriority;
            const distance = compareNumbers(left.priorityDistance, right.priorityDistance);
            if (distance !== 0)
                return distance;
            const depth = compareNumbers(left.branchDepth, right.branchDepth);
            if (depth !== 0)
                return depth;
            const branchPath = branchPaths.compare(left.branchPath, right.branchPath);
            if (branchPath !== 0)
                return branchPath;
            return compareNumbers(left.scanSequence, right.scanSequence);
        });
    }
    function attachPathContextToBlock(block: unknown, path: unknown, scan: unknown): unknown {
        const target = block as MutablePathBlock;
        const pathSource = path as MutableScanPathCandidate;
        const scanSource = scan as ScanStateCandidate;
        const branchPath = pathSource.branchPath;
        const blockSequence = scanSource.blockSequence;
        target.priorityDistance = normalizedNonNegativeInteger(pathSource.messageDistance);
        target.branchDepth = normalizedNonNegativeInteger(pathSource.branchDepth);
        target.branchPath = branchPaths.copy(branchPath);
        target.returnPriority = normalizedNonNegativeInteger(pathSource.returnPriority);
        attachHiddenArray(block, '__returnGuards', pathSource.returnGuards);
        target.scanSequence = blockSequence;
        scanSource.blockSequence = (blockSequence as number) + 1;
        return block;
    }
    function createScanPath(options: unknown = {}): ForesightScanPath {
        const source = (options ?? {}) as ScanPathOptionsCandidate;
        const frameCandidates = source.frames;
        const budgetCandidate = source.budget;
        const path: ForesightScanPath = {
            frames: Array.isArray(frameCandidates) ? frameCandidates.slice() : [],
            budget: budgetCandidate ?? createBudgetState(0, 0),
            messageDistance: normalizedNonNegativeInteger(source.messageDistance),
            returnPriority: normalizedNonNegativeInteger(source.returnPriority),
            branchDepth: normalizedNonNegativeInteger(source.branchDepth),
            branchPath: branchPaths.copy(source.branchPath),
            returnStops: cloneReturnStops(source.returnStops),
            returnGuards: cloneIntegerList(source.returnGuards),
            done: false,
        };
        return path;
    }
    function createBranchScanPath(parentPath: unknown, parentFrame: unknown, target: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown, metadata: unknown): ForesightScanPath {
        const parentPathSource = parentPath as MutableScanPathCandidate;
        const parentFrameSource = parentFrame as ScanFrameCandidate;
        const targetSource = target as BranchTargetCandidate;
        const metadataSource = metadata as MetadataCandidate | null | undefined;
        const parentFrameCandidates = parentPathSource.frames;
        const parentBranchPath = parentPathSource.branchPath;
        const parentBranchDepth = normalizedNonNegativeInteger(parentPathSource.branchDepth);
        const parentFrames = frames.cloneFrames(parentFrameCandidates);
        const parentResume = parentFrames[parentFrames.length - 1] as ScanFrameCandidate | null | undefined;
        if (parentResume)
            parentResume.index = targetSource.joinIndex;
        const canonicalBranchIndex = branchPaths.normalizeIndex(branchIndex);
        const branchPath = branchPaths.append(parentBranchPath, canonicalBranchIndex);
        const interpreterCandidate = parentFrameSource.interpreterId;
        const listIdCandidate = parentFrameSource.listId;
        const interpreterId = identifierText(interpreterCandidate) || identifierText(listIdCandidate) || 'event';
        const listId = identifierText(listIdCandidate) || identifierText(interpreterCandidate) || 'event';
        parentFrames.push(createScanFrame({
            listGeneration: parentFrameSource.listGeneration,
            listIdentity: parentFrameSource.listIdentity,
            listLength: parentFrameSource.listLength,
            index: targetSource.startIndex,
            endIndex: targetSource.endIndex,
            expectedIndent: targetSource.bodyIndent,
            interpreterId,
            listId,
            parentInterpreterId: interpreterCandidate,
            parentListId: listIdCandidate,
            parentCommandIndex: targetSource.ownerIndex,
            parentCommandCode: Number(metadataSource ? metadataSource.code : metadataSource),
            branchLabel: targetSource.label,
            branchIndex: canonicalBranchIndex,
            branchCount,
            resumeBranchDepth: parentBranchDepth,
            resumeBranchPath: branchPaths.copy(parentBranchPath),
        }));
        return createScanPath({
            frames: parentFrames,
            budget: createBudgetState(allocation, allocation),
            messageDistance: parentPathSource.messageDistance,
            returnPriority: parentPathSource.returnPriority,
            branchDepth: parentBranchDepth + 1,
            branchPath,
            returnStops: parentPathSource.returnStops,
            returnGuards: parentPathSource.returnGuards,
        });
    }
    function getPathIndex(path: unknown): number {
        const source = path as MutableScanPathCandidate | null | undefined;
        const frameCandidates = source ? source.frames : source;
        const frameList = Array.isArray(frameCandidates) ? frameCandidates : [];
        const frame = frameList[frameList.length - 1] as ScanFrameCandidate | null | undefined;
        if (!frame)
            return 0;
        const index = Number(frame.index);
        return Number.isFinite(index) ? index : 0;
    }
    function isFrameExhausted(frame: unknown): boolean {
        const source = frame as ScanFrameCandidate | null | undefined;
        if (!source)
            return true;
        const listLength = Number(source.listLength);
        if (!Number.isSafeInteger(listLength) || listLength < 0)
            return true;
        const index = Number(source.index);
        if (!Number.isFinite(index) || index < 0 || index >= listLength)
            return true;
        const endIndexValue = source.endIndex;
        if (endIndexValue === null || endIndexValue === undefined)
            return false;
        const endIndex = Number(endIndexValue);
        return Number.isFinite(endIndex) && index >= endIndex;
    }
    return Object.freeze({
        sortBlocksForPriority,
        attachPathContextToBlock,
        createScanPath,
        createBranchScanPath,
        getPathIndex,
        isFrameExhausted,
        compareNumbers,
    });
}
