#!/usr/bin/env node

// Batch-translates precache records through the configured translation provider.
// The Precacher UI and CLI use this after extraction to fill precache.json before the game loads it.

'use strict';

const fs = require('fs');
const path = require('path');

const PRECACHER_DIR = __dirname;
const INSTALLER_DIR = path.dirname(PRECACHER_DIR);
const DEFAULT_INPUT_FILE = path.join(PRECACHER_DIR, 'precache.json');
const DEFAULT_CONFIG_FILE = path.join(INSTALLER_DIR, 'translator.json');
const DEFAULT_INPUT_TOKEN_BUDGET = 1024;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_RETRIES = 2;
const DEFAULT_WRITE_RETRIES = 20;
const BENCHMARK_INTERVAL_MS = 5000;
const TPS_WINDOW_MS = 30000;
const OUTPUT_TOKEN_CAP_MULTIPLIER = 2;
const CONTROL_CODE_PLACEHOLDER = '¤';
const RAW_CONTROL_CODE_PATTERN = /\\(?:[A-Za-z0-9_#]+|[^\s\w])(?:\[[^\]]*\]|<[^>]*>)?/gu;
const DEFAULT_BATCH_SYSTEM_PROMPT = [
    "Translate the user's text into Korean. Raw translation only, no explanations or alternative translations.",
    'Format: JSON Lines. Return one JSON Line per input line containing raw translated output. {"id":123,"translation":"translated text"}\\n',
    'Preserve every ¤ character exactly if one appears in the source text.',
].join('\n');

let atomicWriteCounter = 0;

function usage() {
    return [
        'Usage: node live-translator-installer/precacher/pretranslator.js [options]',
        '',
        'Options:',
        '  --in <file>                 Input precache JSON. Defaults to the script directory precache.json.',
        '  --config <file>             translator.json path. Defaults to the installer directory translator.json.',
        '  --concurrency <n>           Concurrent batch requests. Defaults to 1.',
        `  --input-token-budget <n>    Approximate prompt token budget per request. Defaults to ${DEFAULT_INPUT_TOKEN_BUDGET}.`,
        '  --retries <n>               Retries before splitting/failing a batch. Defaults to 2.',
        '  --system-prompt <text>      Full batch system prompt override.',
        '  --compact                   Write compact JSON instead of pretty JSON.',
        '  --overwrite                 Retranslate records even when translation is already set.',
        '  --dry-run                   Build batches and print stats without calling the model.',
        '  -h, --help                  Show this help.',
        '',
        'Notes:',
        '  Output tokens are capped at 2x the estimated request input tokens.',
    ].join('\n');
}

function parseArgs(argv) {
    const options = {
        in: DEFAULT_INPUT_FILE,
        config: DEFAULT_CONFIG_FILE,
        concurrency: DEFAULT_CONCURRENCY,
        inputTokenBudget: DEFAULT_INPUT_TOKEN_BUDGET,
        retries: DEFAULT_RETRIES,
        systemPrompt: null,
        pretty: true,
        overwrite: false,
        dryRun: false,
        help: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') {
            options.help = true;
        } else if (arg === '--compact') {
            options.pretty = false;
        } else if (arg === '--overwrite') {
            options.overwrite = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--in' || arg === '--config' || arg === '--system-prompt'
            || arg === '--concurrency' || arg === '--input-token-budget' || arg === '--retries') {
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`${arg} requires a value.`);
            }
            i += 1;
            applyOptionValue(options, arg.slice(2), value);
        } else if (arg.startsWith('--in=')) {
            options.in = arg.slice('--in='.length);
        } else if (arg.startsWith('--config=')) {
            options.config = arg.slice('--config='.length);
        } else if (arg.startsWith('--system-prompt=')) {
            options.systemPrompt = arg.slice('--system-prompt='.length);
        } else if (arg.startsWith('--concurrency=')) {
            applyOptionValue(options, 'concurrency', arg.slice('--concurrency='.length));
        } else if (arg.startsWith('--input-token-budget=')) {
            applyOptionValue(options, 'input-token-budget', arg.slice('--input-token-budget='.length));
        } else if (arg.startsWith('--retries=')) {
            applyOptionValue(options, 'retries', arg.slice('--retries='.length));
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    options.in = path.resolve(options.in);
    options.config = path.resolve(options.config);
    return options;
}

function applyOptionValue(options, name, value) {
    if (name === 'in' || name === 'config') {
        options[name] = value;
        return;
    }
    if (name === 'system-prompt') {
        options.systemPrompt = value;
        return;
    }

    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) {
        throw new Error(`--${name} must be a positive integer.`);
    }

    if (name === 'concurrency') {
        options.concurrency = numeric;
    } else if (name === 'input-token-budget') {
        options.inputTokenBudget = numeric;
    } else if (name === 'retries') {
        options.retries = numeric;
    } else {
        throw new Error(`Unsupported option: ${name}`);
    }
}

function readJsonFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '');
    try {
        return JSON.parse(text);
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        throw new Error(`Failed to parse ${filePath}: ${message}`);
    }
}

function writeJsonAtomic(filePath, value, options = {}) {
    const pretty = options.pretty !== false;
    const payload = pretty
        ? `${JSON.stringify(value, null, 2)}\n`
        : JSON.stringify(value);
    const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}-${++atomicWriteCounter}`;

    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(tmpFile, payload, 'utf8');
        fs.renameSync(tmpFile, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        throw err;
    }
}

async function writeJsonAtomicWithRetry(filePath, value, options = {}) {
    const retries = Number.isInteger(options.writeRetries) && options.writeRetries >= 0
        ? options.writeRetries
        : DEFAULT_WRITE_RETRIES;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            writeJsonAtomic(filePath, value, options);
            return;
        } catch (err) {
            lastError = err;
            if (attempt >= retries || !isRetriableFileError(err)) {
                throw err;
            }
            await sleep(Math.min(2000, 100 + attempt * 100), options.signal);
        }
    }

    throw lastError;
}

function createCheckpointWriter(filePath, value, options = {}) {
    let chain = Promise.resolve();
    return {
        save() {
            const next = chain
                .catch(() => {})
                .then(() => writeJsonAtomicWithRetry(filePath, value, options));
            chain = next;
            return next;
        },
        drain() {
            return chain;
        },
    };
}

function isRetriableFileError(err) {
    const code = err && err.code ? String(err.code) : '';
    return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}

function createAbortError() {
    const err = new Error('Translation stopped.');
    err.name = 'AbortError';
    err.code = 'ABORT_ERR';
    return err;
}

function createAbortController() {
    return typeof AbortController === 'function' ? new AbortController() : null;
}

function isAbortError(err) {
    return !!(err && (err.name === 'AbortError' || err.code === 'ABORT_ERR'));
}

function assertNotAborted(signal) {
    if (signal && signal.aborted) throw createAbortError();
}

function sleep(ms, signal) {
    assertNotAborted(signal);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        if (!signal || typeof signal.addEventListener !== 'function') return;
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(createAbortError());
        }, { once: true });
    });
}

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

function buildBatchSystemPrompt(cfg) {
    if (cfg && typeof cfg.batch_system_prompt === 'string' && cfg.batch_system_prompt.trim()) {
        return cfg.batch_system_prompt.trim();
    }
    return DEFAULT_BATCH_SYSTEM_PROMPT;
}

function buildBatchInput(items) {
    return items.map((item) => JSON.stringify({ id: item.id, text: item.text })).join('\n');
}

function estimateRequestInputTokens(items, cfg) {
    return estimateTokens(buildBatchSystemPrompt(cfg)) + estimateTokens(buildBatchInput(items));
}

function getMaxOutputTokensForBatch(items, cfg) {
    return Math.max(1, estimateRequestInputTokens(items, cfg) * OUTPUT_TOKEN_CAP_MULTIPLIER);
}

function buildLocalChatBody(items, cfg, selection) {
    const input = buildBatchInput(items);
    const systemPrompt = buildBatchSystemPrompt(cfg);
    const body = {
        input,
        stream: false,
        store: false,
        model: selection.requestedModel,
        system_prompt: systemPrompt,
        max_output_tokens: getMaxOutputTokensForBatch(items, cfg),
    };

    if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
    if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;
    if (Number.isFinite(cfg.top_k)) body.top_k = cfg.top_k;
    if (Number.isFinite(cfg.min_p)) body.min_p = cfg.min_p;
    if (Number.isFinite(cfg.repeat_penalty)) body.repeat_penalty = cfg.repeat_penalty;

    return body;
}

async function requestLocalBatch(items, cfg, selection, options = {}) {
    assertFetchAvailable();
    assertNotAborted(options.signal);
    const url = `${getLocalApiBaseUrl(cfg)}/api/v1/chat`;
    const body = buildLocalChatBody(items, cfg, selection);
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: options.signal,
        });
    } catch (err) {
        if (isAbortError(err)) throw createAbortError();
        throw new Error(`Local LLM request failed: ${formatError(err)}`);
    }

    if (!response || !response.ok) {
        const status = response ? `${response.status} ${response.statusText}` : 'no response';
        throw new Error(`Local LLM error: ${status}`);
    }

    const data = await response.json();
    assertLocalChatResponseMatchesSelection(data, selection);
    return extractMessageContent(data);
}

function assertLocalChatResponseMatchesSelection(data, selection) {
    const responseInstanceId = data && typeof data.model_instance_id === 'string'
        ? data.model_instance_id.trim()
        : '';
    if (responseInstanceId && responseInstanceId !== selection.expectedInstanceId) {
        throw new Error(
            `Local LLM responded with instance "${responseInstanceId}", but "${selection.expectedInstanceId}" was required.`
        );
    }

    const stats = data && data.stats && typeof data.stats === 'object' ? data.stats : null;
    if (stats && typeof stats.model_load_time_seconds !== 'undefined') {
        throw new Error(`Local LLM auto-loaded "${responseInstanceId || selection.expectedInstanceId}" unexpectedly.`);
    }
}

function extractMessageContent(data) {
    if (data && Array.isArray(data.output)) {
        return data.output
            .filter((item) => item && item.type === 'message' && typeof item.content === 'string')
            .map((item) => item.content)
            .join('');
    }

    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const content = choice && choice.message && typeof choice.message.content === 'string'
        ? choice.message.content
        : '';
    return content;
}

function sanitizeModelOutput(text) {
    let out = String(text || '');
    out = out.replace(/<\s*think\b[\s\S]*?>[\s\S]*?<\s*\/\s*think\s*>/gi, '');
    out = out.trim();
    out = out.replace(/^```(?:jsonl|json)?\s*([\s\S]*?)\s*```$/iu, '$1').trim();
    return out;
}

function parseBatchTranslations(text, expectedItems) {
    const cleaned = sanitizeModelOutput(text);
    if (!cleaned) {
        throw new Error('Model returned empty output.');
    }

    const rows = parseJsonRows(cleaned);
    const expectedIds = new Set(expectedItems.map((item) => item.id));
    const translations = new Map();

    for (const row of rows) {
        if (!row || typeof row !== 'object') {
            throw new Error('Model returned a non-object row.');
        }
        const id = Number(row.id);
        if (!Number.isInteger(id) || !expectedIds.has(id)) {
            throw new Error(`Model returned unexpected id: ${row.id}`);
        }
        if (translations.has(id)) {
            throw new Error(`Model returned duplicate id: ${id}`);
        }
        if (typeof row.translation !== 'string' || !row.translation.trim()) {
            throw new Error(`Model returned empty translation for id ${id}.`);
        }
        const expectedItem = expectedItems.find((item) => item.id === id);
        if (expectedItem && countControlMarkers(row.translation) !== countControlMarkers(expectedItem.text)) {
            throw new Error(`Model returned wrong ¤ count for id ${id}.`);
        }
        translations.set(id, row.translation);
    }

    for (const id of expectedIds) {
        if (!translations.has(id)) {
            throw new Error(`Model omitted id ${id}.`);
        }
    }

    return translations;
}

function parseJsonRows(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            throw new Error('Model returned JSON that was not an array.');
        }
        return parsed;
    }

    const rows = [];
    for (const line of trimmed.split(/\r?\n/)) {
        let candidate = line.trim();
        if (!candidate || candidate.startsWith('```')) continue;
        if (candidate.endsWith(',')) candidate = candidate.slice(0, -1).trim();
        rows.push(JSON.parse(candidate));
    }
    return rows;
}

