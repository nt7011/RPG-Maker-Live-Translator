type PropertyBag = Readonly<Record<PropertyKey, unknown>>;
type UnknownFunction = (...args: unknown[]) => unknown;
interface ForesightScanCommandFacts {
    readonly index: number;
    readonly command: PropertyBag;
    readonly metadata: Readonly<object>;
}
interface ForesightScanListFacts {
    readonly identity: Readonly<object>;
    readonly kind: 'event-list' | 'movement-list' | 'movement-command';
    readonly length: number | null;
}
export interface ForesightMessageListGenerationFacade {
    readonly readListFacts: (session: unknown, generation: unknown) => ForesightScanListFacts | null;
    readonly readCommand: (session: unknown, generation: unknown, index: unknown, adoptWindow: (window: Readonly<object>) => boolean) => boolean;
    readonly readCommandFacts: (session: unknown, window: unknown) => ForesightScanCommandFacts | null;
    readonly attestScanSession: (session: unknown) => boolean;
}
export interface ForesightMessageCommandBlock {
    readonly complete: boolean;
    readonly startIndex: number;
    readonly nextIndex: number;
    readonly indent: number;
    readonly rawText: string;
    readonly interpreterId: unknown;
    readonly rejected?: true;
    readonly stopReason?: string;
}
export interface ForesightMessageBlockParser {
    readonly prepareAdmittedMessageCommandBlock: (session: unknown, generation: unknown, startIndex: unknown, interpreterId: unknown, commandAllowance: unknown, adoptReceipt: (receipt: Readonly<object>) => boolean) => boolean;
    readonly readMessageCommandBlock: (receipt: unknown) => ForesightMessageCommandBlock | null;
    readonly attestMessageCommandBlock: (receipt: unknown) => boolean;
    readonly retireMessageCommandBlock: (receipt: unknown) => boolean;
}
interface ParsedMessageFacts {
    readonly complete: boolean;
    readonly startIndex: number;
    readonly nextIndex: number;
    readonly indent: number;
    readonly rawText: string;
    readonly interpreterId: unknown;
    readonly rejected: true | null;
    readonly stopReason: string;
}
interface ParserReceiptState {
    readonly session: object;
    readonly generation: object;
    readonly listFacts: ForesightScanListFacts;
    readonly facts: ParsedMessageFacts;
    phase: 'active' | 'attesting' | 'retired';
}
const MAX_MESSAGE_LINES = 256;
const MAX_MESSAGE_TEXT_UNITS = 16 * 1024;
const IntrinsicObject = Object;
const IntrinsicArray = Array;
const IntrinsicWeakMap = WeakMap;
const IntrinsicWeakSet = WeakSet;
const IntrinsicTypeError = TypeError;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const numberFrom = Number;
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const mathFloor = Math.floor;
const reflectApply = Reflect.apply;
const stringFrom = String;
function captureMethod(target: object, key: PropertyKey): UnknownFunction {
    const descriptor = objectGetOwnPropertyDescriptor(target, key);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value !== 'function')
        throw new IntrinsicTypeError(`[Foresight] Missing message-parser intrinsic ${stringFrom(key)}.`);
    return value as UnknownFunction;
}
const arrayJoin = captureMethod(IntrinsicArray.prototype, 'join');
const weakMapDelete = captureMethod(IntrinsicWeakMap.prototype, 'delete');
const weakMapGet = captureMethod(IntrinsicWeakMap.prototype, 'get');
const weakMapSet = captureMethod(IntrinsicWeakMap.prototype, 'set');
const weakSetAdd = captureMethod(IntrinsicWeakSet.prototype, 'add');
const weakSetHas = captureMethod(IntrinsicWeakSet.prototype, 'has');
function call<Result>(method: UnknownFunction, receiver: unknown, args: readonly unknown[]): Result {
    return reflectApply(method, receiver, args) as Result;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return call<Readonly<Value>>(objectFreeze, IntrinsicObject, [value]);
}
function createOpaqueToken(): Readonly<object> {
    return freezeExact(call<object>(objectCreate as unknown as UnknownFunction, IntrinsicObject, [null]));
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
function ownCallable(source: object, key: PropertyKey): UnknownFunction {
    const value = ownData(source, key);
    if (typeof value !== 'function') {
        throw new IntrinsicTypeError(`[Foresight] Missing message-parser owner method ${stringFrom(key)}.`);
    }
    return value as UnknownFunction;
}
function primitiveNumber(value: unknown): number | null {
    if (typeof value !== 'number' &&
        typeof value !== 'string' &&
        typeof value !== 'boolean' &&
        typeof value !== 'bigint') {
        return null;
    }
    const numeric = numberFrom(value);
    return numberIsFinite(numeric) ? numeric : null;
}
function lineText(value: unknown): string {
    if (value === null || value === undefined)
        return '';
    return typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
        ? stringFrom(value)
        : '';
}
function validateCommandFacts(value: unknown, expectedIndex: number): ForesightScanCommandFacts | null {
    const index = ownData(value, 'index');
    const command = ownData(value, 'command');
    const metadata = ownData(value, 'metadata');
    if (index !== expectedIndex ||
        !command ||
        typeof command !== 'object' ||
        !metadata ||
        typeof metadata !== 'object') {
        return null;
    }
    return freezeExact({
        index: expectedIndex,
        command: command as PropertyBag,
        metadata,
    });
}
function appendOwnedLine(lines: string[], line: string): boolean {
    const index = lines.length;
    try {
        call(objectDefineProperty as unknown as UnknownFunction, IntrinsicObject, [
            lines,
            index,
            { value: line, writable: true, enumerable: true, configurable: true },
        ]);
        return lines.length === index + 1 && ownData(lines, index) === line;
    }
    catch {
        return false;
    }
}
export function createForesightMessageBlockParser(listGenerations: ForesightMessageListGenerationFacade): ForesightMessageBlockParser {
    const listGenerationReceiver = listGenerations;
    const readListFacts = ownCallable(listGenerationReceiver, 'readListFacts');
    const readCommand = ownCallable(listGenerationReceiver, 'readCommand');
    const readCommandFacts = ownCallable(listGenerationReceiver, 'readCommandFacts');
    const attestScanSession = ownCallable(listGenerationReceiver, 'attestScanSession');
    const receiptStates = new IntrinsicWeakMap<object, ParserReceiptState>();
    const retiredReceipts = new IntrinsicWeakSet<object>();
    function callOwner<Result>(method: UnknownFunction, args: readonly unknown[]): Result {
        return call<Result>(method, listGenerationReceiver, args);
    }
    function readOwnedCommand(session: object, generation: object, index: number): ForesightScanCommandFacts | null {
        let adoptedWindow: Readonly<object> | null = null;
        let adoptionOpen = true;
        let sinkInFlight = false;
        const adoptWindow = (window: Readonly<object>): boolean => {
            if (!adoptionOpen || sinkInFlight || adoptedWindow || !window || typeof window !== 'object')
                return false;
            sinkInFlight = true;
            try {
                if (!adoptionOpen || adoptedWindow)
                    return false;
                adoptedWindow = window;
                return true;
            }
            finally {
                sinkInFlight = false;
            }
        };
        let accepted: boolean;
        try {
            accepted = callOwner<unknown>(readCommand, [session, generation, index, adoptWindow]) === true;
        }
        catch {
            accepted = false;
        }
        finally {
            adoptionOpen = false;
        }
        if (!accepted || !adoptedWindow)
            return null;
        try {
            return validateCommandFacts(callOwner<unknown>(readCommandFacts, [session, adoptedWindow]), index);
        }
        catch {
            return null;
        }
    }
    function rejectedBlock(startIndex: number, nextIndex: number, interpreterId: unknown, stopReason: string): ForesightMessageCommandBlock {
        return freezeExact({
            complete: false,
            rejected: true as const,
            stopReason,
            startIndex,
            nextIndex,
            indent: 0,
            rawText: '',
            interpreterId,
        });
    }
    function completeBlock(complete: boolean, startIndex: number, nextIndex: number, indent: number, lines: readonly string[], interpreterId: unknown): ForesightMessageCommandBlock {
        return freezeExact({
            complete,
            startIndex,
            nextIndex,
            indent,
            rawText: call<string>(arrayJoin, lines, ['\n']),
            interpreterId,
        });
    }
    function parseAdmitted(session: object, generation: object, listFacts: ForesightScanListFacts, startIndex: number, interpreterId: unknown, commandLimit: number): ForesightMessageCommandBlock | null {
        const length = listFacts.length;
        if (listFacts.kind !== 'event-list' || length === null || startIndex >= length)
            return null;
        const opener = readOwnedCommand(session, generation, startIndex);
        if (!opener)
            return rejectedBlock(startIndex, startIndex, interpreterId, 'foresight-command-window-unavailable');
        if (ownData(opener.metadata, 'scanBehavior') !== 'message')
            return null;
        const indent = primitiveNumber(ownData(opener.command, 'indent')) ?? 0;
        const lines: string[] = [];
        let textUnits = 0;
        let index = startIndex + 1;
        let remainingAllowance = commandLimit - 1;
        while (index < length && remainingAllowance > 0 && lines.length < MAX_MESSAGE_LINES) {
            const command = readOwnedCommand(session, generation, index);
            if (!command)
                return rejectedBlock(startIndex, index, interpreterId, 'foresight-command-window-unavailable');
            if (ownData(command.metadata, 'scanBehavior') !== 'message-line' ||
                (primitiveNumber(ownData(command.command, 'indent')) ?? 0) !== indent) {
                return completeBlock(true, startIndex, index, indent, lines, interpreterId);
            }
            const parameters = ownData(command.command, 'parameters');
            const line = lineText(ownData(parameters, '0'));
            const nextTextUnits = textUnits + line.length + (lines.length > 0 ? 1 : 0);
            if (nextTextUnits > MAX_MESSAGE_TEXT_UNITS) {
                return rejectedBlock(startIndex, index, interpreterId, 'foresight-message-text-limit');
            }
            if (!appendOwnedLine(lines, line)) {
                return rejectedBlock(startIndex, index, interpreterId, 'foresight-command-window-unavailable');
            }
            textUnits = nextTextUnits;
            index += 1;
            remainingAllowance -= 1;
        }
        if (index >= length)
            return completeBlock(true, startIndex, index, indent, lines, interpreterId);
        const lookahead = readOwnedCommand(session, generation, index);
        if (!lookahead)
            return rejectedBlock(startIndex, index, interpreterId, 'foresight-command-window-unavailable');
        const continues = ownData(lookahead.metadata, 'scanBehavior') === 'message-line' &&
            (primitiveNumber(ownData(lookahead.command, 'indent')) ?? 0) === indent;
        return completeBlock(!continues, startIndex, index, indent, lines, interpreterId);
    }
    function captureFacts(block: ForesightMessageCommandBlock): ParsedMessageFacts {
        return freezeExact({
            complete: block.complete,
            startIndex: block.startIndex,
            nextIndex: block.nextIndex,
            indent: block.indent,
            rawText: block.rawText,
            interpreterId: block.interpreterId,
            rejected: block.rejected === true ? true : null,
            stopReason: typeof block.stopReason === 'string' ? block.stopReason : '',
        });
    }
    function copyFacts(facts: ParsedMessageFacts): ForesightMessageCommandBlock {
        return freezeExact(facts.rejected === true
            ? {
                complete: facts.complete,
                rejected: true,
                stopReason: facts.stopReason,
                startIndex: facts.startIndex,
                nextIndex: facts.nextIndex,
                indent: facts.indent,
                rawText: facts.rawText,
                interpreterId: facts.interpreterId,
            }
            : {
                complete: facts.complete,
                startIndex: facts.startIndex,
                nextIndex: facts.nextIndex,
                indent: facts.indent,
                rawText: facts.rawText,
                interpreterId: facts.interpreterId,
            });
    }
    function markReceiptRetired(receipt: object, state: ParserReceiptState): void {
        call(weakMapDelete, receiptStates, [receipt]);
        state.phase = 'retired';
        call(weakSetAdd, retiredReceipts, [receipt]);
    }
    function attestReceiptState(receipt: object, state: ParserReceiptState): boolean {
        if (state.phase !== 'active')
            return false;
        state.phase = 'attesting';
        let sessionCurrent = false;
        let currentFacts: ForesightScanListFacts | null = null;
        let sessionCurrentAfterRead = false;
        try {
            sessionCurrent = callOwner<unknown>(attestScanSession, [state.session]) === true;
            if (sessionCurrent &&
                state.phase === 'attesting' &&
                call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]) === state) {
                currentFacts = callOwner<ForesightScanListFacts | null>(readListFacts, [
                    state.session,
                    state.generation,
                ]);
            }
            if (currentFacts === state.listFacts &&
                state.phase === 'attesting' &&
                call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]) === state) {
                sessionCurrentAfterRead = callOwner<unknown>(attestScanSession, [state.session]) === true;
            }
        }
        catch {
            sessionCurrentAfterRead = false;
        }
        const current = sessionCurrent &&
            currentFacts === state.listFacts &&
            sessionCurrentAfterRead &&
            state.phase === 'attesting' &&
            call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]) === state;
        if (!current) {
            markReceiptRetired(receipt, state);
            return false;
        }
        state.phase = 'active';
        return true;
    }
    function prepareAdmittedMessageCommandBlock(session: unknown, generation: unknown, startIndex: unknown, interpreterId: unknown, commandAllowance: unknown, adoptReceipt: (receipt: Readonly<object>) => boolean): boolean {
        if (!session ||
            typeof session !== 'object' ||
            !generation ||
            typeof generation !== 'object' ||
            typeof adoptReceipt !== 'function') {
            return false;
        }
        const normalizedStartIndex = primitiveNumber(startIndex);
        const allowance = primitiveNumber(commandAllowance);
        if (normalizedStartIndex === null ||
            !numberIsInteger(normalizedStartIndex) ||
            normalizedStartIndex < 0 ||
            allowance === null ||
            allowance < 1) {
            return false;
        }
        let listFacts: ForesightScanListFacts | null;
        try {
            listFacts = callOwner<ForesightScanListFacts | null>(readListFacts, [session, generation]);
        }
        catch {
            listFacts = null;
        }
        if (!listFacts)
            return false;
        const block = parseAdmitted(session, generation, listFacts, normalizedStartIndex, interpreterId, mathFloor(allowance));
        if (!block)
            return false;
        const receipt = createOpaqueToken();
        const state: ParserReceiptState = {
            session,
            generation,
            listFacts,
            facts: captureFacts(block),
            phase: 'active',
        };
        call(weakMapSet, receiptStates, [receipt, state]);
        let adopted: boolean;
        try {
            adopted = call<unknown>(adoptReceipt as UnknownFunction, undefined, [receipt]) === true;
        }
        catch {
            adopted = false;
        }
        if (adopted &&
            state.phase === 'active' &&
            call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]) === state &&
            attestReceiptState(receipt, state)) {
            return true;
        }
        const current = call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]);
        if (current === state)
            markReceiptRetired(receipt, state);
        return false;
    }
    function readMessageCommandBlock(receipt: unknown): ForesightMessageCommandBlock | null {
        if (!receipt || typeof receipt !== 'object')
            return null;
        const state = call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]);
        return state && attestReceiptState(receipt, state) ? copyFacts(state.facts) : null;
    }
    function attestMessageCommandBlock(receipt: unknown): boolean {
        try {
            if (!receipt || typeof receipt !== 'object')
                return false;
            const state = call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]);
            return !!state && attestReceiptState(receipt, state);
        }
        catch {
            if (receipt && typeof receipt === 'object') {
                const state = call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]);
                if (state)
                    markReceiptRetired(receipt, state);
            }
            return false;
        }
    }
    function retireMessageCommandBlock(receipt: unknown): boolean {
        try {
            if (!receipt || typeof receipt !== 'object')
                return false;
            const state = call<ParserReceiptState | undefined>(weakMapGet, receiptStates, [receipt]);
            if (!state)
                return call<boolean>(weakSetHas, retiredReceipts, [receipt]);
            if (state.phase === 'retired')
                return true;
            markReceiptRetired(receipt, state);
            return true;
        }
        catch {
            return false;
        }
    }
    return freezeExact({
        prepareAdmittedMessageCommandBlock,
        readMessageCommandBlock,
        attestMessageCommandBlock,
        retireMessageCommandBlock,
    });
}
