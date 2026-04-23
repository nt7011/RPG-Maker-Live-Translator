(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }

    globalScope.LiveTranslatorModules.installWindowDrawHooks = function installWindowDrawHooks(options = {}) {
        const {
            logger,
            telemetry,
            translationCache,
            windowRegistry,
            registeredWindows,
            ensureWindowRegistered,
            generateKey,
            captureBitmapDrawState,
            applyBitmapDrawState,
            preview = (text) => String(text ?? ''),
            REDRAW_SIGNATURE = '',
            diag = () => {},
            dbg = () => {},
            stripRpgmEscapes,
            prepareTextForTranslation,
            restoreControlCodes,
        } = options;

        if (typeof stripRpgmEscapes !== 'function'
            || typeof prepareTextForTranslation !== 'function'
            || typeof restoreControlCodes !== 'function') {
            throw new Error('[WindowDrawHooks] control code helpers are required (strip/prepare/restore).');
        }

        if (!logger || !telemetry || !translationCache || !windowRegistry || !registeredWindows) {
            throw new Error('[WindowDrawHooks] Missing required dependencies.');
        }
        if (typeof ensureWindowRegistered !== 'function') {
            throw new Error('[WindowDrawHooks] ensureWindowRegistered must be a function.');
        }
        if (typeof generateKey !== 'function') {
            throw new Error('[WindowDrawHooks] generateKey must be a function.');
        }
        if (typeof captureBitmapDrawState !== 'function' || typeof applyBitmapDrawState !== 'function') {
            throw new Error('[WindowDrawHooks] capture/apply bitmap helpers are required.');
        }

        const redrawSettings = { extraPadding: 0, defaultOutline: 0 };

        function sanitizeDrawTextOutput(text, type) {
            if (typeof text !== 'string') return text;
            return type === 'drawText' ? stripRpgmEscapes(text) : text;
        }

        function addBitmapSuppressionRect(bitmap, x1, y1, x2, y2, durationMs = 200, content = null) {
            try {
                if (!bitmap) return;
                const now = Date.now();
                const rect = {
                    x1: Math.max(0, x1 | 0),
                    y1: Math.max(0, y1 | 0),
                    x2: x2 | 0,
                    y2: y2 | 0,
                    exp: now + durationMs,
                    content: content ? String(content) : null
                };
                if (!Array.isArray(bitmap._trSuppressRects)) bitmap._trSuppressRects = [];
                bitmap._trSuppressRects.push(rect);
            } catch (_) {}
        }

        function mergeBounds(a, b) {
            const isValid = (bounds) => bounds
                && Number.isFinite(bounds.x1) && Number.isFinite(bounds.y1)
                && Number.isFinite(bounds.x2) && Number.isFinite(bounds.y2);
            if (isValid(a) && isValid(b)) {
                return {
                    x1: Math.min(a.x1, b.x1),
                    y1: Math.min(a.y1, b.y1),
                    x2: Math.max(a.x2, b.x2),
                    y2: Math.max(a.y2, b.y2),
                };
            }
            return isValid(a) ? a : (isValid(b) ? b : null);
        }

        function expandBoundsForMaxWidth(bounds, window, x, maxWidth) {
            if (!bounds || !window) return bounds;
            if (!maxWidth || !Number.isFinite(maxWidth) || maxWidth <= 0 || maxWidth === Infinity) {
                return bounds;
            }
            const x1 = Number.isFinite(bounds.x1) ? bounds.x1 : x;
            const x2 = Math.max(Number.isFinite(bounds.x2) ? bounds.x2 : x1, x + maxWidth);
            return {
                x1,
                y1: bounds.y1,
                x2: x2,
                y2: bounds.y2,
            };
        }

        function estimateEntryBounds(window, type, text, x, y, convertedText) {
            try {
                const contents = window && window.contents ? window.contents : null;
                const baseLineHeight = (() => {
                    if (window && typeof window.lineHeight === 'function') {
                        return Math.max(1, Math.ceil(window.lineHeight()));
                    }
                    if (contents && typeof contents.fontSize === 'number') {
                        return Math.max(1, Math.ceil(contents.fontSize));
                    }
                    return 24;
                })();

                let width = 0;
                let height = baseLineHeight;
                const basis = stripRpgmEscapes(String(convertedText || text || ''));

                try {
                    if (type === 'drawTextEx' && typeof window.textSizeEx === 'function') {
                        const sz = window.textSizeEx(basis);
                        width = Math.ceil((sz && sz.width) || 0);
                        if (sz && Number.isFinite(sz.height)) {
                            height = Math.max(height, Math.ceil(sz.height));
                        }
                    } else if (contents && typeof contents.measureTextWidth === 'function') {
                        width = Math.ceil(contents.measureTextWidth(basis));
                    } else if (typeof window.textWidth === 'function') {
                        width = Math.ceil(window.textWidth(basis));
                    } else if (contents && typeof contents.textWidth === 'function') {
                        width = Math.ceil(contents.textWidth(basis));
                    }
                } catch (_) {}

                if (!width || !Number.isFinite(width)) {
                    const fontSize = contents && typeof contents.fontSize === 'number' ? contents.fontSize : baseLineHeight;
                    width = Math.ceil(basis.length * Math.max(6, fontSize * 0.6));
                }
                if (!height || !Number.isFinite(height)) {
                    height = baseLineHeight;
                }

                const x1 = Number.isFinite(Number(x)) ? Number(x) : 0;
                const y1 = Number.isFinite(Number(y)) ? Number(y) : 0;
                return {
                    x1,
                    y1,
                    x2: x1 + Math.max(0, width),
                    y2: y1 + Math.max(0, height)
                };
            } catch (_) {
                return null;
            }
        }

        function markEntryStale(windowData, key, entry) {
            if (!entry) return;
            entry._trStale = true;
            entry.translationStatus = entry.translationStatus === 'completed' ? 'stale' : entry.translationStatus;
            if (windowData && windowData.pendingRedraws) {
                try { windowData.pendingRedraws.delete(key); } catch (_) {}
            }
        }

        function getTextEntryKey(windowData, textEntry) {
            if (!windowData || !textEntry) return null;
            return generateKey(
                textEntry.type,
                textEntry.position && textEntry.position.x,
                textEntry.position && textEntry.position.y,
                windowData.windowType,
                textEntry.convertedText
            );
        }

        function dropPendingRedraw(windowData, textEntry, key = null) {
            if (!windowData || !windowData.pendingRedraws) return;
            const textKey = key || getTextEntryKey(windowData, textEntry);
            if (!textKey) return;
            try { windowData.pendingRedraws.delete(textKey); } catch (_) {}
            if (textEntry) {
                try { textEntry._queueLogged = false; } catch (_) {}
            }
        }

        function withWindowRedrawClear(contents, fn) {
            if (!contents || typeof fn !== 'function') return undefined;
            contents._trWindowRedrawClearDepth = (contents._trWindowRedrawClearDepth || 0) + 1;
            try {
                return fn();
            } finally {
                contents._trWindowRedrawClearDepth = Math.max(0, (contents._trWindowRedrawClearDepth || 1) - 1);
            }
        }

        function shouldRefreshWindowForTranslation(window, windowData) {
            if (!window || typeof window.refresh !== 'function') return false;
            if (window._trTranslationRefreshDepth > 0) return false;
            const windowType = (windowData && windowData.windowType)
                || (window.constructor && window.constructor.name)
                || '';
            if (/Window_(Message|Message_Battle|ChoiceList|NameBox)/.test(windowType)) {
                return false;
            }
            try {
                if (typeof Window_Selectable !== 'undefined' && window instanceof Window_Selectable) {
                    return true;
                }
            } catch (_) {}
            return /^Window_(BattleSkill|Skill|Item|Equip|Status|Command|Shop|Menu|ActorCommand|PartyCommand)/.test(windowType);
        }

        function refreshWindowForTranslation(window, windowData, textEntry) {
            if (!shouldRefreshWindowForTranslation(window, windowData)) return false;
            window._trTranslationRefreshDepth = (window._trTranslationRefreshDepth || 0) + 1;
            try {
                diag(`[Redraw Refresh] ${windowData.windowType || (window.constructor && window.constructor.name) || 'Window'} "${preview(textEntry.convertedText)}"`);
                window.refresh();
                return true;
            } catch (error) {
                logger.warn('[Redraw Refresh Error]', error);
                return false;
            } finally {
                window._trTranslationRefreshDepth = Math.max(0, (window._trTranslationRefreshDepth || 1) - 1);
            }
        }

        function refreshExistingTextEntry(window, entry, text, x, y, type = null, convertedText = null, originalParams = null) {
            if (!entry) return null;

            const textToTranslate = convertedText || text;
            const trimmed = String(textToTranslate || '').trim();

            entry.type = type || entry.type;
            entry.rawText = text;
            entry.convertedText = trimmed;
            entry.position = { x, y };
            entry.originalParams = originalParams || entry.originalParams || {};
            entry.timestamp = Date.now();
            entry.drawState = captureBitmapDrawState(window && window.contents);

            if (textToTranslate && typeof textToTranslate === 'string') {
                try {
                    const prep = prepareTextForTranslation(textToTranslate);
                    entry.translationSource = prep.textForTranslation;
                    entry.placeholderInfo = prep;
                } catch (_) {}
            }

            entry.visibleText = stripRpgmEscapes(convertedText || textToTranslate || text);

            try {
                let refreshedBounds = estimateEntryBounds(
                    window,
                    entry.type,
                    textToTranslate,
                    x,
                    y,
                    convertedText || textToTranslate
                );
                const maxWidth = entry.originalParams && Number.isFinite(entry.originalParams.maxWidth)
                    ? entry.originalParams.maxWidth
                    : null;
                if (maxWidth) {
                    refreshedBounds = expandBoundsForMaxWidth(refreshedBounds, window, x, maxWidth);
                }
                entry.bounds = refreshedBounds;
            } catch (_) {}

            return entry;
        }

        function addTextToWindowData(window, windowData, text, x, y, type = null, convertedText = null, originalParams = null) {
            const textToTranslate = convertedText || text;
            const textKey = generateKey(type, x, y, windowData.windowType, textToTranslate);

            const trimmed = String(textToTranslate || '').trim();
            const nonSpace = trimmed.replace(/\s+/g, '');
            const cjkMatch = trimmed.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g);
            const cjkCount = cjkMatch ? cjkMatch.length : 0;
            const hasDigit = /\d/.test(trimmed);
            const onlyNumPunct = /^[0-9()\[\]\-+/*.,:;!?％%]+$/u.test(nonSpace);
            const looksLikeCounter = (
                hasDigit && (cjkCount <= 1) && nonSpace.length <= 10
            ) || onlyNumPunct || /\d+\s*[\u3040-\u30FF\u4E00-\u9FFF]\s*\(\d+\)/u.test(trimmed);

            if (!trimmed || looksLikeCounter || translationCache.shouldSkip(trimmed)) {
                return;
            }

            const existing = windowData.texts.get(textKey);
            if (existing && existing.rawText === text && existing.convertedText === trimmed) {
                return refreshExistingTextEntry(window, existing, text, x, y, type, convertedText, originalParams);
            }

            telemetry.logTextDetected(type, trimmed, x, y, {
                converted: convertedText,
                windowType: windowData.windowType || 'unknown'
            });

            let translationSource = textToTranslate;
            let placeholderInfo = null;
            if (textToTranslate && typeof textToTranslate === 'string') {
                const prep = prepareTextForTranslation(textToTranslate);
                translationSource = prep.textForTranslation;
                placeholderInfo = prep;
            }

            const textEntry = {
                type,
                rawText: text,
                convertedText: trimmed,
                drawState: captureBitmapDrawState(window && window.contents),
                translatedText: null,
                translationStatus: 'pending',
                translationPromise: null,
                position: { x, y },
                originalParams: originalParams || {},
                timestamp: Date.now(),
                translationSource,
                placeholderInfo,
                bounds: null,
            };

            const visibleText = stripRpgmEscapes(convertedText || textToTranslate || text);
            try {
            let initialBounds = estimateEntryBounds(window, type, textToTranslate, x, y, convertedText || textToTranslate);
            const maxWidth = originalParams && Number.isFinite(originalParams.maxWidth) ? originalParams.maxWidth : null;
            if (maxWidth) {
                initialBounds = expandBoundsForMaxWidth(initialBounds, window, x, maxWidth);
            }
            textEntry.bounds = initialBounds;
            } catch (_) {}
            textEntry.visibleText = visibleText;

            try {
                const dupKeys = [];
                windowData.texts.forEach((entry, existingKey) => {
                    if (!entry || entry === textEntry) return;
                    if (entry.type !== type) return;
                    const sameConverted = entry.convertedText === trimmed;
                    const sameSource = translationSource && entry.translationSource === translationSource;
                    const sameRaw = entry.rawText === text;
                    if ((sameConverted || sameSource || sameRaw) &&
                        (entry.position.x !== x || entry.position.y !== y)) {
                        dupKeys.push(existingKey);
                    }
                });
                for (const dupKey of dupKeys) {
                    const staleEntry = windowData.texts.get(dupKey);
                    markEntryStale(windowData, dupKey, staleEntry);
                    windowData.texts.delete(dupKey);
                }
            } catch (_) {}

            windowData.texts.set(textKey, textEntry);
            try {
                if (!windowData.pendingRedraws) windowData.pendingRedraws = new Map();
                windowData.pendingRedraws.delete(textKey);
            } catch (_) {}

            try {
                const normForCache = String(translationSource || trimmed).trim();
                if (normForCache && translationCache.completed.has(normForCache)) {
                    let trans = translationCache.completed.get(normForCache);
                    if (placeholderInfo) {
                        trans = restoreControlCodes(trans, placeholderInfo, textToTranslate);
                    }
                    trans = sanitizeDrawTextOutput(trans, type);
                    textEntry.translatedText = trans;
                    textEntry.translationStatus = 'completed';
                    return;
                }
            } catch (_) {}

            requestTranslationForText(textEntry, translationSource, windowData);
        }

        function requestTranslationForText(textEntry, text, windowData) {
            if (!text || !text.trim()) return;
            if (textEntry._trStale) return;

            textEntry.translationStatus = 'translating';
            textEntry.translationPromise = translationCache.requestTranslation(text);

            textEntry.translationPromise
                .then((translatedText) => {
                    if (textEntry._trStale) return;
                    let restored = textEntry.placeholderInfo
                        ? restoreControlCodes(translatedText, textEntry.placeholderInfo, textEntry.placeholderInfo.original)
                        : translatedText;
                    restored = sanitizeDrawTextOutput(restored, textEntry.type);
                    textEntry.translatedText = restored;
                    textEntry.translationStatus = 'completed';
                    textEntry.translationTimestamp = Date.now();
                    dbg(`[Text Updated] "${text}" -> "${restored}"`);

                    if (text.trim() === translatedText) {
                        dbg(`[Translation Skip] Original and translated text are identical: "${preview(text)}"`);
                        return;
                    }

                    try { redrawTranslatedText(textEntry, windowData); } catch (_) {}
                })
                .catch((error) => {
                    logger.error(`[Text Translation Error] for "${text}":`, error);
                    textEntry.translationStatus = 'error';
                });
        }

        function redrawTranslatedText(textEntry, windowData) {
            if (textEntry._trStale) return;
            try {
                let targetWindow = null;
                registeredWindows.forEach((window) => {
                    if (windowRegistry.get(window) === windowData) {
                        targetWindow = window;
                    }
                });

                if (!targetWindow) {
                    diag(`[Redraw Skip] Window not found for entry at (${textEntry.position.x},${textEntry.position.y})`);
                    return;
                }

                const textKey = getTextEntryKey(windowData, textEntry);
                const currentEntry = textKey ? windowData.texts.get(textKey) : null;
                if (!currentEntry) {
                    dropPendingRedraw(windowData, textEntry, textKey);
                    logger.debug('[Redraw Skip] Text was already cleared by game');
                    return;
                }
                if (currentEntry !== textEntry) {
                    dropPendingRedraw(windowData, textEntry, textKey);
                    dbg(`[Redraw Skip] Outdated entry at (${textEntry.position.x},${textEntry.position.y})`);
                    return;
                }

                const hasContents = !!targetWindow.contents;
                const isVisible = !!targetWindow.visible;
                const isOpenFn = (typeof targetWindow.isOpen === 'function') ? targetWindow.isOpen() : true;
                const fullyOpen = typeof targetWindow.openness === 'number' ? targetWindow.openness >= 255 : true;
                const windowReady = isVisible && hasContents && (isOpenFn || fullyOpen);

                if (!windowReady) {
                    const data = windowRegistry.get(targetWindow);
                    if (data) {
                        if (!data.pendingRedraws) data.pendingRedraws = new Map();
                        data.pendingRedraws.set(textKey, textEntry);
                        if (!textEntry._queueLogged) {
                            telemetry.logDraw('queue', textEntry.translatedText || textEntry.convertedText,
                                textEntry.position.x, textEntry.position.y,
                                { windowType: targetWindow.constructor.name });
                            textEntry._queueLogged = true;
                        }
                    }
                    return;
                }

                dropPendingRedraw(windowData, textEntry, textKey);

                const { x, y } = textEntry.position;
                const originalText = textEntry.convertedText;
                const translatedText = sanitizeDrawTextOutput(
                    textEntry.translatedText || textEntry.convertedText,
                    textEntry.type
                );

                if (originalText === translatedText) {
                    telemetry.logDraw('skip_same', originalText, x, y, { windowType: targetWindow.constructor.name });
                    return;
                }

                if (windowData.windowType === 'Window_ChoiceList') {
                    if (!windowData._choiceSkipLogged) {
                        dbg('[Choice] Skipping low-level redraw for choice list - handled by makeCommandList hook');
                        windowData._choiceSkipLogged = true;
                    }
                    return;
                }

                if (refreshWindowForTranslation(targetWindow, windowData, textEntry)) {
                    return;
                }

                const signedText = REDRAW_SIGNATURE + translatedText;
                const contents = targetWindow.contents || null;
                const prevDrawState = contents ? captureBitmapDrawState(contents) : null;
                const storedDrawState = contents ? textEntry.drawState : null;
                let clearArea = null;
                let aggregationIncremented = false;

                try {
                    if (contents && storedDrawState) {
                        applyBitmapDrawState(contents, storedDrawState);
                    }

                    if (contents) {
                        const outline = Math.max(
                            0,
                            typeof contents.outlineWidth === 'number'
                                ? contents.outlineWidth
                                : redrawSettings.defaultOutline
                        );
                        let bounds = textEntry.bounds || { x1: x, y1: y, x2: x, y2: y };
                        try {
                            const translatedBounds = estimateEntryBounds(
                                targetWindow,
                                textEntry.type,
                                translatedText,
                                x,
                                y,
                                translatedText
                            );
                            bounds = mergeBounds(bounds, translatedBounds) || bounds;
                        } catch (_) {}
                        const maxWidth = textEntry.originalParams
                            && Number.isFinite(textEntry.originalParams.maxWidth)
                            ? textEntry.originalParams.maxWidth
                            : null;
                        if (maxWidth) {
                            bounds = expandBoundsForMaxWidth(bounds, targetWindow, x, maxWidth);
                        }
                        let clearX = Math.min(bounds.x1, bounds.x2);
                        let clearY = Math.min(bounds.y1, bounds.y2);
                        let clearW = Math.abs(bounds.x2 - bounds.x1);
                        let clearH = Math.abs(bounds.y2 - bounds.y1);
                        try {
                            if (targetWindow && typeof targetWindow.calcTextHeight === 'function' && typeof targetWindow.createTextState === 'function') {
                                const textState = targetWindow.createTextState(String(translatedText || originalText), x, y, textEntry.originalParams.maxWidth || Infinity);
                                const calcHeight = targetWindow.calcTextHeight(textState, true);
                                if (Number.isFinite(calcHeight) && calcHeight > 0) {
                                    clearH = Math.max(clearH, calcHeight);
                                }
                            }
                        } catch (_) {}
                        if (Number.isFinite(clearW) && Number.isFinite(clearH)) {
                            clearX = Math.floor(clearX - outline - redrawSettings.extraPadding);
                            clearY = Math.floor(clearY - outline - redrawSettings.extraPadding);
                            clearW = Math.ceil(clearW + outline * 2 + redrawSettings.extraPadding * 2);
                            clearH = Math.ceil(clearH + outline * 2 + redrawSettings.extraPadding * 2);
                            clearX = Math.max(0, clearX);
                            clearY = Math.max(0, clearY);
                            clearW = Math.max(0, Math.min(contents.width - clearX, clearW));
                            clearH = Math.max(0, Math.min(contents.height - clearY, clearH));
                            clearArea = { x: clearX, y: clearY, w: clearW, h: clearH };
                        }
                        if (clearArea) {
                            try {
                                contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                                aggregationIncremented = true;
                            } catch (_) {}
                            try {
                                withWindowRedrawClear(contents, () => {
                                    contents.clearRect(clearArea.x, clearArea.y, clearArea.w, clearArea.h);
                                });
                            } catch (_) {}
                        } else {
                            try {
                                contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                                aggregationIncremented = true;
                            } catch (_) {}
                            try {
                                withWindowRedrawClear(contents, () => {
                                    contents.clear();
                                });
                            } catch (_) {}
                        }
                    }
                } catch (error) {
                    logger.error('[Redraw Error]', error);
                }

                try {
                    targetWindow.contents._trPreferWindowPipeline = true;
                    targetWindow.contents._trWindowPipelineDepth = (targetWindow.contents._trWindowPipelineDepth || 0) + 1;
                    telemetry.logDraw('redraw', translatedText, x, y, {
                        windowType: targetWindow.constructor.name,
                        clearArea
                    });
                    if (textEntry.type === 'drawTextEx' && typeof targetWindow.drawTextEx === 'function') {
                        targetWindow.drawTextEx(signedText, x, y);
                    } else {
                        targetWindow.drawText(
                            signedText,
                            x,
                            y,
                            textEntry.originalParams.maxWidth,
                            textEntry.originalParams.align
                        );
                    }
                    if (targetWindow.contents && prevDrawState) {
                        applyBitmapDrawState(targetWindow.contents, prevDrawState);
                    }
                    const rrKey = generateKey(textEntry.type, x, y, windowData.windowType, textEntry.convertedText);
                    if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
                    windowData.recentlyRedrawn.set(rrKey, Date.now());
                    if (clearArea && targetWindow.contents) {
                        addBitmapSuppressionRect(
                            targetWindow.contents,
                            clearArea.x,
                            clearArea.y,
                            clearArea.x + clearArea.w,
                            clearArea.y + clearArea.h,
                            120,
                            translatedText
                        );
                    }
                } catch (error) {
                    logger.error('[Redraw Error]', error);
                } finally {
                    if (targetWindow.contents) {
                        targetWindow.contents._trWindowPipelineDepth = Math.max(0, (targetWindow.contents._trWindowPipelineDepth || 1) - 1);
                        if (aggregationIncremented) {
                            targetWindow.contents._trAggregationDepth = Math.max(0, (targetWindow.contents._trAggregationDepth || 1) - 1);
                            if (targetWindow.contents._trAggregationDepth === 0
                                && typeof targetWindow.contents._trFlushAggregatedLines === 'function') {
                                try { targetWindow.contents._trFlushAggregatedLines(); } catch (_) {}
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error('[Redraw Error]', error);
            }
        }

        function trackWindowDrawTextInternal() {
            logger.debug('[HOOK INSTALL] Installing drawText hooks...');
            logger.trace('[HOOK INSTALL] Window_Base:', typeof Window_Base);
            logger.trace('[HOOK INSTALL] Window_Base.prototype:', typeof Window_Base !== 'undefined' ? typeof Window_Base.prototype : 'undefined');
            logger.trace('[HOOK INSTALL] drawText method:', typeof Window_Base !== 'undefined' && Window_Base.prototype ? typeof Window_Base.prototype.drawText : 'undefined');

            const originalDrawText = Window_Base.prototype.drawText;
            logger.trace('[HOOK INSTALL] Original drawText saved:', typeof originalDrawText);

            Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
                const textStr = String(text);
                const contents = this && this.contents ? this.contents : null;

                const invokeOriginal = (overrideText) => {
                    const value = (overrideText !== undefined) ? overrideText : text;
                    if (!contents) {
                        return originalDrawText.call(this, value, x, y, maxWidth, align);
                    }
                    contents._trPreferWindowPipeline = true;
                    contents._trWindowPipelineDepth = (contents._trWindowPipelineDepth || 0) + 1;
                    contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                    try {
                        return originalDrawText.call(this, value, x, y, maxWidth, align);
                    } finally {
                        contents._trWindowPipelineDepth = Math.max(0, (contents._trWindowPipelineDepth || 1) - 1);
                        contents._trAggregationDepth = Math.max(0, (contents._trAggregationDepth || 1) - 1);
                        if (contents._trAggregationDepth === 0 && typeof contents._trFlushAggregatedLines === 'function') {
                            contents._trFlushAggregatedLines();
                        }
                    }
                };

                if (textStr.startsWith(REDRAW_SIGNATURE)) {
                    const cleanText = textStr.substring(REDRAW_SIGNATURE.length);
                    telemetry.logDraw('bypass', cleanText, x, y, { windowType: this.constructor.name });
                    return invokeOriginal(cleanText);
                }

                const trimmed = textStr.trim();
                const nonSpace = trimmed.replace(/\s+/g, '');
                const cjkMatch = trimmed.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g);
                const cjkCount = cjkMatch ? cjkMatch.length : 0;
                const hasDigit = /\d/.test(trimmed);
                const onlyNumPunct = /^[0-9()\[\]\-+/*.,:;!?％%]+$/u.test(nonSpace);
                const looksLikeCounter = (
                    hasDigit && (cjkCount <= 1) && nonSpace.length <= 10
                ) || onlyNumPunct || /\d+\s*[\u3040-\u30FF\u4E00-\u9FFF]\s*\(\d+\)/u.test(trimmed);

                ensureWindowRegistered(this);
                const windowData = windowRegistry.get(this);

                if (trimmed) {
                    const dupKey = generateKey('drawText', x, y, windowData.windowType, trimmed);
                    const existing = windowData.texts.get(dupKey);
                    if (existing && existing.rawText === textStr && existing.convertedText === trimmed) {
                        refreshExistingTextEntry(this, existing, textStr, x, y, 'drawText', null, { maxWidth, align });
                        if (existing.translationStatus === 'completed' && existing.translatedText) {
                            const safeTranslated = sanitizeDrawTextOutput(existing.translatedText, 'drawText');
                            if (typeof safeTranslated !== 'string' || safeTranslated === trimmed) {
                                return invokeOriginal(textStr);
                            }
                            const signed = REDRAW_SIGNATURE + safeTranslated;
                            telemetry.logDraw('redraw', safeTranslated, x, y, { windowType: this.constructor.name, method: 'drawText-existing' });
                            return invokeOriginal(signed);
                        }
                        return invokeOriginal();
                    }
                }

                if (!trimmed || looksLikeCounter || translationCache.shouldSkip(trimmed)) {
                    return invokeOriginal();
                }

                const inlinePlaceholderInfo = prepareTextForTranslation(trimmed);
                const inlineTranslationSource = inlinePlaceholderInfo.textForTranslation;
                const inlineNorm = String(inlineTranslationSource || '').trim();

                telemetry.logDraw('original', trimmed, x, y, {
                    windowType: this.constructor.name,
                    method: 'drawText',
                    maxWidth,
                    align,
                });

                const originalParams = { maxWidth, align };
                addTextToWindowData(this, windowData, trimmed, x, y, 'drawText', null, originalParams);
                try {
                    const norm = inlineNorm;
                    if (norm && translationCache.completed.has(norm)) {
                        let translated = translationCache.completed.get(norm);
                        translated = inlinePlaceholderInfo
                            ? restoreControlCodes(translated, inlinePlaceholderInfo, trimmed)
                            : translated;
                        translated = sanitizeDrawTextOutput(translated, 'drawText');
                        const key = generateKey('drawText', x, y, windowData.windowType, trimmed);
                        const signed = REDRAW_SIGNATURE + translated;
                        const rr = windowData.recentlyRedrawn && windowData.recentlyRedrawn.get ? windowData.recentlyRedrawn.get(key) : null;
                        if (rr && Date.now() - rr < 200) {
                            return invokeOriginal(signed);
                        }
                        if (typeof translated !== 'string' || translated === trimmed) {
                            diag(`[Inline Skip] drawText identical: "${preview(trimmed)}"`);
                            return invokeOriginal(textStr);
                        }
                        telemetry.logDraw('redraw', translated, x, y, { windowType: this.constructor.name, method: 'drawText-inline' });
                        return invokeOriginal(signed);
                    }
                } catch (_) {}

                const entryKey = generateKey('drawText', x, y, windowData.windowType, trimmed);
                const entry = windowData.texts.get(entryKey);
                if (entry && entry.translationStatus === 'completed' && entry.translatedText) {
                    const safeTranslated = sanitizeDrawTextOutput(entry.translatedText, 'drawText');
                    const signed = REDRAW_SIGNATURE + safeTranslated;
                    telemetry.logDraw('redraw', safeTranslated, x, y, { windowType: this.constructor.name, method: 'drawText-entry' });
                    return invokeOriginal(signed);
                }

                return invokeOriginal();
            };

            const originalDrawTextEx = Window_Base.prototype.drawTextEx;
            Window_Base.prototype.drawTextEx = function (text, x, y) {
                try {
                    this.contents._trPreferWindowPipeline = true;
                } catch (_) {}
                const textStr = String(text);
                const invokeOriginalDrawTextEx = (overrideText, options = {}) => {
                    const value = overrideText !== undefined ? overrideText : textStr;
                    const contents = this && this.contents;
                    if (contents) {
                        contents._trBitmapSkipDepth = (contents._trBitmapSkipDepth || 0) + 1;
                    }
                    if (options && options.bypassCreateTextState) {
                        this._trBypassCreateTextState = (this._trBypassCreateTextState || 0) + 1;
                    }
                    try {
                        return originalDrawTextEx.call(this, value, x, y);
                    } finally {
                        if (options && options.bypassCreateTextState) {
                            this._trBypassCreateTextState = Math.max(0, (this._trBypassCreateTextState || 1) - 1);
                        }
                        if (contents) {
                            contents._trBitmapSkipDepth = Math.max(0, (contents._trBitmapSkipDepth || 1) - 1);
                        }
                    }
                };
                if (textStr.startsWith(REDRAW_SIGNATURE)) {
                    const cleanText = textStr.substring(REDRAW_SIGNATURE.length);
                    telemetry.logDraw('bypass', cleanText, x, y, { windowType: this.constructor.name });
                    return invokeOriginalDrawTextEx(cleanText, { bypassCreateTextState: true });
                }
                const rawTrimmed = textStr.trim();

                ensureWindowRegistered(this);
                const windowData = windowRegistry.get(this);

                try {
                    if (this && this.constructor
                        && (this.constructor.name === 'Window_Message'
                            || this.constructor.name === 'Window_Message_Battle')) {
                        const sess = this._trMessageSession || this._trSessionId || 0;
                        if (sess && this._trMsgStartSession !== sess) {
                            this._trMsgStartX = x;
                            this._trMsgStartY = y;
                            this._trMsgStartSession = sess;
                        }
                    }
                } catch (_) {}

                try {
                    if (this && this.constructor
                        && (this.constructor.name === 'Window_Message'
                            || this.constructor.name === 'Window_Message_Battle')) {
                        return invokeOriginalDrawTextEx();
                    }
                } catch (_) {}

                let convertedText = textStr;
                let convertedTrimmed = rawTrimmed;
                try {
                    if (typeof this.convertEscapeCharacters === 'function') {
                        convertedText = this.convertEscapeCharacters(textStr);
                        convertedTrimmed = String(convertedText || '').trim();
                    }
                } catch (_) {
                    convertedText = textStr;
                    convertedTrimmed = rawTrimmed;
                }

                if (!convertedTrimmed || translationCache.shouldSkip(convertedTrimmed)) {
                    return invokeOriginalDrawTextEx();
                }

                const originalParams = { maxWidth: Infinity, align: 'left' };
                addTextToWindowData(this, windowData, textStr, x, y, 'drawTextEx', convertedText, originalParams);

                const dupKey = generateKey('drawTextEx', x, y, windowData.windowType, convertedTrimmed);
                const existing = windowData.texts.get(dupKey);
                if (existing && existing.rawText === textStr && existing.convertedText === convertedTrimmed) {
                    if (existing.translationStatus === 'completed' && existing.translatedText) {
                        const restored = sanitizeDrawTextOutput(existing.translatedText, 'drawTextEx');
                        if (typeof restored === 'string' && restored !== convertedTrimmed) {
                            const signed = REDRAW_SIGNATURE + restored;
                            telemetry.logDraw('redraw', restored, x, y, { windowType: this.constructor.name, method: 'drawTextEx-existing' });
                            return invokeOriginalDrawTextEx(signed, { bypassCreateTextState: true });
                        }
                    }
                }

                try {
                    const norm = String(existing && existing.translationSource ? existing.translationSource : convertedTrimmed).trim();
                    if (norm && translationCache.completed.has(norm)) {
                        const translated = translationCache.completed.get(norm);
                        const restored = restoreControlCodes(translated, (existing && existing.placeholderInfo ? existing.placeholderInfo : null), convertedText);
                        if (restored === convertedTrimmed) {
                            diag(`[drawTextEx Skip] ${preview(convertedTrimmed)}`);
                            return invokeOriginalDrawTextEx();
                        }
                        const signed = REDRAW_SIGNATURE + restored;
                        telemetry.logDraw('redraw', restored, x, y, { windowType: this.constructor.name, method: 'drawTextEx-inline' });
                        return invokeOriginalDrawTextEx(signed);
                    }
                } catch (_) {}

                return invokeOriginalDrawTextEx();
            };
            return { redrawTranslatedText };
        }

        return trackWindowDrawTextInternal();
    };
})();
