import { NATIVE_LIMITS, type ForesightNativeLimits } from '../configuration/foresight.js';
import { integer, own, readCommand, readMoveRoute } from './commands.js';
import type { ForesightAddress, ForesightCandidate, ForesightLocation, ForesightSource } from './graph.js';
interface Source {
    readonly ref: WeakRef<unknown[]>;
    readonly commonEvent: number | null;
    readonly length: number;
}
export function createForesightSources(scope: object, root: unknown[], limits: ForesightNativeLimits = NATIVE_LIMITS) {
    const sources: Source[] = [{ ref: new WeakRef(root), commonEvent: null, length: root.length }];
    const identities = new WeakMap<object, number>([[root, 0]]);
    function list(id: number): unknown[] | null {
        const entry = sources[id];
        const value = entry?.ref.deref();
        if (entry === undefined || value?.length !== entry.length)
            return null;
        if (entry.commonEvent !== null &&
            own(own(own(scope, '$dataCommonEvents'), entry.commonEvent), 'list') !== value)
            return null;
        return value;
    }
    function target(source: number, index: number): {
        list: unknown[];
        commonEvent: number;
    } | null {
        const command = own(list(source), index);
        const commonEvent = integer(own(own(command, 'parameters'), 0));
        if (own(command, 'code') !== 117 || commonEvent === null || commonEvent === 0)
            return null;
        const child = own(own(own(scope, '$dataCommonEvents'), commonEvent), 'list');
        return Array.isArray(child) ? { list: child, commonEvent } : null;
    }
    function call(source: number, index: number): ForesightSource | null {
        const child = target(source, index);
        if (child === null)
            return null;
        let id = identities.get(child.list);
        if (id !== undefined && sources[id]?.commonEvent !== child.commonEvent)
            return null;
        if (id === undefined) {
            id = sources.length;
            identities.set(child.list, id);
            sources.push({ ref: new WeakRef(child.list), commonEvent: child.commonEvent, length: child.list.length });
        }
        return list(id) === null ? null : { id, length: child.list.length };
    }
    function validate(candidate: ForesightCandidate, address: ForesightAddress): boolean {
        for (const step of address.path) {
            const child = target(step.source, step.index);
            if (child === null ||
                child.commonEvent !== sources[step.child]?.commonEvent ||
                child.list !== list(step.child))
                return false;
        }
        const input = list(address.source);
        if (input === null)
            return false;
        const header = readCommand(input, candidate.index, limits);
        if (candidate.choice !== null)
            return header?.code === 102 && header.choices?.[candidate.choice] === candidate.text;
        if (header?.code !== 101)
            return false;
        let offset = 0;
        for (let index = candidate.index + 1; index < candidate.end; index++) {
            const command = readCommand(input, index, limits);
            if (command?.code !== 401 || command.indent !== header.indent || command.text === null)
                return false;
            if (index > candidate.index + 1 && candidate.text[offset++] !== '\n')
                return false;
            if (!candidate.text.startsWith(command.text, offset))
                return false;
            offset += command.text.length;
        }
        return offset === candidate.text.length && readCommand(input, candidate.end, limits)?.code !== 401;
    }
    function describe(address: ForesightAddress | null): ForesightLocation | null {
        if (address === null)
            return null;
        const source = sources[address.source];
        if (source === undefined)
            return null;
        const via: ForesightLocation['via'][number][] = [];
        for (const step of address.path) {
            const parent = sources[step.source], child = sources[step.child];
            if (parent === undefined || child === undefined)
                return null;
            via.push(Object.freeze({
                commonEvent: parent.commonEvent,
                index: step.index,
                childCommonEvent: child.commonEvent,
            }));
        }
        return Object.freeze({ commonEvent: source.commonEvent, index: address.index, via: Object.freeze(via) });
    }
    return Object.freeze({
        call,
        validate,
        describe,
        read: (source: number, index: number) => readCommand(list(source), index, limits),
        route: (source: number, index: number, offset: number, length: number) => readMoveRoute(list(source), index, offset, length),
    });
}
