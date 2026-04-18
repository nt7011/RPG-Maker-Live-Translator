(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : Function('return this')()));

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }

    if (globalScope.LiveTranslatorModules.controlCodeHelpers) {
        return;
    }

    const CONTROL_CODE_PATTERN = '\\x1b(?:[A-Za-z{}]|[\\$!><\\^\\|\\{\\}])(?:\\[[^\\]]*\\])?';

    const createControlCodeRegex = () => new RegExp(CONTROL_CODE_PATTERN, 'g');

    function getActiveProvider() {
        try {
            const cfg = globalScope && globalScope.LiveTranslatorConfig;
            const providerRaw = cfg && cfg.provider;
            if (typeof providerRaw === 'string') {
                const trimmed = providerRaw.trim();
                if (trimmed) return trimmed.toLowerCase();
            }
        } catch (_) {}
        return null;
    }

    // Remove RPGM escape sequences so comparisons/telemetry operate on visible text.
    function stripRpgmEscapes(input) {
        if (input === null || input === undefined) return '';
        return String(input).replace(createControlCodeRegex(), '');
    }

    // For the local LLM path, send the original text through unchanged so the model
    // sees the same control codes RPG Maker will ultimately render.
    // Other providers still receive placeholder tokens so we can restore codes later.
    function prepareTextForTranslation(input) {
        const original = String(input || '');
        const provider = getActiveProvider();
        if (provider === 'local') {
            return {
                textForTranslation: original,
                placeholders: [],
                newlineData: null,
                original,
                preservesControlCodes: true,
            };
        }

        const placeholders = [];
        let controlIdx = 0;
        const withoutControlCodes = original.replace(createControlCodeRegex(), () => {
            const token = `⟦TAG${controlIdx++}⟧`;
            placeholders.push(token);
            return token;
        });

        const newlineData = {
            tokens: [],
            values: [],
            positions: [],
            baseLength: 0,
        };

        const newlineRegex = /\r?\n/g;
        let newlineIdx = 0;
        let lastIndex = 0;
        let processedNonNewline = 0;

        const textForTranslation = withoutControlCodes.replace(newlineRegex, (match, offset) => {
            const chunkLength = offset - lastIndex;
            if (chunkLength > 0) {
                processedNonNewline += chunkLength;
            }

            const token = `⟦NL${newlineIdx++}⟧`;
            newlineData.tokens.push(token);
            newlineData.values.push(match);
            newlineData.positions.push(processedNonNewline);

            lastIndex = offset + match.length;
            return token;
        });

        processedNonNewline += withoutControlCodes.length - lastIndex;
        newlineData.baseLength = processedNonNewline;

        return {
            textForTranslation,
            placeholders,
            newlineData,
            original,
            preservesControlCodes: false,
        };
    }

    // Reinsert the original escape codes into a translated string.
    function restoreControlCodes(translated, placeholderData, fallbackOriginal) {
        if (translated === null || translated === undefined) return translated;
        const info = placeholderData || {};
        const placeholders = Array.isArray(info.placeholders)
            ? info.placeholders
            : (Array.isArray(info) ? info : []);

        const newlineInfo = (!Array.isArray(info) && info && typeof info === 'object')
            ? info.newlineData
            : undefined;
        const newlineTokens = Array.isArray(newlineInfo && newlineInfo.tokens)
            ? newlineInfo.tokens
            : [];
        const newlineValues = Array.isArray(newlineInfo && newlineInfo.values)
            ? newlineInfo.values
            : [];
        const newlinePositions = Array.isArray(newlineInfo && newlineInfo.positions)
            ? newlineInfo.positions
            : [];
        const newlineBaseLength = typeof (newlineInfo && newlineInfo.baseLength) === 'number'
            ? newlineInfo.baseLength
            : null;

        let output = String(translated);

        if (info && info.preservesControlCodes) {
            return clampConsecutiveNewlines(output);
        }

        if (newlineTokens.length) {
            const missingInserts = [];
            newlineTokens.forEach((token, idx) => {
                const newlineValue = typeof newlineValues[idx] === 'string' ? newlineValues[idx] : '\n';
                if (output.includes(token)) {
                    output = output.replace(token, newlineValue);
                } else {
                    missingInserts.push({
                        newlineValue,
                        position: typeof newlinePositions[idx] === 'number' ? newlinePositions[idx] : null,
                    });
                }
            });
            if (missingInserts.length) {
                output = insertMissingNewlines(output, missingInserts, newlineBaseLength);
            }
        }

        if (!placeholders.length) {
            return clampConsecutiveNewlines(output);
        }

        const source = typeof info.original === 'string'
            ? info.original
            : (typeof fallbackOriginal === 'string' ? fallbackOriginal : '');

        const codes = source
            ? (source.match(createControlCodeRegex()) || [])
            : [];

        placeholders.forEach((token, idx) => {
            output = output.replace(token, codes[idx] || '');
        });
        return clampConsecutiveNewlines(output);
    }

    function insertMissingNewlines(text, inserts, baseLength) {
        if (!Array.isArray(inserts) || inserts.length === 0) {
            return text;
        }
        let result = String(text || '');
        inserts
            .filter(item => item && typeof item.newlineValue === 'string')
            .sort((a, b) => {
                const posA = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
                const posB = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
                return posA - posB;
            })
            .forEach((item) => {
                const insertValue = item.newlineValue || '\n';
                let targetIndex = result.length;

                if (typeof item.position === 'number'
                    && typeof baseLength === 'number'
                    && baseLength > 0) {
                    const relative = Math.max(0, Math.min(1, item.position / baseLength));
                    targetIndex = Math.min(result.length, Math.round(result.length * relative));
                } else if (!result.length) {
                    targetIndex = 0;
                }

                result = result.slice(0, targetIndex) + insertValue + result.slice(targetIndex);
            });
        return result;
    }

    function clampConsecutiveNewlines(text) {
        if (text === null || text === undefined) return text;
        const runPattern = /(?:[ \t\f\v]*\r?\n[ \t\f\v]*)+/g;
        return String(text).replace(runPattern, (match) => (/\r\n/.test(match) ? '\r\n' : '\n'));
    }

    globalScope.LiveTranslatorModules.controlCodeHelpers = {
        stripRpgmEscapes,
        prepareTextForTranslation,
        restoreControlCodes,
        CONTROL_CODE_PATTERN,
    };
})();
