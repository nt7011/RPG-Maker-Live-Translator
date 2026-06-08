// Bitmap text adapter support: frame markers.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/frame-markers.js.');
    }

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const { flushQueuedBitmaps } = scope.controllerFacades.aggregation;

        function installFrameFlushHooks() {
            let installed = false;
            try {
                if (typeof SceneManager !== 'undefined' && SceneManager) {
                    installed = installFrameFlushHook(SceneManager, 'updateScene', 'SceneManager.updateScene', false) || installed;
                    installed = installFrameFlushHook(SceneManager, 'renderScene', 'SceneManager.renderScene', true) || installed;
                }
            } catch (_) {}
            try {
                if (typeof Graphics !== 'undefined' && Graphics) {
                    installed = installFrameFlushHook(Graphics, 'render', 'Graphics.render', true) || installed;
                }
            } catch (_) {}
            return installed;
        }

        function hasActiveFrameFlushHooks() {
            try {
                if (typeof SceneManager !== 'undefined' && SceneManager) {
                    if (hasHookInChain(SceneManager.updateScene, '__trBitmapTextFrameFlush', FRAME_FLUSH_TOKEN)) return true;
                    if (hasHookInChain(SceneManager.renderScene, '__trBitmapTextFrameFlush', FRAME_FLUSH_TOKEN)) return true;
                }
            } catch (_) {}
            try {
                if (typeof Graphics !== 'undefined' && Graphics) {
                    if (hasHookInChain(Graphics.render, '__trBitmapTextFrameFlush', FRAME_FLUSH_TOKEN)) return true;
                }
            } catch (_) {}
            return false;
        }

        function ensureActiveFrameFlushHooks() {
            if (hasActiveFrameFlushHooks()) return true;
            const installed = installFrameFlushHooks();
            if (installed) scope.frameFlushInstalled = true;
            return hasActiveFrameFlushHooks();
        }
        
        function installFrameFlushHook(target, methodName, label, flushBefore) {
            if (!target || typeof target[methodName] !== 'function') return false;
            if (hasHookInChain(target[methodName], '__trBitmapTextFrameFlush', FRAME_FLUSH_TOKEN)) return true;
            const original = target[methodName];
            const wrapped = function(...args) {
                if (flushBefore) flushQueuedBitmaps(label);
                const result = original.apply(this, args);
                if (!flushBefore) flushQueuedBitmaps(label);
                return result;
            };
            wrapped.__trOriginal = original;
            wrapped.__trBitmapTextFrameFlush = FRAME_FLUSH_TOKEN;
            target[methodName] = wrapped;
            return true;
        }
        
        function hasHookInChain(fn, property, token) {
            const seen = [];
            let current = typeof fn === 'function' ? fn : null;
            while (current && seen.indexOf(current) < 0) {
                if (current[property] === token) return true;
                seen.push(current);
                current = typeof current.__trOriginal === 'function' ? current.__trOriginal : null;
            }
            return false;
        }
        
        function installSmallTextMarkers() {
            installSmallTextMarker(Bitmap.prototype, 'drawSmallText');
            installSmallTextMarker(Bitmap, 'drawSmallText');
        }
        
        function installSmallTextMarker(target, methodName) {
            if (!target || typeof target[methodName] !== 'function') return false;
            const current = target[methodName];
            if (hasHookInChain(current, '__trBitmapTextSmallText', SMALL_TEXT_TOKEN)) return true;
            const original = current;
            const wrapped = function(...args) {
                scope.smallTextDepth += 1;
                try { return original.apply(this, args); }
                finally { scope.smallTextDepth = Math.max(0, scope.smallTextDepth - 1); }
            };
            wrapped.__trBitmapTextSmallText = SMALL_TEXT_TOKEN;
            wrapped.__trOriginal = original;
            target[methodName] = wrapped;
            return true;
        }
        
        function installNormalCharacterMarker() {
            try {
                if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) return false;
                const current = Window_Base.prototype.processNormalCharacter;
                if (typeof current !== 'function' || hasHookInChain(current, '__trBitmapTextNormalChar', NORMAL_CHAR_TOKEN)) return true;
                const original = current;
                const wrapped = function(...args) {
                const contents = this && this.contents ? this.contents : null;
                const previousRunId = contents ? contents._trNormalCharRunId : undefined;
                const previousRunInfo = contents ? contents._trNormalCharRunInfo : undefined;
                const runId = getNormalCharacterRunId(args && args[0]);
                const runInfo = getNormalCharacterRunInfo(this, args && args[0], runId);
                scope.normalCharacterDepth += 1;
                if (contents) {
                    contents._trNormalCharDepth = (contents._trNormalCharDepth || 0) + 1;
                    if (runId) contents._trNormalCharRunId = runId;
                    if (runInfo) contents._trNormalCharRunInfo = runInfo;
                }
                try { return original.apply(this, args); }
                finally {
                        scope.normalCharacterDepth = Math.max(0, scope.normalCharacterDepth - 1);
                        if (contents) {
                            contents._trNormalCharDepth = Math.max(0, (contents._trNormalCharDepth || 1) - 1);
                            if (previousRunId === undefined) {
                                try { delete contents._trNormalCharRunId; } catch (_) { contents._trNormalCharRunId = ''; }
                            } else {
                                contents._trNormalCharRunId = previousRunId;
                            }
                            if (previousRunInfo === undefined) {
                                try { delete contents._trNormalCharRunInfo; } catch (_) { contents._trNormalCharRunInfo = null; }
                            } else {
                                contents._trNormalCharRunInfo = previousRunInfo;
                            }
                        }
                    }
                };
                wrapped.__trBitmapTextNormalChar = NORMAL_CHAR_TOKEN;
                wrapped.__trOriginal = original;
                Window_Base.prototype.processNormalCharacter = wrapped;
                return true;
            } catch (_) {
                return false;
            }
        }

        function getNormalCharacterRunId(textState) {
            if (!textState || typeof textState !== 'object') return '';
            try {
                // RPG Maker keeps one textState object for a drawTextEx pass, so it
                // is the stable boundary for glyph draws emitted by processNormalCharacter.
                if (!textState._trBitmapTextNormalCharRunId) {
                    scope.nextNormalCharacterRunId = (Number(scope.nextNormalCharacterRunId) || 0) + 1;
                    textState._trBitmapTextNormalCharRunId = `normalChar:${scope.nextNormalCharacterRunId.toString(36)}`;
                }
                return String(textState._trBitmapTextNormalCharRunId || '');
            } catch (_) {
                return '';
            }
        }

        function getNormalCharacterRunInfo(windowInstance, textState, runId) {
            if (!runId || !textState || typeof textState !== 'object') return null;
            try {
                const existing = textState._trBitmapTextNormalCharRunInfo;
                if (existing && existing.runId === runId) return existing;
                const rawText = String(textState.text ?? '');
                const rawIndex = Number(textState.index);
                const index = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.floor(rawIndex) : 0;
                const lineHeight = readPositiveNumber(
                    textState.height,
                    windowInstance && typeof windowInstance.lineHeight === 'function' ? windowInstance.lineHeight() : 0
                );
                const info = {
                    runId,
                    text: rawText.slice(index) || rawText,
                    x: readFiniteNumber(textState.x, 0),
                    y: readFiniteNumber(textState.y, 0),
                    lineHeight,
                    align: 'left',
                };
                textState._trBitmapTextNormalCharRunInfo = info;
                return info;
            } catch (_) {
                return null;
            }
        }

        function readFiniteNumber(value, fallback) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
        }

        function readPositiveNumber(...values) {
            for (const value of values) {
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 0) return numeric;
            }
            return 24;
        }
        
        function isSmallTextDrawActive(bitmap) {
            return scope.smallTextDepth > 0 || !!(bitmap && bitmap._trSmallTextDepth > 0);
        }

        function isNormalCharacterDrawActive(bitmap) {
            return scope.normalCharacterDepth > 0 || !!(bitmap && bitmap._trNormalCharDepth > 0);
        }
        
        function isSmallTextScratchBitmap(bitmap) {
            try {
                return !!(bitmap && typeof Bitmap !== 'undefined' && Bitmap.drawSmallTextBitmap && bitmap === Bitmap.drawSmallTextBitmap);
            } catch (_) {
                return false;
            }
        }

        return { installFrameFlushHooks, hasActiveFrameFlushHooks, ensureActiveFrameFlushHooks, installFrameFlushHook, hasHookInChain, installSmallTextMarkers, installSmallTextMarker, installNormalCharacterMarker, isSmallTextDrawActive, isNormalCharacterDrawActive, isSmallTextScratchBitmap };
    }

    defineRuntimeModule('adapters.bitmapTextFrameMarkers', { create: createController });
})();
