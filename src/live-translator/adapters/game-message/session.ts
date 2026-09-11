import { createInitialMessageRenderSession, createInitialMessageStart, createMessageRenderSessionGeneration, createMessageStartGeneration, type MessageRenderSession, type MessageStartState, type MessageState, } from './session-state.js';
import { createMessageWindowDiscoveryService, type MessageWindowCandidateSnapshot, type MessageWindowDiscoveryFailure, type MessageWindowDiscoverySnapshot, } from './message-window-discovery.js';
import type { GameMessageHookLayerRequest, GameMessageHookMethodRequest } from './hook-lease.js';
import type { NativeConversionObservationOwner, NativeConversionReceiptService } from './native-conversion-receipts.js';
import type { MessageWindowContext, MessageWindowContextAuthority, MessageWindowContextReplacement, } from './window-context.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...arguments_: unknown[]) => unknown;
type NumberFunction = (value?: unknown) => number;
type StringFunction = (value?: unknown) => string;
type FalsyValue = false | 0 | 0n | '' | null | undefined;
type Truthy<Value> = Value extends FalsyValue ? never : Value;
const MAX_MESSAGE_HOOK_PROTOTYPE_DEPTH = 256;
interface GameMessageSessionInstallPlan {
    readonly requests: readonly GameMessageHookMethodRequest[];
}
class MessageSessionPlanUnavailableError extends TypeError {
    readonly retryable = true;
}
interface MessageWindowHookOperation {
    readonly label: string;
    readonly operation: RuntimeFunction;
    readonly when?: (() => boolean) | undefined;
}
interface MessageWindowHookFailure {
    readonly label: string;
    readonly error: unknown;
}
interface MessageWindowHookInvocation {
    readonly afterNative?: readonly MessageWindowHookOperation[];
    readonly afterNativeSuccess?: readonly MessageWindowHookOperation[];
    readonly beforeNative?: readonly MessageWindowHookOperation[];
    readonly invokeNative: (recordAdapterFailure: (failure: MessageWindowHookFailure) => void) => unknown;
}
interface GameMessageSessionScope extends PropertyBag {
    readonly getGameMessageForWindow: RuntimeFunction;
    readonly createEscapeAwarePayload: RuntimeFunction;
    readonly getResolvedTextForWindow: RuntimeFunction;
    readonly beginMessageSession: RuntimeFunction;
    readonly observeMessage: RuntimeFunction;
    readonly warn: RuntimeFunction;
    readonly globalScope: PropertyBag;
    readonly messageWindowContextAuthority?: MessageWindowContextAuthority | null;
    readonly nativeConversionReceipts?: NativeConversionReceiptService | null;
    readonly preview: (this: unknown, text: unknown) => string;
    readonly pruneDetachedRegisteredWindows?: RuntimeFunction | FalsyValue;
    readonly registeredWindows?: ReadonlySet<unknown> | FalsyValue;
    readonly stripControls: (this: unknown, text: unknown) => string;
    readonly traceLog: RuntimeFunction;
}
interface MessageWindowCandidate extends PropertyBag {
    _textState?: TextStateCandidate | FalsyValue;
    _trBypassProcessCharacter?: unknown;
}
interface TextStateCandidate extends PropertyBag {
    readonly drawing?: unknown;
    readonly index?: unknown;
    readonly startX?: unknown;
    readonly text?: unknown;
    readonly x?: unknown;
    readonly y?: unknown;
}
interface MessageWindowPrototypeCandidate extends PropertyBag {
    readonly isPrototypeOf: RuntimeFunction;
    readonly processCharacter?: unknown;
    readonly startMessage?: unknown;
    readonly update?: unknown;
}
interface MessageCoordinatesCandidate extends PropertyBag {
    readonly x?: unknown;
    readonly y?: unknown;
}
interface MessageStartOptions extends PropertyBag {
    readonly sessionId?: unknown;
    readonly wrappedText?: unknown;
}
interface ResolvedTextCandidate extends PropertyBag {
    readonly messageBreakInfo?: unknown;
    readonly messageOrigin?: unknown;
    readonly nativeConversionReceipt?: unknown;
    readonly nativeConverted?: unknown;
    readonly rawText?: unknown;
    readonly text?: unknown;
}
interface EscapeAwarePayloadCandidate extends PropertyBag {
    readonly visible?: string;
}
export interface GameMessageSessionController {
    readonly getMessageRenderSession: (windowInstance: MessageWindowCandidate | FalsyValue) => MessageRenderSession;
    readonly setMessageStartCoordinates: (windowInstance: MessageWindowCandidate | FalsyValue, coordinates?: unknown, options?: unknown) => MessageStartState;
    readonly getMessageStartCoordinates: (windowInstance: MessageWindowCandidate | FalsyValue) => PropertyBag;
    readonly collectWindowsForGameMessage: (gameMessage: unknown) => MessageWindowCandidate[];
    readonly prepareGameMessageSessionInstallPlan: () => GameMessageSessionInstallPlan;
}
export interface GameMessageSessionModule {
    create(scope?: unknown): GameMessageSessionController;
}
function defaultWhenFalsy<Value, Default>(value: Value, defaultValue: Default): Truthy<Value> | Default {
    return value ? (value as Truthy<Value>) : defaultValue;
}
function defaultWhenFalsyLazy<Value, Default>(value: Value, defaultValue: () => Default): Truthy<Value> | Default {
    return value ? (value as Truthy<Value>) : defaultValue();
}
function continueWhenTruthy<Value, Result>(value: Value, continuation: (truthyValue: Truthy<Value>) => Result): Value | Result {
    return value ? continuation(value as Truthy<Value>) : value;
}
export function createGameMessageSessionModule(): GameMessageSessionModule {
    function createController(scope: unknown = {}): GameMessageSessionController {
        const source = scope as GameMessageSessionScope;
        const { globalScope, traceLog, preview, stripControls, registeredWindows, pruneDetachedRegisteredWindows, messageWindowContextAuthority, nativeConversionReceipts, } = source;
        if (!messageWindowContextAuthority ||
            typeof messageWindowContextAuthority.acquire !== 'function' ||
            typeof messageWindowContextAuthority.peek !== 'function' ||
            typeof messageWindowContextAuthority.replace !== 'function') {
            throw new TypeError('[GameMessage] Session requires the private message-window context authority.');
        }
        if (!nativeConversionReceipts ||
            typeof nativeConversionReceipts.begin !== 'function' ||
            typeof nativeConversionReceipts.invoke !== 'function' ||
            typeof nativeConversionReceipts.settle !== 'function' ||
            typeof nativeConversionReceipts.publishTextState !== 'function') {
            throw new TypeError('[GameMessage] Session requires the native conversion receipt authority.');
        }
        const conversionReceipts = nativeConversionReceipts;
        const windowContextAuthority = messageWindowContextAuthority;
        const { getGameMessageForWindow, createEscapeAwarePayload, getResolvedTextForWindow, beginMessageSession, observeMessage, warn, } = source;
        const messageWindowDiscovery = createMessageWindowDiscoveryService({
            runtimeGlobal: globalScope,
            registeredWindows: defaultWhenFalsy(registeredWindows, null),
        });
        const emptyMessageRenderSession = createInitialMessageRenderSession();
        function acquireMessageWindowContext(windowInstance: unknown): MessageWindowContext {
            const acquisition = windowContextAuthority.acquire(windowInstance);
            if (acquisition.status === 'unavailable')
                throw acquisition.error;
            return acquisition.context;
        }
        function peekMessageWindowContext(windowInstance: unknown): MessageWindowContext | null {
            return windowContextAuthority.peek(windowInstance);
        }
        function requireCommittedContext(result: MessageWindowContextReplacement): MessageWindowContext {
            if ((result.status === 'committed' || result.status === 'unchanged') && result.current) {
                return result.current;
            }
            const error = new Error(`[GameMessage] Window-state update did not commit: ${result.reason}`, {
                cause: result.error,
            });
            Object.assign(error, { outcome: result });
            throw error;
        }
        function replaceMessageWindowContext(expected: MessageWindowContext, messageState: MessageState, renderSession: MessageRenderSession): MessageWindowContext {
            return requireCommittedContext(windowContextAuthority.replace({
                expected,
                messageState,
                renderSession,
            }));
        }
        function ensureMessageStartState(renderSession: MessageRenderSession): MessageStartState {
            return renderSession.messageStart;
        }
        function peekMessageRenderSession(windowInstance: MessageWindowCandidate | FalsyValue): MessageRenderSession | null {
            if (!windowInstance)
                return null;
            return peekMessageWindowContext(windowInstance)?.renderSession ?? null;
        }
        function getMessageRenderSession(windowInstance: MessageWindowCandidate | FalsyValue): MessageRenderSession {
            if (!windowInstance)
                return emptyMessageRenderSession;
            return acquireMessageWindowContext(windowInstance).renderSession;
        }
        function getMessageStartSession(windowInstance: MessageWindowCandidate | FalsyValue): MessageStartState {
            return ensureMessageStartState(getMessageRenderSession(windowInstance));
        }
        function setMessageStartCoordinates(windowInstance: MessageWindowCandidate | FalsyValue, coordinates: unknown = {}, options: unknown = {}): MessageStartState {
            const coordinateSource = coordinates as MessageCoordinatesCandidate;
            const optionSource = options as MessageStartOptions;
            if (!windowInstance)
                return createInitialMessageStart();
            const context = acquireMessageWindowContext(windowInstance);
            const messageStart = context.renderSession.messageStart;
            const x = coordinateSource.x;
            const nextX = hasFiniteNumber(x) ? Number(x) : messageStart.x;
            const y = coordinateSource.y;
            const nextY = hasFiniteNumber(y) ? Number(y) : messageStart.y;
            const sessionId = optionSource.sessionId;
            const nextSessionId = sessionId === undefined
                ? messageStart.sessionId
                : sessionId === null
                    ? null
                    : defaultWhenFalsy((Number as NumberFunction)(sessionId), null);
            const nextWrappedText = Object.prototype.hasOwnProperty.call(options, 'wrappedText')
                ? (String as StringFunction)(defaultWhenFalsy(optionSource.wrappedText, ''))
                : messageStart.wrappedText;
            const nextMessageStart = createMessageStartGeneration({
                x: nextX,
                y: nextY,
                sessionId: nextSessionId,
                wrappedText: nextWrappedText,
            });
            return replaceMessageWindowContext(context, context.messageState, createMessageRenderSessionGeneration({
                ...context.renderSession,
                messageStart: nextMessageStart,
            })).renderSession.messageStart;
        }
        function getMessageStartCoordinates(windowInstance: MessageWindowCandidate | FalsyValue): PropertyBag {
            const messageStart = getMessageStartSession(windowInstance);
            return {
                x: messageStart.x,
                y: messageStart.y,
                sessionId: messageStart.sessionId,
                wrappedText: messageStart.wrappedText,
            };
        }
        function hasFiniteNumber(value: unknown): boolean {
            return typeof value === 'number' && Number.isFinite(value);
        }
        function peekMessageState(windowInstance: MessageWindowCandidate): MessageState | null {
            return peekMessageWindowContext(windowInstance)?.messageState ?? null;
        }
        function snapshotTextStateStart(windowInstance: MessageWindowCandidate | FalsyValue): PropertyBag | null {
            try {
                const textState = windowInstance && windowInstance._textState;
                if (!textState)
                    return null;
                const startX = textState.startX;
                const x = typeof startX === 'number' ? startX : textState.x;
                const y = textState.y;
                return Object.freeze({ x, y });
            }
            catch {
                return null;
            }
        }
        function reportMessageWindowDiscoveryFailures(operation: string, snapshot: MessageWindowDiscoverySnapshot): void {
            let index = 0;
            while (index < snapshot.failures.length) {
                const failure = snapshot.failures[index];
                index += 1;
                if (!failure)
                    continue;
                reportMessageWindowDiscoveryFailure(operation, failure);
            }
        }
        function reportMessageWindowDiscoveryFailure(operation: string, failure: MessageWindowDiscoveryFailure): void {
            try {
                Reflect.apply(warn, undefined, [
                    `[GameMessage] Message-window discovery was incomplete during ${operation}.`,
                    failure,
                ]);
            }
            catch {
            }
        }
        function reportDiscoveryConsumptionFailure(operation: string, location: {
            readonly source: MessageWindowCandidateSnapshot['source'];
            readonly key: string | null;
            readonly index: number | null;
        }, phase: string): void {
            try {
                Reflect.apply(warn, undefined, [
                    `[GameMessage] Message-window discovery candidate could not be consumed during ${operation}.`,
                    Object.freeze({
                        source: location.source,
                        phase,
                        key: location.key,
                        index: location.index,
                    }),
                ]);
            }
            catch {
            }
        }
        function collectWindowsForGameMessage(gameMessage: unknown): MessageWindowCandidate[] {
            const matches: MessageWindowCandidate[] = [];
            try {
                if (pruneDetachedRegisteredWindows)
                    Reflect.apply(pruneDetachedRegisteredWindows, undefined, []);
            }
            catch {
                reportDiscoveryConsumptionFailure('known-window collection', { source: 'registered-window', key: null, index: null }, 'registry-prune');
            }
            const snapshot = messageWindowDiscovery.captureKnownWindows();
            reportMessageWindowDiscoveryFailures('known-window collection', snapshot);
            let index = 0;
            while (index < snapshot.windows.length) {
                const candidate = snapshot.windows[index];
                index += 1;
                if (!candidate)
                    continue;
                try {
                    const windowSource = candidate.window as MessageWindowCandidate;
                    const state = peekMessageState(windowSource);
                    const messageSource = defaultWhenFalsyLazy(continueWhenTruthy(state, (stateValue) => stateValue.source), () => getGameMessageForWindow(candidate.window));
                    if (messageSource === gameMessage)
                        matches[matches.length] = windowSource;
                }
                catch {
                    reportDiscoveryConsumptionFailure('known-window collection', candidate, 'message-owner-association');
                }
            }
            return matches;
        }
        function reportMessageWindowHookFailure(label: string, error: unknown): void {
            try {
                Reflect.apply(warn, undefined, [`[GameMessage] ${label} error`, error]);
            }
            catch {
            }
        }
        function invokeMessageWindowHookWithNativePrecedence(invocation: MessageWindowHookInvocation): unknown {
            const recordAdapterFailure = (failure: MessageWindowHookFailure): void => {
                reportMessageWindowHookFailure(failure.label, failure.error);
            };
            const runOperations = (operations: readonly MessageWindowHookOperation[] | undefined): void => {
                if (!operations)
                    return;
                let index = 0;
                while (index < operations.length) {
                    const operation = operations[index];
                    index += 1;
                    if (!operation)
                        continue;
                    try {
                        if (operation.when && !operation.when())
                            continue;
                        Reflect.apply(operation.operation, undefined, []);
                    }
                    catch (error) {
                        recordAdapterFailure({ label: operation.label, error });
                    }
                }
            };
            runOperations(invocation.beforeNative);
            let nativeSettlement: {
                readonly status: 'fulfilled';
                readonly value: unknown;
            } | {
                readonly error: unknown;
                readonly status: 'rejected';
            };
            try {
                nativeSettlement = {
                    status: 'fulfilled',
                    value: invocation.invokeNative(recordAdapterFailure),
                };
            }
            catch (error) {
                nativeSettlement = { error, status: 'rejected' };
            }
            if (nativeSettlement.status === 'fulfilled') {
                runOperations(invocation.afterNativeSuccess);
            }
            runOperations(invocation.afterNative);
            if (nativeSettlement.status === 'rejected')
                throw nativeSettlement.error;
            return nativeSettlement.value;
        }
        function freezeHookLayer(markerKey: PropertyKey, createWrapper: GameMessageHookLayerRequest['createWrapper']): GameMessageHookLayerRequest {
            return Object.freeze({
                createWrapper,
                markers: Object.freeze([Object.freeze({ key: markerKey, value: true })]),
            });
        }
        function freezeHookRequest(target: object, key: PropertyKey, layer: GameMessageHookLayerRequest, missingMethod?: RuntimeFunction): GameMessageHookMethodRequest {
            const request: GameMessageHookMethodRequest = missingMethod
                ? { target, key, missingMethod, layers: Object.freeze([layer]) }
                : { target, key, layers: Object.freeze([layer]) };
            return Object.freeze(request);
        }
        function ownTransitionValue(value: unknown, key: PropertyKey): unknown {
            if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
                return undefined;
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            return descriptor && 'value' in descriptor ? descriptor.value : undefined;
        }
        function sessionTransitionCompleted(outcome: unknown, expectedKind: 'begin' | 'observation'): boolean {
            return (ownTransitionValue(outcome, 'kind') === expectedKind &&
                ownTransitionValue(outcome, 'status') === 'committed' &&
                ownTransitionValue(outcome, 'phase') === 'complete' &&
                ownTransitionValue(outcome, 'stateCommitted') === true);
        }
        function runSessionTransition(expectedKind: 'begin' | 'observation', operation: RuntimeFunction, argumentsList: readonly unknown[]): boolean {
            const outcome = Reflect.apply(operation, undefined, argumentsList);
            return sessionTransitionCompleted(outcome, expectedKind);
        }
        function prepareStartMessageHookRequest(prototypeSnapshot: MessageWindowPrototypeCandidate, receiptGenerationToken: object | null): GameMessageHookMethodRequest {
            return freezeHookRequest(prototypeSnapshot, 'startMessage', freezeHookLayer('__trGameMessageStartWrapped', function startMessageLayer(next) {
                return function gameMessageStartHook(this: MessageWindowCandidate, ...argumentsList: unknown[]): unknown {
                    let began = false;
                    let receiptOwner: NativeConversionObservationOwner | null = null;
                    return invokeMessageWindowHookWithNativePrecedence({
                        beforeNative: [
                            {
                                label: 'startMessage begin transition',
                                operation: () => {
                                    began = runSessionTransition('begin', beginMessageSession, [this]);
                                },
                            },
                        ],
                        invokeNative: (recordAdapterFailure) => {
                            if (receiptGenerationToken) {
                                try {
                                    receiptOwner = conversionReceipts.begin(receiptGenerationToken, this);
                                }
                                catch (error) {
                                    recordAdapterFailure({
                                        label: 'startMessage native-conversion observation admission',
                                        error,
                                    });
                                }
                            }
                            let nativeSucceeded = false;
                            try {
                                const value = Reflect.apply(next, this, argumentsList);
                                nativeSucceeded = true;
                                return value;
                            }
                            finally {
                                if (receiptOwner) {
                                    let textStateText: unknown = null;
                                    try {
                                        textStateText = this._textState && this._textState.text;
                                    }
                                    catch (error) {
                                        recordAdapterFailure({
                                            label: 'startMessage native text-state observation',
                                            error,
                                        });
                                    }
                                    try {
                                        conversionReceipts.settle(receiptOwner, nativeSucceeded, textStateText);
                                    }
                                    catch (error) {
                                        recordAdapterFailure({
                                            label: 'startMessage native-conversion observation settlement',
                                            error,
                                        });
                                    }
                                }
                            }
                        },
                        afterNativeSuccess: [
                            {
                                label: 'startMessage observation',
                                operation: () => {
                                    observeStartedMessage(this);
                                },
                                when: () => began,
                            },
                        ],
                    });
                };
            }));
        }
        function prepareConvertEscapeCharactersHookRequest(prototypeSnapshot: MessageWindowPrototypeCandidate, receiptGenerationToken: object): GameMessageHookMethodRequest {
            return freezeHookRequest(prototypeSnapshot, 'convertEscapeCharacters', freezeHookLayer('__trGameMessageConvertWrapped', function convertEscapeCharactersLayer(next) {
                return function gameMessageConvertEscapeCharactersHook(this: MessageWindowCandidate, ...argumentsList: unknown[]): unknown {
                    return conversionReceipts.invoke(receiptGenerationToken, this, next, argumentsList);
                };
            }));
        }
        function observeStartedMessage(windowInstance: MessageWindowCandidate): void {
            const existingSession = peekMessageRenderSession(windowInstance);
            if (existingSession?.payload)
                return;
            const messageStart = snapshotTextStateStart(windowInstance);
            const resolvedInfo = getResolvedTextForWindow(windowInstance);
            const resolvedSource = resolvedInfo as ResolvedTextCandidate;
            const resolvedText = resolvedInfo ? resolvedSource.text : resolvedInfo;
            const resolved = typeof resolvedText === 'string' ? resolvedText : '';
            const messageBreakInfo = resolvedInfo ? resolvedSource.messageBreakInfo : resolvedInfo;
            const rawText = resolvedInfo ? resolvedSource.rawText : resolvedInfo;
            const messageOrigin = resolvedInfo ? resolvedSource.messageOrigin : resolvedInfo;
            const payload = createEscapeAwarePayload(resolved, 'start', {
                messageBreakInfo,
                rawText,
                messageOrigin,
                ...(resolvedSource.nativeConverted === true
                    ? {
                        nativeConverted: true,
                        nativeConversionReceipt: resolvedSource.nativeConversionReceipt,
                    }
                    : {}),
            });
            const finalText = payload
                ? (payload as EscapeAwarePayloadCandidate).visible
                : stripControls(resolved).trim();
            if (!finalText)
                return;
            const sessionId = peekMessageState(windowInstance)?.session ?? 0;
            traceLog(`[GameMessage] Final rendered text: "${preview(finalText)}"`);
            runSessionTransition('observation', observeMessage, [
                windowInstance,
                defaultWhenFalsy(payload, resolved),
                sessionId,
                messageStart,
            ]);
        }
        function hasCallableHookMethod(target: MessageWindowPrototypeCandidate, key: PropertyKey, location: {
            readonly source: MessageWindowCandidateSnapshot['source'];
            readonly key: string | null;
            readonly index: number | null;
        }): boolean {
            try {
                const visited: object[] = [];
                let cursor: object | null = target;
                let ownsDescriptor = true;
                while (cursor) {
                    if (visited.length >= MAX_MESSAGE_HOOK_PROTOTYPE_DEPTH) {
                        throw new TypeError(`[GameMessage] Hook prototype chain exceeded ${String(key)} depth.`);
                    }
                    let visitedIndex = 0;
                    while (visitedIndex < visited.length) {
                        if (visited[visitedIndex] === cursor) {
                            throw new TypeError(`[GameMessage] Cyclic hook prototype chain for ${String(key)}.`);
                        }
                        visitedIndex += 1;
                    }
                    visited[visited.length] = cursor;
                    const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
                    if (descriptor) {
                        if (!('value' in descriptor)) {
                            throw new TypeError(`[GameMessage] Accessor hook method rejected: ${String(key)}.`);
                        }
                        if (typeof descriptor.value !== 'function')
                            return false;
                        if (ownsDescriptor) {
                            if (descriptor.configurable !== true && descriptor.writable !== true) {
                                throw new TypeError(`[GameMessage] Immutable hook method rejected: ${String(key)}.`);
                            }
                        }
                        else if (!Object.isExtensible(target)) {
                            throw new TypeError(`[GameMessage] Non-extensible inherited hook target rejected: ${String(key)}.`);
                        }
                        return true;
                    }
                    cursor = Object.getPrototypeOf(cursor) as object | null;
                    ownsDescriptor = false;
                }
                return false;
            }
            catch (error) {
                reportDiscoveryConsumptionFailure('session-hook preparation', location, `method-read:${String(key)}`);
                throw error;
            }
        }
        function ownsHookMethod(target: MessageWindowPrototypeCandidate, key: PropertyKey, location: {
            readonly source: MessageWindowCandidateSnapshot['source'];
            readonly key: string | null;
            readonly index: number | null;
        }): boolean {
            try {
                return Object.prototype.hasOwnProperty.call(target, key);
            }
            catch (error) {
                reportDiscoveryConsumptionFailure('session-hook preparation', location, `method-ownership:${String(key)}`);
                throw error;
            }
        }
        function prepareGameMessageSessionInstallPlan(): GameMessageSessionInstallPlan {
            const receiptGenerationTokenValue: unknown = arguments[0];
            const receiptGenerationToken = receiptGenerationTokenValue &&
                (typeof receiptGenerationTokenValue === 'object' || typeof receiptGenerationTokenValue === 'function')
                ? receiptGenerationTokenValue
                : null;
            const snapshot = messageWindowDiscovery.captureHookCandidates();
            reportMessageWindowDiscoveryFailures('session-hook preparation', snapshot);
            const requests: GameMessageHookMethodRequest[] = [];
            let coreConstructorPrepared = false;
            let constructorIndex = 0;
            while (constructorIndex < snapshot.constructors.length) {
                const target = snapshot.constructors[constructorIndex];
                constructorIndex += 1;
                if (!target)
                    continue;
                const prototypeSnapshot = target.prototype as MessageWindowPrototypeCandidate;
                const constructorRequests: GameMessageHookMethodRequest[] = [];
                try {
                    const hasConverter = hasCallableHookMethod(prototypeSnapshot, 'convertEscapeCharacters', target);
                    if (receiptGenerationToken && hasConverter) {
                        constructorRequests[constructorRequests.length] = prepareConvertEscapeCharactersHookRequest(prototypeSnapshot, receiptGenerationToken);
                    }
                    if (hasCallableHookMethod(prototypeSnapshot, 'startMessage', target) &&
                        (target.forceStartHook || ownsHookMethod(prototypeSnapshot, 'startMessage', target))) {
                        constructorRequests[constructorRequests.length] = prepareStartMessageHookRequest(prototypeSnapshot, receiptGenerationToken);
                    }
                    if (target.source === 'core-constructor' &&
                        hasCallableHookMethod(prototypeSnapshot, 'processCharacter', target)) {
                        constructorRequests[constructorRequests.length] = prepareProcessCharacterHookRequest(prototypeSnapshot, receiptGenerationToken);
                    }
                }
                catch (error) {
                    reportDiscoveryConsumptionFailure('session-hook preparation', target, 'constructor-hook-request');
                    if (target.source === 'core-constructor')
                        throw error;
                    continue;
                }
                for (const request of constructorRequests) {
                    requests[requests.length] = request;
                }
                if (target.source === 'core-constructor')
                    coreConstructorPrepared = true;
            }
            if (!coreConstructorPrepared) {
                throw new MessageSessionPlanUnavailableError('[GameMessage] Required core Window_Message hook generation is unavailable.');
            }
            return Object.freeze({
                requests: Object.freeze(requests),
            });
        }
        function prepareProcessCharacterHookRequest(prototypeSnapshot: MessageWindowPrototypeCandidate, receiptGenerationToken: object | null): GameMessageHookMethodRequest {
            return freezeHookRequest(prototypeSnapshot, 'processCharacter', freezeHookLayer('__trGameMessageProcessWrapped', function processCharacterLayer(next) {
                return function gameMessageProcessCharacterHook(this: MessageWindowCandidate, ...argumentsList: unknown[]): unknown {
                    let adapterFailure: unknown = null;
                    try {
                        const textStateValue = argumentsList[0];
                        const textState = textStateValue && typeof textStateValue === 'object'
                            ? (textStateValue as TextStateCandidate)
                            : null;
                        const bypassDepth = this._trBypassProcessCharacter;
                        const bypassed = typeof bypassDepth === 'number' && bypassDepth > 0;
                        if (!bypassed && textState?.drawing !== false) {
                            const sourceText = textState && typeof textState.text === 'string' ? textState.text : '';
                            const renderSession = peekMessageRenderSession(this);
                            if (!renderSession?.payload) {
                                observeProcessCharacterMessage(this, sourceText, receiptGenerationToken);
                            }
                        }
                    }
                    catch (error) {
                        adapterFailure = error;
                    }
                    let nativeResult: unknown;
                    try {
                        nativeResult = Reflect.apply(next, this, argumentsList);
                    }
                    catch (nativeError) {
                        if (adapterFailure !== null) {
                            reportMessageWindowHookFailure('processCharacter observation', adapterFailure);
                        }
                        throw nativeError;
                    }
                    if (adapterFailure !== null) {
                        reportMessageWindowHookFailure('processCharacter observation', adapterFailure);
                    }
                    return nativeResult;
                };
            }));
        }
        function observeProcessCharacterMessage(windowInstance: MessageWindowCandidate, sourceText: string, receiptGenerationToken: object | null = null): boolean {
            const current = peekMessageState(windowInstance);
            if (current?.isActive !== true && !runSessionTransition('begin', beginMessageSession, [windowInstance])) {
                return false;
            }
            if (receiptGenerationToken) {
                conversionReceipts.publishTextState(receiptGenerationToken, windowInstance, sourceText);
            }
            const resolvedInfo = getResolvedTextForWindow(windowInstance);
            const resolvedSource = resolvedInfo as ResolvedTextCandidate;
            const resolvedText = resolvedInfo ? resolvedSource.text : resolvedInfo;
            const hasResolvedText = resolvedInfo && typeof resolvedText === 'string' && resolvedText.length > 0;
            const resolved = hasResolvedText ? resolvedText : sourceText;
            const messageBreakInfo = hasResolvedText ? resolvedSource.messageBreakInfo : hasResolvedText;
            const rawText = hasResolvedText ? resolvedSource.rawText : sourceText;
            const messageOrigin = resolvedInfo ? resolvedSource.messageOrigin : resolvedInfo;
            const payload = createEscapeAwarePayload(resolved, 'processCharacter', {
                messageBreakInfo,
                rawText,
                messageOrigin,
                ...(resolvedSource.nativeConverted === true
                    ? {
                        nativeConverted: true,
                        nativeConversionReceipt: resolvedSource.nativeConversionReceipt,
                    }
                    : {}),
            });
            const finalText = payload
                ? (payload as EscapeAwarePayloadCandidate).visible
                : stripControls(sourceText).trim();
            if (!payload || !finalText)
                return false;
            const sessionId = peekMessageState(windowInstance)?.session ?? 0;
            const observed = runSessionTransition('observation', observeMessage, [
                windowInstance,
                payload,
                sessionId,
                snapshotTextStateStart(windowInstance),
            ]);
            if (!observed)
                return false;
            traceLog(`[GameMessage] Final rendered text: "${preview(finalText)}"`);
            return true;
        }
        return {
            getMessageRenderSession,
            setMessageStartCoordinates,
            getMessageStartCoordinates,
            collectWindowsForGameMessage,
            prepareGameMessageSessionInstallPlan,
        };
    }
    return { create: createController };
}
