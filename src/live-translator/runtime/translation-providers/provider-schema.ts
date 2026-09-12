import { selectLlamafileProfile, type LlamafileProfileId } from './llamafile/catalog.js';
import { DEFAULT_SPEEDUP_MULTIPLIER, MAX_SPEEDUP_MULTIPLIER, resolveSpeedupMultiplier, } from '../../configuration/speedup.js';
type PropertyBag = Record<string, unknown>;
const DEFAULT_LOCAL_MAX_OUTPUT_TOKENS = 512;
const DEFAULT_MODEL_CATALOG_TTL_MS = 5000;
const DEFAULT_MODEL_CATALOG_TIMEOUT_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
export const MAX_PROVIDER_TIMEOUT_MS = 2147483647;
const hasOwnProperty = Object.prototype.hasOwnProperty;
const issuedProviderSelections = new WeakMap<object, NormalizedProviderSelection>();
export type TranslationProviderName = 'llamafile' | 'llamacpp' | 'lmstudio' | 'mocktranslator' | 'none';
export interface LmStudioConfig {
    readonly api_key: string;
    readonly address: string;
    readonly port: number;
    readonly model: string;
    readonly system_prompt: string;
    readonly temperature: number;
    readonly top_k: number | null;
    readonly repeat_penalty: number | null;
    readonly min_p: number | null;
    readonly top_p: number;
    readonly max_output_tokens: number;
    readonly model_catalog_ttl_ms: number;
    readonly model_catalog_timeout_ms: number;
    readonly request_timeout_ms: number;
}
export interface LlamaCppConfig {
    readonly base_url: string;
    readonly api_key: string;
    readonly model: string;
    readonly system_prompt: string;
    readonly temperature: number;
    readonly top_k: number | null;
    readonly repeat_penalty: number | null;
    readonly min_p: number | null;
    readonly top_p: number;
    readonly max_output_tokens: number;
    readonly model_catalog_ttl_ms: number;
    readonly model_catalog_timeout_ms: number;
    readonly request_timeout_ms: number;
}
export interface LlamafileConfig {
    readonly profile: LlamafileProfileId;
    readonly system_prompt: string;
    readonly max_output_tokens: number;
    readonly request_timeout_ms: number;
}
export interface MockTranslatorConfig {
    readonly capacity: number;
    readonly delayMs: number;
    readonly useRandomizedStrings: boolean;
}
export type NormalizedProviderConfig = LlamafileConfig | LlamaCppConfig | LmStudioConfig | MockTranslatorConfig | Readonly<Record<string, never>>;
export interface ProviderSchemaWarningSink {
    warn(message: string): void;
}
export interface NormalizedProviderSelection {
    readonly provider: TranslationProviderName;
    readonly providerConfig: NormalizedProviderConfig;
    readonly settings: Readonly<PropertyBag>;
    readonly translatorConfig: Readonly<{
        provider: TranslationProviderName;
        settings: Readonly<PropertyBag>;
    }>;
}
interface Field {
    readonly present: boolean;
    readonly value: unknown;
}
interface CapturedField {
    readonly alias: string;
    readonly present: boolean;
    read(): Field;
}
interface SelectedProviderSource {
    readonly provider: TranslationProviderName;
    readonly source: PropertyBag;
}
interface RequiredProviderFields {
    readonly model?: string;
}
interface StagedProviderSource {
    readonly source: Readonly<PropertyBag>;
    readonly tokenFields: readonly CapturedField[];
}
function isRecord(value: unknown): value is PropertyBag {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function hasOwn(source: object, key: PropertyKey): boolean {
    return Reflect.apply(hasOwnProperty, source, [key]);
}
function ownField(source: PropertyBag, key: string): Field {
    if (!hasOwn(source, key))
        return { present: false, value: undefined };
    return { present: true, value: source[key] };
}
function firstAlias(source: PropertyBag, aliases: readonly string[]): Field {
    for (const alias of aliases) {
        const field = ownField(source, alias);
        if (field.present)
            return field;
    }
    return { present: false, value: undefined };
}
function captureField(source: PropertyBag, alias: string): CapturedField {
    const descriptor = Object.getOwnPropertyDescriptor(source, alias);
    if (!descriptor) {
        return Object.freeze({
            alias,
            present: false,
            read(): Field {
                return { present: false, value: undefined };
            },
        });
    }
    let captured = false;
    let value: unknown;
    return Object.freeze({
        alias,
        present: true,
        read(): Field {
            if (!captured) {
                captured = true;
                if (hasOwn(descriptor, 'value'))
                    value = descriptor.value;
                else if (typeof descriptor.get === 'function')
                    value = Reflect.apply(descriptor.get, source, []);
            }
            return { present: true, value };
        },
    });
}
function requiredRecord(value: unknown, message: string): PropertyBag {
    if (isRecord(value))
        return value;
    throw new Error(message);
}
function requiredNonemptyString(field: Field, path: string): string {
    if (field.present && typeof field.value === 'string') {
        const value = field.value.trim();
        if (value)
            return value;
    }
    throw new Error(`translator.jsonc missing required "${path}" field.`);
}
function optionalString(field: Field, path: string, fallback: string, trim = true): string {
    if (!field.present)
        return fallback;
    if (typeof field.value === 'string')
        return trim ? field.value.trim() : field.value;
    throw new Error(`translator.jsonc has invalid "${path}" (must be a string).`);
}
function numericValue(value: unknown): number | null {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !value.trim())
        return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}
