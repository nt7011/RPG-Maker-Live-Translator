import { literal, type ForesightCommand } from './commands.js';
import { FORESIGHT_LIMITS, NATIVE_LIMITS, type ForesightLimits } from '../configuration/foresight.js';
import { foresightPolicy } from './policy.js';
import type { ForesightAddress, ForesightCandidate, ForesightNode, ForesightOutcome, ForesightPosition, ForesightSource, ForesightStop, ForesightStopSite, } from './graph.js';
interface ScanNode extends Omit<ForesightNode, 'next' | 'candidates' | 'stops' | 'valid' | 'arm' | 'outcome'> {
    readonly next: number[];
    readonly candidates: ForesightCandidate[];
    readonly stops: ForesightStopSite[];
    valid: boolean;
    arm: number | null;
    outcome: ForesightOutcome;
}
interface Branch {
    readonly indent: number;
    readonly kind: 'choice' | 'condition' | 'battle';
    readonly fork: number | null;
    readonly merge: number | null;
    readonly choices: number;
    readonly cancel: boolean;
    readonly arms: Set<number>;
    readonly distance: number;
    seenElse: boolean;
    nearestExit: number | null;
}
interface Message {
    readonly index: number;
    readonly indent: number;
    readonly parts: string[];
    units: number;
    supported: boolean;
}
interface CallFrame {
    readonly source: ForesightSource;
    readonly parent: number | null;
    readonly callIndex: number | null;
    readonly floor: number;
    readonly indent: number;
}
export function createForesightScan(options: {
    readonly start: number;
    readonly length: number;
    readonly selectedChoice?: number | null;
    readonly currentChoices?: boolean;
    readonly limits?: ForesightLimits;
    readonly messageUnits?: number;
}) {
    const limits = options.limits ?? FORESIGHT_LIMITS;
    const messageUnits = options.messageUnits ?? NATIVE_LIMITS.messageUnits;
    let owner: CallFrame = {
        source: { id: 0, length: options.length },
        parent: null,
        callIndex: null,
        floor: 0,
        indent: 0,
    };
    const frames: CallFrame[] = [owner];
    const callers: {
        frame: number;
        cursor: number;
        owner: CallFrame;
    }[] = [];
    let frame = 0, externalCommands = 0, stateCommands = 0;
    const nodes: ScanNode[] = [
        {
            frame: 0,
            index: options.start,
            kind: 'root',
            next: [],
            candidates: [],
            valid: true,
            arm: null,
            outcome: null,
            stops: [],
        },
    ];
    const branches: Branch[] = [];
    let cursor = options.start, tail: number | null = 0, reads = 0, inspectedUnits = 0, units = 0, messages = 0, messageDistance = 0, candidates = 0;
    let message: Message | null = null;
    let route: {
        index: number;
        offset: number;
        length: number;
    } | null = null;
    let routeIndent: number | null = null;
    let currentCode: number | null = null;
    let lastStop: ForesightStopSite | null = null;
    let skipped: {
        indent: number;
        code: number;
    } | null = null;
    let pendingBattle: {
        command: ForesightCommand;
        index: number;
    } | null = null;
    let done = false;
    const stops = new Map<ForesightStop, number>();
    const stopCodes = new Map<number, number>();
    const queue = [0], visited = new Set([0]);
    let head = 0, candidateOffset = 0;
    function stop(reason: ForesightStop, terminal = true, index = cursor, code = currentCode): void {
        stops.set(reason, (stops.get(reason) ?? 0) + 1);
        if (code !== null)
            stopCodes.set(code, (stopCodes.get(code) ?? 0) + 1);
        lastStop = Object.freeze({ reason, index, code, frame });
        const at = tail === null ? undefined : nodes[tail];
        if (at !== undefined && !at.stops.some((site) => site.reason === reason))
            at.stops.push(lastStop);
        if (terminal)
            done = true;
    }
    function node(kind: ScanNode['kind'], index: number, valid = true): number | null {
        if (nodes.length >= limits.nodes) {
            stop('nodes');
            return null;
        }
        nodes.push({ frame, index, kind, next: [], candidates: [], valid, arm: null, outcome: null, stops: [] });
        return nodes.length - 1;
    }
    function link(from: number | null, to: number | null): void {
        if (from !== null && to !== null)
            nodes[from]?.next.push(to);
    }
    function candidate(at: number, value: ForesightCandidate): void {
        if (!literal(value.text, messageUnits))
            return;
        if (candidates >= limits.candidates) {
            stop('candidates');
            return;
        }
        if (units + value.text.length > limits.units) {
            stop('units');
            return;
        }
        nodes[at]?.candidates.push(value);
        candidates++;
        units += value.text.length;
    }
    function horizon(): boolean {
        if (!done && messages >= limits.targetMessages && branches.length === 0)
            stop('messages');
        return done;
    }
    function finishMessage(): boolean {
        if (message === null)
            return done;
        if (tail !== null) {
            messages++;
            messageDistance++;
        }
        if (tail !== null && message.parts.length > 0 && message.supported) {
            const at = node('message', message.index);
            link(tail, at);
            tail = at;
            if (at !== null)
                candidate(at, {
                    frame,
                    distance: messageDistance,
                    index: message.index,
                    end: cursor,
                    choice: null,
                    text: message.parts.join('\n'),
                });
        }
        message = null;
        return horizon();
    }
    function exitArm(branch: Branch): void {
        if (tail !== null && branch.merge !== null) {
            link(tail, branch.merge);
            branch.nearestExit = Math.min(branch.nearestExit ?? Infinity, messageDistance);
        }
    }
    function open(command: ForesightCommand, index = cursor): void {
        if (branches.length >= limits.depth) {
            stop('depth');
            return;
        }
        const kind = command.code === 102 ? 'choice' : command.code === 301 ? 'battle' : 'condition';
        const fork = tail === null ? null : node(kind, index, false);
        link(tail, fork);
        const merge = fork === null ? null : node('merge', index);
        const branch: Branch = {
            indent: command.indent,
            kind,
            fork,
            merge,
            choices: kind === 'battle' ? 3 : (command.choices?.length ?? 0),
            cancel: command.branch === -2 ||
                (command.branch !== null && command.branch >= (command.choices?.length ?? Infinity)),
            arms: new Set(),
            distance: messageDistance,
            seenElse: false,
            nearestExit: null,
        };
        branches.push(branch);
        tail = kind === 'condition' ? fork : null;
        if (kind === 'choice' && fork !== null && !(frame === 0 && cursor === options.start && options.currentChoices))
            for (const [choice, text] of (command.choices ?? []).entries()) {
                candidate(fork, { frame, distance: messageDistance, index: cursor, end: cursor + 1, choice, text });
                if (done)
                    break;
            }
    }
    function marker(command: ForesightCommand): void {
        const branch = branches.at(-1);
        if (frame !== 0 && branches.length === owner.floor) {
            stop('malformed');
            return;
        }
        if (branch === undefined) {
            if (command.code === 402 ||
                command.code === 403 ||
                command.code === 411 ||
                (command.code >= 601 && command.code <= 603))
                skipped = {
                    indent: command.indent,
                    code: command.code === 411 ? 412 : command.code >= 601 ? 604 : 404,
                };
            return;
        }
        if (branch.indent !== command.indent) {
            stop('malformed');
            return;
        }
        if (branch.kind === 'condition') {
            if (command.code === 411 && !branch.seenElse) {
                exitArm(branch);
                branch.seenElse = true;
                tail = branch.fork;
                messageDistance = branch.distance;
                return;
            }
            if (command.code !== 412) {
                stop('malformed');
                return;
            }
            exitArm(branch);
            if (!branch.seenElse && branch.fork !== null) {
                link(branch.fork, branch.merge);
                branch.nearestExit = Math.min(branch.nearestExit ?? Infinity, branch.distance);
            }
        }
        else {
            if (branch.kind === 'battle'
                ? command.code >= 601 && command.code <= 603
                : command.code === 402 || command.code === 403) {
                const arm = branch.kind === 'battle' ? command.code - 601 : command.code === 403 ? -2 : command.branch;
                if (arm === null ||
                    (arm !== -2 && arm >= branch.choices) ||
                    (arm === -2 && !branch.cancel) ||
                    branch.arms.has(arm)) {
                    stop('malformed');
                    return;
                }
                exitArm(branch);
                branch.arms.add(arm);
                const selected = branch.kind === 'choice' &&
                    branch.fork !== null &&
                    nodes[branch.fork]?.index === options.start &&
                    nodes[branch.fork]?.frame === 0
                    ? options.selectedChoice
                    : null;
                const at = branch.fork === null || (selected != null && selected !== arm) ? null : node('branch', cursor);
                link(branch.fork, at);
                const child = at === null ? undefined : nodes[at];
                if (child !== undefined) {
                    child.arm = arm;
                    child.outcome =
                        branch.kind === 'battle' ? ((['win', 'escape', 'lose'] as const)[arm] ?? null) : null;
                }
                tail = at;
                messageDistance = branch.distance;
                return;
            }
            if (branch.kind === 'battle'
                ? command.code !== 604 || branch.arms.size === 0
                : command.code !== 404 || branch.arms.size !== branch.choices + (branch.cancel ? 1 : 0)) {
                stop('malformed');
                return;
            }
            exitArm(branch);
        }
        const fork = branch.fork === null ? undefined : nodes[branch.fork];
        if (fork !== undefined)
            fork.valid = true;
        branches.pop();
        tail = branch.nearestExit !== null ? branch.merge : null;
        messageDistance = branch.nearestExit ?? branch.distance;
        horizon();
    }
    function consume(command: ForesightCommand, call: (source: number, index: number) => ForesightSource | null): void {
        const policy = foresightPolicy(command.code);
        if (policy.uncertainty === 'external')
            externalCommands++;
        if (policy.uncertainty === 'state')
            stateCommands++;
        const continuation = command.code === 505 && command.indent === routeIndent;
        if (!continuation)
            routeIndent = null;
        if (skipped !== null) {
            if (command.indent < skipped.indent) {
                stop('malformed');
                return;
            }
            if (command.indent === skipped.indent && command.code === skipped.code)
                skipped = null;
            return;
        }
        if (message !== null) {
            if (command.code === 401 && command.indent === message.indent) {
                const text = command.text;
                message.units += (text?.length ?? messageUnits + 1) + (message.parts.length > 0 ? 1 : 0);
                message.supported &&= text !== null && message.units <= messageUnits;
                if (message.supported && text !== null)
                    message.parts.push(text);
                return;
            }
            if (finishMessage())
                return;
        }
        if (pendingBattle !== null) {
            const battle = pendingBattle;
            pendingBattle = null;
            if (command.code === 601 && command.indent === battle.command.indent) {
                open(battle.command, battle.index);
                if (done)
                    return;
            }
            else if (command.indent > battle.command.indent || (command.code >= 601 && command.code <= 604)) {
                stop('malformed');
                return;
            }
        }
        if (policy.action === 'marker') {
            marker(command);
            return;
        }
        const branch = branches.at(-1);
        if (branch !== undefined && command.indent <= branch.indent) {
            stop('malformed');
            return;
        }
        switch (policy.action) {
            case 'advance':
                break;
            case 'call': {
                const source = call(owner.source.id, cursor);
                if (source === null ||
                    source.id === owner.source.id ||
                    callers.some((entry) => entry.owner.source.id === source.id)) {
                    stop('unsupported', branches.length === 0);
                    tail = null;
                    break;
                }
                if (callers.length >= limits.depth) {
                    stop('depth');
                    break;
                }
                if (frames.length >= limits.nodes) {
                    stop('nodes');
                    break;
                }
                callers.push({ frame, cursor: cursor + 1, owner });
                owner = {
                    source,
                    parent: frame,
                    callIndex: cursor,
                    floor: branches.length,
                    indent: command.indent,
                };
                frames.push(owner);
                frame = frames.length - 1;
                cursor = -1;
                break;
            }
            case 'message':
                if (tail !== null && messages >= limits.messages) {
                    stop('messages');
                    break;
                }
                message = { index: cursor, indent: command.indent, parts: [], units: 0, supported: true };
                break;
            case 'choice':
            case 'condition':
                open(command);
                break;
            case 'battle':
                pendingBattle = { command, index: cursor };
                break;
            case 'route':
                if (command.routeLength !== null) {
                    route = { index: cursor, offset: 0, length: command.routeLength };
                    routeIndent = command.indent;
                    break;
                }
                stop('unsupported', branches.length === 0);
                tail = null;
                break;
            case 'route-continuation':
                if (continuation)
                    break;
                stop('unsupported', branches.length === 0);
                tail = null;
                break;
            default:
                stop('unsupported', branches.length === 0);
                tail = null;
        }
    }
    return Object.freeze({
        graph: (): readonly ForesightNode[] => nodes,
        locate(value: ForesightPosition): ForesightAddress | null {
            const selected = frames[value.frame];
            if (selected === undefined)
                return null;
            const path: {
                source: number;
                index: number;
                child: number;
            }[] = [];
            let child = selected;
            while (child.parent !== null) {
                const parent = frames[child.parent];
                if (parent === undefined || child.callIndex === null)
                    return null;
                path.push({ source: parent.source.id, index: child.callIndex, child: child.source.id });
                child = parent;
            }
            return { source: selected.source.id, index: value.index, path: path.reverse() };
        },
        exhausted: () => done && head >= queue.length,
        step(read: (source: number, index: number) => ForesightCommand | null, readRoute: (source: number, index: number, offset: number, length: number) => number | null = () => null, call: (source: number, index: number) => ForesightSource | null = () => null): void {
            const initialUnits = inspectedUnits;
            for (let i = 0; i < limits.slice && inspectedUnits - initialUnits < limits.sliceUnits && !done; i++) {
                currentCode = null;
                if (route === null && cursor >= owner.source.length) {
                    const finished = finishMessage();
                    pendingBattle = null;
                    if (finished)
                        break;
                    if (callers.length > 0) {
                        if (branches.length !== owner.floor || skipped !== null) {
                            stop('malformed');
                            break;
                        }
                        if (reads >= limits.reads) {
                            stop('reads');
                            break;
                        }
                        reads++;
                        const previous = callers.pop();
                        if (previous === undefined) {
                            stop('malformed');
                            break;
                        }
                        owner = previous.owner;
                        frame = previous.frame;
                        cursor = previous.cursor;
                        routeIndent = null;
                        continue;
                    }
                    stop(branches.length > 0 || skipped !== null ? 'malformed' : 'end');
                    break;
                }
                if (reads >= limits.reads) {
                    stop('reads', true, route?.index ?? cursor, route === null ? null : 205);
                    break;
                }
                if (inspectedUnits >= limits.inspectedUnits) {
                    stop('units');
                    break;
                }
                reads++;
                if (route !== null) {
                    const code = readRoute(owner.source.id, route.index, route.offset, route.length);
                    const final = route.offset === route.length - 1;
                    const reason = code === null || (code === 0) !== final ? 'malformed' : code > 45 ? 'unsupported' : null;
                    if (reason !== null) {
                        stop(reason, branches.length === 0, route.index, 205);
                        tail = null;
                        route = null;
                        routeIndent = null;
                    }
                    else if (++route.offset === route.length)
                        route = null;
                    continue;
                }
                const raw = read(owner.source.id, cursor);
                const command = raw === null ? null : { ...raw, indent: raw.indent + owner.indent };
                if (command === null) {
                    stop('malformed');
                    break;
                }
                currentCode = command.code;
                inspectedUnits += command.text?.length ?? 0;
                for (const label of command.choices ?? [])
                    inspectedUnits += label.length;
                consume(command, call);
                cursor++;
            }
        },
        next(): ForesightCandidate | null {
            if (!done)
                return null;
            for (let work = 0; work < limits.drain && head < queue.length; work++) {
                const queued = queue[head];
                const current = queued === undefined ? undefined : nodes[queued];
                if (current?.valid) {
                    const value = current.candidates[candidateOffset++];
                    if (value !== undefined)
                        return value;
                    for (const next of current.next)
                        if (!visited.has(next)) {
                            if (queue.length - head >= limits.frontiers) {
                                stop('frontiers', true, current.index, null);
                                head = queue.length;
                                return null;
                            }
                            visited.add(next);
                            queue.push(next);
                        }
                }
                candidateOffset = 0;
                head++;
            }
            return null;
        },
        stats: () => Object.freeze({
            reads,
            inspectedUnits,
            nodes: nodes.length,
            messages,
            candidates,
            units,
            frontiers: queue.length - head,
            done,
            stops: Object.fromEntries(stops),
            lastStop,
            externalCommands,
            stateCommands,
            callFrames: frames.length,
            stopCodes: Object.fromEntries(stopCodes),
        }),
    });
}
