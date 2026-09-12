import type { ThinkBlockStripper, TranslationProviderCommonModule } from '../common.js';
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object;
type PropertyBag = Record<PropertyKey, unknown>;
interface LmStudioProtocolCommonDependencies {
    readonly createThinkBlockStripper: () => ThinkBlockStripper;
    readonly DEFAULT_LOCAL_MAX_OUTPUT_TOKENS: 512;
}
interface ParallelConfigCandidate {
    readonly parallel?: unknown;
    readonly max_parallel?: unknown;
    readonly maxParallel?: unknown;
}
interface ParallelInstanceCandidate extends ParallelConfigCandidate {
    readonly config?: unknown;
    readonly id?: unknown;
}
interface ModelCandidate {
    readonly capabilities?: unknown;
    readonly type?: unknown;
    readonly key?: unknown;
    readonly id?: unknown;
    readonly publisher?: unknown;
    readonly author?: unknown;
    readonly display_name?: unknown;
    readonly displayName?: unknown;
    readonly name?: unknown;
    readonly quantization?: unknown;
    readonly selected_variant?: unknown;
    readonly selectedVariant?: unknown;
    readonly loaded_instances?: unknown;
}
interface LoadedInstanceCandidate {
    readonly instanceId?: unknown;
    readonly modelKey?: unknown;
    readonly model?: unknown;
    readonly capacity?: unknown;
    readonly capacityVerified?: unknown;
}
interface LmStudioConfigCandidate {
    readonly model?: unknown;
    readonly temperature?: unknown;
    readonly top_p?: unknown;
    readonly top_k?: unknown;
    readonly min_p?: unknown;
    readonly repeat_penalty?: unknown;
    readonly max_output_tokens?: unknown;
}
interface OutputCandidate {
    readonly output?: unknown;
    readonly result?: unknown;
}
interface MessageOutputCandidate {
    readonly type?: unknown;
    readonly content?: unknown;
}
interface ChatResponseCandidate {
    readonly model_instance_id?: unknown;
    readonly stats?: unknown;
}
interface ChatStatsCandidate {
    readonly model_load_time_seconds?: unknown;
}
interface SelectionCandidate {
    readonly expectedInstanceId?: unknown;
}
export type ParallelCapacityDetail = {
    capacity: number;
    verified: true;
} | {
    capacity: 1;
    verified: false;
};
export interface LmStudioModelMetadata {
    readonly supportsReasoningOff: boolean;
    readonly key: string;
    readonly publisher: string;
    readonly displayName: string;
    readonly quantization: string;
    readonly selectedVariant: string;
}
export interface LoadedLmStudioInstanceRecord {
    readonly instanceId: string;
    readonly modelKey: string;
    readonly model: LmStudioModelMetadata;
    readonly capacity: number;
    readonly capacityVerified: boolean;
}
export interface LmStudioModelSelection {
    readonly supportsReasoningOff: boolean;
    readonly configuredModel: string;
    readonly requestedModel: string;
    readonly expectedInstanceId: string;
    readonly modelKey: string;
    readonly modelAuthor: string;
    readonly modelName: string;
    readonly quantization: string;
    readonly selectedVariant: string;
    readonly capacity: number;
    readonly capacityVerified: boolean;
    readonly catalogModelCount?: number;
    readonly catalogLoadedLlmInstanceCount?: number;
}
type CapturedModelMetadata = {
    readonly ok: true;
    readonly value: LmStudioModelMetadata;
} | {
    readonly ok: false;
    readonly error: unknown;
};
interface ProjectedLoadedInstanceIdentity {
    readonly metadata: CapturedModelMetadata | null;
    readonly instanceId: string;
    readonly modelKey: string;
    readonly capacity: number;
    readonly capacityVerified: boolean;
}
interface ProjectedModelIdentity {
    readonly metadata: CapturedModelMetadata | null;
    readonly type: unknown;
    readonly key: string;
    readonly loadedInstances: readonly ProjectedLoadedInstanceIdentity[];
}
interface ProjectedCatalogSnapshot {
    readonly modelCount: number;
    readonly models: readonly ProjectedModelIdentity[];
    readonly loadedLlmInstances: readonly ProjectedLoadedInstanceIdentity[];
}
interface CapturedArrayEntry {
    readonly receiver: unknown[];
    readonly descriptor: Readonly<PropertyDescriptor> | undefined;
}
interface MutableLmStudioChatBody {
    input: string;
    stream: boolean;
    store: false;
    system_prompt?: unknown;
    temperature?: unknown;
    top_p?: unknown;
    top_k?: unknown;
    min_p?: unknown;
    repeat_penalty?: unknown;
    max_output_tokens?: unknown;
}
export interface LmStudioChatBody extends MutableLmStudioChatBody {
    max_output_tokens: unknown;
}
export interface LmStudioSseParser {
    feed(chunk: unknown): unknown[];
    finish(chunk?: unknown): unknown[];
}
export interface LmStudioProtocolModule {
    readParallelCapacityDetail(instance: unknown): ParallelCapacityDetail;
    readParallelCapacity(instance: unknown): number;
    createLmStudioModelMetadata(model: unknown): LmStudioModelMetadata;
    getLoadedLlmInstances(models: unknown): LoadedLmStudioInstanceRecord[];
    describeLoadedLlmInstances(instances: unknown): string;
    getLoadedInstancesForModel(model: unknown): LoadedLmStudioInstanceRecord[];
    selectLmStudioChatModel(models: unknown, cfg: unknown): LmStudioModelSelection;
    buildLmStudioChatBody(sourceText: unknown, cfg: unknown, stream: unknown, systemPrompt?: string): LmStudioChatBody;
    extractMessageContentFromV1(data: unknown): string;
    sanitizeLmStudioOutput(value: unknown): string;
    parseLmStudioTextOutput(content: unknown): string;
    getLmStudioChatResponseModelInstanceId(data: unknown): string;
    getLmStudioChatResponseStats(data: unknown): object | null;
    assertLmStudioChatResponseMatchesSelection(data: unknown, selection: unknown): void;
    createThinkBlockStripper: () => ThinkBlockStripper;
    createSseParser(): LmStudioSseParser;
}
export const LMSTUDIO_SELECTION_ERROR_CODES = Object.freeze({
    AUTO_LOADED: 'LMSTUDIO_AUTO_LOADED',
    INSTANCE_MISMATCH: 'LMSTUDIO_INSTANCE_MISMATCH',
});
export function createLmStudioProtocolModule(common: TranslationProviderCommonModule): LmStudioProtocolModule {
    const { createThinkBlockStripper, DEFAULT_LOCAL_MAX_OUTPUT_TOKENS } = common as LmStudioProtocolCommonDependencies;
    const EMPTY_LOADED_INSTANCES: readonly LoadedLmStudioInstanceRecord[] = Object.freeze([]);
    function readParallelCapacityDetail(instance: unknown): ParallelCapacityDetail {
        const instanceValue = instance as FalsySensitiveValue;
        const instanceCandidate = instance as ParallelInstanceCandidate;
        const empty = {} as ParallelConfigCandidate;
        const configValue = instanceValue ? instanceCandidate.config : null;
        const config = configValue && typeof configValue === 'object' ? (configValue as ParallelConfigCandidate) : empty;
        const value = config.parallel;
        if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
            return { capacity: value, verified: true };
        }
        return {
            capacity: 1,
            verified: false,
        };
    }
    function readParallelCapacity(instance: unknown): number {
        return readParallelCapacityDetail(instance).capacity;
    }
    function createSelectionError(message: string, code: string): Error {
        const error = new Error(message);
        Object.defineProperty(error, 'code', { value: code });
        return error;
    }
    function readApiString(source: unknown, keys: unknown): string {
        const object = source && typeof source === 'object' ? (source as PropertyBag) : ({} as PropertyBag);
        for (const key of keys as Iterable<PropertyKey>) {
            if (!Object.prototype.hasOwnProperty.call(object, key))
                continue;
            const value = object[key];
            if (typeof value === 'string') {
                const normalized = value.trim();
                if (normalized)
                    return normalized;
            }
        }
        return '';
    }
    function readQuantizationName(quantization: unknown, selectedVariant: string): string {
        const explicit = readApiString(quantization, ['name', 'Name']);
        if (explicit)
            return explicit;
        const marker = selectedVariant.lastIndexOf('@');
        return marker >= 0 ? selectedVariant.slice(marker + 1).trim() : '';
    }
    function createModelMetadataSnapshot(model: unknown, knownKey?: string): LmStudioModelMetadata {
        const source = model && typeof model === 'object' ? model : {};
        const selectedVariant = readApiString(source, ['selected_variant', 'selectedVariant']);
        const quantization = (source as ModelCandidate).quantization;
        const capabilities = (source as ModelCandidate).capabilities;
        const reasoning = capabilities && typeof capabilities === 'object' ? (capabilities as PropertyBag)['reasoning'] : undefined;
        const allowedOptions = reasoning && typeof reasoning === 'object' ? (reasoning as PropertyBag)['allowed_options'] : undefined;
        return Object.freeze({
            supportsReasoningOff: Array.isArray(allowedOptions) && allowedOptions.includes('off'),
            key: knownKey ?? readApiString(source, ['key', 'id']),
            publisher: readApiString(source, ['publisher', 'author']),
            displayName: readApiString(source, ['display_name', 'displayName', 'name']),
            quantization: readQuantizationName(quantization, selectedVariant),
            selectedVariant,
        });
    }
    function createLmStudioModelMetadata(model: unknown): LmStudioModelMetadata {
        return createModelMetadataSnapshot(model);
    }
    function captureModelMetadata(model: unknown, knownKey: string): CapturedModelMetadata {
        try {
            return Object.freeze({ ok: true, value: createModelMetadataSnapshot(model, knownKey) });
        }
        catch (error) {
            return Object.freeze({ ok: false, error });
        }
    }
    function readLoadedInstanceId(instance: unknown): string {
        const instanceValue = instance as FalsySensitiveValue;
        const rawInstanceId = instanceValue ? (instance as ParallelInstanceCandidate).id : null;
        return typeof rawInstanceId === 'string' ? rawInstanceId.trim() : '';
    }
    function createLoadedInstanceIdentity(modelKey: string, instance: unknown, instanceId: string, metadata: CapturedModelMetadata | null): ProjectedLoadedInstanceIdentity | null {
        if (!instanceId || !modelKey)
            return null;
        const capacityDetail = readParallelCapacityDetail(instance);
        return Object.freeze({
            metadata,
            instanceId,
            modelKey,
            capacity: capacityDetail.capacity,
            capacityVerified: capacityDetail.verified === true,
        });
    }
    function captureArrayEntries(list: unknown[], knownLength = list.length): readonly CapturedArrayEntry[] {
        const entries: CapturedArrayEntry[] = [];
        for (let index = 0; index < knownLength; index += 1) {
            try {
                const descriptor = Object.getOwnPropertyDescriptor(list, String(index));
                entries.push(Object.freeze({
                    receiver: list,
                    descriptor: descriptor ? Object.freeze(descriptor) : undefined,
                }));
            }
            catch {
            }
        }
        return Object.freeze(entries);
    }
    function readCapturedArrayEntry(entry: CapturedArrayEntry): unknown {
        const descriptor = entry.descriptor;
        if (!descriptor)
            return undefined;
        if ('value' in descriptor)
            return descriptor.value;
        if (typeof descriptor.get !== 'function')
            return undefined;
        return Reflect.apply(descriptor.get, entry.receiver, []);
    }
    function projectSelectionModelIdentity(model: unknown, configuredModel: string, autoSelection: boolean, hasClaimedAutoInstance: () => boolean, claimAutoInstance: () => void): ProjectedModelIdentity | null {
        if (!model || typeof model !== 'object')
            return null;
        const candidate = model as ModelCandidate;
        const type = candidate.type;
        const key = readApiString(model, ['key', 'id']);
        if (type !== 'llm') {
            return Object.freeze({
                metadata: null,
                type,
                key,
                loadedInstances: Object.freeze([]),
            });
        }
        const exactModelCandidate = !autoSelection && key === configuredModel;
        let candidateMetadata = exactModelCandidate ? captureModelMetadata(model, key) : null;
        const loadedValue = candidate.loaded_instances;
        const instanceEntries = Array.isArray(loadedValue) ? captureArrayEntries(loadedValue) : [];
        const loadedInstances: ProjectedLoadedInstanceIdentity[] = [];
        for (const entry of instanceEntries) {
            try {
                const instance = readCapturedArrayEntry(entry);
                const instanceId = readLoadedInstanceId(instance);
                if (!instanceId || !key)
                    continue;
                const provisionalAutoCandidate = autoSelection && !hasClaimedAutoInstance();
                const needsMetadata = exactModelCandidate ||
                    (!autoSelection && instanceId === configuredModel) ||
                    provisionalAutoCandidate;
                if (needsMetadata && candidateMetadata === null) {
                    candidateMetadata = captureModelMetadata(model, key);
                }
                const identity = createLoadedInstanceIdentity(key, instance, instanceId, needsMetadata ? candidateMetadata : null);
                if (identity) {
                    if (provisionalAutoCandidate)
                        claimAutoInstance();
                    loadedInstances.push(identity);
                }
            }
            catch {
            }
        }
        return Object.freeze({
            metadata: candidateMetadata,
            type,
            key,
            loadedInstances: Object.freeze(loadedInstances.slice()),
        });
    }
    function projectSelectionCatalogSnapshot(models: unknown, configuredModel: string): ProjectedCatalogSnapshot {
        const list = Array.isArray(models) ? (models as unknown[]) : [];
        const modelCount = list.length;
        const modelEntries = captureArrayEntries(list, modelCount);
        const projectedModels: ProjectedModelIdentity[] = [];
        const loadedLlmInstances: ProjectedLoadedInstanceIdentity[] = [];
        const autoSelection = configuredModel.toLowerCase() === 'auto';
        let autoInstanceClaimed = false;
        const hasClaimedAutoInstance = (): boolean => autoInstanceClaimed;
        const claimAutoInstance = (): void => {
            autoInstanceClaimed = true;
        };
        for (const entry of modelEntries) {
            try {
                const model = readCapturedArrayEntry(entry);
                const projected = projectSelectionModelIdentity(model, configuredModel, autoSelection, hasClaimedAutoInstance, claimAutoInstance);
                if (!projected)
                    continue;
                projectedModels.push(projected);
                if (projected.type === 'llm' && projected.key) {
                    loadedLlmInstances.push(...projected.loadedInstances);
                }
            }
            catch {
            }
        }
        return Object.freeze({
            modelCount,
            models: Object.freeze(projectedModels.slice()),
            loadedLlmInstances: Object.freeze(loadedLlmInstances.slice()),
        });
    }
    function createLoadedInstanceRecord(metadata: LmStudioModelMetadata, instance: unknown): LoadedLmStudioInstanceRecord | null {
        const identity = createLoadedInstanceIdentity(metadata.key, instance, readLoadedInstanceId(instance), null);
        if (!identity)
            return null;
        return Object.freeze({
            instanceId: identity.instanceId,
            modelKey: identity.modelKey,
            model: metadata,
            capacity: identity.capacity,
            capacityVerified: identity.capacityVerified,
        });
    }
    function materializeModelLoadedInstances(model: unknown, includeLoadedInstancesForAnyType = false): readonly LoadedLmStudioInstanceRecord[] {
        if (!model || typeof model !== 'object')
            return EMPTY_LOADED_INSTANCES;
        const candidate = model as ModelCandidate;
        const type = candidate.type;
        const key = readApiString(model, ['key', 'id']);
        if (!key || (type !== 'llm' && !includeLoadedInstancesForAnyType))
            return EMPTY_LOADED_INSTANCES;
        const metadata = createModelMetadataSnapshot(model, key);
        const loadedValue = candidate.loaded_instances;
        if (!Array.isArray(loadedValue))
            return EMPTY_LOADED_INSTANCES;
        const records: LoadedLmStudioInstanceRecord[] = [];
        for (const entry of captureArrayEntries(loadedValue)) {
            try {
                const record = createLoadedInstanceRecord(metadata, readCapturedArrayEntry(entry));
                if (record)
                    records.push(record);
            }
            catch {
            }
        }
        return Object.freeze(records.slice());
    }
    function createSelectionFromInstance(configuredModel: string, instance: ProjectedLoadedInstanceIdentity, catalog: ProjectedCatalogSnapshot): LmStudioModelSelection {
        const capturedMetadata = instance.metadata;
        if (!capturedMetadata) {
            throw new TypeError('LM Studio selected instance is missing captured model metadata.');
        }
        if (!capturedMetadata.ok)
            throw capturedMetadata.error;
        const model = capturedMetadata.value;
        const selection: LmStudioModelSelection = {
            supportsReasoningOff: model.supportsReasoningOff,
            configuredModel,
            requestedModel: instance.instanceId,
            expectedInstanceId: instance.instanceId,
            modelKey: instance.modelKey,
            modelAuthor: model.publisher,
            modelName: model.displayName,
            quantization: model.quantization,
            selectedVariant: model.selectedVariant,
            capacity: instance.capacity,
            capacityVerified: instance.capacityVerified,
        };
        Object.defineProperties(selection, {
            catalogModelCount: {
                value: catalog.modelCount,
            },
            catalogLoadedLlmInstanceCount: {
                value: catalog.loadedLlmInstances.length,
            },
        });
        return Object.freeze(selection);
    }
    function attachCatalogTransaction<T>(value: T, catalog: ProjectedCatalogSnapshot): T {
        if (!value || (typeof value !== 'object' && typeof value !== 'function'))
            return value;
        try {
            Object.defineProperties(value, {
                catalogModelCount: {
                    value: catalog.modelCount,
                },
                catalogLoadedLlmInstanceCount: {
                    value: catalog.loadedLlmInstances.length,
                },
            });
        }
        catch {
        }
        return value;
    }
    function getLoadedLlmInstances(models: unknown): LoadedLmStudioInstanceRecord[] {
        const list = Array.isArray(models) ? (models as unknown[]) : [];
        const records: LoadedLmStudioInstanceRecord[] = [];
        for (const entry of captureArrayEntries(list)) {
            try {
                records.push(...materializeModelLoadedInstances(readCapturedArrayEntry(entry)));
            }
            catch {
            }
        }
        return Object.freeze(records.slice()) as LoadedLmStudioInstanceRecord[];
    }
    function describeLoadedLlmInstances(instances: unknown): string {
        const list = Array.isArray(instances) ? (instances as unknown[]) : [];
        if (!list.length)
            return 'none';
        return list
            .map((item) => {
            const itemValue = item as FalsySensitiveValue;
            const candidate = item as LoadedInstanceCandidate;
            if (!itemValue || typeof candidate.instanceId !== 'string' || typeof candidate.modelKey !== 'string') {
                return '<invalid>';
            }
            const suffix = candidate.capacityVerified === true && (candidate.capacity as number) > 1
                ? `, parallel ${candidate.capacity as string}`
                : '';
            return candidate.instanceId === candidate.modelKey
                ? `${candidate.instanceId}${suffix}`
                : `${candidate.instanceId} (${candidate.modelKey}${suffix})`;
        })
            .join(', ');
    }
    function getLoadedInstancesForModel(model: unknown): LoadedLmStudioInstanceRecord[] {
        return materializeModelLoadedInstances(model, true) as LoadedLmStudioInstanceRecord[];
    }
    function selectLmStudioChatModel(models: unknown, cfg: unknown): LmStudioModelSelection {
        const configuredCandidate = cfg && typeof cfg === 'object' ? (cfg as LmStudioConfigCandidate).model : undefined;
        const configuredModel = typeof configuredCandidate === 'string' ? configuredCandidate.trim() : '';
        const catalog = projectSelectionCatalogSnapshot(models, configuredModel);
        try {
            if (configuredModel.toLowerCase() === 'auto') {
                const loadedLlmInstances = catalog.loadedLlmInstances;
                if (loadedLlmInstances.length !== 1) {
                    throw new Error(`The LM Studio model in settings.jsonc is "auto", but LM Studio currently has ${loadedLlmInstances.length} loaded LLM instance(s): ` +
                        `${describeLoadedLlmInstances(loadedLlmInstances)}. Load exactly one LLM instance or set the LM Studio model in settings.jsonc to a specific loaded instance identifier.`);
                }
                const onlyLoadedInstance = loadedLlmInstances[0];
                if (!onlyLoadedInstance) {
                    throw new TypeError('LM Studio loaded-instance snapshot lost its sole record.');
                }
                return createSelectionFromInstance(configuredModel, onlyLoadedInstance, catalog);
            }
            const exactModel = catalog.models.find((model) => model.key && model.key === configuredModel) ?? null;
            if (exactModel) {
                if (exactModel.type !== 'llm') {
                    throw new Error(`Configured LM Studio model "${configuredModel}" is not an LLM.`);
                }
                const loadedInstances = exactModel.loadedInstances;
                if (loadedInstances.length === 0) {
                    throw new Error(`Configured LM Studio model "${configuredModel}" is not loaded in LM Studio.`);
                }
                if (loadedInstances.length > 1) {
                    throw new Error(`Configured LM Studio model "${configuredModel}" has ${loadedInstances.length} loaded instances: ` +
                        `${describeLoadedLlmInstances(loadedInstances)}. Set the LM Studio model in settings.jsonc to a specific loaded instance identifier.`);
                }
                const onlyLoadedInstance = loadedInstances[0];
                if (!onlyLoadedInstance) {
                    throw new TypeError('LM Studio model snapshot lost its sole loaded record.');
                }
                return createSelectionFromInstance(configuredModel, onlyLoadedInstance, catalog);
            }
            const exactLoadedInstance = catalog.loadedLlmInstances.find((instance) => instance.instanceId === configuredModel);
            if (exactLoadedInstance) {
                return createSelectionFromInstance(configuredModel, exactLoadedInstance, catalog);
            }
            throw new Error(`Configured LM Studio model "${configuredModel}" was not found in LM Studio /api/v1/models.`);
        }
        catch (error) {
            throw attachCatalogTransaction(error, catalog);
        }
    }
    function buildLmStudioChatBody(sourceText: unknown, cfg: unknown, stream: unknown, systemPrompt?: string): LmStudioChatBody {
        const config = cfg as LmStudioConfigCandidate;
        const body: MutableLmStudioChatBody = {
            input: String(sourceText ?? ''),
            stream: !!stream,
            store: false,
        };
        if (systemPrompt) {
            body.system_prompt = systemPrompt;
        }
        const temperature = config.temperature;
        if (Number.isFinite(temperature))
            body.temperature = temperature;
        const topP = config.top_p;
        if (Number.isFinite(topP))
            body.top_p = topP;
        const topK = config.top_k;
        if (Number.isFinite(topK))
            body.top_k = topK;
        const minP = config.min_p;
        if (Number.isFinite(minP))
            body.min_p = minP;
        const repeatPenalty = config.repeat_penalty;
        if (Number.isFinite(repeatPenalty))
            body.repeat_penalty = repeatPenalty;
        const maxOutputTokens = config.max_output_tokens;
        body.max_output_tokens = Number.isFinite(maxOutputTokens) ? maxOutputTokens : DEFAULT_LOCAL_MAX_OUTPUT_TOKENS;
        return body as LmStudioChatBody;
    }
    function extractMessageContentFromV1(data: unknown): string {
        const dataValue = data as FalsySensitiveValue;
        const candidate = data as OutputCandidate;
        const directOutput = dataValue ? candidate.output : null;
        let output: unknown[] = [];
        if (Array.isArray(directOutput)) {
            output = directOutput as unknown[];
        }
        else if (dataValue) {
            const result = candidate.result;
            const nestedOutput = result ? (result as OutputCandidate).output : null;
            if (Array.isArray(nestedOutput))
                output = nestedOutput as unknown[];
        }
        const messages: string[] = [];
        for (const item of output) {
            const itemValue = item as FalsySensitiveValue;
            if (!itemValue)
                continue;
            const message = item as MessageOutputCandidate;
            const type = message.type;
            if (type !== 'message')
                continue;
            const content = message.content;
            if (typeof content === 'string')
                messages.push(content);
        }
        return messages.join('');
    }
    function sanitizeLmStudioOutput(value: unknown): string {
        if (typeof value !== 'string')
            return '';
        const thinkStripper = createThinkBlockStripper();
        let out = thinkStripper.feed(value);
        out += thinkStripper.finish();
        out = out.replace(/^```(?:(?:[\w-]+)?[^\S\r\n]*(?:\r\n|[\r\n]))?([\s\S]*?)\s*```$/u, '$1');
        return out.trim();
    }
    function parseLmStudioTextOutput(content: unknown): string {
        const contentValue = content as FalsySensitiveValue;
        return sanitizeLmStudioOutput(String(contentValue || ''));
    }
    function getLmStudioChatResponseModelInstanceId(data: unknown): string {
        const dataValue = data as FalsySensitiveValue;
        const id = dataValue && typeof (data as ChatResponseCandidate).model_instance_id === 'string'
            ? ((data as ChatResponseCandidate).model_instance_id as string).trim()
            : '';
        if (!id) {
            throw new Error('LM Studio response missing required "model_instance_id".');
        }
        return id;
    }
    function getLmStudioChatResponseStats(data: unknown): object | null {
        const dataValue = data as FalsySensitiveValue;
        const candidate = data as ChatResponseCandidate;
        return dataValue && candidate.stats && typeof candidate.stats === 'object' ? candidate.stats : null;
    }
    function assertLmStudioChatResponseMatchesSelection(data: unknown, selection: unknown): void {
        const selected = selection as SelectionCandidate;
        const responseInstanceId = getLmStudioChatResponseModelInstanceId(data);
        if (responseInstanceId !== selected.expectedInstanceId) {
            throw createSelectionError(`LM Studio responded with instance "${responseInstanceId}", but "${selected.expectedInstanceId as string}" was required.`, LMSTUDIO_SELECTION_ERROR_CODES.INSTANCE_MISMATCH);
        }
        const stats = getLmStudioChatResponseStats(data);
        if (stats && typeof (stats as ChatStatsCandidate).model_load_time_seconds !== 'undefined') {
            throw createSelectionError(`LM Studio auto-loaded "${responseInstanceId}" unexpectedly. The configured model must already be loaded in LM Studio.`, LMSTUDIO_SELECTION_ERROR_CODES.AUTO_LOADED);
        }
    }
    function createSseParser(): LmStudioSseParser {
        let buffer = '';
        function lineEndingLengthAt(input: string, index: number): number {
            if (input[index] === '\n')
                return 1;
            if (input[index] !== '\r')
                return 0;
            return input[index + 1] === '\n' ? 2 : 1;
        }
        function findFrameSeparator(input: string): {
            index: number;
            length: number;
        } | null {
            for (let index = 0; index < input.length; index += 1) {
                const firstLength = lineEndingLengthAt(input, index);
                if (firstLength === 0)
                    continue;
                const secondIndex = index + firstLength;
                const secondLength = lineEndingLengthAt(input, secondIndex);
                if (secondLength > 0) {
                    return { index, length: firstLength + secondLength };
                }
                index = secondIndex - 1;
            }
            return null;
        }
        function drain(final = false): unknown[] {
            const events: unknown[] = [];
            while (true) {
                const separator = findFrameSeparator(buffer);
                if (!separator)
                    break;
                const frame = buffer.slice(0, separator.index);
                buffer = buffer.slice(separator.index + separator.length);
                appendSseEvent(events, frame);
            }
            if (final && buffer) {
                const frame = buffer;
                buffer = '';
                appendSseEvent(events, frame);
            }
            return events;
        }
        return {
            feed(chunk: unknown): unknown[] {
                const chunkValue = chunk as FalsySensitiveValue;
                buffer += String(chunkValue || '');
                return drain(false);
            },
            finish(chunk: unknown = ''): unknown[] {
                const chunkValue = chunk as FalsySensitiveValue;
                buffer += String(chunkValue || '');
                return drain(true);
            },
        };
    }
    function appendSseEvent(events: unknown[], raw: unknown): void {
        const dataLines: string[] = [];
        const rawValue = raw as FalsySensitiveValue;
        String(rawValue || '')
            .split(/\r\n|[\r\n]/u)
            .forEach((line) => {
            if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        });
        if (!dataLines.length)
            return;
        const payload = dataLines.join('\n');
        let event: unknown;
        try {
            event = JSON.parse(payload);
        }
        catch (error) {
            const detail = Error.isError(error) ? error.message : String(error);
            throw new Error(`LM Studio stream returned malformed JSON: ${detail}`, { cause: error });
        }
        events.push(event);
    }
    return {
        readParallelCapacityDetail,
        readParallelCapacity,
        createLmStudioModelMetadata,
        getLoadedLlmInstances,
        describeLoadedLlmInstances,
        getLoadedInstancesForModel,
        selectLmStudioChatModel,
        buildLmStudioChatBody,
        extractMessageContentFromV1,
        sanitizeLmStudioOutput,
        parseLmStudioTextOutput,
        getLmStudioChatResponseModelInstanceId,
        getLmStudioChatResponseStats,
        assertLmStudioChatResponseMatchesSelection,
        createThinkBlockStripper,
        createSseParser,
    };
}
