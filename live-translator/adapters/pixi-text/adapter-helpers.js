// PIXI text adapter helpers.
//
// These helpers wrap policy, telemetry, and logging calls so the main adapter
// file can focus on installing PIXI hooks and translating setter assignments.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/pixi-text/adapter-helpers.js.');
    }

    function create(options = {}) {
        const {
            adapterContract,
            encodeText,
            telemetry,
            logger,
            safeCall,
            ADAPTER_ID,
        } = options;

        function prepareTranslationInput(text) {
            try {
                return encodeText(text) || {};
            } catch (error) {
                warn('[PIXI] Failed to prepare text for translation.', error);
                return {
                    originalText: text,
                    visibleText: text.trim(),
                    translationText: text,
                    normalizedText: text.trim(),
                    tokens: [],
                };
            }
        }

        function describePixiTextEligibility(input) {
            return adapterContract.describeTextEligibility(Object.assign({
                sourceAdapter: ADAPTER_ID,
                hook: ADAPTER_ID,
            }, input || {}));
        }

        function updateItem(state, patch, eventType, details) {
            return adapterContract.updateItem(state, patch, {
                eventType,
                details,
            });
        }

        function logTelemetry(normalizedSource, label) {
            if (!telemetry || typeof telemetry.logTextDetected !== 'function') return;
            safeCall(() => telemetry.logTextDetected(ADAPTER_ID, normalizedSource, 0, 0, {
                windowType: label,
            }));
        }

        function isAdapterContractFailure(error) {
            return !!(adapterContract
                && typeof adapterContract.isContractError === 'function'
                && adapterContract.isContractError(error));
        }

        function warn(message, error) {
            if (logger && typeof logger.warn === 'function') {
                try { logger.warn(message, error); } catch (_) {}
            }
        }

        return {
            prepareTranslationInput,
            describePixiTextEligibility,
            updateItem,
            logTelemetry,
            isAdapterContractFailure,
            warn,
        };
    }

    defineRuntimeModule('adapters.pixiTextAdapterHelpers', { create });
})();
