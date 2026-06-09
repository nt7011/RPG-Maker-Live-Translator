// Window text adapter service bundle.
//
// Controllers should depend on these narrow service objects for external
// systems. Cross-controller calls still go through the controller dispatcher,
// but adapter-contract, surface ownership, draw-state, replay, and snapshot
// dependencies are grouped here instead of being pulled from a giant context.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.adapters) globalScope.LiveTranslatorModules.adapters = {};
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/services.js.');
    }

    function createWindowTextServices(context = {}) {
        const adapterContract = context.adapterContract || null;
        const windowLifecycle = context.windowLifecycle || null;
        const surfaceOwnership = context.surfaceOwnership || null;
        const windowRegistry = context.windowRegistry || null;
        const registeredWindows = context.registeredWindows || null;

        const lifecycle = Object.freeze({
            requestItemTranslation(entry, options) {
                return adapterContract.requestItemTranslation(entry, options);
            },
            observeRecord(entry, payload, eventOptions, observeOptions) {
                return adapterContract.observeRecord(entry, payload, eventOptions, observeOptions);
            },
            updateItem(entry, patch, eventType, details) {
                return adapterContract.updateItem(entry, patch || {}, { eventType, details });
            },
            getRecordStatus(entry, fallback = '') {
                return adapterContract && typeof adapterContract.getRecordStatus === 'function'
                    ? adapterContract.getRecordStatus(entry, fallback)
                    : String(fallback || '');
            },
            isRecordActive(entry) {
                return !!(adapterContract
                    && typeof adapterContract.isRecordActive === 'function'
                    && adapterContract.isRecordActive(entry));
            },
            isRecordRequestActive(entry) {
                return !!(adapterContract
                    && typeof adapterContract.isRecordRequestActive === 'function'
                    && adapterContract.isRecordRequestActive(entry));
            },
            cancelItemTranslation(entry, reason) {
                return adapterContract.cancelItemTranslation(entry, reason);
            },
            retireItem(entry, status, options) {
                return adapterContract.retireItem(entry, status, options);
            },
            recordDecision(entry, type, message, details) {
                return adapterContract.recordDecision(entry, type, message, details);
            },
            recordRenderDeferred(entry, decision) {
                return adapterContract.recordRenderDeferred(entry, decision);
            },
            recordRenderAccepted(entry, decision) {
                return adapterContract.recordRenderAccepted(entry, decision);
            },
            recordRenderRejected(entry, decision) {
                return adapterContract.recordRenderRejected(entry, decision);
            },
            describeTextEligibility(payload) {
                return adapterContract.describeTextEligibility(payload);
            },
            subscribeRecords(options) {
                return adapterContract.subscribeRecords(options);
            },
            markEntryObservedInRefresh(entry, windowInstance, windowData) {
                if (!windowLifecycle || typeof windowLifecycle.markEntryObservedInRefresh !== 'function') return 0;
                return windowLifecycle.markEntryObservedInRefresh(entry, windowInstance, windowData);
            },
            getRefreshState(windowInstance, windowData) {
                if (!windowLifecycle || typeof windowLifecycle.getRefreshState !== 'function') {
                    return { active: false, token: 0, depth: 0 };
                }
                return windowLifecycle.getRefreshState(windowInstance, windowData);
            },
            wasEntryObservedInRefresh(entry, windowInstance, windowData) {
                return !!(windowLifecycle
                    && typeof windowLifecycle.wasEntryObservedInRefresh === 'function'
                    && windowLifecycle.wasEntryObservedInRefresh(entry, windowInstance, windowData));
            },
            getRenderDrainState(windowInstance, windowData) {
                if (!windowLifecycle || typeof windowLifecycle.getRenderDrainState !== 'function') {
                    return { active: false, depth: 0, dataDepth: 0, windowDepth: 0, reason: '' };
                }
                return windowLifecycle.getRenderDrainState(windowInstance, windowData);
            },
            isRenderDrainActive(windowInstance, windowData) {
                return !!(windowLifecycle
                    && typeof windowLifecycle.isRenderDrainActive === 'function'
                    && windowLifecycle.isRenderDrainActive(windowInstance, windowData));
            },
            withRenderDrain(windowInstance, windowData, reason, callback) {
                if (!windowLifecycle || typeof windowLifecycle.withRenderDrain !== 'function') {
                    return typeof callback === 'function' ? callback() : undefined;
                }
                return windowLifecycle.withRenderDrain(windowInstance, windowData, reason, callback);
            },
        });

        function getWindowData(windowInstance) {
            if (!windowInstance || !windowRegistry || typeof windowRegistry.get !== 'function') return null;
            return windowRegistry.get(windowInstance) || null;
        }

        function forEachRegisteredWindow(callback) {
            if (!registeredWindows || typeof registeredWindows.forEach !== 'function' || typeof callback !== 'function') return;
            registeredWindows.forEach(callback);
        }

        function findWindowByData(windowData) {
            if (!windowData) return null;
            let target = null;
            forEachRegisteredWindow((candidate) => {
                if (!target && getWindowData(candidate) === windowData) target = candidate;
            });
            return target;
        }

        function findWindowBySurfaceId(surfaceId) {
            const targetSurfaceId = String(surfaceId || '');
            if (!targetSurfaceId) return null;
            let found = null;
            forEachRegisteredWindow((candidate) => {
                if (found || !candidate) return;
                const data = getWindowData(candidate);
                const candidateSurfaceId = data && (data.identitySurfaceId || data.surfaceId);
                if (candidateSurfaceId && String(candidateSurfaceId) === targetSurfaceId) {
                    found = { windowInstance: candidate, windowData: data };
                }
            });
            return found;
        }

        const surface = Object.freeze({
            getWindowData,
            forEachRegisteredWindow,
            findWindowByData,
            findWindowBySurfaceId,
            resolveWindowSurfaceForContents(contents) {
                if (!surfaceOwnership || typeof surfaceOwnership.resolveWindowSurfaceForContents !== 'function') return null;
                return surfaceOwnership.resolveWindowSurfaceForContents(contents);
            },
            windowEntryBelongsToContents(entry, contents, owner, windowData) {
                if (!surfaceOwnership || typeof surfaceOwnership.windowEntryBelongsToContents !== 'function') return false;
                return surfaceOwnership.windowEntryBelongsToContents(entry, contents, owner, windowData);
            },
            isDedicatedTextOwner(owner) {
                if (!surfaceOwnership || typeof surfaceOwnership.isDedicatedTextOwner !== 'function') return false;
                return surfaceOwnership.isDedicatedTextOwner(owner) === true;
            },
        });

        const draw = Object.freeze({
            captureBitmapDrawState: context.captureBitmapDrawState,
            applyBitmapDrawState: context.applyBitmapDrawState,
            createWindowTextScaleScope: context.createWindowTextScaleScope,
            preview: context.preview,
            diag: context.diag,
            dbg: context.dbg,
            drawCaptureTrace: context.drawCaptureTrace,
        });

        const replay = Object.freeze({
            bitmapReplay: context.bitmapReplay || null,
            bitmapDraws: context.bitmapDraws || null,
        });

        const snapshot = Object.freeze({
            maxBackgroundSnapshotPixels: context.MAX_BACKGROUND_SNAPSHOT_PIXELS,
            redrawDiagnosticItemLimit: context.REDRAW_DIAGNOSTIC_ITEM_LIMIT,
        });

        return Object.freeze({
            lifecycle,
            surface,
            draw,
            replay,
            snapshot,
        });
    }

    defineRuntimeModule('adapters.windowTextServices', { create: createWindowTextServices });
})();
