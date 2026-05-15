// LM Studio model selection, request bodies, response parsing, and stream parsing.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translator/providers/local-protocol.js.');
    }

    function requireModule(moduleName) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(moduleName);
        }
        const modules = globalScope.LiveTranslatorModules || {};
        if (modules[moduleName]) return modules[moduleName];
        return String(moduleName || '').split('.').reduce((current, part) => {
            return current && current[part] ? current[part] : null;
        }, modules);
    }

    const utils = requireModule('runtime.translationProviderUtils');
    const {
        DEFAULT_LOCAL_MAX_OUTPUT_TOKENS,
    } = utils;

    function readParallelCapacity(instance) {
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
            if (Number.isInteger(numeric) && numeric > 0) return numeric;
        }
        return 1;
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
                const instanceId = instance && typeof instance.id === 'string' ? instance.id.trim() : '';
                if (!instanceId) continue;
                out.push({
                    instanceId,
                    modelKey,
                    capacity: readParallelCapacity(instance),
                });
            }
        }
        return out;
    }

    function describeLoadedLlmInstances(instances) {
        const list = Array.isArray(instances) ? instances : [];
        if (!list.length) return 'none';
        return list.map((item) => {
            if (!item || typeof item.instanceId !== 'string' || typeof item.modelKey !== 'string') return '<invalid>';
            const suffix = item.capacity > 1 ? `, parallel ${item.capacity}` : '';
            return item.instanceId === item.modelKey
                ? `${item.instanceId}${suffix}`
                : `${item.instanceId} (${item.modelKey}${suffix})`;
        }).join(', ');
    }

    function getLoadedInstancesForModel(model) {
        const modelKey = model && typeof model.key === 'string' ? model.key.trim() : '';
        const loadedInstances = model && Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
        return loadedInstances
            .map((instance) => ({
                instanceId: instance && typeof instance.id === 'string' ? instance.id.trim() : '',
                modelKey,
                capacity: readParallelCapacity(instance),
            }))
            .filter((instance) => instance.instanceId);
    }

    function selectLocalChatModel(models, cfg) {
        const configuredModel = typeof cfg.model === 'string' ? cfg.model.trim() : '';
        const loadedLlmInstances = getLoadedLlmInstances(models);

        if (configuredModel.toLowerCase() === 'auto') {
            if (loadedLlmInstances.length !== 1) {
                throw new Error(
                    `settings.local.model is "auto", but LM Studio currently has ${loadedLlmInstances.length} loaded LLM instance(s): `
                    + `${describeLoadedLlmInstances(loadedLlmInstances)}. Load exactly one LLM instance or set settings.local.model to a specific loaded instance identifier.`
                );
            }
            return {
                configuredModel,
                requestedModel: loadedLlmInstances[0].instanceId,
                expectedInstanceId: loadedLlmInstances[0].instanceId,
                capacity: loadedLlmInstances[0].capacity || 1,
            };
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
                    + `${describeLoadedLlmInstances(loadedInstances)}. Set settings.local.model to a specific loaded instance identifier.`
                );
            }

            return {
                configuredModel,
                requestedModel: loadedInstances[0].instanceId,
                expectedInstanceId: loadedInstances[0].instanceId,
                capacity: loadedInstances[0].capacity || 1,
            };
        }

        const exactLoadedInstance = loadedLlmInstances.find((instance) => instance.instanceId === configuredModel);
        if (exactLoadedInstance) {
            return {
                configuredModel,
                requestedModel: exactLoadedInstance.instanceId,
                expectedInstanceId: exactLoadedInstance.instanceId,
                capacity: exactLoadedInstance.capacity || 1,
            };
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

    defineRuntimeModule('runtime.translationLocalProtocol', {
        readParallelCapacity,
        getLoadedLlmInstances,
        describeLoadedLlmInstances,
        getLoadedInstancesForModel,
        selectLocalChatModel,
        buildLocalChatBody,
        extractMessageContentFromV1,
        sanitizeLocalOutput,
        parseLocalTextOutput,
        getLocalChatResponseModelInstanceId,
        getLocalChatResponseStats,
        assertLocalChatResponseMatchesSelection,
        createThinkBlockStripper,
        createSseParser,
    });
})();
