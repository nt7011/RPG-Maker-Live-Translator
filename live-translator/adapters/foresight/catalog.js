// Foresight command catalog loading and command metadata normalization.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const callPart = (name) => (...args) => parts[name](...args);
    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES } = parts;
    let commandCatalog = null;
    const { createGameMessageForesight, collectUpcomingMessageBlocks, getSnapshot, publishSnapshot, clearSnapshot, resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame, collectLinearMessageBlocks, createScanDiagnostics, scanPathUntilYield, scanBranchCommand, selectScanStopReason, sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, cloneScanFrame, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, stopScanPath, appendPathStop, createBranchPathStop, isBarrierStopReason, compareNumbers, compareBranchPaths, createBranchPathKey, parseMessageCommandBlock, readNestedListCommand, readEmbeddedNestedListCommand, createEmbeddedNestedListInfo, createEmbeddedNestedListFrame, isEventCommandList, isEventCommandLike, nestedListNameFromPath, createScanFrame, createFrameListContext, attachFrameContextToBlock, resolveCommonEvent, hasCommonEventInStack, hasEventListInStack, getCurrentInterpreterId, getCurrentListId, finishCurrentFrame, pushNestedFrames, pushNextPendingNestedFrame, readTransparentCommand, readMovementRouteCommand, getMovementRouteCommands, getMovementRouteNextIndex, findRouteBarrierCommand, resolveControlFlowTarget, resolveJumpToLabelTarget, resolveLoopStartTarget, resolveBreakLoopTarget, resolveRepeatAboveTarget, findMatchingLoopRepeatIndex, findBreakLoopRepeatIndex, findMatchingLoopStartIndex, createControlFlowTarget, readBranchCommand, readDelimitedBranchCommand, readConditionalBranchCommand, findBranchEndIndex, createBranchTarget, findNextBranchBoundary, createBranchBudgetPlaceholders, describeBranchTargets, describeChoiceBranches, describeConditionalBranches, describeBattleBranches, collectBranchHeaders, getBranchHeaderLabel, splitBudgetAcrossBranches, createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createRouteCommandActions, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels, cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneCommandTable, cloneConsumedCommands, cloneDiagnosticValue, reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString } = Object.fromEntries(['createGameMessageForesight', 'collectUpcomingMessageBlocks', 'getSnapshot', 'publishSnapshot', 'clearSnapshot', 'resolveMessageOrigin', 'isGeneratedMessageOrigin', 'resolveOriginFrames', 'resolveOriginFrame', 'collectLinearMessageBlocks', 'createScanDiagnostics', 'scanPathUntilYield', 'scanBranchCommand', 'selectScanStopReason', 'sortBlocksForPriority', 'attachPathContextToBlock', 'createScanPath', 'createBranchScanPath', 'cloneScanFrames', 'cloneScanFrame', 'getPathIndex', 'isFrameExhausted', 'hasVisitedPathPosition', 'rememberPathPosition', 'stopScanPath', 'appendPathStop', 'createBranchPathStop', 'isBarrierStopReason', 'compareNumbers', 'compareBranchPaths', 'createBranchPathKey', 'parseMessageCommandBlock', 'readNestedListCommand', 'readEmbeddedNestedListCommand', 'createEmbeddedNestedListInfo', 'createEmbeddedNestedListFrame', 'isEventCommandList', 'isEventCommandLike', 'nestedListNameFromPath', 'createScanFrame', 'createFrameListContext', 'attachFrameContextToBlock', 'resolveCommonEvent', 'hasCommonEventInStack', 'hasEventListInStack', 'getCurrentInterpreterId', 'getCurrentListId', 'finishCurrentFrame', 'pushNestedFrames', 'pushNextPendingNestedFrame', 'readTransparentCommand', 'readMovementRouteCommand', 'getMovementRouteCommands', 'getMovementRouteNextIndex', 'findRouteBarrierCommand', 'resolveControlFlowTarget', 'resolveJumpToLabelTarget', 'resolveLoopStartTarget', 'resolveBreakLoopTarget', 'resolveRepeatAboveTarget', 'findMatchingLoopRepeatIndex', 'findBreakLoopRepeatIndex', 'findMatchingLoopStartIndex', 'createControlFlowTarget', 'readBranchCommand', 'readDelimitedBranchCommand', 'readConditionalBranchCommand', 'findBranchEndIndex', 'createBranchTarget', 'findNextBranchBoundary', 'createBranchBudgetPlaceholders', 'describeBranchTargets', 'describeChoiceBranches', 'describeConditionalBranches', 'describeBattleBranches', 'collectBranchHeaders', 'getBranchHeaderLabel', 'splitBudgetAcrossBranches', 'createBudgetState', 'createInitialBudgetSnapshot', 'hasBudgetRemaining', 'spendBudget', 'createBudgetSnapshot', 'cloneBudgetSnapshot', 'createActionBudgetSnapshot', 'createBranchBudgetSnapshot', 'createBlockDiagnostics', 'recordCommandAction', 'appendCommandAction', 'createConsumedEventCommands', 'createRouteCommandActions', 'createDiagnostics', 'recordScan', 'sanitizeScan', 'diagnosticsSnapshot', 'publishDiagnosticsSnapshot', 'incrementCodeCount', 'getStopReasonLabel', 'pickCommandCounts', 'pickCommandLabels', 'cloneCommandActions', 'cloneControlFlowTarget', 'cloneBranchActions', 'cloneCommandTable', 'cloneConsumedCommands', 'cloneDiagnosticValue', 'reasonFromLabel', 'positiveInteger', 'finiteNumber', 'integerIndex', 'nullableFiniteNumber', 'nonEmptyString'].map((name) => [name, callPart(name)]));
    
    function loadCommandCatalog() {
            const fallback = {
                schemaVersion: 0,
                eventCommands: {},
                movementRouteCommands: {},
                stopReasons: {},
            };
            try {
                const assets = globalScope.LiveTranslatorAssets;
                const asset = assets && (assets[COMMAND_CATALOG_ASSET] || assets['foresight-commands.json']);
                const json = (asset && asset.json && typeof asset.json === 'object')
                    ? asset.json
                    : (globalScope.LiveTranslatorForesightCommands || null);
                if (!json || typeof json !== 'object') return fallback;
                return {
                    schemaVersion: finiteNumber(json.schemaVersion) || 0,
                    eventCommands: normalizeCommandTable(json.eventCommands, 'event'),
                    movementRouteCommands: normalizeCommandTable(json.movementRouteCommands, 'movement-route'),
                    stopReasons: json.stopReasons && typeof json.stopReasons === 'object'
                        ? Object.assign({}, json.stopReasons)
                        : {},
                };
            } catch (_) {
                return fallback;
            }
        }
    
    function normalizeCommandTable(table, kind) {
            const result = {};
            if (!table || typeof table !== 'object') return result;
            Object.keys(table).forEach((key) => {
                const numeric = Number(key);
                if (!Number.isFinite(numeric)) return;
                result[String(numeric)] = normalizeCommandMetadata(table[key], numeric, kind);
            });
            return result;
        }
    
    function normalizeCommandMetadata(source, code, kind) {
            const metadata = source && typeof source === 'object' ? source : {};
            const classification = normalizeClassification(metadata.classification);
            return {
                code: Number(code),
                label: nonEmptyString(metadata.label) || `Unknown ${kind} command ${Number(code)}`,
                classification,
                native: metadata.native === true,
                category: nonEmptyString(metadata.category) || kind,
                scanBehavior: normalizeScanBehavior(metadata.scanBehavior, classification),
                stalenessRisk: normalizeStalenessRisk(metadata.stalenessRisk, classification),
                nestedLists: normalizeNestedListSpecs(metadata.nestedLists),
                summary: nonEmptyString(metadata.summary) || '',
                reason: nonEmptyString(metadata.reason) || '',
            };
        }

    function normalizeNestedListSpecs(value) {
            if (!Array.isArray(value)) return [];
            const seen = typeof Set !== 'undefined' ? new Set() : null;
            const specs = [];
            value.forEach((entry, index) => {
                const source = typeof entry === 'string'
                    ? { path: entry }
                    : (entry && typeof entry === 'object' ? entry : null);
                const path = nonEmptyString(source && source.path);
                if (!path) return;
                if (seen) {
                    if (seen.has(path)) return;
                    seen.add(path);
                }
                specs.push({
                    path,
                    name: nonEmptyString(source && source.name),
                    runtimeOrder: Number.isFinite(Number(source && source.runtimeOrder))
                        ? Number(source.runtimeOrder)
                        : index,
                    optional: source && source.optional === true,
                    index,
                });
            });
            specs.sort((left, right) => {
                const byOrder = Number(left.runtimeOrder) - Number(right.runtimeOrder);
                return byOrder || (Number(left.index) - Number(right.index));
            });
            return specs.map((spec) => ({
                path: spec.path,
                name: spec.name,
                runtimeOrder: spec.runtimeOrder,
                optional: spec.optional,
            }));
        }
    
    function getEventCommandMetadata(code) {
            const key = String(Number(code));
            return commandCatalog.eventCommands[key]
                || normalizeCommandMetadata(null, Number(code), 'event');
        }
    
    function getMovementRouteCommandMetadata(code) {
            const key = String(Number(code));
            return commandCatalog.movementRouteCommands[key]
                || normalizeCommandMetadata(null, Number(code), 'movement-route');
        }
    
    function isEventScanBehavior(command, behavior) {
            return getEventCommandMetadata(Number(command && command.code)).scanBehavior === behavior;
        }
    
    function normalizeClassification(value) {
            const classification = String(value || '').trim().toLowerCase();
            if (classification === 'linear'
                || classification === 'continuation'
                || classification === 'nesting'
                || classification === 'branching'
                || classification === 'terminal'
                || classification === 'external') {
                return classification;
            }
            return 'external';
        }
    
    function normalizeScanBehavior(value, classification) {
            const behavior = String(value || '').trim().toLowerCase();
            if (behavior === 'message'
                || behavior === 'message-line'
                || behavior === 'advance'
                || behavior === 'movement-route'
                || behavior === 'movement-route-line'
                || behavior === 'nested-list'
                || behavior === 'frame-end'
                || behavior === 'barrier') {
                return behavior;
            }
            return isTransparentClassification(classification) ? 'advance' : 'barrier';
        }
    
    function normalizeStalenessRisk(value, classification) {
            const risk = String(value || '').trim().toLowerCase();
            if (risk === 'state' || risk === 'context' || risk === 'external') return risk;
            if (classification === 'external') return 'external';
            return '';
        }
    
    function isTransparentClassification(classification) {
            return classification === 'linear' || classification === 'continuation' || classification === 'external';
        }
    
    function hasStalenessRisk(metadata) {
            return Boolean(metadata && nonEmptyString(metadata.stalenessRisk));
        }
    
    Object.assign(parts, { loadCommandCatalog, normalizeCommandTable, normalizeCommandMetadata, normalizeNestedListSpecs, getEventCommandMetadata, getMovementRouteCommandMetadata, isEventScanBehavior, normalizeClassification, normalizeScanBehavior, normalizeStalenessRisk, isTransparentClassification, hasStalenessRisk });
    commandCatalog = loadCommandCatalog();
    parts.commandCatalog = commandCatalog;

})();
