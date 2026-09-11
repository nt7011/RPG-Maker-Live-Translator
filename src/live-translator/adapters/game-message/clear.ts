import type { GameMessageHookMethodRequest } from './hook-lease.js';
type RuntimeCallback = (...args: unknown[]) => unknown;
export interface GameMessageClearRuntimeScope {
    readonly Game_Message?: unknown;
}
interface GameMessageConstructorCandidate {
    readonly prototype?: unknown;
}
interface MessageStateTelemetry {
    readonly logGameMessageState?: (state: unknown) => unknown;
}
interface ClearControllerScopeCandidate {
    readonly traceLog: RuntimeCallback;
    readonly telemetry?: MessageStateTelemetry | null;
    readonly clearMessageOrigin: RuntimeCallback;
    readonly collectWindowsForGameMessage: (gameMessage: unknown) => unknown[];
    readonly resetWindowMessageState: (windowInstance: unknown) => unknown;
    readonly warn: RuntimeCallback;
}
export interface GameMessageClearController {
    readonly prepareGameMessageClearHookRequest: () => GameMessageHookMethodRequest | null;
}
export interface GameMessageClearModule {
    create(scope?: unknown): GameMessageClearController;
}
export function createGameMessageClearModule(runtimeScope: GameMessageClearRuntimeScope): GameMessageClearModule {
    function createController(scope: unknown = {}): GameMessageClearController {
        const source = scope as ClearControllerScopeCandidate;
        const { telemetry, traceLog, clearMessageOrigin, collectWindowsForGameMessage, resetWindowMessageState, warn } = source;
        function observeClear(label: string, operation: RuntimeCallback): unknown {
            try {
                return Reflect.apply(operation, undefined, []);
            }
            catch (error) {
                try {
                    Reflect.apply(warn, undefined, [`[GameMessage] ${label} error`, error]);
                }
                catch {
                }
                return undefined;
            }
        }
        function resetMessageWindow(windowInstance: unknown): unknown {
            return resetWindowMessageState(windowInstance);
        }
        function messageStateFromTransitionOutcome(outcome: unknown): unknown {
            if ((typeof outcome !== 'object' || outcome === null) && typeof outcome !== 'function')
                return null;
            const snapshotDescriptor = Object.getOwnPropertyDescriptor(outcome, 'currentSnapshot');
            const snapshot: unknown = snapshotDescriptor && 'value' in snapshotDescriptor ? (snapshotDescriptor.value as unknown) : null;
            if ((typeof snapshot !== 'object' || snapshot === null) && typeof snapshot !== 'function')
                return null;
            const stateDescriptor = Object.getOwnPropertyDescriptor(snapshot, 'messageState');
            return stateDescriptor && 'value' in stateDescriptor ? (stateDescriptor.value as unknown) : null;
        }
        function prepareGameMessageClearHookRequest(): GameMessageHookMethodRequest | null {
            const gameMessageConstructor = runtimeScope.Game_Message;
            if ((typeof gameMessageConstructor !== 'object' || gameMessageConstructor === null) &&
                typeof gameMessageConstructor !== 'function') {
                return null;
            }
            const prototype = (gameMessageConstructor as GameMessageConstructorCandidate).prototype;
            if ((typeof prototype !== 'object' || prototype === null) && typeof prototype !== 'function') {
                return null;
            }
            const markers = Object.freeze([
                Object.freeze({
                    key: '__trGameMessageClearWrapped',
                    value: true,
                }),
            ]);
            const layers = Object.freeze([
                Object.freeze({
                    createWrapper(next: RuntimeCallback): RuntimeCallback {
                        return function gameMessageClearLayer(this: unknown, ...args: unknown[]): unknown {
                            const result = Reflect.apply(next, this, args);
                            observeClear('clear observation', () => {
                                observeClear('clear message origin', () => clearMessageOrigin(this));
                                const collected = observeClear('clear window discovery', () => collectWindowsForGameMessage(this));
                                const windows = Array.isArray(collected) ? collected : [];
                                let messageState: unknown = null;
                                windows.forEach((windowInstance) => {
                                    const nextMessageState = observeClear('clear window context reset', () => messageStateFromTransitionOutcome(resetMessageWindow(windowInstance)));
                                    if (nextMessageState) {
                                        messageState = nextMessageState;
                                    }
                                });
                                messageState ??= Object.freeze({
                                    isActive: false,
                                    session: 0,
                                    source: null,
                                });
                                observeClear('clear trace', () => traceLog('Game_Message.clear() - Message cleared'));
                                traceMessageState(messageState);
                            });
                            return result;
                        };
                    },
                    markers,
                }),
            ]);
            return Object.freeze({
                target: prototype,
                key: 'clear',
                layers,
            });
        }
        function traceMessageState(state: unknown): void {
            try {
                telemetry?.logGameMessageState?.(state);
            }
            catch {
            }
        }
        return {
            prepareGameMessageClearHookRequest,
        };
    }
    return { create: createController };
}
