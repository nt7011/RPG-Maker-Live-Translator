// Text orchestrator support: lifecycle and priority policy.
// This controller centralizes translation lifecycle intent and scheduler priority decisions.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.policy',
        factory() {
            function createController(scope = {}) {
                const { clampPriority, firstString, mergeDetails, logger } = scope;
                const { cancelItemTranslation, setItemTranslationPriority } = scope.controllerFacades.translationState;
                const { getItemById, hasLiveTranslationRequest } = scope.controllerFacades.items;
                const { schedulePublish } = scope.controllerFacades.intel;
                const GARBAGE_PRIORITY = 100;
                const POLICY_DEFAULTS = Object.freeze({
                    retired: freezePolicyDefaults('preserve', 'demote', 'retire', 'release', 'reject'),
                    'prefetch-detached': freezePolicyDefaults('preserve', 'preserve', 'retire', 'release', 'reject'),
                    'prefetch-lost': freezePolicyDefaults('preserve', 'demote', 'retire', 'release', 'reject'),
                    background: freezePolicyDefaults('preserve', 'demote', 'preserve', 'preserve', 'preserve'),
                    'slot-replaced': freezePolicyDefaults('preserve', 'demote', 'retire', 'release', 'reject'),
                    'source-replaced': freezePolicyDefaults('cancel', 'preserve', 'preserve', 'preserve', 'reject'),
                    'text-invalidated': freezePolicyDefaults('cancel', 'preserve', 'preserve', 'preserve', 'reject'),
                    'render-target-invalidated': freezePolicyDefaults('preserve', 'preserve', 'preserve', 'preserve', 'preserve'),
                    'render-target-replaced': freezePolicyDefaults('preserve', 'preserve', 'preserve', 'preserve', 'preserve'),
                });
                const POLICY_ACTIONS = Object.freeze({
                    translationAction: freezeActionValues('preserve', 'cancel'),
                    priorityAction: freezeActionValues('preserve', 'demote', 'none'),
                    placementAction: freezeActionValues('preserve', 'retire'),
                    slotAction: freezeActionValues('preserve', 'release'),
                    renderCommandAction: freezeActionValues('preserve', 'reject', 'rebase'),
                });

                function normalizeLifecyclePolicyKind(status = '', options = {}) {
                    const explicitPolicy = options.policy && typeof options.policy === 'object'
                        ? options.policy
                        : {};
                    const explicit = firstString(explicitPolicy.kind);
                    if (explicit) return normalizeExplicitPolicyKind(explicit);
                    warnInvalidPolicyKind('');
                    return {
                        valid: false,
                        kind: '',
                        reason: 'missing-lifecycle-policy',
                    };
                }

                function resolveLifecyclePolicy(item, status = '', options = {}) {
                    const details = options && typeof options.details === 'object' ? options.details : {};
                    const normalizedKind = normalizeLifecyclePolicyKind(status, options);
                    if (!normalizedKind.valid) return createInvalidLifecyclePolicy(normalizedKind, status, options, details);
                    const kind = normalizedKind.kind;
                    const defaults = POLICY_DEFAULTS[kind] || POLICY_DEFAULTS.retired;
                    const liveRequest = hasLiveTranslationRequest(item) === true;
                    const translationPolicy = resolvePolicyAction('translationAction', defaults.translationAction, options, details);
                    if (!translationPolicy.valid) return createInvalidLifecyclePolicyAction(kind, translationPolicy, status, options, details);
                    const priorityPolicy = resolvePolicyAction('priorityAction', defaults.priorityAction, options, details);
                    if (!priorityPolicy.valid) return createInvalidLifecyclePolicyAction(kind, priorityPolicy, status, options, details);
                    const placementPolicy = resolvePolicyAction('placementAction', defaults.placementAction, options, details);
                    if (!placementPolicy.valid) return createInvalidLifecyclePolicyAction(kind, placementPolicy, status, options, details);
                    const slotPolicy = resolvePolicyAction('slotAction', defaults.slotAction, options, details);
                    if (!slotPolicy.valid) return createInvalidLifecyclePolicyAction(kind, slotPolicy, status, options, details);
                    const renderCommandPolicy = resolvePolicyAction('renderCommandAction', defaults.renderCommandAction, options, details);
                    if (!renderCommandPolicy.valid) return createInvalidLifecyclePolicyAction(kind, renderCommandPolicy, status, options, details);
                    const translationAction = translationPolicy.action;
                    const requestedPriorityAction = priorityPolicy.action;
                    const placementAction = placementPolicy.action;
                    const slotAction = slotPolicy.action;
                    const renderCommandAction = renderCommandPolicy.action;
                    const shouldCancelTranslation = translationAction === 'cancel';
                    const demote = liveRequest && !shouldCancelTranslation && requestedPriorityAction === 'demote';
                    const priority = demote ? resolvePolicyPriority(options.policy, GARBAGE_PRIORITY) : null;
                    const priorityAction = shouldCancelTranslation || !liveRequest
                        ? 'none'
                        : requestedPriorityAction;
                    const reason = firstString(
                        options.priorityReason,
                        details.priorityReason,
                        options.message,
                        details.reason,
                        defaultPriorityReason(kind)
                    );
                    const normalized = {
                        valid: true,
                        kind,
                        translationAction,
                        priorityAction,
                        placementAction,
                        slotAction,
                        renderCommandAction,
                    };
                    return {
                        valid: true,
                        kind,
                        translationAction,
                        priorityAction,
                        placementAction,
                        slotAction,
                        renderCommandAction,
                        cancelReason: firstString(
                            options.cancelReason,
                            options.message,
                            details.reason,
                            defaultCancelReason(kind)
                        ),
                        cancelOptions: options.cancelOptions && typeof options.cancelOptions === 'object'
                            ? options.cancelOptions
                            : {},
                        demote,
                        priority,
                        priorityReason: reason,
                        details: mergeDetails(details, {
                            policy: {
                                kind,
                                translationAction,
                                priorityAction,
                                placementAction,
                                slotAction,
                                renderCommandAction,
                                priority,
                                reason,
                                normalized,
                            },
                        }),
                    };
                }

                function applyLifecyclePolicy(itemOrId, policy = {}) {
                    const item = resolveItem(itemOrId);
                    if (!item || !policy || policy.valid === false) return false;
                    rememberPolicy(item, {
                        lifecycle: {
                            kind: policy.kind,
                            translationAction: policy.translationAction || 'preserve',
                            priorityAction: policy.priorityAction || 'none',
                            placementAction: policy.placementAction || '',
                            slotAction: policy.slotAction || '',
                            renderCommandAction: policy.renderCommandAction || '',
                            priority: policy.priority,
                            reason: policy.priorityReason || policy.cancelReason || '',
                        },
                    });
                    let changed = false;
                    if (policy.translationAction === 'cancel') {
                        changed = lifecycleResultChanged(cancelItemTranslation(item.id, policy.cancelReason, policy.cancelOptions)) || changed;
                    }
                    if (policy.priority !== null && policy.priority !== undefined) {
                        changed = lifecycleResultChanged(applyPriorityPolicy(item.id, {
                            priority: policy.priority,
                            reason: policy.priorityReason,
                            action: policy.priorityAction,
                            source: policy.kind,
                        })) || changed;
                    }
                    return changed;
                }

                function resolveBackgroundPriorityPolicy(itemOrId, details = {}) {
                    const source = details && typeof details === 'object' ? details : {};
                    return {
                        intent: 'background',
                        priority: resolveBackgroundPriority(source, GARBAGE_PRIORITY),
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

                function lifecycleResultChanged(result) {
                    return result === true || !!(result && result.changed === true);
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

                function resolvePolicyPriority(policy = {}, fallback = GARBAGE_PRIORITY) {
                    return clampPriority(
                        policy && policy.priority !== undefined && policy.priority !== null
                            ? policy.priority
                            : fallback
                    );
                }

                function resolveBackgroundPriority(source = {}, fallback = GARBAGE_PRIORITY) {
                    return clampPriority(
                        source && source.priority !== undefined && source.priority !== null
                            ? source.priority
                            : fallback
                    );
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

                function freezePolicyDefaults(translationAction, priorityAction, placementAction, slotAction, renderCommandAction) {
                    return Object.freeze({
                        translationAction,
                        priorityAction,
                        placementAction,
                        slotAction,
                        renderCommandAction,
                    });
                }

                function freezeActionValues(...values) {
                    const result = {};
                    values.forEach((value) => {
                        result[String(value || '')] = true;
                    });
                    return Object.freeze(result);
                }

                function normalizeExplicitPolicyKind(kind) {
                    const raw = firstString(kind);
                    const normalized = raw.trim();
                    if (POLICY_DEFAULTS[normalized]) return createPolicyKindResult(normalized);
                    warnInvalidPolicyKind(raw);
                    return {
                        valid: false,
                        kind: raw,
                        reason: 'unknown-lifecycle-policy',
                    };
                }

                function createPolicyKindResult(kind) {
                    return {
                        valid: true,
                        kind,
                    };
                }

                function createInvalidLifecyclePolicy(normalizedKind, status, options, details) {
                    const kind = firstString(normalizedKind && normalizedKind.kind, 'unknown');
                    const reason = firstString(normalizedKind && normalizedKind.reason, 'invalid-lifecycle-policy');
                    const actionField = firstString(normalizedKind && normalizedKind.actionField);
                    const actionValue = firstString(normalizedKind && normalizedKind.actionValue);
                    return {
                        valid: false,
                        kind,
                        status: 'invalid-lifecycle-policy',
                        reason,
                        terminal: true,
                        details: mergeDetails(details, {
                            policy: {
                                kind,
                                invalid: true,
                                reason,
                                status: firstString(status),
                                actionField,
                                actionValue,
                            },
                        }),
                    };
                }

                function resolvePolicyAction(field, fallback, options = {}, details = {}) {
                    const explicitPolicy = options.policy && typeof options.policy === 'object'
                        ? options.policy
                        : {};
                    const override = resolvePolicyActionOverride(field, explicitPolicy);
                    const raw = override.found ? override.value : fallback;
                    return normalizePolicyAction(field, raw);
                }

                function resolvePolicyActionOverride(field, policy = {}) {
                    if (policy && typeof policy === 'object'
                        && Object.prototype.hasOwnProperty.call(policy, field)
                        && policy[field] !== undefined) {
                        return {
                            found: true,
                            value: firstString(policy[field]),
                        };
                    }
                    return {
                        found: false,
                        value: '',
                    };
                }

                function normalizePolicyAction(field, value) {
                    const raw = firstString(value);
                    const action = raw.trim();
                    const allowed = POLICY_ACTIONS[field] || {};
                    if (allowed[action] === true) {
                        return {
                            valid: true,
                            field,
                            action,
                        };
                    }
                    warnInvalidPolicyAction(field, raw);
                    return {
                        valid: false,
                        field,
                        action,
                        value: raw,
                        reason: 'invalid-lifecycle-policy-action',
                    };
                }

                function createInvalidLifecyclePolicyAction(kind, actionPolicy, status, options, details) {
                    return createInvalidLifecyclePolicy({
                        valid: false,
                        kind,
                        reason: actionPolicy && actionPolicy.reason ? actionPolicy.reason : 'invalid-lifecycle-policy-action',
                        actionField: actionPolicy && actionPolicy.field,
                        actionValue: actionPolicy && actionPolicy.value,
                    }, status, options, details);
                }

                function warnInvalidPolicyKind(kind) {
                    if (!logger || typeof logger.warn !== 'function') return;
                    try {
                        logger.warn('[TextOrchestrator] Invalid lifecycle policy kind.', {
                            kind: String(kind || ''),
                        });
                    } catch (_) {}
                }

                function warnInvalidPolicyAction(field, value) {
                    if (!logger || typeof logger.warn !== 'function') return;
                    try {
                        logger.warn('[TextOrchestrator] Invalid lifecycle policy action.', {
                            field: String(field || ''),
                            value: String(value || ''),
                        });
                    } catch (_) {}
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

            return { create: createController };
        },
    });
})();
