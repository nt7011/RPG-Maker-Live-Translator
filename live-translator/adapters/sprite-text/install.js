// Sprite text adapter support: install.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/install.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            adoptCurrentSceneSprites,
            applyRenderCommand,
            ensureFrameHooks,
            flushFrame,
            getRenderGeneration,
            hasFrameHooksActive,
            handleRenderRejected,
            installBitmapMutationObserver,
            installChildObservers,
            installFrameHooks,
            installSpriteBitmapObserver,
            isBitmapOwned,
            isRenderTargetCurrent,
            markRecordTerminal,
            markSpriteDirty,
            recordBitmapDrawText,
            recordBitmapMutation,
            scheduleFallbackFrameFlush,
        } = Object.fromEntries([
            'adoptCurrentSceneSprites',
            'applyRenderCommand',
            'ensureFrameHooks',
            'flushFrame',
            'getRenderGeneration',
            'hasFrameHooksActive',
            'handleRenderRejected',
            'installBitmapMutationObserver',
            'installChildObservers',
            'installFrameHooks',
            'installSpriteBitmapObserver',
            'isBitmapOwned',
            'isRenderTargetCurrent',
            'markRecordTerminal',
            'markSpriteDirty',
            'recordBitmapDrawText',
            'recordBitmapMutation',
            'scheduleFallbackFrameFlush',
        ].map((name) => [name, callScope(name)]));

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
                    batch.forEachUnconsumed((unit) => {
                        if (!unit || batch.isConsumed(unit)) return;
                        const result = recordBitmapDrawText({
                            bitmap: batch.bitmap,
                            methodName: unit.methodName,
                            text: unit.text,
                            x: unit.x,
                            y: unit.y,
                            maxWidth: unit.maxWidth,
                            lineHeight: unit.lineHeight,
                            align: unit.align,
                            drawState: unit.drawState,
                            backgroundPatch: unit.backgroundPatch,
                            measuredWidth: 0,
                            sourceAdapter: 'bitmap',
                            ownerClaimOnly,
                        });
                        if (!result || result.status === 'ignored') return;
                        if (ownerClaimOnly && result.status === 'deferred') return;
                        if (result.status === 'claimed') {
                            batch.consume(unit, scope.ADAPTER_ID);
                        }
                        handled += 1;
                    });
                    return handled;
                },
            });
        }

        return { install, exposeAdapterApi, installOrchestratorSubscription, installSurfaceDrawSubscription, installBitmapDrawBatchSubscription };
    }

    defineRuntimeModule('adapters.spriteText.install', { createController });
})();
