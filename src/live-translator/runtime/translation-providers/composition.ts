import { createNoneProvider, type DisabledTranslationProvider } from './disabled.js';
import type { LlamaCppProvider, LlamaCppProviderModule } from './llamacpp/provider.js';
import type { LlamafileProvider, LlamafileProviderModule } from './llamafile/provider.js';
import type { LmStudioProvider, LmStudioProviderModule, LmStudioProviderOptions } from './lmstudio/provider.js';
import type { LmStudioProtocolModule } from './lmstudio/protocol.js';
import type { MockTranslatorProvider, MockTranslatorProviderModule } from './mock/provider.js';
import type { TranslationProviderCommonModule } from './common.js';
type PropertyBag = Record<string, unknown>;
export interface TranslationProviderOptions extends LmStudioProviderOptions {
    readonly provider?: unknown;
    readonly paths?: unknown;
}
export type TranslationProvider = LmStudioProvider | LlamaCppProvider | LlamafileProvider | MockTranslatorProvider | DisabledTranslationProvider;
export interface TranslationProvidersModule {
    createProvider(options?: TranslationProviderOptions): TranslationProvider;
    readonly createLmStudioProvider: LmStudioProviderModule['createLmStudioProvider'];
    readonly createLlamaCppProvider: LlamaCppProviderModule['createLlamaCppProvider'];
    readonly createLlamafileProvider: LlamafileProviderModule['createLlamafileProvider'];
    readonly createMockTranslatorProvider: MockTranslatorProviderModule['createMockTranslatorProvider'];
    readonly createNoneProvider: typeof createNoneProvider;
    readonly normalizeLmStudioConfig: TranslationProviderCommonModule['normalizeLmStudioConfig'];
    readonly normalizeLlamaCppConfig: TranslationProviderCommonModule['normalizeLlamaCppConfig'];
    readonly normalizeLlamafileConfig: TranslationProviderCommonModule['normalizeLlamafileConfig'];
    readonly createLmStudioModelMetadata: LmStudioProtocolModule['createLmStudioModelMetadata'];
    readonly readParallelCapacityDetail: LmStudioProtocolModule['readParallelCapacityDetail'];
    readonly getLoadedLlmInstances: LmStudioProtocolModule['getLoadedLlmInstances'];
    readonly selectLmStudioChatModel: LmStudioProtocolModule['selectLmStudioChatModel'];
    readonly classifyCancellation: TranslationProviderCommonModule['classifyCancellation'];
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function createTranslationProvidersModule(utils: TranslationProviderCommonModule, lmStudioProvider: LmStudioProviderModule, llamaCppProvider: LlamaCppProviderModule, llamafileProvider: LlamafileProviderModule, mockTranslatorProvider: MockTranslatorProviderModule, lmStudioProtocol: LmStudioProtocolModule): TranslationProvidersModule {
    const { assertNoTransportOverrides, getGlobalTranslatorConfig, getGlobalSettings, classifyCancellation, normalizeLlamaCppConfig, normalizeLlamafileConfig, normalizeLmStudioConfig, normalizeProviderSelection, } = utils;
    const { createLmStudioProvider } = lmStudioProvider;
    const { createLlamaCppProvider } = llamaCppProvider;
    const { createLlamafileProvider } = llamafileProvider;
    const { createMockTranslatorProvider } = mockTranslatorProvider;
    const { createLmStudioModelMetadata, getLoadedLlmInstances, readParallelCapacityDetail, selectLmStudioChatModel } = lmStudioProtocol;
    function createProvider(options: TranslationProviderOptions = {}): TranslationProvider {
        if (!isPropertyBag(options))
            throw new TypeError('Translation provider options must be an object.');
        const providerOverride = options['provider'];
        const configuredRoot = options['translatorConfig'];
        const translatorConfig = configuredRoot ?? getGlobalTranslatorConfig();
        const selection = normalizeProviderSelection(translatorConfig, () => {
            const configuredSettings = options['settings'];
            return configuredSettings ?? getGlobalSettings();
        }, providerOverride);
        if (selection.provider === 'lmstudio') {
            assertNoTransportOverrides(options);
            return createLmStudioProvider(Object.freeze({
                translatorConfig: selection.translatorConfig,
                settings: selection.settings,
                logger: options['logger'],
            }));
        }
        if (selection.provider === 'llamacpp') {
            assertNoTransportOverrides(options);
            return createLlamaCppProvider(Object.freeze({
                translatorConfig: selection.translatorConfig,
                settings: selection.settings,
                logger: options['logger'],
            }));
        }
        if (selection.provider === 'llamafile') {
            assertNoTransportOverrides(options);
            return createLlamafileProvider(Object.freeze({
                translatorConfig: selection.translatorConfig,
                settings: selection.settings,
                paths: options['paths'],
                logger: options['logger'],
            }));
        }
        if (selection.provider === 'mocktranslator') {
            return createMockTranslatorProvider(Object.freeze({
                translatorConfig: selection.translatorConfig,
            }));
        }
        return createNoneProvider();
    }
    const api: TranslationProvidersModule = {
        createProvider,
        createLmStudioProvider,
        createLlamaCppProvider,
        createLlamafileProvider,
        createMockTranslatorProvider,
        createNoneProvider,
        normalizeLmStudioConfig,
        normalizeLlamaCppConfig,
        normalizeLlamafileConfig,
        createLmStudioModelMetadata,
        readParallelCapacityDetail,
        getLoadedLlmInstances,
        selectLmStudioChatModel,
        classifyCancellation,
    };
    return api;
}
