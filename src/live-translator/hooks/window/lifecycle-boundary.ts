import type { EntryLifecycleModule } from '../../runtime/entry-lifecycle.js';
import { createWindowRefreshSessionAuthority, type WindowRefreshActiveState, type WindowRefreshLease, type WindowRefreshParticipant, type WindowRefreshParticipantRegistration, type WindowRefreshSessionSnapshot, type WindowRefreshSettlementReceipt, type WindowRefreshSurfaceJournalRecord, } from './refresh-session.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeCallback = (...args: unknown[]) => unknown;
const IntrinsicMap = Map;
const IntrinsicSet = Set;
const IntrinsicWeakMap = WeakMap;
const IntrinsicTypeError = TypeError;
const apply = Reflect.apply;
const reflectDeleteProperty = Reflect.deleteProperty;
const arrayFrom = Array.from;
const arrayIsArray = Array.isArray;
const freezeObject = Object.freeze;
const arrayIndexOf = Array.prototype.indexOf;
const arrayPop = Array.prototype.pop;
const arrayPush = Array.prototype.push;
const arraySplice = Array.prototype.splice;
const mapDelete = Map.prototype.delete;
const mapGet = Map.prototype.get;
const mapSet = Map.prototype.set;
const setAdd = Set.prototype.add;
const setClear = Set.prototype.clear;
const setHas = Set.prototype.has;
const weakMapDelete = WeakMap.prototype.delete;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
function privateMapGet<Key, Value>(map: Map<Key, Value>, key: Key): Value | undefined {
    return apply(mapGet, map, [key]) as Value | undefined;
}
function privateMapSet<Key, Value>(map: Map<Key, Value>, key: Key, value: Value): void {
    apply(mapSet, map, [key, value]);
}
function privateWeakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return apply(weakMapGet, map, [key]) as Value | undefined;
}
function privateWeakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    apply(weakMapSet, map, [key, value]);
}
export type WindowRefreshState = WindowRefreshActiveState;
export interface RenderDrainToken {
    readonly id: number;
    readonly reason: string;
}
export interface RenderDrainState {
    readonly active: boolean;
    readonly depth: number;
    readonly dataDepth: number;
    readonly windowDepth: number;
    readonly reason: unknown;
}
interface BoundaryRefreshContext {
    readonly sessionId: number;
    readonly window: PropertyBag;
    readonly initialContents: unknown;
    readonly assignedContents: Set<unknown>;
    readonly observedEntries: Set<PropertyBag>;
    windowData: unknown;
    contentsPlan: unknown;
    contentsTerminalReceipt: unknown;
    contentsTerminal: boolean;
    contentsPreparationFailure: unknown;
    contentsSettlement: 'unprepared' | 'prepared' | 'preparation-failed' | 'pending' | 'complete';
}
interface PendingWindowContentsSettlement {
    readonly context: BoundaryRefreshContext;
    readonly plan: unknown;
    running: boolean;
}
export interface WindowLifecycleBoundary {
    readonly retireEntry: (entry: unknown, reason: unknown, details?: unknown, options?: unknown) => boolean;
    readonly setEntryVisible: (entry: unknown, visible: unknown, details?: unknown) => boolean;
    readonly getEntryStatus: (entry: unknown, fallback?: unknown) => unknown;
    readonly isEntryActive: (entry: unknown) => unknown;
    readonly isEntryCompleted: (entry: unknown) => boolean;
    readonly isEntryTranslationPending: (entry: unknown) => unknown;
    readonly notifyRenderCommandReady: (commandId: unknown, details?: unknown) => unknown;
    readonly beginRefresh: (windowInstance: unknown, windowData?: unknown) => WindowRefreshLease | null;
    readonly settleRefreshReturned: (lease: WindowRefreshLease, value: unknown) => WindowRefreshSettlementReceipt;
    readonly settleRefreshThrew: (lease: WindowRefreshLease, error: unknown) => WindowRefreshSettlementReceipt;
    readonly getRefreshState: (windowInstance: unknown, windowData?: unknown) => WindowRefreshState;
    readonly getRefreshInitialContents: (windowInstance: unknown) => unknown;
    readonly recordRefreshContentsAssignment: (windowInstance: unknown, windowData: unknown, contents: unknown) => boolean;
    readonly appendRefreshSurfaceJournal: (windowInstance: unknown, surface: unknown, value: unknown) => WindowRefreshSurfaceJournalRecord | null;
    readonly registerRefreshParticipant: <Prepared>(participant: WindowRefreshParticipant<Prepared>) => WindowRefreshParticipantRegistration;
    readonly releaseRefreshParticipant: (registration: WindowRefreshParticipantRegistration) => boolean;
    readonly beginRenderDrain: (windowInstance: unknown, windowData?: unknown, reason?: unknown) => RenderDrainToken | null;
    readonly finishRenderDrain: (windowInstance: unknown, token?: unknown, windowData?: unknown) => void;
    readonly withRenderDrain: (windowInstance: unknown, windowData?: unknown, reason?: unknown, callback?: unknown) => unknown;
    readonly getRenderDrainState: (windowInstance: unknown, windowData?: unknown) => RenderDrainState;
    readonly isRenderDrainActive: (windowInstance: unknown, windowData?: unknown) => boolean;
    readonly markEntryObservedInRefresh: (entry: unknown, windowInstance: unknown, windowData?: unknown) => number;
    readonly wasEntryObservedInRefresh: (entry: unknown, windowInstance: unknown, windowData?: unknown) => boolean;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRecordObject(value: unknown): value is PropertyBag {
    return typeof value === 'object' && value !== null;
}
function isUnknownArray(value: unknown): value is unknown[] {
    return arrayIsArray(value);
}
function isRuntimeCallback(value: unknown): value is RuntimeCallback {
    return typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function setProperty(target: unknown, key: PropertyKey, value: unknown): void {
    if (!isPropertyBag(target))
        throw new IntrinsicTypeError('Window lifecycle state must accept properties.');
    target[key] = value;
}
function deleteProperty(target: unknown, key: PropertyKey): void {
    if (!isPropertyBag(target))
        throw new IntrinsicTypeError('Window lifecycle state must accept property deletion.');
    if (!reflectDeleteProperty(target, key)) {
        throw new IntrinsicTypeError('Window lifecycle property could not be deleted.');
    }
}
function hasMethod(target: unknown, name: PropertyKey): boolean {
    return typeof propertyValue(target, name) === 'function';
}
function callMethod(target: unknown, name: PropertyKey, args: readonly unknown[], description: string): unknown {
    const method = propertyValue(target, name);
    if (typeof method !== 'function')
        throw new IntrinsicTypeError(description + ' is not callable.');
    return apply(method, target, args);
}
function stringValue(value: unknown): string {
    const converted: unknown = apply(String, undefined, [value]);
    if (typeof converted !== 'string')
        throw new IntrinsicTypeError('String conversion did not return text.');
    return converted;
}
function numberValue(value: unknown): number {
    const converted: unknown = apply(Number, undefined, [value]);
    if (typeof converted !== 'number')
        throw new IntrinsicTypeError('Number conversion did not return a number.');
    return converted;
}
function positiveInteger(value: unknown): number {
    const number = numberValue(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
function firstTruthy(...values: readonly unknown[]): unknown {
    for (let index = 0; index < values.length - 1; index += 1) {
        if (values[index])
            return values[index];
    }
    return values.length > 0 ? values[values.length - 1] : undefined;
}
function truthyOr<Value, Fallback>(value: Value, fallback: () => Fallback): Value | Fallback {
    if (value)
        return value;
    return fallback();
}
function normalizeRecord(value: unknown): PropertyBag {
    return isRecordObject(value) ? value : {};
}
function createUnavailableRenderCommandResult(commandId: unknown): PropertyBag {
    return {
        status: 'unavailable',
        handled: false,
        changed: false,
        terminal: true,
        commandId: stringValue(firstTruthy(commandId, '')),
        reason: 'notifyRenderCommandReady unavailable',
    };
}
export function createWindowLifecycleBoundary(entryLifecycle: EntryLifecycleModule, options: unknown = {}): WindowLifecycleBoundary {
    const source = normalizeRecord(options);
    const adapterContract = firstTruthy(propertyValue(source, 'adapterContract'), null);
    const windowRegistry = firstTruthy(propertyValue(source, 'windowRegistry'), null);
    const refreshContentsBoundary = firstTruthy(propertyValue(source, 'refreshContentsBoundary'), null);
    const refreshSessions = createWindowRefreshSessionAuthority();
    const refreshContexts = new IntrinsicMap<number, BoundaryRefreshContext>();
    const pendingContentsSettlements = new IntrinsicWeakMap<PropertyBag, PendingWindowContentsSettlement>();
    let nextRenderDrainToken = 0;
    refreshSessions.registerParticipant({
        name: 'window-contents-lifecycle',
        prepare: prepareWindowLifecycleRefresh,
        settle: settleWindowLifecycleRefresh,
        fail: failWindowLifecycleRefresh,
        discard: discardWindowLifecycleRefresh,
    });
    function getWindowData(windowInstance: unknown, windowData: unknown = null): unknown {
        if (windowData)
            return windowData;
        if (!windowInstance || !windowRegistry || !hasMethod(windowRegistry, 'get'))
            return null;
        try {
            return firstTruthy(callMethod(windowRegistry, 'get', [windowInstance], 'window registry get'), null);
        }
        catch {
            return null;
        }
    }
    function beginRefresh(windowInstance: unknown, windowData: unknown = null): WindowRefreshLease | null {
        if (!isPropertyBag(windowInstance))
            return null;
        drainPendingWindowContentsSettlement(windowInstance);
        const lease = refreshSessions.begin(windowInstance);
        try {
            const data = getWindowData(windowInstance, windowData);
            if (lease.outermost) {
                const initialContents = firstTruthy(propertyValue(data, 'contentsBitmap'), propertyValue(windowInstance, 'contents'), null);
                privateMapSet(refreshContexts, lease.sessionId, {
                    sessionId: lease.sessionId,
                    window: windowInstance,
                    initialContents,
                    assignedContents: new IntrinsicSet<unknown>(),
                    observedEntries: new IntrinsicSet<PropertyBag>(),
                    windowData: data,
                    contentsPlan: null,
                    contentsTerminalReceipt: null,
                    contentsTerminal: false,
                    contentsPreparationFailure: null,
                    contentsSettlement: 'unprepared',
                });
            }
            else {
                const context = privateMapGet(refreshContexts, lease.sessionId);
                if (context && !context.windowData && data)
                    context.windowData = data;
            }
            return lease;
        }
        catch (error) {
            refreshSessions.settleThrew(lease, error);
            throw error;
        }
    }
    function settleRefreshReturned(lease: WindowRefreshLease, value: unknown): WindowRefreshSettlementReceipt {
        return refreshSessions.settleReturned(lease, value);
    }
    function settleRefreshThrew(lease: WindowRefreshLease, error: unknown): WindowRefreshSettlementReceipt {
        return refreshSessions.settleThrew(lease, error);
    }
    function getRefreshState(windowInstance: unknown): WindowRefreshState {
        return refreshSessions.getActiveState(windowInstance);
    }
    function getRefreshInitialContents(windowInstance: unknown): unknown {
        const state = refreshSessions.getActiveState(windowInstance);
        return state.active ? (privateMapGet(refreshContexts, state.sessionId)?.initialContents ?? null) : null;
    }
    function registerRefreshParticipant<Prepared>(participant: WindowRefreshParticipant<Prepared>): WindowRefreshParticipantRegistration {
        return refreshSessions.registerParticipant(participant);
    }
    function releaseRefreshParticipant(registration: WindowRefreshParticipantRegistration): boolean {
        return refreshSessions.releaseParticipant(registration);
    }
    function beginRenderDrain(windowInstance: unknown, windowData: unknown = null, reason: unknown = 'window-render-drain'): RenderDrainToken | null {
        if (!windowInstance)
            return null;
        const data = getWindowData(windowInstance, windowData);
        if (!data)
            return null;
        const token: RenderDrainToken = {
            id: ++nextRenderDrainToken,
            reason: stringValue(firstTruthy(reason, 'window-render-drain')),
        };
        const stackValue = propertyValue(data, '_trRenderDrainStack');
        const stack = isUnknownArray(stackValue) ? stackValue : [];
        apply(arrayPush, stack, [token]);
        setProperty(data, '_trRenderDrainStack', stack);
        setProperty(data, '_trRenderDrainDepth', stack.length);
        setProperty(data, '_trRenderDrainReason', token.reason);
        const windowDepth = numberValue(propertyValue(windowInstance, '_trRenderDrainDepth')) || 0;
        setProperty(windowInstance, '_trRenderDrainDepth', windowDepth + 1);
        setProperty(windowInstance, '_trRenderDrainReason', token.reason);
        return token;
    }
    function finishRenderDrain(windowInstance: unknown, token: unknown = null, windowData: unknown = null): void {
        if (!windowInstance)
            return;
        const data = getWindowData(windowInstance, windowData);
        if (data) {
            const stackValue = propertyValue(data, '_trRenderDrainStack');
            const stack = isUnknownArray(stackValue) ? stackValue : [];
            if (stack.length > 0) {
                if (token && stack[stack.length - 1] !== token) {
                    const index = apply(arrayIndexOf, stack, [token]);
                    if (index >= 0)
                        apply(arraySplice, stack, [index, 1]);
                }
                else {
                    apply(arrayPop, stack, []);
                }
            }
            setProperty(data, '_trRenderDrainDepth', stack.length);
            const current = stack.length > 0 ? stack[stack.length - 1] : null;
            setProperty(data, '_trRenderDrainReason', current ? propertyValue(current, 'reason') : '');
            if (stack.length === 0)
                deleteProperty(data, '_trRenderDrainStack');
        }
        const currentWindowDepth = numberValue(propertyValue(windowInstance, '_trRenderDrainDepth')) || 1;
        const nextWindowDepth = Math.max(0, currentWindowDepth - 1);
        setProperty(windowInstance, '_trRenderDrainDepth', nextWindowDepth);
        if (nextWindowDepth > 0) {
            const state = getRenderDrainState(windowInstance, data);
            setProperty(windowInstance, '_trRenderDrainReason', firstTruthy(state.reason, ''));
        }
        else {
            deleteProperty(windowInstance, '_trRenderDrainReason');
        }
    }
    function withRenderDrain(windowInstance: unknown, windowData: unknown = null, reason: unknown = 'window-render-drain', callback: unknown = null): unknown {
        if (typeof callback !== 'function')
            return undefined;
        const token = beginRenderDrain(windowInstance, windowData, reason);
        if (!token)
            return apply(callback, undefined, []);
        try {
            return apply(callback, undefined, []);
        }
        finally {
            finishRenderDrain(windowInstance, token, windowData);
        }
    }
    function getRenderDrainState(windowInstance: unknown, windowData: unknown = null): RenderDrainState {
        const data = getWindowData(windowInstance, windowData);
        const dataDepth = positiveInteger(propertyValue(data, '_trRenderDrainDepth'));
        const windowDepth = positiveInteger(propertyValue(windowInstance, '_trRenderDrainDepth'));
        const stackValue = propertyValue(data, '_trRenderDrainStack');
        const stack = data && isUnknownArray(stackValue) ? stackValue : [];
        const current = stack.length > 0 ? stack[stack.length - 1] : null;
        const currentReason = propertyValue(current, 'reason');
        return {
            active: dataDepth > 0 || windowDepth > 0,
            depth: Math.max(dataDepth, windowDepth),
            dataDepth,
            windowDepth,
            reason: truthyOr(currentReason, () => stringValue(truthyOr(propertyValue(data, '_trRenderDrainReason'), () => truthyOr(propertyValue(windowInstance, '_trRenderDrainReason'), () => '')))),
        };
    }
    function isRenderDrainActive(windowInstance: unknown, windowData: unknown = null): boolean {
        return getRenderDrainState(windowInstance, windowData).active;
    }
    function markEntryObservedInRefresh(entry: unknown, windowInstance: unknown): number {
        if (!isPropertyBag(entry))
            return 0;
        const state = getRefreshState(windowInstance);
        if (!state.active)
            return 0;
        const context = privateMapGet(refreshContexts, state.sessionId);
        if (!context)
            return 0;
        apply(setAdd, context.observedEntries, [entry]);
        return state.sessionId;
    }
    function wasEntryObservedInRefresh(entry: unknown, windowInstance: unknown): boolean {
        if (!isPropertyBag(entry))
            return false;
        const state = getRefreshState(windowInstance);
        const context = state.active ? privateMapGet(refreshContexts, state.sessionId) : undefined;
        return context ? apply(setHas, context.observedEntries, [entry]) : false;
    }
    function appendRefreshSurfaceJournal(windowInstance: unknown, surface: unknown, value: unknown): WindowRefreshSurfaceJournalRecord | null {
        const lease = refreshSessions.getActiveLease(windowInstance);
        if (!lease || !isPropertyBag(surface))
            return null;
        return refreshSessions.appendSurfaceJournal(lease, surface, value);
    }
    function recordRefreshContentsAssignment(windowInstance: unknown, windowData: unknown, contents: unknown): boolean {
        if (!isPropertyBag(contents))
            return false;
        const state = refreshSessions.getActiveState(windowInstance);
        if (!state.active)
            return false;
        const context = privateMapGet(refreshContexts, state.sessionId);
        if (!context)
            return false;
        if (!context.windowData && windowData)
            context.windowData = windowData;
        apply(setAdd, context.assignedContents, [contents]);
        return true;
    }
    function prepareWindowLifecycleRefresh(snapshot: WindowRefreshSessionSnapshot): BoundaryRefreshContext {
        const context = privateMapGet(refreshContexts, snapshot.id);
        if (context === undefined) {
            throw new IntrinsicTypeError('Window refresh boundary lost its outer-session context.');
        }
        if (context.window !== snapshot.window) {
            throw new IntrinsicTypeError('Window refresh boundary lost its outer-session context.');
        }
        context.contentsSettlement = 'prepared';
        try {
            context.contentsPlan = prepareWindowContentsSettlement(context);
        }
        catch (error) {
            context.contentsSettlement = 'preparation-failed';
            context.contentsPreparationFailure = error;
        }
        return context;
    }
    function settleWindowLifecycleRefresh(context: BoundaryRefreshContext): void {
        if (context.contentsSettlement === 'complete')
            return;
        if (context.contentsSettlement === 'preparation-failed') {
            if (Error.isError(context.contentsPreparationFailure))
                throw context.contentsPreparationFailure;
            throw new Error('Window refresh contents preparation failed.', {
                cause: context.contentsPreparationFailure,
            });
        }
        const settlement = settleContextWindowContents(context, 'settle', null);
        if (propertyValue(settlement, 'terminal') !== true) {
            if (propertyValue(settlement, 'status') === 'superseded') {
                context.contentsSettlement = 'complete';
                releaseRefreshContext(context);
                return;
            }
            context.contentsSettlement = 'pending';
            retainPendingWindowContentsSettlement(context);
            throw new Error('Window refresh contents settlement remains nonterminal.');
        }
        finishTerminalWindowContentsSettlement(context, settlement);
    }
    function failWindowLifecycleRefresh(context: BoundaryRefreshContext, cause: unknown): void {
        if (context.contentsSettlement === 'complete')
            return;
        if (context.contentsSettlement !== 'preparation-failed') {
            let settlement: unknown;
            try {
                settlement = settleContextWindowContents(context, 'fail', cause);
            }
            catch (error) {
                context.contentsSettlement = 'pending';
                retainPendingWindowContentsSettlement(context);
                throw error;
            }
            if (propertyValue(settlement, 'terminal') !== true) {
                if (propertyValue(settlement, 'status') === 'superseded') {
                    context.contentsSettlement = 'complete';
                    releaseRefreshContext(context);
                    return;
                }
                context.contentsSettlement = 'pending';
                retainPendingWindowContentsSettlement(context);
                return;
            }
            finishTerminalWindowContentsSettlement(context, settlement);
            return;
        }
        context.contentsSettlement = 'complete';
        releaseRefreshContext(context);
    }
    function discardWindowLifecycleRefresh(context: BoundaryRefreshContext): void {
        if (context.contentsSettlement === 'complete')
            return;
        context.contentsSettlement = 'complete';
        releaseRefreshContext(context);
    }
    function prepareWindowContentsSettlement(context: BoundaryRefreshContext): unknown {
        const prepare = propertyValue(refreshContentsBoundary, 'prepare');
        if (!isRuntimeCallback(prepare))
            return null;
        return apply(prepare, refreshContentsBoundary, [
            context.window,
            context.windowData,
            freezeObject({
                sessionId: context.sessionId,
                initialContents: context.initialContents,
                assignedContents: freezeObject(apply(arrayFrom, Array, [context.assignedContents]) as unknown[]),
            }),
        ]);
    }
    function retainPendingWindowContentsSettlement(context: BoundaryRefreshContext): PendingWindowContentsSettlement {
        const retained = privateWeakMapGet(pendingContentsSettlements, context.window);
        if (retained?.context === context && retained.plan === context.contentsPlan)
            return retained;
        if (retained) {
            throw new Error('Window refresh contents settlement already has an unresolved predecessor.');
        }
        const pending: PendingWindowContentsSettlement = {
            context,
            plan: context.contentsPlan,
            running: false,
        };
        privateWeakMapSet(pendingContentsSettlements, context.window, pending);
        return pending;
    }
    function drainPendingWindowContentsSettlement(windowInstance: PropertyBag): void {
        const pending = privateWeakMapGet(pendingContentsSettlements, windowInstance);
        if (!pending)
            return;
        if (pending.running) {
            throw new Error('Window refresh contents settlement is already resuming.');
        }
        pending.running = true;
        try {
            const settlement = settleContextWindowContents(pending.context, 'settle', null);
            if (propertyValue(settlement, 'terminal') !== true) {
                throw new Error('Window refresh contents settlement remains nonterminal.');
            }
            finishTerminalWindowContentsSettlement(pending.context, settlement, pending);
        }
        finally {
            pending.running = false;
        }
    }
    function settlePreparedWindowContents(plan: unknown, methodName: 'settle' | 'fail', cause: unknown): unknown {
        if (!plan)
            return null;
        const method = propertyValue(plan, methodName);
        if (!isRuntimeCallback(method)) {
            throw new IntrinsicTypeError(`Window refresh contents plan requires a ${methodName} callback.`);
        }
        return apply(method, plan, methodName === 'fail' ? [cause] : []);
    }
    function settleContextWindowContents(context: BoundaryRefreshContext, methodName: 'settle' | 'fail', cause: unknown): unknown {
        if (context.contentsTerminal)
            return context.contentsTerminalReceipt;
        const settlement = settlePreparedWindowContents(context.contentsPlan, methodName, cause);
        if (propertyValue(settlement, 'terminal') === true) {
            context.contentsTerminalReceipt = settlement;
            context.contentsTerminal = true;
        }
        return settlement;
    }
    function finishTerminalWindowContentsSettlement(context: BoundaryRefreshContext, _settlement: unknown, runningPending: PendingWindowContentsSettlement | null = null): void {
        const pending = privateWeakMapGet(pendingContentsSettlements, context.window);
        if (runningPending && pending !== runningPending) {
            throw new Error('Window refresh contents settlement changed its pending authority.');
        }
        if (pending?.context === context)
            apply(weakMapDelete, pendingContentsSettlements, [context.window]);
        context.contentsSettlement = 'complete';
        releaseRefreshContext(context);
    }
    function releaseRefreshContext(context: BoundaryRefreshContext): void {
        if (privateMapGet(refreshContexts, context.sessionId) === context) {
            apply(mapDelete, refreshContexts, [context.sessionId]);
        }
        apply(setClear, context.assignedContents, []);
        apply(setClear, context.observedEntries, []);
    }
    function retireEntry(entry: unknown, reason: unknown, details: unknown = null, optionsValue: unknown = {}): boolean {
        const receipt = retireEntryReceipt(entry, reason, details, optionsValue);
        return classifyItemRetirementReceipt(entry, receipt) === 'settled';
    }
    function classifyItemRetirementReceipt(target: unknown, receipt: unknown): string {
        if (!adapterContract || !hasMethod(adapterContract, 'classifyItemRetirementReceipt'))
            return 'retry';
        try {
            const disposition = callMethod(adapterContract, 'classifyItemRetirementReceipt', [target, receipt], 'adapter item-retirement receipt classifier');
            return disposition === 'settled' || disposition === 'quarantined' ? disposition : 'retry';
        }
        catch {
            return 'retry';
        }
    }
    function retireEntryReceipt(entry: unknown, reason: unknown, details: unknown = null, optionsValue: unknown = {}): unknown {
        if (!entry || !propertyValue(entry, 'recordId'))
            return false;
        if (!adapterContract || !hasMethod(adapterContract, 'retireItem'))
            return false;
        if (optionsValue === null)
            throw new IntrinsicTypeError('Retirement options cannot be null.');
        const eventType = firstTruthy(propertyValue(optionsValue, 'eventType'), 'item.disappeared');
        const policy = propertyValue(optionsValue, 'policy');
        return callMethod(adapterContract, 'retireItem', [
            entry,
            'disappeared',
            {
                eventType,
                message: firstTruthy(reason, ''),
                policy: isRecordObject(policy) ? policy : { kind: 'retired' },
                details,
            },
        ], 'adapter item retirement');
    }
    function setEntryVisible(entry: unknown, visible: unknown, details: unknown = {}): boolean {
        if (!entry || !propertyValue(entry, 'recordId') || !isEntryActive(entry))
            return false;
        const isVisible = visible === true;
        try {
            if (adapterContract && hasMethod(adapterContract, 'setItemVisibility')) {
                callMethod(adapterContract, 'setItemVisibility', [entry, isVisible, firstTruthy(details, {})], 'adapter item visibility');
            }
        }
        catch {
        }
        callMethod(entryLifecycle, 'setSurfaceVisible', [entry, isVisible, firstTruthy(details, {})], 'entry surface visibility');
        return true;
    }
    function getEntryStatus(entry: unknown, fallback: unknown = ''): unknown {
        if (!entry || !propertyValue(entry, 'recordId'))
            return stringValue(firstTruthy(fallback, ''));
        if (adapterContract && hasMethod(adapterContract, 'getRecordStatus')) {
            return callMethod(adapterContract, 'getRecordStatus', [entry, fallback], 'adapter record status');
        }
        return stringValue(firstTruthy(fallback, ''));
    }
    function isEntryActive(entry: unknown): unknown {
        if (!entry || !propertyValue(entry, 'recordId'))
            return false;
        if (adapterContract && hasMethod(adapterContract, 'isRecordActive')) {
            return callMethod(adapterContract, 'isRecordActive', [entry], 'adapter active-record check');
        }
        return false;
    }
    function isEntryCompleted(entry: unknown): boolean {
        return getEntryStatus(entry) === 'completed';
    }
    function isEntryTranslationPending(entry: unknown): unknown {
        if (!entry || !propertyValue(entry, 'recordId'))
            return false;
        if (adapterContract && hasMethod(adapterContract, 'isRecordRequestActive')) {
            return callMethod(adapterContract, 'isRecordRequestActive', [entry], 'adapter active-request check');
        }
        const status = getEntryStatus(entry);
        return status === 'pending' || status === 'translating';
    }
    function notifyRenderCommandReady(commandId: unknown, details: unknown = {}): unknown {
        if (!adapterContract || !hasMethod(adapterContract, 'notifyRenderCommandReady')) {
            return createUnavailableRenderCommandResult(commandId);
        }
        return callMethod(adapterContract, 'notifyRenderCommandReady', [commandId, firstTruthy(details, {})], 'adapter render-command readiness');
    }
    return {
        retireEntry,
        setEntryVisible,
        getEntryStatus,
        isEntryActive,
        isEntryCompleted,
        isEntryTranslationPending,
        notifyRenderCommandReady,
        beginRefresh,
        settleRefreshReturned,
        settleRefreshThrew,
        getRefreshState,
        getRefreshInitialContents,
        recordRefreshContentsAssignment,
        appendRefreshSurfaceJournal,
        registerRefreshParticipant,
        releaseRefreshParticipant,
        beginRenderDrain,
        finishRenderDrain,
        withRenderDrain,
        getRenderDrainState,
        isRenderDrainActive,
        markEntryObservedInRefresh,
        wasEntryObservedInRefresh,
    };
}
