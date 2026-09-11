import type { DisplayStateModule } from '../../runtime/display-state.js';
import { exactDataProperties } from '../../runtime/exact-data-property.js';
import type { EntryLifecycleModule } from '../../runtime/entry-lifecycle.js';
import { createWindowTextEntryStore, isWindowTextEntryStore } from '../../runtime/window-text-entry-store.js';
import type { WindowRefreshLease, WindowRefreshSettlementReceipt } from './refresh-session.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
interface PendingStaleRecord {
    readonly key: unknown;
    readonly entry: unknown;
    readonly pending: PropertyBag;
}
export interface WindowData extends PropertyBag {
    texts: Map<unknown, unknown>;
    isOpen: unknown;
    renderReadinessSchedule: Map<unknown, unknown>;
    _trRenderDrainDepth: number;
    _trRenderDrainReason: string;
    windowType: unknown;
}
export interface WindowBaseLifecycleStateHelpers {
    readonly createWindowData: typeof createWindowData;
    readonly isWindowEntryActive: (entry: unknown) => boolean;
    readonly isWindowEntryCompleted: (entry: unknown) => boolean;
    readonly retireWindowEntry: (entry: unknown, reason: unknown, details?: unknown, options?: unknown) => void;
    readonly setWindowDrawRecordVisible: (windowInstance: unknown, windowData: unknown, entry: unknown, visible: unknown, reason: unknown, screenState?: unknown) => void;
    readonly beginWindowRefresh: (windowInstance: unknown) => WindowRefreshLease | null;
    readonly settleWindowRefreshReturned: (lease: WindowRefreshLease, value: unknown) => WindowRefreshSettlementReceipt | null;
    readonly settleWindowRefreshThrew: (lease: WindowRefreshLease, error: unknown) => WindowRefreshSettlementReceipt | null;
    readonly rejectWindowPendingRender: (entry: unknown, reason: unknown, details?: unknown) => boolean;
    readonly forgetWindowEntryRecord: (entry: unknown, reason?: unknown, details?: unknown) => boolean;
    readonly getWindowScreenState: (windowInstance: unknown, data: unknown) => string;
    readonly syncWindowTextScreenState: (windowInstance: unknown, reason: unknown) => void;
    readonly commitPendingWindowEntryStaleRecords: (windowInstance: unknown, data: unknown, reason: unknown) => void;
    readonly withWindowRefreshSession: (windowInstance: unknown, callback: unknown) => unknown;
    readonly unregisterWindowSafely: (windowInstance: unknown, reason: unknown) => void;
    readonly flushWindowRenderReadinessSchedule: (windowInstance: unknown, reason?: unknown) => unknown;
}
export interface WindowBaseLifecycleStateModule {
    readonly create: (context?: unknown) => WindowBaseLifecycleStateHelpers;
    readonly createWindowData: typeof createWindowData;
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
function destructurableContext(value: unknown): PropertyBag {
    if (value === null || value === undefined) {
        throw new TypeError('Window lifecycle state context cannot be null or undefined.');
    }
    if (isPropertyBag(value))
        return value;
    const boxed: unknown = Reflect.apply(Object, undefined, [value]);
    if (isPropertyBag(boxed))
        return boxed;
    throw new TypeError('Window lifecycle state context is not property-readable.');
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
function interpolationStringValue(value: unknown): string {
    if (typeof value === 'symbol') {
        throw new TypeError('Cannot convert a Symbol value to a string.');
    }
    return stringValue(value);
}
function numberValue(value: unknown): number {
    const converted: unknown = Reflect.apply(Number, undefined, [value]);
    if (typeof converted !== 'number')
        throw new TypeError('Number conversion did not return a number.');
    return converted;
}
function hasOwn(target: unknown, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(target, key);
}
function readIteratorStep(iterator: unknown, nextMethod: RuntimeFunction): PropertyBag {
    const step = Reflect.apply(nextMethod, iterator, []);
    if (!isPropertyBag(step)) {
        throw new TypeError('Window lifecycle iterator result is not an object.');
    }
    return step;
}
function closeIterator(iterator: unknown): void {
    const returnMethod = propertyValue(iterator, 'return');
    if (returnMethod === undefined || returnMethod === null)
        return;
    if (!isRuntimeFunction(returnMethod)) {
        throw new TypeError('Window lifecycle iterator return method is not callable.');
    }
    const result = Reflect.apply(returnMethod, iterator, []);
    if (!isPropertyBag(result)) {
        throw new TypeError('Window lifecycle iterator return result is not an object.');
    }
}
function runtimeIterator(value: unknown): {
    iterator: unknown;
    nextMethod: RuntimeFunction;
} {
    const iteratorMethod = memberValue(value, Symbol.iterator);
    if (!isRuntimeFunction(iteratorMethod)) {
        throw new TypeError('Window lifecycle value is not iterable.');
    }
    const iterator = Reflect.apply(iteratorMethod, value, []);
    if (!isPropertyBag(iterator)) {
        throw new TypeError('Window lifecycle iterator is not an object.');
    }
    const nextMethod = propertyValue(iterator, 'next');
    if (!isRuntimeFunction(nextMethod)) {
        throw new TypeError('Window lifecycle iterator next method is not callable.');
    }
    return { iterator, nextMethod };
}
function readIterablePair(value: unknown): {
    key: unknown;
    queued: unknown;
} {
    const { iterator, nextMethod } = runtimeIterator(value);
    const first = readIteratorStep(iterator, nextMethod);
    if (propertyValue(first, 'done'))
        return { key: undefined, queued: undefined };
    const key = propertyValue(first, 'value');
    const second = readIteratorStep(iterator, nextMethod);
    if (propertyValue(second, 'done'))
        return { key, queued: undefined };
    const queued = propertyValue(second, 'value');
    closeIterator(iterator);
    return { key, queued };
}
function forEachRuntimeIterable(value: unknown, callback: (item: unknown) => void): void {
    const { iterator, nextMethod } = runtimeIterator(value);
    for (;;) {
        const step = readIteratorStep(iterator, nextMethod);
        if (propertyValue(step, 'done'))
            return;
        const item = propertyValue(step, 'value');
        try {
            callback(item);
        }
        catch (error) {
            try {
                closeIterator(iterator);
            }
            catch {
            }
            throw error;
        }
    }
}
function resolveDisplayScope(context: PropertyBag, defaultScope: unknown): unknown {
    const environment = propertyValue(context, 'environment');
    if (!isPropertyBag(environment))
        return defaultScope;
    const scopeOverride = environment['scope'];
    return scopeOverride === undefined ? defaultScope : scopeOverride;
}
function createWindowData(windowInstance: unknown, isOpen: unknown): WindowData {
    return exactDataProperties.createRecord({
        texts: createWindowTextEntryStore(),
        isOpen,
        renderReadinessSchedule: new Map(),
        _trRenderDrainDepth: 0,
        _trRenderDrainReason: '',
        windowType: windowInstance && propertyValue(windowInstance, 'constructor')
            ? memberValue(propertyValue(windowInstance, 'constructor'), 'name')
            : undefined,
    });
}
export function createWindowBaseLifecycleStateModule(displayStateModule: DisplayStateModule, entryLifecycle: EntryLifecycleModule, runtimeScope: unknown): WindowBaseLifecycleStateModule {
    function createLifecycleStateHelpers(context: unknown = {}): WindowBaseLifecycleStateHelpers {
        const source = destructurableContext(context);
        const logger = defaultWhenUndefined(source['logger'], {});
        const dbg = defaultWhenUndefined(source['dbg'], () => undefined);
        const windowRegistry = source['windowRegistry'];
        const unregisterWindow = source['unregisterWindow'];
        const getWindowTextHelpers = source['getWindowTextHelpers'];
        const getWindowDrawHelpers = source['getWindowDrawHelpers'];
        const windowLifecycle = source['windowLifecycle'];
        const debug: RuntimeFunction = isRuntimeFunction(dbg) ? dbg : () => undefined;
        const displayState = displayStateModule.createDisplayStateService(resolveDisplayScope(source, runtimeScope));
        function registryGet(windowInstance: unknown): unknown {
            return invokeMethod(windowRegistry, 'get', [windowInstance]);
        }
        function isWindowEntryActive(entry: unknown): boolean {
            return Boolean(entry &&
                propertyValue(entry, 'recordId') &&
                windowLifecycle &&
                isRuntimeFunction(propertyValue(windowLifecycle, 'isEntryActive')) &&
                invokeMethod(windowLifecycle, 'isEntryActive', [entry]));
        }
        function isWindowEntryCompleted(entry: unknown): boolean {
            return Boolean(entry &&
                propertyValue(entry, 'recordId') &&
                windowLifecycle &&
                isRuntimeFunction(propertyValue(windowLifecycle, 'isEntryCompleted')) &&
                invokeMethod(windowLifecycle, 'isEntryCompleted', [entry]));
        }
        function retireWindowEntry(entry: unknown, reason: unknown, details: unknown = null, options: unknown = {}): void {
            if (!isWindowEntryActive(entry))
                return;
            try {
                if (windowLifecycle && isRuntimeFunction(propertyValue(windowLifecycle, 'retireEntry'))) {
                    invokeMethod(windowLifecycle, 'retireEntry', [
                        entry,
                        truthyOr(reason, () => 'window-disappeared'),
                        details,
                        options,
                    ]);
                }
            }
            catch {
            }
        }
        function setWindowDrawRecordVisible(windowInstance: unknown, windowData: unknown, entry: unknown, visible: unknown, reason: unknown, screenState: unknown = null): void {
            if (!isWindowEntryActive(entry))
                return;
            const windowType = getWindowType(windowInstance, windowData);
            const resolvedScreenState = visible ? 'visible' : stringValue(truthyOr(screenState, () => '')) || 'hidden';
            try {
                if (windowLifecycle && isRuntimeFunction(propertyValue(windowLifecycle, 'setEntryVisible'))) {
                    invokeMethod(windowLifecycle, 'setEntryVisible', [
                        entry,
                        visible === true,
                        {
                            reason: truthyOr(reason, () => (visible ? 'window-visible' : 'window-offscreen')),
                            screenState: resolvedScreenState,
                            windowType,
                        },
                    ]);
                }
                else {
                    entryLifecycle.setSurfaceVisible(entry, visible === true, {
                        reason: truthyOr(reason, () => (visible ? 'window-visible' : 'window-offscreen')),
                        screenState: resolvedScreenState,
                    });
                }
            }
            catch {
                entryLifecycle.setSurfaceVisible(entry, visible === true, {
                    reason: truthyOr(reason, () => (visible ? 'window-visible' : 'window-offscreen')),
                    screenState: resolvedScreenState,
                });
            }
        }
        function beginWindowRefresh(windowInstance: unknown): WindowRefreshLease | null {
            if (!windowInstance)
                return null;
            if (!windowLifecycle || !isRuntimeFunction(propertyValue(windowLifecycle, 'beginRefresh')))
                return null;
            const lease = invokeMethod(windowLifecycle, 'beginRefresh', [windowInstance, registryGet(windowInstance)]);
            return isPropertyBag(lease) ? (lease as unknown as WindowRefreshLease) : null;
        }
        function settleWindowRefresh(methodName: 'settleRefreshReturned' | 'settleRefreshThrew', lease: WindowRefreshLease, payload: unknown): WindowRefreshSettlementReceipt | null {
            if (!windowLifecycle || !isRuntimeFunction(propertyValue(windowLifecycle, methodName)))
                return null;
            try {
                const receipt = invokeMethod(windowLifecycle, methodName, [lease, payload]);
                if (isPropertyBag(receipt) && propertyValue(receipt, 'status') === 'participant-failed') {
                    warn('[Window_Base.refresh participant settlement failed]', null);
                }
                return isPropertyBag(receipt) ? (receipt as unknown as WindowRefreshSettlementReceipt) : null;
            }
            catch (error) {
                warn('[Window_Base.refresh settlement error]', error);
                return null;
            }
        }
        function settleWindowRefreshReturned(lease: WindowRefreshLease, value: unknown): WindowRefreshSettlementReceipt | null {
            return settleWindowRefresh('settleRefreshReturned', lease, value);
        }
        function settleWindowRefreshThrew(lease: WindowRefreshLease, error: unknown): WindowRefreshSettlementReceipt | null {
            return settleWindowRefresh('settleRefreshThrew', lease, error);
        }
        function isWindowRefreshActive(windowInstance: unknown): boolean {
            if (!windowInstance)
                return false;
            const data = registryGet(windowInstance);
            if (!windowLifecycle || !isRuntimeFunction(propertyValue(windowLifecycle, 'getRefreshState')))
                return false;
            try {
                const state = invokeMethod(windowLifecycle, 'getRefreshState', [windowInstance, data]);
                return Boolean(state && propertyValue(state, 'active') === true);
            }
            catch {
                return false;
            }
        }
        function resolveWindowTextHelpers(): unknown {
            const helperGetter = isRuntimeFunction(getWindowTextHelpers) ? getWindowTextHelpers : getWindowDrawHelpers;
            return isRuntimeFunction(helperGetter) ? invokeUnbound(helperGetter, []) : null;
        }
        function rejectWindowPendingRender(entry: unknown, reason: unknown, details: unknown = null): boolean {
            const windowTextHelpers = resolveWindowTextHelpers();
            if (windowTextHelpers && isRuntimeFunction(propertyValue(windowTextHelpers, 'rejectPendingRender'))) {
                try {
                    const result = invokeMethod(windowTextHelpers, 'rejectPendingRender', [entry, reason, details]);
                    return Boolean(result && propertyValue(result, 'handled') === true);
                }
                catch {
                }
            }
            return false;
        }
        function forgetWindowEntryRecord(entry: unknown, reason: unknown = 'window-entry-detached', details: unknown = null): boolean {
            const windowTextHelpers = resolveWindowTextHelpers();
            if (windowTextHelpers && isRuntimeFunction(propertyValue(windowTextHelpers, 'forgetEntryRecord'))) {
                try {
                    return invokeMethod(windowTextHelpers, 'forgetEntryRecord', [entry, reason, details]) === true;
                }
                catch {
                }
            }
            return false;
        }
        function getWindowScreenState(windowInstance: unknown, data: unknown): string {
            if (!windowInstance)
                return 'removed';
            const chainState = displayState.describeDisplayChain(windowInstance);
            if (chainState.state === 'inactive-scene')
                return 'inactive-scene';
            const visible = propertyValue(windowInstance, 'visible') !== false;
            const openness = numberValue(propertyValue(windowInstance, 'openness'));
            const hasOpenArea = Number.isFinite(openness)
                ? openness > 0
                : isRuntimeFunction(propertyValue(windowInstance, 'isOpen'))
                    ? Boolean(invokeMethod(windowInstance, 'isOpen', []))
                    : true;
            const contentsOpacity = numberValue(propertyValue(windowInstance, 'contentsOpacity'));
            const textOpacityVisible = !Number.isFinite(contentsOpacity) || contentsOpacity > 0;
            const isOpenState = data && hasOwn(data, 'isOpen') ? propertyValue(data, 'isOpen') !== false : true;
            if (!visible)
                return 'hidden';
            if (!hasOpenArea)
                return isOpenState ? 'opening' : 'closed';
            if (!isOpenState)
                return 'closed';
            if (!textOpacityVisible)
                return 'transparent';
            return 'visible';
        }
        function syncWindowTextScreenState(windowInstance: unknown, reason: unknown): void {
            const data = registryGet(windowInstance);
            if (!data)
                return;
            const screenState = getWindowScreenState(windowInstance, data);
            const previousScreenState = propertyValue(data, '_trLastScreenState');
            if (previousScreenState === screenState) {
                if (screenState !== 'visible' && shouldRetireOffscreenCompletedEntry(screenState)) {
                    retireCompletedWindowEntryWork(windowInstance, data, truthyOr(reason, () => `window-${screenState}`));
                }
                return;
            }
            if (screenState === 'visible') {
                markWindowEntriesVisible(windowInstance, data, truthyOr(reason, () => 'window-visible'));
                const store = propertyValue(data, 'texts');
                if (isWindowTextEntryStore(store))
                    store.clearCompletedEntries();
            }
            else {
                markWindowEntriesOffscreen(windowInstance, data, truthyOr(reason, () => `window-${screenState}`));
            }
            setProperty(data, '_trLastScreenState', screenState);
        }
        function commitPendingWindowEntryStaleRecords(windowInstance: unknown, data: unknown, reason: unknown): void {
            if (!data ||
                !propertyValue(data, 'texts') ||
                !isRuntimeFunction(memberValue(propertyValue(data, 'texts'), 'forEach'))) {
                return;
            }
            const windowType = getWindowType(windowInstance, data);
            const removed: PendingStaleRecord[] = [];
            const store = propertyValue(data, 'texts');
            const collectPending = (entry: unknown, key: unknown): void => {
                const pending = entryLifecycle.getPendingInvalidation(entry);
                if (!entry || !pending) {
                    if (isWindowTextEntryStore(store))
                        store.clearPendingInvalidation(entry);
                    return;
                }
                if (propertyValue(pending, 'reason') !== 'window-entry-stale')
                    return;
                if (isWindowTextEntryStore(store))
                    store.markPendingInvalidation(entry);
                removed.push({ key, entry, pending });
            };
            if (isWindowTextEntryStore(store) && store.pendingInvalidationWorkIsAuthoritative()) {
                const pendingEntries = store.pendingInvalidationEntries();
                for (const pendingEntry of pendingEntries) {
                    collectPending(pendingEntry.entry, pendingEntry.key);
                }
            }
            else {
                try {
                    invokeMethod(store, 'forEach', [collectPending]);
                }
                catch {
                }
                if (isWindowTextEntryStore(store))
                    store.sealPendingInvalidationWork();
            }
            removed.forEach(({ key, entry, pending }) => {
                try {
                    const staleReason = truthyOr(propertyValue(pending, 'sourceReason'), () => truthyOr(propertyValue(pending, 'reason'), () => truthyOr(reason, () => 'window-contents-invalidated')));
                    const entryDetails = {
                        key: stringValue(truthyOr(key, () => '')),
                        windowType,
                    };
                    entryLifecycle.markStale(entry, staleReason, {
                        at: truthyOr(propertyValue(pending, 'at'), () => Date.now()),
                        surfaceVisible: false,
                        screenState: 'hidden',
                    });
                    rejectWindowPendingRender(entry, staleReason, entryDetails);
                    if (isWindowEntryActive(entry)) {
                        retireWindowEntry(entry, staleReason, Object.assign({}, entryDetails, {
                            wasCompleted: isWindowEntryCompleted(entry),
                        }), {
                            policy: { kind: 'retired' },
                        });
                    }
                    forgetWindowEntryRecord(entry, staleReason, entryDetails);
                    entryLifecycle.setSurfaceVisible(entry, false, {
                        reason: staleReason,
                        screenState: 'hidden',
                    });
                }
                catch {
                }
                try {
                    invokeMethod(propertyValue(data, 'texts'), 'delete', [key]);
                }
                catch {
                }
                try {
                    if (propertyValue(data, 'renderReadinessSchedule') &&
                        isRuntimeFunction(memberValue(propertyValue(data, 'renderReadinessSchedule'), 'delete'))) {
                        invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'delete', [key]);
                    }
                }
                catch {
                }
            });
        }
        function withWindowRefreshSession(windowInstance: unknown, callback: unknown): unknown {
            if (!windowInstance || !isRuntimeFunction(callback))
                return undefined;
            const lease = beginWindowRefresh(windowInstance);
            if (!lease)
                return invokeUnbound(callback, []);
            try {
                const result = invokeUnbound(callback, []);
                finishWindowRefresh(settleWindowRefreshReturned(lease, result), windowInstance);
                return result;
            }
            catch (error) {
                finishWindowRefresh(settleWindowRefreshThrew(lease, error), windowInstance);
                throw error;
            }
        }
        function finishWindowRefresh(receipt: WindowRefreshSettlementReceipt | null, windowInstance: unknown): void {
            if (!receipt?.outermost || (receipt.status !== 'settled' && receipt.status !== 'settled-conservatively'))
                return;
            try {
                flushWindowRenderReadinessSchedule(windowInstance, 'window-refresh-complete');
            }
            catch (error) {
                warn('[Window_Base.refresh readiness flush failed]', error);
            }
        }
        function unregisterWindowSafely(windowInstance: unknown, reason: unknown): void {
            if (!windowInstance || !isRuntimeFunction(unregisterWindow))
                return;
            try {
                invokeUnbound(unregisterWindow, [windowInstance, truthyOr(reason, () => 'window-unregistered')]);
            }
            catch (error) {
                warn('[WindowLifecycle] Window unregister failed.', error);
            }
        }
        function flushWindowRenderReadinessSchedule(windowInstance: unknown, reason: unknown = 'window-update'): unknown {
            if (isWindowRefreshActive(windowInstance))
                return undefined;
            const data = registryGet(windowInstance);
            if (!data ||
                !propertyValue(data, 'renderReadinessSchedule') ||
                memberValue(propertyValue(data, 'renderReadinessSchedule'), 'size') === 0) {
                return undefined;
            }
            const ready = Boolean(windowInstance &&
                propertyValue(windowInstance, 'visible') &&
                (!isRuntimeFunction(propertyValue(windowInstance, 'isOpen')) ||
                    invokeMethod(windowInstance, 'isOpen', [])) &&
                propertyValue(windowInstance, 'contents'));
            if (!ready)
                return undefined;
            const flush = (): void => {
                const queuedRecords = invokeMethod(Reflect.apply(Array.from, Array, [
                    invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'entries', []),
                ]), 'sort', [compareQueuedRenderRecords]);
                forEachRuntimeIterable(queuedRecords, (record: unknown): void => {
                    const pair = readIterablePair(record);
                    const key = pair.key;
                    const queued = pair.queued;
                    if (invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'get', [key]) !== queued) {
                        return;
                    }
                    const entry = queued && propertyValue(queued, 'entry') ? propertyValue(queued, 'entry') : null;
                    if (!entry) {
                        invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'delete', [key]);
                        return;
                    }
                    const current = invokeMethod(propertyValue(data, 'texts'), 'get', [key]);
                    if (current !== entry) {
                        invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'delete', [key]);
                        rejectWindowPendingRender(entry, 'window-entry-replaced', {
                            key,
                            windowType: truthyOr(propertyValue(data, 'windowType'), () => ''),
                        });
                        invokeUnbound(debug, [`[Redraw Schedule Drop] replaced at ${interpolationStringValue(key)}`]);
                        return;
                    }
                    const pendingInvalidation = entryLifecycle.getPendingInvalidation(entry);
                    if (pendingInvalidation) {
                        invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'delete', [key]);
                        rejectWindowPendingRender(entry, 'window-redraw-invalidated', {
                            key,
                            reason: truthyOr(propertyValue(pendingInvalidation, 'reason'), () => ''),
                            windowType: truthyOr(propertyValue(data, 'windowType'), () => ''),
                        });
                        invokeUnbound(debug, [
                            `[Redraw Schedule Drop] pending invalidation at ${interpolationStringValue(key)}`,
                        ]);
                        return;
                    }
                    if (isWindowEntryCompleted(entry) && propertyValue(entry, 'renderedText')) {
                        if (deferRenderReadinessUntilNativeSourceDraw(data, key, queued, entry))
                            return;
                        const commandId = resolveQueuedRenderCommandId(queued, entry);
                        if (!commandId) {
                            invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'delete', [key]);
                            rejectWindowPendingRender(entry, 'render-command-id-required', {
                                key,
                                windowType: truthyOr(propertyValue(data, 'windowType'), () => ''),
                            });
                            invokeUnbound(debug, [
                                `[Redraw Schedule Drop] missing command at ${interpolationStringValue(key)}`,
                            ]);
                            return;
                        }
                        const commandGeneration = resolveQueuedRenderCommandGeneration(queued);
                        let result: unknown;
                        try {
                            result = notifyQueuedRenderCommandReady(queued, entry, data, key, reason);
                        }
                        catch (error) {
                            warn('[WindowLifecycle] Render readiness delivery failed.', error);
                            return;
                        }
                        const receipt = inspectRenderReadinessReceipt(result, commandId);
                        if (!receipt.settled)
                            return;
                        if (!deleteQueuedRenderCommandDeliveryIfCurrent(data, key, queued, entry, commandId, commandGeneration)) {
                            return;
                        }
                        if (receipt.changed || receipt.status === 'terminal-command')
                            return;
                        rejectWindowPendingRender(entry, 'render-command-wake-failed', {
                            key,
                            windowType: truthyOr(propertyValue(data, 'windowType'), () => ''),
                            commandId,
                            wakeStatus: receipt.status,
                            reason: receipt.reason,
                        });
                    }
                    else {
                        invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'delete', [key]);
                        rejectWindowPendingRender(entry, 'window-redraw-not-completed', {
                            key,
                            windowType: truthyOr(propertyValue(data, 'windowType'), () => ''),
                        });
                        invokeUnbound(debug, [
                            `[Redraw Schedule Drop] not completed at ${interpolationStringValue(key)}`,
                        ]);
                    }
                });
            };
            if (windowLifecycle && isRuntimeFunction(propertyValue(windowLifecycle, 'withRenderDrain'))) {
                return invokeMethod(windowLifecycle, 'withRenderDrain', [
                    windowInstance,
                    data,
                    truthyOr(reason, () => 'window-update'),
                    flush,
                ]);
            }
            flush();
            return undefined;
        }
        function deferRenderReadinessUntilNativeSourceDraw(windowData: unknown, key: unknown, queued: unknown, entry: unknown): boolean {
            if (!isCurrentNativeSourceDrawPending(entry))
                return false;
            const schedule = propertyValue(windowData, 'renderReadinessSchedule');
            if (!schedule || invokeMethod(schedule, 'get', [key]) !== queued)
                return true;
            setProperty(queued, 'queue', 'after-source-draw');
            setProperty(queued, 'reason', 'native-source-draw-pending');
            return true;
        }
        function isCurrentNativeSourceDrawPending(entry: unknown): boolean {
            const renderLifecycle = propertyValue(entry, 'renderLifecycle');
            const sourceDraw = propertyValue(renderLifecycle, 'sourceDraw');
            if (propertyValue(sourceDraw, 'status') !== 'pending')
                return false;
            const entryGeneration = propertyValue(sourceDraw, 'entryGeneration');
            const surfaceRevision = propertyValue(entry, 'surfaceRevision');
            return (typeof entryGeneration === 'number' &&
                Number.isSafeInteger(entryGeneration) &&
                entryGeneration > 0 &&
                entryGeneration === surfaceRevision);
        }
        function resolveQueuedRenderCommandId(queued: unknown, entry: unknown): string {
            return stringValue(truthyOr(queued && propertyValue(queued, 'commandId'), () => truthyOr(entry &&
                propertyValue(entry, 'renderTransaction') &&
                memberValue(propertyValue(entry, 'renderTransaction'), 'commandId'), () => '')));
        }
        function resolveQueuedRenderCommandGeneration(queued: unknown): number {
            return numberValue(queued && propertyValue(queued, 'commandGeneration')) || 0;
        }
        function deleteQueuedRenderCommandDeliveryIfCurrent(windowData: unknown, key: unknown, queued: unknown, entry: unknown, commandId: string, commandGeneration: number): boolean {
            const schedule = propertyValue(windowData, 'renderReadinessSchedule');
            if (invokeMethod(schedule, 'get', [key]) !== queued)
                return false;
            if (resolveQueuedRenderCommandId(queued, entry) !== commandId)
                return false;
            if (resolveQueuedRenderCommandGeneration(queued) !== commandGeneration)
                return false;
            return invokeMethod(schedule, 'delete', [key]) === true;
        }
        function inspectRenderReadinessReceipt(result: unknown, commandId: string): {
            readonly settled: boolean;
            readonly changed: boolean;
            readonly status: unknown;
            readonly reason: unknown;
        } {
            if (!isPropertyBag(result)) {
                return { settled: false, changed: false, status: '', reason: '' };
            }
            const resultCommandId = propertyValue(result, 'commandId');
            const changed = propertyValue(result, 'changed') === true;
            const terminal = propertyValue(result, 'terminal') === true;
            const status = propertyValue(result, 'status') ?? '';
            const receiptReason = propertyValue(result, 'reason') ?? '';
            return {
                settled: resultCommandId === commandId && (changed || terminal),
                changed: resultCommandId === commandId && changed,
                status,
                reason: receiptReason,
            };
        }
        function notifyQueuedRenderCommandReady(queued: unknown, entry: unknown, windowData: unknown, key: unknown, reason: unknown): unknown {
            const commandId = resolveQueuedRenderCommandId(queued, entry);
            if (!commandId) {
                return {
                    status: 'missing-command-id',
                    changed: false,
                    terminal: true,
                    commandId,
                    reason: 'render-command-id-required',
                };
            }
            if (!windowLifecycle || !isRuntimeFunction(propertyValue(windowLifecycle, 'notifyRenderCommandReady'))) {
                return {
                    status: 'unavailable',
                    changed: false,
                    terminal: true,
                    commandId,
                    reason: 'notifyRenderCommandReady unavailable',
                };
            }
            return invokeMethod(windowLifecycle, 'notifyRenderCommandReady', [
                commandId,
                {
                    reason: 'window-render-drain-ready',
                    trigger: stringValue(truthyOr(reason, () => 'window-update')),
                    deferredReason: queued && propertyValue(queued, 'reason') ? stringValue(propertyValue(queued, 'reason')) : '',
                    queue: queued && propertyValue(queued, 'queue') ? stringValue(propertyValue(queued, 'queue')) : '',
                    key: stringValue(truthyOr(key, () => '')),
                    windowType: windowData && propertyValue(windowData, 'windowType')
                        ? stringValue(propertyValue(windowData, 'windowType'))
                        : '',
                    commandGeneration: numberValue(queued && propertyValue(queued, 'commandGeneration')) || 0,
                    entryGeneration: numberValue(queued && propertyValue(queued, 'entryGeneration')) ||
                        numberValue(entry && propertyValue(entry, 'surfaceRevision')) ||
                        0,
                    contentsRevision: numberValue(windowData && propertyValue(windowData, 'contentsRevision')) || 0,
                    proof: {
                        windowReady: true,
                        renderDrainActive: true,
                    },
                },
            ]);
        }
        function compareQueuedRenderRecords(left: unknown, right: unknown): number {
            const leftKey = stringValue(truthyOr(left && propertyValue(left, 0), () => ''));
            const rightKey = stringValue(truthyOr(right && propertyValue(right, 0), () => ''));
            const leftQueued = left && propertyValue(left, 1) ? propertyValue(left, 1) : null;
            const rightQueued = right && propertyValue(right, 1) ? propertyValue(right, 1) : null;
            const leftEntry = leftQueued && propertyValue(leftQueued, 'entry') ? propertyValue(leftQueued, 'entry') : null;
            const rightEntry = rightQueued && propertyValue(rightQueued, 'entry') ? propertyValue(rightQueued, 'entry') : null;
            const commandOrder = compareQueuedRenderCommandBacked(leftQueued, leftEntry, rightQueued, rightEntry);
            if (commandOrder !== 0)
                return commandOrder;
            const leftHasCommand = hasQueuedRenderCommand(leftQueued, leftEntry);
            const rightHasCommand = hasQueuedRenderCommand(rightQueued, rightEntry);
            if (!leftHasCommand && !rightHasCommand) {
                const queuedAtOrder = compareFiniteNumbers(leftQueued && propertyValue(leftQueued, 'queuedAt'), rightQueued && propertyValue(rightQueued, 'queuedAt'));
                if (queuedAtOrder !== 0)
                    return queuedAtOrder;
            }
            const drawOrder = compareFiniteNumbers(leftEntry && propertyValue(leftEntry, 'drawOrder'), rightEntry && propertyValue(rightEntry, 'drawOrder'));
            if (drawOrder !== 0)
                return drawOrder;
            const yOrder = compareFiniteNumbers(leftEntry &&
                propertyValue(leftEntry, 'position') &&
                memberValue(propertyValue(leftEntry, 'position'), 'y'), rightEntry &&
                propertyValue(rightEntry, 'position') &&
                memberValue(propertyValue(rightEntry, 'position'), 'y'));
            if (yOrder !== 0)
                return yOrder;
            const xOrder = compareFiniteNumbers(leftEntry &&
                propertyValue(leftEntry, 'position') &&
                memberValue(propertyValue(leftEntry, 'position'), 'x'), rightEntry &&
                propertyValue(rightEntry, 'position') &&
                memberValue(propertyValue(rightEntry, 'position'), 'x'));
            if (xOrder !== 0)
                return xOrder;
            const queuedAtOrder = compareFiniteNumbers(leftQueued && propertyValue(leftQueued, 'queuedAt'), rightQueued && propertyValue(rightQueued, 'queuedAt'));
            if (queuedAtOrder !== 0)
                return queuedAtOrder;
            return leftKey.localeCompare(rightKey);
        }
        function compareQueuedRenderCommandBacked(leftQueued: unknown, leftEntry: unknown, rightQueued: unknown, rightEntry: unknown): number {
            const leftHasCommand = hasQueuedRenderCommand(leftQueued, leftEntry);
            const rightHasCommand = hasQueuedRenderCommand(rightQueued, rightEntry);
            if (leftHasCommand === rightHasCommand)
                return 0;
            return leftHasCommand ? -1 : 1;
        }
        function hasQueuedRenderCommand(queued: unknown, entry: unknown): boolean {
            return Boolean(resolveQueuedRenderCommandId(queued, entry));
        }
        function compareFiniteNumbers(left: unknown, right: unknown): number {
            const a = numberValue(left);
            const b = numberValue(right);
            const hasA = Number.isFinite(a);
            const hasB = Number.isFinite(b);
            if (hasA && hasB && a !== b)
                return a - b;
            if (hasA !== hasB)
                return hasA ? -1 : 1;
            return 0;
        }
        function markWindowEntriesOffscreen(windowInstance: unknown, data: unknown, reason: unknown): void {
            if (!data ||
                !propertyValue(data, 'texts') ||
                !isRuntimeFunction(memberValue(propertyValue(data, 'texts'), 'forEach'))) {
                return;
            }
            const completed: {
                key: unknown;
                entry: unknown;
            }[] = [];
            const screenState = getWindowScreenState(windowInstance, data);
            invokeMethod(propertyValue(data, 'texts'), 'forEach', [
                (entry: unknown, key: unknown): void => {
                    if (!isWindowEntryActive(entry) || entryLifecycle.isStale(entry))
                        return;
                    if (entryLifecycle.getSurfaceVisible(entry) !== false) {
                        setWindowDrawRecordVisible(windowInstance, data, entry, false, truthyOr(reason, () => 'window-offscreen'), screenState);
                    }
                    if (isWindowEntryCompleted(entry) && shouldRetireOffscreenCompletedEntry(screenState)) {
                        completed.push({ key, entry });
                    }
                },
            ]);
            completed.forEach(({ key, entry }) => {
                const retired = retireOffscreenCompletedWindowEntry(windowInstance, data, key, entry, truthyOr(reason, () => 'window-offscreen'));
                const store = propertyValue(data, 'texts');
                if (!retired && isWindowTextEntryStore(store))
                    store.markCompletedEntry(entry);
            });
        }
        function retireCompletedWindowEntryWork(windowInstance: unknown, data: unknown, reason: unknown): void {
            const store = propertyValue(data, 'texts');
            if (!isWindowTextEntryStore(store)) {
                markWindowEntriesOffscreen(windowInstance, data, reason);
                return;
            }
            const completed = store.completedEntries();
            for (const candidate of completed) {
                const entry = candidate.entry;
                if (!entry || entryLifecycle.isStale(entry) || !isWindowEntryActive(entry)) {
                    store.clearCompletedEntry(entry);
                    continue;
                }
                if (!isWindowEntryCompleted(entry))
                    continue;
                retireOffscreenCompletedWindowEntry(windowInstance, data, candidate.key, entry, reason);
            }
        }
        function shouldRetireOffscreenCompletedEntry(screenState: unknown): boolean {
            const state = stringValue(truthyOr(screenState, () => ''));
            return state !== 'opening' && state !== 'transparent';
        }
        function retireOffscreenCompletedWindowEntry(windowInstance: unknown, data: unknown, key: unknown, entry: unknown, reason: unknown): boolean {
            if (!entry ||
                entryLifecycle.isStale(entry) ||
                !isWindowEntryActive(entry) ||
                !isWindowEntryCompleted(entry)) {
                return false;
            }
            const entryDetails = {
                key: stringValue(truthyOr(key, () => '')),
                windowType: getWindowType(windowInstance, data),
                screenState: getWindowScreenState(windowInstance, data),
                wasCompleted: true,
            };
            const staleReason = truthyOr(reason, () => 'window-offscreen');
            entryLifecycle.markStale(entry, staleReason, {
                surfaceVisible: false,
                screenState: 'hidden',
            });
            rejectWindowPendingRender(entry, staleReason, entryDetails);
            retireWindowEntry(entry, staleReason, entryDetails, {
                policy: { kind: 'retired' },
            });
            forgetWindowEntryRecord(entry, staleReason, entryDetails);
            entryLifecycle.setSurfaceVisible(entry, false, {
                reason: staleReason,
                screenState: 'hidden',
            });
            try {
                invokeMethod(propertyValue(data, 'texts'), 'delete', [key]);
            }
            catch {
            }
            try {
                if (propertyValue(data, 'renderReadinessSchedule') &&
                    isRuntimeFunction(memberValue(propertyValue(data, 'renderReadinessSchedule'), 'delete'))) {
                    invokeMethod(propertyValue(data, 'renderReadinessSchedule'), 'delete', [key]);
                }
            }
            catch {
            }
            return true;
        }
        function markWindowEntriesVisible(windowInstance: unknown, data: unknown, reason: unknown): void {
            if (!data ||
                !propertyValue(data, 'texts') ||
                !isRuntimeFunction(memberValue(propertyValue(data, 'texts'), 'forEach'))) {
                return;
            }
            invokeMethod(propertyValue(data, 'texts'), 'forEach', [
                (entry: unknown): void => {
                    if (!isWindowEntryActive(entry) ||
                        entryLifecycle.isStale(entry) ||
                        entryLifecycle.getSurfaceVisible(entry) !== false) {
                        return;
                    }
                    setWindowDrawRecordVisible(windowInstance, data, entry, true, truthyOr(reason, () => 'window-visible'));
                },
            ]);
        }
        function getWindowType(windowInstance: unknown, data: unknown): unknown {
            if (data && propertyValue(data, 'windowType'))
                return propertyValue(data, 'windowType');
            return windowInstance && propertyValue(windowInstance, 'constructor')
                ? memberValue(propertyValue(windowInstance, 'constructor'), 'name')
                : '';
        }
        function warn(message: string, error: unknown): void {
            if (logger && isRuntimeFunction(propertyValue(logger, 'warn'))) {
                try {
                    invokeMethod(logger, 'warn', [message, error]);
                }
                catch {
                }
            }
        }
        return {
            createWindowData,
            isWindowEntryActive,
            isWindowEntryCompleted,
            retireWindowEntry,
            setWindowDrawRecordVisible,
            beginWindowRefresh,
            settleWindowRefreshReturned,
            settleWindowRefreshThrew,
            rejectWindowPendingRender,
            forgetWindowEntryRecord,
            getWindowScreenState,
            syncWindowTextScreenState,
            commitPendingWindowEntryStaleRecords,
            withWindowRefreshSession,
            unregisterWindowSafely,
            flushWindowRenderReadinessSchedule,
        };
    }
    return {
        create: createLifecycleStateHelpers,
        createWindowData,
    };
}
