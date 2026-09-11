const TRANSLATION_CACHE_FILE = 'translation-cache.log';
const PERF_DIRECTORY = 'perf';
const LLAMAFILE_DATA_DIRECTORIES = ['.rmlt', 'llamafile'] as const;
type UnknownRecord = Record<PropertyKey, unknown>;
interface PathModule {
    readonly sep: string;
    normalize(value: string): string;
    resolve(base: string, value: string): string;
    join(base: string, value: string): string;
}
interface NodeApi {
    path: PathModule;
}
export interface RuntimePaths {
    loaderUrl: string;
    supportUrl: string;
    supportPath: string;
    perfDirectory: string;
    gameRoot: string;
    llamafileDataPath: string;
    translationCacheFile: string;
}
function isUnknownRecord(value: unknown): value is UnknownRecord {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isUnknownRecord(value) ? value[key] : undefined;
}
function stringValue(value: unknown): string {
    try {
        const converted: unknown = Reflect.apply(String, undefined, [value]);
        return typeof converted === 'string' ? converted : '';
    }
    catch {
        return '';
    }
}
function truthyOr(value: unknown, fallback: unknown): unknown {
    if (value)
        return value;
    return fallback;
}
function callPathMethod(receiver: UnknownRecord, method: unknown, args: string[]): string {
    if (typeof method !== 'function')
        return '';
    const result: unknown = Reflect.apply(method, receiver, args);
    return typeof result === 'string' ? result : '';
}
function normalizePathModule(value: unknown): PathModule | null {
    if (!isUnknownRecord(value))
        return null;
    const sep = value['sep'];
    const normalize = value['normalize'];
    const resolve = value['resolve'];
    const join = value['join'];
    if (typeof sep !== 'string' ||
        typeof normalize !== 'function' ||
        typeof resolve !== 'function' ||
        typeof join !== 'function') {
        return null;
    }
    return {
        sep,
        normalize: (path) => callPathMethod(value, normalize, [path]),
        resolve: (base, path) => callPathMethod(value, resolve, [base, path]),
        join: (base, path) => callPathMethod(value, join, [base, path]),
    };
}
function getNodeApi(): NodeApi | null {
    try {
        const globalRequire = propertyValue(globalThis, 'require');
        const windowRequire = typeof window === 'undefined' ? null : propertyValue(window, 'require');
        const requireFunction = typeof globalRequire === 'function' ? globalRequire : windowRequire;
        if (typeof requireFunction !== 'function')
            return null;
        const receiver = requireFunction === windowRequire && typeof window !== 'undefined' ? window : globalThis;
        const pathModule = normalizePathModule(Reflect.apply(requireFunction, receiver, ['path']));
        return pathModule ? { path: pathModule } : null;
    }
    catch {
        return null;
    }
}
function normalizeFileUrlPath(url: URL, pathModule: PathModule): string {
    if (url.hostname && pathModule.sep !== '\\')
        return '';
    let localPath = decodeURIComponent(url.pathname);
    localPath = localPath.replace(/^\/+([A-Za-z]:[\\/])/u, '$1');
    if (url.hostname)
        localPath = `//${url.hostname}${localPath}`;
    localPath = localPath.replace(/\//gu, pathModule.sep);
    return pathModule.normalize(localPath);
}
function normalizeGameRelativeUrlPath(pathname: unknown, pathModule: PathModule, gameRoot: string): string {
    if (!gameRoot)
        return '';
    let relativePath = decodeURIComponent(stringValue(truthyOr(pathname, '')));
    relativePath = relativePath.replace(/^\/+/u, '');
    if (!relativePath)
        return pathModule.normalize(gameRoot);
    relativePath = relativePath.replace(/\//gu, pathModule.sep);
    return pathModule.resolve(gameRoot, relativePath);
}
export function resolveLocalPathFromUrl(url: unknown, pathModule: PathModule | null, gameRoot = ''): string {
    if (!url || !pathModule)
        return '';
    try {
        const baseUrl = typeof window === 'undefined' ? undefined : window.location.href;
        const parsed = new URL(stringValue(url), baseUrl);
        if (parsed.protocol === 'file:')
            return normalizeFileUrlPath(parsed, pathModule);
        return normalizeGameRelativeUrlPath(parsed.pathname, pathModule, gameRoot);
    }
    catch {
        return '';
    }
}
export function getProcessCwd(): string {
    try {
        const processValue = propertyValue(globalThis, 'process');
        const cwd = propertyValue(processValue, 'cwd');
        if (typeof cwd !== 'function')
            return '';
        const value: unknown = Reflect.apply(cwd, processValue, []);
        return typeof value === 'string' && value ? value : '';
    }
    catch {
        return '';
    }
}
function getHomePath(): string {
    try {
        const globalRequire = propertyValue(globalThis, 'require');
        const windowRequire = typeof window === 'undefined' ? null : propertyValue(window, 'require');
        const load = typeof globalRequire === 'function' ? globalRequire : windowRequire;
        if (typeof load !== 'function')
            return '';
        const os: unknown = Reflect.apply(load, load === windowRequire ? window : globalThis, ['os']);
        const homedir = propertyValue(os, 'homedir');
        if (typeof homedir !== 'function')
            return '';
        const value: unknown = Reflect.apply(homedir, os, []);
        return typeof value === 'string' && value ? value : '';
    }
    catch {
        return '';
    }
}
export function createRuntimePaths(options: unknown = {}): RuntimePaths {
    const source = isUnknownRecord(options) ? options : {};
    const loaderScript = source['loaderScript'];
    const supportDir = stringValue(truthyOr(source['supportDir'], ''));
    const nodeApi = getNodeApi();
    const pathModule = nodeApi?.path ?? null;
    const gameRoot = getProcessCwd();
    const supportPath = pathModule ? resolveLocalPathFromUrl(supportDir, pathModule, gameRoot) : '';
    const homePath = getHomePath();
    const llamafileDataPath = pathModule && homePath
        ? LLAMAFILE_DATA_DIRECTORIES.reduce((current, directory) => pathModule.join(current, directory), homePath)
        : '';
    const joinSupport = (fileName: string): string => {
        if (pathModule && supportPath)
            return pathModule.join(supportPath, fileName);
        if (pathModule && gameRoot)
            return pathModule.join(gameRoot, fileName);
        return '';
    };
    return {
        loaderUrl: stringValue(truthyOr(propertyValue(loaderScript, 'src'), '')),
        supportUrl: supportDir,
        supportPath,
        perfDirectory: joinSupport(PERF_DIRECTORY),
        gameRoot,
        llamafileDataPath,
        translationCacheFile: joinSupport(TRANSLATION_CACHE_FILE),
    };
}
