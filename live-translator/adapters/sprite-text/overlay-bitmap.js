// Sprite text adapter support: overlay bitmap.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/overlay-bitmap.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            attachOverlayAfterSource,
            copySpriteVisualState,
            createOverlaySprite,
            getBitmapState,
            hasRenderedTranslation,
            hideSpriteSource,
            logOverlayDraw,
            rectHasArea,
            refreshSpriteOverlayRenderable,
            removeSpriteOverlay,
            shouldRenderSpriteOverlay,
            stringify,
            warn,
        } = Object.fromEntries([
            'attachOverlayAfterSource',
            'copySpriteVisualState',
            'createOverlaySprite',
            'getBitmapState',
            'hasRenderedTranslation',
            'hideSpriteSource',
            'logOverlayDraw',
            'rectHasArea',
            'refreshSpriteOverlayRenderable',
            'removeSpriteOverlay',
            'shouldRenderSpriteOverlay',
            'stringify',
            'warn',
        ].map((name) => [name, callScope(name)]));

        /**
         * Build and attach an overlay for completed entries on one Sprite.
         */
        function renderSpriteOverlay(spriteState, source = 'translation') {
            return scope.measurePerf('spriteText.renderOverlay.ms', () => renderSpriteOverlayNow(spriteState, source));
        }
        
        function renderSpriteOverlayNow(spriteState, source = 'translation') {
            scope.perf.count('spriteText.overlay.render.calls');
            scope.perf.top('spriteText.overlay.renderSource', source || 'unknown');
            if (!spriteState || !spriteState.sprite || !spriteState.bitmap) return false;
            const bitmapState = getBitmapState(spriteState.bitmap);
            if (!bitmapState || bitmapState.destroyed || bitmapState.unsupportedPaint) {
                scope.perf.top('spriteText.overlay.renderStatus', bitmapState && bitmapState.unsupportedPaint ? 'unsupported-paint' : 'no-bitmap-state');
                removeSpriteOverlay(spriteState, bitmapState && bitmapState.unsupportedPaint ? 'unsupported-paint' : 'no-bitmap-state');
                return false;
            }
        
            const entries = Array.from(spriteState.entries.values()).filter((entry) => entry && !entry.stale);
            const hasCompleted = entries.some(hasRenderedTranslation);
            if (!hasCompleted) {
                scope.perf.top('spriteText.overlay.renderStatus', 'no-completed-entry');
                removeSpriteOverlay(spriteState, 'no-completed-entry');
                return false;
            }
        
            const overlayBitmap = getCachedSpriteOverlayBitmap(spriteState.bitmap, bitmapState, entries);
            if (!overlayBitmap) {
                scope.perf.top('spriteText.overlay.renderStatus', 'bitmap-create-failed');
                return false;
            }
            scope.perf.count('spriteText.overlay.render.entries', entries.length);
            scope.perf.count('spriteText.overlay.render.paintOps', Array.isArray(bitmapState.paintOps) ? bitmapState.paintOps.length : 0);
        
            let overlay = spriteState.overlaySprite;
            if (!overlay || overlay._destroyed) {
                overlay = createOverlaySprite();
                if (!overlay) return false;
                spriteState.overlaySprite = overlay;
            }
            try {
                overlay._trSpriteTextObserverBypass = true;
                overlay._trSpriteTextShouldRender = () => shouldRenderSpriteOverlay(spriteState);
                if (overlay.bitmap !== overlayBitmap) overlay.bitmap = overlayBitmap;
                spriteState.overlayBitmap = overlayBitmap;
                copySpriteVisualState(spriteState.sprite, overlay);
                if (!attachOverlayAfterSource(spriteState.sprite, overlay)) {
                    scope.perf.top('spriteText.overlay.renderStatus', 'attach-failed');
                    removeSpriteOverlay(spriteState, 'attach-failed');
                    return false;
                }
                overlay.renderable = refreshSpriteOverlayRenderable(spriteState);
                hideSpriteSource(spriteState);
                scope.activeSprites.add(spriteState.sprite);
                logOverlayDraw('sprite-bitmap', source, entries);
                scope.perf.top('spriteText.overlay.renderStatus', 'rendered');
                return true;
            } catch (error) {
                warn('[SpriteText] Failed to render sprite overlay.', error);
                scope.perf.top('spriteText.overlay.renderStatus', 'render-error');
                removeSpriteOverlay(spriteState, 'render-error');
                return false;
            }
        }
        
        /**
         * Reuse the same rendered overlay pixels while bitmap content and text stay identical.
         */
        function getCachedSpriteOverlayBitmap(sourceBitmap, bitmapState, entries) {
            if (!sourceBitmap || !bitmapState) return null;
            const cacheKey = createSpriteOverlayCacheKey(sourceBitmap, bitmapState, entries);
            const cached = bitmapState.overlayCache;
            if (cached && cached.key === cacheKey && cached.bitmap && !cached.bitmap._destroyed) {
                scope.perf.count('spriteText.overlay.cache.hit');
                return cached.bitmap;
            }
        
            scope.perf.count('spriteText.overlay.cache.miss');
            const overlayBitmap = createOverlayBitmapFromSource(sourceBitmap);
            if (!overlayBitmap) return null;
            if (copySourceBitmapToOverlay(sourceBitmap, overlayBitmap)) {
                clearOverlayTextRegions(overlayBitmap, entries);
                restoreOverlayTextRegions(overlayBitmap, entries);
            } else {
                replayPaintOps(overlayBitmap, bitmapState.paintOps);
            }
            entries
                .slice()
                .sort((a, b) => ((a.group && a.group.drawOrder) || 0) - ((b.group && b.group.drawOrder) || 0))
                .forEach((entry) => {
                    const text = hasRenderedTranslation(entry) ? entry.renderedText : entry.rawText;
                    drawTextToBitmap(overlayBitmap, entry.group, text, {
                        scaleText: hasRenderedTranslation(entry),
                    });
                });
            bitmapState.overlayCache = { key: cacheKey, bitmap: overlayBitmap };
            return overlayBitmap;
        }
        
        /**
         * Build a compact signature for translated pixels, style, and source revision.
         */
        function createSpriteOverlayCacheKey(sourceBitmap, bitmapState, entries) {
            const width = Math.max(1, Math.ceil(Number(sourceBitmap && sourceBitmap.width) || 1));
            const height = Math.max(1, Math.ceil(Number(sourceBitmap && sourceBitmap.height) || 1));
            const entryKey = (Array.isArray(entries) ? entries : [])
                .slice()
                .sort((a, b) => String(a && a.key || '').localeCompare(String(b && b.key || '')))
                .map(createSpriteOverlayEntryCacheKey)
                .join('\x1e');
            return [
                bitmapState.id || '',
                Number(bitmapState.revision) || 0,
                width,
                height,
                entryKey,
            ].join('\x1f');
        }
        
        /**
         * Include all fields that affect overlay text pixels.
         */
        function createSpriteOverlayEntryCacheKey(entry) {
            const group = entry && entry.group ? entry.group : {};
            const params = group.drawParams || {};
            const bounds = group.bounds || {};
            const drawState = group.drawState || {};
            const text = hasRenderedTranslation(entry)
                ? entry.renderedText
                : entry && entry.rawText;
            return [
                entry && entry.key || '',
                hasRenderedTranslation(entry) ? 'translated' : 'source',
                stringify(text),
                group.methodName || 'drawText',
                roundCacheNumber(params.x),
                roundCacheNumber(params.y),
                roundCacheNumber(params.maxWidth),
                roundCacheNumber(params.lineHeight),
                params.align || '',
                roundCacheNumber(bounds.x1),
                roundCacheNumber(bounds.y1),
                roundCacheNumber(bounds.x2),
                roundCacheNumber(bounds.y2),
                group.fontSignature || '',
                stringify(drawState.fontFace),
                roundCacheNumber(drawState.fontSize),
                drawState.fontBold === true ? 'b' : '',
                drawState.fontItalic === true ? 'i' : '',
                stringify(drawState.textColor),
                stringify(drawState.outlineColor),
                roundCacheNumber(drawState.outlineWidth),
            ].join('\x1d');
        }
        
        function roundCacheNumber(value) {
            const number = Number(value);
            return Number.isFinite(number) ? Math.round(number * 100) / 100 : '';
        }
        
        function invalidateBitmapOverlayCache(state) {
            if (state) state.overlayCache = null;
        }
        
        /**
         * Create a fresh overlay bitmap matching the source Bitmap dimensions.
         */
        function createOverlayBitmapFromSource(sourceBitmap) {
            try {
                const width = Math.max(1, Math.ceil(Number(sourceBitmap && sourceBitmap.width) || 1));
                const height = Math.max(1, Math.ceil(Number(sourceBitmap && sourceBitmap.height) || 1));
                const bitmap = new Bitmap(width, height);
                bitmap._trSpriteTextOverlayBitmap = true;
                return bitmap;
            } catch (_) {
                return null;
            }
        }
        
        /**
         * Seed an overlay from current source pixels instead of replaying paint history.
         */
        function copySourceBitmapToOverlay(sourceBitmap, targetBitmap) {
            if (!sourceBitmap || !targetBitmap || typeof targetBitmap.blt !== 'function') return false;
            const width = Math.max(1, Math.min(
                Math.ceil(Number(sourceBitmap.width) || 1),
                Math.ceil(Number(targetBitmap.width) || 1)
            ));
            const height = Math.max(1, Math.min(
                Math.ceil(Number(sourceBitmap.height) || 1),
                Math.ceil(Number(targetBitmap.height) || 1)
            ));
            targetBitmap._trSpriteTextReplayDepth = (targetBitmap._trSpriteTextReplayDepth || 0) + 1;
            targetBitmap._trBitmapSkipDepth = (targetBitmap._trBitmapSkipDepth || 0) + 1;
            try {
                targetBitmap.blt(sourceBitmap, 0, 0, width, height, 0, 0, width, height);
                return true;
            } catch (_) {
                return false;
            } finally {
                targetBitmap._trBitmapSkipDepth = Math.max(0, (targetBitmap._trBitmapSkipDepth || 1) - 1);
                targetBitmap._trSpriteTextReplayDepth = Math.max(0, (targetBitmap._trSpriteTextReplayDepth || 1) - 1);
            }
        }
        
        /**
         * Remove source-language glyph pixels from a copied overlay snapshot.
         */
        function clearOverlayTextRegions(targetBitmap, entries) {
            if (!targetBitmap || typeof targetBitmap.clearRect !== 'function') return;
            forEachEntryTextRegion(entries, (region) => {
                const x = Math.max(0, Math.floor(region.x));
                const y = Math.max(0, Math.floor(region.y));
                const maxX = Math.max(0, Math.ceil(Number(targetBitmap.width) || (region.x + region.width)));
                const maxY = Math.max(0, Math.ceil(Number(targetBitmap.height) || (region.y + region.height)));
                const x2 = Math.min(maxX, Math.ceil(region.x + region.width));
                const y2 = Math.min(maxY, Math.ceil(region.y + region.height));
                if (x2 <= x || y2 <= y) return;
                targetBitmap._trSpriteTextReplayDepth = (targetBitmap._trSpriteTextReplayDepth || 0) + 1;
                targetBitmap._trBitmapSkipDepth = (targetBitmap._trBitmapSkipDepth || 0) + 1;
                try { targetBitmap.clearRect(x, y, x2 - x, y2 - y); } catch (_) {}
                finally {
                    targetBitmap._trBitmapSkipDepth = Math.max(0, (targetBitmap._trBitmapSkipDepth || 1) - 1);
                    targetBitmap._trSpriteTextReplayDepth = Math.max(0, (targetBitmap._trSpriteTextReplayDepth || 1) - 1);
                }
            });
        }

        /**
         * Restore the captured pre-text backdrop into each cleared glyph region.
         */
        function restoreOverlayTextRegions(targetBitmap, entries) {
            if (!targetBitmap || typeof targetBitmap.blt !== 'function') return;
            (Array.isArray(entries) ? entries : [])
                .slice()
                .sort((left, right) => ((left && left.group && left.group.drawOrder) || 0) - ((right && right.group && right.group.drawOrder) || 0))
                .forEach((entry) => {
                    const ops = entry && entry.group && Array.isArray(entry.group.ops) ? entry.group.ops : [];
                    ops.forEach((op) => restoreOverlayTextRegion(targetBitmap, op && op.backgroundPatch));
                });
        }

        function restoreOverlayTextRegion(targetBitmap, patch) {
            if (!targetBitmap || !patch || patch.trusted !== true || !patch.bitmap || typeof targetBitmap.blt !== 'function') return;
            const width = Math.max(1, Math.ceil(Number(patch.width) || 0));
            const height = Math.max(1, Math.ceil(Number(patch.height) || 0));
            if (!width || !height) return;
            targetBitmap._trSpriteTextReplayDepth = (targetBitmap._trSpriteTextReplayDepth || 0) + 1;
            targetBitmap._trBitmapSkipDepth = (targetBitmap._trBitmapSkipDepth || 0) + 1;
            try {
                targetBitmap.blt(patch.bitmap, 0, 0, width, height, Number(patch.x) || 0, Number(patch.y) || 0, width, height);
            } catch (_) {
                // Backdrop restoration is best-effort; translated text still renders.
            } finally {
                targetBitmap._trBitmapSkipDepth = Math.max(0, (targetBitmap._trBitmapSkipDepth || 1) - 1);
                targetBitmap._trSpriteTextReplayDepth = Math.max(0, (targetBitmap._trSpriteTextReplayDepth || 1) - 1);
            }
        }

        function forEachEntryTextRegion(entries, callback) {
            if (typeof callback !== 'function') return;
            (Array.isArray(entries) ? entries : []).forEach((entry) => {
                const ops = entry && entry.group && Array.isArray(entry.group.ops) ? entry.group.ops : [];
                if (!ops.length && entry && entry.group && rectHasArea(entry.group.bounds)) {
                    emitTextRegion(entry.group.bounds, entry.group.drawState, callback);
                    return;
                }
                ops.forEach((op) => {
                    if (!op || !rectHasArea(op.bounds)) return;
                    emitTextRegion(op.bounds, op.drawState, callback);
                });
            });
        }

        function emitTextRegion(bounds, drawState, callback) {
            if (!rectHasArea(bounds)) return;
            const outline = drawState && Number.isFinite(Number(drawState.outlineWidth))
                ? Math.max(0, Number(drawState.outlineWidth) + 2)
                : 2;
            callback({
                x: bounds.x1 - outline,
                y: bounds.y1 - outline,
                width: (bounds.x2 - bounds.x1) + (outline * 2),
                height: (bounds.y2 - bounds.y1) + (outline * 2),
            });
        }
        
        /**
         * Replay paint operations into an overlay bitmap.
         */
        function replayPaintOps(targetBitmap, paintOps) {
            (Array.isArray(paintOps) ? paintOps.slice() : [])
                .sort((a, b) => (a.drawOrder || 0) - (b.drawOrder || 0))
                .forEach((op) => replayPaintOp(targetBitmap, op));
        }
        
        /**
         * Replay one bounded paint operation into an overlay.
         */
        function replayPaintOp(targetBitmap, op) {
            if (!targetBitmap || !op || !op.methodName) return;
            targetBitmap._trSpriteTextReplayDepth = (targetBitmap._trSpriteTextReplayDepth || 0) + 1;
            targetBitmap._trBitmapSkipDepth = (targetBitmap._trBitmapSkipDepth || 0) + 1;
            try {
                if (typeof targetBitmap[op.methodName] === 'function') {
                    targetBitmap[op.methodName](...(Array.isArray(op.args) ? op.args : []));
                }
            } catch (_) {
                // Paint replay is best-effort; source bitmap pixels remain untouched.
            } finally {
                targetBitmap._trBitmapSkipDepth = Math.max(0, (targetBitmap._trBitmapSkipDepth || 1) - 1);
                targetBitmap._trSpriteTextReplayDepth = Math.max(0, (targetBitmap._trSpriteTextReplayDepth || 1) - 1);
            }
        }
        
        /**
         * Draw text into an overlay bitmap with captured style.
         */
        function drawTextToBitmap(targetBitmap, group, text, options = {}) {
            if (!targetBitmap || !group || !text) return;
            const drawState = options.scaleText ? getScaledDrawState(group.drawState) : group.drawState;
            try { scope.applyBitmapDrawState(targetBitmap, drawState); } catch (_) {}
            targetBitmap._trSpriteTextReplayDepth = (targetBitmap._trSpriteTextReplayDepth || 0) + 1;
            targetBitmap._trBitmapSkipDepth = (targetBitmap._trBitmapSkipDepth || 0) + 1;
            const previousOwner = targetBitmap._trBitmapNativeDrawOwner;
            targetBitmap._trBitmapNativeDrawOwner = 'spriteOverlayText';
            try {
                const methodName = group.methodName && typeof targetBitmap[group.methodName] === 'function'
                    ? group.methodName
                    : 'drawText';
                const drawFn = targetBitmap[methodName] || targetBitmap.drawText;
                if (typeof drawFn === 'function') {
                    drawFn.call(
                        targetBitmap,
                        text,
                        group.drawParams.x,
                        group.drawParams.y,
                        group.drawParams.maxWidth,
                        group.drawParams.lineHeight,
                        group.drawParams.align
                    );
                }
            } finally {
                if (previousOwner === undefined) {
                    try { delete targetBitmap._trBitmapNativeDrawOwner; } catch (_) { targetBitmap._trBitmapNativeDrawOwner = undefined; }
                } else {
                    targetBitmap._trBitmapNativeDrawOwner = previousOwner;
                }
                targetBitmap._trBitmapSkipDepth = Math.max(0, (targetBitmap._trBitmapSkipDepth || 1) - 1);
                targetBitmap._trSpriteTextReplayDepth = Math.max(0, (targetBitmap._trSpriteTextReplayDepth || 1) - 1);
            }
        }
        
        /**
         * Scale translated bitmap draw state when configured.
         */
        function getScaledDrawState(drawState) {
            if (!shouldScaleTranslatedText() || !drawState) return drawState;
            if (typeof scope.scaleBitmapDrawState === 'function') return scope.scaleBitmapDrawState(drawState, scope.textScaleOthers);
            const fontSize = Number(drawState.fontSize);
            if (!Number.isFinite(fontSize) || fontSize <= 0) return drawState;
            return Object.assign({}, drawState, {
                fontSize: Math.max(1, Math.round(fontSize * (scope.textScaleOthers / 100))),
            });
        }
        
        /**
         * Return true when translated overlay text should use scope.textScaleOthers.
         */
        function shouldScaleTranslatedText() {
            return Number.isInteger(scope.textScaleOthers) && scope.textScaleOthers > 0 && scope.textScaleOthers < 100;
        }

        return { renderSpriteOverlay, renderSpriteOverlayNow, getCachedSpriteOverlayBitmap, createSpriteOverlayCacheKey, createSpriteOverlayEntryCacheKey, roundCacheNumber, invalidateBitmapOverlayCache, createOverlayBitmapFromSource, copySourceBitmapToOverlay, clearOverlayTextRegions, restoreOverlayTextRegions, restoreOverlayTextRegion, forEachEntryTextRegion, emitTextRegion, replayPaintOps, replayPaintOp, drawTextToBitmap, getScaledDrawState, shouldScaleTranslatedText };
    }

    defineRuntimeModule('adapters.spriteText.overlaybitmap', { createController });
})();
