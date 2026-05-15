// Text orchestrator support: record-utils.
// Owns adapter payload normalization, item cloning, and retention helpers; the facade composes these helpers into each orchestrator instance.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/record-utils.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before runtime/text-orchestrator/record-utils.js.');
    }

    const constants = requireRuntimeModule('runtime.textOrchestratorConstants');
    const base = requireRuntimeModule('runtime.textOrchestratorBaseUtils');
    const { ACTIVE_STATUSES, STATUS_ALIASES } = constants;
    const { clampPriority, finiteNumber, firstString, normalizeBounds, optionalBoolean, pickSerializableObject } = base;

    /**
     * Convert adapter input into the canonical item patch schema.
     *
     * Hooks currently use different field names for the same concepts. This
     * function is the compatibility boundary that maps those shapes into one
     * item model before anything touches active/detached/archive state.
     */
    function normalizeInputRecord(input = {}) {
        const source = input && typeof input === 'object' ? input : {};
        const id = normalizeId(source.id);
        const hook = firstString(source.hook, source.source, source.methodName);
        const sourceAdapter = firstString(source.sourceAdapter);
        const normalizedSource = firstString(source.normalizedSource, source.translationSource);
        return {
            id,
            surfaceId: firstString(source.surfaceId),
            identitySurfaceId: firstString(source.identitySurfaceId, source.logicalSurfaceId),
            slotKey: firstString(source.slotKey, source.key),
            sourceAdapter,
            hook,
            surfaceType: firstString(source.surfaceType, inferSurfaceType(hook)),
            status: normalizeStatus(source.status || source.translationStatus, 'detected'),
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
            visible: optionalBoolean(source.visible !== undefined ? source.visible : source.onScreen),
            screenState: firstString(source.screenState),
            backgrounded: optionalBoolean(source.backgrounded),
            metadata: pickSerializableObject(source.metadata || {}),
        };
    }

    /**
     * Merge a normalized patch into a mutable item record.
     *
     * Metadata is shallow-merged, null/undefined values are ignored, and empty
     * strings do not erase existing non-empty fields. That keeps partial updates
     * from destroying useful diagnostics collected earlier in the lifecycle.
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
     * Normalize status aliases into the orchestrator lifecycle vocabulary.
     */
    function normalizeStatus(status, fallback = 'detected') {
        const value = String(status || fallback || 'detected').trim();
        return STATUS_ALIASES[value] || value || fallback;
    }

    /**
     * Map translation-service event names to item lifecycle statuses.
     */
    function statusFromTranslationEvent(event) {
        if (event === 'request') return 'pending';
        if (event === 'cache_miss') return 'translating';
        if (event === 'cache_hit' || event === 'precache_hit' || event === 'override' || event === 'completed') return 'completed';
        if (event === 'skip') return 'skipped';
        if (event === 'aborted') return 'stale';
        if (event === 'error') return 'failed';
        return 'detected';
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
        const includeDetails = !(options && (options.detailView === false || options.includeDetails === false));
        const history = Array.isArray(item.history) ? item.history : [];
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
            history: includeDetails ? history.map(cloneDiagnosticEvent) : [],
        };
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
        ];
        const compact = {};
        keys.forEach((key) => {
            if (source[key] !== undefined) compact[key] = source[key];
        });
        return pickSerializableObject(compact);
    }

    /**
     * Return a compact copy of one lifecycle event for item-local history.
     */
    function cloneDiagnosticEvent(event) {
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
            details: pickSerializableObject(source.details || {}),
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

    defineRuntimeModule('runtime.textOrchestratorRecordUtils', {
        normalizeInputRecord,
        applyPatch,
        normalizeId,
        normalizeStatus,
        statusFromTranslationEvent,
        inferSurfaceType,
        mergeDetails,
        summarize,
        cloneItem,
        cloneDiagnosticEvent,
        pruneMap,
        getItemRetentionTime,
    });
})();
