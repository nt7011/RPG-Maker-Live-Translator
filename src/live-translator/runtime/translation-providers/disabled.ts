import { createTranslationProviderRuntimeStatus, type TranslationProviderRuntimeStatus } from './runtime-status.js';
export interface DisabledProviderCapabilities {
    readonly streaming: boolean;
    readonly tracksAvailability: boolean;
    readonly requiresVerifiedCapacity: boolean;
}
export interface DisabledTranslationProvider<Capabilities extends DisabledProviderCapabilities = DisabledProviderCapabilities> {
    readonly kind: 'none';
    readonly capabilities: Readonly<Capabilities>;
    getCapacity(): Promise<number>;
    getRuntimeStatus(): Readonly<TranslationProviderRuntimeStatus>;
    translate(request?: unknown): Promise<never>;
}
const DISABLED_PROVIDER_MESSAGE = 'No translation provider is configured.';
const DISABLED_PROVIDER_CAPABILITIES = Object.freeze({
    streaming: false,
    tracksAvailability: false,
    requiresVerifiedCapacity: false,
});
class DisabledProviderError extends Error {
    constructor() {
        super(DISABLED_PROVIDER_MESSAGE);
        Object.defineProperties(this, {
            code: {
                value: 'PROVIDER_DISABLED',
                enumerable: true,
                writable: false,
                configurable: false,
            },
            retryable: {
                value: false,
                enumerable: true,
                writable: false,
                configurable: false,
            },
        });
    }
}
export function createDisabledTranslationProvider<Capabilities extends DisabledProviderCapabilities>(capabilities: Readonly<Capabilities>): DisabledTranslationProvider<Capabilities> {
    return {
        kind: 'none',
        capabilities,
        async getCapacity(): Promise<number> {
            return Number.MAX_SAFE_INTEGER;
        },
        getRuntimeStatus() {
            return createTranslationProviderRuntimeStatus({
                state: 'available',
                code: 'cache-only',
                message: '',
                model: '',
                capacity: Number.MAX_SAFE_INTEGER,
                capacityVerified: true,
            });
        },
        async translate(): Promise<never> {
            throw new DisabledProviderError();
        },
    };
}
export function createNoneProvider(): DisabledTranslationProvider {
    return createDisabledTranslationProvider(DISABLED_PROVIDER_CAPABILITIES);
}
