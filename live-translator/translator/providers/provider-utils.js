// Shared provider configuration, abort, HTTP, and output helpers.
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
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translator/providers/provider-utils.js.');
    }


    const DEFAULT_LOCAL_MAX_OUTPUT_TOKENS = 512;
    const DEFAULT_MODEL_CATALOG_TTL_MS = 5000;
    const DEFAULT_MODEL_CATALOG_TIMEOUT_MS = 5000;
    const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
    const DEFAULT_DEEPL_TARGET_LANG = 'KO';

    function noop() {}

    function bindLogger(logger = {}) {
        return {
            debug: typeof logger.debug === 'function' ? logger.debug.bind(logger) : noop,
            warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : noop,
            error: typeof logger.error === 'function' ? logger.error.bind(logger) : noop,
        };
    }

    function getGlobalSettings() {
        const settings = globalScope && globalScope.LiveTranslatorSettings;
        return settings && typeof settings === 'object' ? settings : {};
    }

    function getGlobalTranslatorConfig() {
        const cfg = globalScope && globalScope.LiveTranslatorConfig;
        return cfg && typeof cfg === 'object' ? cfg : null;
    }

    function getFetch(options = {}) {
        const fetchImpl = options.fetch || options.fetchImpl || globalScope.fetch;
        if (typeof fetchImpl !== 'function') {
            throw new Error('[LiveTranslator] global fetch is unavailable.');
        }
        try {
            return fetchImpl.bind(globalScope);
        } catch (_) {
            return fetchImpl;
        }
    }

    function finiteNumber(value, fallback = null) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function positiveInteger(value, fallback) {
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
    }

    function normalizeProviderName(value) {
        return typeof value === 'string' && value.trim()
            ? value.trim().toLowerCase()
            : '';
    }

    function getTranslationSettings(settings) {
        return settings && settings.translation && typeof settings.translation === 'object'
            ? settings.translation
            : {};
    }

    function getSettingValue(settings, keys, fallback) {
        const translation = getTranslationSettings(settings);
        for (const key of keys) {
            if (translation && Object.prototype.hasOwnProperty.call(translation, key)) {
                return translation[key];
            }
        }
        return fallback;
    }

    function resolveLocalMaxOutputTokens(localConfig, settings) {
        const translation = getTranslationSettings(settings);
        const candidates = [
            translation.maxOutputTokens,
            translation.max_output_tokens,
            localConfig && localConfig.max_output_tokens,
            localConfig && localConfig.maxOutputTokens,
            localConfig && localConfig.max_tokens,
            localConfig && localConfig.maxTokens,
        ];

        for (const value of candidates) {
            const numeric = Number(value);
            if (Number.isInteger(numeric) && numeric > 0) return numeric;
        }

        return DEFAULT_LOCAL_MAX_OUTPUT_TOKENS;
    }

    function normalizeLocalConfig(rootConfig = {}, settings = {}) {
        const root = rootConfig && typeof rootConfig === 'object' ? rootConfig : {};
        const source = root.settings && root.settings.local && typeof root.settings.local === 'object'
            ? root.settings.local
            : root.local && typeof root.local === 'object'
                ? root.local
                : root;

        const out = {
            address: source.address || source.Address || '127.0.0.1',
            port: positiveInteger(source.port || source.Port, 1234),
            model: typeof source.model === 'string' ? source.model.trim() : '',
            system_prompt: source.system_prompt || source.systemPrompt || source.SystemPrompt || '',
            temperature: finiteNumber(source.temperature || source.Temperature, 0.2),
            top_k: finiteNumber(source.top_k || source.TopK, null),
            repeat_penalty: finiteNumber(source.repeat_penalty || source.repeatPenalty || source.repetition_penalty, null),
            min_p: finiteNumber(source.min_p || source.MinP, null),
            top_p: finiteNumber(source.top_p || source.TopP, 0.95),
            max_output_tokens: resolveLocalMaxOutputTokens(source, settings),
            model_catalog_ttl_ms: positiveInteger(
                source.model_catalog_ttl_ms || source.modelCatalogTtlMs,
                positiveInteger(getSettingValue(settings, ['modelCatalogTtlMs', 'model_catalog_ttl_ms'], null), DEFAULT_MODEL_CATALOG_TTL_MS)
            ),
            model_catalog_timeout_ms: positiveInteger(
                source.model_catalog_timeout_ms || source.modelCatalogTimeoutMs,
                positiveInteger(getSettingValue(settings, ['modelCatalogTimeoutMs', 'model_catalog_timeout_ms'], null), DEFAULT_MODEL_CATALOG_TIMEOUT_MS)
            ),
            request_timeout_ms: positiveInteger(
                source.request_timeout_ms || source.requestTimeoutMs,
                positiveInteger(getSettingValue(settings, ['requestTimeoutMs', 'request_timeout_ms'], null), DEFAULT_REQUEST_TIMEOUT_MS)
            ),
        };

        if (!out.model) {
            throw new Error('translator.json missing required "settings.local.model" field.');
        }
        if (!Number.isFinite(out.port) || out.port <= 0) {
            throw new Error('translator.json has invalid "settings.local.port" (must be a positive number).');
        }

        for (const key of ['temperature', 'top_p', 'top_k', 'min_p', 'repeat_penalty']) {
            if (out[key] !== null && !Number.isFinite(out[key])) {
                throw new Error(`translator.json has invalid "settings.local.${key}" (must be a number).`);
            }
        }

        return out;
    }

    function normalizeDeepLConfig(rootConfig = {}, settings = {}) {
        const root = rootConfig && typeof rootConfig === 'object' ? rootConfig : {};
        const source = root.settings && root.settings.deepl && typeof root.settings.deepl === 'object'
            ? root.settings.deepl
            : root.deepl && typeof root.deepl === 'object'
                ? root.deepl
                : root;
        const language = source.language || source.targetLang || source.lang || DEFAULT_DEEPL_TARGET_LANG;
        const apiKey = typeof source.apiKey === 'string' ? source.apiKey.trim() : '';
        const timeoutMs = positiveInteger(
            source.request_timeout_ms || source.requestTimeoutMs,
            positiveInteger(getSettingValue(settings, ['requestTimeoutMs', 'request_timeout_ms'], null), DEFAULT_REQUEST_TIMEOUT_MS)
        );

        if (!apiKey) {
            throw new Error('translator.json missing required "settings.deepl.apiKey" value for DeepL provider.');
        }
        if (typeof language !== 'string' || !language.trim()) {
            throw new Error('translator.json missing required DeepL target language (settings.deepl.language).');
        }

        return {
            language: language.trim(),
            apiKey,
            timeoutMs,
        };
    }

    function createAbortError(reason) {
        const message = reason && reason.message ? reason.message : (reason || 'The operation was aborted.');
        const error = new Error(String(message));
        try { error.name = 'AbortError'; } catch (_) {}
        try { error.code = 'ABORT_ERR'; } catch (_) {}
        return error;
    }

    function createTimeoutError(timeoutMs) {
        const error = new Error(`Translation request timed out after ${timeoutMs}ms.`);
        try { error.name = 'TimeoutError'; } catch (_) {}
        try { error.code = 'ETIMEDOUT'; } catch (_) {}
        try { error.retryable = true; } catch (_) {}
        return error;
    }

    function isAbortErrorLike(error) {
        if (!error) return false;
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return true;
        const message = typeof error.message === 'string' ? error.message : String(error);
        return /\bAbortError\b/i.test(message) || /\baborted\b/i.test(message);
    }

    function createLinkedAbort(options = {}) {
        const parentSignal = options.signal || null;
        const timeoutMs = positiveInteger(options.timeoutMs, 0);
        if (typeof AbortController !== 'function') {
            return {
                signal: parentSignal || undefined,
                cleanup: noop,
                getAbortReason: () => null,
            };
        }

        const controller = new AbortController();
        let abortReason = null;
        let timeoutId = null;
        let parentAbortHandler = null;

        const abort = (reason) => {
            if (controller.signal.aborted) return;
            abortReason = reason || createAbortError();
            try {
                controller.abort(abortReason);
            } catch (_) {
                try { controller.abort(); } catch (_) {}
            }
        };

        if (parentSignal) {
            if (parentSignal.aborted) {
                abort(parentSignal.reason || createAbortError());
            } else if (typeof parentSignal.addEventListener === 'function') {
                parentAbortHandler = () => abort(parentSignal.reason || createAbortError());
                parentSignal.addEventListener('abort', parentAbortHandler, { once: true });
            }
        }

        if (timeoutMs > 0) {
            timeoutId = setTimeout(() => abort(createTimeoutError(timeoutMs)), timeoutMs);
        }

        return {
            signal: controller.signal,
            cleanup() {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                if (parentSignal && parentAbortHandler && typeof parentSignal.removeEventListener === 'function') {
                    try { parentSignal.removeEventListener('abort', parentAbortHandler); } catch (_) {}
                }
                parentAbortHandler = null;
            },
            getAbortReason() {
                return abortReason || (controller.signal && controller.signal.reason) || null;
            },
        };
    }

    function coerceFetchError(error, linkedAbort = null, fallbackMessage = 'Request failed') {
        const abortReason = linkedAbort && typeof linkedAbort.getAbortReason === 'function'
            ? linkedAbort.getAbortReason()
            : null;
        if (abortReason && abortReason.code === 'ETIMEDOUT') return abortReason;
        if (isAbortErrorLike(error)) return createAbortError(abortReason || error);
        return new Error(`${fallbackMessage}: ${error && error.message ? error.message : error}`);
    }

    function markHttpError(error, status, retryAfter) {
        try { error.status = status; } catch (_) {}
        try {
            if (retryAfter !== null && retryAfter !== undefined && retryAfter !== '') {
                const numeric = Number(retryAfter);
                if (Number.isFinite(numeric) && numeric > 0) error.retryAfter = numeric;
            }
        } catch (_) {}
        try {
            error.retryable = status === 429 || (status >= 500 && status <= 599);
        } catch (_) {}
        return error;
    }

    function getLocalApiBaseUrl(cfg) {
        return `http://${cfg.address}:${cfg.port}`;
    }

    defineRuntimeModule('runtime.translationProviderUtils', {
        DEFAULT_LOCAL_MAX_OUTPUT_TOKENS,
        DEFAULT_MODEL_CATALOG_TTL_MS,
        DEFAULT_MODEL_CATALOG_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS,
        DEFAULT_DEEPL_TARGET_LANG,
        noop,
        bindLogger,
        getGlobalSettings,
        getGlobalTranslatorConfig,
        getFetch,
        finiteNumber,
        positiveInteger,
        normalizeProviderName,
        normalizeLocalConfig,
        normalizeDeepLConfig,
        createAbortError,
        createTimeoutError,
        isAbortErrorLike,
        createLinkedAbort,
        coerceFetchError,
        markHttpError,
        getLocalApiBaseUrl,
    });
})();
