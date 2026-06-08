// Shared entry lifecycle state for adapter-owned render entries.
//
// Window text entries move through local states before and after the
// orchestrator record lifecycle: pending invalidation, stale, detached, and
// surface visibility. Keeping that state in one object prevents controllers,
// hooks, and replay filters from inventing parallel private flags.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/entry-lifecycle.js.');
    }

    function ensure(entry) {
        if (!entry || typeof entry !== 'object') return null;
        if (!entry.lifecycle || typeof entry.lifecycle !== 'object') {
            entry.lifecycle = createState();
        }
        if (!entry.lifecycle.detached || typeof entry.lifecycle.detached !== 'object') {
            entry.lifecycle.detached = null;
        }
        return entry.lifecycle;
    }

    function createState() {
        return {
            stale: false,
            staleReason: '',
            staleAt: 0,
            canceledReason: '',
            canceledAt: 0,
            pendingInvalidation: null,
            detached: null,
            surfaceVisible: null,
            screenState: '',
            visibilityReason: '',
            visibilityAt: 0,
        };
    }

    function isStale(entry) {
        const lifecycle = entry && entry.lifecycle;
        return !!(lifecycle && lifecycle.stale === true);
    }

    function markStale(entry, reason = 'entry-stale', options = {}) {
        const lifecycle = ensure(entry);
        if (!lifecycle) return null;
        const at = readTimestamp(options.at);
        const staleReason = String(reason || 'entry-stale');
        lifecycle.stale = true;
        lifecycle.staleReason = staleReason;
        lifecycle.staleAt = at;
        lifecycle.canceledReason = staleReason;
        lifecycle.canceledAt = at;
        lifecycle.pendingInvalidation = null;
        if (Object.prototype.hasOwnProperty.call(options, 'surfaceVisible')) {
            setSurfaceVisible(entry, options.surfaceVisible === true, {
                reason: staleReason,
                screenState: options.screenState || (options.surfaceVisible === true ? 'visible' : 'hidden'),
                at,
            });
        }
        return lifecycle;
    }

    function markPendingInvalidation(entry, reason = 'window-entry-stale', options = {}) {
        const lifecycle = ensure(entry);
        if (!lifecycle || lifecycle.stale === true) return null;
        const at = readTimestamp(options.at);
        const pending = {
            reason: String(reason || 'window-entry-stale'),
            sourceReason: String(options.sourceReason || reason || 'window-entry-replaced'),
            at,
            contentsRevision: Number.isFinite(Number(options.contentsRevision))
                ? Number(options.contentsRevision)
                : 0,
        };
        lifecycle.pendingInvalidation = pending;
        lifecycle.canceledReason = pending.sourceReason;
        lifecycle.canceledAt = at;
        return pending;
    }

    function getPendingInvalidation(entry) {
        const lifecycle = entry && entry.lifecycle;
        return lifecycle && lifecycle.pendingInvalidation
            && typeof lifecycle.pendingInvalidation === 'object'
            ? lifecycle.pendingInvalidation
            : null;
    }

    function clearPendingInvalidation(entry) {
        const lifecycle = ensure(entry);
        if (!lifecycle) return false;
        const changed = !!(lifecycle.pendingInvalidation
            || lifecycle.canceledReason
            || lifecycle.canceledAt);
        lifecycle.pendingInvalidation = null;
        if (lifecycle.stale !== true) {
            lifecycle.canceledReason = '';
            lifecycle.canceledAt = 0;
        }
        return changed;
    }

    function markDetached(entry, reason = 'entry-detached', details = null, options = {}) {
        const lifecycle = ensure(entry);
        if (!lifecycle) return null;
        const detached = {
            at: readTimestamp(options.at),
            reason: String(reason || lifecycle.canceledReason || 'entry-detached'),
            details: normalizeDetachedDetails(details),
        };
        lifecycle.detached = detached;
        return detached;
    }

    function getDetached(entry) {
        const lifecycle = entry && entry.lifecycle;
        return lifecycle && lifecycle.detached && typeof lifecycle.detached === 'object'
            ? lifecycle.detached
            : null;
    }

    function getDetachedReason(entry) {
        const detached = getDetached(entry);
        return detached && detached.reason ? String(detached.reason) : '';
    }

    function getDetachedDetails(entry) {
        const detached = getDetached(entry);
        return detached && detached.details && typeof detached.details === 'object'
            ? detached.details
            : null;
    }

    function markReattached(entry) {
        const lifecycle = ensure(entry);
        if (!lifecycle) return null;
        lifecycle.stale = false;
        lifecycle.staleReason = '';
        lifecycle.staleAt = 0;
        lifecycle.canceledReason = '';
        lifecycle.canceledAt = 0;
        lifecycle.pendingInvalidation = null;
        lifecycle.detached = null;
        return lifecycle;
    }

    function setSurfaceVisible(entry, visible, details = {}) {
        const lifecycle = ensure(entry);
        if (!lifecycle) return null;
        const isVisible = visible === true;
        lifecycle.surfaceVisible = isVisible;
        lifecycle.screenState = String(details.screenState || (isVisible ? 'visible' : 'hidden'));
        lifecycle.visibilityReason = String(details.reason || (isVisible ? 'visible' : 'hidden'));
        lifecycle.visibilityAt = readTimestamp(details.at);
        return lifecycle;
    }

    function getSurfaceVisible(entry) {
        const lifecycle = entry && entry.lifecycle;
        return lifecycle && typeof lifecycle.surfaceVisible === 'boolean'
            ? lifecycle.surfaceVisible
            : null;
    }

    function getCanceledReason(entry) {
        const lifecycle = entry && entry.lifecycle;
        return lifecycle && lifecycle.canceledReason ? String(lifecycle.canceledReason) : '';
    }

    function getCanceledAt(entry) {
        const lifecycle = entry && entry.lifecycle;
        return lifecycle && Number.isFinite(Number(lifecycle.canceledAt))
            ? Number(lifecycle.canceledAt)
            : 0;
    }

    function normalizeDetachedDetails(details) {
        if (!details || typeof details !== 'object') return null;
        return {
            key: String(details.key || ''),
            windowType: String(details.windowType || ''),
            allowDetachedReattach: details.allowDetachedReattach === true,
        };
    }

    function readTimestamp(value) {
        const source = value && typeof value === 'object' ? value.at : value;
        const numeric = Number(source);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
    }

    defineRuntimeModule('runtime.entryLifecycle', {
        ensure,
        isStale,
        markStale,
        markPendingInvalidation,
        getPendingInvalidation,
        clearPendingInvalidation,
        markDetached,
        getDetached,
        getDetachedReason,
        getDetachedDetails,
        markReattached,
        setSurfaceVisible,
        getSurfaceVisible,
        getCanceledReason,
        getCanceledAt,
    });
})();
