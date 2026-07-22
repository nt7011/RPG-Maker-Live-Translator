// LM Studio model selection, request bodies, response parsing, and stream parsing.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.translationProviders.localProtocol',
        requires: {
            utils: 'runtime.translationProviders.common',
        },
        factory({ utils }) {
            const {
                DEFAULT_LOCAL_MAX_OUTPUT_TOKENS,
            } = utils;

            function readParallelCapacityDetail(instance) {
                const config = instance && instance.config && typeof instance.config === 'object'
                    ? instance.config
                    : {};
                const candidates = [
                    config.parallel,
                    config.max_parallel,
                    config.maxParallel,
                    instance && instance.parallel,
                    instance && instance.max_parallel,
                    instance && instance.maxParallel,
                ];
                for (const value of candidates) {
                    const numeric = Number(value);
                    if (Number.isInteger(numeric) && numeric > 0) {
                        return {
                            capacity: numeric,
                            verified: true,
                        };
                    }
                }
                return {
                    capacity: 1,
                    verified: false,
                };
            }

            function readParallelCapacity(instance) {
                return readParallelCapacityDetail(instance).capacity;
            }

            function readApiString(source, keys) {
                const object = source && typeof source === 'object' ? source : {};
                for (const key of keys) {
                    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
                    const value = object[key];
                    if (typeof value === 'string' && value.trim()) return value.trim();
                }
                return '';
            }

            function readQuantizationName(model) {
                const quantization = model && model.quantization && typeof model.quantization === 'object'
                    ? model.quantization
                    : null;
                const explicit = readApiString(quantization, ['name', 'Name']);
                if (explicit) return explicit;

                const selectedVariant = readApiString(model, ['selected_variant', 'selectedVariant']);
                const marker = selectedVariant.lastIndexOf('@');
                return marker >= 0 ? selectedVariant.slice(marker + 1).trim() : '';
            }

            function readReasoningCapability(model) {
                const capabilities = model && model.capabilities && typeof model.capabilities === 'object'
                    ? model.capabilities
                    : null;
                const reasoning = capabilities && capabilities.reasoning && typeof capabilities.reasoning === 'object'
                    ? capabilities.reasoning
                    : null;
                if (!reasoning) return null;

                return {
                    allowedOptions: Array.isArray(reasoning.allowed_options)
                        ? reasoning.allowed_options.filter((option) => typeof option === 'string')
                        : [],
                    defaultOption: typeof reasoning.default === 'string' ? reasoning.default : '',
                };
            }

            function resolveNoReasoningSetting(reasoningCapability, modelLabel) {
                // Omitting the request field is required for models that do not expose
                // LM Studio's reasoning control. Sending even "off" to those models is
                // rejected by /api/v1/chat.
                if (!reasoningCapability) return '';
                if (reasoningCapability.allowedOptions.indexOf('off') >= 0) return 'off';

                const allowed = reasoningCapability.allowedOptions.length
                    ? reasoningCapability.allowedOptions.join(', ')
                    : 'none';
                throw new Error(
                    `LM Studio model "${modelLabel || '<unknown>'}" cannot disable reasoning `
                    + `(allowed reasoning options: ${allowed}). Translation requires reasoning to be off.`
                );
            }

            function createLocalModelMetadata(model) {
                const source = model && typeof model === 'object' ? model : {};
                return {
                    key: readApiString(source, ['key', 'id']),
                    publisher: readApiString(source, ['publisher', 'author']),
                    displayName: readApiString(source, ['display_name', 'displayName', 'name']),
                    quantization: readQuantizationName(source),
                    selectedVariant: readApiString(source, ['selected_variant', 'selectedVariant']),
                    reasoningCapability: readReasoningCapability(source),
                };
            }

            function createLoadedInstanceRecord(model, instance) {
                const instanceId = instance && typeof instance.id === 'string' ? instance.id.trim() : '';
                if (!instanceId) return null;
                const modelMetadata = createLocalModelMetadata(model);
                if (!modelMetadata.key) return null;
                const capacityDetail = readParallelCapacityDetail(instance);
                return {
                    instanceId,
                    modelKey: modelMetadata.key,
                    model: modelMetadata,
                    capacity: capacityDetail.capacity,
                    capacityVerified: capacityDetail.verified === true,
                };
            }

            function createSelectionFromInstance(configuredModel, instance) {
                const source = instance && typeof instance === 'object' ? instance : {};
                const model = source.model && typeof source.model === 'object' ? source.model : {};
                const modelLabel = source.instanceId || source.modelKey || model.key || configuredModel;
                return {
                    configuredModel,
                    requestedModel: source.instanceId,
                    expectedInstanceId: source.instanceId,
                    modelKey: source.modelKey || model.key || '',
                    modelAuthor: model.publisher || '',
                    modelName: model.displayName || '',
                    quantization: model.quantization || '',
                    selectedVariant: model.selectedVariant || '',
                    capacity: source.capacity || 1,
                    capacityVerified: source.capacityVerified === true,
                    reasoningSetting: resolveNoReasoningSetting(model.reasoningCapability, modelLabel),
                };
            }

            function getLoadedLlmInstances(models) {
                const out = [];
                const list = Array.isArray(models) ? models : [];
                for (const model of list) {
                    if (!model || model.type !== 'llm') continue;
                    const modelKey = typeof model.key === 'string' ? model.key.trim() : '';
                    if (!modelKey) continue;
                    const loadedInstances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
                    for (const instance of loadedInstances) {
                        const record = createLoadedInstanceRecord(model, instance);
                        if (record) out.push(record);
                    }
                }
                return out;
            }

            function describeLoadedLlmInstances(instances) {
                const list = Array.isArray(instances) ? instances : [];
                if (!list.length) return 'none';
                return list.map((item) => {
                    if (!item || typeof item.instanceId !== 'string' || typeof item.modelKey !== 'string') return '<invalid>';
                    const suffix = item.capacityVerified === true && item.capacity > 1 ? `, parallel ${item.capacity}` : '';
                    return item.instanceId === item.modelKey
                        ? `${item.instanceId}${suffix}`
                        : `${item.instanceId} (${item.modelKey}${suffix})`;
                }).join(', ');
            }

            function getLoadedInstancesForModel(model) {
                const loadedInstances = model && Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
                return loadedInstances
                    .map((instance) => createLoadedInstanceRecord(model, instance))
                    .filter((instance) => instance && instance.instanceId);
            }

            function selectLocalChatModel(models, cfg) {
                const configuredModel = typeof cfg.model === 'string' ? cfg.model.trim() : '';
                const loadedLlmInstances = getLoadedLlmInstances(models);

                if (configuredModel.toLowerCase() === 'auto') {
                    if (loadedLlmInstances.length !== 1) {
                        throw new Error(
                            `The LM Studio model in settings.json is "auto", but LM Studio currently has ${loadedLlmInstances.length} loaded LLM instance(s): `
                            + `${describeLoadedLlmInstances(loadedLlmInstances)}. Load exactly one LLM instance or set the LM Studio model in settings.json to a specific loaded instance identifier.`
                        );
                    }
                    return createSelectionFromInstance(configuredModel, loadedLlmInstances[0]);
                }

                const exactModel = Array.isArray(models)
                    ? models.find((model) => model && typeof model.key === 'string' && model.key.trim() === configuredModel)
                    : null;
                if (exactModel) {
                    if (exactModel.type !== 'llm') {
                        throw new Error(`Configured local model "${configuredModel}" is not an LLM.`);
                    }

                    const loadedInstances = getLoadedInstancesForModel(exactModel);
                    if (loadedInstances.length === 0) {
                        throw new Error(`Configured local model "${configuredModel}" is not loaded in LM Studio.`);
                    }
                    if (loadedInstances.length > 1) {
                        throw new Error(
                            `Configured local model "${configuredModel}" has ${loadedInstances.length} loaded instances: `
                            + `${describeLoadedLlmInstances(loadedInstances)}. Set the LM Studio model in settings.json to a specific loaded instance identifier.`
                        );
                    }

                    return createSelectionFromInstance(configuredModel, loadedInstances[0]);
                }

                const exactLoadedInstance = loadedLlmInstances.find((instance) => instance.instanceId === configuredModel);
                if (exactLoadedInstance) {
                    return createSelectionFromInstance(configuredModel, exactLoadedInstance);
                }

                throw new Error(`Configured local model "${configuredModel}" was not found in LM Studio /api/v1/models.`);
            }

            function buildLocalChatBody(sourceText, cfg, stream) {
                const body = {
                    input: String(sourceText ?? ''),
                    stream: !!stream,
                    store: false,
                };
                if (typeof cfg.system_prompt === 'string' && cfg.system_prompt) body.system_prompt = cfg.system_prompt;
                if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
                if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;
                if (Number.isFinite(cfg.top_k)) body.top_k = cfg.top_k;
                if (Number.isFinite(cfg.min_p)) body.min_p = cfg.min_p;
                if (Number.isFinite(cfg.repeat_penalty)) body.repeat_penalty = cfg.repeat_penalty;
                body.max_output_tokens = Number.isFinite(cfg.max_output_tokens)
                    ? cfg.max_output_tokens
                    : DEFAULT_LOCAL_MAX_OUTPUT_TOKENS;
                return body;
            }

            function applyNoReasoningSetting(body, selection) {
                const requestBody = Object.assign({}, body || {});
                if (selection && selection.reasoningSetting === 'off') {
                    requestBody.reasoning = 'off';
                }
                return requestBody;
            }

            function extractMessageContentFromV1(data) {
                const output = data && Array.isArray(data.output)
                    ? data.output
                    : (data && data.result && Array.isArray(data.result.output) ? data.result.output : []);
                const messages = output.filter((item) => item && item.type === 'message' && typeof item.content === 'string');
                return messages.map((item) => item.content).join('');
            }

            function sanitizeLocalOutput(value) {
                if (typeof value !== 'string') return '';
                let out = value;
                out = out.replace(/<\s*think\b[\s\S]*?>[\s\S]*?<\s*\/\s*think\s*>/gi, '');
                out = out.replace(/<\s*think\b[\s\S]*?\/>/gi, '');
                out = out.replace(/^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/u, '$1');
                return out.trim();
            }

            function parseLocalTextOutput(content) {
                return sanitizeLocalOutput(String(content || ''));
            }

            function getLocalChatResponseModelInstanceId(data) {
                const id = data && typeof data.model_instance_id === 'string' ? data.model_instance_id.trim() : '';
                if (!id) {
                    throw new Error('Local LLM response missing required "model_instance_id".');
                }
                return id;
            }

            function getLocalChatResponseStats(data) {
                return data && data.stats && typeof data.stats === 'object' ? data.stats : null;
            }

            function assertLocalChatResponseMatchesSelection(data, selection) {
                const responseInstanceId = getLocalChatResponseModelInstanceId(data);
                if (responseInstanceId !== selection.expectedInstanceId) {
                    throw new Error(
                        `Local LLM responded with instance "${responseInstanceId}", but "${selection.expectedInstanceId}" was required.`
                    );
                }

                const stats = getLocalChatResponseStats(data);
                if (stats && typeof stats.model_load_time_seconds !== 'undefined') {
                    throw new Error(
                        `Local LLM auto-loaded "${responseInstanceId}" unexpectedly. The configured model must already be loaded in LM Studio.`
                    );
                }
            }

            function createThinkBlockStripper() {
                const state = { inThink: false };
                return {
                    feed(chunk) {
                        const input = String(chunk || '');
                        if (!input) return '';
                        const lowerInput = input.toLowerCase();
                        let out = '';
                        let index = 0;
                        while (index < input.length) {
                            if (!state.inThink) {
                                const start = lowerInput.indexOf('<think', index);
                                if (start === -1) {
                                    out += input.slice(index);
                                    break;
                                }
                                out += input.slice(index, start);
                                const endTag = input.indexOf('>', start);
                                if (endTag === -1) {
                                    state.inThink = true;
                                    break;
                                }
                                state.inThink = true;
                                index = endTag + 1;
                            } else {
                                const end = lowerInput.indexOf('</think', index);
                                if (end === -1) break;
                                const endTag = input.indexOf('>', end);
                                if (endTag === -1) break;
                                state.inThink = false;
                                index = endTag + 1;
                            }
                        }
                        return out;
                    },
                };
            }

            function createSseParser() {
                let buffer = '';
                return {
                    feed(chunk) {
                        buffer += String(chunk || '');
                        const events = [];
                        while (true) {
                            const match = buffer.match(/\r?\n\r?\n/);
                            if (!match) break;
                            const index = match.index;
                            const raw = buffer.slice(0, index);
                            buffer = buffer.slice(index + match[0].length);

                            const dataLines = [];
                            raw.split(/\r?\n/).forEach((line) => {
                                if (line.startsWith('data:')) {
                                    dataLines.push(line.slice(5).trimStart());
                                }
                            });
                            if (!dataLines.length) continue;

                            try {
                                events.push(JSON.parse(dataLines.join('\n')));
                            } catch (_) {
                                // A malformed server event should not corrupt later events.
                            }
                        }
                        return events;
                    },
                };
            }

            return {
                readParallelCapacityDetail,
                readParallelCapacity,
                readReasoningCapability,
                resolveNoReasoningSetting,
                createLocalModelMetadata,
                getLoadedLlmInstances,
                describeLoadedLlmInstances,
                getLoadedInstancesForModel,
                selectLocalChatModel,
                buildLocalChatBody,
                applyNoReasoningSetting,
                extractMessageContentFromV1,
                sanitizeLocalOutput,
                parseLocalTextOutput,
                getLocalChatResponseModelInstanceId,
                getLocalChatResponseStats,
                assertLocalChatResponseMatchesSelection,
                createThinkBlockStripper,
                createSseParser,
            };
        },
    });
})();
