// PIXI display-tree removal hooks for Window lifecycle tracking.
(() => {
    'use strict';

    let displayStateModule = null;
    let lifecycleReasons = null;
    const FRAME_SETTLED_DETACH_TOKEN = 'liveTranslator.windowDetach.frameSettled.v1';

    // PIXI container hooks unregister windows when they leave the display tree without being formally closed.
    function installWindowDisplayRemovalHookGroup(context = {}) {
        const {
            globalScope,
            logger,
            windowRegistry,
            unregisterWindow,
            hasHookInChain,
        } = context;
        const WindowBase = globalScope && globalScope.Window_Base ? globalScope.Window_Base : null;
        if (!globalScope || !WindowBase || !windowRegistry || typeof hasHookInChain !== 'function') return false;
        const displayState = displayStateModule.createDisplayStateService(globalScope);
    
        const unregisterWindowSafely = (windowInstance, reason) => {
                    if (!windowInstance || typeof unregisterWindow !== 'function') return;
                    try {
                        unregisterWindow(windowInstance, reason || lifecycleReasons.WINDOW_UNREGISTERED);
                    } catch (error) {
                        logger.warn('[WindowLifecycle] Window unregister failed.', error);
                    }
                };
        
        const isTrackedWindowInstance = (value) => {
                    if (!value || typeof value !== 'object') return false;
                    try {
                        if (value instanceof WindowBase) return true;
                    } catch (_) {}
                    try {
                        return !!windowRegistry.get(value);
                    } catch (_) {
                        return false;
                    }
                };
        
        const collectWindowTree = (root, output, seen = [], depth = 0) => {
                    if (!root || depth > 128 || seen.indexOf(root) >= 0) return;
                    seen.push(root);
                    if (isTrackedWindowInstance(root)) output.push(root);
                    const children = Array.isArray(root.children) ? root.children.slice() : [];
                    children.forEach((child) => collectWindowTree(child, output, seen, depth + 1));
                };
        
        const hasReparentGuard = (root) => {
                    return !!(root && root._trWindowRegistryReparentDepth > 0);
                };
        
        const hasDestroyGuard = (root) => {
                    return !!(root && root._trWindowRegistryDestroyDepth > 0);
                };
        
        const setReparentGuard = (root, delta) => {
                    if (!root || typeof root !== 'object') return;
                    try {
                        const nextDepth = Math.max(0, (root._trWindowRegistryReparentDepth || 0) + delta);
                        if (nextDepth > 0) {
                            root._trWindowRegistryReparentDepth = nextDepth;
                        } else {
                            delete root._trWindowRegistryReparentDepth;
                        }
                    } catch (_) {}
                };
        
        const setDestroyGuard = (root, delta) => {
                    if (!root || typeof root !== 'object') return;
                    try {
                        const nextDepth = Math.max(0, (root._trWindowRegistryDestroyDepth || 0) + delta);
                        if (nextDepth > 0) {
                            root._trWindowRegistryDestroyDepth = nextDepth;
                        } else {
                            delete root._trWindowRegistryDestroyDepth;
                        }
                    } catch (_) {}
                };

        let pendingDetachToken = 0;
        let pendingDetachFlushScheduled = false;
        let frameSettledDetachHooksInstalled = false;
        const pendingDetachedWindows = new Set();

        const getRegisteredWindowData = (windowInstance) => {
                    if (!windowInstance || !windowRegistry || typeof windowRegistry.get !== 'function') return null;
                    try {
                        return windowRegistry.get(windowInstance) || null;
                    } catch (_) {
                        return null;
                    }
                };

        const setPendingDetachState = (windowInstance, state = null) => {
                    if (!windowInstance || typeof windowInstance !== 'object') return;
                    const windowData = getRegisteredWindowData(windowInstance);
                    try {
                        if (state) {
                            windowInstance._trWindowRegistryPendingDetachToken = state.token;
                            windowInstance._trWindowRegistryPendingDetachRoot = state.root || null;
                            windowInstance._trWindowRegistryPendingDetachReason = state.reason || lifecycleReasons.WINDOW_DETACHED;
                        } else {
                            delete windowInstance._trWindowRegistryPendingDetachToken;
                            delete windowInstance._trWindowRegistryPendingDetachRoot;
                            delete windowInstance._trWindowRegistryPendingDetachReason;
                        }
                    } catch (_) {}
                    if (!windowData) return;
                    try {
                        if (state) {
                            windowData._trPendingDetach = true;
                            windowData._trPendingDetachToken = state.token;
                            windowData._trPendingDetachRoot = state.root || null;
                            windowData._trPendingDetachReason = state.reason || lifecycleReasons.WINDOW_DETACHED;
                        } else {
                            delete windowData._trPendingDetach;
                            delete windowData._trPendingDetachToken;
                            delete windowData._trPendingDetachRoot;
                            delete windowData._trPendingDetachReason;
                        }
                    } catch (_) {}
                };

        const getPendingDetachState = (windowInstance) => {
                    const windowData = getRegisteredWindowData(windowInstance);
                    const dataToken = Number(windowData && windowData._trPendingDetachToken);
                    const windowToken = Number(windowInstance && windowInstance._trWindowRegistryPendingDetachToken);
                    const token = Number.isFinite(dataToken) && dataToken > 0
                        ? dataToken
                        : (Number.isFinite(windowToken) && windowToken > 0 ? windowToken : 0);
                    if (!token) return null;
                    return {
                        token,
                        root: (windowData && windowData._trPendingDetachRoot)
                            || (windowInstance && windowInstance._trWindowRegistryPendingDetachRoot)
                            || windowInstance,
                        reason: (windowData && windowData._trPendingDetachReason)
                            || (windowInstance && windowInstance._trWindowRegistryPendingDetachReason)
                            || lifecycleReasons.WINDOW_DETACHED,
                    };
                };

        const clearPendingDetachedWindow = (windowInstance) => {
                    if (!windowInstance) return;
                    pendingDetachedWindows.delete(windowInstance);
                    setPendingDetachState(windowInstance, null);
                };

        const markAttachedTree = (root) => {
                    if (!root) return;
                    const windows = [];
                    collectWindowTree(root, windows);
                    windows.forEach((windowInstance) => {
                        const windowData = getRegisteredWindowData(windowInstance);
                        if (!windowData) return;
                        try {
                            windowData._trEverAttached = true;
                        } catch (_) {}
                    });
                };

        const isParentChainAttached = (root) => {
                    return displayState.isDisplayObjectAttached(root);
                };

        const isDescendantOf = (candidate, root) => {
                    if (!candidate || !root) return false;
                    let current = candidate;
                    let depth = 0;
                    while (current && depth < 128) {
                        if (current === root) return true;
                        current = current.parent || null;
                        depth += 1;
                    }
                    return false;
                };

        const isPendingWindowStillAttached = (windowInstance, state) => {
                    const root = state && state.root ? state.root : windowInstance;
                    if (root && isDescendantOf(windowInstance, root)) {
                        return isParentChainAttached(root);
                    }
                    return isParentChainAttached(windowInstance);
                };

        const flushPendingDetachedWindows = () => {
                    pendingDetachFlushScheduled = false;
                    const windows = Array.from(pendingDetachedWindows);
                    pendingDetachedWindows.clear();
                    windows.forEach((windowInstance) => {
                        const windowData = getRegisteredWindowData(windowInstance);
                        if (!windowData) {
                            setPendingDetachState(windowInstance, null);
                            return;
                        }
                        const state = getPendingDetachState(windowInstance);
                        if (!state) return;
                        if (isPendingWindowStillAttached(windowInstance, state)) {
                            clearPendingDetachedWindow(windowInstance);
                            return;
                        }
                        setPendingDetachState(windowInstance, null);
                        unregisterWindowSafely(windowInstance, state.reason || lifecycleReasons.WINDOW_DETACHED);
                    });
                };

        const flushPendingDetachedWindowsAtFrameBoundary = () => {
                    if (!pendingDetachFlushScheduled) return;
                    flushPendingDetachedWindows();
                };

        const scheduleMicrotaskDetachFlush = () => {
                    if (pendingDetachFlushScheduled) return;
                    pendingDetachFlushScheduled = true;
                    const run = () => {
                        flushPendingDetachedWindows();
                    };
                    const scopedQueueMicrotask = globalScope && typeof globalScope.queueMicrotask === 'function'
                        ? globalScope.queueMicrotask.bind(globalScope)
                        : null;
                    const scopedPromise = globalScope && globalScope.Promise && typeof globalScope.Promise.resolve === 'function'
                        ? globalScope.Promise
                        : null;
                    const contextPromise = typeof Promise !== 'undefined' && Promise && typeof Promise.resolve === 'function'
                        ? Promise
                        : null;
                    if (scopedQueueMicrotask) {
                        scopedQueueMicrotask(run);
                    } else if (scopedPromise) {
                        scopedPromise.resolve().then(run);
                    } else if (contextPromise) {
                        contextPromise.resolve().then(run);
                    } else {
                        run();
                    }
                };

        const scheduleFrameSettledDetachFlush = () => {
                    if (pendingDetachFlushScheduled) return;
                    pendingDetachFlushScheduled = true;
                    if (frameSettledDetachHooksInstalled || installFrameSettledDetachHooks()) return;

                    // Capability fallback for test shells or unusual engines with no frame hook target.
                    pendingDetachFlushScheduled = false;
                    scheduleMicrotaskDetachFlush();
                };

        const schedulePendingDetachFlush = () => {
                    scheduleFrameSettledDetachFlush();
                };
        
        const markDetachedTreePending = (root, reason) => {
                    if (!root || hasReparentGuard(root)) return;
                    const windows = [];
                    collectWindowTree(root, windows);
                    windows.forEach((windowInstance) => {
                        if (!getRegisteredWindowData(windowInstance)) return;
                        const token = ++pendingDetachToken;
                        setPendingDetachState(windowInstance, {
                            token,
                            root,
                            reason: reason || lifecycleReasons.WINDOW_DETACHED,
                        });
                        pendingDetachedWindows.add(windowInstance);
                    });
                    if (pendingDetachedWindows.size > 0) schedulePendingDetachFlush();
                };

        const clearPendingDetachedTree = (root) => {
                    if (!root) return;
                    const windows = [];
                    collectWindowTree(root, windows);
                    windows.forEach(clearPendingDetachedWindow);
                };

        const retireWindowTree = (root, reason) => {
                    if (!root) return;
                    const windows = [];
                    collectWindowTree(root, windows);
                    windows.forEach((windowInstance) => {
                        if (!getRegisteredWindowData(windowInstance)) return;
                        clearPendingDetachedWindow(windowInstance);
                        unregisterWindowSafely(windowInstance, reason || lifecycleReasons.WINDOW_UNREGISTERED);
                    });
                };

        const installSceneTerminationHooks = () => {
                    const SceneBase = globalScope.Scene_Base || null;
                    const prototype = SceneBase && SceneBase.prototype ? SceneBase.prototype : null;
                    if (!prototype || typeof prototype.terminate !== 'function') return false;
                    if (hasHookInChain(prototype.terminate, '__trWindowRegistrySceneTerminateWrapped', true)) return true;

                    const originalTerminate = prototype.terminate;
                    prototype.terminate = function(...args) {
                        let result;
                        try {
                            result = originalTerminate.apply(this, args);
                        } finally {
                            // Scene swaps can retire an entire rendered root without any
                            // PIXI removeChild/destroy call on its windows.
                            retireWindowTree(this, lifecycleReasons.SCENE_TERMINATED);
                        }
                        return result;
                    };
                    prototype.terminate.__trWindowRegistrySceneTerminateWrapped = true;
                    prototype.terminate.__trOriginal = originalTerminate;
                    return true;
                };

        const installSceneManagerChangeHooks = () => {
                    const sceneManager = globalScope.SceneManager || null;
                    if (!sceneManager || typeof sceneManager.changeScene !== 'function') return false;
                    if (hasHookInChain(sceneManager.changeScene, '__trWindowRegistrySceneManagerChangeWrapped', true)) return true;

                    const originalChangeScene = sceneManager.changeScene;
                    sceneManager.changeScene = function(...args) {
                        const previousScene = this && this._scene ? this._scene : null;
                        const result = originalChangeScene.apply(this, args);
                        const currentScene = this && this._scene ? this._scene : null;
                        if (previousScene && previousScene !== currentScene) {
                            retireWindowTree(previousScene, lifecycleReasons.SCENE_TERMINATED);
                        }
                        return result;
                    };
                    sceneManager.changeScene.__trWindowRegistrySceneManagerChangeWrapped = true;
                    sceneManager.changeScene.__trOriginal = originalChangeScene;
                    return true;
                };

        const installFrameSettledDetachHooks = () => {
                    if (frameSettledDetachHooksInstalled) return true;
                    let installed = false;
                    const sceneManager = globalScope.SceneManager || null;
                    const graphics = globalScope.Graphics || null;
                    try { installed = installFrameSettledDetachHook(sceneManager, 'updateScene') || installed; } catch (_) {}
                    try { installed = installFrameSettledDetachHook(sceneManager, 'updateMain') || installed; } catch (_) {}
                    try { installed = installFrameSettledDetachHook(graphics, 'render') || installed; } catch (_) {}
                    frameSettledDetachHooksInstalled = installed;
                    return installed;
                };

        const installFrameSettledDetachHook = (target, methodName) => {
                    if (!target || typeof target[methodName] !== 'function') return false;
                    if (hasHookInChain(target[methodName], '__trWindowRegistryFrameSettledDetachWrapped', FRAME_SETTLED_DETACH_TOKEN)) return true;
                    const original = target[methodName];
                    target[methodName] = function(...args) {
                        let result;
                        try {
                            result = original.apply(this, args);
                        } finally {
                            flushPendingDetachedWindowsAtFrameBoundary();
                        }
                        return result;
                    };
                    target[methodName].__trWindowRegistryFrameSettledDetachWrapped = FRAME_SETTLED_DETACH_TOKEN;
                    target[methodName].__trOriginal = original;
                    return true;
                };
        
        const installWindowDisplayRemovalHooks = () => {
                    const pixi = globalScope.PIXI || null;
                    const Container = pixi && pixi.Container ? pixi.Container : null;
                    const prototype = Container && Container.prototype ? Container.prototype : null;
                    if (!prototype) return false;
        
                    const markMovingChildren = (children, targetParent) => {
                        const moving = [];
                        children.forEach((child) => {
                            if (child && child.parent && child.parent !== targetParent) {
                                moving.push(child);
                                setReparentGuard(child, 1);
                            }
                        });
                        return moving;
                    };
                    const unmarkMovingChildren = (children, targetParent) => {
                        children.forEach((child) => {
                            setReparentGuard(child, -1);
                            if (child && child.parent === targetParent) {
                                clearPendingDetachedTree(child);
                            } else if (child) {
                                markDetachedTreePending(child, lifecycleReasons.WINDOW_DETACHED);
                            }
                        });
                    };
                    const wrapAddMethod = (methodName) => {
                        const original = prototype[methodName];
                        if (typeof original !== 'function') return;
                        const property = `__trWindowRegistry${methodName}Wrapped`;
                        if (hasHookInChain(original, property, true)) return;
                        prototype[methodName] = function(...args) {
                            const children = methodName === 'addChildAt' ? [args[0]] : args;
                            const moving = markMovingChildren(children, this);
                            try {
                                return original.apply(this, args);
                            } finally {
                                unmarkMovingChildren(moving, this);
                                children.forEach((child) => {
                                    if (child && child.parent === this) {
                                        clearPendingDetachedTree(child);
                                        markAttachedTree(child);
                                    }
                                });
                            }
                        };
                        prototype[methodName][property] = true;
                        prototype[methodName].__trOriginal = original;
                    };
                    const wrapRemoveChild = () => {
                        const original = prototype.removeChild;
                        if (typeof original !== 'function') return;
                        if (hasHookInChain(original, '__trWindowRegistryRemoveChildWrapped', true)) return;
                        prototype.removeChild = function(...children) {
                            const result = original.apply(this, children);
                            if (hasDestroyGuard(this)) return result;
                            children.forEach((child) => {
                                if (child && child.parent !== this) markDetachedTreePending(child, lifecycleReasons.WINDOW_DETACHED);
                            });
                            return result;
                        };
                        prototype.removeChild.__trWindowRegistryRemoveChildWrapped = true;
                        prototype.removeChild.__trOriginal = original;
                    };
                    const wrapRemoveChildAt = () => {
                        const original = prototype.removeChildAt;
                        if (typeof original !== 'function') return;
                        if (hasHookInChain(original, '__trWindowRegistryRemoveChildAtWrapped', true)) return;
                        prototype.removeChildAt = function(index, ...rest) {
                            const child = Array.isArray(this.children) ? this.children[index] : null;
                            const result = original.call(this, index, ...rest);
                            if (!hasDestroyGuard(this)) markDetachedTreePending(result || child, lifecycleReasons.WINDOW_DETACHED);
                            return result;
                        };
                        prototype.removeChildAt.__trWindowRegistryRemoveChildAtWrapped = true;
                        prototype.removeChildAt.__trOriginal = original;
                    };
                    const wrapRemoveChildren = () => {
                        const original = prototype.removeChildren;
                        if (typeof original !== 'function') return;
                        if (hasHookInChain(original, '__trWindowRegistryRemoveChildrenWrapped', true)) return;
                        prototype.removeChildren = function(beginIndex, endIndex, ...rest) {
                            const children = Array.isArray(this.children) ? this.children : [];
                            const start = Number.isFinite(Number(beginIndex)) ? Number(beginIndex) : 0;
                            const end = Number.isFinite(Number(endIndex)) ? Number(endIndex) : children.length;
                            const before = children.slice(start, end);
                            const result = original.call(this, beginIndex, endIndex, ...rest);
                            if (!hasDestroyGuard(this)) {
                                const removed = Array.isArray(result) && result.length > 0 ? result : before;
                                removed.forEach((child) => markDetachedTreePending(child, lifecycleReasons.WINDOW_DETACHED));
                            }
                            return result;
                        };
                        prototype.removeChildren.__trWindowRegistryRemoveChildrenWrapped = true;
                        prototype.removeChildren.__trOriginal = original;
                    };
                    const wrapDestroy = () => {
                        const original = prototype.destroy;
                        if (typeof original !== 'function') return;
                        if (hasHookInChain(original, '__trWindowRegistryDestroyWrapped', true)) return;
                        prototype.destroy = function(...args) {
                            const windows = [];
                            collectWindowTree(this, windows);
                            setDestroyGuard(this, 1);
                            try {
                                return original.apply(this, args);
                            } finally {
                                setDestroyGuard(this, -1);
                                windows.forEach((windowInstance) => {
                                    clearPendingDetachedWindow(windowInstance);
                                    unregisterWindowSafely(windowInstance, lifecycleReasons.WINDOW_DESTROYED);
                                });
                            }
                        };
                        prototype.destroy.__trWindowRegistryDestroyWrapped = true;
                        prototype.destroy.__trOriginal = original;
                    };
        
                    wrapAddMethod('addChild');
                    wrapAddMethod('addChildAt');
                    wrapRemoveChild();
                    wrapRemoveChildAt();
                    wrapRemoveChildren();
                    wrapDestroy();
                    installSceneTerminationHooks();
                    installSceneManagerChangeHooks();
                    installFrameSettledDetachHooks();
                    return true;
                };
    
        return installWindowDisplayRemovalHooks();
    }
    
    LiveTranslatorDefine({
        name: 'hooks.window.displayRemoval',
        requires: {
            displayState: 'runtime.displayState',
            lifecycleReasonsModule: 'runtime.lifecycleReasons',
        },
        factory({ displayState, lifecycleReasonsModule }) {
            displayStateModule = displayState;
            lifecycleReasons = lifecycleReasonsModule.reasons;

            return {
                install: installWindowDisplayRemovalHookGroup,
            };
        },
    });

})();
