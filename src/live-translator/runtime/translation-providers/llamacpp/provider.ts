import { assemblePrompt, compilePromptTemplate, type CompiledPrompt, type PromptRequest } from '../prompt-template.js';
import type { BoundProviderLogger, LlamaCppConfig, LinkedAbort, ThinkBlockStripper, TranslationProviderCapabilities, TranslationProviderCommonModule, } from '../common.js';
import { captureTranslationProviderAvailabilityFailure, createTranslationProviderRuntimeStatus, markTranslationProviderUnavailable, type TranslationProviderRuntimeStatus, } from '../runtime-status.js';
import type { LlamaCppCompletion, LlamaCppModelSelection, LlamaCppProtocolModule, LlamaCppSseParser, } from './protocol.js';
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object;
type UnknownFunction = (...args: unknown[]) => unknown;
const runtimeStatusSafeInteger = Number.isSafeInteger;
const MAX_RUNTIME_MODEL_UNITS = 256;
interface AbortSignalCandidate {
    readonly aborted?: unknown;
    readonly addEventListener?: unknown;
    readonly removeEventListener?: unknown;
}
interface LlamaCppProviderCommonDependencies {
    readonly assertNoTransportOverrides: (options: unknown) => void;
    readonly bindLogger: (logger?: unknown) => BoundProviderLogger;
    readonly coerceFetchError: (error: unknown, linkedAbort?: unknown, fallbackMessage?: unknown) => unknown;
    readonly createHttpError: (message: unknown, status: unknown, retryAfter?: unknown) => Error;
    readonly createLinkedAbort: (options?: unknown) => LinkedAbort;
    readonly createProviderCapabilities: (options?: unknown) => Readonly<TranslationProviderCapabilities>;
    readonly getFetch: () => UnknownFunction;
    readonly getGlobalSettings: () => object;
    readonly getGlobalTranslatorConfig: () => object | null;
    readonly normalizeLlamaCppConfig: (rootConfig?: unknown, settings?: unknown) => LlamaCppConfig;
    readonly positiveInteger: <Fallback>(value: unknown, fallback: Fallback) => number | Fallback;
}
interface LlamaCppProviderProtocolDependencies {
    readonly buildLlamaCppChatBody: (sourceText: unknown, cfg: unknown, selection: unknown, stream: unknown, systemPrompt?: string) => unknown;
    readonly createLlamaCppSseParser: () => LlamaCppSseParser;
    readonly createThinkBlockStripper: () => ThinkBlockStripper;
    readonly extractLlamaCppCompletion: (data: unknown) => LlamaCppCompletion;
    readonly readLlamaCppSlotCapacity: (props: unknown) => number;
    readonly sanitizeLlamaCppOutput: (value: unknown) => string;
    readonly selectLlamaCppModel: (models: unknown, cfg: unknown) => LlamaCppModelSelection;
}
interface ProviderOptionsCandidate {
    readonly translatorConfig?: unknown;
    readonly settings?: unknown;
    readonly logger?: unknown;
}
interface ProviderRequestCandidate extends PromptRequest {
    readonly force?: boolean;
    readonly text?: unknown;
    readonly stream?: unknown;
    readonly signal?: unknown;
    readonly timeoutMs?: unknown;
    readonly onDelta?: unknown;
    readonly metadata?: unknown;
}
interface ErrorCandidate {
    readonly message?: unknown;
}
interface MutableErrorCandidate {
    code?: unknown;
    retryable?: unknown;
}
interface ResponseCandidate {
    readonly ok: unknown;
    readonly status: unknown;
    readonly statusText: unknown;
    readonly json: UnknownFunction;
    readonly body: unknown;
}
interface ModelCatalogCandidate {
    readonly data?: unknown;
}
interface ResponseBodyCandidate {
    readonly getReader: UnknownFunction;
}
interface ReaderCandidate {
    readonly read?: unknown;
    readonly cancel?: unknown;
    readonly releaseLock?: unknown;
}
interface ReadResultCandidate {
    readonly done?: unknown;
    readonly value?: unknown;
}
interface StreamEventCandidate {
    readonly done?: unknown;
    readonly content?: unknown;
    readonly finishReason?: unknown;
}
interface SelectionCandidate {
    readonly modelKey?: unknown;
    readonly requestedModel?: unknown;
    readonly modelAuthor?: unknown;
    readonly modelName?: unknown;
}
interface MutableApiStatus {
    apiResponding: unknown;
    modelCatalogAt: number;
    modelCatalogError: string;
    modelCount: unknown;
    modelSelectionReady: unknown;
    modelSelectionError: string;
    propsAt: number;
    capacityError: string;
    failureCode?: string;
    capacity: unknown;
    capacityVerified: unknown;
    statusUpdatedAt: number;
}
interface SharedRefresh<T> {
    readonly owner: object;
    readonly generation: number;
    readonly promise: Promise<T>;
}
interface StreamReaderResourceLease {
    readonly reader: ReaderCandidate;
    read: UnknownFunction | null;
    cancel: UnknownFunction | null;
    releaseLock: UnknownFunction | null;
    released: boolean;
}
interface StreamReaderLease extends StreamReaderResourceLease {
    read: UnknownFunction;
    releaseLock: UnknownFunction;
}
export interface LlamaCppProviderStatus {
    readonly kind: 'llamacpp';
    readonly apiResponding: boolean;
    readonly modelCatalogAt: number;
    readonly modelCatalogError: string;
    readonly modelCount: unknown;
    readonly loadedLlmInstanceCount: number;
    readonly modelSelectionReady: boolean;
    readonly modelSelectionError: string;
    readonly statusUpdatedAt: number;
    readonly modelKey: unknown;
    readonly modelInstanceId: unknown;
    readonly modelAuthor: unknown;
    readonly modelName: unknown;
    readonly quantization: '';
    readonly selectedVariant: '';
    readonly propsAt: number;
    readonly capacityError: string;
    readonly capacity: number;
    readonly capacityVerified: boolean;
    readonly capacitySource: 'props.total_slots' | '';
    readonly selectionCached: boolean;
    readonly selectionExpiresAt: unknown;
    readonly selectionRefreshing: boolean;
}
export interface LlamaCppProvider {
    readonly kind: 'llamacpp';
    readonly capabilities: Readonly<TranslationProviderCapabilities>;
    readonly config: LlamaCppConfig;
    getCapacity(requestOptions?: unknown): Promise<number>;
    getRuntimeStatus(): Readonly<TranslationProviderRuntimeStatus>;
    translate(request?: unknown): Promise<string>;
    getStatus(): LlamaCppProviderStatus;
    invalidateModelSelection(): void;
    requestModelCatalog(requestOptions?: unknown): Promise<unknown[]>;
    requestServerProps(requestOptions?: unknown): Promise<number>;
    resolveModelSelection(requestOptions?: unknown): Promise<unknown>;
}
export interface LlamaCppProviderModule {
    createLlamaCppProvider(options?: unknown, compiledPrompt?: CompiledPrompt): LlamaCppProvider;
}
export function createLlamaCppProviderModule(common: TranslationProviderCommonModule, protocol: LlamaCppProtocolModule): LlamaCppProviderModule {
    const { assertNoTransportOverrides, bindLogger, coerceFetchError, createHttpError, createLinkedAbort, createProviderCapabilities, getFetch, getGlobalSettings, getGlobalTranslatorConfig, normalizeLlamaCppConfig, positiveInteger, } = common as LlamaCppProviderCommonDependencies;
    const { buildLlamaCppChatBody, createLlamaCppSseParser, createThinkBlockStripper, extractLlamaCppCompletion, readLlamaCppSlotCapacity, sanitizeLlamaCppOutput, selectLlamaCppModel, } = protocol as LlamaCppProviderProtocolDependencies;
    const PROVIDER_CAPABILITIES = createProviderCapabilities({
        streaming: true,
        tracksAvailability: true,
        requiresVerifiedCapacity: true,
    });
    const readClock: () => number = Date.now;
    const apply = Reflect.apply;
    const get = Reflect.get;
    const NativePromise: PromiseConstructor = Promise;
    const promiseThenCandidate: unknown = Reflect.get(NativePromise.prototype, 'then');
    if (typeof promiseThenCandidate !== 'function') {
        throw new TypeError('Native Promise is missing its reaction capability.');
    }
    const intrinsicPromiseThen = promiseThenCandidate as UnknownFunction;
    function createLlamaCppProvider(options: unknown = {}, compiledPrompt?: CompiledPrompt): LlamaCppProvider {
        const source = options as ProviderOptionsCandidate;
        const cfg = normalizeLlamaCppConfig(source.translatorConfig || getGlobalTranslatorConfig(), source.settings || getGlobalSettings());
        const prompt = compiledPrompt ?? compilePromptTemplate(cfg.system_prompt, 'settings.llamacpp.system_prompt');
        assertNoTransportOverrides(options);
        const fetchImpl = getFetch();
        const logger = bindLogger(source.logger);
        let selectionCache: LlamaCppModelSelection | null = null;
        let selectionExpiresAt = 0;
        let selectionGeneration = 0;
        let selectionRefresh: SharedRefresh<LlamaCppModelSelection> | null = null;
        let capacityRefresh: SharedRefresh<number> | null = null;
        let capacityCache: number | null = null;
        let healthRefresh: Promise<void> | null = null;
        let healthGeneration = -1;
        let capacitySelection: LlamaCppModelSelection | null = null;
        let healthFailure = '';
        const apiStatus: MutableApiStatus = {
            apiResponding: false,
            modelCatalogAt: 0,
            modelCatalogError: '',
            modelCount: 0,
            modelSelectionReady: false,
            modelSelectionError: '',
            propsAt: 0,
            capacityError: '',
            capacity: 0,
            capacityVerified: false,
            statusUpdatedAt: 0,
        };
        function formatError(error: unknown): string {
            try {
                const errorValue = error as FalsySensitiveValue;
                const candidate = error as ErrorCandidate;
                return errorValue && candidate.message ? String(candidate.message) : String(errorValue || '');
            }
            catch {
                return 'Translation provider request failed.';
            }
        }
        function createHeaders(includeJson = false): Record<string, string> {
            const headers: Record<string, string> = {};
            if (includeJson)
                headers['Content-Type'] = 'application/json';
            if (cfg.api_key)
                headers['Authorization'] = `Bearer ${cfg.api_key}`;
            return headers;
        }
        function releaseLinkedAbort(linked: LinkedAbort): void {
            try {
                linked.cleanup();
            }
            catch {
            }
        }
        function captureLinkedAbortReasonCapability(linked: LinkedAbort): UnknownFunction | null {
            try {
                const capability = get(linked, 'getAbortReason', linked);
                return typeof capability === 'function' ? capability : null;
            }
            catch {
                return null;
            }
        }
        function captureLinkedAbortOriginCapability(linked: LinkedAbort): UnknownFunction | null {
            try {
                const capability = get(linked, 'getAbortOrigin', linked);
                return typeof capability === 'function' ? capability : null;
            }
            catch {
                return null;
            }
        }
        function captureExactLinkedAbortOrigin(linked: LinkedAbort, getAbortOrigin: UnknownFunction | null): 'parent' | 'timeout' | null | 'unreadable' {
            if (!getAbortOrigin)
                return 'unreadable';
            try {
                const origin = apply(getAbortOrigin, linked, []);
                return origin === 'parent' || origin === 'timeout' || origin === null ? origin : 'unreadable';
            }
            catch {
                return 'unreadable';
            }
        }
        function isUnabortedTransportFailure(linked: LinkedAbort, getAbortReason: UnknownFunction | null, responseObserved: boolean): boolean {
            if (responseObserved || !getAbortReason)
                return false;
            try {
                return apply(getAbortReason, linked, []) === null;
            }
            catch {
                return false;
            }
        }
        function availabilityFailureForHttpStatus(failure: unknown, status: unknown, message: string): unknown {
            if (status === 401 || status === 403) {
                return markTranslationProviderUnavailable(failure, 'authentication-failed', 'Provider authentication failed. Check the configured API token.');
            }
            return typeof status === 'number' && (status === 408 || status === 429 || (status >= 500 && status <= 599))
                ? markTranslationProviderUnavailable(failure, 'http-unavailable', message)
                : failure;
        }
        function preserveAvailabilityFailure(source: unknown, target: unknown): void {
            const evidence = captureTranslationProviderAvailabilityFailure(source);
            if (evidence)
                markTranslationProviderUnavailable(target, evidence.code, evidence.message);
        }
        function waitForSharedRefresh<Result>(refresh: Promise<Result>, requestOptions: unknown, fallbackTimeoutMs: unknown): Promise<Result> {
            let linked: LinkedAbort;
            try {
                const request = requestOptions as ProviderRequestCandidate;
                linked = createLinkedAbort({
                    signal: request.signal,
                    timeoutMs: request.timeoutMs || fallbackTimeoutMs,
                });
            }
            catch (error) {
                void refresh.catch(() => undefined);
                return Promise.reject(error);
            }
            return new Promise<Result>((resolve, reject) => {
                let signal: AbortSignalCandidate | null = null;
                let settled = false;
                let linkedOwned = true;
                let listenerOwned = false;
                let listenerAcquiring = false;
                let removeAbortListener: UnknownFunction | null = null;
                const release = (): void => {
                    if (listenerOwned && !listenerAcquiring) {
                        listenerOwned = false;
                        if (signal && removeAbortListener) {
                            try {
                                Reflect.apply(removeAbortListener, signal, ['abort', onAbort]);
                            }
                            catch {
                            }
                        }
                    }
                    if (linkedOwned) {
                        linkedOwned = false;
                        releaseLinkedAbort(linked);
                    }
                };
                const settleSuccess = (value: Result): void => {
                    if (settled)
                        return;
                    settled = true;
                    release();
                    resolve(value);
                };
                const settleFailure = (error: unknown): void => {
                    if (settled)
                        return;
                    settled = true;
                    release();
                    reject(error);
                };
                const observeAbortReason = (): unknown => {
                    try {
                        const getAbortReasonCandidate: unknown = Reflect.get(linked, 'getAbortReason');
                        if (typeof getAbortReasonCandidate === 'function') {
                            const reason = Reflect.apply(getAbortReasonCandidate as UnknownFunction, linked, []);
                            if (reason !== null && reason !== undefined)
                                return reason;
                        }
                    }
                    catch (error) {
                        return error;
                    }
                    return new Error('llama.cpp shared refresh wait was aborted.');
                };
                function onAbort(): void {
                    if (settled)
                        return;
                    settled = true;
                    const reason = observeAbortReason();
                    release();
                    reject(reason);
                }
                refresh.then((value) => {
                    settleSuccess(value);
                }, (error: unknown) => {
                    settleFailure(error);
                });
                try {
                    signal = linked.signal as AbortSignalCandidate | null;
                }
                catch (error) {
                    settleFailure(error);
                    return;
                }
                if (!signal || (typeof signal !== 'object' && typeof signal !== 'function'))
                    return;
                try {
                    const addCandidate = signal.addEventListener;
                    const removeCandidate = signal.removeEventListener;
                    if (typeof addCandidate !== 'function')
                        return;
                    if (typeof removeCandidate !== 'function') {
                        throw new TypeError('Linked abort signal is missing its listener release capability.');
                    }
                    const addAbortListener = addCandidate as UnknownFunction;
                    removeAbortListener = removeCandidate as UnknownFunction;
                    if (signal.aborted === true) {
                        onAbort();
                        return;
                    }
                    listenerOwned = true;
                    listenerAcquiring = true;
                    try {
                        Reflect.apply(addAbortListener, signal, ['abort', onAbort, { once: true }]);
                    }
                    finally {
                        listenerAcquiring = false;
                        if (settled)
                            release();
                    }
                    if (!settled && signal.aborted === true)
                        onAbort();
                }
                catch (error) {
                    settleFailure(error);
                }
            });
        }
        function invalidateModelSelection(): void {
            selectionGeneration += 1;
            selectionCache = null;
            selectionExpiresAt = 0;
            selectionRefresh = null;
            capacityRefresh = null;
            capacityCache = null;
            apiStatus.modelSelectionReady = false;
            apiStatus.capacity = 0;
            apiStatus.capacityVerified = false;
        }
        async function performModelCatalogRequest(requestOptions: unknown, generation: number | null): Promise<unknown[]> {
            const request = requestOptions as ProviderRequestCandidate;
            const linked = createLinkedAbort({
                signal: request.signal,
                timeoutMs: request.timeoutMs || cfg.model_catalog_timeout_ms,
            });
            const getAbortOrigin = captureLinkedAbortOriginCapability(linked);
            let responseObserved = false;
            try {
                const response: unknown = await fetchImpl(`${cfg.base_url}/v1/models`, {
                    method: 'GET',
                    headers: createHeaders(false),
                    signal: linked.signal,
                });
                responseObserved = !!response;
                const responseValue = response as FalsySensitiveValue;
                if (!responseValue || !(response as ResponseCandidate).ok) {
                    const status = responseValue ? (response as ResponseCandidate).status : 0;
                    const statusText = responseValue ? (response as ResponseCandidate).statusText : 'no response';
                    throw availabilityFailureForHttpStatus(createHttpError(`llama.cpp model list error: ${status as string} ${statusText as string}`, status), status, 'Translation provider model catalog is unavailable.');
                }
                const data: unknown = await (response as ResponseCandidate).json();
                const dataValue = data as FalsySensitiveValue;
                const modelsCandidate: unknown = dataValue ? (data as ModelCatalogCandidate).data : null;
                if (!Array.isArray(modelsCandidate)) {
                    throw new Error('llama.cpp /v1/models response missing required "data" array.');
                }
                const models = modelsCandidate as unknown[];
                const modelCount = models.length;
                const catalogAt = readClock();
                if (generation === null || generation === selectionGeneration) {
                    apiStatus.apiResponding = true;
                    apiStatus.modelCatalogAt = catalogAt;
                    apiStatus.modelCatalogError = '';
                    apiStatus.modelCount = modelCount;
                    apiStatus.statusUpdatedAt = catalogAt;
                }
                return models;
            }
            catch (error) {
                const converted = coerceFetchError(error, linked, 'llama.cpp model list request failed');
                const abortOrigin = captureExactLinkedAbortOrigin(linked, getAbortOrigin);
                preserveAvailabilityFailure(error, converted);
                const authenticatedFailure = captureTranslationProviderAvailabilityFailure(converted);
                if (abortOrigin === 'parent' && authenticatedFailure === null) {
                    throw converted;
                }
                if (abortOrigin === 'unreadable' && !responseObserved && authenticatedFailure === null) {
                    throw converted;
                }
                if (abortOrigin === null && !responseObserved && authenticatedFailure === null) {
                    markTranslationProviderUnavailable(converted, 'transport-unavailable', 'Translation provider transport is unavailable.');
                }
                const catalogError = formatError(converted);
                const statusUpdatedAt = readClock();
                if (generation === null || generation === selectionGeneration) {
                    apiStatus.apiResponding = responseObserved;
                    apiStatus.failureCode =
                        captureTranslationProviderAvailabilityFailure(converted)?.code ?? 'catalog-unavailable';
                    apiStatus.modelCatalogError = catalogError;
                    apiStatus.modelCount = 0;
                    apiStatus.modelSelectionReady = false;
                    apiStatus.statusUpdatedAt = statusUpdatedAt;
                }
                throw converted;
            }
            finally {
                linked.cleanup();
            }
        }
        function requestModelCatalog(requestOptions: unknown = {}): Promise<unknown[]> {
            return performModelCatalogRequest(requestOptions, null);
        }
        function failSelectionRefresh(generation: number, error: unknown): Promise<LlamaCppModelSelection> {
            const modelSelectionError = formatError(error);
            const statusUpdatedAt = readClock();
            if (generation !== selectionGeneration)
                return getCurrentSelectionResult();
            invalidateModelSelection();
            apiStatus.modelSelectionError = modelSelectionError;
            apiStatus.statusUpdatedAt = statusUpdatedAt;
            throw error;
        }
        function getOrStartSelectionRefresh(): SharedRefresh<LlamaCppModelSelection> {
            const current = selectionRefresh;
            if (current?.generation === selectionGeneration)
                return current;
            const generation = selectionGeneration;
            const owner = {};
            const activation = new NativePromise<void>((resolve) => {
                resolve();
            });
            const promise = activation
                .then(() => performModelCatalogRequest({}, generation))
                .then((models): LlamaCppModelSelection | Promise<LlamaCppModelSelection> => {
                if (generation !== selectionGeneration)
                    return getCurrentSelectionResult();
                let selection: LlamaCppModelSelection;
                try {
                    selection = selectLlamaCppModel(models, cfg);
                }
                catch (error) {
                    return failSelectionRefresh(generation, error);
                }
                let selectionExpiresAtCandidate: number;
                let statusUpdatedAt: number;
                try {
                    const modelCatalogTtlMs = cfg.model_catalog_ttl_ms;
                    statusUpdatedAt = readClock();
                    selectionExpiresAtCandidate = statusUpdatedAt + modelCatalogTtlMs;
                }
                catch (error) {
                    return failSelectionRefresh(generation, error);
                }
                if (generation !== selectionGeneration)
                    return getCurrentSelectionResult();
                if (selectionCache?.modelKey !== selection.modelKey) {
                    capacityCache = null;
                    apiStatus.capacity = 0;
                    apiStatus.capacityVerified = false;
                }
                selectionCache = selection;
                selectionExpiresAt = selectionExpiresAtCandidate;
                apiStatus.modelSelectionReady = true;
                apiStatus.modelSelectionError = '';
                apiStatus.statusUpdatedAt = statusUpdatedAt;
                return selection;
            }, (error: unknown): Promise<LlamaCppModelSelection> => {
                return failSelectionRefresh(generation, error);
            })
                .finally(() => {
                if (selectionRefresh?.owner === owner)
                    selectionRefresh = null;
            });
            const ownedRefresh = { owner, generation, promise };
            selectionRefresh = ownedRefresh;
            return ownedRefresh;
        }
        function getCurrentSelectionResult(): Promise<LlamaCppModelSelection> {
            const generation = selectionGeneration;
            const cachedSelection = selectionCache;
            const cachedExpiresAt = selectionExpiresAt;
            if (cachedSelection) {
                const observedAt = readClock();
                if (generation === selectionGeneration &&
                    cachedSelection === selectionCache &&
                    observedAt < cachedExpiresAt) {
                    return Promise.resolve(cachedSelection);
                }
            }
            return getOrStartSelectionRefresh().promise;
        }
        async function resolveModelSelection(requestOptions: unknown = {}): Promise<LlamaCppModelSelection> {
            const generation = selectionGeneration;
            const cachedSelection = selectionCache;
            const cachedExpiresAt = selectionExpiresAt;
            if (cachedSelection && (requestOptions as ProviderRequestCandidate).force !== true) {
                const observedAt = readClock();
                if (generation === selectionGeneration &&
                    cachedSelection === selectionCache &&
                    observedAt < cachedExpiresAt) {
                    return cachedSelection;
                }
            }
            const refresh = getOrStartSelectionRefresh();
            return waitForSharedRefresh(refresh.promise, requestOptions, cfg.model_catalog_timeout_ms);
        }
        async function performServerPropsRequest(generation: number): Promise<number> {
            const selected = selectionCache;
            const linked = createLinkedAbort({
                timeoutMs: cfg.model_catalog_timeout_ms,
            });
            const getAbortReason = captureLinkedAbortReasonCapability(linked);
            let responseObserved = false;
            try {
                const response: unknown = await fetchImpl(`${cfg.base_url}/props?model=${encodeURIComponent(selected?.requestedModel ?? cfg.model)}&autoload=false`, {
                    method: 'GET',
                    headers: createHeaders(false),
                    signal: linked.signal,
                });
                responseObserved = !!response;
                const responseValue = response as FalsySensitiveValue;
                if (!responseValue || !(response as ResponseCandidate).ok) {
                    const status = responseValue ? (response as ResponseCandidate).status : 0;
                    const statusText = responseValue ? (response as ResponseCandidate).statusText : 'no response';
                    throw availabilityFailureForHttpStatus(createHttpError(`llama.cpp /props error: ${status as string} ${statusText as string}`, status), status, 'Translation provider capacity is unavailable.');
                }
                const props: unknown = await (response as ResponseCandidate).json();
                const capacity = readLlamaCppSlotCapacity(props);
                const propsAt = readClock();
                if (generation === selectionGeneration && selected === selectionCache) {
                    apiStatus.apiResponding = true;
                    apiStatus.propsAt = propsAt;
                    apiStatus.capacityError = '';
                    apiStatus.failureCode = '';
                    apiStatus.capacity = capacity;
                    apiStatus.capacityVerified = true;
                    capacityCache = capacity;
                    apiStatus.statusUpdatedAt = propsAt;
                    try {
                        logger.debug(`[llama.cpp] Queried ${capacity as unknown as string} concurrent slot(s) from /props.`);
                    }
                    catch {
                    }
                }
                return capacity;
            }
            catch (error) {
                const converted = coerceFetchError(error, linked, 'llama.cpp /props request failed');
                preserveAvailabilityFailure(error, converted);
                if (isUnabortedTransportFailure(linked, getAbortReason, responseObserved)) {
                    markTranslationProviderUnavailable(converted, 'transport-unavailable', 'Translation provider transport is unavailable.');
                }
                const capacityError = formatError(converted);
                const statusUpdatedAt = readClock();
                if (generation === selectionGeneration && selected === selectionCache) {
                    apiStatus.apiResponding = responseObserved;
                    apiStatus.failureCode =
                        captureTranslationProviderAvailabilityFailure(converted)?.code ?? 'capacity-unavailable';
                    apiStatus.capacityError = capacityError;
                    apiStatus.capacity = 0;
                    apiStatus.capacityVerified = false;
                    capacityCache = null;
                    apiStatus.statusUpdatedAt = statusUpdatedAt;
                }
                throw converted;
            }
            finally {
                linked.cleanup();
            }
        }
        function getOrStartCapacityRefresh(): SharedRefresh<number> {
            const current = capacityRefresh;
            if (current?.generation === selectionGeneration && capacitySelection === selectionCache)
                return current;
            const generation = selectionGeneration;
            const selected = selectionCache;
            const owner = {};
            const activation = new NativePromise<void>((resolve) => {
                resolve();
            });
            const promise = activation
                .then(() => performServerPropsRequest(generation))
                .then((capacity): number | Promise<number> => {
                if (generation !== selectionGeneration || selected !== selectionCache)
                    return getCurrentCapacityResult();
                return capacity;
            }, (error: unknown): Promise<number> => {
                if (generation !== selectionGeneration || selected !== selectionCache)
                    return getCurrentCapacityResult();
                throw error;
            })
                .finally(() => {
                if (capacityRefresh?.owner === owner)
                    capacityRefresh = null;
            });
            const ownedRefresh = { owner, generation, promise };
            capacitySelection = selected;
            capacityRefresh = ownedRefresh;
            return ownedRefresh;
        }
        function getCurrentCapacityResult(): Promise<number> {
            if (selectionCache === null) {
                return getCurrentSelectionResult().then(() => getCurrentCapacityResult());
            }
            const current = capacityRefresh;
            if (current?.generation === selectionGeneration && capacitySelection === selectionCache)
                return current.promise;
            if (capacityCache !== null && apiStatus.capacityVerified)
                return Promise.resolve(capacityCache);
            return getOrStartCapacityRefresh().promise;
        }
        function requestServerProps(requestOptions: unknown = {}): Promise<number> {
            const refresh = getOrStartCapacityRefresh();
            return waitForSharedRefresh(refresh.promise, requestOptions, cfg.model_catalog_timeout_ms);
        }
        function requestHealth(requestOptions: unknown): Promise<void> {
            if (!healthRefresh || healthGeneration !== selectionGeneration) {
                const generation = selectionGeneration;
                healthGeneration = generation;
                const promise = Promise.resolve()
                    .then(async () => {
                    const linked = createLinkedAbort({ timeoutMs: cfg.model_catalog_timeout_ms });
                    let responded = false;
                    try {
                        const response = (await fetchImpl(`${cfg.base_url}/health`, {
                            method: 'GET',
                            headers: createHeaders(false),
                            signal: linked.signal,
                        })) as ResponseCandidate | null;
                        responded = !!response;
                        if (!response?.ok) {
                            const loading = response?.status === 503;
                            const error = createHttpError(loading ? 'llama.cpp is loading its model.' : 'llama.cpp health check failed.', response?.status ?? 0);
                            if (response?.status === 401 || response?.status === 403) {
                                availabilityFailureForHttpStatus(error, response.status, error.message);
                            }
                            else {
                                markTranslationProviderUnavailable(error, loading ? 'model-loading' : 'health-unavailable', error.message);
                            }
                            throw error;
                        }
                        const body = (await response.json()) as {
                            status?: unknown;
                        } | null;
                        if (body?.status !== 'ok')
                            throw new Error('llama.cpp health response is invalid.');
                        if (generation === selectionGeneration) {
                            healthFailure = '';
                            apiStatus.failureCode = '';
                        }
                    }
                    catch (error) {
                        const converted = coerceFetchError(error, linked, 'llama.cpp health request failed');
                        preserveAvailabilityFailure(error, converted);
                        const evidence = captureTranslationProviderAvailabilityFailure(converted);
                        const message = formatError(converted);
                        const at = readClock();
                        if (generation === selectionGeneration) {
                            healthFailure = message;
                            apiStatus.failureCode = evidence?.code ?? 'health-unavailable';
                            apiStatus.apiResponding = responded;
                            apiStatus.capacityVerified = false;
                            apiStatus.capacity = 0;
                            capacityCache = null;
                            apiStatus.statusUpdatedAt = at;
                        }
                        throw converted;
                    }
                    finally {
                        linked.cleanup();
                    }
                })
                    .then(() => (generation === selectionGeneration ? undefined : requestHealth({})), (error: unknown) => {
                    if (generation !== selectionGeneration)
                        return requestHealth({});
                    throw error;
                })
                    .finally(() => {
                    if (healthRefresh === promise)
                        healthRefresh = null;
                });
                healthRefresh = promise;
            }
            return waitForSharedRefresh(healthRefresh, requestOptions, cfg.model_catalog_timeout_ms);
        }
        async function getCapacity(requestOptions: unknown = {}): Promise<number> {
            if ((requestOptions as ProviderRequestCandidate).force === true)
                await requestHealth(requestOptions);
            while (true) {
                const selected = await resolveModelSelection(requestOptions);
                const generation = selectionGeneration;
                const capacity = await requestServerProps(requestOptions);
                if (generation === selectionGeneration && selected === selectionCache)
                    return capacity;
            }
        }
        async function ensureReady(requestOptions: unknown = {}): Promise<LlamaCppModelSelection> {
            while (true) {
                const selection = await resolveModelSelection(requestOptions);
                const generation = selectionGeneration;
                if (selectionCache !== selection)
                    continue;
                if (!apiStatus.capacityVerified)
                    await requestServerProps(requestOptions);
                if (generation === selectionGeneration && selectionCache === selection)
                    return selection;
            }
        }
        function observeDetached(outcome: unknown): void {
            const ignoreOutcome = (): undefined => undefined;
            try {
                Reflect.apply(intrinsicPromiseThen, outcome, [ignoreOutcome, ignoreOutcome]);
                return;
            }
            catch {
            }
            try {
                const observation = new NativePromise<unknown>((resolve) => {
                    resolve(outcome);
                });
                Reflect.apply(intrinsicPromiseThen, observation, [ignoreOutcome, ignoreOutcome]);
            }
            catch {
            }
        }
        function acquireStreamReader(responseBody: unknown, getReader: UnknownFunction): StreamReaderLease {
            const readerValue = Reflect.apply(getReader, responseBody, []);
            if (!readerValue || (typeof readerValue !== 'object' && typeof readerValue !== 'function')) {
                throw new TypeError('llama.cpp streaming reader is unavailable.');
            }
            const reader = readerValue as ReaderCandidate;
            const resourceLease: StreamReaderResourceLease = {
                reader,
                read: null,
                cancel: null,
                releaseLock: null,
                released: false,
            };
            let capabilityError: unknown;
            let hasCapabilityError = false;
            try {
                const cancelCandidate = reader.cancel;
                resourceLease.cancel =
                    typeof cancelCandidate === 'function' ? (cancelCandidate as UnknownFunction) : null;
            }
            catch (error) {
                capabilityError = error;
                hasCapabilityError = true;
            }
            try {
                const releaseCandidate = reader.releaseLock;
                if (typeof releaseCandidate !== 'function') {
                    throw new TypeError('llama.cpp streaming reader is missing its release capability.');
                }
                resourceLease.releaseLock = releaseCandidate as UnknownFunction;
            }
            catch (error) {
                if (!hasCapabilityError) {
                    capabilityError = error;
                    hasCapabilityError = true;
                }
            }
            if (hasCapabilityError) {
                handoffFailedReader(resourceLease, capabilityError);
                throw capabilityError;
            }
            try {
                const readCandidate = reader.read;
                if (typeof readCandidate !== 'function') {
                    throw new TypeError('llama.cpp streaming reader is missing its read capability.');
                }
                resourceLease.read = readCandidate as UnknownFunction;
                return resourceLease as StreamReaderLease;
            }
            catch (error) {
                handoffFailedReader(resourceLease, error);
                throw error;
            }
        }
        function releaseStreamReader(lease: StreamReaderResourceLease): void {
            if (lease.released)
                return;
            lease.released = true;
            if (!lease.releaseLock)
                return;
            try {
                Reflect.apply(lease.releaseLock, lease.reader, []);
            }
            catch {
            }
        }
        function handoffFailedReader(lease: StreamReaderResourceLease, reason: unknown): void {
            cancelAndReleaseStreamReader(lease, [reason]);
        }
        function handoffTerminalReader(lease: StreamReaderResourceLease): void {
            cancelAndReleaseStreamReader(lease, []);
        }
        function cancelAndReleaseStreamReader(lease: StreamReaderResourceLease, cancellationArguments: unknown[]): void {
            if (lease.released)
                return;
            if (lease.cancel) {
                try {
                    const cancellation = Reflect.apply(lease.cancel, lease.reader, cancellationArguments);
                    observeDetached(cancellation);
                }
                catch {
                }
            }
            releaseStreamReader(lease);
        }
        async function requestChat(sourceText: string, stream: unknown, requestOptions: unknown = {}, bodyConfig: unknown = cfg): Promise<string> {
            const request = requestOptions as ProviderRequestCandidate;
            const selection = await ensureReady(requestOptions);
            const body = buildLlamaCppChatBody(sourceText, bodyConfig, selection, stream, assemblePrompt(prompt, request, sourceText));
            const linked = createLinkedAbort({
                signal: request.signal,
                timeoutMs: request.timeoutMs || cfg.request_timeout_ms,
            });
            const getAbortReason = captureLinkedAbortReasonCapability(linked);
            let linkedOwned = true;
            let readerLease: StreamReaderLease | null = null;
            let responseObserved = false;
            const releaseRequestAbort = (): void => {
                if (!linkedOwned)
                    return;
                linkedOwned = false;
                releaseLinkedAbort(linked);
            };
            try {
                const response: unknown = await fetchImpl(`${cfg.base_url}/v1/chat/completions`, {
                    method: 'POST',
                    headers: createHeaders(true),
                    body: JSON.stringify(body),
                    signal: linked.signal,
                });
                responseObserved = !!response;
                const responseValue = response as FalsySensitiveValue;
                if (!responseValue || !(response as ResponseCandidate).ok) {
                    const status = responseValue ? (response as ResponseCandidate).status : 0;
                    const statusText = responseValue ? (response as ResponseCandidate).statusText : 'no response';
                    const failure = createHttpError(`llama.cpp chat error: ${status as string} ${statusText as string}`, status);
                    throw availabilityFailureForHttpStatus(failure, status, 'Translation provider HTTP service is unavailable.');
                }
                if (!stream) {
                    const data: unknown = await (response as ResponseCandidate).json();
                    const completion = extractLlamaCppCompletion(data);
                    validateCompletionFinishReason(completion.finishReason, false);
                    return sanitizeLlamaCppOutput(completion.content);
                }
                const responseBody = (response as ResponseCandidate).body;
                const getReader = responseBody ? (responseBody as ResponseBodyCandidate).getReader : null;
                if (typeof getReader !== 'function') {
                    throw new Error('llama.cpp streaming unavailable: response body missing.');
                }
                const decoder = new TextDecoder('utf-8');
                const parser = createLlamaCppSseParser();
                const thinkStripper = createThinkBlockStripper();
                const requestOnDelta = request.onDelta;
                const onDelta = typeof requestOnDelta === 'function' ? (requestOnDelta as UnknownFunction) : null;
                let accumulated = '';
                let lastPartial = '';
                let finishReason = '';
                function publishPartial(): void {
                    if (!onDelta)
                        return;
                    const partial = sanitizeLlamaCppOutput(accumulated);
                    if (!partial || partial === lastPartial)
                        return;
                    lastPartial = partial;
                    try {
                        observeDetached(Reflect.apply(onDelta, undefined, [partial]));
                    }
                    catch {
                    }
                }
                function appendMessageDelta(cleaned: string): void {
                    if (!cleaned)
                        return;
                    accumulated += cleaned;
                    publishPartial();
                }
                function processStreamEvents(events: unknown): boolean {
                    for (const event of events as Iterable<unknown>) {
                        const eventValue = event as FalsySensitiveValue;
                        if (!eventValue)
                            continue;
                        const eventCandidate = event as StreamEventCandidate;
                        if (eventCandidate.done === true)
                            return true;
                        if (typeof eventCandidate.finishReason === 'string' && eventCandidate.finishReason) {
                            if (finishReason && finishReason !== eventCandidate.finishReason) {
                                throw createCompletionError('llama.cpp stream returned conflicting finish reasons.', 'INVALID_STREAM_FINISH', false);
                            }
                            finishReason = eventCandidate.finishReason;
                        }
                        const content = eventCandidate.content;
                        if (!content)
                            continue;
                        appendMessageDelta(thinkStripper.feed(content));
                    }
                    return false;
                }
                readerLease = acquireStreamReader(responseBody, getReader);
                let terminalMarkerReceived = false;
                while (true) {
                    const readResult = (await Reflect.apply(readerLease.read, readerLease.reader, [])) as ReadResultCandidate;
                    if (readResult.done)
                        break;
                    const value = readResult.value;
                    terminalMarkerReceived = processStreamEvents(parser.feed(decoder.decode(value as Parameters<TextDecoder['decode']>[0], { stream: true })));
                    if (terminalMarkerReceived)
                        break;
                }
                if (terminalMarkerReceived) {
                    const terminalReader = readerLease;
                    readerLease = null;
                    handoffTerminalReader(terminalReader);
                }
                else {
                    terminalMarkerReceived = processStreamEvents(parser.finish(decoder.decode()));
                }
                if (!terminalMarkerReceived) {
                    throw createCompletionError('llama.cpp stream ended before the [DONE] terminal event.', 'INCOMPLETE_STREAM', true);
                }
                validateCompletionFinishReason(finishReason, true);
                appendMessageDelta(thinkStripper.finish());
                return sanitizeLlamaCppOutput(accumulated);
            }
            catch (error) {
                let converted: unknown;
                try {
                    converted = coerceFetchError(error, linked, stream ? 'llama.cpp stream request failed' : 'llama.cpp request failed');
                }
                catch (conversionError) {
                    converted = conversionError;
                }
                preserveAvailabilityFailure(error, converted);
                if (isUnabortedTransportFailure(linked, getAbortReason, responseObserved)) {
                    markTranslationProviderUnavailable(converted, 'transport-unavailable', 'Translation provider transport is unavailable.');
                }
                releaseRequestAbort();
                if (readerLease) {
                    const failedReader = readerLease;
                    readerLease = null;
                    handoffFailedReader(failedReader, error);
                }
                throw converted;
            }
            finally {
                if (readerLease)
                    releaseStreamReader(readerLease);
                releaseRequestAbort();
            }
        }
        function validateCompletionFinishReason(finishReason: string, stream: boolean): void {
            if (finishReason === 'stop')
                return;
            if (finishReason === 'length') {
                throw createCompletionError('llama.cpp stopped because the output token limit was reached.', stream ? 'TRUNCATED_STREAM_OUTPUT' : 'TRUNCATED_COMPLETION_OUTPUT', false);
            }
            throw createCompletionError(`llama.cpp ${stream ? 'stream' : 'completion'} ended with an invalid finish reason: ${finishReason || 'missing'}.`, stream ? 'INVALID_STREAM_FINISH' : 'INVALID_COMPLETION_FINISH', false);
        }
        function createCompletionError(message: string, code: string, retryable: boolean): Error {
            const error = new Error(message);
            try {
                (error as MutableErrorCandidate).code = code;
                (error as MutableErrorCandidate).retryable = retryable;
            }
            catch {
            }
            return error;
        }
        function getStatus(): LlamaCppProviderStatus {
            const selection = selectionCache && typeof selectionCache === 'object' ? selectionCache : null;
            const selected = selection as SelectionCandidate | null;
            return {
                kind: 'llamacpp',
                apiResponding: apiStatus.apiResponding === true,
                modelCatalogAt: apiStatus.modelCatalogAt,
                modelCatalogError: apiStatus.modelCatalogError,
                modelCount: apiStatus.modelCount,
                loadedLlmInstanceCount: selected ? 1 : 0,
                modelSelectionReady: apiStatus.modelSelectionReady === true,
                modelSelectionError: apiStatus.modelSelectionError,
                statusUpdatedAt: apiStatus.statusUpdatedAt,
                modelKey: selected ? selected.modelKey : '',
                modelInstanceId: selected ? selected.requestedModel : '',
                modelAuthor: selected ? selected.modelAuthor : '',
                modelName: selected ? selected.modelName : '',
                quantization: '',
                selectedVariant: '',
                propsAt: apiStatus.propsAt,
                capacityError: apiStatus.capacityError,
                capacity: positiveInteger(apiStatus.capacity, 0),
                capacityVerified: apiStatus.capacityVerified === true,
                capacitySource: apiStatus.capacityVerified ? 'props.total_slots' : '',
                selectionCached: !!selected,
                selectionExpiresAt: selected ? selectionExpiresAt : 0,
                selectionRefreshing: selectionRefresh !== null && selectionRefresh.generation === selectionGeneration,
            };
        }
        function getRuntimeStatus(): Readonly<TranslationProviderRuntimeStatus> {
            const selected = selectionCache && typeof selectionCache === 'object' ? selectionCache : null;
            const observedCapacity = apiStatus.capacity;
            const capacity = typeof observedCapacity === 'number' &&
                runtimeStatusSafeInteger(observedCapacity) &&
                observedCapacity > 0
                ? observedCapacity
                : 0;
            const capacityVerified = capacity > 0 && apiStatus.capacityVerified === true;
            let state: TranslationProviderRuntimeStatus['state'] = 'pending';
            let code = 'initializing';
            let message = '';
            if (healthFailure) {
                state = apiStatus.failureCode === 'model-loading' ? 'pending' : 'unavailable';
                code = (apiStatus.failureCode ?? '') || 'health-unavailable';
                message = healthFailure.slice(0, 1024);
            }
            else if (apiStatus.capacityError) {
                state = 'unavailable';
                code = (apiStatus.failureCode ?? '') || 'capacity-unavailable';
                message = apiStatus.capacityError.slice(0, 1024);
            }
            else if (apiStatus.modelCatalogError) {
                state = 'unavailable';
                code = (apiStatus.failureCode ?? '') || 'catalog-unavailable';
                message = apiStatus.modelCatalogError.slice(0, 1024);
            }
            else if (apiStatus.modelSelectionError) {
                state = 'unavailable';
                code = 'model-unavailable';
                message = apiStatus.modelSelectionError.slice(0, 1024);
            }
            else if (apiStatus.apiResponding && selected && capacityVerified && capacity > 0) {
                state = 'available';
                code = 'ready';
            }
            else if (apiStatus.apiResponding && apiStatus.modelCatalogAt > 0 && !selected) {
                state = 'unavailable';
                code = 'model-unavailable';
                message = 'No translation model is available.';
            }
            const selectedModel = selected ? selected.modelName : '';
            return createTranslationProviderRuntimeStatus({
                state,
                code,
                message,
                model: typeof selectedModel === 'string' && selectedModel.length <= MAX_RUNTIME_MODEL_UNITS
                    ? selectedModel
                    : '',
                capacity,
                capacityVerified,
                observation: {
                    apiResponding: apiStatus.apiResponding === true,
                    modelId: typeof selected?.modelKey === 'string' ? selected.modelKey.slice(0, 256) : '',
                    instanceId: '',
                    publisher: typeof selected?.modelAuthor === 'string' ? selected.modelAuthor.slice(0, 256) : '',
                    quantization: '',
                    capacitySource: capacityVerified ? 'props.total_slots' : '',
                },
            });
        }
        return {
            kind: 'llamacpp',
            capabilities: PROVIDER_CAPABILITIES,
            config: cfg,
            getCapacity,
            getRuntimeStatus,
            async translate(request: unknown = {}): Promise<string> {
                const requestCandidate = request as ProviderRequestCandidate;
                const requestText = requestCandidate.text ?? '';
                const sourceText = String(requestText);
                const stream = requestCandidate.stream === true;
                const translated = await requestChat(sourceText, stream, request, cfg);
                if (!translated) {
                    const error = new Error(stream ? 'llama.cpp stream returned no usable text.' : 'llama.cpp returned no usable text.');
                    try {
                        (error as MutableErrorCandidate).code = stream
                            ? 'EMPTY_STREAM_OUTPUT'
                            : 'EMPTY_TRANSLATION_OUTPUT';
                    }
                    catch {
                    }
                    try {
                        (error as MutableErrorCandidate).retryable = true;
                    }
                    catch {
                    }
                    throw error;
                }
                return translated;
            },
            getStatus,
            invalidateModelSelection,
            requestModelCatalog,
            requestServerProps,
            resolveModelSelection,
        };
    }
    return { createLlamaCppProvider };
}