function estimateTokens(text) {
    const value = String(text ?? '');
    if (!value) return 0;
    return Math.ceil(value.length * 1.15);
}

function createCodedRaw(value) {
    return String(value ?? '').replace(RAW_CONTROL_CODE_PATTERN, CONTROL_CODE_PLACEHOLDER).trim();
}

function countControlMarkers(value) {
    const matches = String(value ?? '').match(new RegExp(CONTROL_CODE_PLACEHOLDER, 'g'));
    return matches ? matches.length : 0;
}

function getRecordCodedRaw(record) {
    if (!record || typeof record !== 'object') return '';
    if (typeof record.codedRaw === 'string' && record.codedRaw.trim()) {
        return record.codedRaw.trim();
    }
    if (typeof record.raw === 'string') {
        return createCodedRaw(record.raw);
    }
    if (typeof record.humanized === 'string') {
        return record.humanized.trim();
    }
    return '';
}

function getRecordCodedTranslation(record) {
    if (!record || typeof record !== 'object') return '';
    if (typeof record.codedTranslation === 'string' && record.codedTranslation.trim()) {
        return record.codedTranslation;
    }
    const codedRaw = getRecordCodedRaw(record);
    const legacyTranslation = typeof record.translation === 'string' ? record.translation : '';
    if (legacyTranslation.trim() && countControlMarkers(legacyTranslation) === countControlMarkers(codedRaw)) {
        return legacyTranslation;
    }
    return '';
}

