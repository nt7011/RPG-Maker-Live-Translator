// Sprite text adapter support: frame.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/frame.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            attachBitmapOwner,
            bucketCount,
            buildTextGroups,
            createGlyphCandidate,
            createOrUpdateEntry,
            detachBitmapOwner,
            ensureSpriteState,
            getBitmapState,
            hasActiveSpriteTextState,
            hasRenderedTranslation,
            isAdapterContractFailure,
            isDisplayObjectInCurrentScene,
            isOverlayBitmap,
            isWindowOwnedBitmap,
            markParentDirty,
            markSpriteDirty,
            processParentGlyphRuns,
            readFrameKey,
            releaseParentRunOverlayCarrier,
            removeParentRun,
            removeSpriteOverlay,
            renderSpriteOverlay,
            requestEntryTranslation,
            retireSpriteEntry,
            syncParentRun,
            syncParentRunOverlayCarrier,
            syncSpriteOverlay,
            textUnitCount,
            updateEntryVisibility,
            updateRunVisibility,
            warn,
        } = Object.fromEntries([
            'attachBitmapOwner',
            'bucketCount',
            'buildTextGroups',
            'createGlyphCandidate',
            'createOrUpdateEntry',
            'detachBitmapOwner',
            'ensureSpriteState',
            'getBitmapState',
            'hasActiveSpriteTextState',
            'hasRenderedTranslation',
            'isAdapterContractFailure',
            'isDisplayObjectInCurrentScene',
            'isOverlayBitmap',
            'isWindowOwnedBitmap',
            'markParentDirty',
            'markSpriteDirty',
            'processParentGlyphRuns',
            'readFrameKey',
            'releaseParentRunOverlayCarrier',
            'removeParentRun',
            'removeSpriteOverlay',
            'renderSpriteOverlay',
            'requestEntryTranslation',
            'retireSpriteEntry',
            'syncParentRun',
            'syncParentRunOverlayCarrier',
            'syncSpriteOverlay',
            'textUnitCount',
            'updateEntryVisibility',
            'updateRunVisibility',
            'warn',
        ].map((name) => [name, callScope(name)]));

        /**
         * Install child add/remove observers on PIXI containers and Sprite.
         */
        function installChildObservers() {
            const targets = [];
            try {
                if (typeof PIXI !== 'undefined' && PIXI && PIXI.Container && PIXI.Container.prototype) {
                    targets.push({ target: PIXI.Container.prototype, label: 'PIXI.Container' });
                }
            } catch (_) {}
            try {
                if (typeof PIXI !== 'undefined' && PIXI && PIXI.DisplayObjectContainer && PIXI.DisplayObjectContainer.prototype) {
                    targets.push({ target: PIXI.DisplayObjectContainer.prototype, label: 'PIXI.DisplayObjectContainer' });
                }
            } catch (_) {}
            targets.push({ target: Sprite.prototype, label: 'Sprite' });
        
            const seen = [];
            targets.forEach((item) => {
                if (!item || !item.target || seen.indexOf(item.target) >= 0) return;
                seen.push(item.target);
                installChildObserverOn(item.target);
            });
        }
        
        /**
         * Wrap common child mutators to maintain ownership and retire removed text.
         */
        function installChildObserverOn(target) {
            wrapChildMethod(target, 'addChild', function(result, children) {
                children.forEach((child) => observeChildAdded(this, child));
            });
            wrapChildMethod(target, 'addChildAt', function(result, args) {
                observeChildAdded(this, args[0]);
            });
            wrapChildMethod(target, 'removeChild', function(result, children) {
                children.forEach((child) => observeChildRemoved(this, child));
            });
            wrapChildMethod(target, 'removeChildAt', function(result) {
                observeChildRemoved(this, result);
            });
            wrapChildMethod(target, 'removeChildren', function(result, args, beforeChildren) {
                const removed = Array.isArray(result) && result.length ? result : beforeChildren;
                removed.forEach((child) => observeChildRemoved(this, child));
            }, true);
        }
        
        /**
         * Generic wrapper for container child methods.
         */
        function wrapChildMethod(target, methodName, after, snapshotBefore = false) {
            if (!target || typeof target[methodName] !== 'function') return false;
            const current = target[methodName];
            if (hasHookInChain(current, '__trSpriteTextChildObserver', scope.CHILD_OBSERVER_TOKEN)) return true;
            const original = current;
            const wrapped = function(...args) {
                const beforeChildren = snapshotBefore && Array.isArray(this.children) ? this.children.slice() : [];
                const result = original.apply(this, args);
                try { after.call(this, result, args, beforeChildren); } catch (error) {
                    warn('[SpriteText] Child observer failed.', error);
                }
                return result;
            };
            wrapped.__trOriginal = original;
            wrapped.__trSpriteTextChildObserver = scope.CHILD_OBSERVER_TOKEN;
            target[methodName] = wrapped;
            return true;
        }
        
        /**
         * Observe one child being attached to a parent container.
         */
        function observeChildAdded(parent, child) {
            if (!parent || !child || child._trSpriteTextObserverBypass) return;
            let relevant = false;
            visitDisplayTree(child, (node) => {
                if (!node || node._trSpriteTextObserverBypass) return;
                let nodeRelevant = hasActiveSpriteTextState(scope.spriteStates.get(node));
                try {
                    if (node.bitmap) nodeRelevant = attachBitmapOwner(node, node.bitmap, { silent: true }) || nodeRelevant;
                } catch (_) {}
                if (!nodeRelevant) return;
                relevant = true;
                markSpriteDirty(node, 'addChild');
            });
            if (relevant) markParentDirty(parent, 'addChild');
        }
        
        /**
         * Observe one child subtree being removed from a parent container.
         */
        function observeChildRemoved(parent, child) {
            if (!parent || !child || child._trSpriteTextObserverBypass) return false;
            let relevant = false;
            visitDisplayTree(child, (node) => {
                const spriteState = scope.spriteStates.get(node);
                if (hasActiveSpriteTextState(spriteState)) {
                    relevant = true;
                    Array.from(spriteState.entries.values()).forEach((entry) => retireSpriteEntry(entry, 'removed'));
                    spriteState.entries.clear();
                    spriteState.singleGlyphCandidate = null;
                    removeSpriteOverlay(spriteState, 'removed');
                }
                const runState = scope.parentRunStates.get(node);
                if (runState && runState.runs) {
                    relevant = true;
                    Array.from(runState.runs.values()).forEach((run) => removeParentRun(run, 'source-removed'));
                }
                try {
                    if (node && node.bitmap) relevant = detachBitmapOwner(node, node.bitmap, { silent: true }) || relevant;
                } catch (_) {}
            });
            if (relevant) markParentDirty(parent, 'removeChild');
            return relevant;
        }
        
        /**
         * Walk a display tree without depending on PIXI internals beyond children.
         */
        function visitDisplayTree(node, visitor) {
            if (!node || typeof visitor !== 'function') return;
            visitor(node);
            const children = Array.isArray(node.children) ? node.children.slice() : [];
            children.forEach((child) => visitDisplayTree(child, visitor));
        }
        
        /**
         * Install frame hooks that coalesce sprite observations.
         */
        function installFrameHooks() {
            let installed = false;
            try {
                if (typeof SceneManager !== 'undefined' && SceneManager) {
                    installed = installFrameHook(SceneManager, 'updateScene', 'SceneManager.updateScene', false) || installed;
                    installed = installFrameHook(SceneManager, 'renderScene', 'SceneManager.renderScene', true) || installed;
                }
            } catch (_) {}
            try {
                if (typeof Graphics !== 'undefined' && Graphics) {
                    installed = installFrameHook(Graphics, 'render', 'Graphics.render', true) || installed;
                }
            } catch (_) {}
            return installed;
        }

        function hasFrameHooksActive() {
            try {
                if (typeof SceneManager !== 'undefined' && SceneManager) {
                    if (hasHookInChain(SceneManager.updateScene, '__trSpriteTextFrameHook', scope.FRAME_TOKEN)) return true;
                    if (hasHookInChain(SceneManager.renderScene, '__trSpriteTextFrameHook', scope.FRAME_TOKEN)) return true;
                }
            } catch (_) {}
            try {
                if (typeof Graphics !== 'undefined' && Graphics) {
                    if (hasHookInChain(Graphics.render, '__trSpriteTextFrameHook', scope.FRAME_TOKEN)) return true;
                }
            } catch (_) {}
            return false;
        }

        function ensureFrameHooks() {
            if (hasFrameHooksActive()) return true;
            installFrameHooks();
            return hasFrameHooksActive();
        }
        
        /**
         * Wrap one frame method and flush before or after native work.
         */
        function installFrameHook(target, methodName, label, flushBefore) {
            if (!target || typeof target[methodName] !== 'function') return false;
            if (hasHookInChain(target[methodName], '__trSpriteTextFrameHook', scope.FRAME_TOKEN)) return true;
            const original = target[methodName];
            const wrapped = function(...args) {
                if (flushBefore) flushFrame(label);
                const result = original.apply(this, args);
                if (!flushBefore) flushFrame(label);
                return result;
            };
            wrapped.__trOriginal = original;
            wrapped.__trSpriteTextFrameHook = scope.FRAME_TOKEN;
            target[methodName] = wrapped;
            return true;
        }
        
        /**
         * Detect this hook even after later wrappers are added around it.
         */
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
        
        /**
         * Process all dirty sprites and glyph-run parents.
         */
        function flushFrame(reason = 'frame') {
            if (scope.flushing) return;
            scope.flushing = true;
            const start = scope.perf.isEnabled() ? scope.perf.now() : 0;
            try {
                const frameKey = readFrameKey();
                adoptCurrentSceneSprites('scene-adopt');
                flushPendingBitmapOwnerClaims(`${reason || 'frame'}:owner-claim`);
                const hasDirtyWork = scope.dirtySprites.size > 0 || scope.dirtyParents.size > 0;
                const runMaintenance = frameKey === null || scope.lastMaintenanceFrameKey !== frameKey || hasDirtyWork;
                if (runMaintenance) {
                    scope.measurePerf('spriteText.visibility.ms', () => {
                        syncTrackedVisibility();
                        syncActiveOverlays();
                    });
                    if (frameKey !== null) scope.lastMaintenanceFrameKey = frameKey;
                } else {
                    scope.perf.count('spriteText.frame.coalesced');
                }
        
                const sprites = Array.from(scope.dirtySprites);
                scope.dirtySprites.clear();
                if (sprites.length) {
                    scope.perf.count('spriteText.frame.dirtySprites', sprites.length);
                    scope.perf.top('spriteText.frame.dirtySpriteBucket', bucketCount(sprites.length));
                }
                scope.measurePerf('spriteText.processSprites.ms', () => {
                    sprites.forEach((sprite) => processSpriteSurface(sprite, reason));
                });
                sprites.forEach((sprite) => {
                    try {
                        if (sprite && sprite.parent) scope.dirtyParents.add(sprite.parent);
                    } catch (_) {}
                });
        
                const parents = Array.from(scope.dirtyParents);
                scope.dirtyParents.clear();
                if (parents.length) {
                    scope.perf.count('spriteText.frame.dirtyParents', parents.length);
                    scope.perf.top('spriteText.frame.dirtyParentBucket', bucketCount(parents.length));
                }
                scope.measurePerf('spriteText.processParents.ms', () => {
                    parents.forEach(processParentGlyphRuns);
                });
        
                scope.measurePerf('spriteText.bitmapFallback.ms', () => {
                    flushBitmapFallbackAfterSprite(frameKey, hasDirtyWork || sprites.length > 0 || parents.length > 0);
                });
            } catch (error) {
                if (isAdapterContractFailure(error)) throw error;
                warn('[SpriteText] Frame flush failed.', error);
            } finally {
                scope.flushing = false;
                if (start) scope.perf.time('spriteText.frame.ms', scope.perf.now() - start);
            }
        }

        function adoptCurrentSceneSprites(reason = 'scene-adopt') {
            const scene = scope.globalScope.SceneManager && scope.globalScope.SceneManager._scene;
            if (!scene || scene === scope.lastAdoptedScene) return 0;
            scope.lastAdoptedScene = scene;
            return adoptSpriteTree(scene, reason);
        }

        function adoptSpriteTree(root, reason = 'scene-adopt') {
            if (!root) return 0;
            let adopted = 0;
            visitDisplayTree(root, (node) => {
                if (!node || node._destroyed || node._trSpriteTextObserverBypass) return;
                let relevant = false;
                try {
                    if (node.bitmap) relevant = attachBitmapOwner(node, node.bitmap, { silent: true }) || relevant;
                } catch (_) {}
                if (relevant || hasActiveSpriteTextState(scope.spriteStates.get(node))) {
                    adopted += 1;
                    markSpriteDirty(node, reason);
                }
            });
            return adopted;
        }

        function scheduleFallbackFrameFlush(reason = 'fallback-frame') {
            if (scope.frameFallbackTimer || typeof setTimeout !== 'function') return false;
            scope.frameFallbackTimer = setTimeout(() => {
                scope.frameFallbackTimer = null;
                flushFrame(reason || 'fallback-frame');
            }, 0);
            return true;
        }

        function flushPendingBitmapOwnerClaims(reason) {
            if (!scope.bitmapServices || typeof scope.bitmapServices.flushOwnerDrawBatches !== 'function') return 0;
            try {
                if (typeof scope.bitmapServices.hasPendingDrawBatches === 'function'
                    && !scope.bitmapServices.hasPendingDrawBatches()) {
                    return 0;
                }
                return scope.bitmapServices.flushOwnerDrawBatches(reason || 'owner-claim') || 0;
            } catch (error) {
                warn('[SpriteText] Bitmap owner-claim preflush failed.', error);
                return 0;
            }
        }
        
        /**
         * Let bitmap fallback flush once per engine frame after sprite claims.
         */
        function flushBitmapFallbackAfterSprite(frameKey, hadSpriteWork) {
            if (frameKey !== null && scope.lastBitmapFallbackFrameKey === frameKey && !hadSpriteWork) return;
            try {
                if (scope.bitmapServices.flushBitmapFallback('after-sprite-text')) {
                    if (frameKey !== null) scope.lastBitmapFallbackFrameKey = frameKey;
                }
            } catch (_) {}
        }
        
        /**
         * Keep visible/hidden state current for records already known to orchestrator.
         */
        function syncTrackedVisibility() {
            Array.from(scope.trackedSpriteStates).forEach((spriteState) => {
                if (!spriteState || !spriteState.sprite || spriteState.sprite._destroyed) {
                    retireAllSpriteEntries(spriteState, 'sprite-destroyed');
                    scope.trackedSpriteStates.delete(spriteState);
                    return;
                }
                if (!isDisplayObjectInCurrentScene(spriteState.sprite)) {
                    retireAllSpriteEntries(spriteState, 'not-current-scene');
                    scope.trackedSpriteStates.delete(spriteState);
                    return;
                }
                if (spriteState.overlaySprite && scope.activeSprites.has(spriteState.sprite)) return;
                Array.from(spriteState.entries.values()).forEach((entry) => {
                    if (!entry || entry.stale) return;
                    updateEntryVisibility(entry);
                });
            });
            Array.from(scope.trackedParentRuns).forEach((run) => {
                if (!run || run.stale) {
                    scope.trackedParentRuns.delete(run);
                    return;
                }
                if (!run.parent || run.parent._destroyed) {
                    removeParentRun(run, 'parent-destroyed');
                    return;
                }
                if (!isDisplayObjectInCurrentScene(run.parent)) {
                    removeParentRun(run, 'not-current-scene');
                    return;
                }
                if (run.overlaySprite && scope.activeParents.has(run.parent)) return;
                updateRunVisibility(run);
            });
        }
        
        /**
         * Sync overlay transforms and retire overlays whose sources disappeared.
         */
        function syncActiveOverlays() {
            Array.from(scope.activeSprites).forEach((sprite) => {
                const state = scope.spriteStates.get(sprite);
                if (!syncSpriteOverlay(state)) scope.activeSprites.delete(sprite);
            });
            Array.from(scope.activeParents).forEach((parent) => {
                const runState = scope.parentRunStates.get(parent);
                if (!runState || !runState.runs) {
                    scope.activeParents.delete(parent);
                    return;
                }
                if (runState.overlayCarrier) syncParentRunOverlayCarrier(parent, runState.overlayCarrier);
                let anyAlive = false;
                runState.runs.forEach((run) => {
                    if (syncParentRun(run)) anyAlive = true;
                });
                if (!anyAlive) {
                    scope.activeParents.delete(parent);
                    releaseParentRunOverlayCarrier(parent);
                }
            });
        }
        
        /**
         * Process one Sprite-owned bitmap surface into text entries.
         */
        function processSpriteSurface(sprite, reason = 'frame') {
            if (!sprite || sprite._destroyed || sprite._trSpriteTextObserverBypass) return;
            const spriteState = ensureSpriteState(sprite);
            if (!sprite.parent) {
                retireAllSpriteEntries(spriteState, 'not-attached');
                return;
            }
            if (!isDisplayObjectInCurrentScene(sprite)) {
                retireAllSpriteEntries(spriteState, 'not-current-scene');
                return;
            }
        
            let bitmap = null;
            try { bitmap = sprite.bitmap; } catch (_) { bitmap = null; }
            spriteState.bitmap = bitmap;
            spriteState.singleGlyphCandidate = null;
        
            if (!bitmap || isWindowOwnedBitmap(bitmap) || isOverlayBitmap(bitmap)) {
                retireAllSpriteEntries(spriteState, 'bitmap-missing');
                return;
            }
        
            const bitmapState = getBitmapState(bitmap);
            if (!bitmapState || bitmapState.destroyed || !Array.isArray(bitmapState.textOps) || !bitmapState.textOps.length) {
                retireAllSpriteEntries(spriteState, 'no-text');
                return;
            }
            if (bitmapState.unsupportedPaint) {
                retireAllSpriteEntries(spriteState, 'unsupported-paint');
                return;
            }
        
            const groups = buildTextGroups(bitmapState.textOps);
            const nextKeys = new Set();
            groups.forEach((group) => {
                const entry = createOrUpdateEntry(spriteState, group, bitmapState);
                if (!entry) return;
                nextKeys.add(entry.key);
                updateEntryVisibility(entry);
            });
            Array.from(spriteState.entries.entries()).forEach(([key, entry]) => {
                if (!nextKeys.has(key)) {
                    retireSpriteEntry(entry, 'not-seen');
                    spriteState.entries.delete(key);
                }
            });
        
            const liveEntries = Array.from(spriteState.entries.values()).filter((entry) => entry && !entry.stale);
            if (liveEntries.length === 1 && textUnitCount(liveEntries[0].trimmedText) === 1) {
                spriteState.singleGlyphCandidate = createGlyphCandidate(spriteState, liveEntries[0]);
                removeSpriteOverlay(spriteState, 'single-glyph-parent-owned');
                markParentDirty(sprite.parent, 'single-glyph');
                return;
            }
        
            if (sprite._trSpriteTextGroupedRunId) {
                removeSpriteOverlay(spriteState, 'parent-run-active');
                return;
            }
        
            liveEntries.forEach(requestEntryTranslation);
            if (liveEntries.some(hasRenderedTranslation)) {
                renderSpriteOverlay(spriteState, reason);
            }
        }
        
        /**
         * Retire every active entry for one Sprite state.
         */
        function retireAllSpriteEntries(spriteState, reason) {
            if (!spriteState) return;
            Array.from(spriteState.entries.values()).forEach((entry) => retireSpriteEntry(entry, reason));
            spriteState.entries.clear();
            spriteState.singleGlyphCandidate = null;
            removeSpriteOverlay(spriteState, reason);
        }

        return { installChildObservers, installChildObserverOn, wrapChildMethod, observeChildAdded, observeChildRemoved, visitDisplayTree, installFrameHooks, hasFrameHooksActive, ensureFrameHooks, scheduleFallbackFrameFlush, installFrameHook, hasHookInChain, flushFrame, adoptCurrentSceneSprites, adoptSpriteTree, flushPendingBitmapOwnerClaims, flushBitmapFallbackAfterSprite, syncTrackedVisibility, syncActiveOverlays, processSpriteSurface, retireAllSpriteEntries };
    }

    defineRuntimeModule('adapters.spriteText.frame', { createController });
})();
