// Foresight scanner support: explicit part dependency facades.
// Support files use these facets instead of constructing ad hoc part dispatchers.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before Foresight parts.');
    }
    const parts = requireRuntimeModule('adapters.foresight.partsRegistry').getParts();

    parts.facades = Object.freeze({
        catalog: bindPartMethods(parts, [
            'loadCommandCatalog',
            'normalizeCommandTable',
            'normalizeCommandMetadata',
            'normalizeNestedListSpecs',
            'getEventCommandMetadata',
            'getMovementRouteCommandMetadata',
            'isEventScanBehavior',
            'normalizeClassification',
            'normalizeScanBehavior',
            'normalizeStalenessRisk',
            'isTransparentClassification',
            'hasStalenessRisk',
        ]),
        origin: bindPartMethods(parts, [
            'resolveMessageOrigin',
            'isGeneratedMessageOrigin',
            'resolveOriginFrames',
            'resolveOriginFrame',
        ]),
        scanner: bindPartMethods(parts, [
            'collectLinearMessageBlocks',
            'createScanDiagnostics',
            'scanPathUntilYield',
            'scanBranchCommand',
            'selectScanStopReason',
        ]),
        pathState: bindPartMethods(parts, [
            'sortBlocksForPriority',
            'attachPathContextToBlock',
            'createScanPath',
            'createBranchScanPath',
            'cloneScanFrames',
            'cloneScanFrame',
            'getPathIndex',
            'isFrameExhausted',
            'hasVisitedPathPosition',
            'rememberPathPosition',
            'stopScanPath',
            'appendPathStop',
            'createBranchPathStop',
            'isBarrierStopReason',
            'compareNumbers',
            'compareBranchPaths',
            'createBranchPathKey',
            'parseMessageCommandBlock',
        ]),
        nestedLists: bindPartMethods(parts, [
            'readNestedListCommand',
            'readEmbeddedNestedListCommand',
            'createEmbeddedNestedListInfo',
            'createEmbeddedNestedListFrame',
            'isEventCommandList',
            'isEventCommandLike',
            'nestedListNameFromPath',
            'createScanFrame',
            'createFrameListContext',
            'attachFrameContextToBlock',
            'resolveCommonEvent',
            'hasCommonEventInStack',
            'hasEventListInStack',
            'getCurrentInterpreterId',
            'getCurrentListId',
            'finishCurrentFrame',
            'pushNestedFrames',
            'pushNextPendingNestedFrame',
            'readTransparentCommand',
        ]),
        movementFlow: bindPartMethods(parts, [
            'readMovementRouteCommand',
            'getMovementRouteCommands',
            'getMovementRouteNextIndex',
            'findRouteBarrierCommand',
            'resolveControlFlowTarget',
            'resolveJumpToLabelTarget',
            'resolveLoopStartTarget',
            'resolveBreakLoopTarget',
            'resolveRepeatAboveTarget',
            'findMatchingLoopRepeatIndex',
            'findBreakLoopRepeatIndex',
            'findMatchingLoopStartIndex',
            'createControlFlowTarget',
        ]),
        branches: bindPartMethods(parts, [
            'readBranchCommand',
            'readDelimitedBranchCommand',
            'readConditionalBranchCommand',
            'findBranchEndIndex',
            'createBranchTarget',
            'findNextBranchBoundary',
            'createBranchBudgetPlaceholders',
            'describeBranchTargets',
            'describeChoiceBranches',
            'describeConditionalBranches',
            'describeBattleBranches',
            'collectBranchHeaders',
            'getBranchHeaderLabel',
            'splitBudgetAcrossBranches',
        ]),
        budget: bindPartMethods(parts, [
            'createBudgetState',
            'createInitialBudgetSnapshot',
            'hasBudgetRemaining',
            'spendBudget',
            'createBudgetSnapshot',
            'cloneBudgetSnapshot',
            'createActionBudgetSnapshot',
            'createBranchBudgetSnapshot',
        ]),
        diagnostics: bindPartMethods(parts, [
            'getDiagnosticsPolicy',
            'createBlockDiagnostics',
            'recordCommandAction',
            'appendCommandAction',
            'createConsumedEventCommands',
            'createConsumedEventCommandsForDiagnostics',
            'createRouteCommandActions',
            'createRouteCommandActionsForDiagnostics',
            'createDiagnostics',
            'recordScan',
            'sanitizeScan',
            'diagnosticsSnapshot',
            'publishDiagnosticsSnapshot',
            'clearDiagnostics',
            'incrementCodeCount',
            'getStopReasonLabel',
            'pickCommandCounts',
            'pickCommandLabels',
        ]),
        cloning: bindPartMethods(parts, [
            'cloneCommandActions',
            'cloneControlFlowTarget',
            'cloneBranchActions',
            'cloneCommandTable',
            'cloneConsumedCommands',
            'cloneDiagnosticValue',
        ]),
        utils: bindPartMethods(parts, [
            'reasonFromLabel',
            'positiveInteger',
            'finiteNumber',
            'integerIndex',
            'nullableFiniteNumber',
            'nonEmptyString',
        ]),
    });

    function bindPartMethods(partsRef, names) {
        const facade = Object.create(null);
        names.forEach((name) => {
            facade[name] = (...args) => {
                const method = partsRef && partsRef[name];
                if (typeof method !== 'function') {
                    throw new Error('[Foresight] Missing part method: ' + name);
                }
                return method(...args);
            };
        });
        return Object.freeze(facade);
    }
})();
