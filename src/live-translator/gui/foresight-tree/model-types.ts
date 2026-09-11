import type { GuiProjectedValue } from '../projection.js';
import type { ControlFlowTarget } from './utils.js';
export type UnknownRecord = Record<string, unknown>;
export interface ForesightPathStop {
    index: number | null;
    code: number | null;
    label: string;
    stopReason: string;
    stopReasonLabel: string;
    branchDepth: number | null;
    branchPath: number[];
}
export interface BranchMergeGroup {
    key: string;
    joinIndex: number;
    lanePositions: number[];
    branchIndices: number[];
    startLane: number;
    endLane: number;
    span: number;
}
export interface ForesightBranch {
    label?: string;
    branchIndex?: number;
    branchPath?: number[];
    startIndex?: number | null;
    endIndex?: number | null;
    joinIndex?: number | null;
    budget?: GuiProjectedValue;
    actionCount?: number;
    actionsTruncated?: number;
    truncationReasons?: readonly ForesightModelTruncationReason[];
    stops?: ForesightPathStop[];
    nodes?: ForesightNode[];
    mergeGroups?: BranchMergeGroup[];
}
export interface ForesightNode {
    raw?: UnknownRecord;
    scrollKey?: string;
    ordinal?: number;
    index?: number | null;
    code?: number | null;
    label?: string;
    classification?: string;
    action?: string;
    native?: boolean;
    category?: string;
    scanBehavior?: string;
    stalenessRisk?: string;
    summary?: string;
    stopReason?: string;
    stopReasonLabel?: string;
    priorityDistance?: number | null;
    branchDepth?: number | null;
    branchPath?: number[] | GuiProjectedValue;
    listContext?: GuiProjectedValue;
    nestedList?: GuiProjectedValue;
    budget?: GuiProjectedValue;
    routeCommandActions?: GuiProjectedValue;
    controlFlowTarget?: ControlFlowTarget | null;
    messageRecord?: UnknownRecord | null;
    branches?: ForesightBranch[];
    mergeGroups?: BranchMergeGroup[];
    ownerKey?: string;
    isBranching?: boolean;
    messageOnlyJunction?: boolean;
    condensed?: boolean;
    count?: unknown;
    text?: string;
    actions?: GuiProjectedValue;
}
export interface ForesightModel {
    messagesOnly: boolean;
    hasSnapshot: boolean;
    snapshotUpdatedAt: unknown;
    scan: UnknownRecord | null;
    currentMessageRecord: UnknownRecord | null;
    scanCount: number;
    summary: UnknownRecord | null;
    actionLimit: number;
    actionCount: number;
    actionsAvailable: number;
    actionsTruncated: number;
    condensedActionCount: number;
    admission: ForesightModelAdmission;
    nodes: ForesightNode[];
}
export type ForesightModelTruncationReason = 'action-limit' | 'branch-container-limit' | 'branch-depth-limit' | 'branch-limit' | 'diagnostic-projection-incomplete' | 'path-stop-limit' | 'text-record-limit';
export interface ForesightModelAdmission {
    readonly truncated: boolean;
    readonly reasons: readonly ForesightModelTruncationReason[];
    readonly actionNodes: number;
    readonly branchNodes: number;
    readonly diagnosticNodes: number;
}
