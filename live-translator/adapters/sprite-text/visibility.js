// Sprite text adapter support: visibility.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/visibility.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            getRecordStatus,
            getSpriteObservationStatus,
            hasRenderedTranslation,
            isRecordActive,
            observeEntry,
            observeRun,
            shouldRenderParentRunOverlay,
            shouldRenderSpriteOverlay,
            stringify,
        } = Object.fromEntries([
            'getRecordStatus',
            'getSpriteObservationStatus',
            'hasRenderedTranslation',
            'isRecordActive',
            'observeEntry',
            'observeRun',
            'shouldRenderParentRunOverlay',
            'shouldRenderSpriteOverlay',
            'stringify',
        ].map((name) => [name, callScope(name)]));

        /**
         * Terminal sprite records are often redrawn every frame. Once the same
         * source, slot, and bounds are already observed, visibility APIs can
         * keep screen state current without adding duplicate lifecycle events.
         */
        function shouldPublishObservation(record, payload) {
            if (!record || !payload) return true;
            if (!isRecordActive(record)) return true;
            if (!isTerminalSpriteRecord(record, payload.status)) return true;
            return record._trLastObservationSignature !== createObservationSignature(payload);
        }
        
        function createObservationSignature(payload) {
            const bounds = payload && payload.bounds ? payload.bounds : null;
            return [
                stringify(payload && payload.sourceAdapter),
                stringify(payload && payload.surfaceId),
                stringify(payload && payload.slotKey),
                stringify(payload && payload.rawText),
                stringify(payload && payload.normalizedSource),
                normalizeRectSignature(bounds),
            ].join('|');
        }
        
        function normalizeRectSignature(bounds) {
            if (!bounds) return '';
            return [
                normalizeSignatureNumber(bounds.x1),
                normalizeSignatureNumber(bounds.y1),
                normalizeSignatureNumber(bounds.x2),
                normalizeSignatureNumber(bounds.y2),
            ].join(',');
        }
        
        function normalizeSignatureNumber(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? String(Math.round(numeric * 1000) / 1000) : '';
        }
        
        /**
         * Update orchestrator visibility for a sprite-bitmap entry.
         */
        function updateEntryVisibility(entry, knownVisible) {
            if (!entry || entry.stale || entry.deferTracker || entry.parentRunId || !entry.recordId) return;
            const visible = typeof knownVisible === 'boolean' ? knownVisible : isSpriteEntryScreenVisible(entry);
            if (!isRecordActive(entry)) {
                if (visible) observeEntry(entry, getSpriteObservationStatus(entry, 'detected'));
                if (!isRecordActive(entry)) return;
            }
            syncRecordVisibility(entry, visible, visible ? 'sprite-visible' : 'sprite-hidden');
            if (!visible && isTerminalSpriteRecord(entry)) {
                deactivateHiddenSpriteRecord(entry, 'sprite-hidden', {
                    mode: 'sprite-bitmap',
                    spriteId: entry.spriteState ? entry.spriteState.id : '',
                });
            }
        }
        
        /**
         * Update orchestrator visibility for a parent glyph run.
         */
        function updateRunVisibility(run, knownVisible) {
            if (!run || run.stale || !run.recordId) return;
            const visible = typeof knownVisible === 'boolean' ? knownVisible : isParentRunScreenVisible(run);
            if (!isRecordActive(run)) {
                if (visible) observeRun(run, getSpriteObservationStatus(run, 'detected'));
                if (!isRecordActive(run)) return;
            }
            syncRecordVisibility(run, visible, visible ? 'sprite-run-visible' : 'sprite-run-hidden');
            if (!visible && isTerminalSpriteRecord(run)) {
                deactivateHiddenSpriteRecord(run, 'sprite-run-hidden', {
                    mode: 'sprite-run',
                    glyphs: run.group ? run.group.length : 0,
                    slotKey: run.slotKey || '',
                });
            }
        }
        
        /**
         * Push visibility and scheduler priority only when state actually changes.
         */
        function syncRecordVisibility(record, visible, reason) {
            const screenState = visible ? 'visible' : 'hidden';
            if (record._trLastVisible !== visible || record._trLastScreenState !== screenState) {
                scope.adapterContract.setItemVisibility(record, visible, {
                    reason,
                    screenState,
                });
                record._trLastVisible = visible;
                record._trLastScreenState = screenState;
            }
            const priority = visible ? scope.SPRITE_PRIORITY : 100;
            if (record._trLastPriority !== priority) {
                scope.adapterContract.setItemTranslationPriority(record, priority, reason);
                record._trLastPriority = priority;
            }
        }
        
        /**
         * Remember visibility already sent as part of an observe payload.
         */
        function markRecordVisibilitySynced(record, visible, screenState, priority) {
            if (!record) return;
            record._trLastVisible = visible;
            record._trLastScreenState = screenState;
            record._trLastPriority = priority;
        }
        
        /**
         * Move terminal off-screen sprite records out of the active diagnostics set.
         */
        function deactivateHiddenSpriteRecord(record, reason, details) {
            if (!record || !record.recordId || !isRecordActive(record)) return false;
            scope.adapterContract.retireItem(record, 'disappeared', {
                eventType: 'item.disappeared',
                message: reason || 'sprite-hidden',
                details,
            });
            return true;
        }
        
        /**
         * Terminal records no longer have active scheduler work to preserve.
         */
        function isTerminalSpriteRecord(record, statusOverride = '') {
            if (hasRenderedTranslation(record) || (record && record.skipReason)) return true;
            const status = String(statusOverride || getRecordStatus(record) || '');
            return status === 'completed' || status === 'skipped' || status === 'failed';
        }
        
        /**
         * Return true when a sprite entry is currently visible.
         */
        function isSpriteEntryScreenVisible(entry) {
            if (!entry || entry.stale || !entry.spriteState || !entry.spriteState.sprite) return false;
            const spriteState = entry.spriteState;
            if (spriteState.overlaySprite) return shouldRenderSpriteOverlay(spriteState);
            return isSpriteSourceRenderableNow(spriteState.sprite, spriteState.sprite ? spriteState.sprite.parent : null);
        }
        
        /**
         * Return true when a parent run is currently visible.
         */
        function isParentRunScreenVisible(run) {
            if (!run || run.stale || !run.parent || run.parent._destroyed) return false;
            if (run.overlaySprite) return shouldRenderParentRunOverlay(run);
            if (!isDisplayObjectOpen(run.parent) || run.parent.renderable === false || !areAncestorsOpen(run.parent)) return false;
            return Array.isArray(run.group) && run.group.every((item) => isSpriteSourceRenderableInOpenParent(item && item.sprite, run.parent));
        }
        
        /**
         * Return true when a source Sprite is renderable and attached.
         */
        function isSpriteSourceRenderableNow(sprite, expectedParent) {
            if (!sprite || sprite._destroyed || !sprite.parent) return false;
            if (expectedParent && sprite.parent !== expectedParent) return false;
            if (!isDisplayObjectOpen(sprite) || sprite.renderable === false) return false;
            if (!hasVisibleFrame(sprite)) return false;
            return areAncestorsOpen(sprite);
        }
        
        /**
         * Return true when a source sprite is visible and its parent chain was already checked.
         */
        function isSpriteSourceRenderableInOpenParent(sprite, expectedParent) {
            if (!sprite || sprite._destroyed || !sprite.parent) return false;
            if (expectedParent && sprite.parent !== expectedParent) return false;
            if (!isDisplayObjectOpen(sprite) || sprite.renderable === false) return false;
            return hasVisibleFrame(sprite);
        }
        
        /**
         * Return true when a display object itself is open/visible.
         */
        function isDisplayObjectOpen(displayObject) {
            if (!displayObject || displayObject._destroyed) return false;
            if (displayObject.visible === false || displayObject._hidden === true) return false;
            if (!hasPositiveOpacity(displayObject)) return false;
            const openness = Number(displayObject.openness);
            if (displayObject._isWindow && Number.isFinite(openness) && openness <= 0) return false;
            return true;
        }
        
        /**
         * Return true when display object alpha/opacity are positive.
         */
        function hasPositiveOpacity(displayObject) {
            const alpha = Number(displayObject && displayObject.alpha);
            if (Number.isFinite(alpha) && alpha <= 0) return false;
            const opacity = Number(displayObject && displayObject.opacity);
            if (Number.isFinite(opacity) && opacity <= 0) return false;
            return true;
        }
        
        /**
         * Return true when sprite frame dimensions are non-empty.
         */
        function hasVisibleFrame(sprite) {
            if (!sprite || !sprite._frame) return true;
            const width = Number(sprite._frame.width);
            const height = Number(sprite._frame.height);
            return !(Number.isFinite(width) && Number.isFinite(height) && (width <= 0 || height <= 0));
        }
        
        /**
         * Validate the parent chain up to the root.
         */
        function areAncestorsOpen(displayObject) {
            if (!isDisplayObjectInCurrentScene(displayObject)) return false;
            let child = displayObject || null;
            let parent = child ? child.parent : null;
            while (parent) {
                if (!isChildInParent(child, parent)) return false;
                if (!isDisplayObjectOpen(parent) || parent.renderable === false) return false;
                child = parent;
                parent = parent.parent || null;
            }
            return true;
        }
        
        /**
         * A detached old scene can keep an internally consistent parent chain.
         * When SceneManager exposes the current scene, require sprite records to
         * belong to that tree before considering them visible.
         */
        function isDisplayObjectInCurrentScene(displayObject) {
            const scene = scope.globalScope.SceneManager && scope.globalScope.SceneManager._scene;
            if (!scene || !displayObject) return true;
            let cursor = displayObject;
            let depth = 0;
            while (cursor && depth < 128) {
                if (cursor === scene) return true;
                cursor = cursor.parent || null;
                depth += 1;
            }
            return false;
        }
        
        /**
         * Return true when child is still present in parent.children.
         */
        function isChildInParent(child, parent) {
            if (!child || !parent || child.parent !== parent) return false;
            const children = Array.isArray(parent.children) ? parent.children : null;
            return children ? children.indexOf(child) >= 0 : true;
        }
        
        /**
         * Read the engine frame counter when available so repeated hooks can coalesce work.
         */
        function readFrameKey() {
            try {
                const graphicsFrame = scope.globalScope.Graphics && Number(scope.globalScope.Graphics.frameCount);
                if (Number.isFinite(graphicsFrame)) return graphicsFrame;
            } catch (_) {}
            try {
                const sceneFrame = scope.globalScope.SceneManager && Number(scope.globalScope.SceneManager._frameCount);
                if (Number.isFinite(sceneFrame)) return sceneFrame;
            } catch (_) {}
            return null;
        }

        return { shouldPublishObservation, createObservationSignature, normalizeRectSignature, normalizeSignatureNumber, updateEntryVisibility, updateRunVisibility, syncRecordVisibility, markRecordVisibilitySynced, deactivateHiddenSpriteRecord, isTerminalSpriteRecord, isSpriteEntryScreenVisible, isParentRunScreenVisible, isSpriteSourceRenderableNow, isSpriteSourceRenderableInOpenParent, isDisplayObjectOpen, hasPositiveOpacity, hasVisibleFrame, areAncestorsOpen, isDisplayObjectInCurrentScene, isChildInParent, readFrameKey };
    }

    defineRuntimeModule('adapters.spriteText.visibility', { createController });
})();
