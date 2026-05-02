// Window_Base drawText/drawTextEx hook implementation and redraw helper.
// It handles ordinary RPG Maker window text, creates text entries, requests translations, and redraws completed results.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/window-draw-hooks.js.');
    }

    function installWindowDrawHooks(options = {}) {
        const {
            logger,
            telemetry,
            textTracker,
            translationCache,
            windowRegistry,
            registeredWindows,
            ensureWindowRegistered,
            generateKey,
            captureBitmapDrawState,
            applyBitmapDrawState,
            resolveTextScalePercent,
            createWindowTextScaleScope,
            preview = (text) => String(text ?? ''),
            REDRAW_SIGNATURE = '',
            diag = () => {},
            dbg = () => {},
            settings = {},
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
        if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) {
            return {
                status: 'skipped',
                reason: 'Window_Base is unavailable.',
                helpers: null,
            };
        }
        if (typeof Window_Base.prototype.drawText !== 'function'
            || typeof Window_Base.prototype.drawTextEx !== 'function') {
            return {
                status: 'skipped',
                reason: 'Window_Base drawText/drawTextEx are unavailable.',
                helpers: null,
            };
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
        const textScaleOthers = typeof resolveTextScalePercent === 'function'
            ? resolveTextScalePercent(settings, 'textScaleOthers', 100)
            : 100;
        const WINDOW_DRAW_WRAPPER_TOKEN = 'liveTranslator.windowDraw';
        const hasTextTracker = () => textTracker
            && typeof textTracker.upsert === 'function'
            && (typeof textTracker.isEnabled !== 'function' || textTracker.isEnabled());
        const markRecordDisappeared = (recordId, reason, details = null) => {
            if (!textTracker || !recordId) return;
            if (typeof textTracker.disappear === 'function') {
                textTracker.disappear(recordId, reason, details);
            } else if (typeof textTracker.stale === 'function') {
                textTracker.stale(recordId, reason, details);
            }
        };
        const trackDecision = (recordId, type, message = '', details = null) => {
            if (textTracker && typeof textTracker.decision === 'function' && recordId) {
                textTracker.decision(recordId, type, message, details);
            }
        };
        const trackWindowDraw = (entry, event, details = null) => {
            if (!hasTextTracker() || !entry || !entry.recordId || !textTracker || typeof textTracker.draw !== 'function') return;
            const detailKey = details && typeof details === 'object'
                ? Object.keys(details).sort().map((key) => `${key}:${String(details[key])}`).join('|')
                : '';
            const eventKey = `${event || 'event'}|${detailKey}`;
            if (entry._trLastTrackedDrawEventKey === eventKey) return;
            entry._trLastTrackedDrawEventKey = eventKey;
            textTracker.draw(entry.recordId, event, details);
        };
        const withTranslatedWindowTextScale = (windowInstance, callback) => {
            if (typeof callback !== 'function') return undefined;
            if (!Number.isInteger(textScaleOthers) || textScaleOthers <= 0 || textScaleOthers >= 100
                || typeof createWindowTextScaleScope !== 'function') {
                return callback();
            }
            if (windowInstance && windowInstance._trTextScaleOthersDepth > 0) {
                return callback();
            }
            if (windowInstance) {
                windowInstance._trTextScaleOthersDepth = (windowInstance._trTextScaleOthersDepth || 0) + 1;
            }
            let scope = null;
            try {
                scope = createWindowTextScaleScope(windowInstance, textScaleOthers, {
                    captureBitmapDrawState,
                    applyBitmapDrawState,
                });
                return callback();
            } finally {
                if (scope && typeof scope.restore === 'function') {
                    try { scope.restore(); } catch (_) {}
                }
                if (windowInstance) {
                    windowInstance._trTextScaleOthersDepth = Math.max(0, (windowInstance._trTextScaleOthersDepth || 1) - 1);
                }
            }
        };

        function getWindowRecordId(windowData, key) {
            const windowId = windowData && windowData.windowId
                ? windowData.windowId
                : (windowData && windowData.windowType ? windowData.windowType : 'window');
            return `window-draw:${windowId}:${key}`;
        }

        function trackWindowEntry(windowData, entry, status, decision = null) {
            if (!hasTextTracker() || !windowData || !entry) return;
            const key = getTextEntryKey(windowData, entry);
            if (!entry.recordId && key) entry.recordId = getWindowRecordId(windowData, key);
            if (!entry.recordId) return;
            textTracker.upsert({
                id: entry.recordId,
                hook: entry.type || 'drawText',
                hookLabel: 'Window Draw',
                surfaceType: 'window',
                status: status || entry.translationStatus || 'detected',
                rawText: entry.rawText || '',
                convertedText: entry.convertedText || '',
                visibleText: entry.visibleText || entry.convertedText || '',
                original: entry.visibleText || entry.convertedText || entry.rawText || '',
                translationSource: entry.translationSource || '',
                normalizedSource: String(entry.translationSource || '').trim(),
                translation: entry.translatedText || '',
                ...(entry.translationReceived ? { translationReceived: entry.translationReceived } : {}),
                ...(entry.translationDrawn ? { translationDrawn: entry.translationDrawn } : {}),
                x: entry.position && entry.position.x,
                y: entry.position && entry.position.y,
                bounds: entry.bounds || null,
                windowType: windowData.windowType || '',
                methodName: entry.type || '',
                metadata: {
                    contentsRevision: windowData.contentsRevision || 0,
                },
            }, decision);
            entry._trTrackerVisible = true;
        }

        function sanitizeDrawTextOutput(text, type) {
            if (typeof text !== 'string') return text;
            return type === 'drawText' ? stripRpgmEscapes(text) : text;
        }

        function isDedicatedMessageWindow(windowInstance) {
            if (!windowInstance) return false;
            if (windowInstance._trHasDedicatedTextHook) return true;
            const ctor = windowInstance.constructor;
            if (ctor && ctor._trHasDedicatedTextHook) return true;
            try {
                if (typeof Window_Message !== 'undefined'
                    && Window_Message
                    && Window_Message.prototype
                    && Window_Message.prototype.isPrototypeOf(windowInstance)) {
                    return true;
                }
            } catch (_) {}
            const name = ctor && ctor.name ? String(ctor.name) : '';
            return /^Window_Message(?:$|_)/.test(name);
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
            entry.canceledReason = 'window-entry-stale';
            entry.canceledAt = Date.now();
            entry._trPendingInvalidation = {
                reason: 'window-entry-stale',
                at: entry.canceledAt,
                key: String(key || ''),
                windowType: windowData && windowData.windowType ? windowData.windowType : '',
            };
            if (windowData && windowData.pendingRedraws) {
                try { windowData.pendingRedraws.delete(key); } catch (_) {}
            }
        }

        function clearPendingInvalidation(entry) {
            if (!entry || !entry._trPendingInvalidation) return false;
            delete entry._trPendingInvalidation;
            delete entry.canceledReason;
            delete entry.canceledAt;
            return true;
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

        function getWindowTypeName(window, windowData) {
            return (windowData && windowData.windowType)
                || (window && window.constructor && window.constructor.name)
                || '';
        }

        function isUsableBitmap(bitmap) {
            return !!(bitmap
                && Number.isFinite(Number(bitmap.width))
                && Number(bitmap.width) > 0
                && Number.isFinite(Number(bitmap.height))
                && Number(bitmap.height) > 0);
        }

        function getRedrawContents(window, textEntry = null) {
            if (textEntry && isUsableBitmap(textEntry.contentsBitmap)) {
                return textEntry.contentsBitmap;
            }
            return window && isUsableBitmap(window.contents) ? window.contents : null;
        }

        function withWindowContents(window, contents, fn) {
            if (!window || !contents || typeof fn !== 'function') return undefined;
            if (window.contents === contents) return fn();
            const previousContents = window.contents;
            try {
                window.contents = contents;
                return fn();
            } finally {
                window.contents = previousContents;
            }
        }

        function wasDrawnToDetachedContents(window, textEntry) {
            return !!(window
                && textEntry
                && isUsableBitmap(textEntry.contentsBitmap)
                && isUsableBitmap(window.contents)
                && textEntry.contentsBitmap !== window.contents);
        }

        function isTransientRefreshWindow(window, windowType) {
            const type = String(windowType || '');
            if (/Window_(?:BattleLog|ScrollText|MapName|NameBox)/.test(type)) {
                return true;
            }
            if (/Log/u.test(type)) {
                return true;
            }
            try {
                const hasLogBuffers = Array.isArray(window && window._lines)
                    || Array.isArray(window && window._logs);
                const hasLogMethods = typeof (window && window.drawLineText) === 'function'
                    || typeof (window && window.addText) === 'function'
                    || typeof (window && window.push) === 'function';
                if (hasLogBuffers && hasLogMethods) return true;
                if (Array.isArray(window && window._methods)
                    && typeof (window && window.callNextMethod) === 'function') {
                    return true;
                }
            } catch (_) {}
            return false;
        }

        function shouldRefreshWindowForTranslation(window, windowData, textEntry = null) {
            if (!window || typeof window.refresh !== 'function') return false;
            if (window._trTranslationRefreshDepth > 0) return false;
            const windowType = getWindowTypeName(window, windowData);
            if (isDedicatedMessageWindow(window)) {
                return false;
            }
            if (/Window_(Message|Message_Battle|ChoiceList|NameBox)/.test(windowType)) {
                return false;
            }
            if (wasDrawnToDetachedContents(window, textEntry)) {
                return false;
            }
            if (isTransientRefreshWindow(window, windowType)) {
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
            if (!shouldRefreshWindowForTranslation(window, windowData, textEntry)) return false;
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
            entry.contentsBitmap = window && window.contents ? window.contents : (entry.contentsBitmap || null);
            clearPendingInvalidation(entry);

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
                const refreshed = refreshExistingTextEntry(window, existing, text, x, y, type, convertedText, originalParams);
                dropPendingRedraw(windowData, refreshed, textKey);
                trackWindowEntry(windowData, refreshed, refreshed && refreshed.translationStatus);
                return refreshed;
            }

            try {
                const sameSlotKeys = [];
                windowData.texts.forEach((entry, existingKey) => {
                    if (!entry || existingKey === textKey) return;
                    if (entry.type !== type) return;
                    const position = entry.position || {};
                    if (Number(position.x) === Number(x) && Number(position.y) === Number(y)) {
                        sameSlotKeys.push(existingKey);
                    }
                });
                for (const sameSlotKey of sameSlotKeys) {
                    const staleEntry = windowData.texts.get(sameSlotKey);
                    markEntryStale(windowData, sameSlotKey, staleEntry);
                }
            } catch (_) {}

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
                contentsBitmap: window && window.contents ? window.contents : null,
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
                }
            } catch (_) {}

            windowData.texts.set(textKey, textEntry);
            textEntry.recordId = getWindowRecordId(windowData, textKey);
            trackWindowEntry(windowData, textEntry, 'pending', { type: 'detected' });
            try {
                if (!windowData.pendingRedraws) windowData.pendingRedraws = new Map();
                windowData.pendingRedraws.delete(textKey);
            } catch (_) {}

            try {
                const normForCache = String(translationSource || trimmed).trim();
                if (normForCache && translationCache.completed.has(normForCache)) {
                    let trans = translationCache.completed.get(normForCache);
                    textEntry.translationReceived = typeof trans === 'string' ? trans : '';
                    if (placeholderInfo) {
                        trans = restoreControlCodes(trans, placeholderInfo, textToTranslate);
                    }
                    trans = sanitizeDrawTextOutput(trans, type);
                    textEntry.translatedText = trans;
                    textEntry.translationStatus = 'completed';
                    trackWindowEntry(windowData, textEntry, 'completed', {
                        type: 'translation.cache_hit',
                        details: { source: 'cache' },
                    });
                    return;
                }
            } catch (_) {}

            requestTranslationForText(textEntry, translationSource, windowData);
        }

        function requestTranslationForText(textEntry, text, windowData) {
            if (!text || !text.trim()) return;
            if (textEntry._trStale) return;

            textEntry.translationStatus = 'translating';
            trackWindowEntry(windowData, textEntry, 'translating', { type: 'translation.request' });
            textEntry.translationPromise = translationCache.requestTranslation(text, {
                recordId: textEntry.recordId || '',
                hook: textEntry.type || 'window',
            });

            textEntry.translationPromise
                .then((translatedText) => {
                    if (textEntry._trStale) return;
                    textEntry.translationReceived = typeof translatedText === 'string' ? translatedText : '';
                    let restored = textEntry.placeholderInfo
                        ? restoreControlCodes(translatedText, textEntry.placeholderInfo, textEntry.placeholderInfo.original)
                        : translatedText;
                    restored = sanitizeDrawTextOutput(restored, textEntry.type);
                    textEntry.translatedText = restored;
                    textEntry.translationStatus = 'completed';
                    textEntry.translationTimestamp = Date.now();
                    trackWindowEntry(windowData, textEntry, 'completed', {
                        type: 'translation.completed',
                    });
                    dbg(`[Text Updated] "${text}" -> "${restored}"`);

                    if (text.trim() === translatedText) {
                        dbg(`[Translation Skip] Original and translated text are identical: "${preview(text)}"`);
                        trackWindowEntry(windowData, textEntry, 'skipped', {
                            type: 'translation.skipped',
                            message: 'translated text matched original',
                        });
                        return;
                    }

                    try { redrawTranslatedText(textEntry, windowData); } catch (_) {}
                })
                .catch((error) => {
                    logger.error(`[Text Translation Error] for "${text}":`, error);
                    textEntry.translationStatus = 'error';
                    if (hasTextTracker() && textEntry.recordId) {
                        textTracker.fail(textEntry.recordId, error && error.message ? error.message : String(error || 'translation error'));
                    }
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
                    markRecordDisappeared(textEntry.recordId, 'window-redraw-target-missing', {
                        windowType: windowData && windowData.windowType ? windowData.windowType : '',
                    });
                    return;
                }

                const textKey = getTextEntryKey(windowData, textEntry);
                const currentEntry = textKey ? windowData.texts.get(textKey) : null;
                if (!currentEntry) {
                    dropPendingRedraw(windowData, textEntry, textKey);
                    logger.debug('[Redraw Skip] Text was already cleared by game');
                    markRecordDisappeared(textEntry.recordId, 'window-entry-cleared', {
                        key: textKey || '',
                        windowType: targetWindow && targetWindow.constructor ? targetWindow.constructor.name : '',
                    });
                    return;
                }
                if (currentEntry !== textEntry) {
                    dropPendingRedraw(windowData, textEntry, textKey);
                    dbg(`[Redraw Skip] Outdated entry at (${textEntry.position.x},${textEntry.position.y})`);
                    markRecordDisappeared(textEntry.recordId, 'window-entry-replaced', {
                        key: textKey || '',
                        windowType: targetWindow && targetWindow.constructor ? targetWindow.constructor.name : '',
                    });
                    return;
                }
                if (textEntry._trPendingInvalidation) {
                    trackDecision(textEntry.recordId, 'draw.deferred', 'waiting for window redraw revalidation', {
                        key: textKey || '',
                        reason: textEntry._trPendingInvalidation.reason || '',
                    });
                    return;
                }

                const contents = getRedrawContents(targetWindow, textEntry);
                const hasContents = !!contents;
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
                            trackWindowDraw(textEntry, 'queued', {
                                windowType: targetWindow.constructor.name,
                            });
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
                        if (hasTextTracker() && textEntry.recordId) {
                        textTracker.skip(textEntry.recordId, 'redraw matched original', {
                            windowType: targetWindow.constructor.name,
                        });
                    }
                    return;
                }

                if (windowData.windowType === 'Window_ChoiceList') {
                    if (!windowData._choiceSkipLogged) {
                        dbg('[Choice] Skipping low-level redraw for choice list - handled by makeCommandList hook');
                        windowData._choiceSkipLogged = true;
                    }
                    trackDecision(textEntry.recordId, 'draw.skipped', 'choice list handled by dedicated hook', {
                        windowType: windowData.windowType || '',
                    });
                    return;
                }

                if (refreshWindowForTranslation(targetWindow, windowData, textEntry)) {
                    trackWindowDraw(textEntry, 'refresh', {
                        windowType: targetWindow.constructor.name,
                        method: textEntry.type || '',
                        translationDrawn: textEntry.translatedText || '',
                    });
                    return;
                }

                const signedText = REDRAW_SIGNATURE + translatedText;
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
                            const translatedBounds = withWindowContents(targetWindow, contents, () => estimateEntryBounds(
                                targetWindow,
                                textEntry.type,
                                translatedText,
                                x,
                                y,
                                translatedText
                            ));
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
                                const calcHeight = withWindowContents(targetWindow, contents, () => {
                                    const textState = targetWindow.createTextState(String(translatedText || originalText), x, y, textEntry.originalParams.maxWidth || Infinity);
                                    return targetWindow.calcTextHeight(textState, true);
                                });
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
                    contents._trPreferWindowPipeline = true;
                    contents._trWindowPipelineDepth = (contents._trWindowPipelineDepth || 0) + 1;
                    telemetry.logDraw('redraw', translatedText, x, y, {
                        windowType: targetWindow.constructor.name,
                        clearArea
                    });
                    trackWindowDraw(textEntry, 'redraw', {
                        windowType: targetWindow.constructor.name,
                        method: textEntry.type || '',
                        translationDrawn: translatedText,
                    });
                    withWindowContents(targetWindow, contents, () => {
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
                    });
                    if (contents && prevDrawState) {
                        applyBitmapDrawState(contents, prevDrawState);
                    }
                    const rrKey = generateKey(textEntry.type, x, y, windowData.windowType, textEntry.convertedText);
                    if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
                    windowData.recentlyRedrawn.set(rrKey, Date.now());
                } catch (error) {
                    logger.error('[Redraw Error]', error);
                } finally {
                    if (contents) {
                        contents._trWindowPipelineDepth = Math.max(0, (contents._trWindowPipelineDepth || 1) - 1);
                        if (aggregationIncremented) {
                            contents._trAggregationDepth = Math.max(0, (contents._trAggregationDepth || 1) - 1);
                            if (contents._trAggregationDepth === 0
                                && typeof contents._trFlushAggregatedLines === 'function') {
                                try { contents._trFlushAggregatedLines(); } catch (_) {}
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

            const currentDrawText = Window_Base.prototype.drawText;
            const currentDrawTextEx = Window_Base.prototype.drawTextEx;
            if (currentDrawText
                && currentDrawTextEx
                && currentDrawText.__trWindowDrawWrapper === WINDOW_DRAW_WRAPPER_TOKEN
                && currentDrawTextEx.__trWindowDrawWrapper === WINDOW_DRAW_WRAPPER_TOKEN) {
                return { redrawTranslatedText };
            }

            const originalDrawText = currentDrawText.__trOriginal || currentDrawText;
            logger.trace('[HOOK INSTALL] Original drawText saved:', typeof originalDrawText);

            Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
                const textStr = String(text);
                const contents = this && this.contents ? this.contents : null;

                const invokeOriginal = (overrideText, options = {}) => {
                    const value = (overrideText !== undefined) ? overrideText : text;
                    const drawOriginal = () => {
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
                    if (options && options.scaleText) {
                        return withTranslatedWindowTextScale(this, drawOriginal);
                    }
                    return drawOriginal();
                };

                if (isDedicatedMessageWindow(this)) {
                    if (textStr.startsWith(REDRAW_SIGNATURE)) {
                        const cleanText = textStr.substring(REDRAW_SIGNATURE.length);
                        telemetry.logDraw('bypass', cleanText, x, y, { windowType: this.constructor.name });
                        return invokeOriginal(cleanText);
                    }
                    return invokeOriginal();
                }

                if (textStr.startsWith(REDRAW_SIGNATURE)) {
                    const cleanText = textStr.substring(REDRAW_SIGNATURE.length);
                    telemetry.logDraw('bypass', cleanText, x, y, { windowType: this.constructor.name });
                    return invokeOriginal(cleanText, { scaleText: true });
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
                        trackWindowEntry(windowData, existing, existing.translationStatus);
                        if (existing.translationStatus === 'completed' && existing.translatedText) {
                            const safeTranslated = sanitizeDrawTextOutput(existing.translatedText, 'drawText');
                            if (typeof safeTranslated !== 'string' || safeTranslated === trimmed) {
                                if (existing.recordId && hasTextTracker() && typeof textTracker.skip === 'function') {
                                    textTracker.skip(existing.recordId, 'cached redraw matched original', {
                                        windowType: this.constructor.name,
                                        method: 'drawText-existing',
                                    });
                                }
                                return invokeOriginal(textStr);
                            }
                            const signed = REDRAW_SIGNATURE + safeTranslated;
                            telemetry.logDraw('redraw', safeTranslated, x, y, { windowType: this.constructor.name, method: 'drawText-existing' });
                            trackWindowDraw(existing, 'existing', {
                                windowType: this.constructor.name,
                                method: 'drawText-existing',
                                translationDrawn: safeTranslated,
                            });
                            return invokeOriginal(signed, { scaleText: true });
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
                        const receivedTranslation = translated;
                        translated = inlinePlaceholderInfo
                            ? restoreControlCodes(translated, inlinePlaceholderInfo, trimmed)
                            : translated;
                        translated = sanitizeDrawTextOutput(translated, 'drawText');
                        const key = generateKey('drawText', x, y, windowData.windowType, trimmed);
                        const signed = REDRAW_SIGNATURE + translated;
                        const rr = windowData.recentlyRedrawn && windowData.recentlyRedrawn.get ? windowData.recentlyRedrawn.get(key) : null;
                        if (rr && Date.now() - rr < 200) {
                            const cachedEntry = windowData.texts.get(key);
                            trackWindowDraw(cachedEntry, 'recent-redraw', {
                                windowType: this.constructor.name,
                                method: 'drawText-inline',
                                translationReceived: receivedTranslation,
                                translationDrawn: translated,
                            });
                            return invokeOriginal(signed, { scaleText: true });
                        }
                        if (typeof translated !== 'string' || translated === trimmed) {
                            diag(`[Inline Skip] drawText identical: "${preview(trimmed)}"`);
                            const cachedEntry = windowData.texts.get(key);
                            if (cachedEntry && cachedEntry.recordId && hasTextTracker()) {
                                textTracker.skip(cachedEntry.recordId, 'inline cache matched original', {
                                    windowType: this.constructor.name,
                                    method: 'drawText-inline',
                                });
                            }
                            return invokeOriginal(textStr);
                        }
                        telemetry.logDraw('redraw', translated, x, y, { windowType: this.constructor.name, method: 'drawText-inline' });
                        const cachedEntry = windowData.texts.get(key);
                        trackWindowDraw(cachedEntry, 'inline-cache', {
                            windowType: this.constructor.name,
                            method: 'drawText-inline',
                            translationReceived: receivedTranslation,
                            translationDrawn: translated,
                        });
                        return invokeOriginal(signed, { scaleText: true });
                    }
                } catch (_) {}

                const entryKey = generateKey('drawText', x, y, windowData.windowType, trimmed);
                const entry = windowData.texts.get(entryKey);
                if (entry && entry.translationStatus === 'completed' && entry.translatedText) {
                    const safeTranslated = sanitizeDrawTextOutput(entry.translatedText, 'drawText');
                    const signed = REDRAW_SIGNATURE + safeTranslated;
                    telemetry.logDraw('redraw', safeTranslated, x, y, { windowType: this.constructor.name, method: 'drawText-entry' });
                    trackWindowDraw(entry, 'entry-cache', {
                        windowType: this.constructor.name,
                        method: 'drawText-entry',
                        translationDrawn: safeTranslated,
                    });
                    return invokeOriginal(signed, { scaleText: true });
                }

                return invokeOriginal();
            };
            Window_Base.prototype.drawText.__trOriginal = originalDrawText;
            Window_Base.prototype.drawText.__trWindowDrawWrapper = WINDOW_DRAW_WRAPPER_TOKEN;

            const originalDrawTextEx = currentDrawTextEx.__trOriginal || currentDrawTextEx;
            Window_Base.prototype.drawTextEx = function (text, x, y) {
                try {
                    this.contents._trPreferWindowPipeline = true;
                } catch (_) {}
                const textStr = String(text);
                const invokeOriginalDrawTextEx = (overrideText, options = {}) => {
                    const value = overrideText !== undefined ? overrideText : textStr;
                    const contents = this && this.contents;
                    const drawOriginal = () => {
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
                    if (options && options.scaleText) {
                        return withTranslatedWindowTextScale(this, drawOriginal);
                    }
                    return drawOriginal();
                };
                if (isDedicatedMessageWindow(this)) {
                    try {
                        const sess = this._trMessageSession || this._trSessionId || 0;
                        if (sess && this._trMsgStartSession !== sess) {
                            this._trMsgStartX = x;
                            this._trMsgStartY = y;
                            this._trMsgStartSession = sess;
                        }
                    } catch (_) {}
                    if (textStr.startsWith(REDRAW_SIGNATURE)) {
                        const cleanText = textStr.substring(REDRAW_SIGNATURE.length);
                        telemetry.logDraw('bypass', cleanText, x, y, { windowType: this.constructor.name });
                        return invokeOriginalDrawTextEx(cleanText, { bypassCreateTextState: true });
                    }
                    return invokeOriginalDrawTextEx();
                }

                if (textStr.startsWith(REDRAW_SIGNATURE)) {
                    const cleanText = textStr.substring(REDRAW_SIGNATURE.length);
                    telemetry.logDraw('bypass', cleanText, x, y, { windowType: this.constructor.name });
                    return invokeOriginalDrawTextEx(cleanText, { bypassCreateTextState: true, scaleText: true });
                }
                const rawTrimmed = textStr.trim();

                ensureWindowRegistered(this);
                const windowData = windowRegistry.get(this);

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
                            trackWindowDraw(existing, 'existing', {
                                windowType: this.constructor.name,
                                method: 'drawTextEx-existing',
                                translationDrawn: restored,
                            });
                            return invokeOriginalDrawTextEx(signed, { bypassCreateTextState: true, scaleText: true });
                        } else if (existing.recordId && hasTextTracker() && typeof textTracker.skip === 'function') {
                            textTracker.skip(existing.recordId, 'cached redraw matched original', {
                                windowType: this.constructor.name,
                                method: 'drawTextEx-existing',
                            });
                        }
                    }
                }

                try {
                    const norm = String(existing && existing.translationSource ? existing.translationSource : convertedTrimmed).trim();
                    if (norm && translationCache.completed.has(norm)) {
                        const translated = translationCache.completed.get(norm);
                        const receivedTranslation = translated;
                        const restored = restoreControlCodes(translated, (existing && existing.placeholderInfo ? existing.placeholderInfo : null), convertedText);
                        if (restored === convertedTrimmed) {
                            diag(`[drawTextEx Skip] ${preview(convertedTrimmed)}`);
                            if (existing && existing.recordId && hasTextTracker() && typeof textTracker.skip === 'function') {
                                textTracker.skip(existing.recordId, 'inline cache matched original', {
                                    windowType: this.constructor.name,
                                    method: 'drawTextEx-inline',
                                });
                            }
                            return invokeOriginalDrawTextEx();
                        }
                        const signed = REDRAW_SIGNATURE + restored;
                        telemetry.logDraw('redraw', restored, x, y, { windowType: this.constructor.name, method: 'drawTextEx-inline' });
                        trackWindowDraw(existing, 'inline-cache', {
                            windowType: this.constructor.name,
                            method: 'drawTextEx-inline',
                            translationReceived: receivedTranslation,
                            translationDrawn: restored,
                        });
                        return invokeOriginalDrawTextEx(signed, { scaleText: true });
                    }
                } catch (_) {}

                return invokeOriginalDrawTextEx();
            };
            Window_Base.prototype.drawTextEx.__trOriginal = originalDrawTextEx;
            Window_Base.prototype.drawTextEx.__trWindowDrawWrapper = WINDOW_DRAW_WRAPPER_TOKEN;
            return { redrawTranslatedText };
        }

        return {
            status: 'installed',
            reason: 'Window_Base drawText and drawTextEx hooks installed.',
            helpers: trackWindowDrawTextInternal(),
        };
    }

    defineRuntimeModule('hooks.windowDraw', {
        install: installWindowDrawHooks,
    });
})();
