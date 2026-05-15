// Text orchestrator support: lifecycle.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/lifecycle.js.');
    }

    function createController(scope = {}) {
        const { firstString, normalizeInputRecord, applyPatch, normalizeId, normalizeStatus, statusFromTranslationEvent, mergeDetails, cloneItem, mergeProviderDispatchPolicy, normalizeTranslationService, preview, textEligibility, events } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { validateObservationOwnership, cancelItemTranslation, rejectOpenRenderCommands, upsertItem, createEmptyItem, getItemById, placeInactiveItem, releaseSlotIndexesForItem, claimSlotSignature, resetItemForSourceReplacement, recordEvent, resolveObservationIdentity, getRestoredItemStatus, shouldPreserveRefreshStatus, rememberSourceTranslation, hydrateSourceTranslation, applyObservationPolicy, applyObservationPriorityPolicy, resolveLifecyclePolicy, applyLifecyclePolicy } = Object.fromEntries(['validateObservationOwnership', 'cancelItemTranslation', 'rejectOpenRenderCommands', 'upsertItem', 'createEmptyItem', 'getItemById', 'placeInactiveItem', 'releaseSlotIndexesForItem', 'claimSlotSignature', 'resetItemForSourceReplacement', 'recordEvent', 'resolveObservationIdentity', 'getRestoredItemStatus', 'shouldPreserveRefreshStatus', 'rememberSourceTranslation', 'hydrateSourceTranslation', 'applyObservationPolicy', 'applyObservationPriorityPolicy', 'resolveLifecyclePolicy', 'applyLifecyclePolicy'].map((name) => [name, callScope(name)]));

        /**
         * Observe or refresh a text item.
         *
         * Adapters call this when a piece of text appears or is redetected. If
         * sourceAdapter/surfaceId/slotKey are the preferred identity. An
         * explicit input.id is only a caller hint inside the reporting adapter's
         * namespace; it cannot target another adapter's canonical item.
         */
        function observeRecord(input = {}, optionsForEvent = {}) {
            const source = normalizeInputRecord(input);
            const providedDecision = optionsForEvent
                && optionsForEvent.decision
                && optionsForEvent.decision.eligible === false
                ? optionsForEvent.decision
                : null;
            const eligibility = providedDecision || textEligibility.describe(input, source);
            let eventOptions = optionsForEvent || {};
            if (!eligibility.eligible) {
                source.status = 'skipped';
                source.sourceHint = firstString(source.sourceHint, eligibility.sourceHint, 'policy');
                source.metadata = Object.assign({}, source.metadata || {}, {
                    skipReason: eligibility.reason,
                    eligibilityCategory: eligibility.category,
                });
                eventOptions = Object.assign({}, eventOptions, {
                    eventType: eventOptions.eventType || 'item.skipped',
                    decision: eligibility,
                });
            }
            const identity = resolveObservationIdentity(source, eventOptions);
            const id = identity.id;
            if (!id) return null;
            source.id = id;
            if (identity.refreshed && identity.current) {
                const hasExplicitStatus = !!(input
                    && (Object.prototype.hasOwnProperty.call(input, 'status')
                        || Object.prototype.hasOwnProperty.call(input, 'translationStatus')));
                if (!hasExplicitStatus || shouldPreserveRefreshStatus(identity.current, source.status)) {
                    source.status = identity.current.status || source.status;
                }
            }
            if (identity.restored && identity.current) {
                source.status = getRestoredItemStatus(identity.current);
            }
            const statusWasProvided = !!(input
                && (Object.prototype.hasOwnProperty.call(input, 'status')
                    || Object.prototype.hasOwnProperty.call(input, 'translationStatus')));
            if (statusWasProvided) {
                const incomingStatus = normalizeStatus(source.status, 'detected');
                if (incomingStatus === 'pending' || incomingStatus === 'completed') {
                    hydrateSourceTranslation(source);
                }
            }
            if (!eligibility.eligible) {
                source.status = 'skipped';
                source.sourceHint = firstString(source.sourceHint, eligibility.sourceHint, 'policy');
            }
            applyObservationPolicy(source);
            if (!validateObservationOwnership(source, eventOptions)) return null;
            if (identity.sourceChangedInPlace && identity.current) {
                resetItemForSourceReplacement(identity.current);
            }
            if ((identity.refreshed || identity.restored) && identity.current) {
                applyObservationPriorityPolicy(identity.current, source, {
                    priorityReason: eventOptions.priorityReason,
                    message: identity.restored ? 'visible-restored' : 'visible-redetected',
                });
            }
            if (identity.replaced) {
                retireItem(identity.replaced.id, 'stale', {
                    eventType: 'item.replaced',
                    message: 'same slot replaced',
                    details: {
                        replacedBy: id,
                        slotKey: source.slotKey,
                        surfaceId: source.surfaceId,
                    },
                });
            }
            const item = upsertItem(id, source);
            if (identity.slotSignature) claimSlotSignature(identity.slotSignature, id);
            recordEvent(eventOptions.eventType || 'item.observed', item, {
                message: identity.sourceChangedInPlace
                    ? 'same slot source changed'
                    : (identity.refreshed ? 'same slot refreshed' : (source.message || '')),
                details: mergeDetails(eventOptions.decision && eventOptions.decision.details, {
                    decisionType: eventOptions.decision && eventOptions.decision.category,
                    slotKey: source.slotKey,
                    refreshed: identity.refreshed === true,
                    explicitId: identity.explicitId || '',
                    sourceChangedInPlace: identity.sourceChangedInPlace === true,
                }),
            });
            return cloneItem(item);
        }

        /**
         * Patch an item and emit a lifecycle event.
         *
         * This is the general-purpose state update path used by public methods.
         * Unknown ids are allowed so late translation telemetry can still
         * produce a debuggable archived/current item record.
         */
        function updateItem(id, patch = {}, optionsForEvent = {}) {
            const key = normalizeId(id);
            if (!key) return null;
            const rawPatch = patch && typeof patch === 'object' ? patch : {};
            const source = normalizeInputRecord(Object.assign({}, rawPatch, { id: key }));
            if (!Object.prototype.hasOwnProperty.call(rawPatch, 'status')
                && !Object.prototype.hasOwnProperty.call(rawPatch, 'translationStatus')) {
                delete source.status;
            }
            const item = upsertItem(key, source);
            recordEvent(optionsForEvent.eventType || 'item.updated', item, {
                message: optionsForEvent.message || '',
                details: mergeDetails(optionsForEvent.details, optionsForEvent.decision && optionsForEvent.decision.details),
            });
            return cloneItem(item);
        }

        /**
         * Deactivate an item and move it to detached items or archives.
         *
         * Retiring releases any slot signatures owned by the item so a future
         * observation in the same slot can become current. This does not cancel
         * a translation handle by itself; callers that own disappearance should
         * call cancelItemTranslation first when cancellation is desired.
         */
        function retireItem(id, status, optionsForEvent = {}) {
            const key = normalizeId(id);
            if (!key) return null;
            const existing = getItemById(key) || createEmptyItem(key);
            const lifecyclePolicy = resolveLifecyclePolicy(existing, status, optionsForEvent);
            const eventDetails = mergeDetails(optionsForEvent.details, lifecyclePolicy.details);
            applyLifecyclePolicy(existing, lifecyclePolicy);
            applyPatch(existing, normalizeInputRecord({ id: key, status }));
            existing.status = normalizeStatus(status, 'stale');
            existing.active = false;
            existing.updatedAt = Date.now();
            existing.deactivatedAt = existing.updatedAt;
            rejectOpenRenderCommands(existing, optionsForEvent.message || existing.status || 'item-retired', eventDetails);
            releaseSlotIndexesForItem(key);
            rememberSourceTranslation(existing, { force: true });
            placeInactiveItem(existing);
            recordEvent(optionsForEvent.eventType || `item.${existing.status}`, existing, {
                message: optionsForEvent.message || '',
                details: eventDetails,
            });
            return cloneItem(existing);
        }

        /**
         * Record that an adapter rendered text.
         *
         * Draw events usually carry translationDrawn and sometimes the raw
         * translationReceived. The orchestrator keeps both so diagnostics can
         * distinguish provider output from the text actually put on screen.
         */
        function recordDraw(id, eventName = 'draw', details = null) {
            const patch = {};
            if (details && typeof details === 'object') {
                const drawnText = firstString(details.translationDrawn, details.drawnTranslation, details.drawnText, details.text);
                const receivedText = firstString(details.translationReceived, details.receivedTranslation);
                if (drawnText) {
                    patch.translation = drawnText;
                    patch.translationDrawn = drawnText;
                }
                if (receivedText) patch.translationReceived = receivedText;
            }
            return updateItem(id, patch, {
                eventType: 'item.rendered',
                message: String(eventName || 'draw'),
                details,
            });
        }

        /**
         * Record an explanatory decision without otherwise changing item data.
         *
         * Hooks use this for skipped activation, priority joins, redraw choices,
         * and other useful diagnostics that are not lifecycle states.
         */
        function recordDecision(id, type, message = '', details = null) {
            return updateItem(id, {}, {
                eventType: `decision.${String(type || 'event')}`,
                message,
                details,
            });
        }

        /**
         * Mirror translation-service telemetry into item state.
         *
         * The translation service reports cache hits, cache misses, skips, and
         * provider completions independently of hook render lifecycles. This
         * method ties those events back to context.recordId when available.
         */
        function recordTranslationEvent(event, text, result = null, context = {}) {
            const source = context && typeof context === 'object' ? context : {};
            const id = source.recordId ? String(source.recordId) : '';
            if (!id) return null;
            const translated = typeof result === 'string' ? result : '';
            const eventName = String(event || 'event');
            const status = statusFromTranslationEvent(eventName);
            const patch = {
                id,
                hook: source.hook || '',
                status,
                translationSource: firstString(source.normalizedSource, text),
                normalizedSource: firstString(source.normalizedSource, text),
                translation: translated,
                translationReceived: translated,
                metadata: source.metadata || {},
            };
            return updateItem(id, patch, {
                eventType: `translation.${eventName}`,
                details: Object.assign({}, source, {
                    text: String(text ?? '').trim(),
                    resultPreview: translated ? preview(translated) : '',
                }),
            });
        }

        /**
         * Attach the translation service after bootstrap creates cache context.
         *
         * The orchestrator is constructed before the translation manager exists,
         * so bootstrap calls this once the queue/cache-backed service is ready.
         */
        function setTranslationService(service) {
            scope.translationService = normalizeTranslationService(service);
            scope.providerDispatch = mergeProviderDispatchPolicy(scope.providerDispatch, scope.translationService);
            return !!scope.translationService;
        }

        /**
         * Describe whether an observed text item should request translation.
         *
         * Adapters use this data-only decision to share text policy while
         * keeping rendering and replay mechanics adapter-local.
         */
        function describeTextEligibility(input = {}) {
            const source = normalizeInputRecord(input);
            return textEligibility.describe(input, source);
        }

        return {
            observeRecord,
            updateItem,
            retireItem,
            recordDraw,
            recordDecision,
            recordTranslationEvent,
            setTranslationService,
            describeTextEligibility,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorLifecycle', { create: createController });
})();
