// Sprite text adapter support: install.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.spriteText.install',
        factory() {
            const BITMAP_TEXT_RUN_CLAIM_ORDER = 1;

    function createController(scope = {}) {
        const { installBitmapMutationObserver, recordBitmapDrawText, recordBitmapMutation } = scope.controllerFacades.bitmapObservation;
        const { bitmapHasTextInterest, installSpriteBitmapObserver, isBitmapOwned, markSpriteDirty } = scope.controllerFacades.bitmapOwnership;
        const { getBitmapState, isOverlayBitmap } = scope.controllerFacades.state;
        const {
            adoptCurrentSceneSprites,
            ensureFrameHooks,
            flushFrame,
            hasFrameHooksActive,
            installChildObservers,
            installFrameHooks,
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
                registerBitmapServiceCapabilities();
                return { status: 'installed', reason: 'Sprite text adapter was already installed.' };
            }
        
            exposeAdapterApi();
            registerBitmapServiceCapabilities();
            installOrchestratorSubscription();
            installSurfaceDrawSubscription();
            installBitmapTextRunSubscription();
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
                describeBitmapSurface,
                markSpriteDirty,
                flushFrame,
                hasFrameHooksActive,
                ensureFrameHooks,
                hasFrameHook: false,
            };
            try { scope.globalScope.LiveTranslatorSpriteTextAdapter = api; } catch (_) {}
        }

        function registerBitmapServiceCapabilities() {
            if (!scope.bitmapServices) return false;
            if (scope.bitmapServiceCapabilitiesRegistered === true) return true;
            let registered = false;
            const unregisters = [];
            if (typeof scope.bitmapServices.registerFrameFlushProvider === 'function') {
                unregisters.push(scope.bitmapServices.registerFrameFlushProvider({
                    adapterId: scope.ADAPTER_ID,
                    token: scope.ADAPTER_TOKEN,
                    ensureFrameHooks,
                    hasFrameHooksActive,
                }));
                registered = true;
            }
            if (typeof scope.bitmapServices.registerSurfaceClassifier === 'function') {
                unregisters.push(scope.bitmapServices.registerSurfaceClassifier({
                    adapterId: scope.ADAPTER_ID,
                    token: scope.ADAPTER_TOKEN,
                    describeSurface: describeBitmapSurface,
                }));
                registered = true;
            }
            scope.bitmapServiceCapabilityUnregisters = unregisters.filter((value) => typeof value === 'function');
            scope.bitmapServiceCapabilitiesRegistered = registered;
            return registered;
        }

        function describeBitmapSurface(bitmap) {
            if (!bitmap) return { kind: 'no-bitmap' };
            if (isOverlayBitmap(bitmap)) return { kind: 'sprite-overlay', overlay: true };
            if (isBitmapOwned(bitmap)) return { kind: 'sprite-owned', owned: true };
            if (bitmapHasTextInterest(bitmap)) return { kind: 'sprite-text-interest', textInterest: true };
            const state = getBitmapState(bitmap);
            if (state && !state.destroyed) return { kind: 'sprite-observed', observed: true };
            return { kind: 'untracked' };
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
         * Consume frame-boundary Bitmap.drawText runs from bitmap services.
         */
        function installBitmapTextRunSubscription() {
            if (!scope.bitmapServices || typeof scope.bitmapServices.subscribeTextRuns !== 'function') return false;
            return scope.bitmapServices.subscribeTextRuns({
                adapterId: scope.ADAPTER_ID,
                token: 'sprite-bitmap-draws',
                claimOrder: BITMAP_TEXT_RUN_CLAIM_ORDER,
                allowFallbackGlyphRuns: false,
                onRun(run, dispatch, metadata = {}) {
                    if (!run || !Array.isArray(run.units) || !run.units.length) return 0;
                    if (typeof metadata.createSurfaceDrawPayload !== 'function') return 0;
                    const ownerClaimOnly = metadata.phase === 'owner-claim';
                    const payload = metadata.createSurfaceDrawPayload(run, {
                        payload: {
                            ownershipStatus: '',
                            backgroundPatch: typeof metadata.getBackgroundPatch === 'function'
                                ? metadata.getBackgroundPatch(run)
                                : null,
                        },
                    });
                    if (!payload) return 0;
                    const result = recordBitmapDrawText(Object.assign({}, payload, {
                        ownerClaimOnly,
                    }));
                    if (isTerminalBitmapDrawRunResult(result)) return 0;
                    if (ownerClaimOnly && result.status === 'deferred') return 0;
                    if (result.status === 'claimed') {
                        return typeof metadata.consume === 'function'
                            ? metadata.consume(run, scope.ADAPTER_ID)
                            : 0;
                    }
                    return run.units.length;
                },
            });
        }

        function isTerminalBitmapDrawRunResult(result) {
            if (!result) return true;
            return result.status === 'ignored'
                || result.status === 'source-suppressed'
                || result.status === 'rejected';
        }

        return { install, exposeAdapterApi, registerBitmapServiceCapabilities, installOrchestratorSubscription, installSurfaceDrawSubscription, installBitmapTextRunSubscription };
    }

            return { createController };
        },
    });
})();