function collectTranslationJobs(records, options = {}) {
    const knownByCodedRaw = new Map();
    let reused = 0;

    if (!options.overwrite) {
        records.forEach((record) => {
            if (!record || typeof record !== 'object') return;
            const text = getRecordCodedRaw(record);
            const translation = getRecordCodedTranslation(record);
            if (text && translation.trim() && !knownByCodedRaw.has(text)) {
                knownByCodedRaw.set(text, translation);
            }
        });

        records.forEach((record) => {
            if (!record || typeof record !== 'object') return;
            const text = getRecordCodedRaw(record);
            const translation = getRecordCodedTranslation(record);
            if (!text || translation.trim() || !knownByCodedRaw.has(text)) return;
            record.codedRaw = text;
            record.codedTranslation = knownByCodedRaw.get(text);
            reused += 1;
        });
    }

    const byText = new Map();
    records.forEach((record, index) => {
        if (!record || typeof record !== 'object') return;
        const text = getRecordCodedRaw(record);
        if (!text) return;
        record.codedRaw = text;
        const existingTranslation = getRecordCodedTranslation(record);
        if (existingTranslation && record.codedTranslation !== existingTranslation) {
            record.codedTranslation = existingTranslation;
        }
        if (!options.overwrite && existingTranslation.trim()) return;

        if (!byText.has(text)) {
            byText.set(text, { id: byText.size + 1, text, recordIndexes: [] });
        }
        byText.get(text).recordIndexes.push(index);
    });

    return {
        jobs: Array.from(byText.values()),
        reused,
    };
}

function buildBatches(jobs, inputTokenBudget, cfg) {
    const batches = [];
    let current = [];
    let currentTokens = estimateTokens(buildBatchSystemPrompt(cfg));

    for (const job of jobs) {
        const itemTokens = estimateTokens(JSON.stringify({ id: job.id, text: job.text })) + 1;
        if (current.length && currentTokens + itemTokens > inputTokenBudget) {
            batches.push(current);
            current = [];
            currentTokens = estimateTokens(buildBatchSystemPrompt(cfg));
        }
        current.push(job);
        currentTokens += itemTokens;
    }

    if (current.length) batches.push(current);
    return batches;
}

function applyTranslations(records, jobsById, translations) {
    let updatedRecords = 0;
    for (const [id, translation] of translations.entries()) {
        const job = jobsById.get(id);
        if (!job) continue;
        for (const recordIndex of job.recordIndexes) {
            if (!records[recordIndex] || typeof records[recordIndex] !== 'object') continue;
            records[recordIndex].codedTranslation = translation;
            updatedRecords += 1;
        }
    }
    return updatedRecords;
}

function sumJobTokens(items) {
    let total = 0;
    for (const item of Array.isArray(items) ? items : []) {
        if (!item) continue;
        total += estimateTokens(item.text);
    }
    return total;
}

function sumTranslatedTokens(translations, jobsById) {
    let total = 0;
    for (const id of translations.keys()) {
        const job = jobsById.get(id);
        if (job) total += estimateTokens(job.text);
    }
    return total;
}

function pruneTokenSamples(samples, now, windowMs = TPS_WINDOW_MS) {
    if (!Array.isArray(samples)) return [];
    const cutoff = now - windowMs;
    while (samples.length && samples[0].at < cutoff) {
        samples.shift();
    }
    return samples;
}

