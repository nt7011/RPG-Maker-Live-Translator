import type { ConversionScopeModule } from '../../runtime/conversion-scope.js';
import type { EntryLifecycleModule } from '../../runtime/entry-lifecycle.js';
import type { WindowBaseLifecycleStateModule } from './base-lifecycle-state.js';
import type { WindowDisplayRemovalModule } from './display-removal.js';
import type { WindowLifecycleHelpersModule } from './lifecycle-helpers.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
export interface WindowBaseLifecycleHooksModule {
    readonly install: (context: unknown) => unknown;
}
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
        throw new TypeError(`Cannot read window lifecycle property ${String(key)}.`);
    }
    if (isPropertyBag(value))
        return value[key];
    const boxed: unknown = Reflect.apply(Object, undefined, [value]);
    if (!isPropertyBag(boxed)) {
        throw new TypeError(`Cannot box window lifecycle property owner ${String(key)}.`);
    }
    return boxed[key];
}
function setProperty(target: unknown, key: PropertyKey, value: unknown): void {
    if (!isPropertyBag(target)) {
        throw new TypeError(`Window lifecycle target cannot receive ${String(key)}.`);
    }
    target[key] = value;
}
function invokeMethod(target: unknown, methodName: PropertyKey, args: readonly unknown[]): unknown {
    const method = memberValue(target, methodName);
    if (!isRuntimeFunction(method)) {
        throw new TypeError(`Window lifecycle method ${String(methodName)} is not callable.`);
    }
    return Reflect.apply(method, target, args);
}
function invokeUnbound(callback: RuntimeFunction, args: readonly unknown[]): unknown {
    return Reflect.apply(callback, undefined, args);
}
function invokeApplyBoundary(callback: unknown, receiver: unknown, args: readonly unknown[]): unknown {
    return invokeMethod(callback, 'apply', [receiver, args]);
}
function destructurableContext(value: unknown): PropertyBag {
    if (value === null || value === undefined) {
        throw new TypeError('Window base lifecycle context cannot be null or undefined.');
    }
    if (isPropertyBag(value))
        return value;
    const boxed: unknown = Reflect.apply(Object, undefined, [value]);
    if (isPropertyBag(boxed))
        return boxed;
    throw new TypeError('Window base lifecycle context is not property-readable.');
}
function defaultWhenUndefined(value: unknown, fallback: unknown): unknown {
    return value === undefined ? fallback : value;
}
function truthyOr<Value, Fallback>(value: Value, fallback: () => Fallback): Value | Fallback {
    if (value)
        return value;
    return fallback();
}
function stringValue(value: unknown): string {
    const converted: unknown = Reflect.apply(String, undefined, [value]);
    if (typeof converted !== 'string')
        throw new TypeError('String conversion did not return text.');
    return converted;
}
function propertyKeyValue(value: unknown): PropertyKey {
    return typeof value === 'symbol' ? value : stringValue(value);
}
function resolveRuntimeScope(context: PropertyBag, defaultScope: unknown): unknown {
    const environment = propertyValue(context, 'environment');
    if (!isPropertyBag(environment))
        return defaultScope;
    const scopeOverride = environment['scope'];
    return scopeOverride === undefined ? defaultScope : scopeOverride;
}
export function createWindowBaseLifecycleModule(windowLifecycleHelpers: WindowLifecycleHelpersModule, windowDisplayRemovalHooks: WindowDisplayRemovalModule, windowBaseLifecycleState: WindowBaseLifecycleStateModule, entryLifecycle: EntryLifecycleModule, conversionScope: ConversionScopeModule | null, runtimeScope: unknown): WindowBaseLifecycleHooksModule {
    const { hasHookInChain } = windowLifecycleHelpers;
    function installWindowBaseLifecycleHooks(context: unknown): void {
        const source = destructurableContext(context);
        const logger = source['logger'];
        const windowRegistry = source['windowRegistry'];
        const addWindowToRegistry = source['addWindowToRegistry'];
        const ensureWindowRegistered = source['ensureWindowRegistered'];
        const registerWindowLifecyclePrototypeInstaller = defaultWhenUndefined(source['registerWindowLifecyclePrototypeInstaller'], null);
        const unregisterWindow = source['unregisterWindow'];
        const activeScope = resolveRuntimeScope(source, runtimeScope);
        const lifecycleState = windowBaseLifecycleState.create(context);
        const { createWindowData, isWindowEntryActive, isWindowEntryCompleted, retireWindowEntry, rejectWindowPendingRender, forgetWindowEntryRecord, syncWindowTextScreenState, commitPendingWindowEntryStaleRecords, withWindowRefreshSession, unregisterWindowSafely, flushWindowRenderReadinessSchedule, } = lifecycleState;
        const windowUpdateDepths = new WeakMap<object, number>();
        const admitWindowBeforeNativeMutation = (windowInstance: unknown, hookName: string): unknown => {
            try {
                const existing = invokeMethod(windowRegistry, 'get', [windowInstance]);
                const selectedContents = propertyValue(windowInstance, 'contents');
                if (existing && propertyValue(existing, 'selectedContentsBitmap') === selectedContents) {
                    return existing;
                }
                if (!isRuntimeFunction(ensureWindowRegistered)) {
                    throw new TypeError('Window lifecycle registration callback is not callable.');
                }
                return invokeUnbound(ensureWindowRegistered, [windowInstance]);
            }
            catch (error) {
                logError(logger, `[${hookName} Registration Error]`, error);
                return null;
            }
        };
        const wrapWindowRefreshPrototype = (prototype: unknown): boolean => {
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'refresh')))
                return false;
            if (hasHookInChain(propertyValue(prototype, 'refresh'), '__trWindowRefreshWrapped', true)) {
                return true;
            }
            const originalRefresh = propertyValue(prototype, 'refresh');
            const wrappedRefresh = function (this: unknown, ...args: unknown[]): unknown {
                const routed = routeWindowConversionMutation(this, 'refresh', args);
                if (routed)
                    return propertyValue(routed, 'result');
                admitWindowBeforeNativeMutation(this, 'Window.refresh');
                return withWindowRefreshSession(this, () => invokeApplyBoundary(originalRefresh, this, args));
            };
            setProperty(prototype, 'refresh', wrappedRefresh);
            setProperty(propertyValue(prototype, 'refresh'), '__trWindowRefreshWrapped', true);
            setProperty(propertyValue(prototype, 'refresh'), '__trOriginal', originalRefresh);
            return true;
        };
        const wrapWindowOpenPrototype = (prototype: unknown): boolean => {
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'open')))
                return false;
            if (hasHookInChain(propertyValue(prototype, 'open'), '__trWindowLifecycleWrapped', true)) {
                return true;
            }
            const originalWindowOpen = propertyValue(prototype, 'open');
            const wrappedOpen = function (this: unknown, ...args: unknown[]): unknown {
                const routed = routeWindowConversionMutation(this, 'open', args);
                if (routed)
                    return propertyValue(routed, 'result');
                const existing = invokeMethod(windowRegistry, 'get', [this]);
                const data = truthyOr(existing, () => createWindowData(this, true));
                setProperty(data, 'isOpen', true);
                if (!propertyValue(data, 'renderReadinessSchedule')) {
                    setProperty(data, 'renderReadinessSchedule', new Map());
                }
                if (!isRuntimeFunction(addWindowToRegistry)) {
                    throw new TypeError('Window lifecycle registry callback is not callable.');
                }
                invokeUnbound(addWindowToRegistry, [this, data]);
                const result = invokeApplyBoundary(originalWindowOpen, this, args);
                syncWindowTextScreenState(this, 'window-opened');
                return result;
            };
            setProperty(prototype, 'open', wrappedOpen);
            setProperty(propertyValue(prototype, 'open'), '__trWindowLifecycleWrapped', true);
            setProperty(propertyValue(prototype, 'open'), '__trOriginal', originalWindowOpen);
            return true;
        };
        const wrapWindowClosePrototype = (prototype: unknown): boolean => {
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'close')))
                return false;
            if (hasHookInChain(propertyValue(prototype, 'close'), '__trWindowLifecycleWrapped', true)) {
                return true;
            }
            const originalWindowClose = propertyValue(prototype, 'close');
            const wrappedClose = function (this: unknown, ...args: unknown[]): unknown {
                const routed = routeWindowConversionMutation(this, 'close', args);
                if (routed)
                    return propertyValue(routed, 'result');
                const existing = invokeMethod(windowRegistry, 'get', [this]);
                const data = truthyOr(existing, () => createWindowData(this, false));
                setProperty(data, 'isOpen', false);
                const texts = propertyValue(data, 'texts');
                if (texts && isRuntimeFunction(memberValue(texts, 'forEach'))) {
                    const entries: unknown[] = [];
                    try {
                        invokeMethod(texts, 'forEach', [(entry: unknown): void => void entries.push(entry)]);
                    }
                    catch {
                    }
                    try {
                        invokeMethod(texts, 'clear', []);
                    }
                    catch {
                    }
                    let windowType: unknown = '';
                    try {
                        windowType = truthyOr(propertyValue(data, 'windowType'), () => this && propertyValue(this, 'constructor')
                            ? memberValue(propertyValue(this, 'constructor'), 'name')
                            : '');
                    }
                    catch {
                    }
                    for (const entry of entries) {
                        let hasRecord = false;
                        try {
                            hasRecord = Boolean(entry && propertyValue(entry, 'recordId'));
                        }
                        catch {
                        }
                        if (!hasRecord)
                            continue;
                        const entryDetails = { windowType };
                        try {
                            entryLifecycle.markStale(entry, 'window-closed', {
                                surfaceVisible: false,
                                screenState: 'hidden',
                            });
                        }
                        catch {
                        }
                        try {
                            rejectWindowPendingRender(entry, 'window-closed', entryDetails);
                        }
                        catch {
                        }
                        try {
                            if (isWindowEntryActive(entry)) {
                                let wasCompleted = false;
                                try {
                                    wasCompleted = isWindowEntryCompleted(entry);
                                }
                                catch {
                                }
                                retireWindowEntry(entry, 'window-closed', Object.assign({}, entryDetails, { wasCompleted }), { policy: { kind: 'retired' } });
                            }
                        }
                        catch {
                        }
                        try {
                            forgetWindowEntryRecord(entry, 'window-closed', entryDetails);
                        }
                        catch {
                        }
                        try {
                            entryLifecycle.setSurfaceVisible(entry, false, {
                                reason: 'window-closed',
                                screenState: 'hidden',
                            });
                        }
                        catch {
                        }
                    }
                }
                if (!propertyValue(data, 'renderReadinessSchedule')) {
                    setProperty(data, 'renderReadinessSchedule', new Map());
                }
                try {
                    invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'clear', []);
                }
                catch {
                }
                invokeMethod(windowRegistry, 'set', [this, data]);
                return invokeApplyBoundary(originalWindowClose, this, args);
            };
            setProperty(prototype, 'close', wrappedClose);
            setProperty(propertyValue(prototype, 'close'), '__trWindowLifecycleWrapped', true);
            setProperty(propertyValue(prototype, 'close'), '__trOriginal', originalWindowClose);
            return true;
        };
        const wrapWindowDestroyPrototype = (prototype: unknown): boolean => {
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'destroy')))
                return false;
            if (hasHookInChain(propertyValue(prototype, 'destroy'), '__trWindowLifecycleWrapped', true)) {
                return true;
            }
            const originalWindowDestroy = propertyValue(prototype, 'destroy');
            const wrappedDestroy = function (this: unknown, ...args: unknown[]): unknown {
                unregisterWindowSafely(this, 'window-destroyed');
                return invokeApplyBoundary(originalWindowDestroy, this, args);
            };
            setProperty(prototype, 'destroy', wrappedDestroy);
            setProperty(propertyValue(prototype, 'destroy'), '__trWindowLifecycleWrapped', true);
            setProperty(propertyValue(prototype, 'destroy'), '__trOriginal', originalWindowDestroy);
            return true;
        };
        const wrapWindowHidePrototype = (prototype: unknown): boolean => {
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'hide')))
                return false;
            if (hasHookInChain(propertyValue(prototype, 'hide'), '__trWindowLifecycleWrapped', true)) {
                return true;
            }
            const originalWindowHide = propertyValue(prototype, 'hide');
            const wrappedHide = function (this: unknown, ...args: unknown[]): unknown {
                const routed = routeWindowConversionMutation(this, 'hide', args);
                if (routed)
                    return propertyValue(routed, 'result');
                const result = invokeApplyBoundary(originalWindowHide, this, args);
                syncWindowTextScreenState(this, 'window-hidden');
                return result;
            };
            setProperty(prototype, 'hide', wrappedHide);
            setProperty(propertyValue(prototype, 'hide'), '__trWindowLifecycleWrapped', true);
            setProperty(propertyValue(prototype, 'hide'), '__trOriginal', originalWindowHide);
            return true;
        };
        const wrapWindowShowPrototype = (prototype: unknown): boolean => {
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'show')))
                return false;
            if (hasHookInChain(propertyValue(prototype, 'show'), '__trWindowLifecycleWrapped', true)) {
                return true;
            }
            const originalWindowShow = propertyValue(prototype, 'show');
            const wrappedShow = function (this: unknown, ...args: unknown[]): unknown {
                const routed = routeWindowConversionMutation(this, 'show', args);
                if (routed)
                    return propertyValue(routed, 'result');
                const result = invokeApplyBoundary(originalWindowShow, this, args);
                syncWindowTextScreenState(this, 'window-shown');
                return result;
            };
            setProperty(prototype, 'show', wrappedShow);
            setProperty(propertyValue(prototype, 'show'), '__trWindowLifecycleWrapped', true);
            setProperty(propertyValue(prototype, 'show'), '__trOriginal', originalWindowShow);
            return true;
        };
        const wrapWindowCreateContentsPrototype = (prototype: unknown): boolean => {
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'createContents'))) {
                return false;
            }
            if (hasHookInChain(propertyValue(prototype, 'createContents'), '__trWindowLifecycleWrapped', true)) {
                return true;
            }
            const originalCreateContents = propertyValue(prototype, 'createContents');
            const wrappedCreateContents = function (this: unknown, ...args: unknown[]): unknown {
                const routed = routeWindowConversionMutation(this, 'createContents', args);
                if (routed)
                    return propertyValue(routed, 'result');
                admitWindowBeforeNativeMutation(this, 'Window_Base.createContents');
                return withWindowRefreshSession(this, () => {
                    try {
                        return invokeApplyBoundary(originalCreateContents, this, args);
                    }
                    finally {
                        admitWindowBeforeNativeMutation(this, 'Window_Base.createContents');
                    }
                });
            };
            setProperty(prototype, 'createContents', wrappedCreateContents);
            setProperty(propertyValue(prototype, 'createContents'), '__trWindowLifecycleWrapped', true);
            setProperty(propertyValue(prototype, 'createContents'), '__trOriginal', originalCreateContents);
            return true;
        };
        const wrapWindowConversionOnlyPrototype = (prototype: unknown, methodName: unknown): boolean => {
            if (!prototype || !methodName)
                return false;
            const methodKey = propertyKeyValue(methodName);
            if (!isRuntimeFunction(propertyValue(prototype, methodKey)))
                return false;
            if (hasHookInChain(propertyValue(prototype, methodKey), '__trWindowConversionRouter', true)) {
                return true;
            }
            const original = propertyValue(prototype, methodKey);
            const wrapped = createWindowConversionRouter(methodName, original);
            setProperty(prototype, methodKey, wrapped);
            setProperty(propertyValue(prototype, methodKey), '__trWindowConversionRouter', true);
            setProperty(propertyValue(prototype, methodKey), '__trOriginal', original);
            return true;
        };
        const wrapWindowUpdatePrototype = (prototype: unknown): boolean => {
            if (!prototype || !isRuntimeFunction(propertyValue(prototype, 'update')))
                return false;
            if (hasHookInChain(propertyValue(prototype, 'update'), '__trWindowLifecycleWrapped', true)) {
                return true;
            }
            const originalWindowUpdate = propertyValue(prototype, 'update');
            const wrappedUpdate = function (this: unknown, ...args: unknown[]): unknown {
                const trackedWindow = isPropertyBag(this) ? this : null;
                const currentDepth = trackedWindow ? (windowUpdateDepths.get(trackedWindow) ?? 0) : 0;
                if (trackedWindow)
                    windowUpdateDepths.set(trackedWindow, currentDepth + 1);
                try {
                    const result = invokeApplyBoundary(originalWindowUpdate, this, args);
                    if (currentDepth === 0) {
                        try {
                            commitPendingWindowEntryStaleRecords(this, invokeMethod(windowRegistry, 'get', [this]), 'window-update-commit');
                            flushWindowRenderReadinessSchedule(this, 'window-update');
                            syncWindowTextScreenState(this, 'window-update');
                        }
                        catch (error) {
                            logError(logger, '[Window_Base.update Hook Error]', error);
                        }
                    }
                    return result;
                }
                finally {
                    if (trackedWindow) {
                        if (currentDepth > 0)
                            windowUpdateDepths.set(trackedWindow, currentDepth);
                        else
                            windowUpdateDepths.delete(trackedWindow);
                    }
                }
            };
            setProperty(prototype, 'update', wrappedUpdate);
            setProperty(propertyValue(prototype, 'update'), '__trWindowLifecycleWrapped', true);
            setProperty(propertyValue(prototype, 'update'), '__trOriginal', originalWindowUpdate);
            return true;
        };
        const wrapWindowLifecyclePrototype = (prototype: unknown): boolean => {
            if (!prototype)
                return false;
            let wrapped = false;
            wrapped = wrapWindowRefreshPrototype(prototype) || wrapped;
            wrapped = wrapWindowOpenPrototype(prototype) || wrapped;
            wrapped = wrapWindowClosePrototype(prototype) || wrapped;
            wrapped = wrapWindowDestroyPrototype(prototype) || wrapped;
            wrapped = wrapWindowHidePrototype(prototype) || wrapped;
            wrapped = wrapWindowShowPrototype(prototype) || wrapped;
            wrapped = wrapWindowCreateContentsPrototype(prototype) || wrapped;
            wrapped = wrapWindowUpdatePrototype(prototype) || wrapped;
            wrapped = wrapWindowConversionOnlyPrototype(prototype, 'setText') || wrapped;
            wrapped = wrapWindowConversionOnlyPrototype(prototype, 'activate') || wrapped;
            wrapped = wrapWindowConversionOnlyPrototype(prototype, 'deactivate') || wrapped;
            wrapped = wrapWindowConversionOnlyPrototype(prototype, 'setBackgroundType') || wrapped;
            return wrapped;
        };
        const installWindowRefreshHooks = (): void => {
            const seen = new Set<unknown>();
            const wrapConstructor = (constructorValue: unknown): void => {
                if (!constructorValue ||
                    !isRuntimeFunction(constructorValue) ||
                    !propertyValue(constructorValue, 'prototype')) {
                    return;
                }
                const prototype = propertyValue(constructorValue, 'prototype');
                if (seen.has(prototype))
                    return;
                seen.add(prototype);
                wrapWindowLifecyclePrototype(prototype);
            };
            const WindowBase = activeScope && propertyValue(activeScope, 'Window_Base');
            wrapConstructor(WindowBase);
            try {
                const names: unknown = Reflect.apply(Object.getOwnPropertyNames, Object, [activeScope]);
                if (!Array.isArray(names))
                    return;
                names.forEach((key: unknown) => {
                    if (typeof key !== 'string' || !invokeMethod(/^Window_/u, 'test', [key])) {
                        return;
                    }
                    wrapConstructor(propertyValue(activeScope, key));
                });
            }
            catch {
            }
        };
        installWindowRefreshHooks();
        if (isRuntimeFunction(registerWindowLifecyclePrototypeInstaller)) {
            invokeUnbound(registerWindowLifecyclePrototypeInstaller, [
                (windowInstance: unknown): boolean => {
                    if (!windowInstance || typeof windowInstance !== 'object')
                        return false;
                    const prototype: unknown = Reflect.apply(Object.getPrototypeOf, Object, [windowInstance]);
                    return wrapWindowLifecyclePrototype(prototype);
                },
            ]);
        }
        windowDisplayRemovalHooks.install({
            globalScope: activeScope,
            logger,
            windowRegistry,
            unregisterWindow,
            hasHookInChain,
        });
    }
    function routeWindowConversionMutation(receiver: unknown, methodName: unknown, args: unknown): unknown {
        try {
            return invokeMethod(conversionScope, 'tryRouteMutation', [
                receiver,
                methodName,
                truthyOr(args, () => null),
            ]);
        }
        catch {
            return null;
        }
    }
    function createWindowConversionRouter(methodName: unknown, original: unknown): RuntimeFunction {
        if (conversionScope && isRuntimeFunction(propertyValue(conversionScope, 'createMutationRouter'))) {
            const router = invokeMethod(conversionScope, 'createMutationRouter', [methodName, original]);
            if (isRuntimeFunction(router))
                return router;
        }
        return function (this: unknown, ...args: unknown[]): unknown {
            const routed = routeWindowConversionMutation(this, methodName, args);
            if (routed)
                return propertyValue(routed, 'result');
            return invokeApplyBoundary(original, this, args);
        };
    }
    function logError(logger: unknown, message: string, error: unknown): void {
        if (logger && isRuntimeFunction(propertyValue(logger, 'error'))) {
            try {
                invokeMethod(logger, 'error', [message, error]);
            }
            catch {
            }
        }
    }
    return {
        install: installWindowBaseLifecycleHooks,
    };
}
