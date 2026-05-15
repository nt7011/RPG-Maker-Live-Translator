// Window text scale and bitmap draw-state helpers.
// Shared by Window_Message and generic Window bitmap redraw paths.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.hooks) globalScope.LiveTranslatorModules.hooks = {};
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/window-text-scale.js.');
    }

    const DRAW_STATE_KEYS = [
        'fontFace',
        'fontSize',
        'fontBold',
        'fontItalic',
        'fontUnderline',
        'fontGradient',
        'textColor',
        'outlineColor',
        'outlineWidth',
        'paintOpacity',
        'gradientType',
        'gradientColor1',
        'gradientColor2'
    ];

    function captureBitmapDrawState(bitmap) {
        if (!bitmap) return null;
        const state = {};
        let hasAny = false;
        for (const key of DRAW_STATE_KEYS) {
            const value = bitmap[key];
            if (value !== undefined) {
                state[key] = value;
                hasAny = true;
            }
        }
        return hasAny ? state : null;
    }

    function applyBitmapDrawState(bitmap, state) {
        if (!bitmap || !state) return;
        for (const key of DRAW_STATE_KEYS) {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                try { bitmap[key] = state[key]; } catch (_) {}
            }
        }
    }

    function normalizeTextScalePercent(raw, fallback = 100) {
        if (raw === undefined || raw === null || raw === '') return fallback;
        const numeric = Number(raw);
        if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) return fallback;
        return numeric;
    }

    function resolveTextScalePercent(settings, key, fallback = 100) {
        if (!settings || typeof settings !== 'object' || !key) return fallback;
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
            return normalizeTextScalePercent(settings[key], fallback);
        }
        const gameMessage = settings.gameMessage;
        if (gameMessage
            && typeof gameMessage === 'object'
            && Object.prototype.hasOwnProperty.call(gameMessage, key)) {
            return normalizeTextScalePercent(gameMessage[key], fallback);
        }
        return fallback;
    }

    function shouldScaleText(scalePercent) {
        return Number.isInteger(scalePercent) && scalePercent > 0 && scalePercent < 100;
    }

    function scaleFontSizeValue(value, scalePercent) {
        if (!shouldScaleText(scalePercent)) return value;
        const factor = scalePercent / 100;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.max(1, Math.round(value * factor));
        }
        if (typeof value === 'string') {
            const match = /^(\s*)(\d+(?:\.\d+)?)(px|pt|em|rem)?(\s*)$/i.exec(value);
            if (match) {
                const numeric = Number(match[2]);
                if (Number.isFinite(numeric) && numeric > 0) {
                    const scaled = Math.max(1, Math.round(numeric * factor));
                    return `${match[1]}${scaled}${match[3] || ''}${match[4]}`;
                }
            }
        }
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) {
            return Math.max(1, Math.round(numeric * factor));
        }
        return value;
    }

    function scaleBitmapDrawState(state, scalePercent) {
        if (!state || !shouldScaleText(scalePercent)) return state;
        const scaled = Object.assign({}, state);
        if (Object.prototype.hasOwnProperty.call(scaled, 'fontSize')) {
            scaled.fontSize = scaleFontSizeValue(scaled.fontSize, scalePercent);
        }
        return scaled;
    }

    function createWindowTextScaleScope(windowInstance, scalePercent, helpers = {}) {
        if (!windowInstance || !windowInstance.contents || !shouldScaleText(scalePercent)) return null;

        const captureState = typeof helpers.captureBitmapDrawState === 'function'
            ? helpers.captureBitmapDrawState
            : captureBitmapDrawState;
        const applyState = typeof helpers.applyBitmapDrawState === 'function'
            ? helpers.applyBitmapDrawState
            : applyBitmapDrawState;
        const scaleFactor = scalePercent / 100;
        const wrappedMethods = [];
        const originalStates = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
        let trackedContents = null;
        let logicalFontSize = null;

        const rememberOriginalState = (contents) => {
            if (!contents || !originalStates || originalStates.has(contents)) return;
            originalStates.set(contents, captureState(contents));
        };

        const syncTrackedContents = (contents) => {
            if (!contents) {
                trackedContents = null;
                return null;
            }
            if (contents !== trackedContents) {
                trackedContents = contents;
                rememberOriginalState(contents);
                if (!Number.isFinite(logicalFontSize) || logicalFontSize <= 0) {
                    const initialFontSize = Number(contents.fontSize);
                    if (Number.isFinite(initialFontSize) && initialFontSize > 0) {
                        logicalFontSize = initialFontSize;
                    }
                }
            }
            return contents;
        };

        const getTrackedContents = () => {
            const current = windowInstance ? windowInstance.contents : null;
            if (!current) return syncTrackedContents(null);
            if (current !== trackedContents) return syncTrackedContents(current);
            return current;
        };

        const refreshLogicalFontSize = (contents = getTrackedContents()) => {
            const activeContents = syncTrackedContents(contents);
            const current = activeContents ? Number(activeContents.fontSize) : NaN;
            if (Number.isFinite(current) && current > 0) {
                logicalFontSize = current;
            }
        };

        const applyScaledFontSize = (contents = getTrackedContents()) => {
            const activeContents = syncTrackedContents(contents);
            if (!activeContents || !Number.isFinite(logicalFontSize) || logicalFontSize <= 0) return;
            activeContents.fontSize = Math.max(1, Math.round(logicalFontSize * scaleFactor));
        };

        const wrapMethod = (name, factory) => {
            const original = windowInstance[name];
            if (typeof original !== 'function') return;
            wrappedMethods.push({
                name,
                original,
                hadOwnProperty: Object.prototype.hasOwnProperty.call(windowInstance, name),
            });
            windowInstance[name] = factory(original);
        };

        const invokeWithLogicalFontSize = (original, context, args) => {
            const contents = syncTrackedContents((context && context.contents) ? context.contents : getTrackedContents());
            if (contents && Number.isFinite(logicalFontSize) && logicalFontSize > 0) {
                contents.fontSize = logicalFontSize;
            }
            const result = original.apply(context, args);
            const updatedContents = (context && context.contents) ? context.contents : getTrackedContents();
            refreshLogicalFontSize(updatedContents);
            applyScaledFontSize(updatedContents);
            return result;
        };

        wrapMethod('resetFontSettings', (original) => function(...args) {
            const result = original.apply(this, args);
            const currentContents = (this && this.contents) ? this.contents : getTrackedContents();
            refreshLogicalFontSize(currentContents);
            applyScaledFontSize(currentContents);
            return result;
        });

        wrapMethod('createContents', (original) => function(...args) {
            const result = original.apply(this, args);
            const currentContents = (this && this.contents) ? this.contents : getTrackedContents();
            refreshLogicalFontSize(currentContents);
            applyScaledFontSize(currentContents);
            return result;
        });

        wrapMethod('makeFontBigger', (original) => function(...args) {
            return invokeWithLogicalFontSize(original, this, args);
        });

        wrapMethod('makeFontSmaller', (original) => function(...args) {
            return invokeWithLogicalFontSize(original, this, args);
        });

        applyScaledFontSize();

        return {
            restore() {
                for (let i = wrappedMethods.length - 1; i >= 0; i -= 1) {
                    const wrapped = wrappedMethods[i];
                    try {
                        if (wrapped.hadOwnProperty) {
                            windowInstance[wrapped.name] = wrapped.original;
                        } else {
                            delete windowInstance[wrapped.name];
                        }
                    } catch (_) {}
                }
                const currentContents = windowInstance ? windowInstance.contents : null;
                if (currentContents) {
                    const originalState = originalStates && originalStates.has(currentContents)
                        ? originalStates.get(currentContents)
                        : captureState(currentContents);
                    if (originalState) {
                        try { applyState(currentContents, originalState); } catch (_) {}
                    }
                }
            }
        };
    }

    defineRuntimeModule('hooks.windowTextScale', {
        captureBitmapDrawState,
        applyBitmapDrawState,
        normalizeTextScalePercent,
        resolveTextScalePercent,
        scaleBitmapDrawState,
        scaleFontSizeValue,
        createWindowTextScaleScope,
    });
})();
