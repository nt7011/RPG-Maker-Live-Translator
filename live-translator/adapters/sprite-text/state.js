// Sprite text adapter support: state.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.spriteText.state',
        factory() {

    function createController(scope = {}) {
        const { handleObservedBitmapMutation } = scope.controllerFacades.bitmapObservation;
        const { isBitmapOwned } = scope.controllerFacades.bitmapOwnership;
        const { getRecordStatus } = scope.controllerFacades.entries;
        const { invalidateBitmapOverlayCache } = scope.controllerFacades.overlayBitmap;
        const {
            safeCall,
            warn,
        } = scope.controllerFacades.utils;

        /**
         * Create or return per-Sprite state.
         */
        function ensureSpriteState(sprite) {
            if (!sprite) return null;
            let state = scope.spriteStates.get(sprite);
            if (!state) {
                state = {
                    id: `sts-${(++scope.nextSpriteId).toString(36)}`,
                    sprite,
                    bitmap: null,
                    entries: new Map(),
                    singleGlyphCandidate: null,
                    overlaySprite: null,
                    overlayBitmap: null,
                    hidden: false,
                    hiddenToken: '',
                    _trOverlayRenderable: false,
                    _trRenderableFrameKey: null,
                };
                scope.spriteStates.set(sprite, state);
            }
            if (!state.entries || typeof state.entries.set !== 'function') state.entries = new Map();
            return state;
        }
        
        /**
         * Create or return per-Bitmap sprite observation state.
         */
        function ensureBitmapState(bitmap) {
            if (!bitmap) return null;
            let state = scope.bitmapStates.get(bitmap);
            if (!state) {
                state = {
                    id: `stb-${(++scope.nextBitmapId).toString(36)}`,
                    bitmap,
                    revision: 0,
                    order: 0,
                    textOps: [],
                    paintOps: [],
                    overlayCache: null,
                    unsupportedPaint: false,
                    textInterest: false,
                    destroyed: false,
                    mutationUnsubscribe: null,
                };
                scope.bitmapStates.set(bitmap, state);
            }
            if (!state.bitmap) state.bitmap = bitmap;
            if (!Array.isArray(state.textOps)) state.textOps = [];
            if (!Array.isArray(state.paintOps)) state.paintOps = [];
            return state;
        }
        
        /**
         * Read per-Bitmap state without creating it.
         */
        function getBitmapState(bitmap) {
            if (!bitmap) return null;
            try { return scope.bitmapStates.get(bitmap) || null; } catch (_) { return null; }
        }
        
        /**
         * Return true when bitmap mutations can affect known sprite text state.
         */
        function shouldObserveBitmapMutation(bitmap, methodName) {
            if (!bitmap || isOverlayBitmap(bitmap)) return false;
            if (scope.bitmapServices.getRenderGuardReason(bitmap)) return false;
            if (isWindowOwnedBitmap(bitmap)) return false;
            if (methodName === 'destroy') return hasActiveBitmapTextInterest(bitmap) || isBitmapOwned(bitmap);
            return hasActiveBitmapTextInterest(bitmap);
        }
        
        /**
         * Watch mutations only after text has been observed on a Bitmap.
         */
        function activateBitmapTextInterest(bitmap, state = getBitmapState(bitmap)) {
            if (!bitmap || !state || state.destroyed) return false;
            state.textInterest = true;
            if (!state.mutationUnsubscribe && scope.bitmapMutationObserver && typeof scope.bitmapMutationObserver.watchBitmap === 'function') {
                state.mutationUnsubscribe = scope.bitmapMutationObserver.watchBitmap(bitmap, handleObservedBitmapMutation);
            }
            return true;
        }
        
        /**
         * Drop mutation interest when a Bitmap no longer has sprite text.
         */
        function deactivateBitmapTextInterest(bitmap, state = getBitmapState(bitmap)) {
            if (!bitmap) return;
            if (state) state.textInterest = false;
            invalidateBitmapOverlayCache(state);
            if (state && typeof state.mutationUnsubscribe === 'function') {
                try { state.mutationUnsubscribe(); } catch (_) {}
                state.mutationUnsubscribe = null;
            }
        }
        
        /**
         * Keep observer interest aligned with the live text-op buffer.
         */
        function refreshBitmapTextInterest(bitmap, state = getBitmapState(bitmap)) {
            if (state && !state.destroyed && Array.isArray(state.textOps) && state.textOps.length) {
                activateBitmapTextInterest(bitmap, state);
            } else {
                deactivateBitmapTextInterest(bitmap, state);
            }
        }
        
        /**
         * Return true for bitmap objects owned by windows/message adapters.
         */
        function isWindowOwnedBitmap(bitmap) {
            if (!bitmap) return false;
            if (scope.surfaceOwnership && typeof scope.surfaceOwnership.isWindowOwnedBitmap === 'function') {
                return scope.surfaceOwnership.isWindowOwnedBitmap(bitmap) === true;
            }
            return false;
        }
        
        /**
         * Return true for translated overlay bitmaps created by this adapter.
         */
        function isOverlayBitmap(bitmap) {
            if (!bitmap || !scope.overlayBitmaps || typeof scope.overlayBitmaps.has !== 'function') return false;
            try { return scope.overlayBitmaps.has(bitmap) === true; } catch (_) { return false; }
        }

        function hasActiveBitmapTextInterest(bitmap, state = getBitmapState(bitmap)) {
            return !!(state && !state.destroyed && state.textInterest === true);
        }
        
        /**
         * Restore control-code placeholders in provider output.
         */
        function restoreTranslatedText(translated, codecState, rawText) {
            try {
                const restored = scope.restoreText(translated, codecState || {});
                return typeof restored === 'string' ? restored : rawText;
            } catch (error) {
                warn('[SpriteText] Failed to restore control-code placeholders.', error);
                return translated;
            }
        }
        
        /**
         * Prepare provider-facing text while containing helper failures.
         */
        function safePrepareText(rawText) {
            try {
                return scope.createTextSource(rawText, { surfaceType: 'sprite' });
            } catch (error) {
                warn('[SpriteText] Failed to prepare text for translation.', error);
                return createPlainTextSource(rawText);
            }
        }

        function createPlainTextSource(rawText) {
            return scope.textCodec.createPlainTextSource(rawText, { surfaceType: 'sprite' });
        }
        
        function applyEligibilityToSpriteRecord(record) {
            const eligibility = describeSpriteRecordEligibility(record);
            if (eligibility.eligible) return eligibility;
            record.skipReason = eligibility.reason || 'translation skipped';
            return eligibility;
        }
        
        function describeSpriteRecordEligibility(record) {
            if (!record) {
                return { eligible: true, skip: false, category: 'eligible', reason: '' };
            }
            return scope.adapterContract.describeTextEligibility({
                sourceAdapter: scope.ADAPTER_ID,
                hook: scope.HOOK_NAME,
                rawText: record.rawText,
                visibleText: record.trimmedText,
                original: record.trimmedText,
                translationSource: record.translationSource,
                normalizedSource: record.normalizedSource,
                status: getRecordStatus(record),
                skipReason: record.skipReason,
            });
        }
        
        /**
         * Record text detection scope.telemetry.
         */
        function logTextDetected(record, mode) {
            if (!scope.telemetry || typeof scope.telemetry.logTextDetected !== 'function' || !record) return;
            const bounds = record.group && record.group.bounds ? record.group.bounds : record.bounds;
            safeCall(() => scope.telemetry.logTextDetected(scope.HOOK_NAME, record.trimmedText, bounds ? bounds.x1 : 0, bounds ? bounds.y1 : 0, {
                mode,
                glyphs: record.group ? record.group.length : undefined,
            }));
        }
        
        /**
         * Record translated overlay draw scope.telemetry.
         */
        function logOverlayDraw(mode, source, records) {
            if (!scope.telemetry || typeof scope.telemetry.logDraw !== 'function') return;
            safeCall(() => scope.telemetry.logDraw('sprite_text_redraw', source || mode, 0, 0, {
                mode,
                count: Array.isArray(records) ? records.length : 0,
            }));
        }
        
        /**
         * Patch orchestrator item state from adapter-side render work.
         */
        function updateItem(record, patch, eventType, details) {
            return scope.adapterContract.updateItem(record, patch || {}, { eventType, details });
        }

        return { ensureSpriteState, ensureBitmapState, getBitmapState, shouldObserveBitmapMutation, activateBitmapTextInterest, deactivateBitmapTextInterest, refreshBitmapTextInterest, isWindowOwnedBitmap, isOverlayBitmap, restoreTranslatedText, safePrepareText, applyEligibilityToSpriteRecord, describeSpriteRecordEligibility, logTextDetected, logOverlayDraw, updateItem };
    }

            return { createController };
        },
    });
})();
