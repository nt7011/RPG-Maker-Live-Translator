// Adapter contract configuration.
//
// The public adapter API maps onto a smaller gateway API owned by the text
// orchestrator. Keeping that map here lets runtime/adapter-contract.js read as
// behavior while this file documents the supported boundary methods.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.adapterContract.config',
        factory() {
            const DEFAULT_REQUIRED_METHODS = Object.freeze([
                'observeRecord',
                'requestItemTranslation',
                'subscribe',
            ]);

            const BACKING_METHOD_BY_PUBLIC_METHOD = Object.freeze({
                observeRecord: 'observeRecord',
                updateItem: 'updateItem',
                requestItemTranslation: 'requestItemTranslation',
                cancelItemTranslation: 'cancelItemTranslation',
                setItemTranslationPriority: 'setItemTranslationPriority',
                setItemVisibility: 'setItemVisibility',
                backgroundItem: 'backgroundItem',
                retireItem: 'retireItem',
                invalidateRenderTarget: 'invalidateRenderTarget',
                retargetRenderTarget: 'retargetRenderTarget',
                recordDecision: 'recordDecision',
                describeTextEligibility: 'describeTextEligibility',
                claimSurface: 'claimSurface',
                releaseSurface: 'releaseSurface',
                claimText: 'claimText',
                finalizeTextClaim: 'finalizeTextClaim',
                releaseTextClaim: 'releaseTextClaim',
                recordSurfaceDraw: 'recordSurfaceDraw',
                recordRenderCommitted: 'recordRenderCommitted',
                recordRenderDeferred: 'recordRenderDeferred',
                recordRenderRejected: 'recordRenderRejected',
                queueStoredRenderCommand: 'queueStoredRenderCommand',
                notifyRenderCommandReady: 'notifyRenderCommandReady',
                getUnresolvedRenderCommandsForItem: 'getUnresolvedRenderCommandsForItem',
                subscribeSurfaceDraws: 'subscribeSurfaceDraws',
                subscribe: 'subscribe',
                subscribeRecords: 'subscribe',
            });

            const subscriptionsByGateway = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

            function getSubscriptionRegistry(gateway) {
                if (!gateway || !subscriptionsByGateway) return null;
                let registry = subscriptionsByGateway.get(gateway);
                if (!registry) {
                    registry = {};
                    subscriptionsByGateway.set(gateway, registry);
                }
                return registry;
            }

            return {
                DEFAULT_REQUIRED_METHODS,
                BACKING_METHOD_BY_PUBLIC_METHOD,
                getSubscriptionRegistry,
            };
        },
    });
})();
