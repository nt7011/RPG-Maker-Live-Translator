// Scan path state, stops, and message block parsing.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const callPart = (name) => (...args) => parts[name](...args);
    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    const { createGameMessageForesight, collectUpcomingMessageBlocks, getSnapshot, publishSnapshot, clearSnapshot, loadCommandCatalog, normalizeCommandTable, normalizeCommandMetadata, getEventCommandMetadata, getMovementRouteCommandMetadata, isEventScanBehavior, normalizeClassification, normalizeScanBehavior, normalizeStalenessRisk, isTransparentClassification, hasStalenessRisk, resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame, collectLinearMessageBlocks, createScanDiagnostics, scanPathUntilYield, scanBranchCommand, selectScanStopReason, readNestedListCommand, readEmbeddedNestedListCommand, createEmbeddedNestedListInfo, createEmbeddedNestedListFrame, isEventCommandList, isEventCommandLike, nestedListNameFromPath, createScanFrame, createFrameListContext, attachFrameContextToBlock, resolveCommonEvent, hasCommonEventInStack, hasEventListInStack, getCurrentInterpreterId, getCurrentListId, finishCurrentFrame, pushNestedFrames, pushNextPendingNestedFrame, readTransparentCommand, readMovementRouteCommand, getMovementRouteCommands, getMovementRouteNextIndex, findRouteBarrierCommand, resolveControlFlowTarget, resolveJumpToLabelTarget, resolveLoopStartTarget, resolveBreakLoopTarget, resolveRepeatAboveTarget, findMatchingLoopRepeatIndex, findBreakLoopRepeatIndex, findMatchingLoopStartIndex, createControlFlowTarget, readBranchCommand, readDelimitedBranchCommand, readConditionalBranchCommand, findBranchEndIndex, createBranchTarget, findNextBranchBoundary, createBranchBudgetPlaceholders, describeBranchTargets, describeChoiceBranches, describeConditionalBranches, describeBattleBranches, collectBranchHeaders, getBranchHeaderLabel, splitBudgetAcrossBranches, createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createRouteCommandActions, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels, cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneCommandTable, cloneConsumedCommands, cloneDiagnosticValue, reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString } = Object.fromEntries(['createGameMessageForesight', 'collectUpcomingMessageBlocks', 'getSnapshot', 'publishSnapshot', 'clearSnapshot', 'loadCommandCatalog', 'normalizeCommandTable', 'normalizeCommandMetadata', 'getEventCommandMetadata', 'getMovementRouteCommandMetadata', 'isEventScanBehavior', 'normalizeClassification', 'normalizeScanBehavior', 'normalizeStalenessRisk', 'isTransparentClassification', 'hasStalenessRisk', 'resolveMessageOrigin', 'isGeneratedMessageOrigin', 'resolveOriginFrames', 'resolveOriginFrame', 'collectLinearMessageBlocks', 'createScanDiagnostics', 'scanPathUntilYield', 'scanBranchCommand', 'selectScanStopReason', 'readNestedListCommand', 'readEmbeddedNestedListCommand', 'createEmbeddedNestedListInfo', 'createEmbeddedNestedListFrame', 'isEventCommandList', 'isEventCommandLike', 'nestedListNameFromPath', 'createScanFrame', 'createFrameListContext', 'attachFrameContextToBlock', 'resolveCommonEvent', 'hasCommonEventInStack', 'hasEventListInStack', 'getCurrentInterpreterId', 'getCurrentListId', 'finishCurrentFrame', 'pushNestedFrames', 'pushNextPendingNestedFrame', 'readTransparentCommand', 'readMovementRouteCommand', 'getMovementRouteCommands', 'getMovementRouteNextIndex', 'findRouteBarrierCommand', 'resolveControlFlowTarget', 'resolveJumpToLabelTarget', 'resolveLoopStartTarget', 'resolveBreakLoopTarget', 'resolveRepeatAboveTarget', 'findMatchingLoopRepeatIndex', 'findBreakLoopRepeatIndex', 'findMatchingLoopStartIndex', 'createControlFlowTarget', 'readBranchCommand', 'readDelimitedBranchCommand', 'readConditionalBranchCommand', 'findBranchEndIndex', 'createBranchTarget', 'findNextBranchBoundary', 'createBranchBudgetPlaceholders', 'describeBranchTargets', 'describeChoiceBranches', 'describeConditionalBranches', 'describeBattleBranches', 'collectBranchHeaders', 'getBranchHeaderLabel', 'splitBudgetAcrossBranches', 'createBudgetState', 'createInitialBudgetSnapshot', 'hasBudgetRemaining', 'spendBudget', 'createBudgetSnapshot', 'cloneBudgetSnapshot', 'createActionBudgetSnapshot', 'createBranchBudgetSnapshot', 'createBlockDiagnostics', 'recordCommandAction', 'appendCommandAction', 'createConsumedEventCommands', 'createRouteCommandActions', 'createDiagnostics', 'recordScan', 'sanitizeScan', 'diagnosticsSnapshot', 'publishDiagnosticsSnapshot', 'incrementCodeCount', 'getStopReasonLabel', 'pickCommandCounts', 'pickCommandLabels', 'cloneCommandActions', 'cloneControlFlowTarget', 'cloneBranchActions', 'cloneCommandTable', 'cloneConsumedCommands', 'cloneDiagnosticValue', 'reasonFromLabel', 'positiveInteger', 'finiteNumber', 'integerIndex', 'nullableFiniteNumber', 'nonEmptyString'].map((name) => [name, callPart(name)]));
    
    function sortBlocksForPriority(blocks) {
            blocks.sort((left, right) => {
                const returnPriority = compareNumbers(left.returnPriority, right.returnPriority);
                if (returnPriority) return returnPriority;
                const distance = compareNumbers(left.priorityDistance, right.priorityDistance);
                if (distance) return distance;
                const depth = compareNumbers(left.branchDepth, right.branchDepth);
                if (depth) return depth;
                const branchPath = compareBranchPaths(left.branchPath, right.branchPath);
                if (branchPath) return branchPath;
                return compareNumbers(left.scanSequence, right.scanSequence);
            });
        }
    
    function attachPathContextToBlock(block, path, diagnostics) {
            block.priorityDistance = Math.max(0, Math.floor(Number(path.messageDistance) || 0));
            block.branchDepth = Math.max(0, Math.floor(Number(path.branchDepth) || 0));
            block.branchPath = Array.isArray(path.branchPath) ? path.branchPath.slice() : [];
            block.returnPriority = Math.max(0, Math.floor(Number(path.returnPriority) || 0));
            attachHiddenArray(block, '__returnGuards', path.returnGuards);
            block.scanSequence = diagnostics.blockSequence;
            diagnostics.blockSequence += 1;
            return block;
        }
    
    function createScanPath(options = {}) {
            return {
                frames: Array.isArray(options.frames) ? options.frames : [],
                budget: options.budget || createBudgetState(0, 0),
                messageDistance: Math.max(0, Math.floor(Number(options.messageDistance) || 0)),
                returnPriority: Math.max(0, Math.floor(Number(options.returnPriority) || 0)),
                branchDepth: Math.max(0, Math.floor(Number(options.branchDepth) || 0)),
                branchPath: Array.isArray(options.branchPath) ? options.branchPath.slice() : [],
                returnStops: cloneReturnStops(options.returnStops),
                returnGuards: cloneIntegerList(options.returnGuards),
                visited: [],
                done: false,
            };
        }
    
    function createBranchScanPath(parentPath, parentFrame, target, allocation, branchIndex, branchCount, metadata) {
            const parentFrames = cloneScanFrames(parentPath.frames);
            const parentResume = parentFrames[parentFrames.length - 1];
            if (parentResume) parentResume.index = target.joinIndex;
            const branchPath = (Array.isArray(parentPath.branchPath) ? parentPath.branchPath : []).concat(branchIndex);
            const suffix = `branch:${target.ownerIndex}:${branchIndex}`;
            parentFrames.push(createScanFrame({
                list: parentFrame.list,
                index: target.startIndex,
                endIndex: target.endIndex,
                expectedIndent: target.bodyIndent,
                interpreterId: `${parentFrame.interpreterId || parentFrame.listId || 'event'}:${suffix}`,
                listId: `${parentFrame.listId || parentFrame.interpreterId || 'event'}:${suffix}`,
                parentInterpreterId: parentFrame.interpreterId,
                parentListId: parentFrame.listId,
                parentCommandIndex: target.ownerIndex,
                parentCommandCode: Number(metadata && metadata.code),
                branchLabel: target.label,
                branchIndex,
                branchCount,
                resumeBranchDepth: parentPath.branchDepth,
                resumeBranchPath: Array.isArray(parentPath.branchPath) ? parentPath.branchPath.slice() : [],
            }));
            return createScanPath({
                frames: parentFrames,
                budget: createBudgetState(allocation, allocation),
                messageDistance: parentPath.messageDistance,
                returnPriority: parentPath.returnPriority,
                branchDepth: parentPath.branchDepth + 1,
                branchPath,
                returnStops: cloneReturnStops(parentPath.returnStops),
                returnGuards: cloneIntegerList(parentPath.returnGuards),
            });
        }
    
    function cloneScanFrames(frames) {
            return Array.isArray(frames) ? frames.map(cloneScanFrame) : [];
        }
    
    function cloneScanFrame(frame) {
            return createScanFrame({
                list: frame && frame.list,
                index: frame && frame.index,
                endIndex: frame && frame.endIndex,
                expectedIndent: frame && frame.expectedIndent,
                interpreterId: frame && frame.interpreterId,
                listId: frame && frame.listId,
                commonEventId: frame && frame.commonEventId,
                commonEventName: frame && frame.commonEventName,
                parentInterpreterId: frame && frame.parentInterpreterId,
                parentListId: frame && frame.parentListId,
                parentCommandIndex: frame && frame.parentCommandIndex,
                parentCommandCode: frame && frame.parentCommandCode,
                nestedListType: frame && frame.nestedListType,
                nestedListName: frame && frame.nestedListName,
                nestedListPath: frame && frame.nestedListPath,
                nestedListIndex: frame && frame.nestedListIndex,
                branchLabel: frame && frame.branchLabel,
                branchIndex: frame && frame.branchIndex,
                branchCount: frame && frame.branchCount,
                resumeBranchDepth: frame && frame.resumeBranchDepth,
                resumeBranchPath: frame && frame.resumeBranchPath,
                pendingNestedFrames: frame && frame.pendingNestedFrames,
            });
        }
    
    function getPathIndex(path) {
            const frames = path && Array.isArray(path.frames) ? path.frames : [];
            const frame = frames[frames.length - 1];
            return Number.isFinite(Number(frame && frame.index)) ? Number(frame.index) : 0;
        }
    
    function isFrameExhausted(frame) {
            if (!frame || !Array.isArray(frame.list)) return true;
            const index = Number(frame.index);
            if (!Number.isFinite(index) || index < 0 || index >= frame.list.length) return true;
            return frame.endIndex !== null
                && frame.endIndex !== undefined
                && Number.isFinite(Number(frame.endIndex))
                && index >= Number(frame.endIndex);
        }
    
    function hasVisitedPathPosition(path, frame, index) {
            const visited = path && Array.isArray(path.visited) ? path.visited : [];
            const branchKey = createBranchPathKey(path && path.branchPath);
            return visited.some((entry) => (
                entry
                && entry.list === frame.list
                && entry.index === index
                && entry.branchKey === branchKey
            ));
        }
    
    function rememberPathPosition(path, frame, index) {
            if (!path) return;
            if (!Array.isArray(path.visited)) path.visited = [];
            path.visited.push({
                list: frame.list,
                index,
                branchKey: createBranchPathKey(path.branchPath),
            });
        }
    
    function stopScanPath(path, diagnostics, stopReason, index, metadata = null, options = {}) {
            if (path) path.done = true;
            markBlockedReturnGuards(path, diagnostics, stopReason);
            const stop = {
                index: finiteNumber(index),
                stopReason: nonEmptyString(stopReason) || 'barrier-command',
                branchDepth: Math.max(0, Math.floor(Number(path && path.branchDepth) || 0)),
                branchPath: Array.isArray(path && path.branchPath) ? path.branchPath.slice() : [],
                code: metadata ? metadata.code : null,
                label: metadata ? metadata.label : '',
                controlFlowTarget: options.controlFlowTarget,
            };
            appendPathStop(diagnostics, stop);
            if (metadata && isBarrierStopReason(stop.stopReason) && diagnostics && diagnostics.barrierCode === null) {
                diagnostics.barrierCode = metadata.code;
                diagnostics.barrierLabel = metadata.label;
            }
            return { requeue: false, index };
        }

    function markBlockedReturnGuards(path, diagnostics, stopReason) {
            const reason = nonEmptyString(stopReason);
            const returnStops = Array.isArray(path && path.returnStops) ? path.returnStops : [];
            if (!diagnostics || !reason || !returnStops.length || !isBarrierStopReason(reason)) return;
            if (!diagnostics.blockedReturnGuards || typeof diagnostics.blockedReturnGuards !== 'object') {
                diagnostics.blockedReturnGuards = {};
            }
            returnStops.forEach((stop) => {
                const guardId = Math.max(0, Math.floor(Number(stop && stop.guardId) || 0));
                if (guardId) diagnostics.blockedReturnGuards[String(guardId)] = reason;
            });
        }
    
    function appendPathStop(diagnostics, stop) {
            if (!diagnostics) return;
            if (!Array.isArray(diagnostics.pathStops)) diagnostics.pathStops = [];
            diagnostics.pathStops.push({
                index: finiteNumber(stop && stop.index),
                stopReason: nonEmptyString(stop && stop.stopReason) || '',
                stopReasonLabel: getStopReasonLabel(stop && stop.stopReason),
                branchDepth: Math.max(0, Math.floor(Number(stop && stop.branchDepth) || 0)),
                branchPath: Array.isArray(stop && stop.branchPath) ? stop.branchPath.slice() : [],
                code: stop && stop.code === null ? null : finiteNumber(stop && stop.code),
                label: nonEmptyString(stop && stop.label),
                controlFlowTarget: cloneControlFlowTarget(stop && stop.controlFlowTarget),
            });
        }
    
    function createBranchPathStop(parentPath, target, stopReason, index, metadata) {
            return {
                index,
                stopReason,
                branchDepth: Math.max(0, Math.floor(Number(parentPath && parentPath.branchDepth) || 0)) + 1,
                branchPath: (Array.isArray(parentPath && parentPath.branchPath) ? parentPath.branchPath : []).concat(
                    Number.isFinite(Number(target && target.branchIndex)) ? Number(target.branchIndex) : 0
                ),
                code: metadata ? metadata.code : null,
                label: metadata ? metadata.label : '',
            };
        }
    
    function isBarrierStopReason(stopReason) {
            const reason = nonEmptyString(stopReason);
            return reason
                && reason !== 'event-end'
                && reason !== 'budget-limit'
                && reason !== 'message-limit'
                && reason !== 'scan-limit';
        }
    
    function compareNumbers(left, right) {
            const a = Number.isFinite(Number(left)) ? Number(left) : 0;
            const b = Number.isFinite(Number(right)) ? Number(right) : 0;
            return a === b ? 0 : (a < b ? -1 : 1);
        }
    
    function compareBranchPaths(left, right) {
            const a = Array.isArray(left) ? left : [];
            const b = Array.isArray(right) ? right : [];
            const length = Math.max(a.length, b.length);
            for (let index = 0; index < length; index += 1) {
                const diff = compareNumbers(a[index] || 0, b[index] || 0);
                if (diff) return diff;
            }
            return 0;
        }
    
    function createBranchPathKey(branchPath) {
            return Array.isArray(branchPath) ? branchPath.join('.') : '';
        }

    function cloneReturnStops(stops) {
            if (!Array.isArray(stops)) return [];
            return stops.map((stop) => ({
                depth: Math.max(0, Math.floor(Number(stop && stop.depth) || 0)),
                guardId: Math.max(0, Math.floor(Number(stop && stop.guardId) || 0)),
            })).filter((stop) => stop.depth > 0 && stop.guardId > 0);
        }

    function cloneIntegerList(values) {
            if (!Array.isArray(values)) return [];
            return values
                .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
                .filter((value) => value > 0);
        }

    function attachHiddenArray(target, propertyName, values) {
            if (!target || !Array.isArray(values) || !values.length) return;
            const copy = cloneIntegerList(values);
            if (!copy.length) return;
            try {
                Object.defineProperty(target, propertyName, {
                    value: copy,
                    enumerable: false,
                    configurable: true,
                });
            } catch (_) {
                target[propertyName] = copy;
            }
        }
    
    function parseMessageCommandBlock(list, startIndex, interpreterId) {
            const command = list[startIndex];
            if (!command || !isEventScanBehavior(command, 'message')) return null;
            const indent = Number(command.indent) || 0;
            const lines = [];
            let index = startIndex + 1;
            while (index < list.length && list[index] && isEventScanBehavior(list[index], 'message-line')) {
                if ((Number(list[index].indent) || 0) !== indent) break;
                const params = Array.isArray(list[index].parameters) ? list[index].parameters : [];
                lines.push(String(params[0] ?? ''));
                index += 1;
            }
            return {
                startIndex,
                nextIndex: index,
                indent,
                rawText: lines.join('\n'),
                interpreterId,
            };
        }
    
    Object.assign(parts, { sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, cloneScanFrame, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, stopScanPath, appendPathStop, createBranchPathStop, isBarrierStopReason, compareNumbers, compareBranchPaths, createBranchPathKey, parseMessageCommandBlock });

})();
