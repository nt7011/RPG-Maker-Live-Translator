// PIXI text visibility controller.
//
// PIXI versions used by RPG Maker do not share one visibility-change event, so
// this controller polls watched display objects from stable frame hooks.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/pixi-text/visibility-controller.js.');
    }

    function create(options = {}) {
        const {
            adapterContract,
            watchedObjects,
            globalScope: runtimeGlobalScope,
            getState,
            retireCurrentItem,
            exposeDebugState,
            isDisplayObjectRenderable,
            resolvePriority,
            screenStateFor,
            priorityReason,
            hasHookInChain,
            FRAME_HOOK_TOKEN,
        } = options;

        function isStateActive(state) {
            return !!(state
                && state.itemId
                && adapterContract
                && typeof adapterContract.isRecordActive === 'function'
                && adapterContract.isRecordActive(state));
        }

        function refreshVisibility(displayObject) {
            const state = getState(displayObject);
            if (!displayObject || !state || !state.itemId || !isStateActive(state)) {
                if (displayObject) watchedObjects.delete(displayObject);
                return;
            }

            if (displayObject._destroyed) {
                retireCurrentItem(displayObject, 'pixi-text-destroyed', state.label, 'removed');
                return;
            }

            const renderable = isDisplayObjectRenderable(displayObject);
            const priority = resolvePriority(displayObject, renderable);
            const screenState = screenStateFor(displayObject, renderable);

            if (state.priority !== priority) {
                state.priority = priority;
                adapterContract.setItemTranslationPriority(state, priority, priorityReason(screenState));
            }

            if (state.visible !== renderable || state.screenState !== screenState) {
                state.visible = renderable;
                state.screenState = screenState;
                adapterContract.setItemVisibility(state, renderable, {
                    reason: priorityReason(screenState),
                    screenState,
                    windowType: state.label,
                });
            }
            exposeDebugState(displayObject, state);
        }

        function sweepVisibility() {
            if (!watchedObjects.size) return;
            Array.from(watchedObjects).forEach((displayObject) => {
                try { refreshVisibility(displayObject); } catch (_) {}
            });
        }

        function installVisibilityFrameHooks() {
            let installed = false;
            try { installed = installFrameHook(runtimeGlobalScope.SceneManager, 'updateScene') || installed; } catch (_) {}
            try { installed = installFrameHook(runtimeGlobalScope.Graphics, 'render') || installed; } catch (_) {}
            return installed;
        }

        function installFrameHook(target, methodName) {
            if (!target || typeof target[methodName] !== 'function') return false;
            if (hasHookInChain(target[methodName], '__trPixiTextVisibilityWrapped', FRAME_HOOK_TOKEN)) return true;
            const original = target[methodName];
            const wrapped = function(...args) {
                const result = original.apply(this, args);
                sweepVisibility();
                return result;
            };
            wrapped.__trOriginal = original;
            wrapped.__trPixiTextVisibilityWrapped = FRAME_HOOK_TOKEN;
            target[methodName] = wrapped;
            return true;
        }

        return {
            isStateActive,
            refreshVisibility,
            sweepVisibility,
            installVisibilityFrameHooks,
            installFrameHook,
        };
    }

    defineRuntimeModule('adapters.pixiTextVisibilityController', { create });
})();
