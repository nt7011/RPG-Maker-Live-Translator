// Foresight tree model construction.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightTreeViewerParts || {};
    globalScope.LiveTranslatorForesightTreeViewerParts = parts;

    // Snapshot-to-tree model builder. Rendering modules consume only this normalized model.
    const DEFAULT_MAX_ACTIONS = 150;
    const BRANCH_ACTIONS = new Set(['branch', 'choice', 'conditional', 'barrier']);
    const { cloneList, cloneValue, cssToken, finiteNumber, nonEmptyString, normalizeAction, normalizeClass, normalizeComparableText, normalizeControlFlowTarget, positiveInteger } = parts.utils;
    const condenseHelpers = parts.modelCondense.createCondenseHelpers({ isMessageAction, createBranchMergeGroups });
    const { condenseNodesForMessages } = condenseHelpers;
    
    function createModel(snapshot, options = {}) {
            const maxActions = positiveInteger(options.maxActions, DEFAULT_MAX_ACTIONS);
            const source = snapshot && typeof snapshot === 'object' ? snapshot : null;
            const scans = source && Array.isArray(source.recent) ? source.recent : [];
            const scan = findLatestScan(scans);
            const textRecords = Array.isArray(options.textRecords) ? options.textRecords : [];
            const usedRecords = new Set();
            const rawActions = scan && Array.isArray(scan.commandActions) ? scan.commandActions : [];
            const surfaceOnly = options.surfaceOnly === true || (source && source.detailView === false);
            const surfaceActions = surfaceOnly && !rawActions.length
                ? createSurfaceMessageActions(textRecords)
                : [];
            const actionSource = rawActions.length ? rawActions : surfaceActions;
            const actions = actionSource.slice(0, maxActions);
            const branchGroups = createFlatBranchGroups(actions);
            const pathStops = scan && Array.isArray(scan.pathStops) ? scan.pathStops : [];
            let nodes = actions.filter((action) => !branchGroups.childActions.has(action)).map((action, index) => createActionNode(action, {
                depth: 0,
                ordinal: index + 1,
                path: getActionPathSegment(action, index),
                branchPath: [],
                maxActions,
                textRecords,
                usedRecords,
                branchGroups,
                pathStops,
            }));
            const condensed = options.messagesOnly === true ? condenseNodesForMessages(nodes) : { nodes, condensedActionCount: 0 };
            nodes = condensed.nodes;
            const scanLimit = positiveInteger(scan && scan.commandActionLimit, maxActions);
            const publishedTruncation = positiveInteger(scan && scan.commandActionsTruncated, 0);
            const localTruncation = Math.max(0, actionSource.length - actions.length);
            const model = {
                messagesOnly: options.messagesOnly === true,
                hasSnapshot: Boolean(source),
                snapshotUpdatedAt: source && source.updatedAt ? source.updatedAt : null,
                scan,
                scanCount: scans.length,
                summary: source && source.summary && typeof source.summary === 'object'
                    ? Object.assign({}, source.summary)
                    : null,
                actionLimit: surfaceOnly ? maxActions : Math.min(maxActions, scanLimit || maxActions),
                actionCount: countActionNodes(nodes),
                actionsAvailable: actionSource.length + publishedTruncation,
                actionsTruncated: Math.max(publishedTruncation, localTruncation),
                condensedActionCount: condensed.condensedActionCount,
                nodes,
            };
            if (surfaceOnly) model.surfaceOnly = true;
            return model;
        }

    function createSurfaceMessageActions(records) {
            return (Array.isArray(records) ? records : [])
                .filter(isForesightSurfaceRecord)
                .slice()
                .sort(compareForesightSurfaceRecords)
                .map(createSurfaceMessageAction);
        }

    function isForesightSurfaceRecord(record) {
            const metadata = getRecordMetadata(record);
            return metadata.foresight === true && metadata.foresightConsumed !== true;
        }

    function compareForesightSurfaceRecords(left, right) {
            const leftMetadata = getRecordMetadata(left);
            const rightMetadata = getRecordMetadata(right);
            const indexDiff = compareNullableNumbers(
                firstFiniteNumber(leftMetadata.foresightIndex, leftMetadata.messageStartIndex),
                firstFiniteNumber(rightMetadata.foresightIndex, rightMetadata.messageStartIndex)
            );
            if (indexDiff) return indexDiff;
            const priorityDiff = compareNullableNumbers(
                firstFiniteNumber(rightMetadata.foresightPriority, rightMetadata.effectivePriority, rightMetadata.priority),
                firstFiniteNumber(leftMetadata.foresightPriority, leftMetadata.effectivePriority, leftMetadata.priority)
            );
            if (priorityDiff) return priorityDiff;
            return compareNullableNumbers(
                firstFiniteNumber(left && left.updatedAt, left && left.seenAt),
                firstFiniteNumber(right && right.updatedAt, right && right.seenAt)
            );
        }

    function createSurfaceMessageAction(record) {
            const metadata = getRecordMetadata(record);
            const messageIndex = firstFiniteNumber(metadata.messageStartIndex, metadata.foresightIndex);
            return {
                index: messageIndex,
                code: 101,
                label: 'Show Text',
                classification: 'linear',
                native: true,
                category: 'message',
                scanBehavior: 'message',
                action: 'message',
                priorityDistance: firstFiniteNumber(metadata.foresightIndex),
                branchDepth: 0,
                branchPath: [],
                listContext: {
                    interpreterId: nonEmptyString(metadata.interpreterId),
                    listId: nonEmptyString(metadata.listId) || nonEmptyString(metadata.interpreterId) || 'foresight',
                },
                budget: metadata.foresightBudget && typeof metadata.foresightBudget === 'object'
                    ? cloneValue(metadata.foresightBudget, 0)
                    : null,
                consumedCommands: [],
                routeCommandActions: [],
                recordId: nonEmptyString(record && record.id),
                translationRecordId: nonEmptyString(record && record.id),
            };
        }

    function getRecordMetadata(record) {
            return record && record.metadata && typeof record.metadata === 'object'
                ? record.metadata
                : {};
        }

    function firstFiniteNumber(...values) {
            for (const value of values) {
                const numeric = finiteNumber(value);
                if (numeric !== null) return numeric;
            }
            return null;
        }

    function compareNullableNumbers(left, right) {
            if (left === null && right === null) return 0;
            if (left === null) return 1;
            if (right === null) return -1;
            return left - right;
        }
    
    function findLatestScan(scans) {
            for (let index = scans.length - 1; index >= 0; index -= 1) {
                const scan = scans[index];
                if (scan && Array.isArray(scan.commandActions) && scan.commandActions.length) return scan;
            }
            return scans.length ? scans[scans.length - 1] : null;
        }
    
    function countActionNodes(nodes) {
            return (Array.isArray(nodes) ? nodes : []).reduce((total, node) => {
                const branchTotal = (Array.isArray(node && node.branches) ? node.branches : []).reduce((branchCount, branch) => (
                    branchCount + countActionNodes(branch && branch.nodes)
                ), 0);
                if (node && (node.condensed === true || node.messageOnlyBranch === true)) return total + branchTotal;
                return total + 1 + branchTotal;
            }, 0);
        }
    
    function createFlatBranchGroups(actions) {
            const ownerKeys = new Set();
            const actionsByBranch = new Map();
            const branchIndicesByOwner = new Map();
            const childActions = new Set();
    
            actions.forEach((action) => {
                const ownerKey = createActionOwnerKey(action);
                if (ownerKey) ownerKeys.add(ownerKey);
            });
    
            actions.forEach((action) => {
                // The scanner records branch children as flat actions for the
                // diagnostics trail. Re-parent them only when the child names its
                // exact owning list, command index, and branch index.
                const parent = getActionBranchParent(action);
                if (!parent || !ownerKeys.has(parent.ownerKey)) return;
                const groupKey = createBranchGroupKey(parent.ownerKey, parent.branchIndex);
                if (!actionsByBranch.has(groupKey)) actionsByBranch.set(groupKey, []);
                actionsByBranch.get(groupKey).push(action);
                if (!branchIndicesByOwner.has(parent.ownerKey)) branchIndicesByOwner.set(parent.ownerKey, new Set());
                branchIndicesByOwner.get(parent.ownerKey).add(parent.branchIndex);
                childActions.add(action);
            });
    
            return {
                actionsByBranch,
                branchIndicesByOwner,
                childActions,
            };
        }
    
    function createActionOwnerKey(action) {
            const source = action && typeof action === 'object' ? action : {};
            const listContext = getActionListContext(source);
            const listId = nonEmptyString(listContext.listId);
            const actionIndex = finiteNumber(source.index);
            return listId && actionIndex !== null ? `${listId}#${actionIndex}` : '';
        }
    
    function getActionBranchParent(action) {
            const listContext = getActionListContext(action);
            const parentListId = nonEmptyString(listContext.parentListId);
            const parentCommandIndex = finiteNumber(listContext.parentCommandIndex);
            const branchIndex = finiteNumber(listContext.branchIndex);
            if (!parentListId || parentCommandIndex === null || branchIndex === null) return null;
            return {
                ownerKey: `${parentListId}#${parentCommandIndex}`,
                branchIndex: normalizeBranchIndex(branchIndex, 0),
            };
        }
    
    function getActionListContext(action) {
            return action && action.listContext && typeof action.listContext === 'object'
                ? action.listContext
                : {};
        }
    
    function createBranchGroupKey(ownerKey, branchIndex) {
            return `${ownerKey}|branch:${branchIndex}`;
        }
    
    function createActionNode(action, context) {
            const source = action && typeof action === 'object' ? action : {};
            const classification = normalizeClass(source.classification);
            const actionName = normalizeAction(source.action || source.scanBehavior);
            const record = findMessageRecordForAction(source, context.textRecords, context.usedRecords);
            if (record && record.id) context.usedRecords.add(String(record.id));
            const actionBranchPath = normalizeBranchPath(source.branchPath, context.branchPath);
            const ownerKey = createActionOwnerKey(source);
            const branches = normalizeBranches(source.branches, context, ownerKey, actionBranchPath);
            const mergeGroups = createBranchMergeGroups(branches);
            const sourceBranchDepth = finiteNumber(source.branchDepth);
            return {
                raw: source,
                scrollKey: createActionScrollKey(source, context, actionName),
                ordinal: context.ordinal || 0,
                index: finiteNumber(source.index),
                code: finiteNumber(source.code),
                label: nonEmptyString(source.label) || 'Unknown command',
                classification,
                action: actionName,
                native: source.native === true,
                category: nonEmptyString(source.category),
                scanBehavior: nonEmptyString(source.scanBehavior),
                stalenessRisk: nonEmptyString(source.stalenessRisk),
                summary: nonEmptyString(source.summary),
                stopReason: nonEmptyString(source.stopReason),
                stopReasonLabel: nonEmptyString(source.stopReasonLabel),
                priorityDistance: finiteNumber(source.priorityDistance),
                branchDepth: sourceBranchDepth === null ? Math.max(0, Math.floor(Number(context.depth) || 0)) : sourceBranchDepth,
                branchPath: actionBranchPath,
                listContext: cloneValue(source.listContext, 0),
                nestedList: cloneValue(source.nestedList, 0),
                budget: cloneValue(source.budget, 0),
                consumedCommands: cloneList(source.consumedCommands),
                routeCommandActions: cloneList(source.routeCommandActions),
                controlFlowTarget: normalizeControlFlowTarget(source.controlFlowTarget),
                messageRecord: record,
                branches,
                mergeGroups,
                ownerKey,
                isBranching: classification === 'branching' || BRANCH_ACTIONS.has(actionName),
            };
        }
    
    function normalizeBranches(branches, context, ownerKey, ownerBranchPath) {
            const sourceBranches = Array.isArray(branches) ? branches : [];
            const branchSources = [];
            sourceBranches.forEach((branch, index) => {
                const source = branch && typeof branch === 'object' ? branch : {};
                branchSources[getBranchIndex(source, index)] = source;
            });
    
            const groupedBranchIndices = getGroupedBranchIndices(context.branchGroups, ownerKey);
            const branchIndices = new Set();
            branchSources.forEach((_branch, index) => branchIndices.add(index));
            groupedBranchIndices.forEach((index) => branchIndices.add(index));
            if (!branchIndices.size) return [];
    
            return Array.from(branchIndices).sort((left, right) => left - right).map((branchIndex) => {
                const source = branchSources[branchIndex] && typeof branchSources[branchIndex] === 'object'
                    ? branchSources[branchIndex]
                    : {};
                const rawActions = Array.isArray(source.actions)
                    ? source.actions
                    : (Array.isArray(source.commandActions) ? source.commandActions : []);
                // Nested branch action arrays are authoritative when present.
                // Otherwise, use the explicitly-owned flat actions from the scan.
                const groupedActions = rawActions.length ? [] : getGroupedBranchActions(context.branchGroups, ownerKey, branchIndex);
                const actions = (rawActions.length ? rawActions : groupedActions).slice(0, context.maxActions);
                const branchPath = appendBranchPath(ownerBranchPath, branchIndex);
                const stops = findPathStops(context.pathStops, branchPath);
                return {
                    label: nonEmptyString(source.label)
                        || nonEmptyString(source.name)
                        || getGroupedBranchLabel(groupedActions)
                        || `Branch ${branchIndex + 1}`,
                    branchIndex,
                    branchPath,
                    startIndex: finiteNumber(source.startIndex),
                    endIndex: finiteNumber(source.endIndex),
                    joinIndex: finiteNumber(source.joinIndex),
                    budget: cloneValue(source.budget, 0),
                    actionCount: actions.length,
                    actionsTruncated: Math.max(0, (rawActions.length || groupedActions.length) - actions.length),
                    stops,
                    nodes: actions.map((action, actionIndex) => createActionNode(action, {
                        depth: (context.depth || 0) + 1,
                        ordinal: actionIndex + 1,
                        path: `${context.path || 'root'}>branch:${branchIndex}>${getActionPathSegment(action, actionIndex)}`,
                        branchPath,
                        maxActions: context.maxActions,
                        textRecords: context.textRecords,
                        usedRecords: context.usedRecords,
                        branchGroups: context.branchGroups,
                        pathStops: context.pathStops,
                    })),
                };
            });
        }
    
    function createBranchMergeGroups(branches) {
            const groups = new Map();
            (Array.isArray(branches) ? branches : []).forEach((branch, lanePosition) => {
                const joinIndex = finiteNumber(branch && branch.joinIndex);
                if (joinIndex === null) return;
                const key = String(joinIndex);
                if (!groups.has(key)) {
                    groups.set(key, {
                        key,
                        joinIndex,
                        lanePositions: [],
                        branchIndices: [],
                    });
                }
                const group = groups.get(key);
                group.lanePositions.push(lanePosition);
                group.branchIndices.push(normalizeBranchIndex(branch && branch.branchIndex, lanePosition));
            });
    
            return Array.from(groups.values())
                .filter((group) => group.lanePositions.length > 1)
                .map((group) => {
                    const startLane = Math.min(...group.lanePositions);
                    const endLane = Math.max(...group.lanePositions);
                    return Object.assign({}, group, {
                        startLane,
                        endLane,
                        span: endLane - startLane + 1,
                    });
                });
        }
    
    function getBranchIndex(branch, fallback) {
            const direct = finiteNumber(branch && branch.branchIndex);
            if (direct !== null) return normalizeBranchIndex(direct, fallback);
            const budget = branch && branch.budget && typeof branch.budget === 'object' ? branch.budget : {};
            const fromBudget = finiteNumber(budget.branchIndex);
            return fromBudget === null ? normalizeBranchIndex(fallback, 0) : normalizeBranchIndex(fromBudget, fallback);
        }
    
    function normalizeBranchIndex(value, fallback) {
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : Math.max(0, Math.floor(Number(fallback) || 0));
        }
    
    function getGroupedBranchIndices(branchGroups, ownerKey) {
            if (!branchGroups || !ownerKey || !branchGroups.branchIndicesByOwner) return [];
            const indices = branchGroups.branchIndicesByOwner.get(ownerKey);
            return indices ? Array.from(indices) : [];
        }
    
    function getGroupedBranchActions(branchGroups, ownerKey, branchIndex) {
            if (!branchGroups || !ownerKey || !branchGroups.actionsByBranch) return [];
            return branchGroups.actionsByBranch.get(createBranchGroupKey(ownerKey, branchIndex)) || [];
        }
    
    function getGroupedBranchLabel(actions) {
            const first = Array.isArray(actions) && actions.length ? actions[0] : null;
            const listContext = getActionListContext(first);
            return nonEmptyString(listContext.branchLabel);
        }
    
    function normalizeBranchPath(value, fallback) {
            if (Array.isArray(value)) {
                return value.map(finiteNumber).filter((entry) => entry !== null).map((entry) => normalizeBranchIndex(entry, 0));
            }
            return Array.isArray(fallback) ? fallback.slice() : [];
        }
    
    function appendBranchPath(branchPath, branchIndex) {
            const path = Array.isArray(branchPath) ? branchPath.slice() : [];
            path.push(normalizeBranchIndex(branchIndex, 0));
            return path;
        }
    
    function findPathStops(pathStops, branchPath) {
            if (!Array.isArray(pathStops) || !Array.isArray(branchPath)) return [];
            return pathStops.filter((stop) => branchPathsEqual(stop && stop.branchPath, branchPath)).map((stop) => ({
                index: finiteNumber(stop && stop.index),
                code: finiteNumber(stop && stop.code),
                label: nonEmptyString(stop && stop.label),
                stopReason: nonEmptyString(stop && stop.stopReason),
                stopReasonLabel: nonEmptyString(stop && stop.stopReasonLabel),
                branchDepth: finiteNumber(stop && stop.branchDepth),
                branchPath: normalizeBranchPath(stop && stop.branchPath, branchPath),
            }));
        }
    
    function branchPathsEqual(left, right) {
            if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
            for (let index = 0; index < left.length; index += 1) {
                if (finiteNumber(left[index]) !== finiteNumber(right[index])) return false;
            }
            return true;
        }
    
    function findMessageRecordForAction(action, records, usedRecords) {
            if (!isMessageAction(action) || !Array.isArray(records) || !records.length) return null;
            const actionIndex = finiteNumber(action.index);
            const recordId = nonEmptyString(action.recordId) || nonEmptyString(action.translationRecordId);
            const candidates = records.filter((record) => record && (!record.id || !usedRecords.has(String(record.id))));
    
            if (recordId) {
                const byId = candidates.find((record) => String(record.id || '') === recordId);
                if (byId) return byId;
            }
    
            if (actionIndex !== null) {
                const byIndex = candidates.find((record) => getRecordMessageStartIndex(record) === actionIndex);
                if (byIndex) return byIndex;
            }
    
            const messageText = normalizeComparableText(getConsumedMessageText(action));
            if (!messageText) return null;
            return candidates.find((record) => getRecordComparableTexts(record).some((text) => text === messageText)) || null;
        }
    
    function isMessageAction(action) {
            const source = action || {};
            return String(source.action || '').toLowerCase() === 'message'
                || String(source.scanBehavior || '').toLowerCase() === 'message'
                || Number(source.code) === 101;
        }
    
    function getRecordMessageStartIndex(record) {
            const metadata = record && record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
            const nested = metadata.foresightDiagnostics && typeof metadata.foresightDiagnostics === 'object'
                ? metadata.foresightDiagnostics
                : {};
            const value = finiteNumber(metadata.messageStartIndex);
            if (value !== null) return value;
            return finiteNumber(nested.messageStartIndex);
        }
    
    function getRecordComparableTexts(record) {
            return [
                record && record.rawText,
                record && record.original,
                record && record.visibleText,
                record && record.translationSource,
                record && record.normalizedSource,
            ].map(normalizeComparableText).filter(Boolean);
        }
    
    function getConsumedMessageText(action) {
            const lines = [];
            cloneList(action && action.consumedCommands).forEach((command) => {
                const code = Number(command && command.code);
                const behavior = String(command && command.scanBehavior || '').toLowerCase();
                if (behavior !== 'message-line' && code !== 401 && code !== 405) return;
                const params = Array.isArray(command.parameters) ? command.parameters : [];
                if (params.length) lines.push(String(params[0] ?? ''));
            });
            return lines.join('\n');
        }
    
    function getActionPathSegment(action, index) {
            const source = action && typeof action === 'object' ? action : {};
            const actionIndex = finiteNumber(source.index);
            if (actionIndex !== null) return `index:${actionIndex}`;
            const code = finiteNumber(source.code);
            return `ordinal:${index + 1}:code:${code === null ? '' : code}`;
        }
    
    function createActionScrollKey(source, context, actionName) {
            const actionIndex = finiteNumber(source.index);
            const code = finiteNumber(source.code);
            const recordId = nonEmptyString(source.recordId) || nonEmptyString(source.translationRecordId);
            const listContext = getActionListContext(source);
            const listId = nonEmptyString(listContext.listId);
            const branchPath = normalizeBranchPath(source.branchPath, context.branchPath).join('.');
            const identity = recordId
                ? `record:${recordId}`
                : (actionIndex !== null ? `list:${listId}|index:${actionIndex}` : `path:${context.path || context.ordinal || 0}`);
            return [
                identity,
                `branch:${branchPath}`,
                `code:${code === null ? '' : code}`,
                `action:${actionName || normalizeAction(source.action || source.scanBehavior)}`,
                `label:${nonEmptyString(source.label) || 'Unknown command'}`,
            ].join('|');
        }
    
    parts.model = Object.freeze({ createModel });

})();
