// Foresight scanner support: explicit part dependency facades.
// Support files use these facets instead of constructing ad hoc part dispatchers.
(() => {
    'use strict';

    LiveTranslatorRun({
        name: 'adapters.foresight.partFacades',
        requires: {
            partsRegistry: 'adapters.foresight.partsRegistry',
        },
        loadAfter: ['adapters.foresight.partsRegistry'],
        loadBefore: ['adapters.foresight'],
        run({ partsRegistry }) {
            const parts = partsRegistry.getParts();

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
                    'createScanIntel',
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
                intel: bindPartMethods(parts, [
                    'getIntelPolicy',
                    'createBlockIntel',
                    'recordCommandAction',
                    'appendCommandAction',
                    'createConsumedEventCommands',
                    'createConsumedEventCommandsForIntel',
                    'createRouteCommandActions',
                    'createRouteCommandActionsForIntel',
                    'createIntel',
                    'recordScan',
                    'sanitizeScan',
                    'intelSnapshot',
                    'publishIntelSnapshot',
                    'clearIntel',
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
                    'cloneIntelValue',
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
        },
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
