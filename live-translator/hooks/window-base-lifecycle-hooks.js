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
    const { hasHookInChain } = windowLifecycleHelpers;

    function installWindowBaseLifecycleHooks(context) {
        const {
            logger,
            windowRegistry,
            addWindowToRegistry,
            unregisterWindow,
        } = context;
        const lifecycleState = windowBaseLifecycleState.create(context);
        const {
            createWindowData,
            isWindowEntryActive,
            retireWindowEntry,
            rejectWindowPendingRender,
            syncWindowTextScreenState,
            commitPendingWindowEntryStaleRecords,
            withWindowRefreshDepth,
            unregisterWindowSafely,
            flushPendingWindowRedraws,
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

        const installWindowRefreshHooks = () => {
            const seen = new Set();
            const wrapConstructor = (ctor) => {
                if (!ctor || typeof ctor !== 'function' || !ctor.prototype) return;
                const prototype = ctor.prototype;
                if (seen.has(prototype)) return;
                seen.add(prototype);
                wrapWindowRefreshPrototype(prototype);
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
        windowDisplayRemovalHooks.install({
            globalScope,
            logger,
            windowRegistry,
            unregisterWindow,
            hasHookInChain,
        });

        if (typeof Window_Base.prototype.open === 'function'
            && !hasHookInChain(Window_Base.prototype.open, '__trWindowLifecycleWrapped', true)) {
            const originalWindowOpen = Window_Base.prototype.open;
            Window_Base.prototype.open = function(...args) {
                this._uniqueId = this._uniqueId || Math.random().toString(36).substring(2, 11);
                const existing = windowRegistry.get(this);
                const data = existing || createWindowData(this, true);
                data.isOpen = true;
                if (!data.pendingRedraws) data.pendingRedraws = new Map();
                addWindowToRegistry(this, data);
                const result = originalWindowOpen.apply(this, args);
                syncWindowTextScreenState(this, 'window-opened');
                return result;
            };
            Window_Base.prototype.open.__trWindowLifecycleWrapped = true;
            Window_Base.prototype.open.__trOriginal = originalWindowOpen;
        }

        if (typeof Window_Base.prototype.close === 'function'
            && !hasHookInChain(Window_Base.prototype.close, '__trWindowLifecycleWrapped', true)) {
            const originalWindowClose = Window_Base.prototype.close;
            Window_Base.prototype.close = function(...args) {
                const existing = windowRegistry.get(this);
                const data = existing || createWindowData(this, false);
                data.isOpen = false;
                if (data.texts && typeof data.texts.forEach === 'function') {
                    try {
                        data.texts.forEach((entry) => {
                            if (isWindowEntryActive(entry)) {
                                entry._trStale = true;
                                entry.canceledReason = 'window-closed';
                                entry.canceledAt = Date.now();
                                rejectWindowPendingRender(entry, 'window-closed', {
                                    windowType: data.windowType || (this && this.constructor ? this.constructor.name : ''),
                                });
                                retireWindowEntry(entry, 'window-closed', {
                                    windowType: data.windowType || (this && this.constructor ? this.constructor.name : ''),
                                });
                            }
                        });
                        data.texts.clear();
                    } catch (_) {}
                }
                if (!data.pendingRedraws) data.pendingRedraws = new Map();
                try { data.pendingRedraws.clear(); } catch (_) {}
                windowRegistry.set(this, data);
                return originalWindowClose.apply(this, args);
            };
            Window_Base.prototype.close.__trWindowLifecycleWrapped = true;
            Window_Base.prototype.close.__trOriginal = originalWindowClose;
        }

        if (typeof Window_Base.prototype.destroy === 'function'
            && !hasHookInChain(Window_Base.prototype.destroy, '__trWindowLifecycleWrapped', true)) {
            const originalWindowDestroy = Window_Base.prototype.destroy;
            Window_Base.prototype.destroy = function(...args) {
                unregisterWindowSafely(this, 'window-destroyed');
                return originalWindowDestroy.apply(this, args);
            };
            Window_Base.prototype.destroy.__trWindowLifecycleWrapped = true;
            Window_Base.prototype.destroy.__trOriginal = originalWindowDestroy;
        }

        if (typeof Window_Base.prototype.hide === 'function'
            && !hasHookInChain(Window_Base.prototype.hide, '__trWindowLifecycleWrapped', true)) {
            const originalWindowHide = Window_Base.prototype.hide;
            Window_Base.prototype.hide = function(...args) {
                const result = originalWindowHide.apply(this, args);
                syncWindowTextScreenState(this, 'window-hidden');
                return result;
            };
            Window_Base.prototype.hide.__trWindowLifecycleWrapped = true;
            Window_Base.prototype.hide.__trOriginal = originalWindowHide;
        }

        if (typeof Window_Base.prototype.show === 'function'
            && !hasHookInChain(Window_Base.prototype.show, '__trWindowLifecycleWrapped', true)) {
            const originalWindowShow = Window_Base.prototype.show;
            Window_Base.prototype.show = function(...args) {
                const result = originalWindowShow.apply(this, args);
                syncWindowTextScreenState(this, 'window-shown');
                return result;
            };
            Window_Base.prototype.show.__trWindowLifecycleWrapped = true;
            Window_Base.prototype.show.__trOriginal = originalWindowShow;
        }

        if (typeof Window_Base.prototype.createContents === 'function'
            && !hasHookInChain(Window_Base.prototype.createContents, '__trWindowLifecycleWrapped', true)) {
            const originalCreateContents = Window_Base.prototype.createContents;
            Window_Base.prototype.createContents = function(...args) {
                const result = originalCreateContents.apply(this, args);
                try {
                    const existing = windowRegistry.get(this);
                    const data = existing || createWindowData(
                        this,
                        typeof this.isOpen === 'function' ? this.isOpen() : true
                    );
                    if (!data.pendingRedraws) data.pendingRedraws = new Map();
                    if (!data.recentlyRedrawn) data.recentlyRedrawn = new Map();
                    addWindowToRegistry(this, data);
                } catch (error) {
                    logError(logger, '[Window_Base.createContents Hook Error]', error);
                }
                return result;
            };
            Window_Base.prototype.createContents.__trWindowLifecycleWrapped = true;
            Window_Base.prototype.createContents.__trOriginal = originalCreateContents;
        }

        if (typeof Window_Base.prototype.update === 'function'
            && !hasHookInChain(Window_Base.prototype.update, '__trWindowLifecycleWrapped', true)) {
            const originalWindowUpdate = Window_Base.prototype.update;
            Window_Base.prototype.update = function(...args) {
                const result = originalWindowUpdate.apply(this, args);
                try {
                    commitPendingWindowEntryStaleRecords(this, windowRegistry.get(this), 'window-update-commit');
                    flushPendingWindowRedraws(this);
                    syncWindowTextScreenState(this, 'window-update');
                } catch (error) {
                    logError(logger, '[Window_Base.update Hook Error]', error);
                }
                return result;
            };
            Window_Base.prototype.update.__trWindowLifecycleWrapped = true;
            Window_Base.prototype.update.__trOriginal = originalWindowUpdate;
        }
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
