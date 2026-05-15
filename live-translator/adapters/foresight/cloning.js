// Diagnostic clone helpers for safe GUI snapshots.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const callPart = (name) => (...args) => parts[name](...args);
    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    const { createGameMessageForesight, collectUpcomingMessageBlocks, getSnapshot, publishSnapshot, clearSnapshot, loadCommandCatalog, normalizeCommandTable, normalizeCommandMetadata, getEventCommandMetadata, getMovementRouteCommandMetadata, isEventScanBehavior, normalizeClassification, normalizeScanBehavior, normalizeStalenessRisk, isTransparentClassification, hasStalenessRisk, resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame, collectLinearMessageBlocks, createScanDiagnostics, scanPathUntilYield, scanBranchCommand, selectScanStopReason, sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, cloneScanFrame, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, stopScanPath, appendPathStop, createBranchPathStop, isBarrierStopReason, compareNumbers, compareBranchPaths, createBranchPathKey, parseMessageCommandBlock, readNestedListCommand, readEmbeddedNestedListCommand, createEmbeddedNestedListInfo, createEmbeddedNestedListFrame, isEventCommandList, isEventCommandLike, nestedListNameFromPath, createScanFrame, createFrameListContext, attachFrameContextToBlock, resolveCommonEvent, hasCommonEventInStack, hasEventListInStack, getCurrentInterpreterId, getCurrentListId, finishCurrentFrame, pushNestedFrames, pushNextPendingNestedFrame, readTransparentCommand, readMovementRouteCommand, getMovementRouteCommands, getMovementRouteNextIndex, findRouteBarrierCommand, resolveControlFlowTarget, resolveJumpToLabelTarget, resolveLoopStartTarget, resolveBreakLoopTarget, resolveRepeatAboveTarget, findMatchingLoopRepeatIndex, findBreakLoopRepeatIndex, findMatchingLoopStartIndex, createControlFlowTarget, readBranchCommand, readDelimitedBranchCommand, readConditionalBranchCommand, findBranchEndIndex, createBranchTarget, findNextBranchBoundary, createBranchBudgetPlaceholders, describeBranchTargets, describeChoiceBranches, describeConditionalBranches, describeBattleBranches, collectBranchHeaders, getBranchHeaderLabel, splitBudgetAcrossBranches, createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createRouteCommandActions, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels, reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString } = Object.fromEntries(['createGameMessageForesight', 'collectUpcomingMessageBlocks', 'getSnapshot', 'publishSnapshot', 'clearSnapshot', 'loadCommandCatalog', 'normalizeCommandTable', 'normalizeCommandMetadata', 'getEventCommandMetadata', 'getMovementRouteCommandMetadata', 'isEventScanBehavior', 'normalizeClassification', 'normalizeScanBehavior', 'normalizeStalenessRisk', 'isTransparentClassification', 'hasStalenessRisk', 'resolveMessageOrigin', 'isGeneratedMessageOrigin', 'resolveOriginFrames', 'resolveOriginFrame', 'collectLinearMessageBlocks', 'createScanDiagnostics', 'scanPathUntilYield', 'scanBranchCommand', 'selectScanStopReason', 'sortBlocksForPriority', 'attachPathContextToBlock', 'createScanPath', 'createBranchScanPath', 'cloneScanFrames', 'cloneScanFrame', 'getPathIndex', 'isFrameExhausted', 'hasVisitedPathPosition', 'rememberPathPosition', 'stopScanPath', 'appendPathStop', 'createBranchPathStop', 'isBarrierStopReason', 'compareNumbers', 'compareBranchPaths', 'createBranchPathKey', 'parseMessageCommandBlock', 'readNestedListCommand', 'readEmbeddedNestedListCommand', 'createEmbeddedNestedListInfo', 'createEmbeddedNestedListFrame', 'isEventCommandList', 'isEventCommandLike', 'nestedListNameFromPath', 'createScanFrame', 'createFrameListContext', 'attachFrameContextToBlock', 'resolveCommonEvent', 'hasCommonEventInStack', 'hasEventListInStack', 'getCurrentInterpreterId', 'getCurrentListId', 'finishCurrentFrame', 'pushNestedFrames', 'pushNextPendingNestedFrame', 'readTransparentCommand', 'readMovementRouteCommand', 'getMovementRouteCommands', 'getMovementRouteNextIndex', 'findRouteBarrierCommand', 'resolveControlFlowTarget', 'resolveJumpToLabelTarget', 'resolveLoopStartTarget', 'resolveBreakLoopTarget', 'resolveRepeatAboveTarget', 'findMatchingLoopRepeatIndex', 'findBreakLoopRepeatIndex', 'findMatchingLoopStartIndex', 'createControlFlowTarget', 'readBranchCommand', 'readDelimitedBranchCommand', 'readConditionalBranchCommand', 'findBranchEndIndex', 'createBranchTarget', 'findNextBranchBoundary', 'createBranchBudgetPlaceholders', 'describeBranchTargets', 'describeChoiceBranches', 'describeConditionalBranches', 'describeBattleBranches', 'collectBranchHeaders', 'getBranchHeaderLabel', 'splitBudgetAcrossBranches', 'createBudgetState', 'createInitialBudgetSnapshot', 'hasBudgetRemaining', 'spendBudget', 'createBudgetSnapshot', 'cloneBudgetSnapshot', 'createActionBudgetSnapshot', 'createBranchBudgetSnapshot', 'createBlockDiagnostics', 'recordCommandAction', 'appendCommandAction', 'createConsumedEventCommands', 'createRouteCommandActions', 'createDiagnostics', 'recordScan', 'sanitizeScan', 'diagnosticsSnapshot', 'publishDiagnosticsSnapshot', 'incrementCodeCount', 'getStopReasonLabel', 'pickCommandCounts', 'pickCommandLabels', 'reasonFromLabel', 'positiveInteger', 'finiteNumber', 'integerIndex', 'nullableFiniteNumber', 'nonEmptyString'].map((name) => [name, callPart(name)]));
    
    function cloneCommandActions(actions) {
            if (!Array.isArray(actions)) return [];
            return actions.map((action) => Object.assign({}, action, {
                branchPath: Array.isArray(action && action.branchPath) ? action.branchPath.slice() : [],
                listContext: cloneDiagnosticValue(action && action.listContext, 0),
                nestedList: cloneDiagnosticValue(action && action.nestedList, 0),
                nestedLists: cloneDiagnosticValue(action && action.nestedLists, 0),
                budget: cloneDiagnosticValue(action && action.budget, 0),
                consumedCommands: cloneConsumedCommands(action && action.consumedCommands),
                routeCommandActions: cloneConsumedCommands(action && action.routeCommandActions),
                controlFlowTarget: cloneControlFlowTarget(action && action.controlFlowTarget),
                branches: cloneBranchActions(action && action.branches),
            }));
        }
    
    function cloneControlFlowTarget(target) {
            const source = target && typeof target === 'object' ? target : null;
            if (!source) return null;
            return {
                kind: nonEmptyString(source.kind),
                sourceIndex: finiteNumber(source.sourceIndex),
                targetIndex: finiteNumber(source.targetIndex),
                targetCode: source.targetCode === null || source.targetCode === undefined ? null : finiteNumber(source.targetCode),
                targetLabel: nonEmptyString(source.targetLabel),
                targetName: nonEmptyString(source.targetName),
                labelName: nonEmptyString(source.labelName),
                direction: nonEmptyString(source.direction),
                viaIndex: finiteNumber(source.viaIndex),
                viaCode: source.viaCode === null || source.viaCode === undefined ? null : finiteNumber(source.viaCode),
                viaLabel: nonEmptyString(source.viaLabel),
            };
        }
    
    function cloneBranchActions(branches) {
            if (!Array.isArray(branches)) return [];
            return branches.map((branch, index) => {
                const source = branch && typeof branch === 'object' ? branch : {};
                const actions = Array.isArray(source.actions)
                    ? source.actions
                    : (Array.isArray(source.commandActions) ? source.commandActions : []);
                return {
                    label: nonEmptyString(source.label) || nonEmptyString(source.name) || `Branch ${index + 1}`,
                    branchIndex: Number.isFinite(Number(source.branchIndex))
                        ? Number(source.branchIndex)
                        : (source.budget && Number.isFinite(Number(source.budget.branchIndex))
                            ? Number(source.budget.branchIndex)
                            : index),
                    startIndex: finiteNumber(source.startIndex),
                    endIndex: finiteNumber(source.endIndex),
                    joinIndex: finiteNumber(source.joinIndex),
                    stopReason: nonEmptyString(source.stopReason),
                    stopReasonLabel: source.stopReason ? getStopReasonLabel(source.stopReason) : '',
                    budget: cloneDiagnosticValue(source.budget, 0),
                    actions: cloneCommandActions(actions),
                };
            });
        }
    
    function cloneCommandTable(table) {
            const result = {};
            Object.keys(table || {}).forEach((key) => {
                result[key] = Object.assign({}, table[key], {
                    nestedLists: Array.isArray(table[key] && table[key].nestedLists)
                        ? table[key].nestedLists.map((entry) => Object.assign({}, entry))
                        : [],
                });
            });
            return result;
        }
    
    function cloneConsumedCommands(commands) {
            if (!Array.isArray(commands)) return [];
            return commands.map((command) => Object.assign({}, command, {
                parameters: cloneDiagnosticValue(command && command.parameters, 0),
            }));
        }
    
    function cloneDiagnosticValue(value, depth) {
            if (value === null || value === undefined) return value;
            const type = typeof value;
            if (type === 'string' || type === 'number' || type === 'boolean') return value;
            if (depth >= 3) return '[Object]';
            if (Array.isArray(value)) return value.slice(0, 24).map((entry) => cloneDiagnosticValue(entry, depth + 1));
            if (type !== 'object') return String(value);
            const result = {};
            Object.keys(value).slice(0, 24).forEach((key) => {
                result[key] = cloneDiagnosticValue(value[key], depth + 1);
            });
            return result;
        }
    
    Object.assign(parts, { cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneCommandTable, cloneConsumedCommands, cloneDiagnosticValue });

})();
