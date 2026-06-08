// Window text adapter support: drawTextEx rich text rendering.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/draw-text-ex-renderer.js.');
    }

    function createDrawTextExRenderer(context = {}) {
        const {
            textCodec = null,
            convertWindowText = null,
            getLineHeight = null,
            applyBitmapDrawState = null,
        } = context;

        function toDrawTextExInputText(value) {
            if (textCodec && typeof textCodec.toDrawTextExInputText === 'function') {
                try {
                    return textCodec.toDrawTextExInputText(value);
                } catch (_) {}
            }
            return String(value ?? '').replace(/\x1b([A-Za-z0-9_#]+|[^\s\w])(\[[^\]]*\]|<[^>]*>)?/g, (_match, code, suffix) => {
                return `\\${code}${suffix || ''}`;
            });
        }

        function toProcessedDrawTextExText(targetWindow, drawTextExInput, fallbackText) {
            try {
                const converted = typeof convertWindowText === 'function'
                    ? convertWindowText(targetWindow, drawTextExInput)
                    : null;
                if (typeof converted === 'string') return toInternalDrawTextExControlText(converted);
            } catch (_) {}
            return toInternalDrawTextExControlText(fallbackText ?? drawTextExInput ?? '');
        }

        function toInternalDrawTextExControlText(value) {
            return String(value ?? '').replace(/\\([A-Za-z0-9_#]+|[^\s\w])(\[[^\]]*\]|<[^>]*>)?/g, (_match, code, suffix) => {
                return `\x1b${code}${suffix || ''}`;
            });
        }

        function drawProcessedDrawTextEx(targetWindow, contents, entry, text, x, y) {
            if (!targetWindow || !contents || !entry || typeof targetWindow.processCharacter !== 'function') return false;
            const value = String(text ?? '');
            if (!value) return false;
            const textState = createProcessedDrawTextExState(targetWindow, entry, value, x, y);
            if (!textState || !String(textState.text || '')) return false;
            if (typeof targetWindow.resetFontSettings === 'function') {
                try { targetWindow.resetFontSettings(); } catch (_) {}
            }
            let textDrawCount = 0;
            let bltDrawCount = 0;
            let drawnText = '';
            const originalDrawText = typeof contents.drawText === 'function' ? contents.drawText : null;
            const originalBlt = typeof contents.blt === 'function' ? contents.blt : null;
            if (originalDrawText) {
                contents.drawText = function(drawText) {
                    const visible = String(drawText ?? '');
                    if (visible) {
                        textDrawCount += 1;
                        drawnText += visible;
                    }
                    return originalDrawText.apply(this, arguments);
                };
            }
            if (originalBlt) {
                contents.blt = function() {
                    bltDrawCount += 1;
                    return originalBlt.apply(this, arguments);
                };
            }
            try {
                let guard = String(textState.text || '').length + 16;
                while (textState.index < textState.text.length) {
                    const before = Number(textState.index) || 0;
                    targetWindow.processCharacter(textState);
                    const after = Number(textState.index) || 0;
                    if (after <= before) return false;
                    guard -= 1;
                    if (guard < 0) return false;
                }
                const drawPrimitiveCount = textDrawCount + bltDrawCount;
                if (drawPrimitiveCount > 0) markBitmapDirty(contents);
                return {
                    processed: true,
                    textDrawCount,
                    bltDrawCount,
                    drawPrimitiveCount,
                    drawnText,
                };
            } finally {
                if (originalDrawText) contents.drawText = originalDrawText;
                if (originalBlt) contents.blt = originalBlt;
            }
        }

        function createProcessedDrawTextExState(targetWindow, entry, text, x, y) {
            const drawX = Number.isFinite(Number(x)) ? Number(x) : 0;
            const drawY = Number.isFinite(Number(y)) ? Number(y) : 0;
            const state = {
                index: 0,
                text: String(text || ''),
                x: drawX,
                y: drawY,
                left: drawX,
                startX: drawX,
                startY: drawY,
                height: typeof getLineHeight === 'function' ? getLineHeight(targetWindow, entry && entry.contentsBitmap) : 0,
            };
            if (typeof targetWindow.createTextState === 'function') {
                try {
                    const created = targetWindow.createTextState(state.text, drawX, drawY, 0);
                    if (created && typeof created === 'object') {
                        Object.assign(state, created);
                        state.text = String(state.text || text || '');
                        state.index = Number.isFinite(Number(state.index)) ? Number(state.index) : 0;
                        if (!Number.isFinite(Number(state.x))) state.x = drawX;
                        if (!Number.isFinite(Number(state.y))) state.y = drawY;
                        if (!Number.isFinite(Number(state.left))) state.left = drawX;
                    }
                } catch (_) {}
            }
            if (typeof targetWindow.calcTextHeight === 'function') {
                try {
                    const height = Number(targetWindow.calcTextHeight(state, false));
                    if (Number.isFinite(height) && height > 0) state.height = height;
                } catch (_) {}
            }
            return state;
        }

        function markBitmapDirty(bitmap) {
            if (!bitmap) return false;
            if (typeof bitmap._setDirty === 'function') {
                try {
                    bitmap._setDirty();
                    return true;
                } catch (_) {}
            }
            let marked = false;
            try { bitmap._dirty = true; marked = true; } catch (_) {}
            try { bitmap.dirty = true; marked = true; } catch (_) {}
            try { bitmap._needsUpdate = true; marked = true; } catch (_) {}
            return marked;
        }

        function withCapturedDrawTextExState(targetWindow, contents, entry, callback) {
            if (typeof callback !== 'function') return undefined;
            if (!targetWindow || !contents || !entry || entry.type !== 'drawTextEx' || !entry.drawState) {
                return callback();
            }
            const originalReset = typeof targetWindow.resetFontSettings === 'function'
                ? targetWindow.resetFontSettings
                : null;
            const reapply = () => {
                if (typeof applyBitmapDrawState !== 'function') return;
                try { applyBitmapDrawState(contents, entry.drawState); } catch (_) {}
            };
            if (!originalReset) {
                reapply();
                return callback();
            }
            targetWindow.resetFontSettings = function() {
                const result = originalReset.apply(this, arguments);
                reapply();
                return result;
            };
            try {
                reapply();
                return callback();
            } finally {
                targetWindow.resetFontSettings = originalReset;
            }
        }

        return {
            toDrawTextExInputText,
            toProcessedDrawTextExText,
            drawProcessedDrawTextEx,
            withCapturedDrawTextExState,
        };
    }

    defineRuntimeModule('adapters.windowTextDrawTextExRenderer', { create: createDrawTextExRenderer });
})();
