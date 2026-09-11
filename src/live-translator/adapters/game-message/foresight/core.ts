import { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS } from './constants.js';
import { positiveInteger } from './utils.js';
type PropertyBag = Record<PropertyKey, unknown>;
type ObjectReference = object | ((...args: unknown[]) => unknown);
const arrayIsArray = Array.isArray;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectIs = Object.is;
const numberIsSafeInteger = Number.isSafeInteger;
const stringFrom = String;
interface ForesightOptionsCandidate {
    readonly budget?: unknown;
    readonly maxMessages?: unknown;
    readonly maxScanCommands?: unknown;
    readonly settings?: unknown;
}
interface ForesightInputCandidate {
    readonly currentMessageOrigin?: unknown;
}
interface MessageOriginCandidate {
    readonly listGeneration?: unknown;
    readonly scanSession?: unknown;
    readonly startIndex?: unknown;
    readonly nextIndex?: unknown;
    readonly interpreterId?: unknown;
    readonly indent?: unknown;
    readonly frames?: unknown;
}
const ORIGIN_FRAME_IDENTITY_FIELDS = Object.freeze([
    'listGeneration',
    'index',
    'expectedIndent',
    'interpreterId',
    'listId',
    'commonEventId',
    'commonEventName',
    'parentInterpreterId',
    'parentListId',
    'parentCommandIndex',
    'parentCommandCode',
] as const);
function isObjectReference(value: unknown): value is ObjectReference {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function ownData(source: unknown, key: PropertyKey): {
    readonly value: unknown;
} | null {
    if (!isObjectReference(source))
        return null;
    try {
        const descriptor = objectGetOwnPropertyDescriptor(source, key);
        return descriptor && 'value' in descriptor ? { value: descriptor.value } : null;
    }
    catch {
        return null;
    }
}
function sameOwnData(left: unknown, right: unknown, key: PropertyKey): boolean {
    const leftData = ownData(left, key);
    const rightData = ownData(right, key);
    return !!leftData && !!rightData && objectIs(leftData.value, rightData.value);
}
function sameOriginFrames(left: unknown, right: unknown): boolean {
    if (!arrayIsArray(left) || !arrayIsArray(right))
        return false;
    const leftLength = ownData(left, 'length')?.value;
    const rightLength = ownData(right, 'length')?.value;
    if (typeof leftLength !== 'number' ||
        !numberIsSafeInteger(leftLength) ||
        leftLength < 0 ||
        !objectIs(leftLength, rightLength)) {
        return false;
    }
    for (let frameIndex = 0; frameIndex < leftLength; frameIndex += 1) {
        const leftFrame = ownData(left, stringFrom(frameIndex))?.value;
        const rightFrame = ownData(right, stringFrom(frameIndex))?.value;
        if (!isObjectReference(leftFrame) || !isObjectReference(rightFrame))
            return false;
        for (let fieldIndex = 0; fieldIndex < ORIGIN_FRAME_IDENTITY_FIELDS.length; fieldIndex += 1) {
            const field = ORIGIN_FRAME_IDENTITY_FIELDS[fieldIndex];
            if (!field || !sameOwnData(leftFrame, rightFrame, field))
                return false;
        }
    }
    return true;
}
function sameResolvedOrigin(left: unknown, right: unknown): boolean {
    if (!isObjectReference(left) || !isObjectReference(right))
        return false;
    const leftFrames = ownData(left, 'frames')?.value;
    const rightFrames = ownData(right, 'frames')?.value;
    return (sameOwnData(left, right, 'listGeneration') &&
        sameOwnData(left, right, 'scanSession') &&
        sameOwnData(left, right, 'startIndex') &&
        sameOwnData(left, right, 'nextIndex') &&
        sameOwnData(left, right, 'interpreterId') &&
        sameOwnData(left, right, 'indent') &&
        sameOriginFrames(leftFrames, rightFrames));
}
interface CollectedMessageBlocksCandidate {
    readonly blocks?: unknown;
    readonly scan?: unknown;
}
interface OriginFacade {
    readonly resolveMessageOrigin: (currentMessageOrigin: unknown) => unknown;
}
interface ScannerFacade {
    readonly collectLinearMessageBlocks: (scanSession: unknown, listGeneration: unknown, nextIndex: unknown, interpreterId: unknown, indent: unknown, maxMessages: number, maxScanCommands: number, budgetLimit: number, frames: unknown, options: PropertyBag) => unknown;
}
interface BudgetFacade {
    readonly createBudgetState: (budgetLimit: number, maxMessages: number) => unknown;
}
interface DiagnosticsFacade {
    readonly captureDiagnosticsPolicy: (session: unknown) => unknown;
    readonly createDiagnosticsSession: (options: PropertyBag) => unknown;
    readonly recordDiagnosticScan: (session: unknown, scan: unknown, policyPlan?: unknown, overrides?: unknown) => unknown;
}
export interface GameMessageForesightApi {
    readonly collectUpcomingMessageBlocks: (input?: unknown) => unknown;
}
export interface ForesightCoreParts {
    createGameMessageForesight(options?: unknown): GameMessageForesightApi;
}
export interface ForesightCoreDependencies {
    readonly origin: OriginFacade;
    readonly scanner: ScannerFacade;
    readonly budget: BudgetFacade;
    readonly diagnostics: DiagnosticsFacade;
}
export function createForesightCore(dependencies: ForesightCoreDependencies): ForesightCoreParts {
    const { resolveMessageOrigin } = dependencies.origin;
    const { collectLinearMessageBlocks } = dependencies.scanner;
    const { createBudgetState } = dependencies.budget;
    const { captureDiagnosticsPolicy, createDiagnosticsSession, recordDiagnosticScan } = dependencies.diagnostics;
    function createGameMessageForesight(options: unknown = {}): GameMessageForesightApi {
        const optionSource = options as ForesightOptionsCandidate;
        const budgetLimit = positiveInteger(optionSource.budget, DEFAULT_BUDGET);
        const maxMessages = positiveInteger(optionSource.maxMessages, budgetLimit);
        const maxScanCommands = positiveInteger(optionSource.maxScanCommands, DEFAULT_MAX_SCAN_COMMANDS);
        const diagnosticsSession = createDiagnosticsSession({
            settings: optionSource.settings,
        });
        function collectUpcomingMessageBlocks(input: unknown = {}): unknown {
            const currentMessageOrigin = (input as ForesightInputCandidate).currentMessageOrigin;
            const origin = resolveMessageOrigin(currentMessageOrigin);
            if (!origin) {
                const scan = {
                    interpreterId: '',
                    matchedCurrentMessage: false,
                    status: 'miss',
                    stopReason: 'current-message-unattached',
                    blocks: 0,
                    scannedCommands: 0,
                    advancedCommands: 0,
                    budget: createBudgetState(budgetLimit, maxMessages),
                };
                recordDiagnosticScan(diagnosticsSession, scan);
                return [];
            }
            const diagnosticsPolicy = captureDiagnosticsPolicy(diagnosticsSession);
            const { listGeneration, scanSession, nextIndex, interpreterId, indent, frames } = origin as MessageOriginCandidate;
            const result = collectLinearMessageBlocks(scanSession, listGeneration, nextIndex, interpreterId, indent, maxMessages, maxScanCommands, budgetLimit, frames, {
                diagnosticsPolicy,
            });
            const resultSource = result as CollectedMessageBlocksCandidate;
            const scan = resultSource.scan;
            const blocks = resultSource.blocks;
            const overrides = Object.freeze({
                interpreterId,
                matchedCurrentMessage: true,
            });
            recordDiagnosticScan(diagnosticsSession, scan, diagnosticsPolicy, overrides);
            try {
                const finalOrigin = resolveMessageOrigin(currentMessageOrigin);
                return sameResolvedOrigin(origin, finalOrigin) ? blocks : [];
            }
            catch {
                return [];
            }
        }
        const api: GameMessageForesightApi = {
            collectUpcomingMessageBlocks,
        };
        return api;
    }
    return Object.freeze({ createGameMessageForesight });
}
