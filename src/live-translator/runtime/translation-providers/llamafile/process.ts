import type { ChildProcess, spawn as nodeSpawn } from 'node:child_process';
import type * as Path from 'node:path';
import type * as Net from 'node:net';
import type * as Crypto from 'node:crypto';
import type { LinkedAbort, TranslationProviderCommonModule } from '../common.js';
import { selectLlamafileProfile, selectLlamafileRuntime, LLAMAFILE_SERVER_PROFILE, type LlamafileProfileId, } from './catalog.js';
type RuntimeFunction = (...args: unknown[]) => unknown;
type TimeoutScheduler = (callback: () => void, delay: number) => unknown;
type TimeoutCanceler = (handle: unknown) => void;
interface RuntimeScopeCandidate {
    readonly clearTimeout?: unknown;
    readonly process?: unknown;
    readonly require?: unknown;
    readonly setTimeout?: unknown;
}
interface ProcessCandidate {
    readonly platform?: unknown;
    readonly arch?: unknown;
}
interface ProcessOptionsCandidate {
    readonly profile?: unknown;
    readonly arch?: unknown;
    readonly clearTimeout?: unknown;
    readonly draftPath?: unknown;
    readonly fetch?: unknown;
    readonly platform?: unknown;
    readonly require?: unknown;
    readonly setTimeout?: unknown;
    readonly spawn?: unknown;
    readonly executablePath?: unknown;
    readonly targetPath?: unknown;
}
interface HealthResponseCandidate {
    readonly ok?: unknown;
    readonly status?: unknown;
    json(): Promise<{
        data?: {
            id?: unknown;
        }[];
    }>;
}
interface MutableProcessStatus {
    phase: 'idle' | 'starting' | 'ready' | 'error' | 'closed';
    code: string;
    message: string;
}
export interface LlamafileProcessStatus {
    readonly phase: MutableProcessStatus['phase'];
    readonly code: string;
    readonly message: string;
}
export interface LlamafileProcessClient {
    readonly baseUrl: string;
    readonly modelAlias: string;
    readonly apiKey: string;
    readonly executablePath: string;
    readonly arguments: readonly string[];
    ensureReady(): Promise<void>;
    getStatus(): Readonly<LlamafileProcessStatus>;
    close(): void;
}
export interface LlamafileProcessModule {
    createServerArguments(targetPath: string, draftPath: string, port: number, modelAlias: string, apiKey: string, profileId?: LlamafileProfileId): readonly string[];
    createLlamafileProcessClient(options?: unknown): LlamafileProcessClient;
}
const HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 10 * 60 * 1000;
const HEALTH_REQUEST_TIMEOUT_MS = 2000;
const HEALTH_RETRY_MS = 500;
export function createLlamafileProcessModule(common: TranslationProviderCommonModule, runtimeScope: unknown): LlamafileProcessModule {
    const { createLinkedAbort, getFetch } = common;
    function createServerArguments(targetPath: string, draftPath: string, port: number, modelAlias: string, apiKey: string, profileId: LlamafileProfileId = 'gemma-4-26b-a4b'): readonly string[] {
        const profile = selectLlamafileProfile(profileId);
        return Object.freeze([
            '-m',
            targetPath,
            '--server',
            '-md',
            draftPath,
            '-a',
            modelAlias,
            '--reasoning',
            'off',
            '--spec-type',
            'draft-mtp',
            '--spec-draft-n-max',
            String(profile.draftTokens),
            '--no-spec-draft-backend-sampling',
            '-ngl',
            'all',
            '-ngld',
            'all',
            '--fit',
            'off',
            '-fa',
            profile.flashAttention,
            '-c',
            '2048',
            '-np',
            '5',
            '--kv-unified',
            '-b',
            '1024',
            '-ub',
            '128',
            '--temp',
            LLAMAFILE_SERVER_PROFILE.temperature.toFixed(1),
            '--top-p',
            String(LLAMAFILE_SERVER_PROFILE.topP),
            '--top-k',
            String(LLAMAFILE_SERVER_PROFILE.topK),
            '--min-p',
            String(LLAMAFILE_SERVER_PROFILE.minP),
            '--typical',
            '1',
            '--top-n-sigma',
            '-1',
            '--xtc-probability',
            '0',
            '--dynatemp-range',
            '0',
            '--mirostat',
            '0',
            '--repeat-penalty',
            String(LLAMAFILE_SERVER_PROFILE.repeatPenalty),
            '--presence-penalty',
            '0',
            '--frequency-penalty',
            '0',
            '--dry-multiplier',
            '0',
            '--ctx-checkpoints',
            '0',
            '--cache-ram',
            '0',
            '--no-cache-idle-slots',
            '--no-mmproj',
            '--host',
            HOST,
            '--port',
            String(port),
            '--api-key',
            apiKey,
        ]);
    }
    function createLlamafileProcessClient(options: unknown = {}): LlamafileProcessClient {
        const candidate = options as ProcessOptionsCandidate;
        const profile = selectLlamafileProfile(candidate.profile);
        const executablePath = requiredString(candidate.executablePath, 'executablePath');
        const targetPath = requiredString(candidate.targetPath, 'targetPath');
        const draftPath = requiredString(candidate.draftPath, 'draftPath');
        const node = resolveNodeRuntime(candidate);
        const fetchImpl = typeof candidate.fetch === 'function' ? (candidate.fetch as RuntimeFunction) : getFetch();
        let baseUrl = '';
        const modelAlias = `${profile.modelAlias}-${node.crypto.randomUUID()}`;
        const apiKey = node.crypto.randomBytes(32).toString('hex');
        let args: readonly string[] = [];
        let stderr = '';
        const status: MutableProcessStatus = {
            phase: 'idle',
            code: 'initializing',
            message: 'Waiting to start llamafile.',
        };
        let child: ChildProcess | null = null;
        let closed = false;
        let readiness: Promise<void> | null = null;
        let wakeDelay: (() => void) | null = null;
        let terminalError: Error | null = null;
        function getStatus(): Readonly<LlamafileProcessStatus> {
            return Object.freeze({ ...status });
        }
        function ensureReady(): Promise<void> {
            if (closed)
                return Promise.reject(createClosedError());
            readiness ??= startAndProbe();
            return readiness.then(() => {
                assertRunning();
            });
        }
        async function startAndProbe(): Promise<void> {
            status.phase = 'starting';
            status.code = 'starting';
            status.message = 'Starting local translation model.';
            try {
                selectLlamafileRuntime(node.platform, node.arch);
                const port = await reservePort();
                assertRunning();
                baseUrl = `http://${HOST}:${String(port)}`;
                args = createServerArguments(targetPath, draftPath, port, modelAlias, apiKey, profile.id);
                const command = node.platform === 'win32' ? executablePath : '/bin/sh';
                const launchArgs = node.platform === 'win32' ? [...args] : [executablePath, ...args];
                const cacheDirectory = node.path.dirname(executablePath);
                child = node.spawn(command, launchArgs, {
                    cwd: cacheDirectory,
                    env: { ...node.env, TMPDIR: cacheDirectory, TMP: cacheDirectory, TEMP: cacheDirectory },
                    shell: false,
                    stdio: ['ignore', 'ignore', 'pipe'],
                    windowsHide: true,
                });
                child.stderr?.on('data', (chunk: Buffer) => {
                    stderr = (stderr + chunk.toString()).slice(-4096);
                });
                child.once('error', (error) => {
                    if (closed)
                        return;
                    terminalError = wrapProcessError('Unable to start llamafile', error);
                    publishTerminalError(terminalError);
                    wakeDelay?.();
                });
                child.once('exit', (code, signal) => {
                    if (closed)
                        return;
                    if (!terminalError) {
                        const readiness = status.phase === 'ready' ? 'after becoming ready' : 'before becoming ready';
                        terminalError = createError(`llamafile exited ${readiness} (code ${String(code)}, signal ${String(signal)}). ${stderr.replaceAll(apiKey, '[redacted]').slice(-800)}`, 'LLAMAFILE_PROCESS_EXIT');
                        publishTerminalError(terminalError);
                    }
                    wakeDelay?.();
                });
                const deadline = Date.now() + STARTUP_TIMEOUT_MS;
                while (Date.now() < deadline) {
                    assertRunning();
                    const healthReady = await healthIsReady(fetchImpl, `${baseUrl}/health`);
                    assertRunning();
                    if (healthReady) {
                        status.phase = 'ready';
                        status.code = 'ready';
                        status.message = 'Local translation model is ready.';
                        return;
                    }
                    await delay();
                }
                throw createError('llamafile did not become ready within 10 minutes.', 'LLAMAFILE_STARTUP_TIMEOUT');
            }
            catch (error) {
                const failure = Error.isError(error)
                    ? error
                    : createError('llamafile startup failed.', 'LLAMAFILE_STARTUP_ERROR');
                if (!closed) {
                    terminalError ??= failure;
                    publishTerminalError(terminalError);
                    child?.kill();
                }
                throw failure;
            }
        }
        async function healthIsReady(fetch: RuntimeFunction, url: string): Promise<boolean> {
            let linked: LinkedAbort | null = null;
            try {
                linked = createLinkedAbort({ timeoutMs: HEALTH_REQUEST_TIMEOUT_MS });
                const response = (await fetch(url, { signal: linked.signal })) as HealthResponseCandidate;
                if (response.ok !== true && response.status !== 200)
                    return false;
                const catalog = (await fetch(`${baseUrl}/v1/models`, {
                    signal: linked.signal,
                    headers: { Authorization: `Bearer ${apiKey}` },
                })) as HealthResponseCandidate;
                if (catalog.ok !== true && catalog.status !== 200)
                    return false;
                const body = await catalog.json();
                return Array.isArray(body.data) && body.data.some((model) => model.id === modelAlias);
            }
            catch {
                return false;
            }
            finally {
                linked?.cleanup();
            }
        }
        function reservePort(): Promise<number> {
            return new Promise((resolve, reject) => {
                const server = node.net.createServer();
                server.once('error', reject);
                server.listen(0, HOST, () => {
                    const address = server.address() as Net.AddressInfo;
                    server.close((error) => {
                        if (error)
                            reject(error);
                        else
                            resolve(address.port);
                    });
                });
            });
        }
        function delay(): Promise<void> {
            return new Promise((resolve) => {
                const handle = node.setTimeout(() => {
                    wakeDelay = null;
                    resolve();
                }, HEALTH_RETRY_MS);
                wakeDelay = () => {
                    node.clearTimeout(handle);
                    wakeDelay = null;
                    resolve();
                };
            });
        }
        function assertRunning(): void {
            if (closed)
                throw createClosedError();
            if (terminalError)
                throw terminalError;
        }
        function publishTerminalError(error: Error): void {
            status.phase = 'error';
            status.code = readErrorCode(error) || 'LLAMAFILE_PROCESS_ERROR';
            status.message = error.message;
        }
        function close(): void {
            if (closed)
                return;
            closed = true;
            status.phase = 'closed';
            status.code = 'closed';
            status.message = 'Local translation model was stopped.';
            wakeDelay?.();
            child?.kill();
        }
        return {
            get baseUrl() {
                return baseUrl;
            },
            modelAlias,
            apiKey,
            executablePath,
            get arguments() {
                return args;
            },
            ensureReady,
            getStatus,
            close,
        };
    }
    function resolveNodeRuntime(candidate: ProcessOptionsCandidate): {
        readonly path: typeof Path;
        readonly net: typeof Net;
        readonly crypto: typeof Crypto;
        readonly platform: string;
        readonly arch: string;
        readonly env: NodeJS.ProcessEnv;
        readonly spawn: typeof nodeSpawn;
        readonly setTimeout: TimeoutScheduler;
        readonly clearTimeout: TimeoutCanceler;
    } {
        const scope = runtimeScope as RuntimeScopeCandidate;
        const requireValue = typeof candidate.require === 'function' ? candidate.require : scope.require;
        if (typeof requireValue !== 'function') {
            throw createError('Managed llamafile requires NW.js Node APIs.', 'LLAMAFILE_NODE_API_UNAVAILABLE');
        }
        const load = requireValue as (name: string) => unknown;
        const childProcess = load('child_process') as {
            readonly spawn?: unknown;
        };
        const spawnValue = typeof candidate.spawn === 'function' ? candidate.spawn : childProcess.spawn;
        const processValue = scope.process as ProcessCandidate | undefined;
        const platformValue = typeof candidate.platform === 'string' ? candidate.platform : processValue?.platform;
        const archValue = typeof candidate.arch === 'string' ? candidate.arch : processValue?.arch;
        const explicitSetTimeout = candidate.setTimeout;
        const explicitClearTimeout = candidate.clearTimeout;
        const setTimeoutOwner = typeof explicitSetTimeout === 'function' ? candidate : scope;
        const clearTimeoutOwner = typeof explicitClearTimeout === 'function' ? candidate : scope;
        const setTimeoutValue = typeof explicitSetTimeout === 'function' ? explicitSetTimeout : scope.setTimeout;
        const clearTimeoutValue = typeof explicitClearTimeout === 'function' ? explicitClearTimeout : scope.clearTimeout;
        if (typeof spawnValue !== 'function' ||
            typeof setTimeoutValue !== 'function' ||
            typeof clearTimeoutValue !== 'function') {
            throw createError('Managed llamafile requires process and timer APIs.', 'LLAMAFILE_NODE_API_UNAVAILABLE');
        }
        return {
            path: load('path') as typeof Path,
            net: load('net') as typeof Net,
            crypto: load('crypto') as typeof Crypto,
            platform: typeof platformValue === 'string' ? platformValue : '',
            arch: typeof archValue === 'string' ? archValue : '',
            env: (load('process') as {
                env: NodeJS.ProcessEnv;
            }).env,
            spawn: spawnValue as typeof nodeSpawn,
            setTimeout: (setTimeoutValue as TimeoutScheduler).bind(setTimeoutOwner),
            clearTimeout: (clearTimeoutValue as TimeoutCanceler).bind(clearTimeoutOwner),
        };
    }
    return { createServerArguments, createLlamafileProcessClient };
}
function requiredString(value: unknown, name: string): string {
    if (typeof value === 'string' && value.trim())
        return value;
    throw createError(`Managed llamafile requires nonempty ${name}.`, 'LLAMAFILE_INVALID_CONFIG');
}
function readErrorCode(error: unknown): string {
    const code = (error as {
        readonly code?: unknown;
    }).code;
    return typeof code === 'string' ? code : '';
}
function wrapProcessError(message: string, cause: Error): Error {
    return createError(`${message}: ${cause.message}`, 'LLAMAFILE_PROCESS_ERROR');
}
function createClosedError(): Error {
    return createError('Managed llamafile process is closed.', 'LLAMAFILE_PROCESS_CLOSED');
}
function createError(message: string, code: string): Error {
    const error = new Error(message) as Error & {
        code: string;
    };
    error.code = code;
    return error;
}
