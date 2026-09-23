import type { ForesightViewNode } from '../../foresight/view.js';
import { nodeNotes } from './model.js';
export const TIMELINE = Object.freeze({
    width: 224,
    content: 56,
    header: 38,
    notes: 26,
    gapX: 40,
    gapY: 24,
    padding: 16,
    scrollbar: 16,
});
export interface NodeSize {
    readonly height: number;
    readonly portY: number;
}
export interface PositionedNode extends NodeSize {
    readonly node: ForesightViewNode;
    readonly column: number;
    readonly x: number;
    readonly y: number;
}
function freePosition(occupied: readonly PositionedNode[], height: number, preferred: number, bottom: number, minimum: number): number | null {
    let start = minimum, best: number | null = null;
    function consider(end: number): void {
        if (end - start < height)
            return;
        const y = Math.max(start, Math.min(preferred, end - height));
        if (best === null || Math.abs(y - preferred) < Math.abs(best - preferred))
            best = y;
    }
    for (const item of occupied) {
        consider(item.y - TIMELINE.gapY);
        start = Math.max(start, item.y + item.height + TIMELINE.gapY);
    }
    consider(bottom);
    return best;
}
export function layoutTree(nodes: readonly ForesightViewNode[], maxHeight: number, sizes: ReadonlyMap<number, NodeSize> = new Map(), messagesOnly = false) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const parents = new Map(nodes.map((node) => [node.id, [] as number[]]));
    for (const node of nodes)
        for (const next of node.next)
            parents.get(next)?.push(node.id);
    const incoming = new Map(nodes.map((node) => [node.id, parents.get(node.id)?.length ?? 0]));
    const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
    const positioned = new Map<number, PositionedNode>();
    const columns: PositionedNode[][] = [];
    const bottom = Math.max(TIMELINE.padding, maxHeight - TIMELINE.padding);
    for (const id of queue) {
        const node = byId.get(id);
        if (node === undefined)
            continue;
        const predecessors = (parents.get(id) ?? [])
            .map((parent) => positioned.get(parent))
            .filter((item): item is PositionedNode => item !== undefined);
        const single = predecessors.length === 1 ? predecessors[0] : undefined;
        const stacked = node.kind === 'condition' && single?.node.kind === 'condition' ? single : undefined;
        const header = messagesOnly ? 0 : TIMELINE.header;
        const size = sizes.get(id) ?? {
            height: header + TIMELINE.content + (nodeNotes(node).length > 0 ? TIMELINE.notes : 0),
            portY: header + TIMELINE.content / 2,
        };
        let column = stacked?.column ?? Math.max(0, ...predecessors.map((item) => item.column + 1));
        const preferred = predecessors.length === 0
            ? TIMELINE.padding
            : predecessors.reduce((sum, item) => sum + item.y + item.portY, 0) / predecessors.length - size.portY;
        let y: number | null = null;
        while (y === null) {
            const occupied = (columns[column] ??= []);
            if (size.height > bottom - TIMELINE.padding) {
                if (occupied.length === 0)
                    y = TIMELINE.padding;
            }
            else {
                const minimum = stacked?.column === column ? stacked.y + stacked.height + TIMELINE.gapY : TIMELINE.padding;
                y = freePosition(occupied, size.height, preferred, bottom, minimum);
            }
            if (y === null)
                column++;
        }
        const item = { node, column, x: TIMELINE.padding + column * (TIMELINE.width + TIMELINE.gapX), y, ...size };
        positioned.set(id, item);
        columns[column]?.push(item);
        columns[column]?.sort((left, right) => left.y - right.y);
        for (const next of node.next) {
            const remaining = (incoming.get(next) ?? 0) - 1;
            incoming.set(next, remaining);
            if (remaining === 0)
                queue.push(next);
        }
    }
    return {
        columnCount: columns.length,
        width: TIMELINE.padding * 2 + columns.length * TIMELINE.width + Math.max(0, columns.length - 1) * TIMELINE.gapX,
        height: Math.max(TIMELINE.padding, ...Array.from(positioned.values(), (item) => item.y + item.height)) +
            TIMELINE.padding,
        nodes: [...positioned.values()],
    };
}
export function connectorPath(from: PositionedNode, to: PositionedNode): string {
    const fromX = from.x + TIMELINE.width, fromY = from.y + from.portY;
    const toX = to.x, toY = to.y + to.portY;
    const reach = toX >= fromX ? (toX - fromX) / 2 : TIMELINE.width / 3;
    return `M ${String(fromX)} ${String(fromY)} C ${String(fromX + reach)} ${String(fromY)}, ${String(toX - reach)} ${String(toY)}, ${String(toX)} ${String(toY)}`;
}
