import type { TranslationProviderAvailabilityFailure, TranslationProviderRuntimeStatus, TranslationProviderObservation, } from '../translation-status-types.js';
export type { TranslationProviderAvailabilityState, TranslationProviderAvailabilityFailure, TranslationProviderRuntimeStatus, TranslationProviderObservation, } from '../translation-status-types.js';
type PropertyBag = Record<PropertyKey, unknown>;
const MAX_CODE_UNITS = 128;
const MAX_MESSAGE_UNITS = 1024;
const MAX_MODEL_UNITS = 256;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const defineProperty = Object.defineProperty;
const apply = Reflect.apply;
const freeze = Object.freeze;
const isSafeInteger = Number.isSafeInteger;
const VALUE_PROPERTY_ARGUMENTS = freeze(['value'] as const);
const hasOwnProperty = Object.prototype.hasOwnProperty;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const availabilityFailures = new WeakMap<object, Readonly<TranslationProviderAvailabilityFailure>>();
function ownDataValue(source: PropertyBag, key: PropertyKey): unknown {
    const descriptor = getOwnPropertyDescriptor(source, key);
    if (!descriptor || !apply(hasOwnProperty, descriptor, VALUE_PROPERTY_ARGUMENTS))
        return undefined;
    return descriptor.value;
}
function boundedString(value: unknown, maximum: number, requireValue = false): string | null {
    if (typeof value !== 'string')
        return null;
    if (value.length > maximum)
        return null;
    if (requireValue && value.length === 0)
        return null;
    return value;
}
export function captureTranslationProviderRuntimeStatus(value: unknown): Readonly<TranslationProviderRuntimeStatus> | null {
    if (!value || typeof value !== 'object')
        return null;
    const source = value as PropertyBag;
    let state: unknown;
    let code: unknown;
    let message: unknown;
    let model: unknown;
    let capacity: unknown;
    let capacityVerified: unknown;
    try {
        state = ownDataValue(source, 'state');
        code = ownDataValue(source, 'code');
        message = ownDataValue(source, 'message');
        model = ownDataValue(source, 'model');
        capacity = ownDataValue(source, 'capacity');
        capacityVerified = ownDataValue(source, 'capacityVerified');
    }
    catch {
        return null;
    }
    if (state !== 'available' && state !== 'pending' && state !== 'unavailable')
        return null;
    const capturedCode = boundedString(code, MAX_CODE_UNITS, true);
    const capturedMessage = boundedString(message, MAX_MESSAGE_UNITS);
    const capturedModel = boundedString(model, MAX_MODEL_UNITS);
    if (capturedCode === null || capturedMessage === null || capturedModel === null)
        return null;
    if (typeof capacity !== 'number' || !isSafeInteger(capacity) || capacity < 0)
        return null;
    if (typeof capacityVerified !== 'boolean')
        return null;
    if (state === 'available' && capacity === 0)
        return null;
    if (capacityVerified && capacity === 0)
        return null;
    let observation: Readonly<TranslationProviderObservation> | undefined;
    try {
        const observationValue = ownDataValue(source, 'observation');
        if (observationValue !== undefined) {
            if (!observationValue || typeof observationValue !== 'object')
                return null;
            const details = observationValue as PropertyBag;
            const apiResponding = ownDataValue(details, 'apiResponding');
            if (typeof apiResponding !== 'boolean')
                return null;
            const fields = {} as Record<'modelId' | 'instanceId' | 'publisher' | 'quantization' | 'capacitySource', string>;
            for (const key of ['modelId', 'instanceId', 'publisher', 'quantization', 'capacitySource'] as const) {
                const value = boundedString(ownDataValue(details, key), MAX_MODEL_UNITS);
                if (value === null)
                    return null;
                fields[key] = value;
            }
            observation = freeze({ apiResponding, ...fields });
        }
    }
    catch {
        return null;
    }
    return freeze({
        ...(observation ? { observation } : {}),
        state,
        code: capturedCode,
        message: capturedMessage,
        model: capturedModel,
        capacity,
        capacityVerified,
    });
}
export function createTranslationProviderRuntimeStatus(value: TranslationProviderRuntimeStatus): Readonly<TranslationProviderRuntimeStatus> {
    const captured = captureTranslationProviderRuntimeStatus(value);
    if (!captured)
        throw new TypeError('Translation provider runtime status is invalid.');
    return captured;
}
export function captureTranslationProviderAvailabilityFailure(error: unknown): Readonly<TranslationProviderAvailabilityFailure> | null {
    if (!error || (typeof error !== 'object' && typeof error !== 'function'))
        return null;
    try {
        return ((apply(weakMapGet, availabilityFailures, [error]) as Readonly<TranslationProviderAvailabilityFailure> | undefined) ?? null);
    }
    catch {
        return null;
    }
}
export function markTranslationProviderUnavailable(error: unknown, code: string, message: string): unknown {
    if (!error || (typeof error !== 'object' && typeof error !== 'function'))
        return error;
    const capturedCode = boundedString(code, MAX_CODE_UNITS, true);
    const capturedMessage = boundedString(message, MAX_MESSAGE_UNITS);
    if (capturedCode === null || capturedMessage === null)
        return error;
    const evidence = freeze({ state: 'unavailable' as const, code: capturedCode, message: capturedMessage });
    try {
        if (apply(weakMapGet, availabilityFailures, [error]) !== undefined)
            return error;
        apply(weakMapSet, availabilityFailures, [error, evidence]);
    }
    catch {
        return error;
    }
    try {
        defineProperty(error, 'providerAvailabilityFailure', {
            value: evidence,
            enumerable: true,
            writable: false,
            configurable: false,
        });
    }
    catch {
    }
    return error;
}
