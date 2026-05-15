// Translation manager support: cache.
// Owns cache keys, regex rules, and precache lookup state; translation-manager.js composes it into the public runtime module.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/cache.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before translation-manager/cache.js.');
    }

    const common = requireRuntimeModule('runtime.translationManagerCommon');
    const constants = requireRuntimeModule('runtime.translationManagerConstants');
    const textCodec = requireRuntimeModule('runtime.textCodec');
    const { IGNORE_REGEX_FLAG_ORDER, IGNORE_REGEX_SETTING, OPTIONAL_IGNORE_REGEX_FLAGS, OVERRIDE_REGEX_SETTING, SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING } = constants;
    const { noop } = common;

    function normalizeCacheKey(text) {
        return String(text ?? '').trim();
    }

    function deriveCacheKeyAliases(text) {
        const normalized = normalizeCacheKey(text);
        if (!normalized) return [];
        return [normalized];
    }

    function parseIgnoreRegexRule(rawRule) {
        const value = String(rawRule || '').trim();
        if (!value) return { pattern: '', flags: '', slashForm: false };
        if (value.charAt(0) === '/') {
            const lastSlash = value.lastIndexOf('/');
            if (lastSlash > 0 && /^[A-Za-z]*$/u.test(value.slice(lastSlash + 1))) {
                return {
                    pattern: value.slice(1, lastSlash),
                    flags: value.slice(lastSlash + 1),
                    slashForm: true,
                };
            }
        }
        return { pattern: value, flags: '', slashForm: false };
    }

    function normalizeIgnoreRegexFlags(rawFlags) {
        const seen = { u: true };
        for (const flag of String(rawFlags || '')) {
            if (!OPTIONAL_IGNORE_REGEX_FLAGS[flag]) {
                return { error: true, flags: 'u' };
            }
            seen[flag] = true;
        }
        return {
            error: false,
            flags: IGNORE_REGEX_FLAG_ORDER.filter((flag) => seen[flag]).join(''),
        };
    }

    function compileIgnoreTranslationRegexRules(settings, logger = {}) {
        const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : noop;
        const rawRules = settings && settings[IGNORE_REGEX_SETTING];
        if (rawRules === undefined || rawRules === null || rawRules === '') return [];
        if (!Array.isArray(rawRules)) {
            warn(`[LiveTranslator][Config] settings.json "${IGNORE_REGEX_SETTING}" should be an array of regex strings.`);
            return [];
        }

        const rules = [];
        rawRules.forEach((rawRule, index) => {
            if (typeof rawRule !== 'string') {
                warn(`[LiveTranslator][Config] settings.json "${IGNORE_REGEX_SETTING}[${index}]" should be a regex string.`);
                return;
            }

            const parsed = parseIgnoreRegexRule(rawRule);
            if (!parsed.pattern) {
                warn(`[LiveTranslator][Config] settings.json "${IGNORE_REGEX_SETTING}[${index}]" is empty and was ignored.`);
                return;
            }

            const normalizedFlags = normalizeIgnoreRegexFlags(parsed.flags);
            if (normalizedFlags.error) {
                warn(`[LiveTranslator][Config] settings.json "${IGNORE_REGEX_SETTING}[${index}]" has unsupported flags "${parsed.flags}". Use only i, m, or s; Unicode mode is always enabled.`);
                return;
            }

            try {
                const regex = new RegExp(parsed.pattern, normalizedFlags.flags);
                rules.push({
                    index,
                    raw: rawRule,
                    pattern: parsed.pattern,
                    flags: regex.flags,
                    display: `/${regex.source}/${regex.flags}`,
                    slashForm: parsed.slashForm,
                    regex,
                });
            } catch (error) {
                const message = error && error.message ? error.message : String(error || 'invalid regex');
                warn(`[LiveTranslator][Config] settings.json "${IGNORE_REGEX_SETTING}[${index}]" is not a valid JavaScript regex: ${message}`);
            }
        });
        return rules;
    }

    function compileOverrideTranslationRegexRules(settings, logger = {}) {
        const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : noop;
        const rawRules = settings && settings[OVERRIDE_REGEX_SETTING];
        if (rawRules === undefined || rawRules === null || rawRules === '') return [];
        if (!Array.isArray(rawRules)) {
            warn(`[LiveTranslator][Config] settings.json "${OVERRIDE_REGEX_SETTING}" should be an array of { regex, translation } objects.`);
            return [];
        }

        const rules = [];
        rawRules.forEach((rawRule, index) => {
            if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
                warn(`[LiveTranslator][Config] settings.json "${OVERRIDE_REGEX_SETTING}[${index}]" should be an object with regex and translation strings.`);
                return;
            }
            if (typeof rawRule.regex !== 'string') {
                warn(`[LiveTranslator][Config] settings.json "${OVERRIDE_REGEX_SETTING}[${index}].regex" should be a regex string.`);
                return;
            }
            if (typeof rawRule.translation !== 'string') {
                warn(`[LiveTranslator][Config] settings.json "${OVERRIDE_REGEX_SETTING}[${index}].translation" should be a translation string.`);
                return;
            }

            const parsed = parseIgnoreRegexRule(rawRule.regex);
            if (!parsed.pattern) {
                warn(`[LiveTranslator][Config] settings.json "${OVERRIDE_REGEX_SETTING}[${index}].regex" is empty and was ignored.`);
                return;
            }

            const normalizedFlags = normalizeIgnoreRegexFlags(parsed.flags);
            if (normalizedFlags.error) {
                warn(`[LiveTranslator][Config] settings.json "${OVERRIDE_REGEX_SETTING}[${index}].regex" has unsupported flags "${parsed.flags}". Use only i, m, or s; Unicode mode is always enabled.`);
                return;
            }

            try {
                const regex = new RegExp(parsed.pattern, normalizedFlags.flags);
                rules.push({
                    index,
                    raw: rawRule,
                    pattern: parsed.pattern,
                    flags: regex.flags,
                    display: `/${regex.source}/${regex.flags}`,
                    slashForm: parsed.slashForm,
                    regex,
                    translation: rawRule.translation,
                });
            } catch (error) {
                const message = error && error.message ? error.message : String(error || 'invalid regex');
                warn(`[LiveTranslator][Config] settings.json "${OVERRIDE_REGEX_SETTING}[${index}].regex" is not a valid JavaScript regex: ${message}`);
            }
        });
        return rules;
    }

    function findIgnoredTranslationRegexMatch(text, rules) {
        if (!rules || !rules.length) return null;
        const target = String(text ?? '');
        for (const rule of rules) {
            if (!rule || !rule.regex) continue;
            try {
                rule.regex.lastIndex = 0;
                const match = rule.regex.exec(target);
                if (!match) continue;
                return {
                    rule,
                    matchText: typeof match[0] === 'string' ? match[0] : '',
                    matchIndex: Number.isFinite(match.index) ? match.index : 0,
                };
            } catch (_) {}
        }
        return null;
    }

    function findOverrideTranslationRegexMatch(text, rules) {
        if (!rules || !rules.length) return null;
        const target = String(text ?? '');
        for (const rule of rules) {
            if (!rule || !rule.regex) continue;
            try {
                rule.regex.lastIndex = 0;
                const match = rule.regex.exec(target);
                if (!match) continue;
                rule.regex.lastIndex = 0;
                return {
                    rule,
                    translation: target.replace(rule.regex, rule.translation),
                    matchText: typeof match[0] === 'string' ? match[0] : '',
                    matchIndex: Number.isFinite(match.index) ? match.index : 0,
                };
            } catch (_) {}
        }
        return null;
    }

    function compileSubstitutePlaintextBeforeTranslationRules(settings, logger = {}) {
        const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : noop;
        const rawRules = settings && settings[SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING];
        if (rawRules === undefined || rawRules === null || rawRules === '') return [];
        if (!Array.isArray(rawRules)) {
            warn(`[LiveTranslator][Config] settings.json "${SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING}" should be an array of { from, to } objects.`);
            return [];
        }

        const rules = [];
        rawRules.forEach((rawRule, index) => {
            if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
                warn(`[LiveTranslator][Config] settings.json "${SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING}[${index}]" should be an object with from and to strings.`);
                return;
            }
            if (typeof rawRule.from !== 'string') {
                warn(`[LiveTranslator][Config] settings.json "${SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING}[${index}].from" should be a plaintext string.`);
                return;
            }
            if (typeof rawRule.to !== 'string') {
                warn(`[LiveTranslator][Config] settings.json "${SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING}[${index}].to" should be a plaintext string.`);
                return;
            }
            if (!rawRule.from) {
                warn(`[LiveTranslator][Config] settings.json "${SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING}[${index}].from" is empty and was ignored.`);
                return;
            }
            rules.push({
                index,
                from: rawRule.from,
                to: rawRule.to,
            });
        });
        return rules;
    }

    function applySubstitutePlaintextBeforeTranslationRules(text, rules) {
        if (!rules || !rules.length) return String(text ?? '');
        let output = String(text ?? '');
        for (const rule of rules) {
            if (!rule || !rule.from) continue;
            output = output.split(rule.from).join(rule.to);
        }
        return output;
    }

    function createCompletedTranslationMap(isIgnored) {
        const map = new Map();
        const baseHas = map.has.bind(map);
        const baseGet = map.get.bind(map);
        const shouldHide = typeof isIgnored === 'function' ? isIgnored : () => false;
        map.has = (key) => (shouldHide(key) ? false : baseHas(key));
        map.get = (key) => (shouldHide(key) ? undefined : baseGet(key));
        return map;
    }

    function createCodedRaw(value) {
        const encoded = textCodec.encodeText(String(value ?? ''));
        return String(encoded && encoded.translationText ? encoded.translationText : '').trim();
    }

    function countPlaceholders(value) {
        return textCodec.countPlaceholders(value);
    }

    function normalizePrecacheRecord(record) {
        if (!record || typeof record !== 'object') return null;
        const raw = typeof record.raw === 'string' ? record.raw : '';
        const codedRaw = normalizeCacheKey(
            typeof record.codedRaw === 'string' && record.codedRaw.trim()
                ? record.codedRaw
                : createCodedRaw(raw || record.humanized || '')
        );
        if (!codedRaw) return null;
        const translation = typeof record.codedTranslation === 'string' && record.codedTranslation.trim()
            ? record.codedTranslation
            : typeof record.translation === 'string'
                ? record.translation
                : '';
        return {
            raw,
            codedRaw,
            translation,
            source: typeof record.source === 'string' ? record.source : '',
        };
    }

    function getLoadedPrecacheRecords() {
        try {
            const assets = globalScope && globalScope.LiveTranslatorAssets;
            const asset = assets && (assets['precacher/precache.json'] || assets['precache.json']);
            if (asset && Array.isArray(asset.json)) return asset.json;
            if (Array.isArray(globalScope.LiveTranslatorPrecache)) return globalScope.LiveTranslatorPrecache;
        } catch (_) {}
        return [];
    }

    function createPrecacheStore() {
        const exact = new Map();
        let recordCount = 0;
        let translatedRecordCount = 0;

        const add = (key, record) => {
            const normalized = normalizeCacheKey(key);
            if (!normalized || exact.has(normalized)) return;
            exact.set(normalized, record);
        };

        for (const rawRecord of getLoadedPrecacheRecords()) {
            const record = normalizePrecacheRecord(rawRecord);
            if (!record) continue;
            recordCount += 1;
            if (record.translation.trim()) translatedRecordCount += 1;
            deriveCacheKeyAliases(record.codedRaw).forEach((alias) => add(alias, record));
            if (record.raw) deriveCacheKeyAliases(createCodedRaw(record.raw)).forEach((alias) => add(alias, record));
        }

        function adaptTranslation(input, record) {
            if (!record || typeof record.translation !== 'string' || !record.translation.trim()) return null;
            if (countPlaceholders(input) !== countPlaceholders(record.translation)) return null;
            return record.translation;
        }

        function lookupSingle(input) {
            const aliases = deriveCacheKeyAliases(input);
            for (const alias of aliases) {
                const record = exact.get(alias);
                const translation = adaptTranslation(alias, record);
                if (translation) {
                    return {
                        translation,
                        record,
                        source: 'precache',
                    };
                }
            }
            return null;
        }

        function lookup(input) {
            const normalized = normalizeCacheKey(input);
            if (!normalized) return null;
            return lookupSingle(normalized);
        }

        return {
            active: exact.size > 0,
            lookup,
            getStats: () => ({
                records: recordCount,
                translatedRecords: translatedRecordCount,
                exactKeys: exact.size,
            }),
        };
    }

    defineRuntimeModule('runtime.translationManagerCache', {
        normalizeCacheKey,
        deriveCacheKeyAliases,
        parseIgnoreRegexRule,
        normalizeIgnoreRegexFlags,
        compileIgnoreTranslationRegexRules,
        compileOverrideTranslationRegexRules,
        compileSubstitutePlaintextBeforeTranslationRules,
        findIgnoredTranslationRegexMatch,
        findOverrideTranslationRegexMatch,
        applySubstitutePlaintextBeforeTranslationRules,
        createCompletedTranslationMap,
        createCodedRaw,
        countPlaceholders,
        normalizePrecacheRecord,
        getLoadedPrecacheRecords,
        createPrecacheStore,
    });
})();
