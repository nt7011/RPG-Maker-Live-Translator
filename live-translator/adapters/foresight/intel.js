// Foresight Intel collection and snapshot publishing.
(() => {
    'use strict';

    LiveTranslatorRun({
        name: 'adapters.foresight.intel',
        requires: {
            partsRegistry: 'adapters.foresight.partsRegistry',
        },
        loadAfter: ['adapters.foresight.partsRegistry'],
        scriptAfter: ['adapters/foresight/constants.js', 'adapters/foresight/part-facades.js', 'adapters/foresight/catalog.js'],
        loadBefore: ['adapters.foresight'],
        run({ partsRegistry }, { scope: globalScope }) {
            const parts = partsRegistry.getParts();
            const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, INTEL_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
            const { getEventCommandMetadata, getMovementRouteCommandMetadata } = parts.facades.catalog;
            const { cloneBudgetSnapshot } = parts.facades.budget;
            const { cloneCommandActions, cloneControlFlowTarget, cloneBranchActions, cloneConsumedCommands, cloneIntelValue } = parts.facades.cloning;
            const { positiveInteger, finiteNumber, nonEmptyString } = parts.facades.utils;

            function getIntelPolicy(intel = null, options = {}) {
                    const settings = (options && options.settings)
                        || (intel && intel.settings)
                        || (globalScope.LiveTranslatorSettings && typeof globalScope.LiveTranslatorSettings === 'object' ? globalScope.LiveTranslatorSettings : {});
                    const policy = globalScope.LiveTranslatorIntelPolicy;
                    if (policy && typeof policy.getSnapshotPolicy === 'function') {
                        return policy.getSnapshotPolicy(Object.assign({
                            globalScope,
                            settings,
                        }, options || {})) || createClosedIntelPolicy();
                    }
                    return createClosedIntelPolicy();
                }

            function createClosedIntelPolicy() {
                    return {
                        surface: false,
                        publish: false,
                        captureForesightMessages: false,
                        limits: {},
                    };
                }

            function createBlockIntel(scan, block) {
                    const includeActions = shouldCaptureCommandActions(scan);
                    return {
                        scanStartIndex: scan.startIndex,
                        messageStartIndex: block.startIndex,
                        messageNextIndex: block.nextIndex,
                        priorityDistance: finiteNumber(block.priorityDistance),
                        priorityOffset: finiteNumber(block.priorityOffset),
                        branchDepth: finiteNumber(block.branchDepth) || 0,
                        branchPath: cloneIntelValue(block.branchPath, 0),
                        budget: cloneBudgetSnapshot(scan.budget),
                        advancedCommands: scan.advancedCommands,
                        scannedCommands: scan.scannedCommands,
                        transparentCommands: Object.assign({}, scan.transparentCommands),
                        transparentCommandLabels: Object.assign({}, scan.transparentCommandLabels),
                        staleRiskCommands: scan.staleRiskCommands,
                        staleRiskCommandCounts: Object.assign({}, scan.staleRiskCommandCounts),
                        staleRiskCommandLabels: Object.assign({}, scan.staleRiskCommandLabels),
                        routeCommands: scan.routeCommands,
                        pathStops: cloneIntelValue(scan.pathStops, 0),
                        commandActions: includeActions ? cloneCommandActions(scan.commandActions) : [],
                        commandActionLimit: finiteNumber(scan.commandActionLimit) || INTEL_ACTION_LIMIT,
                        commandActionsTruncated: includeActions ? (finiteNumber(scan.commandActionsTruncated) || 0) : 0,
                    };
                }

            function recordCommandAction(intel, path, action = {}, options = {}) {
                    if (!shouldCaptureCommandActions(intel)) return null;
                    if (hasReachedCommandActionMessageLimit(intel)) {
                        intel.commandActionsTruncated = (finiteNumber(intel.commandActionsTruncated) || 0) + 1;
                        return null;
                    }
                    // Intel preview keeps only message actions for the GUI.
                    if (intel.captureCommandActionPreview === true && options.previewKind !== 'message') {
                        intel.commandActionsTruncated = (finiteNumber(intel.commandActionsTruncated) || 0) + 1;
                        return null;
                    }
                    if (intel.commandActions.length >= INTEL_ACTION_LIMIT) {
                        intel.commandActionsTruncated = (finiteNumber(intel.commandActionsTruncated) || 0) + 1;
                        return null;
                    }
                    const payload = typeof action === 'function' ? action() : action;
                    const entry = appendCommandAction(intel, payload && typeof payload === 'object' ? payload : {}, path);
                    updateCommandActionMessageLimitState(intel, entry);
                    return entry;
                }

            function appendCommandAction(intel, action = {}, path = null) {
                    if (!intel || !Array.isArray(intel.commandActions)) return null;
                    if (intel.commandActions.length >= INTEL_ACTION_LIMIT) {
                        intel.commandActionsTruncated = (finiteNumber(intel.commandActionsTruncated) || 0) + 1;
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
                        listContext: cloneIntelValue(action.listContext, 0),
                        nestedList: cloneIntelValue(action.nestedList, 0),
                        nestedLists: cloneIntelValue(action.nestedLists, 0),
                        budget: cloneIntelValue(action.budget, 0),
                        consumedCommands: cloneConsumedCommands(action.consumedCommands),
                        routeCommandActions: cloneConsumedCommands(action.routeCommandActions),
                        controlFlowTarget: cloneControlFlowTarget(action.controlFlowTarget),
                        branches: cloneBranchActions(action.branches),
                    };
                    attachHiddenReturnGuards(entry, path && path.returnGuards);
                    intel.commandActions.push(entry);
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

            function hasReachedCommandActionMessageLimit(intel) {
                    const limit = positiveInteger(intel && intel.commandActionMessageLimit, 0);
                    return limit > 0 && intel.commandActionMessageLimitReached === true;
                }

            function updateCommandActionMessageLimitState(intel, entry) {
                    const limit = positiveInteger(intel && intel.commandActionMessageLimit, 0);
                    if (!limit || !entry || !isMessageCommandAction(entry)) return;
                    intel.commandActionMessagesCaptured = positiveInteger(intel.commandActionMessagesCaptured, 0) + 1;
                    if (intel.commandActionMessagesCaptured >= limit) {
                        intel.commandActionMessageLimitReached = true;
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
                            parameters: cloneIntelValue(command.parameters, 0),
                        });
                    }
                    return commands;
                }

            function createConsumedEventCommandsForIntel(intel, list, startIndex, nextIndex) {
                    return shouldCaptureCommandActions(intel)
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
                            parameters: cloneIntelValue(command && command.parameters, 0),
                        };
                    });
                }

            function createRouteCommandActionsForIntel(intel, routeCommands) {
                    return shouldCaptureCommandActions(intel)
                        ? createRouteCommandActions(routeCommands)
                        : [];
                }

            function createIntel(options = {}) {
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

            function recordScan(intel, scan) {
                    const policy = getIntelPolicy(intel);
                    if (!policy.surface) {
                        clearIntel(intel);
                        return null;
                    }
                    const entry = sanitizeScan(scan, policy);
                    const summary = intel.summary;
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

                    intel.recent.push(entry);
                    intel.dirty = true;
                    while (intel.recent.length > getRecentScanRetentionLimit(policy)) intel.recent.shift();
                    publishIntelSnapshot(intel);
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
                        pathStops: cloneIntelValue(source.pathStops, 0),
                        commandActions: commandActionSnapshot.commandActions,
                        commandActionLimit: commandActionSnapshot.commandActionLimit,
                        commandActionMessageLimit: commandActionSnapshot.commandActionMessageLimit,
                        commandActionsTruncated: commandActionSnapshot.commandActionsTruncated,
                    };
                }

            function createCommandActionSnapshotForPolicy(source, policy = null) {
                    const actions = Array.isArray(source && source.commandActions) ? source.commandActions : [];
                    const commandActionLimit = finiteNumber(source && source.commandActionLimit) || INTEL_ACTION_LIMIT;
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

                    const messageLimit = getIntelForesightMessageLimit(policy);
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

            function getIntelForesightMessageLimit(policy) {
                    if (!policy || policy.surface !== true || policy.captureForesightMessages === false) return 0;
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

            function intelSnapshot(intel, options = {}) {
                    const policy = getIntelPolicy(intel, options);
                    if (!policy.surface) {
                        return {
                            summary: Object.assign({}, intel.summary),
                            recent: [],
                            updatedAt: intel.summary.updatedAt,
                            intelSurface: false,
                        };
                    }
                    const recentLimit = getRecentScanRetentionLimit(policy);
                    return {
                        summary: Object.assign({}, intel.summary),
                        recent: intel.recent.slice(-recentLimit).map((entry) => {
                            const commandActionSnapshot = createCommandActionSnapshotForPolicy(entry, policy);
                            return Object.assign({}, entry, {
                                transparentCommands: Object.assign({}, entry.transparentCommands || {}),
                                transparentCommandLabels: Object.assign({}, entry.transparentCommandLabels || {}),
                                staleRiskCommandCounts: Object.assign({}, entry.staleRiskCommandCounts || {}),
                                staleRiskCommandLabels: Object.assign({}, entry.staleRiskCommandLabels || {}),
                                budget: cloneBudgetSnapshot(entry.budget),
                                pathStops: cloneIntelValue(entry.pathStops, 0),
                                commandActions: commandActionSnapshot.commandActions,
                                commandActionLimit: commandActionSnapshot.commandActionLimit,
                                commandActionMessageLimit: commandActionSnapshot.commandActionMessageLimit,
                                commandActionsTruncated: commandActionSnapshot.commandActionsTruncated,
                            });
                        }),
                        updatedAt: intel.summary.updatedAt,
                        intelSurface: policy.surface === true,
                    };
                }

            function publishIntelSnapshot(intel) {
                    if (!getIntelPolicy(intel).surface) {
                        clearIntel(intel);
                        try { delete globalScope.LiveTranslatorForesightIntelSnapshot; } catch (_) {
                            try { globalScope.LiveTranslatorForesightIntelSnapshot = null; } catch (__) {}
                        }
                        return null;
                    }
                    const snapshot = intelSnapshot(intel);
                    try { globalScope.LiveTranslatorForesightIntelSnapshot = snapshot; } catch (_) {}
                    return snapshot;
                }

            function clearIntel(intel) {
                    if (!intel || typeof intel !== 'object') return null;
                    if (intel.dirty !== true && (!Array.isArray(intel.recent) || intel.recent.length === 0)) {
                        return intel;
                    }
                    intel.recent = [];
                    if (intel.summary && typeof intel.summary === 'object') {
                        Object.keys(intel.summary).forEach((key) => {
                            if (key === 'commandCatalogSchemaVersion'
                                || key === 'budgetDefault'
                                || key === 'branchBudgetStrategy') return;
                            intel.summary[key] = typeof intel.summary[key] === 'number' ? 0 : intel.summary[key];
                        });
                        intel.summary.updatedAt = Date.now();
                    }
                    intel.dirty = false;
                    return intel;
                }

            function getRecentScanRetentionLimit(policy) {
                    const configured = Number(policy && policy.limits && policy.limits.foresightScans);
                    if (Number.isFinite(configured) && configured > 0) return Math.max(1, Math.min(RECENT_SCAN_LIMIT, Math.round(configured)));
                    return RECENT_SCAN_LIMIT;
                }

            function shouldCaptureCommandActions(intel) {
                    return intel
                        && intel.captureCommandActions !== false
                        && Array.isArray(intel.commandActions);
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

            Object.assign(parts, { getIntelPolicy, createBlockIntel, recordCommandAction, appendCommandAction, createConsumedEventCommands, createConsumedEventCommandsForIntel, createRouteCommandActions, createRouteCommandActionsForIntel, createIntel, recordScan, sanitizeScan, intelSnapshot, publishIntelSnapshot, clearIntel, incrementCodeCount, getStopReasonLabel, pickCommandCounts, pickCommandLabels });
        },
    });
})();
