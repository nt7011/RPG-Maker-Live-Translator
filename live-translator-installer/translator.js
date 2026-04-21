
(() => {
    'use strict';

    const DEFAULT_LOCAL_MAX_OUTPUT_TOKENS = 512;
    const TRANSLATOR_CONFIG = initializeTranslatorConfig();
    const logger = (() => {
        try {
            if (typeof globalThis !== 'undefined'
                && globalThis.LiveTranslatorModules
                && typeof globalThis.LiveTranslatorModules.createLoggerBundle === 'function') {
                const bundle = globalThis.LiveTranslatorModules.createLoggerBundle({
                    settings: (typeof globalThis.LiveTranslatorSettings === 'object' && globalThis.LiveTranslatorSettings) || {},
                    maxLogsPerFrame: 1000,
                });
                return bundle && bundle.logger ? bundle.logger : console;
            }
        } catch (_) {}
        return console;
    })();

    const TextProcessor = {
        // Unified translator function (DeepL or Local LLM based on config)
        async translateText(text, targetLang = null) {
            try {
                const [first] = await TextProcessor.translateMany([text], targetLang);
                return typeof first === 'string' ? first : '';
            } catch (error) {
                logger.error('Translation error:', error);
                throw error;
            }
        },

        async translateTextStream(text, options = {}) {
            if (TRANSLATOR_CONFIG.provider === 'none') {
                return String(text ?? '');
            }
            if (TRANSLATOR_CONFIG.provider !== 'local') {
                throw new Error('Streaming translation is only supported for the local provider.');
            }
            return translateOneLocalStream(String(text), TRANSLATOR_CONFIG.settings.local, options);
        },

        async validateConfiguredLocalModel() {
            if (TRANSLATOR_CONFIG.provider !== 'local') {
                return null;
            }
            return resolveLocalChatModelSelection(TRANSLATOR_CONFIG.settings.local);
        },

        async translateMany(texts, targetLang = null) {
            const items = Array.isArray(texts) ? texts : [texts];
            try {
                if (TRANSLATOR_CONFIG.provider === 'none') {
                    return items.map((t) => String(t));
                }

                // For local LLM, map single-item path directly
                if (TRANSLATOR_CONFIG.provider === 'local') {
                    return Promise.all(items.map((t) => translateOneLocal(String(t), TRANSLATOR_CONFIG.settings.local)));
                }

                // DeepL batch path (preferred)
                return await translateManyDeepL(
                    items.map((t) => String(t)),
                    resolveTargetLang(targetLang),
                    resolveDeepLKey()
                );
            } catch (error) {
                logger.error('Translation error:', error);
                throw error;
            }
        },

        // Main processing function
        process(text, type = 'generic') {
            // Template - add your processing logic here
            console.log(`[SecondaryScript] Processing ${type}: ${text}`);
            return `[${type.toUpperCase()}]`;
        }
    };

    // Helpers
    function resolveDeepLKey() {
        const key = TRANSLATOR_CONFIG
            && TRANSLATOR_CONFIG.settings
            && TRANSLATOR_CONFIG.settings.deepl
            && typeof TRANSLATOR_CONFIG.settings.deepl.apiKey === 'string'
                ? TRANSLATOR_CONFIG.settings.deepl.apiKey.trim()
                : '';
        if (!key) {
            throw new Error('translator.json missing required settings.deepl.apiKey while DeepL provider is active.');
        }
        return key;
    }

    function normalizeLocalConfig(cfg) {
        const out = {
            address: cfg.Address || cfg.address || '127.0.0.1',
            port: Number(cfg.port || cfg.Port || 1234),
            model: cfg.model || cfg.Model || null,
            system_prompt: cfg.system_prompt || cfg.systemPrompt || cfg.SystemPrompt || '',
            temperature: valueOrDefault(cfg.temperature || cfg.Temperature, 0.2),
            top_k: valueOrDefault(cfg.top_k || cfg.TopK, null),
            repeat_penalty: valueOrDefault(cfg.repeat_penalty || cfg.repeatPenalty || cfg.repetition_penalty, null),
            min_p: valueOrDefault(cfg.min_p || cfg.MinP, null),
            top_p: valueOrDefault(cfg.top_p || cfg.TopP, 0.95),
            max_output_tokens: resolveLocalMaxOutputTokens(cfg),
            separate_multiline_requests: Boolean(
                cfg.separate_multiline_requests
                || cfg.separateMultilineRequests
                || cfg.separate_multiline
            )
        };

        if (!out.model || typeof out.model !== 'string' || !out.model.trim()) {
            throw new Error('translator.json missing required "settings.local.model" field.');
        }
        if (!Number.isFinite(out.port) || out.port <= 0) {
            throw new Error('translator.json has invalid "settings.local.port" (must be a positive number).');
        }

        // Guard optional sampling params: ensure they are finite numbers when present
        for (const key of ['temperature', 'top_p', 'top_k', 'min_p', 'repeat_penalty']) {
            if (out[key] !== null && !Number.isFinite(out[key])) {
                throw new Error(`translator.json has invalid "settings.local.${key}" (must be a number).`);
            }
        }

        return out;
    }

    function resolveLocalMaxOutputTokens(cfg) {
        const settings = getGlobalSettings();
        const translation = settings && settings.translation && typeof settings.translation === 'object'
            ? settings.translation
            : null;
        const candidates = [
            translation ? translation.maxOutputTokens : undefined,
            translation ? translation.max_output_tokens : undefined,
            cfg ? cfg.max_output_tokens : undefined,
            cfg ? cfg.maxOutputTokens : undefined,
            cfg ? cfg.max_tokens : undefined,
            cfg ? cfg.maxTokens : undefined,
        ];

        for (const value of candidates) {
            const numeric = Number(value);
            if (Number.isInteger(numeric) && numeric > 0) {
                return numeric;
            }
        }

        return DEFAULT_LOCAL_MAX_OUTPUT_TOKENS;
    }

    function valueOrDefault(v, def) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    function getGlobalSettings() {
        if (typeof globalThis === 'undefined') return {};
        const settings = globalThis.LiveTranslatorSettings;
        return settings && typeof settings === 'object' ? settings : {};
    }

    function isAbortErrorLike(error) {
        if (!error) return false;
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return true;
        const message = typeof error.message === 'string' ? error.message : String(error);
        return /\bAbortError\b/i.test(message) || /\baborted\b/i.test(message);
    }

    function coerceAbortError(error) {
        if (!isAbortErrorLike(error)) return null;
        if (error && error.name === 'AbortError') return error;
        const message = error && error.message ? error.message : 'The operation was aborted.';
        const abortError = new Error(message);
        try { abortError.name = 'AbortError'; } catch (_) {}
        try { abortError.code = 'ABORT_ERR'; } catch (_) {}
        return abortError;
    }

    // DeepL implementation (batch)
    async function translateManyDeepL(texts, targetLang, apiKey) {
        try {
            const body = new URLSearchParams();
            texts.forEach(t => body.append('text', String(t)));
            body.append('target_lang', targetLang);

            const response = await fetch('https://api-free.deepl.com/v2/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `DeepL-Auth-Key ${apiKey}`
                },
                body: body.toString()
            });

            if (!response.ok) {
                const err = new Error(`DeepL API error: ${response.status} ${response.statusText}`);
                try { err.status = response.status; } catch (_) {}
                try {
                    const ra = response.headers && response.headers.get ? response.headers.get('Retry-After') : null;
                    if (ra) err.retryAfter = Number(ra);
                } catch (_) {}
                throw err;
            }

            const data = await response.json();
            const arr = (data && Array.isArray(data.translations)) ? data.translations : [];
            return arr.map(o => (o && typeof o.text === 'string') ? o.text : '');
        } catch (error) {
            console.error('Translation error (DeepL):', error);
            throw error;
        }
    }

    async function translateOneLocal(text, cfg) {
        const sourceText = String(text ?? '');
        const lines = sourceText.split(/\r?\n/);

        if (cfg && cfg.separate_multiline_requests && lines.length > 1) {
            const perLine = await Promise.all(lines.map((line) => {
                if (!line) return '';
                return translateOneLocal(line, { ...cfg, separate_multiline_requests: false });
            }));
            return perLine.join('\n');
        }

        const body = buildLocalChatBody(sourceText, cfg, false);
        const data = await requestLocalChat(body, cfg);

        const messageContent = extractMessageContentFromV1(data);
        return parseLocalTextOutput(messageContent);
    }

    async function translateOneLocalStream(text, cfg, options = {}) {
        const sourceText = String(text ?? '');
        const lines = sourceText.split(/\r?\n/);
        const onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
        const signal = options.signal;

        if (cfg && cfg.separate_multiline_requests && lines.length > 1) {
            const outputs = new Array(lines.length);
            const tasks = lines.map((line, idx) => {
                if (!line) {
                    outputs[idx] = '';
                    return Promise.resolve('');
                }
                return translateOneLocalStream(line, { ...cfg, separate_multiline_requests: false }, {
                    signal,
                    onDelta: (partial) => {
                        outputs[idx] = partial || '';
                        if (onDelta) onDelta(outputs.join('\n'));
                    }
                }).then((finalLine) => {
                    outputs[idx] = finalLine || '';
                    return finalLine;
                });
            });
            const finalLines = await Promise.all(tasks);
            return finalLines.join('\n');
        }

        const body = buildLocalChatBody(sourceText, cfg, true);
        const streamResult = await requestLocalChatStream(body, cfg, onDelta, signal);
        const messageContent = streamResult && streamResult.finalMessage
            ? streamResult.finalMessage
            : streamResult && streamResult.accumulatedMessage
                ? streamResult.accumulatedMessage
                : '';
        const parsedOutput = parseLocalTextOutput(messageContent);
        if (!parsedOutput) {
            const err = new Error('Local LLM stream returned no usable text.');
            try { err.code = 'EMPTY_STREAM_OUTPUT'; } catch (_) {}
            try { err.streamHadDelta = !!(streamResult && streamResult.accumulatedMessage); } catch (_) {}
            try { err.streamHadFinal = !!(streamResult && streamResult.finalMessage); } catch (_) {}
            throw err;
        }
        return parsedOutput;
    }

    function buildLocalChatBody(sourceText, cfg, stream) {
        const systemPrompt = typeof cfg.system_prompt === 'string' ? cfg.system_prompt : '';
        const body = {
            input: String(sourceText ?? ''),
            stream: !!stream,
            store: false
        };
        if (systemPrompt) body.system_prompt = systemPrompt;
        if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
        if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;
        if (Number.isFinite(cfg.top_k)) body.top_k = cfg.top_k;
        if (Number.isFinite(cfg.min_p)) body.min_p = cfg.min_p;
        if (Number.isFinite(cfg.repeat_penalty)) body.repeat_penalty = cfg.repeat_penalty;
        const maxOut = Number.isFinite(cfg.max_output_tokens)
            ? cfg.max_output_tokens
            : (Number.isFinite(cfg.max_tokens) ? cfg.max_tokens : DEFAULT_LOCAL_MAX_OUTPUT_TOKENS);
        body.max_output_tokens = maxOut;
        return body;
    }

    function getLocalApiBaseUrl(cfg) {
        return `http://${cfg.address}:${cfg.port}`;
    }

    async function requestLocalModelCatalog(cfg) {
        const url = `${getLocalApiBaseUrl(cfg)}/api/v1/models`;
        let resp;
        try {
            resp = await fetch(url, { method: 'GET' });
        } catch (e) {
            throw new Error(`Local LLM model list request failed: ${e && e.message ? e.message : e}`);
        }
        if (!resp || !resp.ok) {
            const status = resp ? `${resp.status} ${resp.statusText}` : 'no response';
            throw new Error(`Local LLM model list error: ${status}`);
        }
        const data = await resp.json();
        if (!data || !Array.isArray(data.models)) {
            throw new Error('Local LLM models response missing required "models" array.');
        }
        return data.models;
    }

    function getLoadedLlmInstances(models) {
        const out = [];
        const list = Array.isArray(models) ? models : [];
        for (const model of list) {
            if (!model || model.type !== 'llm' || typeof model.key !== 'string' || !model.key.trim()) {
                continue;
            }
            const loadedInstances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
            for (const instance of loadedInstances) {
                const instanceId = instance && typeof instance.id === 'string' ? instance.id.trim() : '';
                if (!instanceId) continue;
                out.push({
                    instanceId,
                    modelKey: model.key.trim()
                });
            }
        }
        return out;
    }

    function describeLoadedLlmInstances(instances) {
        const list = Array.isArray(instances) ? instances : [];
        if (!list.length) return 'none';
        return list.map((item) => {
            if (!item || typeof item.instanceId !== 'string' || typeof item.modelKey !== 'string') {
                return '<invalid>';
            }
            return item.instanceId === item.modelKey
                ? item.instanceId
                : `${item.instanceId} (${item.modelKey})`;
        }).join(', ');
    }

    function getLoadedInstancesForModel(model) {
        const modelKey = model && typeof model.key === 'string' ? model.key.trim() : '';
        const loadedInstances = model && Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
        return loadedInstances
            .map((instance) => ({
                instanceId: instance && typeof instance.id === 'string' ? instance.id.trim() : '',
                modelKey
            }))
            .filter((instance) => instance.instanceId);
    }

    async function resolveLocalChatModelSelection(cfg) {
        const configuredModel = typeof cfg.model === 'string' ? cfg.model.trim() : '';
        const models = await requestLocalModelCatalog(cfg);
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
                expectedInstanceId: loadedLlmInstances[0].instanceId
            };
        }

        const exactModel = models.find((model) => model && typeof model.key === 'string' && model.key.trim() === configuredModel);
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
                expectedInstanceId: loadedInstances[0].instanceId
            };
        }

        const exactLoadedInstance = loadedLlmInstances.find((instance) => instance.instanceId === configuredModel);
        if (exactLoadedInstance) {
            return {
                configuredModel,
                requestedModel: exactLoadedInstance.instanceId,
                expectedInstanceId: exactLoadedInstance.instanceId
            };
        }

        throw new Error(`Configured local model "${configuredModel}" was not found in LM Studio /api/v1/models.`);
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

    async function requestLocalChat(body, cfg) {
        const selection = await resolveLocalChatModelSelection(cfg);
        const url = `${getLocalApiBaseUrl(cfg)}/api/v1/chat`;
        const requestBody = { ...body, model: selection.requestedModel };
        let resp;
        try {
            resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
        } catch (e) {
            throw new Error(`Local LLM request failed: ${e && e.message ? e.message : e}`);
        }
        if (!resp || !resp.ok) {
            const status = resp ? `${resp.status} ${resp.statusText}` : 'no response';
            throw new Error(`Local LLM error: ${status}`);
        }
        const data = await resp.json();
        assertLocalChatResponseMatchesSelection(data, selection);
        return data;
    }

    async function requestLocalChatStream(body, cfg, onDelta, signal) {
        const selection = await resolveLocalChatModelSelection(cfg);
        const url = `${getLocalApiBaseUrl(cfg)}/api/v1/chat`;
        const requestBody = { ...body, model: selection.requestedModel };
        let resp;
        try {
            resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal
            });
        } catch (e) {
            const abortError = coerceAbortError(e);
            if (abortError) throw abortError;
            throw new Error(`Local LLM request failed: ${e && e.message ? e.message : e}`);
        }
        if (!resp || !resp.ok) {
            const status = resp ? `${resp.status} ${resp.statusText}` : 'no response';
            throw new Error(`Local LLM error: ${status}`);
        }
        if (!resp.body || typeof resp.body.getReader !== 'function') {
            throw new Error('Local LLM streaming unavailable: response body missing.');
        }

        const decoder = new TextDecoder('utf-8');
        const reader = resp.body.getReader();
        const sse = createSseParser();
        const thinkStripper = createThinkBlockStripper();
        let accumulatedMessage = '';
        let finalMessage = '';
        let lastPartial = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const events = sse.feed(chunk);
                for (const evt of events) {
                    if (!evt) continue;
                    if (evt.type === 'model_load.start') {
                        const instanceId = typeof evt.model_instance_id === 'string' && evt.model_instance_id.trim()
                            ? evt.model_instance_id.trim()
                            : selection.expectedInstanceId;
                        throw new Error(
                            `Local LLM auto-loaded "${instanceId}" unexpectedly. The configured model must already be loaded in LM Studio.`
                        );
                    } else if (evt.type === 'chat.start' && typeof evt.model_instance_id === 'string' && evt.model_instance_id.trim()) {
                        const responseInstanceId = evt.model_instance_id.trim();
                        if (responseInstanceId !== selection.expectedInstanceId) {
                            throw new Error(
                                `Local LLM stream started with instance "${responseInstanceId}", but "${selection.expectedInstanceId}" was required.`
                            );
                        }
                    } else if (evt.type === 'message.delta' && typeof evt.content === 'string') {
                        const cleaned = thinkStripper.feed(evt.content);
                        if (cleaned) {
                            accumulatedMessage += cleaned;
                            if (onDelta && accumulatedMessage !== lastPartial) {
                                lastPartial = accumulatedMessage;
                                onDelta(accumulatedMessage);
                            }
                        }
                    } else if (evt.type === 'chat.end' && evt.result) {
                        assertLocalChatResponseMatchesSelection(evt.result, selection);
                        finalMessage = extractMessageContentFromV1(evt.result);
                    }
                }
            }
        } catch (e) {
            const abortError = coerceAbortError(e);
            if (abortError) throw abortError;
            throw e;
        } finally {
            try { reader.releaseLock(); } catch (_) {}
        }

        return { accumulatedMessage, finalMessage };
    }

    function extractMessageContentFromV1(data) {
        const output = data && Array.isArray(data.output)
            ? data.output
            : (data && data.result && Array.isArray(data.result.output) ? data.result.output : []);
        const messages = output.filter((item) => item && item.type === 'message' && typeof item.content === 'string');
        return messages.map((item) => item.content).join('');
    }

    function parseLocalTextOutput(content) {
        try {
            return sanitizeLocalOutput(String(content || ''));
        } catch (e) {
            console.error('[Local LLM] Output sanitize error:', e);
            return '';
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
                let i = 0;
                while (i < input.length) {
                    if (!state.inThink) {
                        const idx = lowerInput.indexOf('<think', i);
                        if (idx === -1) {
                            out += input.slice(i);
                            break;
                        }
                        out += input.slice(i, idx);
                        const endTag = input.indexOf('>', idx);
                        if (endTag === -1) {
                            state.inThink = true;
                            break;
                        }
                        state.inThink = true;
                        i = endTag + 1;
                    } else {
                        const endIdx = lowerInput.indexOf('</think', i);
                        if (endIdx === -1) {
                            break;
                        }
                        const endTag = input.indexOf('>', endIdx);
                        if (endTag === -1) {
                            break;
                        }
                        state.inThink = false;
                        i = endTag + 1;
                    }
                }
                return out;
            }
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
                    const idx = match.index;
                    const raw = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + match[0].length);
                    const lines = raw.split(/\r?\n/);
                    const dataLines = [];
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            dataLines.push(line.slice(5).trimStart());
                        }
                    }
                    if (!dataLines.length) continue;
                    const dataStr = dataLines.join('\n');
                    try {
                        const obj = JSON.parse(dataStr);
                        events.push(obj);
                    } catch (_) {
                        // ignore malformed event
                    }
                }
                return events;
            }
        };
    }

    // Strip non-translation wrapper content some local LLMs emit.
    function sanitizeLocalOutput(s) {
        if (typeof s !== 'string') return '';
        let out = s;
        // Remove <think> ... </think> blocks (including attributes), case-insensitive, multiline
        out = out.replace(/<\s*think\b[\s\S]*?>[\s\S]*?<\s*\/\s*think\s*>/gi, '');
        // Also remove any self-closing <think .../> just in case
        out = out.replace(/<\s*think\b[\s\S]*?\/>/gi, '');
        // Some models still wrap plain-text output in a fenced block.
        out = out.replace(/^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/u, '$1');
        // Trim leftover whitespace
        out = out.trim();
        return out;
    }

    function initializeTranslatorConfig() {
        const root = getGlobalTranslatorConfig();
        const providerRaw = root && root.provider;
        if (typeof providerRaw !== 'string' || !providerRaw.trim()) {
            throw new Error('translator.json missing required "provider" value.');
        }
        const provider = providerRaw.trim().toLowerCase();
        const settings = root.settings && typeof root.settings === 'object' ? root.settings : {};
        const config = { provider, settings: {} };

        if (provider === 'local') {
            if (!settings.local || typeof settings.local !== 'object') {
                throw new Error('translator.json missing required "settings.local" section for local provider.');
            }
            config.settings.local = normalizeLocalConfig(settings.local);
        } else if (provider === 'deepl') {
            const deeplConfig = normalizeDeepLConfig(settings.deepl);
            if (!deeplConfig.apiKey) {
                throw new Error('translator.json missing required "settings.deepl.apiKey" value for DeepL provider.');
            }
            config.settings.deepl = deeplConfig;
        } else if (provider === 'none') {
            // Cache-only mode: serve only entries already present in translation-cache.log.
        } else {
            throw new Error(`translator.json contains unsupported provider "${providerRaw}".`);
        }

        if (provider === 'local' && settings.deepl && typeof settings.deepl === 'object') {
            config.settings.deepl = normalizeDeepLConfig(settings.deepl);
        }

        return config;
    }

    function getGlobalTranslatorConfig() {
        if (typeof globalThis === 'undefined' || !globalThis.LiveTranslatorConfig) {
            throw new Error('LiveTranslatorConfig global not found. Ensure translator.json is loaded before translator.js.');
        }
        const cfg = globalThis.LiveTranslatorConfig;
        if (!cfg || typeof cfg !== 'object') {
            throw new Error('LiveTranslatorConfig is not an object.');
        }
        return cfg;
    }

    function normalizeDeepLConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') {
            throw new Error('translator.json missing required "settings.deepl" section.');
        }
        const language = cfg.language || cfg.targetLang || cfg.lang;
        if (typeof language !== 'string' || !language.trim()) {
            throw new Error('translator.json missing required DeepL target language (settings.deepl.language).');
        }
        const apiKey = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '';
        return {
            language: language.trim(),
            apiKey
        };
    }

    function resolveTargetLang(overrideLang) {
        if (typeof overrideLang === 'string' && overrideLang.trim()) {
            return overrideLang.trim();
        }
        if (!TRANSLATOR_CONFIG.settings.deepl) {
            throw new Error('DeepL target language unavailable. Check translator.json settings.deepl.');
        }
        return TRANSLATOR_CONFIG.settings.deepl.language;
    }


    // Export for Node.js/NW.js environment
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = TextProcessor;
    }

    // Also make available globally
    if (typeof window !== 'undefined') {
        window.TextProcessor = TextProcessor;
    }

    return TextProcessor;

})();