function recordSuccessfulTokens(stats, tokenCount, now = Date.now()) {
    const tokens = Number(tokenCount);
    if (!stats || !Number.isFinite(tokens) || tokens <= 0) return;
    stats.successfulTokens += tokens;
    if (!Array.isArray(stats.tokenSamples)) stats.tokenSamples = [];
    stats.tokenSamples.push({ at: now, tokens });
    pruneTokenSamples(stats.tokenSamples, now, stats.tpsWindowMs);
}

function getRecentTokenCount(stats, now = Date.now()) {
    if (!stats || !Array.isArray(stats.tokenSamples)) return 0;
    const samples = pruneTokenSamples(stats.tokenSamples, now, stats.tpsWindowMs);
    return samples.reduce((total, sample) => total + sample.tokens, 0);
}

function getRecentTokensPerSecond(stats, now = Date.now()) {
    if (!stats) return 0;
    const windowMs = Number.isFinite(stats.tpsWindowMs) && stats.tpsWindowMs > 0
        ? stats.tpsWindowMs
        : TPS_WINDOW_MS;
    const startedAt = Number.isFinite(stats.startedAt) ? stats.startedAt : now;
    const elapsedMs = Math.max(1, now - startedAt);
    const divisorSeconds = Math.max(0.001, Math.min(windowMs, elapsedMs) / 1000);
    return getRecentTokenCount(stats, now) / divisorSeconds;
}

function getRemainingTokenCount(stats) {
    if (!stats) return 0;
    const total = Number.isFinite(stats.totalTokens) ? stats.totalTokens : 0;
    const successful = Number.isFinite(stats.successfulTokens) ? stats.successfulTokens : 0;
    const failed = Number.isFinite(stats.failedTokens) ? stats.failedTokens : 0;
    return Math.max(0, total - successful - failed);
}

function getEtaSeconds(stats, tokensPerSecond) {
    const remainingTokens = getRemainingTokenCount(stats);
    if (remainingTokens <= 0) return 0;
    const rate = Number(tokensPerSecond);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return Math.ceil(remainingTokens / rate);
}

function createProgressSnapshot(stats, event, extra = {}) {
    const now = Date.now();
    const tokensPerSecond = getRecentTokensPerSecond(stats, now);
    const remainingTokens = getRemainingTokenCount(stats);
    return {
        event,
        totalTokens: stats.totalTokens,
        successfulTokens: stats.successfulTokens,
        failedTokens: stats.failedTokens,
        remainingTokens,
        recentTokens: getRecentTokenCount(stats, now),
        tokensPerSecond,
        etaSeconds: getEtaSeconds(stats, tokensPerSecond),
        tpsWindowSeconds: Math.round((stats.tpsWindowMs || TPS_WINDOW_MS) / 1000),
        completedBatches: stats.completedBatches,
        translatedJobs: stats.translatedJobs,
        updatedRecords: stats.updatedRecords,
        splitBatches: stats.splitBatches,
        activeWorkers: stats.activeBatches,
        queueLength: stats.getQueueLength(),
        failed: stats.getFailedCount(),
        totalBatches: stats.totalBatches,
        pendingJobs: stats.pendingJobs,
        ...extra,
    };
}

function emitProgress(stats, options, event, extra = {}) {
    if (!options || typeof options.onProgress !== 'function') return;
    try {
        options.onProgress(createProgressSnapshot(stats, event, extra));
    } catch (_) {}
}

function createBenchmarkReporter(stats, options = {}) {
    const intervalMs = Number.isInteger(options.intervalMs) && options.intervalMs > 0
        ? options.intervalMs
        : BENCHMARK_INTERVAL_MS;
    let timer = null;

    const snapshot = () => {
        const progress = createProgressSnapshot(stats, 'benchmark');
        const percent = stats.totalTokens > 0
            ? (stats.successfulTokens / stats.totalTokens) * 100
            : 100;

        log(
            `Benchmark: ${formatNumber(stats.successfulTokens)}/${formatNumber(stats.totalTokens)} est source tokens `
            + `translated (${percent.toFixed(1)}%) | ${progress.tokensPerSecond.toFixed(1)} tok/s last `
            + `${progress.tpsWindowSeconds}s | ETA ${formatEta(progress.etaSeconds)} | `
            + `${stats.completedBatches} batch(es) saved | active ${stats.activeBatches} | queue ${stats.getQueueLength()} | `
            + `failed ${stats.getFailedCount()}`
        );
        emitProgress(stats, options, 'benchmark');
    };

    timer = setInterval(snapshot, intervalMs);
    if (timer && typeof timer.unref === 'function') timer.unref();

    return {
        snapshot,
        stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        },
    };
}

