// PIXI.Text and PIXI.BitmapText hook.
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
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/pixi-text-hook.js.');
    }

    function installPixiTextHook(context = {}) {
        const {
            logger,
            dbg = () => {},
            diag = () => {},
            preview = (text) => String(text ?? ''),
            stripRpgmEscapes,
            prepareTextForTranslation,
            restoreControlCodes,
            telemetry,
            textTracker,
            translationCache,
            settings,
            captureBitmapDrawState,
            applyBitmapDrawState,
            resolveTextScalePercent,
            scaleFontSizeValue,
            generateKey,
            contentsOwners,
            windowRegistry,
            registeredWindows,
            PER_CHAR_MARK,
            REDRAW_SIGNATURE = '',
            perf,
            logEscape = () => {},
        } = context;
    // Hook PIXI.Text and PIXI.BitmapText to capture whole-string text assignments.
    // Still treated as best-effort: hooks are installed only when the PIXI classes expose a writable text setter.
    function trackPixiText() {
        const textScaleOthers = typeof resolveTextScalePercent === 'function'
            ? resolveTextScalePercent(settings, 'textScaleOthers', 100)
            : 100;
        const shouldScaleTranslatedText = () => Number.isInteger(textScaleOthers)
            && textScaleOthers > 0
            && textScaleOthers < 100;
        const FRAME_TOKEN = 'liveTranslator.pixiTextVisibility';
        const activePixiObjects = new Set();
        const isTextTrackerEnabled = () => textTracker
            && (typeof textTracker.isEnabled !== 'function' || textTracker.isEnabled());
        const markRecordDisappeared = (recordId, reason, details = null) => {
            if (!isTextTrackerEnabled() || !recordId) return;
            if (typeof textTracker.disappear === 'function') {
                textTracker.disappear(recordId, reason, details);
            } else if (typeof textTracker.stale === 'function') {
                textTracker.stale(recordId, reason, details);
            }
        };
        const trackDecision = (recordId, type, message = '', details = null) => {
            if (isTextTrackerEnabled() && typeof textTracker.decision === 'function' && recordId) {
                textTracker.decision(recordId, type, message, details);
            }
        };
        const describeTranslationSkip = (text, fallbackReason = 'shouldSkip') => {
            const normalized = String(text || '').trim();
            try {
                if (translationCache && typeof translationCache.describeSkip === 'function') {
                    const info = translationCache.describeSkip(normalized) || {};
                    return Object.assign({ reason: info.reason || fallbackReason }, info);
                }
            } catch (_) {}
            return { reason: fallbackReason, length: normalized.length };
        };
        const rememberPixiRecord = (displayObject, payload = {}) => {
            if (!displayObject || !payload || !payload.id) return;
            displayObject._trPixiTrackerPayload = Object.assign(
                {},
                displayObject._trPixiTrackerPayload || {},
                payload
            );
            activePixiObjects.add(displayObject);
            displayObject._trPixiTrackerVisible = true;
        };
        const updatePixiRecordPayload = (displayObject, patch = {}) => {
            if (!displayObject || !displayObject._trPixiTrackerPayload) return;
            displayObject._trPixiTrackerPayload = Object.assign(
                {},
                displayObject._trPixiTrackerPayload,
                patch || {}
            );
        };
        const isPositiveAlpha = (displayObject) => {
            if (!displayObject) return false;
            const alpha = Number(displayObject.alpha);
            if (Number.isFinite(alpha) && alpha <= 0) return false;
            const opacity = Number(displayObject.opacity);
            if (Number.isFinite(opacity) && opacity <= 0) return false;
            return true;
        };
        const isPixiObjectRenderable = (displayObject) => {
            if (!displayObject || displayObject._destroyed) return false;
            if (!displayObject.parent) return false;
            if (displayObject.visible === false || displayObject.renderable === false) return false;
            if (!isPositiveAlpha(displayObject)) return false;
            let child = displayObject;
            let cursor = displayObject.parent || null;
            while (cursor) {
                if (cursor._destroyed || cursor.visible === false || cursor.renderable === false) return false;
                if (!isPositiveAlpha(cursor)) return false;
                const children = Array.isArray(cursor.children) ? cursor.children : null;
                if (children && children.indexOf(child) < 0) return false;
                child = cursor;
                cursor = cursor.parent || null;
            }
            return true;
        };
        const refreshPixiObjectVisibility = (displayObject) => {
            if (!displayObject || !displayObject._trPixiTrackerRecordId) {
                if (displayObject) activePixiObjects.delete(displayObject);
                return;
            }
            const recordId = displayObject._trPixiTrackerRecordId;
            const label = displayObject.constructor && displayObject.constructor.name
                ? displayObject.constructor.name
                : 'PIXI.Text';
            if (!isPixiObjectRenderable(displayObject)) {
                if (displayObject._trPixiTrackerVisible !== false) {
                    markRecordDisappeared(recordId, 'pixi-text-invisible', { windowType: label });
                    displayObject._trPixiTrackerVisible = false;
                }
                return;
            }
            if (displayObject._trPixiTrackerVisible === false
                && isTextTrackerEnabled()
                && typeof textTracker.upsert === 'function'
                && displayObject._trPixiTrackerPayload) {
                textTracker.upsert(Object.assign({}, displayObject._trPixiTrackerPayload, {
                    onScreen: true,
                    screenState: 'visible',
                }), {
                    type: 'screen.visible',
                    details: { windowType: label },
                });
            }
            displayObject._trPixiTrackerVisible = true;
        };
        const sweepPixiTextVisibility = () => {
            if (!activePixiObjects.size) return;
            Array.from(activePixiObjects).forEach(refreshPixiObjectVisibility);
        };
        const installFrameHook = (target, methodName) => {
            if (!target || typeof target[methodName] !== 'function') return false;
            if (target[methodName].__trPixiTextVisibilityWrapped === FRAME_TOKEN) return true;
            const original = target[methodName];
            target[methodName] = function(...args) {
                const result = original.apply(this, args);
                try { sweepPixiTextVisibility(); } catch (_) {}
                return result;
            };
            target[methodName].__trOriginal = original;
            target[methodName].__trPixiTextVisibilityWrapped = FRAME_TOKEN;
            return true;
        };
        const installVisibilityFrameHooks = () => {
            let installed = false;
            try { installed = installFrameHook(globalScope.SceneManager, 'updateScene') || installed; } catch (_) {}
            try { installed = installFrameHook(globalScope.Graphics, 'render') || installed; } catch (_) {}
            return installed;
        };

        try {
            const PIXIObj = (typeof window !== 'undefined') ? (window.PIXI || window.Pixi || window.pixi) : null;
            if (!PIXIObj) {
                diag('[PIXI] Not found, skipping PIXI text hooks');
                return {
                    status: 'skipped',
                    reason: 'PIXI is unavailable.',
                };
            }

            const safeFindDescriptor = (proto, prop) => {
                let obj = proto;
                while (obj && obj !== Object.prototype) {
                    const d = Object.getOwnPropertyDescriptor(obj, prop);
                    if (d) return { owner: obj, desc: d };
                    obj = Object.getPrototypeOf(obj);
                }
                return null;
            };
            const markPixiObjectGone = (displayObject, reason, labelHint = '') => {
                if (!displayObject || !displayObject._trPixiTrackerRecordId) return;
                const label = labelHint
                    || (displayObject.constructor && displayObject.constructor.name)
                    || 'PIXI.Text';
                if (displayObject._trPixiTrackerVisible !== false) {
                    markRecordDisappeared(displayObject._trPixiTrackerRecordId, reason, { windowType: label });
                }
                activePixiObjects.delete(displayObject);
                displayObject._trPixiTrackerRecordId = null;
                displayObject._trPixiTrackerPayload = null;
                displayObject._trPixiTrackerVisible = false;
            };
            const markPixiTreeGone = (displayObject, reason, labelHint = '') => {
                if (!displayObject) return;
                markPixiObjectGone(displayObject, reason, labelHint);
                const children = Array.isArray(displayObject.children) ? displayObject.children.slice() : [];
                children.forEach((child) => markPixiTreeGone(child, reason, labelHint));
            };

            const installDestroyHook = (Ctor, label) => {
                if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.destroy !== 'function') return;
                if (Ctor.prototype.destroy.__trPixiTextDestroyWrapped) return;
                const originalDestroy = Ctor.prototype.destroy;
                Ctor.prototype.destroy = function(...args) {
                    markPixiObjectGone(this, 'pixi-text-destroyed', label);
                    return originalDestroy.apply(this, args);
                };
                Ctor.prototype.destroy.__trOriginal = originalDestroy;
                Ctor.prototype.destroy.__trPixiTextDestroyWrapped = true;
            };

            const installContainerRemovalHook = (Ctor) => {
                if (!Ctor || !Ctor.prototype) return false;
                let installed = false;
                if (typeof Ctor.prototype.removeChild === 'function'
                    && !Ctor.prototype.removeChild.__trPixiTextRemovalWrapped) {
                    const originalRemoveChild = Ctor.prototype.removeChild;
                    Ctor.prototype.removeChild = function(...children) {
                        const result = originalRemoveChild.apply(this, children);
                        try { children.forEach((child) => markPixiTreeGone(child, 'pixi-text-removed')); } catch (_) {}
                        return result;
                    };
                    Ctor.prototype.removeChild.__trOriginal = originalRemoveChild;
                    Ctor.prototype.removeChild.__trPixiTextRemovalWrapped = true;
                    installed = true;
                }
                if (typeof Ctor.prototype.removeChildAt === 'function'
                    && !Ctor.prototype.removeChildAt.__trPixiTextRemovalWrapped) {
                    const originalRemoveChildAt = Ctor.prototype.removeChildAt;
                    Ctor.prototype.removeChildAt = function(index) {
                        let child = null;
                        try { child = this.children && this.children[index]; } catch (_) {}
                        const result = originalRemoveChildAt.apply(this, arguments);
                        markPixiTreeGone(child || result, 'pixi-text-removed');
                        return result;
                    };
                    Ctor.prototype.removeChildAt.__trOriginal = originalRemoveChildAt;
                    Ctor.prototype.removeChildAt.__trPixiTextRemovalWrapped = true;
                    installed = true;
                }
                if (typeof Ctor.prototype.removeChildren === 'function'
                    && !Ctor.prototype.removeChildren.__trPixiTextRemovalWrapped) {
                    const originalRemoveChildren = Ctor.prototype.removeChildren;
                    Ctor.prototype.removeChildren = function(...args) {
                        let removed = [];
                        try {
                            const begin = Number.isFinite(Number(args[0])) ? Number(args[0]) : 0;
                            const end = Number.isFinite(Number(args[1])) ? Number(args[1]) : (this.children ? this.children.length : 0);
                            removed = Array.isArray(this.children) ? this.children.slice(begin, end) : [];
                        } catch (_) {}
                        const result = originalRemoveChildren.apply(this, args);
                        try {
                            (Array.isArray(result) && result.length ? result : removed)
                                .forEach((child) => markPixiTreeGone(child, 'pixi-text-removed'));
                        } catch (_) {}
                        return result;
                    };
                    Ctor.prototype.removeChildren.__trOriginal = originalRemoveChildren;
                    Ctor.prototype.removeChildren.__trPixiTextRemovalWrapped = true;
                    installed = true;
                }
                if (typeof Ctor.prototype.destroy === 'function'
                    && !Ctor.prototype.destroy.__trPixiTextRemovalWrapped) {
                    const originalDestroy = Ctor.prototype.destroy;
                    Ctor.prototype.destroy = function(...args) {
                        markPixiTreeGone(this, 'pixi-container-destroyed');
                        return originalDestroy.apply(this, args);
                    };
                    Ctor.prototype.destroy.__trOriginal = originalDestroy;
                    Ctor.prototype.destroy.__trPixiTextRemovalWrapped = true;
                    installed = true;
                }
                return installed;
            };

            const scaleFontSize = (value) => {
                if (typeof scaleFontSizeValue === 'function') {
                    return scaleFontSizeValue(value, textScaleOthers);
                }
                const numeric = Number(value);
                if (!Number.isFinite(numeric) || numeric <= 0) return value;
                return Math.max(1, Math.round(numeric * (textScaleOthers / 100)));
            };

            const getPixiStyle = (displayObject) => {
                try {
                    return displayObject && displayObject.style ? displayObject.style : null;
                } catch (_) {
                    return null;
                }
            };

            const restorePixiTextScale = (displayObject) => {
                if (!displayObject || !displayObject._trPixiTextScaleState) return;
                const state = displayObject._trPixiTextScaleState;
                try {
                    if (state.originalStyle) {
                        displayObject.style = state.originalStyle;
                    } else if (state.owner && state.key) {
                        state.owner[state.key] = state.value;
                    }
                } catch (_) {}
                try { delete displayObject._trPixiTextScaleState; } catch (_) {
                    displayObject._trPixiTextScaleState = null;
                }
            };

            const applyPixiTextScale = (displayObject) => {
                if (!displayObject || !shouldScaleTranslatedText()) return;
                try {
                    if (!displayObject._trPixiTextScaleState) {
                        const style = getPixiStyle(displayObject);
                        if (style && 'fontSize' in style) {
                            if (typeof style.clone === 'function') {
                                const originalStyle = style;
                                const cloned = style.clone();
                                displayObject.style = cloned;
                                displayObject._trPixiTextScaleState = {
                                    originalStyle,
                                    owner: cloned,
                                    key: 'fontSize',
                                    value: cloned.fontSize,
                                };
                            } else {
                                displayObject._trPixiTextScaleState = {
                                    owner: style,
                                    key: 'fontSize',
                                    value: style.fontSize,
                                };
                            }
                        } else if ('fontSize' in displayObject) {
                            displayObject._trPixiTextScaleState = {
                                owner: displayObject,
                                key: 'fontSize',
                                value: displayObject.fontSize,
                            };
                        }
                    }
                    const state = displayObject._trPixiTextScaleState;
                    if (state && state.owner && state.key) {
                        state.owner[state.key] = scaleFontSize(state.value);
                    }
                } catch (_) {}
            };

            const installSetterHook = (Ctor, label) => {
                if (!Ctor || !Ctor.prototype) return false;
                if (Ctor.prototype.__trTextWrapped) return true;
                const found = safeFindDescriptor(Ctor.prototype, 'text');
                if (!found || typeof found.desc.set !== 'function') {
                    diag(`[PIXI] ${label}.text setter not found; skipping`);
                    return false;
                }

                const originalSetter = found.desc.set;
                const originalGetter = found.desc.get || function() { return this._text; };
                const setOriginalText = (displayObject, value) => {
                    restorePixiTextScale(displayObject);
                    return originalSetter.call(displayObject, value);
                };
                const setTranslatedText = (displayObject, value) => {
                    applyPixiTextScale(displayObject);
                    return originalSetter.call(displayObject, value);
                };

                Object.defineProperty(found.owner, 'text', {
                    configurable: true,
                    enumerable: found.desc.enumerable,
                    get: originalGetter,
                    set: function(v) {
                        // candidate logging disabled
                        try {
                            const textStr = String(v);

                            // Bypass when our signature is present
                            if (textStr.startsWith(REDRAW_SIGNATURE)) {
                                const clean = textStr.substring(REDRAW_SIGNATURE.length);
                                return setTranslatedText(this, clean);
                            }

                            if (this._trPixiTrackerRecordId) {
                                markRecordDisappeared(this._trPixiTrackerRecordId, 'pixi-text-replaced', { windowType: label });
                                this._trPixiTrackerRecordId = null;
                            }
                            if (!this._trPixiTrackerId) {
                                try { this._trPixiTrackerId = Math.random().toString(36).substring(2, 11); } catch (_) {}
                            }
                            this._trTextVersion = (this._trTextVersion | 0) + 1;
                            const version = this._trTextVersion;

                            // Skip trivial strings (numbers, whitespace, symbols only)
                            if (translationCache.shouldSkip(textStr)) {
                                const skipDetails = describeTranslationSkip(textStr);
                                if (isTextTrackerEnabled() && typeof textTracker.detect === 'function' && textStr.trim()) {
                                    const skippedRecordId = `pixi:${this._trPixiTrackerId || 'text'}:${version}:skip`;
                                    this._trPixiTrackerRecordId = skippedRecordId;
                                    const skippedPayload = {
                                        id: skippedRecordId,
                                        hook: 'pixi',
                                        hookLabel: 'PIXI',
                                        surfaceType: 'pixi',
                                        status: 'skipped',
                                        rawText: textStr,
                                        visibleText: textStr,
                                        original: textStr,
                                        windowType: label,
                                    };
                                    rememberPixiRecord(this, skippedPayload);
                                    textTracker.detect(skippedPayload);
                                    textTracker.skip(skippedRecordId, skipDetails.reason || 'translation filter', Object.assign({ windowType: label }, skipDetails));
                                    updatePixiRecordPayload(this, { status: 'skipped' });
                                }
                                return setOriginalText(this, textStr);
                            }

                            const placeholderInfo = prepareTextForTranslation(textStr);
                            const translationSource = placeholderInfo.textForTranslation;
                            const norm = String(translationSource || '').trim();
                            if (!norm || translationCache.shouldSkip(norm)) {
                                const skipDetails = !norm
                                    ? { reason: 'emptyNormalized', length: 0 }
                                    : describeTranslationSkip(norm);
                                if (textStr.trim() && isTextTrackerEnabled() && typeof textTracker.detect === 'function') {
                                    const skippedRecordId = `pixi:${this._trPixiTrackerId || 'text'}:${version}:skip`;
                                    this._trPixiTrackerRecordId = skippedRecordId;
                                    const skippedPayload = {
                                        id: skippedRecordId,
                                        hook: 'pixi',
                                        hookLabel: 'PIXI',
                                        surfaceType: 'pixi',
                                        status: 'skipped',
                                        rawText: textStr,
                                        visibleText: textStr,
                                        original: textStr,
                                        translationSource,
                                        normalizedSource: norm,
                                        windowType: label,
                                    };
                                    rememberPixiRecord(this, skippedPayload);
                                    textTracker.detect(skippedPayload);
                                    textTracker.skip(skippedRecordId, skipDetails.reason || (!norm ? 'empty normalized source' : 'translation filter'), Object.assign({ windowType: label }, skipDetails));
                                    updatePixiRecordPayload(this, { status: 'skipped' });
                                }
                                return setOriginalText(this, textStr);
                            }

                            const recordId = `pixi:${this._trPixiTrackerId || 'text'}:${version}`;
                            this._trPixiTrackerRecordId = recordId;
                            if (isTextTrackerEnabled() && typeof textTracker.detect === 'function') {
                                const payload = {
                                    id: recordId,
                                    hook: 'pixi',
                                    hookLabel: 'PIXI',
                                    surfaceType: 'pixi',
                                    status: 'pending',
                                    rawText: textStr,
                                    visibleText: textStr,
                                    original: textStr,
                                    translationSource,
                                    normalizedSource: norm,
                                    windowType: label,
                                };
                                rememberPixiRecord(this, payload);
                                textTracker.detect(payload);
                            }

                            if (telemetry && typeof telemetry.logTextDetected === 'function') {
                                telemetry.logTextDetected('pixi', norm, 0, 0, {
                                    windowType: label,
                                });
                            }

                            // Synchronous cache hit path
                            try {
                                if (translationCache.completed.has(norm)) {
                                    trackDecision(recordId, 'translation.cache_hit', '', { windowType: label });
                                    let translated = translationCache.completed.get(norm);
                                    translated = placeholderInfo
                                        ? restoreControlCodes(translated, placeholderInfo, textStr)
                                        : translated;
                                    // Skip replacement if original and translated text are the same
                                    if (typeof translated !== 'string' || translated.trim() === textStr.trim()) {
                                        if (isTextTrackerEnabled() && typeof textTracker.skip === 'function') {
                                            textTracker.skip(recordId, 'translated text matched original');
                                        }
                                        updatePixiRecordPayload(this, { status: 'skipped' });
                                        dbg(`[PIXI Skip] Original and translated text are identical: "${preview(norm)}"`);
                                        return setOriginalText(this, textStr);
                                    }
                                    const signed = REDRAW_SIGNATURE + translated;
                                    updatePixiRecordPayload(this, {
                                        status: 'completed',
                                        translation: translated,
                                    });
                                    if (isTextTrackerEnabled() && typeof textTracker.complete === 'function') {
                                        textTracker.complete(recordId, translated, {
                                            source: 'cache',
                                            translationReceived: translated,
                                        });
                                        textTracker.draw(recordId, 'setter', {
                                            windowType: label,
                                            translationDrawn: translated,
                                        });
                                    }
                                    return setTranslatedText(this, signed);
                                }
                            } catch (_) {}

                            // Async path: set original now; when translation completes and still current, update
                            const versionPlaceholder = placeholderInfo;
                            const originalValue = textStr;
                            setOriginalText(this, textStr);
                            translationCache.requestTranslation(translationSource, {
                                recordId,
                                hook: 'pixi',
                            })
                                .then(translated => {
                                    try {
                                        if (this._trTextVersion !== version) {
                                            markRecordDisappeared(recordId, 'pixi-text-superseded', {
                                                windowType: label,
                                                expectedVersion: version,
                                                currentVersion: this._trTextVersion || 0,
                                            });
                                            return;
                                        } // superseded
                                        // Skip replacement if original and translated text are the same
                                        let restored = versionPlaceholder
                                            ? restoreControlCodes(translated, versionPlaceholder, originalValue)
                                            : translated;
                                        if (typeof restored !== 'string') restored = originalValue;
                                        if (restored.trim() === originalValue.trim()) {
                                            if (isTextTrackerEnabled() && typeof textTracker.skip === 'function') {
                                                textTracker.skip(recordId, 'translated text matched original');
                                            }
                                            updatePixiRecordPayload(this, { status: 'skipped' });
                                            dbg(`[PIXI Async Skip] Original and translated text are identical: "${preview(norm)}"`);
                                            return;
                                        }
                                        const signed = REDRAW_SIGNATURE + restored;
                                        updatePixiRecordPayload(this, {
                                            status: 'completed',
                                            translation: restored,
                                        });
                                        if (isTextTrackerEnabled() && typeof textTracker.complete === 'function') {
                                            textTracker.complete(recordId, restored, {
                                                source: 'pixi',
                                                translationReceived: translated,
                                            });
                                            textTracker.draw(recordId, 'setter', {
                                                windowType: label,
                                                translationDrawn: restored,
                                            });
                                        }
                                        setTranslatedText(this, signed);
                                    } catch (e) {
                                        // ignore update errors
                                    }
                                })
                                .catch((error) => {
                                    updatePixiRecordPayload(this, { status: 'failed' });
                                    if (isTextTrackerEnabled() && typeof textTracker.fail === 'function') {
                                        textTracker.fail(recordId, error && error.message ? error.message : String(error || 'translation error'));
                                    }
                                    /* keep original on failure */
                                });
                        } catch (e) {
                            try { return setOriginalText(this, v); } catch (_) {}
                        }
                    }
                });

                // Mark wrapper for idempotency (stored on descriptor is not portable; keep a symbol on Ctor)
                try { Ctor.prototype.__trTextWrapped = true; } catch (_) {}
                installDestroyHook(Ctor, label);
                dbg(`[PIXI] Hooked ${label}.text setter`);
                return true;
            };

            let hookedAny = false;
            try { hookedAny = installSetterHook(PIXIObj.Text, 'PIXI.Text') || hookedAny; } catch (_) {}
            try { hookedAny = installSetterHook(PIXIObj.BitmapText, 'PIXI.BitmapText') || hookedAny; } catch (_) {}
            if (!hookedAny) {
                diag('[PIXI] No text classes hooked');
                return {
                    status: 'skipped',
                    reason: 'No writable PIXI.Text/PIXI.BitmapText text setters found.',
                };
            }
            try { installContainerRemovalHook(PIXIObj.Container); } catch (_) {}
            try { installContainerRemovalHook(PIXIObj.DisplayObjectContainer); } catch (_) {}
            installVisibilityFrameHooks();
            return {
                status: 'installed',
                reason: 'PIXI text setter hooks installed.',
            };
        } catch (e) {
            logger.error('[PIXI Hook Error]', e);
            return {
                status: 'failed',
                reason: e && e.message ? e.message : String(e || 'PIXI hook error'),
            };
        }
    }

        return trackPixiText();
    }

    defineRuntimeModule('hooks.pixiText', {
        install: installPixiTextHook,
    });
})();
