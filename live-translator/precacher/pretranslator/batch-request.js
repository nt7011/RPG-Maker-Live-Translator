'use strict';

// Batch request helpers convert jobs into LM Studio JSONL prompts and validate the response shape.

const {
    CONTROL_CODE_PLACEHOLDER,
    DEFAULT_BATCH_SYSTEM_PROMPT,
    OUTPUT_TOKEN_CAP_MULTIPLIER,
    RAW_CONTROL_CODE_PATTERN,
} = require('./constants');
const { assertNotAborted, createAbortError, isAbortError } = require('./abort');
const { assertFetchAvailable, getLocalApiBaseUrl } = require('./local-model');
const { formatError } = require('./formatting');

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
            throw new Error(`Model returned wrong control-code marker count for id ${id}.`);
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

module.exports = {
    buildBatchInput,
    buildBatchSystemPrompt,
    countControlMarkers,
    buildLocalChatBody,
    createCodedRaw,
    estimateRequestInputTokens,
    estimateTokens,
    extractMessageContent,
    getMaxOutputTokensForBatch,
    parseBatchTranslations,
    parseJsonRows,
    requestLocalBatch,
    sanitizeModelOutput,
};
