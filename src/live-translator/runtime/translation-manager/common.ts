import { createDisabledTranslationProvider } from '../translation-providers/disabled.js';
import { formatTranslationObservationError } from '../translation-diagnostics-port.js';
type StringCoercionCandidate = string | number | boolean | bigint | symbol | null | undefined;
type FalsyStringCoercionCandidate = string | number | boolean | bigint | symbol;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object;
type RuntimeFunction = (...args: unknown[]) => unknown;
type PropertyBag = Record<PropertyKey, unknown>;
interface ConstantsCandidate {
    readonly DEFAULT_PRIORITY: unknown;
    readonly HOOK_PRIORITIES: unknown;
    readonly MAX_PRIORITY: unknown;
    readonly MIN_PRIORITY: unknown;
}
interface LoggerCandidate {
    readonly debug?: unknown;
    readonly info?: unknown;
    readonly warn?: unknown;
    readonly error?: unknown;
}
interface TelemetryCandidate {
    readonly logTranslation?: unknown;
}
interface SettingsCandidate {
    readonly translation?: unknown;
}
interface ProviderCandidate {
    readonly capabilities?: unknown;
}
interface ProviderCapabilitiesCandidate {
    readonly streaming?: unknown;
    readonly tracksAvailability?: unknown;
    readonly requiresVerifiedCapacity?: unknown;
}
interface TextProcessorCandidate {
    readonly translateTextStream?: unknown;
    readonly translateText?: unknown;
    readonly translateMany?: unknown;
}
interface TranslationRequestCandidate {
    readonly stream?: unknown;
    readonly text?: unknown;
}
interface CoercibleTranslationRequestCandidate extends TranslationRequestCandidate {
    readonly text?: StringCoercionCandidate;
}
export interface BoundTranslationLogger {
    readonly debug: RuntimeFunction;
    readonly info: RuntimeFunction;
    readonly warn: RuntimeFunction;
    readonly error: RuntimeFunction;
}
export interface BoundTranslationTelemetry {
    readonly logTranslation: RuntimeFunction;
}
export interface TranslationProviderCapabilities {
    readonly streaming: boolean;
    readonly tracksAvailability: boolean;
    readonly requiresVerifiedCapacity: boolean;
}
export interface TranslationProviderAdapter {
    readonly kind: 'legacy' | 'lmstudio' | 'none';
    readonly capabilities: Readonly<TranslationProviderCapabilities>;
    getCapacity(): Promise<number>;
    translate(request?: unknown): Promise<unknown>;
}
export interface TranslationManagerCommonModule {
    noop(): void;
    defaultPreview(text: unknown, max?: unknown): string;
    bindLogger(logger?: unknown): BoundTranslationLogger;
    formatError(error: unknown): string;
    ensureTelemetry(telemetry: unknown): BoundTranslationTelemetry;
    clampPriority(value: unknown): unknown;
    defaultPriorityForHook(hook: unknown): unknown;
    getPositiveSetting(settings: unknown, names: unknown, fallback: unknown): unknown;
    normalizeProviderCapabilities(provider: unknown): Readonly<TranslationProviderCapabilities>;
    createTextProcessorProvider(textProcessor: unknown, isLocalProvider: unknown): TranslationProviderAdapter;
    createNoneProvider(): TranslationProviderAdapter;
}
export function createTranslationManagerCommonModule(constants: unknown): TranslationManagerCommonModule {
    const { DEFAULT_PRIORITY, HOOK_PRIORITIES, MAX_PRIORITY, MIN_PRIORITY } = constants as ConstantsCandidate;
    const NON_STREAMING_PROVIDER_CAPABILITIES = Object.freeze({
        streaming: false,
        tracksAvailability: false,
        requiresVerifiedCapacity: false,
    });
    const STREAMING_PROVIDER_CAPABILITIES = Object.freeze({
        streaming: true,
        tracksAvailability: false,
        requiresVerifiedCapacity: false,
    });
    function noop(): void {
        return;
    }
    function formatError(error: unknown): string {
        return formatTranslationObservationError(error);
    }
    function normalizePreviewMaximum(maximum: unknown): number {
        const numericMaximum = Number(maximum);
        if (!Number.isFinite(numericMaximum) || numericMaximum <= 0)
            return 0;
        return Math.floor(numericMaximum);
    }
    function defaultPreview(text: unknown, max: unknown = 48): string {
        const stringText = (text ?? '') as StringCoercionCandidate;
        const value = String(stringText).replace(/\s+/g, ' ').trim();
        const maximum = normalizePreviewMaximum(max);
        if (value.length <= maximum)
            return value;
        const omission = '...'.slice(0, maximum);
        return maximum <= omission.length ? omission : `${value.slice(0, maximum - omission.length)}${omission}`;
    }
    function bindLogger(logger: unknown = {}): BoundTranslationLogger {
        const candidate = logger as LoggerCandidate;
        const bindMethod = (method: unknown): RuntimeFunction => typeof method === 'function' ? (method as RuntimeFunction).bind(logger) : noop;
        return {
            debug: bindMethod(candidate.debug),
            info: bindMethod(candidate.info),
            warn: bindMethod(candidate.warn),
            error: bindMethod(candidate.error),
        };
    }
    function ensureTelemetry(telemetry: unknown): BoundTranslationTelemetry {
        const telemetryValue = telemetry as FalsySensitiveValue;
        const candidate = telemetry as TelemetryCandidate;
        const logTranslation = telemetryValue ? candidate.logTranslation : null;
        return {
            logTranslation: typeof logTranslation === 'function' ? (logTranslation as RuntimeFunction).bind(telemetry) : noop,
        };
    }
    function clampPriority(value: unknown): unknown {
        const numeric = Number(value);
        if (!Number.isFinite(numeric))
            return DEFAULT_PRIORITY;
        return Math.max(MIN_PRIORITY as number, Math.min(MAX_PRIORITY as number, Math.round(numeric)));
    }
    function defaultPriorityForHook(hook: unknown): unknown {
        const stringHook = hook as FalsyStringCoercionCandidate;
        const key = String(stringHook || '').trim();
        const priorities = HOOK_PRIORITIES as PropertyBag;
        if (Object.prototype.hasOwnProperty.call(HOOK_PRIORITIES, key))
            return priorities[key];
        return DEFAULT_PRIORITY;
    }
    function getPositiveSetting(settings: unknown, names: unknown, fallback: unknown): unknown {
        const settingsValue = settings as FalsySensitiveValue;
        const settingsCandidate = settings as SettingsCandidate;
        const configuredTranslation = settingsValue ? settingsCandidate.translation : null;
        const translation = configuredTranslation && typeof configuredTranslation === 'object' ? configuredTranslation : {};
        const translationCandidate = translation as PropertyBag;
        for (const name of names as Iterable<unknown>) {
            const key = name as PropertyKey;
            if (Object.prototype.hasOwnProperty.call(translation, key)) {
                const numeric = Number(translationCandidate[key]);
                if (Number.isFinite(numeric) && numeric > 0)
                    return numeric;
            }
        }
        return fallback;
    }
    function normalizeProviderCapabilities(provider: unknown): Readonly<TranslationProviderCapabilities> {
        const providerValue = provider as FalsySensitiveValue;
        const providerCandidate = provider as ProviderCandidate;
        const configuredCapabilities = providerValue ? providerCandidate.capabilities : null;
        const capabilities = configuredCapabilities && typeof configuredCapabilities === 'object' ? configuredCapabilities : null;
        if (!capabilities)
            return NON_STREAMING_PROVIDER_CAPABILITIES;
        const candidate = capabilities as ProviderCapabilitiesCandidate;
        return Object.freeze({
            streaming: candidate.streaming === true,
            tracksAvailability: candidate.tracksAvailability === true,
            requiresVerifiedCapacity: candidate.requiresVerifiedCapacity === true,
        });
    }
    function createTextProcessorProvider(textProcessor: unknown, isLocalProvider: unknown): TranslationProviderAdapter {
        const textProcessorValue = textProcessor as FalsySensitiveValue;
        const textProcessorCandidate = textProcessor as TextProcessorCandidate;
        const streamCandidate = textProcessorValue ? textProcessorCandidate.translateTextStream : null;
        const textCandidate = textProcessorValue ? textProcessorCandidate.translateText : null;
        const manyCandidate = textProcessorValue ? textProcessorCandidate.translateMany : null;
        const translateTextStream = typeof streamCandidate === 'function' ? streamCandidate : null;
        const translateText = typeof textCandidate === 'function' ? textCandidate : null;
        const translateMany = typeof manyCandidate === 'function' ? manyCandidate : null;
        const capabilities = translateTextStream
            ? STREAMING_PROVIDER_CAPABILITIES
            : NON_STREAMING_PROVIDER_CAPABILITIES;
        return {
            kind: isLocalProvider ? 'lmstudio' : 'legacy',
            capabilities,
            async getCapacity() {
                return 1;
            },
            async translate(request: unknown = {}) {
                const requestCandidate = request as TranslationRequestCandidate;
                const coercibleRequest = request as CoercibleTranslationRequestCandidate;
                const text = String(coercibleRequest.text ?? '');
                if (requestCandidate.stream && translateTextStream) {
                    return Reflect.apply(translateTextStream, textProcessor, [text, request]) as unknown;
                }
                if (translateText) {
                    return Reflect.apply(translateText, textProcessor, [text]) as unknown;
                }
                if (translateMany) {
                    const output: unknown = await Reflect.apply(translateMany, textProcessor, [[text]]);
                    const outputValue = output as FalsySensitiveValue;
                    const outputCandidate = output as Record<number, unknown>;
                    const firstOutput = outputValue ? outputCandidate[0] : undefined;
                    return typeof firstOutput === 'string' ? firstOutput : '';
                }
                throw new Error('Translator provider unavailable.');
            },
        };
    }
    function createNoneProvider(): TranslationProviderAdapter {
        return createDisabledTranslationProvider(NON_STREAMING_PROVIDER_CAPABILITIES);
    }
    return {
        noop,
        defaultPreview,
        bindLogger,
        formatError,
        ensureTelemetry,
        clampPriority,
        defaultPriorityForHook,
        getPositiveSetting,
        normalizeProviderCapabilities,
        createTextProcessorProvider,
        createNoneProvider,
    };
}
