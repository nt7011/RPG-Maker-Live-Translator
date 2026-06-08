// Window_Base lifecycle hook installation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/window-base-lifecycle-hooks.js.');
    }

    // The state module owns bookkeeping; this file owns prototype wrappers.
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before hooks/window-base-lifecycle-hooks.js.');
    }
    const windowLifecycleHelpers = requireRuntimeModule('hooks.windowLifecycleHelpers');
    const windowDisplayRemovalHooks = requireRuntimeModule('hooks.windowDisplayRemovalHooks');
    const windowBaseLifecycleState = requireRuntimeModule('hooks.windowBaseLifecycleState');
    const entryLifecycle = requireRuntimeModule('runtime.entryLifecycle');
    if (!entryLifecycle || typeof entryLifecycle.markStale !== 'function') {
        throw new Error('[LiveTranslator] runtime.entryLifecycle is unavailable before hooks/window-base-lifecycle-hooks.js.');
    }
    const { hasHookInChain } = windowLifecycleHelpers;

    function installWindowBaseLifecycleHooks(context) {
        const {
            logger,
            windowRegistry,
            addWindowToRegistry,
            registerWindowLifecyclePrototypeInstaller = null,
            unregisterWindow,
        } = context;
        const lifecycleState = windowBaseLifecycleState.create(context);
        const {
            createWindowData,
            isWindowEntryActive,
            isWindowEntryCompleted,
            retireWindowEntry,
            rejectWindowPendingRender,
            forgetWindowEntryRecord,
            syncWindowTextScreenState,
            commitPendingWindowEntryStaleRecords,
            withWindowRefreshDepth,
            unregisterWindowSafely,
            flushWindowRenderQueue,
        } = lifecycleState;

        const wrapWindowRefreshPrototype = (prototype) => {
            if (!prototype || typeof prototype.refresh !== 'function') return false;
            if (hasHookInChain(prototype.refresh, '__trWindowRefreshWrapped', true)) return true;
            const originalRefresh = prototype.refresh;
            prototype.refresh = function(...args) {
                return withWindowRefreshDepth(this, () => originalRefresh.apply(this, args));
            };
            prototype.refresh.__trWindowRefreshWrapped = true;
            prototype.refresh.__trOriginal = originalRefresh;
            return true;
        };

        const wrapWindowOpenPrototype = (prototype) => {
            if (!prototype || typeof prototype.open !== 'function') return false;
            if (hasHookInChain(prototype.open, '__trWindowLifecycleWrapped', true)) return true;
            const originalWindowOpen = prototype.open;
            prototype.open = function(...args) {
                this._uniqueId = this._uniqueId || Math.random().toString(36).substring(2, 11);
                const existing = windowRegistry.get(this);
                const data = existing || createWindowData(this, true);
                data.isOpen = true;
                if (!data.renderQueue) data.renderQueue = new Map();
                addWindowToRegistry(this, data);
                const result = originalWindowOpen.apply(this, args);
                syncWindowTextScreenState(this, 'window-opened');
                return result;
            };
            prototype.open.__trWindowLifecycleWrapped = true;
            prototype.open.__trOriginal = originalWindowOpen;
            return true;
        };

        const wrapWindowClosePrototype = (prototype) => {
            if (!prototype || typeof prototype.close !== 'function') return false;
            if (hasHookInChain(prototype.close, '__trWindowLifecycleWrapped', true)) return true;
            const originalWindowClose = prototype.close;
            prototype.close = function(...args) {
                const existing = windowRegistry.get(this);
                const data = existing || createWindowData(this, false);
                data.isOpen = false;
                if (data.texts && typeof data.texts.forEach === 'function') {
                    try {
                        const windowType = data.windowType || (this && this.constructor ? this.constructor.name : '');
                        data.texts.forEach((entry) => {
                            if (entry && entry.recordId) {
                                const entryDetails = { windowType };
                                entryLifecycle.markStale(entry, 'window-closed', {
                                    surfaceVisible: false,
                                    screenState: 'hidden',
                                });
                                rejectWindowPendingRender(entry, 'window-closed', entryDetails);
                                if (isWindowEntryActive(entry)) {
                                    retireWindowEntry(entry, 'window-closed', Object.assign({}, entryDetails, {
                                        wasCompleted: isWindowEntryCompleted(entry),
                                    }));
                                }
                                // A closed window no longer owns this draw slot; detach the
                                // adapter record association before the local text map is cleared.
                                forgetWindowEntryRecord(entry, 'window-closed', entryDetails);
                                entryLifecycle.setSurfaceVisible(entry, false, {
                                    reason: 'window-closed',
                                    screenState: 'hidden',
                                });
                            }
                        });
                        data.texts.clear();
                    } catch (_) {}
                }
                if (!data.renderQueue) data.renderQueue = new Map();
                try { data.renderQueue.clear(); } catch (_) {}
                windowRegistry.set(this, data);
                return originalWindowClose.apply(this, args);
            };
            prototype.close.__trWindowLifecycleWrapped = true;
            prototype.close.__trOriginal = originalWindowClose;
            return true;
        };

        const wrapWindowDestroyPrototype = (prototype) => {
            if (!prototype || typeof prototype.destroy !== 'function') return false;
            if (hasHookInChain(prototype.destroy, '__trWindowLifecycleWrapped', true)) return true;
            const originalWindowDestroy = prototype.destroy;
            prototype.destroy = function(...args) {
                unregisterWindowSafely(this, 'window-destroyed');
                return originalWindowDestroy.apply(this, args);
            };
            prototype.destroy.__trWindowLifecycleWrapped = true;
            prototype.destroy.__trOriginal = originalWindowDestroy;
            return true;
        };

        const wrapWindowHidePrototype = (prototype) => {
            if (!prototype || typeof prototype.hide !== 'function') return false;
            if (hasHookInChain(prototype.hide, '__trWindowLifecycleWrapped', true)) return true;
            const originalWindowHide = prototype.hide;
            prototype.hide = function(...args) {
                const result = originalWindowHide.apply(this, args);
                syncWindowTextScreenState(this, 'window-hidden');
                return result;
            };
            prototype.hide.__trWindowLifecycleWrapped = true;
            prototype.hide.__trOriginal = originalWindowHide;
            return true;
        };

        const wrapWindowShowPrototype = (prototype) => {
            if (!prototype || typeof prototype.show !== 'function') return false;
            if (hasHookInChain(prototype.show, '__trWindowLifecycleWrapped', true)) return true;
            const originalWindowShow = prototype.show;
            prototype.show = function(...args) {
                const result = originalWindowShow.apply(this, args);
                syncWindowTextScreenState(this, 'window-shown');
                return result;
            };
            prototype.show.__trWindowLifecycleWrapped = true;
            prototype.show.__trOriginal = originalWindowShow;
            return true;
        };

        const wrapWindowCreateContentsPrototype = (prototype) => {
            if (!prototype || typeof prototype.createContents !== 'function') return false;
            if (hasHookInChain(prototype.createContents, '__trWindowLifecycleWrapped', true)) return true;
            const originalCreateContents = prototype.createContents;
            prototype.createContents = function(...args) {
                const result = originalCreateContents.apply(this, args);
                try {
                    const existing = windowRegistry.get(this);
                    const data = existing || createWindowData(
                        this,
                        typeof this.isOpen === 'function' ? this.isOpen() : true
                    );
                    if (!data.renderQueue) data.renderQueue = new Map();
                    if (!data.recentlyRedrawn) data.recentlyRedrawn = new Map();
                    addWindowToRegistry(this, data);
                } catch (error) {
                    logError(logger, '[Window_Base.createContents Hook Error]', error);
                }
                return result;
            };
            prototype.createContents.__trWindowLifecycleWrapped = true;
            prototype.createContents.__trOriginal = originalCreateContents;
            return true;
        };

        const wrapWindowUpdatePrototype = (prototype) => {
            if (!prototype || typeof prototype.update !== 'function') return false;
            if (hasHookInChain(prototype.update, '__trWindowLifecycleWrapped', true)) return true;
            const originalWindowUpdate = prototype.update;
            prototype.update = function(...args) {
                const result = originalWindowUpdate.apply(this, args);
                try {
                    commitPendingWindowEntryStaleRecords(this, windowRegistry.get(this), 'window-update-commit');
                    flushWindowRenderQueue(this, 'window-update');
                    syncWindowTextScreenState(this, 'window-update');
                } catch (error) {
                    logError(logger, '[Window_Base.update Hook Error]', error);
                }
                return result;
            };
            prototype.update.__trWindowLifecycleWrapped = true;
            prototype.update.__trOriginal = originalWindowUpdate;
            return true;
        };

        const wrapWindowLifecyclePrototype = (prototype) => {
            if (!prototype) return false;
            let wrapped = false;
            wrapped = wrapWindowRefreshPrototype(prototype) || wrapped;
            wrapped = wrapWindowOpenPrototype(prototype) || wrapped;
            wrapped = wrapWindowClosePrototype(prototype) || wrapped;
            wrapped = wrapWindowDestroyPrototype(prototype) || wrapped;
            wrapped = wrapWindowHidePrototype(prototype) || wrapped;
            wrapped = wrapWindowShowPrototype(prototype) || wrapped;
            wrapped = wrapWindowCreateContentsPrototype(prototype) || wrapped;
            wrapped = wrapWindowUpdatePrototype(prototype) || wrapped;
            return wrapped;
        };

        const installWindowRefreshHooks = () => {
            const seen = new Set();
            const wrapConstructor = (ctor) => {
                if (!ctor || typeof ctor !== 'function' || !ctor.prototype) return;
                const prototype = ctor.prototype;
                if (seen.has(prototype)) return;
                seen.add(prototype);
                wrapWindowLifecyclePrototype(prototype);
            };
            wrapConstructor(Window_Base);
            try {
                Object.getOwnPropertyNames(globalScope).forEach((key) => {
                    if (!/^Window_/.test(key)) return;
                    wrapConstructor(globalScope[key]);
                });
            } catch (_) {}
        };

        installWindowRefreshHooks();
        if (typeof registerWindowLifecyclePrototypeInstaller === 'function') {
            registerWindowLifecyclePrototypeInstaller((windowInstance) => {
                if (!windowInstance || typeof windowInstance !== 'object') return false;
                const prototype = Object.getPrototypeOf(windowInstance);
                return wrapWindowLifecyclePrototype(prototype);
            });
        }
        windowDisplayRemovalHooks.install({
            globalScope,
            logger,
            windowRegistry,
            unregisterWindow,
            hasHookInChain,
        });
    }

    function logError(logger, message, error) {
        if (logger && typeof logger.error === 'function') {
            try { logger.error(message, error); } catch (_) {}
        }
    }

    defineRuntimeModule('hooks.windowBaseLifecycleHooks', {
        install: installWindowBaseLifecycleHooks,
    });
})();
