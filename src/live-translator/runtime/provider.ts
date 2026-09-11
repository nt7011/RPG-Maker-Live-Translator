export interface ProviderConfigModule {
    getActiveProvider(scope: unknown): unknown;
}
export interface ProviderContextOptions {
    readonly scope?: unknown;
}
export interface ProviderContext {
    readonly activeProvider: unknown;
    readonly isLocalProvider: boolean;
    readonly isCacheOnlyProvider: boolean;
}
export interface ProviderModule {
    createProviderContext(options?: ProviderContextOptions): ProviderContext;
}
export function createProviderModule(configModule: ProviderConfigModule, runtimeScope: unknown): ProviderModule {
    return Object.freeze({
        createProviderContext(options: ProviderContextOptions = {}): ProviderContext {
            let scope = runtimeScope;
            if (options.scope)
                scope = options.scope;
            const activeProvider = configModule.getActiveProvider(scope);
            return {
                activeProvider,
                isLocalProvider: activeProvider === 'lmstudio' || activeProvider === 'llamacpp' || activeProvider === 'llamafile',
                isCacheOnlyProvider: activeProvider === 'none',
            };
        },
    });
}
