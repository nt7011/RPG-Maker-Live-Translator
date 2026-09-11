export type TranslationProviderAvailabilityState = 'available' | 'pending' | 'unavailable';
export interface TranslationProviderObservation {
    readonly apiResponding: boolean;
    readonly modelId: string;
    readonly instanceId: string;
    readonly publisher: string;
    readonly quantization: string;
    readonly capacitySource: string;
}
export interface TranslationProviderRuntimeStatus {
    readonly observation?: Readonly<TranslationProviderObservation>;
    readonly state: TranslationProviderAvailabilityState;
    readonly code: string;
    readonly message: string;
    readonly model: string;
    readonly capacity: number;
    readonly capacityVerified: boolean;
}
export interface TranslationProviderAvailabilityFailure {
    readonly state: 'unavailable';
    readonly code: string;
    readonly message: string;
}
export interface TranslationStatusProvider {
    readonly state: TranslationProviderRuntimeStatus['state'];
    readonly code: string;
    readonly message: string;
    readonly observation: TranslationProviderRuntimeStatus['observation'] | null;
    readonly capacityVerified: boolean;
    readonly dispatchLimit: number;
    readonly queued: number;
    readonly refreshing: boolean;
    readonly checkedAt: number;
    readonly lastSuccessAt: number;
    readonly expiresAt: number;
    readonly priorityLane: boolean;
    readonly available: number;
    readonly capacity: number;
    readonly connection: 'connected' | 'error' | 'pending' | 'ready';
    readonly kind: string;
    readonly model: string;
    readonly running: number;
}
export interface TranslationStatusSnapshot {
    readonly generation: number;
    readonly sequence: number;
    readonly active: boolean;
    readonly provider: Readonly<TranslationStatusProvider>;
    readonly updatedAt: number;
}
