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

    function getDiagnosticsPolicy(diagnostics = null, options = {}) {
            const settings = (options && options.settings)
                || (diagnostics && diagnostics.settings)
                || (globalScope.LiveTranslatorSettings && typeof globalScope.LiveTranslatorSettings === 'object' ? globalScope.LiveTranslatorSettings : {});
            const policy = globalScope.LiveTranslatorDiagnosticsPolicy;
            if (policy && typeof policy.getSnapshotPolicy === 'function') {
                return policy.getSnapshotPolicy(Object.assign({
                    globalScope,
                    settings,
                }, options || {})) || createFallbackDiagnosticsPolicy(settings, options);
            }
            return createFallbackDiagnosticsPolicy(settings, options);
        }

    function createFallbackDiagnosticsPolicy(settings, options = {}) {
            const guiState = globalScope.LiveTranslatorGuiState;
            const guiActive = !guiState || typeof guiState !== 'object'
                ? true
                : guiState.translatorOpen === true;
            const diagnosticsSettings = settings && settings.diagnostics && typeof settings.diagnostics === 'object'
                ? settings.diagnostics
                : null;
            const level = resolveFallbackLevel(settings, diagnosticsSettings, options, guiActive);
            const surface = guiActive && level !== 'none';
            const detailView = surface && level === 'full';
            return {
                mode: surface ? level : 'none',
                level: surface ? level : 'none',
                surface,
                detailView,
                performanceMode: surface && level === 'performance',
                full: surface && level === 'full',
                none: !surface,
                captureForesightActions: detailView,
                captureForesightMetadata: detailView,
                limits: level === 'performance'
                    ? { foresightScans: 5, foresightMessages: 5, archivedItems: 40, detachedItems: 40, pastJobs: 20 }
                    : { foresightScans: 0, foresightMessages: 0, archivedItems: 0, detachedItems: 0, pastJobs: 0 },
            };
        }

    function resolveFallbackLevel(settings, diagnosticsSettings, options = {}, guiActive = true) {
            if (!guiActive || options.surface === false || options.enabled === false) return 'none';
            const requested = normalizeFallbackLevel(options.mode || options.level || options.diagnosticsMode)
                || normalizeFallbackLevel(diagnosticsSettings && (diagnosticsSettings.mode || diagnosticsSettings.level));
            let level = requested
                || (diagnosticsSettings && Object.prototype.hasOwnProperty.call(diagnosticsSettings, 'performanceMode')
                    ? (diagnosticsSettings.performanceMode === true ? 'performance' : 'full')
                    : '')
                || (diagnosticsSettings && Object.prototype.hasOwnProperty.call(diagnosticsSettings, 'detailView')
                    ? (diagnosticsSettings.detailView === true ? 'full' : 'performance')
                    : (settings && settings.performanceMode === true ? 'performance' : 'full'));
            if ((options.detailView === false || options.includeDetails === false) && level !== 'none') level = 'performance';
            return level;
        }

    function normalizeFallbackLevel(value) {
            const text = String(value || '').trim().toLowerCase();
            if (!text) return '';
            if (text === 'none' || text === 'off' || text === 'disabled' || text === 'closed') return 'none';
            if (text === 'full' || text === 'detail' || text === 'details' || text === 'debug') return 'full';
            if (text === 'performance'
                || text === 'performancemode'
                || text === 'performance-mode'
                || text === 'surface'
                || text === 'minimal'
                || text === 'minimum') return 'performance';
            return '';
        }
    
    function createBlockDiagnostics(scan, block) {
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
    
    function recordCommandAction(diagnostics, path, action = {}, options = {}) {
            if (!shouldCaptureCommandActions(diagnostics)) return null;
            if (hasReachedCommandActionMessageLimit(diagnostics)) {
                diagnostics.commandActionsTruncated = (finiteNumber(diagnostics.commandActionsTruncated) || 0) + 1;
                return null;
            }
            // Performance preview keeps only message actions for the GUI. Full
            // diagnostics still record the richer command trail.
            if (diagnostics.captureCommandActionPreview === true && options.previewKind !== 'message') {
                diagnostics.commandActionsTruncated = (finiteNumber(diagnostics.commandActionsTruncated) || 0) + 1;
                return null;
            }
            if (diagnostics.commandActions.length >= DIAGNOSTIC_ACTION_LIMIT) {
                diagnostics.commandActionsTruncated = (finiteNumber(diagnostics.commandActionsTruncated) || 0) + 1;
                return null;
            }
            const payload = typeof action === 'function' ? action() : action;
            const entry = appendCommandAction(diagnostics, payload && typeof payload === 'object' ? payload : {}, path);
            updateCommandActionMessageLimitState(diagnostics, entry);
            return entry;
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

    function hasReachedCommandActionMessageLimit(diagnostics) {
            const limit = positiveInteger(diagnostics && diagnostics.commandActionMessageLimit, 0);
            return limit > 0 && diagnostics.commandActionMessageLimitReached === true;
        }

    function updateCommandActionMessageLimitState(diagnostics, entry) {
            const limit = positiveInteger(diagnostics && diagnostics.commandActionMessageLimit, 0);
            if (!limit || !entry || !isMessageCommandAction(entry)) return;
            diagnostics.commandActionMessagesCaptured = positiveInteger(diagnostics.commandActionMessagesCaptured, 0) + 1;
            if (diagnostics.commandActionMessagesCaptured >= limit) {
                diagnostics.commandActionMessageLimitReached = true;
            }
        }

    function isMessageCommandAction(action) {
            const source = action && typeof action === 'object' ? action : {};
            return String(source.action || '').toLowerCase() === 'message'
                || String(source.scanBehavior || '').toLowerCase() === 'message'
                || Number(source.code) === 101;
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
            return {
                settings: options.settings && typeof options.settings === 'object' ? options.settings : {},
                summary: {
                    commandCatalogSchemaVersion: commandCatalog.schemaVersion,
                    scans: 0,
                    matched: 0,
                    missed: 0,
                    blocked: 0,
                    messages: 0,
                    budgetDefault: DEFAULT_BUDGET,
                    budgetExhausted: 0,
                    branchBudgetStrategy: BRANCH_BUDGET_STRATEGY,
                    advancedCommands: 0,
                    staleRiskCommands: 0,
                    routeBarriers: 0,
                    updatedAt: Date.now(),
                },
                recent: [],
                dirty: false,
            };
        }
    
    function recordScan(diagnostics, scan) {
            const policy = getDiagnosticsPolicy(diagnostics);
            if (!policy.surface) {
                clearDiagnostics(diagnostics);
                return null;
            }
            const entry = sanitizeScan(scan, policy);
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
            diagnostics.dirty = true;
            while (diagnostics.recent.length > getRecentScanRetentionLimit(policy)) diagnostics.recent.shift();
            publishDiagnosticsSnapshot(diagnostics);
            return entry;
        }
    
    function sanitizeScan(scan, policy = null) {
            const source = scan && typeof scan === 'object' ? scan : {};
            const barrierCode = source.barrierCode === null || source.barrierCode === undefined ? null : Number(source.barrierCode);
            const routeBarrierCode = source.routeBarrierCode === null || source.routeBarrierCode === undefined ? null : Number(source.routeBarrierCode);
            const barrierMetadata = barrierCode === null ? null : getEventCommandMetadata(barrierCode);
            const routeBarrierMetadata = routeBarrierCode === null ? null : getMovementRouteCommandMetadata(routeBarrierCode);
            const commandActionSnapshot = createCommandActionSnapshotForPolicy(source, policy);
            return {
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
                commandActions: commandActionSnapshot.commandActions,
                commandActionLimit: commandActionSnapshot.commandActionLimit,
                commandActionMessageLimit: commandActionSnapshot.commandActionMessageLimit,
                commandActionsTruncated: commandActionSnapshot.commandActionsTruncated,
            };
        }

    function createCommandActionSnapshotForPolicy(source, policy = null) {
            const actions = Array.isArray(source && source.commandActions) ? source.commandActions : [];
            const commandActionLimit = finiteNumber(source && source.commandActionLimit) || DIAGNOSTIC_ACTION_LIMIT;
            const commandActionsTruncated = finiteNumber(source && source.commandActionsTruncated) || 0;
            const sourceMessageLimit = positiveInteger(source && source.commandActionMessageLimit, 0);
            if (!policy || policy.captureForesightActions === true) {
                return {
                    commandActions: cloneCommandActions(actions),
                    commandActionLimit,
                    commandActionMessageLimit: sourceMessageLimit,
                    commandActionsTruncated,
                };
            }

            const messageLimit = getPerformanceForesightMessageLimit(policy);
            if (!messageLimit) {
                return {
                    commandActions: [],
                    commandActionLimit,
                    commandActionMessageLimit: 0,
                    commandActionsTruncated: 0,
                };
            }

            // A full scan can be viewed through a performance snapshot, so apply
            // the same upcoming-message cap again when cloning for the GUI.
            const alreadyLimited = sourceMessageLimit > 0
                && sourceMessageLimit <= messageLimit
                && source.commandActionMessageLimitReached === true;
            const retained = alreadyLimited
                ? actions
                : selectCommandActionsThroughMessageLimit(actions, messageLimit);
            const omittedBySnapshot = alreadyLimited ? 0 : Math.max(0, actions.length - retained.length);
            return {
                commandActions: cloneCommandActions(retained),
                commandActionLimit,
                commandActionMessageLimit: messageLimit,
                commandActionsTruncated: commandActionsTruncated + omittedBySnapshot,
            };
        }

    function getPerformanceForesightMessageLimit(policy) {
            if (!policy || policy.performanceMode !== true) return 0;
            return positiveInteger(policy.limits && policy.limits.foresightMessages, 0);
        }

    function selectCommandActionsThroughMessageLimit(actions, messageLimit) {
            if (!Array.isArray(actions) || !actions.length || !messageLimit) return [];
            const retained = [];
            let messageCount = 0;
            for (let index = 0; index < actions.length; index += 1) {
                const action = actions[index];
                if (!isMessageCommandAction(action)) continue;
                retained.push(action);
                messageCount += 1;
                if (messageCount >= messageLimit) break;
            }
            return retained;
        }
    
    function diagnosticsSnapshot(diagnostics, options = {}) {
            const policy = getDiagnosticsPolicy(diagnostics, options);
            if (!policy.surface) {
                return {
                    summary: Object.assign({}, diagnostics.summary),
                    recent: [],
                    updatedAt: diagnostics.summary.updatedAt,
                    diagnosticsMode: 'none',
                    performanceMode: false,
                    detailView: false,
                };
            }
            const recentLimit = getRecentScanRetentionLimit(policy);
            return {
                summary: Object.assign({}, diagnostics.summary),
                recent: diagnostics.recent.slice(-recentLimit).map((entry) => {
                    const commandActionSnapshot = createCommandActionSnapshotForPolicy(entry, policy);
                    return Object.assign({}, entry, {
                        transparentCommands: Object.assign({}, entry.transparentCommands || {}),
                        transparentCommandLabels: Object.assign({}, entry.transparentCommandLabels || {}),
                        staleRiskCommandCounts: Object.assign({}, entry.staleRiskCommandCounts || {}),
                        staleRiskCommandLabels: Object.assign({}, entry.staleRiskCommandLabels || {}),
                        budget: cloneBudgetSnapshot(entry.budget),
                        pathStops: cloneDiagnosticValue(entry.pathStops, 0),
                        commandActions: commandActionSnapshot.commandActions,
                        commandActionLimit: commandActionSnapshot.commandActionLimit,
                        commandActionMessageLimit: commandActionSnapshot.commandActionMessageLimit,
                        commandActionsTruncated: commandActionSnapshot.commandActionsTruncated,
                    });
                }),
                updatedAt: diagnostics.summary.updatedAt,
                diagnosticsMode: policy.mode || (policy.detailView ? 'full' : 'performance'),
                performanceMode: policy.performanceMode === true,
                detailView: policy.detailView === true,
            };
        }
    
    function publishDiagnosticsSnapshot(diagnostics) {
            if (!getDiagnosticsPolicy(diagnostics).surface) {
                clearDiagnostics(diagnostics);
                try { delete globalScope.LiveTranslatorForesightSnapshot; } catch (_) {
                    try { globalScope.LiveTranslatorForesightSnapshot = null; } catch (__) {}
                }
                return null;
            }
            const snapshot = diagnosticsSnapshot(diagnostics);
            try { globalScope.LiveTranslatorForesightSnapshot = snapshot; } catch (_) {}
            return snapshot;
        }

    function clearDiagnostics(diagnostics) {
            if (!diagnostics || typeof diagnostics !== 'object') return null;
            if (diagnostics.dirty !== true && (!Array.isArray(diagnostics.recent) || diagnostics.recent.length === 0)) {
                return diagnostics;
            }
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
            diagnostics.dirty = false;
            return diagnostics;
        }

    function getRecentScanRetentionLimit(policy) {
            const configured = Number(policy && policy.limits && policy.limits.foresightScans);
            if (Number.isFinite(configured) && configured > 0) return Math.max(1, Math.min(RECENT_SCAN_LIMIT, Math.round(configured)));
            return RECENT_SCAN_LIMIT;
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
    
    Object.assign(parts, { getDiagnosticsPolicy, createBlockDiagnostics, recordCommandAction, appendCommandAction, createConsumedEventCommands, createConsumedEventCommandsForDiagnostics, createRouteCommandActions, createRouteCommandActionsForDiagnostics, createDiagnostics, recordScan, sanitizeScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, clearDiagnostics, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels });

})();
