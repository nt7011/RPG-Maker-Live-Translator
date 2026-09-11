import { createRuntimePaths } from './loader/path-resolver.js';
import { parseJsonc } from './configuration/jsonc.js';
import { createConfigModule } from './runtime/config.js';
import { startNativeRuntime } from './runtime/composition.js';
import { captureRuntimeDiagnosticsIngress } from './runtime/diagnostics-ingress.js';
import { createLoggerModule } from './runtime/logger.js';
import { captureLogRedactor } from './runtime/log-redaction-port.js';
import { createNoThrowLoggerSinks } from './runtime/logger/no-throw-sinks.js';
import { createGuiWindowAttachment } from './ui-launcher/window-feeds.js';
import { launchUi } from './ui-launcher/index.js';
const PACKAGE_DESCRIPTOR_FILE = 'rmlt-package.json';
type PropertyBag = Record<PropertyKey, unknown>;
type LoggerBundleFactory = ReturnType<typeof createLoggerModule>;
interface RuntimeRequirements {
    readonly minimumNwjs: string;
    readonly recommendedNwjs: string;
    readonly requiredAssets: readonly string[];
    readonly optionalAssets: readonly string[];
}
interface LoaderLogger {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
interface SupportAsset {
    readonly raw: string;
    readonly json?: unknown;
}
interface BootstrapState {
    status: 'loading' | 'ready' | 'degraded' | 'failed';
    readonly startedAt: number;
    readyAt?: number;
    failedAt?: number;
    error: string | null;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
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
function errorMessage(error: unknown): string {
    const message = propertyValue(error, 'message');
    return message ? stringValue(message) : stringValue(error);
}
function getGlobalScope(): PropertyBag {
    const scope: unknown = typeof window === 'undefined' ? globalThis : window;
    if (!isPropertyBag(scope))
        throw new Error('[LiveTranslatorLoader] Global scope is unavailable.');
    return scope;
}
function resolveSupportDir(loaderScript: unknown): string {
    const source = propertyValue(loaderScript, 'src');
    if (!source)
        throw new Error('[LiveTranslatorLoader] Plugin script URL is unavailable.');
    const base = new URL(stringValue(source), window.location.href);
    return new URL('./', base).href;
}
function readStringList(value: unknown, fieldName: string): readonly string[] {
    if (!Array.isArray(value)) {
        throw new Error(`[LiveTranslatorLoader] rmlt-package runtime.${fieldName} must be an array.`);
    }
    return value.map((entry) => {
        if (typeof entry !== 'string') {
            throw new Error(`[LiveTranslatorLoader] rmlt-package runtime.${fieldName} must contain strings.`);
        }
        return entry;
    });
}
function normalizeRuntimeRequirements(value: unknown): RuntimeRequirements {
    if (!isRecord(value) || !isRecord(value['runtime'])) {
        throw new Error('[LiveTranslatorLoader] rmlt-package.json runtime metadata is invalid.');
    }
    const runtime = value['runtime'];
    if (typeof runtime['minimumNwjs'] !== 'string' || typeof runtime['recommendedNwjs'] !== 'string') {
        throw new Error('[LiveTranslatorLoader] rmlt-package NW.js requirements are invalid.');
    }
    return {
        minimumNwjs: runtime['minimumNwjs'],
        recommendedNwjs: runtime['recommendedNwjs'],
        requiredAssets: readStringList(runtime['requiredAssets'], 'requiredAssets'),
        optionalAssets: readStringList(runtime['optionalAssets'], 'optionalAssets'),
    };
}
async function loadRuntimeRequirements(supportDir: string): Promise<RuntimeRequirements> {
    const response = await fetch(new URL(PACKAGE_DESCRIPTOR_FILE, supportDir).href);
    if (!response.ok) {
        throw new Error(`[LiveTranslatorLoader] Failed to load ${PACKAGE_DESCRIPTOR_FILE}: HTTP ${String(response.status)} ${response.statusText}`);
    }
    return normalizeRuntimeRequirements(await response.json());
}
function isLoaderLogger(value: unknown): value is LoaderLogger {
    return (isPropertyBag(value) &&
        typeof value['debug'] === 'function' &&
        typeof value['info'] === 'function' &&
        typeof value['warn'] === 'function' &&
        typeof value['error'] === 'function');
}
function createConfiguredLogger(createLoggerBundle: LoggerBundleFactory, settings: unknown, paths: unknown): LoaderLogger {
    const bundle: unknown = createLoggerBundle({ settings: settings ?? {}, paths: paths ?? {}, maxLogsPerFrame: 1000 });
    const logger = propertyValue(bundle, 'logger');
    if (isLoaderLogger(logger))
        return logger;
    throw new Error('[LiveTranslatorLoader] Logger construction failed.');
}
async function loadSupportAsset(supportDir: string, file: string, logger: LoaderLogger, required: boolean): Promise<readonly [
    string,
    SupportAsset
] | null> {
    try {
        const response = await fetch(new URL(file, supportDir).href);
        if (!response.ok)
            throw new Error(`HTTP ${String(response.status)} ${response.statusText}`);
        const raw = await response.text();
        const lowerFile = file.toLowerCase();
        let asset: SupportAsset;
        if (lowerFile.endsWith('.json') || lowerFile.endsWith('.jsonc')) {
            try {
                asset = { raw, json: parseJsonc(raw) };
            }
            catch (error) {
                const leafName = lowerFile.replace(/\\/gu, '/').split('/').pop();
                if (leafName !== 'settings.jsonc')
                    throw error;
                logger.warn('[LiveTranslatorLoader] settings.jsonc is not valid JSONC. Continuing with default settings.', error);
                asset = { raw, json: {} };
            }
        }
        else {
            asset = { raw };
        }
        logger.debug(`[LiveTranslatorLoader] Loaded asset ${file}`);
        return [file, asset];
    }
    catch (error) {
        if (!required) {
            logger.debug(`[LiveTranslatorLoader] Optional asset ${file} unavailable.`);
            return null;
        }
        logger.error(`[LiveTranslatorLoader][Fatal] Missing, unreadable, or invalid asset ${file} (expected in live-translator folder next to live-translator-loader.js).`, error);
        throw error;
    }
}
async function loadSupportAssets(supportDir: string, requirements: RuntimeRequirements, logger: LoaderLogger): Promise<Record<string, SupportAsset>> {
    const required = requirements.requiredAssets.map((file) => loadSupportAsset(supportDir, file, logger, true));
    const optional = requirements.optionalAssets.map((file) => loadSupportAsset(supportDir, file, logger, false));
    const entries = await Promise.all([...required, ...optional]);
    const assets: Record<string, SupportAsset> = {};
    for (const entry of entries) {
        if (entry)
            assets[entry[0]] = entry[1];
    }
    return assets;
}
function compareVersions(left: string, right: string): -1 | 0 | 1 {
    const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const leftValue = leftParts[index] ?? 0;
        const rightValue = rightParts[index] ?? 0;
        if (leftValue > rightValue)
            return 1;
        if (leftValue < rightValue)
            return -1;
    }
    return 0;
}
function reportNwVersion(logger: LoaderLogger, requirements: RuntimeRequirements): void {
    const minimum = requirements.minimumNwjs;
    const recommended = requirements.recommendedNwjs || minimum;
    if (!minimum && !recommended)
        return;
    try {
        const version = propertyValue(propertyValue(propertyValue(globalThis, 'process'), 'versions'), 'nw');
        const current = version ? stringValue(version) : '';
        if (!current) {
            logger.warn('[LiveTranslator] NW.js version could not be detected.');
        }
        else if (minimum && compareVersions(current, minimum) < 0) {
            logger.warn(`[LiveTranslator][Compat] Detected NW.js version ${current}; below minimum ${minimum}. Update NW.js before running the translator.`);
        }
        else if (recommended && compareVersions(current, recommended) < 0) {
            logger.warn(`[LiveTranslator][Compat] Detected NW.js version ${current}; below recommended ${recommended}. Update NW.js to avoid runtime and translation issues.`);
        }
        else {
            logger.debug(`[LiveTranslator] Detected NW.js version ${current}.`);
        }
    }
    catch (error) {
        logger.warn('[LiveTranslator] Failed to check NW.js version:', error);
    }
}
function beginBootstrap(scope: PropertyBag): BootstrapState | null {
    const existing = scope['LiveTranslatorLoaderState'];
    const status = propertyValue(existing, 'status');
    if (scope['LiveTranslatorLoaderBootstrapped'] || status === 'loading' || status === 'ready')
        return null;
    const state: BootstrapState = {
        status: 'loading',
        startedAt: Date.now(),
        error: null,
    };
    scope['LiveTranslatorLoaderState'] = state;
    return state;
}
async function bootstrap(): Promise<void> {
    if (typeof document === 'undefined')
        throw new Error('[LiveTranslatorLoader] No document context available.');
    const loaderScript = document.currentScript;
    if (!loaderScript)
        throw new Error('[LiveTranslatorLoader] document.currentScript is unavailable.');
    if (typeof window === 'undefined')
        return;
    const scope = getGlobalScope();
    const state = beginBootstrap(scope);
    if (!state) {
        console.log('[LiveTranslatorLoader] Bootstrap already completed or in progress, skipping.');
        return;
    }
    const diagnostics = captureRuntimeDiagnosticsIngress(scope);
    const guiWindow = createGuiWindowAttachment(scope);
    let logger: LoaderLogger | null = null;
    try {
        const supportDir = resolveSupportDir(loaderScript);
        const requirements = await loadRuntimeRequirements(supportDir);
        const paths = createRuntimePaths({ loaderScript, supportDir });
        scope['LiveTranslatorPaths'] = paths;
        const configModule = createConfigModule(scope);
        const createLoggerBundle = createLoggerModule(captureLogRedactor(scope));
        logger = createConfiguredLogger(createLoggerBundle, {}, paths);
        reportNwVersion(logger, requirements);
        const assets = await loadSupportAssets(supportDir, requirements, logger);
        configModule.applyAssets(assets, { scope, logger });
        logger = createConfiguredLogger(createLoggerBundle, scope['LiveTranslatorSettings'], paths);
        const runtime = await startNativeRuntime({ configModule, createLoggerBundle, diagnostics, scope });
        if (runtime.phase !== 'ready' && runtime.phase !== 'degraded') {
            const detail = runtime.error || runtime.cache.error || runtime.phase;
            throw new Error(`[LiveTranslatorLoader] Runtime startup did not succeed: ${detail}`);
        }
        state.status = runtime.phase;
        state.readyAt = Date.now();
        state.error = runtime.phase === 'degraded' ? runtime.cache.error || null : null;
        scope['LiveTranslatorLoaderBootstrapped'] = true;
        try {
            launchUi(guiWindow);
        }
        catch (error) {
            logger.warn('[LiveTranslatorLoader] GUI launcher is unavailable:', error);
        }
        if (runtime.phase === 'degraded') {
            logger.warn('[LiveTranslatorLoader] Runtime started with degraded optional capabilities.', state.error);
        }
        else {
            logger.info('[LiveTranslatorLoader] Runtime ready.');
        }
    }
    catch (error) {
        state.status = 'failed';
        state.failedAt = Date.now();
        state.error = errorMessage(error);
        logger?.error('[LiveTranslatorLoader] Bootstrap failed:', error);
        throw error;
    }
}
void bootstrap().catch((error: unknown) => {
    const scope = typeof window === 'undefined' ? globalThis : window;
    createNoThrowLoggerSinks(captureLogRedactor(scope)).error([
        '[LiveTranslatorLoader] Unhandled bootstrap failure:',
        error,
    ]);
});
export {};
