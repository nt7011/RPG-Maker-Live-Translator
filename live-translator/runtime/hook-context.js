// Shared hook state and helper context builder.
// It creates the WeakMaps/Sets and helper references that let separate hook modules cooperate on the same windows.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function' || typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/hook-context.js.');
    }

    function resolveWindowHelpers() {
        return requireRuntimeModule('hooks.windowHelpers');
    }

    function resolveTextCodec() {
        return requireRuntimeModule('runtime.textCodec');
    }

    function createWindowLifecycleBoundary(options = {}) {
        const source = options && typeof options === 'object' ? options : {};
        const adapterContract = source.adapterContract || null;
        const windowRegistry = source.windowRegistry || null;
        // One token identifies one logical Window_Base.refresh pass across
        // window draw hooks and contents-bitmap mutation hooks.
        let nextWindowRefreshToken = 0;

        function getWindowData(windowInstance, windowData = null) {
            if (windowData) return windowData;
            if (!windowInstance || !windowRegistry || typeof windowRegistry.get !== 'function') return null;
            try {
                return windowRegistry.get(windowInstance) || null;
            } catch (_) {
                return null;
            }
        }

        function beginRefresh(windowInstance, windowData = null) {
            if (!windowInstance) return 0;
            const currentDepth = Number(windowInstance._trWindowRefreshDepth) || 0;
            const token = currentDepth > 0 && windowInstance._trWindowRefreshToken
                ? windowInstance._trWindowRefreshToken
                : ++nextWindowRefreshToken;
            windowInstance._trWindowRefreshToken = token;
            const data = getWindowData(windowInstance, windowData);
            if (data) {
                data._trActiveRefreshToken = token;
                data._trWindowRefreshDepth = (Number(data._trWindowRefreshDepth) || 0) + 1;
            }
            return token;
        }

        function finishRefresh(windowInstance, token, windowData = null) {
            if (!windowInstance) return;
            const data = getWindowData(windowInstance, windowData);
            if (data && Number(data._trWindowRefreshDepth) > 0) {
                data._trWindowRefreshDepth = Math.max(0, Number(data._trWindowRefreshDepth) - 1);
            }
            if ((Number(windowInstance._trWindowRefreshDepth) || 0) <= 0) {
                if (windowInstance._trWindowRefreshToken === token) {
                    delete windowInstance._trWindowRefreshToken;
                }
                if (data && data._trActiveRefreshToken === token) {
                    delete data._trActiveRefreshToken;
                }
            }
        }

        function getActiveRefreshToken(windowInstance, windowData = null) {
            const data = getWindowData(windowInstance, windowData);
            const dataToken = Number(data && data._trActiveRefreshToken);
            if (Number.isFinite(dataToken) && dataToken > 0) return dataToken;
            const windowToken = Number(windowInstance && windowInstance._trWindowRefreshToken);
            if (Number.isFinite(windowToken) && windowToken > 0) {
                if (data) data._trActiveRefreshToken = windowToken;
                return windowToken;
            }
            return 0;
        }

        function markEntryObservedInRefresh(entry, windowInstance, windowData = null) {
            if (!entry) return 0;
            const token = getActiveRefreshToken(windowInstance, windowData);
            entry._trLastObservedRefreshToken = token;
            return token;
        }

        function wasEntryObservedInRefresh(entry, windowInstance, windowData = null) {
            if (!entry) return false;
            const activeToken = getActiveRefreshToken(windowInstance, windowData);
            if (!activeToken) return false;
            const entryToken = Number(entry._trLastObservedRefreshToken);
            return Number.isFinite(entryToken) && entryToken === Number(activeToken);
        }

        function retireEntry(entry, reason, details = null, options = {}) {
            if (!entry || !entry.recordId) return false;
            let touched = false;
            try {
                if (options.cancelTranslation === true
                    && adapterContract
                    && typeof adapterContract.cancelItemTranslation === 'function') {
                    adapterContract.cancelItemTranslation(entry, reason || 'window-stale');
                    touched = true;
                }
                if (adapterContract && typeof adapterContract.retireItem === 'function') {
                    adapterContract.retireItem(entry, 'disappeared', {
                        eventType: options.eventType || 'item.disappeared',
                        message: reason || '',
                        details,
                    });
                    touched = true;
                }
            } catch (_) {}
            return touched;
        }

        function setEntryVisible(entry, visible, details = {}) {
            if (!entry || !entry.recordId || !isEntryActive(entry)) return false;
            const isVisible = visible === true;
            try {
                if (adapterContract && typeof adapterContract.setItemVisibility === 'function') {
                    adapterContract.setItemVisibility(entry, isVisible, details || {});
                }
            } catch (_) {}
            entry._trSurfaceVisible = isVisible;
            return true;
        }

        function getEntryStatus(entry, fallback = '') {
            if (!entry || !entry.recordId) return String(fallback || '');
            if (adapterContract && typeof adapterContract.getRecordStatus === 'function') {
                return adapterContract.getRecordStatus(entry, fallback);
            }
            return String(fallback || '');
        }

        function isEntryActive(entry) {
            if (!entry || !entry.recordId) return false;
            if (adapterContract && typeof adapterContract.isRecordActive === 'function') {
                return adapterContract.isRecordActive(entry);
            }
            return false;
        }

        function isEntryCompleted(entry) {
            return getEntryStatus(entry) === 'completed';
        }

        function isEntryTranslationPending(entry) {
            if (!entry || !entry.recordId) return false;
            if (adapterContract && typeof adapterContract.isRecordRequestActive === 'function') {
                return adapterContract.isRecordRequestActive(entry);
            }
            const status = getEntryStatus(entry);
            return status === 'pending' || status === 'translating';
        }

        return {
            retireEntry,
            setEntryVisible,
            getEntryStatus,
            isEntryActive,
            isEntryCompleted,
            isEntryTranslationPending,
            beginRefresh,
            finishRefresh,
            getActiveRefreshToken,
            markEntryObservedInRefresh,
            wasEntryObservedInRefresh,
        };
    }

    defineRuntimeModule('runtime.hookContext', {
        createHookContext(options = {}) {
            const {
                adapterContract = null,
                windowAdapterContract = adapterContract,
            } = options || {};
            const windowHelpers = resolveWindowHelpers();
            const textCodec = resolveTextCodec();
            const windowRegistry = new WeakMap();
            const registeredWindows = new Set();
            const contentsOwners = new WeakMap();
            const windowLifecycle = createWindowLifecycleBoundary({
                adapterContract: windowAdapterContract,
                windowRegistry,
            });

            const {
                addWindowToRegistry,
                ensureWindowRegistered,
                unregisterWindow,
                pruneDetachedRegisteredWindows,
            } = windowHelpers.createWindowRegistryHelpers({
                windowRegistry,
                registeredWindows,
                contentsOwners,
                windowLifecycle,
                adapterContract: windowAdapterContract,
            });

            return {
                windowHelpers,
                textCodec,
                captureBitmapDrawState: windowHelpers.captureBitmapDrawState,
                applyBitmapDrawState: windowHelpers.applyBitmapDrawState,
                resolveTextScalePercent: windowHelpers.resolveTextScalePercent,
                scaleBitmapDrawState: windowHelpers.scaleBitmapDrawState,
                scaleFontSizeValue: windowHelpers.scaleFontSizeValue,
                createWindowTextScaleScope: windowHelpers.createWindowTextScaleScope,
                generateKey: windowHelpers.generateKey,
                stripControls: textCodec.stripControls,
                encodeText: textCodec.encodeText,
                restoreText: textCodec.restoreText,
                windowRegistry,
                registeredWindows,
                contentsOwners,
                windowAdapterContract,
                windowLifecycle,
                addWindowToRegistry,
                ensureWindowRegistered,
                unregisterWindow,
                pruneDetachedRegisteredWindows,
                PER_CHAR_MARK: '\u2060',
            };
        },
    });
})();
