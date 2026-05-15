// Sprite text adapter support: parent run lifecycle.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/parent-run-lifecycle.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            addSourceRenderSkipGuard,
            areAncestorsOpen,
            attachParentRunOverlay,
            bucket,
            copyRunReferenceVisualState,
            finiteNumber,
            isDisplayObjectOpen,
            isSpriteSourceRenderableInOpenParent,
            isValidRect,
            parentHasLiveRunOverlay,
            readFrameKey,
            rectCenterY,
            refreshGlyphCandidateLayout,
            refreshSourceRenderSuppression,
            releaseParentRunOverlayCarrier,
            removeSourceRenderSkipGuard,
            updateRunVisibility,
        } = Object.fromEntries([
            'addSourceRenderSkipGuard',
            'areAncestorsOpen',
            'attachParentRunOverlay',
            'bucket',
            'copyRunReferenceVisualState',
            'finiteNumber',
            'isDisplayObjectOpen',
            'isSpriteSourceRenderableInOpenParent',
            'isValidRect',
            'parentHasLiveRunOverlay',
            'readFrameKey',
            'rectCenterY',
            'refreshGlyphCandidateLayout',
            'refreshSourceRenderSuppression',
            'releaseParentRunOverlayCarrier',
            'removeSourceRenderSkipGuard',
            'updateRunVisibility',
        ].map((name) => [name, callScope(name)]));

        /**
         * Hide all glyph source Sprites for a translated run.
         */
        function hideRunSources(run, suppressed) {
            if (!run || !Array.isArray(run.group)) return;
            run.group.forEach((item) => {
                const sprite = item && item.sprite;
                if (!sprite) return;
                addSourceRenderSkipGuard(sprite, run.id, () => shouldRenderParentRunOverlay(run), { refresh: false });
                try { sprite._trSpriteTextRunHiddenBy = run.id; } catch (_) {}
            });
            applyRunSourceSuppression(run, suppressed === true);
        }
        
        /**
         * Cache source glyph suppression once per frame instead of evaluating guards during render.
         */
        function applyRunSourceSuppression(run, suppressed) {
            if (!run || !Array.isArray(run.group)) return;
            run.group.forEach((item) => {
                const sprite = item && item.sprite;
                if (sprite && sprite._trSpriteTextRunHiddenBy === run.id) {
                    refreshSourceRenderSuppression(sprite, suppressed === true);
                }
            });
        }
        
        /**
         * Restore glyph source Sprites after run removal.
         */
        function restoreRunSources(run) {
            if (!run || !Array.isArray(run.group)) return;
            run.group.forEach((item) => {
                const sprite = item && item.sprite;
                if (!sprite) return;
                removeSourceRenderSkipGuard(sprite, run.id);
                try {
                    if (sprite._trSpriteTextRunHiddenBy === run.id) delete sprite._trSpriteTextRunHiddenBy;
                    if (sprite._trSpriteTextGroupedRunId === run.id) delete sprite._trSpriteTextGroupedRunId;
                } catch (_) {}
            });
        }
        
        /**
         * Remove a parent glyph run and retire it from orchestrator state.
         */
        function removeParentRun(run, reason = 'remove', details = null, status = 'stale') {
            if (!run || run.stale) return false;
            run.stale = true;
            clearParentRunSlot(run);
            const state = run.parent ? scope.parentRunStates.get(run.parent) : null;
            if (state && state.runs && state.runs.get(run.key) === run) state.runs.delete(run.key);
            scope.recordsByItemId.delete(run.recordId);
            scope.trackedParentRuns.delete(run);
            scope.adapterContract.cancelItemTranslation(run, reason, { abortJob: true });
            scope.adapterContract.retireItem(run, status || 'stale', {
                eventType: status === 'stale' ? 'item.stale' : `item.${status || 'stale'}`,
                message: reason,
                details: Object.assign({
                    mode: 'sprite-run',
                    glyphs: run.group ? run.group.length : 0,
                    slotKey: run.slotKey || '',
                }, details || {}),
            });
            const overlay = run.overlaySprite;
            if (overlay && overlay.parent && typeof overlay.parent.removeChild === 'function') {
                try { overlay.parent.removeChild(overlay); } catch (_) {}
            }
            restoreRunSources(run);
            if (parentHasLiveRunOverlay(run.parent)) scope.activeParents.add(run.parent);
            else {
                scope.activeParents.delete(run.parent);
                releaseParentRunOverlayCarrier(run.parent);
            }
            return true;
        }
        
        /**
         * Sync a parent-run overlay with live glyph positions.
         */
        function syncParentRun(run) {
            if (!run || run.stale || !run.overlaySprite || !run.parent || run.parent._destroyed) return false;
            if (!isActiveParentRunSlot(run)) {
                removeParentRun(run, 'sprite-run-slot-inactive');
                return false;
            }
            const bounds = run.bounds || { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
            bounds.x1 = Infinity;
            bounds.y1 = Infinity;
            bounds.x2 = -Infinity;
            bounds.y2 = -Infinity;
            for (const item of run.group) {
                if (!refreshGlyphCandidateLayout(item)) {
                    removeParentRun(run, 'candidate-gone');
                    return false;
                }
                bounds.x1 = Math.min(bounds.x1, item.x);
                bounds.y1 = Math.min(bounds.y1, item.y);
                bounds.x2 = Math.max(bounds.x2, item.x + item.width);
                bounds.y2 = Math.max(bounds.y2, item.y + item.height);
            }
            run.bounds = bounds;
            if (!isValidRect(run.bounds)) {
                removeParentRun(run, 'layout-invalid');
                return false;
            }
            const outline = run.drawState && Number.isFinite(Number(run.drawState.outlineWidth))
                ? Math.max(2, Number(run.drawState.outlineWidth) + 2)
                : 3;
            const reference = run.group && run.group[0] ? run.group[0].sprite : null;
            if (reference) copyRunReferenceVisualState(reference, run.overlaySprite);
            run.overlaySprite.x = Math.floor(run.bounds.x1 - outline);
            run.overlaySprite.y = Math.floor(run.bounds.y1);
            if (!attachParentRunOverlay(run)) {
                removeParentRun(run, 'attach-failed');
                return false;
            }
            const renderable = refreshParentRunRenderable(run);
            run.overlaySprite.renderable = renderable;
            applyRunSourceSuppression(run, renderable);
            updateRunVisibility(run, renderable);
            return true;
        }
        
        /**
         * Return true when a parent-run overlay should render.
         */
        function shouldRenderParentRunOverlay(run) {
            if (!run || run.stale || !run.overlaySprite || !run.parent || run.parent._destroyed) return false;
            const frameKey = readFrameKey();
            if (frameKey !== null
                && run._trRenderableFrameKey === frameKey
                && typeof run._trOverlayRenderable === 'boolean') {
                return run._trOverlayRenderable;
            }
            return refreshParentRunRenderable(run, frameKey);
        }
        
        /**
         * Recompute and cache parent-run visibility once per frame.
         */
        function refreshParentRunRenderable(run, frameKey = readFrameKey()) {
            const renderable = computeParentRunRenderable(run);
            if (run) {
                run._trOverlayRenderable = renderable;
                run._trRenderableFrameKey = frameKey;
            }
            return renderable;
        }
        
        /**
         * Compute parent-run visibility without repeating parent-chain checks per glyph.
         */
        function computeParentRunRenderable(run) {
            if (!run || run.stale || !run.overlaySprite || !run.parent || run.parent._destroyed) return false;
            if (!isDisplayObjectOpen(run.parent) || run.parent.renderable === false || !areAncestorsOpen(run.parent)) return false;
            if (!Array.isArray(run.group) || !run.group.length) return false;
            return run.group.every((item) => isSpriteSourceRenderableInOpenParent(item && item.sprite, run.parent));
        }
        
        /**
         * Claim all glyph entries for a parent run.
         */
        function claimGlyphGroupForRun(group, run) {
            if (!Array.isArray(group) || !run) return;
            group.forEach((item) => {
                const entry = item && item.entry;
                if (!entry) return;
                entry.parentRunId = run.id;
                entry.deferTracker = true;
                try { item.sprite._trSpriteTextGroupedRunId = run.id; } catch (_) {}
            });
        }
        
        /**
         * Return one parent's run map, creating state as needed.
         */
        function getParentRunMap(parent) {
            const state = ensureParentRunState(parent);
            if (!state) return new Map();
            return state.runs;
        }
        
        /**
         * Return one parent's run state, creating it as needed.
         */
        function ensureParentRunState(parent) {
            if (!parent) return null;
            let state = scope.parentRunStates.get(parent);
            if (!state) {
                state = {
                    runs: new Map(),
                    slots: new Map(),
                    overlayCarrier: null,
                    id: `sprp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                };
                scope.parentRunStates.set(parent, state);
            }
            if (!state.runs || typeof state.runs.set !== 'function') state.runs = new Map();
            if (!state.slots || typeof state.slots.set !== 'function') state.slots = new Map();
            return state;
        }
        
        /**
         * Return one parent's slot map, creating state as needed.
         */
        function getParentRunSlotMap(parent) {
            const state = ensureParentRunState(parent);
            return state && state.slots ? state.slots : null;
        }
        
        /**
         * Register a run as the active owner for its parent slot.
         */
        function registerParentRunSlot(run) {
            if (!run || run.stale || !run.parent || !run.slotKey) return false;
            const slots = getParentRunSlotMap(run.parent);
            if (!slots) return false;
            const previous = findParentRunSlotMatch(run);
            if (previous && previous.run && previous.run !== run) {
                if (isParentRunTextExtension(previous.run, run)) {
                    removeParentRun(previous.run, 'sprite-run-superseded', {
                        slotKey: run.slotKey,
                        supersededBy: run.recordId,
                        supersededByText: run.trimmedText,
                    });
                } else if (isParentRunTextExtension(run, previous.run)) {
                    removeParentRun(run, 'sprite-run-superseded', {
                        slotKey: previous.run.slotKey,
                        supersededBy: previous.run.recordId,
                        supersededByText: previous.run.trimmedText,
                    });
                    return false;
                } else {
                    removeParentRun(previous.run, 'sprite-run-slot-replaced', {
                        slotKey: run.slotKey,
                        replacedBy: run.recordId,
                        replacedByText: run.trimmedText,
                    });
                }
                if (previous.key) slots.delete(previous.key);
            }
            slots.set(run.slotKey, run);
            return true;
        }
        
        /**
         * Find an exact or nearby parent-run slot match.
         */
        function findParentRunSlotMatch(run) {
            const slots = run && run.parent ? getParentRunSlotMap(run.parent) : null;
            if (!slots) return null;
            const exact = run.slotKey ? slots.get(run.slotKey) : null;
            if (exact && exact !== run && !exact.stale) return { key: run.slotKey, run: exact };
            for (const [key, candidate] of slots.entries()) {
                if (!candidate || candidate === run || candidate.stale) {
                    slots.delete(key);
                    continue;
                }
                if (areParentRunSlotsCompatible(candidate, run)) return { key, run: candidate };
            }
            return null;
        }
        
        /**
         * Clear a run from its active parent slot map.
         */
        function clearParentRunSlot(run) {
            if (!run || !run.parent || !run.slotKey) return;
            const slots = getParentRunSlotMap(run.parent);
            if (slots && slots.get(run.slotKey) === run) slots.delete(run.slotKey);
        }
        
        /**
         * Return true when a run is still the active owner of its slot.
         */
        function isActiveParentRunSlot(run) {
            const slots = run && run.parent ? getParentRunSlotMap(run.parent) : null;
            return !!(slots && run.slotKey && slots.get(run.slotKey) === run);
        }
        
        /**
         * Decide whether two parent-run slots represent the same text position.
         */
        function areParentRunSlotsCompatible(a, b) {
            if (!a || !b || a === b || a.parent !== b.parent) return false;
            if (a.fontSignature !== b.fontSignature || a.layerKey !== b.layerKey) return false;
            if (!isValidRect(a.bounds) || !isValidRect(b.bounds)) return false;
            const tolerance = Math.max(8, Math.ceil(Math.max(a.lineHeight || 24, b.lineHeight || 24) * 0.85));
            return Math.abs(a.bounds.x1 - b.bounds.x1) <= tolerance
                && Math.abs(rectCenterY(a.bounds) - rectCenterY(b.bounds)) <= tolerance;
        }
        
        /**
         * Return true when a new run is a prefix extension of an older run.
         */
        function isParentRunTextExtension(previous, next) {
            const oldText = String(previous && previous.trimmedText || '');
            const newText = String(next && next.trimmedText || '');
            return !!oldText && newText.length > oldText.length && newText.indexOf(oldText) === 0;
        }
        
        /**
         * Build a stable slot key for a parent glyph run.
         */
        function createParentRunSlotKey(group, bounds) {
            const first = Array.isArray(group) && group.length ? group[0] : null;
            const lineHeight = Math.max(1, Number(first && first.lineHeight) || Number(bounds && (bounds.y2 - bounds.y1)) || 24);
            const xBucketSize = Math.max(8, Math.ceil(lineHeight * 0.5));
            const yBucketSize = Math.max(12, Math.ceil(lineHeight * 0.85));
            return [
                first && first.fontSignature ? first.fontSignature : '',
                parentRunLayerKey(group),
                bucket(bounds && bounds.x1, xBucketSize),
                bucket(rectCenterY(bounds), yBucketSize),
            ].join('|');
        }
        
        /**
         * Return a layer key from the first glyph's z fields.
         */
        function parentRunLayerKey(group) {
            const first = Array.isArray(group) && group.length ? group[0] : null;
            const sprite = first && first.sprite;
            return `${Math.round(finiteNumber(sprite && sprite.z, 0))}:${Math.round(finiteNumber(sprite && sprite.zIndex, 0))}`;
        }

        return { hideRunSources, applyRunSourceSuppression, restoreRunSources, removeParentRun, syncParentRun, shouldRenderParentRunOverlay, refreshParentRunRenderable, computeParentRunRenderable, claimGlyphGroupForRun, getParentRunMap, ensureParentRunState, getParentRunSlotMap, registerParentRunSlot, findParentRunSlotMatch, clearParentRunSlot, isActiveParentRunSlot, areParentRunSlotsCompatible, isParentRunTextExtension, createParentRunSlotKey, parentRunLayerKey };
    }

    defineRuntimeModule('adapters.spriteText.parentrunlifecycle', { createController });
})();
