// Translation manager support: eligibility.
// This controller owns one scheduler/service responsibility and shares state through translation-manager.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/eligibility.js.');
    }

    function createController(scope = {}) {
        const { IGNORE_REGEX_SETTING, OVERRIDE_REGEX_SETTING, clampPriority, defaultPriorityForHook, getPositiveSetting, normalizeCacheKey, deriveCacheKeyAliases, findIgnoredTranslationRegexMatch, findOverrideTranslationRegexMatch, telemetry, disk, getCacheEntryLimit, pruneMapToLimit, precacheStore, ignoreTranslationRegexRules, overrideTranslationRegexRules, requestTimeoutMs, completed } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { request } = Object.fromEntries(['request'].map((name) => [name, callScope(name)]));

        function describeIgnoreTranslationRegex(text) {
            const raw = String(text ?? '');
            const trimmed = raw.trim();
            const ignoredMatch = findIgnoredTranslationRegexMatch(trimmed, ignoreTranslationRegexRules);
            const base = {
                skip: false,
                reason: '',
                checkedFirst: IGNORE_REGEX_SETTING,
                regexMode: 'javascript-unicode',
                regexTarget: 'trimmedTranslationSource',
                ignoreRegexCount: ignoreTranslationRegexRules.length,
                length: trimmed.length,
            };
            if (!trimmed || !ignoredMatch) return base;
            const rule = ignoredMatch.rule;
            return Object.assign(base, {
                skip: true,
                reason: IGNORE_REGEX_SETTING,
                filter: IGNORE_REGEX_SETTING,
                regex: rule.display,
                regexIndex: rule.index,
                regexFlags: rule.flags,
                regexPattern: rule.pattern,
                regexSlashForm: rule.slashForm,
                matchedText: ignoredMatch.matchText,
                matchIndex: ignoredMatch.matchIndex,
            });
        }

        function describeOverrideTranslationRegex(text) {
            const raw = String(text ?? '');
            const trimmed = raw.trim();
            const overrideMatch = findOverrideTranslationRegexMatch(trimmed, overrideTranslationRegexRules);
            const base = {
                skip: false,
                reason: '',
                checkedFirst: OVERRIDE_REGEX_SETTING,
                regexMode: 'javascript-unicode',
                regexTarget: 'trimmedTranslationSource',
                overrideRegexCount: overrideTranslationRegexRules.length,
                length: trimmed.length,
            };
            if (!trimmed || !overrideMatch) return base;
            const rule = overrideMatch.rule;
            return Object.assign(base, {
                matched: true,
                filter: OVERRIDE_REGEX_SETTING,
                source: OVERRIDE_REGEX_SETTING,
                sourceHint: OVERRIDE_REGEX_SETTING,
                regex: rule.display,
                regexIndex: rule.index,
                regexFlags: rule.flags,
                regexPattern: rule.pattern,
                regexSlashForm: rule.slashForm,
                matchedText: overrideMatch.matchText,
                matchIndex: overrideMatch.matchIndex,
                translation: overrideMatch.translation,
            });
        }

        function describeSkip(text) {
            const raw = String(text ?? '');
            const trimmed = raw.trim();
            const base = {
                skip: false,
                reason: '',
                checkedFirst: IGNORE_REGEX_SETTING,
                regexMode: 'javascript-unicode',
                regexTarget: 'trimmedTranslationSource',
                ignoreRegexCount: ignoreTranslationRegexRules.length,
                length: trimmed.length,
            };
            if (!raw) return Object.assign(base, { skip: true, reason: 'emptyInput' });
            if (!trimmed) return Object.assign(base, { skip: true, reason: 'emptyTrimmed' });
            return base;
        }

        function describeEligibility(text) {
            const override = describeOverrideTranslationRegex(text);
            if (override.matched) return override;
            const ignored = describeIgnoreTranslationRegex(text);
            if (ignored.skip) return ignored;
            return describeSkip(text);
        }

        function shouldSkip(text) {
            return describeSkip(text).skip;
        }

        function shouldIgnoreTranslation(text) {
            return describeIgnoreTranslationRegex(text).skip;
        }

        function lookupOverrideTranslationRegex(text) {
            const override = describeOverrideTranslationRegex(text);
            return override.matched ? override : null;
        }

        function logTranslationEvent(event, normalized, result = null, context = {}) {
            telemetry.logTranslation(event, normalized, result, context);
        }

        function normalizeRequest(input, maybeOptions = {}) {
            const objectInput = input && typeof input === 'object' && !Array.isArray(input)
                ? input
                : null;
            const source = objectInput ? Object.assign({}, input, maybeOptions || {}) : Object.assign({}, maybeOptions || {}, { text: input });
            const text = String(source.text ?? source.input ?? '');
            const normalized = normalizeCacheKey(text);
            const hook = source.hook ? String(source.hook) : '';
            const priority = source.priority === undefined || source.priority === null
                ? defaultPriorityForHook(hook)
                : clampPriority(source.priority);
            return {
                text,
                normalized,
                hook,
                recordId: source.recordId ? String(source.recordId) : '',
                source: source.source ? String(source.source) : '',
                stream: source.stream === true || source.mode === 'stream',
                priority,
                signal: source.signal,
                onDelta: typeof source.onDelta === 'function' ? source.onDelta : null,
                timeoutMs: getPositiveSetting({ translation: source }, ['timeoutMs', 'requestTimeoutMs', 'request_timeout_ms'], requestTimeoutMs),
                metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
            };
        }

        function requestContext(request) {
            return {
                recordId: request.recordId || '',
                hook: request.hook || '',
                source: request.source || '',
                normalizedSource: request.normalized || '',
            };
        }

        function storeCompletedTranslation(input, translated) {
            const aliases = deriveCacheKeyAliases(input);
            if (!aliases.length) return;
            const normalizedTranslation = normalizeCacheKey(translated);
            if (!normalizedTranslation || aliases.some((alias) => normalizeCacheKey(alias) === normalizedTranslation)) return;
            const limit = Number(getCacheEntryLimit());
            if (limit > 0) pruneMapToLimit(completed, limit);
            aliases.forEach((alias) => completed.set(alias, translated));
            scope.translationDiagnostics.schedulePublish();
        }

        function forgetCompletedTranslation(input, translated = '') {
            const aliases = deriveCacheKeyAliases(input);
            if (!aliases.length) return false;
            const expected = normalizeCacheKey(translated);
            let deleted = false;
            aliases.forEach((alias) => {
                if (!completed.has(alias)) return;
                if (expected && normalizeCacheKey(completed.get(alias)) !== expected) return;
                completed.delete(alias);
                deleted = true;
            });
            if (deleted) scope.translationDiagnostics.schedulePublish();
            return deleted;
        }

        function lookupCompleted(normalized) {
            const aliases = deriveCacheKeyAliases(normalized);
            for (const alias of aliases) {
                if (completed.has(alias)) {
                    return completed.get(alias);
                }
            }
            return null;
        }

        function finalizeProviderSuccess(job, translated) {
            storeCompletedTranslation(job.key, translated);
            if (disk.enabled && typeof disk.appendRecord === 'function') {
                try { disk.appendRecord(job.key, translated); } catch (_) {}
            }
        }

        function resolvePrecacheShortcut(normalized, context) {
            if (!precacheStore || typeof precacheStore.lookup !== 'function') return null;
            const hit = precacheStore.lookup(normalized);
            if (!hit || typeof hit.translation !== 'string' || !hit.translation.trim()) return null;
            storeCompletedTranslation(normalized, hit.translation);
            logTranslationEvent('precache_hit', normalized, hit.translation, Object.assign({}, context, { source: 'precache' }));
            return hit.translation;
        }

        return {
            describeIgnoreTranslationRegex,
            describeOverrideTranslationRegex,
            describeSkip,
            describeEligibility,
            shouldSkip,
            shouldIgnoreTranslation,
            lookupOverrideTranslationRegex,
            logTranslationEvent,
            normalizeRequest,
            requestContext,
            storeCompletedTranslation,
            forgetCompletedTranslation,
            lookupCompleted,
            finalizeProviderSuccess,
            resolvePrecacheShortcut,
        };
    }

    defineRuntimeModule('runtime.translationManagerEligibility', { create: createController });
})();
