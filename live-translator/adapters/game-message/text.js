// Game message adapter support: text.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/text.js.');
    }

    function createController(scope = {}) {
        const { BREAK_SENTINEL_PREFIX, BREAK_SENTINEL_SUFFIX, RAW_BREAK_PATTERN, SOFT_BREAK_PATTERN, NO_SPACE_LINE_JOIN_PATTERN, SENTINEL_BOUNDARY_PATTERN, preview, stripControls, encodeText, restoreText, logEscape } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { getGameMessageForWindow, getVerifiedMessageOrigin, readMessageOriginText, warn } = Object.fromEntries(['getGameMessageForWindow', 'getVerifiedMessageOrigin', 'readMessageOriginText', 'warn'].map((name) => [name, callScope(name)]));

        /**
         * Read the message adapter text scale setting.
         */
        function resolveGameMessageTextScale(config) {
            const gameMessage = config && typeof config.gameMessage === 'object' ? config.gameMessage : null;
            const numeric = Number(gameMessage && gameMessage.textScale);
            return Number.isInteger(numeric) && numeric >= 1 && numeric <= 100 ? numeric : 100;
        }

        /**
         * Read whether authored hard line breaks should survive conversion cleanup.
         */
        function resolveGameMessageOriginAwareLineBreaks(config) {
            const gameMessage = config && typeof config.gameMessage === 'object' ? config.gameMessage : null;
            const raw = gameMessage && gameMessage.originAwareLineBreaks;
            return raw === true || (typeof raw === 'string' && raw.trim().toLowerCase() === 'true');
        }

        function resolveEnableForesight(config) {
            return !(config && typeof config === 'object' && config.enableForesight === false);
        }

        /**
         * Create a private token that survives convertEscapeCharacters.
         */
        function createBreakToken(index) {
            return `${BREAK_SENTINEL_PREFIX}${index}${BREAK_SENTINEL_SUFFIX}`;
        }

        /**
         * Replace authored message breaks with sentinels before escape conversion.
         */
        function createBreakMap(rawText) {
            const breaks = [];
            const markedText = String(rawText || '').replace(RAW_BREAK_PATTERN, (value) => {
                const token = createBreakToken(breaks.length);
                breaks.push({ token, value });
                return token;
            });
            return {
                markedText,
                breaks,
                hadHardMessageBreaks: breaks.length > 0,
                originAware: true,
            };
        }

        /**
         * Count exact token appearances to verify conversion kept our sentinels intact.
         */
        function countTokenOccurrences(text, token) {
            if (!token) return 0;
            let count = 0;
            let index = String(text || '').indexOf(token);
            while (index !== -1) {
                count += 1;
                index = String(text || '').indexOf(token, index + token.length);
            }
            return count;
        }

        /**
         * Find the previous non-horizontal-whitespace character for soft-break cleanup.
         */
        function previousNonHorizontalWhitespace(text, index) {
            for (let i = index - 1; i >= 0; i -= 1) {
                const character = text.charAt(i);
                if (character !== ' ' && character !== '\t' && character !== '\v') return character;
            }
            return '';
        }

        /**
         * Find the next non-horizontal-whitespace character for soft-break cleanup.
         */
        function nextNonHorizontalWhitespace(text, index) {
            for (let i = index; i < text.length; i += 1) {
                const character = text.charAt(i);
                if (character !== ' ' && character !== '\t' && character !== '\v') return character;
            }
            return '';
        }

        /**
         * Decide whether a conversion-created soft break should collapse without a space.
         */
        function shouldJoinSoftBreakWithoutSpace(before, after) {
            if (!before || !after) return true;
            if (SENTINEL_BOUNDARY_PATTERN.test(before) || SENTINEL_BOUNDARY_PATTERN.test(after)) return true;
            return NO_SPACE_LINE_JOIN_PATTERN.test(before) && NO_SPACE_LINE_JOIN_PATTERN.test(after);
        }

        /**
         * Collapse layout-generated breaks while preserving normal word spacing.
         */
        function collapseGameMessageSoftBreaks(text) {
            const source = String(text || '');
            return source
                .replace(SOFT_BREAK_PATTERN, (match, offset) => {
                    const before = previousNonHorizontalWhitespace(source, offset);
                    const after = nextNonHorizontalWhitespace(source, offset + match.length);
                    return shouldJoinSoftBreakWithoutSpace(before, after) ? '' : ' ';
                })
                .replace(/[ \t\v]{2,}/g, ' ');
        }

        /**
         * Restore authored hard breaks after escape conversion, when sentinels are reliable.
         */
        function normalizeConvertedMessageText(convertedText, breakMap) {
            const converted = String(convertedText || '');
            if (!breakMap || !breakMap.originAware || !Array.isArray(breakMap.breaks)) {
                return { reliable: false, text: converted, messageBreakInfo: null };
            }

            for (const item of breakMap.breaks) {
                if (!item || countTokenOccurrences(converted, item.token) !== 1) {
                    return { reliable: false, text: converted, messageBreakInfo: null };
                }
            }

            let text = collapseGameMessageSoftBreaks(converted);
            breakMap.breaks.forEach((item) => {
                text = text.replace(item.token, item.value);
            });
            return {
                reliable: true,
                text,
                messageBreakInfo: {
                    originAware: true,
                    hadHardMessageBreaks: !!breakMap.hadHardMessageBreaks,
                    hardBreakCount: breakMap.breaks.length,
                },
            };
        }

        /**
         * Remove accidental layout breaks from restored translations when the source had none.
         */
        function sanitizeRestoredMessageText(text, payload) {
            if (typeof text !== 'string') return text;
            const info = payload && payload.messageBreakInfo;
            if (info && info.originAware && !info.hadHardMessageBreaks) {
                return collapseGameMessageSoftBreaks(text);
            }
            return text;
        }

        /**
         * Build a translation payload that preserves RPG Maker control codes.
         */
        function createEscapeAwarePayload(rawText, contextName = 'message', options = {}) {
            const resolved = String(rawText || '');
            const visible = stripControls(resolved).trim();
            if (!visible) return null;

            let codecState = null;
            let translationSource = visible;
            try {
                codecState = encodeText(resolved);
                translationSource = codecState && codecState.translationText
                    ? String(codecState.translationText || '')
                    : visible;
            } catch (error) {
                warn(`[GameMessage ${contextName}] encodeText failed; using stripped text.`, error);
            }

            return {
                resolved,
                visible,
                codecState,
                translationSource,
                normalizedTranslationSource: String(translationSource || '').trim(),
                messageBreakInfo: options.messageBreakInfo || null,
                messageOrigin: options.messageOrigin || null,
                rawText: options.rawText !== undefined ? String(options.rawText || '') : resolved,
            };
        }

        /**
         * Restore translated text into the original control-code shape.
         */
        function restoreMessageText(translated, payload) {
            if (!payload) return translated;
            try {
                const restored = restoreText(translated, payload.codecState);
                if (typeof restored === 'string' && restored.length) return sanitizeRestoredMessageText(restored, payload);
            } catch (error) {
                warn('[GameMessage] restoreText failed; falling back to stripped translated text.', error);
            }
            const stripped = stripControls(translated || '').trim();
            logEscape('debug', 'restoreText threw; using stripped translated text as fallback.', {
                strippedPreview: preview(stripped),
            });
            return sanitizeRestoredMessageText(stripped || payload.resolved, payload);
        }

        /**
         * Restore streaming partial output without treating failures as fatal.
         */
        function restoreStreamingText(translated, payload) {
            if (!payload || typeof translated !== 'string') return translated;
            if (!payload.codecState) return sanitizeRestoredMessageText(translated, payload);
            try {
                const restored = restoreText(translated, payload.codecState);
                return sanitizeRestoredMessageText(typeof restored === 'string' ? restored : translated, payload);
            } catch (_) {
                return sanitizeRestoredMessageText(translated, payload);
            }
        }

        /**
         * Read the full current message after RPG Maker escape conversion.
         */
        function getResolvedTextForWindow(windowInstance) {
            const gameMessage = getGameMessageForWindow(windowInstance);
            const messageOrigin = getVerifiedMessageOrigin(windowInstance);
            const rawAll = readMessageOriginText(gameMessage);

            if (!scope.originAwareLineBreaks) {
                return {
                    text: typeof windowInstance.convertEscapeCharacters === 'function'
                        ? windowInstance.convertEscapeCharacters(rawAll)
                        : rawAll,
                    messageBreakInfo: null,
                    rawText: rawAll,
                    messageOrigin,
                };
            }

            if (typeof windowInstance.convertEscapeCharacters !== 'function') {
                const rawBreaks = rawAll.match(RAW_BREAK_PATTERN) || [];
                return {
                    text: rawAll,
                    messageBreakInfo: {
                        originAware: true,
                        hadHardMessageBreaks: rawBreaks.length > 0,
                        hardBreakCount: rawBreaks.length,
                    },
                    rawText: rawAll,
                    messageOrigin,
                };
            }

            const breakMap = createBreakMap(rawAll);
            try {
                const markedConverted = windowInstance.convertEscapeCharacters(breakMap.markedText);
                const normalized = normalizeConvertedMessageText(markedConverted, breakMap);
                if (normalized.reliable) {
                    return {
                        text: normalized.text,
                        messageBreakInfo: normalized.messageBreakInfo,
                        rawText: rawAll,
                        messageOrigin,
                    };
                }
            } catch (error) {
                warn('[GameMessage] Origin-aware message conversion failed; using normal converted text.', error);
            }

            return {
                text: windowInstance.convertEscapeCharacters(rawAll),
                messageBreakInfo: null,
                rawText: rawAll,
                messageOrigin,
            };
        }

        return {
            resolveGameMessageTextScale,
            resolveGameMessageOriginAwareLineBreaks,
            resolveEnableForesight,
            createBreakToken,
            createBreakMap,
            countTokenOccurrences,
            previousNonHorizontalWhitespace,
            nextNonHorizontalWhitespace,
            shouldJoinSoftBreakWithoutSpace,
            collapseGameMessageSoftBreaks,
            normalizeConvertedMessageText,
            sanitizeRestoredMessageText,
            createEscapeAwarePayload,
            restoreMessageText,
            restoreStreamingText,
            getResolvedTextForWindow,
        };
    }

    defineRuntimeModule('adapters.gameMessage.text', { create: createController });
})();
