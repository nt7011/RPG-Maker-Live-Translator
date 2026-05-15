// Sprite text adapter support: overlay sprite.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/overlay-sprite.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            finiteNumber,
            isChildInParent,
            isSpriteSourceRenderableNow,
            readFrameKey,
            updateEntryVisibility,
        } = Object.fromEntries([
            'finiteNumber',
            'isChildInParent',
            'isSpriteSourceRenderableNow',
            'readFrameKey',
            'updateEntryVisibility',
        ].map((name) => [name, callScope(name)]));

        /**
         * Create a Sprite for translated overlay output.
         */
        function createOverlaySprite() {
            try {
                const overlay = new Sprite();
                overlay._trSpriteTextObserverBypass = true;
                installOverlayRenderGuard(overlay);
                return overlay;
            } catch (_) {
                return null;
            }
        }
        
        /**
         * Prevent overlays from rendering when their source is no longer renderable.
         */
        function installOverlayRenderGuard(overlay) {
            if (!overlay || overlay._trSpriteTextRenderGuard === scope.RENDER_GUARD_TOKEN) return;
            ['render', 'renderWebGL', 'renderCanvas'].forEach((methodName) => {
                const current = overlay[methodName];
                if (typeof current !== 'function') return;
                const original = current;
                const wrapped = function(...args) {
                    try {
                        if (typeof this._trSpriteTextShouldRender === 'function' && !this._trSpriteTextShouldRender()) return undefined;
                    } catch (_) {
                        return undefined;
                    }
                    return original.apply(this, args);
                };
                wrapped.__trOriginal = original;
                overlay[methodName] = wrapped;
            });
            overlay._trSpriteTextRenderGuard = scope.RENDER_GUARD_TOKEN;
        }
        
        /**
         * Copy Sprite transform and visual fields from source to overlay.
         */
        function copySpriteVisualState(source, overlay) {
            if (!source || !overlay) return;
            try {
                overlay.x = finiteNumber(source.x, 0);
                overlay.y = finiteNumber(source.y, 0);
                if (Number.isFinite(Number(source.opacity))) overlay.opacity = source.opacity;
                if (Number.isFinite(Number(source.alpha))) overlay.alpha = source.alpha;
                if (source.blendMode !== undefined) overlay.blendMode = source.blendMode;
                if (source.tint !== undefined) overlay.tint = source.tint;
                copySpriteColorEffects(source, overlay);
                if (Number.isFinite(Number(source.rotation))) overlay.rotation = source.rotation;
                if (source.z !== undefined) overlay.z = source.z;
                if (source.zIndex !== undefined) overlay.zIndex = source.zIndex;
                if (overlay.scale && source.scale) {
                    overlay.scale.x = Number.isFinite(Number(source.scale.x)) ? source.scale.x : overlay.scale.x;
                    overlay.scale.y = Number.isFinite(Number(source.scale.y)) ? source.scale.y : overlay.scale.y;
                }
                if (overlay.anchor && source.anchor) {
                    overlay.anchor.x = Number.isFinite(Number(source.anchor.x)) ? source.anchor.x : 0;
                    overlay.anchor.y = Number.isFinite(Number(source.anchor.y)) ? source.anchor.y : 0;
                }
                overlay.visible = source.visible !== false;
                overlay.renderable = true;
            } catch (_) {}
        }
        
        /**
         * Copy RPG Maker Sprite color effects without refreshing when values did not change.
         */
        function copySpriteColorEffects(source, overlay) {
            copySpriteColorEffect(source, overlay, '_blendColor', 'getBlendColor', 'setBlendColor');
            copySpriteColorEffect(source, overlay, '_colorTone', 'getColorTone', 'setColorTone');
        }
        
        /**
         * Copy one array-backed visual effect from source to overlay.
         */
        function copySpriteColorEffect(source, overlay, fieldName, getterName, setterName) {
            const value = readSpriteVisualArray(source, fieldName, getterName);
            if (!value || visualArraysEqual(overlay && overlay[fieldName], value)) return;
            if (overlay && typeof overlay[setterName] === 'function') {
                try {
                    overlay[setterName](value);
                    return;
                } catch (_) {}
            }
            const cloned = cloneVisualArray(value);
            if (overlay && cloned) overlay[fieldName] = cloned;
        }
        
        /**
         * Read a Sprite visual effect array, preferring the field to avoid getter clones.
         */
        function readSpriteVisualArray(sprite, fieldName, getterName) {
            if (!sprite) return null;
            if (Array.isArray(sprite[fieldName])) return sprite[fieldName];
            if (typeof sprite[getterName] === 'function') {
                try {
                    const value = sprite[getterName]();
                    if (Array.isArray(value)) return value;
                } catch (_) {}
            }
            return null;
        }
        
        /**
         * Clone a small RPG Maker color/tone array.
         */
        function cloneVisualArray(value) {
            if (!Array.isArray(value)) return null;
            try {
                if (typeof value.clone === 'function') {
                    const cloned = value.clone();
                    if (Array.isArray(cloned)) return cloned;
                }
            } catch (_) {}
            return value.slice();
        }
        
        /**
         * Compare small color/tone arrays without depending on RPG Maker Array.equals.
         */
        function visualArraysEqual(left, right) {
            if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
            for (let index = 0; index < left.length; index += 1) {
                if (left[index] !== right[index]) return false;
            }
            return true;
        }
        
        /**
         * Attach overlay directly after source in its parent display list.
         */
        function attachOverlayAfterSource(source, overlay) {
            if (!source || !overlay || !source.parent || source.parent._destroyed) return false;
            const parent = source.parent;
            if (overlay.parent !== parent && overlay.parent && typeof overlay.parent.removeChild === 'function') {
                try { overlay.parent.removeChild(overlay); } catch (_) {}
            }
            const children = Array.isArray(parent.children) ? parent.children : null;
            const sourceIndex = children ? children.indexOf(source) : -1;
            if (children && sourceIndex < 0) return false;
            const overlayIndex = children ? children.indexOf(overlay) : -1;
            const targetIndex = sourceIndex >= 0 ? Math.min(children.length, sourceIndex + 1) : -1;
            if (targetIndex >= 0 && typeof parent.addChildAt === 'function') {
                if (overlay.parent !== parent || overlayIndex !== targetIndex) parent.addChildAt(overlay, targetIndex);
            } else if (typeof parent.addChild === 'function' && overlay.parent !== parent) {
                parent.addChild(overlay);
            }
            return overlay.parent === parent;
        }
        
        /**
         * Hide source Sprite rendering while an overlay is valid.
         */
        function hideSpriteSource(spriteState) {
            if (!spriteState || !spriteState.sprite) return;
            const sprite = spriteState.sprite;
            const token = `${spriteState.id}:overlay`;
            const renderable = shouldRenderSpriteOverlay(spriteState);
            addSourceRenderSkipGuard(sprite, token, () => shouldRenderSpriteOverlay(spriteState), { refresh: false });
            refreshSourceRenderSuppression(sprite, renderable);
            spriteState.hidden = true;
            spriteState.hiddenToken = token;
            try { sprite._trSpriteTextHiddenToken = token; } catch (_) {}
        }
        
        /**
         * Restore a source Sprite after removing its overlay.
         */
        function restoreSpriteSource(spriteState) {
            if (!spriteState || !spriteState.sprite || !spriteState.hidden) return;
            removeSourceRenderSkipGuard(spriteState.sprite, spriteState.hiddenToken);
            spriteState.hidden = false;
            spriteState.hiddenToken = '';
        }
        
        /**
         * Remove a sprite-bitmap overlay and restore source rendering.
         */
        function removeSpriteOverlay(spriteState, reason = 'remove') {
            if (!spriteState) return;
            const overlay = spriteState.overlaySprite;
            const hadOverlay = !!overlay;
            if (!hadOverlay && !spriteState.hidden && !spriteState.overlayBitmap) return;
            if (overlay && overlay.parent && typeof overlay.parent.removeChild === 'function') {
                try { overlay.parent.removeChild(overlay); } catch (_) {}
            }
            spriteState.overlaySprite = null;
            spriteState.overlayBitmap = null;
            restoreSpriteSource(spriteState);
            scope.activeSprites.delete(spriteState.sprite);
            scope.perf.count('spriteText.overlay.remove.calls');
            scope.perf.count(hadOverlay ? 'spriteText.overlay.remove.present' : 'spriteText.overlay.remove.absent');
            scope.perf.top('spriteText.overlay.removeState', hadOverlay ? 'present' : 'absent');
            if (hadOverlay) scope.perf.top('spriteText.overlay.presentRemoveReason', reason || 'unknown');
            scope.perf.top('spriteText.overlay.removeReason', reason || 'unknown');
        }
        
        /**
         * Add a render guard to a source Sprite.
         */
        function addSourceRenderSkipGuard(sprite, key, guard, options = {}) {
            if (!sprite || !key || typeof guard !== 'function') return;
            installSourceRenderGuard(sprite);
            addSourceVisualMutationGuard(sprite, key);
            if (!Array.isArray(sprite._trSpriteTextRenderSkipGuards)) sprite._trSpriteTextRenderSkipGuards = [];
            if (!sprite._trSpriteTextRenderSkipGuardKeys) sprite._trSpriteTextRenderSkipGuardKeys = Object.create(null);
            const previous = sprite._trSpriteTextRenderSkipGuardKeys[key];
            if (previous) {
                const index = sprite._trSpriteTextRenderSkipGuards.indexOf(previous);
                if (index >= 0) sprite._trSpriteTextRenderSkipGuards.splice(index, 1);
            }
            sprite._trSpriteTextRenderSkipGuardKeys[key] = guard;
            sprite._trSpriteTextRenderSkipGuards.push(guard);
            if (!options || options.refresh !== false) refreshSourceRenderSuppression(sprite);
        }
        
        /**
         * Remove a render guard from a source Sprite.
         */
        function removeSourceRenderSkipGuard(sprite, key) {
            if (!sprite || !key) return;
            if (sprite._trSpriteTextRenderSkipGuardKeys) {
                const guard = sprite._trSpriteTextRenderSkipGuardKeys[key];
                delete sprite._trSpriteTextRenderSkipGuardKeys[key];
                if (guard && Array.isArray(sprite._trSpriteTextRenderSkipGuards)) {
                    const index = sprite._trSpriteTextRenderSkipGuards.indexOf(guard);
                    if (index >= 0) sprite._trSpriteTextRenderSkipGuards.splice(index, 1);
                }
            }
            removeSourceVisualMutationGuard(sprite, key);
            refreshSourceRenderSuppression(sprite);
        }
        
        /**
         * Suppress expensive source-only color refreshes while an overlay owns the pixels.
         */
        function addSourceVisualMutationGuard(sprite, key) {
            if (!sprite || !key) return;
            installSourceVisualMutationGuard(sprite);
            if (!sprite._trSpriteTextVisualMutationKeys) sprite._trSpriteTextVisualMutationKeys = Object.create(null);
            sprite._trSpriteTextVisualMutationKeys[key] = true;
            sprite._trSpriteTextVisualMutationSuppressed = true;
        }
        
        /**
         * Release visual mutation suppression and catch the source up before it can render again.
         */
        function removeSourceVisualMutationGuard(sprite, key) {
            if (!sprite || !key || !sprite._trSpriteTextVisualMutationKeys) return;
            delete sprite._trSpriteTextVisualMutationKeys[key];
            const keys = sprite._trSpriteTextVisualMutationKeys;
            const suppressed = !!Object.keys(keys).length;
            sprite._trSpriteTextVisualMutationSuppressed = suppressed;
            if (!suppressed) flushSourceVisualRefresh(sprite);
        }
        
        /**
         * Wrap RPG Maker color mutation methods on hidden source glyph sprites.
         */
        function installSourceVisualMutationGuard(sprite) {
            if (!sprite || sprite._trSpriteTextVisualMutationGuard === scope.VISUAL_MUTATION_TOKEN) return;
            wrapSourceVisualMutation(sprite, 'setBlendColor', '_blendColor');
            wrapSourceVisualMutation(sprite, 'setColorTone', '_colorTone');
            sprite._trSpriteTextVisualMutationGuard = scope.VISUAL_MUTATION_TOKEN;
        }
        
        /**
         * Cache a hidden source sprite visual field without running the native refresh path.
         */
        function wrapSourceVisualMutation(sprite, methodName, fieldName) {
            const current = sprite && sprite[methodName];
            if (typeof current !== 'function') return;
            const original = current;
            const wrapped = function(...args) {
                const value = args[0];
                if (this
                    && this._trSpriteTextVisualMutationSuppressed === true
                    && args.length === 1
                    && Array.isArray(value)
                    && Array.isArray(this[fieldName])) {
                    if (setHiddenSourceVisualArray(this, fieldName, value)) {
                        this._trSpriteTextVisualRefreshPending = true;
                    }
                    return undefined;
                }
                const wasPending = !!(this && this._trSpriteTextVisualRefreshPending);
                const result = original.apply(this, args);
                if (wasPending && this && this._trSpriteTextVisualMutationSuppressed !== true) {
                    flushSourceVisualRefresh(this);
                }
                return result;
            };
            wrapped.__trOriginal = original;
            sprite[methodName] = wrapped;
        }
        
        /**
         * Store a hidden source visual effect value without refreshing its native texture.
         */
        function setHiddenSourceVisualArray(sprite, fieldName, value) {
            const next = cloneVisualArray(value);
            if (!next || visualArraysEqual(sprite[fieldName], next)) return false;
            sprite[fieldName] = next;
            return true;
        }
        
        /**
         * Apply any deferred visual refresh before a source sprite is allowed to render again.
         */
        function flushSourceVisualRefresh(sprite) {
            if (!sprite || sprite._trSpriteTextVisualRefreshPending !== true) return;
            sprite._trSpriteTextVisualRefreshPending = false;
            try {
                if (typeof sprite._refresh === 'function') sprite._refresh();
            } catch (_) {}
        }
        
        /**
         * Cache source suppression outside the render hot path.
         */
        function refreshSourceRenderSuppression(sprite, forced) {
            if (!sprite) return false;
            if (typeof forced === 'boolean') {
                sprite._trSpriteTextRenderSuppressed = forced;
                return forced;
            }
            const guards = Array.isArray(sprite._trSpriteTextRenderSkipGuards)
                ? sprite._trSpriteTextRenderSkipGuards
                : [];
            let suppressed = false;
            for (const guard of guards) {
                try {
                    if (guard()) {
                        suppressed = true;
                        break;
                    }
                } catch (_) {}
            }
            sprite._trSpriteTextRenderSuppressed = suppressed;
            return suppressed;
        }
        
        /**
         * Wrap source render methods so active overlays can suppress source text.
         */
        function installSourceRenderGuard(sprite) {
            if (!sprite || sprite._trSpriteTextSourceRenderGuard === scope.RENDER_GUARD_TOKEN) return;
            ['render', 'renderWebGL', 'renderCanvas'].forEach((methodName) => {
                const current = sprite[methodName];
                if (typeof current !== 'function') return;
                const original = current;
                const wrapped = function(...args) {
                    if (this) {
                        if (this._trSpriteTextRenderSuppressed === true) return undefined;
                        if (this._trSpriteTextRenderSuppressed !== false && refreshSourceRenderSuppression(this)) return undefined;
                    }
                    return original.apply(this, args);
                };
                wrapped.__trOriginal = original;
                sprite[methodName] = wrapped;
            });
            sprite._trSpriteTextSourceRenderGuard = scope.RENDER_GUARD_TOKEN;
        }
        
        /**
         * Sync one sprite overlay with its source.
         */
        function syncSpriteOverlay(spriteState) {
            if (!spriteState || !spriteState.sprite || !spriteState.overlaySprite) return false;
            const sprite = spriteState.sprite;
            if (sprite._destroyed || !sprite.parent || !isChildInParent(sprite, sprite.parent) || spriteState.overlaySprite._destroyed) {
                removeSpriteOverlay(spriteState, 'source-gone');
                return false;
            }
            copySpriteVisualState(sprite, spriteState.overlaySprite);
            const renderable = refreshSpriteOverlayRenderable(spriteState);
            spriteState.overlaySprite.renderable = renderable;
            refreshSourceRenderSuppression(sprite, renderable);
            if (!attachOverlayAfterSource(sprite, spriteState.overlaySprite)) {
                removeSpriteOverlay(spriteState, 'attach-failed');
                return false;
            }
            Array.from(spriteState.entries.values()).forEach((entry) => updateEntryVisibility(entry, renderable));
            return true;
        }
        
        /**
         * Return true when a sprite overlay should render this frame.
         */
        function shouldRenderSpriteOverlay(spriteState) {
            if (!spriteState || !spriteState.sprite || !spriteState.overlaySprite) return false;
            const frameKey = readFrameKey();
            if (frameKey !== null
                && spriteState._trRenderableFrameKey === frameKey
                && typeof spriteState._trOverlayRenderable === 'boolean') {
                return spriteState._trOverlayRenderable;
            }
            return refreshSpriteOverlayRenderable(spriteState, frameKey);
        }
        
        /**
         * Recompute and cache sprite overlay visibility for the current frame.
         */
        function refreshSpriteOverlayRenderable(spriteState, frameKey = readFrameKey()) {
            const renderable = !!(spriteState
                && spriteState.sprite
                && spriteState.overlaySprite
                && isSpriteSourceRenderableNow(spriteState.sprite, spriteState.overlaySprite.parent));
            if (spriteState) {
                spriteState._trOverlayRenderable = renderable;
                spriteState._trRenderableFrameKey = frameKey;
            }
            return renderable;
        }

        return { createOverlaySprite, installOverlayRenderGuard, copySpriteVisualState, copySpriteColorEffects, copySpriteColorEffect, readSpriteVisualArray, cloneVisualArray, visualArraysEqual, attachOverlayAfterSource, hideSpriteSource, restoreSpriteSource, removeSpriteOverlay, addSourceRenderSkipGuard, removeSourceRenderSkipGuard, addSourceVisualMutationGuard, removeSourceVisualMutationGuard, installSourceVisualMutationGuard, wrapSourceVisualMutation, setHiddenSourceVisualArray, flushSourceVisualRefresh, refreshSourceRenderSuppression, installSourceRenderGuard, syncSpriteOverlay, shouldRenderSpriteOverlay, refreshSpriteOverlayRenderable };
    }

    defineRuntimeModule('adapters.spriteText.overlaysprite', { createController });
})();
