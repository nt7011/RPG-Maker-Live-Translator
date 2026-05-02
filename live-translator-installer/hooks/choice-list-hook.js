// Window_ChoiceList text hook.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/choice-list-hook.js.');
    }

    function installChoiceListHook(context = {}) {
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
    function trackChoiceList() {
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
        const clearChoiceRecords = (choiceWindow, reason, details = null) => {
            if (!choiceWindow) return;
            const recordIds = Array.isArray(choiceWindow._trChoiceTrackerRecordIds)
                ? choiceWindow._trChoiceTrackerRecordIds.slice()
                : [];
            recordIds.forEach((recordId) => {
                markRecordDisappeared(recordId, reason || 'choice-list-disappeared', Object.assign({
                    windowType: 'Window_ChoiceList',
                }, details || {}));
            });
            choiceWindow._trChoiceTrackerRecordIds = [];
        };
        const ensureChoiceRecordIds = (choiceWindow) => {
            if (!choiceWindow) return [];
            if (!Array.isArray(choiceWindow._trChoiceTrackerRecordIds)) {
                choiceWindow._trChoiceTrackerRecordIds = [];
            }
            return choiceWindow._trChoiceTrackerRecordIds;
        };
        const trackChoiceRecordId = (choiceWindow, recordId) => {
            if (!choiceWindow || !recordId) return;
            const recordIds = ensureChoiceRecordIds(choiceWindow);
            if (recordIds.indexOf(recordId) < 0) recordIds.push(recordId);
        };
        const getChoiceScreenState = (choiceWindow) => {
            if (!choiceWindow) return 'removed';
            if (choiceWindow.visible === false) return 'hidden';
            const openness = Number(choiceWindow.openness);
            if (Number.isFinite(openness) && openness <= 0) return 'closed';
            const contentsOpacity = Number(choiceWindow.contentsOpacity);
            if (Number.isFinite(contentsOpacity) && contentsOpacity <= 0) return 'transparent';
            const commands = Array.isArray(choiceWindow._list) ? choiceWindow._list : [];
            if (!commands.length) return 'empty';
            return 'visible';
        };
        const clearChoiceRecordsIfOffscreen = (choiceWindow, reason) => {
            const screenState = getChoiceScreenState(choiceWindow);
            if (screenState === 'visible') return;
            clearChoiceRecords(choiceWindow, reason || `choice-list-${screenState}`, { screenState });
        };

        if (typeof Window_ChoiceList === 'undefined' || !Window_ChoiceList || !Window_ChoiceList.prototype) {
            diag('[Choice] Window_ChoiceList unavailable; skipping choice hooks');
            return {
                status: 'skipped',
                reason: 'Window_ChoiceList is unavailable.',
            };
        }

        const originalMakeCommandList = Window_ChoiceList.prototype.makeCommandList;
        if (typeof originalMakeCommandList !== 'function') {
            logger.warn('[Choice] makeCommandList not found; skipping choice hooks');
            return {
                status: 'skipped',
                reason: 'Window_ChoiceList.makeCommandList is unavailable.',
            };
        }
        if (originalMakeCommandList.__trChoiceListWrapper === 'liveTranslator.choiceList') {
            return {
                status: 'installed',
                reason: 'Window_ChoiceList.makeCommandList hook was already installed.',
            };
        }

        const originalFn = originalMakeCommandList.__trOriginal || originalMakeCommandList;
        const wrappedMakeCommandList = function() {
            const result = originalFn.call(this);
            try {
                if (!translationCache || typeof translationCache.requestTranslation !== 'function') {
                    return result;
                }

                this._trChoiceSessionId = (this._trChoiceSessionId || 0) + 1;
                const sessionId = this._trChoiceSessionId;
                const choiceWindow = this;
                clearChoiceRecords(this, 'choice-list-rebuilt', { sessionId });
                ensureChoiceRecordIds(this);
                const commands = Array.isArray(this._list) ? this._list : [];
                if (!commands.length) return result;
                if (!this._uniqueId) {
                    try { this._uniqueId = Math.random().toString(36).substring(2, 11); } catch (_) {}
                }

                commands.forEach((command, index) => {
                    if (!command || typeof command.name !== 'string') return;

                    const rawName = command.name;
                    let converted = rawName;
                    try { converted = choiceWindow.convertEscapeCharacters(rawName); } catch (_) {}

                    const visible = stripRpgmEscapes(converted).trim();
                    if (!visible || translationCache.shouldSkip(visible)) {
                        const skipDetails = !visible
                            ? { reason: 'empty', length: 0 }
                            : describeTranslationSkip(visible);
                        if (visible && isTextTrackerEnabled() && typeof textTracker.detect === 'function') {
                            const skippedRecordId = `choice:${choiceWindow._uniqueId || 'window'}:${sessionId}:${index}`;
                            trackChoiceRecordId(choiceWindow, skippedRecordId);
                            textTracker.detect({
                                id: skippedRecordId,
                                hook: 'choice',
                                hookLabel: 'Choice List',
                                surfaceType: 'window',
                                status: 'skipped',
                                rawText: rawName,
                                convertedText: converted,
                                visibleText: visible,
                                original: visible,
                                x: index,
                                y: 0,
                                windowType: 'Window_ChoiceList',
                            });
                            textTracker.skip(skippedRecordId, skipDetails.reason || 'translation filter', Object.assign({ index }, skipDetails));
                        }
                        return;
                    }

                    telemetry.logTextDetected('choice', visible, index, 0, { windowType: 'Window_ChoiceList' });

                    const placeholderInfo = prepareTextForTranslation(converted);
                    const translationSource = placeholderInfo.textForTranslation;
                    const normalizedSource = String(translationSource || '').trim();
                    if (!normalizedSource) {
                        const skippedRecordId = `choice:${choiceWindow._uniqueId || 'window'}:${sessionId}:${index}:empty`;
                        trackChoiceRecordId(choiceWindow, skippedRecordId);
                        if (isTextTrackerEnabled() && typeof textTracker.detect === 'function') {
                            textTracker.detect({
                                id: skippedRecordId,
                                hook: 'choice',
                                hookLabel: 'Choice List',
                                surfaceType: 'window',
                                status: 'skipped',
                                rawText: rawName,
                                convertedText: converted,
                                visibleText: visible,
                                original: visible,
                                translationSource,
                                normalizedSource,
                                x: index,
                                y: 0,
                                windowType: 'Window_ChoiceList',
                            });
                            textTracker.skip(skippedRecordId, 'empty normalized source', { index });
                        }
                        return;
                    }
                    const recordId = `choice:${choiceWindow._uniqueId || 'window'}:${sessionId}:${index}`;
                    trackChoiceRecordId(choiceWindow, recordId);
                    if (isTextTrackerEnabled() && typeof textTracker.detect === 'function') {
                        textTracker.detect({
                            id: recordId,
                            hook: 'choice',
                            hookLabel: 'Choice List',
                            surfaceType: 'window',
                            status: 'pending',
                            rawText: rawName,
                            convertedText: converted,
                            visibleText: visible,
                            original: visible,
                            translationSource,
                            normalizedSource,
                            x: index,
                            y: 0,
                            windowType: 'Window_ChoiceList',
                        });
                    }

                    const applyTranslated = (translated) => {
                        if (choiceWindow._trChoiceSessionId !== sessionId) {
                            markRecordDisappeared(recordId, 'choice-session-expired', {
                                expectedSessionId: sessionId,
                                currentSessionId: choiceWindow._trChoiceSessionId || 0,
                                index,
                            });
                            return;
                        }
                        if (typeof translated !== 'string' || !translated.trim()) {
                            trackDecision(recordId, 'translation.empty_result', '', { index });
                            return;
                        }

                        let restored = restoreControlCodes(translated, placeholderInfo, converted);
                        if (!restored) restored = converted;

                        const restoredVisible = stripRpgmEscapes(restored).trim();
                        if (!restoredVisible || restoredVisible === visible) {
                            if (isTextTrackerEnabled() && typeof textTracker.skip === 'function') {
                                textTracker.skip(recordId, 'translated text matched original');
                            }
                            return;
                        }

                        const entry = choiceWindow._list && choiceWindow._list[index];
                        if (!entry) {
                            markRecordDisappeared(recordId, 'choice-entry-missing', { index });
                            return;
                        }

                        const finalText = restored.startsWith(REDRAW_SIGNATURE)
                            ? restored
                            : REDRAW_SIGNATURE + restored;

                        if (entry._trAppliedText === finalText) {
                            trackDecision(recordId, 'draw.skipped', 'already applied', { index });
                            return;
                        }
                        entry._trAppliedText = finalText;
                        entry.name = finalText;
                        if (isTextTrackerEnabled() && typeof textTracker.complete === 'function') {
                            textTracker.complete(recordId, restored, {
                                source: 'choice-list',
                                translationReceived: translated,
                            });
                            textTracker.draw(recordId, 'redraw', {
                                index,
                                translationDrawn: restored,
                            });
                        }

                        if (typeof choiceWindow.redrawItem === 'function') {
                            try { choiceWindow.redrawItem(index); return; } catch (_) {}
                        }
                        if (typeof choiceWindow.drawAllItems === 'function') {
                            try { choiceWindow.drawAllItems(); return; } catch (_) {}
                        }
                    };

                    if (translationCache.completed
                        && typeof translationCache.completed.has === 'function'
                        && translationCache.completed.has(normalizedSource)) {
                        trackDecision(recordId, 'translation.cache_hit', '', { index });
                        applyTranslated(translationCache.completed.get(normalizedSource));
                        return;
                    }

                    translationCache.requestTranslation(translationSource, {
                        recordId,
                        hook: 'choice',
                    })
                        .then(applyTranslated)
                        .catch((error) => {
                            if (isTextTrackerEnabled() && typeof textTracker.fail === 'function') {
                                textTracker.fail(recordId, error && error.message ? error.message : String(error || 'translation error'));
                            }
                            logger.warn('[Choice] Translation error:', error);
                        });
                });
            } catch (error) {
                logger.error('[Choice] makeCommandList hook error', error);
            }
            return result;
        };
        wrappedMakeCommandList.__trOriginal = originalFn;
        wrappedMakeCommandList.__trChoiceListWrapper = 'liveTranslator.choiceList';
        Window_ChoiceList.prototype.makeCommandList = wrappedMakeCommandList;

        ['close', 'hide', 'destroy'].forEach((methodName) => {
            const current = Window_ChoiceList.prototype[methodName];
            if (typeof current !== 'function' || current.__trChoiceListLifecycleWrapper === 'liveTranslator.choiceList') return;
            const originalLifecycle = current;
            Window_ChoiceList.prototype[methodName] = function(...args) {
                clearChoiceRecords(this, `choice-list-${methodName}`);
                return originalLifecycle.apply(this, args);
            };
            Window_ChoiceList.prototype[methodName].__trOriginal = originalLifecycle;
            Window_ChoiceList.prototype[methodName].__trChoiceListLifecycleWrapper = 'liveTranslator.choiceList';
        });
        const currentUpdate = Window_ChoiceList.prototype.update;
        if (typeof currentUpdate === 'function'
            && currentUpdate.__trChoiceListLifecycleWrapper !== 'liveTranslator.choiceList') {
            const originalUpdate = currentUpdate;
            Window_ChoiceList.prototype.update = function(...args) {
                const result = originalUpdate.apply(this, args);
                clearChoiceRecordsIfOffscreen(this, 'choice-list-offscreen');
                return result;
            };
            Window_ChoiceList.prototype.update.__trOriginal = originalUpdate;
            Window_ChoiceList.prototype.update.__trChoiceListLifecycleWrapper = 'liveTranslator.choiceList';
        }
        return {
            status: 'installed',
            reason: 'Window_ChoiceList.makeCommandList hook installed.',
        };
    }

        return trackChoiceList();
    }

    defineRuntimeModule('hooks.choiceList', {
        install: installChoiceListHook,
    });
})();
