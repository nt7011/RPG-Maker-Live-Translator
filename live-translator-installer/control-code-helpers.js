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
    const CONTROL_CODE_PLACEHOLDER = '¤';

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

    // Replace every RPG Maker control code with the same rare marker and restore
    // them strictly in encounter order after translation.
    function prepareTextForTranslation(input) {
        const original = String(input || '');
        const provider = getActiveProvider();
        const controlCodes = original.match(createControlCodeRegex()) || [];
        const withoutControlCodes = controlCodes.length
            ? original.replace(createControlCodeRegex(), CONTROL_CODE_PLACEHOLDER)
            : original;

        let textForTranslation = withoutControlCodes;
        let newlineData = null;

        if (provider !== 'local') {
            newlineData = {
                tokens: [],
                values: [],
                positions: [],
                baseLength: 0,
            };

            const newlineRegex = /\r?\n/g;
            let newlineIdx = 0;
            let lastIndex = 0;
            let processedNonNewline = 0;

            textForTranslation = withoutControlCodes.replace(newlineRegex, (match, offset) => {
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
        }

        return {
            textForTranslation,
            placeholders: controlCodes.length ? new Array(controlCodes.length).fill(CONTROL_CODE_PLACEHOLDER) : [],
            controlCodes,
            controlCodeMarker: CONTROL_CODE_PLACEHOLDER,
            newlineData,
            original,
        };
    }

    // Reinsert the original escape codes into a translated string.
    function restoreControlCodes(translated, placeholderData, fallbackOriginal) {
        if (translated === null || translated === undefined) return translated;
        const info = placeholderData || {};
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

        if (newlineTokens.length) {
            const missingInserts = [];
            let accountedLineBreaks = countLineBreaks(output);
            newlineTokens.forEach((token, idx) => {
                const newlineValue = typeof newlineValues[idx] === 'string' ? newlineValues[idx] : '\n';
                if (output.includes(token)) {
                    output = output.replace(token, newlineValue);
                    accountedLineBreaks += 1;
                } else if (accountedLineBreaks < newlineTokens.length) {
                    missingInserts.push({
                        newlineValue,
                        position: typeof newlinePositions[idx] === 'number' ? newlinePositions[idx] : null,
                    });
                    accountedLineBreaks += 1;
                }
            });
            if (missingInserts.length) {
                output = insertMissingNewlines(output, missingInserts, newlineBaseLength);
            }
        }

        const source = typeof info.original === 'string'
            ? info.original
            : (typeof fallbackOriginal === 'string' ? fallbackOriginal : '');
        const controlCodes = Array.isArray(info.controlCodes)
            ? info.controlCodes
            : (source ? (source.match(createControlCodeRegex()) || []) : []);
        const marker = typeof info.controlCodeMarker === 'string' && info.controlCodeMarker
            ? info.controlCodeMarker
            : CONTROL_CODE_PLACEHOLDER;
        return clampConsecutiveNewlines(restoreSequentialMarkers(output, marker, controlCodes));
    }

    function restoreSequentialMarkers(text, marker, replacements) {
        const value = String(text || '');
        if (!marker || value.indexOf(marker) === -1) {
            return value;
        }
        const parts = value.split(marker);
        let output = parts[0] || '';
        for (let idx = 1; idx < parts.length; idx++) {
            output += (idx - 1 < replacements.length ? replacements[idx - 1] : '') + parts[idx];
        }
        return output;
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

    function countLineBreaks(text) {
        const matches = String(text || '').match(/\r?\n/g);
        return matches ? matches.length : 0;
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
        CONTROL_CODE_PLACEHOLDER,
    };
})();
