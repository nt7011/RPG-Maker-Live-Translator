// Window text adapter support: drawTextEx rich text rendering.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.drawTextExRenderer',
        factory() {

    function createDrawTextExRenderer(context = {}) {
        const {
            textCodec = null,
            convertWindowText = null,
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
            withCapturedDrawTextExState,
        };
    }
            return { create: createDrawTextExRenderer };
        },
    });
})();