function finiteNumber(field: Field, path: string, fallback: number): number {
    if (!field.present)
        return fallback;
    const numeric = numericValue(field.value);
    if (numeric !== null)
        return numeric;
    throw new Error(`translator.jsonc has invalid "${path}" (must be a finite number).`);
}
function optionalFiniteNumber(field: Field, path: string): number | null {
    if (!field.present)
        return null;
    const numeric = numericValue(field.value);
    if (numeric !== null)
        return numeric;
    throw new Error(`translator.jsonc has invalid "${path}" (must be a finite number).`);
}
function positiveInteger(field: Field, path: string, fallback: number): number {
    if (!field.present)
        return fallback;
    const numeric = numericValue(field.value);
    if (numeric !== null && Number.isInteger(numeric) && numeric > 0)
        return numeric;
    throw new Error(`translator.jsonc has invalid "${path}" (must be a positive integer).`);
}
function nonNegativeInteger(field: Field, path: string, fallback: number): number {
    if (!field.present)
        return fallback;
    const numeric = numericValue(field.value);
    if (numeric !== null && Number.isInteger(numeric) && numeric >= 0)
        return numeric;
    throw new Error(`translator.jsonc has invalid "${path}" (must be a non-negative integer).`);
}
function consistentPositiveIntegerAliases(source: PropertyBag | null, aliases: readonly string[], path: string): Field {
    if (!source)
        return { present: false, value: undefined };
    let selected: number | null = null;
    for (const alias of aliases) {
        const field = ownField(source, alias);
        if (!field.present)
            continue;
        const numeric = positiveInteger(field, `${path}.${alias}`, 0);
        if (selected !== null && selected !== numeric) {
            throw new Error(`Configuration contains conflicting token aliases at "${path}".`);
        }
        selected = numeric;
    }
    return selected === null ? { present: false, value: undefined } : { present: true, value: selected };
}
function snapshotJson(value: unknown, active: Set<object>): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (value === undefined)
        return undefined;
    if (typeof value !== 'object') {
        throw new TypeError('Configuration values must be JSON-compatible.');
    }
    if (active.has(value))
        throw new TypeError('Configuration values must not contain cycles.');
    active.add(value);
    try {
        if (Array.isArray(value)) {
            const snapshot: unknown[] = [];
            for (const entry of value)
                snapshot.push(snapshotJson(entry, active));
            return snapshot;
        }
        const source = value as PropertyBag;
        const snapshot: PropertyBag = {};
        for (const key of Object.keys(source)) {
            Object.defineProperty(snapshot, key, {
                configurable: true,
                enumerable: true,
                value: snapshotJson(source[key], active),
                writable: true,
            });
        }
        return snapshot;
    }
    finally {
        active.delete(value);
    }
}
interface SettingsSourceSnapshot {
    readonly settings: PropertyBag;
    readonly runtimeTokenAuthored: boolean;
}
function snapshotTranslationSettings(source: PropertyBag, active: Set<object>): SettingsSourceSnapshot {
    if (active.has(source))
        throw new TypeError('Configuration values must not contain cycles.');
    active.add(source);
    try {
        const snapshot: PropertyBag = {};
        const reserved = new Set([
            'maxOutputTokens',
            'max_output_tokens',
            'modelCatalogTtlMs',
            'model_catalog_ttl_ms',
            'modelCatalogTimeoutMs',
            'model_catalog_timeout_ms',
            'requestTimeoutMs',
            'request_timeout_ms',
        ]);
        for (const key of Object.keys(source)) {
            if (!reserved.has(key)) {
                Object.defineProperty(snapshot, key, {
                    configurable: true,
                    enumerable: true,
                    value: snapshotJson(source[key], active),
                    writable: true,
                });
            }
        }
        const primaryToken = ownField(source, 'maxOutputTokens');
        let runtimeTokenAuthored = primaryToken.present;
        if (primaryToken.present) {
            snapshot['maxOutputTokens'] = primaryToken.value;
            const numeric = numericValue(primaryToken.value);
            if (numeric !== null && Number.isInteger(numeric) && numeric > 0) {
                const legacyToken = ownField(source, 'max_output_tokens');
                if (legacyToken.present)
                    snapshot['max_output_tokens'] = legacyToken.value;
            }
        }
        else {
            const legacyToken = ownField(source, 'max_output_tokens');
            runtimeTokenAuthored = legacyToken.present;
            if (legacyToken.present)
                snapshot['max_output_tokens'] = legacyToken.value;
        }
        for (const [canonical, aliases] of [
            ['modelCatalogTtlMs', ['modelCatalogTtlMs', 'model_catalog_ttl_ms']],
            ['modelCatalogTimeoutMs', ['modelCatalogTimeoutMs', 'model_catalog_timeout_ms']],
            ['requestTimeoutMs', ['requestTimeoutMs', 'request_timeout_ms']],
        ] as const) {
            const field = firstAlias(source, aliases);
            if (field.present)
                snapshot[canonical] = field.value;
        }
        return { settings: snapshot, runtimeTokenAuthored };
    }
    finally {
        active.delete(source);
    }
}
function snapshotSettingsSource(settings: unknown, sink?: ProviderSchemaWarningSink): SettingsSourceSnapshot {
    const source = isRecord(settings) ? settings : {};
    if (source !== settings) {
        warn(sink, '[LiveTranslator][Config] settings.jsonc should contain an object. Using default settings.');
    }
    const active = new Set<object>([source]);
    try {
        const snapshot: PropertyBag = {};
        let translationSnapshot: SettingsSourceSnapshot | null = null;
        for (const key of Object.keys(source)) {
            if (key === 'translation') {
                const translation = source[key];
                if (!isRecord(translation)) {
                    warn(sink, '[LiveTranslator][Config] settings.jsonc "translation" should be an object. Using defaults.');
                    translationSnapshot = { settings: {}, runtimeTokenAuthored: false };
                    snapshot[key] = translationSnapshot.settings;
                    continue;
                }
                translationSnapshot = snapshotTranslationSettings(translation, active);
                snapshot[key] = translationSnapshot.settings;
            }
            else {
                Object.defineProperty(snapshot, key, {
                    configurable: true,
                    enumerable: true,
                    value: snapshotJson(source[key], active),
                    writable: true,
                });
            }
        }
        if (!translationSnapshot) {
            translationSnapshot = { settings: {}, runtimeTokenAuthored: false };
            snapshot['translation'] = translationSnapshot.settings;
        }
        return {
            settings: snapshot,
            runtimeTokenAuthored: translationSnapshot.runtimeTokenAuthored,
        };
    }
    finally {
        active.delete(source);
    }
}
function freezeSnapshot(value: unknown): unknown {
    if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value))
            freezeSnapshot((value as PropertyBag)[key]);
        Object.freeze(value);
    }
    return value;
}
function warn(sink: ProviderSchemaWarningSink | undefined, message: string): void {
    if (sink)
        sink.warn(message);
}
function normalizePositiveIntegerAliases(settings: PropertyBag, canonicalKey: string, aliases: readonly string[], path: string, fallback: number, sink?: ProviderSchemaWarningSink, maximum = Number.POSITIVE_INFINITY): void {
    const field = firstAlias(settings, aliases);
    if (!field.present) {
        settings[canonicalKey] = fallback;
    }
    else {
        const numeric = numericValue(field.value);
        if (numeric !== null && Number.isInteger(numeric) && numeric > 0) {
            settings[canonicalKey] = Math.min(numeric, maximum);
        }
        else {
            warn(sink, `[LiveTranslator][Config] settings.jsonc "${path}" should be a positive integer. Falling back to ${String(fallback)}.`);
            settings[canonicalKey] = fallback;
        }
    }
    for (const alias of aliases) {
        if (alias !== canonicalKey)
            Reflect.deleteProperty(settings, alias);
    }
}
function normalizeTokenSetting(translation: PropertyBag, sink?: ProviderSchemaWarningSink): boolean {
    let token: number | null = null;
    let invalid = false;
    let authored = false;
    for (const alias of ['maxOutputTokens', 'max_output_tokens']) {
        const field = ownField(translation, alias);
        if (!field.present)
            continue;
        authored = true;
        const numeric = numericValue(field.value);
        if (numeric === null || !Number.isInteger(numeric) || numeric <= 0) {
            invalid = true;
            break;
        }
        if (token !== null && token !== numeric) {
            warn(sink, '[LiveTranslator][Config] settings.jsonc "translation.maxOutputTokens" conflicts with "translation.max_output_tokens". Using maxOutputTokens.');
            break;
        }
        token = numeric;
    }
    if (invalid) {
        warn(sink, '[LiveTranslator][Config] settings.jsonc "translation.maxOutputTokens" should be a positive integer. Falling back to 512.');
        token = DEFAULT_LOCAL_MAX_OUTPUT_TOKENS;
    }
    translation['maxOutputTokens'] = token ?? DEFAULT_LOCAL_MAX_OUTPUT_TOKENS;
    Reflect.deleteProperty(translation, 'max_output_tokens');
    return authored;
}
function ensureSettingsRecord(settings: PropertyBag, key: string, path: string, sink?: ProviderSchemaWarningSink): PropertyBag {
    const field = ownField(settings, key);
    if (!field.present) {
        const record: PropertyBag = {};
        settings[key] = record;
        return record;
    }
    if (isRecord(field.value))
        return field.value;
    warn(sink, `[LiveTranslator][Config] settings.jsonc "${path}" should be an object. Using defaults.`);
    const record: PropertyBag = {};
    settings[key] = record;
    return record;
}
interface NormalizedSettingsDraft {
    readonly settings: PropertyBag;
    readonly runtimeTokenAuthored: boolean;
}
function normalizeTargets(settings: PropertyBag, sink?: ProviderSchemaWarningSink): void {
    const targetsField = ownField(settings, 'targets');
    let rejectCounterLike = false;
    if (targetsField.present) {
        if (!isRecord(targetsField.value)) {
            warn(sink, '[LiveTranslator][Config] settings.jsonc "targets" should be an object. Using defaults.');
        }
        else {
            const rejectField = ownField(targetsField.value, 'rejectCounterLike');
            const rejectValue = rejectField.value;
            if (rejectField.present) {
                if (typeof rejectValue === 'boolean')
                    rejectCounterLike = rejectValue;
                else {
                    warn(sink, '[LiveTranslator][Config] settings.jsonc "targets.rejectCounterLike" should be a boolean. Falling back to false.');
                }
            }
        }
    }
    settings['targets'] = { rejectCounterLike };
}
function normalizeAdapters(settings: PropertyBag, sink?: ProviderSchemaWarningSink): void {
    const field = ownField(settings, 'adapters');
    if (field.present && !isRecord(field.value))
        warn(sink, '[LiveTranslator][Config] settings.jsonc "adapters" should be an object. Using enabled defaults.');
    const source = isRecord(field.value) ? field.value : {};
    const adapters: PropertyBag = {};
    for (const key of ['window', 'gameMessage']) {
        const option = ownField(source, key);
        if (option.present && typeof option.value !== 'boolean')
            warn(sink, `[LiveTranslator][Config] settings.jsonc "adapters.${key}" should be a boolean. Falling back to true.`);
        adapters[key] = typeof option.value === 'boolean' ? option.value : true;
    }
    settings['adapters'] = adapters;
}
function normalizeSettingsMutable(settings: unknown, sink?: ProviderSchemaWarningSink): NormalizedSettingsDraft {
    const sourceSnapshot = snapshotSettingsSource(settings, sink);
    const snapshot = sourceSnapshot.settings;
    for (const inactiveNamespace of ['gui', 'display', 'diagnostics', 'intel']) {
        Reflect.deleteProperty(snapshot, inactiveNamespace);
    }
    const hacks = ensureSettingsRecord(snapshot, 'hacks', 'hacks', sink);
    Reflect.deleteProperty(hacks, 'originAwareLineBreaks');
    const instantReveal = ownField(hacks, 'instantReveal');
    if (instantReveal.present && typeof instantReveal.value !== 'boolean')
        warn(sink, '[LiveTranslator][Config] settings.jsonc "hacks.instantReveal" should be a boolean. Falling back to false.');
    hacks['instantReveal'] = instantReveal.value === true;
    const keepFastForwardAvailable = ownField(hacks, 'keepFastForwardAvailable');
    if (keepFastForwardAvailable.present && typeof keepFastForwardAvailable.value !== 'boolean')
        warn(sink, '[LiveTranslator][Config] settings.jsonc "hacks.keepFastForwardAvailable" should be a boolean. Falling back to false.');
    hacks['keepFastForwardAvailable'] = keepFastForwardAvailable.value === true;
    const multiplier = ownField(hacks, 'fastForwardMultiplier');
    const resolvedMultiplier = resolveSpeedupMultiplier(multiplier.value);
    if (multiplier.present && multiplier.value !== resolvedMultiplier)
        warn(sink, `[LiveTranslator][Config] settings.jsonc "hacks.fastForwardMultiplier" should be a finite number from 1 to ${String(MAX_SPEEDUP_MULTIPLIER)}. Falling back to ${String(DEFAULT_SPEEDUP_MULTIPLIER)}.`);
    hacks['fastForwardMultiplier'] = resolvedMultiplier;
    ensureSettingsRecord(snapshot, 'manipulation', 'manipulation', sink);
    normalizeTargets(snapshot, sink);
    normalizeAdapters(snapshot, sink);
    const translation = ensureSettingsRecord(snapshot, 'translation', 'translation', sink);
    normalizeTokenSetting(translation, sink);
    normalizePositiveIntegerAliases(translation, 'modelCatalogTtlMs', ['modelCatalogTtlMs', 'model_catalog_ttl_ms'], 'translation.modelCatalogTtlMs', DEFAULT_MODEL_CATALOG_TTL_MS, sink);
    normalizePositiveIntegerAliases(translation, 'modelCatalogTimeoutMs', ['modelCatalogTimeoutMs', 'model_catalog_timeout_ms'], 'translation.modelCatalogTimeoutMs', DEFAULT_MODEL_CATALOG_TIMEOUT_MS, sink, MAX_PROVIDER_TIMEOUT_MS);
    normalizePositiveIntegerAliases(translation, 'requestTimeoutMs', ['requestTimeoutMs', 'request_timeout_ms'], 'translation.requestTimeoutMs', DEFAULT_REQUEST_TIMEOUT_MS, sink, MAX_PROVIDER_TIMEOUT_MS);
    return { settings: snapshot, runtimeTokenAuthored: sourceSnapshot.runtimeTokenAuthored };
}
function normalizeProviderFallbackSettings(settings: unknown, provider: Exclude<TranslationProviderName, 'none'>, providerSource: Readonly<PropertyBag>): NormalizedSettingsDraft {
    if (provider === 'mocktranslator')
        return { settings: {}, runtimeTokenAuthored: false };
    const settingsSource = isRecord(settings) ? settings : {};
    const translationField = ownField(settingsSource, 'translation');
    let source: PropertyBag = {};
    if (translationField.present) {
        if (isRecord(translationField.value))
            source = translationField.value;
    }
    const translation: PropertyBag = {};
    const primaryToken = ownField(source, 'maxOutputTokens');
    let runtimeTokenAuthored = primaryToken.present;
    if (primaryToken.present) {
        translation['maxOutputTokens'] = primaryToken.value;
        const numeric = numericValue(primaryToken.value);
        if (numeric !== null && Number.isInteger(numeric) && numeric > 0) {
            const legacyToken = ownField(source, 'max_output_tokens');
            if (legacyToken.present)
                translation['max_output_tokens'] = legacyToken.value;
        }
    }
    else {
        const legacyToken = ownField(source, 'max_output_tokens');
        runtimeTokenAuthored = legacyToken.present;
        if (legacyToken.present)
            translation['max_output_tokens'] = legacyToken.value;
    }
    for (const [canonical, providerKey, aliases] of [
        ['modelCatalogTtlMs', 'model_catalog_ttl_ms', ['modelCatalogTtlMs', 'model_catalog_ttl_ms']],
        ['modelCatalogTimeoutMs', 'model_catalog_timeout_ms', ['modelCatalogTimeoutMs', 'model_catalog_timeout_ms']],
    ] as const) {
        if (hasOwn(providerSource, providerKey))
            continue;
        const field = firstAlias(source, aliases);
        if (field.present)
            translation[canonical] = field.value;
    }
    normalizeTokenSetting(translation);
    normalizePositiveIntegerAliases(translation, 'modelCatalogTtlMs', ['modelCatalogTtlMs', 'model_catalog_ttl_ms'], 'translation.modelCatalogTtlMs', DEFAULT_MODEL_CATALOG_TTL_MS);
    normalizePositiveIntegerAliases(translation, 'modelCatalogTimeoutMs', ['modelCatalogTimeoutMs', 'model_catalog_timeout_ms'], 'translation.modelCatalogTimeoutMs', DEFAULT_MODEL_CATALOG_TIMEOUT_MS, undefined, MAX_PROVIDER_TIMEOUT_MS);
    if (!hasOwn(providerSource, 'request_timeout_ms')) {
        const requestTimeout = firstAlias(source, ['requestTimeoutMs', 'request_timeout_ms']);
        if (requestTimeout.present)
            translation['requestTimeoutMs'] = requestTimeout.value;
    }
    normalizePositiveIntegerAliases(translation, 'requestTimeoutMs', ['requestTimeoutMs', 'request_timeout_ms'], 'translation.requestTimeoutMs', DEFAULT_REQUEST_TIMEOUT_MS, undefined, MAX_PROVIDER_TIMEOUT_MS);
    return {
        settings: { translation },
        runtimeTokenAuthored,
    };
}
function translationSettings(settings: PropertyBag): PropertyBag | null {
    const field = ownField(settings, 'translation');
    if (!field.present)
        return null;
    if (isRecord(field.value))
        return field.value;
    return null;
}
function resolveMaxOutputTokens(source: PropertyBag, settings: PropertyBag, runtimeTokenAuthored: boolean): number {
    if (runtimeTokenAuthored) {
        const runtimeValue = consistentPositiveIntegerAliases(translationSettings(settings), ['maxOutputTokens', 'max_output_tokens'], 'settings.jsonc.translation');
        if (runtimeValue.present)
            return runtimeValue.value as number;
    }
    const providerValue = consistentPositiveIntegerAliases(source, ['max_output_tokens', 'maxOutputTokens', 'max_tokens', 'maxTokens'], 'translator.jsonc provider settings');
    if (providerValue.present)
        return providerValue.value as number;
    const translation = translationSettings(settings);
    return translation
        ? positiveInteger(ownField(translation, 'maxOutputTokens'), 'settings.jsonc.translation.maxOutputTokens', DEFAULT_LOCAL_MAX_OUTPUT_TOKENS)
        : DEFAULT_LOCAL_MAX_OUTPUT_TOKENS;
}
function resolveRuntimePositiveInteger(source: PropertyBag, sourceAliases: readonly string[], settings: PropertyBag, settingsAliases: readonly string[], path: string, fallback: number, maximum = Number.POSITIVE_INFINITY): number {
    const sourceField = firstAlias(source, sourceAliases);
    if (sourceField.present)
        return Math.min(positiveInteger(sourceField, path, fallback), maximum);
    const translation = translationSettings(settings);
    const settingsField = translation ? firstAlias(translation, settingsAliases) : { present: false, value: undefined };
    return Math.min(positiveInteger(settingsField, path, fallback), maximum);
}
function normalizeLmStudioSource(source: PropertyBag, settings: PropertyBag, runtimeTokenAuthored: boolean, required?: RequiredProviderFields): LmStudioConfig {
    const model = required?.model ?? requiredNonemptyString(ownField(source, 'model'), 'settings.lmstudio.model');
    return Object.freeze({
        address: optionalString(firstAlias(source, ['address', 'Address']), 'settings.lmstudio.address', '127.0.0.1'),
        port: positiveInteger(firstAlias(source, ['port', 'Port']), 'settings.lmstudio.port', 1234),
        api_key: optionalString(firstAlias(source, ['api_key', 'apiKey']), 'settings.lmstudio.api_key', ''),
        model,
        system_prompt: optionalString(firstAlias(source, ['system_prompt', 'systemPrompt', 'SystemPrompt']), 'settings.lmstudio.system_prompt', '', false),
        temperature: finiteNumber(firstAlias(source, ['temperature', 'Temperature']), 'settings.lmstudio.temperature', 0.2),
        top_k: optionalFiniteNumber(firstAlias(source, ['top_k', 'TopK']), 'settings.lmstudio.top_k'),
        repeat_penalty: optionalFiniteNumber(firstAlias(source, ['repeat_penalty', 'repeatPenalty', 'repetition_penalty']), 'settings.lmstudio.repeat_penalty'),
        min_p: optionalFiniteNumber(firstAlias(source, ['min_p', 'MinP']), 'settings.lmstudio.min_p'),
        top_p: finiteNumber(firstAlias(source, ['top_p', 'TopP']), 'settings.lmstudio.top_p', 0.95),
        max_output_tokens: resolveMaxOutputTokens(source, settings, runtimeTokenAuthored),
        model_catalog_ttl_ms: resolveRuntimePositiveInteger(source, ['model_catalog_ttl_ms', 'modelCatalogTtlMs'], settings, ['modelCatalogTtlMs', 'model_catalog_ttl_ms'], 'settings.lmstudio.model_catalog_ttl_ms', DEFAULT_MODEL_CATALOG_TTL_MS),
        model_catalog_timeout_ms: resolveRuntimePositiveInteger(source, ['model_catalog_timeout_ms', 'modelCatalogTimeoutMs'], settings, ['modelCatalogTimeoutMs', 'model_catalog_timeout_ms'], 'settings.lmstudio.model_catalog_timeout_ms', DEFAULT_MODEL_CATALOG_TIMEOUT_MS, MAX_PROVIDER_TIMEOUT_MS),
        request_timeout_ms: resolveRuntimePositiveInteger(source, ['request_timeout_ms', 'requestTimeoutMs'], settings, ['requestTimeoutMs', 'request_timeout_ms'], 'settings.lmstudio.request_timeout_ms', DEFAULT_REQUEST_TIMEOUT_MS, MAX_PROVIDER_TIMEOUT_MS),
    });
}
function normalizeLlamaCppSource(source: PropertyBag, settings: PropertyBag, runtimeTokenAuthored: boolean, required?: RequiredProviderFields): LlamaCppConfig {
    const model = required?.model ?? requiredNonemptyString(ownField(source, 'model'), 'settings.llamacpp.model');
    const baseUrl = optionalString(firstAlias(source, ['base_url', 'baseUrl', 'BaseUrl']), 'settings.llamacpp.base_url', 'http://127.0.0.1:8080').replace(/\/+$/u, '');
    if (!/^https?:\/\//iu.test(baseUrl)) {
        throw new Error('translator.jsonc has invalid "settings.llamacpp.base_url" (must use http:// or https://).');
    }
    return Object.freeze({
        base_url: baseUrl,
        api_key: optionalString(firstAlias(source, ['api_key', 'apiKey']), 'settings.llamacpp.api_key', ''),
        model,
        system_prompt: optionalString(firstAlias(source, ['system_prompt', 'systemPrompt', 'SystemPrompt']), 'settings.llamacpp.system_prompt', '', false),
        temperature: finiteNumber(firstAlias(source, ['temperature', 'Temperature']), 'settings.llamacpp.temperature', 0.2),
        top_k: optionalFiniteNumber(firstAlias(source, ['top_k', 'TopK']), 'settings.llamacpp.top_k'),
        repeat_penalty: optionalFiniteNumber(firstAlias(source, ['repeat_penalty', 'repeatPenalty', 'repetition_penalty']), 'settings.llamacpp.repeat_penalty'),
        min_p: optionalFiniteNumber(firstAlias(source, ['min_p', 'MinP']), 'settings.llamacpp.min_p'),
        top_p: finiteNumber(firstAlias(source, ['top_p', 'TopP']), 'settings.llamacpp.top_p', 0.95),
        max_output_tokens: resolveMaxOutputTokens(source, settings, runtimeTokenAuthored),
        model_catalog_ttl_ms: resolveRuntimePositiveInteger(source, ['model_catalog_ttl_ms', 'modelCatalogTtlMs'], settings, ['modelCatalogTtlMs', 'model_catalog_ttl_ms'], 'settings.llamacpp.model_catalog_ttl_ms', DEFAULT_MODEL_CATALOG_TTL_MS),
        model_catalog_timeout_ms: resolveRuntimePositiveInteger(source, ['model_catalog_timeout_ms', 'modelCatalogTimeoutMs'], settings, ['modelCatalogTimeoutMs', 'model_catalog_timeout_ms'], 'settings.llamacpp.model_catalog_timeout_ms', DEFAULT_MODEL_CATALOG_TIMEOUT_MS, MAX_PROVIDER_TIMEOUT_MS),
        request_timeout_ms: resolveRuntimePositiveInteger(source, ['request_timeout_ms', 'requestTimeoutMs'], settings, ['requestTimeoutMs', 'request_timeout_ms'], 'settings.llamacpp.request_timeout_ms', DEFAULT_REQUEST_TIMEOUT_MS, MAX_PROVIDER_TIMEOUT_MS),
    });
}
function normalizeLlamafileSource(source: PropertyBag, settings: PropertyBag, runtimeTokenAuthored: boolean): LlamafileConfig {
    return Object.freeze({
        profile: selectLlamafileProfile(ownField(source, 'profile').value).id,
        system_prompt: optionalString(firstAlias(source, ['system_prompt', 'systemPrompt', 'SystemPrompt']), 'settings.llamafile.system_prompt', '', false),
        max_output_tokens: resolveMaxOutputTokens(source, settings, runtimeTokenAuthored),
        request_timeout_ms: resolveRuntimePositiveInteger(source, ['request_timeout_ms', 'requestTimeoutMs'], settings, ['requestTimeoutMs', 'request_timeout_ms'], 'settings.llamafile.request_timeout_ms', DEFAULT_REQUEST_TIMEOUT_MS, MAX_PROVIDER_TIMEOUT_MS),
    });
}
function normalizeMockSource(source: PropertyBag): MockTranslatorConfig {
    const randomized = ownField(source, 'useRandomizedStrings');
    if (randomized.present && typeof randomized.value !== 'boolean') {
        throw new Error('translator.jsonc has invalid "settings.mockTranslator.useRandomizedStrings" (must be a boolean).');
    }
    return Object.freeze({
        capacity: positiveInteger(ownField(source, 'capacity'), 'settings.mockTranslator.capacity', 32),
        delayMs: nonNegativeInteger(ownField(source, 'delayMs'), 'settings.mockTranslator.delayMs', 100),
        useRandomizedStrings: randomized.present ? (randomized.value as boolean) : false,
    });
}
function parseProviderName(value: unknown): TranslationProviderName {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('[LiveTranslator][Config] translator.jsonc missing required "provider" string (lmstudio/llamacpp/llamafile/mockTranslator/none).');
    }
    const provider = value.trim().toLowerCase();
    if (provider === 'llamafile' ||
        provider === 'llamacpp' ||
        provider === 'lmstudio' ||
        provider === 'mocktranslator' ||
        provider === 'none') {
        return provider;
    }
    throw new Error(`[LiveTranslator][Config] translator.jsonc contains unsupported provider "${provider}".`);
}
export function normalizeProviderName(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : '';
}
function providerSettingsKey(provider: TranslationProviderName): string {
    if (provider === 'mocktranslator')
        return 'mockTranslator';
    return provider;
}
function selectProviderSource(rootConfig: unknown, providerOverride: unknown, requireRootShape: boolean): SelectedProviderSource {
    const root = requiredRecord(rootConfig, '[LiveTranslator][Config] translator.jsonc missing or invalid.');
    const provider = providerOverride === undefined
        ? parseProviderName(ownField(root, 'provider').value)
        : parseProviderName(providerOverride);
    if (provider === 'none')
        return { provider, source: {} };
    const settingsField = ownField(root, 'settings');
    if (settingsField.present || requireRootShape) {
        const settings = requiredRecord(settingsField.value, '[LiveTranslator][Config] translator.jsonc missing required "settings" object.');
        const key = providerSettingsKey(provider);
        const sourceField = ownField(settings, key);
        if (!sourceField.present && (provider === 'llamafile' || provider === 'mocktranslator')) {
            return { provider, source: {} };
        }
        return {
            provider,
            source: requiredRecord(sourceField.value, `[LiveTranslator][Config] translator.jsonc missing "settings.${key}" object for ${provider} provider.`),
        };
    }
    const key = providerSettingsKey(provider);
    const nestedField = ownField(root, key);
    if (nestedField.present) {
        return { provider, source: requiredRecord(nestedField.value, `translator.jsonc has invalid "${key}" object.`) };
    }
    return { provider, source: root };
}
function captureRequiredProviderFields(selected: SelectedProviderSource): RequiredProviderFields {
    if (selected.provider === 'lmstudio') {
        return {
            model: requiredNonemptyString(ownField(selected.source, 'model'), 'settings.lmstudio.model'),
        };
    }
    if (selected.provider === 'llamacpp') {
        return {
            model: requiredNonemptyString(ownField(selected.source, 'model'), 'settings.llamacpp.model'),
        };
    }
    return {};
}
function stageAlias(target: PropertyBag, source: PropertyBag, canonicalKey: string, aliases: readonly string[]): void {
    const field = firstAlias(source, aliases);
    if (field.present)
        target[canonicalKey] = field.value;
}
function captureTokenFields(source: PropertyBag): readonly CapturedField[] {
    return Object.freeze(['max_output_tokens', 'maxOutputTokens', 'max_tokens', 'maxTokens'].map((alias) => captureField(source, alias)));
}
function stageTokenAliases(target: PropertyBag, fields: readonly CapturedField[]): void {
    let selected: number | null = null;
    for (const capturedField of fields) {
        if (!capturedField.present)
            continue;
        const field = capturedField.read();
        target[capturedField.alias] = field.value;
        const numeric = positiveInteger(field, `translator.jsonc provider settings.${capturedField.alias}`, 0);
        if (selected !== null && selected !== numeric) {
            throw new Error('Configuration contains conflicting token aliases at "translator.jsonc provider settings".');
        }
        selected = numeric;
    }
    if (selected !== null)
        target['max_output_tokens'] = selected;
}
function stageProviderSource(selected: SelectedProviderSource, required: RequiredProviderFields): StagedProviderSource {
    const source = selected.source;
    const staged: PropertyBag = {};
    let tokenFields: readonly CapturedField[] = Object.freeze([]);
    if (selected.provider === 'lmstudio') {
        stageAlias(staged, source, 'api_key', ['api_key', 'apiKey']);
        staged['model'] = required.model;
        stageAlias(staged, source, 'address', ['address', 'Address']);
        stageAlias(staged, source, 'port', ['port', 'Port']);
        stageAlias(staged, source, 'system_prompt', ['system_prompt', 'systemPrompt', 'SystemPrompt']);
        stageAlias(staged, source, 'temperature', ['temperature', 'Temperature']);
        stageAlias(staged, source, 'top_k', ['top_k', 'TopK']);
        stageAlias(staged, source, 'repeat_penalty', ['repeat_penalty', 'repeatPenalty', 'repetition_penalty']);
        stageAlias(staged, source, 'min_p', ['min_p', 'MinP']);
        stageAlias(staged, source, 'top_p', ['top_p', 'TopP']);
        tokenFields = captureTokenFields(source);
        stageAlias(staged, source, 'model_catalog_ttl_ms', ['model_catalog_ttl_ms', 'modelCatalogTtlMs']);
        stageAlias(staged, source, 'model_catalog_timeout_ms', ['model_catalog_timeout_ms', 'modelCatalogTimeoutMs']);
        stageAlias(staged, source, 'request_timeout_ms', ['request_timeout_ms', 'requestTimeoutMs']);
    }
    else if (selected.provider === 'llamacpp') {
        staged['model'] = required.model;
        stageAlias(staged, source, 'base_url', ['base_url', 'baseUrl', 'BaseUrl']);
        stageAlias(staged, source, 'api_key', ['api_key', 'apiKey']);
        stageAlias(staged, source, 'system_prompt', ['system_prompt', 'systemPrompt', 'SystemPrompt']);
        stageAlias(staged, source, 'temperature', ['temperature', 'Temperature']);
        stageAlias(staged, source, 'top_k', ['top_k', 'TopK']);
        stageAlias(staged, source, 'repeat_penalty', ['repeat_penalty', 'repeatPenalty', 'repetition_penalty']);
        stageAlias(staged, source, 'min_p', ['min_p', 'MinP']);
        stageAlias(staged, source, 'top_p', ['top_p', 'TopP']);
        tokenFields = captureTokenFields(source);
        stageAlias(staged, source, 'model_catalog_ttl_ms', ['model_catalog_ttl_ms', 'modelCatalogTtlMs']);
        stageAlias(staged, source, 'model_catalog_timeout_ms', ['model_catalog_timeout_ms', 'modelCatalogTimeoutMs']);
        stageAlias(staged, source, 'request_timeout_ms', ['request_timeout_ms', 'requestTimeoutMs']);
    }
    else if (selected.provider === 'llamafile') {
        stageAlias(staged, source, 'profile', ['profile']);
        stageAlias(staged, source, 'system_prompt', ['system_prompt', 'systemPrompt', 'SystemPrompt']);
        tokenFields = captureTokenFields(source);
        stageAlias(staged, source, 'request_timeout_ms', ['request_timeout_ms', 'requestTimeoutMs']);
    }
    else if (selected.provider === 'mocktranslator') {
        stageAlias(staged, source, 'capacity', ['capacity']);
        stageAlias(staged, source, 'delayMs', ['delayMs']);
        stageAlias(staged, source, 'useRandomizedStrings', ['useRandomizedStrings']);
    }
    return Object.freeze({
        source: Object.freeze(staged),
        tokenFields,
    });
}
function materializeProviderSource(staged: StagedProviderSource, runtimeTokenAuthored: boolean): PropertyBag {
    if (runtimeTokenAuthored)
        return staged.source;
    let hasToken = false;
    for (const field of staged.tokenFields) {
        if (field.present) {
            hasToken = true;
            break;
        }
    }
    if (!hasToken)
        return staged.source;
    const source: PropertyBag = {};
    for (const key of Object.keys(staged.source))
        source[key] = staged.source[key];
    stageTokenAliases(source, staged.tokenFields);
    return Object.freeze(source);
}
function normalizeSelectedProvider(provider: TranslationProviderName, source: PropertyBag, settings: PropertyBag, runtimeTokenAuthored: boolean, required?: RequiredProviderFields): NormalizedProviderConfig {
    if (provider === 'lmstudio')
        return normalizeLmStudioSource(source, settings, runtimeTokenAuthored, required);
    if (provider === 'llamacpp')
        return normalizeLlamaCppSource(source, settings, runtimeTokenAuthored, required);
    if (provider === 'llamafile')
        return normalizeLlamafileSource(source, settings, runtimeTokenAuthored);
    if (provider === 'mocktranslator')
        return normalizeMockSource(source);
    return Object.freeze({});
}
export function normalizeProviderSelection(rootConfig: unknown, acquireSettings: () => unknown, providerOverride?: unknown, sink?: ProviderSchemaWarningSink): NormalizedProviderSelection {
    if (isRecord(rootConfig)) {
        const issued = issuedProviderSelections.get(rootConfig);
        if (issued && (providerOverride === undefined || parseProviderName(providerOverride) === issued.provider)) {
            return issued;
        }
    }
    const selected = selectProviderSource(rootConfig, providerOverride, true);
    const required = captureRequiredProviderFields(selected);
    const stagedSource = stageProviderSource(selected, required);
    const settingsDraft = normalizeSettingsMutable(acquireSettings(), sink);
    const providerSource = materializeProviderSource(stagedSource, settingsDraft.runtimeTokenAuthored);
    const providerConfig = normalizeSelectedProvider(selected.provider, providerSource, settingsDraft.settings, settingsDraft.runtimeTokenAuthored, required);
    if (selected.provider === 'lmstudio' || selected.provider === 'llamacpp' || selected.provider === 'llamafile') {
        const translation = translationSettings(settingsDraft.settings);
        if (translation) {
            translation['maxOutputTokens'] = (providerConfig as LmStudioConfig | LlamaCppConfig | LlamafileConfig).max_output_tokens;
        }
    }
    const normalizedSettings = freezeSnapshot(settingsDraft.settings) as Readonly<PropertyBag>;
    const providerSettings = selected.provider === 'none'
        ? Object.freeze({})
        : Object.freeze({
            [providerSettingsKey(selected.provider)]: providerConfig,
        });
    const translatorConfig = Object.freeze({
        provider: selected.provider,
        settings: providerSettings,
    });
    const normalizedSelection = Object.freeze({
        provider: selected.provider,
        providerConfig,
        settings: normalizedSettings,
        translatorConfig,
    });
    issuedProviderSelections.set(translatorConfig, normalizedSelection);
    return normalizedSelection;
}
function normalizeDirectProvider(provider: Exclude<TranslationProviderName, 'none'>, rootConfig: unknown, settings: unknown): NormalizedProviderConfig {
    if (isRecord(rootConfig)) {
        const issued = issuedProviderSelections.get(rootConfig);
        if (issued?.provider === provider)
            return issued.providerConfig;
    }
    const selected = selectProviderSource(rootConfig, provider, false);
    const required = captureRequiredProviderFields(selected);
    const stagedSource = stageProviderSource(selected, required);
    const settingsDraft = normalizeProviderFallbackSettings(settings, provider, stagedSource.source);
    const providerSource = materializeProviderSource(stagedSource, settingsDraft.runtimeTokenAuthored);
    return normalizeSelectedProvider(provider, providerSource, settingsDraft.settings, settingsDraft.runtimeTokenAuthored, required);
}
export function normalizeLmStudioConfig(rootConfig: unknown = {}, settings: unknown = {}): LmStudioConfig {
    return normalizeDirectProvider('lmstudio', rootConfig, settings) as LmStudioConfig;
}
export function normalizeLlamaCppConfig(rootConfig: unknown = {}, settings: unknown = {}): LlamaCppConfig {
    return normalizeDirectProvider('llamacpp', rootConfig, settings) as LlamaCppConfig;
}
export function normalizeLlamafileConfig(rootConfig: unknown = {}, settings: unknown = {}): LlamafileConfig {
    return normalizeDirectProvider('llamafile', rootConfig, settings) as LlamafileConfig;
}
export function normalizeMockTranslatorConfig(rootConfig: unknown = {}): MockTranslatorConfig {
    return normalizeDirectProvider('mocktranslator', rootConfig, {}) as MockTranslatorConfig;
}
