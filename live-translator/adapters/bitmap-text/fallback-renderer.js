// Bitmap text adapter support: fallback render execution.
// Records decide lifecycle; this controller turns committed render commands into
// bitmap fallback render plans and applies them through the shared executor.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.fallbackRenderer',
        requires: {
            restorePlannerModule: 'runtime.bitmap.restorePlanner',
            bitmapRenderPlannerModule: 'runtime.bitmap.renderPlanner',
            bitmapRenderExecutorModule: 'runtime.bitmap.renderExecutor',
        },
        factory({ restorePlannerModule, bitmapRenderPlannerModule, bitmapRenderExecutorModule }) {

    function createController(scope = {}) {
        const {
            withBitmapReplay,
            collectReplayItems,
            replayBitmapItems,
            drawBitmapTextValue,
            calculateClearRect,
        } = scope.controllerFacades.replay;
        const {
            rectFromDimensions,
            isValidRect,
        } = scope.controllerFacades.textUtils;
        const restorePlanner = restorePlannerModule.create({ isValidRect });
        const bitmapRenderPlanner = bitmapRenderPlannerModule.create({
            restorePlanner,
            calculateClearRect,
            rectFromDimensions,
            collectReplayItems,
        });
        const bitmapRenderExecutor = bitmapRenderExecutorModule.create({
            withActiveRedrawEntry(bitmap, entry, callback) {
                return scope.bitmapServices.withActiveRedrawEntry(bitmap, entry, callback);
            },
            withBitmapReplay,
            replayBitmapItems,
            restorePatches(bitmap, patches, options) {
                return restorePlanner.restorePatches(bitmap, patches, options);
            },
            drawText(bitmap, entry, text) {
                return drawBitmapTextValue(bitmap, entry, text, { scaleTranslated: true });
            },
            markBitmapPixelsDirty: scope.bitmapServices && scope.bitmapServices.markBitmapPixelsDirty,
        });

        function executeBitmapFallbackRender(entry, restored, command) {
            const bitmap = entry && entry.bitmap;
            const renderPlan = bitmapRenderPlanner.createFallbackRenderPlan({
                entry,
                targetBitmap: bitmap,
                text: restored,
            });
            const renderResult = bitmapRenderExecutor.executeFallbackRenderPlan(renderPlan, {
                dirtySource: 'bitmap-text-fallback-renderer',
                dirtyReason: 'bitmap-fallback-redraw',
            });
            const redrawIntel = renderResult && renderResult.intel || renderPlan && renderPlan.intel || null;
            if (scope.telemetry && typeof scope.telemetry.logDraw === 'function') {
                scope.telemetry.logDraw('bitmap_redraw', restored, entry.drawParams.x, entry.drawParams.y, {
                    ownerType: entry.ownerType,
                    method: entry.methodName,
                    sourceHint: command && command.metadata && command.metadata.sourceHint,
                });
            }
            return redrawIntel;
        }

        return {
            executeBitmapFallbackRender,
        };
    }

            return { create: createController };
        },
    });
})();
