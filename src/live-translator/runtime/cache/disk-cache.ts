import { captureLogRedactor } from '../log-redaction-port.js';
declare const Buffer: unknown;
declare const process: unknown;
declare const require: unknown;
type RuntimeRequire = (id: string) => unknown;
const BYTES_PER_MEGABYTE = 1024 * 1024;
interface RuntimeScopeCandidate {
    readonly LiveTranslatorPaths?: unknown;
}
interface LoggerCandidate {
    readonly error?: unknown;
    readonly info?: unknown;
    readonly warn?: unknown;
}
interface BoundLogger {
    readonly error: (...args: unknown[]) => unknown;
    readonly info: ((...args: unknown[]) => unknown) | null;
    readonly warn: (...args: unknown[]) => unknown;
}
interface ProcessCandidate {
    readonly cwd?: unknown;
}
interface ProcessWithCwd {
    cwd(): unknown;
}
interface PathModuleCandidate {
    dirname(file: unknown): unknown;
    join(...parts: unknown[]): unknown;
}
interface PathContextCandidate {
    readonly supportPath?: unknown;
    readonly translationCacheFile?: unknown;
}
interface SettingsCandidate {
    readonly clearOnLaunch?: unknown;
    readonly diskCache?: unknown;
    readonly enabled?: unknown;
    readonly maxMegabytes?: unknown;
}
interface DiskCacheOptionsCandidate {
    readonly defaultCacheMegabytes?: unknown;
    readonly logger?: unknown;
    readonly paths?: unknown;
    readonly performance?: unknown;
    readonly settings?: unknown;
}
interface PerformanceCandidate {
    readonly count?: unknown;
    readonly observeState?: unknown;
}
interface BufferCandidate {
    readonly byteLength?: unknown;
}
interface EncodedBytesCandidate {
    readonly length?: unknown;
}
interface FileSystemCandidate {
    readonly promises?: unknown;
}
interface FileSystemPromisesCandidate {
    readonly appendFile?: unknown;
    readonly mkdir?: unknown;
    readonly readFile?: unknown;
    readonly rename?: unknown;
    readonly rm?: unknown;
    readonly unlink?: unknown;
    readonly writeFile?: unknown;
}
type FileSystemOperation = (...args: unknown[]) => unknown;
type PerformanceCounter = (name: string, amount: number) => void;
type PerformanceStateObserver = (logicalBytes: number, fileBytes: number) => void;
interface BoundPerformance {
    readonly count: PerformanceCounter | null;
    readonly observeState: PerformanceStateObserver | null;
}
interface BoundFileSystem {
    readonly appendFile: FileSystemOperation;
    readonly mkdir: FileSystemOperation;
    readonly readFile: FileSystemOperation;
    readonly rename: FileSystemOperation;
    readonly rm: FileSystemOperation | null;
    readonly unlink: FileSystemOperation | null;
    readonly writeFile: FileSystemOperation;
}
interface ErrorCodeCandidate {
    readonly code?: unknown;
}
interface ParsedRecordCandidate {
    readonly in?: unknown;
    readonly out?: unknown;
}
interface CacheTarget {
    readonly dir: unknown;
    readonly file: unknown;
}
interface StoredRecord {
    readonly serialized: string;
    readonly size: number;
}
interface DurableCacheState {
    records: StoredRecord[];
    firstRetained: number;
    fileBytes: number;
    logicalBytes: number;
}
interface PreparedCheckpoint {
    readonly payload: string;
    readonly state: DurableCacheState;
}
export interface DiskCacheRecord {
    in: string;
    out: string;
}
export interface DiskCacheService {
    readonly enabled: boolean;
    appendRecord(input: unknown, output: unknown): Promise<void>;
    loadAll(): Promise<DiskCacheRecord[]>;
    flush(): Promise<void>;
    ensureLaunchPrune(): Promise<void>;
    getMaxMegabytes(): number;
}
export interface DiskCacheModule {
    createDiskCache(options?: unknown): DiskCacheService;
}
export function createDiskCacheModule(runtimeScope: unknown): DiskCacheModule {
    const arrayJoin = Array.prototype.join;
    const arrayPush = Array.prototype.push;
    const IntrinsicError = Error;
    const IntrinsicRangeError = RangeError;
    const IntrinsicTypeError = TypeError;
    const jsonParse = JSON.parse;
    const jsonStringify = JSON.stringify;
    const mathFloor = Math.floor;
    const mathMax = Math.max;
    const numberIsFinite = Number.isFinite;
    const numberIsSafeInteger = Number.isSafeInteger;
    const numberMaximumSafeInteger = Number.MAX_SAFE_INTEGER;
    const numberValue = Number;
    const objectDefineProperty = Object.defineProperty;
    const IntrinsicPromise = Promise;
    const promiseResolve = Promise.resolve;
    const promiseThen = Promise.prototype.then;
    const reflectApply = Reflect.apply;
    const stringCharCodeAt = String.prototype.charCodeAt;
    const stringLastIndexOf = String.prototype.lastIndexOf;
    const stringSlice = String.prototype.slice;
    const stringSplit = String.prototype.split;
    const stringValue = String;
    let capturedBufferByteLength: ((value: string) => unknown) | null = null;
    try {
        if (typeof Buffer !== 'undefined') {
            const buffer = Buffer;
            const measure = (buffer as BufferCandidate).byteLength;
            if (typeof measure === 'function') {
                capturedBufferByteLength = (value: string): unknown => reflectApply(measure, buffer, [value, 'utf8']);
            }
        }
    }
    catch {
    }
    let capturedTextEncode: ((value: string) => unknown) | null = null;
    try {
        if (typeof TextEncoder !== 'undefined') {
            const encoder = new TextEncoder();
            const encode = encoder.encode;
            if (typeof encode === 'function') {
                capturedTextEncode = (value: string): unknown => reflectApply(encode, encoder, [value]);
            }
        }
    }
    catch {
    }
    const scope = runtimeScope;
    const redactor = captureLogRedactor(scope);
    let nextCacheInstanceId = 0;
    function bindLoggerMethod(logger: unknown, key: keyof LoggerCandidate): BoundLogger['error'] | null {
        if (!logger)
            return null;
        try {
            const method = (logger as LoggerCandidate)[key];
            if (typeof method !== 'function')
                return null;
            return (...args: unknown[]): unknown => reflectApply(method, logger, args);
        }
        catch {
            return null;
        }
    }
    function createContainedConsoleMethod(key: 'error' | 'warn'): BoundLogger['error'] {
        const emit = (...args: unknown[]): void => {
            try {
                const method = console[key];
                if (typeof method === 'function')
                    reflectApply(method, console, args);
            }
            catch {
            }
        };
        if (redactor === undefined)
            return emit;
        return (...args: unknown[]): void => {
            try {
                emit(...(redactor.value(args) as unknown[]));
            }
            catch {
            }
        };
    }
    function ensureLogger(logger: unknown): BoundLogger {
        const error = bindLoggerMethod(logger, 'error') ?? createContainedConsoleMethod('error');
        const warn = bindLoggerMethod(logger, 'warn') ?? createContainedConsoleMethod('warn');
        const info = bindLoggerMethod(logger, 'info');
        return { error, warn, info };
    }
    function reportCacheLog(method: BoundLogger['error'], ...args: unknown[]): void {
        try {
            reflectApply(method, undefined, args);
        }
        catch {
        }
    }
    function getPathContext(explicitPaths: unknown): unknown {
        if (explicitPaths && typeof explicitPaths === 'object')
            return explicitPaths;
        const initialPaths = (scope as RuntimeScopeCandidate).LiveTranslatorPaths;
        if (!initialPaths)
            return {};
        if (typeof (scope as RuntimeScopeCandidate).LiveTranslatorPaths === 'object') {
            return (scope as RuntimeScopeCandidate).LiveTranslatorPaths;
        }
        return {};
    }
    function resolveFallbackCacheFile(pathModule: unknown): unknown {
        try {
            if (typeof process !== 'undefined' && typeof (process as ProcessCandidate).cwd === 'function') {
                const cwd = (process as ProcessWithCwd).cwd();
                if (cwd && typeof cwd === 'string') {
                    return (pathModule as PathModuleCandidate).join(cwd, 'translation-cache.log');
                }
            }
        }
        catch {
        }
        return '';
    }
    function resolveCacheTarget(pathModule: unknown, explicitPaths: unknown): CacheTarget | null {
        const paths = getPathContext(explicitPaths);
        let file: unknown = typeof (paths as PathContextCandidate).translationCacheFile === 'string'
            ? (paths as PathContextCandidate).translationCacheFile
            : '';
        if (!file && typeof (paths as PathContextCandidate).supportPath === 'string') {
            const supportPath = (paths as PathContextCandidate).supportPath;
            if (supportPath) {
                file = (pathModule as PathModuleCandidate).join((paths as PathContextCandidate).supportPath, 'translation-cache.log');
            }
        }
        const needsFallback = !file;
        if (needsFallback)
            file = resolveFallbackCacheFile(pathModule);
        if (!file)
            return null;
        return {
            file,
            dir: (pathModule as PathModuleCandidate).dirname(file),
        };
    }
    function normalizeSettings(settings: unknown): unknown {
        if (!settings || typeof settings !== 'object')
            return {};
        const initialDiskCache = (settings as SettingsCandidate).diskCache;
        if (initialDiskCache && typeof (settings as SettingsCandidate).diskCache === 'object') {
            return (settings as SettingsCandidate).diskCache;
        }
        return settings;
    }
    function byteLength(str: unknown): number {
        const value = stringValue(str ?? '');
        if (value.length === 0)
            return 0;
        try {
            if (capturedBufferByteLength) {
                const count = capturedBufferByteLength(value);
                if (typeof count === 'number' && numberIsSafeInteger(count) && count > 0)
                    return count;
            }
        }
        catch {
        }
        try {
            if (capturedTextEncode) {
                const encoded = capturedTextEncode(value);
                const count = (encoded as EncodedBytesCandidate).length;
                if (typeof count === 'number' && numberIsSafeInteger(count) && count > 0)
                    return count;
            }
        }
        catch {
        }
        throw new IntrinsicError('Disk-cache UTF-8 byte sizing is unavailable.');
    }
    function parseRecord(line: unknown): unknown {
        if (!line)
            return null;
        try {
            const obj: unknown = jsonParse(line as string);
            if (obj &&
                typeof (obj as ParsedRecordCandidate).in === 'string' &&
                typeof (obj as ParsedRecordCandidate).out === 'string') {
                return obj;
            }
        }
        catch {
        }
        return null;
    }
    function bindFileSystemOperation(owner: unknown, key: keyof FileSystemPromisesCandidate): FileSystemOperation | null {
        if ((!owner || typeof owner !== 'object') && typeof owner !== 'function')
            return null;
        try {
            const operation = (owner as FileSystemPromisesCandidate)[key];
            if (typeof operation !== 'function')
                return null;
            return (...args: unknown[]): unknown => reflectApply(operation, owner, args);
        }
        catch {
            return null;
        }
    }
    function captureFileSystem(fileSystem: unknown): BoundFileSystem | null {
        try {
            const owner = (fileSystem as FileSystemCandidate).promises;
            const appendFile = bindFileSystemOperation(owner, 'appendFile');
            const mkdir = bindFileSystemOperation(owner, 'mkdir');
            const readFile = bindFileSystemOperation(owner, 'readFile');
            const rename = bindFileSystemOperation(owner, 'rename');
            const rm = bindFileSystemOperation(owner, 'rm');
            const unlink = bindFileSystemOperation(owner, 'unlink');
            const writeFile = bindFileSystemOperation(owner, 'writeFile');
            if (!appendFile || !mkdir || !readFile || !rename || !writeFile || (!rm && !unlink))
                return null;
            return { appendFile, mkdir, readFile, rename, rm, unlink, writeFile };
        }
        catch {
            return null;
        }
    }
    function capturePerformance(performance: unknown): BoundPerformance {
        if ((!performance || typeof performance !== 'object') && typeof performance !== 'function') {
            return { count: null, observeState: null };
        }
        const bind = (key: keyof PerformanceCandidate): FileSystemOperation | null => {
            try {
                const operation = (performance as PerformanceCandidate)[key];
                if (typeof operation !== 'function')
                    return null;
                return (...args: unknown[]): unknown => reflectApply(operation, performance, args);
            }
            catch {
                return null;
            }
        };
        const countOperation = bind('count');
        const observeStateOperation = bind('observeState');
        return {
            count: countOperation === null
                ? null
                : (name: string, amount: number): void => {
                    try {
                        countOperation(name, amount);
                    }
                    catch {
                    }
                },
            observeState: observeStateOperation === null
                ? null
                : (logicalBytes: number, fileBytes: number): void => {
                    try {
                        observeStateOperation(logicalBytes, fileBytes);
                    }
                    catch {
                    }
                },
        };
    }
    function isMissingFileError(error: unknown): boolean {
        if (!error)
            return false;
        try {
            return (error as ErrorCodeCandidate).code === 'ENOENT';
        }
        catch {
            return false;
        }
    }
    function isUsableFiniteMegabytes(value: unknown): value is number {
        if (typeof value !== 'number' || !numberIsFinite(value) || value <= 0)
            return false;
        const bytes = value * BYTES_PER_MEGABYTE;
        if (!numberIsFinite(bytes))
            return false;
        const normalizedBytes = mathFloor(bytes);
        return (numberIsSafeInteger(normalizedBytes) &&
            normalizedBytes > 0 &&
            normalizedBytes <= mathFloor(numberMaximumSafeInteger / 2));
    }
    function createDiskCache(options: unknown = {}): DiskCacheService {
        const { logger, settings = {}, defaultCacheMegabytes = 32, paths = null, performance = null, } = options as DiskCacheOptionsCandidate;
        const log = ensureLogger(logger);
        const capturedPerformance = capturePerformance(performance);
        let fs: unknown = null;
        let path: unknown = null;
        try {
            if (typeof require === 'function') {
                fs = (require as RuntimeRequire)('fs');
                path = (require as RuntimeRequire)('path');
            }
        }
        catch {
        }
        const fileSystem = fs ? captureFileSystem(fs) : null;
        const cacheSettings = normalizeSettings(settings);
        const normalizedSettings = {
            enabled: (cacheSettings as SettingsCandidate).enabled !== false,
            maxMegabytes: (() => {
                const configuredValue = (cacheSettings as SettingsCandidate).maxMegabytes;
                if (configuredValue === Infinity)
                    return Infinity;
                const configured = numberValue(configuredValue);
                if (isUsableFiniteMegabytes(configured))
                    return configured;
                if (isUsableFiniteMegabytes(defaultCacheMegabytes))
                    return defaultCacheMegabytes;
                return 32;
            })(),
            clearOnLaunch: !!(cacheSettings as SettingsCandidate).clearOnLaunch,
        };
        const cacheTarget = fileSystem && path ? resolveCacheTarget(path, paths) : null;
        const dir = cacheTarget === null ? null : cacheTarget.dir;
        const file = cacheTarget === null ? null : cacheTarget.file;
        const disabledReason = (() => {
            if (!fileSystem || !path)
                return 'fs/path modules unavailable';
            if (!dir || typeof dir !== 'string' || !file || typeof file !== 'string') {
                return 'cache directory could not be resolved';
            }
            if (!normalizedSettings.enabled)
                return 'disabled via settings';
            return null;
        })();
        if (disabledReason) {
            reportCacheLog(log.info ?? log.error, '[DiskCache] Disabled:', disabledReason);
        }
        const enabled = !disabledReason;
        const maxMegabytes = normalizedSettings.maxMegabytes;
        const maxBytes = maxMegabytes === Infinity ? Infinity : mathFloor(maxMegabytes * BYTES_PER_MEGABYTE);
        const physicalByteLimit = maxBytes === Infinity ? Infinity : maxBytes * 2;
        nextCacheInstanceId += 1;
        const temporaryFile = enabled ? `${file as string}.tmp-${stringValue(nextCacheInstanceId)}` : '';
        let durableState: DurableCacheState = {
            records: [],
            firstRetained: 0,
            fileBytes: 0,
            logicalBytes: 0,
        };
        let hydrated = false;
        let launchPrepared = false;
        let directoryReady = false;
        const initialOperationTail = reflectApply(promiseResolve, IntrinsicPromise, []) as Promise<void>;
        let operationTail = initialOperationTail;
        const getFileSystem = (): BoundFileSystem => {
            if (!fileSystem)
                throw new IntrinsicError('Disk-cache filesystem is unavailable.');
            return fileSystem;
        };
        const makeRecord = (input: unknown, output: unknown): StoredRecord => {
            const payload = jsonStringify({
                in: stringValue(input),
                out: stringValue(output),
            }) + '\n';
            return { serialized: payload, size: byteLength(payload) };
        };
        const count = (name: string, amount = 1): void => {
            if (capturedPerformance.count)
                capturedPerformance.count(name, amount);
        };
        const observeState = (): void => {
            if (capturedPerformance.observeState) {
                capturedPerformance.observeState(durableState.logicalBytes, durableState.fileBytes);
            }
        };
        const addBytes = (left: number, right: number): number => {
            if (!numberIsSafeInteger(left) ||
                !numberIsSafeInteger(right) ||
                left < 0 ||
                right < 0 ||
                right > numberMaximumSafeInteger - left) {
                throw new IntrinsicRangeError('Disk-cache byte accounting exceeded the exact integer range.');
            }
            return left + right;
        };
        const ensureDir = async (): Promise<void> => {
            if (!enabled || directoryReady)
                return;
            await getFileSystem().mkdir(dir, { recursive: true });
            directoryReady = true;
        };
        const removeFile = async (target: unknown): Promise<void> => {
            const operations = getFileSystem();
            let removalError: unknown = null;
            let removalFailed = false;
            if (operations.rm) {
                try {
                    await operations.rm(target, { force: true });
                    return;
                }
                catch (err) {
                    if (isMissingFileError(err))
                        return;
                    removalError = err;
                    removalFailed = true;
                }
            }
            if (operations.unlink) {
                try {
                    await operations.unlink(target);
                    return;
                }
                catch (err) {
                    if (isMissingFileError(err))
                        return;
                    removalError = err;
                    removalFailed = true;
                }
            }
            if (removalFailed)
                throw removalError;
            throw new IntrinsicError('No cache-file removal capability is available.');
        };
        const removeTemporaryFile = async (): Promise<void> => {
            try {
                await removeFile(temporaryFile);
            }
            catch {
            }
        };
        const prepareCheckpoint = (records: StoredRecord[], firstRetained: number, appendedRecord: StoredRecord | null = null): PreparedCheckpoint => {
            const compactRecords: StoredRecord[] = [];
            const serializedRecords: string[] = [];
            let logicalBytes = 0;
            for (let index = firstRetained; index < records.length; index += 1) {
                const record = records[index];
                if (!record)
                    throw new IntrinsicTypeError('Disk-cache checkpoint contains a sparse record slot.');
                reflectApply(arrayPush, compactRecords, [record]);
                reflectApply(arrayPush, serializedRecords, [record.serialized]);
                logicalBytes = addBytes(logicalBytes, record.size);
                count('diskCache.checkpoint.recordsCopied');
            }
            if (appendedRecord) {
                reflectApply(arrayPush, compactRecords, [appendedRecord]);
                reflectApply(arrayPush, serializedRecords, [appendedRecord.serialized]);
                logicalBytes = addBytes(logicalBytes, appendedRecord.size);
                count('diskCache.checkpoint.recordsCopied');
            }
            const payload = reflectApply(arrayJoin, serializedRecords, ['']);
            return {
                payload,
                state: {
                    records: compactRecords,
                    firstRetained: 0,
                    fileBytes: logicalBytes,
                    logicalBytes,
                },
            };
        };
        const commitCheckpoint = async (checkpoint: PreparedCheckpoint): Promise<DurableCacheState> => {
            await ensureDir();
            try {
                await getFileSystem().writeFile(temporaryFile, checkpoint.payload, 'utf8');
                await getFileSystem().rename(temporaryFile, file);
                return checkpoint.state;
            }
            catch (err) {
                hydrated = false;
                directoryReady = false;
                await removeTemporaryFile();
                throw err;
            }
        };
        const wouldExceed = (limit: number, current: number, additional: number): boolean => {
            if (limit === Infinity)
                return false;
            return current > limit || additional > limit - current;
        };
        const selectRetainedSuccessor = (record: StoredRecord): {
            firstRetained: number;
            logicalBytes: number;
        } => {
            let firstRetained = durableState.firstRetained;
            let logicalBytes = addBytes(durableState.logicalBytes, record.size);
            while (logicalBytes > maxBytes && firstRetained < durableState.records.length) {
                const dropped = durableState.records[firstRetained];
                if (!dropped)
                    break;
                logicalBytes = mathMax(0, logicalBytes - dropped.size);
                firstRetained += 1;
                count('diskCache.retention.recordsEvicted');
            }
            return { firstRetained, logicalBytes };
        };
        const readFromDisk = async (): Promise<DurableCacheState> => {
            let data: unknown;
            try {
                data = await getFileSystem().readFile(file, 'utf8');
            }
            catch (err) {
                if (!isMissingFileError(err))
                    throw err;
                return { records: [], firstRetained: 0, fileBytes: 0, logicalBytes: 0 };
            }
            if (typeof data !== 'string')
                throw new IntrinsicTypeError('Disk-cache readFile must return UTF-8 text.');
            const rawPayloadBytes = byteLength(data);
            const finalNewline = reflectApply(stringLastIndexOf, data, ['\n']);
            const hasIncompleteFinalFrame = data.length > 0 && finalNewline !== data.length - 1;
            const completePayload = finalNewline < 0 ? '' : reflectApply(stringSlice, data, [0, finalNewline + 1]);
            const lines = reflectApply(stringSplit, completePayload, ['\n']) as string[];
            const records: StoredRecord[] = [];
            let canonicalBytes = 0;
            let corruptFrame = false;
            for (let index = 0; index + 1 < lines.length; index += 1) {
                count('diskCache.hydration.framesVisited');
                const framedLine = lines[index] ?? '';
                const line = framedLine.length > 0 &&
                    reflectApply(stringCharCodeAt, framedLine, [framedLine.length - 1]) === 0x0d
                    ? reflectApply(stringSlice, framedLine, [0, -1])
                    : framedLine;
                const parsed = parseRecord(line);
                if (!parsed) {
                    corruptFrame = true;
                    continue;
                }
                const rec = makeRecord((parsed as ParsedRecordCandidate).in, (parsed as ParsedRecordCandidate).out);
                if (`${line}\n` !== rec.serialized)
                    corruptFrame = true;
                reflectApply(arrayPush, records, [rec]);
                canonicalBytes = addBytes(canonicalBytes, rec.size);
            }
            let firstRetained = 0;
            let logicalBytes = canonicalBytes;
            while (logicalBytes > maxBytes && firstRetained < records.length) {
                const dropped = records[firstRetained];
                if (!dropped)
                    break;
                logicalBytes = mathMax(0, logicalBytes - dropped.size);
                firstRetained += 1;
            }
            const parsedState: DurableCacheState = {
                records,
                firstRetained,
                fileBytes: rawPayloadBytes,
                logicalBytes,
            };
            const physicalLimitExceeded = physicalByteLimit !== Infinity && rawPayloadBytes > physicalByteLimit;
            if (hasIncompleteFinalFrame || corruptFrame || physicalLimitExceeded) {
                return commitCheckpoint(prepareCheckpoint(records, firstRetained));
            }
            return parsedState;
        };
        const ensureHydrated = async (): Promise<void> => {
            if (!enabled || hydrated)
                return;
            const candidate = await readFromDisk();
            durableState = candidate;
            hydrated = true;
            observeState();
        };
        const clearLog = async (): Promise<void> => {
            if (!enabled)
                return;
            hydrated = false;
            await removeFile(file);
            durableState = { records: [], firstRetained: 0, fileBytes: 0, logicalBytes: 0 };
            hydrated = true;
            observeState();
        };
        const shouldClearOnLaunch = normalizedSettings.clearOnLaunch;
        function enqueue<Result>(work: () => Promise<Result>): Promise<Result> {
            const result = reflectApply(promiseThen, operationTail, [work]);
            operationTail = reflectApply(promiseThen, result, [
                () => undefined,
                (err: unknown) => {
                    reportCacheLog(log.error, '[DiskCache Error]', err);
                },
            ]);
            return result;
        }
        const prepareWithinOperation = async (): Promise<void> => {
            if (launchPrepared)
                return;
            if (shouldClearOnLaunch) {
                await clearLog();
            }
            else {
                await ensureHydrated();
            }
            launchPrepared = true;
        };
        const prepareOnLaunch = async (): Promise<void> => {
            if (!enabled)
                return;
            return enqueue(async () => {
                await prepareWithinOperation();
            });
        };
        const appendRecord = async (input: unknown, output: unknown): Promise<void> => {
            if (!enabled)
                return;
            return enqueue(async () => {
                const record = makeRecord(input, output);
                if (maxBytes !== Infinity && record.size > maxBytes)
                    return;
                await prepareWithinOperation();
                await ensureHydrated();
                const successor = selectRetainedSuccessor(record);
                if (wouldExceed(physicalByteLimit, durableState.fileBytes, record.size)) {
                    durableState = await commitCheckpoint(prepareCheckpoint(durableState.records, successor.firstRetained, record));
                    observeState();
                    return;
                }
                await ensureDir();
                try {
                    await getFileSystem().appendFile(file, record.serialized, 'utf8');
                }
                catch (err) {
                    hydrated = false;
                    directoryReady = false;
                    throw err;
                }
                reflectApply(arrayPush, durableState.records, [record]);
                durableState.firstRetained = successor.firstRetained;
                durableState.logicalBytes = successor.logicalBytes;
                durableState.fileBytes = addBytes(durableState.fileBytes, record.size);
                count('diskCache.append.framesWritten');
                observeState();
            });
        };
        const loadAll = async (): Promise<DiskCacheRecord[]> => {
            if (!enabled)
                return [];
            return enqueue(async () => {
                await prepareWithinOperation();
                await ensureHydrated();
                const result: DiskCacheRecord[] = [];
                for (let index = durableState.firstRetained; index < durableState.records.length; index += 1) {
                    const record = durableState.records[index];
                    if (!record)
                        continue;
                    try {
                        const parsed = jsonParse(record.serialized) as DiskCacheRecord;
                        reflectApply(arrayPush, result, [parsed]);
                    }
                    catch {
                    }
                }
                return result;
            });
        };
        const flush = async (): Promise<void> => {
            if (!enabled)
                return;
            const barrier = operationTail;
            await barrier;
        };
        const service: DiskCacheService = {
            enabled,
            appendRecord,
            loadAll,
            flush,
            ensureLaunchPrune: prepareOnLaunch,
            getMaxMegabytes: () => maxMegabytes,
        };
        objectDefineProperty(service, 'enabled', {
            value: enabled,
            writable: false,
            enumerable: true,
            configurable: false,
        });
        return service;
    }
    return {
        createDiskCache,
    };
}
