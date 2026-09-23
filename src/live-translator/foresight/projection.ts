import type { ForesightCandidate, ForesightNode } from './graph.js';
import { type ForesightLocation, type ForesightPreparedText, type ForesightProjection, type ForesightViewGraph, type ForesightViewNode, } from './view.js';
import { PROJECTION_LIMITS, FORESIGHT_VIEW_LIMITS, type ForesightViewLimits } from '../configuration/foresight.js';
interface Selected {
    readonly id: number;
    readonly next: number[];
    omittedNext: number;
}
export function createMessageProjection(nodes: readonly ForesightNode[], limits: {
    readonly slice: number;
    readonly work: number;
} = PROJECTION_LIMITS, viewLimits: ForesightViewLimits = FORESIGHT_VIEW_LIMITS) {
    let work = 0;
    let state: ForesightProjection['state'] = 'building';
    let collapsed = 0, hiddenStops = 0, projected = 0, reachable = 0;
    let selected: Selected[] = [{ id: 0, next: [], omittedNext: 0 }];
    let truncated = false;
    const representatives = new Map<number, number | null>();
    const successors = new Map<number, number[]>();
    function* reduce(): Generator<void> {
        const visited = new Set<number>([0]);
        const stack = [{ id: 0, offset: 0 }];
        while (stack.length > 0) {
            const top = stack.at(-1);
            if (top === undefined)
                break;
            const node = nodes[top.id];
            if (node === undefined) {
                state = 'limited';
                truncated = true;
                return;
            }
            if (node.valid && top.offset < node.next.length) {
                const child = node.next[top.offset++];
                if (child === undefined) {
                    state = 'limited';
                    truncated = true;
                    return;
                }
                if (!visited.has(child)) {
                    visited.add(child);
                    stack.push({ id: child, offset: 0 });
                }
                yield;
                continue;
            }
            const next = new Set<number>();
            if (node.valid)
                for (const child of node.next) {
                    const representative = representatives.get(child);
                    if (representative !== null && representative !== undefined)
                        next.add(representative);
                    yield;
                }
            reachable++;
            const keep = top.id === 0 ||
                node.kind === 'message' ||
                node.kind === 'choice' ||
                (node.kind === 'branch' && next.size > 0) ||
                next.size > 1;
            if (keep) {
                representatives.set(top.id, top.id);
                successors.set(top.id, [...next]);
                projected++;
            }
            else {
                representatives.set(top.id, next.values().next().value ?? null);
                collapsed++;
                hiddenStops += node.stops.length;
            }
            stack.pop();
            yield;
        }
        const output: Selected[] = [{ id: 0, next: [], omittedNext: 0 }];
        const included = new Set([0]);
        let edges = 0;
        for (const item of output) {
            for (const target of successors.get(item.id) ?? []) {
                if (edges >= viewLimits.edges || (!included.has(target) && output.length >= viewLimits.nodes)) {
                    item.omittedNext++;
                    truncated = true;
                }
                else {
                    if (!included.has(target)) {
                        included.add(target);
                        output.push({ id: target, next: [], omittedNext: 0 });
                    }
                    item.next.push(target);
                    edges++;
                }
                yield;
            }
            yield;
        }
        selected = output;
        state = 'complete';
        representatives.clear();
        successors.clear();
    }
    const task = reduce();
    const stats = (): ForesightProjection => Object.freeze({
        state,
        work,
        reachable,
        collapsed,
        hiddenStops,
        projected,
        omittedNodes: state === 'complete' ? projected - selected.length : 0,
    });
    return Object.freeze({
        stats,
        step(): number {
            const before = work;
            for (let count = 0; count < limits.slice && state === 'building'; count++) {
                if (work >= limits.work) {
                    state = 'limited';
                    truncated = true;
                    task.return(undefined);
                    break;
                }
                work++;
                task.next();
            }
            return work - before;
        },
        view(preparation: (candidate: ForesightCandidate) => ForesightPreparedText, locate: (value: {
            frame: number;
            index: number;
        }) => ForesightLocation | null): ForesightViewGraph {
            let texts = 0, clipped = truncated;
            const output: ForesightViewNode[] = selected.flatMap(({ id, next, omittedNext }) => {
                const source = nodes[id];
                if (source === undefined) {
                    clipped = true;
                    return [];
                }
                const values = [];
                for (const candidate of source.candidates) {
                    if (texts >= viewLimits.texts) {
                        clipped = true;
                        break;
                    }
                    texts++;
                    const prepared = preparation(candidate);
                    values.push(Object.freeze({
                        choice: candidate.choice,
                        preview: candidate.text.slice(0, viewLimits.snippet),
                        truncated: candidate.text.length > viewLimits.snippet,
                        preparation: prepared.state,
                        translation: prepared.translation,
                        translationTruncated: prepared.translationTruncated,
                    }));
                }
                return Object.freeze({
                    id,
                    index: source.index,
                    kind: source.kind,
                    arm: source.arm,
                    valid: source.valid,
                    next: Object.freeze([...next]),
                    texts: Object.freeze(values),
                    stops: Object.freeze(source.stops.map((site) => Object.freeze({
                        reason: site.reason,
                        index: site.index,
                        code: site.code,
                        location: locate(site),
                    }))),
                    location: locate(source),
                    omittedNext,
                    outcome: source.outcome,
                });
            });
            return Object.freeze({ nodes: Object.freeze(output), truncated: clipped, projection: stats() });
        },
    });
}
