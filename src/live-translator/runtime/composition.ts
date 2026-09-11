import { startRuntime, type BootstrapStartResult } from './bootstrap.js';
import { createCancellationModule } from './cancellation.js';
import type { RuntimeConfigModule } from './config.js';
import { createTranslationComposition } from './composition/translation.js';
import { installBitmapCore } from './composition/bitmap-core.js';
import { createSemanticAdapters } from './composition/semantic-adapters.js';
import type { RuntimeDiagnosticsIngress } from './diagnostics-ingress.js';
import { createLoggerContextModule } from './logger-context.js';
import type { createLoggerModule } from './logger.js';
import { createRuntimePathsModule } from './paths.js';
import { createProviderModule, type ProviderConfigModule } from './provider.js';
import { createTelemetryDiagnosticsPortModule } from './telemetry-diagnostics-port.js';
type RuntimeScope = Record<PropertyKey, unknown>;
export interface RuntimeCompositionOptions {
    readonly configModule: RuntimeConfigModule;
    readonly createLoggerBundle: ReturnType<typeof createLoggerModule>;
    readonly diagnostics: RuntimeDiagnosticsIngress;
    readonly scope: RuntimeScope;
}
export function startNativeRuntime({ configModule, createLoggerBundle, diagnostics, scope, }: RuntimeCompositionOptions): Promise<BootstrapStartResult> {
    const cancellation = createCancellationModule();
    const pathsModule = createRuntimePathsModule(scope);
    const loggerContextModule = createLoggerContextModule(createLoggerBundle, createTelemetryDiagnosticsPortModule(scope), scope);
    const providerConfig: ProviderConfigModule = {
        getActiveProvider(targetScope: unknown): unknown {
            return configModule.getActiveProvider(targetScope);
        },
    };
    const providerModule = createProviderModule(providerConfig, scope);
    const cacheContextModule = createTranslationComposition({ cancellation, configModule, pathsModule, scope });
    return startRuntime({
        configModule,
        pathsModule,
        providerModule,
        loggerContextModule,
        cacheContextModule,
        diagnostics,
        installBitmapCore: (options, settings) => {
            installBitmapCore({ ...options, semanticAdapters: createSemanticAdapters(settings) });
        },
    }, { scope });
}
