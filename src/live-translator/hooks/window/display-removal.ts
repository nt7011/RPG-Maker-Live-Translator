import type { DisplayStateModule } from '../../runtime/display-state.js';
import type { LifecycleReasons } from '../../runtime/lifecycle-reasons.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
type Primitive = bigint | boolean | null | number | string | symbol | undefined;
interface PendingDetachState {
    readonly token: number;
    readonly root: unknown;
    readonly reason: unknown;
}
export interface WindowDisplayRemovalModule {
    readonly install: (context?: unknown) => boolean;
}
const FRAME_SETTLED_DETACH_TOKEN = 'liveTranslator.windowDetach.frameSettled.v1';
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRuntimeFunction(value: unknown): value is RuntimeFunction {
    return typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function memberValue(value: unknown, key: PropertyKey): unknown {
    if (value === null || value === undefined) {
        throw new TypeError(`Cannot read window display property ${String(key)}.`);
    }
    if (isPropertyBag(value))
        return value[key];
    const boxed: unknown = Reflect.apply(Object, undefined, [value]);
    if (!isPropertyBag(boxed)) {
        throw new TypeError(`Cannot box window display property owner ${String(key)}.`);
    }
    return boxed[key];
}
function setProperty(target: unknown, key: PropertyKey, value: unknown): void {
    if (!isPropertyBag(target)) {
        throw new TypeError(`Window display target cannot receive ${String(key)}.`);
    }
    target[key] = value;
}
function deleteProperty(target: unknown, key: PropertyKey): void {
    if (!isPropertyBag(target)) {
        throw new TypeError(`Window display target cannot delete ${String(key)}.`);
    }
    if (!Reflect.deleteProperty(target, key)) {
        throw new TypeError(`Window display target refused to delete ${String(key)}.`);
    }
}
function invokeMethod(target: unknown, methodName: PropertyKey, args: readonly unknown[]): unknown {
    const method = memberValue(target, methodName);
    if (!isRuntimeFunction(method)) {
        throw new TypeError(`Window display method ${String(methodName)} is not callable.`);
    }
    return Reflect.apply(method, target, args);
}
function invokeUnbound(callback: RuntimeFunction, args: readonly unknown[]): unknown {
    return Reflect.apply(callback, undefined, args);
}
function invokeApplyBoundary(callback: unknown, receiver: unknown, args: readonly unknown[]): unknown {
    return invokeMethod(callback, 'apply', [receiver, args]);
}
function invokeCallBoundary(callback: unknown, receiver: unknown, args: readonly unknown[]): unknown {
    return invokeMethod(callback, 'call', [receiver, ...args]);
}
function destructurableContext(value: unknown): PropertyBag {
    if (value === null || value === undefined) {
        throw new TypeError('Window display-removal context cannot be null or undefined.');
    }
    if (isPropertyBag(value))
        return value;
    const boxed: unknown = Reflect.apply(Object, undefined, [value]);
    if (isPropertyBag(boxed))
        return boxed;
    throw new TypeError('Window display-removal context is not property-readable.');
}
function truthyOr<Value, Fallback>(value: Value, fallback: () => Fallback): Value | Fallback {
    if (value)
        return value;
    return fallback();
}
function numberValue(value: unknown): number {
    const converted: unknown = Reflect.apply(Number, undefined, [value]);
    if (typeof converted !== 'number')
        throw new TypeError('Number conversion did not return a number.');
    return converted;
}
function stringValue(value: unknown): string {
    const converted: unknown = Reflect.apply(String, undefined, [value]);
    if (typeof converted !== 'string')
        throw new TypeError('String conversion did not return text.');
    return converted;
}
function isPrimitive(value: unknown): value is Primitive {
    return (typeof value !== 'object' && typeof value !== 'function') || value === null;
}
function primitiveValue(value: unknown, hint: 'default' | 'string'): Primitive {
    if (isPrimitive(value))
        return value;
    const exotic = propertyValue(value, Symbol.toPrimitive);
    if (exotic !== undefined && exotic !== null) {
        if (!isRuntimeFunction(exotic))
            throw new TypeError('Symbol.toPrimitive is not callable.');
        const result = Reflect.apply(exotic, value, [hint]);
        if (isPrimitive(result))
            return result;
        throw new TypeError('Symbol.toPrimitive returned an object.');
    }
    const methodNames = hint === 'string' ? ['toString', 'valueOf'] : ['valueOf', 'toString'];
    for (const methodName of methodNames) {
        const method = propertyValue(value, methodName);
        if (!isRuntimeFunction(method))
            continue;
        const result = Reflect.apply(method, value, []);
        if (isPrimitive(result))
            return result;
    }
    throw new TypeError('Cannot convert object to primitive value.');
}
function propertyKeyValue(value: unknown): PropertyKey {
    const primitive = primitiveValue(value, 'string');
    return typeof primitive === 'symbol' ? primitive : stringValue(primitive);
}
function addNumber(value: unknown, delta: number): Primitive {
    const primitive = primitiveValue(value, 'default');
    if (typeof primitive === 'string')
        return primitive + (delta === 1 ? '1' : '-1');
    if (typeof primitive === 'bigint') {
        throw new TypeError('Cannot mix BigInt and other types in addition.');
    }
    return numberValue(primitive) + delta;
}
function mathNumberValue(value: Primitive): number {
    if (typeof value === 'bigint') {
        throw new TypeError('Cannot convert a BigInt value to a number.');
    }
    return numberValue(value);
}
function callUnknown(callback: unknown, args: readonly unknown[]): unknown {
    if (!isRuntimeFunction(callback))
        throw new TypeError('Window display callback is not callable.');
    return Reflect.apply(callback, undefined, args);
}
function isRuntimeInstance(value: object, constructorCandidate: unknown): boolean {
    if (!constructorCandidate || !isPropertyBag(constructorCandidate))
        return false;
    const hasInstance = propertyValue(constructorCandidate, Symbol.hasInstance);
    if (hasInstance !== undefined && hasInstance !== null) {
        if (!isRuntimeFunction(hasInstance)) {
            throw new TypeError('Window constructor Symbol.hasInstance is not callable.');
        }
        return Boolean(Reflect.apply(hasInstance, constructorCandidate, [value]));
    }
    if (!isRuntimeFunction(constructorCandidate)) {
        throw new TypeError('Window constructor is not callable.');
    }
    return Reflect.apply(Function.prototype[Symbol.hasInstance], constructorCandidate, [value]);
}
export function createWindowDisplayRemovalModule(displayStateModule: DisplayStateModule, lifecycleReasons: LifecycleReasons): WindowDisplayRemovalModule {
    function installWindowDisplayRemovalHookGroup(context: unknown = {}): boolean {
        const source = destructurableContext(context);
        const globalScope = source['globalScope'];
        const logger = source['logger'];
        const windowRegistry = source['windowRegistry'];
        const unregisterWindow = source['unregisterWindow'];
        const hasHookInChain = source['hasHookInChain'];
        const WindowBase = globalScope && propertyValue(globalScope, 'Window_Base') ? propertyValue(globalScope, 'Window_Base') : null;
        if (!globalScope || !WindowBase || !windowRegistry || !isRuntimeFunction(hasHookInChain))
            return false;
        const displayState = displayStateModule.createDisplayStateService(globalScope);
        const unregisterWindowSafely = (windowInstance: unknown, reason: unknown): void => {
            if (!windowInstance || !isRuntimeFunction(unregisterWindow))
                return;
            try {
                invokeUnbound(unregisterWindow, [
                    windowInstance,
                    truthyOr(reason, () => lifecycleReasons.WINDOW_UNREGISTERED),
                ]);
            }
            catch (error) {
                invokeMethod(logger, 'warn', ['[WindowLifecycle] Window unregister failed.', error]);
            }
        };
        const isTrackedWindowInstance = (value: unknown): boolean => {
            if (!value || typeof value !== 'object')
                return false;
            try {
                if (isRuntimeInstance(value, WindowBase))
                    return true;
            }
            catch {
            }
            try {
                return Boolean(invokeMethod(windowRegistry, 'get', [value]));
            }
            catch {
                return false;
            }
        };
        const collectWindowTree = (root: unknown, output: unknown[], seen: unknown[] = [], depth = 0): void => {
            if (!root || depth > 128 || numberValue(invokeMethod(seen, 'indexOf', [root])) >= 0) {
                return;
            }
            seen.push(root);
            if (isTrackedWindowInstance(root))
                output.push(root);
            const children = Array.isArray(propertyValue(root, 'children'))
                ? invokeMethod(propertyValue(root, 'children'), 'slice', [])
                : [];
            invokeMethod(children, 'forEach', [
                (child: unknown): void => {
                    collectWindowTree(child, output, seen, depth + 1);
                },
            ]);
        };
        const hasReparentGuard = (root: unknown): boolean => Boolean(root && numberValue(propertyValue(root, '_trWindowRegistryReparentDepth')) > 0);
        const hasDestroyGuard = (root: unknown): boolean => Boolean(root && numberValue(propertyValue(root, '_trWindowRegistryDestroyDepth')) > 0);
        const setGuard = (root: unknown, property: string, delta: number): void => {
            if (!root || typeof root !== 'object')
                return;
            try {
                const nextDepth = Math.max(0, mathNumberValue(addNumber(truthyOr(propertyValue(root, property), () => 0), delta)));
                if (nextDepth > 0)
                    setProperty(root, property, nextDepth);
                else
                    deleteProperty(root, property);
            }
            catch {
            }
        };
        const setReparentGuard = (root: unknown, delta: number): void => {
            setGuard(root, '_trWindowRegistryReparentDepth', delta);
        };
        const setDestroyGuard = (root: unknown, delta: number): void => {
            setGuard(root, '_trWindowRegistryDestroyDepth', delta);
        };
        let pendingDetachToken = 0;
        let pendingDetachFlushScheduled = false;
        let frameSettledDetachHooksInstalled = false;
        const pendingDetachedWindows = new Set<unknown>();
        const getRegisteredWindowData = (windowInstance: unknown): unknown => {
            if (!windowInstance || !isRuntimeFunction(propertyValue(windowRegistry, 'get'))) {
                return null;
            }
            try {
                return truthyOr(invokeMethod(windowRegistry, 'get', [windowInstance]), () => null);
            }
            catch {
                return null;
            }
        };
        const setPendingDetachState = (windowInstance: unknown, state: PendingDetachState | null = null): void => {
            if (!windowInstance || typeof windowInstance !== 'object')
                return;
            const windowData = getRegisteredWindowData(windowInstance);
            try {
                if (state) {
                    setProperty(windowInstance, '_trWindowRegistryPendingDetachToken', state.token);
                    setProperty(windowInstance, '_trWindowRegistryPendingDetachRoot', truthyOr(state.root, () => null));
                    setProperty(windowInstance, '_trWindowRegistryPendingDetachReason', truthyOr(state.reason, () => lifecycleReasons.WINDOW_DETACHED));
                }
                else {
                    deleteProperty(windowInstance, '_trWindowRegistryPendingDetachToken');
                    deleteProperty(windowInstance, '_trWindowRegistryPendingDetachRoot');
                    deleteProperty(windowInstance, '_trWindowRegistryPendingDetachReason');
                }
            }
            catch {
            }
            if (!windowData)
                return;
            try {
                if (state) {
                    setProperty(windowData, '_trPendingDetach', true);
                    setProperty(windowData, '_trPendingDetachToken', state.token);
                    setProperty(windowData, '_trPendingDetachRoot', truthyOr(state.root, () => null));
                    setProperty(windowData, '_trPendingDetachReason', truthyOr(state.reason, () => lifecycleReasons.WINDOW_DETACHED));
                }
                else {
                    deleteProperty(windowData, '_trPendingDetach');
                    deleteProperty(windowData, '_trPendingDetachToken');
                    deleteProperty(windowData, '_trPendingDetachRoot');
                    deleteProperty(windowData, '_trPendingDetachReason');
                }
            }
            catch {
            }
        };
        const getPendingDetachState = (windowInstance: unknown): PendingDetachState | null => {
            const windowData = getRegisteredWindowData(windowInstance);
            const dataToken = numberValue(windowData && propertyValue(windowData, '_trPendingDetachToken'));
            const windowToken = numberValue(windowInstance && propertyValue(windowInstance, '_trWindowRegistryPendingDetachToken'));
            const token = Number.isFinite(dataToken) && dataToken > 0
                ? dataToken
                : Number.isFinite(windowToken) && windowToken > 0
                    ? windowToken
                    : 0;
            if (!token)
                return null;
            return {
                token,
                root: truthyOr(windowData && propertyValue(windowData, '_trPendingDetachRoot'), () => truthyOr(windowInstance && propertyValue(windowInstance, '_trWindowRegistryPendingDetachRoot'), () => windowInstance)),
                reason: truthyOr(windowData && propertyValue(windowData, '_trPendingDetachReason'), () => truthyOr(windowInstance && propertyValue(windowInstance, '_trWindowRegistryPendingDetachReason'), () => lifecycleReasons.WINDOW_DETACHED)),
            };
        };
        const clearPendingDetachedWindow = (windowInstance: unknown): void => {
            if (!windowInstance)
                return;
            pendingDetachedWindows.delete(windowInstance);
            setPendingDetachState(windowInstance, null);
        };
        const markAttachedTree = (root: unknown): void => {
            if (!root)
                return;
            const windows: unknown[] = [];
            collectWindowTree(root, windows);
            windows.forEach((windowInstance) => {
                const windowData = getRegisteredWindowData(windowInstance);
                if (!windowData)
                    return;
                try {
                    setProperty(windowData, '_trEverAttached', true);
                }
                catch {
                }
            });
        };
        const isParentChainAttached = (root: unknown): boolean => displayState.isDisplayObjectAttached(root);
        const isDescendantOf = (candidate: unknown, root: unknown): boolean => {
            if (!candidate || !root)
                return false;
            let current: unknown = candidate;
            let depth = 0;
            while (current && depth < 128) {
                if (current === root)
                    return true;
                current = truthyOr(propertyValue(current, 'parent'), () => null);
                depth += 1;
            }
            return false;
        };
        const isPendingWindowStillAttached = (windowInstance: unknown, state: PendingDetachState | null): boolean => {
            const root = state && propertyValue(state, 'root') ? propertyValue(state, 'root') : windowInstance;
            if (root && isDescendantOf(windowInstance, root)) {
                return isParentChainAttached(root);
            }
            return isParentChainAttached(windowInstance);
        };
        const flushPendingDetachedWindows = (): void => {
            pendingDetachFlushScheduled = false;
            const windows = Array.from(pendingDetachedWindows);
            pendingDetachedWindows.clear();
            windows.forEach((windowInstance) => {
                const windowData = getRegisteredWindowData(windowInstance);
                if (!windowData) {
                    setPendingDetachState(windowInstance, null);
                    return;
                }
                const state = getPendingDetachState(windowInstance);
                if (!state)
                    return;
                if (isPendingWindowStillAttached(windowInstance, state)) {
                    clearPendingDetachedWindow(windowInstance);
                    return;
                }
                setPendingDetachState(windowInstance, null);
                unregisterWindowSafely(windowInstance, truthyOr(state.reason, () => lifecycleReasons.WINDOW_DETACHED));
            });
        };
        const flushPendingDetachedWindowsAtFrameBoundary = (): void => {
            if (!pendingDetachFlushScheduled)
                return;
            flushPendingDetachedWindows();
        };
        const scheduleMicrotaskDetachFlush = (): void => {
            if (pendingDetachFlushScheduled)
                return;
            pendingDetachFlushScheduled = true;
            const run = (): void => {
                flushPendingDetachedWindows();
            };
            const scopedQueueMicrotask = isRuntimeFunction(propertyValue(globalScope, 'queueMicrotask'))
                ? invokeMethod(propertyValue(globalScope, 'queueMicrotask'), 'bind', [globalScope])
                : null;
            const scopedPromise = propertyValue(globalScope, 'Promise') &&
                isRuntimeFunction(memberValue(propertyValue(globalScope, 'Promise'), 'resolve'))
                ? propertyValue(globalScope, 'Promise')
                : null;
            const contextPromise = propertyValue(globalThis, 'Promise') &&
                isRuntimeFunction(memberValue(propertyValue(globalThis, 'Promise'), 'resolve'))
                ? propertyValue(globalThis, 'Promise')
                : null;
            if (scopedQueueMicrotask) {
                callUnknown(scopedQueueMicrotask, [run]);
            }
            else if (scopedPromise) {
                const promise = invokeMethod(scopedPromise, 'resolve', []);
                invokeMethod(promise, 'then', [run]);
            }
            else if (contextPromise) {
                const promise = invokeMethod(contextPromise, 'resolve', []);
                invokeMethod(promise, 'then', [run]);
            }
            else {
                run();
            }
        };
        const scheduleFrameSettledDetachFlush = (): void => {
            if (pendingDetachFlushScheduled)
                return;
            pendingDetachFlushScheduled = true;
            if (frameSettledDetachHooksInstalled || installFrameSettledDetachHooks())
                return;
            pendingDetachFlushScheduled = false;
            scheduleMicrotaskDetachFlush();
        };
        const schedulePendingDetachFlush = (): void => {
            scheduleFrameSettledDetachFlush();
        };
        const markDetachedTreePending = (root: unknown, reason: unknown): void => {
            if (!root || hasReparentGuard(root))
                return;
            const windows: unknown[] = [];
            collectWindowTree(root, windows);
            windows.forEach((windowInstance) => {
                if (!getRegisteredWindowData(windowInstance))
                    return;
                pendingDetachToken += 1;
                setPendingDetachState(windowInstance, {
                    token: pendingDetachToken,
                    root,
                    reason: truthyOr(reason, () => lifecycleReasons.WINDOW_DETACHED),
                });
                pendingDetachedWindows.add(windowInstance);
            });
            if (pendingDetachedWindows.size > 0)
                schedulePendingDetachFlush();
        };
        const clearPendingDetachedTree = (root: unknown): void => {
            if (!root)
                return;
            const windows: unknown[] = [];
            collectWindowTree(root, windows);
            windows.forEach(clearPendingDetachedWindow);
        };
        const retireWindowTree = (root: unknown, reason: unknown): void => {
            if (!root)
                return;
            const windows: unknown[] = [];
            collectWindowTree(root, windows);
            windows.forEach((windowInstance) => {
                if (!getRegisteredWindowData(windowInstance))
                    return;
                clearPendingDetachedWindow(windowInstance);
                unregisterWindowSafely(windowInstance, truthyOr(reason, () => lifecycleReasons.WINDOW_UNREGISTERED));
            });
        };
        const installSceneTerminationHooks = (): boolean => {
            const SceneBase = truthyOr(propertyValue(globalScope, 'Scene_Base'), () => null);
            const prototype = SceneBase && propertyValue(SceneBase, 'prototype') ? propertyValue(SceneBase, 'prototype') : null;
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'terminate')))
                return false;
            if (invokeUnbound(hasHookInChain, [
                propertyValue(prototype, 'terminate'),
                '__trWindowRegistrySceneTerminateWrapped',
                true,
            ])) {
                return true;
            }
            const originalTerminate = propertyValue(prototype, 'terminate');
            const wrappedTerminate = function (this: unknown, ...args: unknown[]): unknown {
                let result: unknown;
                try {
                    result = invokeApplyBoundary(originalTerminate, this, args);
                }
                finally {
                    retireWindowTree(this, lifecycleReasons.SCENE_TERMINATED);
                }
                return result;
            };
            setProperty(prototype, 'terminate', wrappedTerminate);
            setProperty(propertyValue(prototype, 'terminate'), '__trWindowRegistrySceneTerminateWrapped', true);
            setProperty(propertyValue(prototype, 'terminate'), '__trOriginal', originalTerminate);
            return true;
        };
        const installSceneManagerChangeHooks = (): boolean => {
            const sceneManager = truthyOr(propertyValue(globalScope, 'SceneManager'), () => null);
            if (!sceneManager || !isRuntimeFunction(propertyValue(sceneManager, 'changeScene')))
                return false;
            if (invokeUnbound(hasHookInChain, [
                propertyValue(sceneManager, 'changeScene'),
                '__trWindowRegistrySceneManagerChangeWrapped',
                true,
            ])) {
                return true;
            }
            const originalChangeScene = propertyValue(sceneManager, 'changeScene');
            const wrappedChangeScene = function (this: unknown, ...args: unknown[]): unknown {
                const previousScene = truthyOr(this && propertyValue(this, '_scene'), () => null);
                const result = invokeApplyBoundary(originalChangeScene, this, args);
                const currentScene = truthyOr(this && propertyValue(this, '_scene'), () => null);
                if (previousScene && previousScene !== currentScene) {
                    retireWindowTree(previousScene, lifecycleReasons.SCENE_TERMINATED);
                }
                return result;
            };
            setProperty(sceneManager, 'changeScene', wrappedChangeScene);
            setProperty(propertyValue(sceneManager, 'changeScene'), '__trWindowRegistrySceneManagerChangeWrapped', true);
            setProperty(propertyValue(sceneManager, 'changeScene'), '__trOriginal', originalChangeScene);
            return true;
        };
        const installFrameSettledDetachHooks = (): boolean => {
            if (frameSettledDetachHooksInstalled)
                return true;
            let installed = false;
            const sceneManager = truthyOr(propertyValue(globalScope, 'SceneManager'), () => null);
            const graphics = truthyOr(propertyValue(globalScope, 'Graphics'), () => null);
            try {
                installed = installFrameSettledDetachHook(sceneManager, 'updateScene') || installed;
            }
            catch {
            }
            try {
                installed = installFrameSettledDetachHook(sceneManager, 'updateMain') || installed;
            }
            catch {
            }
            try {
                installed = installFrameSettledDetachHook(graphics, 'render') || installed;
            }
            catch {
            }
            frameSettledDetachHooksInstalled = installed;
            return installed;
        };
        const installFrameSettledDetachHook = (target: unknown, methodName: string): boolean => {
            if (!target || !isRuntimeFunction(propertyValue(target, methodName)))
                return false;
            if (invokeUnbound(hasHookInChain, [
                propertyValue(target, methodName),
                '__trWindowRegistryFrameSettledDetachWrapped',
                FRAME_SETTLED_DETACH_TOKEN,
            ])) {
                return true;
            }
            const original = propertyValue(target, methodName);
            const wrapped = function (this: unknown, ...args: unknown[]): unknown {
                let result: unknown;
                try {
                    result = invokeApplyBoundary(original, this, args);
                }
                finally {
                    flushPendingDetachedWindowsAtFrameBoundary();
                }
                return result;
            };
            setProperty(target, methodName, wrapped);
            setProperty(propertyValue(target, methodName), '__trWindowRegistryFrameSettledDetachWrapped', FRAME_SETTLED_DETACH_TOKEN);
            setProperty(propertyValue(target, methodName), '__trOriginal', original);
            return true;
        };
        const installWindowDisplayRemovalHooks = (): boolean => {
            const pixi = truthyOr(propertyValue(globalScope, 'PIXI'), () => null);
            const Container = pixi && propertyValue(pixi, 'Container') ? propertyValue(pixi, 'Container') : null;
            const prototype = Container && propertyValue(Container, 'prototype') ? propertyValue(Container, 'prototype') : null;
            if (!prototype)
                return false;
            const markMovingChildren = (children: unknown[], targetParent: unknown): unknown[] => {
                const moving: unknown[] = [];
                children.forEach((child) => {
                    if (child && propertyValue(child, 'parent') && propertyValue(child, 'parent') !== targetParent) {
                        moving.push(child);
                        setReparentGuard(child, 1);
                    }
                });
                return moving;
            };
            const unmarkMovingChildren = (children: unknown[], targetParent: unknown): void => {
                children.forEach((child) => {
                    setReparentGuard(child, -1);
                    if (child && propertyValue(child, 'parent') === targetParent) {
                        clearPendingDetachedTree(child);
                    }
                    else if (child) {
                        markDetachedTreePending(child, lifecycleReasons.WINDOW_DETACHED);
                    }
                });
            };
            const wrapAddMethod = (methodName: string): void => {
                const original = propertyValue(prototype, methodName);
                if (!isRuntimeFunction(original))
                    return;
                const property = `__trWindowRegistry${methodName}Wrapped`;
                if (invokeUnbound(hasHookInChain, [original, property, true]))
                    return;
                const wrapped = function (this: unknown, ...args: unknown[]): unknown {
                    const children = methodName === 'addChildAt' ? [args[0]] : args;
                    const moving = markMovingChildren(children, this);
                    try {
                        return invokeApplyBoundary(original, this, args);
                    }
                    finally {
                        unmarkMovingChildren(moving, this);
                        children.forEach((child) => {
                            if (child && propertyValue(child, 'parent') === this) {
                                clearPendingDetachedTree(child);
                                markAttachedTree(child);
                            }
                        });
                    }
                };
                setProperty(prototype, methodName, wrapped);
                setProperty(propertyValue(prototype, methodName), property, true);
                setProperty(propertyValue(prototype, methodName), '__trOriginal', original);
            };
            const wrapRemoveChild = (): void => {
                const original = propertyValue(prototype, 'removeChild');
                if (!isRuntimeFunction(original))
                    return;
                if (invokeUnbound(hasHookInChain, [original, '__trWindowRegistryRemoveChildWrapped', true])) {
                    return;
                }
                const wrapped = function (this: unknown, ...children: unknown[]): unknown {
                    const result = invokeApplyBoundary(original, this, children);
                    if (hasDestroyGuard(this))
                        return result;
                    children.forEach((child) => {
                        if (child && propertyValue(child, 'parent') !== this) {
                            markDetachedTreePending(child, lifecycleReasons.WINDOW_DETACHED);
                        }
                    });
                    return result;
                };
                setProperty(prototype, 'removeChild', wrapped);
                setProperty(propertyValue(prototype, 'removeChild'), '__trWindowRegistryRemoveChildWrapped', true);
                setProperty(propertyValue(prototype, 'removeChild'), '__trOriginal', original);
            };
            const wrapRemoveChildAt = (): void => {
                const original = propertyValue(prototype, 'removeChildAt');
                if (!isRuntimeFunction(original))
                    return;
                if (invokeUnbound(hasHookInChain, [original, '__trWindowRegistryRemoveChildAtWrapped', true])) {
                    return;
                }
                const wrapped = function (this: unknown, index: unknown, ...rest: unknown[]): unknown {
                    const child = Array.isArray(propertyValue(this, 'children'))
                        ? memberValue(propertyValue(this, 'children'), propertyKeyValue(index))
                        : null;
                    const result = invokeCallBoundary(original, this, [index, ...rest]);
                    if (!hasDestroyGuard(this)) {
                        markDetachedTreePending(truthyOr(result, () => child), lifecycleReasons.WINDOW_DETACHED);
                    }
                    return result;
                };
                setProperty(prototype, 'removeChildAt', wrapped);
                setProperty(propertyValue(prototype, 'removeChildAt'), '__trWindowRegistryRemoveChildAtWrapped', true);
                setProperty(propertyValue(prototype, 'removeChildAt'), '__trOriginal', original);
            };
            const wrapRemoveChildren = (): void => {
                const original = propertyValue(prototype, 'removeChildren');
                if (!isRuntimeFunction(original))
                    return;
                if (invokeUnbound(hasHookInChain, [original, '__trWindowRegistryRemoveChildrenWrapped', true])) {
                    return;
                }
                const wrapped = function (this: unknown, beginIndex: unknown, endIndex: unknown, ...rest: unknown[]): unknown {
                    const children = Array.isArray(propertyValue(this, 'children'))
                        ? propertyValue(this, 'children')
                        : [];
                    const start = Number.isFinite(numberValue(beginIndex)) ? numberValue(beginIndex) : 0;
                    const end = Number.isFinite(numberValue(endIndex))
                        ? numberValue(endIndex)
                        : memberValue(children, 'length');
                    const before = invokeMethod(children, 'slice', [start, end]);
                    const result = invokeCallBoundary(original, this, [beginIndex, endIndex, ...rest]);
                    if (!hasDestroyGuard(this)) {
                        const removed = Array.isArray(result) && result.length > 0 ? result : before;
                        invokeMethod(removed, 'forEach', [
                            (child: unknown): void => {
                                markDetachedTreePending(child, lifecycleReasons.WINDOW_DETACHED);
                            },
                        ]);
                    }
                    return result;
                };
                setProperty(prototype, 'removeChildren', wrapped);
                setProperty(propertyValue(prototype, 'removeChildren'), '__trWindowRegistryRemoveChildrenWrapped', true);
                setProperty(propertyValue(prototype, 'removeChildren'), '__trOriginal', original);
            };
            const wrapDestroy = (): void => {
                const original = propertyValue(prototype, 'destroy');
                if (!isRuntimeFunction(original))
                    return;
                if (invokeUnbound(hasHookInChain, [original, '__trWindowRegistryDestroyWrapped', true])) {
                    return;
                }
                const wrapped = function (this: unknown, ...args: unknown[]): unknown {
                    const windows: unknown[] = [];
                    collectWindowTree(this, windows);
                    setDestroyGuard(this, 1);
                    try {
                        return invokeApplyBoundary(original, this, args);
                    }
                    finally {
                        setDestroyGuard(this, -1);
                        windows.forEach((windowInstance) => {
                            clearPendingDetachedWindow(windowInstance);
                            unregisterWindowSafely(windowInstance, lifecycleReasons.WINDOW_DESTROYED);
                        });
                    }
                };
                setProperty(prototype, 'destroy', wrapped);
                setProperty(propertyValue(prototype, 'destroy'), '__trWindowRegistryDestroyWrapped', true);
                setProperty(propertyValue(prototype, 'destroy'), '__trOriginal', original);
            };
            wrapAddMethod('addChild');
            wrapAddMethod('addChildAt');
            wrapRemoveChild();
            wrapRemoveChildAt();
            wrapRemoveChildren();
            wrapDestroy();
            installSceneTerminationHooks();
            installSceneManagerChangeHooks();
            installFrameSettledDetachHooks();
            return true;
        };
        return installWindowDisplayRemovalHooks();
    }
    return {
        install: installWindowDisplayRemovalHookGroup,
    };
}
