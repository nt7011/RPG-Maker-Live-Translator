import { captureLogRedactor } from './log-redaction-port.js';
import { createNoThrowLoggerSinks } from './logger/no-throw-sinks.js';
import { normalizeProviderName, normalizeProviderSelection, type ProviderSchemaWarningSink, } from './translation-providers/provider-schema.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;
interface RuntimeScopeCandidate {
    readonly LiveTranslatorErrorGuard?: unknown;
}
interface RuntimeConfigApplyOptionsCandidate {
    readonly logger?: unknown;
    readonly scope?: unknown;
}
interface RuntimeConfigLoggerCandidate {
    readonly warn?: unknown;
}
interface ErrorGuardCandidate {
    readonly applySettings?: unknown;
}
interface NormalizedAssetTransaction {
    readonly assets: Readonly<PropertyBag>;
    readonly config: Readonly<PropertyBag>;
    readonly settings: Readonly<PropertyBag>;
}
interface DescriptorSnapshot {
    readonly key: 'LiveTranslatorAssets' | 'LiveTranslatorConfig' | 'LiveTranslatorSettings';
    readonly descriptor: PropertyDescriptor | undefined;
}
interface CapturedAsset {
    readonly descriptor: PropertyDescriptor;
    readonly key: PropertyKey;
    read(): unknown;
}
export interface RuntimeConfigApplyResult {
    readonly assets: unknown;
    readonly config: unknown;
    readonly settings: unknown;
}
export interface RuntimeConfigModule {
    applyAssets(assets: unknown, options?: unknown): RuntimeConfigApplyResult;
    getActiveProvider(scope?: unknown): string | null;
    getTranslatorConfig(scope?: unknown): object | null;
    requireSettings(scope?: unknown): object;
    validateAssets(assets: unknown, logger: unknown): void;
}
const hasOwnProperty = Object.prototype.hasOwnProperty;
const CONFIGURATION_KEYS = Object.freeze([
    'LiveTranslatorAssets',
    'LiveTranslatorConfig',
    'LiveTranslatorSettings',
] as const);
let activeApplyAssetsOwner: symbol | null = null;
function isRecord(value: unknown): value is PropertyBag {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function hasOwn(source: object, key: PropertyKey): boolean {
    return Reflect.apply(hasOwnProperty, source, [key]);
}
function isPropertyOwner(value: unknown): value is PropertyBag {
    return (value !== null && typeof value === 'object') || typeof value === 'function';
}
function ownValue(source: PropertyBag, key: PropertyKey): unknown {
    return hasOwn(source, key) ? source[key] : undefined;
}
function createWarningSink(logger: unknown): ProviderSchemaWarningSink {
    let captured = false;
    let warn: RuntimeFunction | null = null;
    return Object.freeze({
        warn(message: string): void {
            if (!captured) {
                captured = true;
                const candidate = logger as RuntimeConfigLoggerCandidate | null;
                const method = candidate?.warn;
                warn = typeof method === 'function' ? (method as RuntimeFunction) : null;
            }
            if (warn)
                Reflect.apply(warn, logger, [message]);
        },
    });
}
function snapshotAsset(asset: unknown, normalizedJson?: unknown): Readonly<PropertyBag> {
    if (!isRecord(asset))
        throw new Error('[LiveTranslator][Config] configuration asset is missing or invalid.');
    const snapshot: PropertyBag = {};
    for (const key of Reflect.ownKeys(asset)) {
        const descriptor = Object.getOwnPropertyDescriptor(asset, key);
        if (!descriptor?.enumerable)
            continue;
        const value = key === 'json' && normalizedJson !== undefined ? normalizedJson : asset[key];
        Object.defineProperty(snapshot, key, {
            configurable: false,
            enumerable: true,
            value,
            writable: false,
        });
    }
    if (normalizedJson !== undefined && !hasOwn(snapshot, 'json')) {
        Object.defineProperty(snapshot, 'json', {
            configurable: false,
            enumerable: true,
            value: normalizedJson,
            writable: false,
        });
    }
    return Object.freeze(snapshot);
}
function captureAsset(source: PropertyBag, key: PropertyKey, descriptor: PropertyDescriptor): CapturedAsset {
    let captured = false;
    let value: unknown;
    return {
        descriptor,
        key,
        read(): unknown {
            if (!captured) {
                captured = true;
                if (hasOwn(descriptor, 'value'))
                    value = descriptor.value;
                else if (typeof descriptor.get === 'function')
                    value = Reflect.apply(descriptor.get, source, []);
            }
            return value;
        },
    };
}
function normalizeAssets(assets: unknown, logger: unknown): NormalizedAssetTransaction {
    if (!isRecord(assets))
        throw new Error('[LiveTranslator][Config] configuration assets are missing or invalid.');
    const capturedAssets = new Map<PropertyKey, CapturedAsset>();
    for (const key of Reflect.ownKeys(assets)) {
        const descriptor = Object.getOwnPropertyDescriptor(assets, key);
        if (descriptor?.enumerable)
            capturedAssets.set(key, captureAsset(assets, key, descriptor));
    }
    const translatorAsset = capturedAssets.get('translator.jsonc')?.read();
    if (!isRecord(translatorAsset)) {
        throw new Error('[LiveTranslator][Config] translator.jsonc missing or invalid.');
    }
    const translatorJson = ownValue(translatorAsset, 'json');
    if (!isRecord(translatorJson)) {
        throw new Error('[LiveTranslator][Config] translator.jsonc missing or invalid.');
    }
    const warningSink = createWarningSink(logger);
    const selection = normalizeProviderSelection(translatorJson, () => {
        const settingsAsset = capturedAssets.get('settings.jsonc')?.read();
        if (!isRecord(settingsAsset)) {
            warningSink.warn('[LiveTranslator][Config] settings.jsonc is unavailable. Using default settings.');
            return {};
        }
        return ownValue(settingsAsset, 'json');
    }, undefined, warningSink);
    const publishedAssets: PropertyBag = {};
    for (const [key, capturedAsset] of capturedAssets) {
        const asset = capturedAsset.read();
        let published = asset;
        if (key === 'translator.jsonc')
            published = snapshotAsset(asset, selection.translatorConfig);
        else if (key === 'settings.jsonc')
            published = snapshotAsset(asset, selection.settings);
        else if (isRecord(asset))
            published = snapshotAsset(asset);
        Object.defineProperty(publishedAssets, key, {
            configurable: false,
            enumerable: true,
            value: published,
            writable: false,
        });
    }
    return Object.freeze({
        assets: Object.freeze(publishedAssets),
        config: selection.translatorConfig,
        settings: selection.settings,
    });
}
function snapshotDescriptors(scope: PropertyBag): readonly DescriptorSnapshot[] {
    return CONFIGURATION_KEYS.map((key) => ({
        key,
        descriptor: Object.getOwnPropertyDescriptor(scope, key),
    }));
}
function isDataDescriptor(descriptor: PropertyDescriptor): boolean {
    return hasOwn(descriptor, 'value') || hasOwn(descriptor, 'writable');
}
function descriptorsMatch(actual: PropertyDescriptor | undefined, expected: PropertyDescriptor | undefined): boolean {
    if (!actual || !expected)
        return actual === expected;
    if (actual.configurable !== expected.configurable ||
        actual.enumerable !== expected.enumerable ||
        isDataDescriptor(actual) !== isDataDescriptor(expected)) {
        return false;
    }
    if (isDataDescriptor(expected)) {
        return actual.writable === expected.writable && Object.is(actual.value, expected.value);
    }
    return actual.get === expected.get && actual.set === expected.set;
}
function inspectRestoredDescriptor(scope: PropertyBag, snapshot: DescriptorSnapshot, phase: 'immediate' | 'final'): Error | null {
    try {
        const actual = Object.getOwnPropertyDescriptor(scope, snapshot.key);
        if (descriptorsMatch(actual, snapshot.descriptor))
            return null;
        return new TypeError(`Configuration rollback ${phase} verification found a descriptor mismatch for "${snapshot.key}".`);
    }
    catch (error) {
        return new AggregateError([error], `Configuration rollback ${phase} verification could not inspect "${snapshot.key}".`, { cause: error });
    }
}
function publicationDescriptors(candidate: NormalizedAssetTransaction): PropertyDescriptorMap {
    return {
        LiveTranslatorAssets: {
            configurable: true,
            enumerable: true,
            value: candidate.assets,
            writable: true,
        },
        LiveTranslatorConfig: {
            configurable: true,
            enumerable: true,
            value: candidate.config,
            writable: true,
        },
        LiveTranslatorSettings: {
            configurable: true,
            enumerable: true,
            value: candidate.settings,
            writable: true,
        },
    };
}
function assertPublishedTransaction(scope: PropertyBag, candidate: NormalizedAssetTransaction): void {
    const expected = new Map<string, unknown>([
        ['LiveTranslatorAssets', candidate.assets],
        ['LiveTranslatorConfig', candidate.config],
        ['LiveTranslatorSettings', candidate.settings],
    ]);
    for (const key of CONFIGURATION_KEYS) {
        const descriptor = Object.getOwnPropertyDescriptor(scope, key);
        if (descriptor?.configurable !== true ||
            descriptor.enumerable !== true ||
            descriptor.writable !== true ||
            !Object.is(descriptor.value, expected.get(key))) {
            throw new TypeError(`[LiveTranslator][Config] publication scope did not accept authoritative property "${key}".`);
        }
    }
}
function restoreDescriptors(scope: PropertyBag, snapshots: readonly DescriptorSnapshot[]): void {
    const evidence: unknown[] = [];
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
        const snapshot = snapshots[index];
        if (!snapshot)
            continue;
        try {
            if (snapshot.descriptor)
                Object.defineProperty(scope, snapshot.key, snapshot.descriptor);
            else if (!Reflect.deleteProperty(scope, snapshot.key)) {
                throw new TypeError(`Could not remove rolled-back configuration property "${snapshot.key}".`);
            }
        }
        catch (error) {
            evidence.push(new AggregateError([error], `Configuration rollback operation failed for "${snapshot.key}".`, {
                cause: error,
            }));
        }
        const mismatch = inspectRestoredDescriptor(scope, snapshot, 'immediate');
        if (mismatch)
            evidence.push(mismatch);
    }
    for (const snapshot of snapshots) {
        const mismatch = inspectRestoredDescriptor(scope, snapshot, 'final');
        if (mismatch)
            evidence.push(mismatch);
    }
    if (evidence.length)
        throw new AggregateError(evidence, 'Configuration publication rollback failed.');
}
function publishTransaction(scope: PropertyBag, candidate: NormalizedAssetTransaction): void {
    const snapshots = snapshotDescriptors(scope);
    try {
        Object.defineProperties(scope, publicationDescriptors(candidate));
        assertPublishedTransaction(scope, candidate);
    }
    catch (publicationError) {
        try {
            restoreDescriptors(scope, snapshots);
        }
        catch (rollbackError) {
            throw new AggregateError([publicationError, rollbackError], 'Configuration publication failed and could not be rolled back.', { cause: rollbackError });
        }
        throw publicationError;
    }
}
function notifyErrorGuard(scope: PropertyBag, settings: Readonly<PropertyBag>, logger: unknown): void {
    try {
        const guard = (scope as RuntimeScopeCandidate).LiveTranslatorErrorGuard;
        const applySettings = (guard as ErrorGuardCandidate | null)?.applySettings;
        if (typeof applySettings === 'function')
            Reflect.apply(applySettings as RuntimeFunction, guard, [settings]);
    }
    catch {
        try {
            createWarningSink(logger).warn('[LiveTranslator][Config] Error guard rejected the settings update.');
        }
        catch {
        }
    }
}
export function createConfigModule(runtimeScope: unknown): RuntimeConfigModule {
    function getScope(): unknown {
        return runtimeScope;
    }
    function requireSettings(scope: unknown = getScope()): object {
        const settings = isPropertyOwner(scope) ? scope['LiveTranslatorSettings'] : undefined;
        if (isRecord(settings))
            return settings;
        throw new Error('[LiveTranslator][Config] settings.jsonc not loaded (LiveTranslatorSettings missing).');
    }
    function getTranslatorConfig(scope: unknown = getScope()): object | null {
        const config = isPropertyOwner(scope) ? scope['LiveTranslatorConfig'] : undefined;
        return isRecord(config) ? config : null;
    }
    function getActiveProvider(scope: unknown = getScope()): string | null {
        const config = getTranslatorConfig(scope);
        if (!config)
            return null;
        const provider = normalizeProviderName((config as PropertyBag)['provider']);
        return provider || null;
    }
    function validateAssets(assets: unknown, logger: unknown): void {
        normalizeAssets(assets, logger);
    }
    function applyAssets(assets: unknown, options: unknown = {}): RuntimeConfigApplyResult {
        if (activeApplyAssetsOwner) {
            throw new Error('[LiveTranslator][Config] applyAssets is not reentrant.');
        }
        const owner = Symbol('LiveTranslatorConfigApply');
        activeApplyAssetsOwner = owner;
        try {
            if (!isRecord(options))
                throw new TypeError('Configuration apply options must be an object.');
            const configuredScope = (options as RuntimeConfigApplyOptionsCandidate).scope;
            const scopeValue = configuredScope ?? getScope();
            if (!isPropertyOwner(scopeValue)) {
                throw new TypeError('Configuration publication scope must be an object.');
            }
            const configuredLogger = (options as RuntimeConfigApplyOptionsCandidate).logger;
            const logger = configuredLogger ?? {
                warn: (...args: unknown[]) => {
                    createNoThrowLoggerSinks(captureLogRedactor(scopeValue)).warn(args);
                },
            };
            const candidate = normalizeAssets(assets, logger);
            publishTransaction(scopeValue, candidate);
            notifyErrorGuard(scopeValue, candidate.settings, logger);
            return {
                assets: candidate.assets,
                config: candidate.config,
                settings: candidate.settings,
            };
        }
        finally {
            if (activeApplyAssetsOwner === owner)
                activeApplyAssetsOwner = null;
        }
    }
    return {
        applyAssets,
        getActiveProvider,
        getTranslatorConfig,
        requireSettings,
        validateAssets,
    };
}
