import { MAX_BRANCH_DEPTH, MESSAGE_BUDGET_COST } from './constants.js';
import type { MutableBudget } from './budget.js';
import { createForesightPathQueueOwner, type ForesightPathQueueOwner } from './path-queue-owner.js';
import { createForesightFrameTransitionOwner } from './scan-frame-transition-owner.js';
import { createForesightBranchCommandOwner } from './branch-command-owner.js';
import { createForesightScanOutcomeReducer } from './scan-outcome-reducer.js';
import { createForesightScanPathTransitionOwner } from './scan-path-transition-owner.js';
import type { ForesightMessageBlockParser } from './message-block-parser.js';
import type { ForesightDiagnosticCommandPreview, ForesightScanCommandFacts, ForesightScanListFacts, ForesightScanListGenerationOwner, } from './scan-list-generation-owner.js';
type PropertyBag = Record<PropertyKey, unknown>;
type DirectTemplateString<Value> = Value & string;
type ScannerIntrinsic = (...args: unknown[]) => unknown;
const MAX_SCANNER_PARSER_RECEIPTS = 1024;
const ScannerIntrinsicArray = Array;
const ScannerIntrinsicMap = Map;
const ScannerIntrinsicObject = Object;
const ScannerIntrinsicTypeError = TypeError;
const ScannerIntrinsicWeakSet = WeakSet;
const scannerNumberIsSafeInteger = Number.isSafeInteger;
const scannerObjectDefineProperty = Object.defineProperty;
const scannerObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const scannerObjectIs = Object.is;
const scannerReflectApply = Reflect.apply;
const scannerStringFrom = String;
function captureScannerIntrinsic(target: object, key: PropertyKey): ScannerIntrinsic {
    const descriptor = scannerObjectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value !== 'function') {
        throw new ScannerIntrinsicTypeError(`[Foresight] Missing scanner intrinsic ${scannerStringFrom(key)}.`);
    }
    return value as ScannerIntrinsic;
}
const scannerMapDelete = captureScannerIntrinsic(ScannerIntrinsicMap.prototype, 'delete');
const scannerMapForEach = captureScannerIntrinsic(ScannerIntrinsicMap.prototype, 'forEach');
const scannerMapSet = captureScannerIntrinsic(ScannerIntrinsicMap.prototype, 'set');
const scannerWeakSetAdd = captureScannerIntrinsic(ScannerIntrinsicWeakSet.prototype, 'add');
const scannerWeakSetDelete = captureScannerIntrinsic(ScannerIntrinsicWeakSet.prototype, 'delete');
const scannerWeakSetHas = captureScannerIntrinsic(ScannerIntrinsicWeakSet.prototype, 'has');
function callScannerIntrinsic<Result>(method: ScannerIntrinsic, receiver: unknown, args: readonly unknown[]): Result {
    return scannerReflectApply(method, receiver, args) as Result;
}
function scannerOwnDescriptor(source: object, key: PropertyKey): PropertyDescriptor | null {
    try {
        return (callScannerIntrinsic<PropertyDescriptor | undefined>(scannerObjectGetOwnPropertyDescriptor as ScannerIntrinsic, ScannerIntrinsicObject, [source, key]) ?? null);
    }
    catch {
        return null;
    }
}
function scannerOwnData(source: unknown, key: PropertyKey): unknown {
    if ((!source || typeof source !== 'object') && typeof source !== 'function')
        return undefined;
    const descriptor = scannerOwnDescriptor(source, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function scannerReceiptSnapshotLength(receipts: object[]): number | null {
    const length = scannerOwnData(receipts, 'length');
    return typeof length === 'number' && scannerNumberIsSafeInteger(length) && length >= 0 ? length : null;
}
function appendScannerReceiptSnapshot(receipts: object[], receipt: object): boolean {
    const index = scannerReceiptSnapshotLength(receipts);
    if (index === null || index >= MAX_SCANNER_PARSER_RECEIPTS)
        return false;
    const key = callScannerIntrinsic<string>(scannerStringFrom as ScannerIntrinsic, undefined, [index]);
    const prepared = { configurable: true, enumerable: true, value: receipt, writable: true };
    try {
        callScannerIntrinsic(scannerObjectDefineProperty as ScannerIntrinsic, ScannerIntrinsicObject, [
            receipts,
            key,
            prepared,
        ]);
    }
    catch {
    }
    const observed = scannerOwnDescriptor(receipts, key);
    return (scannerReceiptSnapshotLength(receipts) === index + 1 &&
        !!observed &&
        'value' in observed &&
        callScannerIntrinsic<boolean>(scannerObjectIs as ScannerIntrinsic, ScannerIntrinsicObject, [
            observed.value,
            receipt,
        ]) &&
        observed.configurable === true &&
        observed.enumerable === true &&
        observed.writable === true);
}
interface RepeatedYieldIndexCandidate {
    readonly index: unknown;
}
interface ArrayCheckedReturnStopsCandidate {
    readonly returnStops: unknown[];
}
interface ArrayCheckedFramesCandidate {
    readonly frames: unknown[];
}
interface ScannerOptionsCandidate {
    readonly blockedForesight?: unknown;
    readonly diagnosticsPolicy?: unknown;
}
interface BudgetCandidate extends PropertyBag {
    limit?: unknown;
    remaining?: unknown;
    spent?: unknown;
}
interface ReturnStopCandidate {
    readonly depth?: unknown;
    readonly guardId?: unknown;
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
interface MessageBlockCandidate {
    __returnGuards?: unknown;
    foresightBudget?: unknown;
    nextIndex?: unknown;
    priorityOffset?: unknown;
    rawText?: unknown;
}
interface OriginFrameCandidate {
    readonly listGeneration?: unknown;
    readonly index?: unknown;
    readonly endIndex?: unknown;
    readonly expectedIndent?: unknown;
    readonly interpreterId?: unknown;
    readonly listId?: unknown;
    readonly commonEventId?: unknown;
    readonly commonEventName?: unknown;
    readonly parentInterpreterId?: unknown;
    readonly parentListId?: unknown;
    readonly parentCommandIndex?: unknown;
    readonly parentCommandCode?: unknown;
    readonly nestedListType?: unknown;
    readonly nestedListName?: unknown;
    readonly nestedListPath?: unknown;
    readonly nestedListIndex?: unknown;
    readonly branchLabel?: unknown;
    readonly branchIndex?: unknown;
    readonly branchCount?: unknown;
    readonly resumeBranchDepth?: unknown;
    readonly resumeBranchPath?: unknown;
}
interface ReturnGuardOwnerCandidate {
    readonly __returnGuards?: unknown;
}
interface ScanYieldCandidate {
    readonly index?: unknown;
    readonly newPaths?: unknown;
    requeue?: unknown;
}
interface ForesightScanState {
    advancedCommands?: unknown;
    blockSequence?: unknown;
    blockedReturnGuards?: unknown;
    blocks?: unknown;
    budget?: unknown;
    interpreterId?: unknown;
    scannedCommands?: unknown;
    startIndex?: unknown;
    status?: unknown;
    stopReasons?: unknown;
    stopIndex?: unknown;
    stopReason?: unknown;
}
interface CatalogFacade {
    readonly hasStalenessRisk: (metadata: unknown) => boolean;
}
interface PathStateFacade {
    readonly sortBlocksForPriority: (blocks: unknown) => void;
    readonly attachPathContextToBlock: (block: unknown, path: unknown, scan: unknown) => unknown;
    readonly createScanPath: (options?: unknown) => unknown;
    readonly createBranchScanPath: (parentPath: unknown, parentFrame: unknown, target: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown, metadata: unknown) => unknown;
    readonly cloneScanFrames: (frames: unknown) => unknown[];
    readonly createScanFrameIdentity: (frames: unknown, identifyListIdentity: (identity: unknown) => string) => string | null;
    readonly getPathIndex: (path: unknown) => number;
    readonly isFrameExhausted: (frame: unknown) => boolean;
    readonly hasVisitedPathPosition: (path: unknown, frame: unknown, index: unknown) => boolean;
    readonly rememberPathPosition: (path: unknown, frame: unknown, index: unknown) => void;
    readonly mergeVisitedPathPositions: (target: unknown, source: unknown) => void;
    readonly stopScanPath: (path: unknown, scan: unknown, stopReason: unknown, index: unknown) => unknown;
    readonly appendScanStopReason: (scan: unknown, stopReason: unknown) => void;
    readonly isBarrierStopReason: (stopReason: unknown) => string | boolean;
    readonly compareNumbers: (left: unknown, right: unknown) => number;
    readonly compareBranchPaths: (left: unknown, right: unknown) => number;
}
interface NestedListsFacade {
    readonly readNestedListCommand: (session: unknown, generation: unknown, current: ForesightScanCommandFacts, frames: unknown) => unknown;
    readonly createScanFrame: (options?: unknown) => unknown;
    readonly createFrameListContext: (frame: unknown) => unknown;
    readonly attachFrameContextToBlock: (block: unknown, frame: unknown) => unknown;
    readonly finishCurrentFrame: (frames: unknown) => boolean;
    readonly pushNestedFrames: (frames: unknown, nestedFrames: unknown, parentFrame: unknown) => boolean;
    readonly readTransparentCommand: (session: unknown, generation: unknown, current: ForesightScanCommandFacts, expectedIndent: unknown, frames: unknown) => unknown;
}
interface BranchesFacade {
    readonly readBranchCommand: (session: unknown, generation: unknown, current: ForesightScanCommandFacts, expectedIndent: number) => unknown;
    readonly splitBudgetAcrossBranches: (remaining: unknown, branchCount: unknown) => unknown[];
}
interface BudgetFacade {
    readonly createBudgetState: (limit: unknown, maxMessages: unknown) => unknown;
    readonly hasBudgetRemaining: (budget: unknown) => boolean;
    readonly spendBudget: (budget: MutableBudget | null | undefined, cost: unknown) => unknown;
    readonly createBudgetSnapshot: (budget: unknown) => unknown;
    readonly createActionBudgetSnapshot: (before: unknown, after: unknown, cost: unknown) => unknown;
    readonly createBranchBudgetSnapshot: (budget: unknown, allocation: unknown, branchIndex: unknown, branchCount: unknown) => unknown;
}
interface DiagnosticsFacade {
    readonly beginDiagnosticsScan: (scan: unknown, policy?: unknown) => void;
    readonly filterDiagnosticActionsForBlockedReturns: (scan: unknown, blocked: unknown) => void;
    readonly captureDiagnosticActionBudget: (scan: unknown, budget: unknown, options?: unknown) => unknown;
    readonly captureDiagnosticBlock: (scan: unknown, block: unknown) => void;
    readonly recordDiagnosticAction: (scan: unknown, path: unknown, actionFactory: () => unknown, options?: unknown) => void;
    readonly captureDiagnosticConsumedCommands: (scan: unknown, previews: unknown, options?: unknown) => unknown;
    readonly recordDiagnosticCode: (scan: unknown, category: unknown, code: unknown, label?: unknown) => void;
}
export interface ForesightScannerDependencies {
    readonly catalog: CatalogFacade;
    readonly listGenerations: Pick<ForesightScanListGenerationOwner, 'attachListGeneration' | 'readListFacts' | 'readCommand' | 'readCommandFacts' | 'captureDiagnosticConsumedCommands' | 'attestScan'>;
    readonly messageParser: ForesightMessageBlockParser;
    readonly pathState: PathStateFacade;
    readonly nestedLists: NestedListsFacade;
    readonly branches: BranchesFacade;
    readonly budget: BudgetFacade;
    readonly diagnostics: DiagnosticsFacade;
}
export interface ForesightScannerParts {
    collectLinearMessageBlocks(scanSession: unknown, listGeneration: unknown, startIndex: unknown, interpreterId: unknown, baseIndent?: unknown, maxMessages?: unknown, maxScanCommands?: unknown, budgetLimit?: unknown, originFrames?: unknown, options?: unknown): unknown;
}
export function createForesightScanner(dependencies: ForesightScannerDependencies): ForesightScannerParts {
    const { hasStalenessRisk } = dependencies.catalog;
    const { attachListGeneration, readListFacts, readCommand, readCommandFacts, captureDiagnosticConsumedCommands: captureOwnerDiagnosticConsumedCommands, attestScan, } = dependencies.listGenerations;
    const { prepareAdmittedMessageCommandBlock, readMessageCommandBlock, attestMessageCommandBlock, retireMessageCommandBlock, } = dependencies.messageParser;
    const { sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, createScanFrameIdentity, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, mergeVisitedPathPositions, stopScanPath, appendScanStopReason, isBarrierStopReason, compareNumbers, compareBranchPaths, } = dependencies.pathState;
    const { readNestedListCommand, createScanFrame, createFrameListContext, attachFrameContextToBlock, finishCurrentFrame, pushNestedFrames, readTransparentCommand, } = dependencies.nestedLists;
    const { readBranchCommand, splitBudgetAcrossBranches } = dependencies.branches;
    const { createBudgetState, hasBudgetRemaining, spendBudget, createBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, } = dependencies.budget;
    const { beginDiagnosticsScan, filterDiagnosticActionsForBlockedReturns, captureDiagnosticActionBudget, captureDiagnosticBlock, recordDiagnosticAction, captureDiagnosticConsumedCommands: publishDiagnosticConsumedCommands, recordDiagnosticCode, } = dependencies.diagnostics;
    const scanContexts = new WeakMap<object, Readonly<{
        session: object;
    }>>();
    const pendingParserReceiptSettlements = new ScannerIntrinsicMap<object, true>();
    const parserReceiptReservations = new ScannerIntrinsicWeakSet<object>();
    const parserReceiptSettlementsInFlight = new ScannerIntrinsicWeakSet<object>();
    let reservedParserReceiptSlots = 0;
    let parserReceiptDrainInFlight = false;
    function getScanSession(scan: unknown): unknown {
        return scan && typeof scan === 'object' ? scanContexts.get(scan)?.session : null;
    }
    function readScanCommand(session: unknown, generation: unknown, index: unknown): ForesightScanCommandFacts | null {
        if (!session || typeof session !== 'object' || !generation || typeof generation !== 'object')
            return null;
        let open = true;
        let inFlight = false;
        let window: Readonly<object> | null = null;
        let accepted: boolean;
        try {
            accepted = readCommand(session, generation, index, (candidate): boolean => {
                if (!open || inFlight || window || !candidate || typeof candidate !== 'object')
                    return false;
                inFlight = true;
                try {
                    if (!open || window)
                        return false;
                    window = candidate;
                    return true;
                }
                finally {
                    inFlight = false;
                }
            });
        }
        catch {
            accepted = false;
        }
        finally {
            open = false;
        }
        if (!accepted || !window)
            return null;
        try {
            const facts = readCommandFacts(session, window);
            return facts && facts.index === index ? facts : null;
        }
        catch {
            return null;
        }
    }
    function parseMessageCommandBlock(session: unknown, generation: unknown, startIndex: unknown, interpreterId: unknown, commandAllowance: unknown): unknown {
        drainPendingParserReceiptSettlements();
        if (reservedParserReceiptSlots >= MAX_SCANNER_PARSER_RECEIPTS)
            return null;
        reservedParserReceiptSlots += 1;
        let receipt: object | null = null;
        let receiptOwnsReservation = false;
        let adoptionOpen = true;
        let adoptionInFlight = false;
        let block: unknown;
        let retired = false;
        try {
            const admitted = prepareAdmittedMessageCommandBlock(session, generation, startIndex, interpreterId, commandAllowance, (candidate): boolean => {
                if (!adoptionOpen ||
                    adoptionInFlight ||
                    receipt ||
                    !candidate ||
                    typeof candidate !== 'object' ||
                    callScannerIntrinsic<boolean>(scannerWeakSetHas, parserReceiptReservations, [candidate])) {
                    return false;
                }
                adoptionInFlight = true;
                try {
                    if (!adoptionOpen || receipt)
                        return false;
                    receipt = candidate;
                    callScannerIntrinsic(scannerWeakSetAdd, parserReceiptReservations, [candidate]);
                    receiptOwnsReservation = true;
                    return true;
                }
                finally {
                    adoptionInFlight = false;
                }
            });
            adoptionOpen = false;
            if (!admitted || !receipt || !receiptOwnsReservation)
                return null;
            block = readMessageCommandBlock(receipt);
        }
        catch {
            block = null;
        }
        finally {
            adoptionOpen = false;
            if (receipt && receiptOwnsReservation)
                retired = settleParserReceipt(receipt);
            else
                reservedParserReceiptSlots -= 1;
        }
        return retired ? block : null;
    }
    function releaseParserReceiptReservation(receipt: object): void {
        if (!callScannerIntrinsic<boolean>(scannerWeakSetHas, parserReceiptReservations, [receipt]))
            return;
        callScannerIntrinsic(scannerWeakSetDelete, parserReceiptReservations, [receipt]);
        reservedParserReceiptSlots -= 1;
    }
    function settleParserReceipt(receipt: object): boolean {
        callScannerIntrinsic(scannerMapSet, pendingParserReceiptSettlements, [receipt, true]);
        if (callScannerIntrinsic<boolean>(scannerWeakSetHas, parserReceiptSettlementsInFlight, [receipt])) {
            return false;
        }
        callScannerIntrinsic(scannerWeakSetAdd, parserReceiptSettlementsInFlight, [receipt]);
        let released: boolean;
        try {
            try {
                released = retireMessageCommandBlock(receipt) === true;
            }
            catch {
                released = false;
            }
            if (!released) {
                try {
                    released = attestMessageCommandBlock(receipt) !== true;
                }
                catch {
                    released = false;
                }
            }
        }
        finally {
            callScannerIntrinsic(scannerWeakSetDelete, parserReceiptSettlementsInFlight, [receipt]);
        }
        if (!released)
            return false;
        callScannerIntrinsic(scannerMapDelete, pendingParserReceiptSettlements, [receipt]);
        releaseParserReceiptReservation(receipt);
        return true;
    }
    function drainPendingParserReceiptSettlements(): void {
        if (parserReceiptDrainInFlight)
            return;
        parserReceiptDrainInFlight = true;
        try {
            const receipts = new ScannerIntrinsicArray<object>();
            let snapshotValid = true;
            callScannerIntrinsic(scannerMapForEach, pendingParserReceiptSettlements, [
                (_value: true, receipt: object): void => {
                    if (!snapshotValid || !appendScannerReceiptSnapshot(receipts, receipt))
                        snapshotValid = false;
                },
            ]);
            const length = snapshotValid ? scannerReceiptSnapshotLength(receipts) : null;
            if (length === null || length > MAX_SCANNER_PARSER_RECEIPTS)
                return;
            for (let index = 0; index < length; index += 1) {
                const key = callScannerIntrinsic<string>(scannerStringFrom as ScannerIntrinsic, undefined, [index]);
                const receipt = scannerOwnData(receipts, key);
                if (receipt && typeof receipt === 'object')
                    settleParserReceipt(receipt);
            }
        }
        finally {
            parserReceiptDrainInFlight = false;
        }
    }
    function captureDiagnosticConsumedCommands(scan: unknown, generation: unknown, startIndex: unknown, endIndexExclusive: unknown, options: unknown = {}): unknown {
        const session = getScanSession(scan);
        if (!session || typeof session !== 'object')
            return null;
        let open = true;
        let inFlight = false;
        let preview: readonly ForesightDiagnosticCommandPreview[] | null = null;
        let accepted: boolean;
        try {
            accepted = captureOwnerDiagnosticConsumedCommands(session, generation, startIndex, endIndexExclusive, (candidate): boolean => {
                if (!open || inFlight || preview || !Array.isArray(candidate))
                    return false;
                inFlight = true;
                try {
                    if (!open || preview)
                        return false;
                    preview = candidate;
                    return true;
                }
                finally {
                    inFlight = false;
                }
            });
        }
        catch {
            accepted = false;
        }
        finally {
            open = false;
        }
        return accepted && preview ? publishDiagnosticConsumedCommands(scan, preview, options) : null;
    }
    const frameTransitions = createForesightFrameTransitionOwner({
        finishCurrentFrame,
        cloneScanFrames,
        createScanPath,
        createBudgetSnapshot,
    });
    const { finishScanFrame, createNestedContinuationPath, addNestedReturnStop, createReturnGuardId, pathHasAnyReturnStop, } = frameTransitions;
    const { scanBranchCommand } = createForesightBranchCommandOwner({
        maxBranchDepth: MAX_BRANCH_DEPTH,
        readBranchCommand,
        splitBudgetAcrossBranches,
        captureDiagnosticActionBudget,
        recordDiagnosticAction,
        createActionBudgetSnapshot,
        createFrameListContext,
        captureDiagnosticConsumedCommands,
        stopScanPath,
        createBranchBudgetSnapshot,
        appendScanStopReason,
        createBranchScanPath,
    });
    const { selectScanStopReason } = createForesightScanOutcomeReducer({ isBarrierStopReason });
    const { scanPathUntilYield } = createForesightScanPathTransitionOwner({
        messageBudgetCost: MESSAGE_BUDGET_COST,
        getPathIndex,
        pathHasAnyReturnStop,
        hasBudgetRemaining,
        stopScanPath,
        isFrameExhausted,
        finishScanFrame,
        getScanSession,
        readScanCommand,
        hasVisitedPathPosition,
        rememberPathPosition,
        recordDiagnosticAction,
        createFrameListContext,
        parseMessageCommandBlock,
        attachFrameContextToBlock,
        attachPathContextToBlock,
        captureDiagnosticActionBudget,
        spendBudget,
        createBudgetSnapshot,
        createActionBudgetSnapshot,
        captureDiagnosticConsumedCommands,
        captureDiagnosticBlock,
        scanBranchCommand,
        readNestedListCommand,
        recordDiagnosticCode,
        hasStalenessRisk,
        createReturnGuardId,
        createNestedContinuationPath,
        addNestedReturnStop,
        pushNestedFrames,
        readTransparentCommand,
    });
    function eventListFacts(session: unknown, generation: unknown): ForesightScanListFacts | null {
        if (!session || typeof session !== 'object' || !generation || typeof generation !== 'object')
            return null;
        let facts: ForesightScanListFacts | null;
        try {
            facts = readListFacts(session, generation) ?? attachListGeneration(session, generation);
        }
        catch {
            facts = null;
        }
        return facts?.kind === 'event-list' && Number.isSafeInteger(facts.length) && (facts.length as number) >= 0
            ? facts
            : null;
    }
    function hydrateOriginFrames(session: unknown, originFrames: unknown): unknown[] | null {
        if (!Array.isArray(originFrames))
            return [];
        const hydrated: unknown[] = [];
        for (let index = 0; index < originFrames.length; index += 1) {
            const source = originFrames[index] as OriginFrameCandidate | null | undefined;
            const generation = source?.listGeneration;
            const facts = eventListFacts(session, generation);
            if (!source || !facts)
                return null;
            hydrated.push(createScanFrame({
                listGeneration: generation,
                listIdentity: facts.identity,
                listLength: facts.length,
                index: source.index,
                endIndex: source.endIndex,
                expectedIndent: source.expectedIndent,
                interpreterId: source.interpreterId,
                listId: source.listId,
                commonEventId: source.commonEventId,
                commonEventName: source.commonEventName,
                parentInterpreterId: source.parentInterpreterId,
                parentListId: source.parentListId,
                parentCommandIndex: source.parentCommandIndex,
                parentCommandCode: source.parentCommandCode,
                nestedListType: source.nestedListType,
                nestedListName: source.nestedListName,
                nestedListPath: source.nestedListPath,
                nestedListIndex: source.nestedListIndex,
                branchLabel: source.branchLabel,
                branchIndex: source.branchIndex,
                branchCount: source.branchCount,
                resumeBranchDepth: source.resumeBranchDepth,
                resumeBranchPath: source.resumeBranchPath,
            }));
        }
        return hydrated;
    }
    function collectLinearMessageBlocks(scanSession: unknown, listGeneration: unknown, startIndex: unknown, interpreterId: unknown, baseIndent: unknown = null, maxMessages: unknown, maxScanCommands: unknown, budgetLimit: unknown, originFrames: unknown = null, options: unknown = {}): {
        readonly blocks: MessageBlockCandidate[];
        readonly scan: ForesightScanState;
    } {
        drainPendingParserReceiptSettlements();
        const scanBudget = createBudgetState(budgetLimit, maxMessages);
        const rootPathBudget = createBudgetState(budgetLimit, maxMessages);
        const blocks: MessageBlockCandidate[] = [];
        const scan = createScanState(interpreterId, startIndex, scanBudget, options);
        if (!scanSession || typeof scanSession !== 'object' || !listGeneration || typeof listGeneration !== 'object') {
            scan.status = 'blocked';
            scan.stopReason = 'current-message-unattached';
            return { blocks, scan };
        }
        const rootFacts = eventListFacts(scanSession, listGeneration);
        const hydratedFrames = hydrateOriginFrames(scanSession, originFrames);
        if (!rootFacts || !hydratedFrames) {
            scan.status = 'blocked';
            scan.stopReason = 'foresight-generation-stale';
            return { blocks, scan };
        }
        scanContexts.set(scan, Object.freeze({ session: scanSession }));
        const frames = cloneScanFrames(hydratedFrames);
        if (!frames.length) {
            let defaultValue: unknown;
            frames.push(createScanFrame({
                listGeneration,
                listIdentity: rootFacts.identity,
                listLength: rootFacts.length,
                index: startIndex,
                expectedIndent: Number.isFinite(Number(baseIndent)) ? Number(baseIndent) : null,
                interpreterId,
                listId: ((defaultValue = interpreterId), defaultValue) ? defaultValue : 'event',
            }));
        }
        const queue = createScanPathQueue(maxScanCommands);
        queue.enqueue(createScanPath({
            budget: rootPathBudget,
            frames,
        }));
        const blockLimit = getFinalBlockLimit(scanBudget, maxMessages);
        let index = startIndex;
        while (queue.hasPending() &&
            (scan.scannedCommands as number) < (maxScanCommands as number) &&
            canScanMorePaths(blocks, blockLimit, queue.pendingPaths())) {
            const path = queue.takeNext((paths) => selectNextPathIndex(paths, blocks, blockLimit)) as ScanPathCandidate | null;
            if (!path || path.done)
                continue;
            let result: ScanYieldCandidate | null;
            try {
                result = scanPathUntilYield(path, scan, blocks, blockLimit, maxScanCommands) as ScanYieldCandidate | null;
            }
            finally {
                queue.complete(path);
            }
            if (Number.isFinite(Number(result ? result.index : result))) {
                index = Number((result as RepeatedYieldIndexCandidate).index);
            }
            if (result && Array.isArray(result.newPaths) && result.newPaths.length) {
                result.newPaths.forEach((newPath: unknown) => {
                    queue.enqueue(newPath);
                });
            }
            if (result?.requeue)
                queue.enqueue(path);
        }
        const blockedForesight = filterBlockedReturnGuardForesight(blocks, scan);
        sortBlocksForPriority(blocks);
        if (blocks.length > blockLimit)
            blocks.splice(blockLimit);
        applyFinalBudgetToBlocks(blocks, scanBudget);
        scan.budget = createBudgetSnapshot(scanBudget);
        const currentStopReason = scan.stopReason;
        if (!currentStopReason) {
            scan.stopReason = selectScanStopReason(scan, blocks, maxMessages, maxScanCommands, queue.pendingPaths(), {
                blockedForesight,
            });
        }
        scan.stopIndex = index;
        scan.blocks = blocks.length;
        if (!blocks.length && scan.status === 'scanned')
            scan.status = 'blocked';
        let current: boolean;
        try {
            current = attestScan(scanSession) === true;
        }
        catch {
            current = false;
        }
        scanContexts.delete(scan);
        if (!current) {
            blocks.splice(0);
            scan.blocks = 0;
            scan.status = 'blocked';
            scan.stopReason = 'foresight-generation-stale';
        }
        return { blocks, scan };
    }
    function createScanState(interpreterId: unknown, startIndex: unknown, budget: unknown, options: unknown = {}): ForesightScanState {
        const optionSource = options as ScannerOptionsCandidate;
        let defaultValue: unknown;
        const scan: ForesightScanState = {
            interpreterId: ((defaultValue = interpreterId), defaultValue) ? defaultValue : '',
            status: 'scanned',
            startIndex,
            stopIndex: startIndex,
            stopReason: '',
            scannedCommands: 0,
            advancedCommands: 0,
            stopReasons: [],
            blockedReturnGuards: {},
            budget: createBudgetSnapshot(budget),
            blocks: 0,
            blockSequence: 0,
        };
        beginDiagnosticsScan(scan, optionSource.diagnosticsPolicy);
        return scan;
    }
    function filterBlockedReturnGuardForesight(blocks: unknown, scan: unknown): number {
        const scanSource = scan as ForesightScanState | null | undefined;
        const blocked = scanSource ? scanSource.blockedReturnGuards : scanSource;
        let removed = 0;
        if (!blocked || typeof blocked !== 'object')
            return removed;
        filterDiagnosticActionsForBlockedReturns(scan, blocked);
        if (!Array.isArray(blocks) || !blocks.length)
            return removed;
        for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
            if (hasBlockedReturnGuard(blocks[blockIndex] && (blocks[blockIndex] as ReturnGuardOwnerCandidate).__returnGuards, blocked)) {
                blocks.splice(blockIndex, 1);
                removed += 1;
            }
        }
        return removed;
    }
    function hasBlockedReturnGuard(returnGuards: unknown, blocked: unknown): boolean {
        if (!Array.isArray(returnGuards) || !returnGuards.length)
            return false;
        return returnGuards.some((guard: unknown) => {
            const guardId = Math.max(0, Math.floor(Number(guard) || 0));
            return guardId > 0 && Boolean((blocked as PropertyBag)[String(guardId)]);
        });
    }
    function getFinalBlockLimit(budget: unknown, maxMessages: unknown): number {
        const budgetSource = budget as BudgetCandidate | null | undefined;
        const budgetLimit = Math.max(0, Math.floor(Number(budgetSource ? budgetSource.limit : budgetSource) || 0));
        const messageLimit = Math.max(0, Math.floor(Number(maxMessages) || 0));
        if (!budgetLimit)
            return messageLimit;
        if (!messageLimit)
            return budgetLimit;
        return Math.min(budgetLimit, messageLimit);
    }
    function applyFinalBudgetToBlocks(blocks: unknown, budget: unknown): void {
        if (!budget || typeof budget !== 'object')
            return;
        const budgetSource = budget as BudgetCandidate;
        budgetSource.spent = 0;
        budgetSource.remaining = Math.max(0, Math.floor(Number(budgetSource.limit) || 0));
        if (!Array.isArray(blocks))
            return;
        blocks.forEach((block: unknown, priorityOffset: number) => {
            const blockSource = block as MessageBlockCandidate;
            blockSource.priorityOffset = priorityOffset;
            spendBudget(budget, MESSAGE_BUDGET_COST);
            blockSource.foresightBudget = createBudgetSnapshot(budget);
        });
    }
    function canScanMorePaths(blocks: unknown, maxMessages: unknown, pendingPaths: unknown): boolean {
        if (!Array.isArray(blocks) || blocks.length < (maxMessages as number))
            return true;
        return hasPendingReturnGuardValidation(blocks, pendingPaths);
    }
    function selectNextPathIndex(pendingPaths: readonly unknown[], blocks: unknown, maxMessages: unknown): number {
        if (!pendingPaths.length)
            return 0;
        if (!Array.isArray(blocks) || blocks.length < (maxMessages as number))
            return 0;
        const guards = collectForesightReturnGuards(blocks);
        if (!guards.size)
            return 0;
        const pathIndex = pendingPaths.findIndex((path: unknown) => pathValidatesReturnGuard(path, guards));
        return pathIndex > 0 ? pathIndex : 0;
    }
    function hasPendingReturnGuardValidation(blocks: unknown, pendingPaths: unknown): boolean {
        if (!Array.isArray(pendingPaths) || !pendingPaths.length)
            return false;
        const guards = collectForesightReturnGuards(blocks);
        if (!guards.size)
            return false;
        return pendingPaths.some((path: unknown) => pathValidatesReturnGuard(path, guards));
    }
    function collectForesightReturnGuards(blocks: unknown): Set<number> {
        const guards = new Set<number>();
        if (!Array.isArray(blocks))
            return guards;
        blocks.forEach((block: unknown) => {
            const returnGuards = Array.isArray(block && (block as ReturnGuardOwnerCandidate).__returnGuards)
                ? ((block as ReturnGuardOwnerCandidate).__returnGuards as unknown[])
                : [];
            returnGuards.forEach((guard: unknown) => {
                const guardId = Math.max(0, Math.floor(Number(guard) || 0));
                if (guardId > 0)
                    guards.add(guardId);
            });
        });
        return guards;
    }
    function pathValidatesReturnGuard(path: unknown, guards: Set<number> | null | undefined): boolean {
        if (!guards)
            return false;
        if (!guards.size)
            return false;
        const pathSource = path as ScanPathCandidate | null | undefined;
        const returnStops = Array.isArray(pathSource ? pathSource.returnStops : pathSource)
            ? (pathSource as ArrayCheckedReturnStopsCandidate).returnStops
            : [];
        return returnStops.some((stop: unknown) => {
            const guardId = Math.max(0, Math.floor(Number(stop && (stop as ReturnStopCandidate).guardId) || 0));
            return guardId > 0 && guards.has(guardId);
        });
    }
    const queuedPathListIds = new WeakMap<object, number>();
    let nextQueuedPathListId = 1;
    function createScanPathQueue(maxProcessedPaths: unknown): ForesightPathQueueOwner {
        return createForesightPathQueueOwner({
            createKey: createQueuedPathKey,
            merge: mergeQueuedScanPath,
            isStronger: isStrongerQueuedPath,
            isUsablePath: (path: unknown) => Boolean(path && !(path as ScanPathCandidate).done),
            maxProcessedPaths: Math.max(1, Math.floor(Number(maxProcessedPaths) || 1)),
        });
    }
    function isStrongerQueuedPath(candidate: unknown, processed: unknown): boolean {
        const candidateSource = candidate as ScanPathCandidate | null | undefined;
        const processedSource = processed as ScanPathCandidate | null | undefined;
        if (!candidateSource || !processedSource)
            return false;
        const candidateBudget = candidateSource.budget as BudgetCandidate | null | undefined;
        const processedBudget = processedSource.budget as BudgetCandidate | null | undefined;
        const candidateRemaining = Math.max(0, Math.floor(Number(candidateBudget?.remaining) || 0));
        const processedRemaining = Math.max(0, Math.floor(Number(processedBudget?.remaining) || 0));
        const candidateSpent = Math.max(0, Math.floor(Number(candidateBudget?.spent) || 0));
        const processedSpent = Math.max(0, Math.floor(Number(processedBudget?.spent) || 0));
        return (candidateRemaining > processedRemaining ||
            (candidateRemaining === processedRemaining && candidateSpent < processedSpent));
    }
    function mergeQueuedScanPath(target: unknown, source: unknown): boolean {
        if (!target || !source)
            return false;
        const targetSource = target as ScanPathCandidate;
        const sourceValue = source as ScanPathCandidate;
        const mergedBudget = mergeStrongerBudget(targetSource.budget, sourceValue.budget);
        const sourceDistance = Math.max(0, Math.floor(Number(sourceValue.messageDistance) || 0));
        const targetDistance = Math.max(0, Math.floor(Number(targetSource.messageDistance) || 0));
        if (sourceDistance < targetDistance)
            targetSource.messageDistance = sourceDistance;
        if (compareNumbers(sourceValue.branchDepth, targetSource.branchDepth) < 0) {
            targetSource.branchDepth = Math.max(0, Math.floor(Number(sourceValue.branchDepth) || 0));
        }
        if (compareBranchPaths(sourceValue.branchPath, targetSource.branchPath) < 0) {
            targetSource.branchPath = Array.isArray(sourceValue.branchPath) ? sourceValue.branchPath.slice() : [];
        }
        mergeReturnStopsInto(target, source);
        mergeReturnGuardsInto(target, source);
        mergeVisitedPathPositions(target, source);
        return mergedBudget;
    }
    function mergeStrongerBudget(targetBudget: unknown, sourceBudget: unknown): boolean {
        if (!targetBudget || !sourceBudget)
            return false;
        const targetBudgetSource = targetBudget as PropertyBag;
        const sourceBudgetValue = sourceBudget as BudgetCandidate;
        const sourceRemaining = Math.max(0, Math.floor(Number(sourceBudgetValue.remaining) || 0));
        const targetRemaining = Math.max(0, Math.floor(Number((targetBudget as BudgetCandidate).remaining) || 0));
        const sourceSpent = Math.max(0, Math.floor(Number(sourceBudgetValue.spent) || 0));
        const targetSpent = Math.max(0, Math.floor(Number((targetBudget as BudgetCandidate).spent) || 0));
        if (sourceRemaining < targetRemaining)
            return false;
        if (sourceRemaining === targetRemaining && sourceSpent >= targetSpent)
            return false;
        const snapshot = createBudgetSnapshot(sourceBudget);
        if (!snapshot)
            return false;
        Object.keys(snapshot).forEach((key) => {
            targetBudgetSource[key] = (snapshot as PropertyBag)[key];
        });
        return true;
    }
    function mergeReturnStopsInto(target: unknown, source: unknown): void {
        const targetSource = target as ScanPathCandidate;
        const sourceValue = source as ScanPathCandidate;
        if (!Array.isArray(targetSource.returnStops))
            targetSource.returnStops = [];
        const seen = new Set((targetSource.returnStops as unknown[]).map((stop: unknown) => createReturnStopMergeKey(stop)));
        (Array.isArray(sourceValue.returnStops) ? sourceValue.returnStops : []).forEach((stop: unknown) => {
            const key = createReturnStopMergeKey(stop);
            if (!key || seen.has(key))
                return;
            seen.add(key);
            (targetSource.returnStops as unknown[]).push({
                depth: Math.max(0, Math.floor(Number(stop && (stop as ReturnStopCandidate).depth) || 0)),
                guardId: Math.max(0, Math.floor(Number(stop && (stop as ReturnStopCandidate).guardId) || 0)),
            });
        });
    }
    function mergeReturnGuardsInto(target: unknown, source: unknown): void {
        const targetSource = target as ScanPathCandidate;
        const sourceValue = source as ScanPathCandidate;
        if (!Array.isArray(targetSource.returnGuards))
            targetSource.returnGuards = [];
        const seen = new Set((targetSource.returnGuards as unknown[]).map((guard: unknown) => Math.max(0, Math.floor(Number(guard) || 0))));
        (Array.isArray(sourceValue.returnGuards) ? sourceValue.returnGuards : []).forEach((guard: unknown) => {
            const guardId = Math.max(0, Math.floor(Number(guard) || 0));
            if (!guardId || seen.has(guardId))
                return;
            seen.add(guardId);
            (targetSource.returnGuards as unknown[]).push(guardId);
        });
    }
    function createReturnStopMergeKey(stop: unknown): string {
        const stopSource = stop as ReturnStopCandidate | null | undefined;
        const depth = Math.max(0, Math.floor(Number(stopSource ? stopSource.depth : stopSource) || 0));
        const guardId = Math.max(0, Math.floor(Number(stopSource ? stopSource.guardId : stopSource) || 0));
        const templateDepth: string = depth as DirectTemplateString<typeof depth>;
        const templateGuardId: string = guardId as DirectTemplateString<typeof guardId>;
        return depth > 0 && guardId > 0 ? `${templateDepth}:${templateGuardId}` : '';
    }
    function createQueuedPathKey(path: unknown): string | null {
        const pathSource = path as ScanPathCandidate | null | undefined;
        const frames = pathSource
            ? Array.isArray(pathSource.frames)
                ? (pathSource as ArrayCheckedFramesCandidate).frames
                : []
            : [];
        if (!frames.length)
            return '';
        const frameIdentity = createScanFrameIdentity(frames, getQueuedFrameListId);
        if (frameIdentity === null)
            return null;
        return [
            frameIdentity,
            integerFrameValue(pathSource ? pathSource.returnPriority : pathSource),
            createReturnStopKey(pathSource ? pathSource.returnStops : pathSource),
            createIntegerListKey(pathSource ? pathSource.returnGuards : pathSource),
        ].join('#');
    }
    function getQueuedFrameListId(identity: unknown): string {
        if (!identity || typeof identity !== 'object')
            return 'missing';
        const id = queuedPathListIds.getOrInsertComputed(identity, () => nextQueuedPathListId++);
        const templateId: string = id as DirectTemplateString<typeof id>;
        return `list:${templateId}`;
    }
    function integerFrameValue(value: unknown): string {
        return Number.isFinite(Number(value)) ? String(Math.floor(Number(value))) : '';
    }
    function createReturnStopKey(returnStops: unknown): string {
        if (!Array.isArray(returnStops) || !returnStops.length)
            return '';
        return returnStops
            .map((stop: unknown) => [
            integerFrameValue(stop && (stop as ReturnStopCandidate).depth),
            integerFrameValue(stop && (stop as ReturnStopCandidate).guardId),
        ].join(':'))
            .join(',');
    }
    function createIntegerListKey(values: unknown): string {
        if (!Array.isArray(values) || !values.length)
            return '';
        return values.map(integerFrameValue).join(',');
    }
    return Object.freeze({
        collectLinearMessageBlocks,
    });
}
