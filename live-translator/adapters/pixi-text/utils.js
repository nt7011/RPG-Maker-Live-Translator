// Shared PIXI adapter constants and stateless helpers.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/pixi-text/utils.js.');
    }

    // Constants and pure helpers shared by the PIXI adapter split files.
    const ADAPTER_ID = 'pixi';
    const SURFACE_TYPE = 'pixi';
    const RENDER_STRATEGY = 'pixiTextSetter';
    const PRIORITY_VISIBLE = 750;
    const PRIORITY_DETACHED = 250;
    const PRIORITY_HIDDEN = 100;
    const FRAME_HOOK_TOKEN = 'liveTranslator.pixiTextVisibility.v2';
    const SETTER_HOOK_TOKEN = 'liveTranslator.pixiTextSetter.v2';
    const REMOVAL_HOOK_TOKEN = 'liveTranslator.pixiTextRemoval.v2';
    const DESTROY_HOOK_TOKEN = 'liveTranslator.pixiTextDestroy.v2';
    
    function hasHookInChain(fn, property, token) {
                const seen = [];
                let current = typeof fn === 'function' ? fn : null;
                while (current && seen.indexOf(current) < 0) {
                    if (current[property] === token) return true;
                    seen.push(current);
                    current = typeof current.__trOriginal === 'function' ? current.__trOriginal : null;
                }
                return false;
            }
    
    function isDisplayObjectRenderable(displayObject) {
                if (!displayObject || displayObject._destroyed) return false;
                if (!displayObject.parent) return false;
                if (displayObject.visible === false || displayObject.renderable === false) return false;
                if (!hasPositiveOpacity(displayObject)) return false;
    
                let child = displayObject;
                let parent = displayObject.parent || null;
                while (parent) {
                    if (parent._destroyed || parent.visible === false || parent.renderable === false) return false;
                    if (!hasPositiveOpacity(parent)) return false;
                    const children = Array.isArray(parent.children) ? parent.children : null;
                    if (children && children.indexOf(child) < 0) return false;
                    child = parent;
                    parent = parent.parent || null;
                }
                return true;
            }
    
    function hasPositiveOpacity(displayObject) {
                const alpha = Number(displayObject && displayObject.alpha);
                if (Number.isFinite(alpha) && alpha <= 0) return false;
                const opacity = Number(displayObject && displayObject.opacity);
                if (Number.isFinite(opacity) && opacity <= 0) return false;
                return true;
            }
    
    function resolvePriority(displayObject, renderable = null) {
                if (!displayObject || displayObject._destroyed) return PRIORITY_HIDDEN;
                if (!displayObject.parent) return PRIORITY_DETACHED;
                const visible = renderable === null ? isDisplayObjectRenderable(displayObject) : renderable;
                return visible ? PRIORITY_VISIBLE : PRIORITY_HIDDEN;
            }
    
    function screenStateFor(displayObject, renderable) {
                if (!displayObject || displayObject._destroyed) return 'destroyed';
                if (renderable) return 'visible';
                if (!displayObject.parent) return 'detached';
                return 'hidden';
            }
    
    function priorityReason(screenState) {
                if (screenState === 'visible') return 'pixi-text-visible';
                if (screenState === 'detached') return 'pixi-text-detached';
                return 'pixi-text-hidden';
            }
    
    function snapshotRemovedChildren(container, args) {
                try {
                    const children = Array.isArray(container && container.children) ? container.children : [];
                    const begin = Number.isFinite(Number(args[0])) ? Number(args[0]) : 0;
                    const end = Number.isFinite(Number(args[1])) ? Number(args[1]) : children.length;
                    return children.slice(begin, end);
                } catch (_) {
                    return [];
                }
            }
    
    function findDescriptor(proto, prop) {
                let cursor = proto;
                while (cursor && cursor !== Object.prototype) {
                    const desc = Object.getOwnPropertyDescriptor(cursor, prop);
                    if (desc) return { owner: cursor, desc };
                    cursor = Object.getPrototypeOf(cursor);
                }
                return null;
            }
    
    function safeCall(callback) {
                try {
                    return callback();
                } catch (_) {
                    return null;
                }
            }
    
    function stringifyText(value) {
                try {
                    return String(value);
                } catch (_) {
                    return '';
                }
            }
    
    function errorMessage(error) {
                return error && error.message ? error.message : String(error || 'translation error');
            }
    
    function inferLabel(displayObject) {
                return displayObject && displayObject.constructor && displayObject.constructor.name
                    ? displayObject.constructor.name
                    : 'PIXI.Text';
            }
    
    function resolveScalePercent(settings, resolveTextScalePercent) {
            if (typeof resolveTextScalePercent === 'function') {
                return resolveTextScalePercent(settings, 'textScaleOthers', 100);
            }
            return 100;
        }
    
    function hasRequiredOrchestrator(adapterContract) {
            return !!(adapterContract
                && typeof adapterContract.hasRequiredMethods === 'function'
                && adapterContract.hasRequiredMethods([
                    'observeRecord',
                    'requestItemTranslation',
                    'cancelItemTranslation',
                    'setItemTranslationPriority',
                    'setItemVisibility',
                    'retireItem',
                    'updateItem',
                    'subscribeRecords',
                ]));
        }
    
    defineRuntimeModule('adapters.pixiTextUtils', {
        ADAPTER_ID,
        DESTROY_HOOK_TOKEN,
        FRAME_HOOK_TOKEN,
        PRIORITY_DETACHED,
        PRIORITY_HIDDEN,
        PRIORITY_VISIBLE,
        REMOVAL_HOOK_TOKEN,
        RENDER_STRATEGY,
        SETTER_HOOK_TOKEN,
        SURFACE_TYPE,
        errorMessage,
        findDescriptor,
        hasHookInChain,
        hasPositiveOpacity,
        hasRequiredOrchestrator,
        inferLabel,
        isDisplayObjectRenderable,
        priorityReason,
        resolvePriority,
        resolveScalePercent,
        safeCall,
        screenStateFor,
        snapshotRemovedChildren,
        stringifyText,
    });

})();
