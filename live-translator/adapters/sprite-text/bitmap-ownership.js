// Sprite text adapter support: bitmap ownership.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/bitmap-ownership.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            bucketCount,
            ensureSpriteState,
            findPropertyDescriptor,
            getBitmapState,
            isOverlayBitmap,
            isWindowOwnedBitmap,
            removeSpriteOverlay,
            retireSpriteEntry,
        } = Object.fromEntries([
            'bucketCount',
            'ensureSpriteState',
            'findPropertyDescriptor',
            'getBitmapState',
            'isOverlayBitmap',
            'isWindowOwnedBitmap',
            'removeSpriteOverlay',
            'retireSpriteEntry',
        ].map((name) => [name, callScope(name)]));

        /**
         * Wrap Sprite.bitmap so bitmap ownership stays current.
         */
        function installSpriteBitmapObserver() {
            const found = findPropertyDescriptor(Sprite.prototype, 'bitmap');
            if (!found || !found.descriptor || typeof found.descriptor.set !== 'function') return false;
            if (found.descriptor.set.__trSpriteTextBitmapObserver === scope.BITMAP_OBSERVER_TOKEN) return true;
        
            const originalGet = typeof found.descriptor.get === 'function'
                ? found.descriptor.get
                : function() { return this._bitmap; };
            const originalSet = found.descriptor.set;
            const wrappedSet = function(value) {
                let oldBitmap = null;
                try { oldBitmap = originalGet.call(this); } catch (_) { oldBitmap = this ? this._bitmap : null; }
                const result = originalSet.call(this, value);
                let newBitmap = null;
                try { newBitmap = originalGet.call(this); } catch (_) { newBitmap = value; }
                if (oldBitmap !== newBitmap) {
                    const existingState = scope.spriteStates.get(this);
                    const wasRelevant = isSpriteLifecycleRelevant(this, oldBitmap, existingState);
                    detachBitmapOwner(this, oldBitmap, { silent: true });
                    const isRelevant = attachBitmapOwner(this, newBitmap, { silent: true }) || wasRelevant;
                    const state = (isRelevant || hasActiveSpriteTextState(existingState))
                        ? ensureSpriteState(this)
                        : existingState;
                    if (state) {
                        state.bitmap = newBitmap;
                        if (isRelevant || hasActiveSpriteTextState(state)) removeSpriteOverlay(state, 'bitmap-replaced');
                    }
                    if (isRelevant || hasActiveSpriteTextState(state)) markSpriteDirty(this, 'bitmap-set');
                }
                return result;
            };
            wrappedSet.__trSpriteTextBitmapObserver = scope.BITMAP_OBSERVER_TOKEN;
            Object.defineProperty(found.owner, 'bitmap', {
                configurable: true,
                enumerable: found.descriptor.enumerable,
                get: originalGet,
                set: wrappedSet,
            });
            return true;
        }
        
        /**
         * Record that a Sprite owns a Bitmap surface.
         */
        function attachBitmapOwner(sprite, bitmap, options = {}) {
            if (!sprite || !bitmap || isOverlayBitmap(bitmap) || isWindowOwnedBitmap(bitmap)) return false;
            let owners = getBitmapOwners(bitmap);
            if (!owners) {
                owners = new Set();
                scope.bitmapOwners.set(bitmap, owners);
            }
            owners.add(sprite);
            try { bitmap._trSpriteTextOwned = true; } catch (_) {}
            claimSpriteBitmapSurface(sprite, bitmap);
            const existingState = scope.spriteStates.get(sprite);
            const relevant = isSpriteLifecycleRelevant(sprite, bitmap, existingState);
            const spriteState = relevant ? ensureSpriteState(sprite) : existingState;
            if (spriteState) spriteState.bitmap = bitmap;
            if (relevant && !(options && options.silent)) markSpriteDirty(sprite, 'bitmap-attach');
            return relevant;
        }
        
        /**
         * Remove a Sprite owner from a Bitmap surface.
         */
        function detachBitmapOwner(sprite, bitmap, options = {}) {
            if (!sprite || !bitmap) return false;
            const relevant = isSpriteLifecycleRelevant(sprite, bitmap, scope.spriteStates.get(sprite));
            const owners = getBitmapOwners(bitmap);
            if (owners) {
                owners.delete(sprite);
                if (!owners.size) {
                    try { scope.bitmapOwners.delete(bitmap); } catch (_) {}
                    try { bitmap._trSpriteTextOwned = false; } catch (_) {}
                }
            }
            releaseSpriteBitmapSurface(sprite, bitmap, 'bitmap-detach');
            if (relevant && !(options && options.silent)) markSpriteDirty(sprite, 'bitmap-detach');
            return relevant;
        }
        
        function claimSpriteBitmapSurface(sprite, bitmap) {
            if (!sprite || !bitmap || !scope.adapterContract || typeof scope.adapterContract.claimSurface !== 'function') return false;
            const existing = scope.spriteSurfaceClaims.get(sprite);
            if (existing && existing.bitmap === bitmap && existing.token) return true;
            if (existing && existing.token && typeof scope.adapterContract.releaseSurface === 'function') {
                scope.adapterContract.releaseSurface(existing.token, 'sprite-bitmap-replaced');
            }
            const spriteState = ensureSpriteState(sprite);
            const claim = scope.adapterContract.claimSurface({
                target: bitmap,
                surfaceId: `sprite:${spriteState ? spriteState.id : 'unknown'}:bitmap`,
                surfaceType: scope.SURFACE_TYPE,
                role: 'sprite-bitmap',
                owner: sprite,
            });
            if (claim && claim.status === 'claimed' && claim.token) {
                scope.spriteSurfaceClaims.set(sprite, { bitmap, token: claim.token });
                if (spriteState) spriteState.bitmap = bitmap;
                return true;
            }
            scope.spriteSurfaceClaims.delete(sprite);
            return false;
        }
        
        function releaseSpriteBitmapSurface(sprite, bitmap, reason) {
            if (!sprite) return false;
            const existing = scope.spriteSurfaceClaims.get(sprite);
            if (!existing || (bitmap && existing.bitmap !== bitmap)) return false;
            scope.spriteSurfaceClaims.delete(sprite);
            if (!scope.adapterContract || typeof scope.adapterContract.releaseSurface !== 'function') return false;
            return scope.adapterContract.releaseSurface(existing.token, reason || 'sprite-bitmap-released') === true;
        }
        
        /**
         * Return true when at least one live Sprite owns the bitmap.
         */
        function isBitmapOwned(bitmap) {
            const owners = getBitmapOwners(bitmap);
            if (!owners || !owners.size) return false;
            for (const sprite of owners) {
                if (sprite && !sprite._destroyed) return true;
            }
            return false;
        }
        
        /**
         * Read the owner Set for a Bitmap without creating it.
         */
        function getBitmapOwners(bitmap) {
            if (!bitmap) return null;
            try { return scope.bitmapOwners.get(bitmap) || null; } catch (_) { return null; }
        }
        
        /**
         * Return true when sprite lifecycle changes can affect translated sprite text.
         */
        function isSpriteLifecycleRelevant(sprite, bitmap, state = scope.spriteStates.get(sprite)) {
            return hasActiveSpriteTextState(state) || bitmapHasTextInterest(bitmap);
        }
        
        /**
         * Return true once a sprite has live translated-text bookkeeping.
         */
        function hasActiveSpriteTextState(state) {
            return !!(state && (
                state.overlaySprite
                || state.hidden
                || state.singleGlyphCandidate
                || (state.entries && state.entries.size > 0)
            ));
        }
        
        /**
         * Return true for bitmaps with observed text that may need sprite processing.
         */
        function bitmapHasTextInterest(bitmap) {
            if (!bitmap || isOverlayBitmap(bitmap) || isWindowOwnedBitmap(bitmap)) return false;
            if (bitmap._trSpriteTextHasTextInterest) return true;
            const state = getBitmapState(bitmap);
            return !!(state && !state.destroyed && Array.isArray(state.textOps) && state.textOps.length);
        }
        
        /**
         * Mark every live owner of a Bitmap dirty.
         */
        function markBitmapOwnersDirty(bitmap, reason = 'bitmap') {
            scope.perf.count('spriteText.bitmap.ownersDirty.calls');
            scope.perf.top('spriteText.bitmap.ownersDirty.reason', reason || 'unknown');
            const owners = getBitmapOwners(bitmap);
            if (!owners || !owners.size) {
                scope.perf.count('spriteText.bitmap.ownersDirty.empty');
                return;
            }
            const ownerSlots = owners.size;
            scope.perf.count('spriteText.bitmap.ownersDirty.ownerSlots', ownerSlots);
            scope.perf.top('spriteText.bitmap.ownersDirty.ownerSlotBucket', bucketCount(ownerSlots));
            let liveOwners = 0;
            Array.from(owners).forEach((sprite) => {
                if (!sprite || sprite._destroyed) owners.delete(sprite);
                else {
                    liveOwners += 1;
                    markSpriteDirty(sprite, reason);
                }
            });
            if (liveOwners) scope.perf.count('spriteText.bitmap.ownersDirty.liveOwners', liveOwners);
            if (liveOwners < ownerSlots) scope.perf.count('spriteText.bitmap.ownersDirty.staleOwners', ownerSlots - liveOwners);
        }
        
        /**
         * Retire all sprite records tied to a destroyed bitmap.
         */
        function retireBitmapOwners(bitmap, reason) {
            const owners = getBitmapOwners(bitmap);
            if (!owners) return;
            Array.from(owners).forEach((sprite) => {
                const state = scope.spriteStates.get(sprite);
                if (!state) return;
                Array.from(state.entries.values()).forEach((entry) => retireSpriteEntry(entry, reason));
                state.entries.clear();
                removeSpriteOverlay(state, reason);
                markSpriteDirty(sprite, reason);
            });
        }
        
        /**
         * Mark one sprite dirty and its parent eligible for glyph-run grouping.
         */
        function markSpriteDirty(sprite, reason = 'mutation') {
            if (!sprite || sprite._trSpriteTextObserverBypass) return;
            const alreadyDirty = scope.dirtySprites.has(sprite);
            scope.dirtySprites.add(sprite);
            try {
                if (sprite.parent) markParentDirty(sprite.parent, reason);
            } catch (_) {}
            scope.perf.count('spriteText.sprite.dirty');
            scope.perf.count(alreadyDirty ? 'spriteText.sprite.dirty.duplicate' : 'spriteText.sprite.dirty.unique');
            scope.perf.top('spriteText.sprite.reason', reason || 'unknown');
        }
        
        /**
         * Mark a parent container dirty for single-glyph run grouping.
         */
        function markParentDirty(parent, reason = 'mutation') {
            if (!parent || parent._trSpriteTextObserverBypass) return;
            const alreadyDirty = scope.dirtyParents.has(parent);
            scope.dirtyParents.add(parent);
            scope.perf.count('spriteText.parent.dirty');
            scope.perf.count(alreadyDirty ? 'spriteText.parent.dirty.duplicate' : 'spriteText.parent.dirty.unique');
            scope.perf.top('spriteText.parent.reason', reason || 'unknown');
        }

        return { installSpriteBitmapObserver, attachBitmapOwner, detachBitmapOwner, claimSpriteBitmapSurface, releaseSpriteBitmapSurface, isBitmapOwned, getBitmapOwners, isSpriteLifecycleRelevant, hasActiveSpriteTextState, bitmapHasTextInterest, markBitmapOwnersDirty, retireBitmapOwners, markSpriteDirty, markParentDirty };
    }

    defineRuntimeModule('adapters.spriteText.bitmapownership', { createController });
})();
