// Window registry helper module.
// Tracks Window-to-Bitmap ownership and unregisters detached windows safely.
(() => {
    'use strict';

    let runtimeScope = null;
    let displayStateModule = null;
    let lifecycleReasons = null;
    let entryLifecycle = null;
    let surfaceRoleState = null;

    function createWindowRegistryHelpers(context = {}) {
        const {
            windowRegistry,
            registeredWindows,
            surfaceOwnership = null,
            windowLifecycle = null,
            adapterContract = null,
            windowLifecyclePrototypeHooks = null,
            getWindowTextHelpers = null,
        } = context;
        if (!windowRegistry || !registeredWindows || !surfaceOwnership) {
            throw new Error('[WindowHelpers] Missing window registry references.');
        }
        const displayState = displayStateModule.createDisplayStateService(runtimeScope);
        const isEntryActive = (entry) => {
            if (!entry || !entry.recordId) return false;
            if (windowLifecycle && typeof windowLifecycle.isEntryActive === 'function') {
                return windowLifecycle.isEntryActive(entry);
            }
            if (adapterContract && typeof adapterContract.isRecordActive === 'function') {
                return adapterContract.isRecordActive(entry);
            }
            return false;
        };
        const isEntryCompleted = (entry) => {
            if (!entry || !entry.recordId) return false;
            if (windowLifecycle && typeof windowLifecycle.isEntryCompleted === 'function') {
                return windowLifecycle.isEntryCompleted(entry);
            }
            if (adapterContract && typeof adapterContract.getRecordStatus === 'function') {
                return adapterContract.getRecordStatus(entry) === 'completed';
            }
            return false;
        };
        const retireWindowEntry = (entry, reason, details = null, options = {}) => {
            if (!isEntryActive(entry)) return;
            try {
                if (windowLifecycle && typeof windowLifecycle.retireEntry === 'function') {
                    windowLifecycle.retireEntry(entry, reason || lifecycleReasons.WINDOW_STALE, details, options);
                }
            } catch (_) {}
        };
        const resolveWindowTextHelpers = () => {
            if (typeof getWindowTextHelpers !== 'function') return null;
            try {
                return getWindowTextHelpers() || null;
            } catch (_) {
                return null;
            }
        };
        const rejectWindowPendingRender = (entry, reason, details = null) => {
            const helpers = resolveWindowTextHelpers();
            if (!helpers || typeof helpers.rejectPendingRender !== 'function') return false;
            try {
                const result = helpers.rejectPendingRender(entry, reason, details);
                return !!(result && result.handled === true);
            } catch (_) {
                return false;
            }
        };
        const forgetWindowEntryRecord = (entry, reason, details = null) => {
            const helpers = resolveWindowTextHelpers();
            if (!helpers || typeof helpers.forgetEntryRecord !== 'function') return false;
            try {
                return helpers.forgetEntryRecord(entry, reason, details) === true;
            } catch (_) {
                return false;
            }
        };

        function installWindowLifecyclePrototypeHooks(window) {
            if (!window || !windowLifecyclePrototypeHooks) return;
            const installer = typeof windowLifecyclePrototypeHooks.install === 'function'
                ? windowLifecyclePrototypeHooks.install
                : null;
            if (!installer) return;
            try {
                installer(window);
            } catch (_) {}
        }

        function findPropertyDescriptor(target, propertyName) {
            let cursor = target;
            while (cursor) {
                try {
                    const descriptor = Object.getOwnPropertyDescriptor(cursor, propertyName);
                    if (descriptor) return descriptor;
                    cursor = Object.getPrototypeOf(cursor);
                } catch (_) {
                    return null;
                }
            }
            return null;
        }

        function installWindowContentsAccessor(window, windowData) {
            if (!window || typeof window !== 'object') return false;
            try {
                if (window._trWindowContentsAccessorInstalled === true) return true;
                const ownDescriptor = Object.getOwnPropertyDescriptor(window, 'contents');
                const inheritedDescriptor = ownDescriptor ? null : findPropertyDescriptor(Object.getPrototypeOf(window), 'contents');
                if ((ownDescriptor && (ownDescriptor.get || ownDescriptor.set))
                    || (inheritedDescriptor && (inheritedDescriptor.get || inheritedDescriptor.set))
                    || (inheritedDescriptor && inheritedDescriptor.writable === false)) {
                    return false;
                }
                const enumerable = ownDescriptor ? ownDescriptor.enumerable !== false : true;
                const initialContents = ownDescriptor && Object.prototype.hasOwnProperty.call(ownDescriptor, 'value')
                    ? ownDescriptor.value
                    : window.contents;
                Object.defineProperty(window, '_trWindowContentsValue', {
                    configurable: true,
                    enumerable: false,
                    writable: true,
                    value: initialContents,
                });
                Object.defineProperty(window, 'contents', {
                    configurable: true,
                    enumerable,
                    get() {
                        return this._trWindowContentsValue;
                    },
                    set(value) {
                        this._trWindowContentsValue = value;
                        handleWindowContentsAssigned(this, value, 'contents-assigned');
                    },
                });
                Object.defineProperty(window, '_trWindowContentsAccessorInstalled', {
                    configurable: true,
                    enumerable: false,
                    writable: true,
                    value: true,
                });
                rememberWindowContentsSurface(window, windowData, initialContents, 'contents-accessor-installed');
                return true;
            } catch (_) {
                return false;
            }
        }

        function handleWindowContentsAssigned(window, contents, reason = 'contents-assigned') {
            if (!window || !contents) return false;
            let windowData = null;
            try { windowData = windowRegistry.get(window) || null; } catch (_) {}
            if (!windowData) return false;
            if (isWindowRefreshActive(window, windowData)) {
                bindAssignedRefreshContents(window, windowData, contents, reason);
                return true;
            }
            bindContentsOwner(window, windowData, { reason });
            return true;
        }

        function isWindowRefreshActive(window, windowData) {
            const refreshState = getWindowRefreshState(window, windowData);
            return !!(refreshState && refreshState.active === true);
        }

        function getWindowRefreshState(window, windowData) {
            if (!windowLifecycle || typeof windowLifecycle.getRefreshState !== 'function') return null;
            try {
                const state = windowLifecycle.getRefreshState(window, windowData);
                return state && typeof state === 'object' ? state : null;
            } catch (_) {
                return null;
            }
        }

        function bindAssignedRefreshContents(window, windowData, contents, reason) {
            if (!window || !windowData || !contents) return false;
            if (windowData.contentsBitmap !== contents) {
                releaseWindowContentsSurface(windowData, lifecycleReasons.CONTENTS_REPLACED);
                try { windowData.contentsRevision = (windowData.contentsRevision || 0) + 1; } catch (_) {}
            }
            windowData.contentsBitmap = contents;
            rememberWindowContentsSurface(window, windowData, contents, reason || 'refresh-contents-assigned');
            claimWindowContentsSurface(window, windowData);
            return true;
        }

        function rememberWindowContentsSurface(window, windowData, contents, reason = 'window-contents') {
            if (!window || !windowData || !contents) return false;
            try { surfaceOwnership.rememberContentsOwner(contents, window); } catch (_) {}
            try {
                const records = Array.isArray(windowData.contentsSurfaces)
                    ? windowData.contentsSurfaces
                    : [];
                const existing = records.find((record) => record && record.bitmap === contents);
                const record = existing || { bitmap: contents };
                record.reason = String(reason || 'window-contents');
                record.lastSeenAt = Date.now();
                if (!existing) records.push(record);
                while (records.length > 16) {
                    const index = records.findIndex((candidate) => candidate
                        && candidate.bitmap !== windowData.contentsBitmap
                        && candidate.bitmap !== (window && window.contents));
                    if (index < 0) break;
                    const removed = records.splice(index, 1)[0];
                    if (removed && removed.bitmap) forgetContentsOwner(removed.bitmap, window);
                }
                windowData.contentsSurfaces = records;
            } catch (_) {}
            return true;
        }

        function markWindowEntriesStale(windowData, reason, options = {}) {
            if (!windowData) return;
            const windowType = windowData.windowType || '';
            const replacement = reason === lifecycleReasons.CONTENTS_REPLACED
                ? describeRefreshContentsReplacement(windowData, options)
                : null;
            const staleKeys = [];
            try {
                if (windowData.texts && typeof windowData.texts.forEach === 'function') {
                    windowData.texts.forEach((entry, key) => {
                        if (!entry) return;
                        if (shouldKeepEntryForRefreshContentsReplacement(windowData, entry, replacement)) {
                            migrateEntryToReplacementContents(windowData, entry, replacement);
                            return;
                        }
                        const details = {
                            key: String(key || ''),
                            windowType,
                            wasCompleted: isEntryCompleted(entry),
                        };
                        entryLifecycle.markStale(entry, reason || lifecycleReasons.WINDOW_STALE, {
                            surfaceVisible: false,
                            screenState: 'hidden',
                        });
                        rejectWindowPendingRender(entry, reason, details);
                        if (isEntryActive(entry)) {
                            retireWindowEntry(entry, reason || lifecycleReasons.WINDOW_STALE, details, {
                                cancelTranslation: false,
                            });
                        }
                        forgetWindowEntryRecord(entry, reason || lifecycleReasons.WINDOW_STALE, details);
                        entryLifecycle.setSurfaceVisible(entry, false, {
                            reason: reason || lifecycleReasons.WINDOW_STALE,
                            screenState: 'hidden',
                        });
                        staleKeys.push(key);
                    });
                    if (replacement && replacement.kept > 0) {
                        staleKeys.forEach((key) => {
                            try { windowData.texts.delete(key); } catch (_) {}
                        });
                    } else {
                        windowData.texts.clear();
                    }
                }
            } catch (_) {}
            try {
                if (windowData.renderReadinessSchedule && typeof windowData.renderReadinessSchedule.clear === 'function') {
                    if (replacement && replacement.kept > 0) {
                        staleKeys.forEach((key) => {
                            try { windowData.renderReadinessSchedule.delete(key); } catch (_) {}
                        });
                    } else {
                        windowData.renderReadinessSchedule.clear();
                    }
                }
            } catch (_) {}
            try {
                if (windowData.recentlyRedrawn && typeof windowData.recentlyRedrawn.clear === 'function') {
                    if (replacement && replacement.kept > 0) {
                        staleKeys.forEach((key) => {
                            try { windowData.recentlyRedrawn.delete(key); } catch (_) {}
                        });
                    } else {
                        windowData.recentlyRedrawn.clear();
                    }
                }
            } catch (_) {}
            try {
                windowData.contentsRevision = replacement && Number.isFinite(Number(replacement.nextRevision))
                    ? replacement.nextRevision
                    : ((windowData.contentsRevision || 0) + 1);
            } catch (_) {}
        }

        function describeRefreshContentsReplacement(windowData, options = {}) {
            const currentRevision = Number.isFinite(Number(windowData && windowData.contentsRevision))
                ? Number(windowData.contentsRevision)
                : 0;
            // A queued after-refresh render is proof that source text was
            // redrawn in the just-finished refresh but could not be translated
            // until the refresh transaction closed. Preserve only that refresh
            // generation; unrelated entries remain stale on contents replacement.
            const token = findUndrainedRefreshToken(windowData, currentRevision);
            if (!token) return null;
            return {
                token,
                currentRevision,
                nextRevision: currentRevision + 1,
                nextContents: options && options.nextContents ? options.nextContents : null,
                ownerWindow: options && options.window ? options.window : null,
                kept: 0,
            };
        }

        function findUndrainedRefreshToken(windowData, currentRevision) {
            if (!windowData || !windowData.renderReadinessSchedule || typeof windowData.renderReadinessSchedule.forEach !== 'function') return 0;
            let token = 0;
            try {
                windowData.renderReadinessSchedule.forEach((queued) => {
                    if (token) return;
                    const entry = queued && queued.entry ? queued.entry : queued;
                    if (!entry || !isEntryActive(entry)) return;
                    const queueName = String(queued && queued.queue || '');
                    const queueReason = String(queued && queued.reason || '');
                    if (queueName !== 'after-refresh' && queueReason !== 'active-refresh-transaction') return;
                    if (!sameQueuedRefreshRevision(queued, currentRevision)) return;
                    const refreshToken = getRefreshObservationToken(entry);
                    if (!sameQueuedRefreshToken(queued, refreshToken)) return;
                    if (!sameContentsRevision(entry, currentRevision)) return;
                    token = refreshToken;
                });
            } catch (_) {}
            return token;
        }

        function shouldKeepEntryForRefreshContentsReplacement(windowData, entry, replacement) {
            if (!replacement || !entry || !isEntryActive(entry)) return false;
            if (!sameContentsRevision(entry, replacement.currentRevision)) return false;
            if (getRefreshObservationToken(entry) !== replacement.token) return false;
            return !!(windowData && windowData.texts);
        }

        function migrateEntryToReplacementContents(windowData, entry, replacement) {
            if (!entry || !replacement) return;
            const contents = replacement.nextContents || entry.contentsBitmap || null;
            if (contents) {
                entry.contentsBitmap = contents;
            }
            surfaceRoleState.applyWindowEntrySurfaceRole(entry, {
                sourceContentsBitmap: contents,
                sourceContentsRole: surfaceRoleState.SOURCE_ROLES.CURRENT,
                renderSurfaceRole: surfaceRoleState.RENDER_ROLES.CURRENT,
                requiresCopiedTarget: false,
            });
            entry.contentsRevision = replacement.nextRevision;
            if (replacement.ownerWindow) entry.ownerWindow = replacement.ownerWindow;
            entry.windowData = windowData || entry.windowData;
            entry._trRefreshContentsReplacement = {
                token: replacement.token,
                fromRevision: replacement.currentRevision,
                toRevision: replacement.nextRevision,
                at: Date.now(),
            };
            replacement.kept += 1;
        }

        function getRefreshObservationToken(entry) {
            const observation = entry
                && entry.renderLifecycle
                && entry.renderLifecycle.refreshObservation;
            const token = Number(observation && observation.token);
            return Number.isFinite(token) && token > 0 ? Math.floor(token) : 0;
        }

        function sameContentsRevision(entry, revision) {
            const entryRevision = Number(entry && entry.contentsRevision);
            const expected = Number(revision);
            return Number.isFinite(entryRevision)
                && Number.isFinite(expected)
                && Math.floor(entryRevision) === Math.floor(expected);
        }

        function sameQueuedRefreshRevision(queued, revision) {
            const queuedRevision = Number(queued && queued.contentsRevision);
            const expected = Number(revision);
            return Number.isFinite(queuedRevision)
                && Number.isFinite(expected)
                && Math.floor(queuedRevision) === Math.floor(expected);
        }

        function sameQueuedRefreshToken(queued, token) {
            const queuedToken = Number(queued && queued.refreshToken);
            const expected = Number(token);
            if (!Number.isFinite(queuedToken) || !Number.isFinite(expected)) return false;
            if (Math.floor(queuedToken) !== Math.floor(expected)) return false;
            return queued && queued.refreshObserved === true;
        }

        function clearPendingDetachState(window, windowData = null) {
            try {
                if (window) {
                    delete window._trWindowRegistryPendingDetachToken;
                    delete window._trWindowRegistryPendingDetachRoot;
                    delete window._trWindowRegistryPendingDetachReason;
                }
            } catch (_) {}
            if (!windowData) return;
            try {
                delete windowData._trPendingDetach;
                delete windowData._trPendingDetachToken;
                delete windowData._trPendingDetachRoot;
                delete windowData._trPendingDetachReason;
            } catch (_) {}
        }

        function hasPendingDetachState(window, windowData = null) {
            return !!((windowData && windowData._trPendingDetach)
                || (window && Number(window._trWindowRegistryPendingDetachToken) > 0));
        }

        function releaseWindowContentsSurface(windowData, reason) {
            if (!windowData) return;
            const token = windowData.contentsSurfaceClaim || null;
            if (token && adapterContract && typeof adapterContract.releaseSurface === 'function') {
                try {
                    adapterContract.releaseSurface(token, reason || lifecycleReasons.WINDOW_UNREGISTERED);
                } catch (_) {}
            }
            windowData.contentsSurfaceClaim = null;
            windowData.contentsSurfaceClaimTarget = null;
        }

        function forgetContentsOwner(contents, ownerWindow = null) {
            if (!contents) return;
            surfaceOwnership.forgetContentsOwner(contents, ownerWindow);
        }

        function forgetWindowContentsOwners(window, windowData) {
            const contents = [];
            if (windowData && windowData.contentsBitmap) contents.push(windowData.contentsBitmap);
            if (window && window.contents && contents.indexOf(window.contents) < 0) contents.push(window.contents);
            if (windowData && Array.isArray(windowData.contentsSurfaces)) {
                windowData.contentsSurfaces.forEach((record) => {
                    const bitmap = record && record.bitmap;
                    if (bitmap && contents.indexOf(bitmap) < 0) contents.push(bitmap);
                });
                windowData.contentsSurfaces.length = 0;
            }
            contents.forEach((candidate) => forgetContentsOwner(candidate, window || null));
        }

        function unregisterWindow(window, reason = lifecycleReasons.WINDOW_UNREGISTERED) {
            if (!window) return null;
            let windowData = null;
            try { windowData = windowRegistry.get(window); } catch (_) {}
            if (windowData) {
                clearPendingDetachState(window, windowData);
                markWindowEntriesStale(windowData, reason);
                releaseWindowContentsSurface(windowData, reason);
                forgetWindowContentsOwners(window, windowData);
                windowData.isOpen = false;
                windowData.contentsBitmap = null;
                windowData._trUnregistered = true;
                windowData._trUnregisteredReason = reason;
                windowData._trUnregisteredAt = Date.now();
            }
            try { registeredWindows.delete(window); } catch (_) {}
            try {
                if (typeof windowRegistry.delete === 'function') windowRegistry.delete(window);
            } catch (_) {}
            return windowData;
        }

        function isWindowDisplayAttached(window) {
            return displayState.isDisplayObjectAttached(window);
        }

        function updateWindowAttachmentState(window, windowData) {
            if (!window || !windowData) return;
            if (isWindowDisplayAttached(window)) {
                windowData._trEverAttached = true;
            }
        }

        function isDetachedRegisteredWindow(window, windowData) {
            if (!window || !windowData) return true;
            if (hasPendingDetachState(window, windowData)) return false;
            if (window._destroyed || window.destroyed) return true;
            if (windowData._trEverAttached !== true) return false;
            return !isWindowDisplayAttached(window);
        }

        function getRegisteredWindowDetachReason(window) {
            const chainState = displayState.describeDisplayChain(window);
            return chainState.state === 'inactive-scene'
                ? lifecycleReasons.NOT_CURRENT_SCENE
                : lifecycleReasons.WINDOW_DETACHED;
        }

        function pruneDetachedRegisteredWindows(currentWindow = null) {
            if (!registeredWindows || typeof registeredWindows.forEach !== 'function') return;
            const detached = [];
            try {
                registeredWindows.forEach((candidate) => {
                    if (!candidate || candidate === currentWindow) return;
                    const candidateData = windowRegistry.get(candidate);
                    if (!candidateData) {
                        detached.push({ window: candidate, reason: lifecycleReasons.WINDOW_DETACHED });
                        return;
                    }
                    updateWindowAttachmentState(candidate, candidateData);
                    if (isDetachedRegisteredWindow(candidate, candidateData)) {
                        detached.push({ window: candidate, reason: getRegisteredWindowDetachReason(candidate) });
                    }
                });
            } catch (_) {}
            detached.forEach(({ window, reason }) => unregisterWindow(window, reason));
        }

        function bindContentsOwner(window, windowData, options = {}) {
            try {
                if (!window || !window.contents) return;
                if (windowData && windowData.contentsBitmap && windowData.contentsBitmap !== window.contents) {
                    markWindowEntriesStale(windowData, lifecycleReasons.CONTENTS_REPLACED, {
                        window,
                        nextContents: window.contents,
                    });
                    releaseWindowContentsSurface(windowData, lifecycleReasons.CONTENTS_REPLACED);
                    forgetContentsOwner(windowData.contentsBitmap, window);
                }
                if (windowData) {
                    windowData.contentsBitmap = window.contents;
                }
                rememberWindowContentsSurface(window, windowData, window.contents, options.reason || 'current-contents');
                claimWindowContentsSurface(window, windowData);
            } catch (_) {}
        }

        function claimWindowContentsSurface(window, windowData) {
            if (!window || !window.contents || !windowData) return;
            if (!adapterContract || typeof adapterContract.claimSurface !== 'function') return;
            if (windowData.contentsSurfaceClaim && windowData.contentsSurfaceClaimTarget === window.contents) return;
            const claim = adapterContract.claimSurface({
                target: window.contents,
                surfaceId: `window:${windowData.windowId || 'unknown'}:contents`,
                surfaceType: 'window',
                role: 'window-contents',
                owner: window,
            });
            if (claim && claim.status === 'claimed' && claim.token) {
                windowData.contentsSurfaceClaim = claim.token;
                windowData.contentsSurfaceClaimTarget = window.contents;
            }
        }

        function addWindowToRegistry(window, windowData) {
            installWindowLifecyclePrototypeHooks(window);
            pruneDetachedRegisteredWindows(window);
            windowData.windowType = window.constructor.name;
            windowData.windowId = window._uniqueId || (window._uniqueId = Math.random().toString(36).substring(2, 11));
            windowData.registrationTime = Date.now();
            if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
            windowData._trUnregistered = false;
            windowData._trUnregisteredReason = null;
            windowData._trUnregisteredAt = null;
            clearPendingDetachState(window, windowData);
            updateWindowAttachmentState(window, windowData);
            windowRegistry.set(window, windowData);
            registeredWindows.add(window);
            installWindowContentsAccessor(window, windowData);
            bindContentsOwner(window, windowData);
        }

        function ensureWindowRegistered(window) {
            installWindowLifecyclePrototypeHooks(window);
            pruneDetachedRegisteredWindows(window);
            let windowData = windowRegistry.get(window);
            if (!windowData) {
                window._uniqueId = window._uniqueId || Math.random().toString(36).substring(2, 11);
                windowData = { texts: new Map(), isOpen: true, renderReadinessSchedule: new Map(), recentlyRedrawn: new Map() };
                addWindowToRegistry(window, windowData);
            } else if (!windowData.renderReadinessSchedule) {
                windowData.renderReadinessSchedule = new Map();
                if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
            }
            updateWindowAttachmentState(window, windowData);
            clearPendingDetachState(window, windowData);
            installWindowContentsAccessor(window, windowData);
            bindContentsOwner(window, windowData);
            return windowData;
        }

        return {
            addWindowToRegistry,
            ensureWindowRegistered,
            unregisterWindow,
            pruneDetachedRegisteredWindows,
        };
    }

    LiveTranslatorDefine({
        name: 'hooks.window.registryHelpers',
        requires: {
            displayState: 'runtime.displayState',
            lifecycleReasonsModule: 'runtime.lifecycleReasons',
            entryLifecycleModule: 'runtime.entryLifecycle',
            surfaceRoleStateModule: 'runtime.windowSurfaceRoleState',
        },
        factory({
            displayState,
            lifecycleReasonsModule,
            entryLifecycleModule,
            surfaceRoleStateModule,
        }, { scope }) {
            runtimeScope = scope;
            displayStateModule = displayState;
            lifecycleReasons = lifecycleReasonsModule.reasons;
            entryLifecycle = entryLifecycleModule;
            surfaceRoleState = surfaceRoleStateModule;

            return {
                createWindowRegistryHelpers,
            };
        },
    });
})();
