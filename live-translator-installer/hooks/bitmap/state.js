// Bitmap hook state module.
//
// This module owns the per-Bitmap bookkeeping used by the draw, aggregation,
// invalidation, replay, and translation modules. The important
// structures are:
// - fragments: raw drawText calls waiting to be grouped into a text entry.
// - entries: active translatable text entries keyed by bitmap/position/layout.
// - renderOps: non-text drawing operations that may need replay after redraw.
// - nativeTextOps: skipped native text that still needs replay ordering.
//
// It also provides diagnostic labels, width estimates, and font signatures used
// when grouping fragments into lines.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks) {
        globalScope.LiveTranslatorModules.hooks = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks.bitmap) {
        globalScope.LiveTranslatorModules.hooks.bitmap = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/bitmap/state.js.');
    }

    function attachBitmapState(runtime) {
        const {
            bitmapStates,
            contentsOwners,
            perf,
            sanitizePerChar,
        } = runtime;

        // Create or normalize state for a Bitmap. Some fields are defensive
        // because older versions or partially installed hooks may have left
        // incomplete state on the same Bitmap object.
        const ensureBitmapState = (bitmap) => {
            if (!bitmap) return null;
            let state = bitmapStates.get(bitmap);
            if (!state) {
                state = {
                    id: bitmap._trBitmapId || (bitmap._trBitmapId = Math.random().toString(36).substring(2, 11)),
                    fragments: [],
                    entries: new Map(),
                    flushQueued: false,
                    renderOps: [],
                    nativeTextOps: new Map(),
                    drawOrderCounter: 0,
                };
                bitmapStates.set(bitmap, state);
            }
            if (!Array.isArray(state.renderOps)) {
                state.renderOps = [];
            }
            if (!state.nativeTextOps || typeof state.nativeTextOps.set !== 'function') {
                state.nativeTextOps = new Map();
            }
            if (!Number.isFinite(state.drawOrderCounter)) {
                state.drawOrderCounter = 0;
            }
            return state;
        };

        const getBitmapState = (bitmap) => {
            if (!bitmap) return null;
            try {
                return bitmapStates.get(bitmap) || null;
            } catch (_) {
                return null;
            }
        };

        // Keep diagnostics readable. Most bitmap logs include this compact
        // identity string so redraw/invalidation events can be correlated.
        const describeBitmap = (bitmap, ownerHint = null) => {
            if (!bitmap) return 'bitmap=n/a';
            const state = bitmapStates.get(bitmap);
            let owner = ownerHint || null;
            if (!owner && contentsOwners && typeof contentsOwners.get === 'function') {
                try { owner = contentsOwners.get(bitmap); } catch (_) {}
            }
            const ownerType = owner && owner.constructor && owner.constructor.name
                ? owner.constructor.name
                : (bitmap.constructor && bitmap.constructor.name ? bitmap.constructor.name : 'Bitmap');
            const ownerId = owner && owner._uniqueId ? owner._uniqueId : null;
            const flags = [];
            if (bitmap._trMessageContents) flags.push('message');
            if (bitmap._trHasDedicatedTextHook) flags.push('dedicated');
            if (bitmap._trPreferWindowPipeline) flags.push(`windowDepth=${bitmap._trWindowPipelineDepth || 0}`);
            if (bitmap._trBitmapReplayDepth) flags.push(`replay=${bitmap._trBitmapReplayDepth}`);
            if (bitmap._trBitmapSkipDepth) flags.push(`skip=${bitmap._trBitmapSkipDepth}`);
            const parts = [
                `bitmap=${state && state.id ? state.id : (bitmap._trBitmapId || 'unknown')}`,
                `owner=${ownerType}${ownerId ? `#${ownerId}` : ''}`,
                `size=${Number.isFinite(bitmap.width) ? bitmap.width : '?'}x${Number.isFinite(bitmap.height) ? bitmap.height : '?'}`,
            ];
            if (flags.length) parts.push(`flags=${flags.join(',')}`);
            return parts.join(' ');
        };

        const nextDrawOrder = (state) => {
            if (!state) return 0;
            state.drawOrderCounter = (state.drawOrderCounter || 0) + 1;
            return state.drawOrderCounter;
        };

        // Width estimates prefer RPG Maker's actual text measurement, then fall
        // back to a conservative font-size based approximation. Aggregation and
        // replay use this width for bounds and clear rectangles.
        const estimateWidth = (bitmap, text, maxWidth) => {
            const cleaned = sanitizePerChar(text);
            if (!cleaned) return 0;
            let measured = 0;
            try {
                if (bitmap && typeof bitmap.measureTextWidth === 'function') {
                    const perfMeasureStart = perf.isEnabled() ? perf.now() : 0;
                    const w = bitmap.measureTextWidth(cleaned);
                    if (perfMeasureStart) {
                        perf.time('bitmap.measureTextWidth.ms', perf.now() - perfMeasureStart);
                    }
                    if (Number.isFinite(w)) measured = Math.ceil(w);
                }
            } catch (_) { /* ignore */ }
            if (!measured) {
                const fontSize = bitmap && Number.isFinite(bitmap.fontSize) ? bitmap.fontSize : 24;
                measured = Math.ceil(cleaned.length * Math.max(6, fontSize * 0.6));
            }
            if (Number.isFinite(maxWidth) && maxWidth > 0 && maxWidth !== Infinity) {
                return Math.max(1, Math.max(measured, Math.ceil(maxWidth)));
            }
            return measured;
        };

        // Fragments only merge when their signatures match. This prevents
        // adjacent pieces with different font/color/outline settings from being
        // translated and redrawn as one incompatible string.
        const computeFontSignature = (drawState, bitmap) => {
            if (drawState && typeof drawState === 'object') {
                return [
                    drawState.fontFace,
                    drawState.fontSize,
                    drawState.fontBold,
                    drawState.fontItalic,
                    drawState.textColor,
                    drawState.outlineColor,
                    drawState.outlineWidth
                ].join('|');
            }
            if (bitmap) {
                return [
                    bitmap.fontFace,
                    bitmap.fontSize,
                    bitmap.fontBold,
                    bitmap.fontItalic,
                    bitmap.textColor,
                    bitmap.outlineColor,
                    bitmap.outlineWidth
                ].join('|');
            }
            return 'default';
        };

        Object.assign(runtime, {
            ensureBitmapState,
            getBitmapState,
            describeBitmap,
            nextDrawOrder,
            estimateWidth,
            computeFontSignature,
        });

        return runtime;
    }

    defineRuntimeModule('hooks.bitmap.state', {
        attach: attachBitmapState,
    });
})();
