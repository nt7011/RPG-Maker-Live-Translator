// Text orchestrator support: diagnostics.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/diagnostics.js.');
    }

    function createController(scope = {}) {
        const { summarize, cloneItem, globalScope, activeItems, detachedItems, archivedItems, renderCommands, events } = scope;

        /**
         * Build a serializable snapshot for debug consumers.
         *
         * Active and detached items are behavioral state. Archived items are
         * diagnostics only and are bounded by archivedLimit. Returned items are
         * clones so callers cannot mutate orchestrator state.
         */
        function getSnapshot(optionsArg = {}) {
            const policy = getSnapshotPolicy(optionsArg);
            if (!policy.captureHistories) clearCapturedDiagnostics();
            const cloneOptions = { detailView: policy.detailView };
            const active = Array.from(activeItems.values())
                .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                .map((item) => cloneItem(item, cloneOptions));
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
            const detached = detachedSource.map((item) => cloneItem(item, cloneOptions));
            const archived = archivedSource.map((item) => cloneItem(item, cloneOptions));
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
                    diagnosticsSurface: policy.surface === true,
                    diagnosticsMode: policy.mode || (policy.detailView ? 'full' : 'performance'),
                    performanceMode: policy.performanceMode === true,
                    detailView: policy.detailView === true,
                }),
                diagnosticsMode: policy.mode || (policy.detailView ? 'full' : 'performance'),
                performanceMode: policy.performanceMode === true,
                detailView: policy.detailView === true,
                updatedAt: Date.now(),
            };
        }

        /**
         * Publish the latest snapshot to the global debug surface immediately.
         *
         * External diagnostics can read LiveTranslatorTextOrchestratorSnapshot
         * without a direct module reference.
         */
        function publishNow() {
            scope.publishQueued = false;
            if (!getSnapshotPolicy().surface) {
                scope.lastSnapshot = null;
                clearCapturedDiagnostics();
                try { delete globalScope.LiveTranslatorTextOrchestratorSnapshot; } catch (_) {
                    try { globalScope.LiveTranslatorTextOrchestratorSnapshot = null; } catch (__) {}
                }
                return null;
            }
            scope.lastSnapshot = getSnapshot();
            try { globalScope.LiveTranslatorTextOrchestratorSnapshot = scope.lastSnapshot; } catch (_) {}
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
                clearCapturedDiagnostics();
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
            const raw = typeof scope.getDiagnosticsSnapshotPolicy === 'function'
                ? (scope.getDiagnosticsSnapshotPolicy(optionsArg) || { surface: true, detailView: true })
                : { surface: true, detailView: true };
            const detailView = raw.detailView === true;
            return Object.assign({
                mode: detailView ? 'full' : 'performance',
                surface: raw.surface !== false,
                detailView,
                performanceMode: raw.surface !== false && !detailView,
                captureEvents: detailView,
                captureHistories: detailView,
                captureRenderQueue: detailView,
                limits: {},
            }, raw);
        }

        function clearCapturedDiagnostics() {
            if (!scope.detailDiagnosticsActive && !events.length) return false;
            events.length = 0;
            [activeItems, detachedItems, archivedItems].forEach((map) => {
                if (!map || typeof map.forEach !== 'function') return;
                map.forEach((item) => {
                    if (item && Array.isArray(item.history) && item.history.length) item.history = [];
                });
            });
            scope.detailDiagnosticsActive = false;
            return true;
        }

        function limitSnapshotRows(rows, limit) {
            const numeric = Number(limit);
            if (!Number.isFinite(numeric) || numeric <= 0) return rows;
            return rows.slice(0, Math.max(1, Math.round(numeric)));
        }

        return {
            getSnapshot,
            publishNow,
            clearDiagnostics: clearCapturedDiagnostics,
            schedulePublish,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorDiagnostics', { create: createController });
})();
