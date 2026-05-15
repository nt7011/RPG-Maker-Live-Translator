// Sprite text adapter support: bitmap observation.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/bitmap-observation.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            activateBitmapTextInterest,
            computeFontSignature,
            deactivateBitmapTextInterest,
            ensureBitmapState,
            finiteNumber,
            getBitmapState,
            hasHookInChain,
            install,
            invalidateBitmapOverlayCache,
            isAdapterContractFailure,
            isBitmapOwned,
            isOverlayBitmap,
            isWindowOwnedBitmap,
            markBitmapOwnersDirty,
            measureTextWidth,
            normalizeCanvasTextAlign,
            positiveNumber,
            pruneArray,
            rectanglesOverlap,
            rectFromDimensions,
            rectHasArea,
            refreshBitmapTextInterest,
            retireBitmapOwners,
            sanitizeVisibleText,
            shouldObserveBitmapMutation,
            stringify,
            warn,
        } = Object.fromEntries([
            'activateBitmapTextInterest',
            'computeFontSignature',
            'deactivateBitmapTextInterest',
            'ensureBitmapState',
            'finiteNumber',
            'getBitmapState',
            'hasHookInChain',
            'install',
            'invalidateBitmapOverlayCache',
            'isAdapterContractFailure',
            'isBitmapOwned',
            'isOverlayBitmap',
            'isWindowOwnedBitmap',
            'markBitmapOwnersDirty',
            'measureTextWidth',
            'normalizeCanvasTextAlign',
            'positiveNumber',
            'pruneArray',
            'rectanglesOverlap',
            'rectFromDimensions',
            'rectHasArea',
            'refreshBitmapTextInterest',
            'retireBitmapOwners',
            'sanitizeVisibleText',
            'shouldObserveBitmapMutation',
            'stringify',
            'warn',
        ].map((name) => [name, callScope(name)]));

        /**
         * Record a Bitmap.drawText observation offered by bitmap-text-adapter.
         */
        function recordBitmapDrawText(payload = {}) {
            const bitmap = payload.bitmap || null;
            const status = normalizeBitmapDrawRecordStatus(payload.ownershipStatus)
                || getBitmapDrawRecordStatus(bitmap, payload);
            if (status === 'ignored') return { status };
            if (status === 'deferred' && payload && payload.ownerClaimOnly === true) {
                return { status };
            }
        
            const text = stringify(payload.text);
            if (!sanitizeVisibleText(text)) return { status: 'ignored' };
        
            const state = ensureBitmapState(bitmap);
            if (!state) return { status: 'ignored' };
            state.destroyed = false;
            state.revision += 1;
            state.order += 1;
            invalidateBitmapOverlayCache(state);
            const op = createTextOpFromPayload(bitmap, payload, state);
            state.textOps.push(op);
            pruneArray(state.textOps, scope.MAX_TEXT_OPS);
            activateBitmapTextInterest(bitmap, state);
            markBitmapOwnersDirty(bitmap, 'drawText');
            scope.perf.count('spriteText.bitmap.textOp');
            scope.perf.top('spriteText.bitmap.status', status);
            return { status };
        }
        
        /**
         * Decide whether a bitmap draw is owned by sprite text.
         *
         * Some plugins draw into a Bitmap before assigning it to Sprite.bitmap.
         * Keep that text history deferred so the later Sprite owner can still
         * group glyph runs at the frame boundary.
         */
        function getBitmapDrawRecordStatus(bitmap, payload) {
            if (!bitmap || isOverlayBitmap(bitmap)) return 'ignored';
            if (bitmap._trBitmapReplayDepth > 0 || bitmap._trBitmapSkipDepth > 0 || bitmap._trSpriteTextReplayDepth > 0) return 'ignored';
            if (isWindowOwnedBitmap(bitmap)) return 'ignored';
            if (payload && payload.owner) return 'ignored';
            return isBitmapOwned(bitmap) ? 'claimed' : 'deferred';
        }
        
        function normalizeBitmapDrawRecordStatus(status) {
            const value = String(status || '');
            if (value === 'claimed' || value === 'deferred') return value;
            return '';
        }
        
        /**
         * Convert a bitmap draw payload into local text-op history.
         */
        function createTextOpFromPayload(bitmap, payload, state) {
            const text = stringify(payload && payload.text);
            const x = finiteNumber(payload && payload.x, 0);
            const y = finiteNumber(payload && payload.y, 0);
            const align = normalizeCanvasTextAlign(payload && payload.align);
            const lineHeight = positiveNumber(payload && payload.lineHeight, bitmap && bitmap.fontSize, 24);
            const providedWidth = finiteNumber(payload && (payload.measuredWidth !== undefined ? payload.measuredWidth : payload.width), 0);
            const measuredWidth = providedWidth > 0
                ? Math.ceil(providedWidth)
                : measureTextWidth(bitmap, text, 0);
            const maxWidth = positiveNumber(payload && payload.maxWidth, measuredWidth);
            const visibleWidth = Math.max(1, Math.min(measuredWidth, maxWidth));
            const boundsX = resolveAlignedTextBoundsX(x, maxWidth, visibleWidth, align);
            const drawState = payload && payload.drawState ? payload.drawState : scope.captureBitmapDrawState(bitmap);
            return {
                id: `sto-${state.id}-${state.order.toString(36)}`,
                type: 'text',
                methodName: payload && payload.methodName ? String(payload.methodName) : 'drawText',
                rawText: text,
                visibleText: scope.stripControls(text),
                trimmedText: sanitizeVisibleText(text),
                x,
                y,
                maxWidth: Math.max(1, maxWidth),
                lineHeight: Math.max(1, lineHeight),
                align,
                width: visibleWidth,
                bounds: rectFromDimensions(boundsX, y, visibleWidth, Math.max(1, lineHeight)),
                drawState,
                backgroundPatch: cloneBackgroundPatch(payload && payload.backgroundPatch),
                fontSignature: computeFontSignature(drawState, bitmap),
                drawOrder: state.order,
                revision: state.revision,
            };
        }

        function resolveAlignedTextBoundsX(x, maxWidth, visibleWidth, align) {
            const originX = finiteNumber(x, 0);
            const boxWidth = positiveNumber(maxWidth, visibleWidth, 1);
            const textWidth = positiveNumber(visibleWidth, 1);
            if (align === 'right' || align === 'end') {
                return originX + Math.max(0, boxWidth - textWidth);
            }
            if (align === 'center') {
                return originX + Math.max(0, (boxWidth - textWidth) / 2);
            }
            return originX;
        }

        function cloneBackgroundPatch(patch) {
            if (!patch || typeof patch !== 'object' || !patch.bitmap) return null;
            const width = positiveNumber(patch.width, patch.bitmap && patch.bitmap.width);
            const height = positiveNumber(patch.height, patch.bitmap && patch.bitmap.height);
            if (!width || !height) return null;
            return {
                bitmap: patch.bitmap,
                x: finiteNumber(patch.x, 0),
                y: finiteNumber(patch.y, 0),
                width,
                height,
                trusted: patch.trusted === true,
            };
        }
        
        /**
         * Observe a bitmap mutation from the bitmap capability service.
         */
        function recordBitmapMutation(bitmap, methodName, args = []) {
            if (!shouldObserveBitmapMutation(bitmap, methodName)) return;
            const methodLabel = methodName || 'unknown';
            scope.perf.count('spriteText.bitmap.mutation');
            scope.perf.top('spriteText.bitmap.mutation.method', methodLabel);
            const ownedBeforeMutation = isBitmapOwned(bitmap);
            scope.perf.top('spriteText.bitmap.mutation.status', ownedBeforeMutation ? 'owned' : 'unowned');
            const rect = deriveMutationRect(bitmap, methodName, args);
            if (methodName === 'destroy') {
                retireBitmapOwners(bitmap, 'bitmap-destroyed');
                const state = getBitmapState(bitmap);
                if (state) {
                    state.destroyed = true;
                    state.revision += 1;
                    state.textOps.length = 0;
                    state.paintOps.length = 0;
                    invalidateBitmapOverlayCache(state);
                    deactivateBitmapTextInterest(bitmap, state);
                }
                return;
            }
            if (methodName === 'clear' || methodName === 'resize' || methodName === 'fillAll') {
                recordPaintOp(bitmap, methodName, args, rect, { reset: true });
                return;
            }
            if (methodName === 'adjustTone' || methodName === 'rotateHue' || methodName === 'blur') {
                recordPaintOp(bitmap, methodName, args, rect, { unsupported: true, removeText: false });
                return;
            }
            recordPaintOp(bitmap, methodName, args, rect, { removeText: true });
        }
        
        /**
         * Subscribe to bitmap mutation capabilities or install fallback wrappers.
         */
        function installBitmapMutationObserver() {
            if (scope.bitmapServices.hasMutationPublisher()) {
                scope.bitmapMutationObserver = scope.bitmapServices;
                return true;
            }
            installFallbackBitmapMutationWrappers();
            return false;
        }
        
        /**
         * Shared observer callback for watched bitmap mutations.
         */
        function handleObservedBitmapMutation(bitmap, methodName, args) {
            try { recordBitmapMutation(bitmap, methodName, args); } catch (error) {
                if (isAdapterContractFailure(error)) throw error;
                warn('[SpriteText] Bitmap mutation observation failed.', error);
            }
        }
        
        /**
         * Fallback mutation wrappers for tests or unusual load orders.
         */
        function installFallbackBitmapMutationWrappers() {
            [
                'clear',
                'clearRect',
                'resize',
                'fillRect',
                'fillAll',
                'gradientFillRect',
                'strokeRect',
                'drawCircle',
                'blt',
                'bltImage',
                'adjustTone',
                'rotateHue',
                'blur',
                'destroy',
            ].forEach((methodName) => {
                const current = Bitmap.prototype[methodName];
                if (typeof current !== 'function' || hasHookInChain(current, '__trSpriteTextFallbackMutation', scope.FALLBACK_MUTATION_TOKEN)) return;
                const original = current;
                const wrapped = function(...args) {
                    const result = original.apply(this, args);
                    recordBitmapMutation(this, methodName, args);
                    return result;
                };
                wrapped.__trOriginal = original;
                wrapped.__trSpriteTextFallbackMutation = scope.FALLBACK_MUTATION_TOKEN;
                Bitmap.prototype[methodName] = wrapped;
            });
        }
        
        /**
         * Record a bounded paint operation used to rebuild overlay bitmaps.
         */
        function recordPaintOp(bitmap, methodName, args, rect, options = {}) {
            scope.perf.count('spriteText.paintOp.calls');
            scope.perf.top('spriteText.paintOp.method', methodName || (options.reset === true ? 'reset' : 'unknown'));
            const state = getBitmapState(bitmap);
            if (!state) {
                scope.perf.top('spriteText.paintOp.status', 'no-state');
                return;
            }
            const targetRect = rect && rectHasArea(rect)
                ? rect
                : rectFromDimensions(0, 0, bitmap && bitmap.width, bitmap && bitmap.height);
            if (options.reset === true) {
                scope.perf.top('spriteText.paintOp.status', 'reset');
                const hadText = state.textOps.length > 0;
                state.revision += 1;
                state.order += 1;
                state.textOps.length = 0;
                state.paintOps.length = 0;
                state.unsupportedPaint = false;
                invalidateBitmapOverlayCache(state);
                deactivateBitmapTextInterest(bitmap, state);
                if (hadText) markBitmapOwnersDirty(bitmap, methodName || 'paint');
                return;
            }
            if (options.unsupported === true) {
                scope.perf.top('spriteText.paintOp.status', 'unsupported');
                state.revision += 1;
                state.order += 1;
                state.unsupportedPaint = true;
                invalidateBitmapOverlayCache(state);
                deactivateBitmapTextInterest(bitmap, state);
                markBitmapOwnersDirty(bitmap, methodName || 'paint');
                return;
            }
            if (options.removeText !== false && rectHasArea(targetRect)) {
                const before = state.textOps.length;
                state.textOps = state.textOps.filter((op) => !op || !op.bounds || !rectanglesOverlap(targetRect, op.bounds));
                if (state.textOps.length !== before) {
                    scope.perf.top('spriteText.paintOp.status', 'remove-text');
                    state.revision += 1;
                    state.order += 1;
                    invalidateBitmapOverlayCache(state);
                    refreshBitmapTextInterest(bitmap, state);
                    markBitmapOwnersDirty(bitmap, methodName || 'paint');
                    return;
                }
                scope.perf.top('spriteText.paintOp.status', 'missed-text');
                return;
            }
            scope.perf.top('spriteText.paintOp.status', 'ignored-paint');
        }
        
        /**
         * Convert bitmap mutator arguments into local bitmap coordinates.
         */
        function deriveMutationRect(bitmap, methodName, args) {
            switch (methodName) {
            case 'clear':
            case 'fillAll':
            case 'resize':
            case 'destroy':
            case 'adjustTone':
            case 'rotateHue':
            case 'blur':
                return rectFromDimensions(0, 0, bitmap && bitmap.width, bitmap && bitmap.height);
            case 'clearRect':
            case 'fillRect':
            case 'gradientFillRect':
            case 'strokeRect':
                return rectFromDimensions(args[0], args[1], args[2], args[3]);
            case 'drawCircle': {
                const r = finiteNumber(args[2], 0);
                return rectFromDimensions(finiteNumber(args[0], 0) - r, finiteNumber(args[1], 0) - r, r * 2, r * 2);
            }
            case 'blt':
            case 'bltImage': {
                const sw = finiteNumber(args[3], 0);
                const sh = finiteNumber(args[4], 0);
                const dx = finiteNumber(args[5], 0);
                const dy = finiteNumber(args[6], 0);
                const dw = positiveNumber(args[7], sw);
                const dh = positiveNumber(args[8], sh);
                return rectFromDimensions(dx, dy, dw, dh);
            }
            default:
                return null;
            }
        }

        return { recordBitmapDrawText, getBitmapDrawRecordStatus, normalizeBitmapDrawRecordStatus, createTextOpFromPayload, recordBitmapMutation, installBitmapMutationObserver, handleObservedBitmapMutation, installFallbackBitmapMutationWrappers, recordPaintOp, deriveMutationRect };
    }

    defineRuntimeModule('adapters.spriteText.bitmapobservation', { createController });
})();
