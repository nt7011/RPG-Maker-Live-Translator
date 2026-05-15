// Adapter contract configuration.
//
// The public adapter API maps onto a smaller gateway API owned by the text
// orchestrator. Keeping that map here lets runtime/adapter-contract.js read as
// behavior while this file documents the supported boundary methods.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.runtime) globalScope.LiveTranslatorModules.runtime = {};

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/adapter-contract-config.js.');
    }

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
        recordDecision: 'recordDecision',
        describeTextEligibility: 'describeTextEligibility',
        claimSurface: 'claimSurface',
        releaseSurface: 'releaseSurface',
        claimText: 'claimText',
        finalizeTextClaim: 'finalizeTextClaim',
        releaseTextClaim: 'releaseTextClaim',
        recordSurfaceDraw: 'recordSurfaceDraw',
        recordRenderAccepted: 'recordRenderAccepted',
        recordRenderDeferred: 'recordRenderDeferred',
        recordRenderRejected: 'recordRenderRejected',
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

    defineRuntimeModule('runtime.adapterContractConfig', {
        DEFAULT_REQUIRED_METHODS,
        BACKING_METHOD_BY_PUBLIC_METHOD,
        getSubscriptionRegistry,
    });
})();
