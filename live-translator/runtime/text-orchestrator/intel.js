// Text orchestrator support: Intel snapshots.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.intel',
        factory() {
            function createController(scope = {}) {
                const { summarize, cloneItem, globalScope, activeItems, detachedItems, archivedItems, renderCommands, events, itemTrailStore } = scope;

                function getSnapshot(optionsArg = {}) {
                    const policy = getSnapshotPolicy(optionsArg);
                    if (!policy.captureEvents) clearCapturedEvents();
                    if (!policy.captureHistories) clearCapturedHistories();
                    const includeDetails = policy.captureEvents === true;
                    const includeHistory = policy.captureHistories === true;
                    const active = Array.from(activeItems.values())
                        .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                        .map((item) => cloneSnapshotItem(item, { includeDetails, includeHistory }));
                    const detachedSource = limitSnapshotRows(
                        Array.from(detachedItems.values())
                            .sort((a, b) => (b.sequence || 0) - (a.sequence || 0)),
                        policy && policy.limits && policy.limits.detachedItems
                    );
                    const archivedSource = limitSnapshotRows(
                        Array.from(archivedItems.values())
                            .sort((a, b) => (b.deactivatedAt || b.updatedAt || 0) - (a.deactivatedAt || a.updatedAt || 0)),
                        policy && policy.limits && policy.limits.archivedItems
                    );
                    const detached = detachedSource.map((item) => cloneSnapshotItem(item, { includeDetails, includeHistory }));
                    const archived = archivedSource.map((item) => cloneSnapshotItem(item, { includeDetails, includeHistory }));
                    const eventCount = policy.captureEvents ? events.length : 0;
                    return {
                        active,
                        detached,
                        archived,
                        events: policy.captureEvents ? events.slice() : [],
                        renderQueue: policy.captureRenderQueue
                            ? renderCommands.map((command) => Object.assign({}, command))
                            : [],
                        summary: Object.assign(summarize(active, detached, archived, eventCount), {
                            intelSurface: policy.surface === true,
                        }),
                        intelSurface: policy.surface === true,
                        updatedAt: Date.now(),
                    };
                }

                /**
                 * Publish the latest snapshot to the global Intel surface immediately.
                 *
                 * Runtime consumers can read LiveTranslatorTextOrchestratorIntelSnapshot
                 * without a direct module reference.
                 */
                function publishNow() {
                    scope.publishQueued = false;
                    if (!getSnapshotPolicy().surface) {
                        scope.lastSnapshot = null;
                        clearCapturedIntel();
                        try { delete globalScope.LiveTranslatorTextOrchestratorIntelSnapshot; } catch (_) {
                            try { globalScope.LiveTranslatorTextOrchestratorIntelSnapshot = null; } catch (__) {}
                        }
                        return null;
                    }
                    scope.lastSnapshot = getSnapshot();
                    try { globalScope.LiveTranslatorTextOrchestratorIntelSnapshot = scope.lastSnapshot; } catch (_) {}
                    return scope.lastSnapshot;
                }

                /**
                 * Coalesce snapshot publication to the next timer tick.
                 *
                 * Most item operations call this, so batching prevents noisy synchronous
                 * snapshot rebuilds during bursts of draw or translation events.
                 */
                function schedulePublish() {
                    if (!getSnapshotPolicy().surface) {
                        scope.publishQueued = false;
                        clearCapturedIntel();
                        return;
                    }
                    if (scope.publishQueued) return;
                    scope.publishQueued = true;
                    const schedule = typeof globalScope.setTimeout === 'function'
                        ? globalScope.setTimeout.bind(globalScope)
                        : setTimeout;
                    schedule(publishNow, 0);
                }

                function getSnapshotPolicy(optionsArg = {}) {
                    const raw = typeof scope.getIntelSnapshotPolicy === 'function'
                        ? (scope.getIntelSnapshotPolicy(optionsArg) || { surface: false })
                        : { surface: false };
                    return Object.assign({
                        surface: raw.surface !== false,
                        captureEvents: false,
                        captureHistories: false,
                        captureRenderQueue: false,
                        limits: {},
                    }, raw);
                }

                function clearCapturedIntel() {
                    const clearedEvents = clearCapturedEvents();
                    const clearedHistories = clearCapturedHistories();
                    return clearedEvents || clearedHistories;
                }

                function clearCapturedEvents() {
                    if (!events.length) return false;
                    events.length = 0;
                    scope.detailIntelActive = hasCapturedHistories();
                    return true;
                }

                function clearCapturedHistories() {
                    if (!scope.detailIntelActive && !hasCapturedHistories()) return false;
                    if (itemTrailStore && typeof itemTrailStore.clear === 'function') {
                        itemTrailStore.clear(collectKnownItems());
                    }
                    scope.detailIntelActive = false;
                    return true;
                }

                function hasCapturedHistories() {
                    if (!itemTrailStore || typeof itemTrailStore.cloneItemHistory !== 'function') return false;
                    return collectKnownItems().some((item) => itemTrailStore.cloneItemHistory(item).length > 0);
                }

                function cloneSnapshotItem(item, options) {
                    const cloneOptions = options && typeof options === 'object' ? options : {};
                    return cloneItem(item, {
                        includeDetails: cloneOptions.includeDetails === true,
                        includeHistory: cloneOptions.includeHistory === true,
                        history: cloneOptions.includeHistory === true ? cloneItemHistory(item) : [],
                    });
                }

                function cloneItemHistory(item) {
                    if (!itemTrailStore || typeof itemTrailStore.cloneItemHistory !== 'function') return [];
                    return itemTrailStore.cloneItemHistory(item);
                }

                function collectKnownItems() {
                    return [activeItems, detachedItems, archivedItems].reduce((items, map) => {
                        if (!map || typeof map.forEach !== 'function') return items;
                        map.forEach((item) => {
                            if (item) items.push(item);
                        });
                        return items;
                    }, []);
                }

                function limitSnapshotRows(rows, limit) {
                    const numeric = Number(limit);
                    if (!Number.isFinite(numeric) || numeric <= 0) return rows;
                    return rows.slice(0, Math.max(1, Math.round(numeric)));
                }

                return {
                    getSnapshot,
                    publishNow,
                    clearIntel: clearCapturedIntel,
                    schedulePublish,
                };
            }

            return { create: createController };
        },
    });
})();
