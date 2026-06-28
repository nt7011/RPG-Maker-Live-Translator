// Window helper composition module.
// Hook installers use this public facade for bitmap draw state, text scaling,
// stable text keys, and Window-to-Bitmap registry ownership.
(() => {
    'use strict';

    function generateKey(type, x, y, windowType = null, text = null, slotKey = null) {
        const base = `${type},${x},${y}`;
        const slotValue = String(slotKey ?? '').trim();
        const textValue = String(text ?? '').trim();
        const parts = [base];
        if (slotValue) parts.push(hashTextForKey(slotValue));
        if (textValue) parts.push(hashTextForKey(textValue));
        return parts.join(',');
    }

    function hashTextForKey(text) {
        const value = String(text || '');
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    LiveTranslatorDefine({
        name: 'hooks.window.helpers',
        requires: {
            textScale: 'hooks.window.textScale',
            registry: 'hooks.window.registryHelpers',
        },
        factory({ textScale, registry }) {
            const {
                captureBitmapDrawState,
                applyBitmapDrawState,
                normalizeTextScalePercent,
                resolveTextScalePercent,
                scaleBitmapDrawState,
                scaleFontSizeValue,
                createWindowTextScaleScope,
            } = textScale;
            const { createWindowRegistryHelpers } = registry;

            return {
                captureBitmapDrawState,
                applyBitmapDrawState,
                normalizeTextScalePercent,
                resolveTextScalePercent,
                scaleBitmapDrawState,
                scaleFontSizeValue,
                createWindowTextScaleScope,
                generateKey,
                createWindowRegistryHelpers,
            };
        },
    });
})();
