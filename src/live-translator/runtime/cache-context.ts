import type { DiskCacheModule } from './cache/disk-cache.js';
import type { RuntimeConfigModule } from './config.js';
import type { RuntimePathsModule } from './paths.js';
import type { TranslationManagerModule, TranslationManagerService, TranslationServiceDisposalReceipt, TranslationServiceDisposalSettlement, } from './translation-manager/manager.js';
import type { TranslationProvider, TranslationProvidersModule } from './translation-providers/composition.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeMethod = (this: unknown, ...args: unknown[]) => unknown;
const IntrinsicPromise = Promise;
const freezeIntrinsic = Object.freeze;
const getOwnPropertyDescriptorIntrinsic = Object.getOwnPropertyDescriptor;
const isFrozenIntrinsic = Object.isFrozen;
const intrinsicPromiseResolve = IntrinsicPromise.resolve as unknown as RuntimeMethod;
const intrinsicPromiseThen = IntrinsicPromise.prototype.then as unknown as RuntimeMethod;
export interface CacheContextDependencies {
    readonly diskCache: DiskCacheModule;
    readonly translationManager: TranslationManagerModule;
    readonly translationProviders: TranslationProvidersModule;
    readonly config: RuntimeConfigModule;
    readonly pathContextModule: RuntimePathsModule;
}
export interface CacheContext {
    readonly diskCache: PropertyBag;
    readonly diskCacheSettings: PropertyBag;
    readonly pathContext: PropertyBag;
    readonly hydrateCache: () => Promise<void>;
    readonly flushDiskCache: () => Promise<void>;
    readonly describeDiskCache: () => string;
    readonly translationCache: PropertyBag;
    readonly translationService: TranslationManagerService;
    readonly translationManager: PropertyBag;
    readonly dispose: () => CacheContextDisposalReceipt;
}
export type CacheContextDisposalSettlement = TranslationServiceDisposalSettlement;
export interface CacheContextDisposalReceipt {
    readonly settlement: CacheContextDisposalSettlement;
    readonly translationService: CacheContextDisposalSettlement;
    readonly provider: CacheContextDisposalSettlement;
    readonly diskCache: CacheContextDisposalSettlement;
}
export interface CacheContextLifetimeLease {
    readonly dispose: () => CacheContextDisposalReceipt;
}
export interface CacheContextOptions {
    readonly settings?: unknown;
    readonly providerContext?: unknown;
    readonly loggerContext?: unknown;
    readonly paths?: unknown;
    readonly claimLifetimeOwner?: (lease: CacheContextLifetimeLease) => void;
}
export interface CacheContextModule {
    readonly createCacheContext: (options?: CacheContextOptions) => CacheContext;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRecordObject(value: unknown): value is PropertyBag {
    return typeof value === 'object' && value !== null;
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function recordOrEmpty(value: unknown): PropertyBag {
    return isRecordObject(value) ? value : {};
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
function callMethod(target: unknown, name: PropertyKey, args: readonly unknown[], description: string): unknown {
    const method = propertyValue(target, name);
    if (typeof method !== 'function')
        throw new TypeError(description + ' is not callable.');
    return Reflect.apply(method, target, args);
}
function hasExactSettledReceipt(value: unknown): value is TranslationServiceDisposalReceipt {
    if (!isPropertyBag(value))
        return false;
    if (!isFrozenIntrinsic(value))
        return false;
    for (const key of ['settlement', 'probe', 'diagnostics', 'statusPublication'] as const) {
        const descriptor = getOwnPropertyDescriptorIntrinsic(value, key);
        if (descriptor === undefined || !('value' in descriptor) || descriptor.value !== 'settled')
            return false;
    }
    return true;
}
interface OwnedCapability {
    readonly callback: RuntimeMethod;
    readonly receiver: unknown;
}
interface CacheContextLifetimeOwner {
    claimDiskCache(capability: OwnedCapability | null): void;
    claimTranslationService(capability: OwnedCapability): void;
    dispose(): CacheContextDisposalReceipt;
}
export function createCacheContextModule(dependencies: CacheContextDependencies, globalScope: unknown): CacheContextModule {
    const { diskCache: diskCacheModule, translationManager, translationProviders, config, pathContextModule, } = dependencies;
    const unsettledConstructionOwners = new Set<CacheContextLifetimeOwner>();
    function createLifetimeOwner(provider: TranslationProvider): CacheContextLifetimeOwner {
        const providerCloseCandidate = propertyValue(provider, 'close');
        const providerCapability: OwnedCapability | null = typeof providerCloseCandidate === 'function'
            ? { callback: providerCloseCandidate as RuntimeMethod, receiver: provider }
            : null;
        let serviceCapability: OwnedCapability | null = null;
        let diskCacheCapability: OwnedCapability | null = null;
        let serviceClaimed = false;
        let diskCacheClaimed = false;
        let serviceSettled = false;
        let providerSettled = providerCapability === null;
        let diskCacheSettled = false;
        let diskCacheRun: Promise<unknown> | null = null;
        let disposalInProgress = false;
        let settledReceipt: CacheContextDisposalReceipt | null = null;
        function createReceipt(): CacheContextDisposalReceipt {
            const translationServiceSettlement = serviceSettled ? 'settled' : 'in-progress';
            const providerSettlement = providerSettled ? 'settled' : 'in-progress';
            const diskCacheSettlement = diskCacheSettled ? 'settled' : 'in-progress';
            const settlement = translationServiceSettlement === 'settled' &&
                providerSettlement === 'settled' &&
                diskCacheSettlement === 'settled'
                ? 'settled'
                : 'in-progress';
            return freezeIntrinsic({
                settlement,
                translationService: translationServiceSettlement,
                provider: providerSettlement,
                diskCache: diskCacheSettlement,
            });
        }
        function beginDiskCacheFlush(): void {
            if (diskCacheSettled || diskCacheRun !== null)
                return;
            if (diskCacheCapability === null) {
                diskCacheSettled = true;
                return;
            }
            let terminal: Promise<unknown>;
            try {
                const result: unknown = Reflect.apply(diskCacheCapability.callback, diskCacheCapability.receiver, []);
                terminal = Reflect.apply(intrinsicPromiseResolve, IntrinsicPromise, [result]) as Promise<unknown>;
            }
            catch {
                return;
            }
            diskCacheRun = terminal;
            Reflect.apply(intrinsicPromiseThen, terminal, [
                () => {
                    if (diskCacheRun !== terminal)
                        return;
                    diskCacheRun = null;
                    diskCacheSettled = true;
                },
                () => {
                    if (diskCacheRun !== terminal)
                        return;
                    diskCacheRun = null;
                },
            ]);
        }
        function dispose(): CacheContextDisposalReceipt {
            if (settledReceipt !== null)
                return settledReceipt;
            if (disposalInProgress)
                return createReceipt();
            disposalInProgress = true;
            try {
                if (!serviceClaimed)
                    serviceSettled = true;
                if (!diskCacheClaimed)
                    diskCacheSettled = true;
                if (!serviceSettled && serviceCapability !== null) {
                    try {
                        const receipt: unknown = Reflect.apply(serviceCapability.callback, serviceCapability.receiver, []);
                        serviceSettled = hasExactSettledReceipt(receipt);
                    }
                    catch {
                    }
                }
                if (serviceSettled && !providerSettled && providerCapability !== null) {
                    try {
                        Reflect.apply(providerCapability.callback, providerCapability.receiver, []);
                        providerSettled = true;
                    }
                    catch {
                    }
                }
                if (serviceSettled && providerSettled)
                    beginDiskCacheFlush();
            }
            finally {
                disposalInProgress = false;
            }
            const receipt = createReceipt();
            if (receipt.settlement === 'settled')
                settledReceipt = receipt;
            return receipt;
        }
        return {
            claimDiskCache(capability: OwnedCapability | null): void {
                if (diskCacheClaimed)
                    throw new Error('[LiveTranslator] disk cache lifetime was claimed twice.');
                diskCacheClaimed = true;
                diskCacheCapability = capability;
                diskCacheSettled = capability === null;
            },
            claimTranslationService(capability: OwnedCapability): void {
                if (serviceClaimed) {
                    throw new Error('[LiveTranslator] translation service lifetime was claimed twice.');
                }
                serviceClaimed = true;
                serviceCapability = capability;
                serviceSettled = false;
            },
            dispose,
        };
    }
    function retryConstructionCleanup(): void {
        for (const owner of Array.from(unsettledConstructionOwners)) {
            if (owner.dispose().settlement !== 'settled')
                continue;
            unsettledConstructionOwners.delete(owner);
        }
    }
    function settleOrRetainConstructionOwner(owner: CacheContextLifetimeOwner): void {
        if (owner.dispose().settlement === 'settled')
            unsettledConstructionOwners.delete(owner);
        else
            unsettledConstructionOwners.add(owner);
    }
    function resolvePathContext(): PropertyBag {
        try {
            const context = pathContextModule.getPathContext();
            if (isRecordObject(context))
                return context;
        }
        catch {
        }
        const globalPaths = propertyValue(globalScope, 'LiveTranslatorPaths');
        return isRecordObject(globalPaths) ? globalPaths : {};
    }
    function createCacheContext(options: CacheContextOptions = {}): CacheContext {
        retryConstructionCleanup();
        const values = recordOrEmpty(options);
        const claimLifetimeOwnerCandidate = propertyValue(values, 'claimLifetimeOwner');
        const settings = recordOrEmpty(propertyValue(values, 'settings'));
        const providerContext = recordOrEmpty(propertyValue(values, 'providerContext'));
        const loggerContext = propertyValue(values, 'loggerContext');
        const logger = propertyValue(loggerContext, 'logger');
        const telemetry = propertyValue(loggerContext, 'telemetry');
        if (!loggerContext || !logger || !telemetry) {
            throw new Error('[LiveTranslator] logger context is required before cache context.');
        }
        const preview = propertyValue(loggerContext, 'preview');
        const dbg = propertyValue(loggerContext, 'dbg');
        const traceLog = propertyValue(loggerContext, 'traceLog');
        const suppliedPaths = propertyValue(values, 'paths');
        const pathContext = isRecordObject(suppliedPaths) ? suppliedPaths : resolvePathContext();
        const translatorConfig = config.getTranslatorConfig(globalScope);
        const provider = translationProviders.createProvider({
            paths: pathContext,
            translatorConfig,
            settings,
            logger,
        });
        const lifetimeOwner = createLifetimeOwner(provider);
        const dispose = (): CacheContextDisposalReceipt => lifetimeOwner.dispose();
        let lifetimeOwnerTransferred = false;
        let diskCacheSettings: PropertyBag;
        let diskCache: PropertyBag;
        let translationManagerValue: PropertyBag;
        let translationCache: PropertyBag;
        let translationService: TranslationManagerService;
        try {
            if (typeof claimLifetimeOwnerCandidate === 'function') {
                const lease: CacheContextLifetimeLease = freezeIntrinsic({ dispose });
                Reflect.apply(claimLifetimeOwnerCandidate, values, [lease]);
                lifetimeOwnerTransferred = true;
            }
            diskCacheSettings = recordOrEmpty(propertyValue(settings, 'diskCache'));
            const diskCacheValue = diskCacheModule.createDiskCache({
                logger,
                settings: diskCacheSettings,
                defaultCacheMegabytes: truthyOr(numberValue(propertyValue(diskCacheSettings, 'maxMegabytes')), () => 32),
                paths: pathContext,
            });
            if (!isPropertyBag(diskCacheValue)) {
                throw new Error('[LiveTranslator] disk cache factory did not return a cache service.');
            }
            diskCache = diskCacheValue;
            const diskCacheFlush = propertyValue(diskCache, 'flush');
            lifetimeOwner.claimDiskCache(propertyValue(diskCache, 'enabled') === true && typeof diskCacheFlush === 'function'
                ? { callback: diskCacheFlush as RuntimeMethod, receiver: diskCache }
                : null);
            const getCacheEntryLimit = (): number => 0;
            const pruneMapToLimit = (): void => {
                return;
            };
            const managerValue = translationManager.createTranslationManager({
                logger,
                telemetry,
                diskCache,
                preview,
                getCacheEntryLimit,
                pruneMapToLimit,
                provider,
                isLocalProvider: propertyValue(providerContext, 'isLocalProvider') === true,
                isCacheOnlyProvider: propertyValue(providerContext, 'isCacheOnlyProvider') === true,
                dbg,
                traceLog,
                settings,
                paths: pathContext,
            });
            if (!isPropertyBag(managerValue)) {
                throw new Error('[LiveTranslator] translation-manager failed to provide a manager object.');
            }
            translationManagerValue = managerValue;
            const translationServiceValue = propertyValue(translationManagerValue, 'translationService');
            if (!isPropertyBag(translationServiceValue)) {
                throw new Error('[LiveTranslator] translation-manager failed to provide a translation service.');
            }
            const translationServiceDispose = propertyValue(translationServiceValue, 'dispose');
            if (typeof translationServiceDispose !== 'function') {
                throw new Error('[LiveTranslator] translation-manager failed to provide service teardown.');
            }
            lifetimeOwner.claimTranslationService({
                callback: translationServiceDispose as RuntimeMethod,
                receiver: translationServiceValue,
            });
            const translationCacheValue = propertyValue(translationManagerValue, 'translationCache');
            if (!isPropertyBag(translationCacheValue)) {
                throw new Error('[LiveTranslator] translation-manager failed to provide a translation cache.');
            }
            translationCache = translationCacheValue;
            translationService = translationServiceValue as unknown as TranslationManagerService;
        }
        catch (error) {
            if (lifetimeOwnerTransferred)
                lifetimeOwner.dispose();
            else
                settleOrRetainConstructionOwner(lifetimeOwner);
            throw error;
        }
        async function hydrateCache(): Promise<void> {
            if (!propertyValue(diskCache, 'enabled'))
                return;
            const records = await callMethod(diskCache, 'loadAll', [], 'disk cache loadAll');
            if (!Array.isArray(records)) {
                throw new Error('[LiveTranslator] disk cache loadAll must return an array.');
            }
            const completedRows: [
                string,
                string
            ][] = [];
            for (const record of records) {
                const input = propertyValue(record, 'in');
                const output = propertyValue(record, 'out');
                if (typeof input !== 'string' || typeof output !== 'string')
                    continue;
                completedRows.push([input, output]);
            }
            const storeCompletedTranslations = propertyValue(translationService, 'storeCompletedTranslations');
            if (typeof storeCompletedTranslations !== 'function') {
                throw new Error('[LiveTranslator] translation service must provide atomic completed-cache hydration.');
            }
            if (completedRows.length) {
                callMethod(translationService, 'storeCompletedTranslations', [completedRows], 'translation service storeCompletedTranslations');
            }
            if (typeof dbg === 'function') {
                Reflect.apply(dbg, undefined, [`[DiskCache] Loaded ${String(records.length)} records`]);
            }
        }
        function describeDiskCache(): string {
            const enabled = Boolean(propertyValue(diskCache, 'enabled'));
            const reportsMaximum = enabled && typeof propertyValue(diskCache, 'getMaxMegabytes') === 'function';
            let maxMegabytes: number;
            if (reportsMaximum) {
                const reportedMaximum = callMethod(diskCache, 'getMaxMegabytes', [], 'disk cache getMaxMegabytes');
                maxMegabytes = typeof reportedMaximum === 'number' ? reportedMaximum : Number.NaN;
            }
            else {
                maxMegabytes = numberValue(propertyValue(diskCacheSettings, 'maxMegabytes'));
            }
            const retention = Number.isFinite(maxMegabytes) && maxMegabytes > 0
                ? `${String(Math.floor(maxMegabytes))} MB`
                : 'unlimited';
            return `${enabled ? 'enabled' : 'disabled'}${enabled ? ` (${retention})` : ''}`;
        }
        async function flushDiskCache(): Promise<void> {
            if (!propertyValue(diskCache, 'enabled') || typeof propertyValue(diskCache, 'flush') !== 'function') {
                return;
            }
            await callMethod(diskCache, 'flush', [], 'disk cache flush');
        }
        return {
            diskCache,
            diskCacheSettings,
            pathContext,
            hydrateCache,
            flushDiskCache,
            describeDiskCache,
            translationCache,
            translationService,
            translationManager: translationManagerValue,
            dispose,
        };
    }
    return { createCacheContext };
}
