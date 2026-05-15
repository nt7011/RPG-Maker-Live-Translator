// Text orchestrator support: translation-state.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/translation-state.js.');
    }

    function createController(scope = {}) {
        const { firstString, firstNonEmptyString, clampPriority, normalizeId, mergeDetails, cloneItem, decorateTranslationHandle, resolveHandleSourceHint, isAbortErrorLike, activeItems, detachedItems } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { updateItem, retireItem, queueRenderCommand, clearItemTranslationRequest, getItemById, moveToActive, moveToArchive, recordEvent, rememberSourceTranslation, forgetSourceTranslation, classifyNoopTranslation, isSkippedItem, resolveBackgroundPriorityPolicy, applyPriorityPolicy } = Object.fromEntries(['updateItem', 'retireItem', 'queueRenderCommand', 'clearItemTranslationRequest', 'getItemById', 'moveToActive', 'moveToArchive', 'recordEvent', 'rememberSourceTranslation', 'forgetSourceTranslation', 'classifyNoopTranslation', 'isSkippedItem', 'resolveBackgroundPriorityPolicy', 'applyPriorityPolicy'].map((name) => [name, callScope(name)]));

        /**
         * Cancel the active translation subscriber for an item.
         *
         * This cancels only this item subscriber. The translation service may
         * keep the shared provider job alive if another subscriber still needs
         * the same normalized source text.
         */
        function cancelItemTranslation(id, reason = 'translation canceled', options = {}) {
            const item = activeItems.get(String(id || '')) || detachedItems.get(String(id || ''));
            const handle = item && item.translationHandle ? item.translationHandle : null;
            if (!handle || typeof handle.cancel !== 'function') return false;
            try {
                return handle.cancel(reason, options && typeof options === 'object' ? options : {}) === true;
            } catch (_) {
                return false;
            }
        }

        /**
         * Change both the item's recorded priority and its active subscriber
         * priority in the translation queue.
         *
         * Adapters should use this when visibility changes so the scheduler can
         * promote visible text and demote background text without losing work.
         */
        function setItemTranslationPriority(id, priority, reason = '', details = {}) {
            const item = activeItems.get(String(id || '')) || detachedItems.get(String(id || ''));
            if (!item || isSkippedItem(item)) return false;
            const numericPriority = clampPriority(priority);
            const itemChanged = item.priority === numericPriority
                ? false
                : !!setItemPriority(id, numericPriority, reason, details);
            const handle = item && item.translationHandle ? item.translationHandle : null;
            if (!handle || typeof handle.setPriority !== 'function') return itemChanged;
            try {
                return handle.setPriority(numericPriority, reason || '') === true || itemChanged;
            } catch (_) {
                return itemChanged;
            }
        }

        /**
         * Mark an item as waiting for translation.
         *
         * This records scheduler-facing context such as priority and sourceHint
         * before the underlying translation handle resolves.
         */
        function markTranslationRequested(id, details = {}) {
            const patch = {
                status: 'pending',
                priority: details && details.priority,
                sourceHint: details && details.sourceHint,
                metadata: details && details.metadata,
            };
            return updateItem(id, patch, {
                eventType: 'item.requested',
                details,
            });
        }

        /**
         * Mark an item as skipped by translation policy.
         *
         * The returned text is usually the original input. Keeping it in
         * translationReceived makes diagnostics explicit about what the adapter
         * was told to render or ignore.
         */
        function markTranslationSkipped(id, translation, details = {}) {
            const translated = firstString(translation);
            const metadata = mergeDetails(details && details.metadata, {
                skipReason: details && details.reason,
                eligibilityCategory: details && details.category,
            });
            return updateItem(id, {
                status: 'skipped',
                translation: translated,
                translationReceived: translated,
                sourceHint: details && details.sourceHint,
                metadata,
            }, {
                eventType: 'item.skipped',
                message: details && details.reason ? details.reason : '',
                details,
            });
        }

        function skipItemTranslation(item, eligibility, context = {}) {
            const text = firstString(
                eligibility && eligibility.text,
                item && item.translationSource,
                item && item.normalizedSource,
                item && item.visibleText,
                item && item.original,
                item && item.rawText
            );
            const reason = eligibility && eligibility.reason ? eligibility.reason : 'translation skipped';
            const sourceHint = eligibility && eligibility.sourceHint ? eligibility.sourceHint : 'policy';
            const priority = clampPriority(context.priority);
            const existingHandle = item && item.translationHandle ? item.translationHandle : null;
            if (existingHandle && typeof existingHandle.cancel === 'function') {
                try { existingHandle.cancel(reason, { abortJob: true }); } catch (_) {}
            }
            clearItemTranslationRequest(item);
            markTranslationSkipped(item.id, text, {
                reason,
                sourceHint,
                hook: context.hook,
                priority,
                category: eligibility && eligibility.category ? eligibility.category : 'policy',
                metadata: context.metadata,
                eligibility: eligibility && eligibility.details ? eligibility.details : null,
            });
            return decorateTranslationHandle({
                promise: Promise.resolve(text),
                cancel: () => false,
                setPriority: () => false,
                getPriority: () => priority,
                getStatus: () => 'skipped',
                getSourceHint: () => sourceHint,
            });
        }

        /**
         * Mark an item completed from cache or precache.
         *
         * Cache hits are separated from provider completions because they are
         * useful for tuning cache coverage and detecting unexpected provider
         * calls.
         */
        function markCacheHit(id, translation, details = {}) {
            const patch = {
                status: 'completed',
                translation: firstString(translation),
                translationReceived: firstString(translation),
                sourceHint: details && details.sourceHint ? details.sourceHint : 'cache',
                metadata: details && details.metadata,
            };
            return updateItem(id, patch, {
                eventType: 'item.cache_hit',
                details: Object.assign({
                    source: patch.sourceHint,
                    translationReceived: patch.translationReceived,
                }, details || {}),
            });
        }

        /**
         * Mark an item completed from the provider path.
         *
         * This stores the provider output as both translation and
         * translationReceived. Adapter-specific restoration may later record a
         * different translationDrawn value.
         */
        function markTranslationCompleted(id, translation, details = {}) {
            const patch = {
                status: 'completed',
                translation: firstString(translation),
                translationReceived: firstString(translation),
                sourceHint: details && details.sourceHint ? details.sourceHint : 'provider',
                metadata: details && details.metadata,
            };
            return updateItem(id, patch, {
                eventType: 'item.translated',
                details: Object.assign({
                    source: patch.sourceHint,
                    translationReceived: patch.translationReceived,
                }, details || {}),
            });
        }

        function markTranslationNoop(id, translation, details = {}) {
            const item = getItemById(id);
            if (!item) return null;
            const received = firstString(translation, details && details.translationReceived);
            const reason = firstString(details && details.reason, 'translation-noop');
            const category = firstString(details && details.category, 'sameAsSource');
            const now = Date.now();
            clearItemTranslationRequest(item);
            item.status = 'failed';
            item.translation = '';
            item.translationReceived = received;
            item.translationDrawn = '';
            item.sourceHint = firstString(details && details.sourceHint, item.sourceHint, 'provider');
            item.metadata = mergeDetails(item.metadata, details && details.metadata, {
                translationFailureReason: reason,
                translationFailureCategory: category,
            });
            item.updatedAt = now;
            item.lastSeenAt = now;
            item.sequence = ++scope.sequence;
            item.active = true;
            item.deactivatedAt = null;
            moveToActive(item);
            forgetSourceTranslation(item, received);
            recordEvent('item.translation_noop', item, {
                message: reason,
                details: Object.assign({
                    reason,
                    category,
                    source: item.sourceHint,
                    translationReceived: received,
                }, details || {}),
            });
            return cloneItem(item);
        }

        function storeDetachedTranslation(item, translation, details = {}) {
            if (!item) return null;
            const translated = firstString(translation);
            item.translation = translated;
            item.translationReceived = translated;
            item.sourceHint = firstNonEmptyString(details && details.sourceHint, item.sourceHint, 'provider');
            item.metadata = mergeDetails(item.metadata, details && details.metadata);
            item.updatedAt = Date.now();
            item.sequence = ++scope.sequence;
            rememberSourceTranslation(item, { force: true });
            moveToArchive(item);
            recordEvent('item.translation_stored', item, {
                message: 'detached',
                details: Object.assign({}, details || {}, {
                    detached: true,
                    source: item.sourceHint,
                    translation: translated,
                    translationReceived: translated,
                }),
            });
            return cloneItem(item);
        }

        function storeDetachedTranslationNoop(item, translation, details = {}) {
            if (!item) return null;
            const translated = firstString(translation);
            const reason = firstString(details && details.reason, 'translation-noop');
            const category = firstString(details && details.category, 'sameAsSource');
            item.status = 'failed';
            item.translation = '';
            item.translationReceived = translated;
            item.translationDrawn = '';
            item.sourceHint = firstNonEmptyString(details && details.sourceHint, item.sourceHint, 'provider');
            item.metadata = mergeDetails(item.metadata, details && details.metadata, {
                translationFailureReason: reason,
                translationFailureCategory: category,
            });
            item.updatedAt = Date.now();
            item.sequence = ++scope.sequence;
            forgetSourceTranslation(item, translated);
            moveToArchive(item);
            recordEvent('item.translation_noop_detached', item, {
                message: reason,
                details: Object.assign({
                    detached: true,
                    reason,
                    category,
                    source: item.sourceHint,
                    translationReceived: translated,
                }, details || {}),
            });
            return cloneItem(item);
        }

        function storeDetachedTranslationSkip(item, details = {}) {
            if (!item) return null;
            item.sourceHint = firstNonEmptyString(details && details.sourceHint, item.sourceHint, 'policy');
            item.metadata = mergeDetails(item.metadata, details && details.metadata);
            item.updatedAt = Date.now();
            item.sequence = ++scope.sequence;
            moveToArchive(item);
            recordEvent('item.translation_skipped_detached', item, {
                message: details && details.reason ? details.reason : 'detached',
                details: Object.assign({ detached: true }, details || {}),
            });
            return cloneItem(item);
        }

        function recordDetachedTranslationFailure(item, error) {
            if (!item) return null;
            const message = error && error.message ? error.message : String(error || 'translation failed');
            item.updatedAt = Date.now();
            item.sequence = ++scope.sequence;
            moveToArchive(item);
            recordEvent(isAbortErrorLike(error) ? 'item.translation_canceled_detached' : 'item.translation_failed_detached', item, {
                message,
                details: { detached: true, reason: message },
            });
            return cloneItem(item);
        }

        /**
         * Record an item's current priority without touching a queue handle.
         *
         * Use setItemTranslationPriority when an active translation subscriber
         * also needs to move in the scheduler.
         */
        function setItemPriority(id, priority, reason = '', details = {}) {
            const key = normalizeId(id);
            const item = getItemById(key);
            if (item && (isSkippedItem(item) || item.priority === clampPriority(priority))) return false;
            const numericPriority = clampPriority(priority);
            return updateItem(id, { priority: numericPriority }, {
                eventType: 'item.priority_changed',
                message: reason || '',
                details: Object.assign({ priority: numericPriority }, details || {}),
            });
        }

        /**
         * Record whether an item is currently visible on screen.
         *
         * Visibility is separate from active/inactive lifecycle. Hidden items
         * can stay active and keep their translation handle at lower priority so
         * the result is ready if the text reappears.
         */
        function setItemVisibility(id, visible, details = {}) {
            const key = normalizeId(id);
            const isVisible = visible === true;
            const screenState = details && details.screenState
                ? String(details.screenState)
                : (isVisible ? 'visible' : 'hidden');
            const item = getItemById(key);
            if (item && item.visible === isVisible && String(item.screenState || '') === screenState) {
                return cloneItem(item);
            }
            return updateItem(id, {
                visible: isVisible,
                screenState,
            }, {
                eventType: isVisible ? 'item.visible' : 'item.hidden',
                message: details && details.reason ? details.reason : '',
                details,
            });
        }

        /**
         * Mark an item as backgrounded while keeping it active.
         *
         * This is for important text, such as game messages, that disappeared
         * from the current frame but should keep a low-priority translation
         * subscriber instead of being canceled.
         */
        function backgroundItem(id, details = {}) {
            const policy = resolveBackgroundPriorityPolicy(id, details);
            const priority = policy.priority;
            const updated = updateItem(id, {
                visible: false,
                backgrounded: true,
                priority,
                screenState: details && details.screenState ? String(details.screenState) : 'background',
            }, {
                eventType: 'item.backgrounded',
                message: details && details.reason ? details.reason : '',
                details: Object.assign({ priority }, details || {}),
            });
            applyPriorityPolicy(id, policy);
            return updated;
        }

        /**
         * Finish an orchestrator-owned translation request.
         *
         * The handle/token guard is the stale-result protection: if an adapter
         * replaced, retired, or re-requested the item while the promise was
         * pending, this completion is ignored. Current completions update item
         * state and optionally queue a render command.
         */
        function completeItemTranslation(id, handle, token, translated, requestOptions = {}) {
            const item = activeItems.get(String(id || '')) || detachedItems.get(String(id || ''));
            if (!item || item.translationHandle !== handle || item.translationToken !== token) return null;
            clearItemTranslationRequest(item);

            const sourceHint = resolveHandleSourceHint(handle, requestOptions.sourceHint || 'provider');
            const status = typeof handle.getStatus === 'function' ? String(handle.getStatus() || '') : '';
            const details = {
                sourceHint,
                metadata: mergeDetails(item.metadata, requestOptions.metadata),
                hook: firstString(requestOptions.hook, item.hook, item.sourceAdapter),
            };
            const detached = activeItems.get(item.id) !== item || item.active !== true;
            if (sourceHint === 'filter' || sourceHint === 'none' || status === 'skipped') {
                if (detached) {
                    return storeDetachedTranslationSkip(item, Object.assign({}, details, {
                        reason: sourceHint || status || 'translation skipped',
                    }));
                }
                return markTranslationSkipped(item.id, translated, Object.assign({}, details, {
                    reason: sourceHint || status || 'translation skipped',
                }));
            }
            const noop = classifyNoopTranslation(item, translated);
            if (noop) {
                const noopDetails = Object.assign({}, details, noop, {
                    metadata: mergeDetails(details.metadata, {
                        translationFailureReason: noop.reason,
                        translationFailureCategory: noop.category,
                    }),
                });
                if (detached) return storeDetachedTranslationNoop(item, translated, noopDetails);
                return markTranslationNoop(item.id, translated, noopDetails);
            }
            if (detached) return storeDetachedTranslation(item, translated, details);

            const completed = sourceHint === 'cache' || sourceHint === 'precache'
                ? markCacheHit(item.id, translated, details)
                : markTranslationCompleted(item.id, translated, details);
            if (requestOptions.queueRender !== false) {
                const strategy = firstString(requestOptions.renderStrategy, item.translationRenderStrategy, item.renderStrategy);
                if (strategy) {
                    queueRenderCommand(item.id, {
                        strategy,
                        text: firstString(translated),
                        generation: item.generation || 0,
                        metadata: Object.assign({}, details.metadata || {}, {
                            sourceHint,
                            translationReceived: firstString(translated),
                        }),
                    });
                }
            }
            return completed;
        }

        /**
         * Handle rejection from an orchestrator-owned translation request.
         *
         * Abort-like errors mean the subscriber was canceled and the item is
         * retired as stale. Other errors leave the item active but failed so the
         * diagnostics surface can show the broken request.
         */
        function failItemTranslation(id, handle, token, error) {
            const item = activeItems.get(String(id || '')) || detachedItems.get(String(id || ''));
            if (!item || item.translationHandle !== handle || item.translationToken !== token) return null;
            clearItemTranslationRequest(item);
            if (activeItems.get(item.id) !== item || item.active !== true) {
                return recordDetachedTranslationFailure(item, error);
            }
            const message = error && error.message ? error.message : String(error || 'translation failed');
            if (isAbortErrorLike(error)) {
                return retireItem(item.id, 'stale', {
                    eventType: 'item.canceled',
                    message,
                    details: { reason: message },
                });
            }
            return updateItem(item.id, { status: 'failed' }, {
                eventType: 'item.failed',
                message,
                details: { reason: message },
            });
        }

        return {
            cancelItemTranslation,
            setItemTranslationPriority,
            markTranslationRequested,
            markTranslationSkipped,
            skipItemTranslation,
            markCacheHit,
            markTranslationCompleted,
            markTranslationNoop,
            storeDetachedTranslation,
            storeDetachedTranslationNoop,
            storeDetachedTranslationSkip,
            recordDetachedTranslationFailure,
            setItemPriority,
            setItemVisibility,
            backgroundItem,
            completeItemTranslation,
            failItemTranslation,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorTranslationState', { create: createController });
})();
