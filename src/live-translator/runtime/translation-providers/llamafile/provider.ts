import { compilePromptTemplate } from '../prompt-template.js';
import type { BoundProviderLogger, LlamafileConfig, LinkedAbort, TranslationProviderCapabilities, TranslationProviderCommonModule, } from '../common.js';
import { createTranslationProviderRuntimeStatus, type TranslationProviderRuntimeStatus } from '../runtime-status.js';
import type { LlamaCppProvider, LlamaCppProviderModule } from '../llamacpp/provider.js';
import type { LlamafileArtifactsModule, LlamafileArtifactStatus } from './artifacts.js';
import { selectLlamafileProfile, LLAMAFILE_SERVER_PROFILE } from './catalog.js';
import type { LlamafileProcessClient, LlamafileProcessModule, LlamafileProcessStatus } from './process.js';
interface LlamafileProviderCommonDependencies {
    readonly createLinkedAbort: (options?: unknown) => LinkedAbort;
    readonly bindLogger: (logger?: unknown) => BoundProviderLogger;
    readonly createProviderCapabilities: (options?: unknown) => Readonly<TranslationProviderCapabilities>;
    readonly getGlobalSettings: () => object;
    readonly getGlobalTranslatorConfig: () => object | null;
    readonly normalizeLlamafileConfig: (rootConfig?: unknown, settings?: unknown) => LlamafileConfig;
}
interface ProviderOptionsCandidate {
    readonly logger?: unknown;
    readonly paths?: unknown;
    readonly settings?: unknown;
    readonly translatorConfig?: unknown;
}
interface PathsCandidate {
    readonly llamafileDataPath?: unknown;
}
export interface LlamafileProviderStatus {
    readonly kind: 'llamafile';
    readonly artifacts: Readonly<LlamafileArtifactStatus>;
    readonly process: Readonly<LlamafileProcessStatus> | null;
    readonly backend: ReturnType<LlamaCppProvider['getStatus']> | null;
}
export interface LlamafileProvider {
    readonly kind: 'llamafile';
    readonly capabilities: Readonly<TranslationProviderCapabilities>;
    readonly config: LlamafileConfig;
    getCapacity(requestOptions?: unknown): Promise<number>;
    getRuntimeStatus(): Readonly<TranslationProviderRuntimeStatus>;
    getStatus(): LlamafileProviderStatus;
    translate(request?: unknown): Promise<string>;
    close(): void;
}
export interface LlamafileProviderModule {
    createLlamafileProvider(options?: unknown): LlamafileProvider;
}
export function createLlamafileProviderModule(common: TranslationProviderCommonModule, llamaCppProvider: LlamaCppProviderModule, artifactsModule: LlamafileArtifactsModule, processModule: LlamafileProcessModule): LlamafileProviderModule {
    const { bindLogger, createLinkedAbort, createProviderCapabilities, getGlobalSettings, getGlobalTranslatorConfig, normalizeLlamafileConfig, } = common as LlamafileProviderCommonDependencies;
    const { createLlamaCppProvider } = llamaCppProvider;
    const { createLlamafileArtifactManager } = artifactsModule;
    const { createLlamafileProcessClient } = processModule;
    const capabilities = createProviderCapabilities({
        streaming: true,
        tracksAvailability: true,
        requiresVerifiedCapacity: true,
    });
    function createLlamafileProvider(options: unknown = {}): LlamafileProvider {
        const source = options as ProviderOptionsCandidate;
        const cfg = normalizeLlamafileConfig(source.translatorConfig ?? getGlobalTranslatorConfig(), source.settings ?? getGlobalSettings());
        const prompt = compilePromptTemplate(cfg.system_prompt, 'settings.llamafile.system_prompt');
        const profile = selectLlamafileProfile(cfg.profile);
        const logger = bindLogger(source.logger);
        const paths = source.paths as PathsCandidate | undefined;
        const dataPath = requiredPath(paths?.llamafileDataPath, 'llamafileDataPath');
        const artifacts = createLlamafileArtifactManager({ dataPath, profile: profile.id });
        let processClient: LlamafileProcessClient | null = null;
        let backend: LlamaCppProvider | null = null;
        let startupError: Error | null = null;
        let closed = false;
        const waiters = new Set<() => void>();
        const startup = initialize();
        void startup
            .catch((error: unknown) => logger.error('[LiveTranslator][llamafile] startup failed', error))
            .catch(() => {
        });
        async function initialize(): Promise<LlamaCppProvider> {
            try {
                const prepared = await artifacts.prepare();
                assertOpen();
                processClient = createLlamafileProcessClient({
                    profile: profile.id,
                    executablePath: prepared.executablePath,
                    targetPath: prepared.targetPath,
                    draftPath: prepared.draftPath,
                });
                await processClient.ensureReady();
                assertOpen();
                backend = createLlamaCppProvider({
                    translatorConfig: createBackendConfig(cfg, processClient),
                    settings: {},
                    logger: source.logger,
                }, prompt);
                return backend;
            }
            catch (error) {
                startupError = Error.isError(error)
                    ? error
                    : createError('Managed llamafile startup failed.', 'LLAMAFILE_STARTUP_ERROR');
                throw startupError;
            }
        }
        function assertUsable(): void {
            assertOpen();
            const state = processClient?.getStatus();
            if (state?.phase === 'error' || state?.phase === 'closed') {
                throw createError(state.message, state.code);
            }
        }
        async function withBackend<T>(request: unknown, call: (backend: LlamaCppProvider, options: object) => Promise<T>): Promise<T> {
            assertUsable();
            const input = request && typeof request === 'object' ? (request as Record<string, unknown>) : {};
            const parentSignal = input['signal'];
            const timeoutMs = input['timeoutMs'];
            assertUsable();
            const requestAbort = new AbortController();
            const linked = createLinkedAbort({
                signal: parentSignal,
                timeoutMs: timeoutMs ?? cfg.request_timeout_ms,
            });
            const signal = linked.signal as AbortSignal;
            return new Promise<T>((resolve, reject) => {
                let settled = false;
                let linkedOwned = true;
                let listenerOwned = false;
                let listenerAcquiring = false;
                const release = (): void => {
                    waiters.delete(onClose);
                    if (listenerOwned && !listenerAcquiring) {
                        listenerOwned = false;
                        try {
                            signal.removeEventListener('abort', onAbort);
                        }
                        catch {
                        }
                    }
                    if (linkedOwned) {
                        linkedOwned = false;
                        try {
                            linked.cleanup();
                        }
                        catch {
                        }
                    }
                };
                const complete = (success: boolean, value: unknown, cancel: boolean): void => {
                    if (cancel) {
                        requestAbort.abort(value);
                    }
                    release();
                    if (success)
                        resolve(value as T);
                    else
                        reject(value);
                };
                const finish = (success: boolean, value: unknown, cancel = false): void => {
                    if (settled)
                        return;
                    settled = true;
                    complete(success, value, cancel);
                };
                const onAbort = (): void => {
                    if (settled)
                        return;
                    settled = true;
                    let reason: unknown;
                    try {
                        reason = linked.getAbortReason() ?? signal.reason;
                    }
                    catch (error) {
                        reason = error;
                    }
                    complete(false, reason, true);
                };
                const onClose = (): void => {
                    finish(false, createError('Managed llamafile provider is closed.', 'LLAMAFILE_PROVIDER_CLOSED'), true);
                };
                waiters.add(onClose);
                const task = startup.then(async (readyBackend) => {
                    if (settled)
                        return undefined;
                    assertUsable();
                    if (settled)
                        return undefined;
                    const delegated: Record<PropertyKey, unknown> = {};
                    for (const key of Reflect.ownKeys(input)) {
                        if (!Reflect.getOwnPropertyDescriptor(input, key)?.enumerable)
                            continue;
                        const value: unknown = key === 'signal'
                            ? requestAbort.signal
                            : key === 'timeoutMs'
                                ? timeoutMs
                                : Reflect.get(input, key);
                        Object.defineProperty(delegated, key, {
                            value,
                            enumerable: true,
                            configurable: true,
                            writable: true,
                        });
                    }
                    delegated['signal'] = requestAbort.signal;
                    const onDelta = delegated['onDelta'];
                    if (typeof onDelta === 'function') {
                        delegated['onDelta'] = (partial: unknown): unknown => {
                            if (settled || closed)
                                return undefined;
                            const observed: unknown = Reflect.apply(onDelta, undefined, [partial]);
                            return observed;
                        };
                    }
                    if (settled)
                        return undefined;
                    requestAbort.signal.throwIfAborted();
                    const result = await call(readyBackend, delegated);
                    assertUsable();
                    return result;
                });
                task.then((value) => {
                    finish(true, value);
                }, (error: unknown) => {
                    finish(false, error);
                });
                try {
                    listenerOwned = true;
                    listenerAcquiring = true;
                    try {
                        signal.addEventListener('abort', onAbort, { once: true });
                    }
                    finally {
                        listenerAcquiring = false;
                        if (settled)
                            release();
                    }
                    if (signal.aborted)
                        onAbort();
                    if (closed)
                        onClose();
                }
                catch (error) {
                    finish(false, error, true);
                }
            });
        }
        function getRuntimeStatus(): Readonly<TranslationProviderRuntimeStatus> {
            if (closed)
                return unavailableStatus('closed', 'Managed llamafile provider is closed.');
            const childStatus = processClient?.getStatus();
            if (childStatus?.phase === 'error')
                return unavailableStatus(childStatus.code, childStatus.message);
            if (backend)
                return createTranslationProviderRuntimeStatus({
                    ...backend.getRuntimeStatus(),
                    model: profile.modelAlias,
                });
            if (startupError)
                return unavailableStatus(readErrorCode(startupError) || 'startup-error', startupError.message);
            const artifactStatus = artifacts.getStatus();
            if (artifactStatus.phase === 'error') {
                return unavailableStatus(nonemptyOr(artifactStatus.code, 'artifact-error'), artifactStatus.message);
            }
            if (artifactStatus.phase !== 'ready') {
                return pendingStatus(`artifact-${artifactStatus.phase}`, formatArtifactProgress(artifactStatus));
            }
            return pendingStatus(nonemptyOr(childStatus?.code, 'starting'), nonemptyOr(childStatus?.message, 'Starting local translation model.'));
        }
        function pendingStatus(code: string, message: string): Readonly<TranslationProviderRuntimeStatus> {
            return createTranslationProviderRuntimeStatus({
                state: 'pending',
                code: code.slice(0, 128),
                message: message.slice(0, 1024),
                model: profile.modelAlias,
                capacity: 0,
                capacityVerified: false,
            });
        }
        function unavailableStatus(code: string, message: string): Readonly<TranslationProviderRuntimeStatus> {
            return createTranslationProviderRuntimeStatus({
                state: 'unavailable',
                code,
                message,
                model: profile.modelAlias,
                capacity: 0,
                capacityVerified: false,
            });
        }
        function getStatus(): LlamafileProviderStatus {
            return {
                kind: 'llamafile',
                artifacts: artifacts.getStatus(),
                process: processClient?.getStatus() ?? null,
                backend: backend?.getStatus() ?? null,
            };
        }
        function close(): void {
            if (closed)
                return;
            closed = true;
            for (const closeWaiter of waiters)
                closeWaiter();
            artifacts.close();
            processClient?.close();
        }
        function assertOpen(): void {
            if (closed)
                throw createError('Managed llamafile provider is closed.', 'LLAMAFILE_PROVIDER_CLOSED');
        }
        return {
            kind: 'llamafile',
            capabilities,
            config: cfg,
            async getCapacity(requestOptions?: unknown): Promise<number> {
                return withBackend(requestOptions, (readyBackend, input) => readyBackend.getCapacity(input));
            },
            getRuntimeStatus,
            getStatus,
            async translate(request: unknown = {}): Promise<string> {
                return withBackend(request, (readyBackend, input) => readyBackend.translate(input));
            },
            close,
        };
    }
    return { createLlamafileProvider };
}
function createBackendConfig(cfg: LlamafileConfig, client: LlamafileProcessClient): object {
    return Object.freeze({
        provider: 'llamacpp',
        settings: Object.freeze({
            llamacpp: Object.freeze({
                base_url: client.baseUrl,
                api_key: client.apiKey,
                model: client.modelAlias,
                system_prompt: cfg.system_prompt,
                temperature: LLAMAFILE_SERVER_PROFILE.temperature,
                top_p: LLAMAFILE_SERVER_PROFILE.topP,
                top_k: LLAMAFILE_SERVER_PROFILE.topK,
                min_p: LLAMAFILE_SERVER_PROFILE.minP,
                repeat_penalty: LLAMAFILE_SERVER_PROFILE.repeatPenalty,
                max_output_tokens: cfg.max_output_tokens,
                request_timeout_ms: cfg.request_timeout_ms,
            }),
        }),
    });
}
function formatArtifactProgress(status: Readonly<LlamafileArtifactStatus>): string {
    if (status.phase !== 'downloading' || status.totalBytes <= 0)
        return status.message;
    const percent = Math.min(100, Math.floor((status.completedBytes / status.totalBytes) * 100));
    return `Downloading ${status.artifactId} artifact (${String(percent)}%).`;
}
function requiredPath(value: unknown, name: string): string {
    if (typeof value === 'string' && value)
        return value;
    throw createError(`Managed llamafile requires runtime path ${name}.`, 'LLAMAFILE_PATH_UNAVAILABLE');
}
function nonemptyOr(value: string | undefined, fallback: string): string {
    if (value)
        return value;
    return fallback;
}
function readErrorCode(error: Error): string {
    const code = (error as Error & {
        readonly code?: unknown;
    }).code;
    return typeof code === 'string' ? code : '';
}
function createError(message: string, code: string): Error {
    const error = new Error(message) as Error & {
        code: string;
    };
    error.code = code;
    return error;
}
