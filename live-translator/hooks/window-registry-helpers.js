// Window registry helper module.
// Tracks Window-to-Bitmap ownership and unregisters detached windows safely.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.hooks) globalScope.LiveTranslatorModules.hooks = {};
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/window-registry-helpers.js.');
    }
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before hooks/window-registry-helpers.js.');
    }
    const displayStateModule = requireRuntimeModule('runtime.displayState');
    const lifecycleReasons = requireRuntimeModule('runtime.lifecycleReasons').reasons;
    const entryLifecycle = requireRuntimeModule('runtime.entryLifecycle');
    if (!entryLifecycle || typeof entryLifecycle.markStale !== 'function') {
        throw new Error('[LiveTranslator] runtime.entryLifecycle is unavailable before hooks/window-registry-helpers.js.');
    }

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
        const displayState = displayStateModule.createDisplayStateService(globalScope);
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

        function markWindowEntriesStale(windowData, reason) {
            if (!windowData) return;
            const windowType = windowData.windowType || '';
            try {
                if (windowData.texts && typeof windowData.texts.forEach === 'function') {
                    windowData.texts.forEach((entry, key) => {
                        if (!entry) return;
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
                    });
                    windowData.texts.clear();
                }
            } catch (_) {}
            try {
                if (windowData.renderQueue && typeof windowData.renderQueue.clear === 'function') {
                    windowData.renderQueue.clear();
                }
            } catch (_) {}
            try {
                if (windowData.recentlyRedrawn && typeof windowData.recentlyRedrawn.clear === 'function') {
                    windowData.recentlyRedrawn.clear();
                }
            } catch (_) {}
            try { windowData.contentsRevision = (windowData.contentsRevision || 0) + 1; } catch (_) {}
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

        function bindContentsOwner(window, windowData) {
            try {
                if (!window || !window.contents) return;
                if (windowData && windowData.contentsBitmap && windowData.contentsBitmap !== window.contents) {
                    markWindowEntriesStale(windowData, lifecycleReasons.CONTENTS_REPLACED);
                    releaseWindowContentsSurface(windowData, lifecycleReasons.CONTENTS_REPLACED);
                    forgetContentsOwner(windowData.contentsBitmap, window);
                }
                if (windowData) {
                    windowData.contentsBitmap = window.contents;
                }
                surfaceOwnership.rememberContentsOwner(window.contents, window);
                claimWindowContentsSurface(window, windowData);
                if (!window.contents._trWindowPipelineDepth) {
                    window.contents._trWindowPipelineDepth = 0;
                }
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
            bindContentsOwner(window, windowData);
        }

        function ensureWindowRegistered(window) {
            installWindowLifecyclePrototypeHooks(window);
            pruneDetachedRegisteredWindows(window);
            let windowData = windowRegistry.get(window);
            if (!windowData) {
                window._uniqueId = window._uniqueId || Math.random().toString(36).substring(2, 11);
                windowData = { texts: new Map(), isOpen: true, renderQueue: new Map(), recentlyRedrawn: new Map() };
                addWindowToRegistry(window, windowData);
            } else if (!windowData.renderQueue) {
                windowData.renderQueue = new Map();
                if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
            }
            updateWindowAttachmentState(window, windowData);
            clearPendingDetachState(window, windowData);
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

    defineRuntimeModule('hooks.windowRegistryHelpers', {
        createWindowRegistryHelpers,
    });
})();
