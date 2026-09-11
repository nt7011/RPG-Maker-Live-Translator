import type { MutableBudget } from './budget.js';
import { admitForesightRecord, finiteNumber, readForesightDescriptorValue } from './utils.js';
type PropertyBag = Record<PropertyKey, unknown>;
interface CommandActionCandidate extends PropertyBag {
    listContext?: unknown;
}
interface CommandMetadataCandidate {
    readonly classification?: unknown;
    readonly code?: unknown;
    readonly label?: unknown;
    readonly scanBehavior?: unknown;
}
interface CommandReadCandidate {
    readonly consumedCommands?: unknown;
    readonly frame?: unknown;
    readonly frames?: unknown;
    readonly kind?: unknown;
    readonly metadata?: unknown;
    readonly nestedList?: unknown;
    readonly nestedLists?: unknown;
    readonly nextIndex?: unknown;
    readonly routeBarrierCode?: unknown;
    readonly routeBarrierLabel?: unknown;
    readonly routeBarrierReason?: unknown;
    readonly routeCommandActions?: unknown;
    readonly stopReason?: unknown;
    readonly transparent?: unknown;
}
interface EventCommandCandidate {
    readonly code?: unknown;
    readonly indent?: unknown;
}
interface CapturedEventCommand {
    readonly command: EventCommandCandidate;
    readonly code: unknown;
    readonly indent: number;
}
interface ScanCommandFacts {
    readonly index: number;
    readonly command: Readonly<Record<PropertyKey, unknown>>;
    readonly metadata: Readonly<object>;
}
interface FinishedFrameResult {
    readonly finished: boolean;
    readonly shouldYield: boolean;
    readonly stopAfterNestedReturn: boolean;
}
interface MessageBlockCandidate {
    complete?: unknown;
    foresightBudget?: unknown;
    nextIndex?: unknown;
    rawText?: unknown;
    rejected?: unknown;
    stopReason?: unknown;
}
interface ScanFrameCandidate {
    index?: unknown;
    expectedIndent?: unknown;
    readonly interpreterId?: unknown;
    readonly listGeneration?: unknown;
    readonly listLength?: unknown;
}
interface ScanStateCandidate {
    advancedCommands?: unknown;
    blocks?: unknown;
    budget?: unknown;
    scannedCommands?: unknown;
}
interface ScanPathCandidate {
    budget?: MutableBudget | null;
    frames?: unknown;
    messageDistance?: unknown;
}
function truthyOr<Value, Default>(value: Value, defaultValue: Default): Value | Default {
    return value ? value : defaultValue;
}
function truthyOrElse<Value, Default>(value: Value, createDefault: () => Default): Value | Default {
    return value ? value : createDefault();
}
function captureEventCommand(command: unknown): CapturedEventCommand | null {
    const admitted = admitForesightRecord(command);
    if (!admitted)
        return null;
    const codeDescriptor = admitted.descriptors['code'];
    const indentDescriptor = admitted.descriptors['indent'];
    if ((codeDescriptor && !('value' in codeDescriptor)) || (indentDescriptor && !('value' in indentDescriptor))) {
        return null;
    }
    const code = readForesightDescriptorValue(admitted.receiver, codeDescriptor);
    if (code !== null &&
        code !== undefined &&
        typeof code !== 'number' &&
        typeof code !== 'string' &&
        typeof code !== 'boolean' &&
        typeof code !== 'bigint') {
        return null;
    }
    const rawIndent = readForesightDescriptorValue(admitted.receiver, indentDescriptor);
    const indent = rawIndent === undefined ? 0 : finiteNumber(rawIndent);
    if (indent === null)
        return null;
    return Object.freeze({ command: command as EventCommandCandidate, code, indent });
}
export interface ForesightScanPathTransitionDependencies {
    readonly messageBudgetCost: number;
    readonly getPathIndex: (path: unknown) => number;
    readonly pathHasAnyReturnStop: (path: unknown) => boolean;
    readonly hasBudgetRemaining: (budget: unknown) => boolean;
    readonly stopScanPath: (path: unknown, scan: unknown, reason: unknown, index: unknown) => unknown;
    readonly isFrameExhausted: (frame: unknown) => boolean;
    readonly finishScanFrame: (path: unknown) => FinishedFrameResult;
    readonly getScanSession: (scan: unknown) => unknown;
    readonly readScanCommand: (session: unknown, generation: unknown, index: unknown) => ScanCommandFacts | null;
    readonly hasVisitedPathPosition: (path: unknown, frame: unknown, index: unknown) => boolean;
    readonly rememberPathPosition: (path: unknown, frame: unknown, index: unknown) => void;
    readonly recordDiagnosticAction: (scan: unknown, path: unknown, createAction: () => unknown, options?: unknown) => unknown;
    readonly createFrameListContext: (frame: unknown) => unknown;
    readonly parseMessageCommandBlock: (session: unknown, generation: unknown, startIndex: unknown, interpreterId: unknown, commandAllowance: unknown) => unknown;
    readonly attachFrameContextToBlock: (block: unknown, frame: unknown) => unknown;
    readonly attachPathContextToBlock: (block: unknown, path: unknown, scan: unknown) => unknown;
    readonly captureDiagnosticActionBudget: (scan: unknown, budget: unknown, options?: unknown) => unknown;
    readonly spendBudget: (budget: MutableBudget | null | undefined, cost: unknown) => unknown;
    readonly createBudgetSnapshot: (budget: unknown) => unknown;
    readonly createActionBudgetSnapshot: (before: unknown, after: unknown, cost: unknown) => unknown;
    readonly captureDiagnosticConsumedCommands: (scan: unknown, generation: unknown, startIndex: unknown, endIndex: unknown, options?: unknown) => unknown;
    readonly captureDiagnosticBlock: (scan: unknown, block: unknown) => void;
    readonly scanBranchCommand: (session: unknown, path: unknown, scan: unknown, frame: unknown, current: ScanCommandFacts, metadata: unknown) => unknown;
    readonly readNestedListCommand: (session: unknown, generation: unknown, current: ScanCommandFacts, frames: unknown) => unknown;
    readonly recordDiagnosticCode: (scan: unknown, category: unknown, code: unknown, label?: unknown) => void;
    readonly hasStalenessRisk: (metadata: unknown) => boolean;
    readonly createReturnGuardId: () => number;
    readonly createNestedContinuationPath: (path: unknown, nextIndex: unknown, guardId: unknown) => unknown;
    readonly addNestedReturnStop: (path: unknown, guardId: unknown) => boolean;
    readonly pushNestedFrames: (frames: unknown, nestedFrames: unknown, parentFrame: unknown) => boolean;
    readonly readTransparentCommand: (session: unknown, generation: unknown, current: ScanCommandFacts, expectedIndent: unknown, frames: unknown) => unknown;
}
export interface ForesightScanPathTransitionOwner {
    readonly scanPathUntilYield: (path: unknown, scan: unknown, blocks: unknown, maxMessages: unknown, maxScanCommands: unknown) => unknown;
}
export function createForesightScanPathTransitionOwner(dependencies: ForesightScanPathTransitionDependencies): ForesightScanPathTransitionOwner {
    const { messageBudgetCost, getPathIndex, pathHasAnyReturnStop, hasBudgetRemaining, stopScanPath, isFrameExhausted, finishScanFrame, getScanSession, readScanCommand, hasVisitedPathPosition, rememberPathPosition, recordDiagnosticAction, createFrameListContext, parseMessageCommandBlock, attachFrameContextToBlock, attachPathContextToBlock, captureDiagnosticActionBudget, spendBudget, createBudgetSnapshot, createActionBudgetSnapshot, captureDiagnosticConsumedCommands, captureDiagnosticBlock, scanBranchCommand, readNestedListCommand, recordDiagnosticCode, hasStalenessRisk, createReturnGuardId, createNestedContinuationPath, addNestedReturnStop, pushNestedFrames, readTransparentCommand, } = dependencies;
    function scanPathUntilYield(path: unknown, scan: unknown, blocks: unknown, maxMessages: unknown, maxScanCommands: unknown): unknown {
        const pathSource = path as ScanPathCandidate;
        const scanSource = scan as ScanStateCandidate;
        const blockList = blocks as MessageBlockCandidate[];
        const scanSession = getScanSession(scan);
        let index: unknown = getPathIndex(path);
        if (!scanSession || typeof scanSession !== 'object') {
            return stopScanPath(path, scan, 'missing-command', index);
        }
        while ((pathSource.frames as unknown[]).length &&
            (scanSource.scannedCommands as number) < (maxScanCommands as number) &&
            (blockList.length < (maxMessages as number) || pathHasAnyReturnStop(path)) &&
            hasBudgetRemaining(pathSource.budget)) {
            const frame = (pathSource.frames as unknown[])[(pathSource.frames as unknown[]).length - 1] as ScanFrameCandidate | null | undefined;
            if (!frame?.listGeneration || typeof frame.listGeneration !== 'object') {
                return stopScanPath(path, scan, 'missing-command', index);
            }
            index = frame.index;
            if (isFrameExhausted(frame)) {
                const finished = finishScanFrame(path);
                if (finished.finished) {
                    if (finished.stopAfterNestedReturn)
                        return { requeue: false, index: getPathIndex(path) };
                    if (finished.shouldYield)
                        return { requeue: true, index: getPathIndex(path) };
                    continue;
                }
                return stopScanPath(path, scan, 'event-end', index);
            }
            const current = readScanCommand(scanSession, frame.listGeneration, index);
            if (!current)
                return stopScanPath(path, scan, 'missing-command', index);
            const capturedCommand = captureEventCommand(current.command);
            if (!capturedCommand)
                return stopScanPath(path, scan, 'missing-command', index);
            const commandIndent = capturedCommand.indent;
            if (frame.expectedIndent === null)
                frame.expectedIndent = commandIndent;
            if (commandIndent !== frame.expectedIndent) {
                return stopScanPath(path, scan, 'indent-boundary', index);
            }
            const metadata = current.metadata as CommandMetadataCandidate;
            const code = metadata.code;
            if (hasVisitedPathPosition(path, frame, index)) {
                return stopScanPath(path, scan, 'path-cycle', index);
            }
            rememberPathPosition(path, frame, index);
            if (metadata.scanBehavior === 'frame-end') {
                scanSource.scannedCommands = (scanSource.scannedCommands as number) + 1;
                recordDiagnosticAction(scan, path, () => ({
                    index,
                    metadata,
                    action: 'frame-end',
                    stopReason: 'event-end',
                    listContext: createFrameListContext(frame),
                }));
                frame.index = (frame.index as number) + 1;
                index = frame.index;
                const finished = finishScanFrame(path);
                if (finished.finished) {
                    if (finished.stopAfterNestedReturn)
                        return { requeue: false, index: getPathIndex(path) };
                    if (finished.shouldYield)
                        return { requeue: true, index: getPathIndex(path) };
                    continue;
                }
                return stopScanPath(path, scan, 'event-end', index);
            }
            if (metadata.scanBehavior === 'message') {
                const remainingScanCommands = (maxScanCommands as number) - (scanSource.scannedCommands as number);
                let block = parseMessageCommandBlock(scanSession, frame.listGeneration, index, frame.interpreterId, remainingScanCommands) as MessageBlockCandidate | null;
                if (block?.rejected === true) {
                    const stopReason = typeof block.stopReason === 'string' && block.stopReason
                        ? block.stopReason
                        : 'foresight-projection-type';
                    scanSource.scannedCommands = (scanSource.scannedCommands as number) + 1;
                    recordDiagnosticAction(scan, path, () => ({
                        index,
                        metadata,
                        action: 'barrier',
                        stopReason,
                        listContext: createFrameListContext(frame),
                    }));
                    return stopScanPath(path, scan, stopReason, index);
                }
                if (block && block.complete !== true) {
                    const nextIndex = Number(block.nextIndex);
                    const consumed = Math.max(1, nextIndex - (index as number));
                    scanSource.scannedCommands = (scanSource.scannedCommands as number) + consumed;
                    recordDiagnosticAction(scan, path, () => ({
                        index,
                        metadata,
                        action: 'barrier',
                        stopReason: 'scan-limit',
                        listContext: createFrameListContext(frame),
                        consumedCommands: captureDiagnosticConsumedCommands(scan, frame.listGeneration, index, nextIndex, {
                            previewKind: 'message',
                        }),
                    }));
                    return stopScanPath(path, scan, 'scan-limit', nextIndex);
                }
                if (!block || !(block.rawText as string).trim()) {
                    scanSource.scannedCommands = (scanSource.scannedCommands as number) + 1;
                    recordDiagnosticAction(scan, path, () => ({
                        index,
                        metadata,
                        action: 'barrier',
                        stopReason: 'empty-message',
                        listContext: createFrameListContext(frame),
                    }));
                    return stopScanPath(path, scan, 'empty-message', index);
                }
                block = attachFrameContextToBlock(block, frame) as MessageBlockCandidate;
                block = attachPathContextToBlock(block, path, scan) as MessageBlockCandidate;
                const budgetBefore = captureDiagnosticActionBudget(scan, pathSource.budget, {
                    previewKind: 'message',
                });
                spendBudget(pathSource.budget, messageBudgetCost);
                scanSource.budget = createBudgetSnapshot(pathSource.budget);
                scanSource.scannedCommands =
                    (scanSource.scannedCommands as number) +
                        Math.max(1, (block.nextIndex as number) - (index as number));
                scanSource.blocks = (scanSource.blocks as number) + 1;
                recordDiagnosticAction(scan, path, () => {
                    const action: CommandActionCandidate = {
                        index,
                        metadata,
                        action: 'message',
                        budget: createActionBudgetSnapshot(budgetBefore, scanSource.budget, messageBudgetCost),
                        consumedCommands: captureDiagnosticConsumedCommands(scan, frame.listGeneration, index, block.nextIndex, { previewKind: 'message' }),
                    };
                    return action;
                }, {
                    previewKind: 'message',
                    createFullListContext: () => createFrameListContext(frame),
                });
                block.foresightBudget = createBudgetSnapshot(pathSource.budget);
                captureDiagnosticBlock(scan, block);
                blockList.push(block);
                pathSource.messageDistance = (pathSource.messageDistance as number) + 1;
                frame.index = block.nextIndex;
                index = frame.index;
                return { requeue: true, index };
            }
            if (metadata.classification === 'branching') {
                return scanBranchCommand(scanSession, path, scan, frame, current, metadata);
            }
            if (metadata.scanBehavior === 'nested-list') {
                const nested = readNestedListCommand(scanSession, frame.listGeneration, current, pathSource.frames) as CommandReadCandidate;
                if (nested.transparent) {
                    const consumed = Math.max(1, (nested.nextIndex as number) - (index as number));
                    scanSource.scannedCommands = (scanSource.scannedCommands as number) + consumed;
                    scanSource.advancedCommands = (scanSource.advancedCommands as number) + consumed;
                    recordDiagnosticAction(scan, path, () => ({
                        index,
                        metadata: nested.metadata,
                        action: 'nested-list',
                        listContext: createFrameListContext(frame),
                        nestedList: nested.nestedList,
                        nestedLists: nested.nestedLists,
                        consumedCommands: captureDiagnosticConsumedCommands(scan, frame.listGeneration, index, nested.nextIndex),
                    }));
                    recordDiagnosticCode(scan, 'transparent', code, (nested.metadata as CommandMetadataCandidate).label);
                    if (hasStalenessRisk(nested.metadata)) {
                        recordDiagnosticCode(scan, 'stale-risk', code, (nested.metadata as CommandMetadataCandidate).label);
                    }
                    frame.index = nested.nextIndex;
                    index = frame.index;
                    const returnGuardId = createReturnGuardId();
                    const continuationPath = createNestedContinuationPath(path, nested.nextIndex, returnGuardId);
                    if (continuationPath)
                        addNestedReturnStop(path, returnGuardId);
                    pushNestedFrames(pathSource.frames, truthyOrElse(nested.frames, () => nested.frame), frame);
                    if (continuationPath) {
                        return { newPaths: [continuationPath, path], index: getPathIndex(path) };
                    }
                    return { requeue: true, index: getPathIndex(path) };
                }
                scanSource.scannedCommands = (scanSource.scannedCommands as number) + 1;
                recordDiagnosticAction(scan, path, () => ({
                    index,
                    metadata,
                    action: 'barrier',
                    stopReason: truthyOr(nested.stopReason, 'nested-list-unavailable'),
                    listContext: createFrameListContext(frame),
                    nestedList: truthyOr(nested.nestedList, null),
                    nestedLists: nested.nestedLists,
                    consumedCommands: captureDiagnosticConsumedCommands(scan, frame.listGeneration, index, (index as number) + 1),
                }));
                return stopScanPath(path, scan, truthyOr(nested.stopReason, 'nested-list-unavailable'), index);
            }
            const transparentRead = readTransparentCommand(scanSession, frame.listGeneration, current, frame.expectedIndent, pathSource.frames) as CommandReadCandidate;
            if (transparentRead.transparent) {
                const consumed = Math.max(1, (transparentRead.nextIndex as number) - (index as number));
                scanSource.scannedCommands = (scanSource.scannedCommands as number) + consumed;
                scanSource.advancedCommands = (scanSource.advancedCommands as number) + consumed;
                recordDiagnosticCode(scan, 'transparent', code, (transparentRead.metadata as CommandMetadataCandidate).label);
                if (hasStalenessRisk(transparentRead.metadata)) {
                    recordDiagnosticCode(scan, 'stale-risk', code, (transparentRead.metadata as CommandMetadataCandidate).label);
                }
                recordDiagnosticAction(scan, path, () => ({
                    index,
                    metadata: transparentRead.metadata,
                    action: transparentRead.kind === 'movement-route'
                        ? 'movement-route'
                        : transparentRead.kind === 'nested-list'
                            ? 'nested-list'
                            : 'advance',
                    listContext: createFrameListContext(frame),
                    nestedList: transparentRead.nestedList,
                    nestedLists: transparentRead.nestedLists,
                    consumedCommands: captureDiagnosticConsumedCommands(scan, frame.listGeneration, index, transparentRead.nextIndex),
                    routeCommandActions: truthyOr(transparentRead.routeCommandActions, []),
                }));
                if (transparentRead.kind === 'movement-route') {
                    recordDiagnosticCode(scan, 'movement-route', code, (transparentRead.metadata as CommandMetadataCandidate).label);
                }
                frame.index = transparentRead.nextIndex;
                index = frame.index;
                if (transparentRead.kind === 'nested-list') {
                    const returnGuardId = createReturnGuardId();
                    const continuationPath = createNestedContinuationPath(path, transparentRead.nextIndex, returnGuardId);
                    if (continuationPath)
                        addNestedReturnStop(path, returnGuardId);
                    pushNestedFrames(pathSource.frames, truthyOrElse(transparentRead.frames, () => transparentRead.frame), frame);
                    if (continuationPath) {
                        return { newPaths: [continuationPath, path], index: getPathIndex(path) };
                    }
                    return { requeue: true, index: getPathIndex(path) };
                }
                continue;
            }
            scanSource.scannedCommands = (scanSource.scannedCommands as number) + 1;
            const budgetBefore = captureDiagnosticActionBudget(scan, pathSource.budget);
            recordDiagnosticAction(scan, path, () => ({
                index,
                metadata,
                action: 'barrier',
                stopReason: truthyOr(transparentRead.stopReason, 'barrier-command'),
                budget: createActionBudgetSnapshot(budgetBefore, budgetBefore, 0),
                listContext: createFrameListContext(frame),
                nestedList: transparentRead.nestedList,
                nestedLists: transparentRead.nestedLists,
                consumedCommands: captureDiagnosticConsumedCommands(scan, frame.listGeneration, index, (index as number) + 1),
                routeCommandActions: truthyOr(transparentRead.routeCommandActions, []),
            }));
            return stopScanPath(path, scan, truthyOr(transparentRead.stopReason, 'barrier-command'), index);
        }
        if (!hasBudgetRemaining(pathSource.budget))
            return stopScanPath(path, scan, 'budget-limit', index);
        if (blockList.length >= (maxMessages as number))
            return stopScanPath(path, scan, 'message-limit', index);
        return stopScanPath(path, scan, 'scan-limit', index);
    }
    return Object.freeze({ scanPathUntilYield });
}
