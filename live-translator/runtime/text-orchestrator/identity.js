// Text orchestrator support: identity.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/identity.js.');
    }

    function createController(scope = {}) {
        const { ACTIVE_STATUSES, firstString, firstNonEmptyString, safeIdPart, hashStringForId, normalizeId, normalizeStatus, activeItems, detachedItems, detachedItemsBySlotSignature, slotIndex } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { getItemById, hasLiveTranslationRequest } = Object.fromEntries(['getItemById', 'hasLiveTranslationRequest'].map((name) => [name, callScope(name)]));

        /**
         * Decide which id an observation should use.
         *
         * Slot identity wins when adapters provide a stable surface/slot. An
         * explicit adapter id is the preferred id for a new occupant, but it
         * cannot bypass refresh, replacement, or detached-request rejoin.
         */
        function resolveObservationIdentity(source, optionsForEvent = {}) {
            const requestedExplicitId = normalizeId(source && source.id);
            const explicitId = normalizeExplicitObservationId(source);
            const slotSignature = buildSlotSignature(source);
            const currentId = slotSignature ? slotIndex.get(slotSignature) : '';
            const current = currentId ? activeItems.get(currentId) : null;
            if (slotSignature) {
                if (current && isSameObservedText(current, source)) {
                    return {
                        id: current.id,
                        explicitId: requestedExplicitId,
                        slotSignature,
                        refreshed: true,
                        replaced: null,
                        current,
                    };
                }
                const detached = findReusableDetachedItem(slotSignature, source);
                if (detached) {
                    return {
                        id: detached.id,
                        explicitId: requestedExplicitId,
                        slotSignature,
                        refreshed: true,
                        restored: true,
                        replaced: current && current.id !== detached.id && optionsForEvent.replace !== false ? current : null,
                        current: detached,
                    };
                }
                const nextId = getAvailableExplicitObservationId(explicitId, source)
                    || createGeneratedItemId(source);
                const sourceChangedInPlace = !!(current && current.id === nextId && !isSameObservedText(current, source));
                return {
                    id: nextId,
                    explicitId: requestedExplicitId,
                    slotSignature,
                    refreshed: false,
                    replaced: current && current.id !== nextId && optionsForEvent.replace !== false ? current : null,
                    current,
                    sourceChangedInPlace,
                };
            }
            if (explicitId) {
                const nextId = getAvailableExplicitObservationId(explicitId, source)
                    || createGeneratedItemId(source);
                return {
                    id: nextId,
                    explicitId: requestedExplicitId,
                    slotSignature: '',
                    refreshed: false,
                    replaced: null,
                    current: getItemById(nextId),
                };
            }
            return {
                id: createGeneratedItemId(source),
                explicitId: requestedExplicitId,
                slotSignature: '',
                refreshed: false,
                replaced: null,
                current: null,
            };
        }

        /**
         * Build the stable key for a logical text slot.
         *
         * A slot is adapter scoped so different hooks can report the same
         * surface and slot names without replacing each other's items.
         */
        function buildSlotSignature(source) {
            const surfaceId = firstNonEmptyString(source.identitySurfaceId, source.surfaceId);
            const slotKey = firstString(source.slotKey);
            if (!surfaceId || !slotKey) return '';
            const adapter = firstString(source.sourceAdapter, source.hook, source.surfaceType, 'text');
            return `${adapter}|${surfaceId}|${slotKey}`;
        }

        function normalizeExplicitObservationId(source) {
            const id = normalizeId(source && source.id);
            if (!id) return '';
            const owner = getObservationOwner(source);
            return isAdapterOwnedObservationId(id, owner)
                ? id
                : createAdapterScopedObservationId(owner, id);
        }

        function getAvailableExplicitObservationId(id, source) {
            if (!id) return '';
            const existing = getItemById(id);
            if (canObservationUseExistingItem(existing, source)) return id;
            const fallback = createAdapterScopedObservationId(getObservationOwner(source), id);
            const fallbackExisting = getItemById(fallback);
            return canObservationUseExistingItem(fallbackExisting, source)
                ? fallback
                : '';
        }

        function canObservationUseExistingItem(existing, source) {
            if (!existing) return true;
            if (!isSameObservationOwner(existing, source)) return false;
            if (!hasObservedSourceText(existing) || !hasObservedSourceText(source)) return true;
            return isSameObservedText(existing, source);
        }

        function isSameObservationOwner(left, right) {
            return safeIdPart(getObservationOwner(left)) === safeIdPart(getObservationOwner(right));
        }

        function isAdapterOwnedObservationId(id, owner) {
            const adapter = safeIdPart(owner);
            return !!(adapter && String(id || '').indexOf(`${adapter}:`) === 0);
        }

        function createAdapterScopedObservationId(owner, id) {
            const adapter = safeIdPart(owner);
            const readable = safeIdPart(id).slice(0, 96);
            return `${adapter}:${readable}:${hashStringForId(id)}`;
        }

        function getObservationOwner(source) {
            return firstString(source && source.sourceAdapter, source && source.hook, source && source.surfaceType, 'text');
        }

        /**
         * Compare an active item with a new observation for refresh decisions.
         *
         * The comparison uses the best available normalized/source/original
         * text rather than rendered translation, because slot identity tracks
         * source text ownership.
         */
        function isSameObservedText(item, source) {
            const itemText = firstString(item.normalizedSource, item.translationSource, item.original, item.visibleText, item.rawText).trim();
            const nextText = firstString(source.normalizedSource, source.translationSource, source.original, source.visibleText, source.rawText).trim();
            return itemText === nextText;
        }

        function hasObservedSourceText(source) {
            return !!firstString(
                source && source.normalizedSource,
                source && source.translationSource,
                source && source.original,
                source && source.visibleText,
                source && source.rawText
            ).trim();
        }

        /**
         * Rejoin a detached in-flight item when the same source is redrawn
         * in the same slot. Completed detached items are archived after the
         * translation service stores their result, so they do not need item
         * identity reuse.
         */
        function findReusableDetachedItem(slotSignature, source) {
            if (!slotSignature) return null;
            const ids = detachedItemsBySlotSignature.get(slotSignature);
            if (!ids || !ids.size) return null;
            const candidates = Array.from(ids)
                .map((id) => detachedItems.get(id))
                .filter((item) => item && isSameObservedText(item, source))
                .sort((a, b) => (b.updatedAt || b.lastSeenAt || 0) - (a.updatedAt || a.lastSeenAt || 0));
            for (const item of candidates) {
                if (hasLiveTranslationRequest(item)) return item;
            }
            return null;
        }

        function getRestoredItemStatus(item) {
            if (!item) return 'detected';
            if (item.translationHandle && item.translationToken) return 'translating';
            const status = normalizeStatus(item.status, 'detected');
            return ACTIVE_STATUSES[status] === true ? status : 'detected';
        }

        function shouldPreserveRefreshStatus(item, incomingStatus) {
            const current = normalizeStatus(item && item.status, 'detected');
            const incoming = normalizeStatus(incomingStatus, 'detected');
            if (!ACTIVE_STATUSES[current]) return false;
            return incoming === 'detected' || incoming === 'pending';
        }

        /**
         * Create a readable item id for observations that do not provide one.
         *
         * Generated ids are intentionally diagnostic, not stable across process
         * restarts. Stable slot signatures handle refresh/replacement within a
         * running game.
         */
        function createGeneratedItemId(source) {
            const adapter = safeIdPart(firstString(source.sourceAdapter, source.hook, 'text'));
            const surface = safeIdPart(firstNonEmptyString(source.identitySurfaceId, source.surfaceId, source.surfaceType, 'surface'));
            const slot = safeIdPart(firstString(source.slotKey, 'slot'));
            scope.itemSequence += 1;
            return `${adapter}:${surface}:${slot}:${scope.itemSequence.toString(36)}`;
        }

        function buildSourceTranslationKey(source) {
            const value = firstString(
                source && source.normalizedSource,
                source && source.translationSource,
                source && source.original,
                source && source.visibleText,
                source && source.rawText
            ).trim();
            return value || '';
        }

        return {
            resolveObservationIdentity,
            buildSlotSignature,
            normalizeExplicitObservationId,
            getAvailableExplicitObservationId,
            canObservationUseExistingItem,
            isSameObservationOwner,
            isAdapterOwnedObservationId,
            createAdapterScopedObservationId,
            getObservationOwner,
            isSameObservedText,
            findReusableDetachedItem,
            getRestoredItemStatus,
            shouldPreserveRefreshStatus,
            createGeneratedItemId,
            buildSourceTranslationKey,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorIdentity', { create: createController });
})();
