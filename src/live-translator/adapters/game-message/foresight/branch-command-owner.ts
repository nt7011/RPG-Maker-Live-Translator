type PropertyBag = Record<PropertyKey, unknown>;
interface BudgetCandidate extends PropertyBag {
    readonly remaining?: unknown;
}
interface BranchReadCandidate {
    readonly branches?: unknown;
    readonly controlFlowTarget?: unknown;
    readonly joinIndex?: unknown;
    readonly stopReason?: unknown;
    readonly targets?: unknown;
    readonly transparent?: unknown;
}
interface BranchTargetCandidate {
    readonly endIndex?: unknown;
    readonly joinIndex?: unknown;
    readonly label?: unknown;
    readonly startIndex?: unknown;
}
interface ScanFrameCandidate {
    readonly expectedIndent?: unknown;
    readonly listGeneration?: unknown;
}
interface ScanCommandFacts {
    readonly index: number;
    readonly command: Readonly<Record<PropertyKey, unknown>>;
    readonly metadata: Readonly<object>;
}
interface ScanStateCandidate {
    scannedCommands?: unknown;
}
interface ScanPathCandidate {
    readonly branchDepth?: unknown;
    readonly budget?: unknown;
    done?: unknown;
}
function truthyOr<Value, Default>(value: Value, defaultValue: Default): Value | Default {
    return value ? value : defaultValue;
}
export interface ForesightBranchCommandDependencies {
    readonly maxBranchDepth: number;
    readonly readBranchCommand: (session: unknown, generation: unknown, current: ScanCommandFacts, expectedIndent: number) => unknown;
    readonly splitBudgetAcrossBranches: (remaining: unknown, branchCount: unknown) => unknown[];
    readonly captureDiagnosticActionBudget: (scan: unknown, budget: unknown) => unknown;
    readonly recordDiagnosticAction: (scan: unknown, path: unknown, createAction: () => unknown) => unknown;
    readonly createActionBudgetSnapshot: (before: unknown, after: unknown, cost: unknown) => unknown;
    readonly createFrameListContext: (frame: unknown) => unknown;
    readonly captureDiagnosticConsumedCommands: (scan: unknown, generation: unknown, startIndex: unknown, endIndex: unknown) => unknown;
    readonly stopScanPath: (path: unknown, scan: unknown, reason: unknown, index: unknown) => unknown;
    readonly createBranchBudgetSnapshot: (budget: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown) => unknown;
    readonly appendScanStopReason: (scan: unknown, reason: unknown) => unknown;
    readonly createBranchScanPath: (path: unknown, frame: unknown, target: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown, metadata: unknown) => unknown;
}
export interface ForesightBranchCommandOwner {
    readonly scanBranchCommand: (session: unknown, path: unknown, scan: unknown, frame: unknown, current: ScanCommandFacts, metadata: unknown) => unknown;
}
export function createForesightBranchCommandOwner(dependencies: ForesightBranchCommandDependencies): ForesightBranchCommandOwner {
    const { maxBranchDepth, readBranchCommand, splitBudgetAcrossBranches, captureDiagnosticActionBudget, recordDiagnosticAction, createActionBudgetSnapshot, createFrameListContext, captureDiagnosticConsumedCommands, stopScanPath, createBranchBudgetSnapshot, appendScanStopReason, createBranchScanPath, } = dependencies;
    function scanBranchCommand(session: unknown, path: unknown, scan: unknown, frame: unknown, current: ScanCommandFacts, metadata: unknown): unknown {
        const pathSource = path as ScanPathCandidate;
        const scanSource = scan as ScanStateCandidate;
        const frameSource = frame as ScanFrameCandidate;
        const index = current.index;
        if ((pathSource.branchDepth as number) >= maxBranchDepth) {
            scanSource.scannedCommands = (scanSource.scannedCommands as number) + 1;
            recordDiagnosticAction(scan, path, () => ({
                index,
                metadata,
                action: 'barrier',
                stopReason: 'branch-depth-limit',
                listContext: createFrameListContext(frame),
                consumedCommands: captureDiagnosticConsumedCommands(scan, frameSource.listGeneration, index, index + 1),
            }));
            return stopScanPath(path, scan, 'branch-depth-limit', index);
        }
        const branchRead = readBranchCommand(session, frameSource.listGeneration, current, Number(frameSource.expectedIndent)) as BranchReadCandidate;
        const budgetBefore = captureDiagnosticActionBudget(scan, pathSource.budget);
        scanSource.scannedCommands = (scanSource.scannedCommands as number) + 1;
        if (!branchRead.transparent) {
            recordDiagnosticAction(scan, path, () => ({
                index,
                metadata,
                action: branchRead.stopReason === 'control-flow-target' ? 'control-flow' : 'barrier',
                stopReason: branchRead.stopReason,
                budget: createActionBudgetSnapshot(budgetBefore, budgetBefore, 0),
                listContext: createFrameListContext(frame),
                branches: truthyOr(branchRead.branches, []),
                controlFlowTarget: branchRead.controlFlowTarget,
                consumedCommands: captureDiagnosticConsumedCommands(scan, frameSource.listGeneration, index, index + 1),
            }));
            return stopScanPath(path, scan, branchRead.stopReason, index);
        }
        const targetValue = branchRead.targets;
        if (!Array.isArray(targetValue)) {
            throw new TypeError('[Foresight] Branch targets must be an array.');
        }
        const targets = targetValue.slice();
        const targetCount = targets.length;
        const allocations = splitBudgetAcrossBranches(pathSource.budget && (pathSource.budget as BudgetCandidate).remaining, targetCount);
        recordDiagnosticAction(scan, path, () => ({
            index,
            metadata,
            action: 'branch',
            budget: createActionBudgetSnapshot(budgetBefore, budgetBefore, 0),
            listContext: createFrameListContext(frame),
            branches: targets.map((target: unknown, branchIndex: number) => {
                const targetSource = target as BranchTargetCandidate;
                const allocation = truthyOr(allocations[branchIndex], 0);
                return {
                    label: targetSource.label,
                    startIndex: targetSource.startIndex,
                    endIndex: targetSource.endIndex,
                    joinIndex: targetSource.joinIndex,
                    budget: createBranchBudgetSnapshot(pathSource.budget, allocation, branchIndex, targetCount),
                    actions: [],
                };
            }),
            consumedCommands: captureDiagnosticConsumedCommands(scan, frameSource.listGeneration, index, index + 1),
        }));
        const newPaths: unknown[] = [];
        targets.forEach((target: unknown, branchIndex: number) => {
            const allocation = truthyOr(allocations[branchIndex], 0);
            if ((allocation as number) <= 0) {
                appendScanStopReason(scan, 'budget-limit');
                return;
            }
            newPaths.push(createBranchScanPath(path, frame, target, allocation, branchIndex, targetCount, metadata));
        });
        pathSource.done = true;
        return { requeue: false, newPaths, index: branchRead.joinIndex };
    }
    return Object.freeze({ scanBranchCommand });
}
