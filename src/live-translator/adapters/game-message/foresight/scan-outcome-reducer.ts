interface BudgetCandidate {
    readonly remaining?: unknown;
}
interface ScanStateCandidate {
    readonly budget?: unknown;
    readonly stopReasons?: unknown;
    readonly scannedCommands?: unknown;
}
interface ScanOutcomeOptions {
    readonly blockedForesight?: unknown;
}
export interface ForesightScanOutcomeDependencies {
    readonly isBarrierStopReason: (reason: unknown) => string | boolean;
}
export interface ForesightScanOutcomeReducer {
    readonly selectScanStopReason: (scan: unknown, blocks: unknown, maxMessages: unknown, maxScanCommands: unknown, pendingPaths: unknown, options?: unknown) => unknown;
}
export function createForesightScanOutcomeReducer(dependencies: ForesightScanOutcomeDependencies): ForesightScanOutcomeReducer {
    const { isBarrierStopReason } = dependencies;
    function selectScanStopReason(scan: unknown, blocks: unknown, maxMessages: unknown, maxScanCommands: unknown, pendingPaths: unknown, options: unknown = {}): unknown {
        const source = scan as ScanStateCandidate;
        const outcomeOptions = options as ScanOutcomeOptions;
        const stopReasons: unknown[] = Array.isArray(source.stopReasons) ? source.stopReasons : [];
        if (Number(outcomeOptions.blockedForesight) > 0 && Array.isArray(blocks) && !blocks.length) {
            const barrierReason = stopReasons.find((reason: unknown) => reason && isBarrierStopReason(reason));
            if (barrierReason)
                return barrierReason;
        }
        if ((source.scannedCommands as number) >= (maxScanCommands as number))
            return 'scan-limit';
        if (stopReasons.some((reason: unknown) => reason === 'budget-limit')) {
            return 'budget-limit';
        }
        if (source.budget && Number((source.budget as BudgetCandidate).remaining) <= 0)
            return 'budget-limit';
        if ((blocks as unknown[]).length >= (maxMessages as number))
            return 'message-limit';
        if (Array.isArray(pendingPaths) && pendingPaths.length)
            return 'scan-limit';
        const nonEventReason = stopReasons.find((reason: unknown) => reason && reason !== 'event-end');
        if (nonEventReason)
            return nonEventReason;
        return 'event-end';
    }
    return Object.freeze({ selectScanStopReason });
}
