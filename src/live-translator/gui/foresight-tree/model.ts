import { createCondenseHelpers } from './model-condense.js';
import { GUI_PROJECTION_LIMITS, projectGuiValueOutcome, resolveGuiProjectionLimits } from '../projection.js';
import type { GuiProjectedValue, GuiProjectionPolicy } from '../projection.js';
import type { BranchMergeGroup, ForesightBranch, ForesightModel, ForesightNode, ForesightPathStop, ForesightModelTruncationReason, UnknownRecord, } from './model-types.js';
import { cssToken, finiteNumber, nonEmptyString, normalizeAction, normalizeClass, normalizeComparableText, normalizeControlFlowTarget, positiveInteger, stringValue, } from './utils.js';
const DEFAULT_MAX_ACTIONS = 150;
const MAX_MODEL_ACTIONS = 150;
const MAX_BRANCHES_PER_ACTION = 16;
const MAX_MODEL_BRANCHES = 256;
const MAX_BRANCH_DEPTH = 6;
const MAX_PATH_STOPS = 256;
const MAX_TEXT_RECORDS = 512;
const MAX_CONSUMED_COMMANDS = 64;
const BRANCH_ACTIONS = new Set(['branch', 'choice', 'conditional', 'barrier']);
interface FlatBranchGroups {
    actionsByBranch: Map<string, unknown[]>;
    branchIndicesByOwner: Map<string, Set<number>>;
    childActions: Set<unknown>;
}
interface ActionContext {
    depth: number;
    ordinal: number;
    path: string;
    branchPath: number[];
    textRecords: unknown[];
    currentMessageRecord: UnknownRecord | null;
    usedRecords: Set<string>;
    branchGroups: FlatBranchGroups;
    pathStops: unknown[];
    admission: ModelAdmissionContext;
}
interface ModelAdmissionContext {
    remainingActions: number;
    remainingBranches: number;
    actionNodes: number;
    branchNodes: number;
    omittedActions: number;
    readonly reasons: Set<ForesightModelTruncationReason>;
}
interface BranchParent {
    ownerKey: string;
    branchIndex: number;
}
interface MergeAccumulator {
    key: string;
    joinIndex: number;
    lanePositions: number[];
    branchIndices: number[];
}
function isUnknownRecord(value: unknown): value is UnknownRecord {
    if (typeof value !== 'object' || value === null)
        return false;
    try {
        return !Array.isArray(value);
    }
    catch {
        return false;
    }
}
function recordValue(value: unknown, key: string): unknown {
    if (!isUnknownRecord(value))
        return undefined;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function recordOrEmpty(value: unknown): UnknownRecord {
    return isUnknownRecord(value) ? value : {};
}
function clonedRecordValue(value: UnknownRecord, key: string): GuiProjectedValue {
    return recordValue(value, key) as GuiProjectedValue;
}
function arrayValue(value: unknown): unknown[] {
    try {
        return Array.isArray(value) ? value : [];
    }
    catch {
        return [];
    }
}
function listValue(value: unknown): unknown[] {
    const source = arrayValue(value);
    const length = Math.min(ownArrayLength(source), MAX_TEXT_RECORDS);
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
        try {
            const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
            if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                output.push(descriptor.value);
            }
        }
        catch {
        }
    }
    return output;
}
function firstTruthy(value: unknown, fallback: unknown): unknown {
    if (value)
        return value;
    return fallback;
}
const condenseHelpers = createCondenseHelpers({ isMessageAction, createBranchMergeGroups });
const FORESIGHT_PROJECTION_LIMITS = Object.freeze({
    ...GUI_PROJECTION_LIMITS,
    maxArrayEntries: MAX_TEXT_RECORDS,
    maxDepth: 32,
    maxDescriptorReads: 8192,
    maxNodes: 4096,
    maxStringCodeUnits: 4096,
    maxTotalStringCodeUnits: 65536,
});
export function createModel(snapshot: unknown, options: unknown = {}): ForesightModel {
    const normalizedOptions = recordOrEmpty(options);
    const projectionPolicy = recordValue(normalizedOptions, 'projectionPolicy') as GuiProjectionPolicy | undefined;
    const projectionLimits = projectionPolicy
        ? resolveGuiProjectionLimits(projectionPolicy, FORESIGHT_PROJECTION_LIMITS)
        : FORESIGHT_PROJECTION_LIMITS;
    const maxActions = Math.min(positiveInteger(recordValue(normalizedOptions, 'maxActions'), DEFAULT_MAX_ACTIONS), MAX_MODEL_ACTIONS);
    const admission: ModelAdmissionContext = {
        remainingActions: maxActions,
        remainingBranches: MAX_MODEL_BRANCHES,
        actionNodes: 0,
        branchNodes: 0,
        omittedActions: 0,
        reasons: new Set<ForesightModelTruncationReason>(),
    };
    const source = isUnknownRecord(snapshot) ? snapshot : null;
    const scans = arrayValue(recordValue(source, 'recent'));
    const scanSource = findLatestScan(scans);
    const scan = createScanView(scanSource);
    const rawActions = arrayValue(recordValue(scanSource, 'commandActions'));
    const rawActionLength = ownArrayLength(rawActions);
    const selectedActions = readOwnArrayPrefix(rawActions, maxActions, admission, 'action-limit');
    const textRecordSource = arrayValue(recordValue(normalizedOptions, 'textRecords'));
    const selectedTextRecords = readOwnArrayPrefix(textRecordSource, MAX_TEXT_RECORDS, admission, 'text-record-limit');
    const usedRecords = new Set<string>();
    const selectedPathStops = readOwnArrayPrefix(arrayValue(recordValue(scanSource, 'pathStops')), MAX_PATH_STOPS, admission, 'path-stop-limit');
    const projectedInputs = projectGuiValueOutcome({
        actions: selectedActions,
        currentMessageRecord: recordValue(normalizedOptions, 'currentMessageRecord') ?? null,
        pathStops: selectedPathStops,
        textRecords: selectedTextRecords,
    }, projectionLimits);
    if (!projectedInputs.complete)
        admission.reasons.add('diagnostic-projection-incomplete');
    const inputs = recordOrEmpty(projectedInputs.value);
    const actions = listValue(recordValue(inputs, 'actions')).filter(isUnknownRecord);
    admission.omittedActions += selectedActions.length - actions.length;
    const textRecords = listValue(recordValue(inputs, 'textRecords')).filter(isUnknownRecord);
    const currentMessageRecord = normalizeCurrentMessageRecord(recordValue(inputs, 'currentMessageRecord'));
    const pathStops = listValue(recordValue(inputs, 'pathStops')).filter(isUnknownRecord);
    const branchGroups = createFlatBranchGroups(actions);
    const nodes: ForesightNode[] = [];
    let rootOrdinal = 0;
    for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index];
        if (branchGroups.childActions.has(action))
            continue;
        const node = createActionNode(action, {
            depth: 0,
            ordinal: rootOrdinal + 1,
            path: getActionPathSegment(action, index),
            branchPath: [],
            textRecords,
            currentMessageRecord,
            usedRecords,
            branchGroups,
            pathStops,
            admission,
        });
        if (!node) {
            admission.omittedActions += actions.length - index;
            break;
        }
        nodes.push(node);
        rootOrdinal += 1;
    }
    const condensed = recordValue(normalizedOptions, 'messagesOnly') === true
        ? condenseHelpers.condenseNodesForMessages(nodes)
        : { nodes, condensedActionCount: 0 };
    const scanLimit = positiveInteger(recordValue(scanSource, 'commandActionLimit'), maxActions);
    const publishedTruncation = positiveInteger(recordValue(scanSource, 'commandActionsTruncated'), 0);
    const localTruncation = Math.max(0, rawActionLength - selectedActions.length);
    const summary = createSummaryView(recordValue(source, 'summary'));
    const reasons = Object.freeze(Array.from(admission.reasons).sort());
    const snapshotUpdatedAt = recordValue(source, 'updatedAt');
    return {
        messagesOnly: recordValue(normalizedOptions, 'messagesOnly') === true,
        hasSnapshot: Boolean(source),
        snapshotUpdatedAt: typeof snapshotUpdatedAt === 'number' || typeof snapshotUpdatedAt === 'string' ? snapshotUpdatedAt : null,
        scan,
        currentMessageRecord,
        scanCount: ownArrayLength(scans),
        summary,
        actionLimit: Math.min(maxActions, scanLimit),
        actionCount: countActionNodes(condensed.nodes),
        actionsAvailable: rawActionLength + publishedTruncation,
        actionsTruncated: Math.max(publishedTruncation, localTruncation) + admission.omittedActions,
        condensedActionCount: condensed.condensedActionCount,
        admission: Object.freeze({
            truncated: reasons.length > 0,
            reasons,
            actionNodes: admission.actionNodes,
            branchNodes: admission.branchNodes,
            diagnosticNodes: projectedInputs.nodes,
        }),
        nodes: condensed.nodes,
    };
}
function findLatestScan(scans: unknown[]): UnknownRecord | null {
    const length = ownArrayLength(scans);
    if (length === 0)
        return null;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(scans, String(length - 1));
        const latestScan: unknown = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : null;
        return isUnknownRecord(latestScan) ? latestScan : null;
    }
    catch {
        return null;
    }
}
function ownArrayLength(source: readonly unknown[]): number {
    try {
        const descriptor = Object.getOwnPropertyDescriptor(source, 'length');
        const length: unknown = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : null;
        return typeof length === 'number' && Number.isSafeInteger(length) && length >= 0 ? length : 0;
    }
    catch {
        return 0;
    }
}
function createScanView(scan: UnknownRecord | null): UnknownRecord | null {
    if (!scan)
        return null;
    const at = recordValue(scan, 'at');
    return {
        at: typeof at === 'number' || typeof at === 'string' ? at : null,
        status: nonEmptyString(recordValue(scan, 'status')),
        blocks: finiteNumber(recordValue(scan, 'blocks')),
        staleRiskCommands: finiteNumber(recordValue(scan, 'staleRiskCommands')),
        routeBarriers: finiteNumber(recordValue(scan, 'routeBarriers')),
        stopReason: nonEmptyString(recordValue(scan, 'stopReason')),
        stopReasonLabel: nonEmptyString(recordValue(scan, 'stopReasonLabel')),
    };
}
function readOwnArrayPrefix<T>(source: readonly T[], limit: number, admission: ModelAdmissionContext, reason: ForesightModelTruncationReason): T[] {
    const sourceLength = ownArrayLength(source);
    const admittedLength = Math.min(sourceLength, Math.max(0, limit));
    if (sourceLength > admittedLength)
        admission.reasons.add(reason);
    const output: T[] = [];
    for (let index = 0; index < admittedLength; index += 1) {
        let descriptor: PropertyDescriptor | undefined;
        try {
            descriptor = Object.getOwnPropertyDescriptor(source, String(index));
        }
        catch {
            admission.reasons.add(reason);
            continue;
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            admission.reasons.add(reason);
            continue;
        }
        output.push(descriptor.value as T);
    }
    return output;
}
function createSummaryView(value: unknown): UnknownRecord | null {
    if (!isUnknownRecord(value))
        return null;
    return {
        messages: finiteNumber(recordValue(value, 'messages')),
        staleRiskCommands: finiteNumber(recordValue(value, 'staleRiskCommands')),
        routeBarriers: finiteNumber(recordValue(value, 'routeBarriers')),
    };
}
function countActionNodes(nodes: ForesightNode[]): number {
    const pending = nodes.slice();
    let total = 0;
    while (pending.length > 0) {
        const node = pending.pop();
        if (!node)
            continue;
        if (node.condensed !== true && node.messageOnlyJunction !== true)
            total += 1;
        for (const branch of node.branches ?? [])
            pending.push(...(branch.nodes ?? []));
    }
    return total;
}
function createFlatBranchGroups(actions: unknown[]): FlatBranchGroups {
    const ownerKeys = new Set<string>();
    const actionsByBranch = new Map<string, unknown[]>();
    const branchIndicesByOwner = new Map<string, Set<number>>();
    const childActions = new Set<unknown>();
    for (const action of actions) {
        const ownerKey = createActionOwnerKey(action);
        if (ownerKey)
            ownerKeys.add(ownerKey);
    }
    for (const action of actions) {
        const parent = getActionBranchParent(action);
        if (!parent || !ownerKeys.has(parent.ownerKey))
            continue;
        const groupKey = createBranchGroupKey(parent.ownerKey, parent.branchIndex);
        const groupedActions = actionsByBranch.get(groupKey);
        if (groupedActions)
            groupedActions.push(action);
        else
            actionsByBranch.set(groupKey, [action]);
        const branchIndices = branchIndicesByOwner.get(parent.ownerKey);
        if (branchIndices)
            branchIndices.add(parent.branchIndex);
        else
            branchIndicesByOwner.set(parent.ownerKey, new Set([parent.branchIndex]));
        childActions.add(action);
    }
    return { actionsByBranch, branchIndicesByOwner, childActions };
}
function createActionOwnerKey(action: unknown): string {
    const source = recordOrEmpty(action);
    const listContext = getActionListContext(source);
    const listId = nonEmptyString(listContext['listId']);
    const actionIndex = finiteNumber(source['index']);
    return listId && actionIndex !== null ? `${listId}#${String(actionIndex)}` : '';
}
function getActionBranchParent(action: unknown): BranchParent | null {
    const listContext = getActionListContext(action);
    const parentListId = nonEmptyString(listContext['parentListId']);
    const parentCommandIndex = finiteNumber(listContext['parentCommandIndex']);
    const branchIndex = finiteNumber(listContext['branchIndex']);
    if (!parentListId || parentCommandIndex === null || branchIndex === null)
        return null;
    return {
        ownerKey: `${parentListId}#${String(parentCommandIndex)}`,
        branchIndex: normalizeBranchIndex(branchIndex, 0),
    };
}
function getActionListContext(action: unknown): UnknownRecord {
    return recordOrEmpty(recordValue(action, 'listContext'));
}
function createBranchGroupKey(ownerKey: string, branchIndex: number): string {
    return `${ownerKey}|branch:${String(branchIndex)}`;
}
function createActionNode(action: unknown, context: ActionContext): ForesightNode | null {
    if (context.admission.remainingActions <= 0) {
        context.admission.reasons.add('action-limit');
        return null;
    }
    context.admission.remainingActions -= 1;
    context.admission.actionNodes += 1;
    const source = recordOrEmpty(action);
    const classification = normalizeClass(source['classification']);
    const actionName = normalizeAction(firstTruthy(source['action'], source['scanBehavior']));
    const rawMessageText = getActionMessageText(source);
    const record = findMessageRecordForAction(source, context.textRecords, context.usedRecords, context.currentMessageRecord, rawMessageText) ?? createSyntheticMessageRecord(source, context, rawMessageText);
    const recordId = recordValue(record, 'id');
    if (record && recordId)
        context.usedRecords.add(stringValue(recordId));
    const actionBranchPath = normalizeBranchPath(source['branchPath'], context.branchPath);
    const ownerKey = createActionOwnerKey(source);
    const branches = normalizeBranches(source['branches'], context, ownerKey, actionBranchPath);
    const mergeGroups = createBranchMergeGroups(branches);
    const sourceBranchDepth = finiteNumber(source['branchDepth']);
    const sourceDepth = Math.max(0, Math.floor(context.depth || 0));
    return {
        raw: source,
        scrollKey: createActionScrollKey(source, context, actionName),
        ordinal: context.ordinal || 0,
        index: finiteNumber(source['index']),
        code: finiteNumber(source['code']),
        label: nonEmptyString(source['label']) || 'Unknown command',
        classification,
        action: actionName,
        native: source['native'] === true,
        category: nonEmptyString(source['category']),
        scanBehavior: nonEmptyString(source['scanBehavior']),
        stalenessRisk: nonEmptyString(source['stalenessRisk']),
        summary: nonEmptyString(source['summary']),
        stopReason: nonEmptyString(source['stopReason']),
        stopReasonLabel: nonEmptyString(source['stopReasonLabel']),
        priorityDistance: finiteNumber(source['priorityDistance']),
        branchDepth: sourceBranchDepth ?? sourceDepth,
        branchPath: actionBranchPath,
        listContext: clonedRecordValue(source, 'listContext'),
        nestedList: clonedRecordValue(source, 'nestedList'),
        budget: clonedRecordValue(source, 'budget'),
        routeCommandActions: listValue(recordValue(source, 'routeCommandActions')).map((entry) => entry as GuiProjectedValue),
        controlFlowTarget: normalizeControlFlowTarget(source['controlFlowTarget']),
        messageRecord: record,
        branches,
        mergeGroups,
        ownerKey,
        isBranching: classification === 'branching' || BRANCH_ACTIONS.has(actionName),
    };
}
function normalizeBranches(branches: unknown, context: ActionContext, ownerKey: string, ownerBranchPath: number[]): ForesightBranch[] {
    if (context.depth >= MAX_BRANCH_DEPTH) {
        if (listValue(branches).length > 0 || getGroupedBranchIndices(context.branchGroups, ownerKey).length > 0) {
            context.admission.reasons.add('branch-depth-limit');
        }
        return [];
    }
    const sourceBranches = listValue(branches);
    const branchSources: (UnknownRecord | undefined)[] = [];
    readOwnArrayPrefix(sourceBranches, MAX_BRANCHES_PER_ACTION, context.admission, 'branch-container-limit').forEach((branch, index) => {
        const source = recordOrEmpty(branch);
        const branchIndex = getBranchIndex(source, index);
        if (branchIndex >= MAX_BRANCHES_PER_ACTION) {
            context.admission.reasons.add('branch-container-limit');
            return;
        }
        branchSources[branchIndex] = source;
    });
    const branchIndices = new Set<number>();
    branchSources.forEach((_branch, index) => branchIndices.add(index));
    for (const index of getGroupedBranchIndices(context.branchGroups, ownerKey))
        branchIndices.add(index);
    if (branchIndices.size === 0)
        return [];
    const admittedBranchIndices = Array.from(branchIndices)
        .sort((left, right) => left - right)
        .slice(0, MAX_BRANCHES_PER_ACTION);
    if (branchIndices.size > admittedBranchIndices.length) {
        context.admission.reasons.add('branch-container-limit');
    }
    const output: ForesightBranch[] = [];
    for (const branchIndex of admittedBranchIndices) {
        if (context.admission.remainingBranches <= 0) {
            context.admission.reasons.add('branch-limit');
            break;
        }
        context.admission.remainingBranches -= 1;
        context.admission.branchNodes += 1;
        const source = branchSources[branchIndex] ?? {};
        const directActions = listValue(source['actions']);
        const commandActions = listValue(source['commandActions']);
        const rawActions = directActions.length > 0 ? directActions : commandActions;
        const groupedActions = rawActions.length > 0 ? [] : getGroupedBranchActions(context.branchGroups, ownerKey, branchIndex);
        const selectedActions = rawActions.length > 0 ? rawActions : groupedActions;
        const actions = readOwnArrayPrefix(selectedActions, Math.min(selectedActions.length, context.admission.remainingActions), context.admission, 'action-limit');
        context.admission.omittedActions += selectedActions.length - actions.length;
        const branchPath = appendBranchPath(ownerBranchPath, branchIndex);
        const stops = findPathStops(context.pathStops, branchPath);
        const directLabel = nonEmptyString(source['label']);
        const sourceName = nonEmptyString(source['name']);
        const groupedLabel = getGroupedBranchLabel(groupedActions);
        let label = `Branch ${String(branchIndex + 1)}`;
        if (groupedLabel)
            label = groupedLabel;
        if (sourceName)
            label = sourceName;
        if (directLabel)
            label = directLabel;
        const nodes: ForesightNode[] = [];
        for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
            const nestedAction = actions[actionIndex];
            const node = createActionNode(nestedAction, {
                depth: context.depth + 1,
                ordinal: actionIndex + 1,
                path: `${context.path || 'root'}>branch:${String(branchIndex)}>${getActionPathSegment(nestedAction, actionIndex)}`,
                branchPath,
                textRecords: context.textRecords,
                currentMessageRecord: context.currentMessageRecord,
                usedRecords: context.usedRecords,
                branchGroups: context.branchGroups,
                pathStops: context.pathStops,
                admission: context.admission,
            });
            if (!node)
                break;
            nodes.push(node);
        }
        const branch: ForesightBranch = {
            label,
            branchIndex,
            branchPath,
            startIndex: finiteNumber(source['startIndex']),
            endIndex: finiteNumber(source['endIndex']),
            joinIndex: finiteNumber(source['joinIndex']),
            budget: clonedRecordValue(source, 'budget'),
            actionCount: nodes.length,
            actionsTruncated: Math.max(0, selectedActions.length - nodes.length),
            stops,
            nodes,
        };
        if (nodes.length < selectedActions.length) {
            branch.truncationReasons = Object.freeze(['action-limit'] as const);
        }
        output.push(branch);
    }
    return output;
}
export function createBranchMergeGroups(branches: ForesightBranch[]): BranchMergeGroup[] {
    const groups = new Map<string, MergeAccumulator>();
    branches.forEach((branch, lanePosition) => {
        const joinIndex = finiteNumber(branch.joinIndex);
        if (joinIndex === null)
            return;
        const key = String(joinIndex);
        let group = groups.get(key);
        if (!group) {
            group = { key, joinIndex, lanePositions: [], branchIndices: [] };
            groups.set(key, group);
        }
        group.lanePositions.push(lanePosition);
        group.branchIndices.push(normalizeBranchIndex(branch.branchIndex, lanePosition));
    });
    const output: BranchMergeGroup[] = [];
    for (const group of groups.values()) {
        if (group.lanePositions.length <= 1)
            continue;
        const startLane = Math.min(...group.lanePositions);
        const endLane = Math.max(...group.lanePositions);
        output.push({ ...group, startLane, endLane, span: endLane - startLane + 1 });
    }
    return output;
}
function getBranchIndex(branch: unknown, fallback: number): number {
    const direct = finiteNumber(recordValue(branch, 'branchIndex'));
    if (direct !== null)
        return normalizeBranchIndex(direct, fallback);
    const budget = recordOrEmpty(recordValue(branch, 'budget'));
    const fromBudget = finiteNumber(budget['branchIndex']);
    return fromBudget === null ? normalizeBranchIndex(fallback, 0) : normalizeBranchIndex(fromBudget, fallback);
}
function normalizeBranchIndex(value: unknown, fallback: unknown): number {
    const numeric = finiteNumber(value);
    if (numeric !== null && numeric >= 0)
        return Math.floor(numeric);
    return Math.max(0, Math.floor(finiteNumber(fallback) ?? 0));
}
function getGroupedBranchIndices(branchGroups: FlatBranchGroups, ownerKey: string): number[] {
    if (!ownerKey)
        return [];
    const indices = branchGroups.branchIndicesByOwner.get(ownerKey);
    return indices ? Array.from(indices) : [];
}
function getGroupedBranchActions(branchGroups: FlatBranchGroups, ownerKey: string, branchIndex: number): unknown[] {
    if (!ownerKey)
        return [];
    return branchGroups.actionsByBranch.get(createBranchGroupKey(ownerKey, branchIndex)) ?? [];
}
function getGroupedBranchLabel(actions: unknown[]): string {
    const first = actions.length > 0 ? actions[0] : null;
    return nonEmptyString(getActionListContext(first)['branchLabel']);
}
function normalizeBranchPath(value: unknown, fallback: unknown): number[] {
    let hasSource: boolean;
    try {
        hasSource = Array.isArray(value);
    }
    catch {
        hasSource = false;
    }
    if (hasSource) {
        const output: number[] = [];
        for (const entry of listValue(value)) {
            const numeric = finiteNumber(entry);
            if (numeric !== null)
                output.push(normalizeBranchIndex(numeric, 0));
        }
        return output;
    }
    return listValue(fallback).map((entry) => normalizeBranchIndex(entry, 0));
}
function appendBranchPath(branchPath: number[], branchIndex: number): number[] {
    return [...branchPath, normalizeBranchIndex(branchIndex, 0)];
}
function findPathStops(pathStops: unknown[], branchPath: number[]): ForesightPathStop[] {
    const output: ForesightPathStop[] = [];
    for (const candidate of pathStops) {
        const stop = recordOrEmpty(candidate);
        if (!branchPathsEqual(stop['branchPath'], branchPath))
            continue;
        output.push({
            index: finiteNumber(stop['index']),
            code: finiteNumber(stop['code']),
            label: nonEmptyString(stop['label']),
            stopReason: nonEmptyString(stop['stopReason']),
            stopReasonLabel: nonEmptyString(stop['stopReasonLabel']),
            branchDepth: finiteNumber(stop['branchDepth']),
            branchPath: normalizeBranchPath(stop['branchPath'], branchPath),
        });
    }
    return output;
}
function branchPathsEqual(left: unknown, right: number[]): boolean {
    if (!Array.isArray(left) || left.length !== right.length)
        return false;
    for (let index = 0; index < left.length; index += 1) {
        if (finiteNumber(left[index]) !== finiteNumber(right[index]))
            return false;
    }
    return true;
}
function findMessageRecordForAction(action: UnknownRecord, records: unknown[], usedRecords: Set<string>, currentMessageRecord: UnknownRecord | null, rawMessageText: unknown): UnknownRecord | null {
    if (!isMessageAction(action) || records.length === 0)
        return null;
    const actionIndex = finiteNumber(action['index']);
    const recordId = nonEmptyString(action['recordId']) || nonEmptyString(action['translationRecordId']);
    const candidates: UnknownRecord[] = [];
    for (const candidate of records) {
        if (!isUnknownRecord(candidate))
            continue;
        const candidateId = candidate['id'];
        if (candidateId && usedRecords.has(stringValue(candidateId)))
            continue;
        if (!isSameMessageRecord(candidate, currentMessageRecord))
            candidates.push(candidate);
    }
    if (recordId) {
        const byId = candidates.find((record) => stringValue(firstTruthy(record['id'], '')) === recordId);
        return byId ?? null;
    }
    if (actionIndex !== null) {
        const byIndex = candidates.find((record) => getRecordMessageStartIndex(record) === actionIndex);
        if (byIndex)
            return byIndex;
    }
    const messageText = normalizeComparableText(rawMessageText === undefined ? getConsumedMessageText(action) : rawMessageText);
    if (!messageText)
        return null;
    return candidates.find((record) => getRecordComparableTexts(record).some((text) => text === messageText)) ?? null;
}
function createSyntheticMessageRecord(action: UnknownRecord, context: ActionContext, rawMessageText: unknown): UnknownRecord | null {
    if (!isMessageAction(action))
        return null;
    const messageText = normalizeComparableText(rawMessageText);
    if (!messageText || isCurrentMessageAction(action, context.currentMessageRecord))
        return null;
    const actionIndex = finiteNumber(action['index']);
    const listContext = getActionListContext(action);
    const listId = nonEmptyString(listContext['listId']);
    const branchPath = normalizeBranchPath(action['branchPath'], context.branchPath).join('.');
    const idParts = [
        'foresight-message',
        listId || 'list',
        actionIndex === null ? `ordinal-${String(context.ordinal || 0)}` : `index-${String(actionIndex)}`,
        branchPath || 'root',
    ];
    const id = idParts.map((part) => cssToken(part)).join(':');
    return {
        id,
        hook: 'message',
        hookKey: 'message',
        status: 'detected',
        rawText: messageText,
        original: messageText,
        visibleText: messageText,
        translation: '',
        translationReceived: '',
        metadata: {
            foresight: true,
            syntheticForesightRecord: true,
            messageStartIndex: actionIndex,
            branchPath: normalizeBranchPath(action['branchPath'], context.branchPath),
        },
    };
}
function normalizeCurrentMessageRecord(record: unknown): UnknownRecord | null {
    return isUnknownRecord(record) ? record : null;
}
function isSameMessageRecord(record: UnknownRecord, currentMessageRecord: UnknownRecord | null): boolean {
    if (!currentMessageRecord)
        return false;
    const recordId = nonEmptyString(record['id']);
    const currentId = nonEmptyString(currentMessageRecord['id']);
    return Boolean(recordId) && recordId === currentId;
}
function isCurrentMessageAction(action: UnknownRecord, currentMessageRecord: UnknownRecord | null): boolean {
    if (!currentMessageRecord)
        return false;
    const actionIndex = finiteNumber(action['index']);
    const currentStartIndex = getRecordMessageStartIndex(currentMessageRecord);
    return actionIndex !== null && currentStartIndex !== null && actionIndex === currentStartIndex;
}
export function isMessageAction(action: unknown): boolean {
    const source = recordOrEmpty(action);
    return (stringValue(firstTruthy(source['action'], '')).toLowerCase() === 'message' ||
        stringValue(firstTruthy(source['scanBehavior'], '')).toLowerCase() === 'message' ||
        finiteNumber(source['code']) === 101);
}
function getRecordMessageStartIndex(record: UnknownRecord): number | null {
    const metadata = recordOrEmpty(record['metadata']);
    return finiteNumber(metadata['messageStartIndex']);
}
function getRecordComparableTexts(record: UnknownRecord): string[] {
    return [
        record['rawText'],
        record['original'],
        record['visibleText'],
        record['translationSource'],
        record['normalizedSource'],
    ]
        .map((value) => normalizeComparableText(value))
        .filter(Boolean);
}
function getConsumedMessageText(action: unknown): string {
    const lines: string[] = [];
    const consumedCommands = listValue(recordValue(action, 'consumedCommands'));
    const admittedLength = Math.min(consumedCommands.length, MAX_CONSUMED_COMMANDS);
    for (let index = 0; index < admittedLength; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(consumedCommands, String(index));
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
            continue;
        const candidate: unknown = descriptor.value;
        const command = recordOrEmpty(candidate);
        const code = finiteNumber(command['code']);
        const behavior = stringValue(firstTruthy(command['scanBehavior'], '')).toLowerCase();
        if (behavior !== 'message-line' && code !== 401 && code !== 405)
            continue;
        const parameters = listValue(command['parameters']);
        if (parameters.length > 0)
            lines.push(stringValue(parameters[0] ?? ''));
    }
    return lines.join('\n');
}
function getActionMessageText(action: unknown): string {
    const consumedText = getConsumedMessageText(action);
    if (normalizeComparableText(consumedText))
        return consumedText;
    const source = recordOrEmpty(action);
    return (nonEmptyString(source['messageText']) ||
        nonEmptyString(source['rawText']) ||
        nonEmptyString(source['text']) ||
        nonEmptyString(source['summary']));
}
function getActionPathSegment(action: unknown, index: number): string {
    const source = recordOrEmpty(action);
    const actionIndex = finiteNumber(source['index']);
    if (actionIndex !== null)
        return `index:${String(actionIndex)}`;
    const code = finiteNumber(source['code']);
    return `ordinal:${String(index + 1)}:code:${code === null ? '' : String(code)}`;
}
function createActionScrollKey(source: UnknownRecord, context: ActionContext, actionName: string): string {
    const actionIndex = finiteNumber(source['index']);
    const code = finiteNumber(source['code']);
    const recordId = nonEmptyString(source['recordId']) || nonEmptyString(source['translationRecordId']);
    const listId = nonEmptyString(getActionListContext(source)['listId']);
    const branchPath = normalizeBranchPath(source['branchPath'], context.branchPath).join('.');
    let identity = `path:${context.path || String(context.ordinal || 0)}`;
    if (actionIndex !== null)
        identity = `list:${listId}|index:${String(actionIndex)}`;
    if (recordId)
        identity = `record:${recordId}`;
    const normalizedActionName = actionName || normalizeAction(firstTruthy(source['action'], source['scanBehavior']));
    return [
        identity,
        `branch:${branchPath}`,
        `code:${code === null ? '' : String(code)}`,
        `action:${normalizedActionName}`,
        `label:${nonEmptyString(source['label']) || 'Unknown command'}`,
    ].join('|');
}
