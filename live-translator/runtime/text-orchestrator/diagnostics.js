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
        const { summarize, cloneItem, globalScope, archivedLimit, activeItems, detachedItems, archivedItems, renderCommands, events } = scope;

        /**
         * Build a serializable snapshot for debug consumers.
         *
         * Active and detached items are behavioral state. Archived items are
         * diagnostics only and are bounded by archivedLimit. Returned items are
         * clones so callers cannot mutate orchestrator state.
         */
        function getSnapshot(optionsArg = {}) {
            const policy = getSnapshotPolicy(optionsArg);
            if (!policy.detailView) clearCapturedDiagnostics();
            const cloneOptions = { detailView: policy.detailView };
            const active = Array.from(activeItems.values())
                .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                .map((item) => cloneItem(item, cloneOptions));
            const detached = Array.from(detachedItems.values())
                .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                .map((item) => cloneItem(item, cloneOptions));
            const archived = Array.from(archivedItems.values())
                .sort((a, b) => (b.deactivatedAt || b.updatedAt || 0) - (a.deactivatedAt || a.updatedAt || 0))
                .map((item) => cloneItem(item, cloneOptions));
            const eventCount = policy.detailView ? events.length : 0;
            return {
                active,
                detached,
                archived,
                events: policy.detailView ? events.slice() : [],
                renderQueue: policy.detailView
                    ? renderCommands.map((command) => Object.assign({}, command))
                    : [],
                summary: Object.assign(summarize(active, detached, archived, eventCount), {
                    diagnosticsSurface: policy.surface === true,
                    detailView: policy.detailView === true,
                }),
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
            const policy = getSnapshotPolicy();
            if (!policy.surface) {
                scope.publishQueued = false;
                clearCapturedDiagnostics();
                try { delete globalScope.LiveTranslatorTextOrchestratorSnapshot; } catch (_) {
                    try { globalScope.LiveTranslatorTextOrchestratorSnapshot = null; } catch (__) {}
                }
                return;
            }
            if (!policy.detailView) {
                scope.publishQueued = false;
                clearCapturedDiagnostics();
                try { delete globalScope.LiveTranslatorTextOrchestratorSnapshot; } catch (_) {
                    try { globalScope.LiveTranslatorTextOrchestratorSnapshot = null; } catch (__) {}
                }
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
            if (typeof scope.getDiagnosticsSnapshotPolicy === 'function') {
                return scope.getDiagnosticsSnapshotPolicy(optionsArg) || { surface: true, detailView: true };
            }
            return { surface: true, detailView: true };
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

        return {
            getSnapshot,
            publishNow,
            clearDiagnostics: clearCapturedDiagnostics,
            schedulePublish,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorDiagnostics', { create: createController });
})();
