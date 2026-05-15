// Text codec for provider-facing translation text.
//
// The codec converts RPG Maker control codes into the long-standing placeholder
// before translation, then restores the exact original codes by encounter order.
// Newlines are normal text and are never tokenized here.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-codec.js.');
    }

    const CONVERTED_CONTROL_CODE_PATTERN = '\\x1b(?:[A-Za-z0-9_#]+|[^\\s\\w])(?:\\[[^\\]]*\\]|<[^>]*>)?';
    const RAW_CONTROL_CODE_PATTERN = '\\\\(?:[A-Za-z0-9_#]+|[^\\s\\w])(?:\\[[^\\]]*\\]|<[^>]*>)?';
    const CONTROL_CODE_PATTERN = `(?:${CONVERTED_CONTROL_CODE_PATTERN}|${RAW_CONTROL_CODE_PATTERN})`;
    const CONTROL_CODE_PLACEHOLDER = '¤';

    function createControlCodeRegex() {
        return new RegExp(CONTROL_CODE_PATTERN, 'g');
    }

    function createPlaceholderRegex() {
        return new RegExp(CONTROL_CODE_PLACEHOLDER, 'g');
    }

    function encodeText(input) {
        const originalText = String(input ?? '');
        const tokens = [];
        const translationText = originalText.replace(createControlCodeRegex(), (value, offset) => {
            tokens.push({
                index: tokens.length,
                marker: CONTROL_CODE_PLACEHOLDER,
                value,
                kind: 'control',
                offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
            });
            return CONTROL_CODE_PLACEHOLDER;
        });
        return {
            originalText,
            visibleText: stripControls(originalText).trim(),
            translationText,
            normalizedText: translationText.trim(),
            tokens,
            controlCodes: tokens.map((token) => token.value),
            controlCodeMarker: CONTROL_CODE_PLACEHOLDER,
        };
    }

    function restoreText(translatedText, codecState = {}) {
        if (translatedText === null || translatedText === undefined) return translatedText;
        const replacements = getReplacementValues(codecState);
        let index = 0;
        return String(translatedText).replace(createPlaceholderRegex(), () => {
            const value = index < replacements.length ? replacements[index] : '';
            index += 1;
            return value;
        });
    }

    function getReplacementValues(codecState = {}) {
        if (Array.isArray(codecState && codecState.tokens)) {
            return codecState.tokens.map((token) => {
                return token && typeof token.value === 'string' ? token.value : '';
            });
        }
        if (Array.isArray(codecState && codecState.controlCodes)) {
            return codecState.controlCodes.map((value) => String(value ?? ''));
        }
        return [];
    }

    function stripControls(input) {
        if (input === null || input === undefined) return '';
        return String(input).replace(createControlCodeRegex(), '');
    }

    function countPlaceholders(input) {
        const matches = String(input ?? '').match(createPlaceholderRegex());
        return matches ? matches.length : 0;
    }

    defineRuntimeModule('runtime.textCodec', {
        encodeText,
        restoreText,
        stripControls,
        countPlaceholders,
        CONTROL_CODE_PATTERN,
        CONTROL_CODE_PLACEHOLDER,
    });
})();
