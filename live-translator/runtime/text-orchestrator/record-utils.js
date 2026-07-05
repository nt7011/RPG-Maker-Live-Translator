// Text orchestrator support: record-utils.
// Owns adapter payload normalization, item cloning, and retention helpers; the facade composes these helpers into each orchestrator instance.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.recordUtils',
        requires: {
            textLifecycle: 'runtime.textLifecycle',
            renderTransaction: 'runtime.renderTransaction',
            base: 'runtime.textOrchestrator.baseUtils',
        },
        factory({ textLifecycle, renderTransaction, base }) {
            const { clampPriority, finiteNumber, firstString, normalizeBounds, optionalBoolean, pickSerializableObject } = base;

            /**
             * Convert adapter input into the canonical item patch schema.
             *
             * This function maps adapter payloads into one item model before anything
             * touches active/detached/archive state.
             */
            function normalizeInputRecord(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const id = normalizeId(source.id);
                const hook = firstString(source.hook, source.source, source.methodName);
                const sourceAdapter = firstString(source.sourceAdapter);
                const normalizedSource = firstString(source.normalizedSource, source.translationSource);
                const drawBoundary = normalizeDrawBoundary(source, {
                    id,
                    sourceAdapter,
                    surfaceId: source.surfaceId,
                    identitySurfaceId: source.identitySurfaceId || source.logicalSurfaceId,
                    slotKey: source.slotKey || source.key,
                    generation: source.generation,
                });
                return {
                    id,
                    surfaceId: firstString(source.surfaceId),
                    identitySurfaceId: firstString(source.identitySurfaceId, source.logicalSurfaceId),
                    slotKey: firstString(source.slotKey, source.key),
                    sourceAdapter,
                    hook,
                    surfaceType: firstString(source.surfaceType, inferSurfaceType(hook)),
                    status: normalizeStatus(source.status, 'detected'),
                    rawText: firstString(source.rawText),
                    visibleText: firstString(source.visibleText, source.original, source.text),
                    original: firstString(source.original, source.visibleText, source.convertedText, source.rawText, source.text),
                    translationSource: firstString(source.translationSource),
                    normalizedSource,
                    translation: firstString(source.translation, source.translatedText),
                    translationReceived: firstString(source.translationReceived, source.receivedTranslation),
                    translationDrawn: firstString(source.translationDrawn, source.drawnTranslation, source.drawnText),
                    sourceHint: firstString(source.sourceHint, source.translationSourceKind),
                    bounds: normalizeBounds(source.bounds),
                    priority: finiteNumber(source.priority),
                    generation: finiteNumber(source.generation),
                    renderStrategy: firstString(source.renderStrategy),
                    drawBoundary,
                    visible: optionalBoolean(source.visible !== undefined ? source.visible : source.onScreen),
                    screenState: firstString(source.screenState),
                    backgrounded: optionalBoolean(source.backgrounded),
                    metadata: pickSerializableObject(source.metadata || {}),
                };
            }

            function normalizeDrawBoundary(source, defaults = {}) {
                if (!source || typeof source.drawBoundary !== 'object' || !source.drawBoundary) return null;
                return renderTransaction.createSourceDrawBoundary(Object.assign({
                    adapterId: firstString(defaults.sourceAdapter),
                    itemId: firstString(defaults.id),
                    recordId: firstString(defaults.id),
                    surfaceId: firstString(defaults.surfaceId),
                    identitySurfaceId: firstString(defaults.identitySurfaceId),
                    slotKey: firstString(defaults.slotKey),
                    generation: finiteNumber(defaults.generation),
                }, source.drawBoundary));
            }

            /**
             * Merge a normalized patch into a mutable item record.
             *
             * Metadata is shallow-merged, null/undefined values are ignored, and empty
             * strings do not erase existing non-empty fields. That keeps partial updates
             * from destroying useful context collected earlier in the lifecycle.
             */
            function applyPatch(item, patch) {
                Object.keys(patch || {}).forEach((key) => {
                    const value = patch[key];
                    if (value === undefined || value === null) return;
                    if (key === 'metadata') {
                        item.metadata = Object.assign({}, item.metadata || {}, value || {});
                    } else if (value === '' && item[key]) {
                        return;
                    } else {
                        item[key] = value;
                    }
                });
                if (!item.visibleText && item.original) item.visibleText = item.original;
                if (!item.original && item.visibleText) item.original = item.visibleText;
                if (!item.normalizedSource && item.translationSource) item.normalizedSource = item.translationSource;
            }

            /**
             * Resolve an item id from direct input.
             */
            function normalizeId(id) {
                if (id) return String(id);
                return '';
            }

            /**
             * Normalize canonical lifecycle statuses into the orchestrator vocabulary.
             */
            function normalizeStatus(status, fallback = 'detected') {
                return textLifecycle.normalizeStatus(status, fallback);
            }

            /**
             * Map translation-service event names to item lifecycle statuses.
             */
            function statusFromTranslationEvent(event) {
                return textLifecycle.statusFromTranslationEvent(event, 'detected');
            }

            /**
             * Infer a broad surface class from hook names for snapshots and grouping.
             */
            function inferSurfaceType(hook) {
                const value = String(hook || '').toLowerCase();
                if (value.includes('message') || value.includes('window') || value.includes('drawtext')) return 'window';
                if (value.includes('sprite')) return 'sprite';
                if (value.includes('pixi')) return 'pixi';
                if (value.includes('bitmap')) return 'bitmap';
                return '';
            }

            /**
             * Merge event/detail objects after trimming them to serializable data.
             */
            function mergeDetails(...values) {
                const merged = {};
                values.forEach((value) => {
                    if (value && typeof value === 'object') {
                        Object.assign(merged, pickSerializableObject(value));
                        preserveTypedEventDetailFields(merged, value);
                    }
                });
                return merged;
            }

            /**
             * Count active, detached, archived, and status totals for snapshots.
             */
            function summarize(active, detached, archived, eventCount = 0) {
                const summary = {
                    active: active.length,
                    detached: detached.length,
                    archived: archived.length,
                    events: eventCount,
                };
                active.concat(detached, archived).forEach((item) => {
                    const status = normalizeStatus(item && item.status, 'detected');
                    summary[status] = (summary[status] || 0) + 1;
                });
                return summary;
            }

            /**
             * Return the public, serializable view of an internal item record.
             *
             * Internal-only fields such as translation handles and request tokens are
             * deliberately omitted so snapshots remain safe and deterministic.
             */
            function cloneItem(item, options = {}) {
                const includeDetails = options && options.includeDetails === true;
                const includeHistory = includeDetails || (options && options.includeHistory === true);
                const history = Array.isArray(options.history) ? options.history : [];
                return {
                    id: item.id,
                    surfaceId: item.surfaceId || '',
                    identitySurfaceId: item.identitySurfaceId || '',
                    slotKey: item.slotKey || '',
                    sourceAdapter: item.sourceAdapter || '',
                    hook: item.hook || '',
                    surfaceType: item.surfaceType || '',
                    status: item.status || 'detected',
                    rawText: item.rawText || '',
                    visibleText: item.visibleText || '',
                    original: item.original || '',
                    translationSource: item.translationSource || '',
                    normalizedSource: item.normalizedSource || '',
                    translation: item.translation || '',
                    translationReceived: item.translationReceived || '',
                    translationDrawn: item.translationDrawn || '',
                    sourceHint: item.sourceHint || '',
                    bounds: item.bounds ? Object.assign({}, item.bounds) : null,
                    priority: item.priority,
                    generation: item.generation || 0,
                    renderStrategy: item.renderStrategy || '',
                    drawBoundary: cloneDrawBoundary(item.drawBoundary),
                    renderCycle: cloneRenderCycle(item.renderCycle, includeDetails),
                    renderTarget: item.renderTarget ? pickSerializableObject(item.renderTarget) : null,
                    visible: item.visible !== false,
                    screenState: item.screenState || '',
                    backgrounded: item.backgrounded === true,
                    policy: includeDetails ? pickSerializableObject(item.policy || {}) : {},
                    metadata: cloneItemMetadata(item.metadata, includeDetails),
                    active: item.active === true,
                    firstSeenAt: item.firstSeenAt || 0,
                    lastSeenAt: item.lastSeenAt || 0,
                    updatedAt: item.updatedAt || 0,
                    deactivatedAt: item.deactivatedAt || null,
                    history: includeHistory ? history.map(cloneIntelEvent) : [],
                };
            }

            function cloneDrawBoundary(boundary) {
                if (!boundary || typeof boundary !== 'object') return null;
                return pickSerializableObject(boundary);
            }

            function cloneRenderCycle(cycle, includeDetails) {
                if (!cycle || typeof cycle !== 'object') return null;
                const cloned = pickSerializableObject(cycle);
                if (!includeDetails) {
                    delete cloned.details;
                    if (cloned.drawBoundary && typeof cloned.drawBoundary === 'object') {
                        delete cloned.drawBoundary.details;
                    }
                    if (cloned.renderCommit && typeof cloned.renderCommit === 'object') {
                        delete cloned.renderCommit.details;
                    }
                    if (cloned.renderCommand && typeof cloned.renderCommand === 'object') {
                        delete cloned.renderCommand.metadata;
                        delete cloned.renderCommand.bounds;
                    }
                }
                return cloned;
            }

            function cloneItemMetadata(metadata, includeDetails) {
                const source = metadata && typeof metadata === 'object' ? metadata : {};
                if (includeDetails) return pickSerializableObject(source);
                const keys = [
                    'sessionId',
                    'windowType',
                    'ownerType',
                    'methodName',
                    'method',
                    'x',
                    'y',
                    'detachedCacheable',
                    'foresight',
                    'foresightConsumed',
                    'foresightIndex',
                    'foresightPriority',
                    'foresightBudget',
                    'interpreterId',
                    'listId',
                    'commonEventId',
                    'commonEventName',
                    'messageStartIndex',
                    'messageNextIndex',
                    'priority',
                    'effectivePriority',
                    'stream',
                    'mode',
                    'drawOrigin',
                    'drawRun',
                ];
                const compact = {};
                keys.forEach((key) => {
                    if (source[key] !== undefined) compact[key] = source[key];
                });
                return pickSerializableObject(compact);
            }

            /**
             * Return a compact copy of one lifecycle event for item-local trails.
             */
            function cloneEventDetails(details) {
                const source = details && typeof details === 'object' ? details : {};
                const cloned = pickSerializableObject(source);
                preserveTypedEventDetailFields(cloned, source);
                return cloned;
            }

            function preserveTypedEventDetailFields(target, source) {
                if (!target || !source || typeof source !== 'object') return target;
                if (source.surfaceProof && typeof source.surfaceProof === 'object'
                    && renderTransaction && typeof renderTransaction.createRenderSurfaceProof === 'function') {
                    target.surfaceProof = renderTransaction.createRenderSurfaceProof(source.surfaceProof);
                }
                if (source.copiedTargetProof && typeof source.copiedTargetProof === 'object'
                    && renderTransaction && typeof renderTransaction.createRenderSurfaceProof === 'function') {
                    const copiedTargetSurfaceProof = renderTransaction.createRenderSurfaceProof({
                        copiedTargetProof: source.copiedTargetProof,
                        copiedTargetRenderPlan: source.copiedTargetRenderPlan,
                    });
                    if (copiedTargetSurfaceProof && copiedTargetSurfaceProof.copiedTargets) {
                        target.copiedTargetProof = copiedTargetSurfaceProof.copiedTargets;
                    }
                }
                if (source.renderCommit && typeof source.renderCommit === 'object'
                    && renderTransaction && typeof renderTransaction.createRenderCommit === 'function') {
                    target.renderCommit = renderTransaction.createRenderCommit(source.renderCommit);
                }
                return target;
            }

            function cloneIntelEvent(event) {
                const source = event && typeof event === 'object' ? event : {};
                const itemId = source.itemId !== undefined && source.itemId !== null ? String(source.itemId) : '';
                return {
                    at: source.at || null,
                    seq: source.seq || null,
                    id: source.id ? String(source.id) : itemId,
                    itemId,
                    surfaceId: source.surfaceId ? String(source.surfaceId) : '',
                    adapterId: source.adapterId ? String(source.adapterId) : '',
                    type: source.type ? String(source.type) : 'event',
                    status: source.status ? String(source.status) : '',
                    message: source.message ? String(source.message) : '',
                    details: cloneEventDetails(source.details || {}),
                };
            }

            /**
             * Keep bounded history maps from growing for the entire game session.
             *
             * The oldest deactivated/updated records are removed first.
             */
            function pruneMap(map, limit) {
                if (!map || map.size <= limit) return;
                const rows = Array.from(map.entries()).sort((a, b) => {
                    const aTime = getItemRetentionTime(a[1]);
                    const bTime = getItemRetentionTime(b[1]);
                    return aTime - bTime;
                });
                while (rows.length && map.size > limit) {
                    const row = rows.shift();
                    if (row && row[0]) map.delete(row[0]);
                }
            }

            function getItemRetentionTime(item) {
                if (!item) return 0;
                return Math.max(
                    Number(item.updatedAt) || 0,
                    Number(item.deactivatedAt) || 0,
                    Number(item.lastSeenAt) || 0,
                    Number(item.firstSeenAt) || 0
                );
            }

            return {
                normalizeInputRecord,
                applyPatch,
                normalizeId,
                normalizeStatus,
                statusFromTranslationEvent,
                inferSurfaceType,
                mergeDetails,
                summarize,
                cloneItem,
                cloneEventDetails,
                cloneIntelEvent,
                pruneMap,
                getItemRetentionTime,
            };
        },
    });
})();
