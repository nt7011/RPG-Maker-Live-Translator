import { assemblePrompt, compilePromptTemplate, type PromptRequest } from '../prompt-template.js';
import type { BoundProviderLogger, LinkedAbort, LmStudioConfig, ThinkBlockStripper, TranslationProviderCapabilities, TranslationProviderCommonModule, } from '../common.js';
import { captureTranslationProviderAvailabilityFailure, createTranslationProviderRuntimeStatus, markTranslationProviderUnavailable, type TranslationProviderRuntimeStatus, } from '../runtime-status.js';
import { LMSTUDIO_SELECTION_ERROR_CODES, type LmStudioModelSelection, type LmStudioProtocolModule, type LmStudioSseParser, } from './protocol.js';
type UnknownFunction = (...args: unknown[]) => unknown;
type PropertyBag = Record<PropertyKey, unknown>;
const runtimeStatusSafeInteger = Number.isSafeInteger;
const MAX_RUNTIME_MODEL_UNITS = 256;
interface LmStudioProviderCommonDependencies {
    readonly assertNoTransportOverrides: (options: unknown) => void;
    readonly bindLogger: (logger?: unknown) => BoundProviderLogger;
    readonly coerceFetchError: (error: unknown, linkedAbort?: unknown, fallbackMessage?: unknown) => unknown;
    readonly createHttpError: (message: unknown, status: unknown, retryAfter?: unknown) => Error;
    readonly createProviderCapabilities: (options?: unknown) => Readonly<TranslationProviderCapabilities>;
    readonly createLinkedAbort: (options?: unknown) => LinkedAbort;
    readonly getFetch: () => UnknownFunction;
    readonly getGlobalSettings: () => object;
    readonly getGlobalTranslatorConfig: () => object | null;
    readonly getLmStudioApiBaseUrl: (cfg: unknown) => string;
    readonly normalizeLmStudioConfig: (rootConfig?: unknown, settings?: unknown) => LmStudioConfig;
    readonly positiveInteger: <Fallback>(value: unknown, fallback: Fallback) => number | Fallback;
}
interface LmStudioProviderProtocolDependencies {
    readonly assertLmStudioChatResponseMatchesSelection: (data: unknown, selection: unknown) => void;
    readonly buildLmStudioChatBody: (sourceText: unknown, cfg: unknown, stream: unknown, systemPrompt?: string) => unknown;
    readonly createSseParser: () => LmStudioSseParser;
    readonly createThinkBlockStripper: () => ThinkBlockStripper;
    readonly extractMessageContentFromV1: (data: unknown) => string;
    readonly parseLmStudioTextOutput: (content: unknown) => string;
    readonly selectLmStudioChatModel: (models: unknown, cfg: unknown) => LmStudioModelSelection;
}
interface OptionalLoadedInstancesProtocol {
    readonly getLoadedLlmInstances?: unknown;
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
    retryAfter?: unknown;
    retryable?: unknown;
    status?: unknown;
}
interface ErrorCodeCandidate {
    readonly code?: unknown;
}
interface ResponseCandidate {
    readonly ok?: unknown;
    readonly status?: unknown;
    readonly statusText?: unknown;
    readonly json?: unknown;
    readonly body?: unknown;
}
interface JsonResponseCandidate {
    readonly json: UnknownFunction;
}
interface ModelCatalogCandidate {
    readonly models?: unknown;
}
interface ResponseBodyCandidate {
    readonly getReader?: unknown;
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
interface LmStudioStreamEventCandidate {
    readonly type?: unknown;
    readonly model_instance_id?: unknown;
    readonly content?: unknown;
    readonly result?: unknown;
    readonly message?: unknown;
    readonly error?: unknown;
    readonly code?: unknown;
    readonly status?: unknown;
    readonly retryable?: unknown;
    readonly retry_after?: unknown;
}
interface SelectionCandidate {
    readonly supportsReasoningOff?: unknown;
    readonly configuredModel?: string;
    readonly requestedModel?: string;
    readonly expectedInstanceId?: string;
    readonly modelKey?: string;
    readonly modelAuthor?: string;
    readonly modelName?: string;
    readonly quantization?: string;
    readonly selectedVariant?: string;
    readonly capacity?: number;
    readonly capacityVerified?: boolean;
    readonly catalogModelCount?: unknown;
    readonly catalogLoadedLlmInstanceCount?: unknown;
}
interface StreamTransportResultCandidate {
    readonly authoritativeMessage?: unknown;
}
interface ApiStatusState {
    readonly apiResponding: boolean;
    readonly modelCatalogAt: number;
    readonly modelCatalogError: string;
    readonly modelCatalogCode?: string;
    readonly modelCount: number;
    readonly loadedLlmInstanceCount: number;
    readonly modelSelectionReady: boolean;
    readonly modelSelectionError: string;
    readonly statusUpdatedAt: number;
}
interface SelectionState {
    readonly selection: LmStudioModelSelection | null;
    readonly expiresAt: number;
}
interface CatalogProjection {
    readonly models: unknown[];
    readonly modelCount: number;
    readonly loadedLlmInstanceCount: number;
    readonly catalogAt: number;
}
interface AbortSignalCandidate {
    readonly aborted?: unknown;
    readonly addEventListener?: unknown;
    readonly removeEventListener?: unknown;
}
interface AbortWaitLease {
    readonly promise: Promise<never>;
    release(): void;
}
export interface LmStudioProviderRequestOptions {
    readonly force?: boolean;
    readonly signal?: unknown;
    readonly timeoutMs?: unknown;
}
export interface LmStudioTranslationRequest extends LmStudioProviderRequestOptions, PromptRequest {
    readonly text?: unknown;
    readonly stream?: unknown;
    readonly onDelta?: unknown;
}
export interface LmStudioProviderOptions {
    readonly translatorConfig?: unknown;
    readonly settings?: unknown;
    readonly logger?: unknown;
}
export interface LmStudioProviderStatus {
    readonly kind: 'lmstudio';
    readonly apiResponding: boolean;
    readonly modelCatalogAt: number;
    readonly modelCatalogError: string;
    readonly modelCount: number;
    readonly loadedLlmInstanceCount: number;
    readonly modelSelectionReady: boolean;
    readonly modelSelectionError: string;
    readonly statusUpdatedAt: number;
    readonly modelKey: string;
    readonly modelInstanceId: string;
    readonly modelAuthor: string;
    readonly modelName: string;
    readonly quantization: string;
    readonly selectedVariant: string;
    readonly capacity: number;
    readonly capacityVerified: boolean;
    readonly selectionCached: boolean;
    readonly selectionExpiresAt: number;
    readonly selectionRefreshing: boolean;
}
export interface LmStudioProvider {
    readonly kind: 'lmstudio';
    readonly capabilities: Readonly<TranslationProviderCapabilities>;
    readonly config: LmStudioConfig;
    getCapacity(requestOptions?: LmStudioProviderRequestOptions): Promise<number>;
    getRuntimeStatus(): Readonly<TranslationProviderRuntimeStatus>;
    translate(request?: LmStudioTranslationRequest): Promise<string>;
    invalidateModelSelection(): void;
    getStatus(): LmStudioProviderStatus;
    requestLmStudioModelCatalog(requestOptions?: LmStudioProviderRequestOptions): Promise<unknown[]>;
    resolveLmStudioChatModelSelection(requestOptions?: LmStudioProviderRequestOptions): Promise<LmStudioModelSelection>;
}
export interface LmStudioProviderModule {
    createLmStudioProvider(options?: LmStudioProviderOptions): LmStudioProvider;
}
export function createLmStudioProviderModule(common: TranslationProviderCommonModule, protocol: LmStudioProtocolModule): LmStudioProviderModule {
    const { assertNoTransportOverrides, bindLogger, coerceFetchError, createHttpError, createProviderCapabilities, createLinkedAbort, getFetch, getGlobalSettings, getGlobalTranslatorConfig, getLmStudioApiBaseUrl, normalizeLmStudioConfig, positiveInteger, } = common as LmStudioProviderCommonDependencies;
    const PROVIDER_CAPABILITIES = createProviderCapabilities({
        streaming: true,
        tracksAvailability: true,
    });
    const IntrinsicPromise = Promise;
    const intrinsicPromiseThen = Promise.prototype.then;
    const taskPublicationTurn = IntrinsicPromise.resolve();
    const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const defineProperty = Object.defineProperty;
    const deleteProperty = Reflect.deleteProperty;
    const apply = Reflect.apply;
    const get = Reflect.get;
    const ignoreDetachedRejection = (): undefined => undefined;
    function attachIntrinsicPromiseRejectionObserver(candidate: object | UnknownFunction): boolean {
        let originalConstructor: PropertyDescriptor | undefined;
        let constructorWasMasked = false;
        try {
            originalConstructor = getOwnPropertyDescriptor(candidate, 'constructor');
            defineProperty(candidate, 'constructor', {
                configurable: true,
                value: IntrinsicPromise,
            });
            constructorWasMasked = true;
        }
        catch {
        }
        try {
            void apply(intrinsicPromiseThen, candidate, [undefined, ignoreDetachedRejection]);
            return true;
        }
        catch {
            return false;
        }
        finally {
            if (constructorWasMasked) {
                try {
                    if (originalConstructor) {
                        defineProperty(candidate, 'constructor', originalConstructor);
                    }
                    else {
                        deleteProperty(candidate, 'constructor');
                    }
                }
                catch {
                }
            }
        }
    }
    function observeDetachedOutcome(outcome: unknown): void {
        if (!outcome || (typeof outcome !== 'object' && typeof outcome !== 'function'))
            return;
        if (attachIntrinsicPromiseRejectionObserver(outcome))
            return;
        try {
            const assimilated = new IntrinsicPromise<unknown>((resolve) => {
                resolve(outcome);
            });
            attachIntrinsicPromiseRejectionObserver(assimilated);
        }
        catch {
        }
    }
    const { assertLmStudioChatResponseMatchesSelection, buildLmStudioChatBody, createSseParser, createThinkBlockStripper, extractMessageContentFromV1, parseLmStudioTextOutput, selectLmStudioChatModel, } = protocol as LmStudioProviderProtocolDependencies;
    function createEmptyOutputError(stream: boolean): Error {
        const error = new Error(stream ? 'LM Studio stream returned no usable text.' : 'LM Studio returned no usable text.');
        try {
            (error as MutableErrorCandidate).code = stream ? 'EMPTY_STREAM_OUTPUT' : 'EMPTY_TRANSLATION_OUTPUT';
        }
        catch {
        }
        try {
            (error as MutableErrorCandidate).retryable = true;
        }
        catch {
        }
        return error;
    }
    function requireTranslationOutput(parsed: string, stream: boolean): string {
        if (!parsed)
            throw createEmptyOutputError(stream);
        return parsed;
    }
    function parseTranslationOutput(content: unknown, stream: boolean): string {
        return requireTranslationOutput(parseLmStudioTextOutput(content), stream);
    }
    function createLmStudioProvider(options: unknown = {}): LmStudioProvider {
        const cfg = normalizeLmStudioConfig((options as ProviderOptionsCandidate).translatorConfig || getGlobalTranslatorConfig(), (options as ProviderOptionsCandidate).settings || getGlobalSettings());
        const prompt = compilePromptTemplate(cfg.system_prompt, 'settings.lmstudio.system_prompt');
        assertNoTransportOverrides(options);
        const fetchImpl = getFetch();
        const logger = bindLogger((options as ProviderOptionsCandidate).logger);
        const EMPTY_SELECTION_STATE: SelectionState = Object.freeze({ selection: null, expiresAt: 0 });
        let selectionState = EMPTY_SELECTION_STATE;
        let selectionGeneration = 0;
        let selectionTask: {
            readonly generation: number;
            readonly promise: Promise<LmStudioModelSelection>;
        } | null = null;
        let apiStatus: ApiStatusState = Object.freeze({
            apiResponding: false,
            modelCatalogAt: 0,
            modelCatalogError: '',
            modelCount: 0,
            loadedLlmInstanceCount: 0,
            modelSelectionReady: false,
            modelSelectionError: '',
            statusUpdatedAt: 0,
        });
        function formatProviderError(error: unknown): string {
            try {
                const message = error && typeof error === 'object' ? (error as ErrorCandidate).message : undefined;
                if (message !== undefined && message !== null)
                    return String(message);
            }
            catch {
            }
            try {
                return error === undefined || error === null ? '' : String(error);
            }
            catch {
                return '';
            }
        }
        function currentTime(): number {
            try {
                const value = Date.now();
                return Number.isFinite(value) ? value : apiStatus.statusUpdatedAt;
            }
            catch {
                return apiStatus.statusUpdatedAt;
            }
        }
        function releaseLinkedAbort(linked: LinkedAbort): void {
            try {
                const cleanup = (linked as unknown as PropertyBag)['cleanup'];
                if (typeof cleanup === 'function') {
                    const outcome = Reflect.apply(cleanup as UnknownFunction, linked, []);
                    observeDetachedOutcome(outcome);
                }
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
        function selectionErrorCode(error: unknown): string {
            try {
                const code = error && typeof error === 'object' ? (error as ErrorCodeCandidate).code : '';
                return typeof code === 'string' ? code : '';
            }
            catch {
                return '';
            }
        }
        function invalidatesSelection(error: unknown): boolean {
            const code = selectionErrorCode(error);
            return (code === LMSTUDIO_SELECTION_ERROR_CODES.AUTO_LOADED ||
                code === LMSTUDIO_SELECTION_ERROR_CODES.INSTANCE_MISMATCH);
        }
        function projectModelCatalog(models: unknown[]): CatalogProjection {
            const modelCount = models.length;
            const getLoadedLlmInstances = (protocol as unknown as OptionalLoadedInstancesProtocol)
                .getLoadedLlmInstances;
            const loadedLlmInstances = typeof getLoadedLlmInstances === 'function'
                ? (Reflect.apply(getLoadedLlmInstances, protocol, [models]) as {
                    readonly length: number;
                })
                : [];
            const loadedCount = loadedLlmInstances.length;
            if (!Number.isSafeInteger(loadedCount) || loadedCount < 0) {
                throw new TypeError('LM Studio model projection returned an invalid loaded-instance count.');
            }
            return Object.freeze({
                models,
                modelCount,
                loadedLlmInstanceCount: loadedCount,
                catalogAt: currentTime(),
            });
        }
        function readCatalogProjectionFromTransaction(models: unknown[], transaction: unknown): CatalogProjection | null {
            if (!transaction || (typeof transaction !== 'object' && typeof transaction !== 'function')) {
                return null;
            }
            const candidate = transaction as SelectionCandidate;
            const modelCount = candidate.catalogModelCount;
            const loadedLlmInstanceCount = candidate.catalogLoadedLlmInstanceCount;
            if (!Number.isSafeInteger(modelCount) ||
                (modelCount as number) < 0 ||
                !Number.isSafeInteger(loadedLlmInstanceCount) ||
                (loadedLlmInstanceCount as number) < 0) {
                return null;
            }
            return Object.freeze({
                models,
                modelCount: modelCount as number,
                loadedLlmInstanceCount: loadedLlmInstanceCount as number,
                catalogAt: currentTime(),
            });
        }
        function snapshotSelection(candidate: unknown): LmStudioModelSelection {
            if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) {
                throw new TypeError('LM Studio model selection must be an object.');
            }
            const source = candidate as SelectionCandidate;
            const supportsReasoningOff = source.supportsReasoningOff;
            const configuredModel = source.configuredModel;
            const requestedModel = source.requestedModel;
            const expectedInstanceId = source.expectedInstanceId;
            const modelKey = source.modelKey;
            const modelAuthor = source.modelAuthor;
            const modelName = source.modelName;
            const quantization = source.quantization;
            const selectedVariant = source.selectedVariant;
            const capacity = source.capacity;
            const capacityVerified = source.capacityVerified;
            const catalogModelCount = source.catalogModelCount;
            const catalogLoadedLlmInstanceCount = source.catalogLoadedLlmInstanceCount;
            const selection: LmStudioModelSelection = {
                supportsReasoningOff: supportsReasoningOff === true,
                configuredModel: typeof configuredModel === 'string' ? configuredModel : '',
                requestedModel: typeof requestedModel === 'string' ? requestedModel : '',
                expectedInstanceId: typeof expectedInstanceId === 'string' ? expectedInstanceId : '',
                modelKey: typeof modelKey === 'string' ? modelKey : '',
                modelAuthor: typeof modelAuthor === 'string' ? modelAuthor : '',
                modelName: typeof modelName === 'string' ? modelName : '',
                quantization: typeof quantization === 'string' ? quantization : '',
                selectedVariant: typeof selectedVariant === 'string' ? selectedVariant : '',
                capacity: positiveInteger(capacity, 1),
                capacityVerified: capacityVerified === true,
            };
            Object.defineProperties(selection, {
                catalogModelCount: {
                    value: catalogModelCount,
                },
                catalogLoadedLlmInstanceCount: {
                    value: catalogLoadedLlmInstanceCount,
                },
            });
            return Object.freeze(selection);
        }
        function createCatalogSuccessStatus(projection: CatalogProjection, selectionReady: boolean, selectionError: string, updatedAt: number): ApiStatusState {
            return Object.freeze({
                apiResponding: true,
                modelCatalogAt: projection.catalogAt,
                modelCatalogError: '',
                modelCount: projection.modelCount,
                loadedLlmInstanceCount: projection.loadedLlmInstanceCount,
                modelSelectionReady: selectionReady,
                modelSelectionError: selectionError,
                statusUpdatedAt: updatedAt,
            });
        }
        function catalogSuccessStatus(projection: CatalogProjection, selectionReady: boolean, selectionError = ''): ApiStatusState {
            return createCatalogSuccessStatus(projection, selectionReady, selectionError, currentTime());
        }
        function createCatalogFailureStatus(errorMessage: string, apiResponding: boolean, updatedAt: number): ApiStatusState {
            return Object.freeze({
                apiResponding,
                modelCatalogAt: apiResponding ? updatedAt : 0,
                modelCatalogError: errorMessage,
                modelCount: 0,
                loadedLlmInstanceCount: 0,
                modelSelectionReady: false,
                modelSelectionError: '',
                statusUpdatedAt: updatedAt,
            });
        }
        function catalogFailureStatus(error: unknown, apiResponding: boolean): ApiStatusState {
            const updatedAt = currentTime();
            return createCatalogFailureStatus(formatProviderError(error), apiResponding, updatedAt);
        }
        function stageCatalogFailureStatusForGeneration(error: unknown, apiResponding: boolean, generation: number): ApiStatusState | null {
            const updatedAt = currentTime();
            if (generation !== selectionGeneration)
                return null;
            const errorMessage = formatProviderError(error);
            if (generation !== selectionGeneration)
                return null;
            const evidence = captureTranslationProviderAvailabilityFailure(error);
            let status: unknown;
            try {
                status =
                    error && typeof error === 'object'
                        ? (Object.getOwnPropertyDescriptor(error, 'status')?.value as unknown)
                        : undefined;
            }
            catch {
            }
            if (generation !== selectionGeneration)
                return null;
            return Object.freeze({
                ...createCatalogFailureStatus(errorMessage, apiResponding || typeof status === 'number', updatedAt),
                modelCatalogCode: evidence?.code ?? (apiResponding ? 'invalid-catalog' : 'catalog-unavailable'),
            });
        }
        function stageSelectionFailureStatusForGeneration(projection: CatalogProjection, error: unknown, generation: number): ApiStatusState | null {
            const errorMessage = formatProviderError(error);
            if (generation !== selectionGeneration)
                return null;
            const updatedAt = currentTime();
            if (generation !== selectionGeneration)
                return null;
            return createCatalogSuccessStatus(projection, false, errorMessage, updatedAt);
        }
        function stageSelectionSuccessStatusForGeneration(projection: CatalogProjection, generation: number): ApiStatusState | null {
            const updatedAt = currentTime();
            if (generation !== selectionGeneration)
                return null;
            return createCatalogSuccessStatus(projection, true, '', updatedAt);
        }
        function replaceSelectionState(next: SelectionState): void {
            selectionState = next;
        }
        function replaceStatus(next: ApiStatusState): void {
            apiStatus = next;
        }
        function commitSelectionTransaction(nextSelection: SelectionState, nextStatus: ApiStatusState): void {
            replaceSelectionState(nextSelection);
            replaceStatus(nextStatus);
        }
        function createHeaders(json: boolean): Record<string, string> {
            const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
            if (cfg.api_key)
                headers['Authorization'] = `Bearer ${cfg.api_key}`;
            return headers;
        }
        async function requestModelCatalogTransport(): Promise<unknown> {
            const url = `${getLmStudioApiBaseUrl(cfg)}/api/v1/models`;
            const linked = createLinkedAbort({
                timeoutMs: cfg.model_catalog_timeout_ms,
            });
            const getAbortReason = captureLinkedAbortReasonCapability(linked);
            let responseObserved = false;
            try {
                const response: unknown = await fetchImpl(url, {
                    method: 'GET',
                    headers: createHeaders(false),
                    signal: linked.signal,
                });
                responseObserved = !!response;
                if (!response || !(response as ResponseCandidate).ok) {
                    const status = response ? (response as ResponseCandidate).status : 0;
                    const statusText = response ? (response as ResponseCandidate).statusText : 'no response';
                    throw availabilityFailureForHttpStatus(createHttpError(`LM Studio model list error: ${status as string} ${statusText as string}`, status), status, 'Translation provider model catalog is unavailable.');
                }
                return await (response as JsonResponseCandidate).json();
            }
            catch (error) {
                const converted = coerceFetchError(error, linked, 'LM Studio model list request failed');
                preserveAvailabilityFailure(error, converted);
                if (isUnabortedTransportFailure(linked, getAbortReason, responseObserved)) {
                    markTranslationProviderUnavailable(converted, 'transport-unavailable', 'Translation provider transport is unavailable.');
                }
                throw converted;
            }
            finally {
                releaseLinkedAbort(linked);
            }
        }
        function admitModelCatalogSchema(data: unknown): unknown[] {
            const models = data && typeof data === 'object' ? (data as ModelCatalogCandidate).models : null;
            if (!Array.isArray(models)) {
                throw new Error('LM Studio models response missing required "models" array.');
            }
            return models as unknown[];
        }
        async function requestLmStudioModelCatalog(requestOptions: unknown = {}): Promise<unknown[]> {
            const work = (async (): Promise<unknown[]> => {
                let data: unknown;
                try {
                    data = await requestModelCatalogTransport();
                }
                catch (error) {
                    commitInvalidatedSelection(catalogFailureStatus(error, false));
                    throw error;
                }
                let models: unknown[];
                try {
                    models = admitModelCatalogSchema(data);
                }
                catch (error) {
                    commitInvalidatedSelection(catalogFailureStatus(error, true));
                    throw error;
                }
                let projection: CatalogProjection;
                try {
                    projection = projectModelCatalog(models);
                }
                catch (error) {
                    commitInvalidatedSelection(catalogFailureStatus(error, true));
                    throw error;
                }
                const retainedGeneration = selectionGeneration;
                const retainedSelectionState = selectionState;
                const retainedStatus = apiStatus;
                const retainedSelection = retainedSelectionState.selection;
                const nextStatus = catalogSuccessStatus(projection, retainedSelection !== null, retainedSelection ? '' : retainedStatus.modelSelectionError);
                if (retainedGeneration === selectionGeneration && retainedSelectionState === selectionState) {
                    replaceStatus(nextStatus);
                }
                return models;
            })();
            void work.catch(() => undefined);
            return awaitSharedWork(work, requestOptions);
        }
        function createAbortWaitLease(linked: LinkedAbort): AbortWaitLease {
            let rejectAbort: (reason: Error) => void = () => undefined;
            const promise = new Promise<never>((_resolve, reject) => {
                rejectAbort = reject;
            });
            let signalValue: unknown;
            let signal: AbortSignalCandidate | null = null;
            let removeAbortListener: UnknownFunction | null = null;
            let listenerMayBeRegistered = false;
            let listenerAcquiring = false;
            let releaseRequested = false;
            let releaseCompleted = false;
            let outcomeClaimed = false;
            const release = (): void => {
                if (releaseCompleted)
                    return;
                releaseRequested = true;
                if (listenerAcquiring)
                    return;
                releaseCompleted = true;
                if (!listenerMayBeRegistered || !signal || !removeAbortListener)
                    return;
                listenerMayBeRegistered = false;
                try {
                    const removal = Reflect.apply(removeAbortListener, signal, ['abort', onAbort]);
                    observeDetachedOutcome(removal);
                }
                catch {
                }
            };
            const rejectOnce = (error: unknown, fallbackMessage: string): boolean => {
                if (outcomeClaimed)
                    return false;
                outcomeClaimed = true;
                rejectAbort(error instanceof Error ? error : new Error(fallbackMessage));
                return true;
            };
            const abortError = (): Error => {
                try {
                    const reason = linked.getAbortReason();
                    return reason instanceof Error ? reason : new Error('LM Studio model catalog request cancelled.');
                }
                catch {
                    return new Error('LM Studio model catalog request cancelled.');
                }
            };
            const onAbort = (): void => {
                if (outcomeClaimed)
                    return;
                outcomeClaimed = true;
                rejectAbort(abortError());
                release();
            };
            try {
                signalValue = linked.signal;
            }
            catch (error) {
                rejectOnce(error, 'Abort signal inspection failed.');
                return { promise, release };
            }
            signal =
                signalValue && (typeof signalValue === 'object' || typeof signalValue === 'function')
                    ? signalValue
                    : null;
            if (!signal)
                return { promise, release };
            let initiallyAborted: unknown;
            try {
                initiallyAborted = signal.aborted;
            }
            catch (error) {
                rejectOnce(error, 'Abort signal inspection failed.');
                return { promise, release };
            }
            if (initiallyAborted) {
                onAbort();
                return { promise, release };
            }
            let addAbortListener: unknown;
            let removeCandidate: unknown;
            try {
                addAbortListener = signal.addEventListener;
                removeCandidate = signal.removeEventListener;
            }
            catch (error) {
                rejectOnce(error, 'Abort signal inspection failed.');
                return { promise, release };
            }
            const hasAdd = typeof addAbortListener === 'function';
            const hasRemove = typeof removeCandidate === 'function';
            if (hasAdd !== hasRemove) {
                rejectOnce(new TypeError('Abort signal listener capabilities must be paired.'), 'Abort signal listener capabilities must be paired.');
                return { promise, release };
            }
            if (!hasAdd || !hasRemove)
                return { promise, release };
            removeAbortListener = removeCandidate as UnknownFunction;
            listenerMayBeRegistered = true;
            listenerAcquiring = true;
            try {
                const registration = Reflect.apply(addAbortListener as UnknownFunction, signal, [
                    'abort',
                    onAbort,
                    { once: true },
                ]);
                observeDetachedOutcome(registration);
            }
            catch (error) {
                listenerAcquiring = false;
                rejectOnce(error, 'Abort listener registration failed.');
                release();
                return { promise, release };
            }
            listenerAcquiring = false;
            if (outcomeClaimed || releaseRequested) {
                release();
                return { promise, release };
            }
            try {
                if (signal.aborted)
                    onAbort();
            }
            catch (error) {
                rejectOnce(error, 'Abort signal inspection failed.');
                release();
            }
            return { promise, release };
        }
        async function awaitSharedWork<T>(shared: Promise<T>, requestOptions: unknown): Promise<T> {
            const linked = createLinkedAbort({
                signal: (requestOptions as ProviderRequestCandidate).signal,
                timeoutMs: (requestOptions as ProviderRequestCandidate).timeoutMs || cfg.model_catalog_timeout_ms,
            });
            let abortLease: AbortWaitLease | null = null;
            try {
                abortLease = createAbortWaitLease(linked);
                return await Promise.race([shared, abortLease.promise]);
            }
            finally {
                if (abortLease)
                    abortLease.release();
                releaseLinkedAbort(linked);
            }
        }
        async function awaitSharedSelection(shared: Promise<LmStudioModelSelection>, requestOptions: unknown): Promise<LmStudioModelSelection> {
            return awaitSharedWork(shared, requestOptions);
        }
        function adoptCurrentSelectionGeneration(): Promise<LmStudioModelSelection> {
            return resolveLmStudioChatModelSelection();
        }
        async function resolveLmStudioChatModelSelection(requestOptions: unknown = {}): Promise<LmStudioModelSelection> {
            const now = currentTime();
            if ((requestOptions as ProviderRequestCandidate).force !== true &&
                selectionState.selection &&
                now < selectionState.expiresAt) {
                return selectionState.selection;
            }
            let task = selectionTask;
            if (task?.generation !== selectionGeneration) {
                const generation = selectionGeneration;
                const promise = (async () => {
                    try {
                        await taskPublicationTurn;
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        let data: unknown;
                        try {
                            data = await requestModelCatalogTransport();
                        }
                        catch (error) {
                            if (generation !== selectionGeneration) {
                                return adoptCurrentSelectionGeneration();
                            }
                            const nextStatus = stageCatalogFailureStatusForGeneration(error, false, generation);
                            if (!nextStatus) {
                                return adoptCurrentSelectionGeneration();
                            }
                            commitSelectionTransaction(EMPTY_SELECTION_STATE, nextStatus);
                            throw error;
                        }
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        let models: unknown[];
                        try {
                            models = admitModelCatalogSchema(data);
                        }
                        catch (error) {
                            if (generation !== selectionGeneration) {
                                return adoptCurrentSelectionGeneration();
                            }
                            const nextStatus = stageCatalogFailureStatusForGeneration(error, true, generation);
                            if (!nextStatus) {
                                return adoptCurrentSelectionGeneration();
                            }
                            commitSelectionTransaction(EMPTY_SELECTION_STATE, nextStatus);
                            throw error;
                        }
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        let rawSelection: unknown;
                        try {
                            rawSelection = selectLmStudioChatModel(models, cfg);
                        }
                        catch (error) {
                            if (generation !== selectionGeneration) {
                                return adoptCurrentSelectionGeneration();
                            }
                            let projection: CatalogProjection;
                            try {
                                projection =
                                    readCatalogProjectionFromTransaction(models, error) ?? projectModelCatalog(models);
                            }
                            catch (projectionError) {
                                if (generation !== selectionGeneration) {
                                    return adoptCurrentSelectionGeneration();
                                }
                                const nextStatus = stageCatalogFailureStatusForGeneration(projectionError, true, generation);
                                if (!nextStatus) {
                                    return adoptCurrentSelectionGeneration();
                                }
                                commitSelectionTransaction(EMPTY_SELECTION_STATE, nextStatus);
                                throw error;
                            }
                            const nextStatus = stageSelectionFailureStatusForGeneration(projection, error, generation);
                            if (!nextStatus) {
                                return adoptCurrentSelectionGeneration();
                            }
                            commitSelectionTransaction(EMPTY_SELECTION_STATE, nextStatus);
                            throw error;
                        }
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        let selection: LmStudioModelSelection;
                        try {
                            selection = snapshotSelection(rawSelection);
                        }
                        catch (error) {
                            if (generation !== selectionGeneration) {
                                return adoptCurrentSelectionGeneration();
                            }
                            let projection: CatalogProjection;
                            try {
                                projection =
                                    readCatalogProjectionFromTransaction(models, rawSelection) ??
                                        projectModelCatalog(models);
                            }
                            catch (projectionError) {
                                if (generation !== selectionGeneration) {
                                    return adoptCurrentSelectionGeneration();
                                }
                                const nextStatus = stageCatalogFailureStatusForGeneration(projectionError, true, generation);
                                if (!nextStatus) {
                                    return adoptCurrentSelectionGeneration();
                                }
                                commitSelectionTransaction(EMPTY_SELECTION_STATE, nextStatus);
                                throw error;
                            }
                            const nextStatus = stageSelectionFailureStatusForGeneration(projection, error, generation);
                            if (!nextStatus) {
                                return adoptCurrentSelectionGeneration();
                            }
                            commitSelectionTransaction(EMPTY_SELECTION_STATE, nextStatus);
                            throw error;
                        }
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        let projection: CatalogProjection;
                        try {
                            projection =
                                readCatalogProjectionFromTransaction(models, selection) ?? projectModelCatalog(models);
                        }
                        catch (error) {
                            if (generation !== selectionGeneration) {
                                return adoptCurrentSelectionGeneration();
                            }
                            const nextStatus = stageCatalogFailureStatusForGeneration(error, true, generation);
                            if (!nextStatus) {
                                return adoptCurrentSelectionGeneration();
                            }
                            commitSelectionTransaction(EMPTY_SELECTION_STATE, nextStatus);
                            throw error;
                        }
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        const selectionObservedAt = currentTime();
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        const catalogTtlMs = cfg.model_catalog_ttl_ms;
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        const expiresAt = selectionObservedAt + catalogTtlMs;
                        const nextSelection: SelectionState = Object.freeze({ selection, expiresAt });
                        const nextStatus = stageSelectionSuccessStatusForGeneration(projection, generation);
                        if (!nextStatus) {
                            return adoptCurrentSelectionGeneration();
                        }
                        commitSelectionTransaction(nextSelection, nextStatus);
                        try {
                            const logResult = logger.debug(`[LM Studio] Selected ${selection.requestedModel}; parallel capacity ${selection.capacity as unknown as string}.`);
                            observeDetachedOutcome(logResult);
                        }
                        catch {
                        }
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        return selection;
                    }
                    catch (error) {
                        if (generation !== selectionGeneration) {
                            return adoptCurrentSelectionGeneration();
                        }
                        throw error;
                    }
                })();
                task = { generation, promise };
                selectionTask = task;
                void promise
                    .finally(() => {
                    if (selectionTask === task)
                        selectionTask = null;
                })
                    .catch(() => undefined);
            }
            return awaitSharedSelection(task.promise, requestOptions);
        }
        function commitInvalidatedSelection(nextStatus: ApiStatusState): void {
            selectionGeneration += 1;
            commitSelectionTransaction(EMPTY_SELECTION_STATE, nextStatus);
        }
        function invalidateModelSelection(): void {
            const nextStatus: ApiStatusState = Object.freeze({
                ...apiStatus,
                modelSelectionReady: false,
                modelSelectionError: '',
                statusUpdatedAt: currentTime(),
            });
            commitInvalidatedSelection(nextStatus);
        }
        function getLmStudioProviderStatus(): LmStudioProviderStatus {
            const selection = selectionState.selection;
            return {
                kind: 'lmstudio',
                apiResponding: apiStatus.apiResponding,
                modelCatalogAt: apiStatus.modelCatalogAt,
                modelCatalogError: apiStatus.modelCatalogError,
                modelCount: apiStatus.modelCount,
                loadedLlmInstanceCount: apiStatus.loadedLlmInstanceCount,
                modelSelectionReady: apiStatus.modelSelectionReady,
                modelSelectionError: apiStatus.modelSelectionError,
                statusUpdatedAt: apiStatus.statusUpdatedAt,
                modelKey: selection ? (selection as SelectionCandidate).modelKey || '' : '',
                modelInstanceId: selection
                    ? (selection as SelectionCandidate).expectedInstanceId ||
                        (selection as SelectionCandidate).requestedModel ||
                        ''
                    : '',
                modelAuthor: selection ? (selection as SelectionCandidate).modelAuthor || '' : '',
                modelName: selection ? (selection as SelectionCandidate).modelName || '' : '',
                quantization: selection ? (selection as SelectionCandidate).quantization || '' : '',
                selectedVariant: selection ? (selection as SelectionCandidate).selectedVariant || '' : '',
                capacity: selection ? positiveInteger((selection as SelectionCandidate).capacity, 0) : 0,
                capacityVerified: !!(selection && (selection as SelectionCandidate).capacityVerified === true),
                selectionCached: !!selection,
                selectionExpiresAt: selection ? selectionState.expiresAt : 0,
                selectionRefreshing: !!selectionTask && selectionTask.generation === selectionGeneration,
            };
        }
        function getRuntimeStatus(): Readonly<TranslationProviderRuntimeStatus> {
            const selection = selectionState.selection;
            const selectedCapacity = selection ? (selection as SelectionCandidate).capacity : 0;
            const capacity = typeof selectedCapacity === 'number' &&
                runtimeStatusSafeInteger(selectedCapacity) &&
                selectedCapacity > 0
                ? selectedCapacity
                : 0;
            const capacityVerified = capacity > 0 && !!(selection && (selection as SelectionCandidate).capacityVerified === true);
            let state: TranslationProviderRuntimeStatus['state'] = 'pending';
            let code = 'initializing';
            let message = '';
            if (apiStatus.modelCatalogError) {
                state = 'unavailable';
                code = apiStatus.modelCatalogCode ?? 'catalog-unavailable';
                message = apiStatus.modelCatalogError.slice(0, 1024);
            }
            else if (apiStatus.modelSelectionError) {
                state = 'unavailable';
                message = apiStatus.modelSelectionError.slice(0, 1024);
                code = apiStatus.loadedLlmInstanceCount === 0 ? 'no-model-loaded' : 'model-unavailable';
            }
            else if (apiStatus.apiResponding && selection && capacity > 0) {
                state = 'available';
                code = 'ready';
            }
            else if (apiStatus.apiResponding && apiStatus.modelCatalogAt > 0 && !selection) {
                state = 'unavailable';
                code = 'model-unavailable';
                message = 'No loaded translation model is available.';
            }
            const selectedModel = selection ? (selection as SelectionCandidate).modelName : '';
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
                    apiResponding: apiStatus.apiResponding,
                    modelId: (selection?.modelKey ?? '').slice(0, 256),
                    instanceId: (selection?.expectedInstanceId ?? '').slice(0, 256),
                    publisher: (selection?.modelAuthor ?? '').slice(0, 256),
                    quantization: (selection?.quantization ?? '').slice(0, 256),
                    capacitySource: capacityVerified ? 'loaded_instances.config.parallel' : '',
                },
            });
        }
        async function requestLmStudioChat(body: unknown, requestOptions: unknown = {}): Promise<unknown> {
            const selection = await resolveLmStudioChatModelSelection(requestOptions);
            const url = `${getLmStudioApiBaseUrl(cfg)}/api/v1/chat`;
            const requestBody = {
                ...(body as PropertyBag),
                model: selection.requestedModel,
                ...(selection.supportsReasoningOff ? { reasoning: 'off' } : {}),
            };
            const linked = createLinkedAbort({
                signal: (requestOptions as ProviderRequestCandidate).signal,
                timeoutMs: (requestOptions as ProviderRequestCandidate).timeoutMs || cfg.request_timeout_ms,
            });
            const getAbortReason = captureLinkedAbortReasonCapability(linked);
            let responseObserved = false;
            try {
                const response: unknown = await fetchImpl(url, {
                    method: 'POST',
                    headers: createHeaders(true),
                    body: JSON.stringify(requestBody),
                    signal: linked.signal,
                });
                responseObserved = !!response;
                if (!response || !(response as ResponseCandidate).ok) {
                    const status = response ? (response as ResponseCandidate).status : 0;
                    const statusText = response ? (response as ResponseCandidate).statusText : 'no response';
                    const failure = createHttpError(`LM Studio error: ${status as string} ${statusText as string}`, status);
                    throw availabilityFailureForHttpStatus(failure, status, 'Translation provider HTTP service is unavailable.');
                }
                const data: unknown = await (response as JsonResponseCandidate).json();
                assertLmStudioChatResponseMatchesSelection(data, selection);
                return data;
            }
            catch (error) {
                if (invalidatesSelection(error))
                    invalidateModelSelection();
                const converted = coerceFetchError(error, linked, 'LM Studio request failed');
                preserveAvailabilityFailure(error, converted);
                if (isUnabortedTransportFailure(linked, getAbortReason, responseObserved)) {
                    markTranslationProviderUnavailable(converted, 'transport-unavailable', 'Translation provider transport is unavailable.');
                }
                throw converted;
            }
            finally {
                releaseLinkedAbort(linked);
            }
        }
        async function requestLmStudioChatStream(body: unknown, requestOptions: unknown = {}): Promise<{
            authoritativeMessage: string;
        }> {
            const selection = await resolveLmStudioChatModelSelection(requestOptions);
            const url = `${getLmStudioApiBaseUrl(cfg)}/api/v1/chat`;
            const requestBody = {
                ...(body as PropertyBag),
                model: selection.requestedModel,
                ...(selection.supportsReasoningOff ? { reasoning: 'off' } : {}),
            };
            const requestOnDelta = (requestOptions as ProviderRequestCandidate).onDelta;
            const onDelta = typeof requestOnDelta === 'function' ? (requestOnDelta as UnknownFunction) : null;
            const linked = createLinkedAbort({
                signal: (requestOptions as ProviderRequestCandidate).signal,
                timeoutMs: (requestOptions as ProviderRequestCandidate).timeoutMs || cfg.request_timeout_ms,
            });
            const getAbortReason = captureLinkedAbortReasonCapability(linked);
            let cancelReader: (reason: unknown) => void = () => undefined;
            let releaseReader: () => void = () => undefined;
            let responseObserved = false;
            try {
                const response: unknown = await fetchImpl(url, {
                    method: 'POST',
                    headers: createHeaders(true),
                    body: JSON.stringify(requestBody),
                    signal: linked.signal,
                });
                responseObserved = !!response;
                if (!response || !(response as ResponseCandidate).ok) {
                    const status = response ? (response as ResponseCandidate).status : 0;
                    const statusText = response ? (response as ResponseCandidate).statusText : 'no response';
                    const failure = createHttpError(`LM Studio error: ${status as string} ${statusText as string}`, status);
                    throw availabilityFailureForHttpStatus(failure, status, 'Translation provider HTTP service is unavailable.');
                }
                const responseBody = (response as ResponseCandidate).body;
                const getReader = responseBody && (responseBody as ResponseBodyCandidate).getReader;
                if (!responseBody || typeof getReader !== 'function') {
                    throw new Error('LM Studio streaming unavailable: response body missing.');
                }
                const decoder = new TextDecoder('utf-8');
                const sse = createSseParser();
                const thinkStripper = createThinkBlockStripper();
                let visibleMessage = '';
                let authoritativeMessage = '';
                let lastPartial = '';
                let started = false;
                let ended = false;
                function publishPartial(next: string): void {
                    if (!onDelta || next === lastPartial)
                        return;
                    lastPartial = next;
                    try {
                        const result = onDelta(next);
                        observeDetachedOutcome(result);
                    }
                    catch {
                    }
                }
                function publishVisibleState(): void {
                    const sanitized = parseLmStudioTextOutput(visibleMessage);
                    if (sanitized === authoritativeMessage)
                        return;
                    authoritativeMessage = sanitized;
                    publishPartial(authoritativeMessage);
                }
                function appendMessageDelta(cleaned: string): void {
                    if (cleaned)
                        visibleMessage += cleaned;
                    publishVisibleState();
                }
                function finishVisibleMessage(): void {
                    appendMessageDelta(thinkStripper.finish());
                }
                function replaceWithTerminalMessage(message: string): void {
                    const sanitized = parseLmStudioTextOutput(message);
                    if (!sanitized || sanitized === authoritativeMessage)
                        return;
                    authoritativeMessage = sanitized;
                    publishPartial(authoritativeMessage);
                }
                function streamSelectionError(message: string, code: string): Error {
                    const error = new Error(message);
                    defineProperty(error, 'code', { value: code });
                    return error;
                }
                function streamServerError(streamEvent: LmStudioStreamEventCandidate): Error {
                    const eventMessage = streamEvent.message;
                    const message = eventMessage || streamEvent.error || 'LM Studio stream error.';
                    const error = new Error(String(message));
                    const code = streamEvent.code;
                    if (typeof code === 'string' && code)
                        defineProperty(error, 'code', { value: code });
                    const status = streamEvent.status;
                    if (typeof status === 'number' && Number.isFinite(status)) {
                        defineProperty(error, 'status', { value: status });
                    }
                    const retryAfter = streamEvent.retry_after;
                    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
                        defineProperty(error, 'retryAfter', { value: retryAfter });
                    }
                    const explicitRetryable = streamEvent.retryable;
                    const retryable = typeof explicitRetryable === 'boolean'
                        ? explicitRetryable
                        : status === 429 ||
                            (typeof status === 'number' &&
                                Number.isInteger(status) &&
                                status >= 500 &&
                                status <= 599);
                    defineProperty(error, 'retryable', { value: retryable });
                    return error;
                }
                function processStreamEvents(events: unknown): boolean {
                    for (const event of events as Iterable<unknown>) {
                        if (ended)
                            return true;
                        if (!event)
                            continue;
                        const streamEvent = event as LmStudioStreamEventCandidate;
                        const eventType = streamEvent.type;
                        if (eventType === 'model_load.start') {
                            const modelInstanceId = streamEvent.model_instance_id;
                            const normalizedInstanceId = typeof modelInstanceId === 'string' ? modelInstanceId.trim() : '';
                            const instanceId = normalizedInstanceId || selection.expectedInstanceId;
                            throw streamSelectionError(`LM Studio auto-loaded "${instanceId}" unexpectedly. The configured model must already be loaded in LM Studio.`, LMSTUDIO_SELECTION_ERROR_CODES.AUTO_LOADED);
                        }
                        if (eventType === 'chat.start') {
                            if (started) {
                                throw streamSelectionError('LM Studio stream sent more than one chat start.', LMSTUDIO_SELECTION_ERROR_CODES.INSTANCE_MISMATCH);
                            }
                            const modelInstanceId = streamEvent.model_instance_id;
                            const responseInstanceId = typeof modelInstanceId === 'string' ? modelInstanceId.trim() : '';
                            if (!responseInstanceId) {
                                throw streamSelectionError('LM Studio stream started without a model instance identity.', LMSTUDIO_SELECTION_ERROR_CODES.INSTANCE_MISMATCH);
                            }
                            if (responseInstanceId !== selection.expectedInstanceId) {
                                throw streamSelectionError(`LM Studio stream started with instance "${responseInstanceId}", but "${selection.expectedInstanceId}" was required.`, LMSTUDIO_SELECTION_ERROR_CODES.INSTANCE_MISMATCH);
                            }
                            started = true;
                        }
                        else if (eventType === 'message.delta') {
                            if (!started) {
                                throw streamSelectionError('LM Studio stream sent a message delta before a matching chat start.', LMSTUDIO_SELECTION_ERROR_CODES.INSTANCE_MISMATCH);
                            }
                            const content = streamEvent.content;
                            if (typeof content === 'string')
                                appendMessageDelta(thinkStripper.feed(content));
                        }
                        else if (eventType === 'chat.end') {
                            if (!started) {
                                throw streamSelectionError('LM Studio stream ended before a matching chat start.', LMSTUDIO_SELECTION_ERROR_CODES.INSTANCE_MISMATCH);
                            }
                            finishVisibleMessage();
                            const result = streamEvent.result;
                            if (result) {
                                assertLmStudioChatResponseMatchesSelection(result, selection);
                                const finalMessage = extractMessageContentFromV1(result);
                                if (finalMessage)
                                    replaceWithTerminalMessage(finalMessage);
                            }
                            ended = true;
                            cancelReader(undefined);
                            return true;
                        }
                        else if (eventType === 'error') {
                            throw streamServerError(streamEvent);
                        }
                    }
                    return ended;
                }
                function streamHasEnded(): boolean {
                    return ended;
                }
                const acquiredReader: unknown = Reflect.apply(getReader, responseBody, []);
                if (!acquiredReader || (typeof acquiredReader !== 'object' && typeof acquiredReader !== 'function')) {
                    throw new TypeError('LM Studio stream reader must be an object.');
                }
                const ownedReader: ReaderCandidate = acquiredReader;
                let readCapability: unknown;
                let readCapabilityError: unknown;
                let readCapabilityFailed = false;
                let cancelCapability: UnknownFunction | null = null;
                let releaseCapability: UnknownFunction | null = null;
                try {
                    readCapability = ownedReader.read;
                }
                catch (error) {
                    readCapabilityFailed = true;
                    readCapabilityError = error;
                }
                try {
                    const candidate = ownedReader.cancel;
                    if (typeof candidate === 'function')
                        cancelCapability = candidate as UnknownFunction;
                }
                catch {
                }
                try {
                    const candidate = ownedReader.releaseLock;
                    if (typeof candidate === 'function')
                        releaseCapability = candidate as UnknownFunction;
                }
                catch {
                }
                let cancelClaimed = false;
                cancelReader = (reason: unknown): void => {
                    if (cancelClaimed)
                        return;
                    cancelClaimed = true;
                    if (!cancelCapability)
                        return;
                    try {
                        const cancellation = Reflect.apply(cancelCapability, ownedReader, [reason]);
                        observeDetachedOutcome(cancellation);
                    }
                    catch {
                    }
                };
                let releaseClaimed = false;
                releaseReader = (): void => {
                    if (releaseClaimed)
                        return;
                    releaseClaimed = true;
                    if (!releaseCapability)
                        return;
                    try {
                        const release = Reflect.apply(releaseCapability, ownedReader, []);
                        observeDetachedOutcome(release);
                    }
                    catch {
                    }
                };
                if (readCapabilityFailed)
                    throw readCapabilityError;
                if (typeof readCapability !== 'function') {
                    throw new TypeError('LM Studio stream reader is missing required "read" capability.');
                }
                while (!ended) {
                    const readResult = (await Reflect.apply(readCapability, ownedReader, [])) as ReadResultCandidate;
                    if (readResult.done)
                        break;
                    const value = readResult.value;
                    if (processStreamEvents(sse.feed(decoder.decode(value as Parameters<TextDecoder['decode']>[0], {
                        stream: true,
                    }))))
                        break;
                }
                if (!streamHasEnded())
                    processStreamEvents(sse.finish(decoder.decode()));
                if (!streamHasEnded()) {
                    throw createIncompleteStreamError('LM Studio stream ended before the required chat.end event.');
                }
                return { authoritativeMessage };
            }
            catch (error) {
                const shouldInvalidateSelection = invalidatesSelection(error);
                cancelReader(error);
                if (shouldInvalidateSelection)
                    invalidateModelSelection();
                const converted = coerceFetchError(error, linked, 'LM Studio stream request failed');
                preserveAvailabilityFailure(error, converted);
                if (isUnabortedTransportFailure(linked, getAbortReason, responseObserved)) {
                    markTranslationProviderUnavailable(converted, 'transport-unavailable', 'Translation provider transport is unavailable.');
                }
                throw converted;
            }
            finally {
                releaseReader();
                releaseLinkedAbort(linked);
            }
        }
        function createIncompleteStreamError(message: string): Error {
            const error = new Error(message);
            try {
                (error as MutableErrorCandidate).code = 'INCOMPLETE_STREAM';
                (error as MutableErrorCandidate).retryable = true;
            }
            catch {
            }
            return error;
        }
        async function translateOneLmStudio(text: unknown, requestOptions: unknown = {}): Promise<string> {
            const sourceText = String(text ?? '');
            const data = await requestLmStudioChat(buildLmStudioChatBody(sourceText, cfg, false, assemblePrompt(prompt, requestOptions as ProviderRequestCandidate, sourceText)), requestOptions);
            return parseTranslationOutput(extractMessageContentFromV1(data), false);
        }
        async function translateOneLmStudioStream(text: unknown, requestOptions: unknown = {}): Promise<string> {
            const sourceText = String(text ?? '');
            const streamResult: unknown = await requestLmStudioChatStream(buildLmStudioChatBody(sourceText, cfg, true, assemblePrompt(prompt, requestOptions as ProviderRequestCandidate, sourceText)), requestOptions);
            const messageContent: unknown = streamResult && (streamResult as StreamTransportResultCandidate).authoritativeMessage
                ? (streamResult as StreamTransportResultCandidate).authoritativeMessage
                : '';
            return requireTranslationOutput(typeof messageContent === 'string' ? messageContent : '', true);
        }
        return {
            kind: 'lmstudio',
            capabilities: PROVIDER_CAPABILITIES,
            config: cfg,
            async getCapacity(requestOptions: unknown = {}): Promise<number> {
                const selection = await resolveLmStudioChatModelSelection(requestOptions);
                return positiveInteger(selection.capacity, 1);
            },
            getRuntimeStatus,
            async translate(request: unknown = {}): Promise<string> {
                const text = String((request as ProviderRequestCandidate).text ?? '');
                if ((request as ProviderRequestCandidate).stream) {
                    return translateOneLmStudioStream(text, request);
                }
                return translateOneLmStudio(text, request);
            },
            invalidateModelSelection,
            getStatus: getLmStudioProviderStatus,
            requestLmStudioModelCatalog,
            resolveLmStudioChatModelSelection,
        };
    }
    return { createLmStudioProvider };
}
