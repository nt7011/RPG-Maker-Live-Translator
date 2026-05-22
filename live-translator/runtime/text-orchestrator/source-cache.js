// Text orchestrator support: translation service lookup.
//
// Cache ownership belongs to the translation service. This controller only
// delegates source lookup/store/forget requests so item lifecycle code can stay
// independent from the manager implementation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/source-cache.js.');
    }

    function createController(scope = {}) {
        const { firstString, firstNonEmptyString, normalizeStatus, mergeDetails, decorateTranslationHandle, logger, activeItems } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { markCacheHit, markTranslationCompleted, markTranslationNoop, queueRenderCommand, recordEvent, buildSourceTranslationKey } = Object.fromEntries(['markCacheHit', 'markTranslationCompleted', 'markTranslationNoop', 'queueRenderCommand', 'recordEvent', 'buildSourceTranslationKey'].map((name) => [name, callScope(name)]));

        function hydrateSourceTranslation(source) {
            if (!source) return false;
            const remembered = getCompletedSourceTranslation(source);
            if (!remembered) return false;
            const status = normalizeStatus(source.status, 'detected');
            if (status !== 'detected' && status !== 'pending' && status !== 'translating' && status !== 'completed') return false;
            if (firstNonEmptyString(source.translationReceived, source.translation, source.translationDrawn)) return false;
            source.status = 'completed';
            source.translation = remembered.translation;
            source.translationReceived = remembered.translationReceived || remembered.translation;
            source.sourceHint = firstNonEmptyString(source.sourceHint, remembered.sourceHint, 'cache');
            return true;
        }

        function getCompletedSourceTranslation(source) {
            const key = buildSourceTranslationKey(source);
            if (!key) return null;
            const hit = lookupServiceTranslation(key);
            if (!hit || !hit.translation) return null;
            return {
                key,
                translation: hit.translation,
                translationReceived: hit.translation,
                sourceHint: firstNonEmptyString(hit.sourceHint, 'cache'),
            };
        }

        function rememberSourceTranslation(item, options = {}) {
            if (!item) return false;
            if (options.force !== true && normalizeStatus(item.status, 'detected') !== 'completed') return false;
            const key = buildSourceTranslationKey(item);
            const translation = firstNonEmptyString(item.translationReceived, item.translation, item.translationDrawn);
            if (!key || !translation || classifyNoopTranslation(item, translation)) return false;
            const service = scope.translationService;
            if (!service || typeof service.storeCompletedTranslation !== 'function') return false;
            try {
                service.storeCompletedTranslation(key, translation);
                return true;
            } catch (error) {
                if (logger && typeof logger.warn === 'function') {
                    logger.warn('[TextOrchestrator] Translation service store failed.', error);
                }
                return false;
            }
        }

        function forgetSourceTranslation(item, translation = '') {
            const key = buildSourceTranslationKey(item);
            if (!key) return false;
            const service = scope.translationService;
            if (!service || typeof service.forgetCompletedTranslation !== 'function') return false;
            try {
                return service.forgetCompletedTranslation(key, firstNonEmptyString(translation, item && item.translationReceived, item && item.translation)) === true;
            } catch (error) {
                if (logger && typeof logger.warn === 'function') {
                    logger.warn('[TextOrchestrator] Translation service forget failed.', error);
                }
                return false;
            }
        }

        function classifyNoopTranslation(item, translation) {
            const received = firstString(translation);
            if (!received.trim()) {
                return {
                    reason: 'empty-translation',
                    category: 'emptyTranslation',
                    translationReceived: received,
                };
            }
            const source = getComparableSourceText(item);
            if (!source) return null;
            if (normalizeComparableText(source) !== normalizeComparableText(received)) return null;
            return {
                reason: 'translation-noop',
                category: 'sameAsSource',
                translationReceived: received,
            };
        }

        function getComparableSourceText(item) {
            return firstNonEmptyString(
                item && item.normalizedSource,
                item && item.translationSource,
                item && item.visibleText,
                item && item.original,
                item && item.rawText
            );
        }

        function normalizeComparableText(value) {
            return String(value ?? '').trim();
        }

        function isTranslationNoopRenderRejection(decision = {}) {
            const reason = String(decision && decision.reason || '').toLowerCase();
            return reason === 'translation-noop'
                || reason === 'translated-text-matched-original'
                || reason === 'restored-text-empty'
                || reason === 'empty-translation';
        }

        function reuseCompletedSourceTranslation(item, remembered, context = {}) {
            return reuseLookupTranslation(item, {
                translation: firstNonEmptyString(remembered && remembered.translationReceived, remembered && remembered.translation),
                sourceHint: firstString(remembered && remembered.sourceHint, 'cache'),
            }, context);
        }

        function lookupServiceTranslation(text) {
            if (!scope.translationService || typeof scope.translationService.lookup !== 'function') return null;
            const key = String(text ?? '').trim();
            if (!key) return null;
            try {
                const hit = scope.translationService.lookup(key);
                if (!hit || typeof hit.translation !== 'string' || !hit.translation.trim()) return null;
                return {
                    translation: hit.translation,
                    sourceHint: firstNonEmptyString(hit.source, hit.sourceHint, 'cache'),
                };
            } catch (error) {
                if (logger && typeof logger.warn === 'function') {
                    logger.warn('[TextOrchestrator] Translation lookup failed.', error);
                }
                return null;
            }
        }

        function lookupForcedAsyncServiceTranslation(text) {
            if (!scope.translationService || typeof scope.translationService.lookup !== 'function') return null;
            if (scope.translationService.forceAsyncTranslation !== true) return null;
            const key = String(text ?? '').trim();
            if (!key) return null;
            try {
                const hit = scope.translationService.lookup(key, { includeForcedAsync: true });
                if (!hit || hit.forceAsync !== true || typeof hit.translation !== 'string' || !hit.translation.trim()) return null;
                return {
                    translation: hit.translation,
                    sourceHint: firstNonEmptyString(hit.source, hit.sourceHint, 'cache'),
                };
            } catch (error) {
                if (logger && typeof logger.warn === 'function') {
                    logger.warn('[TextOrchestrator] Forced async translation lookup failed.', error);
                }
                return null;
            }
        }

        function describeServiceSkip(text) {
            if (!scope.translationService || typeof scope.translationService.describeEligibility !== 'function') return null;
            const key = String(text ?? '').trim();
            if (!key) return null;
            try {
                const decision = scope.translationService.describeEligibility(key);
                return decision && decision.skip === true ? decision : null;
            } catch (error) {
                if (logger && typeof logger.warn === 'function') {
                    logger.warn('[TextOrchestrator] Translation service eligibility check failed.', error);
                }
                return null;
            }
        }

        function reuseLookupTranslation(item, lookupHit, context = {}) {
            const requestOptions = context.requestOptions || {};
            const priority = context.priority;
            const metadata = context.metadata;
            const hook = firstString(context.hook, requestOptions.hook, item.hook, item.sourceAdapter);
            const translation = firstString(lookupHit && lookupHit.translation);
            const sourceHint = firstString(lookupHit && lookupHit.sourceHint, 'cache');
            const noop = classifyNoopTranslation(item, translation);
            if (noop) {
                markTranslationNoop(item.id, translation, Object.assign({}, noop, {
                    sourceHint,
                    metadata: mergeDetails(metadata, {
                        translationFailureReason: noop.reason,
                        translationFailureCategory: noop.category,
                    }),
                    hook,
                    priority,
                }));
                return decorateTranslationHandle({
                    promise: Promise.resolve(translation),
                    cancel: () => false,
                    setPriority: () => false,
                    getPriority: () => priority,
                    getStatus: () => 'failed',
                    getSourceHint: () => sourceHint,
                });
            }
            const completionDetails = {
                sourceHint,
                metadata,
                hook,
                lookupReuse: true,
            };
            if (sourceHint === 'overrideTranslationRegex') {
                markTranslationCompleted(item.id, translation, completionDetails);
            } else {
                markCacheHit(item.id, translation, completionDetails);
            }
            const current = activeItems.get(item.id) || item;
            const strategy = firstString(requestOptions.renderStrategy, current.translationRenderStrategy, current.renderStrategy);
            if (requestOptions.queueRender !== false && requestOptions.queueLookupRender !== false && strategy) {
                queueRenderCommand(current.id, {
                    strategy,
                    text: translation,
                    generation: current.generation || 0,
                    metadata: Object.assign({}, metadata || {}, {
                        sourceHint,
                        translationReceived: translation,
                    }),
                });
            }
            recordEvent('item.request_reused', current, {
                details: {
                    hook,
                    priority,
                    source: sourceHint,
                    translationReceived: translation,
                },
            });
            return decorateTranslationHandle({
                promise: Promise.resolve(translation),
                cancel: () => false,
                setPriority: () => false,
                getPriority: () => priority,
                getStatus: () => 'completed',
                getSourceHint: () => sourceHint,
            });
        }

        function isSkippedItem(item) {
            return normalizeStatus(item && item.status, '') === 'skipped';
        }

        function createSkippedTranslationHandle(text, sourceHint = 'policy') {
            const resolvedText = firstString(text);
            return decorateTranslationHandle({
                promise: Promise.resolve(resolvedText),
                cancel: () => false,
                setPriority: () => false,
                getPriority: () => null,
                getStatus: () => 'skipped',
                getSourceHint: () => firstString(sourceHint, 'policy'),
            });
        }

        return {
            hydrateSourceTranslation,
            getCompletedSourceTranslation,
            rememberSourceTranslation,
            forgetSourceTranslation,
            classifyNoopTranslation,
            getComparableSourceText,
            normalizeComparableText,
            isTranslationNoopRenderRejection,
            reuseCompletedSourceTranslation,
            lookupServiceTranslation,
            lookupForcedAsyncServiceTranslation,
            describeServiceSkip,
            reuseLookupTranslation,
            isSkippedItem,
            createSkippedTranslationHandle,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorSourceCache', { create: createController });
})();
