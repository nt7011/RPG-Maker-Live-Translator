// Text orchestrator support: events.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.events',
        factory() {
            function createController(scope = {}) {
                const { pickSerializableObject, cloneEventDetails, logger, eventLimit, events, listeners, itemTrailStore } = scope;
                const { schedulePublish } = scope.controllerFacades.diagnostics;

                function recordEvent(type, item, optionsForEvent = {}) {
                    if (!item) return null;
                    const eventType = String(type || 'event');
                    const intelPolicy = getEventIntelPolicy();
                    const includeDetails = intelPolicy.captureEvents === true;
                    const routeDetails = typeof cloneEventDetails === 'function'
                        ? cloneEventDetails(optionsForEvent.details || {})
                        : pickSerializableObject(optionsForEvent.details || {});
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
                        if (!isDuplicateSkippedEvent(item, event)) {
                            events.push(event);
                            while (events.length > eventLimit) events.shift();
                            appendItemEvent(item, event);
                        }
                        scope.detailIntelActive = true;
                    }
                    notify(event);
                    if (intelPolicy.surface === true) schedulePublish();
                    return event;
                }

                function appendItemEvent(item, event) {
                    if (!item || !event || !itemTrailStore) return false;
                    return itemTrailStore.appendItemEvent(item, event);
                }

                function isDuplicateSkippedEvent(item, event) {
                    if (!item || !event || event.type !== 'item.skipped') return false;
                    return !!(itemTrailStore && itemTrailStore.isDuplicateSkippedEvent(item, event));
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

                function getEventIntelPolicy() {
                    if (typeof scope.getIntelSnapshotPolicy === 'function') {
                        const policy = scope.getIntelSnapshotPolicy() || {};
                        const surface = policy.surface === true;
                        return {
                            surface,
                            captureEvents: surface && policy.captureEvents === true,
                        };
                    }
                    const surface = typeof scope.isIntelSurfaceEnabled === 'function'
                        && scope.isIntelSurfaceEnabled() === true;
                    return { surface, captureEvents: false };
                }

                return {
                    recordEvent,
                    appendItemEvent,
                    isDuplicateSkippedEvent,
                    subscribe,
                    notify,
                };
            }

            return { create: createController };
        },
    });
})();
