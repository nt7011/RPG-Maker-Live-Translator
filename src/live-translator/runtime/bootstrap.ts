import { commitDescriptorTransaction, compensateDescriptorTransaction, createDescriptorUpdateFromExpected, descriptorTransactionMatches, getOwnDescriptor, type DescriptorTransactionUpdate, } from './descriptor-transaction.js';
import type { CacheContextDisposalReceipt, CacheContextModule } from './cache-context.js';
import type { BitmapCoreOptions } from './composition/bitmap-core.js';
import type { RuntimeDiagnosticsIngress } from './diagnostics-ingress.js';
import type { RuntimeConfigModule } from './config.js';
import type { LoggerContextModule } from './logger-context.js';
import type { RuntimePathsModule } from './paths.js';
import type { ProviderModule } from './provider.js';
type RuntimeMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
type StringFunction = (value?: unknown) => string;
type CacheReadinessStatus = 'idle' | 'hydrating' | 'ready' | 'failed' | 'disposed';
export type BootstrapPhase = 'published' | 'composing' | 'starting' | 'ready' | 'degraded' | 'failed' | 'disposing' | 'disposed';
interface BootstrapGlobalScope extends Record<PropertyKey, unknown> {
    LiveTranslatorBootstrap?: unknown;
    LiveTranslatorBootstrapState?: unknown;
    LiveTranslatorRuntimeCache?: unknown;
}
interface BootstrapEnvironment {
    readonly scope: BootstrapGlobalScope;
}
interface BootstrapLoggerContext {
    readonly logger: unknown;
}
type BootstrapLoggerCandidate = Readonly<Record<string, RuntimeMethod | undefined>>;
interface BootstrapCacheContext {
    readonly flushDiskCache?: RuntimeMethod;
    readonly hydrateCache?: (this: unknown) => unknown;
    readonly translationService: BitmapCoreOptions['translationService'];
    readonly dispose: RuntimeMethod;
}
interface CacheReadiness {
    readonly status: CacheReadinessStatus;
    readonly generation: number;
    readonly attempt: number;
    readonly retryable: boolean;
    readonly error: string;
}
interface BootstrapSnapshot {
    readonly generation: number;
    readonly phase: BootstrapPhase;
    readonly cache: CacheReadiness;
    readonly runtimeCache: 'pending' | 'published' | 'recovered';
    readonly recovery: 'clean' | 'pending';
    readonly error: string;
}
export interface BootstrapStartResult {
    readonly generation: number;
    readonly phase: BootstrapPhase;
    readonly cache: CacheReadiness;
    readonly error: string;
}
interface Deferred<Value> {
    readonly promise: Promise<Value>;
    readonly resolve: (value: Value) => void;
}
interface ActiveOperation<Value> {
    readonly generation: number;
    readonly deferred: Deferred<Value>;
}
interface StartupReceipt {
    readonly cache: Promise<CacheReadiness>;
    readonly promise: Promise<BootstrapStartResult>;
}
interface CleanupLease {
    readonly callback: RuntimeMethod;
    readonly receiver: unknown;
    readonly terminal: (result: unknown) => boolean;
    done: boolean;
}
interface CleanupLeaseClaim {
    open: boolean;
    lease: CleanupLease | null;
    readonly claim: (lease: unknown) => void;
}
interface PublicationRecovery {
    readonly updates: readonly DescriptorTransactionUpdate[];
    status: 'attempting' | 'committed' | 'clean-rollback' | 'rollback-incomplete' | 'recovered';
}
interface ErrorCandidate {
    readonly message?: unknown;
}
interface BootstrapGenerationClaim {
    active: boolean;
    start: (() => Promise<BootstrapStartResult>) | null;
}
type PropertyBag = Readonly<Record<PropertyKey, unknown>>;
export interface RuntimeBootstrapDependencies {
    readonly configModule: RuntimeConfigModule;
    readonly pathsModule: RuntimePathsModule;
    readonly providerModule: ProviderModule;
    readonly loggerContextModule: LoggerContextModule;
    readonly cacheContextModule: CacheContextModule;
    readonly diagnostics: RuntimeDiagnosticsIngress;
    readonly installBitmapCore: (options: BitmapCoreOptions, settings: unknown) => void;
}
const MAX_CACHE_HYDRATION_ATTEMPTS = 2;
const definePropertyIntrinsic = Object.defineProperty;
const freezeIntrinsic = Object.freeze;
const isFrozenIntrinsic = Object.isFrozen;
const reflectApplyIntrinsic = Reflect.apply;
const PromiseIntrinsic = Promise;
const WeakMapIntrinsic = WeakMap;
const stringIntrinsic: StringFunction = String;
const weakMapGetIntrinsic = captureIntrinsicMethod(WeakMap.prototype, 'get');
const weakMapSetIntrinsic = captureIntrinsicMethod(WeakMap.prototype, 'set');
const weakMapDeleteIntrinsic = captureIntrinsicMethod(WeakMap.prototype, 'delete');
const activeBootstrapGenerations = new WeakMapIntrinsic<object, BootstrapGenerationClaim>();
let nextBootstrapGeneration = 1;
function captureIntrinsicMethod(target: object, key: PropertyKey): RuntimeMethod {
    const descriptor = getOwnDescriptor(target, key);
    if (!descriptor || typeof descriptor.value !== 'function') {
        throw new TypeError(`[LiveTranslator] missing intrinsic method ${stringIntrinsic(key)}.`);
    }
    return descriptor.value as RuntimeMethod;
}
function callRuntimeMethod(method: RuntimeMethod, receiver: unknown, arguments_: readonly unknown[]): unknown {
    return reflectApplyIntrinsic(method, receiver, arguments_ as unknown as ArrayLike<unknown>);
}
function readBootstrapGenerationClaim(scope: object): BootstrapGenerationClaim | undefined {
    return callRuntimeMethod(weakMapGetIntrinsic, activeBootstrapGenerations, [scope]) as BootstrapGenerationClaim | undefined;
}
function publishBootstrapGenerationClaim(scope: object, claim: BootstrapGenerationClaim): void {
    callRuntimeMethod(weakMapSetIntrinsic, activeBootstrapGenerations, [scope, claim]);
}
function releaseBootstrapGenerationClaim(scope: object, claim: BootstrapGenerationClaim): void {
    if (readBootstrapGenerationClaim(scope) !== claim)
        return;
    callRuntimeMethod(weakMapDeleteIntrinsic, activeBootstrapGenerations, [scope]);
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    const returned = freezeIntrinsic(value);
    if (returned !== value || !isFrozenIntrinsic(value)) {
        throw new TypeError('[LiveTranslator] bootstrap could not freeze its exact authored value.');
    }
    return value;
}
function defineExactArrayIndex<Value>(values: Value[], index: number, value: Value): void {
    const returned = definePropertyIntrinsic(values, index, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
    });
    const descriptor = getOwnDescriptor(values, index);
    if (returned !== values ||
        values.length !== index + 1 ||
        descriptor?.configurable !== true ||
        descriptor.enumerable !== true ||
        descriptor.writable !== true ||
        descriptor.value !== value) {
        throw new TypeError('[LiveTranslator] bootstrap could not author an exact private array entry.');
    }
}
function appendExactArrayValue<Value>(values: Value[], value: Value): void {
    defineExactArrayIndex(values, values.length, value);
}
function describeError(error: unknown): string {
    const candidate = error as ErrorCandidate;
    try {
        const message = error ? candidate.message : undefined;
        return stringIntrinsic(message ?? error ?? 'unknown error');
    }
    catch {
        return 'unknown error';
    }
}
function createDeferred<Value>(): Deferred<Value> {
    let resolver: (value: Value) => void = (): never => {
        throw new TypeError('[LiveTranslator] Promise construction did not install a bootstrap resolver.');
    };
    const promise = new PromiseIntrinsic<Value>((resolve) => {
        resolver = resolve;
    });
    return { promise, resolve: resolver };
}
function createResolvedPromise<Value>(value: Value): Promise<Value> {
    return new PromiseIntrinsic<Value>((resolve) => {
        resolve(value);
    });
}
function createCacheReadiness(fields: Partial<CacheReadiness> & Pick<CacheReadiness, 'status'>): CacheReadiness {
    return freezeExact({
        status: fields.status,
        generation: fields.generation ?? 0,
        attempt: fields.attempt ?? 0,
        retryable: fields.retryable === true,
        error: fields.error ?? '',
    });
}
function cacheContextCleanupIsAcknowledged(result: unknown): result is CacheContextDisposalReceipt {
    if (!isPropertyBag(result))
        return false;
    if (!isFrozenIntrinsic(result))
        return false;
    for (const key of ['settlement', 'translationService', 'provider', 'diskCache'] as const) {
        const descriptor = getOwnDescriptor(result, key);
        if (descriptor === undefined || !('value' in descriptor) || descriptor.value !== 'settled')
            return false;
    }
    return true;
}
function bitmapCoreCleanupIsAcknowledged(result: unknown): boolean {
    return result === 'disposed' || result === 'already-disposed' || result === 'ownership-lost';
}
function createCleanupLeaseClaim(label: string, terminal: CleanupLease['terminal']): CleanupLeaseClaim {
    const state: CleanupLeaseClaim = {
        open: true,
        lease: null,
        claim(candidate: unknown): void {
            if (!state.open || state.lease !== null) {
                throw new Error(`[LiveTranslator] ${label} lifetime owner was claimed outside composition.`);
            }
            if (!isPropertyBag(candidate) || !isFrozenIntrinsic(candidate)) {
                throw new TypeError(`[LiveTranslator] ${label} lifetime lease must be an immutable object.`);
            }
            const disposeDescriptor = getOwnDescriptor(candidate, 'dispose');
            if (disposeDescriptor === undefined ||
                !('value' in disposeDescriptor) ||
                typeof disposeDescriptor.value !== 'function') {
                throw new TypeError(`[LiveTranslator] ${label} lifetime lease must own its dispose capability.`);
            }
            state.lease = {
                callback: disposeDescriptor.value as RuntimeMethod,
                receiver: candidate,
                terminal,
                done: false,
            };
        },
    };
    return state;
}
function requireTransferredCleanupLease(claim: CleanupLeaseClaim, label: string): CleanupLease {
    if (claim.lease === null) {
        throw new Error(`[LiveTranslator] ${label} did not transfer its lifetime owner.`);
    }
    return claim.lease;
}
function requireMethod(value: unknown, key: PropertyKey, label: string): RuntimeMethod {
    if (!isPropertyBag(value)) {
        throw new TypeError(`[LiveTranslator] ${label} owner must be an object.`);
    }
    const method = value[key];
    if (typeof method !== 'function') {
        throw new TypeError(`[LiveTranslator] ${label} must be callable.`);
    }
    return method as RuntimeMethod;
}
function createPublicationUpdate(target: object, key: PropertyKey, descriptor: PropertyDescriptor): DescriptorTransactionUpdate {
    const update = createDescriptorUpdateFromExpected(target, key, getOwnDescriptor(target, key), descriptor);
    if (!update) {
        throw new Error(`[LiveTranslator] cannot author bootstrap publication ${stringIntrinsic(key)}.`);
    }
    return update;
}
export function startRuntime(dependencies: RuntimeBootstrapDependencies, { scope: globalScope }: BootstrapEnvironment): Promise<BootstrapStartResult> {
    if (!isPropertyBag(globalScope)) {
        throw new TypeError('[LiveTranslator] bootstrap scope must be an object.');
    }
    const existingGeneration = readBootstrapGenerationClaim(globalScope);
    if (existingGeneration?.active) {
        if (!existingGeneration.start) {
            throw new Error('[LiveTranslator] active bootstrap generation has no startup authority.');
        }
        return existingGeneration.start();
    }
    const generationClaim: BootstrapGenerationClaim = { active: true, start: null };
    const generation = nextBootstrapGeneration;
    nextBootstrapGeneration += 1;
    let cacheState = createCacheReadiness({ status: 'idle' });
    let phase: BootstrapPhase = 'published';
    let runtimeCachePublication: BootstrapSnapshot['runtimeCache'] = 'pending';
    let recovery: BootstrapSnapshot['recovery'] = 'clean';
    let bootstrapError = '';
    let currentSnapshot: BootstrapSnapshot;
    let composing = true;
    let compositionReady = false;
    let disposed = false;
    let disposing = false;
    let cacheContext: BootstrapCacheContext | null = null;
    let logger: unknown = null;
    let loggerCandidate: BootstrapLoggerCandidate = {};
    let activeHydration: ActiveOperation<CacheReadiness> | null = null;
    let lastCacheReceipt = createResolvedPromise(cacheState);
    let lastStartupReceipt: StartupReceipt | null = null;
    const compositionOwner = createDeferred<undefined>();
    let deferredCompositionStart: Promise<BootstrapStartResult> | null = null;
    let deferredCompositionRetry: Promise<BootstrapStartResult> | null = null;
    let hydrationAttempt = 0;
    let nextHydrationGeneration = 1;
    let generationActive = true;
    const bitmapCoreLifetimeClaim = createCleanupLeaseClaim('bitmap core', bitmapCoreCleanupIsAcknowledged);
    const cacheContextLifetimeClaim = createCleanupLeaseClaim('cache context', cacheContextCleanupIsAcknowledged);
    const publicationTransactions: PublicationRecovery[] = [];
    function derivePhase(): BootstrapPhase {
        if (disposed)
            return 'disposed';
        if (disposing)
            return 'disposing';
        if (bootstrapError)
            return 'failed';
        if (!compositionReady)
            return phase;
        if (cacheState.status === 'hydrating' || cacheState.status === 'idle') {
            return 'starting';
        }
        if (cacheState.status === 'failed')
            return 'degraded';
        if (cacheState.status === 'ready')
            return 'ready';
        return 'failed';
    }
    function authorSnapshot(): BootstrapSnapshot {
        phase = derivePhase();
        currentSnapshot = freezeExact({
            generation,
            phase,
            cache: cacheState,
            runtimeCache: runtimeCachePublication,
            recovery,
            error: bootstrapError,
        });
        return currentSnapshot;
    }
    currentSnapshot = freezeExact({
        generation,
        phase,
        cache: cacheState,
        runtimeCache: runtimeCachePublication,
        recovery,
        error: bootstrapError,
    });
    function safeLog(level: string, ...arguments_: unknown[]): void {
        try {
            const method = logger && loggerCandidate[level];
            if (typeof method === 'function') {
                callRuntimeMethod(method as RuntimeMethod, logger, arguments_);
            }
        }
        catch {
        }
    }
    function getBootstrapState(): BootstrapSnapshot {
        return currentSnapshot;
    }
    function createStartupReceipt(cacheReceipt: Promise<CacheReadiness>): Promise<BootstrapStartResult> {
        if (lastStartupReceipt?.cache === cacheReceipt) {
            return lastStartupReceipt.promise;
        }
        const promise = (async (): Promise<BootstrapStartResult> => {
            const cache = await cacheReceipt;
            const snapshot = authorSnapshot();
            return freezeExact({
                generation,
                phase: snapshot.phase,
                cache,
                error: snapshot.error,
            });
        })();
        lastStartupReceipt = { cache: cacheReceipt, promise };
        return promise;
    }
    function shouldHydrate(explicitRetry: boolean): boolean {
        if (!compositionReady || !generationActive || disposed || disposing)
            return false;
        if (cacheState.status === 'idle')
            return true;
        return explicitRetry && cacheState.status === 'failed' && cacheState.retryable;
    }
    function settleHydration(owner: ActiveOperation<CacheReadiness>, status: 'ready' | 'failed', error: unknown = null): void {
        if (activeHydration !== owner)
            return;
        const retryable = status === 'failed' && hydrationAttempt < MAX_CACHE_HYDRATION_ATTEMPTS;
        cacheState = createCacheReadiness({
            status,
            generation: owner.generation,
            attempt: hydrationAttempt,
            retryable,
            error: status === 'failed' ? describeError(error) : '',
        });
        activeHydration = null;
        authorSnapshot();
        owner.deferred.resolve(cacheState);
        lastCacheReceipt = owner.deferred.promise;
        if (status === 'failed')
            safeLog('error', '[DiskCache Hydrate Error]', error);
    }
    async function observeHydration(owner: ActiveOperation<CacheReadiness>, hydration: unknown): Promise<void> {
        try {
            await hydration;
            settleHydration(owner, 'ready');
        }
        catch (error) {
            settleHydration(owner, 'failed', error);
        }
    }
    function beginCacheHydration(explicitRetry: boolean): Promise<CacheReadiness> {
        if (activeHydration)
            return activeHydration.deferred.promise;
        if (!shouldHydrate(explicitRetry))
            return lastCacheReceipt;
        const deferred = createDeferred<CacheReadiness>();
        const owner: ActiveOperation<CacheReadiness> = {
            generation: nextHydrationGeneration,
            deferred,
        };
        nextHydrationGeneration += 1;
        activeHydration = owner;
        hydrationAttempt += 1;
        cacheState = createCacheReadiness({
            status: 'hydrating',
            generation: owner.generation,
            attempt: hydrationAttempt,
            retryable: false,
        });
        authorSnapshot();
        try {
            const method = cacheContext?.hydrateCache;
            if (activeHydration !== owner || !generationActive || disposed || disposing) {
                return owner.deferred.promise;
            }
            const hydration = typeof method === 'function' ? callRuntimeMethod(method, cacheContext, []) : undefined;
            void observeHydration(owner, hydration);
        }
        catch (error) {
            settleHydration(owner, 'failed', error);
        }
        return owner.deferred.promise;
    }
    function startInitialization(): Promise<BootstrapStartResult> {
        if (composing) {
            deferredCompositionStart ??= (async (): Promise<BootstrapStartResult> => {
                await compositionOwner.promise;
                return startInitialization();
            })();
            return deferredCompositionStart;
        }
        const cacheReceipt = beginCacheHydration(false);
        return createStartupReceipt(cacheReceipt);
    }
    function retryIncomplete(): Promise<BootstrapStartResult> {
        if (composing) {
            deferredCompositionRetry ??= (async (): Promise<BootstrapStartResult> => {
                await compositionOwner.promise;
                return retryIncomplete();
            })();
            return deferredCompositionRetry;
        }
        const cacheReceipt = beginCacheHydration(true);
        return createStartupReceipt(cacheReceipt);
    }
    function recoverCleanupLease(lease: CleanupLease | null): boolean {
        if (lease === null || lease.done)
            return true;
        try {
            const result = callRuntimeMethod(lease.callback, lease.receiver, []);
            if (!lease.terminal(result))
                return false;
            lease.done = true;
            return true;
        }
        catch {
            return false;
        }
    }
    function recoverPublications(keepController: boolean): boolean {
        const stopIndex = keepController ? 1 : 0;
        for (let index = publicationTransactions.length - 1; index >= stopIndex; index -= 1) {
            const publication = publicationTransactions[index];
            if (!publication)
                continue;
            if (publication.status === 'clean-rollback' || publication.status === 'recovered')
                continue;
            if (publication.status === 'attempting' || publication.status === 'rollback-incomplete') {
                return false;
            }
            if (!descriptorTransactionMatches(publication.updates, 'prepared')) {
                return false;
            }
            const result = compensateDescriptorTransaction(publication.updates);
            if (result.compensated) {
                publication.status = 'recovered';
                if (runtimeCachePublication === 'published')
                    runtimeCachePublication = 'recovered';
            }
            else {
                return false;
            }
        }
        return true;
    }
    function recoverOwnedGenerationResources(keepController: boolean): boolean {
        if (!recoverCleanupLease(bitmapCoreLifetimeClaim.lease))
            return false;
        if (!recoverCleanupLease(cacheContextLifetimeClaim.lease))
            return false;
        return recoverPublications(keepController);
    }
    function cancelHydrationForDisposal(): void {
        const owner = activeHydration;
        if (!owner)
            return;
        cacheState = createCacheReadiness({
            status: 'disposed',
            generation: owner.generation,
            attempt: hydrationAttempt,
            retryable: false,
            error: 'bootstrap generation disposed',
        });
        activeHydration = null;
        authorSnapshot();
        owner.deferred.resolve(cacheState);
        lastCacheReceipt = owner.deferred.promise;
    }
    function dispose(): boolean {
        if (disposed)
            return true;
        if (disposing)
            return false;
        if (composing) {
            return false;
        }
        disposing = true;
        generationActive = false;
        cancelHydrationForDisposal();
        authorSnapshot();
        const complete = recoverOwnedGenerationResources(false);
        if (!complete) {
            disposing = false;
            recovery = 'pending';
            bootstrapError = bootstrapError || 'bootstrap disposal requires recovery';
            authorSnapshot();
            return false;
        }
        disposed = true;
        disposing = false;
        recovery = 'clean';
        cacheState = createCacheReadiness({
            status: 'disposed',
            generation: cacheState.generation,
            attempt: hydrationAttempt,
        });
        authorSnapshot();
        generationClaim.active = false;
        releaseBootstrapGenerationClaim(globalScope, generationClaim);
        return true;
    }
    function quarantineBootstrapPublication(error: unknown): void {
        composing = false;
        generationActive = false;
        bootstrapError = describeError(error);
        recovery = 'pending';
        cacheState = createCacheReadiness({
            status: 'failed',
            attempt: hydrationAttempt,
            retryable: false,
            error: 'bootstrap publication could not prove a clean rollback',
        });
        lastCacheReceipt = createResolvedPromise(cacheState);
        authorSnapshot();
        compositionOwner.resolve(undefined);
    }
    const bootstrapController = freezeExact({
        start: startInitialization,
        retryIncomplete,
        getState: getBootstrapState,
        dispose,
    });
    function getPublishedBootstrapState(): BootstrapSnapshot {
        return currentSnapshot;
    }
    generationClaim.start = startInitialization;
    publishBootstrapGenerationClaim(globalScope, generationClaim);
    let initialPublication: readonly DescriptorTransactionUpdate[];
    try {
        initialPublication = freezeExact([
            createPublicationUpdate(globalScope, 'LiveTranslatorBootstrap', {
                configurable: true,
                enumerable: true,
                writable: true,
                value: bootstrapController,
            }),
            createPublicationUpdate(globalScope, 'LiveTranslatorBootstrapState', {
                configurable: true,
                enumerable: true,
                get: getPublishedBootstrapState,
            }),
        ]);
    }
    catch (error) {
        quarantineBootstrapPublication(error);
        return startInitialization();
    }
    const initialPublicationRecovery: PublicationRecovery = {
        updates: initialPublication,
        status: 'attempting',
    };
    try {
        appendExactArrayValue(publicationTransactions, initialPublicationRecovery);
    }
    catch (error) {
        generationClaim.active = false;
        releaseBootstrapGenerationClaim(globalScope, generationClaim);
        throw error;
    }
    let initialPublicationResult: ReturnType<typeof commitDescriptorTransaction>;
    try {
        initialPublicationResult = commitDescriptorTransaction(initialPublication);
    }
    catch (error) {
        initialPublicationRecovery.status = 'rollback-incomplete';
        quarantineBootstrapPublication(error);
        return startInitialization();
    }
    if (!initialPublicationResult.committed) {
        initialPublicationRecovery.status = initialPublicationResult.rollbackComplete
            ? 'clean-rollback'
            : 'rollback-incomplete';
        if (!initialPublicationResult.rollbackComplete) {
            quarantineBootstrapPublication(new Error('[LiveTranslator] bootstrap generation publication rollback was incomplete.'));
            return startInitialization();
        }
        generationClaim.active = false;
        releaseBootstrapGenerationClaim(globalScope, generationClaim);
        throw new Error('[LiveTranslator] bootstrap generation publication failed cleanly.');
    }
    initialPublicationRecovery.status = 'committed';
    phase = 'composing';
    authorSnapshot();
    try {
        const configModule = dependencies.configModule;
        const pathsModule = dependencies.pathsModule;
        const providerModule = dependencies.providerModule;
        const loggerContextModule = dependencies.loggerContextModule;
        const cacheContextModule = dependencies.cacheContextModule;
        const diagnostics = dependencies.diagnostics;
        const requireSettings = requireMethod(configModule, 'requireSettings', 'settings factory');
        const settings = callRuntimeMethod(requireSettings, configModule, [globalScope]);
        const getPathContext = requireMethod(pathsModule, 'getPathContext', 'path-context factory');
        const pathContext = callRuntimeMethod(getPathContext, pathsModule, []);
        const createProviderContext = requireMethod(providerModule, 'createProviderContext', 'provider-context factory');
        const providerContext = callRuntimeMethod(createProviderContext, providerModule, [{ scope: globalScope }]);
        const createLoggerContext = requireMethod(loggerContextModule, 'createLoggerContext', 'logger-context factory');
        const loggerContext = callRuntimeMethod(createLoggerContext, loggerContextModule, [
            {
                settings,
                paths: pathContext,
                isLocalProvider: isPropertyBag(providerContext) ? providerContext['isLocalProvider'] : undefined,
            },
        ]) as BootstrapLoggerContext;
        logger = loggerContext.logger;
        loggerCandidate = (isPropertyBag(logger) ? logger : {}) as BootstrapLoggerCandidate;
        safeLog('info', 'LIVE TRANSLATOR BOOTSTRAP LOADED');
        const createCacheContext = requireMethod(cacheContextModule, 'createCacheContext', 'cache-context factory');
        try {
            cacheContext = callRuntimeMethod(createCacheContext, cacheContextModule, [
                {
                    settings,
                    providerContext,
                    loggerContext,
                    paths: pathContext,
                    claimLifetimeOwner: cacheContextLifetimeClaim.claim,
                },
            ]) as BootstrapCacheContext;
        }
        finally {
            cacheContextLifetimeClaim.open = false;
        }
        const claimedCacheContextLifetimeLease = requireTransferredCleanupLease(cacheContextLifetimeClaim, 'cache-context factory');
        const returnedDisposeDescriptor = getOwnDescriptor(cacheContext, 'dispose');
        if (returnedDisposeDescriptor === undefined ||
            !('value' in returnedDisposeDescriptor) ||
            returnedDisposeDescriptor.value !== claimedCacheContextLifetimeLease.callback) {
            throw new Error('[LiveTranslator] cache-context returned a different lifetime owner.');
        }
        const installBitmapCore = requireMethod(dependencies, 'installBitmapCore', 'bitmap-core installer');
        const bitmapCoreOptions: BitmapCoreOptions = {
            scope: globalScope,
            coreGeneration: generation,
            diagnostics,
            translationService: cacheContext.translationService,
            reportFailure: (failure): void => {
                safeLog('error', '[BitmapCore Failure]', failure);
            },
            claimLifetimeOwner: bitmapCoreLifetimeClaim.claim,
        };
        try {
            callRuntimeMethod(installBitmapCore, dependencies, [bitmapCoreOptions, settings]);
        }
        finally {
            bitmapCoreLifetimeClaim.open = false;
        }
        requireTransferredCleanupLease(bitmapCoreLifetimeClaim, 'bitmap-core installer');
        const flushDiskCache = cacheContext.flushDiskCache;
        const runtimeCacheFacade = freezeExact({
            flushDiskCache: typeof flushDiskCache === 'function'
                ? function flushPublishedDiskCache(...arguments_: unknown[]): unknown {
                    if (!generationActive) {
                        throw new Error('[LiveTranslator] bootstrap generation is no longer active.');
                    }
                    return callRuntimeMethod(flushDiskCache, cacheContext, arguments_);
                }
                : async function flushMissingDiskCache(): Promise<void> {
                },
        });
        const cachePublication = freezeExact([
            createPublicationUpdate(globalScope, 'LiveTranslatorRuntimeCache', {
                configurable: true,
                enumerable: true,
                writable: false,
                value: runtimeCacheFacade,
            }),
        ]);
        const cachePublicationRecovery: PublicationRecovery = {
            updates: cachePublication,
            status: 'attempting',
        };
        appendExactArrayValue(publicationTransactions, cachePublicationRecovery);
        let cachePublicationResult: ReturnType<typeof commitDescriptorTransaction>;
        try {
            cachePublicationResult = commitDescriptorTransaction(cachePublication);
        }
        catch (error) {
            cachePublicationRecovery.status = 'rollback-incomplete';
            recovery = 'pending';
            throw error;
        }
        if (!cachePublicationResult.committed) {
            cachePublicationRecovery.status = cachePublicationResult.rollbackComplete
                ? 'clean-rollback'
                : 'rollback-incomplete';
            if (!cachePublicationResult.rollbackComplete) {
                recovery = 'pending';
            }
            throw new Error('[LiveTranslator] runtime-cache publication failed.');
        }
        cachePublicationRecovery.status = 'committed';
        runtimeCachePublication = 'published';
        authorSnapshot();
        composing = false;
        compositionReady = true;
        bootstrapError = '';
        authorSnapshot();
        compositionOwner.resolve(undefined);
    }
    catch (error) {
        composing = false;
        disposing = true;
        bootstrapError = describeError(error);
        cacheState = createCacheReadiness({
            status: 'failed',
            attempt: hydrationAttempt,
            retryable: false,
            error: 'bootstrap composition failed before cache hydration',
        });
        lastCacheReceipt = createResolvedPromise(cacheState);
        generationActive = false;
        recovery = recoverOwnedGenerationResources(true) ? 'clean' : 'pending';
        disposing = false;
        authorSnapshot();
        compositionOwner.resolve(undefined);
        safeLog('error', '[INIT] Bootstrap composition failed.', error);
    }
    return startInitialization();
}
