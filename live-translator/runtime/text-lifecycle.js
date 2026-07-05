// Shared lifecycle state machine for translated text records.
//
// The orchestrator and adapter contract both need to answer the same questions:
// what status vocabulary is canonical, whether a record is active, whether a
// provider request is still live, and how retire/detach events affect those
// flags. Keep that model here so adapters do not infer lifecycle from scattered
// string checks.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textLifecycle',
        factory() {
            const STATUS_DEFINITIONS = Object.freeze({
                detected: freezeStatus({ active: true }),
                pending: freezeStatus({ active: true, requestActive: true }),
                translating: freezeStatus({ active: true, requestActive: true }),
                completed: freezeStatus({ active: true, terminal: true }),
                skipped: freezeStatus({ active: true, terminal: true }),
                failed: freezeStatus({ active: true, terminal: true }),
                stale: freezeStatus({ retired: true }),
                disappeared: freezeStatus({ retired: true }),
                removed: freezeStatus({ retired: true }),
            });

            const TRANSLATION_EVENT_STATUSES = Object.freeze({
                request: 'pending',
                cache_miss: 'translating',
                cache_hit: 'completed',
                precache_hit: 'completed',
                override: 'completed',
                completed: 'completed',
                skip: 'skipped',
                aborted: 'stale',
                error: 'failed',
            });

            // Adapter record status tracks translation availability and request
            // terminality, not final pixel proof. A ready render command means the
            // adapter can draw an already-completed translation; committed pixels are
            // still proven separately by the render-command lifecycle.
            const ADAPTER_RECORD_TRANSLATION_READY_STATUS = 'completed';
            const ADAPTER_RECORD_RENDER_COMMITTED_STATUS = 'completed';
            const ADAPTER_RECORD_EVENT_TRANSITIONS = Object.freeze({
                'item.render_command_ready': freezeAdapterRecordTransition({ status: ADAPTER_RECORD_TRANSLATION_READY_STATUS }),
                'item.render_committed': freezeAdapterRecordTransition({ status: ADAPTER_RECORD_RENDER_COMMITTED_STATUS }),
                'item.requested': freezeAdapterRecordTransition({ status: 'pending' }),
                'item.cache_hit': freezeAdapterRecordTransition({ status: 'completed' }),
                'item.translated': freezeAdapterRecordTransition({ status: 'completed' }),
                'item.request_reused': freezeAdapterRecordTransition({ status: 'completed' }),
                'item.skipped': freezeAdapterRecordTransition({ status: 'skipped' }),
                'item.failed': freezeAdapterRecordTransition({ status: 'failed' }),
                'item.canceled': freezeAdapterRecordTransition({ status: 'stale' }),
                'item.translation_noop': freezeAdapterRecordTransition({ status: 'failed' }),
                'item.translation_stored': freezeAdapterRecordTransition({ status: 'completed', active: false, detached: true, requestActive: false }),
                'item.translation_skipped_detached': freezeAdapterRecordTransition({ status: 'skipped', active: false, detached: true, requestActive: false }),
                'item.translation_failed_detached': freezeAdapterRecordTransition({ status: 'failed', active: false, detached: true, requestActive: false }),
                'item.translation_canceled_detached': freezeAdapterRecordTransition({ status: 'stale', active: false, detached: true, requestActive: false }),
                'item.translation_noop_detached': freezeAdapterRecordTransition({ status: 'failed', active: false, detached: true, requestActive: false }),
                'item.stale': freezeAdapterRecordTransition({ status: 'stale' }),
                'item.disappeared': freezeAdapterRecordTransition({ status: 'disappeared' }),
                'item.removed': freezeAdapterRecordTransition({ status: 'removed' }),
                'item.replaced': freezeAdapterRecordTransition({ status: 'stale' }),
                'item.surface_invalidated': freezeAdapterRecordTransition({ status: 'stale' }),
            });

            const ACTIVE_STATUSES = freezeStatusSet((status) => getStatusDefinition(status).active === true);
            const REQUEST_ACTIVE_STATUSES = freezeStatusSet((status) => getStatusDefinition(status).requestActive === true);
            const TERMINAL_STATUSES = freezeStatusSet((status) => getStatusDefinition(status).terminal === true);
            const RETIRED_STATUSES = freezeStatusSet((status) => getStatusDefinition(status).retired === true);

            function freezeStatus(flags) {
                return Object.freeze({
                    active: flags && flags.active === true,
                    requestActive: flags && flags.requestActive === true,
                    terminal: flags && flags.terminal === true,
                    retired: flags && flags.retired === true,
                });
            }

            function freezeAdapterRecordTransition(options) {
                const transition = {
                    status: String(options && options.status || ''),
                };
                ['active', 'detached', 'requestActive', 'retire'].forEach((key) => {
                    if (Object.prototype.hasOwnProperty.call(options || {}, key)) {
                        transition[key] = options[key] === true;
                    }
                });
                return Object.freeze(transition);
            }

            function freezeStatusSet(predicate) {
                const result = {};
                Object.keys(STATUS_DEFINITIONS).forEach((status) => {
                    if (predicate(status)) result[status] = true;
                });
                return Object.freeze(result);
            }

            function normalizeStatus(value, fallback = 'detected') {
                const raw = value === undefined || value === null || value === ''
                    ? fallback
                    : value;
                const text = String(raw || fallback || 'detected').trim();
                return STATUS_DEFINITIONS[text] ? text : (fallback ? normalizeStatus(fallback, 'detected') : 'detected');
            }

            function getStatusDefinition(status) {
                return STATUS_DEFINITIONS[normalizeStatus(status, 'detected')] || STATUS_DEFINITIONS.detected;
            }

            function isActiveStatus(status) {
                return getStatusDefinition(status).active === true;
            }

            function isRequestActiveStatus(status) {
                return getStatusDefinition(status).requestActive === true;
            }

            function isTerminalStatus(status) {
                return getStatusDefinition(status).terminal === true;
            }

            function isRetiredStatus(status) {
                return getStatusDefinition(status).retired === true;
            }

            function statusFromTranslationEvent(event, fallback = 'detected') {
                const key = String(event || '').trim().toLowerCase();
                return normalizeStatus(TRANSLATION_EVENT_STATUSES[key] || fallback, fallback);
            }

            function adapterRecordStatusFromEvent(eventType, fallback = '') {
                const transition = adapterRecordTransitionFromEvent(eventType, fallback);
                return transition ? transition.status : '';
            }

            function adapterRecordTransitionFromEvent(eventType, fallback = '') {
                const key = String(eventType || '').trim().toLowerCase();
                const source = key && Object.prototype.hasOwnProperty.call(ADAPTER_RECORD_EVENT_TRANSITIONS, key)
                    ? ADAPTER_RECORD_EVENT_TRANSITIONS[key]
                    : null;
                if (!source) {
                    if (!fallback) return null;
                    return freezeAdapterRecordTransition({ status: normalizeStatus(fallback, fallback) });
                }
                const status = normalizeStatus(source.status, fallback || source.status);
                const transition = { status };
                ['active', 'detached', 'requestActive', 'retire'].forEach((option) => {
                    if (Object.prototype.hasOwnProperty.call(source, option)) {
                        transition[option] = source[option] === true;
                    }
                });
                if (!Object.prototype.hasOwnProperty.call(transition, 'retire') && isRetiredStatus(status)) {
                    transition.retire = true;
                }
                return freezeAdapterRecordTransition(transition);
            }

            function createState(source = {}) {
                const status = normalizeStatus(source.status, 'detected');
                return {
                    status,
                    active: Object.prototype.hasOwnProperty.call(source, 'active')
                        ? source.active !== false
                        : isActiveStatus(status),
                    requestActive: Object.prototype.hasOwnProperty.call(source, 'requestActive')
                        ? source.requestActive === true
                        : isRequestActiveStatus(status),
                    detached: source.detached === true,
                };
            }

            function transitionState(current = {}, status, options = {}) {
                const currentState = createState(current);
                const nextStatus = normalizeStatus(status, currentState.status);
                const nextDefinition = getStatusDefinition(nextStatus);
                const forceInactive = options.retire === true || nextDefinition.retired === true;
                const active = Object.prototype.hasOwnProperty.call(options, 'active')
                    ? options.active === true
                    : (!forceInactive && nextDefinition.active === true);
                const detached = Object.prototype.hasOwnProperty.call(options, 'detached')
                    ? options.detached === true
                    : (active ? false : currentState.detached);
                const requestActive = Object.prototype.hasOwnProperty.call(options, 'requestActive')
                    ? options.requestActive === true
                    : (active || detached ? nextDefinition.requestActive === true : false);

                return {
                    status: nextStatus,
                    active,
                    requestActive,
                    detached,
                    terminal: nextDefinition.terminal === true,
                    retired: forceInactive,
                };
            }

            function applyTransition(target, status, options = {}) {
                if (!target || typeof target !== 'object') return null;
                const next = transitionState(target, status, options);
                target.status = next.status;
                target.active = next.active;
                target.requestActive = next.requestActive;
                target.detached = next.detached;
                return next;
            }

            return {
                STATUS_DEFINITIONS,
                TRANSLATION_EVENT_STATUSES,
                ADAPTER_RECORD_EVENT_TRANSITIONS,
                ADAPTER_RECORD_TRANSLATION_READY_STATUS,
                ADAPTER_RECORD_RENDER_COMMITTED_STATUS,
                ACTIVE_STATUSES,
                REQUEST_ACTIVE_STATUSES,
                TERMINAL_STATUSES,
                RETIRED_STATUSES,
                normalizeStatus,
                getStatusDefinition,
                isActiveStatus,
                isRequestActiveStatus,
                isTerminalStatus,
                isRetiredStatus,
                statusFromTranslationEvent,
                adapterRecordStatusFromEvent,
                adapterRecordTransitionFromEvent,
                createState,
                transitionState,
                applyTransition,
            };
        },
    });
})();
