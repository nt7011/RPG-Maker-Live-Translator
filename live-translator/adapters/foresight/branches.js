// Branch target discovery and budget allocation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const callPart = (name) => (...args) => parts[name](...args);
    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    const { createGameMessageForesight, collectUpcomingMessageBlocks, getSnapshot, publishSnapshot, clearSnapshot, loadCommandCatalog, normalizeCommandTable, normalizeCommandMetadata, getEventCommandMetadata, getMovementRouteCommandMetadata, isEventScanBehavior, normalizeClassification, normalizeScanBehavior, normalizeStalenessRisk, isTransparentClassification, hasStalenessRisk, resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame, collectLinearMessageBlocks, createScanDiagnostics, scanPathUntilYield, scanBranchCommand, selectScanStopReason, sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, cloneScanFrame, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, stopScanPath, appendPathStop, createBranchPathStop, isBarrierStopReason, compareNumbers, compareBranchPaths, createBranchPathKey, parseMessageCommandBlock, readNestedListCommand, readEmbeddedNestedListCommand, createEmbeddedNestedListInfo, createEmbeddedNestedListFrame, isEventCommandList, isEventCommandLike, nestedListNameFromPath, createScanFrame, createFrameListContext, attachFrameContextToBlock, resolveCommonEvent, hasCommonEventInStack, hasEventListInStack, getCurrentInterpreterId, getCurrentListId, finishCurrentFrame, pushNestedFrames, pushNextPendingNestedFrame, readTransparentCommand, readMovementRouteCommand, getMovementRouteCommands, getMovementRouteNextIndex, findRouteBarrierCommand, resolveControlFlowTarget, resolveJumpToLabelTarget, resolveLoopStartTarget, resolveBreakLoopTarget, resolveRepeatAboveTarget, findMatchingLoopRepeatIndex, findBreakLoopRepeatIndex, findMatchingLoopStartIndex, createControlFlowTarget, createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createRouteCommandActions, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels, cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneCommandTable, cloneConsumedCommands, cloneDiagnosticValue, reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString } = Object.fromEntries(['createGameMessageForesight', 'collectUpcomingMessageBlocks', 'getSnapshot', 'publishSnapshot', 'clearSnapshot', 'loadCommandCatalog', 'normalizeCommandTable', 'normalizeCommandMetadata', 'getEventCommandMetadata', 'getMovementRouteCommandMetadata', 'isEventScanBehavior', 'normalizeClassification', 'normalizeScanBehavior', 'normalizeStalenessRisk', 'isTransparentClassification', 'hasStalenessRisk', 'resolveMessageOrigin', 'isGeneratedMessageOrigin', 'resolveOriginFrames', 'resolveOriginFrame', 'collectLinearMessageBlocks', 'createScanDiagnostics', 'scanPathUntilYield', 'scanBranchCommand', 'selectScanStopReason', 'sortBlocksForPriority', 'attachPathContextToBlock', 'createScanPath', 'createBranchScanPath', 'cloneScanFrames', 'cloneScanFrame', 'getPathIndex', 'isFrameExhausted', 'hasVisitedPathPosition', 'rememberPathPosition', 'stopScanPath', 'appendPathStop', 'createBranchPathStop', 'isBarrierStopReason', 'compareNumbers', 'compareBranchPaths', 'createBranchPathKey', 'parseMessageCommandBlock', 'readNestedListCommand', 'readEmbeddedNestedListCommand', 'createEmbeddedNestedListInfo', 'createEmbeddedNestedListFrame', 'isEventCommandList', 'isEventCommandLike', 'nestedListNameFromPath', 'createScanFrame', 'createFrameListContext', 'attachFrameContextToBlock', 'resolveCommonEvent', 'hasCommonEventInStack', 'hasEventListInStack', 'getCurrentInterpreterId', 'getCurrentListId', 'finishCurrentFrame', 'pushNestedFrames', 'pushNextPendingNestedFrame', 'readTransparentCommand', 'readMovementRouteCommand', 'getMovementRouteCommands', 'getMovementRouteNextIndex', 'findRouteBarrierCommand', 'resolveControlFlowTarget', 'resolveJumpToLabelTarget', 'resolveLoopStartTarget', 'resolveBreakLoopTarget', 'resolveRepeatAboveTarget', 'findMatchingLoopRepeatIndex', 'findBreakLoopRepeatIndex', 'findMatchingLoopStartIndex', 'createControlFlowTarget', 'createBudgetState', 'createInitialBudgetSnapshot', 'hasBudgetRemaining', 'spendBudget', 'createBudgetSnapshot', 'cloneBudgetSnapshot', 'createActionBudgetSnapshot', 'createBranchBudgetSnapshot', 'createBlockDiagnostics', 'recordCommandAction', 'appendCommandAction', 'createConsumedEventCommands', 'createRouteCommandActions', 'createDiagnostics', 'recordScan', 'sanitizeScan', 'diagnosticsSnapshot', 'publishDiagnosticsSnapshot', 'incrementCodeCount', 'getStopReasonLabel', 'pickCommandCounts', 'pickCommandLabels', 'cloneCommandActions', 'cloneControlFlowTarget', 'cloneBranchActions', 'cloneCommandTable', 'cloneConsumedCommands', 'cloneDiagnosticValue', 'reasonFromLabel', 'positiveInteger', 'finiteNumber', 'integerIndex', 'nullableFiniteNumber', 'nonEmptyString'].map((name) => [name, callPart(name)]));
    
    function readBranchCommand(list, index, expectedIndent, metadata) {
            const code = Number(metadata && metadata.code);
            if (RESOLVABLE_CONTROL_FLOW_CODES.has(code)) {
                const controlFlowTarget = resolveControlFlowTarget(list, index, metadata);
                if (controlFlowTarget) {
                    return {
                        transparent: false,
                        stopReason: 'control-flow-target',
                        controlFlowTarget,
                        branches: [],
                    };
                }
                return {
                    transparent: false,
                    stopReason: 'unsafe-control-flow',
                    branches: [],
                };
            }
            if (BRANCH_MARKER_CODES.has(code)) {
                return {
                    transparent: false,
                    stopReason: 'branch-structure-desync',
                    branches: [],
                };
            }
            if (code === 102) return readDelimitedBranchCommand(list, index, expectedIndent, metadata, new Set([402, 403]), 404);
            if (code === 111) return readConditionalBranchCommand(list, index, expectedIndent, metadata);
            if (code === 301) return readDelimitedBranchCommand(list, index, expectedIndent, metadata, new Set([601, 602, 603]), 604);
            return {
                transparent: false,
                stopReason: 'unsupported-branch',
                branches: createBranchBudgetPlaceholders(list, index, expectedIndent, metadata, null),
            };
        }
    
    function readDelimitedBranchCommand(list, index, expectedIndent, metadata, branchCodes, endCode) {
            const endIndex = findBranchEndIndex(list, index, expectedIndent, endCode);
            if (endIndex === null) {
                return {
                    transparent: false,
                    stopReason: 'branch-structure-desync',
                    branches: [],
                };
            }
    
            const targets = [];
            // Branch headers live at the opener indent. Branch body commands live
            // one indent deeper, so same-indent non-headers before the end marker
            // mean the command list shape no longer matches RPG Maker structure.
            for (let cursor = index + 1; cursor < endIndex; cursor += 1) {
                const command = list[cursor];
                if (!command) {
                    return {
                        transparent: false,
                        stopReason: 'branch-structure-desync',
                        branches: [],
                    };
                }
                const indent = Number(command.indent) || 0;
                if (indent < expectedIndent) {
                    return {
                        transparent: false,
                        stopReason: 'branch-structure-desync',
                        branches: [],
                    };
                }
                if (indent !== expectedIndent) continue;
    
                const code = Number(command.code);
                if (!branchCodes.has(code)) {
                    return {
                        transparent: false,
                        stopReason: 'branch-structure-desync',
                        branches: [],
                    };
                }
                targets.push(createBranchTarget(list, cursor, index, expectedIndent, endIndex, endCode, branchCodes, targets.length));
            }
    
            if (!targets.length) {
                return {
                    transparent: false,
                    stopReason: 'branch-structure-desync',
                    branches: [],
                };
            }
            return {
                transparent: true,
                targets: targets.map((target, branchIndex) => Object.assign({}, target, { branchIndex })),
                joinIndex: endIndex + 1,
            };
        }
    
    function readConditionalBranchCommand(list, index, expectedIndent, metadata) {
            const endIndex = findBranchEndIndex(list, index, expectedIndent, 412);
            if (endIndex === null) {
                return {
                    transparent: false,
                    stopReason: 'branch-structure-desync',
                    branches: [],
                };
            }
    
            let elseIndex = null;
            // A conditional has one optional same-indent Else marker. Without Else,
            // the false path is an empty branch that resumes at the join point.
            for (let cursor = index + 1; cursor < endIndex; cursor += 1) {
                const command = list[cursor];
                if (!command) {
                    return {
                        transparent: false,
                        stopReason: 'branch-structure-desync',
                        branches: [],
                    };
                }
                const indent = Number(command.indent) || 0;
                if (indent < expectedIndent) {
                    return {
                        transparent: false,
                        stopReason: 'branch-structure-desync',
                        branches: [],
                    };
                }
                if (indent !== expectedIndent) continue;
                if (Number(command.code) !== 411) {
                    return {
                        transparent: false,
                        stopReason: 'branch-structure-desync',
                        branches: [],
                    };
                }
                if (elseIndex !== null) {
                    return {
                        transparent: false,
                        stopReason: 'branch-structure-desync',
                        branches: [],
                    };
                }
                elseIndex = cursor;
            }
    
            const joinIndex = endIndex + 1;
            const targets = [
                {
                    ownerIndex: index,
                    headerIndex: index,
                    startIndex: index + 1,
                    endIndex: elseIndex === null ? endIndex : elseIndex,
                    joinIndex,
                    bodyIndent: expectedIndent + 1,
                    label: 'Condition true',
                    branchIndex: 0,
                },
                {
                    ownerIndex: index,
                    headerIndex: elseIndex,
                    startIndex: elseIndex === null ? endIndex : elseIndex + 1,
                    endIndex,
                    joinIndex,
                    bodyIndent: expectedIndent + 1,
                    label: elseIndex === null ? 'Condition false' : getBranchHeaderLabel(list[elseIndex], 'Condition false'),
                    branchIndex: 1,
                },
            ];
            return {
                transparent: true,
                targets,
                joinIndex,
            };
        }
    
    function findBranchEndIndex(list, index, expectedIndent, endCode) {
            if (!Array.isArray(list)) return null;
            for (let cursor = index + 1; cursor < list.length; cursor += 1) {
                const command = list[cursor];
                if (!command) return null;
                const indent = Number(command.indent) || 0;
                if (indent < expectedIndent) return null;
                if (indent === expectedIndent && Number(command.code) === Number(endCode)) return cursor;
            }
            return null;
        }
    
    function createBranchTarget(list, headerIndex, ownerIndex, expectedIndent, endIndex, endCode, branchCodes, branchIndex) {
            const nextBoundary = findNextBranchBoundary(list, headerIndex + 1, expectedIndent, endIndex, branchCodes, endCode);
            return {
                ownerIndex,
                headerIndex,
                startIndex: headerIndex + 1,
                endIndex: nextBoundary === null ? endIndex : nextBoundary,
                joinIndex: endIndex + 1,
                bodyIndent: expectedIndent + 1,
                label: getBranchHeaderLabel(list[headerIndex], `Branch ${branchIndex + 1}`),
                branchIndex,
            };
        }
    
    function findNextBranchBoundary(list, startIndex, expectedIndent, endIndex, branchCodes, endCode) {
            for (let cursor = startIndex; cursor <= endIndex && cursor < list.length; cursor += 1) {
                const command = list[cursor];
                if (!command) return null;
                const indent = Number(command.indent) || 0;
                if (indent < expectedIndent) return null;
                if (indent !== expectedIndent) continue;
                const code = Number(command.code);
                if (code === Number(endCode) || branchCodes.has(code)) return cursor;
            }
            return null;
        }
    
    function createBranchBudgetPlaceholders(list, index, expectedIndent, metadata, budget) {
            if (!metadata || metadata.classification !== 'branching') return [];
            const targets = describeBranchTargets(list, index, expectedIndent, metadata);
            if (!targets.length) return [];
            const allocations = splitBudgetAcrossBranches(budget && budget.remaining, targets.length);
            return targets.map((target, branchIndex) => ({
                label: nonEmptyString(target && target.label) || `Branch ${branchIndex + 1}`,
                budget: createBranchBudgetSnapshot(budget, allocations[branchIndex] || 0, branchIndex, targets.length),
                actions: [],
            }));
        }
    
    function describeBranchTargets(list, index, expectedIndent, metadata) {
            const code = Number(metadata && metadata.code);
            if (code === 102) return describeChoiceBranches(list, index, expectedIndent);
            if (code === 111) return describeConditionalBranches(list, index, expectedIndent);
            if (code === 301) return describeBattleBranches(list, index, expectedIndent);
            return [];
        }
    
    function describeChoiceBranches(list, index, expectedIndent) {
            const headers = collectBranchHeaders(list, index, expectedIndent, new Set([402, 403]), 404)
                .map((command, branchIndex) => ({
                    label: getBranchHeaderLabel(command, `Choice ${branchIndex + 1}`),
                }));
            if (headers.length) return headers;
    
            const params = Array.isArray(list && list[index] && list[index].parameters)
                ? list[index].parameters
                : [];
            const choices = Array.isArray(params[0]) ? params[0] : [];
            return choices.map((choice, branchIndex) => ({
                label: nonEmptyString(choice) || `Choice ${branchIndex + 1}`,
            }));
        }
    
    function describeConditionalBranches(list, index, expectedIndent) {
            const headers = collectBranchHeaders(list, index, expectedIndent, new Set([411]), 412);
            return [
                { label: 'Condition true' },
                { label: headers.length ? getBranchHeaderLabel(headers[0], 'Condition false') : 'Condition false' },
            ];
        }
    
    function describeBattleBranches(list, index, expectedIndent) {
            return collectBranchHeaders(list, index, expectedIndent, new Set([601, 602, 603]), 604)
                .map((command, branchIndex) => ({
                    label: getBranchHeaderLabel(command, `Battle branch ${branchIndex + 1}`),
                }));
        }
    
    function collectBranchHeaders(list, index, expectedIndent, branchCodes, endCode) {
            const headers = [];
            if (!Array.isArray(list)) return headers;
            for (let cursor = index + 1; cursor < list.length; cursor += 1) {
                const command = list[cursor];
                if (!command) break;
                const indent = Number(command.indent) || 0;
                if (indent < expectedIndent) break;
                if (indent !== expectedIndent) continue;
                const code = Number(command.code);
                if (code === endCode) break;
                if (branchCodes.has(code)) headers.push(command);
            }
            return headers;
        }
    
    function getBranchHeaderLabel(command, fallback) {
            const code = Number(command && command.code);
            const params = Array.isArray(command && command.parameters) ? command.parameters : [];
            if (code === 402) return nonEmptyString(params[1]) || fallback;
            if (code === 403) return 'Cancel';
            if (code === 411) return 'Condition false';
            if (code === 601) return 'Win';
            if (code === 602) return 'Escape';
            if (code === 603) return 'Lose';
            return fallback;
        }
    
    function splitBudgetAcrossBranches(totalBudget, branchCount) {
            const count = Number(branchCount);
            if (!Number.isInteger(count) || count <= 0) return [];
            const total = Math.max(0, Math.floor(Number(totalBudget) || 0));
            const base = Math.floor(total / count);
            const remainder = total % count;
            return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
        }
    
    Object.assign(parts, { readBranchCommand, readDelimitedBranchCommand, readConditionalBranchCommand, findBranchEndIndex, createBranchTarget, findNextBranchBoundary, createBranchBudgetPlaceholders, describeBranchTargets, describeChoiceBranches, describeConditionalBranches, describeBattleBranches, collectBranchHeaders, getBranchHeaderLabel, splitBudgetAcrossBranches });

})();
