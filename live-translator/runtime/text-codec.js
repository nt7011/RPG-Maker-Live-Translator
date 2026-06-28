// Text codec for provider-facing translation text.
//
// The codec converts RPG Maker control codes into the long-standing placeholder
// before translation, then restores the exact original codes by encounter order.
// Newlines are normal text and are never tokenized here.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textCodec',
        factory() {
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

            function createTextModel(input, options = {}) {
                const source = options && typeof options === 'object' ? options : {};
                const codecState = encodeText(input);
                const methodName = String(source.methodName || source.type || '');
                const surfaceType = String(source.surfaceType || source.surface || '');
                const visibleText = sanitizeVisibleText(codecState.originalText, source);
                const translationSource = String(codecState.translationText ?? '');
                const normalizedSource = normalizeTranslationSource(codecState.normalizedText, translationSource);
                const drawableText = sanitizeDrawTextOutput(codecState.originalText, {
                    methodName,
                    type: source.type,
                });
                return {
                    originalText: codecState.originalText,
                    rawText: codecState.originalText,
                    visibleText,
                    translationSource,
                    normalizedSource,
                    drawableText,
                    methodName,
                    surfaceType,
                    codecState,
                    tokens: codecState.tokens,
                    hasControls: codecState.tokens.length > 0,
                    placeholderCount: countPlaceholders(translationSource),
                    iconCount: countIconEscapes(codecState.originalText),
                };
            }

            function createTextSource(input, options = {}) {
                const model = createTextModel(input, options);
                return {
                    originalText: model.originalText,
                    visibleText: model.visibleText,
                    translationSource: model.translationSource,
                    normalizedSource: model.normalizedSource,
                    codecState: model.codecState,
                    textModel: model,
                };
            }

            function createPlainTextSource(input, options = {}) {
                const model = createPlainTextModel(input, options);
                return {
                    originalText: model.originalText,
                    visibleText: model.visibleText,
                    translationSource: model.translationSource,
                    normalizedSource: model.normalizedSource,
                    codecState: model.codecState,
                    textModel: model,
                };
            }

            function createPlainTextModel(input, options = {}) {
                const source = options && typeof options === 'object' ? options : {};
                const originalText = String(input ?? '');
                const methodName = String(source.methodName || source.type || '');
                const surfaceType = String(source.surfaceType || source.surface || '');
                const visibleText = sanitizeVisibleText(originalText, source);
                const translationSource = source.translationSource !== undefined
                    ? String(source.translationSource ?? '')
                    : originalText;
                const normalizedSource = normalizeTranslationSource(source.normalizedSource, translationSource);
                const codecState = {
                    originalText,
                    visibleText,
                    translationText: translationSource,
                    normalizedText: normalizedSource,
                    tokens: [],
                    controlCodes: [],
                    controlCodeMarker: CONTROL_CODE_PLACEHOLDER,
                };
                return {
                    originalText,
                    rawText: originalText,
                    visibleText,
                    translationSource,
                    normalizedSource,
                    drawableText: sanitizeDrawTextOutput(originalText, {
                        methodName,
                        type: source.type,
                    }),
                    methodName,
                    surfaceType,
                    codecState,
                    tokens: codecState.tokens,
                    hasControls: false,
                    placeholderCount: 0,
                    iconCount: countIconEscapes(originalText),
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

            function toDrawTextExInputText(input) {
                if (input === null || input === undefined) return '';
                const text = String(input);
                // drawTextEx is the RPG Maker escape-conversion boundary. Restored
                // translations may carry already-converted ESC control codes because
                // the observed source text was captured after conversion. Feeding those
                // converted codes back into drawTextEx asks plugins to process an
                // internal form they did not receive from native refresh code.
                return text.replace(/\x1b([A-Za-z0-9_#]+|[^\s\w])(\[[^\]]*\]|<[^>]*>)?/g, (_match, code, suffix) => {
                    return `\\${code}${suffix || ''}`;
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

            function sanitizeVisibleText(input, options = {}) {
                const source = options && typeof options === 'object' ? options : {};
                let value = stripControls(input);
                if (source.perCharPattern) {
                    try {
                        value = value.replace(source.perCharPattern, '');
                    } catch (_) {}
                }
                return source.trim === false ? value : value.trim();
            }

            function sanitizeDrawTextOutput(input, options = {}) {
                if (input === null || input === undefined) return '';
                const text = String(input);
                const methodName = String(options && (options.methodName || options.type) || '');
                return shouldStripDrawTextOutput(methodName) ? stripControls(text) : text;
            }

            function shouldStripDrawTextOutput(methodName) {
                const method = String(methodName || '');
                return method === 'drawText' || method === 'drawTextS' || method === 'drawTextM';
            }

            function countIconEscapes(input) {
                const matches = String(input ?? '').match(/(?:\x1b|\\)i\[[^\]]*\]/gi);
                return matches ? matches.length : 0;
            }

            function countPlaceholders(input) {
                const matches = String(input ?? '').match(createPlaceholderRegex());
                return matches ? matches.length : 0;
            }

            function normalizeTranslationSource(value, fallback = '') {
                const source = value === undefined || value === null ? fallback : value;
                return String(source ?? '').trim();
            }

            return {
                encodeText,
                createTextModel,
                createTextSource,
                createPlainTextModel,
                createPlainTextSource,
                restoreText,
                toDrawTextExInputText,
                stripControls,
                sanitizeVisibleText,
                sanitizeDrawTextOutput,
                countIconEscapes,
                countPlaceholders,
                CONTROL_CODE_PATTERN,
                CONTROL_CODE_PLACEHOLDER,
            };
        },
    });
})();
