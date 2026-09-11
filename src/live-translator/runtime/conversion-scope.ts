import { createConversionSnapshotJournal, type ConversionSnapshotFailureDetail, type ConversionSnapshotJournal, type ConversionSnapshotRestoreAttempt, type ConversionSnapshotTargetRole, } from './conversion-snapshot.js';
type PropertySource = Record<PropertyKey, unknown>;
type UnknownFunction = (...args: unknown[]) => unknown;
export type ConversionTargetRole = ConversionSnapshotTargetRole;
export type ConversionTransactionPhase = 'open' | 'admitting' | 'executing' | 'aborting' | 'restoring' | 'restored' | 'admission-failed' | 'recovery-pending' | 'quarantined';
export type ConversionScopeFailureCode = 'conversion-admission-failed' | 'conversion-restoration-failed' | 'conversion-transaction-state-invalid';
export type ConversionScopeFailureDetail = ConversionSnapshotFailureDetail;
export interface ConversionScopeFailure extends Error {
    readonly code: ConversionScopeFailureCode;
    readonly transactionId: number;
    readonly transactionPhase: ConversionTransactionPhase;
    readonly failures: readonly ConversionScopeFailureDetail[];
    readonly callbackError: unknown;
}
export interface ConversionRouteResult {
    handled: boolean;
    result: unknown;
    routed?: boolean;
}
interface ConversionTargetAuthority {
    readonly source: PropertySource;
    sink: PropertySource | null;
    readonly role: ConversionTargetRole;
}
export interface ConversionTransaction extends PropertySource {
    readonly __trConversionScopeTransaction: true;
    readonly id: number;
    readonly reason: string;
    readonly rootWindow: unknown;
    readonly gameMessage: unknown;
}
export interface ConversionScopeModule {
    createTransaction(options?: unknown): ConversionTransaction;
    run<Prepared, Result>(transaction: ConversionTransaction, admit: () => Prepared, execute: (prepared: Prepared) => Result): Result;
    current(): ConversionTransaction | null;
    isActive(): boolean;
    registerTarget(transactionOrSource?: unknown, sourceMaybe?: unknown, sinkMaybe?: unknown, detailsMaybe?: unknown): boolean;
    getSink(source?: unknown): PropertySource | null;
    getWindowSink(liveWindow?: unknown): PropertySource | null;
    getBitmapSink(liveBitmap?: unknown): PropertySource | null;
    routeMutation(receiver?: unknown, methodName?: unknown, args?: unknown): ConversionRouteResult;
    tryRouteMutation(receiver?: unknown, methodName?: unknown, args?: unknown): ConversionRouteResult | null;
    createMutationRouter(methodName?: unknown, original?: unknown): unknown;
    recordSuppressedSideEffect(details?: unknown): PropertySource | null;
    describeCurrent(): PropertySource | null;
    isFailure(value?: unknown): value is ConversionScopeFailure;
}
interface ConversionTransactionState {
    readonly transaction: ConversionTransaction;
    readonly id: number;
    readonly reason: string;
    readonly targets: WeakMap<PropertySource, ConversionTargetAuthority>;
    readonly targetRecords: ConversionTargetAuthority[];
    readonly snapshotJournal: ConversionSnapshotJournal;
    readonly suppressedSideEffects: PropertySource[];
    phase: ConversionTransactionPhase;
    admissionFailure: ConversionScopeFailure | null;
}
interface RegisterArguments {
    transaction: unknown;
    source: unknown;
    sink: unknown;
    details: unknown;
}
const WINDOW_SNAPSHOT_FIELDS: readonly string[] = [
    '_text',
    'text',
    '_lastNameText',
    'visible',
    'active',
    'openness',
    '_openness',
    'contentsOpacity',
    'x',
    'y',
    'width',
    'height',
    'contents',
];
const BITMAP_SNAPSHOT_FIELDS: readonly string[] = [
    '_canvas',
    '_context',
    '_baseTexture',
    '_dirty',
    'width',
    'height',
    'fontFace',
    'fontSize',
    'fontBold',
    'fontItalic',
    'textColor',
    'outlineColor',
    'outlineWidth',
    'paintOpacity',
];
const reflectApplyIntrinsic = Reflect.apply;
const reflectDefinePropertyIntrinsic = Reflect.defineProperty;
const arrayIsArrayIntrinsic = Array.isArray;
const objectAssignIntrinsic = Object.assign;
const objectFreezeIntrinsic = Object.freeze;
const objectIsFrozenIntrinsic = Object.isFrozen;
const weakMapGetIntrinsic = WeakMap.prototype.get;
const weakMapSetIntrinsic = WeakMap.prototype.set;
const weakSetAddIntrinsic = WeakSet.prototype.add;
const weakSetHasIntrinsic = WeakSet.prototype.has;
const ErrorIntrinsic = Error;
const StringIntrinsic = String;
function callIntrinsic<Arguments extends readonly unknown[], Result>(callback: (...args: Arguments) => Result, receiver: unknown, args: Arguments): Result {
    return reflectApplyIntrinsic(callback, receiver, args as unknown as ArrayLike<unknown>) as Result;
}
function weakMapGet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key): Value | undefined {
    return callIntrinsic(weakMapGetIntrinsic, map, [key]) as Value | undefined;
}
function weakMapSet<Key extends object, Value>(map: WeakMap<Key, Value>, key: Key, value: Value): void {
    const returned = callIntrinsic(weakMapSetIntrinsic, map, [key, value]);
    if (returned !== map)
        throw new TypeError('Conversion scope WeakMap storage lost exact identity.');
}
function weakSetAdd<Value extends object>(set: WeakSet<Value>, value: Value): void {
    const returned = callIntrinsic(weakSetAddIntrinsic, set, [value]);
    if (returned !== set)
        throw new TypeError('Conversion scope WeakSet storage lost exact identity.');
}
function weakSetHas<Value extends object>(set: WeakSet<Value>, value: Value): boolean {
    return callIntrinsic(weakSetHasIntrinsic, set, [value]) === true;
}
function defineExact(target: object, key: PropertyKey, descriptor: PropertyDescriptor): boolean {
    return callIntrinsic(reflectDefinePropertyIntrinsic, Reflect, [target, key, descriptor]) === true;
}
function freezeExact<Value extends object>(value: Value): Value {
    const returned = callIntrinsic(objectFreezeIntrinsic, Object, [value]);
    if (returned !== value || callIntrinsic(objectIsFrozenIntrinsic, Object, [value]) !== true) {
        throw new TypeError('Conversion scope could not freeze its authored record exactly.');
    }
    return value;
}
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isObject(value: unknown): value is PropertySource {
    return typeof value === 'object' && value !== null;
}
function isCallable(value: unknown): value is UnknownFunction {
    return typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertySource(value) ? value[key] : undefined;
}
function invokeUnbound(callback: UnknownFunction, args: unknown[]): unknown {
    return callIntrinsic(reflectApplyIntrinsic, Reflect, [callback, undefined, args]);
}
function invokeMethod(target: unknown, methodName: PropertyKey, args: unknown[]): unknown {
    if (!isPropertySource(target)) {
        throw new TypeError(`Conversion scope receiver for ${String(methodName)} is unavailable.`);
    }
    const method = propertyValue(target, methodName);
    if (!isCallable(method))
        throw new TypeError(`Conversion scope method ${String(methodName)} is not callable.`);
    return callIntrinsic(reflectApplyIntrinsic, Reflect, [method, target, args]);
}
function truthyOr(value: unknown, fallback: unknown): unknown {
    if (value)
        return value;
    return fallback;
}
function stringify(value: unknown): string {
    const converted: unknown = callIntrinsic(reflectApplyIntrinsic, Reflect, [
        StringIntrinsic,
        undefined,
        [value ?? ''],
    ]);
    return typeof converted === 'string' ? converted : '';
}
export function createConversionScopeModule(): ConversionScopeModule {
    const routerToken = 'liveTranslator.conversionScope.router';
    const transactionStack: ConversionTransaction[] = [];
    const transactionStates = new WeakMap<object, ConversionTransactionState>();
    const authoredFailures = new WeakSet<object>();
    const quarantinedTargets = new WeakMap<PropertySource, ConversionScopeFailure>();
    let nextTransactionId = 0;
    function stateFor(value: unknown): ConversionTransactionState | null {
        if (!isPropertySource(value))
            return null;
        return weakMapGet(transactionStates, value) ?? null;
    }
    function admissionFailureFor(state: ConversionTransactionState): ConversionScopeFailure | null {
        return state.admissionFailure;
    }
    function setPhase(state: ConversionTransactionState, phase: ConversionTransactionPhase): void {
        state.phase = phase;
    }
    function createFailureDetail(target: unknown, role: ConversionTargetRole, key: PropertyKey | null, operation: ConversionScopeFailureDetail['operation'], error: unknown): ConversionScopeFailureDetail {
        return freezeExact({ target, role, key, operation, error });
    }
    function createScopeFailure(state: ConversionTransactionState, code: ConversionScopeFailureCode, failures: readonly ConversionScopeFailureDetail[], callbackError?: unknown): ConversionScopeFailure {
        const failureList: ConversionScopeFailureDetail[] = [];
        for (let index = 0; index < failures.length; index += 1) {
            const failure = failures[index];
            if (failure)
                failureList[failureList.length] = failure;
        }
        freezeExact(failureList);
        const error = new ErrorIntrinsic(code === 'conversion-admission-failed'
            ? 'Conversion target admission failed before isolation was complete.'
            : code === 'conversion-restoration-failed'
                ? 'Conversion live-state restoration could not be attested.'
                : 'Conversion transaction is not in a runnable state.') as ConversionScopeFailure;
        const fields: readonly (readonly [
            PropertyKey,
            unknown
        ])[] = [
            ['name', 'ConversionScopeFailure'],
            ['code', code],
            ['transactionId', state.id],
            ['transactionPhase', state.phase],
            ['failures', failureList],
            ['callbackError', callbackError],
        ];
        for (let index = 0; index < fields.length; index += 1) {
            const field = fields[index];
            if (!field)
                continue;
            if (!defineExact(error, field[0], {
                configurable: false,
                enumerable: field[0] !== 'name',
                value: field[1],
                writable: false,
            })) {
                throw new TypeError('Conversion scope failure record could not be authored exactly.');
            }
        }
        weakSetAdd(authoredFailures, error);
        return freezeExact(error);
    }
    function isFailure(value: unknown): value is ConversionScopeFailure {
        return isObject(value) && weakSetHas(authoredFailures, value);
    }
    function markAdmissionFailure(state: ConversionTransactionState, target: unknown, role: ConversionTargetRole, error: unknown, operation: ConversionScopeFailureDetail['operation'] = 'capture'): ConversionScopeFailure {
        if (state.admissionFailure)
            return state.admissionFailure;
        setPhase(state, state.phase === 'admitting' || state.phase === 'executing' ? 'aborting' : 'admission-failed');
        const failure = createScopeFailure(state, 'conversion-admission-failed', [
            createFailureDetail(target, role, null, operation, error),
        ]);
        state.admissionFailure = failure;
        return failure;
    }
    function createTransaction(options: unknown = {}): ConversionTransaction {
        nextTransactionId += 1;
        const reason = stringify(truthyOr(propertyValue(options, 'reason'), 'conversion'));
        const rootWindow = truthyOr(propertyValue(options, 'rootWindow'), null);
        const gameMessage = truthyOr(propertyValue(options, 'gameMessage'), null);
        const transaction: ConversionTransaction = {
            __trConversionScopeTransaction: true,
            id: nextTransactionId,
            reason,
            rootWindow,
            gameMessage,
        };
        const snapshotJournal = createConversionSnapshotJournal((target) => {
            const quarantined = weakMapGet(quarantinedTargets, target as PropertySource);
            if (quarantined)
                throw quarantined;
        });
        const state: ConversionTransactionState = {
            transaction,
            id: nextTransactionId,
            reason,
            targets: new WeakMap<PropertySource, ConversionTargetAuthority>(),
            targetRecords: [],
            snapshotJournal,
            suppressedSideEffects: [],
            phase: 'open',
            admissionFailure: null,
        };
        weakMapSet(transactionStates, transaction, state);
        if (isPropertySource(rootWindow))
            snapshotTarget(transaction, rootWindow, { role: 'window' });
        if (isPropertySource(gameMessage))
            snapshotTarget(transaction, gameMessage, { role: 'gameMessage' });
        return freezeExact(transaction);
    }
    function run<Prepared, Result>(transaction: ConversionTransaction, admit: () => Prepared, execute: (prepared: Prepared) => Result): Result {
        if (!isCallable(admit) || !isCallable(execute)) {
            throw new TypeError('Conversion transactions require separate admission and execution callbacks.');
        }
        const state = stateFor(transaction);
        if (!state)
            throw new TypeError('Conversion transaction authority is unavailable.');
        if (state.phase !== 'open' || state.admissionFailure) {
            const failure = state.admissionFailure ??
                createScopeFailure(state, 'conversion-transaction-state-invalid', [
                    createFailureDetail(transaction, 'transaction', null, 'transition', state.phase),
                ]);
            throw failure;
        }
        const stackBase = transactionStack.length;
        setPhase(state, 'admitting');
        transactionStack[stackBase] = transaction;
        let prepared: Prepared | undefined;
        let result: Result | undefined;
        let callbackError: unknown = undefined;
        let callbackFailed = false;
        try {
            prepared = invokeUnbound(admit, []) as Prepared;
        }
        catch (error) {
            callbackFailed = true;
            callbackError = error;
        }
        if (!callbackFailed && !admissionFailureFor(state)) {
            setPhase(state, 'executing');
            try {
                result = invokeUnbound(execute, [prepared]) as Result;
            }
            catch (error) {
                callbackFailed = true;
                callbackError = error;
            }
        }
        const stackIntact = transactionStack.length === stackBase + 1 && transactionStack[stackBase] === transaction;
        transactionStack.length = stackBase;
        if (!stackIntact) {
            callbackFailed = true;
            callbackError = createScopeFailure(state, 'conversion-transaction-state-invalid', [
                createFailureDetail(transaction, 'transaction', null, 'transition', 'transaction-stack-corrupted'),
            ]);
        }
        const admissionFailure = admissionFailureFor(state);
        if (admissionFailure) {
            const secondaryError = callbackFailed && callbackError !== admissionFailure ? callbackError : undefined;
            callbackFailed = true;
            callbackError = secondaryError
                ? createScopeFailure(state, 'conversion-admission-failed', admissionFailure.failures, secondaryError)
                : admissionFailure;
        }
        setPhase(state, 'restoring');
        const firstRestore = restoreSnapshots(state);
        let finalRestore = firstRestore;
        if (!firstRestore.complete) {
            setPhase(state, 'recovery-pending');
            finalRestore = restoreSnapshots(state);
        }
        if (finalRestore.complete) {
            setPhase(state, 'restored');
            if (callbackFailed)
                throw callbackError;
            return result as Result;
        }
        setPhase(state, 'quarantined');
        const combinedFailures: ConversionScopeFailureDetail[] = [];
        for (let index = 0; index < firstRestore.failures.length; index += 1) {
            const failure = firstRestore.failures[index];
            if (failure)
                combinedFailures[combinedFailures.length] = failure;
        }
        for (let index = 0; index < finalRestore.failures.length; index += 1) {
            const failure = finalRestore.failures[index];
            if (failure)
                combinedFailures[combinedFailures.length] = failure;
        }
        const restorationFailure = createScopeFailure(state, 'conversion-restoration-failed', combinedFailures, callbackFailed ? callbackError : undefined);
        for (let index = 0; index < finalRestore.unrecoveredTargets.length; index += 1) {
            const target = finalRestore.unrecoveredTargets[index];
            if (target)
                weakMapSet(quarantinedTargets, target as PropertySource, restorationFailure);
        }
        throw restorationFailure;
    }
    function current(): ConversionTransaction | null {
        return transactionStack.length ? (transactionStack[transactionStack.length - 1] ?? null) : null;
    }
    function isActive(): boolean {
        return Boolean(current());
    }
    function registerTarget(transactionOrSource?: unknown, sourceMaybe?: unknown, sinkMaybe?: unknown, detailsMaybe?: unknown): boolean {
        const resolved = resolveRegisterArguments(transactionOrSource, sourceMaybe, sinkMaybe, detailsMaybe);
        if (!isTransaction(resolved.transaction) || !isPropertySource(resolved.source))
            return false;
        const transaction = resolved.transaction;
        const state = stateFor(transaction);
        if (!state)
            return false;
        const source = resolved.source;
        const details = isPropertySource(resolved.details) ? resolved.details : {};
        const sink = isPropertySource(resolved.sink) ? resolved.sink : null;
        const role = normalizeRole(truthyOr(propertyValue(details, 'role'), classifyTargetRole(source)));
        if (state.phase !== 'admitting') {
            throw markAdmissionFailure(state, source, role, new ErrorIntrinsic(`Conversion target registration is unavailable during ${state.phase}.`), 'transition');
        }
        const quarantined = weakMapGet(quarantinedTargets, source);
        if (quarantined)
            throw markAdmissionFailure(state, source, role, quarantined);
        let record = weakMapGet(state.targets, source) ?? null;
        if (!record) {
            snapshotTarget(transaction, source, { role, details });
            record = { source, sink, role };
            try {
                weakMapSet(state.targets, source, record);
                state.targetRecords[state.targetRecords.length] = record;
            }
            catch (error) {
                throw markAdmissionFailure(state, source, role, error);
            }
        }
        else if (sink) {
            record.sink = sink;
        }
        return true;
    }
    function getSink(source?: unknown): PropertySource | null {
        const record = findTargetRecord(source);
        return record ? record.sink : null;
    }
    function getWindowSink(liveWindow?: unknown): PropertySource | null {
        return getSink(liveWindow);
    }
    function getBitmapSink(liveBitmap?: unknown): PropertySource | null {
        return getSink(liveBitmap);
    }
    function routeMutation(receiver?: unknown, methodName?: unknown, args: unknown = []): ConversionRouteResult {
        const transaction = current();
        if (!transaction)
            return { handled: false, result: undefined };
        const name = stringify(methodName);
        const record = findTargetRecord(receiver);
        if (!record && !shouldSuppressUnregisteredReceiver(receiver)) {
            return { handled: false, result: undefined };
        }
        const sinkMethod = record?.sink ? propertyValue(record.sink, name) : undefined;
        if (record?.sink && isCallable(sinkMethod)) {
            try {
                const result = invokeMethod(sinkMethod, 'apply', [record.sink, arrayFrom(args)]);
                recordSuppressedSideEffect({
                    methodName: name,
                    role: record.role,
                    routed: true,
                    suppressed: false,
                });
                return { handled: true, result, routed: true };
            }
            catch (error) {
                recordSuppressedSideEffect({
                    methodName: name,
                    role: record.role,
                    routed: true,
                    suppressed: true,
                    error,
                });
                return {
                    handled: true,
                    result: defaultMutationResult(name, receiver),
                    routed: true,
                };
            }
        }
        recordSuppressedSideEffect({
            methodName: name,
            role: record ? record.role : classifyTargetRole(receiver),
            routed: false,
            suppressed: true,
        });
        return {
            handled: true,
            result: defaultMutationResult(name, receiver),
            routed: false,
        };
    }
    function tryRouteMutation(receiver?: unknown, methodName?: unknown, args: unknown = []): ConversionRouteResult | null {
        if (!isActive())
            return null;
        const routed = routeMutation(receiver, methodName, args);
        return routed.handled ? routed : null;
    }
    function createMutationRouter(methodName?: unknown, original?: unknown): unknown {
        const name = stringify(methodName);
        if (!name || !isCallable(original))
            return original;
        if (hasRouterInChain(original))
            return original;
        const wrapped: UnknownFunction & {
            __trConversionScopeRouter?: unknown;
            __trOriginal?: unknown;
        } = function (this: unknown, ...args: unknown[]): unknown {
            const routed = tryRouteMutation(this, name, args);
            if (routed)
                return routed.result;
            return invokeMethod(original, 'apply', [this, args]);
        };
        wrapped.__trConversionScopeRouter = routerToken;
        wrapped.__trOriginal = original;
        return wrapped;
    }
    function recordSuppressedSideEffect(details: unknown = {}): PropertySource | null {
        const transaction = current();
        if (!transaction)
            return null;
        const state = stateFor(transaction);
        if (!state)
            return null;
        const record = callIntrinsic(objectAssignIntrinsic, Object, [
            {
                reason: state.reason,
                timestamp: Date.now(),
            },
            isPropertySource(details) ? details : {},
        ]) as PropertySource;
        state.suppressedSideEffects[state.suppressedSideEffects.length] = record;
        return record;
    }
    function describeCurrent(): PropertySource | null {
        const transaction = current();
        if (!transaction)
            return null;
        const state = stateFor(transaction);
        if (!state)
            return null;
        return {
            id: state.id,
            reason: state.reason,
            phase: state.phase,
            targetCount: state.targetRecords.length,
            suppressedSideEffectCount: state.suppressedSideEffects.length,
        };
    }
    function resolveRegisterArguments(transactionOrSource: unknown, sourceMaybe: unknown, sinkMaybe: unknown, detailsMaybe: unknown): RegisterArguments {
        if (isTransaction(transactionOrSource)) {
            return {
                transaction: transactionOrSource,
                source: sourceMaybe,
                sink: sinkMaybe,
                details: truthyOr(detailsMaybe, {}),
            };
        }
        return {
            transaction: current(),
            source: transactionOrSource,
            sink: sourceMaybe,
            details: truthyOr(sinkMaybe, {}),
        };
    }
    function findTargetRecord(source: unknown): ConversionTargetAuthority | null {
        if (!isPropertySource(source))
            return null;
        for (let index = transactionStack.length - 1; index >= 0; index -= 1) {
            const transaction = transactionStack[index];
            if (!transaction)
                continue;
            const state = stateFor(transaction);
            const record = state ? weakMapGet(state.targets, source) : null;
            if (record)
                return record;
        }
        return null;
    }
    function snapshotTarget(transaction: unknown, target: unknown, details: unknown = {}): boolean {
        if (!isTransaction(transaction) || !isPropertySource(target))
            return false;
        const state = stateFor(transaction);
        if (!state)
            return false;
        const role = normalizeRole(truthyOr(propertyValue(details, 'role'), classifyTargetRole(target)));
        const quarantined = weakMapGet(quarantinedTargets, target);
        if (quarantined)
            throw markAdmissionFailure(state, target, role, quarantined);
        try {
            return state.snapshotJournal.capture(target, role, snapshotFieldsForRole(role));
        }
        catch (error) {
            throw markAdmissionFailure(state, target, role, error);
        }
    }
    function snapshotFieldsForRole(role: ConversionTargetRole): readonly PropertyKey[] {
        if (role === 'window')
            return WINDOW_SNAPSHOT_FIELDS;
        if (role === 'bitmap')
            return BITMAP_SNAPSHOT_FIELDS;
        return [];
    }
    function restoreSnapshots(state: ConversionTransactionState): ConversionSnapshotRestoreAttempt {
        return state.snapshotJournal.restore();
    }
    function hasRouterInChain(callback: unknown): boolean {
        let currentCallback = callback;
        let depth = 0;
        while (isCallable(currentCallback) && depth < 20) {
            if (propertyValue(currentCallback, '__trConversionScopeRouter') === routerToken)
                return true;
            currentCallback = propertyValue(currentCallback, '__trOriginal');
            depth += 1;
        }
        return false;
    }
    function shouldSuppressUnregisteredReceiver(receiver: unknown): boolean {
        const role = classifyTargetRole(receiver);
        return role === 'window' || role === 'bitmap';
    }
    function classifyTargetRole(source: unknown): ConversionTargetRole {
        if (isWindowLikeValue(source))
            return 'window';
        if (isBitmapLikeValue(source))
            return 'bitmap';
        return 'object';
    }
    function normalizeRole(role: unknown): ConversionTargetRole {
        const value = stringify(truthyOr(role, '')).toLowerCase();
        if (value === 'bitmap' || value === 'bitmap-sink')
            return 'bitmap';
        if (value === 'window' || value === 'window-sink')
            return 'window';
        if (value === 'gamemessage' || value === 'game-message')
            return 'gameMessage';
        return value || 'object';
    }
    function defaultMutationResult(methodName: string, receiver: unknown): unknown {
        if (methodName === 'drawText' || methodName === 'drawTextEx' || methodName === 'drawTextEx2')
            return 0;
        if (methodName === 'refresh')
            return '';
        if (methodName === 'setText' ||
            methodName === 'show' ||
            methodName === 'hide' ||
            methodName === 'open' ||
            methodName === 'close' ||
            methodName === 'activate' ||
            methodName === 'deactivate' ||
            methodName === 'setBackgroundType') {
            return receiver;
        }
        return undefined;
    }
    function arrayFrom(value: unknown): unknown {
        if (arrayIsArrayIntrinsic(value))
            return value;
        const candidate = value && typeof propertyValue(value, 'length') === 'number' ? value : [];
        return invokeMethod(Array.prototype.slice, 'call', [candidate]);
    }
    function isTransaction(value: unknown): value is ConversionTransaction {
        return stateFor(value) !== null;
    }
    function isWindowLikeValue(value: unknown): boolean {
        return (isPropertySource(value) &&
            (isCallable(propertyValue(value, 'open')) ||
                isCallable(propertyValue(value, 'close')) ||
                isCallable(propertyValue(value, 'activate')) ||
                isCallable(propertyValue(value, 'deactivate')) ||
                isCallable(propertyValue(value, 'drawText')) ||
                isCallable(propertyValue(value, 'drawTextEx'))));
    }
    function isBitmapLikeValue(value: unknown): boolean {
        return (isPropertySource(value) &&
            (isCallable(propertyValue(value, 'clear')) ||
                isCallable(propertyValue(value, 'clearRect')) ||
                isCallable(propertyValue(value, 'drawText')) ||
                isCallable(propertyValue(value, 'blt')) ||
                isCallable(propertyValue(value, 'measureTextWidth'))));
    }
    return {
        createTransaction,
        run,
        current,
        isActive,
        registerTarget,
        getSink,
        getWindowSink,
        getBitmapSink,
        routeMutation,
        tryRouteMutation,
        createMutationRouter,
        recordSuppressedSideEffect,
        describeCurrent,
        isFailure,
    };
}
