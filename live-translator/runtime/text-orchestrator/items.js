// Text orchestrator support: items.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/items.js.');
    }

    function createController(scope = {}) {
        const { ACTIVE_STATUSES, applyPatch, normalizeId, normalizeStatus, pruneMap, archivedLimit, activeItems, detachedItems, detachedItemsBySlotSignature, archivedItems, slotIndex } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { buildSlotSignature, rememberSourceTranslation, isSkippedItem, schedulePublish, resolveLifecyclePolicy, applyLifecyclePolicy } = Object.fromEntries(['buildSlotSignature', 'rememberSourceTranslation', 'isSkippedItem', 'schedulePublish', 'resolveLifecyclePolicy', 'applyLifecyclePolicy'].map((name) => [name, callScope(name)]));

        /**
         * Insert or update the canonical mutable item record.
         *
         * This is the only place that decides whether an item lives in active,
         * detached-item, or archived maps. Public APIs return clones, but
         * internal maps keep mutable records so promise handlers can validate
         * handles/tokens cheaply.
         */
        function upsertItem(id, source) {
            const now = Date.now();
            let item = getItemById(id);
            if (!item) {
                item = createEmptyItem(id);
                item.firstSeenAt = now;
            }
            applyPatch(item, source);
            item.status = normalizeStatus(item.status, 'detected');
            if (isSkippedItem(item)) {
                const handle = item.translationHandle;
                if (handle && typeof handle.cancel === 'function') {
                    try { handle.cancel('translation skipped', { abortJob: true }); } catch (_) {}
                }
                clearItemTranslationRequest(item);
                item.priority = null;
            }
            item.updatedAt = now;
            item.lastSeenAt = now;
            item.sequence = ++scope.sequence;
            item.active = ACTIVE_STATUSES[item.status] === true;
            if (item.active) {
                item.deactivatedAt = null;
                moveToActive(item);
            } else {
                item.deactivatedAt = item.deactivatedAt || now;
                placeInactiveItem(item);
            }
            rememberSourceTranslation(item);
            schedulePublish();
            return item;
        }

        /**
         * Create the full item shape with stable default fields.
         *
         * Keeping every field present makes snapshots and tests predictable,
         * and avoids adapters needing to check for missing keys.
         */
        function createEmptyItem(id) {
            return {
                id,
                surfaceId: '',
                identitySurfaceId: '',
                slotKey: '',
                sourceAdapter: '',
                hook: '',
                surfaceType: '',
                status: 'detected',
                rawText: '',
                visibleText: '',
                original: '',
                translationSource: '',
                normalizedSource: '',
                translation: '',
                translationReceived: '',
                translationDrawn: '',
                sourceHint: '',
                bounds: null,
                priority: null,
                generation: 0,
                renderStrategy: '',
                visible: true,
                screenState: 'visible',
                backgrounded: false,
                policy: {},
                metadata: {},
                active: true,
                firstSeenAt: Date.now(),
                lastSeenAt: Date.now(),
                updatedAt: Date.now(),
                deactivatedAt: null,
                history: [],
                sequence: 0,
                translationHandle: null,
                translationToken: null,
                translationRenderStrategy: '',
                translationStream: false,
                translationHasDelta: false,
            };
        }

        function clearItemTranslationRequest(item) {
            if (!item) return;
            item.translationHandle = null;
            item.translationToken = null;
            item.translationStream = false;
            item.translationHasDelta = false;
        }

        function getItemById(id) {
            const key = normalizeId(id);
            if (!key) return null;
            return activeItems.get(key)
                || detachedItems.get(key)
                || archivedItems.get(key)
                || null;
        }

        function hasItem(id) {
            return !!getItemById(id);
        }

        function hasLiveTranslationRequest(item) {
            return !!(item && item.translationHandle && item.translationToken);
        }

        function moveToActive(item) {
            if (!item || !item.id) return null;
            removeDetachedItemIndex(item.id);
            detachedItems.delete(item.id);
            archivedItems.delete(item.id);
            activeItems.set(item.id, item);
            return item;
        }

        function placeInactiveItem(item) {
            if (!item || !item.id) return null;
            if (hasLiveTranslationRequest(item)) return moveToDetachedItem(item);
            return moveToArchive(item);
        }

        function moveToDetachedItem(item) {
            if (!item || !item.id) return null;
            activeItems.delete(item.id);
            archivedItems.delete(item.id);
            detachedItems.set(item.id, item);
            indexDetachedItem(item);
            return item;
        }

        function moveToArchive(item) {
            if (!item || !item.id) return null;
            activeItems.delete(item.id);
            detachedItems.delete(item.id);
            removeDetachedItemIndex(item.id);
            archivedItems.set(item.id, item);
            pruneMap(archivedItems, archivedLimit);
            return item;
        }

        function indexDetachedItem(item) {
            if (!item || !item.id) return;
            removeDetachedItemIndex(item.id);
            const slotSignature = buildSlotSignature(item);
            if (!slotSignature) return;
            let ids = detachedItemsBySlotSignature.get(slotSignature);
            if (!ids) {
                ids = new Set();
                detachedItemsBySlotSignature.set(slotSignature, ids);
            }
            ids.add(item.id);
        }

        function removeDetachedItemIndex(id) {
            const key = normalizeId(id);
            if (!key) return;
            Array.from(detachedItemsBySlotSignature.entries()).forEach(([slotSignature, ids]) => {
                if (!ids || typeof ids.delete !== 'function') return;
                ids.delete(key);
                if (ids.size === 0) detachedItemsBySlotSignature.delete(slotSignature);
            });
        }

        /**
         * Remove every slot signature currently pointing at an item.
         *
         * Called when an item is retired so future observations in the same
         * slot do not accidentally refresh an inactive item.
         */
        function releaseSlotIndexesForItem(id) {
            Array.from(slotIndex.entries()).forEach(([slotSignature, itemId]) => {
                if (itemId === id) slotIndex.delete(slotSignature);
            });
        }

        function claimSlotSignature(slotSignature, id) {
            if (!slotSignature || !id) return;
            Array.from(slotIndex.entries()).forEach(([existingSignature, itemId]) => {
                if (itemId === id && existingSignature !== slotSignature) {
                    slotIndex.delete(existingSignature);
                }
            });
            slotIndex.set(slotSignature, id);
        }

        function resetItemForSourceReplacement(item) {
            if (!item) return false;
            applyLifecyclePolicy(item, resolveLifecyclePolicy(item, 'stale', {
                lifecycleIntent: 'source-replaced',
                message: 'same slot source changed',
                cancelTranslation: true,
                cancelOptions: { abortJob: true },
                preservePriority: true,
            }));
            clearItemTranslationRequest(item);
            item.translation = '';
            item.translationReceived = '';
            item.translationDrawn = '';
            item.sourceHint = '';
            item.renderStrategy = '';
            item.translationRenderStrategy = '';
            item.priority = null;
            item.metadata = {};
            return true;
        }

        return {
            upsertItem,
            createEmptyItem,
            clearItemTranslationRequest,
            getItemById,
            hasItem,
            hasLiveTranslationRequest,
            moveToActive,
            placeInactiveItem,
            moveToDetachedItem,
            moveToArchive,
            indexDetachedItem,
            removeDetachedItemIndex,
            releaseSlotIndexesForItem,
            claimSlotSignature,
            resetItemForSourceReplacement,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorItems', { create: createController });
})();
