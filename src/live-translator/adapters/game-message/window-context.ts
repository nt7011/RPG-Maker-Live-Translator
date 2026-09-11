import { createInitialMessageRenderSession, createInitialMessageState, isMessageRenderSessionGeneration, isMessageSessionStateGeneration, isMessageStateGeneration, type MessageRenderSession, type MessageState, } from './session-state.js';
declare const messageWindowContextBrand: unique symbol;
declare const messageWindowIdentityBrand: unique symbol;
export interface MessageWindowIdentity {
    readonly [messageWindowIdentityBrand]: never;
}
export interface MessageWindowContext {
    readonly [messageWindowContextBrand]: never;
    readonly windowInstance: object;
    readonly identity: MessageWindowIdentity;
    readonly identityKey: string;
    readonly snapshot: Readonly<object>;
    readonly messageState: Readonly<MessageState>;
    readonly renderSession: Readonly<MessageRenderSession>;
}
export type MessageWindowContextErrorReason = 'window-reference-required' | 'window-context-initialization-in-progress' | 'message-state-factory-failed' | 'render-session-factory-failed' | 'message-state-invalid' | 'render-session-invalid';
export class MessageWindowContextError extends Error {
    readonly reason: MessageWindowContextErrorReason;
    readonly retryable: boolean;
    override readonly cause: unknown;
    constructor(reason: MessageWindowContextErrorReason, message: string, retryable: boolean, cause?: unknown) {
        super(message, { cause });
        this.name = 'MessageWindowContextError';
        this.reason = reason;
        this.retryable = retryable;
        this.cause = cause;
    }
}
export interface MessageWindowContextReady {
    readonly status: 'ready';
    readonly context: MessageWindowContext;
}
export interface MessageWindowContextUnavailable {
    readonly status: 'unavailable';
    readonly error: MessageWindowContextError;
}
export type MessageWindowContextAcquisition = MessageWindowContextReady | MessageWindowContextUnavailable;
export type MessageWindowContextReplacementStatus = 'committed' | 'unchanged' | 'conflict' | 'invalid';
export interface MessageWindowContextReplacement {
    readonly status: MessageWindowContextReplacementStatus;
    readonly changed: boolean;
    readonly settled: true;
    readonly retryable: false;
    readonly reason: string;
    readonly previous: MessageWindowContext | null;
    readonly current: MessageWindowContext | null;
    readonly error: unknown;
}
export interface MessageWindowContextReplacementRequest {
    readonly expected: MessageWindowContext;
    readonly messageState: MessageState;
    readonly renderSession: MessageRenderSession;
}
export interface MessageWindowContextAuthority {
    readonly acquire: (windowInstance: unknown) => MessageWindowContextAcquisition;
    readonly peek: (windowInstance: unknown) => MessageWindowContext | null;
    readonly replace: (request: MessageWindowContextReplacementRequest) => MessageWindowContextReplacement;
}
export interface MessageWindowContextAuthorityOptions {
    readonly createMessageState?: () => MessageState;
    readonly createRenderSession?: () => MessageRenderSession;
}
const INITIALIZING = Symbol('game-message-window-context-initializing');
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function unavailable(reason: MessageWindowContextErrorReason, message: string, retryable: boolean, cause?: unknown): MessageWindowContextUnavailable {
    return Object.freeze({
        status: 'unavailable',
        error: Object.freeze(new MessageWindowContextError(reason, message, retryable, cause)),
    });
}
function replacement(status: MessageWindowContextReplacementStatus, reason: string, previous: MessageWindowContext | null, current: MessageWindowContext | null, error: unknown = null): MessageWindowContextReplacement {
    return Object.freeze({
        status,
        changed: status === 'committed',
        settled: true,
        retryable: false,
        reason,
        previous,
        current,
        error,
    });
}
export function createMessageWindowContextAuthority(options: MessageWindowContextAuthorityOptions = {}): MessageWindowContextAuthority {
    const createMessageState = options.createMessageState ?? createInitialMessageState;
    const createRenderSession = options.createRenderSession ?? createInitialMessageRenderSession;
    if (typeof createMessageState !== 'function' || typeof createRenderSession !== 'function') {
        throw new TypeError('GameMessage window context requires complete state factories.');
    }
    const contextsByWindow = new WeakMap<object, MessageWindowContext | typeof INITIALIZING>();
    let nextIdentity = 1;
    function createContext(windowInstance: object, identity: MessageWindowIdentity, identityKey: string, messageState: MessageState, renderSession: MessageRenderSession): MessageWindowContext {
        return Object.freeze({
            windowInstance,
            identity,
            identityKey,
            snapshot: Object.freeze({}),
            messageState,
            renderSession,
        }) as MessageWindowContext;
    }
    function acquire(windowInstance: unknown): MessageWindowContextAcquisition {
        if (!isObjectReference(windowInstance)) {
            return unavailable('window-reference-required', 'GameMessage window context requires an object window reference.', false);
        }
        const existing = contextsByWindow.get(windowInstance);
        if (existing === INITIALIZING) {
            return unavailable('window-context-initialization-in-progress', 'GameMessage window context initialization is already in progress.', true);
        }
        if (existing)
            return Object.freeze({ status: 'ready', context: existing });
        contextsByWindow.set(windowInstance, INITIALIZING);
        try {
            let messageState: MessageState;
            try {
                messageState = createMessageState();
            }
            catch (error) {
                return unavailable('message-state-factory-failed', 'GameMessage message-state initialization failed.', true, error);
            }
            if (!isMessageStateGeneration(messageState)) {
                return unavailable('message-state-invalid', 'GameMessage message-state factory returned invalid state.', false);
            }
            let renderSession: MessageRenderSession;
            try {
                renderSession = createRenderSession();
            }
            catch (error) {
                return unavailable('render-session-factory-failed', 'GameMessage render-session initialization failed.', true, error);
            }
            if (!isMessageRenderSessionGeneration(renderSession)) {
                return unavailable('render-session-invalid', 'GameMessage render-session factory returned invalid state.', false);
            }
            const identity = Object.freeze({}) as MessageWindowIdentity;
            const identityKey = String(nextIdentity);
            nextIdentity += 1;
            const context = createContext(windowInstance, identity, identityKey, messageState, renderSession);
            contextsByWindow.set(windowInstance, context);
            return Object.freeze({ status: 'ready', context });
        }
        finally {
            if (contextsByWindow.get(windowInstance) === INITIALIZING)
                contextsByWindow.delete(windowInstance);
        }
    }
    function peek(windowInstance: unknown): MessageWindowContext | null {
        if (!isObjectReference(windowInstance))
            return null;
        const context = contextsByWindow.get(windowInstance);
        return context && context !== INITIALIZING ? context : null;
    }
    function replace(requestValue: unknown): MessageWindowContextReplacement {
        if (!isObjectReference(requestValue)) {
            return replacement('invalid', 'window-context-replacement-invalid', null, null);
        }
        let request: MessageWindowContextReplacementRequest;
        try {
            request = requestValue as MessageWindowContextReplacementRequest;
            const expected = request.expected;
            if (!isObjectReference(expected) || !isObjectReference(expected.windowInstance)) {
                return replacement('invalid', 'window-context-replacement-invalid', null, null);
            }
            const current = peek(expected.windowInstance);
            if (current !== expected) {
                return replacement('conflict', 'window-context-stale-or-unauthenticated', expected, current);
            }
            if (!isMessageSessionStateGeneration({
                messageState: request.messageState,
                renderSession: request.renderSession,
            })) {
                return replacement('invalid', 'window-context-next-generation-invalid', expected, expected);
            }
            if (expected.messageState === request.messageState && expected.renderSession === request.renderSession) {
                return replacement('unchanged', 'window-context-unchanged', expected, expected);
            }
            const next = createContext(expected.windowInstance, expected.identity, expected.identityKey, request.messageState, request.renderSession);
            contextsByWindow.set(expected.windowInstance, next);
            return replacement('committed', 'window-context-committed', expected, next);
        }
        catch (error) {
            return replacement('invalid', 'window-context-replacement-invalid', null, null, error);
        }
    }
    return Object.freeze({ acquire, peek, replace });
}
