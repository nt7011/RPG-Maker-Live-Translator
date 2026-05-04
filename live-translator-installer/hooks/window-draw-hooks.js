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
        const MAX_BACKGROUND_SNAPSHOT_PIXELS = 262144;
        const REDRAW_DIAGNOSTIC_ITEM_LIMIT = 8;
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

        function roundDiagnosticNumber(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return null;
            return Math.round(numeric * 1000) / 1000;
        }

        function cloneDiagnosticRect(rect) {
            if (!rect) return null;
            const x1 = roundDiagnosticNumber(rect.x1);
            const y1 = roundDiagnosticNumber(rect.y1);
            const x2 = roundDiagnosticNumber(rect.x2);
            const y2 = roundDiagnosticNumber(rect.y2);
            if ([x1, y1, x2, y2].some(value => value === null)) return null;
            return { x1, y1, x2, y2 };
        }

        function cloneDiagnosticArea(area) {
            if (!area) return null;
            const x = roundDiagnosticNumber(area.x);
            const y = roundDiagnosticNumber(area.y);
            const w = roundDiagnosticNumber(area.w);
            const h = roundDiagnosticNumber(area.h);
            if ([x, y, w, h].some(value => value === null)) return null;
            return { x, y, w, h };
        }

        function normalizeDrawTextAlignValue(align) {
            const value = String(align || '').toLowerCase();
            if (value === 'right' || value === 'end') return 'right';
            if (value === 'center' || value === 'centre' || value === 'middle') return 'center';
            return 'left';
        }

        function getWindowIconWidth() {
            try {
                if (typeof Window_Base !== 'undefined'
                    && Number.isFinite(Number(Window_Base._iconWidth))
                    && Number(Window_Base._iconWidth) > 0) {
                    return Number(Window_Base._iconWidth);
                }
            } catch (_) {}
            try {
                if (typeof ImageManager !== 'undefined'
                    && Number.isFinite(Number(ImageManager.iconWidth))
                    && Number(ImageManager.iconWidth) > 0) {
                    return Number(ImageManager.iconWidth);
                }
            } catch (_) {}
            return 32;
        }

        function countDrawTextExIcons(text) {
            const value = String(text || '');
            const matches = value.match(/(?:\x1b|\\)i\[[^\]]*\]/gi);
            return matches ? matches.length : 0;
        }

        function measurePlainTextWidth(window, contents, text, fallbackLineHeight) {
            const value = String(text || '');
            if (!value) return 0;
            try {
                if (contents && typeof contents.measureTextWidth === 'function') {
                    const measured = Number(contents.measureTextWidth(value));
                    if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
                }
            } catch (_) {}
            try {
                if (typeof window.textWidth === 'function') {
                    const measured = Number(window.textWidth(value));
                    if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
                }
            } catch (_) {}
            try {
                if (contents && typeof contents.textWidth === 'function') {
                    const measured = Number(contents.textWidth(value));
                    if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
                }
            } catch (_) {}
            const fontSize = contents && typeof contents.fontSize === 'number' ? contents.fontSize : fallbackLineHeight;
            return Math.ceil(value.length * Math.max(6, fontSize * 0.6));
        }

        function estimateDrawTextExFallbackWidth(window, contents, richText, visibleText, fallbackLineHeight) {
            const visibleWidth = measurePlainTextWidth(window, contents, visibleText, fallbackLineHeight);
            const iconCount = countDrawTextExIcons(richText);
            if (!iconCount) return visibleWidth;
            return visibleWidth + iconCount * (getWindowIconWidth() + 4);
        }

        function estimateEntryBounds(window, type, text, x, y, convertedText, originalParams = null) {
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
                const richText = String(convertedText || text || '');
                const basis = stripRpgmEscapes(richText);

                try {
                    if (type === 'drawTextEx' && typeof window.textSizeEx === 'function') {
                        const sz = window.textSizeEx(richText);
                        width = Math.max(
                            Math.ceil((sz && sz.width) || 0),
                            estimateDrawTextExFallbackWidth(window, contents, richText, basis, baseLineHeight)
                        );
                        if (sz && Number.isFinite(sz.height)) {
                            height = Math.max(height, Math.ceil(sz.height));
                        }
                    } else if (type === 'drawTextEx') {
                        width = estimateDrawTextExFallbackWidth(window, contents, richText, basis, baseLineHeight);
                    } else {
                        width = measurePlainTextWidth(window, contents, basis, baseLineHeight);
                    }
                } catch (_) {}

                if (!width || !Number.isFinite(width)) {
                    width = type === 'drawTextEx'
                        ? estimateDrawTextExFallbackWidth(window, contents, richText, basis, baseLineHeight)
                        : measurePlainTextWidth(window, contents, basis, baseLineHeight);
                }
                if (!height || !Number.isFinite(height)) {
                    height = baseLineHeight;
                }

                let x1 = Number.isFinite(Number(x)) ? Number(x) : 0;
                const y1 = Number.isFinite(Number(y)) ? Number(y) : 0;
                let drawWidth = Math.max(0, width);

                if (type === 'drawText' && originalParams) {
                    const maxWidth = Number(originalParams.maxWidth);
                    if (Number.isFinite(maxWidth) && maxWidth > 0) {
                        drawWidth = Math.min(drawWidth, maxWidth);
                        const align = normalizeDrawTextAlignValue(originalParams.align);
                        if (align === 'right') {
                            x1 += maxWidth - drawWidth;
                        } else if (align === 'center') {
                            x1 += (maxWidth - drawWidth) / 2;
                        }
                    }
                }

                return {
                    x1,
                    y1,
                    x2: x1 + drawWidth,
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

        function isCounterLikeWindowText(text) {
            const trimmed = String(text || '').trim();
            const nonSpace = trimmed.replace(/\s+/g, '');
            const cjkMatch = trimmed.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g);
            const cjkCount = cjkMatch ? cjkMatch.length : 0;
            const hasDigit = /\d/.test(trimmed);
            const onlyNumPunct = /^[0-9()\[\]\-+/*.,:;!?％%]+$/u.test(nonSpace);
            return (
                hasDigit && (cjkCount <= 1) && nonSpace.length <= 10
            ) || onlyNumPunct || /\d+\s*[\u3040-\u30FF\u4E00-\u9FFF]\s*\(\d+\)/u.test(trimmed);
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

        function getBitmapReplayApi() {
            try {
                const api = globalScope.LiveTranslatorBitmapReplay;
                if (!api || api.__token !== 'liveTranslator.bitmapReplay') return null;
                if (typeof api.ensureBitmapState !== 'function'
                    || typeof api.nextDrawOrder !== 'function'
                    || typeof api.collectReplayItems !== 'function'
                    || typeof api.replayBitmapItems !== 'function'
                    || typeof api.withBitmapReplay !== 'function'
                    || typeof api.rectFromDimensions !== 'function') {
                    return null;
                }
                return api;
            } catch (_) {
                return null;
            }
        }

        function assignWindowTextDrawOrder(contents, entry) {
            if (!contents || !entry) return;
            const replayApi = getBitmapReplayApi();
            if (!replayApi) return;
            try {
                const state = replayApi.ensureBitmapState(contents);
                if (!state) return;
                entry.drawOrder = replayApi.nextDrawOrder(state);
            } catch (_) {}
        }

        function createClearRectFromArea(clearArea, replayApi) {
            if (!clearArea || !replayApi || typeof replayApi.rectFromDimensions !== 'function') return null;
            try {
                return replayApi.rectFromDimensions(clearArea.x, clearArea.y, clearArea.w, clearArea.h);
            } catch (_) {
                return null;
            }
        }

        function getReplayItemRect(item) {
            if (!item) return null;
            if (item.type === 'renderOp' && item.op && item.op.rect) return item.op.rect;
            if (item.type === 'text' && item.entry && item.entry.bounds) return item.entry.bounds;
            if (item.type === 'windowText' && item.entry && item.entry.bounds) return item.entry.bounds;
            return null;
        }

        function mergeReplayRect(a, b) {
            const valid = (rect) => rect
                && Number.isFinite(Number(rect.x1))
                && Number.isFinite(Number(rect.y1))
                && Number.isFinite(Number(rect.x2))
                && Number.isFinite(Number(rect.y2));
            if (!valid(a)) return valid(b) ? b : null;
            if (!valid(b)) return a;
            return {
                x1: Math.min(Number(a.x1), Number(b.x1)),
                y1: Math.min(Number(a.y1), Number(b.y1)),
                x2: Math.max(Number(a.x2), Number(b.x2)),
                y2: Math.max(Number(a.y2), Number(b.y2)),
            };
        }

        function expandReplayDirtyRect(baseRect, items) {
            let dirtyRect = baseRect || null;
            if (Array.isArray(items)) {
                items.forEach((item) => {
                    dirtyRect = mergeReplayRect(dirtyRect, getReplayItemRect(item));
                });
            }
            return dirtyRect;
        }

        function replayRectsOverlap(a, b) {
            if (!a || !b) return false;
            return Number(a.x1) < Number(b.x2)
                && Number(a.x2) > Number(b.x1)
                && Number(a.y1) < Number(b.y2)
                && Number(a.y2) > Number(b.y1);
        }

        function getBitmapCanvasContext(contents) {
            if (!contents) return null;
            try {
                const context = contents._context || contents.context || null;
                if (!context
                    || typeof context.save !== 'function'
                    || typeof context.restore !== 'function'
                    || typeof context.rect !== 'function'
                    || typeof context.clip !== 'function') {
                    return null;
                }
                return context;
            } catch (_) {
                return null;
            }
        }

        function getBitmapSnapshotContext(contents) {
            if (!contents) return null;
            try {
                const context = contents._context || contents.context || null;
                if (!context
                    || typeof context.getImageData !== 'function'
                    || typeof context.putImageData !== 'function') {
                    return null;
                }
                return context;
            } catch (_) {
                return null;
            }
        }

        function getEntrySnapshotPadding(contents, entry) {
            const fromEntry = entry
                && entry.drawState
                && Number.isFinite(Number(entry.drawState.outlineWidth))
                ? Number(entry.drawState.outlineWidth)
                : NaN;
            const fromContents = contents && Number.isFinite(Number(contents.outlineWidth))
                ? Number(contents.outlineWidth)
                : redrawSettings.defaultOutline;
            return Math.max(0, Math.ceil(Number.isFinite(fromEntry) ? fromEntry : fromContents));
        }

        function getSnapshotArea(contents, bounds, padding = 0) {
            if (!contents || !bounds) return null;
            const x1 = Math.max(0, Math.floor(Math.min(Number(bounds.x1), Number(bounds.x2)) - padding));
            const y1 = Math.max(0, Math.floor(Math.min(Number(bounds.y1), Number(bounds.y2)) - padding));
            let x2 = Math.ceil(Math.max(Number(bounds.x1), Number(bounds.x2)) + padding);
            let y2 = Math.ceil(Math.max(Number(bounds.y1), Number(bounds.y2)) + padding);
            if (Number.isFinite(Number(contents.width))) {
                x2 = Math.min(Number(contents.width), x2);
            }
            if (Number.isFinite(Number(contents.height))) {
                y2 = Math.min(Number(contents.height), y2);
            }
            const w = x2 - x1;
            const h = y2 - y1;
            if (![x1, y1, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
            if (w * h > MAX_BACKGROUND_SNAPSHOT_PIXELS) return null;
            return { x: x1, y: y1, w, h };
        }

        function captureWindowEntryBackground(contents, entry) {
            if (!contents || !entry || !entry.bounds) return false;
            const context = getBitmapSnapshotContext(contents);
            if (!context) return false;
            const area = getSnapshotArea(contents, entry.bounds, getEntrySnapshotPadding(contents, entry));
            if (!area) return false;
            try {
                const imageData = context.getImageData(area.x, area.y, area.w, area.h);
                if (!imageData) return false;
                entry.backgroundSnapshot = {
                    contentsBitmap: contents,
                    x: area.x,
                    y: area.y,
                    w: area.w,
                    h: area.h,
                    bounds: cloneDiagnosticRect(entry.bounds),
                    contentsRevision: Number.isFinite(Number(entry.contentsRevision))
                        ? Number(entry.contentsRevision)
                        : null,
                    capturedAt: Date.now(),
                    imageData,
                };
                return true;
            } catch (_) {
                entry.backgroundSnapshot = null;
                return false;
            }
        }

        function ensureWindowEntryBackground(contents, entry) {
            if (!contents || !entry) return false;
            const snapshot = entry.backgroundSnapshot;
            if (snapshot && snapshot.contentsBitmap === contents && snapshot.imageData) {
                return true;
            }
            return captureWindowEntryBackground(contents, entry);
        }

        function shouldUseWindowEntryBackgroundSnapshot(entry) {
            // drawTextEx commonly redraws rich text over text that may already be
            // present from an earlier frame. A snapshot taken before the current
            // draw can therefore contain the original text, so async replacement
            // must prefer the explicit clear/replay path.
            return !!(entry && entry.type !== 'drawTextEx');
        }

        function restoreWindowEntryBackground(contents, entry) {
            if (!contents || !entry || !entry.backgroundSnapshot) return false;
            const snapshot = entry.backgroundSnapshot;
            if (snapshot.contentsBitmap && snapshot.contentsBitmap !== contents) return false;
            const context = getBitmapSnapshotContext(contents);
            if (!context || !snapshot.imageData) return false;
            try {
                context.putImageData(snapshot.imageData, snapshot.x, snapshot.y);
                return true;
            } catch (_) {
                return false;
            }
        }

        function getReplayClipArea(contents, rect) {
            if (!contents || !rect) return null;
            const x1 = Math.max(0, Math.floor(Math.min(Number(rect.x1), Number(rect.x2))));
            const y1 = Math.max(0, Math.floor(Math.min(Number(rect.y1), Number(rect.y2))));
            let x2 = Math.ceil(Math.max(Number(rect.x1), Number(rect.x2)));
            let y2 = Math.ceil(Math.max(Number(rect.y1), Number(rect.y2)));
            if (Number.isFinite(Number(contents.width))) {
                x2 = Math.min(Number(contents.width), x2);
            }
            if (Number.isFinite(Number(contents.height))) {
                y2 = Math.min(Number(contents.height), y2);
            }
            const w = x2 - x1;
            const h = y2 - y1;
            if (![x1, y1, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
            return { x: x1, y: y1, w, h };
        }

        function supportsBitmapReplayClip(contents) {
            return !!getBitmapCanvasContext(contents);
        }

        function withBitmapReplayClip(contents, rect, fn) {
            if (typeof fn !== 'function') return undefined;
            const context = getBitmapCanvasContext(contents);
            const clip = getReplayClipArea(contents, rect);
            if (!context || !clip) return fn();
            context.save();
            try {
                if (typeof context.beginPath === 'function') context.beginPath();
                context.rect(clip.x, clip.y, clip.w, clip.h);
                context.clip();
                return fn();
            } finally {
                context.restore();
            }
        }

        function windowEntryBelongsToContents(entry, contents) {
            if (!entry || !contents) return false;
            try {
                if (entry.contentsBitmap) return entry.contentsBitmap === contents;
            } catch (_) {}
            return true;
        }

        function collectWindowTextReplayItems(windowData, currentEntry, contents, dirtyRect, currentOrder) {
            if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return [];
            if (!dirtyRect) return [];
            const items = [];
            try {
                windowData.texts.forEach((entry) => {
                    if (!entry || entry === currentEntry || entry._trStale) return;
                    if (!windowEntryBelongsToContents(entry, contents)) return;
                    if (!entry.bounds || !replayRectsOverlap(dirtyRect, entry.bounds)) return;
                    const drawOrder = Number(entry.drawOrder) || (Number(currentOrder) + 0.5);
                    items.push({ type: 'windowText', drawOrder, entry });
                });
            } catch (_) {}
            return items;
        }

        function getWindowReplayText(entry) {
            if (!entry) return '';
            const status = String(entry.translationStatus || '');
            const translated = entry.translatedText || '';
            if (status === 'completed' && translated) {
                return sanitizeDrawTextOutput(translated, entry.type);
            }
            return sanitizeDrawTextOutput(entry.convertedText || entry.visibleText || entry.rawText || '', entry.type);
        }

        function replayWindowTextEntry(targetWindow, contents, entry) {
            if (!targetWindow || !contents || !entry || entry._trStale) return;
            const text = getWindowReplayText(entry);
            if (!text) return;
            const position = entry.position || {};
            const params = entry.originalParams || {};
            try {
                if (entry.drawState) applyBitmapDrawState(contents, entry.drawState);
            } catch (_) {}
            withWindowContents(targetWindow, contents, () => {
                const signed = REDRAW_SIGNATURE + text;
                if (entry.type === 'drawTextEx' && typeof targetWindow.drawTextEx === 'function') {
                    targetWindow.drawTextEx(signed, position.x, position.y);
                } else if (typeof targetWindow.drawText === 'function') {
                    targetWindow.drawText(signed, position.x, position.y, params.maxWidth, params.align);
                }
            });
        }

        function combineReplayItems(bitmapItems, windowItems) {
            return []
                .concat(Array.isArray(bitmapItems) ? bitmapItems : [])
                .concat(Array.isArray(windowItems) ? windowItems : [])
                .sort((a, b) => (Number(a && a.drawOrder) || 0) - (Number(b && b.drawOrder) || 0));
        }

        function isDrawTextExInternalReplayItem(item) {
            return !!(item
                && item.type === 'renderOp'
                && item.op
                && item.op.windowDrawTextExReplay);
        }

        function filterReplayForWindowEntry(items, entry) {
            const list = Array.isArray(items) ? items : [];
            if (!entry || entry.type !== 'drawTextEx') return list;
            return list.filter(item => !isDrawTextExInternalReplayItem(item));
        }

        function summarizeReplayItemsForDiagnostics(items, limit = REDRAW_DIAGNOSTIC_ITEM_LIMIT) {
            const list = Array.isArray(items) ? items : [];
            const methods = {};
            let minOrder = null;
            let maxOrder = null;
            list.forEach((item) => {
                const order = Number(item && item.drawOrder);
                if (Number.isFinite(order)) {
                    minOrder = minOrder === null ? order : Math.min(minOrder, order);
                    maxOrder = maxOrder === null ? order : Math.max(maxOrder, order);
                }
                let key = item && item.type ? String(item.type) : 'unknown';
                if (item && item.type === 'renderOp' && item.op && item.op.methodName) {
                    key = `op:${item.op.methodName}`;
                } else if (item && item.type === 'windowText' && item.entry && item.entry.type) {
                    key = `window:${item.entry.type}`;
                }
                methods[key] = (methods[key] || 0) + 1;
            });
            return {
                count: list.length,
                omitted: Math.max(0, list.length - limit),
                orderMin: minOrder,
                orderMax: maxOrder,
                methods,
                sample: list.slice(0, limit).map((item) => {
                    if (!item) return { type: 'null' };
                    const base = {
                        type: item.type || 'unknown',
                        drawOrder: Number(item.drawOrder) || 0,
                    };
                    if (item.type === 'renderOp') {
                        const op = item.op || {};
                        return Object.assign(base, {
                            methodName: op.methodName || '',
                            rect: cloneDiagnosticRect(op.rect),
                            nativeTextKey: op.nativeTextKey || '',
                            textPreview: op.textPreview ? preview(op.textPreview, 40) : '',
                            ownerType: op.ownerType || '',
                            windowDrawTextExReplay: !!op.windowDrawTextExReplay,
                            argsCount: Array.isArray(op.args) ? op.args.length : 0,
                            ageMs: Number.isFinite(Number(op.recordedAt)) ? Math.max(0, Date.now() - Number(op.recordedAt)) : null,
                        });
                    }
                    if (item.type === 'windowText') {
                        const entry = item.entry || {};
                        return Object.assign(base, {
                            methodName: entry.type || '',
                            rect: cloneDiagnosticRect(entry.bounds),
                            recordId: entry.recordId || '',
                            status: entry.translationStatus || '',
                            textPreview: preview(entry.visibleText || entry.convertedText || entry.rawText || '', 40),
                        });
                    }
                    return base;
                }),
            };
        }

        function summarizeReplayStateForDiagnostics(state) {
            if (!state) return null;
            return {
                drawOrderCounter: Number(state.drawOrderCounter) || 0,
                renderOps: Array.isArray(state.renderOps) ? state.renderOps.length : 0,
                entries: state.entries && typeof state.entries.size === 'number' ? state.entries.size : 0,
                nativeTextOps: state.nativeTextOps && typeof state.nativeTextOps.size === 'number' ? state.nativeTextOps.size : 0,
                fragments: Array.isArray(state.fragments) ? state.fragments.length : 0,
            };
        }

        function getSnapshotDiagnostics(entry, contents) {
            const snapshot = entry && entry.backgroundSnapshot ? entry.backgroundSnapshot : null;
            if (!snapshot) {
                return {
                    available: false,
                    bitmapMatches: false,
                    area: null,
                    boundsAtCapture: null,
                    contentsRevisionAtCapture: null,
                    ageMs: null,
                };
            }
            return {
                available: true,
                bitmapMatches: !!(contents && snapshot.contentsBitmap === contents),
                area: cloneDiagnosticArea(snapshot),
                boundsAtCapture: snapshot.bounds || null,
                contentsRevisionAtCapture: snapshot.contentsRevision,
                ageMs: Number.isFinite(Number(snapshot.capturedAt)) ? Math.max(0, Date.now() - Number(snapshot.capturedAt)) : null,
            };
        }

        function replayMixedItems(contents, targetWindow, items, replayApi, clipRect = null) {
            if (!contents || !Array.isArray(items) || !items.length) return;
            const replay = () => {
                items.forEach((item) => {
                    if (!item) return;
                    if (item.type === 'windowText') {
                        replayWindowTextEntry(targetWindow, contents, item.entry);
                    } else if (replayApi && typeof replayApi.replayBitmapItems === 'function') {
                        replayApi.replayBitmapItems(contents, [item]);
                    }
                });
            };
            return withBitmapReplayClip(contents, clipRect, replay);
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

        function withWindowDrawTextExReplayScope(contents, fn) {
            if (typeof fn !== 'function') return undefined;
            if (!contents) return fn();
            contents._trWindowDrawTextExReplayDepth = (contents._trWindowDrawTextExReplayDepth || 0) + 1;
            try {
                return fn();
            } finally {
                contents._trWindowDrawTextExReplayDepth = Math.max(0, (contents._trWindowDrawTextExReplayDepth || 1) - 1);
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

        function isCoreRefreshWindowType(windowType) {
            return /^Window_(?:ActorCommand|BattleActor|BattleEnemy|BattleItem|BattleSkill|BattleStatus|ChoiceList|Command|DebugEdit|DebugRange|EquipCommand|EquipItem|EquipSlot|EquipStatus|EventItem|GameEnd|Gold|HorzCommand|ItemCategory|ItemList|MenuActor|MenuCommand|MenuStatus|NameEdit|NameInput|NumberInput|Options|PartyCommand|SavefileList|ShopBuy|ShopCommand|ShopNumber|ShopSell|ShopStatus|SkillList|SkillStatus|SkillType|Status|StatusBase|StatusEquip|StatusParams|TitleCommand)$/u.test(String(windowType || ''));
        }

        function shouldRefreshWindowForTranslation(window, windowData, textEntry = null) {
            if (!window || typeof window.refresh !== 'function') return false;
            if (window._trTranslationRefreshDepth > 0) return false;
            const windowType = getWindowTypeName(window, windowData);
            if (isDedicatedMessageWindow(window)) {
                return false;
            }
            if (/Window_(Message|Message_Battle|NameBox)/.test(windowType)) {
                return false;
            }
            if (wasDrawnToDetachedContents(window, textEntry)) {
                return false;
            }
            if (isTransientRefreshWindow(window, windowType)) {
                return false;
            }
            return isCoreRefreshWindowType(windowType);
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
            if (windowRegistry && window) {
                try {
                    const data = windowRegistry.get(window);
                    entry.contentsRevision = data ? (data.contentsRevision || 0) : entry.contentsRevision;
                } catch (_) {}
            }
            assignWindowTextDrawOrder(entry.contentsBitmap, entry);
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
                    convertedText || textToTranslate,
                    entry.originalParams
                );
                entry.bounds = refreshedBounds;
                ensureWindowEntryBackground(entry.contentsBitmap, entry);
            } catch (_) {}

            return entry;
        }

        function recordNativeWindowText(window, windowData, text, x, y, type = null, convertedText = null, originalParams = null, reason = 'native') {
            if (!windowData) return null;
            const textToDraw = convertedText || text;
            const trimmed = String(textToDraw || '').trim();
            if (!trimmed) return null;

            const textKey = generateKey(type, x, y, windowData.windowType, textToDraw);
            const existing = windowData.texts.get(textKey);
            if (existing && existing.rawText === text && existing.convertedText === trimmed) {
                const refreshed = refreshExistingTextEntry(window, existing, text, x, y, type, convertedText, originalParams);
                refreshed.isTranslatable = false;
                refreshed.translationStatus = 'skipped';
                refreshed.skipReason = reason || 'native';
                refreshed.translationSource = '';
                refreshed.placeholderInfo = null;
                dropPendingRedraw(windowData, refreshed, textKey);
                trackWindowEntry(windowData, refreshed, 'skipped', {
                    type: 'translation.skipped',
                    message: refreshed.skipReason,
                    details: { reason: refreshed.skipReason, nativeReplay: true },
                });
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

            const textEntry = {
                type,
                rawText: text,
                convertedText: trimmed,
                visibleText: stripRpgmEscapes(convertedText || textToDraw || text),
                drawState: captureBitmapDrawState(window && window.contents),
                translatedText: null,
                translationStatus: 'skipped',
                translationPromise: null,
                position: { x, y },
                originalParams: originalParams || {},
                timestamp: Date.now(),
                translationSource: '',
                placeholderInfo: null,
                contentsBitmap: window && window.contents ? window.contents : null,
                contentsRevision: windowData.contentsRevision || 0,
                drawOrder: 0,
                bounds: null,
                isTranslatable: false,
                skipReason: reason || 'native',
            };
            assignWindowTextDrawOrder(textEntry.contentsBitmap, textEntry);

            try {
                const initialBounds = estimateEntryBounds(window, type, textToDraw, x, y, convertedText || textToDraw, originalParams);
                textEntry.bounds = initialBounds;
            } catch (_) {}

            windowData.texts.set(textKey, textEntry);
            textEntry.recordId = getWindowRecordId(windowData, textKey);
            trackWindowEntry(windowData, textEntry, 'skipped', {
                type: 'translation.skipped',
                message: textEntry.skipReason,
                details: { reason: textEntry.skipReason, nativeReplay: true },
            });
            try {
                if (!windowData.pendingRedraws) windowData.pendingRedraws = new Map();
                windowData.pendingRedraws.delete(textKey);
            } catch (_) {}
            return textEntry;
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
                if (!trimmed) return null;
                return recordNativeWindowText(
                    window,
                    windowData,
                    text,
                    x,
                    y,
                    type,
                    convertedText,
                    originalParams,
                    looksLikeCounter ? 'counterLike' : 'cacheSkip'
                );
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
                contentsRevision: windowData.contentsRevision || 0,
                drawOrder: 0,
                bounds: null,
            };
            assignWindowTextDrawOrder(textEntry.contentsBitmap, textEntry);

            const visibleText = stripRpgmEscapes(convertedText || textToTranslate || text);
            try {
                const initialBounds = estimateEntryBounds(window, type, textToTranslate, x, y, convertedText || textToTranslate, originalParams);
                textEntry.bounds = initialBounds;
                captureWindowEntryBackground(textEntry.contentsBitmap, textEntry);
            } catch (_) {}
            textEntry.visibleText = visibleText;

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
                    textEntry.translationTimestamp = Date.now();

                    if (text.trim() === String(translatedText || '').trim()
                        || String(textEntry.convertedText || text || '').trim() === String(restored || '').trim()) {
                        dbg(`[Translation Skip] Original and translated text are identical: "${preview(text)}"`);
                        textEntry.translationStatus = 'skipped';
                        trackWindowEntry(windowData, textEntry, 'skipped', {
                            type: 'translation.skipped',
                            message: 'translated text matched original',
                        });
                        return;
                    }

                    textEntry.translationStatus = 'completed';
                    trackWindowEntry(windowData, textEntry, 'completed', {
                        type: 'translation.completed',
                    });
                    dbg(`[Text Updated] "${text}" -> "${restored}"`);

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
                let replayApi = null;
                let replayBefore = [];
                let replayAfter = [];
                let replayBeforeFiltered = 0;
                let replayAfterFiltered = 0;
                let replayDirtyRect = null;
                let replayClipRect = null;
                let usedBackgroundSnapshot = false;
                let snapshotRestoreAttempted = false;
                let snapshotRestoreSkippedReason = '';
                let clearMode = 'none';
                let originalBounds = null;
                let translatedBounds = null;
                let mergedBounds = null;
                let calcTextHeight = null;
                let replayRectForDiagnostics = null;
                let windowReplayRectForDiagnostics = null;
                let replayStateDiagnostics = null;
                let currentDrawOrder = Number(textEntry.drawOrder) || 0;
                let supportsReplayClip = false;
                let replayCollectError = false;

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
                        originalBounds = cloneDiagnosticRect(bounds);
                        try {
                            translatedBounds = withWindowContents(targetWindow, contents, () => estimateEntryBounds(
                                targetWindow,
                                textEntry.type,
                                translatedText,
                                x,
                                y,
                                translatedText,
                                textEntry.originalParams
                            ));
                            bounds = mergeBounds(bounds, translatedBounds) || bounds;
                        } catch (_) {}
                        mergedBounds = cloneDiagnosticRect(bounds);
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
                                    calcTextHeight = calcHeight;
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
                        replayApi = getBitmapReplayApi();
                        if (replayApi) {
                            try {
                                const state = replayApi.ensureBitmapState(contents);
                                const replayRect = clearArea
                                    ? createClearRectFromArea(clearArea, replayApi)
                                    : replayApi.rectFromDimensions(0, 0, contents.width, contents.height);
                                replayRectForDiagnostics = cloneDiagnosticRect(replayRect);
                                replayClipRect = replayRect;
                                replayStateDiagnostics = summarizeReplayStateForDiagnostics(state);
                                currentDrawOrder = Number(textEntry.drawOrder) || 0;
                                if (state && replayRect && currentDrawOrder > 0) {
                                    const bitmapReplayBefore = replayApi.collectReplayItems(state, replayRect, textEntry, order => order < currentDrawOrder);
                                    const bitmapReplayAfter = replayApi.collectReplayItems(state, replayRect, textEntry, order => order > currentDrawOrder);
                                    replayDirtyRect = expandReplayDirtyRect(
                                        replayRect,
                                        bitmapReplayBefore.concat(bitmapReplayAfter)
                                    );
                                    // Clipped replay cannot touch pixels outside the clear rect, so native
                                    // window text outside that rect should not be drawn a second time.
                                    supportsReplayClip = supportsBitmapReplayClip(contents);
                                    const windowReplayRect = supportsReplayClip
                                        ? replayRect
                                        : replayDirtyRect;
                                    windowReplayRectForDiagnostics = cloneDiagnosticRect(windowReplayRect);
                                    const windowReplayItems = collectWindowTextReplayItems(
                                        windowData,
                                        textEntry,
                                        contents,
                                        windowReplayRect,
                                        currentDrawOrder
                                    );
                                    const replayBeforeCandidate = combineReplayItems(
                                        bitmapReplayBefore,
                                        windowReplayItems.filter(item => (Number(item.drawOrder) || 0) < currentDrawOrder)
                                    );
                                    replayBefore = filterReplayForWindowEntry(replayBeforeCandidate, textEntry);
                                    replayBeforeFiltered = Math.max(0, replayBeforeCandidate.length - replayBefore.length);
                                    const replayAfterCandidate = combineReplayItems(
                                        bitmapReplayAfter,
                                        windowReplayItems.filter(item => (Number(item.drawOrder) || 0) > currentDrawOrder)
                                    );
                                    replayAfter = filterReplayForWindowEntry(replayAfterCandidate, textEntry);
                                    replayAfterFiltered = Math.max(0, replayAfterCandidate.length - replayAfter.length);
                                }
                            } catch (_) {
                                replayBefore = [];
                                replayAfter = [];
                                replayBeforeFiltered = 0;
                                replayAfterFiltered = 0;
                                replayDirtyRect = null;
                                replayCollectError = true;
                            }
                        }
                        if (clearArea) {
                            try {
                                contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                                aggregationIncremented = true;
                            } catch (_) {}
                            try {
                                const clearAndReplay = () => {
                                    snapshotRestoreAttempted = !!(textEntry && textEntry.backgroundSnapshot);
                                    const allowBackgroundSnapshot = shouldUseWindowEntryBackgroundSnapshot(textEntry);
                                    if (!allowBackgroundSnapshot && snapshotRestoreAttempted) {
                                        snapshotRestoreSkippedReason = 'drawTextEx';
                                    }
                                    if (allowBackgroundSnapshot && restoreWindowEntryBackground(contents, textEntry)) {
                                        usedBackgroundSnapshot = true;
                                        clearMode = 'snapshot';
                                        return;
                                    }
                                    clearMode = 'clearRect';
                                    contents.clearRect(clearArea.x, clearArea.y, clearArea.w, clearArea.h);
                                    if (replayApi && replayBefore.length) {
                                        replayMixedItems(contents, targetWindow, replayBefore, replayApi, replayClipRect);
                                    }
                                };
                                withWindowRedrawClear(contents, () => {
                                    if (replayApi) {
                                        replayApi.withBitmapReplay(contents, clearAndReplay);
                                    } else {
                                        clearAndReplay();
                                    }
                                });
                            } catch (_) {}
                        } else {
                            try {
                                contents._trAggregationDepth = (contents._trAggregationDepth || 0) + 1;
                                aggregationIncremented = true;
                            } catch (_) {}
                            try {
                                const clearAndReplay = () => {
                                    clearMode = 'clear';
                                    contents.clear();
                                    if (replayApi && replayBefore.length) {
                                        replayMixedItems(contents, targetWindow, replayBefore, replayApi, replayClipRect);
                                    }
                                };
                                withWindowRedrawClear(contents, () => {
                                    if (replayApi) {
                                        replayApi.withBitmapReplay(contents, clearAndReplay);
                                    } else {
                                        clearAndReplay();
                                    }
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
                    if (contents && storedDrawState) {
                        try { applyBitmapDrawState(contents, storedDrawState); } catch (_) {}
                    }
                    const redrawDiagnostics = {
                        clearMode,
                        clearArea: cloneDiagnosticArea(clearArea),
                        originalBounds,
                        translatedBounds: cloneDiagnosticRect(translatedBounds),
                        mergedBounds,
                        calcTextHeight: roundDiagnosticNumber(calcTextHeight),
                        replayRect: replayRectForDiagnostics,
                        replayDirtyRect: cloneDiagnosticRect(replayDirtyRect),
                        replayClipRect: cloneDiagnosticRect(replayClipRect),
                        windowReplayRect: windowReplayRectForDiagnostics,
                        supportsReplayClip,
                        replayCollectError,
                        drawOrder: {
                            current: currentDrawOrder,
                            state: replayStateDiagnostics,
                        },
                        snapshot: Object.assign(getSnapshotDiagnostics(textEntry, contents), {
                            restoreAttempted: snapshotRestoreAttempted,
                            restoreSkippedReason: snapshotRestoreSkippedReason,
                            restoreSucceeded: usedBackgroundSnapshot,
                            contentsRevisionAtRedraw: windowData.contentsRevision || 0,
                        }),
                        replayBeforeItems: summarizeReplayItemsForDiagnostics(replayBefore),
                        replayAfterItems: summarizeReplayItemsForDiagnostics(replayAfter),
                        replayBeforeFiltered,
                        replayAfterFiltered,
                        text: {
                            rawLength: String(textEntry.rawText || '').length,
                            convertedLength: String(textEntry.convertedText || '').length,
                            visibleLength: String(textEntry.visibleText || '').length,
                            translatedLength: String(translatedText || '').length,
                            rawHasEscapes: /(?:\x1b|\\)/.test(String(textEntry.rawText || textEntry.convertedText || '')),
                            translatedHasEscapes: /(?:\x1b|\\)/.test(String(translatedText || '')),
                        },
                        contents: {
                            width: Number(contents && contents.width) || 0,
                            height: Number(contents && contents.height) || 0,
                            sameAsEntry: !!(contents && textEntry.contentsBitmap === contents),
                            revisionAtEntry: Number.isFinite(Number(textEntry.contentsRevision)) ? Number(textEntry.contentsRevision) : null,
                            revisionAtRedraw: windowData.contentsRevision || 0,
                        },
                    };
                    const redrawDetails = {
                        windowType: targetWindow.constructor.name,
                        method: textEntry.type || '',
                        clearArea,
                        backgroundSnapshot: usedBackgroundSnapshot,
                        replayBefore: usedBackgroundSnapshot ? 0 : replayBefore.length,
                        replayAfter: replayAfter.length,
                        translationDrawn: translatedText,
                        diagnostics: redrawDiagnostics,
                    };
                    telemetry.logDraw('redraw', translatedText, x, y, redrawDetails);
                    trackWindowDraw(textEntry, 'redraw', redrawDetails);
                    const drawAndReplayAfter = () => {
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
                        if (replayApi && replayAfter.length) {
                            replayMixedItems(contents, targetWindow, replayAfter, replayApi, replayClipRect);
                        }
                    };
                    if (replayApi) {
                        replayApi.withBitmapReplay(contents, drawAndReplayAfter);
                    } else {
                        drawAndReplayAfter();
                    }
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

                if (contents && contents._trWindowDrawTextExReplayDepth > 0) {
                    telemetry.logDraw('bypass', textStr, x, y, {
                        windowType: this.constructor.name,
                        method: 'drawTextEx-nested',
                    });
                    return invokeOriginal();
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
                    if (trimmed) {
                        recordNativeWindowText(
                            this,
                            windowData,
                            textStr,
                            x,
                            y,
                            'drawText',
                            null,
                            { maxWidth, align },
                            looksLikeCounter ? 'counterLike' : 'cacheSkip'
                        );
                    }
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
                            return withWindowDrawTextExReplayScope(contents, () => originalDrawTextEx.call(this, value, x, y));
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
                    if (convertedTrimmed) {
                        recordNativeWindowText(
                            this,
                            windowData,
                            textStr,
                            x,
                            y,
                            'drawTextEx',
                            convertedText,
                            { maxWidth: Infinity, align: 'left' },
                            'cacheSkip'
                        );
                    }
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