function splitBatch(items) {
    const midpoint = Math.max(1, Math.floor(items.length / 2));
    return [items.slice(0, midpoint), items.slice(midpoint)].filter((part) => part.length);
}

function formatEta(seconds) {
    const numeric = Number(seconds);
    if (!Number.isFinite(numeric) || numeric < 0) return '-';
    const totalSeconds = Math.ceil(numeric);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const remainderSeconds = totalSeconds % 60;
    if (minutes < 60) return remainderSeconds
        ? `${minutes}m ${remainderSeconds}s`
        : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainderMinutes = minutes % 60;
    return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
}

async function translateWithRetries(items, cfg, selection, options = {}) {
    const retries = Number.isInteger(options.retries) && options.retries >= 0 ? options.retries : DEFAULT_RETRIES;
    let lastError = null;
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        assertNotAborted(options.signal);
        try {
            const output = await requestLocalBatch(items, cfg, selection, options);
            return parseBatchTranslations(output, items);
        } catch (err) {
            if (isAbortError(err)) throw err;
            lastError = err;
            if (attempt <= retries) {
                log(`Batch of ${items.length} failed attempt ${attempt}/${retries + 1}: ${formatError(err)}`);
            }
        }
    }
    throw lastError;
}

async function translatePrecache(options = {}) {
    assertNotAborted(options.signal);
    const records = readJsonFile(options.in);
    if (!Array.isArray(records)) {
        throw new Error(`${options.in} must contain a JSON array.`);
    }

    const cfg = normalizeLocalConfig(readJsonFile(options.config));
    if (typeof options.systemPrompt === 'string' && options.systemPrompt.trim()) {
        cfg.batch_system_prompt = options.systemPrompt.trim();
    }
    const collected = collectTranslationJobs(records, options);
    const checkpointWriter = createCheckpointWriter(options.in, records, options);
    if (collected.reused > 0 && !options.dryRun) {
        await checkpointWriter.save();
    }

    const batches = buildBatches(collected.jobs, options.inputTokenBudget, cfg);
    const totalTokens = sumJobTokens(collected.jobs);
    log(`Loaded ${records.length} records.`);
    if (collected.reused > 0) {
        log(`Reused ${collected.reused} translations from duplicate coded raw text.`);
    }
    log(`Pending unique texts: ${collected.jobs.length}.`);
    log(`Built ${batches.length} batch(es) with approx input token budget ${options.inputTokenBudget}.`);

    if (options.dryRun || collected.jobs.length === 0) {
        return {
            records,
            totalRecords: records.length,
            pendingJobs: collected.jobs.length,
            batches: batches.length,
            totalTokens,
            successfulTokens: 0,
            translatedJobs: 0,
            failedJobs: [],
            dryRun: !!options.dryRun,
        };
    }

    const selection = await resolveLocalChatModelSelection(cfg, options);
    log(`Using loaded model instance: ${selection.expectedInstanceId}`);
    log(`Concurrency: ${options.concurrency}. Output token cap: 2x estimated request input tokens.`);

    const jobsById = new Map(collected.jobs.map((job) => [job.id, job]));
    const queue = batches.map((items, index) => ({ items, label: String(index + 1) }));
    const failedJobs = [];
    const stats = {
        startedAt: Date.now(),
        totalTokens,
        totalBatches: batches.length,
        pendingJobs: collected.jobs.length,
        successfulTokens: 0,
        failedTokens: 0,
        tokenSamples: [],
        tpsWindowMs: TPS_WINDOW_MS,
        completedBatches: 0,
        translatedJobs: 0,
        updatedRecords: 0,
        splitBatches: 0,
        activeBatches: 0,
        getQueueLength: () => queue.length,
        getFailedCount: () => failedJobs.length,
    };
    emitProgress(stats, options, 'started');
    const benchmark = createBenchmarkReporter(stats, options);

    async function worker(workerId) {
        while (queue.length) {
            assertNotAborted(options.signal);
            const batch = queue.shift();
            if (!batch || !batch.items.length) continue;

            let translations = null;
            let progressEvent = 'batch_finished';
            try {
                stats.activeBatches += 1;
                emitProgress(stats, options, 'batch_started', { batch: batch.label });
                log(`Worker ${workerId}: translating batch ${batch.label} (${batch.items.length} text(s))`);
                translations = await translateWithRetries(batch.items, cfg, selection, options);
            } catch (err) {
                if (isAbortError(err)) throw err;
                if (batch.items.length > 1) {
                    const parts = splitBatch(batch.items);
                    stats.splitBatches += 1;
                    progressEvent = 'batch_split';
                    log(`Worker ${workerId}: splitting batch ${batch.label} after failure: ${formatError(err)}`);
                    for (let i = parts.length - 1; i >= 0; i -= 1) {
                        queue.unshift({ items: parts[i], label: `${batch.label}.${i + 1}` });
                    }
                } else {
                    const item = batch.items[0];
                    failedJobs.push({
                        id: item.id,
                        text: item.text,
                        error: formatError(err),
                    });
                    stats.failedTokens += estimateTokens(item.text);
                    progressEvent = 'job_failed';
                    log(`Worker ${workerId}: failed id ${item.id}: ${formatError(err)}`);
                }
                continue;
            } finally {
                stats.activeBatches = Math.max(0, stats.activeBatches - 1);
                emitProgress(stats, options, progressEvent, { batch: batch.label });
            }

            const updated = applyTranslations(records, jobsById, translations);
            const translatedTokenCount = sumTranslatedTokens(translations, jobsById);
            try {
                await checkpointWriter.save();
            } catch (err) {
                throw new Error(`Checkpoint write failed after batch ${batch.label}: ${formatError(err)}`);
            }
            stats.completedBatches += 1;
            stats.translatedJobs += translations.size;
            stats.updatedRecords += updated;
            recordSuccessfulTokens(stats, translatedTokenCount);
            log(`Worker ${workerId}: saved batch ${batch.label} (${translations.size} text(s), ${updated} record(s))`);
            emitProgress(stats, options, 'batch_saved', { batch: batch.label });
        }
    }

    const workerCount = Math.max(1, Math.min(options.concurrency, Math.max(1, batches.length)));
    try {
        await Promise.all(Array.from({ length: workerCount }, (_, idx) => worker(idx + 1)));
        await checkpointWriter.drain();
    } finally {
        benchmark.stop();
        benchmark.snapshot();
        emitProgress(stats, options, 'finished');
    }

    return {
        records,
        totalRecords: records.length,
        pendingJobs: collected.jobs.length,
        batches: batches.length,
        translatedJobs: stats.translatedJobs,
        updatedRecords: stats.updatedRecords,
        successfulTokens: stats.successfulTokens,
        failedTokens: stats.failedTokens,
        splitBatches: stats.splitBatches,
        failedJobs,
        dryRun: false,
    };
}

