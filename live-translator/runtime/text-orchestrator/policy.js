// Text orchestrator support: lifecycle and priority policy.
// This controller centralizes translation lifecycle intent and scheduler priority decisions.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/policy.js.');
    }

    function createController(scope = {}) {
        const { clampPriority, firstString, mergeDetails } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            cancelItemTranslation,
            getItemById,
            hasLiveTranslationRequest,
            schedulePublish,
            setItemTranslationPriority,
        } = Object.fromEntries([
            'cancelItemTranslation',
            'getItemById',
            'hasLiveTranslationRequest',
            'schedulePublish',
            'setItemTranslationPriority',
        ].map((name) => [name, callScope(name)]));
        const GARBAGE_PRIORITY = 100;

        function normalizeLifecycleIntent(status = '', options = {}) {
            const details = options && typeof options.details === 'object' ? options.details : {};
            const explicit = firstString(
                options.lifecycleIntent,
                options.policyIntent,
                details.lifecycleIntent,
                details.policyIntent
            );
            if (explicit) return explicit;
            const eventType = firstString(options.eventType);
            if (eventType === 'item.prefetch_detached') return 'prefetch-detached';
            if (eventType === 'item.prefetch_canceled') return 'prefetch-lost';
            if (eventType === 'item.backgrounded') return 'background';
            if (eventType === 'item.replaced') return 'slot-replaced';
            if (details.foresight === true && String(status || '') === 'stale') return 'prefetch-lost';
            if (String(status || '') === 'stale') return 'retired';
            if (String(status || '') === 'disappeared') return 'retired';
            return 'retired';
        }

        function resolveLifecyclePolicy(item, status = '', options = {}) {
            const details = options && typeof options.details === 'object' ? options.details : {};
            const intent = normalizeLifecycleIntent(status, options);
            const liveRequest = hasLiveTranslationRequest(item) === true;
            const cancelTranslation = shouldCancelTranslation(intent, options);
            const demote = liveRequest && !cancelTranslation && shouldDemoteForLifecycle(intent, options);
            const priority = demote ? resolvePolicyPriority(options, details, GARBAGE_PRIORITY) : null;
            const priorityAction = cancelTranslation || !liveRequest
                ? 'none'
                : (demote ? 'demote' : 'preserve');
            const reason = firstString(
                options.priorityReason,
                details.priorityReason,
                options.message,
                details.reason,
                defaultPriorityReason(intent)
            );
            return {
                intent,
                cancelTranslation,
                cancelReason: firstString(
                    options.cancelReason,
                    options.message,
                    details.reason,
                    defaultCancelReason(intent)
                ),
                cancelOptions: options.cancelOptions && typeof options.cancelOptions === 'object'
                    ? options.cancelOptions
                    : {},
                demote,
                priority,
                priorityAction,
                priorityReason: reason,
                details: mergeDetails(details, {
                    policy: {
                        lifecycleIntent: intent,
                        translationAction: cancelTranslation ? 'cancel' : 'continue',
                        priorityAction,
                        priority,
                        reason,
                    },
                }),
            };
        }

        function applyLifecyclePolicy(itemOrId, policy = {}) {
            const item = resolveItem(itemOrId);
            if (!item || !policy) return false;
            rememberPolicy(item, {
                lifecycle: {
                    intent: policy.intent,
                    translationAction: policy.cancelTranslation === true ? 'cancel' : 'continue',
                    priorityAction: policy.priorityAction || 'none',
                    priority: policy.priority,
                    reason: policy.priorityReason || policy.cancelReason || '',
                },
            });
            let changed = false;
            if (policy.cancelTranslation === true) {
                changed = cancelItemTranslation(item.id, policy.cancelReason, policy.cancelOptions) === true || changed;
            }
            if (policy.priority !== null && policy.priority !== undefined) {
                changed = applyPriorityPolicy(item.id, {
                    priority: policy.priority,
                    reason: policy.priorityReason,
                    action: policy.priorityAction,
                    source: policy.intent,
                }) === true || changed;
            }
            return changed;
        }

        function resolveBackgroundPriorityPolicy(itemOrId, details = {}) {
            const source = details && typeof details === 'object' ? details : {};
            return {
                intent: 'background',
                priority: resolvePolicyPriority(source, source, GARBAGE_PRIORITY),
                reason: firstString(source.priorityReason, source.reason, 'backgrounded'),
                action: 'demote',
                source: 'background',
            };
        }

        function applyPriorityPolicy(itemOrId, policy = {}) {
            const item = resolveItem(itemOrId);
            if (!item || !policy) return false;
            const priority = clampPriority(
                policy.priority !== undefined && policy.priority !== null
                    ? policy.priority
                    : GARBAGE_PRIORITY
            );
            const reason = firstString(policy.reason, policy.priorityReason);
            const action = firstString(policy.action, policy.priorityAction, 'set');
            const source = firstString(policy.source, policy.intent);
            rememberPolicy(item, {
                priority: {
                    action,
                    priority,
                    reason,
                    source,
                },
            });
            return setItemTranslationPriority(item.id, priority, reason, {
                policy: {
                    priorityAction: action,
                    priority,
                    reason,
                    source,
                },
            });
        }

        function applyObservationPolicy(source = {}) {
            if (!source || typeof source !== 'object') return source;
            if (isForegroundObservation(source)) {
                source.backgrounded = false;
                source.visible = true;
                if (!source.screenState) source.screenState = 'visible';
            }
            return source;
        }

        function applyObservationPriorityPolicy(itemOrId, source = {}, options = {}) {
            const item = resolveItem(itemOrId);
            if (!item || !hasLiveTranslationRequest(item) || !isForegroundObservation(source)) return false;
            const priority = source.priority !== undefined && source.priority !== null
                ? clampPriority(source.priority)
                : null;
            if (priority === null) return false;
            const handle = item.translationHandle;
            const handlePriority = handle && typeof handle.getPriority === 'function'
                ? clampPriority(handle.getPriority())
                : null;
            if (item.priority === priority && handlePriority === priority) return false;
            return applyPriorityPolicy(item, {
                priority,
                action: handlePriority !== null && priority > handlePriority ? 'promote' : 'set',
                reason: firstString(
                    options.priorityReason,
                    options.message,
                    'visible-redetected'
                ),
                source: 'observation',
            });
        }

        function resolveRequestPolicy(item, requestOptions = {}, context = {}) {
            const metadata = context && typeof context.metadata === 'object' ? context.metadata : {};
            const priority = clampPriority(
                context.priority !== undefined && context.priority !== null
                    ? context.priority
                    : (requestOptions.priority !== undefined && requestOptions.priority !== null
                        ? requestOptions.priority
                        : (item && item.priority !== null && item.priority !== undefined ? item.priority : undefined))
            );
            const wantsStreaming = requestWantsStreaming(requestOptions);
            const replaceSubscriber = !!(item
                && item.translationHandle
                && item.translationToken
                && wantsStreaming
                && (item.translationStream !== true
                    || (typeof requestOptions.onDelta === 'function' && item.translationHasDelta !== true)));
            const foresight = metadata.foresight === true || !!(item && item.metadata && item.metadata.foresight === true);
            const foreground = !foresight && isForegroundRequest(item, requestOptions);
            return {
                priority,
                priorityReason: firstString(context.priorityReason, requestOptions.priorityReason, 'same slot/source redetected'),
                stream: wantsStreaming,
                replaceSubscriber,
                foreground,
                clearBackground: foreground,
            };
        }

        function applyRequestPolicy(item, policy = {}) {
            if (!item || !policy) return item || null;
            rememberPolicy(item, {
                request: {
                    priority: policy.priority,
                    stream: policy.stream === true,
                    replaceSubscriber: policy.replaceSubscriber === true,
                    foreground: policy.foreground === true,
                    clearBackground: policy.clearBackground === true,
                    reason: firstString(policy.priorityReason),
                },
            });
            if (policy.clearBackground === true && item.backgrounded === true) {
                item.backgrounded = false;
                item.visible = true;
                item.screenState = 'visible';
                item.updatedAt = Date.now();
                schedulePublish();
            }
            return item;
        }

        function requestWantsStreaming(requestOptions = {}) {
            return !!(requestOptions
                && (requestOptions.stream === true
                    || requestOptions.mode === 'stream'
                    || typeof requestOptions.onDelta === 'function'));
        }

        function resolvePolicyPriority(options = {}, details = {}, fallback = GARBAGE_PRIORITY) {
            return clampPriority(
                options.priority !== undefined && options.priority !== null
                    ? options.priority
                    : (details.priorityOverride !== undefined && details.priorityOverride !== null
                        ? details.priorityOverride
                        : fallback)
            );
        }

        function shouldCancelTranslation(intent, options = {}) {
            if (options.cancelTranslation === true) return true;
            return intent === 'source-replaced' || intent === 'text-invalidated';
        }

        function shouldDemoteForLifecycle(intent, options = {}) {
            if (options.preservePriority === true) return false;
            if (intent === 'prefetch-detached') return false;
            if (intent === 'source-replaced' || intent === 'text-invalidated') return false;
            return true;
        }

        function defaultPriorityReason(intent) {
            if (intent === 'prefetch-lost') return 'foresight-lost';
            if (intent === 'background') return 'backgrounded';
            if (intent === 'slot-replaced') return 'same slot replaced';
            return 'item-retired';
        }

        function defaultCancelReason(intent) {
            if (intent === 'source-replaced') return 'same slot source changed';
            if (intent === 'text-invalidated') return 'text invalidated';
            return 'translation canceled';
        }

        function resolveItem(itemOrId) {
            if (itemOrId && typeof itemOrId === 'object' && itemOrId.id) return itemOrId;
            return getItemById(itemOrId);
        }

        function rememberPolicy(item, patch = {}) {
            if (!item || !patch || typeof patch !== 'object') return;
            const current = item.policy && typeof item.policy === 'object' ? item.policy : {};
            const next = Object.assign({}, current);
            Object.keys(patch).forEach((key) => {
                const value = patch[key];
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    next[key] = value;
                    return;
                }
                next[key] = Object.assign({}, current[key] && typeof current[key] === 'object' ? current[key] : {}, value);
            });
            next.updatedAt = Date.now();
            item.policy = next;
        }

        function isForegroundObservation(source = {}) {
            const screenState = firstString(source.screenState).toLowerCase();
            return source.visible === true || screenState === 'visible';
        }

        function isForegroundRequest(item, requestOptions = {}) {
            const screenState = firstString(requestOptions.screenState, item && item.screenState).toLowerCase();
            return requestOptions.visible === true
                || (item && item.visible === true && screenState === 'visible');
        }

        return {
            normalizeLifecycleIntent,
            resolveLifecyclePolicy,
            applyLifecyclePolicy,
            resolveBackgroundPriorityPolicy,
            applyPriorityPolicy,
            applyObservationPolicy,
            applyObservationPriorityPolicy,
            resolveRequestPolicy,
            applyRequestPolicy,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorPolicy', { create: createController });
})();
