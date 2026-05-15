// Text orchestrator support: events.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/events.js.');
    }

    function createController(scope = {}) {
        const { pickSerializableObject, cloneDiagnosticEvent, logger, eventLimit, itemEventLimit, events, listeners } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { schedulePublish } = Object.fromEntries(['schedulePublish'].map((name) => [name, callScope(name)]));

        /**
         * Append a lifecycle/diagnostic event and notify listeners.
         *
         * Events are intentionally small and serializable. Details are trimmed
         * through pickSerializableObject so arbitrary game objects cannot leak
         * into snapshots or break publishing.
         */
        function recordEvent(type, item, optionsForEvent = {}) {
            if (!item) return null;
            const eventType = String(type || 'event');
            const includeDetails = shouldCaptureDetailDiagnostics();
            const routeDetails = includeDetails || eventType === 'item.render_queued'
                ? pickSerializableObject(optionsForEvent.details || {})
                : {};
            const event = {
                at: Date.now(),
                seq: ++scope.sequence,
                type: eventType,
                itemId: item.id,
                surfaceId: item.surfaceId || '',
                adapterId: item.sourceAdapter || item.hook || '',
                status: item.status || '',
                message: String(optionsForEvent.message || ''),
                details: routeDetails,
            };
            if (includeDetails) {
                if (isDuplicateSkippedEvent(item, event)) return null;
                events.push(event);
                while (events.length > eventLimit) events.shift();
                appendItemEvent(item, event);
                scope.detailDiagnosticsActive = true;
            }
            notify(event);
            if (shouldPublishSurfaceDiagnostics()) schedulePublish();
            return event;
        }

        /**
         * Keep a small per-item event trail so diagnostics do not depend only
         * on the global event ring, which can be pruned by busy scenes.
         */
        function appendItemEvent(item, event) {
            if (!item || !event) return;
            const history = Array.isArray(item.history) ? item.history : [];
            history.push(cloneDiagnosticEvent(event));
            while (history.length > itemEventLimit) history.shift();
            item.history = history;
        }

        function isDuplicateSkippedEvent(item, event) {
            if (!item || !event || event.type !== 'item.skipped') return false;
            const history = Array.isArray(item.history) ? item.history : [];
            const previous = history.length ? history[history.length - 1] : null;
            if (!previous || previous.type !== event.type) return false;
            return previous.status === event.status;
        }

        /**
         * Subscribe to orchestrator events.
         *
         * Render adapters use this to receive item.render_queued commands. The
         * returned function removes the listener; listener exceptions are
         * isolated by notify.
         */
        function subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => {
                try { listeners.delete(listener); } catch (_) {}
            };
        }

        /**
         * Fan out an event to all listeners without letting one listener break
         * the orchestrator or other adapters.
         */
        function notify(event) {
            if (!listeners.size) return;
            Array.from(listeners).forEach((listener) => {
                try { listener(event); } catch (error) {
                    if (logger && typeof logger.warn === 'function') {
                        logger.warn('[TextOrchestrator] listener failed', error);
                    }
                }
            });
        }

        function shouldPublishSurfaceDiagnostics() {
            return typeof scope.isDiagnosticSurfaceEnabled !== 'function'
                || scope.isDiagnosticSurfaceEnabled() === true;
        }

        function shouldCaptureDetailDiagnostics() {
            return typeof scope.isDiagnosticDetailViewEnabled !== 'function'
                || scope.isDiagnosticDetailViewEnabled() === true;
        }

        return {
            recordEvent,
            appendItemEvent,
            isDuplicateSkippedEvent,
            subscribe,
            notify,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorEvents', { create: createController });
})();
