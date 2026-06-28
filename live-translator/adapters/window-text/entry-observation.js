// Window text adapter support: entry observation source projection.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.entryObservation',
        factory() {

    function createEntryObservationController(context = {}) {
    const facades = context.facades || {};
    const textMetrics = facades.textMetrics || {};
    const prepareTranslationSource = typeof textMetrics.prepareTranslationSource === 'function'
        ? textMetrics.prepareTranslationSource
        : createPlainTranslationSource;

    function createEntryObservation(input = {}) {
                const draw = input && input.drawInput && typeof input.drawInput === 'object'
                    ? input.drawInput
                    : null;
                if (!draw) return null;

                const originalParams = Object.assign({}, draw.params || input.originalParams || {});
                if (input.drawOrigin) originalParams.drawOrigin = input.drawOrigin;
                const convertedText = draw.convertedText || null;
                const textToDraw = convertedText || draw.rawText;
                const convertedTrimmed = String(textToDraw || '').trim();

                return {
                    drawInput: draw,
                    type: draw.entryType || input.type || 'drawText',
                    rawText: draw.rawText,
                    convertedText,
                    convertedTrimmed,
                    visibleText: draw.visibleText || '',
                    normalizedText: draw.normalizedText,
                    normalizedVisibleText: draw.normalizedVisibleText,
                    x: draw.x,
                    y: draw.y,
                    originalParams,
                    observedContents: input.observedContents || null,
                };
            }

    function projectTranslatableSource(observation) {
                const sourceText = getTranslationProjectionText(observation);
                const textSource = prepareTranslationSource(sourceText);
                const fallback = observation && (observation.convertedTrimmed || observation.rawText) || '';
                const translationSource = textSource.translationSource || fallback;
                return {
                    isTranslatable: true,
                    skipReason: '',
                    visibleText: textSource.visibleText || '',
                    translationSource,
                    normalizedSource: textSource.normalizedSource || String(translationSource || '').trim(),
                    codecState: textSource.codecState || null,
                };
            }

    function projectSkippedSource(observation, reason) {
                return {
                    isTranslatable: false,
                    skipReason: String(reason || 'native'),
                    visibleText: observation && observation.visibleText || '',
                    translationSource: '',
                    normalizedSource: '',
                    codecState: null,
                };
            }

    function applyEntrySource(entry, projection) {
                if (!entry || !projection) return entry || null;
                entry.visibleText = projection.visibleText || '';
                entry.translationSource = projection.translationSource || '';
                entry.normalizedSource = projection.normalizedSource || '';
                entry.codecState = projection.codecState || null;
                entry.isTranslatable = projection.isTranslatable !== false;
                entry.skipReason = projection.skipReason || '';
                return entry;
            }

    function getTranslationProjectionText(observation) {
                if (!observation) return '';
                return observation.convertedText || observation.convertedTrimmed || observation.rawText || '';
            }

    function createPlainTranslationSource(text) {
                const value = String(text ?? '');
                return {
                    visibleText: value.trim(),
                    translationSource: value,
                    normalizedSource: value.trim(),
                    codecState: null,
                };
            }

    return {
                createEntryObservation,
                projectTranslatableSource,
                projectSkippedSource,
                applyEntrySource,
                getTranslationProjectionText,
            };
    }

            return { create: createEntryObservationController };
        },
    });

})();
