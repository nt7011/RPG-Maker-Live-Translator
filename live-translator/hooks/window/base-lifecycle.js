// Window_Base lifecycle hook installation.
(() => {
    'use strict';

    // The state module owns bookkeeping; this file owns prototype wrappers.
    let runtimeScope = null;
    let windowDisplayRemovalHooks = null;
    let windowBaseLifecycleState = null;
    let entryLifecycle = null;
    let conversionScope = null;
    let hasHookInChain = null;

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
            flushWindowRenderReadinessSchedule,
        } = lifecycleState;

        const wrapWindowRefreshPrototype = (prototype) => {
            if (!prototype || typeof prototype.refresh !== 'function') return false;
            if (hasHookInChain(prototype.refresh, '__trWindowRefreshWrapped', true)) return true;
            const originalRefresh = prototype.refresh;
            prototype.refresh = function(...args) {
                const routed = routeWindowConversionMutation(this, 'refresh', args);
                if (routed) return routed.result;
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
                const routed = routeWindowConversionMutation(this, 'open', args);
                if (routed) return routed.result;
                this._uniqueId = this._uniqueId || Math.random().toString(36).substring(2, 11);
                const existing = windowRegistry.get(this);
                const data = existing || createWindowData(this, true);
                data.isOpen = true;
                if (!data.renderReadinessSchedule) data.renderReadinessSchedule = new Map();
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
                const routed = routeWindowConversionMutation(this, 'close', args);
                if (routed) return routed.result;
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
                                    }), {
                                        policy: { kind: 'retired' },
                                    });
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
                if (!data.renderReadinessSchedule) data.renderReadinessSchedule = new Map();
                try { data.renderReadinessSchedule.clear(); } catch (_) {}
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
                const routed = routeWindowConversionMutation(this, 'hide', args);
                if (routed) return routed.result;
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
                const routed = routeWindowConversionMutation(this, 'show', args);
                if (routed) return routed.result;
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
                const routed = routeWindowConversionMutation(this, 'createContents', args);
                if (routed) return routed.result;
                const result = originalCreateContents.apply(this, args);
                try {
                    const existing = windowRegistry.get(this);
                    const data = existing || createWindowData(
                        this,
                        typeof this.isOpen === 'function' ? this.isOpen() : true
                    );
                    if (!data.renderReadinessSchedule) data.renderReadinessSchedule = new Map();
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

        const wrapWindowConversionOnlyPrototype = (prototype, methodName) => {
            if (!prototype || !methodName || typeof prototype[methodName] !== 'function') return false;
            if (hasHookInChain(prototype[methodName], '__trWindowConversionRouter', true)) return true;
            const original = prototype[methodName];
            prototype[methodName] = createWindowConversionRouter(methodName, original);
            prototype[methodName].__trWindowConversionRouter = true;
            prototype[methodName].__trOriginal = original;
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
                    flushWindowRenderReadinessSchedule(this, 'window-update');
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
            wrapped = wrapWindowConversionOnlyPrototype(prototype, 'setText') || wrapped;
            wrapped = wrapWindowConversionOnlyPrototype(prototype, 'activate') || wrapped;
            wrapped = wrapWindowConversionOnlyPrototype(prototype, 'deactivate') || wrapped;
            wrapped = wrapWindowConversionOnlyPrototype(prototype, 'setBackgroundType') || wrapped;
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
            const WindowBase = runtimeScope && runtimeScope.Window_Base;
            wrapConstructor(WindowBase);
            try {
                Object.getOwnPropertyNames(runtimeScope).forEach((key) => {
                    if (!/^Window_/.test(key)) return;
                    wrapConstructor(runtimeScope[key]);
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
            globalScope: runtimeScope,
            logger,
            windowRegistry,
            unregisterWindow,
            hasHookInChain,
        });
    }

    function routeWindowConversionMutation(receiver, methodName, args) {
        try {
            return conversionScope.tryRouteMutation(receiver, methodName, args || null);
        } catch (_) {
            return null;
        }
    }

    function createWindowConversionRouter(methodName, original) {
        if (conversionScope && typeof conversionScope.createMutationRouter === 'function') {
            const router = conversionScope.createMutationRouter(methodName, original);
            if (typeof router === 'function') return router;
        }
        return function(...args) {
            const routed = routeWindowConversionMutation(this, methodName, args);
            if (routed) return routed.result;
            return original.apply(this, args);
        };
    }

    function logError(logger, message, error) {
        if (logger && typeof logger.error === 'function') {
            try { logger.error(message, error); } catch (_) {}
        }
    }

    LiveTranslatorDefine({
        name: 'hooks.window.baseLifecycle',
        requires: {
            windowLifecycleHelpers: 'hooks.window.lifecycleHelpers',
            windowDisplayRemovalHooksModule: 'hooks.window.displayRemoval',
            windowBaseLifecycleStateModule: 'hooks.window.baseLifecycleState',
            entryLifecycleModule: 'runtime.entryLifecycle',
            conversionScope: 'runtime.conversionScope',
        },
        factory({
            windowLifecycleHelpers,
            windowDisplayRemovalHooksModule,
            windowBaseLifecycleStateModule,
            entryLifecycleModule,
            conversionScope: conversionScopeModule,
        }, { scope }) {
            runtimeScope = scope;
            windowDisplayRemovalHooks = windowDisplayRemovalHooksModule;
            windowBaseLifecycleState = windowBaseLifecycleStateModule;
            entryLifecycle = entryLifecycleModule;
            conversionScope = conversionScopeModule;
            hasHookInChain = windowLifecycleHelpers.hasHookInChain;

            return {
                install: installWindowBaseLifecycleHooks,
            };
        },
    });
})();