function formatError(err) {
    if (!err) return 'unknown error';
    return err && err.message ? err.message : String(err);
}

function log(message) {
    console.log(`[PrecacheTranslator] ${message}`);
}

function formatNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return Math.round(numeric).toLocaleString('en-US');
}

async function runCli(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        console.log(usage());
        return 0;
    }

    const result = await translatePrecache(options);
    if (result.dryRun) {
        log('Dry run complete; no model requests were sent.');
    } else {
        log(`Translated ${result.translatedJobs} unique text(s), updated ${result.updatedRecords || 0} record(s).`);
    }
    if (result.failedJobs && result.failedJobs.length) {
        log(`Failed ${result.failedJobs.length} unique text(s). Rerun after fixing the cause to resume.`);
        return 1;
    }
    return 0;
}

if (require.main === module) {
    runCli(process.argv.slice(2))
        .then((code) => { process.exitCode = code; })
        .catch((err) => {
            console.error(`[PrecacheTranslator] ${formatError(err)}`);
            process.exitCode = 1;
        });
}

module.exports = {
    buildBatchInput,
    buildBatchSystemPrompt,
    buildBatches,
    collectTranslationJobs,
    createAbortController,
    createCheckpointWriter,
    DEFAULT_BATCH_SYSTEM_PROMPT,
    estimateTokens,
    getEtaSeconds,
    getRecentTokensPerSecond,
    getMaxOutputTokensForBatch,
    getLoadedLlmInstances,
    normalizeLocalConfig,
    parseArgs,
    parseBatchTranslations,
    requestLocalModelCatalog,
    resolveLocalChatModelSelection,
    translatePrecache,
    writeJsonAtomicWithRetry,
};
