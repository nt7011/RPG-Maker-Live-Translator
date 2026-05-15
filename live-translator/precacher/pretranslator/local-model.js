'use strict';

// LM Studio discovery and model-selection checks live here before chat requests are sent.

const { assertNotAborted, createAbortError, isAbortError } = require('./abort');
const { formatError } = require('./formatting');

function normalizeLocalConfig(rootConfig) {
    if (!rootConfig || typeof rootConfig !== 'object') {
        throw new Error('translator.json is missing or invalid.');
    }
    const provider = typeof rootConfig.provider === 'string'
        ? rootConfig.provider.trim().toLowerCase()
        : '';
    if (provider !== 'local') {
        throw new Error('pretranslator only supports translator.json provider "local".');
    }

    const settings = rootConfig.settings && typeof rootConfig.settings === 'object'
        ? rootConfig.settings
        : {};
    const cfg = settings.local && typeof settings.local === 'object'
        ? settings.local
        : null;
    if (!cfg) {
        throw new Error('translator.json missing required settings.local object.');
    }

    const out = {
        address: cfg.Address || cfg.address || '127.0.0.1',
        port: Number(cfg.port || cfg.Port || 1234),
        model: cfg.model || cfg.Model || null,
        temperature: optionalNumber(cfg.temperature || cfg.Temperature),
        top_p: optionalNumber(cfg.top_p || cfg.TopP),
        top_k: optionalNumber(cfg.top_k || cfg.TopK),
        min_p: optionalNumber(cfg.min_p || cfg.MinP),
        repeat_penalty: optionalNumber(cfg.repeat_penalty || cfg.repeatPenalty || cfg.repetition_penalty),
    };

    if (!out.model || typeof out.model !== 'string' || !out.model.trim()) {
        throw new Error('translator.json missing required settings.local.model.');
    }
    if (!Number.isFinite(out.port) || out.port <= 0) {
        throw new Error('translator.json has invalid settings.local.port.');
    }
    return out;
}

function optionalNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function getLocalApiBaseUrl(cfg) {
    return `http://${cfg.address}:${cfg.port}`;
}

async function requestLocalModelCatalog(cfg, options = {}) {
    assertFetchAvailable();
    assertNotAborted(options.signal);
    const url = `${getLocalApiBaseUrl(cfg)}/api/v1/models`;
    let response;
    try {
        response = await fetch(url, { method: 'GET', signal: options.signal });
    } catch (err) {
        if (isAbortError(err)) throw createAbortError();
        throw new Error(`Local LLM model list request failed: ${formatError(err)}`);
    }
    if (!response || !response.ok) {
        const status = response ? `${response.status} ${response.statusText}` : 'no response';
        throw new Error(`Local LLM model list error: ${status}`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.models)) {
        throw new Error('Local LLM models response missing required "models" array.');
    }
    return data.models;
}

function assertFetchAvailable() {
    if (typeof fetch !== 'function') {
        throw new Error('This tool requires a Node.js runtime with global fetch support.');
    }
}

function getLoadedLlmInstances(models) {
    const out = [];
    for (const model of Array.isArray(models) ? models : []) {
        if (!model || model.type !== 'llm' || typeof model.key !== 'string' || !model.key.trim()) {
            continue;
        }
        const modelKey = model.key.trim();
        const instances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
        for (const instance of instances) {
            const instanceId = instance && typeof instance.id === 'string' ? instance.id.trim() : '';
            if (instanceId) out.push({ instanceId, modelKey });
        }
    }
    return out;
}

function describeLoadedLlmInstances(instances) {
    const list = Array.isArray(instances) ? instances : [];
    if (!list.length) return 'none';
    return list.map((item) => item.instanceId === item.modelKey
        ? item.instanceId
        : `${item.instanceId} (${item.modelKey})`).join(', ');
}

async function resolveLocalChatModelSelection(cfg, options = {}) {
    const configuredModel = String(cfg.model || '').trim();
    const models = await requestLocalModelCatalog(cfg, options);
    const loadedInstances = getLoadedLlmInstances(models);

    if (configuredModel.toLowerCase() === 'auto') {
        if (loadedInstances.length !== 1) {
            throw new Error(
                `settings.local.model is "auto", but LM Studio has ${loadedInstances.length} loaded LLM instance(s): `
                + `${describeLoadedLlmInstances(loadedInstances)}.`
            );
        }
        return {
            requestedModel: loadedInstances[0].instanceId,
            expectedInstanceId: loadedInstances[0].instanceId,
        };
    }

    const exactModel = models.find((model) => model
        && typeof model.key === 'string'
        && model.key.trim() === configuredModel);
    if (exactModel) {
        const instances = getLoadedLlmInstances([exactModel]);
        if (!instances.length) {
            throw new Error(`Configured model "${configuredModel}" is not loaded in LM Studio.`);
        }
        if (instances.length > 1) {
            throw new Error(
                `Configured model "${configuredModel}" has ${instances.length} loaded instances: `
                + `${describeLoadedLlmInstances(instances)}. Set settings.local.model to an instance id.`
            );
        }
        return {
            requestedModel: instances[0].instanceId,
            expectedInstanceId: instances[0].instanceId,
        };
    }

    const exactInstance = loadedInstances.find((instance) => instance.instanceId === configuredModel);
    if (exactInstance) {
        return {
            requestedModel: exactInstance.instanceId,
            expectedInstanceId: exactInstance.instanceId,
        };
    }

    throw new Error(`Configured model "${configuredModel}" was not found in LM Studio /api/v1/models.`);
}

module.exports = {
    assertFetchAvailable,
    describeLoadedLlmInstances,
    getLoadedLlmInstances,
    getLocalApiBaseUrl,
    normalizeLocalConfig,
    optionalNumber,
    requestLocalModelCatalog,
    resolveLocalChatModelSelection,
};
