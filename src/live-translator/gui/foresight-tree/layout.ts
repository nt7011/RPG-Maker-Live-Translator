import type { ForesightBranch, ForesightModel, ForesightNode, ForesightPathStop, UnknownRecord, } from './model-types.js';
interface TimelineItemPosition {
    lane: number;
    column: number;
    rowIndex?: number;
}
interface TimelineItemLabel {
    branchLabel?: string;
    branchPath: number[];
}
export type TimelineItemContent = (TimelineItemLabel & {
    kind: 'node' | 'condensed';
    node: ForesightNode;
}) | (TimelineItemLabel & {
    kind: 'placeholder';
    branch: ForesightBranch;
}) | (TimelineItemLabel & {
    kind: 'stop';
    branch: ForesightBranch;
    stops: ForesightPathStop[];
}) | (TimelineItemLabel & {
    kind: 'truncated';
    branch: ForesightBranch;
    count: number;
});
export type TimelineItem = TimelineItemContent & TimelineItemPosition;
export interface TimelineRow {
    lane: number;
    rowIndex?: number;
    items: TimelineItem[];
}
export interface TimelineLayout {
    messagesOnly: boolean;
    currentMessageRecord: UnknownRecord | null;
    rows: TimelineRow[];
    columnCount: number;
}
interface LayoutAccumulator {
    rows: (TimelineRow | undefined)[];
    columnCount: number;
}
interface LaneAllocator {
    allocate(startColumn: number, minimumLane: number): number;
    reserve(lane: number, endColumn: number): void;
}
interface SequenceContext {
    allocator: LaneAllocator;
    layout: LayoutAccumulator;
    lane: number;
    startColumn: number;
    branchLabel: string;
    branchPath: number[];
}
interface BranchesContext {
    allocator: LaneAllocator;
    layout: LayoutAccumulator;
    parentLane: number;
    startColumn: number;
}
interface BranchTailContext {
    layout: LayoutAccumulator;
    lane: number;
    startColumn: number;
    branchPath: number[];
}
export function createTimelineLayout(model: ForesightModel | null | undefined): TimelineLayout {
    const layout: LayoutAccumulator = {
        rows: [],
        columnCount: 0,
    };
    const allocator = createLaneAllocator();
    placeSequence(Array.isArray(model?.nodes) ? model.nodes : [], {
        allocator,
        layout,
        lane: 0,
        startColumn: 0,
        branchLabel: '',
        branchPath: [],
    });
    return {
        messagesOnly: model?.messagesOnly === true,
        currentMessageRecord: model?.currentMessageRecord ?? null,
        rows: compactRows(layout.rows),
        columnCount: Math.max(1, layout.columnCount),
    };
}
function placeSequence(nodes: (ForesightNode | null | undefined)[], context: SequenceContext): number {
    const sourceNodes = Array.isArray(nodes) ? nodes : [];
    let column = Math.max(0, Math.floor(context.startColumn || 0));
    let pendingBranchLabel = context.branchLabel || '';
    sourceNodes.forEach((node) => {
        if (!node)
            return;
        if (node.messageOnlyJunction === true) {
            const branches = Array.isArray(node.branches) ? node.branches : [];
            if (branches.length === 1) {
                column = placeInlineBranch(branches[0], {
                    allocator: context.allocator,
                    layout: context.layout,
                    lane: context.lane,
                    startColumn: column,
                    branchLabel: pendingBranchLabel,
                    branchPath: context.branchPath,
                });
            }
            else {
                placeBranches(branches, {
                    allocator: context.allocator,
                    layout: context.layout,
                    parentLane: context.lane,
                    startColumn: column,
                });
                column += 1;
            }
            pendingBranchLabel = '';
            return;
        }
        addLayoutItem(context.layout, context.lane, column, {
            kind: node.condensed === true ? 'condensed' : 'node',
            node,
            branchLabel: pendingBranchLabel,
            branchPath: normalizeBranchPath(node.branchPath, context.branchPath),
        });
        pendingBranchLabel = '';
        if (Array.isArray(node.branches) && node.branches.length > 0) {
            placeBranches(node.branches, {
                allocator: context.allocator,
                layout: context.layout,
                parentLane: context.lane,
                startColumn: column + 1,
            });
        }
        column += 1;
    });
    return column;
}
function placeInlineBranch(branch: ForesightBranch | undefined, context: SequenceContext): number {
    const source = branch ?? {};
    const branchLabel = combineBranchLabels(context.branchLabel, normalizeBranchLabel(source));
    const branchPath = normalizeBranchPath(source.branchPath, context.branchPath);
    const nodes = Array.isArray(source.nodes) ? source.nodes : [];
    let endColumn = context.startColumn;
    if (nodes.length > 0) {
        endColumn = placeSequence(nodes, {
            allocator: context.allocator,
            layout: context.layout,
            lane: context.lane,
            startColumn: context.startColumn,
            branchLabel,
            branchPath,
        });
    }
    endColumn = placeBranchTail(source, {
        layout: context.layout,
        lane: context.lane,
        startColumn: endColumn,
        branchPath,
    });
    context.allocator.reserve(context.lane, Math.max(context.startColumn, endColumn - 1));
    return endColumn;
}
function placeBranches(branches: (ForesightBranch | null | undefined)[], context: BranchesContext): number {
    const sourceBranches = Array.isArray(branches) ? branches : [];
    let maxEndColumn = context.startColumn;
    sourceBranches.forEach((branch) => {
        const source = branch ?? {};
        const branchLane = context.allocator.allocate(context.startColumn, context.parentLane + 1);
        let endColumn: number;
        const branchLabel = normalizeBranchLabel(source);
        const branchPath = normalizeBranchPath(source.branchPath, []);
        const nodes = Array.isArray(source.nodes) ? source.nodes : [];
        if (nodes.length > 0) {
            endColumn = placeSequence(nodes, {
                allocator: context.allocator,
                layout: context.layout,
                lane: branchLane,
                startColumn: context.startColumn,
                branchLabel,
                branchPath,
            });
        }
        else {
            addLayoutItem(context.layout, branchLane, context.startColumn, {
                kind: 'placeholder',
                branch: source,
                branchLabel,
                branchPath,
            });
            endColumn = context.startColumn + 1;
        }
        endColumn = placeBranchTail(source, {
            layout: context.layout,
            lane: branchLane,
            startColumn: endColumn,
            branchPath,
        });
        context.allocator.reserve(branchLane, Math.max(context.startColumn, endColumn - 1));
        maxEndColumn = Math.max(maxEndColumn, endColumn);
    });
    return maxEndColumn;
}
function placeBranchTail(branch: ForesightBranch, context: BranchTailContext): number {
    let column = context.startColumn;
    const stops = Array.isArray(branch.stops) ? branch.stops : [];
    if (stops.length > 0) {
        addLayoutItem(context.layout, context.lane, column, {
            kind: 'stop',
            branch,
            stops,
            branchPath: context.branchPath,
        });
        column += 1;
    }
    const hiddenCount = Math.max(0, Number(branch.actionsTruncated) || 0);
    if (hiddenCount > 0) {
        addLayoutItem(context.layout, context.lane, column, {
            kind: 'truncated',
            branch,
            count: hiddenCount,
            branchPath: context.branchPath,
        });
        column += 1;
    }
    return column;
}
function addLayoutItem(layout: LayoutAccumulator, lane: number, column: number, item: TimelineItemContent): TimelineItem {
    const row = ensureLayoutRow(layout, lane);
    const nextItem: TimelineItem = { ...item, lane, column };
    row.items.push(nextItem);
    layout.columnCount = Math.max(layout.columnCount, column + 1);
    return nextItem;
}
function ensureLayoutRow(layout: LayoutAccumulator, lane: number): TimelineRow {
    const safeLane = Math.max(0, Math.floor(lane || 0));
    const existingRow = layout.rows[safeLane];
    if (existingRow)
        return existingRow;
    const row: TimelineRow = {
        lane: safeLane,
        items: [],
    };
    layout.rows[safeLane] = row;
    return row;
}
function compactRows(rows: (TimelineRow | undefined)[]): TimelineRow[] {
    return (Array.isArray(rows) ? rows : [])
        .filter((row): row is TimelineRow => Boolean(row?.items.length))
        .map((row, rowIndex) => ({
        lane: row.lane,
        rowIndex,
        items: row.items
            .toSorted((left, right) => left.column - right.column)
            .map((item) => ({ ...item, rowIndex })),
    }));
}
function createLaneAllocator(): LaneAllocator {
    const busyUntilByLane = new Map<number, number>();
    return {
        allocate(startColumn, minimumLane) {
            let lane = Math.max(0, Math.floor(minimumLane || 0));
            while ((busyUntilByLane.get(lane) ?? -1) >= startColumn)
                lane += 1;
            return lane;
        },
        reserve(lane, endColumn) {
            const safeLane = Math.max(0, Math.floor(lane || 0));
            const safeEnd = Math.max(0, Math.floor(endColumn || 0));
            busyUntilByLane.set(safeLane, Math.max(busyUntilByLane.get(safeLane) ?? -1, safeEnd));
        },
    };
}
function normalizeBranchLabel(branch: ForesightBranch): string {
    const label = typeof branch.label === 'string' && branch.label.trim() ? branch.label.trim() : '';
    if (label)
        return label;
    const index = Number(branch.branchIndex);
    return Number.isFinite(index) ? `Branch ${String(Math.floor(index) + 1)}` : 'Branch';
}
function combineBranchLabels(parent: unknown, child: unknown): string {
    const parentLabel = typeof parent === 'string' && parent.trim() ? parent.trim() : '';
    const childLabel = typeof child === 'string' && child.trim() ? child.trim() : '';
    if (!parentLabel)
        return childLabel;
    if (!childLabel || childLabel === parentLabel)
        return parentLabel;
    return `${parentLabel} / ${childLabel}`;
}
function normalizeBranchPath(value: unknown, fallback: number[]): number[] {
    if (Array.isArray(value)) {
        return value
            .map((entry) => Number(entry))
            .filter((entry) => Number.isFinite(entry))
            .map((entry) => Math.max(0, Math.floor(entry)));
    }
    return Array.isArray(fallback) ? fallback.slice() : [];
}
