// PIXI adapter lifecycle/removal controller.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/pixi-text/lifecycle-controller.js.');
    }

    // Display-object removal hooks and local state retirement for PIXI text.
    function createPixiLifecycleController(context = {}) {
        const {
            adapterContract,
            objectsByItemId,
            watchedObjects,
            getState,
            isStateActive,
            exposeDebugState,
            hasHookInChain,
            snapshotRemovedChildren,
            DESTROY_HOOK_TOKEN,
            REMOVAL_HOOK_TOKEN,
        } = context;
    
        function installTextDestroyHook(Ctor, label) {
                    if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.destroy !== 'function') return false;
                    if (hasHookInChain(Ctor.prototype.destroy, '__trPixiTextDestroyWrapped', DESTROY_HOOK_TOKEN)) return true;
                    const originalDestroy = Ctor.prototype.destroy;
                    const wrapped = function(...args) {
                        retireTree(this, 'pixi-text-destroyed', label, 'removed');
                        return originalDestroy.apply(this, args);
                    };
                    wrapped.__trOriginal = originalDestroy;
                    wrapped.__trPixiTextDestroyWrapped = DESTROY_HOOK_TOKEN;
                    Ctor.prototype.destroy = wrapped;
                    return true;
                }
        
        function installContainerRemovalHooks(Ctor) {
                    if (!Ctor || !Ctor.prototype) return false;
                    let installed = false;
        
                    if (typeof Ctor.prototype.removeChild === 'function'
                        && !hasHookInChain(Ctor.prototype.removeChild, '__trPixiTextRemovalWrapped', REMOVAL_HOOK_TOKEN)) {
                        const originalRemoveChild = Ctor.prototype.removeChild;
                        const wrapped = function(...children) {
                            const result = originalRemoveChild.apply(this, children);
                            children.forEach((child) => retireTree(child, 'pixi-text-removed', '', 'removed'));
                            return result;
                        };
                        wrapped.__trOriginal = originalRemoveChild;
                        wrapped.__trPixiTextRemovalWrapped = REMOVAL_HOOK_TOKEN;
                        Ctor.prototype.removeChild = wrapped;
                        installed = true;
                    }
        
                    if (typeof Ctor.prototype.removeChildAt === 'function'
                        && !hasHookInChain(Ctor.prototype.removeChildAt, '__trPixiTextRemovalWrapped', REMOVAL_HOOK_TOKEN)) {
                        const originalRemoveChildAt = Ctor.prototype.removeChildAt;
                        const wrapped = function(index) {
                            const child = this && Array.isArray(this.children) ? this.children[index] : null;
                            const result = originalRemoveChildAt.apply(this, arguments);
                            retireTree(child || result, 'pixi-text-removed', '', 'removed');
                            return result;
                        };
                        wrapped.__trOriginal = originalRemoveChildAt;
                        wrapped.__trPixiTextRemovalWrapped = REMOVAL_HOOK_TOKEN;
                        Ctor.prototype.removeChildAt = wrapped;
                        installed = true;
                    }
        
                    if (typeof Ctor.prototype.removeChildren === 'function'
                        && !hasHookInChain(Ctor.prototype.removeChildren, '__trPixiTextRemovalWrapped', REMOVAL_HOOK_TOKEN)) {
                        const originalRemoveChildren = Ctor.prototype.removeChildren;
                        const wrapped = function(...args) {
                            const removed = snapshotRemovedChildren(this, args);
                            const result = originalRemoveChildren.apply(this, args);
                            const children = Array.isArray(result) && result.length ? result : removed;
                            children.forEach((child) => retireTree(child, 'pixi-text-removed', '', 'removed'));
                            return result;
                        };
                        wrapped.__trOriginal = originalRemoveChildren;
                        wrapped.__trPixiTextRemovalWrapped = REMOVAL_HOOK_TOKEN;
                        Ctor.prototype.removeChildren = wrapped;
                        installed = true;
                    }
        
                    if (typeof Ctor.prototype.destroy === 'function'
                        && !hasHookInChain(Ctor.prototype.destroy, '__trPixiTextRemovalWrapped', REMOVAL_HOOK_TOKEN)) {
                        const originalDestroy = Ctor.prototype.destroy;
                        const wrapped = function(...args) {
                            retireTree(this, 'pixi-container-destroyed', '', 'removed');
                            return originalDestroy.apply(this, args);
                        };
                        wrapped.__trOriginal = originalDestroy;
                        wrapped.__trPixiTextRemovalWrapped = REMOVAL_HOOK_TOKEN;
                        Ctor.prototype.destroy = wrapped;
                        installed = true;
                    }
        
                    return installed;
                }
        
        function retireTree(displayObject, reason, labelHint, status) {
                    if (!displayObject) return;
                    retireCurrentItem(displayObject, reason, labelHint, status);
                    const children = Array.isArray(displayObject.children) ? displayObject.children.slice() : [];
                    children.forEach((child) => retireTree(child, reason, labelHint, status));
                }
        
        function retireCurrentItem(displayObject, reason, labelHint = '', status = 'disappeared') {
                    const state = getState(displayObject);
                    if (!state || !state.itemId) return false;
                    if (!isStateActive(state)) {
                        clearItemState(displayObject, reason);
                        return false;
                    }
        
                    const details = {
                        windowType: labelHint || state.label || 'PIXI.Text',
                    };
                    adapterContract.retireItem(state, status, {
                        eventType: status === 'stale' ? 'item.replaced' : `item.${status}`,
                        message: reason,
                        details,
                    });
                    clearItemState(displayObject, reason);
                    return true;
                }
        
        function clearItemState(displayObject, reason, options = {}) {
                    const state = getState(displayObject);
                    if (!state) return;
                    if (state.itemId) objectsByItemId.delete(state.itemId);
                    if (options.invalidate !== false) state.surfaceRevision += 1;
                    state.itemId = '';
                    state.payload = null;
                    state.codecState = null;
                    state.originalText = '';
                    state.translationSource = '';
                    state.normalizedSource = '';
                    state.renderedText = '';
                    state.priority = null;
                    state.visible = false;
                    state.screenState = 'inactive';
                    watchedObjects.delete(displayObject);
                    exposeDebugState(displayObject, state);
                }
    
        return {
            clearItemState,
            installContainerRemovalHooks,
            installTextDestroyHook,
            retireCurrentItem,
            retireTree,
        };
    }
    
    defineRuntimeModule('adapters.pixiTextLifecycleController', {
        create: createPixiLifecycleController,
    });

})();
