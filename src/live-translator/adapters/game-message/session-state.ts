type RuntimeFunction = (this: unknown, ...arguments_: unknown[]) => unknown;
export interface MessageState {
    readonly isActive: unknown;
    readonly session: number;
    readonly source: unknown;
}
export interface MessageStartState {
    readonly sessionId: unknown;
    readonly wrappedText: string;
    readonly x: unknown;
    readonly y: unknown;
}
export interface MessageRenderSession {
    readonly messageStart: MessageStartState;
    readonly payload: unknown;
}
export interface MessageWindowStateGeneration {
    readonly messageState: MessageState;
    readonly renderSession: MessageRenderSession;
}
const applyIntrinsic = Reflect.apply;
const getOwnDescriptorIntrinsic = Object.getOwnPropertyDescriptor;
const WeakMapIntrinsic = WeakMap;
function captureIntrinsic(target: object, key: PropertyKey): RuntimeFunction {
    const descriptor = getOwnDescriptorIntrinsic(target, key);
    if (!descriptor || typeof descriptor.value !== 'function') {
        throw new TypeError(`Game-message session state requires intrinsic ${String(key)}.`);
    }
    return descriptor.value as RuntimeFunction;
}
const objectFreeze = captureIntrinsic(Object, 'freeze');
const objectIsFrozen = captureIntrinsic(Object, 'isFrozen');
const weakMapGet = captureIntrinsic(WeakMap.prototype, 'get');
const weakMapSet = captureIntrinsic(WeakMap.prototype, 'set');
type GenerationKind = 'message-state' | 'message-start' | 'render-session';
const generationKinds = new WeakMapIntrinsic<object, GenerationKind>();
function callIntrinsic(callback: RuntimeFunction, receiver: unknown, argumentsList: readonly unknown[]): unknown {
    return applyIntrinsic(callback, receiver, argumentsList);
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    const frozen = callIntrinsic(objectFreeze, Object, [value]);
    const attested = callIntrinsic(objectIsFrozen, Object, [value]);
    if (frozen !== value || attested !== true) {
        throw new TypeError('Game-message session state could not freeze an exact generation.');
    }
    return value;
}
function brandGeneration<Value extends object>(kind: GenerationKind, value: Readonly<Value>): Value {
    const published = callIntrinsic(weakMapSet, generationKinds, [value, kind]);
    const attested = callIntrinsic(weakMapGet, generationKinds, [value]);
    if (published !== generationKinds || attested !== kind) {
        throw new TypeError('Game-message session state could not publish a private generation brand.');
    }
    return value;
}
function hasGenerationKind(kind: GenerationKind, value: unknown): value is object {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        return false;
    try {
        return callIntrinsic(weakMapGet, generationKinds, [value]) === kind;
    }
    catch {
        return false;
    }
}
function requireFiniteCounter(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`Game-message ${label} must be a nonnegative safe integer.`);
    }
    return value;
}
function requireString(value: unknown, label: string): string {
    if (typeof value !== 'string')
        throw new TypeError(`Game-message ${label} must be a string.`);
    return value;
}
export function createMessageStateGeneration(input: MessageState): MessageState {
    const isActive = input.isActive;
    const session = requireFiniteCounter(input.session, 'session counter');
    const source = input.source;
    return brandGeneration('message-state', freezeExact({
        isActive,
        session,
        source,
    }));
}
export function createInitialMessageState(): MessageState {
    return createMessageStateGeneration({
        isActive: false,
        session: 0,
        source: null,
    });
}
export function createMessageStartGeneration(input: MessageStartState): MessageStartState {
    const sessionId = input.sessionId;
    const wrappedText = requireString(input.wrappedText, 'wrapped message-start text');
    const x = input.x;
    const y = input.y;
    return brandGeneration('message-start', freezeExact({
        sessionId,
        wrappedText,
        x,
        y,
    }));
}
export function createInitialMessageStart(): MessageStartState {
    return createMessageStartGeneration({
        sessionId: null,
        wrappedText: '',
        x: null,
        y: null,
    });
}
export function createMessageRenderSessionGeneration(input: MessageRenderSession): MessageRenderSession {
    const messageStart = createMessageStartGeneration(input.messageStart);
    const payload = input.payload;
    return brandGeneration('render-session', freezeExact({
        messageStart,
        payload,
    }));
}
export function createInitialMessageRenderSession(): MessageRenderSession {
    return createMessageRenderSessionGeneration({
        messageStart: createInitialMessageStart(),
        payload: null,
    });
}
export function createInitialMessageWindowState(): MessageWindowStateGeneration {
    return freezeExact({
        messageState: createInitialMessageState(),
        renderSession: createInitialMessageRenderSession(),
    });
}
export function isMessageStateGeneration(value: unknown): value is MessageState {
    return hasGenerationKind('message-state', value);
}
export function isMessageRenderSessionGeneration(value: unknown): value is MessageRenderSession {
    return hasGenerationKind('render-session', value);
}
export function isMessageSessionStateGeneration(value: unknown): value is MessageWindowStateGeneration {
    if (!value || typeof value !== 'object')
        return false;
    try {
        const messageState = getOwnDescriptorIntrinsic(value, 'messageState');
        const renderSession = getOwnDescriptorIntrinsic(value, 'renderSession');
        return !!(messageState &&
            'value' in messageState &&
            renderSession &&
            'value' in renderSession &&
            isMessageStateGeneration(messageState.value) &&
            isMessageRenderSessionGeneration(renderSession.value));
    }
    catch {
        return false;
    }
}
