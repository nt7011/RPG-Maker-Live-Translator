import type * as Crypto from 'node:crypto';
import type * as Fs from 'node:fs';
import type * as Http from 'node:http';
import type * as Https from 'node:https';
import type * as Path from 'node:path';
import type * as Net from 'node:net';
import type * as Os from 'node:os';
import { acquireArtifactLock, ARTIFACT_LOCK_PORT } from './artifact-lock.js';
import { selectLlamafileProfile, selectLlamafileRuntime, type LlamafileArtifact } from './catalog.js';
const DOWNLOAD_IDLE_TIMEOUT_MS = 60000;
type RequireFunction = (moduleName: string) => unknown;
interface RuntimeScopeCandidate {
    readonly require?: unknown;
}
interface ArtifactManagerOptionsCandidate {
    readonly profile?: unknown;
    readonly artifacts?: unknown;
    readonly dataPath?: unknown;
    readonly require?: unknown;
}
interface ArtifactCandidate {
    readonly fileName?: unknown;
    readonly id?: unknown;
    readonly sha256?: unknown;
    readonly size?: unknown;
    readonly url?: unknown;
}
interface ErrorCodeCandidate {
    readonly code?: unknown;
}
interface NodeRuntime {
    readonly crypto: typeof Crypto;
    readonly fs: typeof Fs;
    readonly http: typeof Http;
    readonly https: typeof Https;
    readonly path: typeof Path;
    readonly net: typeof Net;
    readonly os: typeof Os;
}
interface MutableArtifactStatus {
    phase: LlamafileArtifactPhase;
    artifactId: '' | LlamafileArtifact['id'];
    completedBytes: number;
    totalBytes: number;
    code: string;
    message: string;
}
export type LlamafileArtifactPhase = 'idle' | 'waiting' | 'checking' | 'downloading' | 'verifying' | 'ready' | 'error' | 'closed';
export interface LlamafileArtifactStatus {
    readonly phase: LlamafileArtifactPhase;
    readonly artifactId: '' | LlamafileArtifact['id'];
    readonly completedBytes: number;
    readonly totalBytes: number;
    readonly code: string;
    readonly message: string;
}
export interface PreparedLlamafileArtifacts {
    readonly executablePath: string;
    readonly targetPath: string;
    readonly draftPath: string;
}
export interface LlamafileArtifactManager {
    prepare(): Promise<PreparedLlamafileArtifacts>;
    getStatus(): Readonly<LlamafileArtifactStatus>;
    close(): void;
}
export interface LlamafileArtifactsModule {
    createLlamafileArtifactManager(options?: unknown): LlamafileArtifactManager;
}
export function createLlamafileArtifactsModule(runtimeScope: unknown): LlamafileArtifactsModule {
    function createLlamafileArtifactManager(options: unknown = {}): LlamafileArtifactManager {
        const candidate = options as ArtifactManagerOptionsCandidate;
        const dataPath = requiredString(candidate.dataPath, 'dataPath');
        const node = resolveNodeRuntime(candidate.require);
        const runtime = selectLlamafileRuntime(node.os.platform(), node.os.arch());
        const profile = selectLlamafileProfile(candidate.profile);
        const artifacts = normalizeArtifacts(candidate.artifacts ?? [runtime, ...profile.models]);
        const artifactPaths = new Map<LlamafileArtifact['id'], string>();
        const lifetime = new AbortController();
        const fileClosures = new Set<Promise<void>>();
        let activeCancel: (() => void) | null = null;
        let closed = false;
        let preparation: Promise<PreparedLlamafileArtifacts> | null = null;
        const status: MutableArtifactStatus = {
            phase: 'idle',
            artifactId: '',
            completedBytes: 0,
            totalBytes: artifacts.reduce((total, artifact) => total + artifact.size, 0),
            code: '',
            message: 'Waiting to prepare local runtime and models.',
        };
        function getStatus(): Readonly<LlamafileArtifactStatus> {
            return Object.freeze({ ...status });
        }
        function close(): void {
            if (closed)
                return;
            closed = true;
            status.phase = 'closed';
            status.code = 'LLAMAFILE_ARTIFACTS_CLOSED';
            status.message = 'Local artifact preparation was stopped.';
            lifetime.abort(createClosedError());
            activeCancel?.();
            activeCancel = null;
        }
        function prepare(): Promise<PreparedLlamafileArtifacts> {
            if (closed)
                return Promise.reject(createError(status.message, status.code));
            preparation ??= prepareAll();
            return preparation;
        }
        async function prepareAll(): Promise<PreparedLlamafileArtifacts> {
            let release: (() => Promise<void>) | null = null;
            try {
                status.phase = 'waiting';
                status.message = 'Waiting for shared runtime and model preparation.';
                release = await acquireArtifactLock(node.net, ARTIFACT_LOCK_PORT, lifetime.signal);
                assertOpen();
                await node.fs.promises.mkdir(dataPath, { recursive: true, mode: 0o700 });
                for (const artifact of artifacts) {
                    assertOpen();
                    artifactPaths.set(artifact.id, await prepareArtifact(artifact));
                }
                const executablePath = artifactPaths.get('runtime');
                const targetPath = artifactPaths.get('target');
                const draftPath = artifactPaths.get('draft');
                if (!executablePath || !targetPath || !draftPath) {
                    throw createError('Managed llamafile catalog must contain the runtime, target and draft artifacts.', 'LLAMAFILE_CATALOG_INVALID');
                }
                assertOpen();
                if (node.os.platform() !== 'win32')
                    await node.fs.promises.chmod(executablePath, 0o700);
                assertOpen();
                status.phase = 'ready';
                status.artifactId = '';
                status.completedBytes = status.totalBytes;
                status.message = 'Local runtime and models are ready.';
                return Object.freeze({ executablePath, targetPath, draftPath });
            }
            catch (error) {
                if (!closed) {
                    status.phase = 'error';
                    status.code = readErrorCode(error) || 'LLAMAFILE_ARTIFACT_ERROR';
                    status.message = error instanceof Error ? error.message : 'Local artifact preparation failed.';
                }
                throw error;
            }
            finally {
                await Promise.all(fileClosures);
                await release?.();
            }
        }
        async function prepareArtifact(artifact: LlamafileArtifact): Promise<string> {
            const finalPath = node.path.join(dataPath, artifact.fileName);
            const partialPath = `${finalPath}.partial`;
            setArtifactStatus('checking', artifact, 0);
            if ((await fileSize(finalPath)) === artifact.size)
                return finalPath;
            assertOpen();
            await removeIfPresent(finalPath);
            let partialSize = await fileSize(partialPath);
            assertOpen();
            if (partialSize > artifact.size) {
                await removeIfPresent(partialPath);
                partialSize = 0;
            }
            if (partialSize < artifact.size)
                await download(artifact, partialPath, partialSize, 0);
            if (!(await verifyFile(partialPath, artifact))) {
                await removeIfPresent(partialPath);
                throw createError(`Downloaded ${artifact.id} artifact failed SHA-256 verification.`, 'LLAMAFILE_HASH_MISMATCH');
            }
            assertOpen();
            await node.fs.promises.rename(partialPath, finalPath);
            return finalPath;
        }
        function verifyFile(filePath: string, artifact: LlamafileArtifact): Promise<boolean> {
            assertOpen();
            setArtifactStatus('verifying', artifact, 0);
            return new Promise((resolve, reject) => {
                const hash = node.crypto.createHash('sha256');
                const stream = node.fs.createReadStream(filePath);
                retainFileClosure(stream);
                let bytes = 0;
                activeCancel = () => {
                    stream.destroy(createClosedError());
                };
                stream.on('data', (chunk: string | Buffer) => {
                    hash.update(chunk);
                    bytes += typeof chunk === 'string' ? new TextEncoder().encode(chunk).byteLength : chunk.length;
                    status.completedBytes = bytes;
                });
                stream.on('error', reject);
                stream.on('end', () => {
                    activeCancel = null;
                    resolve(bytes === artifact.size && hash.digest('hex') === artifact.sha256);
                });
            });
        }
        function download(artifact: LlamafileArtifact, partialPath: string, offset: number, redirects: number): Promise<void> {
            assertOpen();
            if (redirects > 5) {
                return Promise.reject(createError('Too many redirects while downloading a local model.', 'LLAMAFILE_DOWNLOAD_REDIRECT'));
            }
            setArtifactStatus('downloading', artifact, offset);
            const get = new URL(artifact.url).protocol === 'https:' ? node.https.get : node.http.get;
            const requestOptions = offset > 0 ? { headers: { Range: `bytes=${String(offset)}-` } } : {};
            return new Promise((resolve, reject) => {
                let request: Http.ClientRequest | null = null;
                let responseStream: Http.IncomingMessage | null = null;
                let writer: Fs.WriteStream | null = null;
                let settled = false;
                const stopRequestTimeout = (): void => {
                    try {
                        request?.setTimeout(0);
                    }
                    catch {
                    }
                };
                const fail = (error: Error): void => {
                    if (settled)
                        return;
                    settled = true;
                    activeCancel = null;
                    stopRequestTimeout();
                    request?.destroy();
                    responseStream?.destroy();
                    writer?.destroy();
                    reject(error);
                };
                const finish = (): void => {
                    if (settled)
                        return;
                    settled = true;
                    activeCancel = null;
                    stopRequestTimeout();
                    resolve();
                };
                request = get(artifact.url, requestOptions, (response) => {
                    responseStream = response;
                    if (settled || closed) {
                        response.destroy();
                        return;
                    }
                    const statusCode = response.statusCode ?? 0;
                    const location = response.headers.location;
                    if (statusCode >= 300 && statusCode < 400 && location) {
                        settled = true;
                        stopRequestTimeout();
                        response.destroy();
                        activeCancel = null;
                        void download({ ...artifact, url: new URL(location, artifact.url).href }, partialPath, offset, redirects + 1).then(resolve, reject);
                        return;
                    }
                    if (statusCode !== 200 && statusCode !== 206) {
                        fail(createError(`Artifact download returned HTTP ${String(statusCode)}.`, 'LLAMAFILE_DOWNLOAD_HTTP'));
                        return;
                    }
                    const resumed = statusCode === 206 && offset > 0;
                    let completed = resumed ? offset : 0;
                    writer = node.fs.createWriteStream(partialPath, { flags: resumed ? 'a' : 'w' });
                    retainFileClosure(writer);
                    activeCancel = () => {
                        fail(createClosedError());
                    };
                    response.on('data', (chunk: Buffer) => {
                        completed += chunk.length;
                        status.completedBytes = completed;
                    });
                    response.on('error', fail);
                    writer.on('error', fail);
                    writer.on('finish', finish);
                    response.pipe(writer);
                });
                activeCancel = () => {
                    fail(createClosedError());
                };
                request.on('error', fail);
                request.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => {
                    fail(createError('Artifact download stalled for 60 seconds.', 'LLAMAFILE_DOWNLOAD_TIMEOUT'));
                });
            });
        }
        function retainFileClosure(stream: {
            once(event: 'close', listener: () => void): unknown;
        }): void {
            const closed = new Promise<void>((resolve) => stream.once('close', resolve));
            fileClosures.add(closed);
            void closed.then(() => {
                fileClosures.delete(closed);
            });
        }
        async function fileSize(filePath: string): Promise<number> {
            try {
                return (await node.fs.promises.stat(filePath)).size;
            }
            catch (error) {
                if (readErrorCode(error) === 'ENOENT')
                    return -1;
                throw error;
            }
        }
        async function removeIfPresent(filePath: string): Promise<void> {
            try {
                await node.fs.promises.unlink(filePath);
            }
            catch (error) {
                if (readErrorCode(error) !== 'ENOENT')
                    throw error;
            }
        }
        function setArtifactStatus(phase: LlamafileArtifactPhase, artifact: LlamafileArtifact, bytes: number): void {
            status.phase = phase;
            status.artifactId = artifact.id;
            status.completedBytes = bytes;
            status.totalBytes = artifact.size;
            status.code = '';
            status.message = `${phase === 'downloading' ? 'Downloading' : phase === 'verifying' ? 'Verifying' : 'Checking'} ${artifact.id} artifact.`;
        }
        function assertOpen(): void {
            if (closed)
                throw createClosedError();
        }
        return { prepare, getStatus, close };
    }
    function resolveNodeRuntime(explicitRequire: unknown): NodeRuntime {
        const scopeRequire = (runtimeScope as RuntimeScopeCandidate).require;
        const requireValue = typeof explicitRequire === 'function' ? explicitRequire : scopeRequire;
        if (typeof requireValue !== 'function') {
            throw createError('Managed llamafile requires NW.js Node APIs.', 'LLAMAFILE_NODE_API_UNAVAILABLE');
        }
        const load = requireValue as RequireFunction;
        return {
            crypto: load('crypto') as typeof Crypto,
            fs: load('fs') as typeof Fs,
            http: load('http') as typeof Http,
            https: load('https') as typeof Https,
            path: load('path') as typeof Path,
            net: load('net') as typeof Net,
            os: load('os') as typeof Os,
        };
    }
    function normalizeArtifacts(value: unknown): readonly LlamafileArtifact[] {
        const artifacts = value;
        if (!Array.isArray(artifacts) || artifacts.length !== 3) {
            throw createError('Managed llamafile requires one runtime and two model artifacts.', 'LLAMAFILE_CATALOG_INVALID');
        }
        const ids = new Set<unknown>();
        const names = new Set<unknown>();
        return artifacts.map((artifact) => {
            const candidate = artifact as ArtifactCandidate;
            if ((candidate.id !== 'runtime' && candidate.id !== 'target' && candidate.id !== 'draft') ||
                ids.has(candidate.id) ||
                names.has(candidate.fileName) ||
                typeof candidate.fileName !== 'string' ||
                !candidate.fileName ||
                candidate.fileName === '.' ||
                candidate.fileName === '..' ||
                candidate.fileName.includes('/') ||
                candidate.fileName.includes('\\') ||
                typeof candidate.url !== 'string' ||
                !/^https?:\/\//u.test(candidate.url) ||
                typeof candidate.size !== 'number' ||
                !Number.isSafeInteger(candidate.size) ||
                candidate.size <= 0 ||
                typeof candidate.sha256 !== 'string' ||
                !/^[a-f0-9]{64}$/u.test(candidate.sha256)) {
                throw createError('Managed llamafile catalog contains an invalid artifact.', 'LLAMAFILE_CATALOG_INVALID');
            }
            ids.add(candidate.id);
            names.add(candidate.fileName);
            return Object.freeze({
                id: candidate.id,
                fileName: candidate.fileName,
                url: candidate.url,
                size: candidate.size,
                sha256: candidate.sha256,
            });
        });
    }
    return { createLlamafileArtifactManager };
}
function requiredString(value: unknown, name: string): string {
    if (typeof value === 'string' && value.trim())
        return value;
    throw createError(`Managed llamafile requires nonempty ${name}.`, 'LLAMAFILE_INVALID_CONFIG');
}
function readErrorCode(error: unknown): string {
    const code = (error as ErrorCodeCandidate | null)?.code;
    return typeof code === 'string' ? code : '';
}
function createClosedError(): Error {
    return createError('Local artifact preparation was stopped.', 'LLAMAFILE_ARTIFACTS_CLOSED');
}
function createError(message: string, code: string): Error {
    const error = new Error(message) as Error & {
        code: string;
    };
    error.code = code;
    return error;
}
