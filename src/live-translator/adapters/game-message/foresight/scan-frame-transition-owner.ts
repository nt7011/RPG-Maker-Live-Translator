interface ReturnStopCandidate {
    readonly depth?: unknown;
    readonly guardId?: unknown;
}
interface ScanFrameCandidate {
    readonly branchCount?: unknown;
    index?: unknown;
    readonly parentCommandIndex?: unknown;
    readonly resumeBranchDepth?: unknown;
    readonly resumeBranchPath?: unknown;
}
interface ScanPathCandidate {
    branchDepth?: unknown;
    branchPath?: unknown;
    budget?: unknown;
    done?: unknown;
    frames?: unknown;
    messageDistance?: unknown;
    returnGuards?: unknown;
    returnPriority?: unknown;
    returnStops?: unknown;
}
interface MutablePathBranchCandidate {
    branchDepth: unknown;
    branchPath: unknown;
}
interface MutablePathCompletionCandidate {
    done: unknown;
}
interface RequiredFrameBranchCandidate {
    readonly branchCount: unknown;
}
interface RequiredFrameResumeCandidate {
    readonly resumeBranchDepth: unknown;
    readonly resumeBranchPath: unknown;
}
interface RequiredFramesCandidate {
    readonly frames: unknown;
}
export interface ForesightFrameTransitionDependencies {
    readonly finishCurrentFrame: (frames: unknown) => boolean;
    readonly cloneScanFrames: (frames: unknown) => unknown[];
    readonly createScanPath: (options?: unknown) => unknown;
    readonly createBudgetSnapshot: (budget: unknown) => unknown;
}
export interface ForesightFinishedFrameResult {
    readonly finished: boolean;
    readonly shouldYield: boolean;
    readonly stopAfterNestedReturn: boolean;
}
export interface ForesightFrameTransitionOwner {
    readonly finishScanFrame: (path: unknown) => ForesightFinishedFrameResult;
    readonly createNestedContinuationPath: (path: unknown, nextIndex: unknown, guardId: unknown) => unknown;
    readonly addNestedReturnStop: (path: unknown, guardId: unknown) => boolean;
    readonly createReturnGuardId: () => number;
    readonly pathHasAnyReturnStop: (path: unknown) => boolean;
}
function normalizedNonNegativeInteger(value: unknown): number {
    return Math.max(0, Math.floor(Number(value) || 0));
}
export function createForesightFrameTransitionOwner(dependencies: ForesightFrameTransitionDependencies): ForesightFrameTransitionOwner {
    const { finishCurrentFrame, cloneScanFrames, createScanPath, createBudgetSnapshot } = dependencies;
    let nextReturnGuardId = 1;
    function returnStopsOf(path: unknown): unknown[] {
        const pathSource = path as ScanPathCandidate | null | undefined;
        const returnStops = pathSource ? pathSource.returnStops : pathSource;
        return Array.isArray(returnStops) ? (pathSource as {
            readonly returnStops: unknown[];
        }).returnStops : [];
    }
    function isBranchScanFrame(frame: unknown): boolean {
        const source = frame as ScanFrameCandidate | null | undefined;
        return (Number.isFinite(Number(source ? source.branchCount : source)) &&
            Number((source as RequiredFrameBranchCandidate).branchCount) > 0 &&
            Number.isFinite(Number(source ? source.parentCommandIndex : source)));
    }
    function shouldStopAfterNestedReturn(path: unknown): boolean {
        const pathSource = path as ScanPathCandidate | null | undefined;
        const returnStops = returnStopsOf(path);
        if (!returnStops.length || !Array.isArray((pathSource as RequiredFramesCandidate).frames))
            return false;
        const stop = returnStops[returnStops.length - 1] as ReturnStopCandidate | null | undefined;
        if (((pathSource as RequiredFramesCandidate).frames as unknown[]).length !==
            normalizedNonNegativeInteger(stop ? stop.depth : stop)) {
            return false;
        }
        returnStops.pop();
        return true;
    }
    function finishScanFrame(path: unknown): ForesightFinishedFrameResult {
        const pathSource = path as ScanPathCandidate | null | undefined;
        const frame = pathSource && Array.isArray(pathSource.frames)
            ? (pathSource.frames as unknown[])[(pathSource.frames as unknown[]).length - 1]
            : null;
        const frameSource = frame as ScanFrameCandidate | null | undefined;
        const wasBranchFrame = isBranchScanFrame(frame);
        const finished = finishCurrentFrame(pathSource ? pathSource.frames : pathSource);
        const stopAfterNestedReturn = finished && !wasBranchFrame && shouldStopAfterNestedReturn(path);
        if (stopAfterNestedReturn)
            (pathSource as MutablePathCompletionCandidate).done = true;
        if (finished && wasBranchFrame) {
            (pathSource as MutablePathBranchCandidate).branchDepth = Number.isFinite(Number(frameSource ? frameSource.resumeBranchDepth : frameSource))
                ? Math.max(0, Math.floor(Number((frameSource as RequiredFrameResumeCandidate).resumeBranchDepth)))
                : Math.max(0, (Number((pathSource as MutablePathBranchCandidate).branchDepth) || 0) - 1);
            (pathSource as MutablePathBranchCandidate).branchPath = Array.isArray((frameSource as RequiredFrameResumeCandidate).resumeBranchPath)
                ? ((frameSource as RequiredFrameResumeCandidate).resumeBranchPath as unknown[]).slice()
                : Array.isArray((pathSource as MutablePathBranchCandidate).branchPath)
                    ? ((pathSource as MutablePathBranchCandidate).branchPath as unknown[]).slice(0, -1)
                    : [];
        }
        return {
            finished,
            stopAfterNestedReturn,
            shouldYield: finished && wasBranchFrame,
        };
    }
    function createNestedContinuationPath(path: unknown, nextIndex: unknown, guardId: unknown): unknown {
        const pathSource = path as ScanPathCandidate | null | undefined;
        const frames = cloneScanFrames(pathSource ? pathSource.frames : pathSource);
        const frame = frames[frames.length - 1] as ScanFrameCandidate | null | undefined;
        if (!frame || !Number.isFinite(Number(nextIndex)))
            return null;
        const budget = createBudgetSnapshot(pathSource ? pathSource.budget : pathSource);
        if (!budget)
            return null;
        const returnGuards = Array.isArray(pathSource?.returnGuards) ? pathSource.returnGuards.slice() : [];
        returnGuards.push(guardId);
        frame.index = Math.max(0, Math.floor(Number(nextIndex)));
        return createScanPath({
            frames,
            budget,
            messageDistance: pathSource?.messageDistance,
            returnPriority: normalizedNonNegativeInteger(pathSource ? pathSource.returnPriority : pathSource) + 1,
            branchDepth: pathSource?.branchDepth,
            branchPath: pathSource?.branchPath,
            returnStops: pathSource?.returnStops,
            returnGuards,
        });
    }
    function addNestedReturnStop(path: unknown, guardId: unknown): boolean {
        const pathSource = path as ScanPathCandidate | null | undefined;
        if (!pathSource || !Array.isArray(pathSource.frames))
            return false;
        const id = normalizedNonNegativeInteger(guardId);
        if (!id)
            return false;
        if (!Array.isArray(pathSource.returnStops))
            pathSource.returnStops = [];
        (pathSource.returnStops as unknown[]).push({ depth: pathSource.frames.length, guardId: id });
        return true;
    }
    function createReturnGuardId(): number {
        if (!Number.isSafeInteger(nextReturnGuardId)) {
            throw new RangeError('[Foresight] Return-guard sequence exhausted.');
        }
        const guardId = nextReturnGuardId;
        nextReturnGuardId += 1;
        return guardId;
    }
    function pathHasAnyReturnStop(path: unknown): boolean {
        return returnStopsOf(path).some((stop: unknown) => normalizedNonNegativeInteger(stop && (stop as ReturnStopCandidate).guardId) > 0);
    }
    return Object.freeze({
        finishScanFrame,
        createNestedContinuationPath,
        addNestedReturnStop,
        createReturnGuardId,
        pathHasAnyReturnStop,
    });
}
