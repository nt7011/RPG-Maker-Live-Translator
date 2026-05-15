// Linear and branch-aware message block scanning.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const callPart = (name) => (...args) => parts[name](...args);
    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    const { createGameMessageForesight, collectUpcomingMessageBlocks, getSnapshot, publishSnapshot, clearSnapshot, loadCommandCatalog, normalizeCommandTable, normalizeCommandMetadata, getEventCommandMetadata, getMovementRouteCommandMetadata, isEventScanBehavior, normalizeClassification, normalizeScanBehavior, normalizeStalenessRisk, isTransparentClassification, hasStalenessRisk, resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame, sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, cloneScanFrame, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, stopScanPath, appendPathStop, createBranchPathStop, isBarrierStopReason, compareNumbers, compareBranchPaths, createBranchPathKey, parseMessageCommandBlock, readNestedListCommand, readEmbeddedNestedListCommand, createEmbeddedNestedListInfo, createEmbeddedNestedListFrame, isEventCommandList, isEventCommandLike, nestedListNameFromPath, createScanFrame, createFrameListContext, attachFrameContextToBlock, resolveCommonEvent, hasCommonEventInStack, hasEventListInStack, getCurrentInterpreterId, getCurrentListId, finishCurrentFrame, pushNestedFrames, pushNextPendingNestedFrame, readTransparentCommand, readMovementRouteCommand, getMovementRouteCommands, getMovementRouteNextIndex, findRouteBarrierCommand, resolveControlFlowTarget, resolveJumpToLabelTarget, resolveLoopStartTarget, resolveBreakLoopTarget, resolveRepeatAboveTarget, findMatchingLoopRepeatIndex, findBreakLoopRepeatIndex, findMatchingLoopStartIndex, createControlFlowTarget, readBranchCommand, readDelimitedBranchCommand, readConditionalBranchCommand, findBranchEndIndex, createBranchTarget, findNextBranchBoundary, createBranchBudgetPlaceholders, describeBranchTargets, describeChoiceBranches, describeConditionalBranches, describeBattleBranches, collectBranchHeaders, getBranchHeaderLabel, splitBudgetAcrossBranches, createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createRouteCommandActions, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels, cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneCommandTable, cloneConsumedCommands, cloneDiagnosticValue, reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString } = Object.fromEntries(['createGameMessageForesight', 'collectUpcomingMessageBlocks', 'getSnapshot', 'publishSnapshot', 'clearSnapshot', 'loadCommandCatalog', 'normalizeCommandTable', 'normalizeCommandMetadata', 'getEventCommandMetadata', 'getMovementRouteCommandMetadata', 'isEventScanBehavior', 'normalizeClassification', 'normalizeScanBehavior', 'normalizeStalenessRisk', 'isTransparentClassification', 'hasStalenessRisk', 'resolveMessageOrigin', 'isGeneratedMessageOrigin', 'resolveOriginFrames', 'resolveOriginFrame', 'sortBlocksForPriority', 'attachPathContextToBlock', 'createScanPath', 'createBranchScanPath', 'cloneScanFrames', 'cloneScanFrame', 'getPathIndex', 'isFrameExhausted', 'hasVisitedPathPosition', 'rememberPathPosition', 'stopScanPath', 'appendPathStop', 'createBranchPathStop', 'isBarrierStopReason', 'compareNumbers', 'compareBranchPaths', 'createBranchPathKey', 'parseMessageCommandBlock', 'readNestedListCommand', 'readEmbeddedNestedListCommand', 'createEmbeddedNestedListInfo', 'createEmbeddedNestedListFrame', 'isEventCommandList', 'isEventCommandLike', 'nestedListNameFromPath', 'createScanFrame', 'createFrameListContext', 'attachFrameContextToBlock', 'resolveCommonEvent', 'hasCommonEventInStack', 'hasEventListInStack', 'getCurrentInterpreterId', 'getCurrentListId', 'finishCurrentFrame', 'pushNestedFrames', 'pushNextPendingNestedFrame', 'readTransparentCommand', 'readMovementRouteCommand', 'getMovementRouteCommands', 'getMovementRouteNextIndex', 'findRouteBarrierCommand', 'resolveControlFlowTarget', 'resolveJumpToLabelTarget', 'resolveLoopStartTarget', 'resolveBreakLoopTarget', 'resolveRepeatAboveTarget', 'findMatchingLoopRepeatIndex', 'findBreakLoopRepeatIndex', 'findMatchingLoopStartIndex', 'createControlFlowTarget', 'readBranchCommand', 'readDelimitedBranchCommand', 'readConditionalBranchCommand', 'findBranchEndIndex', 'createBranchTarget', 'findNextBranchBoundary', 'createBranchBudgetPlaceholders', 'describeBranchTargets', 'describeChoiceBranches', 'describeConditionalBranches', 'describeBattleBranches', 'collectBranchHeaders', 'getBranchHeaderLabel', 'splitBudgetAcrossBranches', 'createBudgetState', 'createInitialBudgetSnapshot', 'hasBudgetRemaining', 'spendBudget', 'createBudgetSnapshot', 'cloneBudgetSnapshot', 'createActionBudgetSnapshot', 'createBranchBudgetSnapshot', 'createBlockDiagnostics', 'recordCommandAction', 'appendCommandAction', 'createConsumedEventCommands', 'createRouteCommandActions', 'createDiagnostics', 'recordScan', 'sanitizeScan', 'diagnosticsSnapshot', 'publishDiagnosticsSnapshot', 'incrementCodeCount', 'getStopReasonLabel', 'pickCommandCounts', 'pickCommandLabels', 'cloneCommandActions', 'cloneControlFlowTarget', 'cloneBranchActions', 'cloneCommandTable', 'cloneConsumedCommands', 'cloneDiagnosticValue', 'reasonFromLabel', 'positiveInteger', 'finiteNumber', 'integerIndex', 'nullableFiniteNumber', 'nonEmptyString'].map((name) => [name, callPart(name)]));
    
    function collectLinearMessageBlocks(list, startIndex, interpreterId, baseIndent = null, maxMessages, maxScanCommands, budgetLimit, originFrames = null, options = {}) {
            const scanBudget = createBudgetState(budgetLimit, maxMessages);
            const rootPathBudget = createBudgetState(budgetLimit, maxMessages);
            const blocks = [];
            const frames = cloneScanFrames(originFrames);
            if (!frames.length) {
                frames.push(createScanFrame({
                    list,
                    index: startIndex,
                    expectedIndent: Number.isFinite(Number(baseIndent)) ? Number(baseIndent) : null,
                    interpreterId,
                    listId: interpreterId || 'event',
                }));
            }
            // Paths are disposable predictions. Every public scan starts from a fresh
            // verified message origin, so branch failure here cannot poison later scans.
            const pendingPaths = [];
            const queuedPathKeys = createQueuedPathRegistry();
            enqueueScanPath(pendingPaths, queuedPathKeys, createScanPath({
                budget: rootPathBudget,
                frames,
            }));
            const diagnostics = createScanDiagnostics(interpreterId, startIndex, scanBudget, options);
            const blockLimit = getFinalBlockLimit(scanBudget, maxMessages);
            let index = startIndex;
    
            while (pendingPaths.length
                && diagnostics.scannedCommands < maxScanCommands
                && canScanMorePaths(blocks, blockLimit, pendingPaths)) {
                const path = shiftNextScanPath(pendingPaths, blocks, blockLimit);
                if (!path || path.done) continue;
                const result = scanPathUntilYield(path, diagnostics, blocks, blockLimit, maxScanCommands);
                if (Number.isFinite(Number(result && result.index))) index = Number(result.index);
                if (result && Array.isArray(result.newPaths) && result.newPaths.length) {
                    result.newPaths.forEach((newPath) => {
                        enqueueScanPath(pendingPaths, queuedPathKeys, newPath);
                    });
                }
                if (result && result.requeue) enqueueScanPath(pendingPaths, queuedPathKeys, path);
            }
    
            const blockedPredictions = filterBlockedReturnGuardPredictions(blocks, diagnostics);
            sortBlocksForPriority(blocks);
            if (blocks.length > blockLimit) blocks.splice(blockLimit);
            applyFinalBudgetToBlocks(blocks, scanBudget);
            diagnostics.budget = createBudgetSnapshot(scanBudget);
            blocks.forEach((block) => {
                if (block.foresightDiagnostics && typeof block.foresightDiagnostics === 'object') {
                    block.foresightDiagnostics.budget = cloneBudgetSnapshot(block.foresightBudget);
                    block.foresightDiagnostics.priorityOffset = block.priorityOffset;
                }
            });
            if (!diagnostics.stopReason) {
                diagnostics.stopReason = selectScanStopReason(diagnostics, blocks, maxMessages, maxScanCommands, pendingPaths, {
                    blockedPredictions,
                });
            }
            diagnostics.stopReasonLabel = getStopReasonLabel(diagnostics.stopReason);
            diagnostics.stopIndex = index;
            diagnostics.blocks = blocks.length;
            if (!blocks.length && diagnostics.status === 'scanned') diagnostics.status = 'blocked';
            return { blocks, diagnostics };
        }
    
    function createScanDiagnostics(interpreterId, startIndex, budget, options = {}) {
            const captureCommandActions = options.captureCommandActions !== false;
            return {
                interpreterId: interpreterId || '',
                status: 'scanned',
                startIndex,
                stopIndex: startIndex,
                stopReason: '',
                stopReasonLabel: '',
                barrierCode: null,
                barrierLabel: '',
                scannedCommands: 0,
                advancedCommands: 0,
                transparentCommands: {},
                transparentCommandLabels: {},
                staleRiskCommands: 0,
                staleRiskCommandCounts: {},
                staleRiskCommandLabels: {},
                routeCommands: 0,
                routeBarriers: 0,
                routeBarrierCode: null,
                routeBarrierLabel: '',
                routeBarrierReason: '',
                commandActions: captureCommandActions ? [] : null,
                captureCommandActions,
                commandActionLimit: DIAGNOSTIC_ACTION_LIMIT,
                commandActionsTruncated: 0,
                pathStops: [],
                blockedReturnGuards: {},
                budget: createBudgetSnapshot(budget),
                blocks: 0,
                blockSequence: 0,
            };
        }

    function filterBlockedReturnGuardPredictions(blocks, diagnostics) {
            const blocked = diagnostics && diagnostics.blockedReturnGuards;
            let removed = 0;
            if (!blocked || typeof blocked !== 'object') return removed;
            if (Array.isArray(diagnostics.commandActions)) {
                diagnostics.commandActions = diagnostics.commandActions.filter((action) => {
                    const blockedAction = hasBlockedReturnGuard(action && action.__returnGuards, blocked);
                    if (blockedAction) removed += 1;
                    return !blockedAction;
                });
            }
            if (!Array.isArray(blocks) || !blocks.length) return removed;
            for (let index = blocks.length - 1; index >= 0; index -= 1) {
                if (hasBlockedReturnGuard(blocks[index] && blocks[index].__returnGuards, blocked)) {
                    blocks.splice(index, 1);
                    removed += 1;
                }
            }
            return removed;
        }

    function hasBlockedReturnGuard(returnGuards, blocked) {
            if (!Array.isArray(returnGuards) || !returnGuards.length) return false;
            return returnGuards.some((guard) => {
                const guardId = Math.max(0, Math.floor(Number(guard) || 0));
                return guardId > 0 && Boolean(blocked[String(guardId)]);
            });
        }

    function getFinalBlockLimit(budget, maxMessages) {
            const budgetLimit = Math.max(0, Math.floor(Number(budget && budget.limit) || 0));
            const messageLimit = Math.max(0, Math.floor(Number(maxMessages) || 0));
            if (!budgetLimit) return messageLimit;
            if (!messageLimit) return budgetLimit;
            return Math.min(budgetLimit, messageLimit);
        }

    function applyFinalBudgetToBlocks(blocks, budget) {
            if (!budget || typeof budget !== 'object') return;
            budget.spent = 0;
            budget.remaining = Math.max(0, Math.floor(Number(budget.limit) || 0));
            if (!Array.isArray(blocks)) return;
            blocks.forEach((block, priorityOffset) => {
                block.priorityOffset = priorityOffset;
                spendBudget(budget, MESSAGE_BUDGET_COST);
                block.foresightBudget = createBudgetSnapshot(budget);
            });
        }

    function canScanMorePaths(blocks, maxMessages, pendingPaths) {
            if (!Array.isArray(blocks) || blocks.length < maxMessages) return true;
            return hasPendingReturnGuardValidation(blocks, pendingPaths);
        }

    function shiftNextScanPath(pendingPaths, blocks, maxMessages) {
            if (!Array.isArray(pendingPaths) || !pendingPaths.length) return null;
            if (!Array.isArray(blocks) || blocks.length < maxMessages) return pendingPaths.shift();
            const guards = collectPredictionReturnGuards(blocks);
            if (!guards.size) return pendingPaths.shift();
            const index = pendingPaths.findIndex((path) => pathValidatesReturnGuard(path, guards));
            if (index <= 0) return pendingPaths.shift();
            return pendingPaths.splice(index, 1)[0];
        }

    function hasPendingReturnGuardValidation(blocks, pendingPaths) {
            if (!Array.isArray(pendingPaths) || !pendingPaths.length) return false;
            const guards = collectPredictionReturnGuards(blocks);
            if (!guards.size) return false;
            return pendingPaths.some((path) => pathValidatesReturnGuard(path, guards));
        }

    function collectPredictionReturnGuards(blocks) {
            const guards = new Set();
            if (!Array.isArray(blocks)) return guards;
            blocks.forEach((block) => {
                const returnGuards = Array.isArray(block && block.__returnGuards)
                    ? block.__returnGuards
                    : [];
                returnGuards.forEach((guard) => {
                    const guardId = Math.max(0, Math.floor(Number(guard) || 0));
                    if (guardId > 0) guards.add(guardId);
                });
            });
            return guards;
        }

    function pathValidatesReturnGuard(path, guards) {
            if (!guards || !guards.size) return false;
            const returnStops = Array.isArray(path && path.returnStops) ? path.returnStops : [];
            return returnStops.some((stop) => {
                const guardId = Math.max(0, Math.floor(Number(stop && stop.guardId) || 0));
                return guardId > 0 && guards.has(guardId);
            });
        }

    function pathHasAnyReturnStop(path) {
            const returnStops = Array.isArray(path && path.returnStops) ? path.returnStops : [];
            return returnStops.some((stop) => Math.max(0, Math.floor(Number(stop && stop.guardId) || 0)) > 0);
        }

    function createConsumedCommandsForDiagnostics(diagnostics, list, startIndex, nextIndex) {
            return diagnostics && diagnostics.captureCommandActions === false
                ? []
                : createConsumedEventCommands(list, startIndex, nextIndex);
        }

    const queuedPathListIds = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    let nextQueuedPathListId = 1;
    let nextReturnGuardId = 1;

    function createQueuedPathRegistry() {
            return typeof Map !== 'undefined' ? new Map() : new Set();
        }

    function enqueueScanPath(pendingPaths, queuedPathKeys, path) {
            if (!Array.isArray(pendingPaths) || !path || path.done) return false;
            const key = createQueuedPathKey(path);
            if (key && queuedPathKeys) {
                const existingPath = getQueuedPath(queuedPathKeys, key);
                if (existingPath) {
                    if (pendingPaths.indexOf(existingPath) >= 0) mergeQueuedScanPath(existingPath, path);
                    return false;
                }
                rememberQueuedPath(queuedPathKeys, key, path);
            }
            pendingPaths.push(path);
            return true;
        }

    function getQueuedPath(registry, key) {
            if (!registry || !key) return null;
            if (typeof registry.get === 'function') return registry.get(key) || null;
            return typeof registry.has === 'function' && registry.has(key) ? true : null;
        }

    function rememberQueuedPath(registry, key, path) {
            if (!registry || !key) return;
            if (typeof registry.set === 'function') {
                registry.set(key, path);
                return;
            }
            if (typeof registry.add === 'function') registry.add(key);
        }

    function mergeQueuedScanPath(target, source) {
            if (!target || !source) return false;
            const mergedBudget = mergeStrongerBudget(target.budget, source.budget);
            const sourceDistance = Math.max(0, Math.floor(Number(source.messageDistance) || 0));
            const targetDistance = Math.max(0, Math.floor(Number(target.messageDistance) || 0));
            if (sourceDistance < targetDistance) target.messageDistance = sourceDistance;
            if (compareNumbers(source.branchDepth, target.branchDepth) < 0) {
                target.branchDepth = Math.max(0, Math.floor(Number(source.branchDepth) || 0));
            }
            if (compareBranchPaths(source.branchPath, target.branchPath) < 0) {
                target.branchPath = Array.isArray(source.branchPath) ? source.branchPath.slice() : [];
            }
            mergeReturnStopsInto(target, source);
            mergeReturnGuardsInto(target, source);
            mergeVisitedPositionsInto(target, source);
            return mergedBudget;
        }

    function mergeStrongerBudget(targetBudget, sourceBudget) {
            if (!targetBudget || !sourceBudget) return false;
            const sourceRemaining = Math.max(0, Math.floor(Number(sourceBudget.remaining) || 0));
            const targetRemaining = Math.max(0, Math.floor(Number(targetBudget.remaining) || 0));
            const sourceSpent = Math.max(0, Math.floor(Number(sourceBudget.spent) || 0));
            const targetSpent = Math.max(0, Math.floor(Number(targetBudget.spent) || 0));
            if (sourceRemaining < targetRemaining) return false;
            if (sourceRemaining === targetRemaining && sourceSpent >= targetSpent) return false;
            const snapshot = clonePathBudget(sourceBudget);
            Object.keys(snapshot).forEach((key) => {
                targetBudget[key] = snapshot[key];
            });
            return true;
        }

    function mergeReturnStopsInto(target, source) {
            if (!Array.isArray(target.returnStops)) target.returnStops = [];
            const seen = new Set(target.returnStops.map((stop) => createReturnStopMergeKey(stop)));
            (Array.isArray(source.returnStops) ? source.returnStops : []).forEach((stop) => {
                const key = createReturnStopMergeKey(stop);
                if (!key || seen.has(key)) return;
                seen.add(key);
                target.returnStops.push({
                    depth: Math.max(0, Math.floor(Number(stop && stop.depth) || 0)),
                    guardId: Math.max(0, Math.floor(Number(stop && stop.guardId) || 0)),
                });
            });
        }

    function mergeReturnGuardsInto(target, source) {
            if (!Array.isArray(target.returnGuards)) target.returnGuards = [];
            const seen = new Set(target.returnGuards.map((guard) => Math.max(0, Math.floor(Number(guard) || 0))));
            (Array.isArray(source.returnGuards) ? source.returnGuards : []).forEach((guard) => {
                const guardId = Math.max(0, Math.floor(Number(guard) || 0));
                if (!guardId || seen.has(guardId)) return;
                seen.add(guardId);
                target.returnGuards.push(guardId);
            });
        }

    function mergeVisitedPositionsInto(target, source) {
            if (!Array.isArray(target.visited)) target.visited = [];
            const seen = new Set(target.visited.map(createVisitedPositionKey).filter(Boolean));
            (Array.isArray(source.visited) ? source.visited : []).forEach((entry) => {
                const key = createVisitedPositionKey(entry);
                if (!key || seen.has(key)) return;
                seen.add(key);
                target.visited.push({
                    list: entry.list,
                    index: entry.index,
                    branchKey: entry.branchKey,
                });
            });
        }

    function createReturnStopMergeKey(stop) {
            const depth = Math.max(0, Math.floor(Number(stop && stop.depth) || 0));
            const guardId = Math.max(0, Math.floor(Number(stop && stop.guardId) || 0));
            return depth > 0 && guardId > 0 ? `${depth}:${guardId}` : '';
        }

    function createVisitedPositionKey(entry) {
            if (!entry || !entry.list) return '';
            return `${getQueuedFrameListId(entry.list)}:${integerFrameValue(entry.index)}:${String(entry.branchKey || '')}`;
        }

    function createQueuedPathKey(path) {
            if (!queuedPathListIds) return '';
            const frames = path && Array.isArray(path.frames) ? path.frames : [];
            if (!frames.length) return '';
            // Branch identity is intentionally omitted so sibling paths that
            // rejoin the same frame stack only scan the shared continuation once.
            return [
                frames.map(createQueuedFrameKey).join('|'),
                integerFrameValue(path && path.returnPriority),
                createReturnStopKey(path && path.returnStops),
                createIntegerListKey(path && path.returnGuards),
            ].join('#');
        }

    function createQueuedFrameKey(frame) {
            const pending = frame && Array.isArray(frame.pendingNestedFrames)
                ? frame.pendingNestedFrames
                : [];
            const pendingKey = pending.length
                ? `[${pending.map(createQueuedFrameKey).join(',')}]`
                : '';
            return [
                getQueuedFrameListId(frame && frame.list),
                integerFrameValue(frame && frame.index),
                integerFrameValue(frame && frame.endIndex),
                integerFrameValue(frame && frame.expectedIndent),
                pendingKey,
            ].join(':');
        }

    function getQueuedFrameListId(list) {
            if (!list || typeof list !== 'object') return 'missing';
            let id = queuedPathListIds.get(list);
            if (!id) {
                id = nextQueuedPathListId;
                nextQueuedPathListId += 1;
                queuedPathListIds.set(list, id);
            }
            return `list:${id}`;
        }

    function integerFrameValue(value) {
            return Number.isFinite(Number(value)) ? String(Math.floor(Number(value))) : '';
        }

    function createReturnStopKey(returnStops) {
            if (!Array.isArray(returnStops) || !returnStops.length) return '';
            return returnStops.map((stop) => [
                integerFrameValue(stop && stop.depth),
                integerFrameValue(stop && stop.guardId),
            ].join(':')).join(',');
        }

    function createIntegerListKey(values) {
            if (!Array.isArray(values) || !values.length) return '';
            return values.map(integerFrameValue).join(',');
        }

    function finishScanFrame(path) {
            const frame = path && Array.isArray(path.frames)
                ? path.frames[path.frames.length - 1]
                : null;
            const wasBranchFrame = isBranchScanFrame(frame);
            const finished = finishCurrentFrame(path && path.frames);
            const stopAfterNestedReturn = finished
                && !wasBranchFrame
                && shouldStopAfterNestedReturn(path);
            if (stopAfterNestedReturn) path.done = true;
            if (finished && wasBranchFrame) {
                path.branchDepth = Number.isFinite(Number(frame.resumeBranchDepth))
                    ? Math.max(0, Math.floor(Number(frame.resumeBranchDepth)))
                    : Math.max(0, (Number(path.branchDepth) || 0) - 1);
                path.branchPath = Array.isArray(frame.resumeBranchPath)
                    ? frame.resumeBranchPath.slice()
                    : (Array.isArray(path.branchPath) ? path.branchPath.slice(0, -1) : []);
            }
            return {
                finished,
                stopAfterNestedReturn,
                shouldYield: finished && wasBranchFrame,
            };
        }

    function shouldStopAfterNestedReturn(path) {
            const returnStops = Array.isArray(path && path.returnStops) ? path.returnStops : [];
            if (!returnStops.length || !Array.isArray(path.frames)) return false;
            const stop = returnStops[returnStops.length - 1];
            if (path.frames.length !== Math.max(0, Math.floor(Number(stop && stop.depth) || 0))) return false;
            returnStops.pop();
            return true;
        }

    function isBranchScanFrame(frame) {
            return Number.isFinite(Number(frame && frame.branchCount))
                && Number(frame.branchCount) > 0
                && Number.isFinite(Number(frame && frame.parentCommandIndex));
        }

    function createNestedContinuationPath(path, nextIndex, guardId) {
            const frames = cloneScanFrames(path && path.frames);
            const frame = frames[frames.length - 1];
            if (!frame || !Number.isFinite(Number(nextIndex))) return null;
            frame.index = Math.max(0, Math.floor(Number(nextIndex)));
            return createScanPath({
                frames,
                budget: clonePathBudget(path && path.budget),
                messageDistance: Math.max(0, Math.floor(Number(path && path.messageDistance) || 0)),
                returnPriority: Math.max(0, Math.floor(Number(path && path.returnPriority) || 0)) + 1,
                branchDepth: Math.max(0, Math.floor(Number(path && path.branchDepth) || 0)),
                branchPath: Array.isArray(path && path.branchPath) ? path.branchPath.slice() : [],
                returnStops: cloneReturnStops(path && path.returnStops),
                returnGuards: cloneReturnGuards(path && path.returnGuards, guardId),
            });
        }

    function clonePathBudget(budget) {
            return cloneBudgetSnapshot(budget) || createBudgetState(0, 0);
        }

    function addNestedReturnStop(path, guardId) {
            if (!path || !Array.isArray(path.frames)) return false;
            const id = Math.max(0, Math.floor(Number(guardId) || 0));
            if (!id) return false;
            if (!Array.isArray(path.returnStops)) path.returnStops = [];
            path.returnStops.push({
                depth: path.frames.length,
                guardId: id,
            });
            return true;
        }

    function cloneReturnStops(returnStops) {
            if (!Array.isArray(returnStops)) return [];
            return returnStops.map((stop) => ({
                depth: Math.max(0, Math.floor(Number(stop && stop.depth) || 0)),
                guardId: Math.max(0, Math.floor(Number(stop && stop.guardId) || 0)),
            })).filter((stop) => stop.depth > 0 && stop.guardId > 0);
        }

    function cloneReturnGuards(returnGuards, guardId) {
            const guards = Array.isArray(returnGuards)
                ? returnGuards.map((guard) => Math.max(0, Math.floor(Number(guard) || 0))).filter((guard) => guard > 0)
                : [];
            const id = Math.max(0, Math.floor(Number(guardId) || 0));
            if (id) guards.push(id);
            return guards;
        }

    function createReturnGuardId() {
            const guardId = nextReturnGuardId;
            nextReturnGuardId += 1;
            return guardId;
        }
    
    function scanPathUntilYield(path, diagnostics, blocks, maxMessages, maxScanCommands) {
            let index = getPathIndex(path);
    
            while (path.frames.length
                && diagnostics.scannedCommands < maxScanCommands
                && (blocks.length < maxMessages || pathHasAnyReturnStop(path))
                && hasBudgetRemaining(path.budget)) {
                const frame = path.frames[path.frames.length - 1];
                if (!frame || !Array.isArray(frame.list)) {
                    return stopScanPath(path, diagnostics, 'missing-command', index);
                }
    
                index = frame.index;
                if (isFrameExhausted(frame)) {
                    const finished = finishScanFrame(path);
                    if (finished.finished) {
                        if (finished.stopAfterNestedReturn) return { requeue: false, index: getPathIndex(path) };
                        if (finished.shouldYield) return { requeue: true, index: getPathIndex(path) };
                        continue;
                    }
                    return stopScanPath(path, diagnostics, 'event-end', index);
                }
    
                const command = frame.list[index];
                if (!command) return stopScanPath(path, diagnostics, 'missing-command', index);
    
                const commandIndent = Number(command.indent) || 0;
                if (frame.expectedIndent === null) frame.expectedIndent = commandIndent;
                if (commandIndent !== frame.expectedIndent) {
                    return stopScanPath(path, diagnostics, 'indent-boundary', index, getEventCommandMetadata(command.code));
                }
    
                const metadata = getEventCommandMetadata(command.code);
                const code = metadata.code;
                if (hasVisitedPathPosition(path, frame, index)) {
                    return stopScanPath(path, diagnostics, 'path-cycle', index, metadata);
                }
                rememberPathPosition(path, frame, index);
    
                if (metadata.scanBehavior === 'frame-end') {
                    diagnostics.scannedCommands += 1;
                    recordCommandAction(diagnostics, path, {
                        index,
                        metadata,
                        action: 'frame-end',
                        stopReason: 'event-end',
                        listContext: createFrameListContext(frame),
                    });
                    frame.index += 1;
                    index = frame.index;
                    const finished = finishScanFrame(path);
                    if (finished.finished) {
                        if (finished.stopAfterNestedReturn) return { requeue: false, index: getPathIndex(path) };
                        if (finished.shouldYield) return { requeue: true, index: getPathIndex(path) };
                        continue;
                    }
                    return stopScanPath(path, diagnostics, 'event-end', index);
                }
    
                if (metadata.scanBehavior === 'message') {
                    const block = parseMessageCommandBlock(frame.list, index, frame.interpreterId);
                    if (!block || !block.rawText.trim()) {
                        diagnostics.scannedCommands += 1;
                        recordCommandAction(diagnostics, path, {
                            index,
                            metadata,
                            action: 'barrier',
                            stopReason: 'empty-message',
                            listContext: createFrameListContext(frame),
                        });
                        return stopScanPath(path, diagnostics, 'empty-message', index, metadata);
                    }
                    attachFrameContextToBlock(block, frame);
                    attachPathContextToBlock(block, path, diagnostics);
                    const budgetBefore = createBudgetSnapshot(path.budget);
                    spendBudget(path.budget, MESSAGE_BUDGET_COST);
                    diagnostics.budget = createBudgetSnapshot(path.budget);
                    diagnostics.scannedCommands += Math.max(1, block.nextIndex - index);
                    diagnostics.blocks += 1;
                    recordCommandAction(diagnostics, path, {
                        index,
                        metadata,
                        action: 'message',
                        budget: createActionBudgetSnapshot(budgetBefore, diagnostics.budget, MESSAGE_BUDGET_COST),
                        listContext: createFrameListContext(frame),
                        consumedCommands: createConsumedCommandsForDiagnostics(diagnostics, frame.list, index, block.nextIndex),
                    });
                    block.foresightBudget = createBudgetSnapshot(path.budget);
                    const blockDiagnostics = createBlockDiagnostics(diagnostics, block);
                    if (blockDiagnostics) block.foresightDiagnostics = blockDiagnostics;
                    blocks.push(block);
                    path.messageDistance += 1;
                    frame.index = block.nextIndex;
                    index = frame.index;
                    // Yield after each message so sibling branches get a chance to
                    // produce their first message before one path runs deep.
                    return { requeue: true, index };
                }
    
                if (metadata.classification === 'branching') {
                    return scanBranchCommand(path, diagnostics, frame, index, metadata);
                }
    
                if (metadata.scanBehavior === 'nested-list') {
                    const nested = readNestedListCommand(frame.list, index, frame.expectedIndent, metadata, path.frames);
                    if (nested.transparent) {
                        const consumed = Math.max(1, nested.nextIndex - index);
                        diagnostics.scannedCommands += consumed;
                        diagnostics.advancedCommands += consumed;
                        recordCommandAction(diagnostics, path, {
                            index,
                            metadata: nested.metadata,
                            action: 'nested-list',
                            listContext: createFrameListContext(frame),
                            nestedList: nested.nestedList,
                            nestedLists: nested.nestedLists,
                            consumedCommands: nested.consumedCommands || createConsumedCommandsForDiagnostics(diagnostics, frame.list, index, nested.nextIndex),
                        });
                        recordTransparentCommandDiagnostics(diagnostics, code, nested.metadata);
                        frame.index = nested.nextIndex;
                        index = frame.index;
                        const returnGuardId = createReturnGuardId();
                        const continuationPath = createNestedContinuationPath(path, nested.nextIndex, returnGuardId);
                        if (continuationPath) addNestedReturnStop(path, returnGuardId);
                        pushNestedFrames(path.frames, nested.frames || nested.frame, frame);
                        if (continuationPath) return { newPaths: [continuationPath, path], index: getPathIndex(path) };
                        return { requeue: true, index: getPathIndex(path) };
                    }
                    diagnostics.scannedCommands += 1;
                    recordCommandAction(diagnostics, path, {
                        index,
                        metadata,
                        action: 'barrier',
                        stopReason: nested.stopReason || 'nested-list-unavailable',
                        listContext: createFrameListContext(frame),
                        nestedList: nested.nestedList || null,
                        nestedLists: nested.nestedLists,
                        consumedCommands: nested.consumedCommands || createConsumedCommandsForDiagnostics(diagnostics, frame.list, index, index + 1),
                    });
                    return stopScanPath(path, diagnostics, nested.stopReason || 'nested-list-unavailable', index, metadata);
                }
    
                const transparentRead = readTransparentCommand(frame.list, index, frame.expectedIndent, path.frames, diagnostics);
                if (transparentRead.transparent) {
                    const consumed = Math.max(1, transparentRead.nextIndex - index);
                    diagnostics.scannedCommands += consumed;
                    diagnostics.advancedCommands += consumed;
                    recordTransparentCommandDiagnostics(diagnostics, code, transparentRead.metadata);
                    recordCommandAction(diagnostics, path, {
                        index,
                        metadata: transparentRead.metadata,
                        action: transparentRead.kind === 'movement-route'
                            ? 'movement-route'
                            : (transparentRead.kind === 'nested-list' ? 'nested-list' : 'advance'),
                        listContext: createFrameListContext(frame),
                        nestedList: transparentRead.nestedList,
                        nestedLists: transparentRead.nestedLists,
                        consumedCommands: transparentRead.consumedCommands || createConsumedCommandsForDiagnostics(diagnostics, frame.list, index, transparentRead.nextIndex),
                        routeCommandActions: transparentRead.routeCommandActions || [],
                    });
                    if (transparentRead.kind === 'movement-route') diagnostics.routeCommands += 1;
                    frame.index = transparentRead.nextIndex;
                    index = frame.index;
                    if (transparentRead.kind === 'nested-list') {
                        const returnGuardId = createReturnGuardId();
                        const continuationPath = createNestedContinuationPath(path, transparentRead.nextIndex, returnGuardId);
                        if (continuationPath) addNestedReturnStop(path, returnGuardId);
                        pushNestedFrames(path.frames, transparentRead.frames || transparentRead.frame, frame);
                        if (continuationPath) return { newPaths: [continuationPath, path], index: getPathIndex(path) };
                        return { requeue: true, index: getPathIndex(path) };
                    }
                    continue;
                }
    
                diagnostics.scannedCommands += 1;
                diagnostics.routeBarrierCode = transparentRead.routeBarrierCode || null;
                diagnostics.routeBarrierReason = transparentRead.routeBarrierReason || '';
                diagnostics.routeBarrierLabel = transparentRead.routeBarrierLabel || '';
                if (diagnostics.routeBarrierCode !== null) diagnostics.routeBarriers += 1;
                const budgetBefore = createBudgetSnapshot(path.budget);
                recordCommandAction(diagnostics, path, {
                    index,
                    metadata,
                    action: 'barrier',
                    stopReason: transparentRead.stopReason || 'barrier-command',
                    budget: createActionBudgetSnapshot(budgetBefore, budgetBefore, 0),
                    listContext: createFrameListContext(frame),
                    nestedList: transparentRead.nestedList,
                    nestedLists: transparentRead.nestedLists,
                    consumedCommands: transparentRead.consumedCommands || createConsumedCommandsForDiagnostics(diagnostics, frame.list, index, index + 1),
                    routeCommandActions: transparentRead.routeCommandActions || [],
                });
                return stopScanPath(path, diagnostics, transparentRead.stopReason || 'barrier-command', index, metadata);
            }
    
            if (!hasBudgetRemaining(path.budget)) return stopScanPath(path, diagnostics, 'budget-limit', index);
            if (blocks.length >= maxMessages) return stopScanPath(path, diagnostics, 'message-limit', index);
            return stopScanPath(path, diagnostics, 'scan-limit', index);
        }

    function recordTransparentCommandDiagnostics(diagnostics, code, metadata) {
            if (!diagnostics || diagnostics.captureCommandActions === false) return;
            incrementCodeCount(diagnostics.transparentCommands, code);
            diagnostics.transparentCommandLabels[String(code)] = metadata && metadata.label ? metadata.label : '';
            if (hasStalenessRisk(metadata)) {
                diagnostics.staleRiskCommands += 1;
                incrementCodeCount(diagnostics.staleRiskCommandCounts, code);
                diagnostics.staleRiskCommandLabels[String(code)] = metadata.label;
            }
        }
    
    function scanBranchCommand(path, diagnostics, frame, index, metadata) {
            if (path.branchDepth >= MAX_BRANCH_DEPTH) {
                diagnostics.scannedCommands += 1;
                recordCommandAction(diagnostics, path, {
                    index,
                    metadata,
                    action: 'barrier',
                    stopReason: 'branch-depth-limit',
                    listContext: createFrameListContext(frame),
                    consumedCommands: createConsumedCommandsForDiagnostics(diagnostics, frame.list, index, index + 1),
                });
                return stopScanPath(path, diagnostics, 'branch-depth-limit', index, metadata);
            }
    
            const branchRead = readBranchCommand(frame.list, index, frame.expectedIndent, metadata);
            const budgetBefore = createBudgetSnapshot(path.budget);
            diagnostics.scannedCommands += 1;
    
            if (!branchRead.transparent) {
                recordCommandAction(diagnostics, path, {
                    index,
                    metadata,
                    action: branchRead.stopReason === 'control-flow-target' ? 'control-flow' : 'barrier',
                    stopReason: branchRead.stopReason,
                    budget: createActionBudgetSnapshot(budgetBefore, budgetBefore, 0),
                    listContext: createFrameListContext(frame),
                    branches: branchRead.branches || [],
                    controlFlowTarget: branchRead.controlFlowTarget,
                    consumedCommands: createConsumedCommandsForDiagnostics(diagnostics, frame.list, index, index + 1),
                });
                return stopScanPath(path, diagnostics, branchRead.stopReason, index, metadata, {
                    controlFlowTarget: branchRead.controlFlowTarget,
                });
            }
    
            const allocations = splitBudgetAcrossBranches(path.budget && path.budget.remaining, branchRead.targets.length);
            const branches = branchRead.targets.map((target, branchIndex) => ({
                label: target.label,
                startIndex: target.startIndex,
                endIndex: target.endIndex,
                joinIndex: target.joinIndex,
                budget: createBranchBudgetSnapshot(path.budget, allocations[branchIndex] || 0, branchIndex, branchRead.targets.length),
                actions: [],
            }));
            recordCommandAction(diagnostics, path, {
                index,
                metadata,
                action: 'branch',
                budget: createActionBudgetSnapshot(budgetBefore, budgetBefore, 0),
                listContext: createFrameListContext(frame),
                branches,
                consumedCommands: createConsumedCommandsForDiagnostics(diagnostics, frame.list, index, index + 1),
            });
    
            const newPaths = [];
            branchRead.targets.forEach((target, branchIndex) => {
                const allocation = allocations[branchIndex] || 0;
                if (allocation <= 0) {
                    appendPathStop(diagnostics, createBranchPathStop(path, target, 'budget-limit', index, metadata));
                    return;
                }
                newPaths.push(createBranchScanPath(path, frame, target, allocation, branchIndex, branchRead.targets.length, metadata));
            });
            path.done = true;
            return { requeue: false, newPaths, index: branchRead.joinIndex };
        }
    
    function selectScanStopReason(diagnostics, blocks, maxMessages, maxScanCommands, pendingPaths, options = {}) {
            const stops = Array.isArray(diagnostics.pathStops) ? diagnostics.pathStops : [];
            if (Number(options.blockedPredictions) > 0 && Array.isArray(blocks) && !blocks.length) {
                const barrierStop = stops.find((stop) => stop && isBarrierStopReason(stop.stopReason));
                if (barrierStop) return barrierStop.stopReason;
            }
            if (diagnostics.scannedCommands >= maxScanCommands) return 'scan-limit';
            if (stops.some((stop) => stop && stop.stopReason === 'budget-limit')) return 'budget-limit';
            if (diagnostics.budget && Number(diagnostics.budget.remaining) <= 0) return 'budget-limit';
            if (blocks.length >= maxMessages) return 'message-limit';
            if (Array.isArray(pendingPaths) && pendingPaths.length) return 'scan-limit';
            const nonEventStop = stops.find((stop) => stop && stop.stopReason && stop.stopReason !== 'event-end');
            return nonEventStop ? nonEventStop.stopReason : 'event-end';
        }
    
    Object.assign(parts, { collectLinearMessageBlocks, createScanDiagnostics, scanPathUntilYield, scanBranchCommand, selectScanStopReason });

})();
