// Foresight diagnostics collection and snapshot publishing.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightParts || {};
    globalScope.LiveTranslatorForesightParts = parts;

    const callPart = (name) => (...args) => parts[name](...args);
    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    const { createGameMessageForesight, collectUpcomingMessageBlocks, getSnapshot, publishSnapshot, clearSnapshot, loadCommandCatalog, normalizeCommandTable, normalizeCommandMetadata, getEventCommandMetadata, getMovementRouteCommandMetadata, isEventScanBehavior, normalizeClassification, normalizeScanBehavior, normalizeStalenessRisk, isTransparentClassification, hasStalenessRisk, resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame, collectLinearMessageBlocks, createScanDiagnostics, scanPathUntilYield, scanBranchCommand, selectScanStopReason, sortBlocksForPriority, attachPathContextToBlock, createScanPath, createBranchScanPath, cloneScanFrames, cloneScanFrame, getPathIndex, isFrameExhausted, hasVisitedPathPosition, rememberPathPosition, stopScanPath, appendPathStop, createBranchPathStop, isBarrierStopReason, compareNumbers, compareBranchPaths, createBranchPathKey, parseMessageCommandBlock, readNestedListCommand, readEmbeddedNestedListCommand, createEmbeddedNestedListInfo, createEmbeddedNestedListFrame, isEventCommandList, isEventCommandLike, nestedListNameFromPath, createScanFrame, createFrameListContext, attachFrameContextToBlock, resolveCommonEvent, hasCommonEventInStack, hasEventListInStack, getCurrentInterpreterId, getCurrentListId, finishCurrentFrame, pushNestedFrames, pushNextPendingNestedFrame, readTransparentCommand, readMovementRouteCommand, getMovementRouteCommands, getMovementRouteNextIndex, findRouteBarrierCommand, resolveControlFlowTarget, resolveJumpToLabelTarget, resolveLoopStartTarget, resolveBreakLoopTarget, resolveRepeatAboveTarget, findMatchingLoopRepeatIndex, findBreakLoopRepeatIndex, findMatchingLoopStartIndex, createControlFlowTarget, readBranchCommand, readDelimitedBranchCommand, readConditionalBranchCommand, findBranchEndIndex, createBranchTarget, findNextBranchBoundary, createBranchBudgetPlaceholders, describeBranchTargets, describeChoiceBranches, describeConditionalBranches, describeBattleBranches, collectBranchHeaders, getBranchHeaderLabel, splitBudgetAcrossBranches, createBudgetState, createInitialBudgetSnapshot, hasBudgetRemaining, spendBudget, createBudgetSnapshot, cloneBudgetSnapshot, createActionBudgetSnapshot, createBranchBudgetSnapshot, cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneCommandTable, cloneConsumedCommands, cloneDiagnosticValue, reasonFromLabel, positiveInteger, finiteNumber, integerIndex, nullableFiniteNumber, nonEmptyString } = Object.fromEntries(['createGameMessageForesight', 'collectUpcomingMessageBlocks', 'getSnapshot', 'publishSnapshot', 'clearSnapshot', 'loadCommandCatalog', 'normalizeCommandTable', 'normalizeCommandMetadata', 'getEventCommandMetadata', 'getMovementRouteCommandMetadata', 'isEventScanBehavior', 'normalizeClassification', 'normalizeScanBehavior', 'normalizeStalenessRisk', 'isTransparentClassification', 'hasStalenessRisk', 'resolveMessageOrigin', 'isGeneratedMessageOrigin', 'resolveOriginFrames', 'resolveOriginFrame', 'collectLinearMessageBlocks', 'createScanDiagnostics', 'scanPathUntilYield', 'scanBranchCommand', 'selectScanStopReason', 'sortBlocksForPriority', 'attachPathContextToBlock', 'createScanPath', 'createBranchScanPath', 'cloneScanFrames', 'cloneScanFrame', 'getPathIndex', 'isFrameExhausted', 'hasVisitedPathPosition', 'rememberPathPosition', 'stopScanPath', 'appendPathStop', 'createBranchPathStop', 'isBarrierStopReason', 'compareNumbers', 'compareBranchPaths', 'createBranchPathKey', 'parseMessageCommandBlock', 'readNestedListCommand', 'readEmbeddedNestedListCommand', 'createEmbeddedNestedListInfo', 'createEmbeddedNestedListFrame', 'isEventCommandList', 'isEventCommandLike', 'nestedListNameFromPath', 'createScanFrame', 'createFrameListContext', 'attachFrameContextToBlock', 'resolveCommonEvent', 'hasCommonEventInStack', 'hasEventListInStack', 'getCurrentInterpreterId', 'getCurrentListId', 'finishCurrentFrame', 'pushNestedFrames', 'pushNextPendingNestedFrame', 'readTransparentCommand', 'readMovementRouteCommand', 'getMovementRouteCommands', 'getMovementRouteNextIndex', 'findRouteBarrierCommand', 'resolveControlFlowTarget', 'resolveJumpToLabelTarget', 'resolveLoopStartTarget', 'resolveBreakLoopTarget', 'resolveRepeatAboveTarget', 'findMatchingLoopRepeatIndex', 'findBreakLoopRepeatIndex', 'findMatchingLoopStartIndex', 'createControlFlowTarget', 'readBranchCommand', 'readDelimitedBranchCommand', 'readConditionalBranchCommand', 'findBranchEndIndex', 'createBranchTarget', 'findNextBranchBoundary', 'createBranchBudgetPlaceholders', 'describeBranchTargets', 'describeChoiceBranches', 'describeConditionalBranches', 'describeBattleBranches', 'collectBranchHeaders', 'getBranchHeaderLabel', 'splitBudgetAcrossBranches', 'createBudgetState', 'createInitialBudgetSnapshot', 'hasBudgetRemaining', 'spendBudget', 'createBudgetSnapshot', 'cloneBudgetSnapshot', 'createActionBudgetSnapshot', 'createBranchBudgetSnapshot', 'cloneCommandActions', 'cloneControlFlowTarget', 'cloneBranchActions', 'cloneCommandTable', 'cloneConsumedCommands', 'cloneDiagnosticValue', 'reasonFromLabel', 'positiveInteger', 'finiteNumber', 'integerIndex', 'nullableFiniteNumber', 'nonEmptyString'].map((name) => [name, callPart(name)]));
    const SURFACE_RECENT_SCAN_LIMIT = 5;

    function getDiagnosticsPolicy(diagnostics = null, options = {}) {
            const settings = (options && options.settings)
                || (diagnostics && diagnostics.settings)
                || (globalScope.LiveTranslatorSettings && typeof globalScope.LiveTranslatorSettings === 'object' ? globalScope.LiveTranslatorSettings : {});
            const policy = globalScope.LiveTranslatorDiagnosticsPolicy;
            if (policy && typeof policy.getSnapshotPolicy === 'function') {
                return policy.getSnapshotPolicy(Object.assign({
                    globalScope,
                    settings,
                }, options || {})) || { surface: true, detailView: true };
            }
            const guiState = globalScope.LiveTranslatorGuiState;
            const surface = !guiState || typeof guiState !== 'object'
                ? true
                : guiState.translatorOpen === true;
            const diagnosticsSettings = settings && settings.diagnostics && typeof settings.diagnostics === 'object'
                ? settings.diagnostics
                : null;
            const performanceMode = diagnosticsSettings && Object.prototype.hasOwnProperty.call(diagnosticsSettings, 'performanceMode')
                ? diagnosticsSettings.performanceMode === true
                : false;
            return {
                surface,
                detailView: surface
                    && !performanceMode
                    && options.detailView !== false
                    && options.includeDetails !== false,
                performanceMode,
            };
        }
    
    function createBlockDiagnostics(scan, block) {
            if (!shouldCaptureCommandActions(scan)) return null;
            const includeActions = shouldCaptureCommandActions(scan);
            return {
                scanStartIndex: scan.startIndex,
                messageStartIndex: block.startIndex,
                messageNextIndex: block.nextIndex,
                priorityDistance: finiteNumber(block.priorityDistance),
                priorityOffset: finiteNumber(block.priorityOffset),
                branchDepth: finiteNumber(block.branchDepth) || 0,
                branchPath: cloneDiagnosticValue(block.branchPath, 0),
                budget: cloneBudgetSnapshot(scan.budget),
                advancedCommands: scan.advancedCommands,
                scannedCommands: scan.scannedCommands,
                transparentCommands: Object.assign({}, scan.transparentCommands),
                transparentCommandLabels: Object.assign({}, scan.transparentCommandLabels),
                staleRiskCommands: scan.staleRiskCommands,
                staleRiskCommandCounts: Object.assign({}, scan.staleRiskCommandCounts),
                staleRiskCommandLabels: Object.assign({}, scan.staleRiskCommandLabels),
                routeCommands: scan.routeCommands,
                pathStops: cloneDiagnosticValue(scan.pathStops, 0),
                commandActions: includeActions ? cloneCommandActions(scan.commandActions) : [],
                commandActionLimit: finiteNumber(scan.commandActionLimit) || DIAGNOSTIC_ACTION_LIMIT,
                commandActionsTruncated: includeActions ? (finiteNumber(scan.commandActionsTruncated) || 0) : 0,
            };
        }
    
    function recordCommandAction(diagnostics, path, action = {}) {
            if (!shouldCaptureCommandActions(diagnostics)) return null;
            return appendCommandAction(diagnostics, action, path);
        }
    
    function appendCommandAction(diagnostics, action = {}, path = null) {
            if (!diagnostics || !Array.isArray(diagnostics.commandActions)) return null;
            if (diagnostics.commandActions.length >= DIAGNOSTIC_ACTION_LIMIT) {
                diagnostics.commandActionsTruncated = (finiteNumber(diagnostics.commandActionsTruncated) || 0) + 1;
                return null;
            }
            const metadata = action.metadata || getEventCommandMetadata(action.code);
            const entry = {
                index: finiteNumber(action.index),
                code: metadata.code,
                label: metadata.label,
                classification: metadata.classification,
                native: metadata.native,
                category: metadata.category,
                scanBehavior: metadata.scanBehavior,
                action: nonEmptyString(action.action) || metadata.scanBehavior,
                stalenessRisk: metadata.stalenessRisk,
                stopReason: nonEmptyString(action.stopReason) || '',
                stopReasonLabel: action.stopReason ? getStopReasonLabel(action.stopReason) : '',
                summary: metadata.summary,
                priorityDistance: finiteNumber(path && path.messageDistance),
                branchDepth: finiteNumber(path && path.branchDepth) || 0,
                branchPath: Array.isArray(path && path.branchPath) ? path.branchPath.slice() : [],
                listContext: cloneDiagnosticValue(action.listContext, 0),
                nestedList: cloneDiagnosticValue(action.nestedList, 0),
                nestedLists: cloneDiagnosticValue(action.nestedLists, 0),
                budget: cloneDiagnosticValue(action.budget, 0),
                consumedCommands: cloneConsumedCommands(action.consumedCommands),
                routeCommandActions: cloneConsumedCommands(action.routeCommandActions),
                controlFlowTarget: cloneControlFlowTarget(action.controlFlowTarget),
                branches: cloneBranchActions(action.branches),
            };
            attachHiddenReturnGuards(entry, path && path.returnGuards);
            diagnostics.commandActions.push(entry);
            return entry;
        }

    function attachHiddenReturnGuards(entry, returnGuards) {
            if (!entry || !Array.isArray(returnGuards) || !returnGuards.length) return;
            const guards = returnGuards
                .map((guard) => Math.max(0, Math.floor(Number(guard) || 0)))
                .filter((guard) => guard > 0);
            if (!guards.length) return;
            try {
                Object.defineProperty(entry, '__returnGuards', {
                    value: guards,
                    enumerable: false,
                    configurable: true,
                });
            } catch (_) {
                entry.__returnGuards = guards;
            }
        }
    
    function createConsumedEventCommands(list, startIndex, nextIndex) {
            const commands = [];
            const start = Number(startIndex);
            const end = Number(nextIndex);
            if (!Array.isArray(list) || !Number.isFinite(start) || !Number.isFinite(end)) return commands;
            for (let index = start; index < end && index < list.length; index += 1) {
                const command = list[index];
                if (!command) continue;
                const metadata = getEventCommandMetadata(command.code);
                commands.push({
                    index,
                    code: metadata.code,
                    label: metadata.label,
                    classification: metadata.classification,
                    native: metadata.native,
                    category: metadata.category,
                    scanBehavior: metadata.scanBehavior,
                    stalenessRisk: metadata.stalenessRisk,
                    summary: metadata.summary,
                    parameters: cloneDiagnosticValue(command.parameters, 0),
                });
            }
            return commands;
        }

    function createConsumedEventCommandsForDiagnostics(diagnostics, list, startIndex, nextIndex) {
            return shouldCaptureCommandActions(diagnostics)
                ? createConsumedEventCommands(list, startIndex, nextIndex)
                : [];
        }
    
    function createRouteCommandActions(routeCommands) {
            if (!Array.isArray(routeCommands)) return [];
            return routeCommands.map((command, index) => {
                const metadata = getMovementRouteCommandMetadata(command && command.code);
                return {
                    routeIndex: index,
                    code: metadata.code,
                    label: metadata.label,
                    classification: metadata.classification,
                    native: metadata.native,
                    category: metadata.category,
                    scanBehavior: metadata.scanBehavior,
                    stalenessRisk: metadata.stalenessRisk,
                    summary: metadata.summary,
                    reason: metadata.reason,
                    parameters: cloneDiagnosticValue(command && command.parameters, 0),
                };
            });
        }

    function createRouteCommandActionsForDiagnostics(diagnostics, routeCommands) {
            return shouldCaptureCommandActions(diagnostics)
                ? createRouteCommandActions(routeCommands)
                : [];
        }
    
    function createDiagnostics(options = {}) {
            const budgetDefault = positiveInteger(options.budget, DEFAULT_BUDGET);
            return {
                settings: options.settings && typeof options.settings === 'object' ? options.settings : {},
                summary: {
                    commandCatalogSchemaVersion: commandCatalog.schemaVersion,
                    scans: 0,
                    matched: 0,
                    missed: 0,
                    blocked: 0,
                    messages: 0,
                    budgetDefault,
                    budgetExhausted: 0,
                    branchBudgetStrategy: BRANCH_BUDGET_STRATEGY,
                    advancedCommands: 0,
                    staleRiskCommands: 0,
                    routeBarriers: 0,
                    updatedAt: Date.now(),
                },
                recent: [],
            };
        }
    
    function recordScan(diagnostics, scan) {
            const policy = getDiagnosticsPolicy(diagnostics);
            if (!policy.surface) {
                clearDiagnostics(diagnostics);
                return null;
            }
            const entry = sanitizeScan(scan, { detailView: policy.detailView });
            const summary = diagnostics.summary;
            summary.scans += 1;
            if (entry.matchedCurrentMessage) summary.matched += 1;
            else summary.missed += 1;
            if (entry.status === 'blocked') summary.blocked += 1;
            if (entry.stopReason === 'budget-limit') summary.budgetExhausted += 1;
            if (entry.stopReason === 'movement-route-barrier') {
                summary.routeBarriers += 1;
            }
            summary.messages += entry.blocks || 0;
            summary.advancedCommands += entry.advancedCommands || 0;
            summary.staleRiskCommands += entry.staleRiskCommands || 0;
            summary.updatedAt = Date.now();
    
            diagnostics.recent.push(entry);
            const recentLimit = policy.detailView ? RECENT_SCAN_LIMIT : SURFACE_RECENT_SCAN_LIMIT;
            while (diagnostics.recent.length > recentLimit) diagnostics.recent.shift();
            if (policy.detailView) {
                publishDiagnosticsSnapshot(diagnostics);
            } else {
                clearPublishedDiagnosticsSnapshot();
            }
            return entry;
        }
    
    function sanitizeScan(scan, options = {}) {
            const source = scan && typeof scan === 'object' ? scan : {};
            const barrierCode = source.barrierCode === null || source.barrierCode === undefined ? null : Number(source.barrierCode);
            const routeBarrierCode = source.routeBarrierCode === null || source.routeBarrierCode === undefined ? null : Number(source.routeBarrierCode);
            const barrierMetadata = barrierCode === null ? null : getEventCommandMetadata(barrierCode);
            const routeBarrierMetadata = routeBarrierCode === null ? null : getMovementRouteCommandMetadata(routeBarrierCode);
            const entry = {
                at: Date.now(),
                interpreterId: String(source.interpreterId || ''),
                status: String(source.status || 'scanned'),
                matchedCurrentMessage: source.matchedCurrentMessage === true,
                startIndex: finiteNumber(source.startIndex),
                stopIndex: finiteNumber(source.stopIndex),
                stopReason: String(source.stopReason || ''),
                stopReasonLabel: getStopReasonLabel(source.stopReason),
                barrierCode,
                barrierLabel: nonEmptyString(source.barrierLabel) || (barrierMetadata ? barrierMetadata.label : ''),
                budget: cloneBudgetSnapshot(source.budget),
                scannedCommands: finiteNumber(source.scannedCommands) || 0,
                advancedCommands: finiteNumber(source.advancedCommands) || 0,
                staleRiskCommands: finiteNumber(source.staleRiskCommands) || 0,
                staleRiskCommandCounts: pickCommandCounts(source.staleRiskCommandCounts),
                staleRiskCommandLabels: pickCommandLabels(source.staleRiskCommandLabels, source.staleRiskCommandCounts),
                blocks: finiteNumber(source.blocks) || 0,
                routeCommands: finiteNumber(source.routeCommands) || 0,
                routeBarriers: finiteNumber(source.routeBarriers) || 0,
                routeBarrierCode,
                routeBarrierLabel: nonEmptyString(source.routeBarrierLabel) || (routeBarrierMetadata ? routeBarrierMetadata.label : ''),
                routeBarrierReason: String(source.routeBarrierReason || ''),
                transparentCommands: pickCommandCounts(source.transparentCommands),
                transparentCommandLabels: pickCommandLabels(source.transparentCommandLabels, source.transparentCommands),
                pathStops: cloneDiagnosticValue(source.pathStops, 0),
                commandActions: shouldCaptureCommandActions(source) ? cloneCommandActions(source.commandActions) : [],
                commandActionLimit: finiteNumber(source.commandActionLimit) || DIAGNOSTIC_ACTION_LIMIT,
                commandActionsTruncated: shouldCaptureCommandActions(source) ? (finiteNumber(source.commandActionsTruncated) || 0) : 0,
            };
            if (options.detailView === false) {
                entry.advancedCommands = 0;
                entry.staleRiskCommands = 0;
                entry.staleRiskCommandCounts = {};
                entry.staleRiskCommandLabels = {};
                entry.routeCommands = 0;
                entry.transparentCommands = {};
                entry.transparentCommandLabels = {};
                entry.pathStops = [];
                entry.commandActions = [];
                entry.commandActionsTruncated = 0;
            }
            return entry;
        }
    
    function diagnosticsSnapshot(diagnostics, options = {}) {
            const policy = getDiagnosticsPolicy(diagnostics, options);
            if (!policy.surface) {
                return {
                    summary: Object.assign({}, diagnostics.summary),
                    recent: [],
                    updatedAt: diagnostics.summary.updatedAt,
                    detailView: false,
                };
            }
            const recentLimit = policy.detailView ? RECENT_SCAN_LIMIT : SURFACE_RECENT_SCAN_LIMIT;
            const recent = diagnostics.recent.slice(-recentLimit);
            return {
                summary: Object.assign({}, diagnostics.summary),
                recent: recent.map((entry) => Object.assign({}, entry, {
                    transparentCommands: Object.assign({}, entry.transparentCommands || {}),
                    transparentCommandLabels: Object.assign({}, entry.transparentCommandLabels || {}),
                    staleRiskCommandCounts: Object.assign({}, entry.staleRiskCommandCounts || {}),
                    staleRiskCommandLabels: Object.assign({}, entry.staleRiskCommandLabels || {}),
                    budget: cloneBudgetSnapshot(entry.budget),
                    pathStops: cloneDiagnosticValue(entry.pathStops, 0),
                    commandActions: policy.detailView ? cloneCommandActions(entry.commandActions) : [],
                    commandActionLimit: finiteNumber(entry.commandActionLimit) || DIAGNOSTIC_ACTION_LIMIT,
                    commandActionsTruncated: policy.detailView ? (finiteNumber(entry.commandActionsTruncated) || 0) : 0,
                })),
                updatedAt: diagnostics.summary.updatedAt,
                detailView: policy.detailView === true,
            };
        }
    
    function publishDiagnosticsSnapshot(diagnostics) {
            const policy = getDiagnosticsPolicy(diagnostics);
            if (!policy.surface) {
                clearDiagnostics(diagnostics);
                clearPublishedDiagnosticsSnapshot();
                return null;
            }
            const snapshot = diagnosticsSnapshot(diagnostics);
            if (!policy.detailView) {
                clearPublishedDiagnosticsSnapshot();
                return snapshot;
            }
            try { globalScope.LiveTranslatorForesightSnapshot = snapshot; } catch (_) {}
            return snapshot;
        }

    function clearDiagnostics(diagnostics) {
            if (!diagnostics || typeof diagnostics !== 'object') return null;
            diagnostics.recent = [];
            if (diagnostics.summary && typeof diagnostics.summary === 'object') {
                Object.keys(diagnostics.summary).forEach((key) => {
                    if (key === 'commandCatalogSchemaVersion'
                        || key === 'budgetDefault'
                        || key === 'branchBudgetStrategy') return;
                    diagnostics.summary[key] = typeof diagnostics.summary[key] === 'number' ? 0 : diagnostics.summary[key];
                });
                diagnostics.summary.updatedAt = Date.now();
            }
            return diagnostics;
        }

    function clearPublishedDiagnosticsSnapshot() {
            try { delete globalScope.LiveTranslatorForesightSnapshot; } catch (_) {
                try { globalScope.LiveTranslatorForesightSnapshot = null; } catch (__) {}
            }
        }

    function shouldCaptureCommandActions(diagnostics) {
            return diagnostics
                && diagnostics.captureCommandActions !== false
                && Array.isArray(diagnostics.commandActions);
        }
    
    function incrementCodeCount(target, code) {
            const key = String(Number(code));
            target[key] = (target[key] || 0) + 1;
        }
    
    function getStopReasonLabel(reason) {
            const key = String(reason || '');
            return nonEmptyString(commandCatalog.stopReasons[key]) || key;
        }
    
    function pickCommandCounts(value) {
            const result = {};
            if (!value || typeof value !== 'object') return result;
            Object.keys(value).forEach((key) => {
                const count = finiteNumber(value[key]);
                if (count > 0) result[String(key)] = count;
            });
            return result;
        }
    
    function pickCommandLabels(labels, counts) {
            const result = {};
            const sourceLabels = labels && typeof labels === 'object' ? labels : {};
            Object.keys(pickCommandCounts(counts)).forEach((key) => {
                result[key] = nonEmptyString(sourceLabels[key])
                    || getEventCommandMetadata(key).label;
            });
            return result;
        }
    
    Object.assign(parts, { getDiagnosticsPolicy, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createConsumedEventCommandsForDiagnostics, createRouteCommandActions, createRouteCommandActionsForDiagnostics, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, clearDiagnostics, clearPublishedDiagnosticsSnapshot, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels });

})();
