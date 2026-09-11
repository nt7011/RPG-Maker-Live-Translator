type PropertyBag = Readonly<Record<PropertyKey, unknown>>;
type UnknownFunction = (...args: unknown[]) => unknown;
interface ForesightScanCommandFacts {
    readonly index: number;
    readonly command: PropertyBag;
    readonly metadata: Readonly<object>;
}
interface ForesightScanListFacts {
    readonly kind: 'event-list' | 'movement-list' | 'movement-command';
    readonly length: number | null;
}
export interface ForesightBranchListGenerationFacade {
    readonly readListFacts: (session: unknown, generation: unknown) => ForesightScanListFacts | null;
    readonly readCommand: (session: unknown, generation: unknown, index: unknown, adoptWindow: (window: Readonly<object>) => boolean) => boolean;
    readonly readCommandFacts: (session: unknown, window: unknown) => ForesightScanCommandFacts | null;
}
interface MovementFlowFacade {
    readonly resolveControlFlowTarget: (session: unknown, generation: unknown, command: ForesightScanCommandFacts) => unknown;
}
export interface ForesightBranchTarget {
    readonly ownerIndex: number;
    readonly headerIndex: number | null;
    readonly startIndex: number;
    readonly endIndex: number;
    readonly joinIndex: number;
    readonly bodyIndent: number;
    readonly label: string;
    readonly branchIndex: number;
}
export type ForesightBranchRead = {
    readonly transparent: true;
    readonly targets: readonly ForesightBranchTarget[];
    readonly joinIndex: number;
} | {
    readonly transparent: false;
    readonly stopReason: 'control-flow-target' | 'unsafe-control-flow' | 'branch-structure-desync' | 'unsupported-branch';
    readonly branches: readonly unknown[];
    readonly controlFlowTarget?: unknown;
};
export interface ForesightBranchParts {
    readBranchCommand(session: unknown, generation: unknown, current: ForesightScanCommandFacts, expectedIndent: unknown): ForesightBranchRead;
    splitBudgetAcrossBranches(totalBudget: unknown, branchCount: unknown): number[];
}
interface BranchHeader {
    readonly index: number;
    readonly label: string;
}
const IntrinsicObject = Object;
const IntrinsicTypeError = TypeError;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const numberFrom = Number;
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const mathFloor = Math.floor;
const mathMax = Math.max;
const reflectApply = Reflect.apply;
const stringFrom = String;
function captureMethod(target: object, key: PropertyKey): UnknownFunction {
    const descriptor = objectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value !== 'function')
        throw new IntrinsicTypeError(`[Foresight] Missing branch intrinsic ${stringFrom(key)}.`);
    return value as UnknownFunction;
}
const stringTrim = captureMethod(String.prototype, 'trim');
function call<Result>(method: UnknownFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(method, receiver, args) as Result;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return call<Readonly<Value>>(objectFreeze, IntrinsicObject, [value]);
}
function append<Value>(values: Value[], value: Value): void {
    const index = values.length;
    objectDefineProperty(values, index, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
    });
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    if (!descriptor || !('value' in descriptor) || descriptor.value !== value) {
        throw new IntrinsicTypeError('[Foresight] Branch roster publication failed.');
    }
}
function ownData(source: unknown, key: PropertyKey): unknown {
    if (!source || typeof source !== 'object')
        return undefined;
    try {
        const descriptor = objectGetOwnPropertyDescriptor(source, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function finiteNumber(value: unknown): number | null {
    if (typeof value !== 'number' &&
        typeof value !== 'string' &&
        typeof value !== 'boolean' &&
        typeof value !== 'bigint') {
        return null;
    }
    const numeric = numberFrom(value);
    return numberIsFinite(numeric) ? numeric : null;
}
function nonEmptyString(value: unknown): string {
    return typeof value === 'string' ? call<string>(stringTrim, value, []) : '';
}
function structuralFailure(): ForesightBranchRead {
    return freezeExact({
        transparent: false,
        stopReason: 'branch-structure-desync' as const,
        branches: freezeExact([]),
    });
}
export function createForesightBranches(listGenerations: ForesightBranchListGenerationFacade, movementFlow: MovementFlowFacade): ForesightBranchParts {
    const readListFacts = listGenerations.readListFacts as unknown as UnknownFunction;
    const readCommand = listGenerations.readCommand as unknown as UnknownFunction;
    const readCommandFacts = listGenerations.readCommandFacts as unknown as UnknownFunction;
    const resolveControlFlowTarget = movementFlow.resolveControlFlowTarget as unknown as UnknownFunction;
    function readOwnedCommand(session: object, generation: object, index: number): ForesightScanCommandFacts | null {
        const pending: {
            window: Readonly<object> | null;
            open: boolean;
        } = { window: null, open: true };
        const sink = (window: unknown): boolean => {
            if (!pending.open || pending.window || !window || typeof window !== 'object')
                return false;
            pending.window = window;
            return pending.open;
        };
        let accepted: boolean;
        try {
            accepted = call<unknown>(readCommand, listGenerations, [session, generation, index, sink]) === true;
        }
        catch {
            accepted = false;
        }
        finally {
            pending.open = false;
        }
        if (!accepted || !pending.window)
            return null;
        try {
            return call<ForesightScanCommandFacts | null>(readCommandFacts, listGenerations, [session, pending.window]);
        }
        catch {
            return null;
        }
    }
    function listLength(session: object, generation: object): number | null {
        try {
            const facts = call<ForesightScanListFacts | null>(readListFacts, listGenerations, [session, generation]);
            return facts?.kind === 'event-list' && facts.length !== null ? facts.length : null;
        }
        catch {
            return null;
        }
    }
    function branchLabel(command: PropertyBag, defaultValue: string): string {
        const code = finiteNumber(ownData(command, 'code'));
        const parameters = ownData(command, 'parameters');
        if (code === 402)
            return nonEmptyString(ownData(parameters, '1')) || defaultValue;
        if (code === 403)
            return 'Cancel';
        if (code === 411)
            return 'Condition false';
        if (code === 601)
            return 'Win';
        if (code === 602)
            return 'Escape';
        if (code === 603)
            return 'Lose';
        return defaultValue;
    }
    function delimitedHeader(code: number | null, ownerCode: number): boolean {
        if (ownerCode === 102)
            return code === 402 || code === 403;
        return code === 601 || code === 602 || code === 603;
    }
    function delimitedEnd(ownerCode: number): number {
        return ownerCode === 102 ? 404 : 604;
    }
    function readDelimited(session: object, generation: object, ownerIndex: number, expectedIndent: number, ownerCode: number): ForesightBranchRead {
        const length = listLength(session, generation);
        if (length === null || ownerIndex >= length)
            return structuralFailure();
        const headers: BranchHeader[] = [];
        for (let cursor = ownerIndex + 1; cursor < length; cursor += 1) {
            const facts = readOwnedCommand(session, generation, cursor);
            if (facts?.index !== cursor)
                return structuralFailure();
            const indent = finiteNumber(ownData(facts.command, 'indent'));
            const code = finiteNumber(ownData(facts.command, 'code'));
            if (indent === null || indent < expectedIndent)
                return structuralFailure();
            if (indent !== expectedIndent)
                continue;
            if (code === delimitedEnd(ownerCode)) {
                if (headers.length === 0)
                    return structuralFailure();
                const joinIndex = cursor + 1;
                const targets: ForesightBranchTarget[] = [];
                for (let headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
                    const header = headers[headerIndex];
                    if (!header)
                        return structuralFailure();
                    const nextHeader = headers[headerIndex + 1];
                    append(targets, {
                        ownerIndex,
                        headerIndex: header.index,
                        startIndex: header.index + 1,
                        endIndex: nextHeader?.index ?? cursor,
                        joinIndex,
                        bodyIndent: expectedIndent + 1,
                        label: header.label,
                        branchIndex: headerIndex,
                    });
                }
                return freezeExact({ transparent: true, targets: freezeExact(targets), joinIndex: cursor + 1 });
            }
            if (!delimitedHeader(code, ownerCode))
                return structuralFailure();
            const header: BranchHeader = freezeExact({
                index: cursor,
                label: branchLabel(facts.command, `Branch ${stringFrom(headers.length + 1)}`),
            });
            append(headers, header);
        }
        return structuralFailure();
    }
    function readConditional(session: object, generation: object, ownerIndex: number, expectedIndent: number): ForesightBranchRead {
        const length = listLength(session, generation);
        if (length === null || ownerIndex >= length)
            return structuralFailure();
        let elseIndex: number | null = null;
        for (let cursor = ownerIndex + 1; cursor < length; cursor += 1) {
            const facts = readOwnedCommand(session, generation, cursor);
            if (facts?.index !== cursor)
                return structuralFailure();
            const indent = finiteNumber(ownData(facts.command, 'indent'));
            const code = finiteNumber(ownData(facts.command, 'code'));
            if (indent === null || indent < expectedIndent)
                return structuralFailure();
            if (indent !== expectedIndent)
                continue;
            if (code === 411 && elseIndex === null) {
                elseIndex = cursor;
                continue;
            }
            if (code !== 412)
                return structuralFailure();
            const joinIndex = cursor + 1;
            const targets: readonly ForesightBranchTarget[] = freezeExact([
                freezeExact({
                    ownerIndex,
                    headerIndex: ownerIndex,
                    startIndex: ownerIndex + 1,
                    endIndex: elseIndex ?? cursor,
                    joinIndex,
                    bodyIndent: expectedIndent + 1,
                    label: 'Condition true',
                    branchIndex: 0,
                }),
                freezeExact({
                    ownerIndex,
                    headerIndex: elseIndex,
                    startIndex: elseIndex === null ? cursor : elseIndex + 1,
                    endIndex: cursor,
                    joinIndex,
                    bodyIndent: expectedIndent + 1,
                    label: 'Condition false',
                    branchIndex: 1,
                }),
            ]);
            return freezeExact({ transparent: true, targets, joinIndex });
        }
        return structuralFailure();
    }
    function readBranchCommand(session: unknown, generation: unknown, current: ForesightScanCommandFacts, expectedIndent: unknown): ForesightBranchRead {
        if (!session || typeof session !== 'object' || !generation || typeof generation !== 'object')
            return structuralFailure();
        const index = finiteNumber(ownData(current, 'index'));
        const metadata = ownData(current, 'metadata');
        const code = finiteNumber(ownData(metadata, 'code'));
        if (index === null || !numberIsInteger(index) || index < 0)
            return structuralFailure();
        if (code === 112 || code === 113 || code === 119 || code === 413) {
            let target: unknown;
            try {
                target = call<unknown>(resolveControlFlowTarget, movementFlow, [session, generation, current]);
            }
            catch {
                target = null;
            }
            return target
                ? freezeExact({
                    transparent: false,
                    stopReason: 'control-flow-target' as const,
                    controlFlowTarget: target,
                    branches: freezeExact([]),
                })
                : freezeExact({
                    transparent: false,
                    stopReason: 'unsafe-control-flow' as const,
                    branches: freezeExact([]),
                });
        }
        if (code === 402 ||
            code === 403 ||
            code === 404 ||
            code === 411 ||
            code === 412 ||
            code === 601 ||
            code === 602 ||
            code === 603 ||
            code === 604) {
            return structuralFailure();
        }
        const indent = typeof expectedIndent === 'number' && numberIsFinite(expectedIndent) ? expectedIndent : null;
        if (indent === null)
            return structuralFailure();
        if (code === 102 || code === 301)
            return readDelimited(session, generation, index, indent, code);
        if (code === 111)
            return readConditional(session, generation, index, indent);
        return freezeExact({
            transparent: false,
            stopReason: 'unsupported-branch' as const,
            branches: freezeExact([]),
        });
    }
    function splitBudgetAcrossBranches(totalBudget: unknown, branchCount: unknown): number[] {
        const count = numberFrom(branchCount);
        if (!numberIsInteger(count) || count <= 0)
            return [];
        const numericTotal = numberFrom(totalBudget);
        const total = mathMax(0, mathFloor(numberIsFinite(numericTotal) ? numericTotal : 0));
        const base = mathFloor(total / count);
        const remainder = total % count;
        const allocation: number[] = [];
        for (let index = 0; index < count; index += 1)
            append(allocation, base + (index < remainder ? 1 : 0));
        return allocation;
    }
    return freezeExact({ readBranchCommand, splitBudgetAcrossBranches });
}
