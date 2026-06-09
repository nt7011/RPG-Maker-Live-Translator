// Sprite text adapter support: install.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/install.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/sprite-text/install.js.');
    }
    const bitmapDrawRuns = requireRuntimeModule('runtime.bitmapDrawRuns');
    if (!bitmapDrawRuns || typeof bitmapDrawRuns.collectRunsFromBatch !== 'function') {
        throw new Error('[LiveTranslator] runtime.bitmapDrawRuns is unavailable before adapters/sprite-text/install.js.');
    }

    function createController(scope = {}) {
        const { installBitmapMutationObserver, recordBitmapDrawText, recordBitmapMutation } = scope.controllerFacades.bitmapObservation;
        const { installSpriteBitmapObserver, isBitmapOwned, markSpriteDirty } = scope.controllerFacades.bitmapOwnership;
        const {
            adoptCurrentSceneSprites,
            ensureFrameHooks,
            flushFrame,
            hasFrameHooksActive,
            installChildObservers,
            installFrameHooks,
            scheduleFallbackFrameFlush,
        } = scope.controllerFacades.frame;
        const { applyRenderCommand, getRenderGeneration, handleRenderRejected, isRenderTargetCurrent, markRecordTerminal } = scope.controllerFacades.entries;

        /**
         * Install Sprite and frame observers and publish the adapter API.
         */
        function install() {
            if (typeof Sprite === 'undefined' || !Sprite || !Sprite.prototype) {
                return { status: 'skipped', reason: 'Sprite is unavailable.' };
            }
            if (typeof Bitmap === 'undefined' || !Bitmap || !Bitmap.prototype) {
                return { status: 'skipped', reason: 'Bitmap is unavailable.' };
            }
            if (!scope.hasRequiredOrchestrator(scope.adapterContract)) {
                return { status: 'skipped', reason: 'Text orchestrator is unavailable.' };
            }
            if (scope.globalScope.LiveTranslatorSpriteTextAdapter
                && scope.globalScope.LiveTranslatorSpriteTextAdapter.__token === scope.ADAPTER_TOKEN) {
                return { status: 'installed', reason: 'Sprite text adapter was already installed.' };
            }
        
            exposeAdapterApi();
            installOrchestratorSubscription();
            installSurfaceDrawSubscription();
            installBitmapDrawBatchSubscription();
            installSpriteBitmapObserver();
            installChildObservers();
            installBitmapMutationObserver();
            adoptCurrentSceneSprites('install');
            const hasFrameHook = installFrameHooks();
            try { scope.globalScope.LiveTranslatorSpriteTextAdapter.hasFrameHook = !!hasFrameHook; } catch (_) {}
        
            return {
                status: 'installed',
                reason: hasFrameHook
                    ? 'Sprite text adapter installed with frame-boundary scope.flushing.'
                    : 'Sprite text adapter installed; frame hook target was unavailable.',
            };
        }
        
        /**
         * Publish diagnostics/test helpers. Runtime bitmap draw routing arrives
         * through the adapter contract surface-draw subscription above.
         */
        function exposeAdapterApi() {
            const api = {
                __token: scope.ADAPTER_TOKEN,
                recordBitmapDrawText,
                recordBitmapMutation,
                isBitmapOwned,
                markSpriteDirty,
                flushFrame,
                hasFrameHooksActive,
                ensureFrameHooks,
                scheduleFallbackFrameFlush,
                hasFrameHook: false,
            };
            try { scope.globalScope.LiveTranslatorSpriteTextAdapter = api; } catch (_) {}
        }
        
        /**
         * Subscribe once to render commands and terminal item events.
         */
        function installOrchestratorSubscription() {
            scope.adapterContract.subscribeRecords({
                token: scope.RENDER_STRATEGY,
                records: scope.recordsByItemId,
                renderStrategy: scope.RENDER_STRATEGY,
                getRenderGeneration: getRenderGeneration,
                isRenderTargetCurrent: isRenderTargetCurrent,
                onRenderQueued: applyRenderCommand,
                onRenderRejected: handleRenderRejected,
                onSkipped(record, event) {
                    markRecordTerminal(record, 'skipped', event.message || 'translation skipped');
                },
                onFailed(record, event) {
                    markRecordTerminal(record, 'failed', event.message || 'translation failed');
                },
            });
        }
        
        /**
         * Receive Bitmap.drawText facts from the orchestrator-owned surface bus.
         */
        function installSurfaceDrawSubscription() {
            scope.adapterContract.subscribeSurfaceDraws({
                token: 'bitmap-draws',
                onDraw(payload) {
                    recordBitmapDrawText(Object.assign({}, payload || {}, {
                        ownershipStatus: payload && payload.ownershipStatus ? payload.ownershipStatus : 'deferred',
                    }));
                },
            });
        }

        /**
         * Consume frame-boundary Bitmap.drawText batches from bitmap services.
         */
        function installBitmapDrawBatchSubscription() {
            if (!scope.bitmapServices || typeof scope.bitmapServices.subscribeDrawBatches !== 'function') return false;
            return scope.bitmapServices.subscribeDrawBatches({
                adapterId: scope.ADAPTER_ID,
                token: 'sprite-bitmap-draws',
                priority: 200,
                onBatch(batch, meta = {}) {
                    if (!batch || !batch.bitmap || typeof batch.forEachUnconsumed !== 'function') return 0;
                    const ownerClaimOnly = meta && meta.phase === 'owner-claim';
                    let handled = 0;
                    bitmapDrawRuns.collectRunsFromBatch(batch, {
                        allowFallbackGlyphRuns: false,
                    }).forEach((run) => {
                        if (!run || !Array.isArray(run.units) || !run.units.length) return;
                        if (run.units.some((unit) => batch.isConsumed(unit))) return;
                        const payload = bitmapDrawRuns.createSurfaceDrawPayload(batch, run, {
                            payload: {
                                ownershipStatus: '',
                                backgroundPatch: getRunBackgroundPatch(run),
                            },
                        });
                        if (!payload) return;
                        const result = recordBitmapDrawText(Object.assign({}, payload, {
                            ownerClaimOnly,
                        }));
                        if (!result || result.status === 'ignored') return;
                        if (ownerClaimOnly && result.status === 'deferred') return;
                        if (result.status === 'claimed') {
                            run.units.forEach((unit) => batch.consume(unit, scope.ADAPTER_ID));
                        }
                        handled += run.units.length;
                    });
                    return handled;
                },
            });
        }

        function getRunBackgroundPatch(run) {
            const units = run && Array.isArray(run.units) ? run.units.slice() : [];
            units.sort(bitmapDrawRuns.compareUnits);
            const first = units[0];
            return first && (first.backgroundPatch || first.fallbackBackgroundPatch) || null;
        }

        return { install, exposeAdapterApi, installOrchestratorSubscription, installSurfaceDrawSubscription, installBitmapDrawBatchSubscription };
    }

    defineRuntimeModule('adapters.spriteText.install', { createController });
})();
