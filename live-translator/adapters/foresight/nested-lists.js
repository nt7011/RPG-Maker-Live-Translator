// Common-event, embedded-list, and transparent-command traversal.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const callPart = (name) => (...args) => parts[name](...args);
    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    const { createGameMessageForesight, collectUpcomingMessageBlocks, getSnapshot, publishSnapshot, clearSnapshot, loadCommandCatalog, normalizeCommandTable, normalizeCommandMetadata, getEventCommandMetadata, getMovementRouteCommandMetadata, isEventScanBehavior, normalizeClassification, normalizeScanBehavior, normalizeStalenessRisk, isTransparentClassification, hasStalenessRisk, resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame, collectLinearMessageBlocks, createScanDiagnostics, scanPathUntilYield, scanBranchCommand, selectScanStopReason, sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, cloneScanFrame, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, stopScanPath, appendPathStop, createBranchPathStop, isBarrierStopReason, compareNumbers, compareBranchPaths, createBranchPathKey, parseMessageCommandBlock, readMovementRouteCommand, getMovementRouteCommands, getMovementRouteNextIndex, findRouteBarrierCommand, resolveControlFlowTarget, resolveJumpToLabelTarget, resolveLoopStartTarget, resolveBreakLoopTarget, resolveRepeatAboveTarget, findMatchingLoopRepeatIndex, findBreakLoopRepeatIndex, findMatchingLoopStartIndex, createControlFlowTarget, readBranchCommand, readDelimitedBranchCommand, readConditionalBranchCommand, findBranchEndIndex, createBranchTarget, findNextBranchBoundary, createBranchBudgetPlaceholders, describeBranchTargets, describeChoiceBranches, describeConditionalBranches, describeBattleBranches, collectBranchHeaders, getBranchHeaderLabel, splitBudgetAcrossBranches, createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createRouteCommandActions, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels, cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneCommandTable, cloneConsumedCommands, cloneDiagnosticValue, reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString } = Object.fromEntries(['createGameMessageForesight', 'collectUpcomingMessageBlocks', 'getSnapshot', 'publishSnapshot', 'clearSnapshot', 'loadCommandCatalog', 'normalizeCommandTable', 'normalizeCommandMetadata', 'getEventCommandMetadata', 'getMovementRouteCommandMetadata', 'isEventScanBehavior', 'normalizeClassification', 'normalizeScanBehavior', 'normalizeStalenessRisk', 'isTransparentClassification', 'hasStalenessRisk', 'resolveMessageOrigin', 'isGeneratedMessageOrigin', 'resolveOriginFrames', 'resolveOriginFrame', 'collectLinearMessageBlocks', 'createScanDiagnostics', 'scanPathUntilYield', 'scanBranchCommand', 'selectScanStopReason', 'sortBlocksForPriority', 'attachPathContextToBlock', 'createScanPath', 'createBranchScanPath', 'cloneScanFrames', 'cloneScanFrame', 'getPathIndex', 'isFrameExhausted', 'hasVisitedPathPosition', 'rememberPathPosition', 'stopScanPath', 'appendPathStop', 'createBranchPathStop', 'isBarrierStopReason', 'compareNumbers', 'compareBranchPaths', 'createBranchPathKey', 'parseMessageCommandBlock', 'readMovementRouteCommand', 'getMovementRouteCommands', 'getMovementRouteNextIndex', 'findRouteBarrierCommand', 'resolveControlFlowTarget', 'resolveJumpToLabelTarget', 'resolveLoopStartTarget', 'resolveBreakLoopTarget', 'resolveRepeatAboveTarget', 'findMatchingLoopRepeatIndex', 'findBreakLoopRepeatIndex', 'findMatchingLoopStartIndex', 'createControlFlowTarget', 'readBranchCommand', 'readDelimitedBranchCommand', 'readConditionalBranchCommand', 'findBranchEndIndex', 'createBranchTarget', 'findNextBranchBoundary', 'createBranchBudgetPlaceholders', 'describeBranchTargets', 'describeChoiceBranches', 'describeConditionalBranches', 'describeBattleBranches', 'collectBranchHeaders', 'getBranchHeaderLabel', 'splitBudgetAcrossBranches', 'createBudgetState', 'createInitialBudgetSnapshot', 'hasBudgetRemaining', 'spendBudget', 'createBudgetSnapshot', 'cloneBudgetSnapshot', 'createActionBudgetSnapshot', 'createBranchBudgetSnapshot', 'createBlockDiagnostics', 'recordCommandAction', 'appendCommandAction', 'createConsumedEventCommands', 'createRouteCommandActions', 'createDiagnostics', 'recordScan', 'sanitizeScan', 'diagnosticsSnapshot', 'publishDiagnosticsSnapshot', 'incrementCodeCount', 'getStopReasonLabel', 'pickCommandCounts', 'pickCommandLabels', 'cloneCommandActions', 'cloneControlFlowTarget', 'cloneBranchActions', 'cloneCommandTable', 'cloneConsumedCommands', 'cloneDiagnosticValue', 'reasonFromLabel', 'positiveInteger', 'finiteNumber', 'integerIndex', 'nullableFiniteNumber', 'nonEmptyString'].map((name) => [name, callPart(name)]));
    
    function readNestedListCommand(list, index, expectedIndent, metadata, frames) {
            if (Number(metadata && metadata.code) !== 117) {
                return readEmbeddedNestedListCommand(list, index, metadata, frames) || {
                    transparent: false,
                    stopReason: 'nested-list-unavailable',
                    metadata,
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }

            const command = list[index];
            const params = Array.isArray(command && command.parameters) ? command.parameters : [];
            const commonEventId = positiveInteger(params[0], 0);
            const nestedList = {
                type: 'common-event',
                id: commonEventId || null,
                name: '',
                depth: Array.isArray(frames) ? frames.length : 1,
                length: 0,
            };
            if (!commonEventId) {
                return {
                    transparent: false,
                    stopReason: 'common-event-missing-id',
                    nestedList,
                    metadata,
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }
    
            const commonEvent = resolveCommonEvent(commonEventId);
            nestedList.name = nonEmptyString(commonEvent && commonEvent.name);
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                return {
                    transparent: false,
                    stopReason: 'common-event-missing-list',
                    nestedList,
                    metadata,
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }
    
            nestedList.length = commonEvent.list.length;
            if (hasCommonEventInStack(frames, commonEventId)) {
                return {
                    transparent: false,
                    stopReason: 'common-event-cycle',
                    nestedList,
                    metadata,
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }
    
            if (Array.isArray(frames) && frames.length >= MAX_NESTED_LIST_DEPTH) {
                return {
                    transparent: false,
                    stopReason: 'common-event-depth-limit',
                    nestedList,
                    metadata,
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }
    
            return {
                transparent: true,
                nextIndex: index + 1,
                kind: 'nested-list',
                nestedList,
                nestedLists: [nestedList],
                frame: createScanFrame({
                    list: commonEvent.list,
                    index: 0,
                    expectedIndent: 0,
                    interpreterId: `${getCurrentInterpreterId(frames)}:common:${commonEventId}`,
                    listId: `common:${commonEventId}`,
                    commonEventId,
                    commonEventName: nestedList.name,
                    parentCommandIndex: index,
                }),
                metadata,
                consumedCommands: createConsumedEventCommands(list, index, index + 1),
            };
        }
    
    function readEmbeddedNestedListCommand(list, index, metadata, frames) {
            const command = list[index];
            const specs = Array.isArray(metadata && metadata.nestedLists) ? metadata.nestedLists : [];
            if (!specs.length) return null;
            if (specs.length > MAX_NESTED_LISTS_PER_COMMAND) {
                return {
                    transparent: false,
                    stopReason: 'nested-list-limit',
                    metadata,
                    nestedLists: specs.slice(0, MAX_NESTED_LISTS_PER_COMMAND).map((entry, nestedIndex) => (
                        createEmbeddedNestedListInfo(resolveConfiguredNestedList(null, entry), frames, index, metadata, nestedIndex)
                    )),
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }
            const resolved = resolveConfiguredNestedLists(command, specs);
            if (resolved.unavailable.length) {
                return {
                    transparent: false,
                    stopReason: 'nested-list-unavailable',
                    metadata,
                    nestedList: createEmbeddedNestedListInfo(resolved.unavailable[0], frames, index, metadata, 0),
                    nestedLists: resolved.all.map((entry, nestedIndex) => (
                        createEmbeddedNestedListInfo(entry, frames, index, metadata, nestedIndex)
                    )),
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }
            const nestedEntries = resolved.available;
            if (!nestedEntries.length) return null;
            if (Array.isArray(frames) && frames.length >= MAX_NESTED_LIST_DEPTH) {
                return {
                    transparent: false,
                    stopReason: 'nested-list-depth-limit',
                    metadata,
                    nestedLists: nestedEntries.map((entry, nestedIndex) => (
                        createEmbeddedNestedListInfo(entry, frames, index, metadata, nestedIndex)
                    )),
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }
            const cycleEntry = nestedEntries.find((entry) => hasEventListInStack(frames, entry.list));
            if (cycleEntry) {
                return {
                    transparent: false,
                    stopReason: 'nested-list-cycle',
                    metadata,
                    nestedList: createEmbeddedNestedListInfo(cycleEntry, frames, index, metadata, 0),
                    nestedLists: nestedEntries.map((entry, nestedIndex) => (
                        createEmbeddedNestedListInfo(entry, frames, index, metadata, nestedIndex)
                    )),
                    consumedCommands: createConsumedEventCommands(list, index, index + 1),
                };
            }
    
            const nestedLists = nestedEntries.map((entry, nestedIndex) => (
                createEmbeddedNestedListInfo(entry, frames, index, metadata, nestedIndex)
            ));
            return {
                transparent: true,
                nextIndex: index + 1,
                kind: 'nested-list',
                metadata,
                nestedList: nestedLists[0] || null,
                nestedLists,
                frames: nestedEntries.map((entry, nestedIndex) => createEmbeddedNestedListFrame(entry, frames, index, metadata, nestedIndex)),
                consumedCommands: createConsumedEventCommands(list, index, index + 1),
            };
        }

    function resolveConfiguredNestedLists(command, specs) {
            const available = [];
            const unavailable = [];
            const all = [];
            specs.forEach((spec) => {
                const entry = resolveConfiguredNestedList(command, spec);
                all.push(entry);
                if (entry.list) {
                    available.push(entry);
                } else if (!(spec && spec.optional === true)) {
                    unavailable.push(entry);
                }
            });
            return { available, unavailable, all };
        }

    function resolveConfiguredNestedList(command, spec) {
            const path = nonEmptyString(spec && spec.path);
            const displayPath = createDisplayNestedListPath(path);
            const resolved = resolveNestedListPath(command, path);
            const list = resolved.found && isEventCommandList(resolved.value)
                ? resolved.value
                : null;
            return {
                list,
                path: displayPath,
                name: nonEmptyString(spec && spec.name) || nestedListNameFromPath(displayPath),
            };
        }

    function resolveNestedListPath(root, path) {
            const segments = parseNestedListPath(path);
            if (!segments.length) return { found: false, value: null };
            let value = root;
            for (let index = 0; index < segments.length; index += 1) {
                if (value === null || value === undefined) return { found: false, value: null };
                const segment = segments[index];
                if (!Object.prototype.hasOwnProperty.call(Object(value), segment)) {
                    return { found: false, value: null };
                }
                value = value[segment];
            }
            return { found: true, value };
        }

    function parseNestedListPath(path) {
            const source = nonEmptyString(path);
            if (!source) return [];
            const relative = source.indexOf('command.') === 0 ? source.slice('command.'.length) : source;
            const segments = [];
            let cursor = 0;
            while (cursor < relative.length) {
                if (cursor > 0 && relative[cursor] === '.') cursor += 1;
                if (cursor >= relative.length) return [];
                if (relative[cursor] === '[') {
                    const end = relative.indexOf(']', cursor + 1);
                    if (end < 0) return [];
                    const indexText = relative.slice(cursor + 1, end);
                    if (!/^\d+$/u.test(indexText)) return [];
                    segments.push(Number(indexText));
                    cursor = end + 1;
                    continue;
                }
                if (!/[A-Za-z_$]/u.test(relative[cursor])) return [];
                let end = cursor + 1;
                while (end < relative.length && /[A-Za-z0-9_$]/u.test(relative[end])) end += 1;
                segments.push(relative.slice(cursor, end));
                cursor = end;
                if (cursor < relative.length && relative[cursor] !== '.' && relative[cursor] !== '[') return [];
            }
            return segments;
        }

    function createDisplayNestedListPath(path) {
            const source = nonEmptyString(path);
            if (!source) return '';
            return source.indexOf('command.') === 0 ? source : `command.${source}`;
        }
    
    function createEmbeddedNestedListInfo(entry, frames, parentCommandIndex, metadata, nestedIndex) {
            return {
                type: 'embedded-event-list',
                id: null,
                name: nonEmptyString(entry && entry.name),
                path: nonEmptyString(entry && entry.path),
                index: nestedIndex,
                parentCode: Number(metadata && metadata.code),
                depth: Array.isArray(frames) ? frames.length : 1,
                length: Array.isArray(entry && entry.list) ? entry.list.length : 0,
                parentCommandIndex,
            };
        }
    
    function createEmbeddedNestedListFrame(entry, frames, parentCommandIndex, metadata, nestedIndex) {
            const nestedList = createEmbeddedNestedListInfo(entry, frames, parentCommandIndex, metadata, nestedIndex);
            const parentInterpreterId = getCurrentInterpreterId(frames);
            const parentListId = getCurrentListId(frames);
            const suffix = `nested:${parentCommandIndex}:${nestedIndex}`;
            return createScanFrame({
                list: entry.list,
                index: 0,
                expectedIndent: 0,
                interpreterId: `${parentInterpreterId}:${suffix}`,
                listId: `${parentListId}:${suffix}`,
                nestedListType: nestedList.type,
                nestedListName: nestedList.name,
                nestedListPath: nestedList.path,
                nestedListIndex: nestedIndex,
                parentCommandIndex,
                parentCommandCode: Number(metadata && metadata.code),
            });
        }
    
    function isEventCommandList(value) {
            return Array.isArray(value)
                && value.every(isEventCommandLike);
        }
    
    function isEventCommandLike(value) {
            return !!(value
                && typeof value === 'object'
                && Number.isFinite(Number(value.code))
                && Number.isFinite(Number(value.indent))
                && Array.isArray(value.parameters));
        }
    
    function nestedListNameFromPath(path) {
            const source = nonEmptyString(path);
            if (!source) return '';
            const dotIndex = source.lastIndexOf('.');
            const bracketIndex = source.lastIndexOf('[');
            const splitIndex = Math.max(dotIndex, bracketIndex);
            return splitIndex >= 0 ? source.slice(splitIndex + 1).replace(/\]$/u, '') : source;
        }
    
    function createScanFrame(options = {}) {
            return {
                list: Array.isArray(options.list) ? options.list : [],
                index: Number.isFinite(Number(options.index)) ? Math.max(0, Math.floor(Number(options.index))) : 0,
                endIndex: options.endIndex === null || options.endIndex === undefined || options.endIndex === ''
                    ? null
                    : (Number.isFinite(Number(options.endIndex)) ? Math.max(0, Math.floor(Number(options.endIndex))) : null),
                expectedIndent: Number.isFinite(Number(options.expectedIndent)) ? Number(options.expectedIndent) : null,
                interpreterId: String(options.interpreterId || ''),
                listId: String(options.listId || options.interpreterId || 'event'),
                commonEventId: nullableFiniteNumber(options.commonEventId),
                commonEventName: nonEmptyString(options.commonEventName),
                parentInterpreterId: String(options.parentInterpreterId || ''),
                parentListId: String(options.parentListId || ''),
                parentCommandIndex: nullableFiniteNumber(options.parentCommandIndex),
                parentCommandCode: nullableFiniteNumber(options.parentCommandCode),
                nestedListType: nonEmptyString(options.nestedListType),
                nestedListName: nonEmptyString(options.nestedListName),
                nestedListPath: nonEmptyString(options.nestedListPath),
                nestedListIndex: nullableFiniteNumber(options.nestedListIndex),
                branchLabel: nonEmptyString(options.branchLabel),
                branchIndex: nullableFiniteNumber(options.branchIndex),
                branchCount: nullableFiniteNumber(options.branchCount),
                resumeBranchDepth: Number.isFinite(Number(options.resumeBranchDepth))
                    ? Math.max(0, Math.floor(Number(options.resumeBranchDepth)))
                    : null,
                resumeBranchPath: Array.isArray(options.resumeBranchPath)
                    ? options.resumeBranchPath.slice()
                    : null,
                pendingNestedFrames: Array.isArray(options.pendingNestedFrames)
                    ? cloneScanFrames(options.pendingNestedFrames)
                    : [],
            };
        }
    
    function createFrameListContext(frame) {
            return {
                listId: String(frame && frame.listId || ''),
                interpreterId: String(frame && frame.interpreterId || ''),
                commonEventId: nullableFiniteNumber(frame && frame.commonEventId),
                commonEventName: nonEmptyString(frame && frame.commonEventName),
                parentInterpreterId: String(frame && frame.parentInterpreterId || ''),
                parentListId: String(frame && frame.parentListId || ''),
                parentCommandIndex: nullableFiniteNumber(frame && frame.parentCommandIndex),
                parentCommandCode: nullableFiniteNumber(frame && frame.parentCommandCode),
                nestedListType: nonEmptyString(frame && frame.nestedListType),
                nestedListName: nonEmptyString(frame && frame.nestedListName),
                nestedListPath: nonEmptyString(frame && frame.nestedListPath),
                nestedListIndex: nullableFiniteNumber(frame && frame.nestedListIndex),
                branchLabel: nonEmptyString(frame && frame.branchLabel),
                branchIndex: nullableFiniteNumber(frame && frame.branchIndex),
                branchCount: nullableFiniteNumber(frame && frame.branchCount),
            };
        }
    
    function attachFrameContextToBlock(block, frame) {
            if (!block || !frame) return block;
            block.listId = String(frame.listId || '');
            block.commonEventId = nullableFiniteNumber(frame.commonEventId);
            block.commonEventName = nonEmptyString(frame.commonEventName);
            block.parentInterpreterId = String(frame.parentInterpreterId || '');
            block.parentListId = String(frame.parentListId || '');
            block.parentCommandIndex = nullableFiniteNumber(frame.parentCommandIndex);
            block.parentCommandCode = nullableFiniteNumber(frame.parentCommandCode);
            block.nestedListType = nonEmptyString(frame.nestedListType);
            block.nestedListName = nonEmptyString(frame.nestedListName);
            block.nestedListPath = nonEmptyString(frame.nestedListPath);
            block.nestedListIndex = nullableFiniteNumber(frame.nestedListIndex);
            block.branchLabel = nonEmptyString(frame.branchLabel);
            block.branchIndex = nullableFiniteNumber(frame.branchIndex);
            block.branchCount = nullableFiniteNumber(frame.branchCount);
            return block;
        }
    
    function resolveCommonEvent(commonEventId) {
            const id = positiveInteger(commonEventId, 0);
            if (!id) return null;
            try {
                const commonEvents = globalScope.$dataCommonEvents;
                if (!commonEvents || typeof commonEvents !== 'object') return null;
                return commonEvents[id] && typeof commonEvents[id] === 'object'
                    ? commonEvents[id]
                    : null;
            } catch (_) {
                return null;
            }
        }
    
    function hasCommonEventInStack(frames, commonEventId) {
            const id = positiveInteger(commonEventId, 0);
            if (!id || !Array.isArray(frames)) return false;
            return frames.some((frame) => Number(frame && frame.commonEventId) === id);
        }
    
    function hasEventListInStack(frames, list) {
            if (!Array.isArray(frames) || !Array.isArray(list)) return false;
            return frames.some((frame) => frame && frame.list === list);
        }
    
    function getCurrentInterpreterId(frames) {
            if (!Array.isArray(frames) || !frames.length) return 'event';
            const frame = frames[frames.length - 1];
            return String(frame && frame.interpreterId || frame && frame.listId || 'event');
        }
    
    function getCurrentListId(frames) {
            if (!Array.isArray(frames) || !frames.length) return 'event';
            const frame = frames[frames.length - 1];
            return String(frame && frame.listId || frame && frame.interpreterId || 'event');
        }
    
    function finishCurrentFrame(frames) {
            if (!Array.isArray(frames) || frames.length <= 1) return false;
            frames.pop();
            pushNextPendingNestedFrame(frames);
            return true;
        }
    
    function pushNestedFrames(frames, nestedFrames, parentFrame) {
            const queue = Array.isArray(nestedFrames) ? nestedFrames.filter(Boolean) : (nestedFrames ? [nestedFrames] : []);
            if (!queue.length || !parentFrame) return false;
            const first = queue.shift();
            if (queue.length) {
                if (!Array.isArray(parentFrame.pendingNestedFrames)) parentFrame.pendingNestedFrames = [];
                parentFrame.pendingNestedFrames = queue.concat(parentFrame.pendingNestedFrames);
            }
            frames.push(first);
            return true;
        }
    
    function pushNextPendingNestedFrame(frames) {
            if (!Array.isArray(frames) || !frames.length) return false;
            const frame = frames[frames.length - 1];
            const pending = frame && Array.isArray(frame.pendingNestedFrames) ? frame.pendingNestedFrames : null;
            if (!pending || !pending.length) return false;
            const next = pending.shift();
            if (!next) return pushNextPendingNestedFrame(frames);
            frames.push(next);
            return true;
        }
    
    function readTransparentCommand(list, index, expectedIndent, frames, diagnostics = null) {
            const command = list[index];
            const metadata = getEventCommandMetadata(command && command.code);
            if (metadata.scanBehavior === 'movement-route') return readMovementRouteCommand(list, index, expectedIndent, metadata, diagnostics);
            if (metadata.scanBehavior === 'advance') {
                const nested = readEmbeddedNestedListCommand(list, index, metadata, frames);
                if (nested) return nested;
                return {
                    transparent: true,
                    nextIndex: index + 1,
                    kind: 'command',
                    metadata,
                    consumedCommands: diagnostics && diagnostics.captureCommandActions === false
                        ? []
                        : createConsumedEventCommands(list, index, index + 1),
                };
            }
            return {
                transparent: false,
                stopReason: metadata.scanBehavior === 'message-line' || metadata.scanBehavior === 'movement-route-line'
                    ? 'orphan-continuation'
                    : 'barrier-command',
                metadata,
                consumedCommands: diagnostics && diagnostics.captureCommandActions === false
                    ? []
                    : createConsumedEventCommands(list, index, index + 1),
            };
        }
    
    Object.assign(parts, { readNestedListCommand, readEmbeddedNestedListCommand, createEmbeddedNestedListInfo, createEmbeddedNestedListFrame, isEventCommandList, isEventCommandLike, nestedListNameFromPath, createScanFrame, createFrameListContext, attachFrameContextToBlock, resolveCommonEvent, hasCommonEventInStack, hasEventListInStack, getCurrentInterpreterId, getCurrentListId, finishCurrentFrame, pushNestedFrames, pushNextPendingNestedFrame, readTransparentCommand });

})();
