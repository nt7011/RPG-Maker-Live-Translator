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

    function createWindowRegistryHelpers(context = {}) {
        const { windowRegistry, registeredWindows, contentsOwners, windowLifecycle = null, adapterContract = null } = context;
        if (!windowRegistry || !registeredWindows || !contentsOwners) {
            throw new Error('[WindowHelpers] Missing window registry references.');
        }
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
                    windowLifecycle.retireEntry(entry, reason || 'window-stale', details, options);
                }
            } catch (_) {}
        };

        function markWindowEntriesStale(windowData, reason) {
            if (!windowData) return;
            try {
                if (windowData.texts && typeof windowData.texts.forEach === 'function') {
                    windowData.texts.forEach((entry) => {
                        if (!entry) return;
                        entry._trStale = true;
                        entry.canceledReason = reason;
                        entry.canceledAt = Date.now();
                        if (isEntryActive(entry)) {
                            retireWindowEntry(entry, reason || 'window-stale', {
                                windowType: windowData.windowType || '',
                                wasCompleted: isEntryCompleted(entry),
                            }, {
                                cancelTranslation: false,
                            });
                        }
                    });
                    windowData.texts.clear();
                }
            } catch (_) {}
            try {
                if (windowData.pendingRedraws && typeof windowData.pendingRedraws.clear === 'function') {
                    windowData.pendingRedraws.clear();
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
                    adapterContract.releaseSurface(token, reason || 'window-unregistered');
                } catch (_) {}
            }
            windowData.contentsSurfaceClaim = null;
            windowData.contentsSurfaceClaimTarget = null;
        }

        function forgetContentsOwner(contents, ownerWindow = null) {
            if (!contents || !contentsOwners || typeof contentsOwners.delete !== 'function') return;
            try {
                if (ownerWindow && typeof contentsOwners.get === 'function' && contentsOwners.get(contents) !== ownerWindow) {
                    return;
                }
            } catch (_) {}
            try { contentsOwners.delete(contents); } catch (_) {}
        }

        function forgetWindowContentsOwners(window, windowData) {
            const contents = [];
            if (windowData && windowData.contentsBitmap) contents.push(windowData.contentsBitmap);
            if (window && window.contents && contents.indexOf(window.contents) < 0) contents.push(window.contents);
            contents.forEach((candidate) => forgetContentsOwner(candidate, window || null));
        }

        function unregisterWindow(window, reason = 'window-unregistered') {
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
            if (!window || window._destroyed || window.destroyed) return false;
            let child = window;
            let parent = window.parent || null;
            let depth = 0;
            while (parent && depth < 128) {
                if (parent._destroyed || parent.destroyed) return false;
                const children = Array.isArray(parent.children) ? parent.children : null;
                if (children && children.indexOf(child) < 0) return false;
                child = parent;
                parent = parent.parent || null;
                depth += 1;
            }
            return !!child && child !== window;
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

        function pruneDetachedRegisteredWindows(currentWindow = null) {
            if (!registeredWindows || typeof registeredWindows.forEach !== 'function') return;
            const detached = [];
            try {
                registeredWindows.forEach((candidate) => {
                    if (!candidate || candidate === currentWindow) return;
                    const candidateData = windowRegistry.get(candidate);
                    if (!candidateData) {
                        detached.push(candidate);
                        return;
                    }
                    updateWindowAttachmentState(candidate, candidateData);
                    if (isDetachedRegisteredWindow(candidate, candidateData)) {
                        detached.push(candidate);
                    }
                });
            } catch (_) {}
            detached.forEach((window) => unregisterWindow(window, 'window-detached'));
        }

        function bindContentsOwner(window, windowData) {
            try {
                if (!window || !window.contents) return;
                if (windowData && windowData.contentsBitmap && windowData.contentsBitmap !== window.contents) {
                    markWindowEntriesStale(windowData, 'contents-replaced');
                    releaseWindowContentsSurface(windowData, 'contents-replaced');
                    forgetContentsOwner(windowData.contentsBitmap, window);
                }
                if (windowData) {
                    windowData.contentsBitmap = window.contents;
                }
                contentsOwners.set(window.contents, window);
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
            pruneDetachedRegisteredWindows(window);
            let windowData = windowRegistry.get(window);
            if (!windowData) {
                window._uniqueId = window._uniqueId || Math.random().toString(36).substring(2, 11);
                windowData = { texts: new Map(), isOpen: true, pendingRedraws: new Map(), recentlyRedrawn: new Map() };
                addWindowToRegistry(window, windowData);
            } else if (!windowData.pendingRedraws) {
                windowData.pendingRedraws = new Map();
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
