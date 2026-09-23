import { readForesightViewLimits } from '../configuration/foresight.js';
import { type ForesightView, type ForesightLocation, type ForesightProjection, type ForesightViewNode, type ForesightViewText, type ForesightStop, type ForesightStopSite, } from './view.js';
const KINDS = ['root', 'message', 'choice', 'condition', 'branch', 'merge', 'battle'] as const;
const STATES = ['waiting', 'scanning', 'preparing', 'complete', 'unavailable'] as const;
const PREPARATIONS = ['unrequested', 'pending', 'ready', 'skipped', 'failed'] as const;
const STOPS: readonly ForesightStop[] = [
    'end',
    'unsupported',
    'malformed',
    'messages',
    'reads',
    'nodes',
    'candidates',
    'frontiers',
    'depth',
    'units',
];
function own(value: unknown, key: PropertyKey): unknown {
    if (value === null || typeof value !== 'object')
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function count(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function member<T extends string>(choices: readonly T[], value: unknown): value is T {
    return typeof value === 'string' && choices.includes(value as T);
}
function list(value: unknown, limit: number): unknown[] | null {
    const size = own(value, 'length');
    if (!Array.isArray(value) || !count(size) || size > limit)
        return null;
    return Array.from({ length: size }, (_, index) => own(value, index));
}
function location(value: unknown, depth: number): ForesightLocation | null {
    const commonEvent = own(value, 'commonEvent'), index = own(value, 'index');
    const via = list(own(value, 'via'), depth);
    if ((commonEvent !== null && !count(commonEvent)) || !count(index) || via === null)
        return null;
    const copied: ForesightLocation['via'][number][] = [];
    for (const entry of via) {
        const commonEvent = own(entry, 'commonEvent'), index = own(entry, 'index'), childCommonEvent = own(entry, 'childCommonEvent');
        if ((commonEvent !== null && !count(commonEvent)) ||
            !count(index) ||
            (childCommonEvent !== null && !count(childCommonEvent)))
            return null;
        copied.push({ commonEvent, index, childCommonEvent });
    }
    return { commonEvent, index, via: copied };
}
function projection(value: unknown): ForesightProjection | null {
    const state = own(value, 'state'), work = own(value, 'work'), reachable = own(value, 'reachable'), collapsed = own(value, 'collapsed'), hiddenStops = own(value, 'hiddenStops'), projected = own(value, 'projected'), omittedNodes = own(value, 'omittedNodes');
    if (!member(['building', 'complete', 'limited'] as const, state) ||
        !count(work) ||
        !count(reachable) ||
        !count(collapsed) ||
        !count(hiddenStops) ||
        !count(projected) ||
        !count(omittedNodes) ||
        collapsed > reachable ||
        projected > reachable ||
        omittedNodes > projected)
        return null;
    return { state, work, reachable, collapsed, hiddenStops, projected, omittedNodes };
}
function stopSite(value: unknown, depth: number): ForesightStopSite | null {
    const reason = own(value, 'reason'), index = own(value, 'index'), code = own(value, 'code');
    const rawLocation = own(value, 'location'), copied = location(rawLocation, depth);
    if ((rawLocation !== null && copied === null) || (copied !== null && copied.index !== index))
        return null;
    return member(STOPS, reason) && count(index) && (code === null || count(code))
        ? { reason, index, code, location: copied }
        : null;
}
export function readForesightView(value: unknown): ForesightView | null {
    try {
        const revision = own(value, 'revision'), state = own(value, 'state');
        const showSpoilers = own(value, 'showSpoilers');
        const limits = readForesightViewLimits(own(value, 'limits'));
        if (limits === null)
            return null;
        const waiting = own(value, 'waiting');
        const prepared = own(value, 'prepared'), failed = own(value, 'failed'), outstanding = own(value, 'outstanding');
        if (!count(revision) ||
            typeof showSpoilers !== 'boolean' ||
            !member(STATES, state) ||
            (waiting !== null && waiting !== 'no-submission' && waiting !== 'origin-unavailable') ||
            !count(prepared) ||
            !count(failed) ||
            typeof outstanding !== 'boolean')
            return null;
        const rawAnchor = own(value, 'anchor');
        let anchor: ForesightView['anchor'] = null;
        if (rawAnchor !== null) {
            const id = own(rawAnchor, 'id'), textId = own(rawAnchor, 'textId'), index = own(rawAnchor, 'index');
            if (!count(id) || id === 0 || !count(textId) || textId === 0 || !count(index))
                return null;
            anchor = { id, textId, index };
        }
        const rawStats = own(value, 'stats');
        let stats: ForesightView['stats'] = null;
        if (rawStats !== null) {
            const reads = own(rawStats, 'reads'), nodes = own(rawStats, 'nodes'), candidates = own(rawStats, 'candidates'), units = own(rawStats, 'units');
            if (!count(reads) || !count(nodes) || !count(candidates) || !count(units))
                return null;
            const stops: Partial<Record<ForesightStop, number>> = {};
            for (const key of STOPS) {
                const amount = own(own(rawStats, 'stops'), key);
                if (amount === undefined)
                    continue;
                if (!count(amount))
                    return null;
                stops[key] = amount;
            }
            const rawStop = own(rawStats, 'lastStop');
            const lastStop = stopSite(rawStop, limits.pathDepth);
            if (rawStop !== null && lastStop === null)
                return null;
            stats = { reads, nodes, candidates, units, stops, lastStop };
        }
        const rawGraph = own(value, 'graph'), truncated = own(rawGraph, 'truncated');
        const rawProjection = own(rawGraph, 'projection'), projected = projection(rawProjection);
        if (rawProjection !== null && projected === null)
            return null;
        const input = list(own(rawGraph, 'nodes'), limits.nodes);
        if (input === null || typeof truncated !== 'boolean')
            return null;
        const nodes: ForesightViewNode[] = [], ids = new Set<number>();
        let textCount = 0, edgeCount = 0;
        for (const entry of input) {
            const id = own(entry, 'id'), index = own(entry, 'index'), kind = own(entry, 'kind');
            const arm = own(entry, 'arm'), valid = own(entry, 'valid');
            const rawLocation = own(entry, 'location'), address = location(rawLocation, limits.pathDepth), omittedNext = own(entry, 'omittedNext'), outcome = own(entry, 'outcome');
            if ((rawLocation !== null && address === null) ||
                (address !== null && address.index !== index) ||
                !count(omittedNext) ||
                (outcome !== null && !member(['win', 'escape', 'lose'] as const, outcome)))
                return null;
            const next = list(own(entry, 'next'), limits.edges);
            const texts = list(own(entry, 'texts'), limits.texts);
            const stops = list(own(entry, 'stops'), STOPS.length)?.map((site) => stopSite(site, limits.pathDepth)) ?? null;
            if (!count(id) ||
                ids.has(id) ||
                !count(index) ||
                !member(KINDS, kind) ||
                typeof valid !== 'boolean' ||
                (arm !== null && arm !== -2 && !count(arm)) ||
                next === null ||
                texts === null ||
                stops === null ||
                !next.every(count) ||
                !stops.every((item): item is ForesightStopSite => item !== null) ||
                (edgeCount += next.length) > limits.edges ||
                (textCount += texts.length) > limits.texts)
                return null;
            const captured: ForesightViewText[] = [];
            for (const text of texts) {
                const preview = own(text, 'preview'), truncated = own(text, 'truncated'), choice = own(text, 'choice'), preparation = own(text, 'preparation'), translation = own(text, 'translation'), translationTruncated = own(text, 'translationTruncated');
                if (typeof preview !== 'string' ||
                    preview.length > limits.snippet * 10 ||
                    typeof truncated !== 'boolean' ||
                    (choice !== null && !count(choice)) ||
                    !member(PREPARATIONS, preparation) ||
                    (translation !== null &&
                        (typeof translation !== 'string' ||
                            translation.length > limits.snippet * 10 ||
                            preparation !== 'ready')) ||
                    typeof translationTruncated !== 'boolean' ||
                    (translation === null && translationTruncated))
                    return null;
                captured.push({ preview, truncated, choice, preparation, translation, translationTruncated });
            }
            ids.add(id);
            nodes.push({
                id,
                index,
                kind,
                arm,
                valid,
                next,
                texts: captured,
                stops,
                location: address,
                omittedNext,
                outcome,
            });
        }
        if (nodes.some((node) => node.next.some((id) => !ids.has(id))))
            return null;
        if (anchor === null ? nodes.length !== 0 || stats !== null : nodes[0]?.id !== 0 || stats === null)
            return null;
        const indegrees = new Map(nodes.map((node) => [node.id, 0]));
        const byId = new Map(nodes.map((node) => [node.id, node]));
        for (const node of nodes)
            for (const next of node.next)
                indegrees.set(next, (indegrees.get(next) ?? 0) + 1);
        const queue = nodes.length > 0 && indegrees.get(0) === 0 ? [0] : [];
        for (const id of queue) {
            const node = byId.get(id);
            if (node === undefined)
                return null;
            for (const next of node.next) {
                const remaining = (indegrees.get(next) ?? 0) - 1;
                indegrees.set(next, remaining);
                if (remaining === 0)
                    queue.push(next);
            }
        }
        if (queue.length !== nodes.length)
            return null;
        return {
            revision,
            showSpoilers,
            limits,
            state,
            waiting,
            anchor,
            stats,
            prepared,
            failed,
            outstanding,
            graph: { nodes, truncated, projection: projected },
        };
    }
    catch {
        return null;
    }
}
