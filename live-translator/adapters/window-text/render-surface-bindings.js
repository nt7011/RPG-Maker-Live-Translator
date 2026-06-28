// Window text adapter support: render surface bindings.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.renderSurfaceBindings',
        factory() {

    function createRenderSurfaceBindingsController(context = {}) {
        const {
            applyBitmapDrawState,
            withWindowContents,
            enterWindowPipelineGuard,
            isBitmapSurfaceTextEntry,
        } = context;

        function prepareWindowEntryDrawState(bitmap, entry) {
            // Restore/replay steps can change Bitmap font settings. The
            // executor calls this immediately before the target draw so the
            // final drawText uses the entry's own captured state.
            const state = entry && entry.drawState && typeof entry.drawState === 'object'
                ? entry.drawState
                : null;
            const result = {
                applied: false,
                source: 'entry.drawState',
                reason: '',
                fontSize: state && state.fontSize,
                outlineWidth: state && state.outlineWidth,
            };
            if (!bitmap) {
                result.reason = 'missing-bitmap';
                return result;
            }
            if (!state) {
                result.reason = 'missing-draw-state';
                return result;
            }
            if (typeof applyBitmapDrawState !== 'function') {
                result.reason = 'draw-state-service-missing';
                return result;
            }
            try {
                result.applied = applyBitmapDrawState(bitmap, state) !== false;
                result.reason = result.applied ? 'applied' : 'apply-rejected';
            } catch (_) {
                result.applied = false;
                result.reason = 'apply-error';
            }
            return result;
        }

        function executeWindowRenderPlanWithStableSurface(bitmapRenderExecutor, plan, options = {}) {
            const entry = options.entry || plan && plan.entry || null;
            const targetWindow = options.targetWindow || entry && entry.ownerWindow || null;
            const windowData = options.windowData || entry && entry.windowData || null;
            return callRequired(
                bitmapRenderExecutor && bitmapRenderExecutor.executeWindowRenderPlanWithStableSurface,
                'bitmapRenderExecutor.executeWindowRenderPlanWithStableSurface'
            )(plan, Object.assign({}, options, {
                stableSurfaceRequested: shouldUseStableWindowRenderSurface(plan, options),
                stableSurfaceDirtySource: 'window-text-render',
                stableSurfaceDirtyReason: 'window-render-stable-surface',
                withStableSurface(stagedBitmap, callback) {
                    return withWindowRenderStableSurfaceBindings(targetWindow, windowData, entry, stagedBitmap, callback);
                },
            })) || {};
        }

        function shouldUseStableWindowRenderSurface(plan, options = {}) {
            const entry = options.entry || plan && plan.entry || null;
            const targetWindow = options.targetWindow || entry && entry.ownerWindow || null;
            return !!(plan
                && plan.status === 'planned'
                && entry
                && entry.type === 'drawTextEx'
                && !callIsBitmapSurfaceTextEntry(entry)
                && targetWindow
                && typeof targetWindow.drawTextEx === 'function');
        }

        function withWindowRenderStableSurfaceBindings(targetWindow, windowData, entry, stagedBitmap, callback) {
            // The bitmap runtime owns stable-surface pixel transfer and
            // commit-back. This binding remains adapter-owned because a native
            // RPG Maker drawTextEx call can read these window-entry references
            // while it renders rich text.
            const restores = [];
            const setTemporary = (object, propertyName, value) => {
                if (!object || !propertyName) return;
                let previous;
                try {
                    previous = object[propertyName];
                    object[propertyName] = value;
                } catch (_) {
                    return;
                }
                restores.push({ object, propertyName, previous });
            };
            setTemporary(entry, 'contentsBitmap', stagedBitmap);
            setTemporary(windowData, 'contentsBitmap', stagedBitmap);
            setTemporary(entry && entry.backgroundSnapshot, 'contentsBitmap', stagedBitmap);
            setTemporary(entry && entry.sourceSnapshot, 'contentsBitmap', stagedBitmap);
            try {
                return callRequired(withWindowContents, 'withWindowContents')(targetWindow, stagedBitmap, () => {
                    const releaseStagedGuard = callEnterWindowPipelineGuard(stagedBitmap, 'window-redraw-stable-surface');
                    try {
                        return callback();
                    } finally {
                        releaseStagedGuard();
                    }
                });
            } finally {
                for (let index = restores.length - 1; index >= 0; index -= 1) {
                    const restore = restores[index];
                    try { restore.object[restore.propertyName] = restore.previous; } catch (_) {}
                }
            }
        }

        function callIsBitmapSurfaceTextEntry(entry) {
            return typeof isBitmapSurfaceTextEntry === 'function'
                ? isBitmapSurfaceTextEntry(entry)
                : false;
        }

        function callEnterWindowPipelineGuard(bitmap, source) {
            return typeof enterWindowPipelineGuard === 'function'
                ? (enterWindowPipelineGuard(bitmap, source) || (() => {}))
                : (() => {});
        }

        return {
            prepareWindowEntryDrawState,
            executeWindowRenderPlanWithStableSurface,
            shouldUseStableWindowRenderSurface,
            withWindowRenderStableSurfaceBindings,
        };
    }

    function callRequired(callback, name) {
        if (typeof callback !== 'function') {
            throw new Error(`[WindowText] render surface bindings require ${name}.`);
        }
        return callback;
    }
            return { create: createRenderSurfaceBindingsController };
        },
    });
})();
