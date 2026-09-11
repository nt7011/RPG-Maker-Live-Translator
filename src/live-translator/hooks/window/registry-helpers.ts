import type { DisplayStateModule } from '../../runtime/display-state.js';
import { exactDataProperties } from '../../runtime/exact-data-property.js';
import type { EntryLifecycleModule } from '../../runtime/entry-lifecycle.js';
import { createWindowTextEntryStore } from '../../runtime/window-text-entry-store.js';
import type { LifecycleReasons } from '../../runtime/lifecycle-reasons.js';
import { createWindowContentsLifetimeCoordinator, type WindowRefreshContentsPlan } from './contents-lifetime.js';
export type { WindowRefreshContentsPlan, WindowRefreshContentsPreparation, WindowRefreshContentsSettlement, WindowRefreshContentsSupersededSettlement, WindowRefreshContentsTerminalSettlement, } from './contents-lifetime.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
const getWeakMapEntry = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'get')?.value as (this: WeakMap<object, unknown>, key: object) => unknown;
const deleteWeakMapEntry = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'delete')?.value as (this: WeakMap<object, unknown>, key: object) => boolean;
const setWeakMapEntry = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value as (this: WeakMap<object, unknown>, key: object, value: unknown) => WeakMap<object, unknown>;
const freezeObject = Object.freeze;
const deleteSetEntry = Object.getOwnPropertyDescriptor(Set.prototype, 'delete')?.value as (this: Set<unknown>, value: unknown) => boolean;
export interface WindowRegistryHelpers {
    readonly addWindowToRegistry: (window: unknown, windowData: unknown) => void;
    readonly ensureWindowRegistered: (window: unknown) => unknown;
    readonly settleWindowContentsOwnership: (window: unknown, windowData: unknown, contents: unknown) => boolean;
    readonly prepareWindowRefreshContents: (window: unknown, windowData: unknown, preparation: unknown) => WindowRefreshContentsPlan | null;
    readonly unregisterWindow: (window: unknown, reason?: unknown) => unknown;
    readonly pruneDetachedRegisteredWindows: (currentWindow?: unknown) => void;
}
export interface WindowRegistryHelpersModule {
    readonly createWindowRegistryHelpers: (context?: unknown) => WindowRegistryHelpers;
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
function setProperty(target: unknown, key: PropertyKey, value: unknown): void {
    if (!isPropertyBag(target))
        throw new TypeError(`Window registry target cannot receive ${String(key)}.`);
    target[key] = value;
}
function deleteProperty(target: unknown, key: PropertyKey): boolean {
    if (!isPropertyBag(target))
        throw new TypeError(`Window registry target cannot delete ${String(key)}.`);
    if (!Reflect.deleteProperty(target, key)) {
        throw new TypeError(`Window registry target refused to delete ${String(key)}.`);
    }
    return true;
}
function invokeMethod(target: unknown, methodName: PropertyKey, args: readonly unknown[]): unknown {
    const method = propertyValue(target, methodName);
    if (!isRuntimeFunction(method)) {
        throw new TypeError(`Window registry method ${String(methodName)} is not callable.`);
    }
    return Reflect.apply(method, target, args);
}
function invokeUnbound(callback: RuntimeFunction, args: readonly unknown[]): unknown {
    return Reflect.apply(callback, undefined, args);
}
function destructurableContext(value: unknown): PropertyBag {
    if (value === null || value === undefined) {
        throw new TypeError('Window registry context cannot be null or undefined.');
    }
    if (isPropertyBag(value))
        return value;
    const boxed: unknown = Reflect.apply(Object, undefined, [value]);
    if (isPropertyBag(boxed))
        return boxed;
    throw new TypeError('Window registry context is not property-readable.');
}
function stringValue(value: unknown): string {
    const converted: unknown = Reflect.apply(String, undefined, [value]);
    if (typeof converted !== 'string')
        throw new TypeError('String conversion did not return text.');
    return converted;
}
function numberValue(value: unknown): number {
    const converted: unknown = Reflect.apply(Number, undefined, [value]);
    if (typeof converted !== 'number')
        throw new TypeError('Number conversion did not return a number.');
    return converted;
}
function truthyOr<Value, Fallback>(value: Value, fallback: () => Fallback): Value | Fallback {
    if (value)
        return value;
    return fallback();
}
function resolveDisplayScope(context: PropertyBag, defaultScope: unknown): unknown {
    const environment = propertyValue(context, 'environment');
    if (!isPropertyBag(environment))
        return defaultScope;
    const scopeOverride = environment['scope'];
    return scopeOverride === undefined ? defaultScope : scopeOverride;
}
interface WindowRegistrationProfile {
    readonly identityKey: string;
}
interface WindowUnregisterTransaction {
    lease: ReturnType<ReturnType<typeof createWindowContentsLifetimeCoordinator>['beginRevocation']> | null;
    readonly reason: unknown;
    running: boolean;
}
export function createWindowRegistryHelpers(displayStateModule: DisplayStateModule, lifecycleReasons: LifecycleReasons, entryLifecycle: EntryLifecycleModule, runtimeScope: unknown, context: unknown = {}): WindowRegistryHelpers {
    const source = destructurableContext(context);
    const { windowRegistry, registeredWindows } = source;
    const surfaceOwnershipValue = source['surfaceOwnership'];
    const surfaceOwnership = surfaceOwnershipValue === undefined ? null : surfaceOwnershipValue;
    const windowLifecycleValue = source['windowLifecycle'];
    const windowLifecycle = windowLifecycleValue === undefined ? null : windowLifecycleValue;
    const adapterContractValue = source['adapterContract'];
    const adapterContract = adapterContractValue === undefined ? null : adapterContractValue;
    const prototypeHooksValue = source['windowLifecyclePrototypeHooks'];
    const windowLifecyclePrototypeHooks = prototypeHooksValue === undefined ? null : prototypeHooksValue;
    const getWindowTextHelpersValue = source['getWindowTextHelpers'];
    const getWindowTextHelpers = getWindowTextHelpersValue === undefined ? null : getWindowTextHelpersValue;
    if (!windowRegistry || !registeredWindows || !surfaceOwnership) {
        throw new Error('[WindowHelpers] Missing window registry references.');
    }
    const registrationProfiles = new WeakMap<PropertyBag, WindowRegistrationProfile>();
    const unregisterTransactions = new WeakMap<PropertyBag, WindowUnregisterTransaction>();
    let nextGeneratedIdentity = 1;
    const displayState = displayStateModule.createDisplayStateService(resolveDisplayScope(source, runtimeScope));
    function resolveWindowRegistration(window: unknown): WindowRegistrationProfile {
        if (!isPropertyBag(window)) {
            throw new TypeError('Window registration requires an object window reference.');
        }
        const retained = registrationProfiles.get(window);
        if (retained)
            return retained;
        if (!Number.isSafeInteger(nextGeneratedIdentity)) {
            throw new Error('Window registration identity space is exhausted.');
        }
        const profile = Object.freeze({ identityKey: `window-${stringValue(nextGeneratedIdentity)}` });
        nextGeneratedIdentity += 1;
        registrationProfiles.set(window, profile);
        return profile;
    }
    const isEntryActive = (entry: unknown): unknown => {
        if (!entry || !propertyValue(entry, 'recordId'))
            return false;
        if (windowLifecycle && isRuntimeFunction(propertyValue(windowLifecycle, 'isEntryActive'))) {
            return invokeMethod(windowLifecycle, 'isEntryActive', [entry]);
        }
        if (adapterContract && isRuntimeFunction(propertyValue(adapterContract, 'isRecordActive'))) {
            return invokeMethod(adapterContract, 'isRecordActive', [entry]);
        }
        return false;
    };
    const isEntryCompleted = (entry: unknown): unknown => {
        if (!entry || !propertyValue(entry, 'recordId'))
            return false;
        if (windowLifecycle && isRuntimeFunction(propertyValue(windowLifecycle, 'isEntryCompleted'))) {
            return invokeMethod(windowLifecycle, 'isEntryCompleted', [entry]);
        }
        if (adapterContract && isRuntimeFunction(propertyValue(adapterContract, 'getRecordStatus'))) {
            return invokeMethod(adapterContract, 'getRecordStatus', [entry]) === 'completed';
        }
        return false;
    };
    const retireWindowEntry = (entry: unknown, reason: unknown, details: unknown = null, options: unknown = {}): void => {
        if (!isEntryActive(entry))
            return;
        try {
            if (windowLifecycle && isRuntimeFunction(propertyValue(windowLifecycle, 'retireEntry'))) {
                invokeMethod(windowLifecycle, 'retireEntry', [
                    entry,
                    truthyOr(reason, () => lifecycleReasons.WINDOW_STALE),
                    details,
                    options,
                ]);
            }
        }
        catch {
        }
    };
    const resolveWindowTextHelpers = (): unknown => {
        if (!isRuntimeFunction(getWindowTextHelpers))
            return null;
        try {
            return truthyOr(invokeUnbound(getWindowTextHelpers, []), () => null);
        }
        catch {
            return null;
        }
    };
    const contentsLifetime = createWindowContentsLifetimeCoordinator({
        adapterContract,
        contentsReplacedReason: lifecycleReasons.CONTENTS_REPLACED,
        getWindowTextHelpers: resolveWindowTextHelpers,
        surfaceOwnership,
    });
    const rejectWindowPendingRender = (entry: unknown, reason: unknown, details: unknown = null): boolean => {
        const helpers = resolveWindowTextHelpers();
        if (!helpers || !isRuntimeFunction(propertyValue(helpers, 'rejectPendingRender')))
            return false;
        try {
            const result = invokeMethod(helpers, 'rejectPendingRender', [entry, reason, details]);
            return Boolean(result && propertyValue(result, 'handled') === true);
        }
        catch {
            return false;
        }
    };
    const forgetWindowEntryRecord = (entry: unknown, reason: unknown, details: unknown = null): boolean => {
        const helpers = resolveWindowTextHelpers();
        if (!helpers || !isRuntimeFunction(propertyValue(helpers, 'forgetEntryRecord')))
            return false;
        try {
            return invokeMethod(helpers, 'forgetEntryRecord', [entry, reason, details]) === true;
        }
        catch {
            return false;
        }
    };
    function installWindowLifecyclePrototypeHooks(window: unknown): void {
        if (!window || !windowLifecyclePrototypeHooks)
            return;
        const installValue = propertyValue(windowLifecyclePrototypeHooks, 'install');
        const installer = isRuntimeFunction(installValue) ? installValue : null;
        if (!installer)
            return;
        try {
            invokeUnbound(installer, [window]);
        }
        catch {
        }
    }
    function findPropertyDescriptor(target: unknown, propertyName: PropertyKey): PropertyDescriptor | null {
        let cursor = isPropertyBag(target) ? target : null;
        while (cursor) {
            try {
                const descriptor = Object.getOwnPropertyDescriptor(cursor, propertyName);
                if (descriptor)
                    return descriptor;
                const prototype: unknown = Object.getPrototypeOf(cursor);
                cursor = isPropertyBag(prototype) ? prototype : null;
            }
            catch {
                return null;
            }
        }
        return null;
    }
    function installWindowContentsAccessor(window: unknown): boolean {
        if (!window || typeof window !== 'object')
            return false;
        try {
            if (propertyValue(window, '_trWindowContentsAccessorInstalled') === true)
                return true;
            const ownDescriptor = Object.getOwnPropertyDescriptor(window, 'contents');
            const inheritedDescriptor = ownDescriptor
                ? null
                : findPropertyDescriptor(Reflect.getPrototypeOf(window), 'contents');
            if ((ownDescriptor && (ownDescriptor.get || ownDescriptor.set)) ||
                (inheritedDescriptor && (inheritedDescriptor.get || inheritedDescriptor.set)) ||
                inheritedDescriptor?.writable === false) {
                return false;
            }
            const enumerable = ownDescriptor ? ownDescriptor.enumerable !== false : true;
            const initialContents = ownDescriptor && Object.prototype.hasOwnProperty.call(ownDescriptor, 'value')
                ? propertyValue(ownDescriptor, 'value')
                : propertyValue(window, 'contents');
            Object.defineProperty(window, '_trWindowContentsValue', {
                configurable: true,
                enumerable: false,
                writable: true,
                value: initialContents,
            });
            Object.defineProperty(window, 'contents', {
                configurable: true,
                enumerable,
                get(this: PropertyBag): unknown {
                    return this['_trWindowContentsValue'];
                },
                set(this: PropertyBag, value: unknown) {
                    this['_trWindowContentsValue'] = value;
                    handleWindowContentsAssigned(this, value, 'contents-assigned');
                },
            });
            Object.defineProperty(window, '_trWindowContentsAccessorInstalled', {
                configurable: true,
                enumerable: false,
                writable: true,
                value: true,
            });
            return true;
        }
        catch {
            return false;
        }
    }
    function handleWindowContentsAssigned(window: unknown, contents: unknown, reason: unknown = 'contents-assigned'): boolean {
        if (!window)
            return false;
        let windowData: unknown = null;
        try {
            windowData = truthyOr(invokeMethod(windowRegistry, 'get', [window]), () => null);
        }
        catch {
        }
        if (!windowData)
            return false;
        if (isWindowRefreshActive(window, windowData)) {
            setProperty(windowData, 'selectedContentsBitmap', truthyOr(contents, () => null));
            if (contents)
                observeAssignedRefreshContents(window, windowData, contents, reason);
            return true;
        }
        selectWindowContentsSurface(window, windowData, contents, reason);
        return true;
    }
    function isWindowRefreshActive(window: unknown, windowData: unknown): boolean {
        const refreshState = getWindowRefreshState(window, windowData);
        return Boolean(refreshState && propertyValue(refreshState, 'active') === true);
    }
    function getWindowRefreshState(window: unknown, windowData: unknown): PropertyBag | null {
        if (!windowLifecycle || !isRuntimeFunction(propertyValue(windowLifecycle, 'getRefreshState')))
            return null;
        try {
            const state = invokeMethod(windowLifecycle, 'getRefreshState', [window, windowData]);
            return state && typeof state === 'object' && isPropertyBag(state) ? state : null;
        }
        catch {
            return null;
        }
    }
    function observeAssignedRefreshContents(window: unknown, windowData: unknown, contents: unknown, reason: unknown): boolean {
        if (!window || !windowData || !contents)
            return false;
        contentsLifetime.recordAssigned(window, windowData, contents, truthyOr(reason, () => 'refresh-contents-assigned'), contents === getRefreshCanonicalContents(window, windowData)
            ? 'window-current-contents'
            : 'window-staging-contents');
        let assignmentRecorded = false;
        if (windowLifecycle && isRuntimeFunction(propertyValue(windowLifecycle, 'recordRefreshContentsAssignment'))) {
            try {
                assignmentRecorded =
                    invokeMethod(windowLifecycle, 'recordRefreshContentsAssignment', [window, windowData, contents]) ===
                        true;
            }
            catch {
                assignmentRecorded = false;
            }
        }
        return assignmentRecorded;
    }
    function getRefreshCanonicalContents(window: unknown, windowData: unknown): unknown {
        if (windowLifecycle && isRuntimeFunction(propertyValue(windowLifecycle, 'getRefreshInitialContents'))) {
            try {
                const initialContents = invokeMethod(windowLifecycle, 'getRefreshInitialContents', [window]);
                if (initialContents)
                    return initialContents;
            }
            catch {
            }
        }
        return truthyOr(propertyValue(windowData, 'contentsBitmap'), () => null);
    }
    function prepareWindowRefreshContents(window: unknown, windowData: unknown, input: unknown): WindowRefreshContentsPlan | null {
        const plan = contentsLifetime.begin(window, windowData, input);
        if (!plan || !isPropertyBag(window))
            return plan;
        const resumePendingUnregister = (): void => {
            const transaction = Reflect.apply(getWeakMapEntry, unregisterTransactions, [window]) as WindowUnregisterTransaction | undefined;
            if (!transaction || transaction.running)
                return;
            unregisterWindow(window, transaction.reason);
        };
        const settleBoundary = (boundary: () => ReturnType<WindowRefreshContentsPlan['settle']>): ReturnType<WindowRefreshContentsPlan['settle']> => {
            const settlement = boundary();
            resumePendingUnregister();
            return settlement;
        };
        return freezeObject({
            settle: () => settleBoundary(plan.settle),
            fail: (cause: unknown) => settleBoundary(() => plan.fail(cause)),
        });
    }
    function markWindowEntriesStale(windowData: unknown, reason: unknown): void {
        if (!windowData)
            return;
        const windowType = truthyOr(propertyValue(windowData, 'windowType'), () => '');
        const staleReason = truthyOr(reason, () => lifecycleReasons.WINDOW_STALE);
        try {
            const texts = propertyValue(windowData, 'texts');
            if (texts && isRuntimeFunction(propertyValue(texts, 'forEach'))) {
                invokeMethod(texts, 'forEach', [
                    (entry: unknown, key: unknown) => {
                        if (!entry)
                            return;
                        const details = {
                            key: stringValue(truthyOr(key, () => '')),
                            windowType,
                            wasCompleted: isEntryCompleted(entry),
                        };
                        entryLifecycle.markStale(entry, staleReason, {
                            surfaceVisible: false,
                            screenState: 'hidden',
                        });
                        rejectWindowPendingRender(entry, staleReason, details);
                        if (isEntryActive(entry)) {
                            retireWindowEntry(entry, staleReason, details, { policy: { kind: 'retired' } });
                        }
                        forgetWindowEntryRecord(entry, staleReason, details);
                        entryLifecycle.setSurfaceVisible(entry, false, {
                            reason: staleReason,
                            screenState: 'hidden',
                        });
                    },
                ]);
                invokeMethod(texts, 'clear', []);
            }
        }
        catch {
        }
        try {
            const schedule = propertyValue(windowData, 'renderReadinessSchedule');
            if (schedule && isRuntimeFunction(propertyValue(schedule, 'clear')))
                invokeMethod(schedule, 'clear', []);
        }
        catch {
        }
    }
    function clearPendingDetachState(window: unknown, windowData: unknown = null): void {
        try {
            if (window) {
                deleteProperty(window, '_trWindowRegistryPendingDetachToken');
                deleteProperty(window, '_trWindowRegistryPendingDetachRoot');
                deleteProperty(window, '_trWindowRegistryPendingDetachReason');
            }
        }
        catch {
        }
        if (!windowData)
            return;
        try {
            deleteProperty(windowData, '_trPendingDetach');
            deleteProperty(windowData, '_trPendingDetachToken');
            deleteProperty(windowData, '_trPendingDetachRoot');
            deleteProperty(windowData, '_trPendingDetachReason');
        }
        catch {
        }
    }
    function hasPendingDetachState(window: unknown, windowData: unknown = null): boolean {
        return Boolean(truthyOr(windowData && propertyValue(windowData, '_trPendingDetach'), () => window ? numberValue(propertyValue(window, '_trWindowRegistryPendingDetachToken')) > 0 : window));
    }
    function unregisterWindow(window: unknown, reason: unknown = lifecycleReasons.WINDOW_UNREGISTERED): unknown {
        if (!window)
            return null;
        if (!isPropertyBag(window))
            return null;
        const windowData: unknown = Reflect.apply(getWeakMapEntry, windowRegistry, [window]) as unknown;
        let transaction = Reflect.apply(getWeakMapEntry, unregisterTransactions, [window]) as WindowUnregisterTransaction | undefined;
        if (!transaction) {
            transaction = { lease: null, reason, running: false };
            Reflect.apply(setWeakMapEntry, unregisterTransactions, [window, transaction]);
        }
        if (transaction.running)
            throw new Error('Window unregister transaction is already in progress.');
        const transactionReason = transaction.reason;
        transaction.running = true;
        try {
            if (windowData) {
                const revocationLease = transaction.lease ?? contentsLifetime.beginRevocation(window, windowData, transactionReason);
                transaction.lease = revocationLease;
                if (propertyValue(propertyValue(revocationLease, 'receipt'), 'terminal') === true) {
                    throw new Error('Window refresh revocation terminalized before registry callbacks settled.');
                }
                clearPendingDetachState(window, windowData);
                markWindowEntriesStale(windowData, transactionReason);
                setProperty(windowData, 'isOpen', false);
                setProperty(windowData, '_trUnregistered', true);
                setProperty(windowData, '_trUnregisteredReason', transactionReason);
                setProperty(windowData, '_trUnregisteredAt', Date.now());
                const terminalRevocation = contentsLifetime.completeRevocation(window, windowData, revocationLease, transactionReason);
                if (propertyValue(terminalRevocation, 'status') !== 'revoked' ||
                    propertyValue(terminalRevocation, 'terminal') !== true) {
                    throw new Error('Window refresh revocation did not reach exact terminal authority.');
                }
            }
            Reflect.apply(deleteSetEntry, registeredWindows, [window]);
            Reflect.apply(deleteWeakMapEntry, windowRegistry, [window]);
            if (windowData)
                contentsLifetime.detach(window, windowData);
            Reflect.apply(deleteWeakMapEntry, unregisterTransactions, [window]);
            return windowData;
        }
        finally {
            transaction.running = false;
        }
    }
    function isWindowDisplayAttached(window: unknown): boolean {
        return displayState.isDisplayObjectAttached(window);
    }
    function updateWindowAttachmentState(window: unknown, windowData: unknown): void {
        if (!window || !windowData)
            return;
        if (isWindowDisplayAttached(window)) {
            setProperty(windowData, '_trEverAttached', true);
        }
    }
    function isDetachedRegisteredWindow(window: unknown, windowData: unknown): boolean {
        if (!window || !windowData)
            return true;
        if (hasPendingDetachState(window, windowData))
            return false;
        if (propertyValue(window, '_destroyed') || propertyValue(window, 'destroyed'))
            return true;
        if (propertyValue(windowData, '_trEverAttached') !== true)
            return false;
        return !isWindowDisplayAttached(window);
    }
    function getRegisteredWindowDetachReason(window: unknown): unknown {
        const chainState = displayState.describeDisplayChain(window);
        return chainState.state === 'inactive-scene'
            ? lifecycleReasons.NOT_CURRENT_SCENE
            : lifecycleReasons.WINDOW_DETACHED;
    }
    function pruneDetachedRegisteredWindows(currentWindow: unknown = null): void {
        if (!registeredWindows || !isRuntimeFunction(propertyValue(registeredWindows, 'forEach')))
            return;
        const detached: PropertyBag[] = [];
        try {
            invokeMethod(registeredWindows, 'forEach', [
                (candidate: unknown) => {
                    if (!candidate || candidate === currentWindow)
                        return;
                    const candidateData = invokeMethod(windowRegistry, 'get', [candidate]);
                    if (!candidateData) {
                        detached.push({ window: candidate, reason: lifecycleReasons.WINDOW_DETACHED });
                        return;
                    }
                    updateWindowAttachmentState(candidate, candidateData);
                    if (isDetachedRegisteredWindow(candidate, candidateData)) {
                        detached.push({ window: candidate, reason: getRegisteredWindowDetachReason(candidate) });
                    }
                },
            ]);
        }
        catch {
        }
        detached.forEach((record) => unregisterWindow(record['window'], record['reason']));
    }
    function selectWindowContentsSurface(window: unknown, windowData: unknown, contents: unknown, reason: unknown = 'current-contents'): void {
        try {
            if (!window || !windowData)
                return;
            const previousContents = truthyOr(propertyValue(windowData, 'selectedContentsBitmap'), () => null);
            setProperty(windowData, 'selectedContentsBitmap', truthyOr(contents, () => null));
            if (!contents) {
                settleWindowContentsOwnership(window, windowData, previousContents);
                return;
            }
            if (isWindowRefreshActive(window, windowData)) {
                observeAssignedRefreshContents(window, windowData, contents, truthyOr(reason, () => 'refresh-current-contents'));
                return;
            }
            let canonicalContents = propertyValue(windowData, 'contentsBitmap');
            if (!canonicalContents) {
                canonicalContents = contents;
                setProperty(windowData, 'contentsBitmap', contents);
            }
            contentsLifetime.publishSurface(window, windowData, contents, contents === canonicalContents ? 'window-current-contents' : 'window-auxiliary-contents', truthyOr(reason, () => 'current-contents'));
            settleWindowContentsClaim(window, windowData, canonicalContents, reason);
            if (previousContents && previousContents !== contents) {
                settleWindowContentsOwnership(window, windowData, previousContents);
            }
        }
        catch {
        }
    }
    function settleWindowContentsOwnership(window: unknown, windowData: unknown, contents: unknown): boolean {
        if (!window || !windowData || !contents)
            return false;
        if (contents === propertyValue(windowData, 'contentsBitmap') ||
            contents === propertyValue(windowData, 'selectedContentsBitmap')) {
            return false;
        }
        return contentsLifetime.releaseSurface(window, windowData, contents);
    }
    function settleWindowContentsClaim(window: unknown, windowData: unknown, contents: unknown, reason: unknown = 'window-contents-selected'): boolean {
        if (!window || !windowData)
            return false;
        return contentsLifetime.settleCanonicalClaim(window, windowData, contents, reason);
    }
    function addWindowToRegistry(window: unknown, windowData: unknown): void {
        if (!isPropertyBag(windowData)) {
            throw new TypeError('Window registration requires an authored data record.');
        }
        if (!exactDataProperties.isRecord(windowData)) {
            throw new TypeError('Window registration requires authored WindowData.');
        }
        installWindowLifecyclePrototypeHooks(window);
        pruneDetachedRegisteredWindows(window);
        const registration = resolveWindowRegistration(window);
        setProperty(windowData, 'windowType', propertyValue(propertyValue(window, 'constructor'), 'name'));
        setProperty(windowData, 'windowId', registration.identityKey);
        setProperty(windowData, 'registrationTime', Date.now());
        setProperty(windowData, '_trUnregistered', false);
        setProperty(windowData, '_trUnregisteredReason', null);
        setProperty(windowData, '_trUnregisteredAt', null);
        clearPendingDetachState(window, windowData);
        updateWindowAttachmentState(window, windowData);
        invokeMethod(windowRegistry, 'set', [window, windowData]);
        invokeMethod(registeredWindows, 'add', [window]);
        contentsLifetime.attach(window, windowData, registration.identityKey);
        installWindowContentsAccessor(window);
        selectWindowContentsSurface(window, windowData, propertyValue(window, 'contents'));
    }
    function ensureWindowRegistered(window: unknown): unknown {
        installWindowLifecyclePrototypeHooks(window);
        let windowData = invokeMethod(windowRegistry, 'get', [window]);
        if (!windowData) {
            windowData = exactDataProperties.createRecord({
                texts: createWindowTextEntryStore(),
                isOpen: true,
                renderReadinessSchedule: new Map(),
            });
            addWindowToRegistry(window, windowData);
        }
        else {
            const registration = resolveWindowRegistration(window);
            setProperty(windowData, 'windowId', registration.identityKey);
            if (!propertyValue(windowData, 'renderReadinessSchedule')) {
                setProperty(windowData, 'renderReadinessSchedule', new Map());
            }
            contentsLifetime.attach(window, windowData, registration.identityKey);
        }
        updateWindowAttachmentState(window, windowData);
        clearPendingDetachState(window, windowData);
        installWindowContentsAccessor(window);
        selectWindowContentsSurface(window, windowData, propertyValue(window, 'contents'));
        return windowData;
    }
    return {
        addWindowToRegistry,
        ensureWindowRegistered,
        settleWindowContentsOwnership,
        prepareWindowRefreshContents,
        unregisterWindow,
        pruneDetachedRegisteredWindows,
    };
}
