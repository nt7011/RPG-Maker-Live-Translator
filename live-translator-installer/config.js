// Shared configuration module for translator.json and settings.json.
// The loader uses this after fetching JSON assets so the rest of the runtime can read normalized globals safely.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before config.js.');
    }

    function getScope() {
        return typeof window !== 'undefined'
            ? window
            : (typeof globalThis !== 'undefined' ? globalThis : globalScope);
    }

    function requireSettings(scope = getScope()) {
        const settings = scope && scope.LiveTranslatorSettings;
        if (settings && typeof settings === 'object') return settings;
        throw new Error('[LiveTranslator][Config] settings.json not loaded (LiveTranslatorSettings missing).');
    }

    function getTranslatorConfig(scope = getScope()) {
        try {
            const cfg = scope && scope.LiveTranslatorConfig;
            return cfg && typeof cfg === 'object' ? cfg : null;
        } catch (_) {
            return null;
        }
    }

    function getActiveProvider(scope = getScope()) {
        try {
            if (scope && scope.FORCE_LOCAL_ASYNC === true) return 'local';
        } catch (_) {}
        try {
            if (typeof process !== 'undefined' && process.env && process.env.LIVE_TRANSLATOR_LOCAL === '1') {
                return 'local';
            }
        } catch (_) {}

        const cfg = getTranslatorConfig(scope);
        if (cfg && typeof cfg.provider === 'string') {
            const provider = cfg.provider.trim().toLowerCase();
            if (provider) return provider;
        }
        return null;
    }

    function validateDeepLConfig(deepl, isActiveProvider, logger) {
        if (!deepl || typeof deepl !== 'object') {
            const msg = '[LiveTranslator][Config] translator.json missing "settings.deepl" object for DeepL provider.';
            if (isActiveProvider) throw new Error(msg);
            logger.warn(msg);
            return;
        }
        const apiKeyRaw = typeof deepl.apiKey === 'string' ? deepl.apiKey : '';
        const apiKey = apiKeyRaw.trim();

        const msgMissing = '[LiveTranslator][Config] translator.json missing "settings.deepl.apiKey"; DeepL requests will fail.';
        const msgWhitespace = '[LiveTranslator][Config] settings.deepl.apiKey contains whitespace; check copy/paste and remove spaces.';
        const msgUnderscore = '[LiveTranslator][Config] settings.deepl.apiKey contains underscore; DeepL keys typically use hyphens. Verify the key.';

        if (!apiKey) {
            if (isActiveProvider) {
                logger.error(msgMissing);
                throw new Error(msgMissing);
            }
            logger.warn(msgMissing);
            return;
        }
        if (/\s/.test(apiKeyRaw)) {
            if (isActiveProvider) {
                const err = new Error(msgWhitespace);
                logger.error(msgWhitespace);
                throw err;
            }
            logger.warn(msgWhitespace);
        }
        if (/_/.test(apiKeyRaw)) {
            if (isActiveProvider) {
                const err = new Error(msgUnderscore);
                logger.error(msgUnderscore);
                throw err;
            }
            logger.warn(msgUnderscore);
        }
    }

    function validateTextScaleSetting(raw, path, logger) {
        if (raw === undefined || raw === null || raw === '') return;

        const numeric = Number(raw);
        if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
            logger.warn(`[LiveTranslator][Config] settings.json "${path}" should be an integer from 1 to 100. Falling back to 100.`);
        }
    }

    function validateBooleanSetting(raw, path, logger) {
        if (raw === undefined || raw === null || raw === '') return;
        if (typeof raw !== 'boolean') {
            logger.warn(`[LiveTranslator][Config] settings.json "${path}" should be a boolean.`);
        }
    }

    function validateTextScaleSettings(settings, logger) {
        if (!settings || typeof settings !== 'object') return;
        validateTextScaleSetting(settings.textScaleOthers, 'textScaleOthers', logger);

        const gameMessage = settings.gameMessage;
        if (!gameMessage || typeof gameMessage !== 'object') return;
        validateTextScaleSetting(gameMessage.textScale, 'gameMessage.textScale', logger);
        validateTextScaleSetting(gameMessage.textScaleOthers, 'gameMessage.textScaleOthers', logger);
        validateBooleanSetting(gameMessage.originAwareLineBreaks, 'gameMessage.originAwareLineBreaks', logger);
    }

    function validateTranslationSettings(settings, logger) {
        if (!settings || typeof settings !== 'object') return;
        const translation = settings.translation;
        if (!translation || typeof translation !== 'object') return;

        const raw = Object.prototype.hasOwnProperty.call(translation, 'maxOutputTokens')
            ? translation.maxOutputTokens
            : translation.max_output_tokens;
        if (raw === undefined || raw === null || raw === '') return;

        const numeric = Number(raw);
        if (!Number.isInteger(numeric) || numeric <= 0) {
            logger.warn('[LiveTranslator][Config] settings.json "translation.maxOutputTokens" should be a positive integer. Falling back to 512.');
        }
    }

    function validateAssets(assets, logger) {
        const cfg = assets['translator.json'] && assets['translator.json'].json;
        if (!cfg || typeof cfg !== 'object') {
            throw new Error('[LiveTranslator][Config] translator.json missing or invalid.');
        }

        const provider = (cfg.provider || '').toString().trim().toLowerCase();
        if (!provider) {
            throw new Error('[LiveTranslator][Config] translator.json missing required "provider" string (deepl/local/none).');
        }
        if (!cfg.settings || typeof cfg.settings !== 'object') {
            throw new Error('[LiveTranslator][Config] translator.json missing required "settings" object.');
        }

        if (provider === 'deepl') {
            validateDeepLConfig(cfg.settings.deepl, true, logger);
        } else if (provider === 'local') {
            validateDeepLConfig(cfg.settings.deepl, false, logger);
            const local = cfg.settings.local;
            if (!local || typeof local !== 'object') {
                throw new Error('[LiveTranslator][Config] translator.json missing "settings.local" object for local provider.');
            } else if (!local.model || typeof local.model !== 'string' || !local.model.trim()) {
                logger.warn('[LiveTranslator][Config] translator.json missing "settings.local.model"; local LLM requests will fail.');
            }
        } else if (provider === 'none') {
            // Cache-only mode intentionally skips external provider validation.
        } else {
            throw new Error(`[LiveTranslator][Config] translator.json contains unsupported provider "${cfg.provider}".`);
        }

        const settings = assets['settings.json'] && assets['settings.json'].json;
        if (!settings || typeof settings !== 'object') {
            throw new Error('[LiveTranslator][Config] settings.json missing or invalid.');
        }
        validateTextScaleSettings(settings, logger);
        validateTranslationSettings(settings, logger);
    }

    function applyAssets(assets, options = {}) {
        const scope = options.scope || getScope();
        const logger = options.logger || console;
        if (!scope.LiveTranslatorAssets) scope.LiveTranslatorAssets = {};
        Object.assign(scope.LiveTranslatorAssets, assets);
        if (assets['translator.json'] && assets['translator.json'].json) {
            scope.LiveTranslatorConfig = assets['translator.json'].json;
        }
        if (assets['settings.json'] && assets['settings.json'].json) {
            scope.LiveTranslatorSettings = assets['settings.json'].json;
        }
        validateAssets(assets, logger);
        return {
            assets: scope.LiveTranslatorAssets,
            config: scope.LiveTranslatorConfig,
            settings: scope.LiveTranslatorSettings,
        };
    }

    defineRuntimeModule('config', {
        applyAssets,
        getActiveProvider,
        getTranslatorConfig,
        requireSettings,
        validateAssets,
    });
})();
