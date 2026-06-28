// Bitmap text adapter support: frame markers.
// Each controller receives one adapter instance scope from bitmap-text.js.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.frameMarkers',
        requires: {
            hookWrapper: 'runtime.hookWrapper',
        },
        factory({ hookWrapper }) {
    const { hasHookInChain } = hookWrapper;

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, GAP_MIN, GAP_RATIO } = scope;
        const normalCharacterRunsByTextState = new WeakMap();

        function flushPendingDrawUnits(reason = 'frame', targetBitmap = null, options = undefined) {
            if (!scope.bitmapServices || typeof scope.bitmapServices.flushPendingDrawUnits !== 'function') return 0;
            return scope.bitmapServices.flushPendingDrawUnits(reason, targetBitmap, options) || 0;
        }

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

        function ensureRecordedDrawDelivery(bitmap = null, unit = null) {
            const bitmapHooksActive = ensureActiveFrameFlushHooks();
            const spriteDelivery = ensurePeerFrameFlushProvider('sprite', 'bitmap.drawText.fallback');
            const spriteHooksActive = !!(spriteDelivery && spriteDelivery.handled === true && spriteDelivery.active === true);
            if (!bitmapHooksActive && !spriteHooksActive && shouldDrainCommittedDrawWithoutFrame(bitmap, unit)) {
                return flushOwnerDrawUnits('bitmap.drawText.commit', bitmap) > 0;
            }
            if (!spriteDelivery || spriteDelivery.handled !== true) return bitmapHooksActive;
            return bitmapHooksActive && spriteHooksActive;
        }

        function flushOwnerDrawUnits(reason = 'owner-claim', targetBitmap = null) {
            if (!scope.bitmapServices || typeof scope.bitmapServices.flushOwnerDrawUnits !== 'function') return 0;
            return scope.bitmapServices.flushOwnerDrawUnits(reason, targetBitmap) || 0;
        }

        function shouldDrainCommittedDrawWithoutFrame(bitmap, unit) {
            if (!bitmap || !unit || typeof unit !== 'object') return false;
            if (isSpriteClassifiedSurface(bitmap)) return false;
            if (unit.normalCharacter === true) return false;
            const context = unit.drawRunContext || getActiveDrawRunContext(bitmap);
            if (context && context.runId) return false;
            return countTextUnits(unit.text) > 1;
        }

        function isSpriteClassifiedSurface(bitmap) {
            if (!scope.bitmapServices || typeof scope.bitmapServices.describeSurface !== 'function') return false;
            let description = null;
            try {
                description = scope.bitmapServices.describeSurface(bitmap, {
                    adapterId: 'sprite',
                    source: ADAPTER_ID,
                });
            } catch (_) {
                description = null;
            }
            const kind = description && typeof description === 'object'
                ? String(description.kind || '')
                : '';
            return kind === 'sprite-owned'
                || kind === 'sprite-text-interest'
                || kind === 'sprite-observed'
                || description && description.owned === true;
        }

        function getActiveDrawRunContext(bitmap) {
            if (!scope.bitmapServices || typeof scope.bitmapServices.getActiveDrawRunContext !== 'function') return null;
            try { return scope.bitmapServices.getActiveDrawRunContext(bitmap) || null; } catch (_) { return null; }
        }

        function countTextUnits(text) {
            try { return Array.from(String(text ?? '')).length; } catch (_) { return 0; }
        }

        function ensurePeerFrameFlushProvider(adapterId, reason) {
            if (!scope.bitmapServices || typeof scope.bitmapServices.ensureFrameFlushProvider !== 'function') {
                return { handled: false, active: false, scheduled: false, status: 'unavailable' };
            }
            return scope.bitmapServices.ensureFrameFlushProvider(adapterId, {
                reason: reason || 'bitmap.drawText.fallback',
                source: ADAPTER_ID,
            });
        }
        
        function installFrameFlushHook(target, methodName, label, flushBefore) {
            return hookWrapper.installMethodWrapper(target, methodName, {
                property: '__trBitmapTextFrameFlush',
                token: FRAME_FLUSH_TOKEN,
                createWrapper(original) {
                    return function(...args) {
                        if (flushBefore) flushPendingDrawUnits(label, null, {
                            phase: 'frame-boundary',
                            source: label,
                        });
                        const result = original.apply(this, args);
                        if (!flushBefore) flushPendingDrawUnits(label, null, {
                            phase: 'frame-boundary',
                            source: label,
                        });
                        return result;
                    };
                },
            });
        }
        
        function installSmallTextMarkers() {
            installSmallTextMarker(Bitmap.prototype, 'drawSmallText');
            installSmallTextMarker(Bitmap, 'drawSmallText');
        }
        
        function installSmallTextMarker(target, methodName) {
            return hookWrapper.installMethodWrapper(target, methodName, {
                property: '__trBitmapTextSmallText',
                token: SMALL_TEXT_TOKEN,
                createWrapper(original) {
                    return function(...args) {
                        scope.smallTextDepth += 1;
                        try { return original.apply(this, args); }
                        finally { scope.smallTextDepth = Math.max(0, scope.smallTextDepth - 1); }
                    };
                },
            });
        }
        
        function installNormalCharacterMarker() {
            try {
                if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) return false;
                const current = Window_Base.prototype.processNormalCharacter;
                if (typeof current !== 'function' || hasHookInChain(current, '__trBitmapTextNormalChar', NORMAL_CHAR_TOKEN)) return true;
                return hookWrapper.installMethodWrapper(Window_Base.prototype, 'processNormalCharacter', {
                    property: '__trBitmapTextNormalChar',
                    token: NORMAL_CHAR_TOKEN,
                    createWrapper(original) {
                        return function(...args) {
                            const contents = this && this.contents ? this.contents : null;
                            const runId = getNormalCharacterRunId(args && args[0]);
                            const runInfo = getNormalCharacterRunInfo(this, args && args[0], runId);
                            const leaveRunContext = contents && scope.bitmapServices && typeof scope.bitmapServices.enterDrawRunContext === 'function'
                                ? scope.bitmapServices.enterDrawRunContext(contents, {
                                    type: 'normalCharacter',
                                    runId,
                                    runInfo,
                                })
                                : null;
                            scope.normalCharacterDepth += 1;
                            try { return original.apply(this, args); }
                            finally {
                                scope.normalCharacterDepth = Math.max(0, scope.normalCharacterDepth - 1);
                                if (typeof leaveRunContext === 'function') leaveRunContext();
                            }
                        };
                    },
                });
            } catch (_) {
                return false;
            }
        }

        function getNormalCharacterRunState(textState) {
            if (!textState || typeof textState !== 'object') return null;
            try {
                let state = normalCharacterRunsByTextState.get(textState);
                if (!state) {
                    state = {
                        runId: '',
                        runInfo: null,
                    };
                    normalCharacterRunsByTextState.set(textState, state);
                }
                return state;
            } catch (_) {
                return null;
            }
        }

        function getNormalCharacterRunId(textState) {
            const state = getNormalCharacterRunState(textState);
            if (!state) return '';
            try {
                // RPG Maker keeps one textState object for a drawTextEx pass, so it
                // is the stable boundary for glyph draws emitted by processNormalCharacter.
                if (!state.runId) {
                    scope.nextNormalCharacterRunId = (Number(scope.nextNormalCharacterRunId) || 0) + 1;
                    state.runId = `normalChar:${scope.nextNormalCharacterRunId.toString(36)}`;
                }
                return String(state.runId || '');
            } catch (_) {
                return '';
            }
        }

        function getNormalCharacterRunInfo(windowInstance, textState, runId) {
            const state = getNormalCharacterRunState(textState);
            if (!runId || !state) return null;
            try {
                const existing = state.runInfo;
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
                state.runInfo = info;
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
            return scope.smallTextDepth > 0;
        }

        function isNormalCharacterDrawActive(bitmap) {
            if (scope.normalCharacterDepth > 0) return true;
            const context = scope.bitmapServices && typeof scope.bitmapServices.getActiveDrawRunContext === 'function'
                ? scope.bitmapServices.getActiveDrawRunContext(bitmap)
                : null;
            return !!(context && context.type === 'normalCharacter');
        }
        
        function isSmallTextScratchBitmap(bitmap) {
            try {
                return !!(bitmap && typeof Bitmap !== 'undefined' && Bitmap.drawSmallTextBitmap && bitmap === Bitmap.drawSmallTextBitmap);
            } catch (_) {
                return false;
            }
        }

        return { installFrameFlushHooks, hasActiveFrameFlushHooks, ensureActiveFrameFlushHooks, ensureRecordedDrawDelivery, installFrameFlushHook, hasHookInChain, installSmallTextMarkers, installSmallTextMarker, installNormalCharacterMarker, isSmallTextDrawActive, isNormalCharacterDrawActive, isSmallTextScratchBitmap };
    }

            return { create: createController };
        },
    });
})();
