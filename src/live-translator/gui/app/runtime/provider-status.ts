import type { TranslationStatusSnapshot, TranslationStatusProvider, } from '../../../runtime/translation-status-types.js';
function own(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object')
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
export function readProviderStatusSnapshot(value: unknown): TranslationStatusSnapshot | null {
    try {
        const generation = own(value, 'generation'), sequence = own(value, 'sequence');
        const updatedAt = own(value, 'updatedAt'), active = own(value, 'active');
        const count = (candidate: unknown): candidate is number => typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0;
        if (!count(generation) ||
            generation === 0 ||
            !count(sequence) ||
            !count(updatedAt) ||
            typeof active !== 'boolean')
            return null;
        const input = own(value, 'provider');
        const provider: Record<string, unknown> = {};
        for (const key of ['kind', 'state', 'code', 'message', 'connection', 'model']) {
            const field = own(input, key);
            if (typeof field !== 'string' || field.length > (key === 'message' ? 1024 : 256))
                return null;
            provider[key] = field;
        }
        if (!['pending', 'available', 'unavailable'].includes(provider['state'] as string) ||
            !['pending', 'connected', 'error', 'ready'].includes(provider['connection'] as string))
            return null;
        for (const key of [
            'capacity',
            'dispatchLimit',
            'running',
            'queued',
            'available',
            'checkedAt',
            'lastSuccessAt',
            'expiresAt',
        ]) {
            const field = own(input, key);
            if (!count(field))
                return null;
            provider[key] = field;
        }
        for (const key of ['capacityVerified', 'refreshing', 'priorityLane']) {
            const field = own(input, key);
            if (typeof field !== 'boolean')
                return null;
            provider[key] = field;
        }
        if (provider['capacityVerified'] && provider['capacity'] === 0)
            return null;
        if (provider['priorityLane'] && (!provider['capacityVerified'] || (provider['capacity'] as number) < 3))
            return null;
        const observation = own(input, 'observation');
        provider['observation'] = null;
        if (observation !== null) {
            const apiResponding = own(observation, 'apiResponding');
            if (typeof apiResponding !== 'boolean')
                return null;
            const fields: Record<string, unknown> = { apiResponding };
            for (const key of ['modelId', 'instanceId', 'publisher', 'quantization', 'capacitySource']) {
                const field = own(observation, key);
                if (typeof field !== 'string' || field.length > 256)
                    return null;
                fields[key] = field;
            }
            provider['observation'] = Object.freeze(fields);
        }
        return Object.freeze({
            generation,
            sequence,
            updatedAt,
            active,
            provider: Object.freeze(provider) as unknown as TranslationStatusProvider,
        });
    }
    catch {
        return null;
    }
}
