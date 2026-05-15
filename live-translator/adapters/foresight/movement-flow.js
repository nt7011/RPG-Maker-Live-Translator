// Movement-route barriers and resolvable control-flow targets.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const callPart = (name) => (...args) => parts[name](...args);
    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    const { createGameMessageForesight, collectUpcomingMessageBlocks, getSnapshot, publishSnapshot, clearSnapshot, loadCommandCatalog, normalizeCommandTable, normalizeCommandMetadata, getEventCommandMetadata, getMovementRouteCommandMetadata, isEventScanBehavior, normalizeClassification, normalizeScanBehavior, normalizeStalenessRisk, isTransparentClassification, hasStalenessRisk, resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame, collectLinearMessageBlocks, createScanDiagnostics, scanPathUntilYield, scanBranchCommand, selectScanStopReason, sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, cloneScanFrame, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, stopScanPath, appendPathStop, createBranchPathStop, isBarrierStopReason, compareNumbers, compareBranchPaths, createBranchPathKey, parseMessageCommandBlock, readNestedListCommand, readEmbeddedNestedListCommand, createEmbeddedNestedListInfo, createEmbeddedNestedListFrame, isEventCommandList, isEventCommandLike, nestedListNameFromPath, createScanFrame, createFrameListContext, attachFrameContextToBlock, resolveCommonEvent, hasCommonEventInStack, hasEventListInStack, getCurrentInterpreterId, getCurrentListId, finishCurrentFrame, pushNestedFrames, pushNextPendingNestedFrame, readTransparentCommand, readBranchCommand, readDelimitedBranchCommand, readConditionalBranchCommand, findBranchEndIndex, createBranchTarget, findNextBranchBoundary, createBranchBudgetPlaceholders, describeBranchTargets, describeChoiceBranches, describeConditionalBranches, describeBattleBranches, collectBranchHeaders, getBranchHeaderLabel, splitBudgetAcrossBranches, createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createRouteCommandActions, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels, cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneCommandTable, cloneConsumedCommands, cloneDiagnosticValue, reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString } = Object.fromEntries(['createGameMessageForesight', 'collectUpcomingMessageBlocks', 'getSnapshot', 'publishSnapshot', 'clearSnapshot', 'loadCommandCatalog', 'normalizeCommandTable', 'normalizeCommandMetadata', 'getEventCommandMetadata', 'getMovementRouteCommandMetadata', 'isEventScanBehavior', 'normalizeClassification', 'normalizeScanBehavior', 'normalizeStalenessRisk', 'isTransparentClassification', 'hasStalenessRisk', 'resolveMessageOrigin', 'isGeneratedMessageOrigin', 'resolveOriginFrames', 'resolveOriginFrame', 'collectLinearMessageBlocks', 'createScanDiagnostics', 'scanPathUntilYield', 'scanBranchCommand', 'selectScanStopReason', 'sortBlocksForPriority', 'attachPathContextToBlock', 'createScanPath', 'createBranchScanPath', 'cloneScanFrames', 'cloneScanFrame', 'getPathIndex', 'isFrameExhausted', 'hasVisitedPathPosition', 'rememberPathPosition', 'stopScanPath', 'appendPathStop', 'createBranchPathStop', 'isBarrierStopReason', 'compareNumbers', 'compareBranchPaths', 'createBranchPathKey', 'parseMessageCommandBlock', 'readNestedListCommand', 'readEmbeddedNestedListCommand', 'createEmbeddedNestedListInfo', 'createEmbeddedNestedListFrame', 'isEventCommandList', 'isEventCommandLike', 'nestedListNameFromPath', 'createScanFrame', 'createFrameListContext', 'attachFrameContextToBlock', 'resolveCommonEvent', 'hasCommonEventInStack', 'hasEventListInStack', 'getCurrentInterpreterId', 'getCurrentListId', 'finishCurrentFrame', 'pushNestedFrames', 'pushNextPendingNestedFrame', 'readTransparentCommand', 'readBranchCommand', 'readDelimitedBranchCommand', 'readConditionalBranchCommand', 'findBranchEndIndex', 'createBranchTarget', 'findNextBranchBoundary', 'createBranchBudgetPlaceholders', 'describeBranchTargets', 'describeChoiceBranches', 'describeConditionalBranches', 'describeBattleBranches', 'collectBranchHeaders', 'getBranchHeaderLabel', 'splitBudgetAcrossBranches', 'createBudgetState', 'createInitialBudgetSnapshot', 'hasBudgetRemaining', 'spendBudget', 'createBudgetSnapshot', 'cloneBudgetSnapshot', 'createActionBudgetSnapshot', 'createBranchBudgetSnapshot', 'createBlockDiagnostics', 'recordCommandAction', 'appendCommandAction', 'createConsumedEventCommands', 'createRouteCommandActions', 'createDiagnostics', 'recordScan', 'sanitizeScan', 'diagnosticsSnapshot', 'publishDiagnosticsSnapshot', 'incrementCodeCount', 'getStopReasonLabel', 'pickCommandCounts', 'pickCommandLabels', 'cloneCommandActions', 'cloneControlFlowTarget', 'cloneBranchActions', 'cloneCommandTable', 'cloneConsumedCommands', 'cloneDiagnosticValue', 'reasonFromLabel', 'positiveInteger', 'finiteNumber', 'integerIndex', 'nullableFiniteNumber', 'nonEmptyString'].map((name) => [name, callPart(name)]));
    
    function readMovementRouteCommand(list, index, expectedIndent, metadata, diagnostics = null) {
            const routeCommands = getMovementRouteCommands(list, index, expectedIndent);
            const nextIndex = getMovementRouteNextIndex(list, index, expectedIndent);
            const captureActions = !(diagnostics && diagnostics.captureCommandActions === false);
            const routeCommandActions = captureActions ? createRouteCommandActions(routeCommands) : [];
            if (!routeCommands.length) {
                return {
                    transparent: false,
                    stopReason: 'movement-route-missing-list',
                    metadata,
                    consumedCommands: captureActions ? createConsumedEventCommands(list, index, nextIndex) : [],
                    routeCommandActions,
                };
            }
    
            const barrier = findRouteBarrierCommand(routeCommands);
            if (barrier) {
                return {
                    transparent: false,
                    stopReason: 'movement-route-barrier',
                    routeBarrierCode: barrier.code,
                    routeBarrierReason: barrier.reason,
                    routeBarrierLabel: barrier.label,
                    metadata,
                    consumedCommands: captureActions ? createConsumedEventCommands(list, index, nextIndex) : [],
                    routeCommandActions,
                };
            }
    
            return {
                transparent: true,
                nextIndex,
                kind: 'movement-route',
                routeCommandCount: routeCommands.length,
                metadata,
                consumedCommands: captureActions ? createConsumedEventCommands(list, index, nextIndex) : [],
                routeCommandActions,
            };
        }
    
    function getMovementRouteCommands(list, index, expectedIndent) {
            const command = list[index];
            const params = Array.isArray(command && command.parameters) ? command.parameters : [];
            const route = params[1] && typeof params[1] === 'object' ? params[1] : null;
            const commands = [];
            if (route && Array.isArray(route.list)) commands.push(...route.list);
    
            let cursor = index + 1;
            while (cursor < list.length && list[cursor] && isEventScanBehavior(list[cursor], 'movement-route-line')) {
                if ((Number(list[cursor].indent) || 0) !== expectedIndent) break;
                const routeParams = Array.isArray(list[cursor].parameters) ? list[cursor].parameters : [];
                if (routeParams[0] && typeof routeParams[0] === 'object') commands.push(routeParams[0]);
                cursor += 1;
            }
            return commands;
        }
    
    function getMovementRouteNextIndex(list, index, expectedIndent) {
            let cursor = index + 1;
            while (cursor < list.length && list[cursor] && isEventScanBehavior(list[cursor], 'movement-route-line')) {
                if ((Number(list[cursor].indent) || 0) !== expectedIndent) break;
                cursor += 1;
            }
            return cursor;
        }
    
    function findRouteBarrierCommand(routeCommands) {
            for (const routeCommand of routeCommands) {
                const code = Number(routeCommand && routeCommand.code);
                if (!Number.isFinite(code)) {
                    return { code: null, reason: 'unknown', label: 'Unknown movement-route command' };
                }
                const metadata = getMovementRouteCommandMetadata(code);
                if (metadata.scanBehavior !== 'advance') {
                    return {
                        code,
                        reason: metadata.reason || reasonFromLabel(metadata.label) || metadata.classification,
                        label: metadata.label,
                    };
                }
            }
            return null;
        }
    
    function resolveControlFlowTarget(list, index, metadata) {
            const code = Number(metadata && metadata.code);
            if (code === 112) return resolveLoopStartTarget(list, index);
            if (code === 113) return resolveBreakLoopTarget(list, index);
            if (code === 119) return resolveJumpToLabelTarget(list, index);
            if (code === 413) return resolveRepeatAboveTarget(list, index);
            return null;
        }
    
    function resolveJumpToLabelTarget(list, index) {
            if (!Array.isArray(list)) return null;
            const command = Array.isArray(list) ? list[index] : null;
            const params = Array.isArray(command && command.parameters) ? command.parameters : [];
            const labelName = nonEmptyString(params[0]);
            if (!labelName) return null;
    
            for (let cursor = 0; cursor < list.length; cursor += 1) {
                const candidate = list[cursor];
                if (!candidate || Number(candidate.code) !== 118) continue;
                const candidateParams = Array.isArray(candidate.parameters) ? candidate.parameters : [];
                if (nonEmptyString(candidateParams[0]) !== labelName) continue;
                return createControlFlowTarget(list, index, cursor, 'jump-label', {
                    labelName,
                    targetName: labelName,
                });
            }
            return null;
        }
    
    function resolveLoopStartTarget(list, index) {
            const repeatIndex = findMatchingLoopRepeatIndex(list, index);
            if (repeatIndex === null) return null;
            return createControlFlowTarget(list, index, repeatIndex, 'loop-repeat', {
                viaIndex: repeatIndex,
                viaCode: 413,
                viaLabel: 'Repeat Above',
            });
        }
    
    function resolveBreakLoopTarget(list, index) {
            const repeatIndex = findBreakLoopRepeatIndex(list, index);
            if (repeatIndex === null) return null;
            return createControlFlowTarget(list, index, repeatIndex + 1, 'break-loop', {
                viaIndex: repeatIndex,
                viaCode: 413,
                viaLabel: 'Repeat Above',
            });
        }
    
    function resolveRepeatAboveTarget(list, index) {
            const loopIndex = findMatchingLoopStartIndex(list, index);
            if (loopIndex === null) return null;
            return createControlFlowTarget(list, index, loopIndex, 'repeat-loop', {
                viaIndex: loopIndex,
                viaCode: 112,
                viaLabel: 'Loop',
            });
        }
    
    function findMatchingLoopRepeatIndex(list, index) {
            if (!Array.isArray(list)) return null;
            let depth = 0;
            for (let cursor = index + 1; cursor < list.length; cursor += 1) {
                const code = Number(list[cursor] && list[cursor].code);
                if (code === 112) {
                    depth += 1;
                } else if (code === 413) {
                    if (depth > 0) {
                        depth -= 1;
                    } else {
                        return cursor;
                    }
                }
            }
            return null;
        }
    
    function findBreakLoopRepeatIndex(list, index) {
            if (!Array.isArray(list)) return null;
            let depth = 0;
            for (let cursor = index + 1; cursor < list.length; cursor += 1) {
                const code = Number(list[cursor] && list[cursor].code);
                if (code === 112) {
                    depth += 1;
                } else if (code === 413) {
                    if (depth > 0) {
                        depth -= 1;
                    } else {
                        return cursor;
                    }
                }
            }
            return null;
        }
    
    function findMatchingLoopStartIndex(list, index) {
            if (!Array.isArray(list)) return null;
            const repeat = list[index];
            const repeatIndent = Number(repeat && repeat.indent) || 0;
            for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
                const command = list[cursor];
                if (!command || (Number(command.indent) || 0) !== repeatIndent) continue;
                return Number(command.code) === 112 ? cursor : null;
            }
            return null;
        }
    
    function createControlFlowTarget(list, sourceIndex, targetIndex, kind, details = {}) {
            const target = Array.isArray(list) && targetIndex >= 0 && targetIndex < list.length ? list[targetIndex] : null;
            const metadata = target ? getEventCommandMetadata(target.code) : null;
            const direction = targetIndex === sourceIndex
                ? 'self'
                : (targetIndex < sourceIndex ? 'backward' : 'forward');
            return {
                kind: nonEmptyString(kind) || 'control-flow',
                sourceIndex: finiteNumber(sourceIndex),
                targetIndex: finiteNumber(targetIndex),
                targetCode: metadata ? metadata.code : null,
                targetLabel: metadata ? metadata.label : 'End',
                targetName: nonEmptyString(details.targetName),
                labelName: nonEmptyString(details.labelName),
                direction,
                viaIndex: finiteNumber(details.viaIndex),
                viaCode: details.viaCode === null || details.viaCode === undefined ? null : finiteNumber(details.viaCode),
                viaLabel: nonEmptyString(details.viaLabel),
            };
        }
    
    Object.assign(parts, { readMovementRouteCommand, getMovementRouteCommands, getMovementRouteNextIndex, findRouteBarrierCommand, resolveControlFlowTarget, resolveJumpToLabelTarget, resolveLoopStartTarget, resolveBreakLoopTarget, resolveRepeatAboveTarget, findMatchingLoopRepeatIndex, findBreakLoopRepeatIndex, findMatchingLoopStartIndex, createControlFlowTarget });

})();
