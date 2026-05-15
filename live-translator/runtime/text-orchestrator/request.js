// Text orchestrator support: request.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/request.js.');
    }

    function createController(scope = {}) {
        const { firstString, firstNonEmptyString, clampPriority, normalizeId, mergeDetails, providerSkipDecision, providerUnavailableDecision, serviceSkipDecision, normalizeTranslationHandle, decorateTranslationHandle, textEligibility, activeItems } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { updateItem, markTranslationRequested, skipItemTranslation, completeItemTranslation, failItemTranslation, queueRenderCommand, getItemById, recordEvent, getCompletedSourceTranslation, reuseCompletedSourceTranslation, describeServiceSkip, isSkippedItem, createSkippedTranslationHandle, resolveRequestPolicy, applyRequestPolicy } = Object.fromEntries(['updateItem', 'markTranslationRequested', 'skipItemTranslation', 'completeItemTranslation', 'failItemTranslation', 'queueRenderCommand', 'getItemById', 'recordEvent', 'getCompletedSourceTranslation', 'reuseCompletedSourceTranslation', 'describeServiceSkip', 'isSkippedItem', 'createSkippedTranslationHandle', 'resolveRequestPolicy', 'applyRequestPolicy'].map((name) => [name, callScope(name)]));

        /**
         * Request translation for an active item and let the orchestrator own
         * the returned subscriber handle.
         *
         * The stored translationToken prevents stale promise completions from
         * updating or rendering a newer item/request. On success the item is
         * marked completed or cache-hit and a render command is queued when a
         * renderStrategy is provided. On failure the item is marked failed or
         * canceled only if the same handle/token is still current.
         */
        function requestItemTranslation(id, requestOptions = {}) {
            const key = normalizeId(id);
            const item = key ? activeItems.get(key) : null;
            if (!item) {
                throw new Error(`[TextOrchestrator] Cannot request translation for unknown text item: ${key || '(missing id)'}`);
            }

            const text = firstString(
                requestOptions.text,
                item.translationSource,
                item.normalizedSource,
                item.visibleText,
                item.original,
                item.rawText
            );
            if (isSkippedItem(item)) {
                return createSkippedTranslationHandle(text, firstString(item.sourceHint, 'policy'));
            }
            const priority = clampPriority(
                requestOptions.priority !== undefined && requestOptions.priority !== null
                    ? requestOptions.priority
                    : (item.priority !== null && item.priority !== undefined ? item.priority : undefined)
            );
            const metadata = mergeDetails(item.metadata, requestOptions.metadata);
            const hook = firstString(requestOptions.hook, item.hook, item.sourceAdapter);
            const eligibility = textEligibility.describe(Object.assign({}, item, requestOptions, {
                status: item.status,
                text,
                translationSource: text,
                normalizedSource: text,
            }), item);
            if (!eligibility.eligible) {
                return skipItemTranslation(item, eligibility, {
                    hook,
                    priority,
                    metadata,
                });
            }

            const existingHandle = item.translationHandle && item.translationToken ? item.translationHandle : null;
            if (existingHandle && existingHandle.promise && typeof existingHandle.promise.then === 'function') {
                const requestPolicy = resolveRequestPolicy(item, requestOptions, {
                    priority,
                    metadata,
                });
                refreshJoinedTranslationItem(item, requestOptions, {
                    priority,
                    metadata,
                    requestPolicy,
                });
                if (requestPolicy.replaceSubscriber === true) {
                    const upgradedHandle = startTranslationRequest(item, text, requestOptions, {
                        hook,
                        priority,
                        metadata,
                        requestPolicy,
                    });
                    cancelSupersededTranslationHandle(existingHandle, 'same slot/source stream upgraded');
                    recordEvent('item.request_joined', item, {
                        details: {
                            hook,
                            priority: requestPolicy.priority,
                            source: 'same slot/source',
                            streamUpgraded: true,
                        },
                    });
                    return upgradedHandle;
                }
                if (typeof existingHandle.setPriority === 'function') {
                    try { existingHandle.setPriority(requestPolicy.priority, requestPolicy.priorityReason); } catch (_) {}
                }
                recordEvent('item.request_joined', item, {
                    details: {
                        hook,
                        priority: requestPolicy.priority,
                        source: 'same slot/source',
                    },
                });
                return existingHandle;
            }
            const existingTranslation = firstNonEmptyString(item.translationDrawn, item.translation, item.translationReceived);
            if (item.status === 'completed' && existingTranslation) {
                const strategy = firstString(requestOptions.renderStrategy, item.translationRenderStrategy, item.renderStrategy);
                if (requestOptions.queueRender !== false && strategy) {
                    queueRenderCommand(item.id, {
                        strategy,
                        text: existingTranslation,
                        generation: item.generation || 0,
                        metadata: Object.assign({}, metadata || {}, {
                            sourceHint: firstString(item.sourceHint, requestOptions.sourceHint, 'existing'),
                            translationReceived: firstString(item.translationReceived, existingTranslation),
                        }),
                    });
                }
                recordEvent('item.request_reused', item, {
                    details: {
                        hook,
                        priority,
                        source: 'completed same slot/source',
                    },
                });
                return decorateTranslationHandle({
                    promise: Promise.resolve(existingTranslation),
                    cancel: () => false,
                    setPriority: () => false,
                    getPriority: () => priority,
                    getStatus: () => 'completed',
                    getSourceHint: () => firstString(item.sourceHint, requestOptions.sourceHint, 'existing'),
                });
            }
            const serviceSkip = describeServiceSkip(text);
            if (serviceSkip) {
                return skipItemTranslation(item, serviceSkipDecision(serviceSkip, text), {
                    hook,
                    priority,
                    metadata,
                });
            }
            const rememberedTranslation = getCompletedSourceTranslation(item);
            if (rememberedTranslation) {
                return reuseCompletedSourceTranslation(item, rememberedTranslation, {
                    hook,
                    priority,
                    metadata,
                    requestOptions,
                });
            }
            const providerDecision = describeProviderDispatch(eligibility, text);
            if (providerDecision.allowed === false) {
                return skipItemTranslation(item, providerDecision.decision, {
                    hook,
                    priority,
                    metadata,
                });
            }
            if (!scope.translationService || typeof scope.translationService.request !== 'function') {
                throw new Error('[TextOrchestrator] Translation service is unavailable.');
            }
            return startTranslationRequest(item, text, requestOptions, {
                hook,
                priority,
                metadata,
            });
        }

        function refreshJoinedTranslationItem(item, requestOptions = {}, context = {}) {
            if (!item) return null;
            const requestPolicy = context.requestPolicy || resolveRequestPolicy(item, requestOptions, context);
            applyRequestPolicy(item, requestPolicy);
            item.priority = requestPolicy.priority;
            item.metadata = mergeDetails(item.metadata, context.metadata);
            item.translationRenderStrategy = firstString(requestOptions.renderStrategy, item.translationRenderStrategy, item.renderStrategy);
            item.renderStrategy = firstString(requestOptions.renderStrategy, item.renderStrategy);
            item.updatedAt = Date.now();
            item.sequence = ++scope.sequence;
            return item;
        }

        function shouldReplaceJoinedTranslationSubscriber(item, requestOptions = {}) {
            return resolveRequestPolicy(item, requestOptions).replaceSubscriber === true;
        }

        function requestWantsStreaming(requestOptions = {}) {
            return !!(requestOptions
                && (requestOptions.stream === true
                    || requestOptions.mode === 'stream'
                    || typeof requestOptions.onDelta === 'function'));
        }

        function cancelSupersededTranslationHandle(handle, reason) {
            if (!handle || typeof handle.cancel !== 'function') return false;
            try {
                return handle.cancel(reason || 'translation superseded') === true;
            } catch (_) {
                return false;
            }
        }

        function startTranslationRequest(item, text, requestOptions = {}, context = {}) {
            const hook = firstString(context.hook, requestOptions.hook, item && item.hook, item && item.sourceAdapter);
            const requestPolicy = context.requestPolicy || resolveRequestPolicy(item, requestOptions, context);
            applyRequestPolicy(item, requestPolicy);
            const priority = requestPolicy.priority;
            const metadata = mergeDetails(item && item.metadata, context.metadata);
            const request = Object.assign({}, requestOptions, {
                text,
                recordId: item.id,
                hook,
                priority,
                metadata,
            });
            delete request.renderStrategy;
            delete request.queueRender;
            delete request.queueLookupRender;

            markTranslationRequested(item.id, {
                priority,
                sourceHint: requestOptions.sourceHint || 'provider',
                metadata,
                hook,
            });

            let rawHandle = null;
            try {
                rawHandle = scope.translationService.request(request);
            } catch (error) {
                updateItem(item.id, { status: 'failed' }, {
                    eventType: 'item.failed',
                    message: error && error.message ? error.message : String(error || 'translation request failed'),
                    details: { hook, priority },
                });
                throw error;
            }

            const token = ++scope.translationSequence;
            const handle = normalizeTranslationHandle(rawHandle, {
                priority,
                sourceHint: requestOptions.sourceHint || 'provider',
            });
            const current = getItemById(item.id);
            if (current) {
                current.translationHandle = handle;
                current.translationToken = token;
                current.translationRenderStrategy = firstString(requestOptions.renderStrategy, item.renderStrategy);
                current.translationStream = request.stream === true;
                current.translationHasDelta = typeof request.onDelta === 'function';
            }

            handle.promise
                .then((translated) => {
                    completeItemTranslation(item.id, handle, token, translated, requestOptions);
                })
                .catch((error) => {
                    failItemTranslation(item.id, handle, token, error);
                });

            return handle;
        }

        function describeProviderDispatch(eligibility, text) {
            if (eligibility && eligibility.providerEligible === false) {
                return {
                    allowed: false,
                    decision: providerSkipDecision(eligibility),
                };
            }
            if (scope.providerDispatch.enabled === false) {
                return {
                    allowed: false,
                    decision: providerUnavailableDecision(text),
                };
            }
            return { allowed: true, decision: null };
        }

        return {
            requestItemTranslation,
            refreshJoinedTranslationItem,
            shouldReplaceJoinedTranslationSubscriber,
            requestWantsStreaming,
            cancelSupersededTranslationHandle,
            startTranslationRequest,
            describeProviderDispatch,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorRequest', { create: createController });
})();
