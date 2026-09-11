import { createCacheContextModule, type CacheContextModule } from '../cache-context.js';
import { createDiskCacheModule } from '../cache/disk-cache.js';
import type { CancellationModule } from '../cancellation.js';
import type { RuntimeConfigModule } from '../config.js';
import type { RuntimePathsModule } from '../paths.js';
import { createTranslationManagerModule } from '../translation-manager/manager.js';
import { createTranslationProviderCommonModule } from '../translation-providers/common.js';
import { createTranslationProvidersModule } from '../translation-providers/composition.js';
import { createLlamaCppProtocolModule } from '../translation-providers/llamacpp/protocol.js';
import { createLlamaCppProviderModule } from '../translation-providers/llamacpp/provider.js';
import { createLlamafileArtifactsModule } from '../translation-providers/llamafile/artifacts.js';
import { createLlamafileProcessModule } from '../translation-providers/llamafile/process.js';
import { createLlamafileProviderModule } from '../translation-providers/llamafile/provider.js';
import { createLmStudioProtocolModule } from '../translation-providers/lmstudio/protocol.js';
import { createLmStudioProviderModule } from '../translation-providers/lmstudio/provider.js';
import { createMockTranslatorProviderModule } from '../translation-providers/mock/provider.js';
type RuntimeScope = Record<PropertyKey, unknown>;
export interface TranslationCompositionOptions {
    readonly cancellation: CancellationModule;
    readonly configModule: RuntimeConfigModule;
    readonly pathsModule: RuntimePathsModule;
    readonly scope: RuntimeScope;
}
export function createTranslationComposition({ cancellation, configModule, pathsModule, scope, }: TranslationCompositionOptions): CacheContextModule {
    const translationManager = createTranslationManagerModule(cancellation, scope);
    const translationProviderCommon = createTranslationProviderCommonModule(cancellation, scope);
    const llamaCppProtocol = createLlamaCppProtocolModule(translationProviderCommon);
    const llamaCppProvider = createLlamaCppProviderModule(translationProviderCommon, llamaCppProtocol);
    const llamafileProvider = createLlamafileProviderModule(translationProviderCommon, llamaCppProvider, createLlamafileArtifactsModule(scope), createLlamafileProcessModule(translationProviderCommon, scope));
    const lmStudioProtocol = createLmStudioProtocolModule(translationProviderCommon);
    const lmStudioProvider = createLmStudioProviderModule(translationProviderCommon, lmStudioProtocol);
    const mockTranslatorProvider = createMockTranslatorProviderModule(translationProviderCommon);
    const translationProviders = createTranslationProvidersModule(translationProviderCommon, lmStudioProvider, llamaCppProvider, llamafileProvider, mockTranslatorProvider, lmStudioProtocol);
    return createCacheContextModule({
        diskCache: createDiskCacheModule(scope),
        translationManager,
        translationProviders,
        config: configModule,
        pathContextModule: pathsModule,
    }, scope);
}
