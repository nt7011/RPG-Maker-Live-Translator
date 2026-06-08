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
        const { firstString, firstNonEmptyString, clampPriority, normalizeId, mergeDetails, createLifecycleResult, providerSkipDecision, providerUnavailableDecision, serviceSkipDecision, normalizeTranslationHandle, decorateTranslationHandle, textEligibility, activeItems, detachedItems } = scope;
        const { resolveRequestPolicy, applyRequestPolicy } = scope.controllerFacades.policy;
        const { updateItem, retireItem } = scope.controllerFacades.lifecycle;
        const { markTranslationRequested, skipItemTranslation, completeItemTranslation, failItemTranslation } = scope.controllerFacades.translationState;
        const { queueRenderCommand } = scope.controllerFacades.render;
        const { getItemById, clearItemTranslationRequest } = scope.controllerFacades.items;
        const { recordEvent } = scope.controllerFacades.events;
        const { getCompletedSourceTranslation, reuseCompletedSourceTranslation, lookupForcedAsyncServiceTranslation, describeServiceSkip, reuseLookupTranslation, isSkippedItem, createSkippedTranslationHandle } = scope.controllerFacades.sourceCache;

        const FAILURE_METADATA_KEYS = Object.freeze([
            'translationFailureReason',
            'translationFailureCategory',
            'translationFailureCode',
            'retryOnProviderRestored',
            'providerAvailabilityState',
            'providerAvailabilityReason',
            'providerAvailabilityMessage',
        ]);

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
            const item = key ? getRequestableItem(key, requestOptions) : null;
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
            const priority = clampPriority(
                requestOptions.priority !== undefined && requestOptions.priority !== null
                    ? requestOptions.priority
                    : (item.priority !== null && item.priority !== undefined ? item.priority : undefined)
            );
            const metadata = mergeDetails(item.metadata, requestOptions.metadata);
            const hook = firstString(requestOptions.hook, item.hook, item.sourceAdapter);
            if (isSkippedItem(item)) {
                return createTranslationRequestResult('skipped', item, createSkippedTranslationHandle(text, firstString(item.sourceHint, 'policy')), {
                    changed: false,
                    reason: 'item-already-skipped',
                    hook,
                    priority,
                });
            }
            const eligibility = textEligibility.describe(Object.assign({}, item, requestOptions, {
                status: item.status,
                text,
                translationSource: text,
                normalizedSource: text,
            }), item);
            if (!eligibility.eligible) {
                return createTranslationRequestResult('skipped', item, skipItemTranslation(item, eligibility, {
                    hook,
                    priority,
                    metadata,
                }), {
                    reason: eligibility.reason || 'translation skipped',
                    hook,
                    priority,
                    terminal: true,
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
                // Forced-async cache hits deliberately settle later in snapshot
                // runs. If the same source is visible again, the cache lookup is
                // already authoritative, so complete through the normal render
                // queue before another surface mutation can retire the slot.
                const forcedAsyncLookup = lookupForcedAsyncServiceTranslation(text);
                if (forcedAsyncLookup) {
                    return createTranslationRequestResult('reused', item, completeJoinedForcedAsyncLookup(item, existingHandle, forcedAsyncLookup, requestOptions, {
                        hook,
                        metadata,
                        requestPolicy,
                    }), {
                        reason: 'forced-async-cache-resolved',
                        hook,
                        priority: requestPolicy.priority,
                    });
                }
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
                    return createTranslationRequestResult('requested', item, upgradedHandle, {
                        reason: 'same-slot-source-stream-upgraded',
                        hook,
                        priority: requestPolicy.priority,
                    });
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
                return createTranslationRequestResult('joined', item, existingHandle, {
                    reason: 'same-slot-source',
                    hook,
                    priority: requestPolicy.priority,
                    changed: false,
                });
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
                const handle = decorateTranslationHandle({
                    promise: Promise.resolve(existingTranslation),
                    cancel: () => false,
                    setPriority: () => false,
                    getPriority: () => priority,
                    getStatus: () => 'completed',
                    getSourceHint: () => firstString(item.sourceHint, requestOptions.sourceHint, 'existing'),
                });
                return createTranslationRequestResult('reused', item, handle, {
                    reason: 'completed-same-slot-source',
                    hook,
                    priority,
                    changed: false,
                });
            }
            const serviceSkip = describeServiceSkip(text);
            if (serviceSkip) {
                return createTranslationRequestResult('skipped', item, skipItemTranslation(item, serviceSkipDecision(serviceSkip, text), {
                    hook,
                    priority,
                    metadata,
                }), {
                    reason: serviceSkip.reason || 'service-skip',
                    hook,
                    priority,
                    terminal: true,
                });
            }
            const rememberedTranslation = getCompletedSourceTranslation(item);
            if (rememberedTranslation) {
                return createTranslationRequestResult('reused', item, reuseCompletedSourceTranslation(item, rememberedTranslation, {
                    hook,
                    priority,
                    metadata,
                    requestOptions,
                }), {
                    reason: 'source-translation-cache',
                    hook,
                    priority,
                });
            }
            const providerDecision = describeProviderDispatch(eligibility, text);
            if (providerDecision.allowed === false) {
                const forcedAsync = lookupForcedAsyncServiceTranslation(text);
                if (forcedAsync) {
                    return createTranslationRequestResult('requested', item, startTranslationRequest(item, text, Object.assign({}, requestOptions, {
                        sourceHint: forcedAsync.sourceHint,
                    }), {
                        hook,
                        priority,
                        metadata,
                    }), {
                        reason: 'forced-async-provider-bypass',
                        hook,
                        priority,
                    });
                }
                return createTranslationRequestResult('skipped', item, skipItemTranslation(item, providerDecision.decision, {
                    hook,
                    priority,
                    metadata,
                }), {
                    reason: providerDecision.decision && providerDecision.decision.reason || 'provider-disallowed',
                    hook,
                    priority,
                    terminal: true,
                });
            }
            if (!scope.translationService || typeof scope.translationService.request !== 'function') {
                throw new Error('[TextOrchestrator] Translation service is unavailable.');
            }
            return createTranslationRequestResult('requested', item, startTranslationRequest(item, text, requestOptions, {
                hook,
                priority,
                metadata,
            }), {
                reason: 'provider-requested',
                hook,
                priority,
            });
        }

        function createTranslationRequestResult(status, item, handle, details = {}) {
            const source = details && typeof details === 'object' ? details : {};
            const recordId = normalizeId(source.recordId || (item && item.id));
            const handleStatus = handle && typeof handle.getStatus === 'function'
                ? firstString(safeCallHandle(handle, 'getStatus'), status)
                : firstString(status);
            const priority = source.priority !== undefined && source.priority !== null
                ? clampPriority(source.priority)
                : (handle && typeof handle.getPriority === 'function' ? safeCallHandle(handle, 'getPriority') : null);
            return createLifecycleResult(status, {
                handled: source.handled !== false,
                changed: source.changed !== false,
                terminal: source.terminal === true || handleStatus === 'skipped' || handleStatus === 'failed',
                recordId,
                id: recordId,
                reason: firstString(source.reason, status),
                hook: firstString(source.hook, item && item.hook, item && item.sourceAdapter),
                priority,
                handleStatus,
                sourceHint: handle && typeof handle.getSourceHint === 'function'
                    ? firstString(safeCallHandle(handle, 'getSourceHint'))
                    : '',
                translationHandle: handle || null,
            });
        }

        function safeCallHandle(handle, methodName) {
            try {
                return handle && typeof handle[methodName] === 'function' ? handle[methodName]() : null;
            } catch (_) {
                return null;
            }
        }

        function getRequestableItem(key, requestOptions = {}) {
            const active = activeItems.get(key);
            if (active) return active;
            if (requestOptions && requestOptions.allowInactive === true) {
                return getItemById(key);
            }
            return null;
        }

        /**
         * Re-submit failed provider requests after the local provider reports
         * that it is available again. Only failures explicitly tagged as
         * provider-availability failures are retried; skipped text, noop output,
         * stale records, and unrelated provider errors stay untouched.
         */
        function retryFailedTranslations(options = {}) {
            const source = options && typeof options === 'object' ? options : {};
            const includeActive = source.includeActive !== false;
            const includeForesight = source.includeForesight === true;
            const reason = firstString(source.reason, 'provider-availability-restored');
            const candidates = collectFailedRetryCandidates({ includeActive, includeForesight });
            const result = {
                attempted: 0,
                active: 0,
                foresight: 0,
                failed: 0,
                skipped: 0,
            };

            candidates.forEach((entry) => {
                if (!entry || !entry.item || !shouldRetryFailedItem(entry.item, entry)) {
                    result.skipped += 1;
                    return;
                }
                try {
                    retryFailedItem(entry.item, {
                        reason,
                        foresight: entry.foresight === true,
                        inactive: entry.inactive === true,
                    });
                    result.attempted += 1;
                    if (entry.foresight) result.foresight += 1;
                    else result.active += 1;
                } catch (error) {
                    result.failed += 1;
                    recordEvent('item.retry_failed', entry.item, {
                        message: error && error.message ? error.message : String(error || 'retry failed'),
                        details: {
                            reason,
                            retryOnProviderRestored: true,
                        },
                    });
                }
            });

            return result;
        }

        function collectFailedRetryCandidates(options = {}) {
            const candidates = [];
            const seen = new Set();
            const addCandidate = (item, context = {}) => {
                if (!item || !item.id || seen.has(item.id)) return;
                seen.add(item.id);
                candidates.push(Object.assign({ item }, context));
            };
            if (options.includeActive) {
                activeItems.forEach((item) => {
                    addCandidate(item, {
                        inactive: false,
                        foresight: isForesightItem(item),
                    });
                });
            }
            if (options.includeForesight) {
                detachedItems.forEach((item) => {
                    if (isForesightItem(item)) {
                        addCandidate(item, {
                            inactive: true,
                            foresight: true,
                        });
                    }
                });
            }
            return candidates;
        }

        function shouldRetryFailedItem(item, context = {}) {
            if (!item || String(item.status || '').toLowerCase() !== 'failed') return false;
            if (item.translationHandle || item.translationToken) return false;
            const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
            if (metadata.retryOnProviderRestored !== true) return false;
            if (metadata.translationFailureCategory !== 'providerAvailability') return false;
            if (context.inactive === true && !isForesightItem(item)) return false;
            if (!getRetrySourceText(item)) return false;
            return true;
        }

        function retryFailedItem(item, options = {}) {
            const reason = firstString(options.reason, 'provider-availability-restored');
            const metadata = createRetryMetadata(item, reason);
            const requestOptions = {
                text: getRetrySourceText(item),
                hook: firstString(item.hook, item.sourceAdapter),
                priority: clampPriority(item.priority),
                renderStrategy: firstString(item.renderStrategy, item.translationRenderStrategy),
                metadata,
                allowInactive: options.inactive === true,
            };
            const handle = requestItemTranslation(item.id, requestOptions);
            const current = getItemById(item.id) || item;
            recordEvent('item.retry_requested', current, {
                message: reason,
                details: {
                    reason,
                    foresight: options.foresight === true,
                    retryOnProviderRestored: true,
                },
            });
            if (options.inactive === true && options.foresight === true) {
                retireItem(item.id, 'disappeared', {
                    eventType: 'item.prefetch_detached',
                    lifecycleIntent: 'prefetch-detached',
                    message: reason,
                    details: {
                        foresight: true,
                        retryReason: reason,
                        retryOnProviderRestored: true,
                    },
                });
            }
            return handle;
        }

        function createRetryMetadata(item, reason) {
            const metadata = clearFailureMetadataCopy(item && item.metadata);
            metadata.retryReason = reason;
            metadata.retrySource = 'providerAvailabilityRestored';
            metadata.retryRequestedAt = Date.now();
            return metadata;
        }

        function getRetrySourceText(item) {
            return firstString(
                item && item.translationSource,
                item && item.normalizedSource,
                item && item.visibleText,
                item && item.original,
                item && item.rawText
            );
        }

        function isForesightItem(item) {
            const metadata = item && item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
            return metadata.foresight === true && metadata.foresightConsumed !== true;
        }

        function clearFailureMetadataCopy(metadata) {
            const next = Object.assign({}, metadata && typeof metadata === 'object' ? metadata : {});
            FAILURE_METADATA_KEYS.forEach((key) => {
                try { delete next[key]; } catch (_) {}
            });
            return next;
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
            clearTranslationFailureMetadata(item);
            const metadata = clearFailureMetadataCopy(mergeDetails(item && item.metadata, context.metadata));
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
            delete request.allowInactive;

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

        function clearTranslationFailureMetadata(item) {
            if (!item || !item.metadata || typeof item.metadata !== 'object') return false;
            const next = clearFailureMetadataCopy(item.metadata);
            item.metadata = next;
            return true;
        }

        function completeJoinedForcedAsyncLookup(item, existingHandle, lookupHit, requestOptions = {}, context = {}) {
            const sourceHint = firstString(lookupHit && lookupHit.sourceHint, 'cache');
            cancelSupersededTranslationHandle(existingHandle, 'forced async cache lookup resolved on refresh');
            clearItemTranslationRequest(item);
            recordEvent('item.request_resolved', item, {
                details: {
                    hook: context.hook,
                    priority: context.requestPolicy && context.requestPolicy.priority,
                    source: sourceHint,
                    reason: 'forced async cache lookup resolved on refresh',
                },
            });
            return reuseLookupTranslation(item, {
                translation: firstString(lookupHit && lookupHit.translation),
                sourceHint,
            }, {
                hook: context.hook,
                priority: context.requestPolicy && context.requestPolicy.priority,
                metadata: context.metadata,
                requestOptions: Object.assign({}, requestOptions, {
                    sourceHint,
                }),
            });
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
            retryFailedTranslations,
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
