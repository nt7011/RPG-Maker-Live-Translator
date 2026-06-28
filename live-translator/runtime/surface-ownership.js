// Runtime service for contents bitmap ownership and window surface identity.
// The adapters still receive the underlying maps for low-level registry work, but
// ownership decisions should flow through this service so bitmap/window routing
// has one definition across window, bitmap, message, and sprite adapters.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.surfaceOwnership',
        factory() {
            function createSurfaceOwnershipService(options = {}) {
                const contentsOwners = options.contentsOwners || new WeakMap();
                const windowRegistry = options.windowRegistry || new WeakMap();
                const registeredWindows = options.registeredWindows || new Set();
                const contentsDescriptors = options.contentsDescriptors || new WeakMap();
                const dedicatedTextOwners = options.dedicatedTextOwners || new WeakMap();
                const dedicatedTextConstructors = options.dedicatedTextConstructors || new WeakMap();

                function rememberContentsOwner(contents, ownerWindow, descriptor = null) {
                    if (!contents || !ownerWindow || typeof contentsOwners.set !== 'function') return false;
                    try {
                        contentsOwners.set(contents, ownerWindow);
                        if (descriptor && typeof descriptor === 'object') {
                            rememberContentsDescriptor(contents, ownerWindow, descriptor);
                        }
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
                        const removed = contentsOwners.delete(contents) === true;
                        forgetContentsDescriptor(contents, ownerWindow);
                        return removed;
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

                function rememberDedicatedTextOwner(ownerWindow, descriptor = null) {
                    if (!canStoreWeakState(ownerWindow) || typeof dedicatedTextOwners.set !== 'function') return false;
                    try {
                        dedicatedTextOwners.set(ownerWindow, normalizeDedicatedTextDescriptor(descriptor));
                        rememberDedicatedTextConstructor(ownerWindow.constructor, descriptor);
                        return true;
                    } catch (_) {
                        return false;
                    }
                }

                function rememberDedicatedTextConstructor(Ctor, descriptor = null) {
                    if (!canStoreWeakState(Ctor) || typeof dedicatedTextConstructors.set !== 'function') return false;
                    try {
                        dedicatedTextConstructors.set(Ctor, normalizeDedicatedTextDescriptor(descriptor));
                        return true;
                    } catch (_) {
                        return false;
                    }
                }

                function isDedicatedTextOwner(ownerWindow) {
                    if (!ownerWindow) return false;
                    if (weakMapHas(dedicatedTextOwners, ownerWindow)) return true;
                    const ctor = ownerWindow.constructor;
                    return !!(ctor && weakMapHas(dedicatedTextConstructors, ctor));
                }

                function rememberContentsDescriptor(contents, ownerWindow = null, descriptor = {}) {
                    if (!canStoreWeakState(contents) || typeof contentsDescriptors.set !== 'function') return false;
                    try {
                        contentsDescriptors.set(contents, normalizeContentsDescriptor(ownerWindow, descriptor));
                        return true;
                    } catch (_) {
                        return false;
                    }
                }

                function forgetContentsDescriptor(contents, ownerWindow = null) {
                    if (!contents || typeof contentsDescriptors.delete !== 'function') return false;
                    const descriptor = readContentsDescriptor(contents);
                    if (ownerWindow && descriptor && descriptor.owner && descriptor.owner !== ownerWindow) return false;
                    try {
                        return contentsDescriptors.delete(contents) === true;
                    } catch (_) {
                        return false;
                    }
                }

                function readContentsDescriptor(contents) {
                    if (!contents || typeof contentsDescriptors.get !== 'function') return null;
                    try {
                        return contentsDescriptors.get(contents) || null;
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

                function describeContentsOwnership(contents) {
                    if (!contents) return null;
                    const descriptor = readContentsDescriptor(contents);
                    const owner = readContentsOwner(contents);
                    const surface = resolveWindowSurfaceForContents(contents);
                    const resolvedOwner = owner || (surface && (surface.owner || surface.windowInstance)) || null;
                    return {
                        owner: resolvedOwner,
                        windowInstance: surface && (surface.windowInstance || surface.owner) || resolvedOwner,
                        windowData: surface && surface.windowData || null,
                        source: surface && surface.source || (descriptor ? 'contentsDescriptor' : ''),
                        adapterId: descriptor && descriptor.adapterId || '',
                        surfaceType: descriptor && descriptor.surfaceType || '',
                        role: descriptor && descriptor.role || '',
                        windowOwned: !!((descriptor && descriptor.windowOwned) || surface),
                        dedicatedTextHook: !!((descriptor && descriptor.dedicatedTextHook) || isDedicatedTextOwner(resolvedOwner)),
                        bypassBitmapDrawReason: descriptor && descriptor.bypassBitmapDrawReason || '',
                    };
                }

                function isDedicatedTextContents(contents) {
                    const descriptor = describeContentsOwnership(contents);
                    return !!(descriptor && descriptor.dedicatedTextHook);
                }

                function isWindowOwnedBitmap(bitmap) {
                    const descriptor = describeContentsOwnership(bitmap);
                    return !!(descriptor && descriptor.windowOwned);
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
                    contentsDescriptors,
                    dedicatedTextOwners,
                    dedicatedTextConstructors,
                    rememberContentsOwner,
                    forgetContentsOwner,
                    readContentsOwner,
                    rememberDedicatedTextOwner,
                    rememberDedicatedTextConstructor,
                    isDedicatedTextOwner,
                    rememberContentsDescriptor,
                    forgetContentsDescriptor,
                    readContentsDescriptor,
                    describeContentsOwnership,
                    isDedicatedTextContents,
                    getWindowData,
                    scanRegisteredWindowsForContents,
                    resolveWindowSurfaceForContents,
                    isWindowOwnedBitmap,
                    windowEntryBelongsToContents,
                });
            }

            function normalizeDedicatedTextDescriptor(descriptor = null) {
                const source = descriptor && typeof descriptor === 'object' ? descriptor : {};
                return {
                    adapterId: firstString(source.adapterId, source.sourceAdapter),
                    surfaceType: firstString(source.surfaceType),
                    role: firstString(source.role),
                    reason: firstString(source.reason),
                };
            }

            function normalizeContentsDescriptor(ownerWindow, descriptor = {}) {
                const source = descriptor && typeof descriptor === 'object' ? descriptor : {};
                const role = firstString(source.role, source.contentsRole);
                return {
                    owner: ownerWindow || source.owner || null,
                    adapterId: firstString(source.adapterId, source.sourceAdapter),
                    surfaceType: firstString(source.surfaceType),
                    role,
                    windowOwned: source.windowOwned === true || role === 'window-contents' || role === 'message-contents',
                    dedicatedTextHook: source.dedicatedTextHook === true || source.dedicatedTextOwner === true,
                    bypassBitmapDrawReason: firstString(source.bypassBitmapDrawReason),
                    reason: firstString(source.reason),
                };
            }

            function canStoreWeakState(value) {
                const type = typeof value;
                return value !== null && (type === 'object' || type === 'function');
            }

            function weakMapHas(map, key) {
                if (!key || !map || typeof map.has !== 'function') return false;
                try {
                    return map.has(key) === true;
                } catch (_) {
                    return false;
                }
            }

            function firstString(...values) {
                for (const value of values) {
                    if (value === undefined || value === null) continue;
                    const text = String(value);
                    if (text) return text;
                }
                return '';
            }

            return { createSurfaceOwnershipService };
        },
    });
})();
