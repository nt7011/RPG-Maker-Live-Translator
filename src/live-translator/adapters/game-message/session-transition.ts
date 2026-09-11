import { readOwnData } from './own-data.js';
import { createInitialMessageRenderSession, createInitialMessageStart, createMessageRenderSessionGeneration, createMessageStartGeneration, createMessageStateGeneration, type MessageRenderSession, type MessageStartState, type MessageState, } from './session-state.js';
import type { MessageWindowContext, MessageWindowContextAuthority } from './window-context.js';
type PropertySource = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...arguments_: unknown[]) => unknown;
type TransitionKind = 'begin' | 'observation' | 'reset';
interface RegisteredWindowsCandidate {
    readonly has?: unknown;
}
interface SessionTransitionScope extends PropertySource {
    readonly getGameMessageForWindow: RuntimeFunction;
    readonly createEscapeAwarePayload: RuntimeFunction;
    readonly scheduleForesightTranslations: RuntimeFunction;
    readonly getVerifiedMessageOrigin: RuntimeFunction;
    readonly ensureWindowRegistered?: unknown;
    readonly messageWindowContextAuthority: MessageWindowContextAuthority | null;
    readonly preview?: unknown;
    readonly registeredWindows?: RegisteredWindowsCandidate | null;
    readonly telemetry?: unknown;
    readonly traceLog?: unknown;
}
export interface GameMessageSessionTransitionOutcome {
    readonly kind: TransitionKind;
    readonly status: 'committed' | 'failed' | 'ignored';
    readonly phase: 'complete';
    readonly stateCommitted: boolean;
    readonly changed: boolean;
    readonly retryable: false;
    readonly reason: string;
    readonly previousSnapshot: unknown;
    readonly currentSnapshot: unknown;
    readonly error: unknown;
}
export interface GameMessageSessionTransitionController {
    readonly beginMessageSession: (windowInstance?: unknown) => GameMessageSessionTransitionOutcome | null;
    readonly resetWindowMessageState: (windowInstance?: unknown) => GameMessageSessionTransitionOutcome | null;
    readonly observeMessage: (windowInstance?: unknown, message?: unknown, sessionId?: unknown, messageStart?: unknown) => GameMessageSessionTransitionOutcome | null;
    readonly isSessionCurrent: (windowInstance?: unknown, sessionId?: unknown) => boolean;
}
export interface GameMessageSessionTransitionModule {
    create(scope?: unknown): GameMessageSessionTransitionController;
}
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isPropertySource(value: unknown): value is PropertySource {
    return isObjectReference(value);
}
function requireFunction(value: unknown, label: string): RuntimeFunction {
    if (typeof value !== 'function')
        throw new TypeError(`[GameMessage] Flow requires ${label}.`);
    return value as RuntimeFunction;
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return Object.freeze(value);
}
function ownValue(value: unknown, key: PropertyKey): unknown {
    return readOwnData(value, key).value;
}
function isPayload(value: unknown): value is PropertySource {
    return isPropertySource(value) && ('resolved' in value || 'visible' in value);
}
export function createGameMessageSessionTransitionController(scope: unknown = {}): GameMessageSessionTransitionController {
    if (!isPropertySource(scope))
        throw new TypeError('[GameMessage] Flow requires an adapter scope.');
    const source = scope as SessionTransitionScope;
    const authority = source.messageWindowContextAuthority;
    if (!authority || typeof authority.acquire !== 'function' || typeof authority.replace !== 'function') {
        throw new TypeError('[GameMessage] Flow requires the message-window state authority.');
    }
    const windowContextAuthority = authority;
    const getGameMessageForWindow = requireFunction(source.getGameMessageForWindow, 'the game-message source resolver');
    const createEscapeAwarePayload = requireFunction(source.createEscapeAwarePayload, 'the payload factory');
    const scheduleForesightTranslations = requireFunction(source.scheduleForesightTranslations, 'foresight scheduling');
    const getVerifiedMessageOrigin = requireFunction(source.getVerifiedMessageOrigin, 'message-origin verification');
    const ensureWindowRegistered = typeof source.ensureWindowRegistered === 'function' ? (source.ensureWindowRegistered as RuntimeFunction) : null;
    const registeredWindows = source.registeredWindows ?? null;
    const traceLog = typeof source.traceLog === 'function' ? (source.traceLog as RuntimeFunction) : null;
    const preview = typeof source.preview === 'function' ? (source.preview as RuntimeFunction) : null;
    const telemetry = isPropertySource(source.telemetry) ? source.telemetry : null;
    function acquireContext(windowInstance: object): MessageWindowContext {
        const acquisition = windowContextAuthority.acquire(windowInstance);
        if (acquisition.status === 'ready')
            return acquisition.context;
        throw acquisition.error;
    }
    function trace(...argumentsList: unknown[]): void {
        if (!traceLog)
            return;
        try {
            Reflect.apply(traceLog, undefined, argumentsList);
        }
        catch {
        }
    }
    function outcome(kind: TransitionKind, status: GameMessageSessionTransitionOutcome['status'], reason: string, previous: MessageWindowContext | null, current: MessageWindowContext | null, error: unknown = null): GameMessageSessionTransitionOutcome {
        const committed = status === 'committed';
        return freezeExact({
            kind,
            status,
            phase: 'complete' as const,
            stateCommitted: committed,
            changed: committed && previous?.snapshot !== current?.snapshot,
            retryable: false as const,
            reason,
            previousSnapshot: previous?.snapshot ?? null,
            currentSnapshot: current?.snapshot ?? null,
            error,
        });
    }
    function runFlow(kind: TransitionKind, windowInstance: unknown, operation: (initial: MessageWindowContext) => GameMessageSessionTransitionOutcome): GameMessageSessionTransitionOutcome | null {
        if (!isObjectReference(windowInstance))
            return null;
        const initial = acquireContext(windowInstance);
        try {
            return operation(initial);
        }
        catch (error) {
            return outcome(kind, 'failed', 'message-flow-failed', initial, windowContextAuthority.peek(windowInstance), error);
        }
    }
    function replaceState(expected: MessageWindowContext, messageState: MessageState, renderSession: MessageRenderSession): MessageWindowContext {
        const replacement = windowContextAuthority.replace({ expected, messageState, renderSession });
        if (replacement.status !== 'committed' && replacement.status !== 'unchanged') {
            throw replacement.error instanceof Error
                ? replacement.error
                : new Error(`[GameMessage] State publication failed: ${replacement.reason}`);
        }
        if (!replacement.current)
            throw new Error('[GameMessage] State publication returned no current context.');
        return replacement.current;
    }
    function registerWindow(context: MessageWindowContext): void {
        if (!ensureWindowRegistered)
            return;
        const has = registeredWindows && typeof registeredWindows.has === 'function' ? registeredWindows.has : null;
        if (has && Reflect.apply(has as RuntimeFunction, registeredWindows, [context.windowInstance]) === true)
            return;
        Reflect.apply(ensureWindowRegistered, undefined, [context.windowInstance]);
    }
    function messageStartState(sessionId: unknown, input: unknown): MessageStartState {
        if (!isPropertySource(input))
            return createInitialMessageStart();
        return createMessageStartGeneration({
            sessionId,
            wrappedText: typeof ownValue(input, 'wrappedText') === 'string' ? (ownValue(input, 'wrappedText') as string) : '',
            x: ownValue(input, 'x') ?? null,
            y: ownValue(input, 'y') ?? null,
        });
    }
    function scheduleOptionalForesight(windowInstance: object, payload: PropertySource, sessionId: unknown, windowType: string): void {
        try {
            Reflect.apply(scheduleForesightTranslations, undefined, [windowInstance, payload, sessionId, windowType]);
        }
        catch {
            trace('[GameMessage] Optional foresight scheduling failed; preserving message context.');
        }
    }
    function beginMessageSession(windowInstance: unknown): GameMessageSessionTransitionOutcome | null {
        return runFlow('begin', windowInstance, (initial) => {
            const expected = acquireContext(initial.windowInstance);
            registerWindow(expected);
            const current = replaceState(expected, createMessageStateGeneration({
                isActive: true,
                session: expected.messageState.session + 1,
                source: Reflect.apply(getGameMessageForWindow, undefined, [expected.windowInstance]),
            }), createInitialMessageRenderSession());
            return outcome('begin', 'committed', 'message-session-started', initial, current);
        });
    }
    function resetWindowMessageState(windowInstance: unknown): GameMessageSessionTransitionOutcome | null {
        return runFlow('reset', windowInstance, (initial) => {
            const expected = acquireContext(initial.windowInstance);
            const current = replaceState(expected, createMessageStateGeneration({
                isActive: false,
                session: expected.messageState.session + 1,
                source: null,
            }), createInitialMessageRenderSession());
            return outcome('reset', 'committed', 'message-session-cleared', initial, current);
        });
    }
    function observeMessage(windowInstance: unknown, message: unknown, sessionId: unknown, messageStartInput: unknown): GameMessageSessionTransitionOutcome | null {
        return runFlow('observation', windowInstance, (initial) => {
            registerWindow(initial);
            const expected = acquireContext(initial.windowInstance);
            if (expected.messageState.session !== sessionId || expected.messageState.isActive !== true) {
                return outcome('observation', 'ignored', 'message-session-stale', initial, expected);
            }
            const payloadValue = isPayload(message)
                ? message
                : Reflect.apply(createEscapeAwarePayload, undefined, [
                    message,
                    'observation',
                    { messageOrigin: Reflect.apply(getVerifiedMessageOrigin, undefined, [expected.windowInstance]) },
                ]);
            if (!isPropertySource(payloadValue)) {
                return outcome('observation', 'ignored', 'message-payload-unavailable', initial, expected);
            }
            const payload = payloadValue;
            const visible = ownValue(payload, 'visible');
            const current = replaceState(expected, expected.messageState, createMessageRenderSessionGeneration({
                ...createInitialMessageRenderSession(),
                messageStart: messageStartState(sessionId, messageStartInput),
                payload,
            }));
            if (typeof visible !== 'string' || !visible) {
                trace('[GameMessage] Empty message has no semantic context to publish.');
                return outcome('observation', 'committed', 'message-empty', initial, current);
            }
            scheduleOptionalForesight(current.windowInstance, payload, sessionId, 'Window_Message');
            const logTextDetected = ownValue(telemetry, 'logTextDetected');
            if (typeof logTextDetected === 'function') {
                try {
                    Reflect.apply(logTextDetected as RuntimeFunction, telemetry, [
                        'message',
                        visible,
                        0,
                        0,
                        { windowType: 'Window_Message' },
                    ]);
                }
                catch {
                }
            }
            if (preview) {
                try {
                    trace(`[GameMessage] Observed message: "${String(Reflect.apply(preview, undefined, [visible]))}"`);
                }
                catch {
                    trace('[GameMessage] Observed message context.');
                }
            }
            return outcome('observation', 'committed', 'message-observed', initial, windowContextAuthority.peek(current.windowInstance) ?? current);
        });
    }
    function isSessionCurrent(windowInstance: unknown, sessionId: unknown): boolean {
        if (!isObjectReference(windowInstance))
            return false;
        const context = windowContextAuthority.peek(windowInstance);
        return context?.messageState.isActive === true && context.messageState.session === sessionId;
    }
    return freezeExact({
        beginMessageSession,
        resetWindowMessageState,
        observeMessage,
        isSessionCurrent,
    });
}
export function createGameMessageSessionTransitionModule(): GameMessageSessionTransitionModule {
    return freezeExact({ create: createGameMessageSessionTransitionController });
}
