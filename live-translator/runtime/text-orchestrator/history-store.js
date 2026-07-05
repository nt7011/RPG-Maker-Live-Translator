// Text orchestrator item history store.
//
// This is live Intel state, not diagnostics plugin state. It is bounded per
// item and only stores sanitized lifecycle events that are safe to expose in
// the monitor UI.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.historyStore',
        factory() {
            const FALLBACK_TRAIL_KEY = '__LiveTranslatorTextOrchestratorTrails';
            const DEFAULT_ITEM_EVENT_LIMIT = 32;
            const MAX_ITEM_EVENT_LIMIT = 512;

            function createTextOrchestratorTrailStore(options = {}) {
                const itemEventLimit = positiveInteger(options.itemEventLimit, DEFAULT_ITEM_EVENT_LIMIT, 1, MAX_ITEM_EVENT_LIMIT);
                const cloneEvent = typeof options.cloneEvent === 'function' ? options.cloneEvent : cloneEventRecord;
                let recordsByItem = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

                function appendItemEvent(item, event) {
                    if (!item || !event) return false;
                    const history = getHistory(item, true);
                    history.push(cloneEvent(event));
                    while (history.length > itemEventLimit) history.shift();
                    return true;
                }

                function isDuplicateSkippedEvent(item, event) {
                    if (!item || !event || event.type !== 'item.skipped') return false;
                    const history = getHistory(item, false);
                    const previous = history.length ? history[history.length - 1] : null;
                    if (!previous || previous.type !== event.type) return false;
                    return previous.status === event.status;
                }

                function cloneItemHistory(item) {
                    return getHistory(item, false).map(cloneEvent);
                }

                function clear(items) {
                    if (recordsByItem) {
                        if (Array.isArray(items)) {
                            items.forEach((item) => {
                                if (item) recordsByItem.delete(item);
                            });
                        } else {
                            recordsByItem = new WeakMap();
                        }
                        return true;
                    }
                    if (Array.isArray(items)) {
                        items.forEach(clearFallbackHistory);
                    }
                    return true;
                }

                function getHistory(item, create) {
                    if (!item) return [];
                    if (recordsByItem) {
                        let history = recordsByItem.get(item);
                        if (!history && create) {
                            history = [];
                            recordsByItem.set(item, history);
                        }
                        return Array.isArray(history) ? history : [];
                    }
                    return getFallbackHistory(item, create);
                }

                return {
                    appendItemEvent,
                    isDuplicateSkippedEvent,
                    cloneItemHistory,
                    clear,
                };
            }

            function getFallbackHistory(item, create) {
                if (!item || typeof item !== 'object') return [];
                let history = item[FALLBACK_TRAIL_KEY];
                if (!Array.isArray(history) && create) {
                    history = [];
                    try {
                        Object.defineProperty(item, FALLBACK_TRAIL_KEY, {
                            value: history,
                            configurable: true,
                        });
                    } catch (_) {
                        try { item[FALLBACK_TRAIL_KEY] = history; } catch (__) {}
                    }
                }
                return Array.isArray(history) ? history : [];
            }

            function clearFallbackHistory(item) {
                if (!item || typeof item !== 'object') return;
                try { delete item[FALLBACK_TRAIL_KEY]; } catch (_) {
                    try { item[FALLBACK_TRAIL_KEY] = []; } catch (__) {}
                }
            }

            function cloneEventRecord(event) {
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
                    details: sanitize(source.details || {}, 3),
                };
            }

            function positiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
                const numeric = Number(value);
                if (!Number.isInteger(numeric)) return fallback;
                return Math.max(min, Math.min(max, numeric));
            }

            function sanitize(value, depth = 2) {
                if (value === undefined) return undefined;
                if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
                if (depth <= 0) return String(value);
                if (Array.isArray(value)) return value.slice(0, 24).map((item) => sanitize(item, depth - 1));
                if (typeof value === 'object') {
                    const output = {};
                    Object.keys(value).slice(0, 40).forEach((key) => {
                        const sanitized = sanitize(value[key], depth - 1);
                        if (sanitized !== undefined) output[key] = sanitized;
                    });
                    return output;
                }
                return String(value);
            }

            return {
                createTextOrchestratorTrailStore,
            };
        },
    });
})();
