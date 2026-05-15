// Text orchestrator support: eligibility.
// Owns shared text eligibility and provider dispatch decisions; the facade composes these helpers into each orchestrator instance.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/eligibility.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before runtime/text-orchestrator/eligibility.js.');
    }

    const constants = requireRuntimeModule('runtime.textOrchestratorConstants');
    const base = requireRuntimeModule('runtime.textOrchestratorBaseUtils');
    const recordUtils = requireRuntimeModule('runtime.textOrchestratorRecordUtils');
    const { DEFAULT_TEXT_ELIGIBILITY_SETTINGS } = constants;
    const { defaultPreview, firstDefined, firstString, firstNonEmptyString, pickSerializableObject, settingBoolean } = base;
    const { normalizeInputRecord, normalizeStatus } = recordUtils;

    function createTextEligibilityPolicy(settings = {}) {
        const options = readTextEligibilitySettings(settings);
        return {
            describe(input = {}, normalizedInput = null) {
                const raw = input && typeof input === 'object' ? input : {};
                const source = normalizedInput && typeof normalizedInput === 'object'
                    ? normalizedInput
                    : normalizeInputRecord(raw);
                const status = normalizeStatus(firstString(raw.status, raw.translationStatus, source.status), 'detected');
                const text = selectEligibilityText(raw, source);
                const visibleText = firstNonEmptyString(
                    source.visibleText,
                    source.original,
                    source.rawText,
                    raw.visibleText,
                    raw.original,
                    raw.text
                ) || firstString(source.visibleText, source.original, source.rawText, raw.visibleText, raw.original, raw.text);
                const hasText = hasAnyTextValue(raw, source);
                const hasExplicitSource = hasExplicitTranslationSource(raw, source);
                const reasonHint = firstString(
                    raw.skipReason,
                    raw.reason,
                    raw.metadata && raw.metadata.skipReason,
                    raw.metadata && raw.metadata.reason
                );

                if (options.skipEmpty) {
                    if (!hasText) return textEligibilityDecision(false, 'empty', 'emptyInput', '', 'policy', { hasText: false });
                    if (!String(text || '').trim()) {
                        return textEligibilityDecision(false, 'empty', hasExplicitSource ? 'emptyNormalized' : 'emptyTrimmed', text, 'policy', {
                            hasExplicitSource,
                        });
                    }
                }
                if (options.skipNative && isNativeTextInput(raw)) {
                    return textEligibilityDecision(false, 'native', reasonHint || 'native', text, 'native', {
                        explicitNative: true,
                    });
                }
                const counterLikeText = resolveCounterLikeCandidateText(visibleText, text);
                if (options.skipCounterLike && isCounterLikeText(counterLikeText)) {
                    return textEligibilityDecision(false, 'counterLike', 'counterLike', text, 'policy', {
                        visibleText,
                        counterLikeText,
                    });
                }
                if (options.skipSkipped && status === 'skipped') {
                    return textEligibilityDecision(false, 'skipped', reasonHint || 'skipped', text, 'policy', {
                        status,
                    });
                }
                const provider = describeCjkProviderEligibility(text, options);
                return textEligibilityDecision(true, 'eligible', '', text, '', {
                    status,
                }, provider);
            },
        };
    }

    function readTextEligibilitySettings(settings = {}) {
        const orchestratorSettings = settings && settings.textOrchestrator && typeof settings.textOrchestrator === 'object'
            ? settings.textOrchestrator
            : {};
        const source = settings && settings.textEligibility && typeof settings.textEligibility === 'object'
            ? settings.textEligibility
            : (orchestratorSettings.eligibility && typeof orchestratorSettings.eligibility === 'object'
                ? orchestratorSettings.eligibility
                : {});
        const cjkSource = source.cjk && typeof source.cjk === 'object' ? source.cjk : {};
        const legacyCjkDisabled = !!(settings
            && settings.translation
            && settings.translation.disableCjkFilter === true);
        const cjkFilterDefaultEnabled = !legacyCjkDisabled;
        return {
            skipEmpty: settingBoolean(source.skipEmpty, DEFAULT_TEXT_ELIGIBILITY_SETTINGS.skipEmpty),
            skipNative: settingBoolean(source.skipNative, DEFAULT_TEXT_ELIGIBILITY_SETTINGS.skipNative),
            skipCounterLike: settingBoolean(source.skipCounterLike, DEFAULT_TEXT_ELIGIBILITY_SETTINGS.skipCounterLike),
            skipSkipped: settingBoolean(source.skipSkipped, DEFAULT_TEXT_ELIGIBILITY_SETTINGS.skipSkipped),
            skipKorean: settingBoolean(
                firstDefined(cjkSource.skipKorean, source.skipKorean),
                cjkFilterDefaultEnabled && DEFAULT_TEXT_ELIGIBILITY_SETTINGS.skipKorean
            ),
            requireJapaneseOrChinese: settingBoolean(
                firstDefined(cjkSource.requireJapaneseOrChinese, source.requireJapaneseOrChinese),
                cjkFilterDefaultEnabled && DEFAULT_TEXT_ELIGIBILITY_SETTINGS.requireJapaneseOrChinese
            ),
        };
    }

    function textEligibilityDecision(eligible, category, reason, text, sourceHint, details = {}, provider = null) {
        const value = firstString(text);
        const providerDecision = provider && typeof provider === 'object'
            ? provider
            : {
                eligible: eligible === true,
                category: String(category || ''),
                reason: String(reason || ''),
                sourceHint: firstString(sourceHint),
                details: {},
            };
        return {
            eligible: eligible === true,
            skip: eligible !== true,
            category: String(category || (eligible ? 'eligible' : 'policy')),
            reason: String(reason || ''),
            sourceHint: firstString(sourceHint),
            providerEligible: providerDecision.eligible !== false,
            providerCategory: String(providerDecision.category || ''),
            providerReason: String(providerDecision.reason || ''),
            providerSourceHint: firstString(providerDecision.sourceHint),
            text: value,
            normalizedText: value.trim(),
            details: pickSerializableObject(Object.assign({}, providerDecision.details || {}, details || {}, {
                category: String(category || ''),
                reason: String(reason || ''),
                providerEligible: providerDecision.eligible !== false,
                providerCategory: String(providerDecision.category || ''),
                providerReason: String(providerDecision.reason || ''),
            })),
        };
    }

    function providerSkipDecision(eligibility) {
        return textEligibilityDecision(
            false,
            eligibility && eligibility.providerCategory ? eligibility.providerCategory : 'policy',
            eligibility && eligibility.providerReason ? eligibility.providerReason : 'translation skipped',
            firstString(eligibility && eligibility.text),
            eligibility && eligibility.providerSourceHint ? eligibility.providerSourceHint : 'policy',
            eligibility && eligibility.details ? eligibility.details : {}
        );
    }

    function providerUnavailableDecision(text) {
        return textEligibilityDecision(
            false,
            'provider',
            'cache miss in none mode',
            text,
            'none',
            {
                providerMode: 'none',
                providerRequestsEnabled: false,
            }
        );
    }

    function serviceSkipDecision(skipInfo, text) {
        const reason = firstString(skipInfo && skipInfo.reason, 'translation skipped');
        return textEligibilityDecision(
            false,
            firstString(skipInfo && skipInfo.filter, reason, 'service'),
            reason,
            text,
            firstString(skipInfo && skipInfo.sourceHint, skipInfo && skipInfo.source, reason === 'ignoreTranslationRegex' ? 'filter' : 'policy'),
            skipInfo && typeof skipInfo === 'object' ? skipInfo : {}
        );
    }

    function selectEligibilityText(raw, source) {
        if (hasExplicitTranslationSource(raw, source)) {
            return firstString(
                source && source.normalizedSource,
                source && source.translationSource,
                raw && raw.normalizedSource,
                raw && raw.translationSource
            );
        }
        return firstNonEmptyString(
            source && source.visibleText,
            source && source.original,
            source && source.rawText,
            raw && raw.visibleText,
            raw && raw.original,
            raw && raw.rawText,
            raw && raw.text
        ) || firstString(
            source && source.visibleText,
            source && source.original,
            source && source.rawText,
            raw && raw.visibleText,
            raw && raw.original,
            raw && raw.rawText,
            raw && raw.text
        );
    }

    function hasAnyTextValue(raw, source) {
        return [
            source && source.normalizedSource,
            source && source.translationSource,
            source && source.visibleText,
            source && source.original,
            source && source.rawText,
            raw && raw.normalizedSource,
            raw && raw.translationSource,
            raw && raw.visibleText,
            raw && raw.original,
            raw && raw.rawText,
            raw && raw.text,
        ].some((value) => value !== undefined && value !== null && String(value).length > 0);
    }

    function hasExplicitTranslationSource(raw, source) {
        if (source && (source.normalizedSource || source.translationSource)) return true;
        if (!raw || typeof raw !== 'object') return false;
        return Object.prototype.hasOwnProperty.call(raw, 'normalizedSource')
            || Object.prototype.hasOwnProperty.call(raw, 'translationSource');
    }

    function isNativeTextInput(raw) {
        if (!raw || typeof raw !== 'object') return false;
        if (raw.isTranslatable === false || raw.translatable === false) return true;
        if (raw.native === true || raw.keepNative === true || raw.skipTranslation === true) return true;
        const sourceHint = firstString(raw.sourceHint, raw.translationSourceKind);
        return sourceHint === 'native';
    }

    // Keep this allowlist conservative. These core RPG Maker escapes change
    // presentation, layout, or message flow, but they never expand into user-
    // visible lexical content the counter-like classifier should see.
    const NON_CONTENT_COUNTER_ESCAPE_PATTERN = /(?:\x1b|\\)(?:C\[[^\]]*\]|I\[[^\]]*\]|\{|\}|\$|\.|\||!|>|<|\^)/giu;

    function resolveCounterLikeCandidateText(visibleText, fallbackText) {
        const visible = firstString(visibleText);
        if (visible) return stripKnownCounterLikeEscapes(visible);
        return stripKnownCounterLikeEscapes(firstString(fallbackText));
    }

    function stripKnownCounterLikeEscapes(text) {
        if (text === null || text === undefined) return '';
        return String(text).replace(NON_CONTENT_COUNTER_ESCAPE_PATTERN, '').trim();
    }

    function isCounterLikeText(text) {
        const trimmed = String(text || '').trim();
        const nonSpace = trimmed.replace(/\s+/g, '');
        if (!nonSpace) return false;
        const cjkMatch = trimmed.match(/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g);
        const cjkCount = cjkMatch ? cjkMatch.length : 0;
        const hasDigit = /\d/.test(trimmed);
        const onlyNumPunct = /^[0-9()\[\]\-+/*.,:;!?\uFF05%]+$/u.test(nonSpace);
        return (
            hasDigit && cjkCount <= 1 && nonSpace.length <= 10
        ) || onlyNumPunct || /\d+\s*[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]\s*\(\d+\)/u.test(trimmed);
    }

    function describeCjkProviderEligibility(text, options = {}) {
        const trimmed = String(text || '').trim();
        const requireJapaneseOrChinese = options.requireJapaneseOrChinese === true;
        const skipKorean = options.skipKorean === true;
        const hasKorean = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF]/u.test(trimmed);
        const hasJapaneseOrChinese = /[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]/u.test(trimmed);
        const details = {
            cjkFilterEnabled: requireJapaneseOrChinese || skipKorean,
            requireJapaneseOrChinese,
            skipKorean,
            hasJapaneseOrChinese,
            hasKorean,
            length: trimmed.length,
        };
        if (!trimmed) {
            return {
                eligible: true,
                category: 'cjk',
                reason: '',
                sourceHint: '',
                details,
            };
        }
        if (skipKorean && hasKorean) {
            return {
                eligible: false,
                category: 'cjk',
                reason: 'koreanText',
                sourceHint: 'policy',
                details,
            };
        }
        if (requireJapaneseOrChinese && !hasJapaneseOrChinese) {
            return {
                eligible: false,
                category: 'cjk',
                reason: 'noJapaneseOrChinese',
                sourceHint: 'policy',
                details,
            };
        }
        let reason = '';
        if (!requireJapaneseOrChinese && !skipKorean) {
            reason = 'cjkFilterDisabled';
        } else if (requireJapaneseOrChinese && hasJapaneseOrChinese) {
            reason = 'hasJapaneseOrChinese';
        } else if (skipKorean && !hasKorean) {
            reason = 'notKoreanText';
        }
        return {
            eligible: true,
            category: 'cjk',
            reason,
            sourceHint: '',
            details,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorEligibility', {
        createTextEligibilityPolicy,
        readTextEligibilitySettings,
        textEligibilityDecision,
        providerSkipDecision,
        providerUnavailableDecision,
        serviceSkipDecision,
        selectEligibilityText,
        hasAnyTextValue,
        hasExplicitTranslationSource,
        isNativeTextInput,
        isCounterLikeText,
        describeCjkProviderEligibility,
    });
})();
