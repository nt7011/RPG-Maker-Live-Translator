import { type ForesightView, type ForesightViewGraph, type ForesightLocation, type ForesightViewNode, type ForesightPreparation, type ForesightStopSite, } from '../../foresight/view.js';
import { FORESIGHT_VIEW_LIMITS } from '../../configuration/foresight.js';
export { readForesightView } from '../../foresight/read-view.js';
export function gameMessagePaths(graph: ForesightViewGraph, edgeLimit: number = FORESIGHT_VIEW_LIMITS.edges): ForesightViewGraph {
    const root = graph.nodes[0];
    if (root === undefined)
        return graph;
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const included = new Set([root.id]), queue = [root];
    const nodes: ForesightViewNode[] = [];
    let edges = 0, truncated = graph.truncated;
    for (const source of queue) {
        const next: number[] = [], visited = new Set<number>();
        const pending = [...source.next];
        const stops = new Map(source.stops.map((site) => [site.reason, site]));
        let omittedNext = source.omittedNext;
        for (const id of pending) {
            if (visited.has(id))
                continue;
            visited.add(id);
            const target = byId.get(id);
            if (target === undefined)
                continue;
            if (target.kind === 'message') {
                if (edges >= edgeLimit) {
                    omittedNext++;
                    continue;
                }
                next.push(id);
                edges++;
                if (!included.has(id)) {
                    included.add(id);
                    queue.push(target);
                }
            }
            else {
                omittedNext += target.omittedNext;
                for (const site of target.stops)
                    if (!stops.has(site.reason))
                        stops.set(site.reason, site);
                pending.push(...target.next);
            }
        }
        truncated ||= omittedNext > 0;
        nodes.push({ ...source, next, omittedNext, stops: [...stops.values()] });
    }
    return { ...graph, nodes, truncated };
}
export function nodeNotes(node: ForesightViewNode): readonly string[] {
    return [
        ...(node.valid ? [] : ['Unverified structure']),
        ...node.stops.filter((site) => site.reason !== 'end').map(describeStop),
        ...(node.omittedNext ? [`${String(node.omittedNext)} further paths omitted by the display limit`] : []),
    ];
}
export function copyForesightView(view: ForesightView | null, showText: boolean, messagesOnly = false): unknown {
    if (view === null)
        return null;
    const graph = messagesOnly ? gameMessagePaths(view.graph, view.limits.edges) : view.graph;
    return {
        ...view,
        graph: {
            ...graph,
            nodes: graph.nodes.map((node) => ({
                ...node,
                texts: node.texts.map((text) => ({
                    ...text,
                    preview: showText ? text.preview : '[future text hidden]',
                    translation: showText || text.translation === null ? text.translation : '[future text hidden]',
                })),
            })),
        },
    };
}
export const PREPARATION_LABELS: Readonly<Record<ForesightPreparation, string>> = {
    unrequested: 'Not requested',
    pending: 'Pending',
    ready: 'Prepared',
    skipped: 'Skipped',
    failed: 'Failed',
};
export function describeLocation(value: ForesightLocation): string {
    const owner = value.commonEvent === null ? 'Current event list' : `Common event ${String(value.commonEvent)}`;
    return `${owner} · command ${String(value.index)}`;
}
export function describeStop(site: ForesightStopSite): string {
    const address = site.location == null ? `command ${String(site.index)}` : describeLocation(site.location);
    return `${site.reason} at ${address}${site.code === null ? '' : ` (opcode ${String(site.code)})`}`;
}
