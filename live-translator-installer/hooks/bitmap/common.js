// Bitmap hook common module.
//
// This module creates the shared runtime object used by every bitmap hook
// submodule. It does not install the draw hook by itself. Instead, it gathers
// the dependencies passed by runtime/install-hooks.js, defines shared constants
// and WeakMap-backed state containers, and exposes small utilities for text
// sanitation, diagnostics, geometry, and RPG Maker marker wrappers.
//
// The bitmap hook is split into modules, but those modules still cooperate on a
// single per-install runtime object. Anything attached here should be generic:
// no game-specific behavior, no direct translation requests, and no direct
// Bitmap.prototype mutation beyond helper functions that later modules call.
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
    if (!globalScope.LiveTranslatorModules.hooks.bitmap) {
        globalScope.LiveTranslatorModules.hooks.bitmap = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/bitmap/common.js.');
    }

    function createBitmapHookRuntime(context = {}) {
        // Bitmap hooks are optional in some RPG Maker boot phases. A no-op
        // profiler keeps helper code callable even when perf was not provided.
        const fallbackPerf = {
            count() {},
            top() {},
            time() {},
            isEnabled() { return false; },
            now() { return Date.now(); },
        };

        const {
            logger,
            dbg = () => {},
            diag = () => {},
            preview = (text) => String(text ?? ''),
            stripRpgmEscapes,
            prepareTextForTranslation,
            restoreControlCodes,
            telemetry,
            textTracker = null,
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

        // Tokens are plain stable strings because hooks can be installed more
        // than once during reloads. Symbol() would break idempotency.
        const DRAW_WRAPPER_TOKEN = 'liveTranslator.bitmapDrawWrapper';
        const SMALL_TEXT_WRAPPER_TOKEN = 'liveTranslator.bitmapSmallTextWrapper';
        const NORMAL_CHAR_WRAPPER_TOKEN = 'liveTranslator.bitmapNormalCharWrapper';

        // Per-install state containers. WeakMaps let Bitmaps be garbage
        // collected once RPG Maker drops them.
        const bitmapStates = new WeakMap();
        const FLUSH_DELAY_MS = 0;
        const GAP_MIN = 6;
        const GAP_RATIO = 0.65;
        const perCharRegex = PER_CHAR_MARK ? new RegExp(PER_CHAR_MARK, 'g') : null;
        const VALID_CANVAS_TEXT_ALIGN = new Set(['left', 'right', 'center', 'start', 'end']);
        const hotDiagnosticLast = new Map();
        const HOT_DIAGNOSTIC_LIMIT = 500;
        let smallTextGlobalDepth = 0;
        let normalCharGlobalDepth = 0;

        // The runtime object is the shared dependency surface between modules.
        // Later modules attach their own functions onto this object.
        const runtime = {
            logger,
            dbg,
            diag,
            preview,
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
            REDRAW_SIGNATURE,
            perf: perf || fallbackPerf,
            logEscape,
        };

        const normalizeCanvasTextAlign = (align) => {
            const value = String(align || '').toLowerCase();
            return VALID_CANVAS_TEXT_ALIGN.has(value) ? value : 'left';
        };

        const isSmallTextScratchBitmap = (bitmap) => {
            try {
                return !!(bitmap
                    && typeof Bitmap !== 'undefined'
                    && Bitmap
                    && Bitmap.drawSmallTextBitmap
                    && bitmap === Bitmap.drawSmallTextBitmap);
            } catch (_) {
                return false;
            }
        };

        const hasDedicatedOwnerHook = (owner) => {
            if (!owner) return false;
            if (owner._trHasDedicatedTextHook) return true;
            const ctor = owner.constructor;
            return !!(ctor && ctor._trHasDedicatedTextHook);
        };

        const sanitizePerChar = (text) => {
            if (!text) return '';
            return perCharRegex ? String(text).replace(perCharRegex, '') : String(text);
        };

        // Every translatable bitmap entry gets an instance id so async
        // translation responses cannot redraw stale text after the bitmap
        // content has changed.
        const nextInstanceId = (() => {
            let counter = 0;
            return () => `bm-${Date.now().toString(36)}-${(++counter).toString(36)}`;
        })();

        const shouldTraceBitmapDiagnostics = () => !!(logger && typeof logger.shouldLog === 'function' && logger.shouldLog('trace'));
        const shouldCaptureBitmapCallSites = () => !!(
            shouldTraceBitmapDiagnostics()
            && settings
            && settings.debug
            && settings.debug.bitmapCallSites === true
        );

        const getHotDiagnosticIntervalMs = () => {
            const raw = settings && settings.debug ? Number(settings.debug.diagnosticRepeatMs) : NaN;
            return Number.isFinite(raw) && raw >= 0 ? raw : 1000;
        };

        // Hot diagnostics guard very chatty paths such as drawText, clearRect,
        // and sprite child observation. The key should include enough context
        // to suppress repeated identical events without hiding distinct ones.
        const shouldLogHotDiagnostic = (key, intervalMs = getHotDiagnosticIntervalMs()) => {
            if (!shouldTraceBitmapDiagnostics()) return false;
            if (!key || intervalMs <= 0) return true;
            const now = Date.now();
            const last = hotDiagnosticLast.get(key);
            if (Number.isFinite(last) && now - last < intervalMs) {
                return false;
            }
            hotDiagnosticLast.set(key, now);
            if (hotDiagnosticLast.size > HOT_DIAGNOSTIC_LIMIT) {
                const cutoff = now - Math.max(1000, intervalMs * 5);
                for (const [storedKey, storedAt] of hotDiagnosticLast) {
                    if (storedAt < cutoff || hotDiagnosticLast.size > HOT_DIAGNOSTIC_LIMIT) {
                        hotDiagnosticLast.delete(storedKey);
                    }
                    if (hotDiagnosticLast.size <= HOT_DIAGNOSTIC_LIMIT) break;
                }
            }
            return true;
        };

        const diagHot = (key, messageFactory, intervalMs) => {
            if (!shouldLogHotDiagnostic(key, intervalMs)) return;
            try {
                diag(typeof messageFactory === 'function' ? messageFactory() : messageFactory);
            } catch (_) {}
        };

        // Used only in trace mode. It strips hook-internal frames so diagnostics
        // point at the game/plugin code that caused a bitmap draw or clear.
        const captureBitmapCallSite = (force = false) => {
            if (!force && !shouldTraceBitmapDiagnostics()) return '';
            try {
                const stack = new Error().stack;
                if (!stack) return '';
                const lines = String(stack)
                    .split('\n')
                    .slice(2)
                    .map((line) => String(line || '').trim())
                    .filter(Boolean);
                const relevant = [];
                for (const line of lines) {
                    if (/captureBitmapCallSite/.test(line)) continue;
                    if (/hooks[\\/](?:bitmap-draw-text-hook\.js|bitmap[\\/][^\\/]+\.js)/.test(line)) continue;
                    if (/logger\.js/.test(line)) continue;
                    relevant.push(line.replace(/^at\s+/, ''));
                    if (relevant.length >= 2) break;
                }
                return relevant.join(' <- ');
            } catch (_) {
                return '';
            }
        };

        // Small-text and normal-character markers are bypass signals. They let
        // the bitmap hook avoid capturing temporary scratch bitmaps and the
        // per-character path already handled by higher-level window hooks.
        const isSmallTextDrawActive = (bitmap) => {
            try {
                return !!((bitmap && bitmap._trSmallTextDepth > 0) || smallTextGlobalDepth > 0);
            } catch (_) {
                return smallTextGlobalDepth > 0;
            }
        };

        const isNormalCharacterDrawActive = (bitmap) => {
            try {
                return !!((bitmap && bitmap._trNormalCharDepth > 0) || normalCharGlobalDepth > 0);
            } catch (_) {
                return normalCharGlobalDepth > 0;
            }
        };

        const installSmallTextMarker = (target, methodName) => {
            try {
                if (!target || typeof target[methodName] !== 'function') return false;
                const current = target[methodName];
                if (current.__trSmallTextWrapper === SMALL_TEXT_WRAPPER_TOKEN) return true;
                const original = current;
                const wrapped = function(...args) {
                    const targetBitmap = this && typeof Bitmap !== 'undefined' && this instanceof Bitmap
                        ? this
                        : (args && args[0] && typeof Bitmap !== 'undefined' && args[0] instanceof Bitmap ? args[0] : null);
                    if (targetBitmap) {
                        targetBitmap._trSmallTextDepth = (targetBitmap._trSmallTextDepth || 0) + 1;
                    } else {
                        smallTextGlobalDepth++;
                    }
                    try {
                        return original.apply(this, args);
                    } finally {
                        if (targetBitmap) {
                            targetBitmap._trSmallTextDepth = Math.max(0, (targetBitmap._trSmallTextDepth || 1) - 1);
                        } else {
                            smallTextGlobalDepth = Math.max(0, smallTextGlobalDepth - 1);
                        }
                    }
                };
                wrapped.__trSmallTextWrapper = SMALL_TEXT_WRAPPER_TOKEN;
                wrapped.__trOriginal = original;
                target[methodName] = wrapped;
                return true;
            } catch (_) {
                return false;
            }
        };

        const installNormalCharacterMarker = () => {
            try {
                if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) return false;
                const methodName = 'processNormalCharacter';
                const current = Window_Base.prototype[methodName];
                if (typeof current !== 'function') return false;
                if (current.__trNormalCharWrapper === NORMAL_CHAR_WRAPPER_TOKEN) return true;
                const original = current;
                const wrapped = function(...args) {
                    const bitmap = this && this.contents ? this.contents : null;
                    if (bitmap) {
                        bitmap._trNormalCharDepth = (bitmap._trNormalCharDepth || 0) + 1;
                    } else {
                        normalCharGlobalDepth++;
                    }
                    try {
                        return original.apply(this, args);
                    } finally {
                        if (bitmap) {
                            bitmap._trNormalCharDepth = Math.max(0, (bitmap._trNormalCharDepth || 1) - 1);
                        } else {
                            normalCharGlobalDepth = Math.max(0, normalCharGlobalDepth - 1);
                        }
                    }
                };
                wrapped.__trNormalCharWrapper = NORMAL_CHAR_WRAPPER_TOKEN;
                wrapped.__trOriginal = original;
                Window_Base.prototype[methodName] = wrapped;
                return true;
            } catch (_) {
                return false;
            }
        };

        // Rectangles are represented as x1/y1/x2/y2 so overlap checks remain
        // stable even when RPG Maker receives negative width/height arguments.
        const rectFromDimensions = (x, y, width, height) => {
            const xNum = Number(x);
            const yNum = Number(y);
            const wNum = Number(width);
            const hNum = Number(height);
            const x1 = Number.isFinite(xNum) ? xNum : 0;
            const y1 = Number.isFinite(yNum) ? yNum : 0;
            const w = Number.isFinite(wNum) ? wNum : 0;
            const h = Number.isFinite(hNum) ? hNum : 0;
            const x2 = x1 + w;
            const y2 = y1 + h;
            return {
                x1: Math.min(x1, x2),
                y1: Math.min(y1, y2),
                x2: Math.max(x1, x2),
                y2: Math.max(y1, y2),
            };
        };

        const isValidRect = (rect) => rect
            && Number.isFinite(rect.x1)
            && Number.isFinite(rect.x2)
            && Number.isFinite(rect.y1)
            && Number.isFinite(rect.y2)
            && rect.x2 >= rect.x1
            && rect.y2 >= rect.y1;

        const rectHasArea = (rect) => isValidRect(rect) && rect.x2 > rect.x1 && rect.y2 > rect.y1;

        const formatRect = (rect) => {
            if (!rect || !isValidRect(rect)) return 'n/a';
            const width = Math.max(0, rect.x2 - rect.x1);
            const height = Math.max(0, rect.y2 - rect.y1);
            return `(${Math.round(rect.x1)},${Math.round(rect.y1)}) ${Math.round(width)}x${Math.round(height)}`;
        };

        const rectanglesOverlap = (a, b) => {
            if (!isValidRect(a) || !isValidRect(b)) return true;
            return !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
        };

        const rectanglesSimilar = (a, b, tolerance = 8) => {
            if (!isValidRect(a) || !isValidRect(b)) return false;
            return (
                Math.abs(a.x1 - b.x1) <= tolerance
                && Math.abs(a.x2 - b.x2) <= tolerance
                && Math.abs(a.y1 - b.y1) <= tolerance
                && Math.abs(a.y2 - b.y2) <= tolerance
            );
        };

        const deriveEntryRect = (entry) => {
            if (!entry) return null;
            if (entry.bounds && isValidRect(entry.bounds)) return entry.bounds;
            const width = Number.isFinite(entry.drawParams && entry.drawParams.maxWidth)
                ? entry.drawParams.maxWidth
                : Math.max(1, entry.visibleText ? entry.visibleText.length * 12 : 0);
            const height = Number.isFinite(entry.drawParams && entry.drawParams.lineHeight)
                ? entry.drawParams.lineHeight
                : 24;
            const x = entry.drawParams ? entry.drawParams.x : (entry.position ? entry.position.x : 0);
            const y = entry.drawParams ? entry.drawParams.y : (entry.position ? entry.position.y : 0);
            return rectFromDimensions(x, y, width, height);
        };

        const describeEntry = (entry) => {
            if (!entry) return 'entry=n/a';
            const parts = [
                `key=${entry.key || 'n/a'}`,
                `uuid=${entry.instanceId || 'unknown'}`,
                `order=${entry.drawOrder || 0}`,
                `status=${entry.translationStatus || 'unknown'}`,
                `rect=${formatRect(deriveEntryRect(entry))}`,
            ];
            if (entry.isTranslatable === false) parts.push('skip');
            if (entry._trStale) parts.push('stale');
            return parts.join(' ');
        };

        const fragmentRect = (fragment) => {
            if (!fragment) return null;
            const lineHeight = Number.isFinite(fragment.lineHeight) && fragment.lineHeight > 0
                ? fragment.lineHeight
                : (fragment.drawState && Number.isFinite(fragment.drawState.fontSize)
                    ? fragment.drawState.fontSize
                    : 24);
            const w = Number.isFinite(fragment.width) && fragment.width > 0
                ? fragment.width
                : (Number.isFinite(fragment.maxWidth) ? fragment.maxWidth : lineHeight);
            return rectFromDimensions(
                fragment.x,
                fragment.y,
                Math.max(1, w),
                Math.max(1, lineHeight)
            );
        };

        // Counter-like values are intentionally skipped. Translating isolated
        // numbers, short number+CJK counters, and punctuation-only labels tends
        // to damage UI layout more often than it helps.
        const skipLikeCounter = (text) => {
            const trimmed = String(text || '').trim();
            if (!trimmed) return true;
            const nonSpace = trimmed.replace(/\s+/g, '');
            const cjkMatch = trimmed.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g);
            const cjkCount = cjkMatch ? cjkMatch.length : 0;
            const hasDigit = /\d/.test(trimmed);
            const onlyNumPunct = /^[0-9()\[\]\-+/*.,:;!?ï¼…%]+$/u.test(nonSpace);
            const comboMatch = /\d+\s*[\u3040-\u30FF\u4E00-\u9FFF]\s*\(\d+\)/u.test(trimmed);
            return (hasDigit && cjkCount <= 1 && nonSpace.length <= 10) || onlyNumPunct || comboMatch;
        };

        const textUnitCount = (text) => {
            try {
                return Array.from(String(text || '')).length;
            } catch (_) {
                return String(text || '').length;
            }
        };

        const firstPositiveNumber = (...values) => {
            for (const value of values) {
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 0) return numeric;
            }
            return 0;
        };

        const fragmentVisibleText = (fragment) => sanitizePerChar(stripRpgmEscapes(
            fragment && (fragment.visibleText || fragment.rawText) ? (fragment.visibleText || fragment.rawText) : ''
        )).trim();

        const getBitmapFallbackMode = () => {
            const fallbackSettings = settings && settings.bitmapFallback && typeof settings.bitmapFallback === 'object'
                ? settings.bitmapFallback
                : null;
            const rawMode = fallbackSettings && fallbackSettings.mode !== undefined
                ? String(fallbackSettings.mode).trim().toLowerCase()
                : 'redraw';
            if (rawMode === 'off' || rawMode === 'disabled' || rawMode === 'none') return 'off';
            if (rawMode === 'detect' || rawMode === 'detection' || rawMode === 'observe') return 'detect';
            return 'redraw';
        };

        const isBitmapFallbackCaptureEnabled = () => getBitmapFallbackMode() !== 'off';
        const isBitmapFallbackRedrawEnabled = () => getBitmapFallbackMode() === 'redraw';

        Object.assign(runtime, {
            DRAW_WRAPPER_TOKEN,
            SMALL_TEXT_WRAPPER_TOKEN,
            NORMAL_CHAR_WRAPPER_TOKEN,
            bitmapStates,
            FLUSH_DELAY_MS,
            GAP_MIN,
            GAP_RATIO,
            perCharRegex,
            VALID_CANVAS_TEXT_ALIGN,
            hotDiagnosticLast,
            HOT_DIAGNOSTIC_LIMIT,
            normalizeCanvasTextAlign,
            isSmallTextScratchBitmap,
            hasDedicatedOwnerHook,
            sanitizePerChar,
            nextInstanceId,
            shouldTraceBitmapDiagnostics,
            shouldCaptureBitmapCallSites,
            getHotDiagnosticIntervalMs,
            shouldLogHotDiagnostic,
            diagHot,
            captureBitmapCallSite,
            isSmallTextDrawActive,
            isNormalCharacterDrawActive,
            installSmallTextMarker,
            installNormalCharacterMarker,
            rectFromDimensions,
            isValidRect,
            rectHasArea,
            formatRect,
            rectanglesOverlap,
            rectanglesSimilar,
            deriveEntryRect,
            describeEntry,
            fragmentRect,
            skipLikeCounter,
            textUnitCount,
            firstPositiveNumber,
            fragmentVisibleText,
            getBitmapFallbackMode,
            isBitmapFallbackCaptureEnabled,
            isBitmapFallbackRedrawEnabled,
        });

        return runtime;
    }

    defineRuntimeModule('hooks.bitmap.common', {
        createRuntime: createBitmapHookRuntime,
    });
})();
