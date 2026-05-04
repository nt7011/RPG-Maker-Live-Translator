// Window_Help.setText hook.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/help-window-hook.js.');
    }

    function installHelpWindowHook(context = {}) {
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
            generateKey,
            contentsOwners,
            windowRegistry,
            registeredWindows,
            PER_CHAR_MARK,
            REDRAW_SIGNATURE = '',
            perf,
            logEscape = () => {},
        } = context;
    // Hook Window_Help.setText to capture full descriptions (items, skills, etc.)
    // Very common and whole-string; integrates with cache and signature bypass.
    function trackHelpWindow() {
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
        const clearHelpRecord = (helpWindow, reason, details = null) => {
            if (!helpWindow || !helpWindow._trHelpTrackerRecordId) return;
            markRecordDisappeared(helpWindow._trHelpTrackerRecordId, reason || 'help-text-disappeared', Object.assign({
                windowType: helpWindow && helpWindow.constructor ? helpWindow.constructor.name : 'Window_Help',
            }, details || {}));
            helpWindow._trHelpTrackerRecordId = null;
        };
        const getHelpScreenState = (helpWindow) => {
            if (!helpWindow) return 'removed';
            if (helpWindow.visible === false) return 'hidden';
            const openness = Number(helpWindow.openness);
            if (Number.isFinite(openness) && openness <= 0) return 'closed';
            const contentsOpacity = Number(helpWindow.contentsOpacity);
            if (Number.isFinite(contentsOpacity) && contentsOpacity <= 0) return 'transparent';
            return 'visible';
        };
        const clearHelpRecordIfOffscreen = (helpWindow, reason) => {
            const screenState = getHelpScreenState(helpWindow);
            if (screenState === 'visible') return;
            clearHelpRecord(helpWindow, reason || `help-window-${screenState}`, { screenState });
        };

        try {
            if (typeof Window_Help === 'undefined' || !Window_Help || !Window_Help.prototype) {
                return {
                    status: 'skipped',
                    reason: 'Window_Help is unavailable.',
                };
            }
            const originalSetText = Window_Help.prototype.setText;
            if (typeof originalSetText !== 'function') {
                return {
                    status: 'skipped',
                    reason: 'Window_Help.setText is unavailable.',
                };
            }
            if (originalSetText.__trHelpWindowWrapper === 'liveTranslator.helpWindow') {
                return {
                    status: 'installed',
                    reason: 'Window_Help.setText hook was already installed.',
                };
            }

            const originalFn = originalSetText.__trOriginal || originalSetText;
            const wrappedSetText = function(text) {
                try {
                    const textStr = String(text);

                    // Bypass if already signed
                    if (textStr.startsWith(REDRAW_SIGNATURE)) {
                        const clean = textStr.substring(REDRAW_SIGNATURE.length);
                        return originalFn.call(this, clean);
                    }

                    clearHelpRecord(this, 'help-text-replaced');
                    if (!this._uniqueId) {
                        try { this._uniqueId = Math.random().toString(36).substring(2, 11); } catch (_) {}
                    }
                    this._trHelpVersion = (this._trHelpVersion | 0) + 1;
                    const version = this._trHelpVersion;

                    // Prefer translating after escape conversion for better context
                    let converted = textStr;
                    try { converted = this.convertEscapeCharacters(textStr); } catch (_) {}

                    const placeholderInfo = prepareTextForTranslation(converted || '');
                    const translationSource = placeholderInfo.textForTranslation;
                    const norm = String(translationSource || '').trim();
                    if (!norm || translationCache.shouldSkip(norm)) {
                        const visible = stripRpgmEscapes(converted || '').trim();
                        const skipDetails = !norm
                            ? { reason: 'emptyNormalized', length: 0 }
                            : describeTranslationSkip(norm);
                        if (visible && isTextTrackerEnabled() && typeof textTracker.detect === 'function') {
                            const skippedRecordId = `help:${this._uniqueId || 'window'}:${version}:skip`;
                            this._trHelpTrackerRecordId = skippedRecordId;
                            textTracker.detect({
                                id: skippedRecordId,
                                hook: 'help_window',
                                hookLabel: 'Help Window',
                                surfaceType: 'window',
                                status: 'skipped',
                                rawText: textStr,
                                convertedText: converted,
                                visibleText: visible,
                                original: visible,
                                translationSource,
                                normalizedSource: norm,
                                x: 0,
                                y: 0,
                                windowType: this && this.constructor ? this.constructor.name : 'Window_Help',
                            });
                            textTracker.skip(skippedRecordId, skipDetails.reason || (!norm ? 'empty normalized source' : 'translation filter'), skipDetails);
                        }
                        return originalFn.call(this, textStr);
                    }

                    const recordId = `help:${this._uniqueId || 'window'}:${version}`;
                    this._trHelpTrackerRecordId = recordId;
                    if (isTextTrackerEnabled() && typeof textTracker.detect === 'function') {
                        textTracker.detect({
                            id: recordId,
                            hook: 'help_window',
                            hookLabel: 'Help Window',
                            surfaceType: 'window',
                            status: 'pending',
                            rawText: textStr,
                            convertedText: converted,
                            visibleText: stripRpgmEscapes(converted || '').trim(),
                            original: stripRpgmEscapes(converted || '').trim(),
                            translationSource,
                            normalizedSource: norm,
                            x: 0,
                            y: 0,
                            windowType: this && this.constructor ? this.constructor.name : 'Window_Help',
                        });
                    }

                    if (telemetry && typeof telemetry.logTextDetected === 'function') {
                        telemetry.logTextDetected('help_window', norm, 0, 0, {
                            windowType: this && this.constructor ? this.constructor.name : 'Window_Help',
                        });
                    }

                    // Cache hit: apply translated immediately
                    try {
                        if (translationCache.completed.has(norm)) {
                            trackDecision(recordId, 'translation.cache_hit');
                            let translated = translationCache.completed.get(norm);
                            translated = restoreControlCodes(translated, placeholderInfo, converted || textStr);
                            // Skip replacement if original and translated text are the same
                            if (typeof translated !== 'string' || translated.trim() === (converted || '').trim()) {
                                if (isTextTrackerEnabled() && typeof textTracker.skip === 'function') {
                                    textTracker.skip(recordId, 'translated text matched original');
                                }
                                dbg(`[Help Skip] Original and translated text are identical: "${preview(norm)}"`);
                                return originalFn.call(this, textStr);
                            }
                            const signed = REDRAW_SIGNATURE + translated;
                            if (isTextTrackerEnabled() && typeof textTracker.complete === 'function') {
                                textTracker.complete(recordId, translated, {
                                    source: 'cache',
                                    translationReceived: translated,
                                });
                                textTracker.draw(recordId, 'setText', {
                                    windowType: this && this.constructor ? this.constructor.name : 'Window_Help',
                                    translationDrawn: translated,
                                });
                            }
                            return originalFn.call(this, signed);
                        }
                    } catch (_) {}

                    // Async path: set original now, then update when ready if unchanged
                    const self = this;
                    const res = originalFn.call(this, textStr);
                    translationCache.requestTranslation(translationSource, {
                        recordId,
                        hook: 'help_window',
                    })
                        .then(translated => {
                            try {
                                if (self._trHelpVersion !== version) {
                                    markRecordDisappeared(recordId, 'help-text-superseded', {
                                        expectedVersion: version,
                                        currentVersion: self._trHelpVersion || 0,
                                    });
                                    return;
                                } // superseded by newer setText
                                // Skip replacement if original and translated text are the same
                                let restored = restoreControlCodes(translated, placeholderInfo, converted || textStr);
                                if (typeof restored !== 'string' || restored.trim() === (converted || '').trim()) {
                                    if (isTextTrackerEnabled() && typeof textTracker.skip === 'function') {
                                        textTracker.skip(recordId, 'translated text matched original');
                                    }
                                    dbg(`[Help Async Skip] Original and translated text are identical: "${preview(norm)}"`);
                                    return;
                                }
                                const signed = REDRAW_SIGNATURE + restored;
                                if (isTextTrackerEnabled() && typeof textTracker.complete === 'function') {
                                    textTracker.complete(recordId, restored, {
                                        source: 'help-window',
                                        translationReceived: translated,
                                    });
                                    textTracker.draw(recordId, 'setText', {
                                        windowType: self && self.constructor ? self.constructor.name : 'Window_Help',
                                        translationDrawn: restored,
                                    });
                                }
                                originalFn.call(self, signed);
                            } catch (_) { /* ignore */ }
                        })
                        .catch((error) => {
                            if (isTextTrackerEnabled() && typeof textTracker.fail === 'function') {
                                textTracker.fail(recordId, error && error.message ? error.message : String(error || 'translation error'));
                            }
                            /* keep original on failure */
                        });
                    return res;
                } catch (e) {
                    logger.error('[Window_Help.setText Hook Error]', e);
                    return originalFn.call(this, text);
                }
            };
            wrappedSetText.__trOriginal = originalFn;
            wrappedSetText.__trHelpWindowWrapper = 'liveTranslator.helpWindow';
            Window_Help.prototype.setText = wrappedSetText;
            ['close', 'hide', 'destroy'].forEach((methodName) => {
                const current = Window_Help.prototype[methodName];
                if (typeof current !== 'function' || current.__trHelpLifecycleWrapper === 'liveTranslator.helpWindow') return;
                const originalLifecycle = current;
                Window_Help.prototype[methodName] = function(...args) {
                    clearHelpRecord(this, `help-window-${methodName}`);
                    return originalLifecycle.apply(this, args);
                };
                Window_Help.prototype[methodName].__trOriginal = originalLifecycle;
                Window_Help.prototype[methodName].__trHelpLifecycleWrapper = 'liveTranslator.helpWindow';
            });
            const currentUpdate = Window_Help.prototype.update;
            if (typeof currentUpdate === 'function'
                && currentUpdate.__trHelpLifecycleWrapper !== 'liveTranslator.helpWindow') {
                const originalUpdate = currentUpdate;
                Window_Help.prototype.update = function(...args) {
                    const result = originalUpdate.apply(this, args);
                    clearHelpRecordIfOffscreen(this, 'help-window-offscreen');
                    return result;
                };
                Window_Help.prototype.update.__trOriginal = originalUpdate;
                Window_Help.prototype.update.__trHelpLifecycleWrapper = 'liveTranslator.helpWindow';
            }
            dbg('[Help] Hooked Window_Help.setText');
            return {
                status: 'installed',
                reason: 'Window_Help.setText hook installed.',
            };
        } catch (e) {
            logger.error('[Help Hook Error]', e);
            return {
                status: 'failed',
                reason: e && e.message ? e.message : String(e || 'help hook error'),
            };
        }
    }

        return trackHelpWindow();
    }

    defineRuntimeModule('hooks.helpWindow', {
        install: installHelpWindowHook,
    });
})();
