import type { InterpreterExecutionContextOwner, InterpreterExecutionContextRelease, } from '../../runtime/game-message/execution-context-owner.js';
import type { ForesightModule } from './foresight/facade.js';
import type { ForesightProvenanceAuthority } from './foresight/provenance.js';
import type { GameMessageHookMethodRequest } from './hook-lease.js';
type RuntimeCallback = (...args: unknown[]) => unknown;
export interface GameMessageForesightHooksDependencies {
    readonly foresightAdapter: ForesightModule | null | undefined;
    readonly provenance: ForesightProvenanceAuthority;
}
export interface GameMessageForesightHooksRuntimeScope {
    readonly Game_Interpreter?: unknown;
}
type ForesightHookMarker = '__trInterpreterContextWrapped' | '__trChildOriginWrapped' | '__trGameMessageOriginWrapped';
interface ForesightHooksControllerScopeCandidate {
    readonly FORESIGHT_BUDGET?: unknown;
    readonly FORESIGHT_MAX_SCAN_COMMANDS?: unknown;
    readonly interpreterExecutionContextOwner: InterpreterExecutionContextOwner;
    readonly settings?: unknown;
    readonly getGameMessageForWindow: RuntimeCallback;
    readonly readMessageTextData: RuntimeCallback;
    readonly getInterpreterOriginId: RuntimeCallback;
    readonly getGlobalGameMessage: RuntimeCallback;
    readonly warn: RuntimeCallback;
}
const IntrinsicObject = Object;
const IntrinsicReflect = Reflect;
const IntrinsicString = String;
const IntrinsicTypeError = TypeError;
const objectFreezeIntrinsic = Object.freeze;
const objectGetOwnPropertyDescriptorIntrinsic = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOfIntrinsic = Object.getPrototypeOf;
function captureIntrinsicMethod(target: object, key: PropertyKey): RuntimeCallback {
    const descriptor = objectGetOwnPropertyDescriptorIntrinsic(target, key);
    const value: unknown = descriptor?.value;
    if (typeof value !== 'function') {
        throw new IntrinsicTypeError(`Game message foresight hooks require intrinsic ${IntrinsicString(key)}.`);
    }
    return value as RuntimeCallback;
}
const reflectApplyIntrinsic = captureIntrinsicMethod(IntrinsicReflect, 'apply');
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return reflectApplyIntrinsic(objectFreezeIntrinsic, IntrinsicObject, [value]) as Readonly<Value>;
}
function isObject(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function ownDataValue(value: unknown, key: PropertyKey): unknown {
    if (!isObject(value))
        return undefined;
    try {
        const descriptor = objectGetOwnPropertyDescriptorIntrinsic(value, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
export interface GameMessageForesightHooksController {
    readonly createForesightScanner: () => ReturnType<ForesightModule['createGameMessageForesight']> | null;
    readonly prepareGameMessageForesightHookRequests: () => readonly GameMessageHookMethodRequest[];
    readonly getVerifiedMessageOrigin: (windowInstance: unknown) => unknown;
}
export interface GameMessageForesightHooksModule {
    create(scope?: unknown): GameMessageForesightHooksController;
}
export function createGameMessageForesightHooksModule({ foresightAdapter, provenance }: GameMessageForesightHooksDependencies, runtimeScope: GameMessageForesightHooksRuntimeScope): GameMessageForesightHooksModule {
    const { prepareExecution, readExecution, releaseExecution, createChildContext, prepareMessage, settleMessage, verifyMessageOrigin, retire, } = provenance;
    function createController(scope: unknown = {}): GameMessageForesightHooksController {
        const source = scope as ForesightHooksControllerScopeCandidate;
        const { FORESIGHT_BUDGET, FORESIGHT_MAX_SCAN_COMMANDS, interpreterExecutionContextOwner } = source;
        const enterInterpreterExecutionContext = interpreterExecutionContextOwner.enter;
        const peekInterpreterExecutionContext = interpreterExecutionContextOwner.peek;
        if (typeof enterInterpreterExecutionContext !== 'function' ||
            typeof peekInterpreterExecutionContext !== 'function') {
            throw new IntrinsicTypeError('Game message foresight hooks require execution-context enter()/peek().');
        }
        const { getGameMessageForWindow, readMessageTextData, getInterpreterOriginId, getGlobalGameMessage, warn } = source;
        function createForesightScanner(): ReturnType<ForesightModule['createGameMessageForesight']> | null {
            try {
                const module = foresightAdapter;
                const createGameMessageForesight = module ? module.createGameMessageForesight : null;
                if (typeof createGameMessageForesight === 'function') {
                    return reflectApplyIntrinsic(createGameMessageForesight, module, [
                        {
                            budget: FORESIGHT_BUDGET,
                            maxScanCommands: FORESIGHT_MAX_SCAN_COMMANDS,
                            settings: source.settings,
                        },
                    ]) as ReturnType<ForesightModule['createGameMessageForesight']>;
                }
            }
            catch (error) {
                reportProvenanceFailure('[GameMessage] Foresight scanner unavailable; lookahead disabled.', error);
            }
            return null;
        }
        function captureRuntimePrototype(key: keyof GameMessageForesightHooksRuntimeScope): object | null {
            try {
                const constructorValue = runtimeScope[key];
                if (!constructorValue)
                    return null;
                const prototype = ownDataValue(constructorValue, 'prototype');
                return isObject(prototype) ? prototype : null;
            }
            catch (error) {
                reportProvenanceFailure(`[GameMessage] ${key} prototype capture failed.`, error);
                return null;
            }
        }
        function hasCallableRuntimeMethod(target: object, key: PropertyKey): boolean {
            try {
                let cursor: object | null = target;
                let depth = 0;
                while (cursor && depth < 256) {
                    const descriptor = objectGetOwnPropertyDescriptorIntrinsic(cursor, key);
                    if (descriptor)
                        return 'value' in descriptor && typeof descriptor.value === 'function';
                    cursor = objectGetPrototypeOfIntrinsic(cursor) as object | null;
                    depth += 1;
                }
                return false;
            }
            catch (error) {
                reportProvenanceFailure(`[GameMessage] ${IntrinsicString(key)} hook capture failed.`, error);
                return false;
            }
        }
        function createHookRequest(target: object, key: PropertyKey, marker: ForesightHookMarker, createWrapper: (next: RuntimeCallback) => RuntimeCallback): GameMessageHookMethodRequest {
            return freezeExact({
                target,
                key,
                layers: freezeExact([
                    freezeExact({
                        createWrapper,
                        markers: freezeExact([freezeExact({ key: marker, value: true })]),
                    }),
                ]),
            });
        }
        function currentExecution(interpreter: unknown): unknown {
            try {
                const token = reflectApplyIntrinsic(peekInterpreterExecutionContext, interpreterExecutionContextOwner, [
                    interpreter,
                ]);
                return readExecution(token) ? token : null;
            }
            catch {
                return null;
            }
        }
        function prepareExecutionForInterpreter(interpreter: unknown): unknown {
            try {
                return prepareExecution({
                    interpreter,
                    inheritedContext: ownDataValue(interpreter, '_trForesightOriginContext'),
                    identity: { interpreterId: getInterpreterOriginId(interpreter) },
                    maxCommands: FORESIGHT_MAX_SCAN_COMMANDS,
                });
            }
            catch (error) {
                reportProvenanceFailure('[GameMessage] Interpreter provenance preparation failed.', error);
                return null;
            }
        }
        function prepareGameMessageForesightHookRequests(): readonly GameMessageHookMethodRequest[] {
            const requests: GameMessageHookMethodRequest[] = [];
            const interpreterPrototype = captureRuntimePrototype('Game_Interpreter');
            if (!interpreterPrototype)
                return freezeExact(requests);
            function releaseLocalExecution(token: unknown): void {
                if (!token)
                    return;
                try {
                    releaseExecution(token);
                }
                catch {
                }
            }
            function retirePendingMessage(token: unknown): void {
                if (!token)
                    return;
                try {
                    retire(token);
                }
                catch {
                }
            }
            if (hasCallableRuntimeMethod(interpreterPrototype, 'executeCommand')) {
                requests[requests.length] = createHookRequest(interpreterPrototype, 'executeCommand', '__trInterpreterContextWrapped', (next) => function interpreterExecutionContextHook(this: unknown, ...args: unknown[]): unknown {
                    const token = prepareExecutionForInterpreter(this);
                    let releaseOwned: InterpreterExecutionContextRelease | null = null;
                    if (token) {
                        try {
                            const releaseCandidate = reflectApplyIntrinsic(enterInterpreterExecutionContext, interpreterExecutionContextOwner, [token, this]);
                            if (typeof releaseCandidate === 'function') {
                                releaseOwned = releaseCandidate as InterpreterExecutionContextRelease;
                            }
                        }
                        catch (error) {
                            reportProvenanceFailure('[GameMessage] Interpreter provenance admission failed.', error);
                        }
                    }
                    try {
                        return reflectApplyIntrinsic(next, this, args);
                    }
                    finally {
                        if (releaseOwned) {
                            try {
                                reflectApplyIntrinsic(releaseOwned, undefined, []);
                            }
                            catch {
                            }
                        }
                        releaseLocalExecution(token);
                    }
                });
            }
            if (hasCallableRuntimeMethod(interpreterPrototype, 'setupChild')) {
                requests[requests.length] = createHookRequest(interpreterPrototype, 'setupChild', '__trChildOriginWrapped', (next) => function childInterpreterOriginHook(this: unknown, ...args: unknown[]): unknown {
                    const existingExecution = currentExecution(this);
                    const token = existingExecution ?? prepareExecutionForInterpreter(this);
                    const preparedLocally = !!token && !existingExecution;
                    let result: unknown;
                    try {
                        result = reflectApplyIntrinsic(next, this, args);
                    }
                    catch (error) {
                        if (preparedLocally)
                            releaseLocalExecution(token);
                        throw error;
                    }
                    try {
                        const child = ownDataValue(this, '_childInterpreter');
                        if (token && child)
                            createChildContext(token, this, child, null);
                    }
                    catch (error) {
                        reportProvenanceFailure('[GameMessage] Child provenance settlement failed.', error);
                    }
                    finally {
                        if (preparedLocally)
                            releaseLocalExecution(token);
                    }
                    return result;
                });
            }
            if (hasCallableRuntimeMethod(interpreterPrototype, 'command101')) {
                requests[requests.length] = createHookRequest(interpreterPrototype, 'command101', '__trGameMessageOriginWrapped', (next) => function gameMessageOriginHook(this: unknown, ...args: unknown[]): unknown {
                    let gameMessage: unknown = null;
                    try {
                        gameMessage = getGlobalGameMessage();
                    }
                    catch (error) {
                        reportProvenanceFailure('[GameMessage] Message provenance lookup failed.', error);
                    }
                    const existingExecution = currentExecution(this);
                    const executionToken = existingExecution ?? prepareExecutionForInterpreter(this);
                    const preparedLocally = !!executionToken && !existingExecution;
                    let pending: unknown = null;
                    if (executionToken && gameMessage) {
                        try {
                            pending = prepareMessage(executionToken, gameMessage, readMessageTextData(gameMessage), FORESIGHT_MAX_SCAN_COMMANDS);
                        }
                        catch (error) {
                            reportProvenanceFailure('[GameMessage] Command provenance preparation failed.', error);
                        }
                    }
                    let result: unknown;
                    try {
                        result = reflectApplyIntrinsic(next, this, args);
                    }
                    catch (error) {
                        retirePendingMessage(pending);
                        if (preparedLocally)
                            releaseLocalExecution(executionToken);
                        throw error;
                    }
                    try {
                        if (pending && gameMessage)
                            settleMessage(pending, readMessageTextData(gameMessage));
                        pending = null;
                    }
                    catch (error) {
                        reportProvenanceFailure('[GameMessage] Command provenance settlement failed.', error);
                    }
                    finally {
                        retirePendingMessage(pending);
                        if (preparedLocally)
                            releaseLocalExecution(executionToken);
                    }
                    return result;
                });
            }
            return freezeExact(requests);
        }
        function reportProvenanceFailure(message: string, error: unknown): void {
            try {
                warn(message, error);
            }
            catch {
            }
        }
        function getVerifiedMessageOrigin(windowInstance: unknown): unknown {
            try {
                const gameMessage = getGameMessageForWindow(windowInstance);
                const token = ownDataValue(gameMessage, '_trMessageOrigin');
                return verifyMessageOrigin(token, gameMessage) ? token : null;
            }
            catch {
                return null;
            }
        }
        return freezeExact({
            createForesightScanner,
            prepareGameMessageForesightHookRequests,
            getVerifiedMessageOrigin,
        });
    }
    return freezeExact({ create: createController });
}
