// Runtime service for contents bitmap ownership and window surface identity.
// The adapters still receive the underlying maps for low-level registry work, but
// ownership decisions should flow through this service so bitmap/window routing
// has one definition across window, bitmap, message, and sprite adapters.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/surface-ownership.js.');
    }

    function createSurfaceOwnershipService(options = {}) {
        const contentsOwners = options.contentsOwners || new WeakMap();
        const windowRegistry = options.windowRegistry || new WeakMap();
        const registeredWindows = options.registeredWindows || new Set();

        function rememberContentsOwner(contents, ownerWindow) {
            if (!contents || !ownerWindow || typeof contentsOwners.set !== 'function') return false;
            try {
                contentsOwners.set(contents, ownerWindow);
                return true;
            } catch (_) {
                return false;
            }
        }

        function forgetContentsOwner(contents, ownerWindow = null) {
            if (!contents || typeof contentsOwners.delete !== 'function') return false;
            try {
                if (ownerWindow && typeof contentsOwners.get === 'function' && contentsOwners.get(contents) !== ownerWindow) {
                    return false;
                }
            } catch (_) {
                return false;
            }
            try {
                return contentsOwners.delete(contents) === true;
            } catch (_) {
                return false;
            }
        }

        function readContentsOwner(contents) {
            if (!contents || typeof contentsOwners.get !== 'function') return null;
            try {
                return contentsOwners.get(contents) || null;
            } catch (_) {
                return null;
            }
        }

        function getWindowData(windowInstance) {
            if (!windowInstance || typeof windowRegistry.get !== 'function') return null;
            try {
                return windowRegistry.get(windowInstance) || null;
            } catch (_) {
                return null;
            }
        }

        function scanRegisteredWindowsForContents(contents) {
            if (!contents || !registeredWindows || typeof registeredWindows.forEach !== 'function') return null;
            let match = null;
            try {
                registeredWindows.forEach((candidate) => {
                    if (match || !candidate) return;
                    const data = getWindowData(candidate);
                    if (data && (candidate.contents === contents || data.contentsBitmap === contents)) {
                        match = {
                            owner: candidate,
                            windowInstance: candidate,
                            windowData: data,
                            contents,
                            source: 'registeredWindow',
                        };
                    }
                });
            } catch (_) {
                match = null;
            }
            return match;
        }

        function resolveWindowSurfaceForContents(contents) {
            if (!contents) return null;
            const owner = readContentsOwner(contents);
            if (owner) {
                const ownerData = getWindowData(owner);
                if (ownerData) {
                    return {
                        owner,
                        windowInstance: owner,
                        windowData: ownerData,
                        contents,
                        source: 'contentsOwner',
                    };
                }
            }
            return scanRegisteredWindowsForContents(contents);
        }

        function isWindowOwnedBitmap(bitmap) {
            return !!(bitmap && (bitmap._trMessageContents === true || resolveWindowSurfaceForContents(bitmap)));
        }

        function windowEntryBelongsToContents(entry, contents, ownerWindow = null, windowData = null) {
            if (!entry || !contents) return false;
            if (entry.contentsBitmap) return entry.contentsBitmap === contents;
            const owner = ownerWindow || readContentsOwner(contents);
            const data = windowData || (owner ? getWindowData(owner) : null);
            const activeContents = owner && owner.contents ? owner.contents : (data && data.contentsBitmap);
            return activeContents ? activeContents === contents : true;
        }

        return Object.freeze({
            contentsOwners,
            windowRegistry,
            registeredWindows,
            rememberContentsOwner,
            forgetContentsOwner,
            readContentsOwner,
            getWindowData,
            scanRegisteredWindowsForContents,
            resolveWindowSurfaceForContents,
            isWindowOwnedBitmap,
            windowEntryBelongsToContents,
        });
    }

    defineRuntimeModule('runtime.surfaceOwnership', { createSurfaceOwnershipService });
})();
