// PIXI translated text-scale handling.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/pixi-text/text-scale.js.');
    }

    // Translated PIXI text scaling is isolated so render and setter paths share the same restore behavior.
    function createPixiTextScaleController(context = {}) {
        const { textScaleOthers, scaleFontSizeValue } = context;
    
        function applyTranslatedTextScale(displayObject) {
                    if (!shouldScaleTranslatedText()) return;
                    const state = getTextScaleState(displayObject);
                    if (state && state.owner && state.key) {
                        try { state.owner[state.key] = scaleFontSize(state.value); } catch (_) {}
                    }
                }
        
        function getTextScaleState(displayObject) {
                    if (!displayObject) return null;
                    if (displayObject._trPixiTextScaleState) return displayObject._trPixiTextScaleState;
        
                    let scaleState = null;
                    const style = getPixiStyle(displayObject);
                    if (style && 'fontSize' in style) {
                        if (typeof style.clone === 'function') {
                            const originalStyle = style;
                            const cloned = style.clone();
                            try { displayObject.style = cloned; } catch (_) {}
                            scaleState = {
                                originalStyle,
                                owner: cloned,
                                key: 'fontSize',
                                value: cloned.fontSize,
                            };
                        } else {
                            scaleState = {
                                owner: style,
                                key: 'fontSize',
                                value: style.fontSize,
                            };
                        }
                    } else if (displayObject && 'fontSize' in displayObject) {
                        scaleState = {
                            owner: displayObject,
                            key: 'fontSize',
                            value: displayObject.fontSize,
                        };
                    }
        
                    if (scaleState) {
                        try { displayObject._trPixiTextScaleState = scaleState; } catch (_) {}
                    }
                    return scaleState;
                }
        
        function restoreTextScale(displayObject) {
                    if (!displayObject || !displayObject._trPixiTextScaleState) return;
                    const state = displayObject._trPixiTextScaleState;
                    try {
                        if (state.originalStyle) {
                            displayObject.style = state.originalStyle;
                        } else if (state.owner && state.key) {
                            state.owner[state.key] = state.value;
                        }
                    } catch (_) {}
                    try {
                        delete displayObject._trPixiTextScaleState;
                    } catch (_) {
                        displayObject._trPixiTextScaleState = null;
                    }
                }
        
        function shouldScaleTranslatedText() {
                    return Number.isInteger(textScaleOthers) && textScaleOthers > 0 && textScaleOthers < 100;
                }
        
        function scaleFontSize(value) {
                    if (typeof scaleFontSizeValue === 'function') {
                        return scaleFontSizeValue(value, textScaleOthers);
                    }
                    const numeric = Number(value);
                    if (!Number.isFinite(numeric) || numeric <= 0) return value;
                    return Math.max(1, Math.round(numeric * (textScaleOthers / 100)));
                }
        
        function getPixiStyle(displayObject) {
                    try {
                        return displayObject && displayObject.style ? displayObject.style : null;
                    } catch (_) {
                        return null;
                    }
                }
    
        return {
            applyTranslatedTextScale,
            restoreTextScale,
        };
    }
    
    defineRuntimeModule('adapters.pixiTextScale', {
        create: createPixiTextScaleController,
    });

})();
